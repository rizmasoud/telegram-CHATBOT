import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  bigint,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const genderEnum = pgEnum('gender', ['male', 'female']);
export const targetGenderEnum = pgEnum('target_gender', ['male', 'female', 'any']);
export const userStatusEnum = pgEnum('user_status', [
  'registering',
  'idle',
  'searching',
  'in_chat',
  'banned',
]);
export const chatSessionStatusEnum = pgEnum('chat_session_status', ['active', 'ended']);
export const reportStatusEnum = pgEnum('report_status', [
  'pending',
  'resolved_banned',
  'dismissed',
]);
export const coinTxTypeEnum = pgEnum('coin_tx_type', [
  'welcome_bonus',
  'referral_bonus',
  'match_search',
  'admin_gift',
  'profile_boost',
]);

/**
 * Core User Profile Table
 */
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    // Telegram ID: Stored as BigInt or indexed string for 64-bit integer safety
    telegramId: varchar('telegram_id', { length: 32 }).notNull().unique(),
    // Unique system-generated handle, e.g. "USER-8291"
    internalId: varchar('internal_id', { length: 32 }).notNull().unique(),
    name: varchar('name', { length: 128 }).notNull(),
    // Gender: Immutable once set during onboarding
    gender: genderEnum('gender').notNull(),
    age: integer('age').notNull(),
    // Iranian Province
    province: varchar('province', { length: 64 }).notNull(),
    bio: text('bio'),
    profilePhotoFileId: text('profile_photo_file_id'),
    // Default starting bonus = 10 coins
    coins: integer('coins').default(10).notNull(),
    // Unique referral code generated upon creation
    referralCode: varchar('referral_code', { length: 32 }).notNull().unique(),
    // Inviter's User ID (Self-referencing Foreign Key, nullable)
    referredBy: integer('referred_by').references((): any => users.id, {
      onDelete: 'set null',
    }),
    // User current status
    status: userStatusEnum('status').default('registering').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_users_telegram_id').on(table.telegramId),
    uniqueIndex('idx_users_internal_id').on(table.internalId),
    uniqueIndex('idx_users_referral_code').on(table.referralCode),
    index('idx_users_status_gender').on(table.status, table.gender),
    index('idx_users_province').on(table.province),
  ]
);

/**
 * Matching Preferences Table (1-to-1 relationship with Users)
 */
export const matchingPreferences = pgTable(
  'matching_preferences',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetGender: targetGenderEnum('target_gender').default('any').notNull(),
    targetAgeMin: integer('target_age_min').default(18).notNull(),
    targetAgeMax: integer('target_age_max').default(99).notNull(),
    // 'same_province', 'any_province', or specific province string
    targetProvince: varchar('target_province', { length: 64 })
      .default('any_province')
      .notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_matching_pref_target').on(
      table.targetGender,
      table.targetAgeMin,
      table.targetAgeMax
    ),
  ]
);

/**
 * Active & Past Anonymous Match Chat Sessions
 */
export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    user1Id: integer('user1_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    user2Id: integer('user2_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: chatSessionStatusEnum('status').default('active').notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    endedAt: timestamp('ended_at'),
  },
  (table) => [
    index('idx_chat_sessions_users').on(table.user1Id, table.user2Id),
    index('idx_chat_sessions_status').on(table.status),
  ]
);

/**
 * Coin & Referral Transactions Ledger
 */
export const coinTransactions = pgTable(
  'coin_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    type: coinTxTypeEnum('type').notNull(),
    description: text('description').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_coin_tx_user_id').on(table.userId)]
);

/**
 * Moderation Reports Table
 */
export const reports = pgTable(
  'reports',
  {
    id: serial('id').primaryKey(),
    reporterId: integer('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reportedId: integer('reported_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason'),
    status: reportStatusEnum('status').default('pending').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_reports_reporter_id').on(table.reporterId),
    index('idx_reports_reported_id').on(table.reportedId),
    index('idx_reports_status').on(table.status),
  ]
);

/**
 * Drizzle ORM Relations
 */
export const usersRelations = relations(users, ({ one, many }) => ({
  preferences: one(matchingPreferences, {
    fields: [users.id],
    references: [matchingPreferences.userId],
  }),
  inviter: one(users, {
    fields: [users.referredBy],
    references: [users.id],
    relationName: 'userReferrals',
  }),
  referrals: many(users, {
    relationName: 'userReferrals',
  }),
  coinTransactions: many(coinTransactions),
  reportsSent: many(reports, {
    relationName: 'reportsSent',
  }),
  reportsReceived: many(reports, {
    relationName: 'reportsReceived',
  }),
}));

export const matchingPreferencesRelations = relations(
  matchingPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [matchingPreferences.userId],
      references: [users.id],
    }),
  })
);

export const coinTransactionsRelations = relations(coinTransactions, ({ one }) => ({
  user: one(users, {
    fields: [coinTransactions.userId],
    references: [users.id],
  }),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one }) => ({
  user1: one(users, {
    fields: [chatSessions.user1Id],
    references: [users.id],
    relationName: 'chatUser1',
  }),
  user2: one(users, {
    fields: [chatSessions.user2Id],
    references: [users.id],
    relationName: 'chatUser2',
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(users, {
    fields: [reports.reporterId],
    references: [users.id],
    relationName: 'reportsSent',
  }),
  reported: one(users, {
    fields: [reports.reportedId],
    references: [users.id],
    relationName: 'reportsReceived',
  }),
}));


