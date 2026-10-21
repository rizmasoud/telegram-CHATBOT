import express from 'express';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { botInstance, startBotLongPolling } from './src/bot/bot';
import { inMemoryDb } from './src/db';
import { redisService } from './src/services/redis';
import { simulatorService } from './src/services/simulatorService';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

// ----------------------------------------------------
// TELEGRAM WEBHOOK ROUTE (Production endpoint)
// ----------------------------------------------------
app.post('/api/bot/webhook', async (req, res) => {
  try {
    // Passes real Telegram updates to the grammY bot instance
    await botInstance.handleUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[Webhook Error]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ----------------------------------------------------
// SYSTEM STATUS & HEALTH CHECK
// ----------------------------------------------------
app.get('/api/status', (req, res) => {
  const queueStats = redisService.getQueueStats();
  const dbStats = inMemoryDb.getStats();

  res.json({
    status: 'online',
    framework: 'grammY (Node.js/TypeScript)',
    database: {
      type: 'PostgreSQL (Drizzle ORM)',
      connected: Boolean(process.env.DATABASE_URL),
      totalUsers: dbStats.totalUsers,
      activeChats: dbStats.activeChats,
    },
    storage: {
      type: 'In-Memory Matchmaking & Rate Limiter',
      status: 'active',
      queueSize: queueStats.queueSize,
    },
    bot: {
      mode: 'Long Polling (bot.start())',
      configured: Boolean(
        process.env.TELEGRAM_BOT_TOKEN &&
        !process.env.TELEGRAM_BOT_TOKEN.includes('ABCdefGhIJKlmNoPQRsTUVwxyZ')
      ),
    },
    botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  });
});

// ----------------------------------------------------
// SIMULATOR API (Interactive Testing in AI Studio)
// ----------------------------------------------------
app.get('/api/simulate/messages', (req, res) => {
  const telegramId = (req.query.telegramId as string) || '100000003';
  const messages = simulatorService.getMessages(telegramId);
  res.json({ messages });
});

app.post('/api/simulate/message', async (req, res) => {
  const { telegramId, text, photoUrl } = req.body;
  if (!telegramId) {
    return res.status(400).json({ error: 'telegramId is required' });
  }
  const result = await simulatorService.handleUserInput(telegramId, text || '', photoUrl);
  res.json(result);
});

app.post('/api/simulate/callback', async (req, res) => {
  const { telegramId, callbackData } = req.body;
  if (!telegramId || !callbackData) {
    return res.status(400).json({ error: 'telegramId and callbackData are required' });
  }
  const result = await simulatorService.handleCallbackQuery(telegramId, callbackData);
  res.json(result);
});

app.post('/api/simulate/reset', (req, res) => {
  simulatorService.resetAll();
  res.json({ ok: true, message: 'All demo users and simulator states reset' });
});

// ----------------------------------------------------
// DATABASE & SCHEMA INSPECTOR APIS
// ----------------------------------------------------
app.get('/api/db/data', (req, res) => {
  const stats = inMemoryDb.getStats();
  const txs = inMemoryDb.getTransactions();
  const reports = inMemoryDb.getReports();
  res.json({
    users: stats.users,
    preferences: stats.preferences,
    transactions: txs,
    reports: reports,
    stats: {
      totalUsers: stats.totalUsers,
      activeChats: stats.activeChats,
      bannedUsersCount: stats.bannedUsersCount,
      pendingReportsCount: stats.pendingReportsCount,
      totalCoinsInCirculation: stats.totalCoinsInCirculation,
      totalTransactions: stats.totalTransactions,
      totalReports: stats.totalReports,
    },
  });
});

app.post('/api/moderation/resolve', (req, res) => {
  const { reportId, action, adminName } = req.body;
  const result = inMemoryDb.resolveReport(Number(reportId), action, adminName || 'WebAdmin');
  res.json({ ok: true, result });
});

app.post('/api/moderation/ban', (req, res) => {
  const { userId, reason } = req.body;
  const user = inMemoryDb.banUser(Number(userId), reason || 'Banned via Admin Dashboard');
  res.json({ ok: true, user });
});

app.post('/api/moderation/unban', (req, res) => {
  const { userId } = req.body;
  const user = inMemoryDb.unbanUser(Number(userId));
  res.json({ ok: true, user });
});

app.get('/api/redis/queue', (req, res) => {
  res.json(redisService.getQueueStats());
});

app.get('/api/schema/sql', (req, res) => {
  const sqlDdl = `
-- ========================================================
-- POSTGRESQL DDL GENERATED FROM DRIZZLE ORM SCHEMA
-- ========================================================

-- Create Enums
CREATE TYPE gender AS ENUM ('male', 'female');
CREATE TYPE target_gender AS ENUM ('male', 'female', 'any');
CREATE TYPE user_status AS ENUM ('registering', 'idle', 'searching', 'in_chat', 'banned');
CREATE TYPE chat_session_status AS ENUM ('active', 'ended');
CREATE TYPE report_status AS ENUM ('pending', 'resolved_banned', 'dismissed');
CREATE TYPE coin_tx_type AS ENUM ('welcome_bonus', 'referral_bonus', 'match_search', 'admin_gift', 'profile_boost');

-- Table: users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id VARCHAR(32) NOT NULL UNIQUE,
  internal_id VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  gender gender NOT NULL, -- IMMUTABLE once set during onboarding
  age INTEGER NOT NULL CHECK (age >= 18 AND age <= 99),
  province VARCHAR(64) NOT NULL,
  bio TEXT,
  profile_photo_file_id TEXT,
  coins INTEGER NOT NULL DEFAULT 10,
  referral_code VARCHAR(32) NOT NULL UNIQUE,
  referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status user_status NOT NULL DEFAULT 'registering',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: matching_preferences (1-to-1 relationship with users)
CREATE TABLE IF NOT EXISTS matching_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  target_gender target_gender NOT NULL DEFAULT 'any',
  target_age_min INTEGER NOT NULL DEFAULT 18,
  target_age_max INTEGER NOT NULL DEFAULT 99,
  target_province VARCHAR(64) NOT NULL DEFAULT 'any_province',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: chat_sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status chat_session_status NOT NULL DEFAULT 'active',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP
);

-- Table: reports (Moderation & Auto-Ban Auditing)
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  chat_snippet TEXT,
  status report_status NOT NULL DEFAULT 'pending',
  resolved_by VARCHAR(64),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: coin_transactions
CREATE TABLE IF NOT EXISTS coin_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type coin_tx_type NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for Fast Matchmaking, Lookups & Moderation
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_internal_id ON users(internal_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_status_gender ON users(status, gender);
CREATE INDEX IF NOT EXISTS idx_users_province ON users(province);
CREATE INDEX IF NOT EXISTS idx_matching_pref_target ON matching_preferences(target_gender, target_age_min, target_age_max);
CREATE INDEX IF NOT EXISTS idx_reports_reported_created ON reports(reported_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
`;
  res.type('text/plain').send(sqlDdl);
});

// ----------------------------------------------------
// VITE CLIENT MOUNTING
// ----------------------------------------------------
async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Telegram Matchmaking backend & UI running on http://0.0.0.0:${PORT}`);
    // Start real Telegram Long Polling concurrently (bot.start())
    startBotLongPolling().catch((err) => {
      console.error('[Bot Startup Error]', err);
    });
  });
}

startServer().catch((err) => {
  console.error('[Server Start Error]', err);
});
