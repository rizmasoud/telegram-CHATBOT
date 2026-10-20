import { InlineKeyboard } from 'grammy';
import { BotContext } from '../context';
import { inMemoryDb } from '../../db';
import { redisService } from '../../services/redis';
import { ADMIN_TELEGRAM_IDS } from '../../types';

/**
 * Handles `/report` command or inline button during an active chat.
 * Immediately terminates the session for both parties, stores report, and enforces auto-ban rules.
 */
export async function handleReportChat(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const user = inMemoryDb.getUserByTelegramId(telegramId);

  if (!user) {
    await ctx.reply('⚠️ Please register with /start first.');
    return;
  }

  // Verify user is in an active chat
  const partnerId = redisService.getActiveChatPartner(user.id);
  if (user.status !== 'in_chat' || !partnerId) {
    await ctx.reply(
      '⚠️ <b>شما در حال حاضر در هیچ چت فعالی نیستید!</b>\n\n' +
        'امکان گزارش تخلف تنها در زمان گفتگوی فعال ناشناس امکان‌پذیر است.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const partner = inMemoryDb.getUserById(partnerId);
  if (!partner) {
    await ctx.reply('⚠️ اطلاعات هم‌صحبت شما یافت نشد.');
    return;
  }

  // 1. Terminate chat session immediately for both users
  redisService.endActiveChat(user.id);
  inMemoryDb.updateUserProfile(user.id, { status: 'idle' });
  inMemoryDb.updateUserProfile(partner.id, { status: 'idle' });

  // 2. Fetch anonymized chat history hints for moderation context
  const chatSnippet = redisService.getRecentChatSnippet(user.id, partner.id);

  // 3. Store record in reports table and evaluate auto-ban threshold (3 reports in 24h)
  const { report, autoBanned } = inMemoryDb.createReport({
    reporterId: user.id,
    reportedId: partner.id,
    reason: 'گزارش رفتار نامناسب یا تخلف از قوانین چت ناشناس',
    chatSnippet,
  });

  // 4. Notify reporter
  await ctx.reply(
    `🚨 <b>گزارش شما ثبت شد و چت قطع گردید.</b>\n\n` +
      `از همکاری شما در حفظ محیطی امن و سالم سپاسگزاریم. گزارش شما با شناسه <code>#REP-${report.id}</code> در صف بررسی ناظران قرار گرفت.\n\n` +
      `<i>برای یافتن یک هم‌صحبت جدید، می‌توانید از دستور /search استفاده فرمایید.</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('🔍 جستجوی هم‌صحبت جدید (/search)', 'action:find_match')
        .row()
        .text('💰 کیف پول (/balance)', 'action:view_wallet')
        .text('🏠 منوی اصلی (/start)', 'action:start_menu'),
    }
  );

  // 5. Notify the reported partner
  try {
    await ctx.api.sendMessage(
      partner.telegram_id,
      `⚠️ <b>چت به دلیل دریافت گزارش تخلف بسته شد.</b>\n\n` +
        `لطفاً در گفتگوهای ناشناس همواره ادب و قوانین اخلاقی را رعایت نمایید. دریافت گزارش‌های متعدد منجر به مسدودسازی دائمی حساب کاربری خواهد شد.`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('🔍 جستجوی هم‌صحبت جدید', 'action:find_match')
          .text('👤 پروفایل من', 'action:view_profile'),
      }
    );

    // If auto-ban triggered, immediately send ban notification to the partner
    if (autoBanned) {
      await ctx.api.sendMessage(
        partner.telegram_id,
        `⛔ <b>حساب کاربری شما مسدود گردید!</b>\n\n` +
          `به دلیل ثبت ۳ گزارش تخلف در ۲۴ ساعت گذشته، حساب شما توسط سیستم ناوبری خودکار مسدود گردید و امکان استفاده از ربات را نخواهید داشت.`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (err: any) {
    console.warn(`[Report Notification] Could not message partner ${partner.telegram_id}:`, err.message);
  }

  // 6. Broadcast notification to Admins
  const adminAlert = [
    `🚨 <b>[گزارش جدید دریافت شد]</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📋 <b>شناسه گزارش:</b> #REP-${report.id}`,
    `👤 <b>گزارش‌دهنده:</b> <code>${user.internal_id}</code> (ID: ${user.id})`,
    `🎯 <b>کاربر متخلف:</b> <code>${partner.internal_id}</code> (ID: ${partner.id})`,
    `📝 <b>دلیل:</b> ${report.reason}`,
    autoBanned ? `⛔ <b>وضعیت:</b> مسدودسازی خودکار انجام شد (۳ تخلف در ۲۴ساعت)` : `⏳ <b>وضعیت:</b> در انتظار بررسی ادمین`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `💬 <b>شواهد پیام‌ها:</b>\n<code>${chatSnippet.slice(0, 300)}</code>`,
  ].join('\n');

  for (const adminId of ADMIN_TELEGRAM_IDS) {
    try {
      await ctx.api.sendMessage(adminId, adminAlert, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('🔨 مسدودسازی کاربر', `admin:ban:${report.id}:${partner.id}`)
          .text('❌ رد گزارش', `admin:dismiss:${report.id}`),
      });
    } catch (e) {
      // Admin might not have started bot yet
    }
  }
}
