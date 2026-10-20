import React, { useState } from 'react';
import { Database, Copy, Check, Code, Table, Key, ShieldCheck } from 'lucide-react';

export const SchemaView: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'er' | 'drizzle' | 'sql'>('er');

  const sqlDdl = `-- PostgreSQL Schema for Telegram Matchmaking Bot (Drizzle ORM)
CREATE TYPE gender AS ENUM ('male', 'female');
CREATE TYPE target_gender AS ENUM ('male', 'female', 'any');
CREATE TYPE user_status AS ENUM ('registering', 'idle', 'searching', 'in_chat', 'banned');
CREATE TYPE coin_tx_type AS ENUM ('welcome_bonus', 'referral_bonus', 'match_search', 'admin_gift', 'profile_boost');

-- 1. Core Users Table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  telegram_id VARCHAR(32) NOT NULL UNIQUE,       -- Telegram Chat/User ID
  internal_id VARCHAR(32) NOT NULL UNIQUE,       -- Display Handle e.g. "USER-8291"
  name VARCHAR(128) NOT NULL,
  gender gender NOT NULL,                        -- IMMUTABLE once onboarding completes
  age INTEGER NOT NULL CHECK (age >= 18 AND age <= 99),
  province VARCHAR(64) NOT NULL,                 -- Iranian Province
  bio TEXT,
  profile_photo_file_id TEXT,
  coins INTEGER NOT NULL DEFAULT 10,
  referral_code VARCHAR(32) NOT NULL UNIQUE,
  referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status user_status NOT NULL DEFAULT 'registering',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Matching Preferences Table (1-to-1 relationship with users)
CREATE TABLE matching_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  target_gender target_gender NOT NULL DEFAULT 'any',
  target_age_min INTEGER NOT NULL DEFAULT 18,
  target_age_max INTEGER NOT NULL DEFAULT 99,
  target_province VARCHAR(64) NOT NULL DEFAULT 'any_province',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Anonymous Chat Sessions Table
CREATE TABLE chat_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status chat_session_status NOT NULL DEFAULT 'active',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP
);

-- 4. Coins & Referral Ledger
CREATE TABLE coin_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type coin_tx_type NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for Fast Matchmaking & Queries
CREATE UNIQUE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE UNIQUE INDEX idx_users_internal_id ON users(internal_id);
CREATE UNIQUE INDEX idx_users_referral_code ON users(referral_code);
CREATE INDEX idx_users_status_gender ON users(status, gender);
CREATE INDEX idx_users_province ON users(province);
CREATE INDEX idx_matching_pref_target ON matching_preferences(target_gender, target_age_min, target_age_max);
`;

  const drizzleCode = `import { pgTable, serial, varchar, text, integer, timestamp, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const genderEnum = pgEnum('gender', ['male', 'female']);
export const targetGenderEnum = pgEnum('target_gender', ['male', 'female', 'any']);
export const userStatusEnum = pgEnum('user_status', ['registering', 'idle', 'searching', 'in_chat', 'banned']);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  telegramId: varchar('telegram_id', { length: 32 }).notNull().unique(),
  internalId: varchar('internal_id', { length: 32 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
  gender: genderEnum('gender').notNull(), // Immutable once created
  age: integer('age').notNull(),
  province: varchar('province', { length: 64 }).notNull(),
  bio: text('bio'),
  profilePhotoFileId: text('profile_photo_file_id'),
  coins: integer('coins').default(10).notNull(),
  referralCode: varchar('referral_code', { length: 32 }).notNull().unique(),
  referredBy: integer('referred_by').references((): any => users.id, { onDelete: 'set null' }),
  status: userStatusEnum('status').default('registering').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const matchingPreferences = pgTable('matching_preferences', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  targetGender: targetGenderEnum('target_gender').default('any').notNull(),
  targetAgeMin: integer('target_age_min').default(18).notNull(),
  targetAgeMax: integer('target_age_max').default(99).notNull(),
  targetProvince: varchar('target_province', { length: 64 }).default('any_province').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-1.5 rounded-xl">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('er')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'er'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Relational Schema (ER)</span>
          </button>
          <button
            onClick={() => setActiveTab('drizzle')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'drizzle'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Drizzle ORM (schema.ts)</span>
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'sql'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>PostgreSQL DDL</span>
          </button>
        </div>

        <button
          onClick={() => copyToClipboard(activeTab === 'sql' ? sqlDdl : drizzleCode)}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied!' : 'Copy Code'}</span>
        </button>
      </div>

      {/* ER Card Layout */}
      {activeTab === 'er' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Users Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="bg-slate-800/80 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-cyan-400" />
                <span className="font-mono font-bold text-slate-200 text-xs">users</span>
              </div>
              <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded font-mono border border-cyan-800/80">
                Primary Model
              </span>
            </div>
            <div className="p-3 text-xs space-y-2 font-mono">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-slate-300">
                <span className="text-amber-400 flex items-center gap-1">
                  <Key className="w-3 h-3" /> id (PK)
                </span>
                <span className="text-slate-500">SERIAL</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span className="text-cyan-300 font-semibold">telegram_id</span>
                <span className="text-slate-500">VARCHAR(32) UNIQUE</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span className="text-cyan-300 font-semibold">internal_id</span>
                <span className="text-slate-500">VARCHAR(32) UNIQUE</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span>name</span>
                <span className="text-slate-500">VARCHAR(128)</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-amber-300 bg-amber-950/20 px-1 py-0.5 rounded">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-amber-400" /> gender
                </span>
                <span className="text-amber-400 text-[10px]">ENUM ('male','female') [IMMUTABLE]</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span>age</span>
                <span className="text-slate-500">INT (18-99)</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span>province</span>
                <span className="text-slate-500">VARCHAR(64)</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span>coins</span>
                <span className="text-slate-500">INT (Default 10)</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span>referral_code</span>
                <span className="text-slate-500">VARCHAR(32) UNIQUE</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span className="text-blue-400">referred_by (FK)</span>
                <span className="text-slate-500">REFERENCES users(id)</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>status</span>
                <span className="text-slate-500">ENUM ('idle','searching','in_chat')</span>
              </div>
            </div>
          </div>

          {/* Matching Preferences Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="bg-slate-800/80 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-purple-400" />
                <span className="font-mono font-bold text-slate-200 text-xs">matching_preferences</span>
              </div>
              <span className="text-[10px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded font-mono border border-purple-800/80">
                1:1 with User
              </span>
            </div>
            <div className="p-3 text-xs space-y-2 font-mono">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-slate-300">
                <span className="text-amber-400 flex items-center gap-1">
                  <Key className="w-3 h-3" /> id (PK)
                </span>
                <span className="text-slate-500">SERIAL</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-purple-300">
                <span className="font-semibold">user_id (FK, Unique)</span>
                <span className="text-slate-500">INT → users(id) CASCADE</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span>target_gender</span>
                <span className="text-slate-500">ENUM ('male','female','any')</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span>target_age_min</span>
                <span className="text-slate-500">INT (Default 18)</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span>target_age_max</span>
                <span className="text-slate-500">INT (Default 99)</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>target_province</span>
                <span className="text-slate-500">VARCHAR(64) ('any_province' | 'same_province')</span>
              </div>
            </div>
          </div>

          {/* Active Chat Sessions Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="bg-slate-800/80 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-emerald-400" />
                <span className="font-mono font-bold text-slate-200 text-xs">chat_sessions</span>
              </div>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded font-mono border border-emerald-800/80">
                Active Pairs
              </span>
            </div>
            <div className="p-3 text-xs space-y-2 font-mono">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span className="text-amber-400">id (PK)</span>
                <span className="text-slate-500">VARCHAR(64)</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span>user1_id (FK)</span>
                <span className="text-slate-500">INT → users(id)</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span>user2_id (FK)</span>
                <span className="text-slate-500">INT → users(id)</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>status</span>
                <span className="text-slate-500">ENUM ('active', 'ended')</span>
              </div>
            </div>
          </div>

          {/* Coin Transactions Ledger */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="bg-slate-800/80 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-amber-400" />
                <span className="font-mono font-bold text-slate-200 text-xs">coin_transactions</span>
              </div>
              <span className="text-[10px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded font-mono border border-amber-800/80">
                Referral & Coins Ledger
              </span>
            </div>
            <div className="p-3 text-xs space-y-2 font-mono">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span className="text-amber-400">id (PK)</span>
                <span className="text-slate-500">SERIAL</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span>user_id (FK)</span>
                <span className="text-slate-500">INT → users(id)</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-300">
                <span>amount</span>
                <span className="text-slate-500">INT (+10, +15, -1)</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>type</span>
                <span className="text-slate-500">ENUM ('welcome_bonus', 'referral_bonus', 'match_search')</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drizzle ORM Code View */}
      {activeTab === 'drizzle' && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-x-auto text-slate-300">
          <pre>{drizzleCode}</pre>
        </div>
      )}

      {/* SQL DDL View */}
      {activeTab === 'sql' && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-x-auto text-emerald-400/90">
          <pre>{sqlDdl}</pre>
        </div>
      )}
    </div>
  );
};
