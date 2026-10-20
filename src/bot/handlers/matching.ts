import { InlineKeyboard } from 'grammy';
import { BotContext } from '../context';
import { inMemoryDb } from '../../db';
import { redisService, QueueEntry } from '../../services/redis';
import { UserService } from '../../services/userService';

/**
 * Initiates matchmaking search (`/search`, `/find`, or button)
 */
export async function handleFindMatch(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const user = inMemoryDb.getUserByTelegramId(telegramId);

  if (!user) {
    await ctx.reply('⚠️ Please register with /start first before searching.');
    return;
  }

  // 1. Guard against banned users
  if (user.status === 'banned' || redisService.isUserBanned(user.id)) {
    await ctx.reply(
      '⛔ <b>حساب کاربری شما به دلیل دریافت گزارش‌های تخلف مسدود شده است.</b>\n\n' +
        'امکان جستجو و شروع گفتگوی ناشناس برای شما غیرفعال می‌باشد.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // 2. Search Rate Limiter Guard: 1 search per 5 seconds
  const rateCheck = redisService.checkSearchRateLimit(user.id, 5000);
  if (!rateCheck.allowed) {
    const waitSec = Math.ceil(rateCheck.retryAfterMs / 1000);
    await ctx.reply(
      `⚠️ <b>لطفاً کمی صبر کنید!</b>\n\nامکان ارسال درخواست جستجوی جدید تا ${waitSec} ثانیه دیگر فعال خواهد شد.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Check user status
  if (user.status === 'in_chat') {
    await ctx.reply(
      '⚠️ You are currently in an active conversation!\n\n' +
        '• Send /next to skip to a new partner\n' +
        '• Send /stop to end the chat and return to the main menu\n' +
        '• Send /report to report misconduct and disconnect',
      {
        reply_markup: new InlineKeyboard()
          .text('⏭️ Next Partner (/next)', 'action:next_chat')
          .text('⏹️ Stop Chat (/stop)', 'action:stop_chat')
          .row()
          .text('🚨 گزارش تخلف (/report)', 'action:report_chat'),
      }
    );
    return;
  }

  if (user.status === 'searching') {
    await ctx.reply('⏳ You are already in the matchmaking queue! Looking for a compatible partner...', {
      reply_markup: new InlineKeyboard().text('❌ Cancel Search', 'action:cancel_search'),
    });
    return;
  }

  // Atomic Coin validation & deduction guard
  const deductResult = inMemoryDb.atomicDeductCoins(
    user.id,
    1,
    'match_search',
    'Matchmaking search fee'
  );

  if (!deductResult.success) {
    await ctx.reply(
      `⚠️ <b>سکه‌های شما به اتمام رسیده است!</b>\n\n` +
        `برای جستجوی بیشتر، می‌توانید دوستان خود را با لینک اختصاصی دعوت کنید تا به ازای هر نفر <b>۱۵+ سکه هدیه</b> دریافت کنید.\n\n` +
        `<i>You have run out of coins! Invite friends to earn +15 coins immediately.</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('🎁 دعوت از دوستان و دریافت سکه (+15)', 'action:referral_info')
          .row()
          .text('💰 مشاهده کیف پول (/balance)', 'action:view_wallet')
          .text('👤 پروفایل من', 'action:view_profile'),
      }
    );
    return;
  }

  // Mark status as searching
  inMemoryDb.updateUserProfile(user.id, { status: 'searching' });

  const pref = inMemoryDb.getPreferences(user.id) || {
    id: 0,
    user_id: user.id,
    target_gender: user.gender === 'male' ? 'female' : 'male',
    target_age_min: 18,
    target_age_max: 99,
    target_province: 'any_province',
    updated_at: new Date().toISOString(),
  };

  const queueEntry: QueueEntry = {
    userId: user.id,
    telegramId: user.telegram_id,
    internalId: user.internal_id,
    name: user.name,
    gender: user.gender,
    age: user.age,
    province: user.province,
    bio: user.bio,
    profilePhotoFileId: user.profile_photo_file_id,
    targetGender: pref.target_gender,
    targetAgeMin: pref.target_age_min,
    targetAgeMax: pref.target_age_max,
    targetProvince: pref.target_province,
    queuedAt: Date.now(),
  };

  // Add to Redis waiting queue
  await redisService.addToMatchQueue(queueEntry);

  // Scan Redis waiting pool for a mutual match
  const matchResult = await redisService.findAndPair(queueEntry);

  if (matchResult) {
    const { partner, sessionId } = matchResult;
    const partnerUser = inMemoryDb.getUserById(partner.userId);

    if (partnerUser) {
      // Update both statuses to in_chat in DB
      inMemoryDb.updateUserProfile(user.id, { status: 'in_chat' });
      inMemoryDb.updateUserProfile(partnerUser.id, { status: 'in_chat' });

      // Create persistent Chat Session in DB
      inMemoryDb.createChatSession(user.id, partnerUser.id);

      const inChatKeyboard = new InlineKeyboard()
        .text('⏭️ Next Partner (/next)', 'action:next_chat')
        .text('⏹️ Stop Chat (/stop)', 'action:stop_chat')
        .row()
        .text('🚨 گزارش تخلف (/report)', 'action:report_chat');

      // 1. Notify current user
      const partnerGender = partnerUser.gender === 'male' ? '👨 Male' : '👩 Female';
      const userMsg = [
        `🎉 <b>Match found! You are now connected anonymously!</b>`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `🆔 <b>Partner Handle:</b> <code>${partnerUser.internal_id}</code>`,
        `👤 <b>Name:</b> ${partnerUser.name}`,
        `🎂 <b>Age:</b> ${partnerUser.age} years`,
        `⚧ <b>Gender:</b> ${partnerGender}`,
        `📍 <b>Province:</b> ${partnerUser.province}`,
        partnerUser.bio ? `📝 <b>Bio:</b> <i>"${partnerUser.bio}"</i>` : `📝 <b>Bio:</b> <i>(No bio set)</i>`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `💬 <i>Say hello! Your messages, photos, and voice notes will be securely relayed anonymously.</i>`,
      ].join('\n');

      if (partnerUser.profile_photo_file_id) {
        try {
          await ctx.replyWithPhoto(partnerUser.profile_photo_file_id, {
            caption: userMsg,
            parse_mode: 'HTML',
            reply_markup: inChatKeyboard,
          });
        } catch (e) {
          await ctx.reply(userMsg, { parse_mode: 'HTML', reply_markup: inChatKeyboard });
        }
      } else {
        await ctx.reply(userMsg, { parse_mode: 'HTML', reply_markup: inChatKeyboard });
      }

      // 2. Notify partner user via Telegram API
      const myGender = user.gender === 'male' ? '👨 Male' : '👩 Female';
      const partnerMsg = [
        `🎉 <b>Match found! You are now connected anonymously!</b>`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `🆔 <b>Partner Handle:</b> <code>${user.internal_id}</code>`,
        `👤 <b>Name:</b> ${user.name}`,
        `🎂 <b>Age:</b> ${user.age} years`,
        `⚧ <b>Gender:</b> ${myGender}`,
        `📍 <b>Province:</b> ${user.province}`,
        user.bio ? `📝 <b>Bio:</b> <i>"${user.bio}"</i>` : `📝 <b>Bio:</b> <i>(No bio set)</i>`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `💬 <i>Say hello! Your messages, photos, and voice notes will be securely relayed anonymously.</i>`,
      ].join('\n');

      try {
        if (user.profile_photo_file_id) {
          await ctx.api.sendPhoto(partnerUser.telegram_id, user.profile_photo_file_id, {
            caption: partnerMsg,
            parse_mode: 'HTML',
            reply_markup: inChatKeyboard,
          });
        } else {
          await ctx.api.sendMessage(partnerUser.telegram_id, partnerMsg, {
            parse_mode: 'HTML',
            reply_markup: inChatKeyboard,
          });
        }
      } catch (err: any) {
        console.warn(`[Matchmaker] Failed to notify partner ${partnerUser.telegram_id}:`, err.message);
      }

      return;
    }
  }

  // If no match found yet: Waiting in Redis queue
  const searchingKeyboard = new InlineKeyboard().text('❌ Cancel Search', 'action:cancel_search');
  const targetGenderLabel =
    pref.target_gender === 'female' ? '👩 Female' : pref.target_gender === 'male' ? '👨 Male' : '🌈 Anyone';

  await ctx.reply(
    `⏳ <b>Searching for a compatible match...</b>\n\n` +
      `🎯 <b>Active Filters:</b>\n` +
      `• Gender: <b>${targetGenderLabel}</b>\n` +
      `• Age: <b>${pref.target_age_min} - ${pref.target_age_max} yrs</b>\n` +
      `• Location: <b>${pref.target_province}</b>\n\n` +
      `<i>You will be connected automatically as soon as a mutual match enters the queue.</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: searchingKeyboard,
    }
  );
}

/**
 * Handles `/next` command: Ends current chat and immediately starts searching for next partner
 */
export async function handleNextMatch(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const user = inMemoryDb.getUserByTelegramId(telegramId);

  if (!user) return;

  if (user.status === 'in_chat') {
    const { partnerId } = redisService.endActiveChat(user.id);
    inMemoryDb.updateUserProfile(user.id, { status: 'idle' });

    if (partnerId) {
      inMemoryDb.updateUserProfile(partnerId, { status: 'idle' });
      const partner = inMemoryDb.getUserById(partnerId);

      if (partner) {
        try {
          await ctx.api.sendMessage(
            partner.telegram_id,
            `👋 <b>Your partner left the chat and skipped to the next person.</b>`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard()
                .text('🔍 Find New Match', 'action:find_match')
                .text('👤 Profile', 'action:view_profile'),
            }
          );
        } catch (e) {
          // Partner may have closed chat
        }
      }
    }

    await ctx.reply('⏭️ Chat ended. Searching for your next partner right away...');
  }

  // Automatically start search for next match!
  await handleFindMatch(ctx);
}

/**
 * Handles `/stop` or `/end` command: Ends chat and returns to idle/main menu
 */
export async function handleStopChat(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const user = inMemoryDb.getUserByTelegramId(telegramId);

  if (!user) return;

  if (user.status === 'searching') {
    return handleCancelSearch(ctx);
  }

  if (user.status !== 'in_chat') {
    await ctx.reply('You are not currently in an active conversation.', {
      reply_markup: new InlineKeyboard()
        .text('🔍 Find a Match', 'action:find_match')
        .text('👤 My Profile', 'action:view_profile'),
    });
    return;
  }

  const { partnerId } = redisService.endActiveChat(user.id);
  inMemoryDb.updateUserProfile(user.id, { status: 'idle' });

  if (partnerId) {
    inMemoryDb.updateUserProfile(partnerId, { status: 'idle' });
    const partner = inMemoryDb.getUserById(partnerId);

    if (partner) {
      try {
        await ctx.api.sendMessage(
          partner.telegram_id,
          `👋 <b>Your partner has ended the chat session.</b>`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .text('🔍 Find New Match', 'action:find_match')
              .text('👤 Profile', 'action:view_profile'),
          }
        );
      } catch (e) {
        // Partner blocked or unreachable
      }
    }
  }

  await ctx.reply('⏹️ <b>Conversation ended.</b> You are now back in the main menu.', {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard()
      .text('🔍 Find New Match', 'action:find_match')
      .text('👤 My Profile', 'action:view_profile')
      .row()
      .text('⚙️ Adjust Filters', 'action:view_preferences'),
  });
}

/**
 * Cancels active waiting queue search
 */
export async function handleCancelSearch(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const user = inMemoryDb.getUserByTelegramId(telegramId);

  if (!user) return;

  await redisService.removeFromMatchQueue(user.id);
  inMemoryDb.updateUserProfile(user.id, { status: 'idle' });
  inMemoryDb.awardCoins(user.id, 1, 'match_search', 'Refund for cancelled matchmaking search');

  await ctx.reply('❌ <b>Search cancelled.</b> Your 1 coin has been refunded.', {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard()
      .text('🔍 Search Again', 'action:find_match')
      .text('⚙️ Filters', 'action:view_preferences')
      .text('💰 Wallet (/balance)', 'action:view_wallet')
      .text('👤 Profile', 'action:view_profile'),
  });
}
