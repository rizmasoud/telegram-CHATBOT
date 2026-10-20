import { InlineKeyboard } from 'grammy';
import { BotContext } from '../context';
import { inMemoryDb } from '../../db';
import { UserService } from '../../services/userService';

/**
 * Handles `/balance` or `/wallet` command
 */
export async function handleBalanceCommand(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const user = inMemoryDb.getUserByTelegramId(telegramId);

  if (!user) {
    await ctx.reply('⚠️ Please register with /start before accessing your wallet.');
    return;
  }

  const walletCard = UserService.formatWalletCard(user);

  const keyboard = new InlineKeyboard()
    .text('🎁 دعوت از دوستان و دریافت سکه (+15)', 'action:referral_info')
    .row()
    .text('🔍 جستجوی هم‌صحبت (/search)', 'action:find_match')
    .text('👤 پروفایل من', 'action:view_profile');

  await ctx.reply(walletCard, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

/**
 * Handles detailed referral explanation & share generator
 */
export async function handleReferralProgram(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const user = inMemoryDb.getUserByTelegramId(telegramId);

  if (!user) {
    await ctx.reply('⚠️ Please register with /start first.');
    return;
  }

  const botUsername = ctx.me?.username || 'MatchmakingBot';
  const refLink = `https://t.me/${botUsername}?start=ref_${user.referral_code}`;
  const totalInvited = inMemoryDb.getReferralsCount(user.id);
  const shareText = encodeURIComponent(
    `👋 به ربات چت ناشناس بپیوند و با افراد هم‌سلیقه در سراسر ایران آشنا شو!\n\nبا ورود از طریق لینک من، ۵ سکه رایگان دریافت کن:\n${refLink}`
  );
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${shareText}`;

  const message = [
    `🎁 <b>سیستم دعوت و کسب سکه رایگان (Referral Program)</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `🪙 <b>موجودی فعلی شما:</b> <b>${user.coins} سکه</b>`,
    `👥 <b>تعداد دعوت‌های موفق:</b> <b>${totalInvited} نفر</b>`,
    `💰 <b>پاداش هر دعوت:</b> <b>+15 سکه</b> برای شما و <b>+5 سکه</b> برای دوست شما!`,
    ``,
    `🔗 <b>لینک اختصاصی شما:</b>`,
    `<code>${refLink}</code>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `💡 <b>نحوه عملکرد:</b>`,
    `۱. لینک اختصاصی خود را کپی کنید یا روی دکمه «ارسال به دوستان» در زیر کلیک کنید.`,
    `۲. به محض اینکه دوست شما وارد ربات شود و مراحل ثبت‌نام را به پایان برساند:`,
    `   • <b>۱۵ سکه</b> بلافاصله به موجودی شما افزوده می‌شود.`,
    `   • <b>۵ سکه هدیه</b> اضافه نیز به عنوان پاداش ورود به دوست شما تعلق می‌گیرد.`,
    `۳. از سکه‌ها برای جستجوی نامحدود هم‌صحبت استفاده کنید!`,
  ].join('\n');

  const keyboard = new InlineKeyboard()
    .url('📤 اشتراک‌گذاری در تلگرام (Share Link)', shareUrl)
    .row()
    .text('💰 کیف پول و موجودی (/balance)', 'action:view_wallet')
    .text('🔍 شروع جستجو (/search)', 'action:find_match');

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}
