import { InlineKeyboard } from 'grammy';
import { BotContext } from '../context';
import { inMemoryDb } from '../../db';
import { UserService } from '../../services/userService';
import { getProvinceKeyboard } from '../constants/provinces';
import { TargetGender } from '../../types';

/**
 * Builds the comprehensive inline keyboard for filter customization
 */
export function buildFilterKeyboard(pref: {
  target_gender: TargetGender;
  target_age_min: number;
  target_age_max: number;
  target_province: string;
}): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // Row 1: Target Gender Selection
  const g = pref.target_gender;
  keyboard
    .text(g === 'male' ? '✓ 👨 Male' : '👨 Male', 'filter:gender:male')
    .text(g === 'female' ? '✓ 👩 Female' : '👩 Female', 'filter:gender:female')
    .text(g === 'any' ? '✓ 🌈 Any' : '🌈 Any', 'filter:gender:any')
    .row();

  // Row 2: Age Range Presets
  keyboard
    .text('18-25', 'filter:preset:18-25')
    .text('20-30', 'filter:preset:20-30')
    .text('25-35', 'filter:preset:25-35')
    .text('18-99 (All)', 'filter:preset:18-99')
    .row();

  // Row 3: Age Range Fine Adjustment
  keyboard
    .text(`Min: ${pref.target_age_min} ➖`, 'filter:adj:min:dec')
    .text(`Min ➕`, 'filter:adj:min:inc')
    .text(`Max: ${pref.target_age_max} ➖`, 'filter:adj:max:dec')
    .text(`Max ➕`, 'filter:adj:max:inc')
    .row();

  // Row 4: Province Rules
  const p = pref.target_province;
  const isSame = p === 'same_province';
  const isAny = p === 'any_province';
  const isSpecific = !isSame && !isAny;

  keyboard
    .text(isSame ? '✓ 📍 Same Prov' : '📍 Same Prov', 'filter:prov:same')
    .text(isAny ? '✓ 🌍 Any Prov' : '🌍 Any Prov', 'filter:prov:any')
    .text(isSpecific ? `✓ 🗺️ ${p}` : '🗺️ Specific', 'filter:prov:pick')
    .row();

  // Row 5: Action Navigation
  keyboard
    .text('🔍 Find Match Now', 'action:find_match')
    .text('👤 Profile', 'action:view_profile');

  return keyboard;
}

/**
 * Handles `/filters` command
 */
export async function handleFiltersCommand(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const user = inMemoryDb.getUserByTelegramId(telegramId);

  if (!user) {
    await ctx.reply('Please register with /start before customizing matching filters.');
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
  const keyboard = buildFilterKeyboard(pref);

  await ctx.reply(card, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

/**
 * Filter callback dispatcher
 */
export async function handleFilterCallback(ctx: BotContext) {
  const telegramId = ctx.from?.id?.toString() || '';
  const user = inMemoryDb.getUserByTelegramId(telegramId);
  const data = ctx.callbackQuery?.data || '';

  if (!user) {
    await ctx.answerCallbackQuery({ text: 'User not registered' });
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

  // 1. Gender toggle
  if (data.startsWith('filter:gender:')) {
    const targetGender = data.replace('filter:gender:', '') as TargetGender;
    pref = inMemoryDb.updatePreferences(user.id, { target_gender: targetGender });
    await ctx.answerCallbackQuery({ text: `Looking for: ${targetGender.toUpperCase()}` });
  }

  // 2. Age Presets
  else if (data.startsWith('filter:preset:')) {
    const [minStr, maxStr] = data.replace('filter:preset:', '').split('-');
    const min = parseInt(minStr, 10);
    const max = parseInt(maxStr, 10);
    pref = inMemoryDb.updatePreferences(user.id, {
      target_age_min: min,
      target_age_max: max,
    });
    await ctx.answerCallbackQuery({ text: `Age range: ${min} to ${max}` });
  }

  // 3. Age Adjustments
  else if (data.startsWith('filter:adj:')) {
    const [, , field, op] = data.split(':');
    let newMin = pref.target_age_min;
    let newMax = pref.target_age_max;

    if (field === 'min') {
      newMin = op === 'inc' ? Math.min(newMin + 1, newMax) : Math.max(18, newMin - 1);
    } else if (field === 'max') {
      newMax = op === 'inc' ? Math.min(99, newMax + 1) : Math.max(newMin, newMax - 1);
    }

    pref = inMemoryDb.updatePreferences(user.id, {
      target_age_min: newMin,
      target_age_max: newMax,
    });
    await ctx.answerCallbackQuery({ text: `Age: ${newMin} - ${newMax}` });
  }

  // 4. Province Mode
  else if (data === 'filter:prov:same') {
    pref = inMemoryDb.updatePreferences(user.id, { target_province: 'same_province' });
    await ctx.answerCallbackQuery({ text: 'Location: Same Province Only' });
  } else if (data === 'filter:prov:any') {
    pref = inMemoryDb.updatePreferences(user.id, { target_province: 'any_province' });
    await ctx.answerCallbackQuery({ text: 'Location: Any Province' });
  } else if (data === 'filter:prov:pick') {
    // Show province selection keyboard
    const provKeyboard = getProvinceKeyboard(0).map((row) =>
      row.map((btn) => ({
        text: btn.text,
        callback_data: `filter:set_prov:${btn.callback_data.replace('prov_select:', '')}`,
      }))
    );

    await ctx.editMessageText(
      `🗺️ <b>Select Specific Iranian Province:</b>\n\nChoose the province you want to match with:`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: provKeyboard },
      }
    );
    await ctx.answerCallbackQuery();
    return;
  } else if (data.startsWith('filter:set_prov:')) {
    const specificProv = data.replace('filter:set_prov:', '');
    pref = inMemoryDb.updatePreferences(user.id, { target_province: specificProv });
    await ctx.answerCallbackQuery({ text: `Filter set to: ${specificProv}` });
  }

  // Update card message
  const card = UserService.formatPreferencesCard(pref);
  const keyboard = buildFilterKeyboard(pref);

  try {
    await ctx.editMessageText(card, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (e) {
    // Content unchanged
  }
}
