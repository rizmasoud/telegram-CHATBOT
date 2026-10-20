import { inMemoryDb } from '../db';
import { User, MatchingPreferences, Gender, CoinTransaction } from '../types';

export class UserService {
  /**
   * Generates a unique, user-friendly internal handle e.g. "USER-8291"
   */
  static generateInternalId(): string {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    return `USER-${randomDigits}`;
  }

  /**
   * Generates a short, shareable referral code
   */
  static generateReferralCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'REF-';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Registers a newly onboarded user with referral attribution and coin rewards
   */
  static registerUser(payload: {
    telegramId: string;
    name: string;
    gender: Gender;
    age: number;
    province: string;
    bio?: string | null;
    profilePhotoFileId?: string | null;
    referralCodeInput?: string | null;
  }): {
    user: User;
    referrerAwarded: boolean;
    referrerName?: string;
    referrerTelegramId?: string;
    referrerId?: number;
  } {
    // Generate unique handles
    let internalId = this.generateInternalId();
    let referralCode = this.generateReferralCode();

    // Check referral code
    let referredByUserId: number | null = null;
    let referrerAwarded = false;
    let referrerName: string | undefined;
    let referrerTelegramId: string | undefined;

    if (payload.referralCodeInput) {
      const cleanRef = payload.referralCodeInput.trim().toUpperCase();
      const referrer = inMemoryDb.getUserByReferralCode(cleanRef);
      if (referrer && referrer.telegram_id !== payload.telegramId) {
        referredByUserId = referrer.id;
        referrerName = referrer.name;
        referrerTelegramId = referrer.telegram_id;

        // Atomically award inviter with 15 bonus coins & log transaction
        inMemoryDb.awardCoins(
          referrer.id,
          15,
          'referral_bonus',
          `Referral reward: User "${payload.name}" joined using your link (${cleanRef})`
        );
        referrerAwarded = true;
      }
    }

    // Starting coins: default 10 + 5 bonus if referred
    const initialCoins = referredByUserId ? 15 : 10;

    const user = inMemoryDb.createUser({
      telegramId: payload.telegramId,
      internalId,
      name: payload.name,
      gender: payload.gender,
      age: payload.age,
      province: payload.province,
      bio: payload.bio,
      profilePhotoFileId: payload.profilePhotoFileId,
      referralCode,
      referredBy: referredByUserId,
      initialCoins,
    });

    if (referredByUserId) {
      inMemoryDb.addTransaction({
        userId: user.id,
        amount: 5,
        type: 'referral_bonus',
        description: `Referral invitee bonus via ${referrerName}`,
      });
    }

    return {
      user,
      referrerAwarded,
      referrerName,
      referrerTelegramId,
      referrerId: referredByUserId || undefined,
    };
  }

  /**
   * Safely updates user profile fields.
   * STRICT ENFORCEMENT: Gender cannot be modified once set!
   */
  static updateProfile(
    userId: number,
    data: {
      name?: string;
      age?: number;
      province?: string;
      bio?: string | null;
      profilePhotoFileId?: string | null;
      gender?: any; // Marked to prevent edits
    }
  ): User {
    if (data.gender !== undefined) {
      throw new Error('IMMUTABLE_FIELD: User gender is strictly immutable once set during onboarding.');
    }

    return inMemoryDb.updateUserProfile(userId, {
      name: data.name,
      age: data.age,
      province: data.province,
      bio: data.bio,
      profile_photo_file_id: data.profilePhotoFileId,
    });
  }

  /**
   * Formats the user's Profile Card for Telegram
   */
  static formatProfileCard(user: User, botUsername = 'MatchmakingBot'): string {
    const genderEmoji = user.gender === 'male' ? '👨 Male' : '👩 Female';
    const statusEmoji =
      user.status === 'in_chat'
        ? '🟢 In Active Chat'
        : user.status === 'searching'
        ? '⏳ Searching for Match'
        : '💤 Idle / Ready';

    const referralLink = `https://t.me/${botUsername}?start=ref_${user.referral_code}`;

    return [
      `🌟 <b>MY PROFILE CARD</b>`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `👤 <b>Name:</b> ${escapeHtml(user.name)}`,
      `🆔 <b>Handle:</b> <code>${user.internal_id}</code>`,
      `⚧ <b>Gender:</b> ${genderEmoji} <i>(Fixed)</i>`,
      `🎂 <b>Age:</b> ${user.age} yrs`,
      `📍 <b>Province:</b> ${escapeHtml(user.province)}`,
      `🪙 <b>Coins:</b> ${user.coins} 🪙`,
      `📊 <b>Status:</b> ${statusEmoji}`,
      user.bio ? `\n📝 <b>Bio:</b>\n<i>"${escapeHtml(user.bio)}"</i>\n` : `\n📝 <b>Bio:</b> <i>(No bio set)</i>\n`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `🎁 <b>Your Referral Link:</b>`,
      `<code>${referralLink}</code>`,
      `<i>(Earn +15 coins for every friend who joins!)</i>`,
    ].join('\n');
  }

  /**
   * Formats matching preferences overview
   */
  static formatPreferencesCard(pref: MatchingPreferences): string {
    const targetGenderLabel =
      pref.target_gender === 'male' ? '👨 Males only' : pref.target_gender === 'female' ? '👩 Females only' : '🌈 Anyone';

    const provLabel =
      pref.target_province === 'same_province'
        ? '📍 Same Province only'
        : pref.target_province === 'any_province'
        ? '🌍 Any Province'
        : `📍 ${pref.target_province}`;

    return [
      `⚙️ <b>MATCHING PREFERENCES</b>`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `🚻 <b>Looking For:</b> ${targetGenderLabel}`,
      `🎯 <b>Age Range:</b> ${pref.target_age_min} to ${pref.target_age_max} years`,
      `🗺️ <b>Location Filter:</b> ${provLabel}`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `<i>You will only be paired with users who also match your mutual filters.</i>`,
    ].join('\n');
  }

  /**
   * Formats Wallet & Balance Overview Card (/balance, /wallet)
   */
  static formatWalletCard(user: User, botUsername = 'MatchmakingBot'): string {
    const referralsCount = inMemoryDb.getReferralsCount(user.id);
    const txs = inMemoryDb.getTransactions(user.id);
    const recentTxs = txs.slice(-4).reverse();
    const referralLink = `https://t.me/${botUsername}?start=ref_${user.referral_code}`;

    const txRows =
      recentTxs.length > 0
        ? recentTxs
            .map((tx) => {
              const sign = tx.amount > 0 ? '+' : '';
              const icon = tx.amount > 0 ? '🟢' : '🔴';
              return `${icon} <b>${sign}${tx.amount} 🪙</b> - <i>${escapeHtml(tx.description || tx.type)}</i>`;
            })
            .join('\n')
        : '<i>No recent transactions recorded.</i>';

    return [
      `💰 <b>MY WALLET & COIN BALANCE</b>`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `🪙 <b>Current Balance:</b> <b>${user.coins} Coins</b>`,
      `👥 <b>Friends Invited:</b> <b>${referralsCount} users</b>`,
      `🎁 <b>Earned From Invites:</b> <b>+${referralsCount * 15} Coins</b>`,
      ``,
      `📜 <b>Recent Ledger Activity:</b>`,
      txRows,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `🔗 <b>Exclusive Referral Link:</b>`,
      `<code>${referralLink}</code>`,
      ``,
      `💡 <b>How Coins Work:</b>`,
      `• Match search fee: <b>1 coin</b> per search`,
      `• Refer a friend: <b>+15 coins</b> for you, <b>+5 coins</b> for your friend!`,
    ].join('\n');
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
