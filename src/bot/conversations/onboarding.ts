import { InlineKeyboard } from 'grammy';
import { MyConversation, MyContext } from '../context';
import { getProvinceKeyboard } from '../constants/provinces';
import { UserService } from '../../services/userService';
import { Gender } from '../../types';

/**
 * Step-by-step Onboarding Conversation Wizard using @grammyjs/conversations
 */
export async function onboardingConversation(conversation: MyConversation, ctx: MyContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const referralPayload = ctx.session.tempOnboarding?.referredByCode;

  const introMessage = [
    `سلام! به ربات گفتگو و هم‌رسانی ناشناس خوش آمدید 👋`,
    ``,
    `🔹 <b>چطور کار می‌کند؟</b>`,
    `۱. <b>تکمیل پروفایل:</b> مشخصات خودت (سن، استان، بیو و عکس) را وارد کن.`,
    `۲. <b>تنظیم فیلترها:</b> با دستور /filters مشخص کن دوست داری با چه سنی، جنسیتی یا از چه استانی گفتگو کنی.`,
    `۳. <b>جستجو:</b> با زدن /search وارد صف جستجو شو تا سیستم تو را به فرد مناسب وصل کند.`,
    `۴. <b>شناسه داخلی:</b> به هر کاربر یک شناسه یکتا تعلق می‌گیرد تا بتوانی بدون افشای هویت، مستقیم به دیگران پیام بدی (/find_id).`,
    `۵. <b>سکه و جوایز:</b> برای جستجوی پیشرفته و ارسال پیام مستقیم به سکه نیاز داری. هر روز با دستور /daily جایزه روزانه بگیر یا در /wallet سکه دریافت کن!`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `👋 <b>Hello! Welcome to the Anonymous Match & Chat Bot</b>`,
    `<i>Your real identity remains confidential. Let's set up your profile in 6 quick steps.</i>`,
    ``,
    `<b>گام ۱ از ۶ / Step 1/6:</b> نام یا نام مستعار شما چیست؟\n<i>(What is your name or preferred nickname?)</i>`,
  ].join('\n');

  await ctx.reply(introMessage, { parse_mode: 'HTML' });

  // ----------------------------------------------------
  // STEP 1: Name
  // ----------------------------------------------------
  let userName = '';
  while (true) {
    const nameCtx = await conversation.waitFor('message:text');
    const text = nameCtx.message?.text?.trim() || '';

    if (text.length >= 2 && text.length <= 50) {
      userName = text;
      break;
    } else {
      await nameCtx.reply(
        '⚠️ Please enter a valid name or nickname between 2 and 50 characters:'
      );
    }
  }

  // ----------------------------------------------------
  // STEP 2: Gender (Strict Immutable Warning)
  // ----------------------------------------------------
  const genderKeyboard = new InlineKeyboard()
    .text('👨 Male', 'gender:male')
    .text('👩 Female', 'gender:female');

  await ctx.reply(
    `<b>Step 2/6:</b> Select your gender:\n\n` +
      `⚠️ <b>CRITICAL WARNING:</b>\n` +
      `<b>Your gender CANNOT be changed later!</b> Once set, it is permanently locked to prevent unfair matchmaking exploitation.\n\n` +
      `Please select honestly:`,
    {
      parse_mode: 'HTML',
      reply_markup: genderKeyboard,
    }
  );

  let chosenGender: Gender = 'male';
  while (true) {
    const genderCtx = await conversation.waitFor('callback_query:data');
    const data = genderCtx.callbackQuery?.data;

    if (data === 'gender:male') {
      chosenGender = 'male';
      await genderCtx.answerCallbackQuery({ text: 'Gender selected: Male' });
      break;
    } else if (data === 'gender:female') {
      chosenGender = 'female';
      await genderCtx.answerCallbackQuery({ text: 'Gender selected: Female' });
      break;
    } else {
      await genderCtx.answerCallbackQuery({ text: 'Please use the buttons above' });
    }
  }

  // ----------------------------------------------------
  // STEP 3: Age (18 to 99 validation)
  // ----------------------------------------------------
  await ctx.reply(
    `<b>Step 3/6:</b> How old are you?\n\n` +
      `<i>(Must be between 18 and 99 years old)</i>`,
    { parse_mode: 'HTML' }
  );

  let userAge = 18;
  while (true) {
    const ageCtx = await conversation.waitFor('message:text');
    const inputAge = parseInt(ageCtx.message?.text?.trim() || '', 10);

    if (!isNaN(inputAge) && inputAge >= 18 && inputAge <= 99) {
      userAge = inputAge;
      break;
    } else {
      await ageCtx.reply(
        '⚠️ Invalid age! You must be at least 18 and at most 99 years old to use this matchmaking platform. Please enter your age:'
      );
    }
  }

  // ----------------------------------------------------
  // STEP 4: Province from Iranian Provinces Inline Keyboard
  // ----------------------------------------------------
  let currentPage = 0;
  const initialKeyboard = getProvinceKeyboard(currentPage);

  await ctx.reply(
    `<b>Step 4/6:</b> Which province are you from?\n\n` +
      `<i>Select your province from the list below:</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: initialKeyboard },
    }
  );

  let chosenProvince = 'Tehran';
  while (true) {
    const provCtx = await conversation.waitFor('callback_query:data');
    const data = provCtx.callbackQuery?.data || '';

    if (data.startsWith('prov_select:')) {
      chosenProvince = data.replace('prov_select:', '');
      await provCtx.answerCallbackQuery({ text: `Province: ${chosenProvince}` });
      break;
    } else if (data.startsWith('prov_page:')) {
      const pageStr = data.replace('prov_page:', '');
      if (pageStr !== 'noop') {
        currentPage = parseInt(pageStr, 10);
        await provCtx.editMessageReplyMarkup({
          reply_markup: { inline_keyboard: getProvinceKeyboard(currentPage) },
        });
      }
      await provCtx.answerCallbackQuery();
    }
  }

  // ----------------------------------------------------
  // STEP 5: Profile Photo
  // ----------------------------------------------------
  const photoSkipKeyboard = new InlineKeyboard().text('⏭️ Skip Photo', 'photo:skip');

  await ctx.reply(
    `<b>Step 5/6:</b> Upload a profile photo 📸\n\n` +
      `<i>Send a photo right now, or click skip if you want to add it later:</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: photoSkipKeyboard,
    }
  );

  let profilePhotoFileId: string | null = null;
  while (true) {
    const nextUpdate = await conversation.waitFor(['message:photo', 'callback_query:data']);

    if (nextUpdate.callbackQuery?.data === 'photo:skip') {
      await nextUpdate.answerCallbackQuery({ text: 'Photo skipped' });
      break;
    } else if (nextUpdate.message?.photo && nextUpdate.message.photo.length > 0) {
      // Pick highest resolution photo
      const photos = nextUpdate.message.photo;
      profilePhotoFileId = photos[photos.length - 1].file_id;
      await nextUpdate.reply('✅ Photo saved successfully!');
      break;
    } else {
      await ctx.reply('Please send a valid photo or click "Skip Photo".');
    }
  }

  // ----------------------------------------------------
  // STEP 6: Bio
  // ----------------------------------------------------
  const bioSkipKeyboard = new InlineKeyboard().text('⏭️ Skip Bio', 'bio:skip');

  await ctx.reply(
    `<b>Step 6/6:</b> Write a short bio about yourself ✍️\n\n` +
      `<i>Tell your potential matches what hobbies, music, or topics you love (max 200 characters), or click skip:</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: bioSkipKeyboard,
    }
  );

  let userBio: string | null = null;
  while (true) {
    const bioUpdate = await conversation.waitFor(['message:text', 'callback_query:data']);

    if (bioUpdate.callbackQuery?.data === 'bio:skip') {
      await bioUpdate.answerCallbackQuery({ text: 'Bio skipped' });
      break;
    } else if (bioUpdate.message?.text) {
      const bioText = bioUpdate.message.text.trim();
      if (bioText.length > 250) {
        await bioUpdate.reply('⚠️ Bio is too long! Keep it under 250 characters:');
      } else {
        userBio = bioText;
        break;
      }
    }
  }

  // ----------------------------------------------------
  // REGISTRATION & REWARDS FINALIZATION
  // ----------------------------------------------------
  const registrationResult = UserService.registerUser({
    telegramId,
    name: userName,
    gender: chosenGender,
    age: userAge,
    province: chosenProvince,
    bio: userBio,
    profilePhotoFileId,
    referralCodeInput: referralPayload,
  });

  const createdUser = registrationResult.user;

  // Clear onboarding session
  ctx.session.tempOnboarding = undefined;
  ctx.session.onboardingStep = 'completed';

  let welcomeRewardMessage = `🎉 <b>Registration Complete!</b>\n` +
    `You have received <b>+10 starting coins 🪙</b>.`;

  if (registrationResult.referrerAwarded) {
    welcomeRewardMessage += `\n🎁 You also received an extra <b>+5 bonus coins</b> for joining with a friend's referral link!`;

    // Notify the inviter!
    if (registrationResult.referrerTelegramId) {
      try {
        await ctx.api.sendMessage(
          registrationResult.referrerTelegramId,
          `🎉 <b>پاداش دعوت جدید!</b>\n` +
            `کاربر <b>${createdUser.name}</b> با لینک اختصاصی شما به ربات پیوست.\n` +
            `🪙 <b>۱۵+ سکه رایگان</b> به کیف پول شما اضافه شد!\n\n` +
            `<i>🎉 Someone joined using your referral link! You earned +15 coins.</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .text('💰 کیف پول (/balance)', 'action:view_wallet')
              .text('🔍 جستجو (/search)', 'action:find_match'),
          }
        );
      } catch (err) {
        console.warn('[Referral Notify] Could not deliver notification to inviter:', err);
      }
    }
  }

  await ctx.reply(welcomeRewardMessage, { parse_mode: 'HTML' });

  // Display Profile Card with Navigation Buttons
  const profileCardText = UserService.formatProfileCard(createdUser);

  const profileActionKeyboard = new InlineKeyboard()
    .text('🔍 Find a Match', 'action:find_match')
    .row()
    .text('💰 Wallet & Coins', 'action:view_wallet')
    .text('⚙️ Matching Filters', 'action:view_preferences')
    .row()
    .text('✏️ Edit Profile', 'action:edit_profile')
    .text('🎁 Invite Friends (+15)', 'action:referral_info');

  await ctx.reply(profileCardText, {
    parse_mode: 'HTML',
    reply_markup: profileActionKeyboard,
  });
}
