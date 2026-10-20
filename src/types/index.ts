/**
 * Domain Types for Telegram Matchmaking Bot
 */

export type Gender = 'male' | 'female';
export type TargetGender = 'male' | 'female' | 'any';
export type TargetProvince = 'same_province' | 'any_province' | string;
export type UserStatus = 'registering' | 'idle' | 'searching' | 'in_chat' | 'banned';

export interface IranianProvinceInfo {
  id: string;
  nameEn: string;
  nameFa: string;
}

export interface User {
  id: number;
  telegram_id: string; // BigInt serialized as string for precision safety
  internal_id: string; // Unique handle e.g. "USER-8291"
  name: string;
  gender: Gender;
  age: number;
  province: string;
  bio?: string | null;
  profile_photo_file_id?: string | null;
  coins: number;
  referral_code: string;
  referred_by?: number | null; // User ID of inviter
  status: UserStatus;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface MatchingPreferences {
  id: number;
  user_id: number;
  target_gender: TargetGender;
  target_age_min: number;
  target_age_max: number;
  target_province: TargetProvince;
  updated_at: string | Date;
}

export interface ActiveChatSession {
  id: string;
  user1_id: number;
  user2_id: number;
  status: 'active' | 'ended';
  started_at: string | Date;
  ended_at?: string | Date | null;
}

export interface CoinTransaction {
  id: number;
  user_id: number;
  amount: number;
  type: 'welcome_bonus' | 'referral_bonus' | 'match_search' | 'admin_gift' | 'profile_boost';
  description?: string | null;
  created_at: string | Date;
}

export type ReportStatus = 'pending' | 'resolved_banned' | 'dismissed';

export interface UserReport {
  id: number;
  reporter_id: number;
  reported_id: number;
  reason?: string | null;
  chat_snippet?: string | null;
  status: ReportStatus;
  created_at: string | Date;
  resolved_at?: string | Date | null;
  resolved_by?: string | null;
}

export interface SessionData {
  onboardingStep?: 'name' | 'gender' | 'age' | 'province' | 'photo' | 'bio' | 'completed';
  tempOnboarding?: {
    name?: string;
    gender?: Gender;
    age?: number;
    province?: string;
    photoFileId?: string;
    bio?: string;
    referredByCode?: string;
  };
  editingField?: 'name' | 'age' | 'province' | 'bio' | 'photo' | null;
  activeChatPartnerId?: number | null;
  adminActionStep?: 'broadcast' | null;
}

export interface BotInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface BotMessagePayload {
  id: string;
  from: 'bot' | 'user';
  text: string;
  photoUrl?: string;
  replyMarkup?: {
    inline_keyboard?: BotInlineButton[][];
  };
  timestamp: string;
}

export const ADMIN_TELEGRAM_IDS: string[] = (
  process.env.ADMIN_TELEGRAM_IDS || '100000001,999999999'
)
  .split(',')
  .map((s) => s.trim());

