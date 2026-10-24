import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  botInstance,
  startBotLongPolling,
  isBotPollingActive,
  isValidTelegramToken,
} from './src/bot/bot';
import { inMemoryDb, connectMongoDB, isMongoConnected } from './src/db';
import { redisService } from './src/services/redis';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';
const startedAt = Date.now();

app.use(express.json());

// ----------------------------------------------------
// TELEGRAM WEBHOOK ROUTE (Optional Webhook Endpoint)
// ----------------------------------------------------
app.post('/api/bot/webhook', async (req, res) => {
  try {
    await botInstance.handleUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[Webhook Error]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ----------------------------------------------------
// HEALTH CHECK & OPERATIONAL STATUS
// ----------------------------------------------------
function buildStatusPayload() {
  const queueStats = redisService.getQueueStats();
  const dbStats = inMemoryDb.getStats();
  const botConfigured = isValidTelegramToken(process.env.TELEGRAM_BOT_TOKEN);

  return {
    status: 'online',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    framework: 'grammY (Node.js/TypeScript)',
    database: {
      type: 'MongoDB (Mongoose)',
      connected: isMongoConnected(),
      uriConfigured: Boolean(process.env.MONGODB_URI?.trim()),
      totalUsers: dbStats.totalUsers,
      activeChats: dbStats.activeChats,
      bannedUsersCount: dbStats.bannedUsersCount,
      pendingReportsCount: dbStats.pendingReportsCount,
      totalCoinsInCirculation: dbStats.totalCoinsInCirculation,
    },
    matchmaking: {
      type: 'In-Memory Queue & Rate Limiter',
      queueSize: queueStats.queueSize,
      activeChatsCount: queueStats.activeChatsCount,
    },
    bot: {
      mode: 'Long Polling (bot.start())',
      configured: botConfigured,
      pollingActive: isBotPollingActive(),
    },
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ...buildStatusPayload() });
});

app.get('/api/status', (_req, res) => {
  res.json(buildStatusPayload());
});

// ----------------------------------------------------
// ADMIN OPERATIONAL OVERVIEW & MODERATION APIS
// ----------------------------------------------------
app.get('/api/admin/overview', (_req, res) => {
  const stats = inMemoryDb.getStats();
  const queueStats = redisService.getQueueStats();
  const transactions = inMemoryDb.getTransactions();
  const reports = inMemoryDb.getReports();

  res.json({
    mongoConnected: isMongoConnected(),
    botPollingActive: isBotPollingActive(),
    botConfigured: isValidTelegramToken(process.env.TELEGRAM_BOT_TOKEN),
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    stats: {
      totalUsers: stats.totalUsers,
      activeChats: stats.activeChats,
      queueSize: queueStats.queueSize,
      bannedUsersCount: stats.bannedUsersCount,
      pendingReportsCount: stats.pendingReportsCount,
      totalCoinsInCirculation: stats.totalCoinsInCirculation,
      totalTransactions: stats.totalTransactions,
      totalReports: stats.totalReports,
    },
    queuedUsers: queueStats.queuedUsers,
    users: stats.users,
    reports,
    transactions: [...transactions].reverse().slice(0, 100),
  });
});

app.post('/api/moderation/resolve', (req, res) => {
  const { reportId, action, adminName } = req.body;
  if (!reportId || (action !== 'ban' && action !== 'dismiss')) {
    return res.status(400).json({ ok: false, error: 'Valid reportId and action (ban|dismiss) required' });
  }
  const result = inMemoryDb.resolveReport(Number(reportId), action, adminName || 'AdminConsole');
  res.json({ ok: true, result });
});

app.post('/api/moderation/ban', (req, res) => {
  const { userId, reason } = req.body;
  if (!userId) {
    return res.status(400).json({ ok: false, error: 'userId is required' });
  }
  const banned = inMemoryDb.banUser(Number(userId), reason || 'Banned via Admin Console');
  res.json({ ok: banned });
});

app.post('/api/moderation/unban', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ ok: false, error: 'userId is required' });
  }
  const unbanned = inMemoryDb.unbanUser(Number(userId));
  res.json({ ok: unbanned });
});

// ----------------------------------------------------
// CONCURRENT SERVER, MONGODB & BOT BOOTSTRAP
// ----------------------------------------------------
async function startServer() {
  await connectMongoDB();

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] 🌐 Express health & admin server listening on http://0.0.0.0:${PORT}`);

    // Start real Telegram Long Polling concurrently (non-blocking)
    startBotLongPolling().catch((err) => {
      console.error('[Bot Startup Error]', err);
    });
  });

  server.on('error', (err: any) => {
    console.error(`[Server] ❌ HTTP server failed on port ${PORT}:`, err.message);
  });
}

startServer().catch((err) => {
  console.error('[Server Start Error]', err);
});
