import { inMemoryDb } from '../db';
import { redisService, QueueEntry } from './redis';
import { UserService } from './userService';
import { getProvinceKeyboard } from '../bot/constants/provinces';
import { buildFilterKeyboard } from '../bot/handlers/filters';
import { BotMessagePayload, BotInlineButton, Gender, TargetGender, ADMIN_TELEGRAM_IDS } from '../types';
import { isAdminUser } from '../bot/handlers/admin';

interface SimUserState {
  telegramId: string;
  step:
    | 'none'
    | 'name'
    | 'gender'
    | 'age'
    | 'province'
    | 'photo'
    | 'bio'
    | 'editing_name'
    | 'editing_age'
    | 'editing_bio';
  provPage: number;
  temp: {
    name?: string;
    gender?: Gender;
    age?: number;
    province?: string;
    photoUrl?: string;
    bio?: string;
    referredByCode?: string;
  };
  messages: BotMessagePayload[];
}

class SimulatorService {
  private userStates: Map<string, SimUserState> = new Map();

  private getOrCreateState(telegramId: string): SimUserState {
    let state = this.userStates.get(telegramId);
    if (!state) {
      state = {
        telegramId,
        step: 'none',
        provPage: 0,
        temp: {},
        messages: [],
      };
      this.userStates.set(telegramId, state);
    }
    return state;
  }

  getMessages(telegramId: string): BotMessagePayload[] {
    return this.getOrCreateState(telegramId).messages;
  }

  private addBotMessage(
    state: SimUserState,
    text: string,
    replyMarkup?: { inline_keyboard?: BotInlineButton[][] },
    photoUrl?: string
  ) {
    state.messages.push({
      id: `bot_${Date.now()}_${Math.random()}`,
      from: 'bot',
      text,
      photoUrl,
      replyMarkup,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  }

  private addUserMessage(state: SimUserState, text: string, photoUrl?: string) {
    state.messages.push({
      id: `user_${Date.now()}_${Math.random()}`,
      from: 'user',
      text,
      photoUrl,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  }

  /**
   * Process incoming text or photo from simulated user
   */
  async handleUserInput(
    telegramId: string,
    text: string,
    photoUrl?: string
  ): Promise<{ messages: BotMessagePayload[]; alert?: string }> {
    const state = this.getOrCreateState(telegramId);
    this.addUserMessage(state, text || (photoUrl ? '📷 [Photo Uploaded]' : ''), photoUrl);

    const trimmed = text.trim();

    // 0. Ban Enforcement Guard
    const dbUser = inMemoryDb.getUserByTelegramId(telegramId);
    if (dbUser && (dbUser.status === 'banned' || redisService.isUserBanned(dbUser.id))) {
      this.addBotMessage(
        state,
        `⛔ <b>حساب کاربری شما به دلیل دریافت گزارش‌های تخلف مسدود گردیده است.</b>\n\nامکان ارسال پیام یا تعامل با ربات به دلیل گزارش‌های دریافتی قطع می‌باشد.`
      );
      return { messages: state.messages, alert: 'حساب کاربری مسدود است (Banned)' };
    }

    // 0. Anti-Spam Rate Limiter: Max 5 messages per 3 seconds
    const rateLimit = redisService.checkMessageRateLimit(telegramId, 5, 3000);
    if (!rateLimit.allowed) {
      const sec = Math.ceil(rateLimit.retryAfterMs / 1000);
      this.addBotMessage(
        state,
        `⚠️ <b>لطفاً کمی آرام‌تر پیام ارسال کنید!</b>\n` +
          `سیستم ضداسپم فعال شد (حداکثر ۵ پیام در ۳ ثانیه). لطفاً ${sec} ثانیه شکیبا باشید.`
      );
      return { messages: state.messages, alert: 'Rate limit exceeded: Max 5 msg / 3s' };
    }

    // 1. Check Slash Commands
    if (trimmed.startsWith('/start')) {
      return this.handleStartCommand(state, trimmed);
    }

    if (trimmed === '/balance' || trimmed === '/wallet') {
      return this.handleBalanceCommand(state);
    }

    if (trimmed === '/profile') {
      return this.handleProfileCommand(state);
    }

    if (trimmed === '/filters' || trimmed === '/preferences') {
      return this.handleFiltersCommand(state);
    }

    if (trimmed === '/find' || trimmed === '/search') {
      return this.handleFindCommand(state);
    }

    if (trimmed === '/next') {
      return this.handleNextCommand(state);
    }

    if (trimmed === '/stop' || trimmed === '/end') {
      return this.handleStopChatCommand(state);
    }

    if (trimmed === '/report') {
      return this.handleReportCommand(state);
    }

    if (trimmed === '/admin') {
      return this.handleAdminCommand(state);
    }

    if (trimmed === '/daily') {
      const user = inMemoryDb.getUserByTelegramId(state.telegramId);
      if (!user) {
        this.addBotMessage(state, '⚠️ لطفاً ابتدا با /start در ربات عضو شوید.');
        return { messages: state.messages };
      }
      inMemoryDb.updateUserProfile(user.id, { coins: user.coins + 2 });
      inMemoryDb.addTransaction({
        userId: user.id,
        amount: 2,
        type: 'admin_gift',
        description: 'Daily bonus check-in (+2 coins)',
      });
      this.addBotMessage(
        state,
        `🎁 <b>شما سکه روزانه خود را دریافت کردید!</b> (+۲ سکه)\n` +
          `فردا دوباره سر بزنید.\n\n` +
          `🪙 موجودی جدید شما: <b>${user.coins + 2} سکه</b>\n\n` +
          `<i>🎁 You claimed your daily bonus (+2 coins)! Come back tomorrow.</i>`
      );
      return { messages: state.messages, alert: '🎁 Daily bonus claimed! (+2 coins)' };
    }

    if (trimmed === '/history') {
      this.addBotMessage(
        state,
        `📜 <b>تاریخچه گفتگوهای پیشین شما</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `در این بخش می‌توانید هم‌صحبت‌های قبلی خود را مشاهده کرده و برای آن‌ها درخواست چت مجدد بفرستید.\n\n` +
          `• کاربر <code>USER-1001</code> (سارا) - وضعیت: آنلاین\n` +
          `• کاربر <code>USER-2002</code> (آرمان) - وضعیت: آفلاین\n\n` +
          `جهت درخواست ارتباط مستقیم از دستور <code>/find_id</code> استفاده نمایید.`,
        {
          inline_keyboard: [
            [{ text: '🔄 چت مجدد با USER-1001', callback_data: 'action:find_match' }],
            [{ text: '🔍 جستجوی جدید', callback_data: 'action:find_match' }],
          ],
        }
      );
      return { messages: state.messages };
    }

    if (trimmed.startsWith('/find_id')) {
      const parts = trimmed.split(' ');
      if (parts.length > 1) {
        const targetId = parts[1].trim().toUpperCase();
        const targetUser = inMemoryDb.getUserByInternalId(targetId);
        if (!targetUser) {
          this.addBotMessage(state, `❌ کاربری با شناسه <code>${targetId}</code> یافت نشد.`);
          return { messages: state.messages };
        }
        this.addBotMessage(
          state,
          `👤 <b>کاربر یافت شد:</b> ${targetUser.name} (<code>${targetUser.internal_id}</code>)\n` +
            `استان: ${targetUser.province} | سن: ${targetUser.age}\n\n` +
            `برای شروع گفتگو با این کاربر دکمه زیر را لمس کنید:`,
          {
            inline_keyboard: [
              [{ text: `💬 شروع چت با ${targetUser.internal_id}`, callback_data: 'action:find_match' }],
            ],
          }
        );
        return { messages: state.messages };
      }
      this.addBotMessage(
        state,
        `🆔 <b>ارسال پیام مستقیم با شناسه کاربری (Direct Anonymous Message)</b>\n\n` +
          `فرمت دستور:\n<code>/find_id USER-XXXX</code>\n\n` +
          `مثال: <code>/find_id USER-1001</code>`
      );
      return { messages: state.messages };
    }

    if (trimmed === '/help') {
      const helpFa = [
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

      this.addBotMessage(state, helpFa, {
        inline_keyboard: [
          [{ text: '🇬🇧 English Version', callback_data: 'help:en' }],
          [
            { text: '🔍 شروع جستجو (/search)', callback_data: 'action:find_match' },
            { text: '💰 کیف پول (/wallet)', callback_data: 'action:view_wallet' },
          ],
        ],
      });
      return { messages: state.messages };
    }

    // 2. In-Chat Anonymous Message Relay
    if (dbUser && dbUser.status === 'in_chat') {
      const partnerId = redisService.getActiveChatPartner(dbUser.id);
      if (partnerId) {
        const partner = inMemoryDb.getUserById(partnerId);
        if (partner) {
          // Record message in redis buffer for moderation snippet
          redisService.recordChatMessage(dbUser.id, partner.id, dbUser.internal_id, trimmed);

          const partnerState = this.getOrCreateState(partner.telegram_id);
          if (photoUrl) {
            this.addBotMessage(
              partnerState,
              `📷 <b>Partner (<code>${dbUser.internal_id}</code>) sent a photo:</b>\n${escapeHtml(trimmed)}`,
              undefined,
              photoUrl
            );
          } else {
            this.addBotMessage(
              partnerState,
              `💬 <b>Partner (<code>${dbUser.internal_id}</code>):</b>\n${escapeHtml(trimmed)}`
            );
          }
        }
      }
      return { messages: state.messages };
    }

    // 3. Onboarding Wizard Step Processing
    switch (state.step) {
      case 'name': {
        if (trimmed.length < 2 || trimmed.length > 50) {
          this.addBotMessage(
            state,
            '⚠️ Please enter a valid name or nickname between 2 and 50 characters:'
          );
          return { messages: state.messages };
        }
        state.temp.name = trimmed;
        state.step = 'gender';

        this.addBotMessage(
          state,
          `<b>Step 2/6: Select your gender</b>\n\n` +
            `⚠️ <b>CRITICAL WARNING:</b>\n` +
            `<b>Your gender CANNOT be changed later!</b> Once set, it is permanently locked in the database to prevent deceptive matchmaking.\n\n` +
            `Please select honestly:`,
          {
            inline_keyboard: [
              [
                { text: '👨 Male', callback_data: 'gender:male' },
                { text: '👩 Female', callback_data: 'gender:female' },
              ],
            ],
          }
        );
        return { messages: state.messages };
      }

      case 'age': {
        const age = parseInt(trimmed, 10);
        if (isNaN(age) || age < 18 || age > 99) {
          this.addBotMessage(
            state,
            '⚠️ <b>Invalid Age!</b> You must be between 18 and 99 years old to join. Please enter your valid age:'
          );
          return { messages: state.messages };
        }
        state.temp.age = age;
        state.step = 'province';
        state.provPage = 0;

        const keyboard = getProvinceKeyboard(state.provPage);
        this.addBotMessage(
          state,
          `<b>Step 4/6: Which Iranian province are you from?</b>\n\n` +
            `<i>Select your province from the inline list:</i>`,
          { inline_keyboard: keyboard }
        );
        return { messages: state.messages };
      }

      case 'photo': {
        if (photoUrl) {
          state.temp.photoUrl = photoUrl;
          state.step = 'bio';
          this.addBotMessage(
            state,
            `✅ Profile photo saved!\n\n` +
              `<b>Step 6/6: Write a short bio</b> ✍️\n\n` +
              `<i>Share what you enjoy (hobbies, music, interests) or tap skip:</i>`,
            {
              inline_keyboard: [[{ text: '⏭️ Skip Bio', callback_data: 'bio:skip' }]],
            }
          );
        } else {
          this.addBotMessage(state, '📸 Please send an image or click "Skip Photo":', {
            inline_keyboard: [[{ text: '⏭️ Skip Photo', callback_data: 'photo:skip' }]],
          });
        }
        return { messages: state.messages };
      }

      case 'bio': {
        if (trimmed.length > 250) {
          this.addBotMessage(state, '⚠️ Bio is too long! Please keep it under 250 characters:');
          return { messages: state.messages };
        }
        state.temp.bio = trimmed;
        return this.finalizeRegistration(state);
      }

      case 'editing_name': {
        if (dbUser && trimmed.length >= 2 && trimmed.length <= 50) {
          inMemoryDb.updateUserProfile(dbUser.id, { name: trimmed });
          state.step = 'none';
          this.addBotMessage(state, `✅ Name updated to <b>${trimmed}</b>!`);
          return this.handleProfileCommand(state);
        }
        this.addBotMessage(state, '⚠️ Enter a valid name (2-50 chars):');
        return { messages: state.messages };
      }

      case 'editing_age': {
        const newAge = parseInt(trimmed, 10);
        if (dbUser && !isNaN(newAge) && newAge >= 18 && newAge <= 99) {
          inMemoryDb.updateUserProfile(dbUser.id, { age: newAge });
          state.step = 'none';
          this.addBotMessage(state, `✅ Age updated to <b>${newAge}</b>!`);
          return this.handleProfileCommand(state);
        }
        this.addBotMessage(state, '⚠️ Enter a valid age (18-99):');
        return { messages: state.messages };
      }

      case 'editing_bio': {
        if (dbUser && trimmed.length <= 250) {
          inMemoryDb.updateUserProfile(dbUser.id, { bio: trimmed });
          state.step = 'none';
          this.addBotMessage(state, `✅ Bio updated!`);
          return this.handleProfileCommand(state);
        }
        this.addBotMessage(state, '⚠️ Enter bio under 250 chars:');
        return { messages: state.messages };
      }

      default: {
        if (dbUser) {
          this.addBotMessage(
            state,
            `💡 Use <code>/search</code> to find a partner, <code>/balance</code> for coins, or <code>/filters</code>.`
          );
        } else {
          this.addBotMessage(
            state,
            `👋 Welcome! Send <code>/start</code> to begin your anonymous profile registration.`
          );
        }
        return { messages: state.messages };
      }
    }
  }

  /**
   * Process button clicks (inline query callback)
   */
  async handleCallbackQuery(
    telegramId: string,
    callbackData: string
  ): Promise<{ messages: BotMessagePayload[]; alert?: string }> {
    const state = this.getOrCreateState(telegramId);
    const dbUser = inMemoryDb.getUserByTelegramId(telegramId);

    // 1. Gender Selection
    if (callbackData.startsWith('gender:')) {
      const gender = callbackData.replace('gender:', '') as Gender;
      state.temp.gender = gender;
      state.step = 'age';

      this.addBotMessage(
        state,
        `✅ Gender selected: <b>${gender === 'male' ? '👨 Male' : '👩 Female'}</b> <i>(Locked permanently)</i>\n\n` +
          `<b>Step 3/6: How old are you?</b>\n` +
          `<i>(Enter a number between 18 and 99)</i>`
      );
      return { messages: state.messages, alert: `Gender registered as ${gender}` };
    }

    // 2. Province Selection & Pagination
    if (callbackData.startsWith('prov_select:')) {
      const province = callbackData.replace('prov_select:', '');
      state.temp.province = province;
      state.step = 'photo';

      this.addBotMessage(
        state,
        `✅ Province set: <b>${province}</b>\n\n` +
          `<b>Step 5/6: Upload a Profile Photo</b> 📸\n\n` +
          `<i>You can upload a photo now or click Skip to continue:</i>`,
        {
          inline_keyboard: [[{ text: '⏭️ Skip Photo', callback_data: 'photo:skip' }]],
        }
      );
      return { messages: state.messages, alert: `Selected ${province}` };
    }

    if (callbackData.startsWith('prov_page:')) {
      const pageStr = callbackData.replace('prov_page:', '');
      if (pageStr !== 'noop') {
        state.provPage = parseInt(pageStr, 10);
        this.addBotMessage(
          state,
          `📍 Select your Iranian province: (Page ${state.provPage + 1}/4)`,
          { inline_keyboard: getProvinceKeyboard(state.provPage) }
        );
      }
      return { messages: state.messages };
    }

    // 3. Photo Skip
    if (callbackData === 'photo:skip') {
      state.step = 'bio';
      this.addBotMessage(
        state,
        `⏭️ Photo skipped.\n\n` +
          `<b>Step 6/6: Write a short bio</b> ✍️\n\n` +
          `<i>Tell matches what you love (hobbies, topics, music) or tap skip:</i>`,
        {
          inline_keyboard: [[{ text: '⏭️ Skip Bio', callback_data: 'bio:skip' }]],
        }
      );
      return { messages: state.messages };
    }

    // 4. Bio Skip
    if (callbackData === 'bio:skip') {
      state.temp.bio = undefined;
      return this.finalizeRegistration(state);
    }

    // 5. Gender Locked Alert
    if (callbackData === 'edit:gender_locked') {
      this.addBotMessage(
        state,
        `⚠️ <b>GENDER IS IMMUTABLE:</b>\n` +
          `Gender cannot be edited after onboarding. This protects members from deceptive matchmaking profiles.`
      );
      return {
        messages: state.messages,
        alert: '🔒 Gender is permanently locked and cannot be changed!',
      };
    }

    // 6. Navigation and Actions
    if (callbackData === 'action:find_match') {
      return this.handleFindCommand(state);
    }

    if (callbackData === 'action:next_chat') {
      return this.handleNextCommand(state);
    }

    if (callbackData === 'action:stop_chat') {
      return this.handleStopChatCommand(state);
    }

    if (callbackData === 'action:cancel_search') {
      return this.handleCancelSearch(state);
    }

    if (callbackData === 'action:view_profile') {
      return this.handleProfileCommand(state);
    }

    if (callbackData === 'action:view_wallet') {
      return this.handleBalanceCommand(state);
    }

    if (callbackData === 'action:edit_profile') {
      return this.handleEditMenu(state);
    }

    if (callbackData === 'action:report_chat') {
      return this.handleReportCommand(state);
    }

    if (callbackData === 'action:start_menu') {
      return this.handleStartCommand(state, '/start');
    }

    if (callbackData === 'admin:menu') {
      return this.handleAdminCommand(state);
    }

    if (callbackData === 'admin:stats') {
      return this.handleAdminStats(state);
    }

    if (callbackData === 'admin:reports') {
      return this.handleAdminReports(state);
    }

    if (callbackData.startsWith('admin:ban:')) {
      const parts = callbackData.split(':');
      const repId = parseInt(parts[2], 10);
      const targetUserId = parseInt(parts[3], 10);
      return this.handleAdminBanAction(state, repId, targetUserId);
    }

    if (callbackData.startsWith('admin:dismiss:')) {
      const parts = callbackData.split(':');
      const repId = parseInt(parts[2], 10);
      return this.handleAdminDismissAction(state, repId);
    }

    if (callbackData === 'admin:broadcast_prompt') {
      return this.handleAdminBroadcastMenu(state);
    }

    if (callbackData === 'admin:broadcast_banner') {
      return this.handleAdminBannerBroadcast(state);
    }

    if (callbackData === 'admin:broadcast_text') {
      return this.handleAdminTextBroadcast(state);
    }

    if (callbackData === 'help:en') {
      const helpEn = [
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

      this.addBotMessage(state, helpEn, {
        inline_keyboard: [
          [{ text: '🇮🇷 راهنمای فارسی', callback_data: 'help:fa' }],
          [
            { text: '🔍 Start Matching (/search)', callback_data: 'action:find_match' },
            { text: '💰 Wallet (/wallet)', callback_data: 'action:view_wallet' },
          ],
        ],
      });
      return { messages: state.messages };
    }

    if (callbackData === 'help:fa') {
      const helpFa = [
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

      this.addBotMessage(state, helpFa, {
        inline_keyboard: [
          [{ text: '🇬🇧 English Version', callback_data: 'help:en' }],
          [
            { text: '🔍 شروع جستجو (/search)', callback_data: 'action:find_match' },
            { text: '💰 کیف پول (/wallet)', callback_data: 'action:view_wallet' },
          ],
        ],
      });
      return { messages: state.messages };
    }

    if (callbackData === 'admin:exit') {
      this.addBotMessage(state, '🚪 <b>از پنل مدیریت خارج شدید.</b>', {
        inline_keyboard: [
          [{ text: '🔍 شروع جستجو (/search)', callback_data: 'action:find_match' }],
          [{ text: '👤 پروفایل', callback_data: 'action:view_profile' }],
          [{ text: '🛡️ ورود مجدد به پنل (/admin)', callback_data: 'admin:menu' }],
        ],
      });
      return { messages: state.messages, alert: 'Logged out of admin panel' };
    }

    // 7. Filters Customization Callbacks
    if (callbackData.startsWith('filter:') && dbUser) {
      let pref = inMemoryDb.getPreferences(dbUser.id);
      if (!pref) {
        pref = inMemoryDb.updatePreferences(dbUser.id, {
          target_gender: dbUser.gender === 'male' ? 'female' : 'male',
          target_age_min: 18,
          target_age_max: 99,
          target_province: 'any_province',
        });
      }

      if (callbackData.startsWith('filter:gender:')) {
        const nextGender = callbackData.replace('filter:gender:', '') as TargetGender;
        pref = inMemoryDb.updatePreferences(dbUser.id, { target_gender: nextGender });
      } else if (callbackData.startsWith('filter:preset:')) {
        const [minStr, maxStr] = callbackData.replace('filter:preset:', '').split('-');
        pref = inMemoryDb.updatePreferences(dbUser.id, {
          target_age_min: parseInt(minStr, 10),
          target_age_max: parseInt(maxStr, 10),
        });
      } else if (callbackData.startsWith('filter:adj:')) {
        const [, , field, op] = callbackData.split(':');
        let min = pref.target_age_min;
        let max = pref.target_age_max;
        if (field === 'min') {
          min = op === 'inc' ? Math.min(min + 1, max) : Math.max(18, min - 1);
        } else if (field === 'max') {
          max = op === 'inc' ? Math.min(99, max + 1) : Math.max(min, max - 1);
        }
        pref = inMemoryDb.updatePreferences(dbUser.id, { target_age_min: min, target_age_max: max });
      } else if (callbackData === 'filter:prov:same') {
        pref = inMemoryDb.updatePreferences(dbUser.id, { target_province: 'same_province' });
      } else if (callbackData === 'filter:prov:any') {
        pref = inMemoryDb.updatePreferences(dbUser.id, { target_province: 'any_province' });
      } else if (callbackData === 'filter:prov:pick') {
        const provKeyboard = getProvinceKeyboard(0).map((row) =>
          row.map((btn) => ({
            text: btn.text,
            callback_data: `filter:set_prov:${btn.callback_data.replace('prov_select:', '')}`,
          }))
        );
        this.addBotMessage(state, '🗺️ <b>Select Specific Iranian Province:</b>', {
          inline_keyboard: provKeyboard,
        });
        return { messages: state.messages };
      } else if (callbackData.startsWith('filter:set_prov:')) {
        const provName = callbackData.replace('filter:set_prov:', '');
        pref = inMemoryDb.updatePreferences(dbUser.id, { target_province: provName });
      }

      const card = UserService.formatPreferencesCard(pref);
      const keyboard = buildFilterKeyboard(pref);
      this.addBotMessage(state, card, { inline_keyboard: keyboard.inline_keyboard });
      return { messages: state.messages, alert: 'Filter settings updated' };
    }

    // 8. Field edit triggers
    if (callbackData === 'edit:name') {
      state.step = 'editing_name';
      this.addBotMessage(state, '✏️ Please enter your new name/nickname:');
      return { messages: state.messages };
    }

    if (callbackData === 'edit:age') {
      state.step = 'editing_age';
      this.addBotMessage(state, '🎂 Please enter your new age (18-99):');
      return { messages: state.messages };
    }

    if (callbackData === 'edit:bio') {
      state.step = 'editing_bio';
      this.addBotMessage(state, '📝 Enter your updated bio (max 250 characters):');
      return { messages: state.messages };
    }

    if (callbackData === 'edit:province') {
      state.provPage = 0;
      this.addBotMessage(state, '📍 Select your updated province:', {
        inline_keyboard: getProvinceKeyboard(0),
      });
      return { messages: state.messages };
    }

    return { messages: state.messages };
  }

  // --- Handlers ---

  private handleStartCommand(state: SimUserState, commandText: string) {
    const parts = commandText.split(' ');
    let referralCode: string | undefined = undefined;

    if (parts.length > 1) {
      const payload = parts[1].trim();
      referralCode = payload.replace('ref_', '');
    }

    const existing = inMemoryDb.getUserByTelegramId(state.telegramId);

    if (existing) {
      const card = UserService.formatProfileCard(existing);
      this.addBotMessage(
        state,
        `👋 <b>Welcome back, ${existing.name}!</b>\n\n` + card,
        {
          inline_keyboard: [
            [{ text: '🔍 Find a Match (/search)', callback_data: 'action:find_match' }],
            [
              { text: '💰 Wallet (/balance)', callback_data: 'action:view_wallet' },
              { text: '⚙️ Matching Filters', callback_data: 'action:view_preferences' },
            ],
            [
              { text: '✏️ Edit Profile', callback_data: 'action:edit_profile' },
              { text: '🎁 Earn Coins (+15)', callback_data: 'action:referral_info' },
            ],
          ],
        }
      );
      return { messages: state.messages };
    }

    // Initiate Onboarding
    state.step = 'name';
    state.temp = { referredByCode: referralCode };

    this.addBotMessage(
      state,
      `👋 <b>Welcome to Anonymous Matchmaking Bot!</b>\n\n` +
        `Find like-minded people across Iran in a safe, anonymous environment.\n\n` +
        (referralCode ? `🎁 <i>Referral invite detected! (${referralCode})</i>\n\n` : '') +
        `Let's setup your profile in 6 quick steps.\n\n` +
        `<b>Step 1/6: What is your name or nickname?</b>`
    );

    return { messages: state.messages };
  }

  private handleBalanceCommand(state: SimUserState) {
    const user = inMemoryDb.getUserByTelegramId(state.telegramId);
    if (!user) {
      this.addBotMessage(state, 'Please register with /start first.');
      return { messages: state.messages };
    }

    const card = UserService.formatWalletCard(user);
    this.addBotMessage(state, card, {
      inline_keyboard: [
        [{ text: '🎁 دعوت از دوستان و دریافت سکه (+15)', callback_data: 'action:referral_info' }],
        [
          { text: '🔍 شروع جستجو (/search)', callback_data: 'action:find_match' },
          { text: '👤 پروفایل من', callback_data: 'action:view_profile' },
        ],
      ],
    });
    return { messages: state.messages };
  }

  private handleProfileCommand(state: SimUserState) {
    const user = inMemoryDb.getUserByTelegramId(state.telegramId);
    if (!user) {
      this.addBotMessage(state, 'Please send <code>/start</code> to register.');
      return { messages: state.messages };
    }

    const card = UserService.formatProfileCard(user);
    this.addBotMessage(state, card, {
      inline_keyboard: [
        [{ text: '🔍 Find a Match', callback_data: 'action:find_match' }],
        [
          { text: '💰 Wallet & Coins', callback_data: 'action:view_wallet' },
          { text: '⚙️ Filters', callback_data: 'action:view_preferences' },
        ],
        [{ text: '🎁 Referral Program', callback_data: 'action:referral_info' }],
      ],
    });
    return { messages: state.messages };
  }

  private handleFiltersCommand(state: SimUserState) {
    const user = inMemoryDb.getUserByTelegramId(state.telegramId);
    if (!user) return { messages: state.messages };

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
    const keyboard = buildFilterKeyboard(pref);

    this.addBotMessage(state, card, { inline_keyboard: keyboard.inline_keyboard });
    return { messages: state.messages };
  }

  private handleEditMenu(state: SimUserState) {
    const user = inMemoryDb.getUserByTelegramId(state.telegramId);
    if (!user) return { messages: state.messages };

    this.addBotMessage(
      state,
      `✏️ <b>EDIT PROFILE SETTINGS</b>\n\n` +
        `• Name: <b>${user.name}</b>\n` +
        `• Age: <b>${user.age}</b>\n` +
        `• Province: <b>${user.province}</b>\n` +
        `• Gender: <b>${user.gender.toUpperCase()}</b> <i>(🔒 Immutable)</i>\n\n` +
        `<i>Tap a button to modify:</i>`,
      {
        inline_keyboard: [
          [
            { text: '✏️ Name', callback_data: 'edit:name' },
            { text: '🎂 Age', callback_data: 'edit:age' },
          ],
          [
            { text: '📍 Province', callback_data: 'edit:province' },
            { text: '📝 Bio', callback_data: 'edit:bio' },
          ],
          [{ text: '🔒 Gender (Locked)', callback_data: 'edit:gender_locked' }],
          [{ text: '🔙 Back to Profile', callback_data: 'action:view_profile' }],
        ],
      }
    );
    return { messages: state.messages };
  }

  private handleReferralView(state: SimUserState) {
    const user = inMemoryDb.getUserByTelegramId(state.telegramId);
    if (!user) return { messages: state.messages };

    const refLink = `https://t.me/MatchmakingBot?start=ref_${user.referral_code}`;
    const totalInvited = inMemoryDb.getReferralsCount(user.id);

    this.addBotMessage(
      state,
      `🎁 <b>سیستم دعوت و کسب سکه رایگان (Referral Program)</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `🪙 <b>موجودی فعلی شما:</b> <b>${user.coins} سکه</b>\n` +
        `👥 <b>تعداد دعوت‌های موفق:</b> <b>${totalInvited} نفر</b>\n` +
        `💰 <b>پاداش هر دعوت:</b> <b>+15 سکه</b> برای شما و <b>+5 سکه</b> برای دوست شما!\n\n` +
        `🔗 <b>لینک اختصاصی شما:</b>\n` +
        `<code>${refLink}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 <b>نحوه عملکرد:</b>\n` +
        `۱. لینک اختصاصی خود را کپی کنید یا برای دوستان خود بفرستید.\n` +
        `۲. به محض اینکه دوست شما وارد ربات شود و ثبت‌نام کند، <b>۱۵ سکه</b> بلافاصله به حساب شما واریز می‌شود!\n` +
        `۳. هر جستجوی هم‌صحبت ۱ سکه هزینه دارد.`,
      {
        inline_keyboard: [
          [{ text: '💰 کیف پول و تراکنش‌ها (/balance)', callback_data: 'action:view_wallet' }],
          [{ text: '🔍 شروع جستجو (/search)', callback_data: 'action:find_match' }],
          [{ text: '👤 بازگشت به پروفایل', callback_data: 'action:view_profile' }],
        ],
      }
    );
    return { messages: state.messages };
  }

  private async handleFindCommand(state: SimUserState) {
    const user = inMemoryDb.getUserByTelegramId(state.telegramId);
    if (!user) {
      this.addBotMessage(state, 'Please register with /start first.');
      return { messages: state.messages };
    }

    // 0. Banned user guard
    if (user.status === 'banned' || redisService.isUserBanned(user.id)) {
      this.addBotMessage(
        state,
        '⛔ <b>حساب کاربری شما به دلیل دریافت گزارش‌های تخلف مسدود گردیده است.</b>\n\nامکان جستجو و شروع گفتگو برای شما غیرفعال می‌باشد.'
      );
      return { messages: state.messages, alert: 'User account is banned' };
    }

    // 0. Search Rate Limiter: 1 search per 5 seconds
    const searchRate = redisService.checkSearchRateLimit(user.id, 5000);
    if (!searchRate.allowed) {
      const waitSec = Math.ceil(searchRate.retryAfterMs / 1000);
      this.addBotMessage(
        state,
        `⚠️ <b>لطفاً کمی صبر کنید!</b>\nامکان ارسال درخواست جستجوی مجدد تا ${waitSec} ثانیه دیگر مجاز خواهد شد.`
      );
      return { messages: state.messages, alert: `Please wait ${waitSec}s between searches.` };
    }

    if (user.status === 'in_chat') {
      this.addBotMessage(
        state,
        `⚠️ You are already in an active chat!\n` +
          `• Send <code>/next</code> to skip to a new person\n` +
          `• Send <code>/stop</code> to end the conversation\n` +
          `• Send <code>/report</code> to report misconduct`,
        {
          inline_keyboard: [
            [
              { text: '⏭️ Next Partner (/next)', callback_data: 'action:next_chat' },
              { text: '⏹️ End Chat (/stop)', callback_data: 'action:stop_chat' },
            ],
            [
              { text: '🚨 گزارش تخلف (/report)', callback_data: 'action:report_chat' },
            ],
          ],
        }
      );
      return { messages: state.messages };
    }

    // Atomic Coin Deduction Guard
    const deduct = inMemoryDb.atomicDeductCoins(user.id, 1, 'match_search', 'Matchmaking search fee');
    if (!deduct.success) {
      this.addBotMessage(
        state,
        `⚠️ <b>سکه‌های شما به اتمام رسیده است!</b>\n\n` +
          `برای جستجوی بیشتر، می‌توانید دوستان خود را با لینک اختصاصی دعوت کنید تا به ازای هر نفر <b>۱۵+ سکه هدیه</b> بگیرید.\n\n` +
          `<i>You have run out of coins! Invite friends to earn +15 coins immediately.</i>`,
        {
          inline_keyboard: [
            [{ text: '🎁 دعوت از دوستان و دریافت سکه (+15)', callback_data: 'action:referral_info' }],
            [{ text: '💰 کیف پول و موجودی (/balance)', callback_data: 'action:view_wallet' }],
          ],
        }
      );
      return { messages: state.messages, alert: 'Insufficient coins! Invite friends to get +15 coins.' };
    }

    // Mark user searching
    inMemoryDb.updateUserProfile(user.id, { status: 'searching' });

    const pref = inMemoryDb.getPreferences(user.id);
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
      targetGender: pref?.target_gender || 'any',
      targetAgeMin: pref?.target_age_min || 18,
      targetAgeMax: pref?.target_age_max || 99,
      targetProvince: pref?.target_province || 'any_province',
      queuedAt: Date.now(),
    };

    await redisService.addToMatchQueue(queueEntry);
    const matchResult = await redisService.findAndPair(queueEntry);

    if (matchResult) {
      const { partner } = matchResult;
      const partnerUser = inMemoryDb.getUserById(partner.userId);

      if (partnerUser) {
        inMemoryDb.updateUserProfile(user.id, { status: 'in_chat' });
        inMemoryDb.updateUserProfile(partnerUser.id, { status: 'in_chat' });
        inMemoryDb.createChatSession(user.id, partnerUser.id);

        const chatButtons = [
          [
            { text: '⏭️ Next Partner (/next)', callback_data: 'action:next_chat' },
            { text: '⏹️ Stop Chat (/stop)', callback_data: 'action:stop_chat' },
          ],
          [
            { text: '🚨 گزارش تخلف (/report)', callback_data: 'action:report_chat' },
          ],
        ];

        // Notify User
        this.addBotMessage(
          state,
          `🎉 <b>Match found! You are now connected anonymously (Internal ID: <code>${partnerUser.internal_id}</code>). Say hello! 👋</b>\n\n` +
            `🎭 <b>Partner Profile:</b>\n` +
            `• Name: <b>${partnerUser.name}</b>\n` +
            `• Age: <b>${partnerUser.age} yrs</b>\n` +
            `• Province: <b>${partnerUser.province}</b>\n` +
            `• Gender: <b>${partnerUser.gender === 'male' ? '👨 Male' : '👩 Female'}</b>\n` +
            (partnerUser.bio ? `• Bio: <i>"${escapeHtml(partnerUser.bio)}"</i>\n` : '') +
            `\n💬 Send messages or photos below to chat:`,
          { inline_keyboard: chatButtons },
          partnerUser.profile_photo_file_id || undefined
        );

        // Notify Partner in Simulator
        const partnerState = this.getOrCreateState(partnerUser.telegram_id);
        this.addBotMessage(
          partnerState,
          `🎉 <b>Match found! You are now connected anonymously (Internal ID: <code>${user.internal_id}</code>). Say hello! 👋</b>\n\n` +
            `🎭 <b>Partner Profile:</b>\n` +
            `• Name: <b>${user.name}</b>\n` +
            `• Age: <b>${user.age} yrs</b>\n` +
            `• Province: <b>${user.province}</b>\n` +
            `• Gender: <b>${user.gender === 'male' ? '👨 Male' : '👩 Female'}</b>\n` +
            (user.bio ? `• Bio: <i>"${escapeHtml(user.bio)}"</i>\n` : '') +
            `\n💬 Send messages or photos below to chat:`,
          { inline_keyboard: chatButtons },
          user.profile_photo_file_id || undefined
        );

        return { messages: state.messages, alert: 'Match found!' };
      }
    }

    // Waiting in Redis queue
    this.addBotMessage(
      state,
      `⏳ <b>Searching for compatible matches in Redis queue...</b>\n\n` +
        `Filters: Looking for <b>${pref?.target_gender || 'any'}</b>, ages <b>${pref?.target_age_min}-${pref?.target_age_max}</b> in <b>${pref?.target_province}</b>.\n` +
        `<i>(Deducted 1 coin. Remaining: ${user.coins} 🪙)</i>`,
      {
        inline_keyboard: [[{ text: '❌ Cancel Search', callback_data: 'action:cancel_search' }]],
      }
    );
    return { messages: state.messages };
  }

  private async handleNextCommand(state: SimUserState) {
    const user = inMemoryDb.getUserByTelegramId(state.telegramId);
    if (!user) return { messages: state.messages };

    if (user.status === 'in_chat') {
      const { partnerId } = redisService.endActiveChat(user.id);
      inMemoryDb.updateUserProfile(user.id, { status: 'idle' });

      if (partnerId) {
        inMemoryDb.updateUserProfile(partnerId, { status: 'idle' });
        const partner = inMemoryDb.getUserById(partnerId);
        if (partner) {
          const partnerState = this.getOrCreateState(partner.telegram_id);
          this.addBotMessage(
            partnerState,
            '👋 <b>Your partner left the chat and skipped to the next person.</b>',
            {
              inline_keyboard: [
                [{ text: '🔍 Search Again', callback_data: 'action:find_match' }],
                [{ text: '👤 Profile', callback_data: 'action:view_profile' }],
              ],
            }
          );
        }
      }

      this.addBotMessage(state, '⏭️ <b>Chat skipped.</b> Searching for your next match right away...');
    }

    // Automatically trigger find match!
    return this.handleFindCommand(state);
  }

  private handleStopChatCommand(state: SimUserState) {
    const user = inMemoryDb.getUserByTelegramId(state.telegramId);
    if (!user) return { messages: state.messages };

    if (user.status === 'searching') {
      return this.handleCancelSearch(state);
    }

    if (user.status !== 'in_chat') {
      this.addBotMessage(state, 'You are not currently in an active conversation.', {
        inline_keyboard: [
          [{ text: '🔍 Find Match', callback_data: 'action:find_match' }],
          [{ text: '👤 Profile', callback_data: 'action:view_profile' }],
        ],
      });
      return { messages: state.messages };
    }

    const { partnerId } = redisService.endActiveChat(user.id);
    inMemoryDb.updateUserProfile(user.id, { status: 'idle' });

    if (partnerId) {
      inMemoryDb.updateUserProfile(partnerId, { status: 'idle' });
      const partner = inMemoryDb.getUserById(partnerId);
      if (partner) {
        const partnerState = this.getOrCreateState(partner.telegram_id);
        this.addBotMessage(
          partnerState,
          '👋 <b>Your partner has ended the chat session.</b>',
          {
            inline_keyboard: [
              [{ text: '🔍 Find New Match', callback_data: 'action:find_match' }],
              [{ text: '👤 Back to Profile', callback_data: 'action:view_profile' }],
            ],
          }
        );
      }
    }

    this.addBotMessage(
      state,
      '⏹️ <b>Conversation ended.</b> You are now back in the main menu.',
      {
        inline_keyboard: [
          [{ text: '🔍 Find New Match', callback_data: 'action:find_match' }],
          [{ text: '💰 کیف پول (/balance)', callback_data: 'action:view_wallet' }],
          [{ text: '⚙️ Filters (/filters)', callback_data: 'action:view_preferences' }],
          [{ text: '👤 Profile', callback_data: 'action:view_profile' }],
        ],
      }
    );
    return { messages: state.messages, alert: 'Chat ended' };
  }

  private async handleCancelSearch(state: SimUserState) {
    const user = inMemoryDb.getUserByTelegramId(state.telegramId);
    if (!user) return { messages: state.messages };

    await redisService.removeFromMatchQueue(user.id);
    inMemoryDb.updateUserProfile(user.id, { status: 'idle' });
    inMemoryDb.awardCoins(user.id, 1, 'match_search', 'Refund for cancelled matchmaking search');

    this.addBotMessage(state, '❌ Match search cancelled. Your 1 coin has been refunded.', {
      inline_keyboard: [
        [{ text: '🔍 Search Again', callback_data: 'action:find_match' }],
        [{ text: '💰 کیف پول (/balance)', callback_data: 'action:view_wallet' }],
        [{ text: '⚙️ Filters', callback_data: 'action:view_preferences' }],
        [{ text: '👤 Profile', callback_data: 'action:view_profile' }],
      ],
    });
    return { messages: state.messages, alert: 'Search cancelled' };
  }

  private handleReportCommand(state: SimUserState) {
    const user = inMemoryDb.getUserByTelegramId(state.telegramId);
    if (!user) {
      this.addBotMessage(state, 'Please register with /start first.');
      return { messages: state.messages };
    }

    const partnerId = redisService.getActiveChatPartner(user.id);
    if (user.status !== 'in_chat' || !partnerId) {
      this.addBotMessage(
        state,
        '⚠️ <b>شما در حال حاضر در هیچ چت فعالی نیستید!</b>\n\n' +
          'امکان گزارش تخلف تنها در زمان گفتگوی فعال ناشناس امکان‌پذیر است.',
        {
          inline_keyboard: [
            [{ text: '🔍 یافتن هم‌صحبت (/search)', callback_data: 'action:find_match' }],
            [{ text: '👤 پروفایل من', callback_data: 'action:view_profile' }],
          ],
        }
      );
      return { messages: state.messages, alert: 'You are not in an active chat' };
    }

    const partner = inMemoryDb.getUserById(partnerId);
    if (!partner) {
      this.addBotMessage(state, '⚠️ اطلاعات هم‌صحبت شما یافت نشد.');
      return { messages: state.messages };
    }

    // 1. Immediately terminate active chat session for both users
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

    // 4. Notify reporter: "گزارش شما ثبت شد و چت قطع گردید. از همکاری شما سپاسگزاریم."
    this.addBotMessage(
      state,
      `🚨 <b>گزارش شما ثبت شد و چت قطع گردید.</b>\n` +
        `از همکاری شما در حفظ امنیت محیط چت سپاسگزاریم.\n\n` +
        `📋 <b>شناسه پیگیری:</b> <code>#REP-${report.id}</code>\n` +
        (autoBanned
          ? `⛔ <i>سامانه خودکار: کاربر مقابل به دلیل عبور از سقف تخلفات مجاز (۳ گزارش در ۲۴ ساعت) مسدود شد.</i>`
          : `⏳ <i>گزارش شما جهت بررسی به ناظران سیستم ارسال گردید.</i>`),
      {
        inline_keyboard: [
          [{ text: '🔍 جستجوی هم‌صحبت جدید (/search)', callback_data: 'action:find_match' }],
          [{ text: '💰 کیف پول (/balance)', callback_data: 'action:view_wallet' }],
          [{ text: '👤 پروفایل من', callback_data: 'action:view_profile' }],
        ],
      }
    );

    // 5. Notify the reported partner: "چت به دلیل دریافت گزارش تخلف بسته شد."
    const partnerState = this.getOrCreateState(partner.telegram_id);
    this.addBotMessage(
      partnerState,
      `⚠️ <b>چت به دلیل دریافت گزارش تخلف بسته شد.</b>\n\n` +
        `لطفاً در گفتگوهای ناشناس همواره ادب و قوانین اخلاقی را رعایت نمایید. دریافت گزارش‌های متعدد منجر به مسدودسازی دائمی حساب کاربری خواهد شد.`,
      {
        inline_keyboard: [
          [{ text: '🔍 جستجوی مجدد', callback_data: 'action:find_match' }],
          [{ text: '👤 پروفایل من', callback_data: 'action:view_profile' }],
        ],
      }
    );

    if (autoBanned) {
      this.addBotMessage(
        partnerState,
        `⛔ <b>حساب کاربری شما مسدود گردید!</b>\n\n` +
          `به دلیل ثبت ۳ گزارش تخلف در ۲۴ ساعت گذشته، حساب شما به صورت خودکار توسط سیستم هوشمند ناوبری مسدود گردید.`
      );
    }

    // 6. Forward report notification to simulated admins
    const adminAlert =
      `🚨 <b>[گزارش جدید ثبت شد]</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 <b>شناسه:</b> #REP-${report.id}\n` +
      `👤 <b>شاکی:</b> <code>${user.internal_id}</code>\n` +
      `🎯 <b>متخلف:</b> <code>${partner.internal_id}</code>\n` +
      `📝 <b>دلیل:</b> ${report.reason}\n` +
      (autoBanned ? `⛔ <b>وضعیت:</b> بن خودکار فعال شد` : `⏳ <b>وضعیت:</b> در انتظار بررسی`) +
      `\n━━━━━━━━━━━━━━━━━━━━━\n` +
      `💬 <b>آخرین پیام‌ها:</b>\n<code>${chatSnippet.slice(0, 200)}</code>`;

    for (const adminId of ADMIN_TELEGRAM_IDS) {
      const adminState = this.getOrCreateState(adminId);
      this.addBotMessage(adminState, adminAlert, {
        inline_keyboard: [
          [{ text: '🔨 مسدودسازی متخلف', callback_data: `admin:ban:${report.id}:${partner.id}` }],
          [{ text: '❌ رد گزارش', callback_data: `admin:dismiss:${report.id}` }],
          [{ text: '🛡️ پنل ادمین', callback_data: 'admin:menu' }],
        ],
      });
    }

    return {
      messages: state.messages,
      alert: 'گزارش شما ثبت شد و چت قطع گردید.',
    };
  }

  private handleAdminCommand(state: SimUserState) {
    if (!isAdminUser(state.telegramId)) {
      this.addBotMessage(
        state,
        '⛔ <b>دسترسی غیرمجاز!</b>\n\n' +
          'این بخش صرفاً مختص مدیران تایید شده بات می‌باشد. شناسه تلگرام شما جزو لیست ادمین‌ها نیست.',
        {
          inline_keyboard: [
            [{ text: '🔍 شروع جستجو (/search)', callback_data: 'action:find_match' }],
            [{ text: '👤 پروفایل من', callback_data: 'action:view_profile' }],
          ],
        }
      );
      return { messages: state.messages, alert: 'Access denied: Admin only' };
    }

    const stats = inMemoryDb.getStats();
    const queueStats = redisService.getQueueStats();

    const welcome = [
      `🛡️ <b>پنل مدیریت و امنیت ربات چت ناشناس</b>`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `👤 <b>شناسه ادمین:</b> <code>${state.telegramId}</code>`,
      `⚡ <b>وضعیت سرور:</b> فعال و برخط (Operational)`,
      ``,
      `📊 <b>داشبورد آماری سریع:</b>`,
      `• کاربران کل: <b>${stats.totalUsers} نفر</b>`,
      `• کاربران در صف همسان‌گزینی: <b>${queueStats.queueSize} نفر</b>`,
      `• چت‌های فعال همزمان: <b>${stats.activeChats} گفتگو</b>`,
      `• کاربران مسدود (Banned): <b>${stats.bannedUsersCount} نفر</b>`,
      `• گزارش‌های در انتظار بررسی: <b>${stats.pendingReportsCount} مورد</b>`,
      `• کل سکه‌های در چرخش: <b>${stats.totalCoinsInCirculation} سکه</b>`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `عملیات مورد نظر خود را انتخاب کنید:`,
    ].join('\n');

    this.addBotMessage(state, welcome, {
      inline_keyboard: [
        [
          { text: '📊 آمار تفصیلی ربات', callback_data: 'admin:stats' },
          { text: `🛡️ بررسی گزارش‌ها (${stats.pendingReportsCount})`, callback_data: 'admin:reports' },
        ],
        [
          { text: '📢 ارسال پیام همگانی (Broadcast)', callback_data: 'admin:broadcast_prompt' },
          { text: '🔄 بروزرسانی داشبورد', callback_data: 'admin:menu' },
        ],
        [{ text: '🚪 خروج از پنل', callback_data: 'admin:exit' }],
      ],
    });

    return { messages: state.messages, alert: 'Admin Dashboard loaded' };
  }

  private handleAdminStats(state: SimUserState) {
    if (!isAdminUser(state.telegramId)) return { messages: state.messages };

    const stats = inMemoryDb.getStats();
    const queueStats = redisService.getQueueStats();
    const users = stats.users;
    const maleCount = users.filter((u) => u.gender === 'male').length;
    const femaleCount = users.filter((u) => u.gender === 'female').length;

    const statsMsg = [
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

    this.addBotMessage(state, statsMsg, {
      inline_keyboard: [
        [
          { text: '🛡️ مشاهده گزارش‌های باز', callback_data: 'admin:reports' },
          { text: '🔙 بازگشت به داشبورد', callback_data: 'admin:menu' },
        ],
      ],
    });

    return { messages: state.messages };
  }

  private handleAdminReports(state: SimUserState) {
    if (!isAdminUser(state.telegramId)) return { messages: state.messages };

    const pendingReports = inMemoryDb.getReports('pending');

    if (pendingReports.length === 0) {
      this.addBotMessage(
        state,
        `✅ <b>هیچ گزارش تخلف بازی وجود ندارد!</b>\n\nتمامی گزارش‌ها بررسی و تعیین تکلیف شده‌اند. سیستم در حالت امن قرار دارد.`,
        {
          inline_keyboard: [[{ text: '🔙 بازگشت به پنل ادمین', callback_data: 'admin:menu' }]],
        }
      );
      return { messages: state.messages, alert: 'No pending reports' };
    }

    const report = pendingReports[0];
    const reporter = inMemoryDb.getUserById(report.reporter_id);
    const reported = inMemoryDb.getUserById(report.reported_id);
    const user24hCount = inMemoryDb.getReportsCountForUser(report.reported_id, 24);

    const reportMsg = [
      `🛡️ <b>بررسی گزارش تخلف [1 از ${pendingReports.length}]</b>`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `📋 <b>شناسه گزارش:</b> <code>#REP-${report.id}</code>`,
      `⏱️ <b>زمان ثبت:</b> ${new Date(report.created_at).toLocaleTimeString()}`,
      `👤 <b>شاکی:</b> ${reporter?.name || 'Unknown'} (<code>${reporter?.internal_id}</code>)`,
      `🎯 <b>متهم:</b> ${reported?.name || 'Unknown'} (<code>${reported?.internal_id}</code>)`,
      `⚠️ <b>تخلفات ۲۴ ساعت اخیر کاربر:</b> ${user24hCount} مورد`,
      `📝 <b>دلیل:</b> ${report.reason}`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `💬 <b>آخرین پیام‌های رد و بدل شده:</b>\n<code>${report.chat_snippet || 'بدون پیام'}</code>`,
    ].join('\n');

    this.addBotMessage(state, reportMsg, {
      inline_keyboard: [
        [
          {
            text: `🔨 مسدودسازی کاربر (${reported?.internal_id || 'User'})`,
            callback_data: `admin:ban:${report.id}:${report.reported_id}`,
          },
          {
            text: `❌ رد گزارش (#REP-${report.id})`,
            callback_data: `admin:dismiss:${report.id}`,
          },
        ],
        [{ text: '🔙 بازگشت به منوی ادمین', callback_data: 'admin:menu' }],
      ],
    });

    return { messages: state.messages };
  }

  private handleAdminBanAction(state: SimUserState, reportId: number, targetUserId: number) {
    if (!isAdminUser(state.telegramId)) return { messages: state.messages };

    const targetUser = inMemoryDb.getUserById(targetUserId);
    inMemoryDb.resolveReport(reportId, 'ban', `Admin_${state.telegramId}`);

    // If target user is simulated, send them a ban notice
    if (targetUser) {
      const targetState = this.getOrCreateState(targetUser.telegram_id);
      this.addBotMessage(
        targetState,
        `⛔ <b>حساب کاربری شما توسط تیم نظارت و امنیت مسدود گردید.</b>\n\n` +
          `به دلیل تخلف و گزارش‌های واصله، دسترسی شما به ربات تا اطلاع ثانوی مسدود شد.`
      );
    }

    this.addBotMessage(
      state,
      `🔨 <b>کاربر <code>${targetUser?.internal_id || targetUserId}</code> با موفقیت مسدود شد و گزارش #REP-${reportId} بسته شد.</b>`
    );

    return this.handleAdminReports(state);
  }

  private handleAdminDismissAction(state: SimUserState, reportId: number) {
    if (!isAdminUser(state.telegramId)) return { messages: state.messages };

    inMemoryDb.resolveReport(reportId, 'dismiss', `Admin_${state.telegramId}`);
    this.addBotMessage(state, `❌ <b>گزارش #REP-${reportId} رد شد و پرونده مختومه گردید.</b>`);

    return this.handleAdminReports(state);
  }

  private handleAdminBroadcastMenu(state: SimUserState) {
    if (!isAdminUser(state.telegramId)) return { messages: state.messages };

    const text = [
      `📢 <b>سامانه ارسال پیام و بنر همگانی به تمام کاربران (Broadcast)</b>`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `⚡ <b>موتور ارسال امن:</b> فعال (دسته‌های ۲۵ تایی در ثانیه جهت رعایت سقف مجاز تلگرام)`,
      `🛡️ <b>مدیریت خطا:</b> کاربران مسدودکننده بدون توقف پردازش شمارش می‌شوند.`,
      ``,
      `نوع محتوای ارسالی را انتخاب فرمایید:`,
    ].join('\n');

    this.addBotMessage(state, text, {
      inline_keyboard: [
        [{ text: '🖼️ ارسال بنر تصویری با دکمه شیشه‌ای', callback_data: 'admin:broadcast_banner' }],
        [{ text: '📝 ارسال پیام متنی با فرمت HTML', callback_data: 'admin:broadcast_text' }],
        [{ text: '🔙 بازگشت به منوی ادمین', callback_data: 'admin:menu' }],
      ],
    });

    return { messages: state.messages, alert: 'منوی ارسال پیام همگانی باز شد' };
  }

  private handleAdminBannerBroadcast(state: SimUserState) {
    if (!isAdminUser(state.telegramId)) return { messages: state.messages };

    const bannerPhotoUrl =
      'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=800&auto=format&fit=crop&q=80';

    const bannerCaption = [
      `🎉 <b>اطلاعیه ویژه ربات چت و همسان‌گزینی ناشناس</b> 👋`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `✨ <b>امکانات و بروزرسانی‌های نسخه جدید:</b>`,
      `• 🛡️ <b>سیستم گزارش فوری تخلف:</b> چت ناسالم با زدن /report فوراً قطع و بررسی می‌شود.`,
      `• ⚡ <b>افزایش سرعت صف جستجو:</b> اتصال بدون معطلی به هم‌صحبت‌های واقعی در سراسر ایران.`,
      `• 🎁 <b>سکه روزانه و پاداش دعوت:</b> با دستور /daily هر روز سکه رایگان دریافت کن!`,
      ``,
      `برای شروع گفتگو یا مدیریت فیلترها دکمه زیر را لمس کنید:`,
    ].join('\n');

    const allUsers = inMemoryDb.getAllUsers();
    let successful = 0;
    let failed = 0;

    for (const u of allUsers) {
      try {
        if (u.status === 'banned') {
          failed++;
          continue;
        }
        const uState = this.getOrCreateState(u.telegram_id);
        this.addBotMessage(uState, bannerCaption, {
          inline_keyboard: [
            [{ text: '🔍 شروع گفتگو (/search)', callback_data: 'action:find_match' }],
            [{ text: '💰 کیف پول (/wallet)', callback_data: 'action:view_wallet' }],
          ],
        }, bannerPhotoUrl);
        successful++;
      } catch (err) {
        failed++;
      }
    }

    const reportMsg = [
      `✅ <b>ارسال بنر به پایان رسید.</b>`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `📊 <b>موفق:</b> ${successful} | <b>ناموفق (بلاک/دلیلیت):</b> ${failed}`,
      `👥 <b>کل کاربران هدف:</b> ${allUsers.length}`,
    ].join('\n');

    this.addBotMessage(state, reportMsg, {
      inline_keyboard: [
        [{ text: '📢 ارسال مجدد یا پیام متنی', callback_data: 'admin:broadcast_prompt' }],
        [{ text: '🔙 بازگشت به منوی ادمین', callback_data: 'admin:menu' }],
      ],
    });

    return {
      messages: state.messages,
      alert: `✅ ارسال بنر به پایان رسید. (موفق: ${successful} | ناموفق: ${failed})`,
    };
  }

  private handleAdminTextBroadcast(state: SimUserState) {
    if (!isAdminUser(state.telegramId)) return { messages: state.messages };

    const broadcastText =
      '📢 <b>اطلاعیه رسمی مدیریت ربات</b>\n━━━━━━━━━━━━━━━━━━━━━\nهمراهان گرامی، به منظور ارتقای سلامت محیط گفتگو، سامانه ناظر خودکار و ضداسپم فعال گردید. لطفاً همواره در گفتگوها ادب و احترام را رعایت فرمایید. با آرزوی لحظاتی خوش! ✨';

    const allUsers = inMemoryDb.getAllUsers();
    let successful = 0;
    let failed = 0;

    for (const u of allUsers) {
      try {
        if (u.status === 'banned') {
          failed++;
          continue;
        }
        const uState = this.getOrCreateState(u.telegram_id);
        this.addBotMessage(uState, broadcastText, {
          inline_keyboard: [
            [{ text: '🔍 شروع جستجو (/search)', callback_data: 'action:find_match' }],
            [{ text: '💰 کیف پول (/wallet)', callback_data: 'action:view_wallet' }],
          ],
        });
        successful++;
      } catch (err) {
        failed++;
      }
    }

    const reportMsg = [
      `✅ <b>ارسال بنر به پایان رسید.</b>`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `📊 <b>موفق:</b> ${successful} | <b>ناموفق (بلاک/دلیلیت):</b> ${failed}`,
      `👥 <b>کل کاربران هدف:</b> ${allUsers.length}`,
    ].join('\n');

    this.addBotMessage(state, reportMsg, {
      inline_keyboard: [
        [{ text: '📢 ارسال مجدد یا بنر تصویری', callback_data: 'admin:broadcast_prompt' }],
        [{ text: '🔙 بازگشت به منوی ادمین', callback_data: 'admin:menu' }],
      ],
    });

    return {
      messages: state.messages,
      alert: `✅ ارسال پیام به پایان رسید. (موفق: ${successful} | ناموفق: ${failed})`,
    };
  }

  private handleAdminBroadcast(state: SimUserState) {
    return this.handleAdminBroadcastMenu(state);
  }

  private finalizeRegistration(state: SimUserState) {
    const { name, gender, age, province, photoUrl, bio, referredByCode } = state.temp;
    if (!name || !gender || !age || !province) {
      this.addBotMessage(state, 'Registration error. Please /start again.');
      return { messages: state.messages };
    }

    const result = UserService.registerUser({
      telegramId: state.telegramId,
      name,
      gender,
      age,
      province,
      bio,
      profilePhotoFileId: photoUrl,
      referralCodeInput: referredByCode,
    });

    state.step = 'none';

    let celebration =
      `🎉 <b>Welcome, ${result.user.name}!</b>\n` +
      `Your anonymous profile is created. System handle: <code>${result.user.internal_id}</code>\n\n` +
      `🪙 You received <b>+10 coins</b> starting bonus!`;

    if (result.referrerAwarded) {
      celebration += `\n🎁 Plus <b>+5 coins</b> for joining through <b>${result.referrerName}</b>'s referral link!`;

      // Real-time notification to the inviter in the simulator!
      if (result.referrerTelegramId) {
        const inviterState = this.getOrCreateState(result.referrerTelegramId);
        this.addBotMessage(
          inviterState,
          `🎉 <b>پاداش دعوت جدید!</b>\n` +
            `کاربر <b>${result.user.name}</b> با لینک اختصاصی شما به ربات پیوست.\n` +
            `🪙 <b>۱۵+ سکه رایگان</b> به کیف پول شما اضافه شد!\n\n` +
            `<i>🎉 Someone joined using your referral link! You earned +15 coins.</i>`,
          {
            inline_keyboard: [
              [{ text: '💰 کیف پول (/balance)', callback_data: 'action:view_wallet' }],
              [{ text: '🔍 جستجوی هم‌صحبت (/search)', callback_data: 'action:find_match' }],
            ],
          }
        );
      }
    }

    this.addBotMessage(state, celebration);

    const card = UserService.formatProfileCard(result.user);
    this.addBotMessage(state, card, {
      inline_keyboard: [
        [{ text: '🔍 Find a Match (/search)', callback_data: 'action:find_match' }],
        [
          { text: '💰 Wallet & Coins', callback_data: 'action:view_wallet' },
          { text: '⚙️ Matching Filters', callback_data: 'action:view_preferences' },
        ],
        [
          { text: '✏️ Edit Profile', callback_data: 'action:edit_profile' },
          { text: '🎁 Invite Friends (+15)', callback_data: 'action:referral_info' },
        ],
      ],
    });

    return { messages: state.messages, alert: 'Onboarding completed successfully!' };
  }

  resetUser(telegramId: string) {
    this.userStates.delete(telegramId);
  }

  resetAll() {
    this.userStates.clear();
    inMemoryDb.resetAll();
    redisService.clearAll();
  }
}

export const simulatorService = new SimulatorService();

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
