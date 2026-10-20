import { InlineKeyboard } from 'grammy';
import { BotContext } from '../context';
import { inMemoryDb } from '../../db';
import { UserService } from '../../services/userService';

/**
 * Handles `/start` command with optional referral deep-linking
 * Format: `/start` or `/start ref_CODE`
 */
export async function handleStart(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const text = ctx.message?.text || '';
  const parts = text.split(' ');
  const payload = parts.length > 1 ? parts[1].trim() : null;

  // Extract referral code if present (e.g. "ref_ABC12" or "ABC12")
  let referralCodeInput: string | null = null;
  if (payload && payload.startsWith('ref_')) {
    referralCodeInput = payload.replace('ref_', '');
  } else if (payload && payload.startsWith('REF-')) {
    referralCodeInput = payload;
  }

  // Check if user is already registered in DB
  const existingUser = inMemoryDb.getUserByTelegramId(telegramId);

  if (existingUser) {
    // Existing user: show welcome back and main profile/action menu
    const card = UserService.formatProfileCard(existingUser);
    const keyboard = new InlineKeyboard()
      .text('🔍 Find a Match', 'action:find_match')
      .row()
      .text('👤 View Profile', 'action:view_profile')
      .text('✏️ Edit Profile', 'action:edit_profile')
      .row()
      .text('⚙️ Preferences', 'action:view_preferences')
      .text('🎁 Earn Coins', 'action:referral_info');

    await ctx.reply(
      `👋 <b>Welcome back, ${existingUser.name}!</b>\n\n` + card,
      {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }
    );
    return;
  }

  // New user: Save referral code in session and enter the Onboarding Conversation
  ctx.session.tempOnboarding = {
    referredByCode: referralCodeInput || undefined,
  };

  // Launch onboarding conversation wizard
  await ctx.conversation.enter('onboardingConversation');
}
