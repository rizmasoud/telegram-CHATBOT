import { InlineKeyboard } from 'grammy';
import { BotContext } from '../context';
import { inMemoryDb } from '../../db';
import { UserService } from '../../services/userService';
import { getProvinceKeyboard } from '../constants/provinces';

export async function handleViewProfile(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const user = inMemoryDb.getUserByTelegramId(telegramId);

  if (!user) {
    await ctx.reply('You are not registered yet. Send /start to begin onboarding.');
    return;
  }

  const card = UserService.formatProfileCard(user);
  const keyboard = new InlineKeyboard()
    .text('🔍 Find a Match', 'action:find_match')
    .row()
    .text('✏️ Edit Profile', 'action:edit_profile')
    .text('⚙️ Matching Filters', 'action:view_preferences')
    .row()
    .text('🎁 Referral Link', 'action:referral_info');

  await ctx.reply(card, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

export async function handleEditProfileMenu(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const user = inMemoryDb.getUserByTelegramId(telegramId);

  if (!user) {
    await ctx.reply('Please register with /start first.');
    return;
  }

  // NOTE: Gender field button is explicitly marked locked/immutable!
  const keyboard = new InlineKeyboard()
    .text('✏️ Name', 'edit:name')
    .text('🎂 Age', 'edit:age')
    .row()
    .text('📍 Province', 'edit:province')
    .text('📝 Bio', 'edit:bio')
    .row()
    .text('📸 Photo', 'edit:photo')
    .text('🔒 Gender (Locked)', 'edit:gender_locked')
    .row()
    .text('🔙 Back to Profile', 'action:view_profile');

  await ctx.reply(
    `✏️ <b>EDIT PROFILE</b>\n\n` +
      `Current details for <b>${user.name}</b>:\n` +
      `• Name: ${user.name}\n` +
      `• Age: ${user.age}\n` +
      `• Province: ${user.province}\n` +
      `• Gender: ${user.gender.toUpperCase()} <i>(🔒 Immutable)</i>\n\n` +
      `<i>Tap a button below to update that section:</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  );
}

/**
 * Handle locked gender click - Explains immutability policy
 */
export async function handleLockedGenderClick(ctx: BotContext) {
  await ctx.answerCallbackQuery({
    text: '🔒 Gender cannot be changed after registration!',
    show_alert: true,
  });

  await ctx.reply(
    `⚠️ <b>Gender Immutability Notice:</b>\n\n` +
      `Your gender was permanently registered during onboarding and cannot be edited. ` +
      `This policy prevents deceptive matching and maintains platform integrity for all users.`,
    { parse_mode: 'HTML' }
  );
}

/**
 * Handle preference view & toggle
 */
export async function handleViewPreferences(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const user = inMemoryDb.getUserByTelegramId(telegramId);

  if (!user) {
    await ctx.reply('Please register with /start first.');
    return;
  }

  let pref = inMemoryDb.getPreferences(user.id);
  if (!pref) {
    pref = inMemoryDb.updatePreferences(user.id, {
      target_gender: user.gender === 'male' ? 'female' : 'male',
      target_age_min: 18,
      target_age_max: 99,
      target_province: 'any_province',
    });
  }

  const card = UserService.formatPreferencesCard(pref);

  const keyboard = new InlineKeyboard()
    .text(
      `Gender: ${pref.target_gender === 'female' ? '👩 Female' : pref.target_gender === 'male' ? '👨 Male' : '🌈 Any'}`,
      'pref:toggle_gender'
    )
    .row()
    .text(
      `Province: ${pref.target_province === 'same_province' ? '📍 Same Province' : '🌍 Any Province'}`,
      'pref:toggle_province'
    )
    .row()
    .text('🔙 Back to Profile', 'action:view_profile');

  await ctx.reply(card, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

/**
 * Display Referral & Coins Details
 */
export async function handleReferralInfo(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const user = inMemoryDb.getUserByTelegramId(telegramId);

  if (!user) {
    await ctx.reply('Please register with /start first.');
    return;
  }

  const refLink = `https://t.me/MatchmakingBot?start=ref_${user.referral_code}`;

  const message = [
    `🎁 <b>INVITE FRIENDS & EARN COINS</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `🪙 <b>Your Balance:</b> ${user.coins} Coins`,
    `🔑 <b>Your Code:</b> <code>${user.referral_code}</code>`,
    `🔗 <b>Your Link:</b>`,
    `<code>${refLink}</code>`,
    ``,
    `💡 <b>How it works:</b>`,
    `1. Share your link with friends.`,
    `2. When they register, you receive <b>+15 Coins</b>!`,
    `3. They get a <b>+5 Coins bonus</b> too!`,
    `4. Use coins to search for matches and unlock VIP filters.`,
  ].join('\n');

  const keyboard = new InlineKeyboard()
    .text('🔍 Find a Match', 'action:find_match')
    .text('👤 Profile', 'action:view_profile');

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}
