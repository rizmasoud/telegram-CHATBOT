import 'dotenv/config';
import { Bot, session, InlineKeyboard } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { BotContext } from './context';
import { SessionData } from '../types';
import { onboardingConversation } from './conversations/onboarding';
import { handleStart } from './handlers/start';
import {
  handleViewProfile,
  handleEditProfileMenu,
  handleLockedGenderClick,
  handleViewPreferences,
  handleReferralInfo,
} from './handlers/profile';
import {
  handleFindMatch,
  handleNextMatch,
  handleStopChat,
  handleCancelSearch,
} from './handlers/matching';
import { handleFiltersCommand, handleFilterCallback } from './handlers/filters';
import { handleBalanceCommand, handleReferralProgram } from './handlers/wallet';
import { handleReportChat } from './handlers/report';
import {
  handleAdminCommand,
  handleAdminStats,
  handleAdminReports,
  handleAdminBanAction,
  handleAdminDismissAction,
  handleAdminBroadcast,
  handleAdminBannerBroadcast,
  handleAdminTextBroadcast,
} from './handlers/admin';
import { inMemoryDb } from '../db';
import { redisService } from '../services/redis';

export function sanitizeBotToken(raw?: string): string {
  if (!raw) return '';
  return raw.trim().replace(/^["']|["']$/g, '').trim();
}

export function isValidTelegramToken(raw?: string): boolean {
  const token = sanitizeBotToken(raw);
  return Boolean(
    token &&
      !token.includes('ABCdefGhIJKlmNoPQRsTUVwxyZ') &&
      /^\d+:[A-Za-z0-9_-]{20,}$/.test(token)
  );
}

/**
 * Factory to create and configure the production grammY Bot
 */
export function createMatchmakingBot(token?: string): Bot<BotContext> {
  const resolvedToken =
    sanitizeBotToken(token) ||
    sanitizeBotToken(process.env.TELEGRAM_BOT_TOKEN) ||
    '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ';
  const bot = new Bot<BotContext>(resolvedToken);

  // 1. Session Middleware
  bot.use(
    session({
      initial: (): SessionData => ({}),
    })
  );

  // 2. Global Moderation & Anti-Spam Rate Limiter Middleware
  bot.use(async (ctx, next) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return next();

    const user = inMemoryDb.getUserByTelegramId(telegramId);

    // Auto-ban enforcement
    if (user && (user.status === 'banned' || redisService.isUserBanned(user.id))) {
      if (ctx.message || ctx.callbackQuery) {
        await ctx.reply(
          '⛔ <b>حساب کاربری شما مسدود گردیده است.</b>\n\n' +
            'امکان ارسال پیام یا تعامل با ربات به دلیل گزارش‌های تخلف مسدود می‌باشد.',
          { parse_mode: 'HTML' }
        );
      }
      return;
    }

    // Message Rate Limiter: Max 5 messages per 3 seconds
    if (ctx.message) {
      const rateLimit = redisService.checkMessageRateLimit(telegramId, 5, 3000);
      if (!rateLimit.allowed) {
        const sec = Math.ceil(rateLimit.retryAfterMs / 1000);
        await ctx.reply(
          `⚠️ <b>لطفاً کمی آرام‌تر پیام ارسال کنید!</b>\n` +
            `سیستم ضداسپم فعال شد (حداکثر ۵ پیام در ۳ ثانیه). لطفاً ${sec} ثانیه صبر کنید.`,
          { parse_mode: 'HTML' }
        );
        return;
      }
    }

    await next();
  });

  // 3. Conversations Plugin
  bot.use(conversations());
  bot.use(createConversation(onboardingConversation));

  // 4. Command Handlers
  bot.command('start', handleStart);
  bot.command(['balance', 'wallet'], handleBalanceCommand);
  bot.command(['filters', 'preferences'], handleFiltersCommand);
  bot.command(['search', 'find'], handleFindMatch);
  bot.command('next', handleNextMatch);
  bot.command(['stop', 'end'], handleStopChat);
  bot.command('report', handleReportChat);
  bot.command('admin', handleAdminCommand);
  bot.command('profile', handleViewProfile);

  const HELP_TEXT_FA = [
    `سلام! به ربات گفتگو و هم‌رسانی ناشناس خوش آمدید 👋`,
    ``,
    `🔹 <b>چطور کار می‌کند؟</b>`,
    `۱. <b>تکمیل پروفایل:</b> مشخصات خودت (سن، استان، بیو و عکس) را وارد کن.`,
    `۲. <b>تنظیم فیلترها:</b> با دستور /filters مشخص کن دوست داری با چه سنی، جنسیتی یا از چه استانی گفتگو کنی.`,
    `۳. <b>جستجو:</b> با زدن /search وارد صف جستجو شو تا سیستم تو را به فرد مناسب وصل کند.`,
    `۴. <b>شناسه داخلی:</b> به هر کاربر یک شناسه یکتا تعلق می‌گیرد تا بتوانی بدون افشای هویت، مستقیم به دیگران پیام بدی (/find_id).`,
    `۵. <b>سکه و جوایز:</b> برای جستجوی پیشرفته و ارسال پیام مستقیم به سکه نیاز داری. هر روز با دستور /daily جایزه روزانه بگیر یا در /wallet سکه دریافت کن!`,
    ``,
    `📌 <b>دستورات کاربردی:</b>`,
    `/search - شروع جستجوی ناشناس`,
    `/next - قطع چت و اتصال به هم‌صحبت جدید`,
    `/stop - پایان مکالمه`,
    `/report - گزارش تخلف و قطع فوری چت`,
    `/profile - مشاهده و ویرایش پروفایل`,
    `/filters - تنظیم فیلترهای جستجو`,
    `/wallet - موجودی سکه و افزایش اعتبار`,
    `/daily - گردونه و جایزه روزانه`,
    `/history - تاریخچه چت‌ها و درخواست چت مجدد`,
    `/find_id - ارسال پیام مستقیم با شناسه کاربری`,
    `/help - راهنمای ربات`,
  ].join('\n');

  const HELP_TEXT_EN = [
    `Hello! Welcome to the Anonymous Match & Chat Bot 👋`,
    ``,
    `🔹 <b>How It Works:</b>`,
    `1. <b>Profile Setup:</b> Enter your age, province, bio, and photo.`,
    `2. <b>Filters:</b> Use /filters to set your age, gender, or province preferences.`,
    `3. <b>Search:</b> Tap /search to join the queue and match with suitable partners.`,
    `4. <b>Internal ID:</b> Every user gets a unique handle so you can chat or reconnect without revealing identity (/find_id).`,
    `5. <b>Coins & Rewards:</b> Used for targeted filters and direct messages. Claim free daily coins with /daily or visit /wallet.`,
    ``,
    `📌 <b>Quick Commands:</b>`,
    `/search - Start matching`,
    `/next - Skip to next partner`,
    `/stop - End conversation`,
    `/report - Report violation & disconnect`,
    `/profile - View & edit profile`,
    `/filters - Match preferences`,
    `/wallet - Coin balance`,
    `/daily - Daily coin bonus`,
    `/history - Past chat partners & re-connect`,
    `/find_id - Send anonymous direct message`,
    `/help - View this guide`,
  ].join('\n');

  bot.command('help', async (ctx) => {
    const kb = new InlineKeyboard()
      .text('🇬🇧 English Version', 'help:en')
      .row()
      .text('🔍 شروع جستجو (/search)', 'action:find_match')
      .text('💰 کیف پول (/wallet)', 'action:view_wallet');

    await ctx.reply(HELP_TEXT_FA, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.command('daily', async (ctx) => {
    const telegramId = ctx.from?.id?.toString() || '';
    const user = inMemoryDb.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('⚠️ لطفاً ابتدا با /start در ربات عضو شوید.');
      return;
    }
    inMemoryDb.updateUserProfile(user.id, { coins: user.coins + 2 });
    inMemoryDb.addTransaction({
      userId: user.id,
      amount: 2,
      type: 'admin_gift',
      description: 'Daily bonus check-in (+2 coins)',
    });
    await ctx.reply(
      `🎁 <b>شما سکه روزانه خود را دریافت کردید!</b> (+۲ سکه)\n` +
        `فردا دوباره سر بزنید.\n\n` +
        `🪙 موجودی جدید شما: <b>${user.coins + 2} سکه</b>\n\n` +
        `<i>🎁 You claimed your daily bonus (+2 coins)! Come back tomorrow.</i>`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command('history', async (ctx) => {
    const telegramId = ctx.from?.id?.toString() || '';
    const user = inMemoryDb.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('⚠️ لطفاً ابتدا با /start در ربات عضو شوید.');
      return;
    }

    const history = inMemoryDb.getUserChatHistory(user.id, 5);
    if (history.length === 0) {
      await ctx.reply(
        `📜 <b>تاریخچه گفتگوهای پیشین شما</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `شما هنوز هیچ گفتگوی ثبت‌شده‌ای ندارید.\n` +
          `برای شروع اولین گفتگو روی دکمه زیر کلیک کنید:`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('🔍 شروع جستجو (/search)', 'action:find_match'),
        }
      );
      return;
    }

    const lines = history.map(({ partner }) => {
      const stateLabel =
        partner.status === 'in_chat'
          ? 'مشغول گفتگو'
          : partner.status === 'searching'
          ? 'در صف جستجو'
          : 'آزاد';
      return `• کاربر <code>${partner.internal_id}</code> (${partner.name}) - وضعیت: ${stateLabel}`;
    });

    const kb = new InlineKeyboard();
    for (const { partner } of history.slice(0, 2)) {
      kb.text(`🔄 جستجوی هم‌صحبت (${partner.internal_id})`, 'action:find_match').row();
    }
    kb.text('🔍 جستجوی جدید (/search)', 'action:find_match');

    await ctx.reply(
      `📜 <b>تاریخچه گفتگوهای پیشین شما</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
        `${lines.join('\n')}\n\n` +
        `جهت بررسی شناسه کاربری از دستور <code>/find_id USER-XXXX</code> استفاده نمایید.`,
      {
        parse_mode: 'HTML',
        reply_markup: kb,
      }
    );
  });

  bot.command('find_id', async (ctx) => {
    const parts = (ctx.message?.text || '').split(' ');
    if (parts.length > 1) {
      const targetInternalId = parts[1].trim().toUpperCase();
      const targetUser = inMemoryDb.getUserByInternalId(targetInternalId);
      if (!targetUser) {
        await ctx.reply(`❌ کاربری با شناسه <code>${targetInternalId}</code> یافت نشد.`, { parse_mode: 'HTML' });
        return;
      }
      await ctx.reply(
        `👤 <b>کاربر یافت شد:</b> ${targetUser.name} (<code>${targetUser.internal_id}</code>)\n` +
          `استان: ${targetUser.province} | سن: ${targetUser.age}\n\n` +
          `برای ارسال پیام ناشناس یا درخواست چت، دکمه زیر را فشار دهید:`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text(`💬 شروع چت با ${targetUser.internal_id}`, 'action:find_match'),
        }
      );
      return;
    }

    await ctx.reply(
      `🆔 <b>ارسال پیام مستقیم با شناسه کاربری (Direct Anonymous Message)</b>\n\n` +
        `فرمت دستور:\n<code>/find_id USER-XXXX</code>\n\n` +
        `مثال: <code>/find_id USER-1001</code>`,
      { parse_mode: 'HTML' }
    );
  });

  // 5. Callback Query Handlers
  bot.callbackQuery('action:find_match', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleFindMatch(ctx);
  });

  bot.callbackQuery('action:next_chat', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Skipping to next partner...' });
    await handleNextMatch(ctx);
  });

  bot.callbackQuery('action:stop_chat', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Ending chat...' });
    await handleStopChat(ctx);
  });

  bot.callbackQuery('action:report_chat', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'در حال ثبت گزارش و قطع چت...' });
    await handleReportChat(ctx);
  });

  bot.callbackQuery('action:cancel_search', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleCancelSearch(ctx);
  });

  bot.callbackQuery('action:view_profile', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleViewProfile(ctx);
  });

  bot.callbackQuery('action:edit_profile', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleEditProfileMenu(ctx);
  });

  bot.callbackQuery('edit:gender_locked', handleLockedGenderClick);

  bot.callbackQuery('action:view_preferences', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleFiltersCommand(ctx);
  });

  bot.callbackQuery('action:view_wallet', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleBalanceCommand(ctx);
  });

  bot.callbackQuery('action:referral_info', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleReferralProgram(ctx);
  });

  // Admin Callbacks
  bot.callbackQuery('admin:menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleAdminCommand(ctx);
  });

  bot.callbackQuery('admin:stats', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleAdminStats(ctx);
  });

  bot.callbackQuery('admin:reports', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleAdminReports(ctx);
  });

  bot.callbackQuery('admin:broadcast_prompt', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleAdminBroadcast(ctx);
  });

  bot.callbackQuery('admin:broadcast_banner', async (ctx) => {
    await handleAdminBannerBroadcast(ctx);
  });

  bot.callbackQuery('admin:broadcast_text', async (ctx) => {
    await handleAdminTextBroadcast(ctx);
  });

  bot.callbackQuery('admin:exit', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('🚪 از پنل مدیریت خارج شدید.');
  });

  bot.callbackQuery('help:en', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text('🇮🇷 راهنمای فارسی', 'help:fa')
      .row()
      .text('🔍 Start Matching (/search)', 'action:find_match')
      .text('💰 Wallet (/wallet)', 'action:view_wallet');
    await ctx.editMessageText(HELP_TEXT_EN, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.callbackQuery('help:fa', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text('🇬🇧 English Version', 'help:en')
      .row()
      .text('🔍 شروع جستجو (/search)', 'action:find_match')
      .text('💰 کیف پول (/wallet)', 'action:view_wallet');
    await ctx.editMessageText(HELP_TEXT_FA, { parse_mode: 'HTML', reply_markup: kb });
  });

  // Admin dynamic ban & dismiss callback query routing
  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith('admin:ban:')) {
      const parts = data.split(':');
      const reportId = parseInt(parts[2], 10);
      const targetUserId = parseInt(parts[3], 10);
      await handleAdminBanAction(ctx, reportId, targetUserId);
      return;
    }

    if (data.startsWith('admin:dismiss:')) {
      const parts = data.split(':');
      const reportId = parseInt(parts[2], 10);
      await handleAdminDismissAction(ctx, reportId);
      return;
    }

    if (data.startsWith('filter:')) {
      await handleFilterCallback(ctx);
      return;
    }

    await next();
  });

  // 5. In-Chat Anonymous Message Relay Middleware
  // Helper to safely get active partner
  const getPartnerOrClean = (telegramId: string) => {
    const user = inMemoryDb.getUserByTelegramId(telegramId);
    if (!user || user.status !== 'in_chat') return null;

    const partnerId = redisService.getActiveChatPartner(user.id);
    if (!partnerId) return null;

    const partner = inMemoryDb.getUserById(partnerId);
    return { user, partner };
  };

  // Text Relay
  bot.on('message:text', async (ctx, next) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return next();

    // Ignore commands (they are processed by bot.command)
    if (ctx.message.text.startsWith('/')) {
      return next();
    }

    const pair = getPartnerOrClean(telegramId);
    if (pair && pair.partner) {
      // Record chat message for moderation and audit history
      redisService.recordChatMessage(pair.user.id, pair.partner.id, pair.user.internal_id, ctx.message.text);

      try {
        await ctx.api.sendMessage(
          pair.partner.telegram_id,
          `💬 <b>Partner:</b> ${ctx.message.text}`,
          { parse_mode: 'HTML' }
        );
      } catch (err: any) {
        console.error('[Relay Error]', err.message);
        // If partner blocked bot
        if (err.message?.includes('blocked') || err.message?.includes('deactivated')) {
          await handleStopChat(ctx);
          await ctx.reply('⚠️ Your partner is no longer reachable (blocked the bot). Session closed.');
        }
      }
      return;
    }

    await next();
  });

  // Photo Relay (enforcing size check / compression)
  bot.on('message:photo', async (ctx, next) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return next();

    const pair = getPartnerOrClean(telegramId);
    if (pair && pair.partner) {
      const photos = ctx.message.photo;
      if (photos.length > 0) {
        // Choose optimal resolution
        const chosen = photos[photos.length - 1];
        // 200KB check (if file_size metadata available)
        if (chosen.file_size && chosen.file_size > 200 * 1024) {
          // Send lower resolution candidate if under 200KB
          const compressed = photos.find((p) => p.file_size && p.file_size <= 200 * 1024) || photos[0];
          try {
            await ctx.api.sendPhoto(pair.partner.telegram_id, compressed.file_id, {
              caption: ctx.message.caption ? `📷 <b>Partner:</b> ${ctx.message.caption}` : '📷 <i>(Partner sent a photo)</i>',
              parse_mode: 'HTML',
            });
          } catch (err) {
            console.error('[Photo Relay Error]', err);
          }
        } else {
          try {
            await ctx.api.sendPhoto(pair.partner.telegram_id, chosen.file_id, {
              caption: ctx.message.caption ? `📷 <b>Partner:</b> ${ctx.message.caption}` : '📷 <i>(Partner sent a photo)</i>',
              parse_mode: 'HTML',
            });
          } catch (err) {
            console.error('[Photo Relay Error]', err);
          }
        }
      }
      return;
    }

    await next();
  });

  // Voice Note Relay
  bot.on('message:voice', async (ctx, next) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return next();

    const pair = getPartnerOrClean(telegramId);
    if (pair && pair.partner) {
      try {
        await ctx.api.sendVoice(pair.partner.telegram_id, ctx.message.voice.file_id, {
          caption: '🎤 <i>(Partner sent a voice message)</i>',
          parse_mode: 'HTML',
        });
      } catch (err) {
        console.error('[Voice Relay Error]', err);
      }
      return;
    }

    await next();
  });

  // 6. Global Error Boundary
  bot.catch((err) => {
    console.error('[Bot Error Boundary]', err.message);
  });

  return bot;
}

let currentBotToken =
  sanitizeBotToken(process.env.TELEGRAM_BOT_TOKEN) || '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ';
export let botInstance: Bot<BotContext> = createMatchmakingBot(currentBotToken);

let pollingActive = false;
let shutdownHooksRegistered = false;

export function isBotPollingActive(): boolean {
  return pollingActive;
}

/**
 * Starts real Telegram Long Polling (bot.start())
 * Runs concurrently with the Express server without blocking HTTP traffic.
 */
export async function startBotLongPolling(): Promise<void> {
  if (pollingActive) {
    console.log('[Telegram Bot] ℹ️ Long Polling is already running.');
    return;
  }

  const token = sanitizeBotToken(process.env.TELEGRAM_BOT_TOKEN);

  if (!isValidTelegramToken(token)) {
    console.log(
      '[Telegram Bot] ℹ️ Live Telegram Token not configured (or using placeholder in .env).'
    );
    console.log(
      '[Telegram Bot] ℹ️ Set a valid TELEGRAM_BOT_TOKEN from @BotFather in .env to enable live Telegram Long Polling.'
    );
    return;
  }

  // Ensure botInstance uses the exact live token loaded from .env
  if (token !== currentBotToken) {
    currentBotToken = token;
    botInstance = createMatchmakingBot(token);
  }

  const activeBot = botInstance;

  try {
    console.log(
      '[Telegram Bot] 🔄 Verifying TELEGRAM_BOT_TOKEN and preparing Long Polling (bot.start())...'
    );

    // 1. Verify token upfront to catch 401 Unauthorized cleanly without crashing Express
    const botProfile = await activeBot.api.getMe();
    console.log(
      `[Telegram Bot] ✅ Authenticated with Telegram as @${botProfile.username} (ID: ${botProfile.id})`
    );

    // 2. Delete any active webhook to prevent 409 Conflict during getUpdates Long Polling
    await activeBot.api.deleteWebhook({ drop_pending_updates: true });

    pollingActive = true;

    // 3. Start grammY Long Polling concurrently (do NOT await bot.start() so Express stays non-blocking)
    activeBot
      .start({
        drop_pending_updates: true,
        allowed_updates: ['message', 'callback_query'],
        onStart: (botInfo) => {
          console.log('[Telegram Bot] ==============================================');
          console.log('[Telegram Bot] 🚀 Live Long Polling Started Successfully!');
          console.log(`[Telegram Bot] 🤖 Bot Name: ${botInfo.first_name}`);
          console.log(`[Telegram Bot] 👤 Username: @${botInfo.username} (ID: ${botInfo.id})`);
          console.log(
            '[Telegram Bot] 📡 Listening for incoming messages, commands & match requests!'
          );
          console.log('[Telegram Bot] ==============================================');
        },
      })
      .catch((err: any) => {
        pollingActive = false;
        console.error('[Telegram Bot] ❌ Long Polling stopped with error:', err?.message || err);
      });

    // 4. Register graceful shutdown handlers once
    if (!shutdownHooksRegistered) {
      shutdownHooksRegistered = true;
      const stopGracefully = (signal: string) => {
        if (pollingActive) {
          console.log(`[Telegram Bot] Stopping polling loop (${signal})...`);
          pollingActive = false;
          activeBot.stop();
        }
      };
      process.once('SIGINT', () => stopGracefully('SIGINT'));
      process.once('SIGTERM', () => stopGracefully('SIGTERM'));
    }
  } catch (err: any) {
    pollingActive = false;
    const msg = err?.message || String(err);
    if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
      console.error(
        '[Telegram Bot] ❌ 401 Unauthorized: TELEGRAM_BOT_TOKEN in .env is invalid or revoked. Please get a fresh token from @BotFather.'
      );
    } else {
      console.error('[Telegram Bot] ❌ Failed to initialize Long Polling:', msg);
    }
  }
}
