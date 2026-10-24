import { InlineKeyboard } from 'grammy';
import { BotContext } from '../context';
import { inMemoryDb } from '../../db';
import { redisService } from '../../services/redis';
import { ADMIN_TELEGRAM_IDS } from '../../types';

/**
 * Checks if a Telegram ID has admin privileges
 */
export function isAdminUser(telegramId?: string | number): boolean {
  if (!telegramId) return false;
  const idStr = telegramId.toString().trim();
  const dynamicEnvIds = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  return ADMIN_TELEGRAM_IDS.includes(idStr) || dynamicEnvIds.includes(idStr);
}

/**
 * Builds the Admin Dashboard inline keyboard
 */
export function buildAdminKeyboard() {
  const stats = inMemoryDb.getStats();
  const queueStats = redisService.getQueueStats();

  return new InlineKeyboard()
    .text(`📊 آمار جامع سیستم`, 'admin:stats')
    .text(`🛡️ گزارش‌های در انتظار (${stats.pendingReportsCount})`, 'admin:reports')
    .row()
    .text(`📢 ارسال پیام همگانی (Broadcast)`, 'admin:broadcast_prompt')
    .text(`🔄 بروزرسانی`, 'admin:menu')
    .row()
    .text(`🚪 خروج از پنل ادمین`, 'admin:exit');
}

/**
 * Main `/admin` command entry point
 */
export async function handleAdminCommand(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';

  if (!isAdminUser(telegramId)) {
    await ctx.reply(
      '⛔ <b>دسترسی غیرمجاز!</b>\n\n' +
        'این دستور و بخش مدیریتی صرفاً مختص مدیران تایید شده سیستم است.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const stats = inMemoryDb.getStats();
  const queueStats = redisService.getQueueStats();

  const welcomeText = [
    `🛡️ <b>پنل مدیریت و نظارت بات همسریابی و گفتگو</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>مدیر محترم:</b> ${ctx.from?.first_name || 'Admin'} (ID: <code>${telegramId}</code>)`,
    `⏱️ <b>وضعیت موتور:</b> برخط (Online) • ذخیره‌سازی: حافظه مستقیم پرسرعت (In-Memory)`,
    ``,
    `📊 <b>خلاصه وضعیت سیستم:</b>`,
    `• کل کاربران ثبت‌نامی: <b>${stats.totalUsers} نفر</b>`,
    `• کاربران در صف جستجو: <b>${queueStats.queueSize} نفر</b>`,
    `• گفتگوهای فعال لحظه‌ای: <b>${stats.activeChats} مکالمه</b>`,
    `• کاربران مسدود شده: <b>${stats.bannedUsersCount} نفر</b>`,
    `• گزارش‌های نیازمند بررسی: <b>${stats.pendingReportsCount} مورد</b>`,
    `• مجموع سکه‌های در گردش: <b>${stats.totalCoinsInCirculation} سکه</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `لطفاً عملیات مورد نظر خود را از منوی زیر انتخاب نمایید:`,
  ].join('\n');

  await ctx.reply(welcomeText, {
    parse_mode: 'HTML',
    reply_markup: buildAdminKeyboard(),
  });
}

/**
 * Handle detailed statistics view
 */
export async function handleAdminStats(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  if (!isAdminUser(telegramId)) return;

  const stats = inMemoryDb.getStats();
  const queueStats = redisService.getQueueStats();
  const users = stats.users;

  const maleCount = users.filter((u) => u.gender === 'male').length;
  const femaleCount = users.filter((u) => u.gender === 'female').length;

  const message = [
    `📊 <b>گزارش آماری دقیق عملکرد ربات:</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `👥 <b>تفکیک کاربران:</b>`,
    `• کل کاربران: <b>${stats.totalUsers}</b>`,
    `• آقایان: <b>${maleCount}</b> | بانوان: <b>${femaleCount}</b>`,
    `• مسدود شده: <b>${stats.bannedUsersCount}</b>`,
    ``,
    `⚡ <b>صف و پردازش همسان‌گزینی:</b>`,
    `• افراد حاضر در صف: <b>${queueStats.queueSize}</b>`,
    `• چت‌های همزمان فعال: <b>${stats.activeChats}</b>`,
    ``,
    `💰 <b>اقتصاد سکه و دعوت:</b>`,
    `• تراکنش‌های ثبتی: <b>${stats.totalTransactions}</b>`,
    `• سکه‌های در دست کاربران: <b>${stats.totalCoinsInCirculation}</b>`,
    ``,
    `🛡️ <b>واحد نظارت و امنیت:</b>`,
    `• کل گزارش‌ها: <b>${stats.totalReports}</b>`,
    `• موارد باز: <b>${stats.pendingReportsCount}</b>`,
  ].join('\n');

  const kb = new InlineKeyboard()
    .text('🔙 بازگشت به منوی ادمین', 'admin:menu')
    .text('🛡️ مشاهده گزارش‌ها', 'admin:reports');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(message, { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: kb });
  }
}

/**
 * Handle viewing pending reports
 */
export async function handleAdminReports(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  if (!isAdminUser(telegramId)) return;

  const pendingReports = inMemoryDb.getReports('pending');

  if (pendingReports.length === 0) {
    const emptyMsg = `✅ <b>هیچ گزارش تخلف بازی وجود ندارد!</b>\n\nتمامی گزارش‌ها بررسی و تعیین تکلیف شده‌اند.`;
    const kb = new InlineKeyboard().text('🔙 بازگشت به منوی ادمین', 'admin:menu');

    if (ctx.callbackQuery) {
      await ctx.editMessageText(emptyMsg, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.reply(emptyMsg, { parse_mode: 'HTML', reply_markup: kb });
    }
    return;
  }

  // Display first pending report
  const report = pendingReports[0];
  const reporter = inMemoryDb.getUserById(report.reporter_id);
  const reported = inMemoryDb.getUserById(report.reported_id);
  const totalUserReports = inMemoryDb.getReportsCountForUser(report.reported_id, 24);

  const reportText = [
    `🛡️ <b>بررسی گزارش تخلف [${pendingReports.indexOf(report) + 1}/${pendingReports.length}]</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📋 <b>شناسه گزارش:</b> <code>#REP-${report.id}</code>`,
    `⏱️ <b>زمان ثبت:</b> ${new Date(report.created_at).toLocaleTimeString()}`,
    `👤 <b>شاکی:</b> ${reporter?.name || 'Unknown'} (<code>${reporter?.internal_id}</code>)`,
    `🎯 <b>متشاکی:</b> ${reported?.name || 'Unknown'} (<code>${reported?.internal_id}</code>)`,
    `⚠️ <b>تعداد تخلفات کاربر در ۲۴ ساعت:</b> ${totalUserReports} بار`,
    `📝 <b>دلیل گزارش:</b> ${report.reason}`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `💬 <b>متن آخرین پیام‌های رد و بدل شده:</b>\n<code>${report.chat_snippet || 'ثبت نشده'}</code>`,
  ].join('\n');

  const kb = new InlineKeyboard()
    .text(`🔨 مسدودسازی ${reported?.internal_id}`, `admin:ban:${report.id}:${report.reported_id}`)
    .text(`❌ رد گزارش (#REP-${report.id})`, `admin:dismiss:${report.id}`)
    .row()
    .text(`🔙 بازگشت به منوی ادمین`, 'admin:menu');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(reportText, { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await ctx.reply(reportText, { parse_mode: 'HTML', reply_markup: kb });
  }
}

/**
 * Action: Ban user from report
 */
export async function handleAdminBanAction(ctx: BotContext, reportId: number, targetUserId: number) {
  const telegramId = ctx.from?.id?.toString() || '';
  if (!isAdminUser(telegramId)) return;

  const targetUser = inMemoryDb.getUserById(targetUserId);
  inMemoryDb.resolveReport(reportId, 'ban', `Admin_${telegramId}`);

  // Notify banned user via Telegram
  if (targetUser) {
    try {
      await ctx.api.sendMessage(
        targetUser.telegram_id,
        `⛔ <b>حساب کاربری شما توسط تیم نظارت مسدود گردید.</b>\n\n` +
          `به دلیل نقض مکرر قوانین رفتار سالم و گزارش‌های دریافتی، دسترسی شما به تمام بخش‌های بات قطع گردید.`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      // Ignored if user blocked
    }
  }

  await ctx.answerCallbackQuery({
    text: `کاربر ${targetUser?.internal_id || targetUserId} با موفقیت مسدود گردید.`,
    show_alert: true,
  });

  // Re-render reports view
  await handleAdminReports(ctx);
}

/**
 * Action: Dismiss report
 */
export async function handleAdminDismissAction(ctx: BotContext, reportId: number) {
  const telegramId = ctx.from?.id?.toString() || '';
  if (!isAdminUser(telegramId)) return;

  inMemoryDb.resolveReport(reportId, 'dismiss', `Admin_${telegramId}`);

  await ctx.answerCallbackQuery({
    text: `گزارش #REP-${reportId} با موفقیت رد شد.`,
    show_alert: true,
  });

  // Re-render reports view
  await handleAdminReports(ctx);
}

export interface BroadcastOptions {
  type: 'text' | 'photo';
  text: string;
  photoUrl?: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
}

/**
 * Menu to choose between Text broadcast or Rich Media Banner broadcast
 */
export async function handleAdminBroadcastMenu(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  if (!isAdminUser(telegramId)) return;

  const text = [
    `📢 <b>سامانه ارسال پیام و بنر همگانی به تمام کاربران (Broadcast)</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `⚡ <b>موتور ارسال امن:</b> فعال (دسته‌های ۲۵ تایی در ثانیه جهت رعایت سقف مجاز تلگرام)`,
    `🛡️ <b>مدیریت خطا:</b> کاربران مسدودکننده یا دیلیت‌اکانت شده بدون توقف پردازش شمارش می‌شوند.`,
    ``,
    `لطفاً نوع ارسال را انتخاب کنید:`,
  ].join('\n');

  const kb = new InlineKeyboard()
    .text('🖼️ ارسال بنر تصویری با کپشن', 'admin:broadcast_banner')
    .row()
    .text('📝 ارسال پیام متنی با فرمت HTML', 'admin:broadcast_text')
    .row()
    .text('🔙 بازگشت به منوی ادمین', 'admin:menu');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  }
}

/**
 * Safe, chunked queue processor dispatching 25-30 messages/second
 * to strictly comply with Telegram Bot API rate limits.
 */
export async function executeSafeChunkedBroadcast(
  ctx: BotContext,
  options: BroadcastOptions
): Promise<{ total: number; successful: number; failed: number }> {
  const allUsers = inMemoryDb.getAllUsers();
  const BATCH_SIZE = 25; // 25-30 messages per batch to comply with Telegram 30 msg/sec limit
  const BATCH_DELAY_MS = 1000; // 1-second interval between chunks

  let successful = 0;
  let failed = 0;

  for (let i = 0; i < allUsers.length; i += BATCH_SIZE) {
    const batch = allUsers.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(async (user) => {
        try {
          if (options.type === 'photo' && options.photoUrl) {
            await ctx.api.sendPhoto(user.telegram_id, options.photoUrl, {
              caption: options.text,
              parse_mode: options.parse_mode || 'HTML',
              reply_markup: new InlineKeyboard()
                .text('🔍 شروع گفتگو (/search)', 'action:find_match')
                .text('💰 کیف پول (/wallet)', 'action:view_wallet'),
            });
          } else {
            await ctx.api.sendMessage(user.telegram_id, options.text, {
              parse_mode: options.parse_mode || 'HTML',
              reply_markup: new InlineKeyboard()
                .text('🔍 شروع گفتگو (/search)', 'action:find_match')
                .text('💰 کیف پول (/wallet)', 'action:view_wallet'),
            });
          }
          return true;
        } catch (err: any) {
          // Gracefully catch cases where user blocked the bot or account was deleted
          console.warn(`[Broadcast] Could not send to user ${user.telegram_id}:`, err?.message || err);
          throw err;
        }
      })
    );

    for (const res of batchResults) {
      if (res.status === 'fulfilled') {
        successful++;
      } else {
        failed++;
      }
    }

    // Delay between chunks if there are more users
    if (i + BATCH_SIZE < allUsers.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return {
    total: allUsers.length,
    successful,
    failed,
  };
}

/**
 * Action: Broadcast rich media banner with Photo and Caption
 */
export async function handleAdminBannerBroadcast(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  if (!isAdminUser(telegramId)) return;

  const bannerPhotoUrl = process.env.BROADCAST_BANNER_URL?.trim();

  const bannerCaption = [
    `🎉 <b>اطلاعیه ویژه ربات چت و همسان‌گزینی ناشناس</b> 👋`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `✨ <b>امکانات و بروزرسانی‌های ربات:</b>`,
    `• 🛡️ <b>سیستم گزارش فوری تخلف:</b> چت ناسالم با زدن /report فوراً قطع و بررسی می‌شود.`,
    `• ⚡ <b>صف جستجوی سریع:</b> اتصال به هم‌صحبت‌های واقعی در سراسر ایران.`,
    `• 🎁 <b>سکه روزانه و پاداش دعوت:</b> با دستور /daily هر روز سکه رایگان دریافت کن!`,
    ``,
    `برای شروع جستجو یا مدیریت پروفایل از دکمه‌های زیر استفاده کنید:`,
  ].join('\n');

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: '⏳ در حال ارسال اطلاعیه همگانی به صف کاربران...' });
  }

  const result = await executeSafeChunkedBroadcast(ctx, {
    type: bannerPhotoUrl ? 'photo' : 'text',
    photoUrl: bannerPhotoUrl,
    text: bannerCaption,
    parse_mode: 'HTML',
  });

  const summaryMsg = [
    `✅ <b>ارسال بنر به پایان رسید.</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📊 <b>موفق:</b> ${result.successful} | <b>ناموفق (بلاک/دلیلیت):</b> ${result.failed}`,
    `👥 <b>کل کاربران هدف:</b> ${result.total}`,
  ].join('\n');

  const kb = new InlineKeyboard()
    .text('📢 ارسال مجدد یا پیام متنی', 'admin:broadcast_prompt')
    .row()
    .text('🔙 بازگشت به منوی ادمین', 'admin:menu');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(summaryMsg, { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await ctx.reply(summaryMsg, { parse_mode: 'HTML', reply_markup: kb });
  }
}

/**
 * Action: Broadcast formatted HTML text announcement
 */
export async function handleAdminTextBroadcast(ctx: BotContext, customText?: string) {
  const telegramId = ctx.from?.id?.toString() || '';
  if (!isAdminUser(telegramId)) return;

  const textMsg =
    customText ||
    [
      `📢 <b>اطلاعیه رسمی مدیریت ربات</b>`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `همراهان گرامی، به منظور ارتقای سلامت محیط گفتگو، سامانه ناظر خودکار و ضداسپم فعال گردید.`,
      `لطفاً همواره در گفتگوها ادب و احترام را رعایت فرمایید. با آرزوی لحظاتی خوش! ✨`,
    ].join('\n');

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: '⏳ در حال ارسال پیام متنی...' });
  }

  const result = await executeSafeChunkedBroadcast(ctx, {
    type: 'text',
    text: textMsg,
    parse_mode: 'HTML',
  });

  const summaryMsg = [
    `✅ <b>ارسال بنر به پایان رسید.</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📊 <b>موفق:</b> ${result.successful} | <b>ناموفق (بلاک/دلیلیت):</b> ${result.failed}`,
    `👥 <b>کل کاربران هدف:</b> ${result.total}`,
  ].join('\n');

  const kb = new InlineKeyboard()
    .text('📢 ارسال مجدد بنر', 'admin:broadcast_prompt')
    .row()
    .text('🔙 بازگشت به منوی ادمین', 'admin:menu');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(summaryMsg, { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await ctx.reply(summaryMsg, { parse_mode: 'HTML', reply_markup: kb });
  }
}

/**
 * Backwards-compatible broadcast handler
 */
export async function handleAdminBroadcast(ctx: BotContext, broadcastText?: string) {
  if (broadcastText) {
    return handleAdminTextBroadcast(ctx, broadcastText);
  }
  return handleAdminBroadcastMenu(ctx);
}
