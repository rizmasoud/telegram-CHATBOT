import mongoose, { Schema, Model } from 'mongoose';
import {
  Gender,
  TargetGender,
  UserStatus,
  ReportStatus,
} from '../types';

// ---------------------------------------------------------------------------
// 1. User Collection Schema (Immutable Gender Enforced at Schema Level)
// ---------------------------------------------------------------------------
export interface IUserDoc {
  id: number;
  telegram_id: string;
  internal_id: string;
  name: string;
  gender: Gender;
  age: number;
  province: string;
  bio: string | null;
  profile_photo_file_id: string | null;
  coins: number;
  referral_code: string;
  referred_by: number | null;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
}

const userSchema = new Schema<IUserDoc>(
  {
    id: { type: Number, required: true, unique: true, index: true },
    telegram_id: { type: String, required: true, unique: true, index: true },
    internal_id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 128 },
    gender: {
      type: String,
      enum: ['male', 'female'],
      required: true,
      immutable: true, // Strictly immutable after initial creation
    },
    age: { type: Number, required: true, min: 18, max: 99 },
    province: { type: String, required: true, index: true },
    bio: { type: String, default: null },
    profile_photo_file_id: { type: String, default: null },
    coins: { type: Number, required: true, default: 10 },
    referral_code: { type: String, required: true, unique: true, index: true },
    referred_by: { type: Number, default: null, index: true },
    status: {
      type: String,
      enum: ['registering', 'idle', 'searching', 'in_chat', 'banned'],
      default: 'registering',
      required: true,
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  {
    collection: 'users',
    id: false,
    versionKey: false,
  }
);

userSchema.index({ status: 1, gender: 1 });

// ---------------------------------------------------------------------------
// 2. Matching Preferences Collection Schema (1-to-1 with User)
// ---------------------------------------------------------------------------
export interface IMatchingPreferenceDoc {
  id: number;
  user_id: number;
  target_gender: TargetGender;
  target_age_min: number;
  target_age_max: number;
  target_province: string;
  updated_at: Date;
}

const matchingPreferenceSchema = new Schema<IMatchingPreferenceDoc>(
  {
    id: { type: Number, required: true, unique: true },
    user_id: { type: Number, required: true, unique: true, index: true },
    target_gender: {
      type: String,
      enum: ['male', 'female', 'any'],
      default: 'any',
      required: true,
    },
    target_age_min: { type: Number, default: 18, required: true },
    target_age_max: { type: Number, default: 99, required: true },
    target_province: { type: String, default: 'any_province', required: true },
    updated_at: { type: Date, default: Date.now },
  },
  {
    collection: 'matching_preferences',
    id: false,
    versionKey: false,
  }
);

matchingPreferenceSchema.index({ target_gender: 1, target_age_min: 1, target_age_max: 1 });

// ---------------------------------------------------------------------------
// 3. Chat Sessions Collection Schema
// ---------------------------------------------------------------------------
export interface IChatSessionDoc {
  id: string;
  user1_id: number;
  user2_id: number;
  status: 'active' | 'ended';
  started_at: Date;
  ended_at: Date | null;
}

const chatSessionSchema = new Schema<IChatSessionDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    user1_id: { type: Number, required: true, index: true },
    user2_id: { type: Number, required: true, index: true },
    status: {
      type: String,
      enum: ['active', 'ended'],
      default: 'active',
      required: true,
      index: true,
    },
    started_at: { type: Date, default: Date.now },
    ended_at: { type: Date, default: null },
  },
  {
    collection: 'chat_sessions',
    id: false,
    versionKey: false,
  }
);

// ---------------------------------------------------------------------------
// 4. Reports Collection Schema (Moderation & Auto-Ban Auditing)
// ---------------------------------------------------------------------------
export interface IReportDoc {
  id: number;
  reporter_id: number;
  reported_id: number;
  reason: string | null;
  chat_snippet: string | null;
  status: ReportStatus;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
}

const reportSchema = new Schema<IReportDoc>(
  {
    id: { type: Number, required: true, unique: true },
    reporter_id: { type: Number, required: true, index: true },
    reported_id: { type: Number, required: true, index: true },
    reason: { type: String, default: null },
    chat_snippet: { type: String, default: null },
    status: {
      type: String,
      enum: ['pending', 'resolved_banned', 'dismissed'],
      default: 'pending',
      required: true,
      index: true,
    },
    resolved_by: { type: String, default: null },
    resolved_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now },
  },
  {
    collection: 'reports',
    id: false,
    versionKey: false,
  }
);

reportSchema.index({ reported_id: 1, created_at: -1 });

// ---------------------------------------------------------------------------
// 5. Coin Transactions Collection Schema (Wallet & Referral Ledger)
// ---------------------------------------------------------------------------
export interface ICoinTransactionDoc {
  id: number;
  user_id: number;
  amount: number;
  type: 'welcome_bonus' | 'referral_bonus' | 'match_search' | 'admin_gift' | 'profile_boost';
  description: string;
  created_at: Date;
}

const coinTransactionSchema = new Schema<ICoinTransactionDoc>(
  {
    id: { type: Number, required: true, unique: true },
    user_id: { type: Number, required: true, index: true },
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: ['welcome_bonus', 'referral_bonus', 'match_search', 'admin_gift', 'profile_boost'],
      required: true,
    },
    description: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
  },
  {
    collection: 'coin_transactions',
    id: false,
    versionKey: false,
  }
);

export const UserModel: Model<IUserDoc> =
  (mongoose.models.User as Model<IUserDoc>) || mongoose.model<IUserDoc>('User', userSchema);

export const MatchingPreferenceModel: Model<IMatchingPreferenceDoc> =
  (mongoose.models.MatchingPreference as Model<IMatchingPreferenceDoc>) ||
  mongoose.model<IMatchingPreferenceDoc>('MatchingPreference', matchingPreferenceSchema);

export const ChatSessionModel: Model<IChatSessionDoc> =
  (mongoose.models.ChatSession as Model<IChatSessionDoc>) ||
  mongoose.model<IChatSessionDoc>('ChatSession', chatSessionSchema);

export const ReportModel: Model<IReportDoc> =
  (mongoose.models.Report as Model<IReportDoc>) ||
  mongoose.model<IReportDoc>('Report', reportSchema);

export const CoinTransactionModel: Model<ICoinTransactionDoc> =
  (mongoose.models.CoinTransaction as Model<ICoinTransactionDoc>) ||
  mongoose.model<ICoinTransactionDoc>('CoinTransaction', coinTransactionSchema);
