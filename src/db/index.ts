import 'dotenv/config';
import mongoose from 'mongoose';
import {
  UserModel,
  MatchingPreferenceModel,
  ChatSessionModel,
  ReportModel,
  CoinTransactionModel,
} from './models';
import {
  User,
  MatchingPreferences,
  CoinTransaction,
  ActiveChatSession,
  UserReport,
  ReportStatus,
} from '../types';
import { redisService } from '../services/redis';

let mongoConnected = false;

export function isMongoConnected(): boolean {
  return mongoConnected && mongoose.connection.readyState === 1;
}

/**
 * Production MongoDB Data Layer (Mongoose)
 * Connects via MONGODB_URI, hydrates existing documents on startup,
 * and persists all user, preference, chat session, coin ledger, and moderation
 * mutations to MongoDB collections with zero mock or demo seed data.
 */
class MongoDatastore {
  private users: Map<number, User> = new Map();
  private usersByTelegramId: Map<string, number> = new Map();
  private usersByInternalId: Map<string, number> = new Map();
  private usersByReferralCode: Map<string, number> = new Map();
  private preferences: Map<number, MatchingPreferences> = new Map(); // key = userId
  private chatSessions: Map<string, ActiveChatSession> = new Map();
  private transactions: CoinTransaction[] = [];
  private reports: Map<number, UserReport> = new Map();
  private nextUserId = 1;
  private nextPrefId = 1;
  private nextTxId = 1;
  private nextReportId = 1;

  private clearLocalMaps() {
    this.users.clear();
    this.usersByTelegramId.clear();
    this.usersByInternalId.clear();
    this.usersByReferralCode.clear();
    this.preferences.clear();
    this.chatSessions.clear();
    this.transactions = [];
    this.reports.clear();
    this.nextUserId = 1;
    this.nextPrefId = 1;
    this.nextTxId = 1;
    this.nextReportId = 1;
  }

  private indexUser(u: User) {
    this.users.set(u.id, u);
    this.usersByTelegramId.set(u.telegram_id, u.id);
    this.usersByInternalId.set(u.internal_id.toUpperCase().trim(), u.id);
    this.usersByReferralCode.set(u.referral_code, u.id);
    if (u.id >= this.nextUserId) {
      this.nextUserId = u.id + 1;
    }
    if (u.status === 'banned') {
      redisService.setUserStatus(u.id, 'banned');
    }
  }

  /**
   * Hydrates operational state from real MongoDB collections on startup.
   */
  async syncWithMongo(): Promise<void> {
    if (!isMongoConnected()) return;

    try {
      const [userDocs, prefDocs, sessionDocs, reportDocs, txDocs] = await Promise.all([
        UserModel.find().lean(),
        MatchingPreferenceModel.find().lean(),
        ChatSessionModel.find().lean(),
        ReportModel.find().lean(),
        CoinTransactionModel.find().sort({ id: 1 }).lean(),
      ]);

      this.clearLocalMaps();

      for (const doc of userDocs) {
        const user: User = {
          id: doc.id,
          telegram_id: doc.telegram_id,
          internal_id: doc.internal_id,
          name: doc.name,
          gender: doc.gender,
          age: doc.age,
          province: doc.province,
          bio: doc.bio ?? null,
          profile_photo_file_id: doc.profile_photo_file_id ?? null,
          // Reset transient in-memory queue statuses on process restart
          status:
            doc.status === 'searching' || doc.status === 'in_chat' ? 'idle' : doc.status,
          coins: doc.coins,
          referral_code: doc.referral_code,
          referred_by: doc.referred_by ?? null,
          created_at: new Date(doc.created_at).toISOString(),
          updated_at: new Date(doc.updated_at).toISOString(),
        };
        this.indexUser(user);
      }

      for (const doc of prefDocs) {
        const pref: MatchingPreferences = {
          id: doc.id,
          user_id: doc.user_id,
          target_gender: doc.target_gender,
          target_age_min: doc.target_age_min,
          target_age_max: doc.target_age_max,
          target_province: doc.target_province,
          updated_at: new Date(doc.updated_at).toISOString(),
        };
        this.preferences.set(pref.user_id, pref);
        if (pref.id >= this.nextPrefId) {
          this.nextPrefId = pref.id + 1;
        }
      }

      for (const doc of sessionDocs) {
        const session: ActiveChatSession = {
          id: doc.id,
          user1_id: doc.user1_id,
          user2_id: doc.user2_id,
          status: doc.status === 'active' ? 'ended' : doc.status,
          started_at: new Date(doc.started_at).toISOString(),
          ended_at: doc.ended_at ? new Date(doc.ended_at).toISOString() : new Date().toISOString(),
        };
        this.chatSessions.set(session.id, session);
      }

      for (const doc of reportDocs) {
        const report: UserReport = {
          id: doc.id,
          reporter_id: doc.reporter_id,
          reported_id: doc.reported_id,
          reason: doc.reason ?? null,
          chat_snippet: doc.chat_snippet ?? null,
          status: doc.status,
          resolved_by: doc.resolved_by ?? null,
          resolved_at: doc.resolved_at ? new Date(doc.resolved_at).toISOString() : null,
          created_at: new Date(doc.created_at).toISOString(),
        };
        this.reports.set(report.id, report);
        if (report.id >= this.nextReportId) {
          this.nextReportId = report.id + 1;
        }
      }

      for (const doc of txDocs) {
        const tx: CoinTransaction = {
          id: doc.id,
          user_id: doc.user_id,
          amount: doc.amount,
          type: doc.type,
          description: doc.description,
          created_at: new Date(doc.created_at).toISOString(),
        };
        this.transactions.push(tx);
        if (tx.id >= this.nextTxId) {
          this.nextTxId = tx.id + 1;
        }
      }

      console.log(
        `[MongoDB] 📦 Hydrated ${this.users.size} users, ${this.preferences.size} preferences, ${this.reports.size} reports, ${this.transactions.length} transactions.`
      );
    } catch (err: any) {
      console.error('[MongoDB] ⚠️ Error hydrating state from MongoDB:', err.message);
    }
  }

  private persistUserAsync(user: User, isNew = false) {
    if (!isMongoConnected()) return;
    if (isNew) {
      UserModel.create({
        ...user,
        bio: user.bio ?? null,
        profile_photo_file_id: user.profile_photo_file_id ?? null,
        referred_by: user.referred_by ?? null,
        created_at: new Date(user.created_at),
        updated_at: new Date(user.updated_at),
      }).catch((err) => console.error('[MongoDB] Failed to insert user:', err.message));
    } else {
      UserModel.updateOne(
        { id: user.id },
        {
          $set: {
            name: user.name,
            age: user.age,
            province: user.province,
            bio: user.bio ?? null,
            profile_photo_file_id: user.profile_photo_file_id ?? null,
            coins: user.coins,
            status: user.status,
            updated_at: new Date(user.updated_at),
          },
        }
      ).catch((err) => console.error('[MongoDB] Failed to update user:', err.message));
    }
  }

  private persistPreferenceAsync(pref: MatchingPreferences) {
    if (!isMongoConnected()) return;
    MatchingPreferenceModel.updateOne(
      { user_id: pref.user_id },
      {
        $set: {
          id: pref.id,
          user_id: pref.user_id,
          target_gender: pref.target_gender,
          target_age_min: pref.target_age_min,
          target_age_max: pref.target_age_max,
          target_province: pref.target_province,
          updated_at: new Date(pref.updated_at),
        },
      },
      { upsert: true }
    ).catch((err) =>
      console.error('[MongoDB] Failed to upsert matching_preferences:', err.message)
    );
  }

  private persistTransactionAsync(tx: CoinTransaction) {
    if (!isMongoConnected()) return;
    CoinTransactionModel.create({
      id: tx.id,
      user_id: tx.user_id,
      amount: tx.amount,
      type: tx.type,
      description: tx.description || '',
      created_at: new Date(tx.created_at),
    }).catch((err) => console.error('[MongoDB] Failed to insert coin_transaction:', err.message));
  }

  private persistChatSessionAsync(session: ActiveChatSession) {
    if (!isMongoConnected()) return;
    ChatSessionModel.updateOne(
      { id: session.id },
      {
        $set: {
          id: session.id,
          user1_id: session.user1_id,
          user2_id: session.user2_id,
          status: session.status,
          started_at: new Date(session.started_at),
          ended_at: session.ended_at ? new Date(session.ended_at) : null,
        },
      },
      { upsert: true }
    ).catch((err) => console.error('[MongoDB] Failed to upsert chat_session:', err.message));
  }

  private persistReportAsync(report: UserReport) {
    if (!isMongoConnected()) return;
    ReportModel.updateOne(
      { id: report.id },
      {
        $set: {
          id: report.id,
          reporter_id: report.reporter_id,
          reported_id: report.reported_id,
          reason: report.reason ?? null,
          chat_snippet: report.chat_snippet ?? null,
          status: report.status,
          resolved_by: report.resolved_by ?? null,
          resolved_at: report.resolved_at ? new Date(report.resolved_at) : null,
          created_at: new Date(report.created_at),
        },
      },
      { upsert: true }
    ).catch((err) => console.error('[MongoDB] Failed to upsert report:', err.message));
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  getUserById(id: number): User | null {
    return this.users.get(id) || null;
  }

  getUserByTelegramId(telegramId: string): User | null {
    const id = this.usersByTelegramId.get(telegramId);
    return id ? this.users.get(id) || null : null;
  }

  getUserByInternalId(internalId: string): User | null {
    const id = this.usersByInternalId.get(internalId.toUpperCase().trim());
    return id ? this.users.get(id) || null : null;
  }

  findUser(query: { telegramId?: string; internalId?: string; id?: number }): User | null {
    if (query.telegramId) {
      return this.getUserByTelegramId(query.telegramId);
    }
    if (query.internalId) {
      return this.getUserByInternalId(query.internalId);
    }
    if (query.id !== undefined) {
      return this.getUserById(query.id);
    }
    return null;
  }

  checkUserBanned(identifier: string | number): boolean {
    let user: User | null = null;
    if (typeof identifier === 'number') {
      user = this.getUserById(identifier);
    } else if (identifier.startsWith('USER-') || identifier.startsWith('user-')) {
      user = this.getUserByInternalId(identifier);
    } else {
      user = this.getUserByTelegramId(identifier);
    }
    return user?.status === 'banned';
  }

  getUserWallet(
    identifier: string | number
  ): { user: User; coins: number; transactions: CoinTransaction[] } | null {
    let user: User | null = null;
    if (typeof identifier === 'number') {
      user = this.getUserById(identifier);
    } else if (identifier.startsWith('USER-') || identifier.startsWith('user-')) {
      user = this.getUserByInternalId(identifier);
    } else {
      user = this.getUserByTelegramId(identifier);
    }
    if (!user) return null;

    const txs = this.transactions
      .filter((t) => t.user_id === user!.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return {
      user,
      coins: user.coins,
      transactions: txs,
    };
  }

  getUserByReferralCode(code: string): User | null {
    const id = this.usersByReferralCode.get(code);
    return id ? this.users.get(id) || null : null;
  }

  createUser(payload: {
    telegramId: string;
    internalId: string;
    name: string;
    gender: 'male' | 'female';
    age: number;
    province: string;
    bio?: string | null;
    profilePhotoFileId?: string | null;
    referralCode: string;
    referredBy?: number | null;
    initialCoins?: number;
  }): User {
    const id = this.nextUserId++;
    const now = new Date().toISOString();
    const newUser: User = {
      id,
      telegram_id: payload.telegramId,
      internal_id: payload.internalId,
      name: payload.name,
      gender: payload.gender,
      age: payload.age,
      province: payload.province,
      bio: payload.bio || null,
      profile_photo_file_id: payload.profilePhotoFileId || null,
      coins: payload.initialCoins ?? 10,
      referral_code: payload.referralCode,
      referred_by: payload.referredBy || null,
      status: 'idle',
      created_at: now,
      updated_at: now,
    };

    this.indexUser(newUser);
    this.persistUserAsync(newUser, true);

    const defaultPref: MatchingPreferences = {
      id: this.nextPrefId++,
      user_id: id,
      target_gender: payload.gender === 'male' ? 'female' : 'male',
      target_age_min: 18,
      target_age_max: 99,
      target_province: 'any_province',
      updated_at: now,
    };
    this.preferences.set(id, defaultPref);
    this.persistPreferenceAsync(defaultPref);

    this.addTransaction({
      userId: id,
      amount: newUser.coins,
      type: 'welcome_bonus',
      description: 'Welcome starting bonus on onboarding completion',
    });

    return newUser;
  }

  /**
   * Updates profile fields.
   * STRICT ENFORCEMENT: Gender cannot be modified once created!
   */
  updateUserProfile(
    userId: number,
    updates: Partial<
      Pick<User, 'name' | 'age' | 'province' | 'bio' | 'profile_photo_file_id' | 'status' | 'coins'>
    > & {
      gender?: never;
    }
  ): User {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    if ('gender' in (updates as any)) {
      throw new Error('IMMUTABLE_FIELD: User gender cannot be modified after registration.');
    }

    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );

    const updated: User = {
      ...user,
      ...cleanUpdates,
      updated_at: new Date().toISOString(),
    };

    this.users.set(userId, updated);
    this.persistUserAsync(updated, false);
    return updated;
  }

  getPreferences(userId: number): MatchingPreferences | null {
    return this.preferences.get(userId) || null;
  }

  updatePreferences(userId: number, updates: Partial<MatchingPreferences>): MatchingPreferences {
    let pref = this.preferences.get(userId);
    if (!pref) {
      pref = {
        id: this.nextPrefId++,
        user_id: userId,
        target_gender: 'any',
        target_age_min: 18,
        target_age_max: 99,
        target_province: 'any_province',
        updated_at: new Date().toISOString(),
      };
    }
    const updated: MatchingPreferences = {
      ...pref,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.preferences.set(userId, updated);
    this.persistPreferenceAsync(updated);
    return updated;
  }

  addTransaction(tx: {
    userId: number;
    amount: number;
    type: 'welcome_bonus' | 'referral_bonus' | 'match_search' | 'admin_gift' | 'profile_boost';
    description: string;
  }): CoinTransaction {
    const newTx: CoinTransaction = {
      id: this.nextTxId++,
      user_id: tx.userId,
      amount: tx.amount,
      type: tx.type,
      description: tx.description,
      created_at: new Date().toISOString(),
    };
    this.transactions.push(newTx);
    this.persistTransactionAsync(newTx);
    return newTx;
  }

  atomicDeductCoins(
    userId: number,
    amount: number,
    type: 'match_search' | 'profile_boost',
    description: string
  ): { success: boolean; newBalance?: number; error?: string } {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: 'User not found' };

    if (user.coins < amount) {
      return { success: false, newBalance: user.coins, error: 'INSUFFICIENT_BALANCE' };
    }

    user.coins -= amount;
    user.updated_at = new Date().toISOString();
    this.users.set(userId, user);
    this.persistUserAsync(user, false);

    this.addTransaction({
      userId,
      amount: -amount,
      type,
      description,
    });

    return { success: true, newBalance: user.coins };
  }

  awardCoins(
    userId: number,
    amount: number,
    type: CoinTransaction['type'],
    description: string
  ): { newBalance: number; tx: CoinTransaction } {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');

    user.coins += amount;
    user.updated_at = new Date().toISOString();
    this.users.set(userId, user);
    this.persistUserAsync(user, false);

    const tx = this.addTransaction({
      userId,
      amount,
      type,
      description,
    });

    return { newBalance: user.coins, tx };
  }

  getReferralsCount(userId: number): number {
    let count = 0;
    for (const u of this.users.values()) {
      if (u.referred_by === userId) count++;
    }
    return count;
  }

  getReferredUsers(userId: number): User[] {
    const list: User[] = [];
    for (const u of this.users.values()) {
      if (u.referred_by === userId) list.push(u);
    }
    return list;
  }

  getTransactions(userId?: number): CoinTransaction[] {
    if (userId) {
      return this.transactions.filter((t) => t.user_id === userId);
    }
    return this.transactions;
  }

  createChatSession(user1Id: number, user2Id: number): ActiveChatSession {
    const id = `chat_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const session: ActiveChatSession = {
      id,
      user1_id: user1Id,
      user2_id: user2Id,
      status: 'active',
      started_at: new Date().toISOString(),
      ended_at: null,
    };
    this.chatSessions.set(id, session);
    this.persistChatSessionAsync(session);
    return session;
  }

  endChatSession(sessionId: string): ActiveChatSession | null {
    const session = this.chatSessions.get(sessionId);
    if (session) {
      session.status = 'ended';
      session.ended_at = new Date().toISOString();
      this.persistChatSessionAsync(session);
      return session;
    }
    return null;
  }

  /**
   * Returns real past/active chat partners for a user ordered most recent first.
   */
  getUserChatHistory(userId: number, limit = 10): Array<{ partner: User; lastChatAt: string }> {
    const sessions = Array.from(this.chatSessions.values())
      .filter((s) => s.user1_id === userId || s.user2_id === userId)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

    const seenPartners = new Set<number>();
    const results: Array<{ partner: User; lastChatAt: string }> = [];

    for (const session of sessions) {
      const partnerId = session.user1_id === userId ? session.user2_id : session.user1_id;
      if (seenPartners.has(partnerId)) continue;
      const partner = this.users.get(partnerId);
      if (partner) {
        seenPartners.add(partnerId);
        results.push({
          partner,
          lastChatAt: new Date(session.started_at).toISOString(),
        });
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  // -----------------------------------------------------------------
  // Moderation & Reporting Methods
  // -----------------------------------------------------------------

  createReport(payload: {
    reporterId: number;
    reportedId: number;
    reason?: string;
    chatSnippet?: string;
  }): { report: UserReport; autoBanned: boolean } {
    const id = this.nextReportId++;
    const now = new Date().toISOString();

    const report: UserReport = {
      id,
      reporter_id: payload.reporterId,
      reported_id: payload.reportedId,
      reason: payload.reason || 'گزارش رفتار نامناسب در گفتگوی ناشناس',
      chat_snippet: payload.chatSnippet || null,
      status: 'pending',
      created_at: now,
    };

    this.reports.set(id, report);

    const recentReportsCount = this.getReportsCountForUser(payload.reportedId, 24);
    let autoBanned = false;

    if (recentReportsCount >= 3) {
      this.banUser(
        payload.reportedId,
        `Auto-banned: Accumulated ${recentReportsCount} reports within 24 hours`
      );
      report.status = 'resolved_banned';
      report.resolved_at = now;
      report.resolved_by = 'SYSTEM_AUTO_BAN';
      autoBanned = true;
    }

    this.persistReportAsync(report);
    return { report, autoBanned };
  }

  getReports(status?: ReportStatus): UserReport[] {
    const all = Array.from(this.reports.values());
    const filtered = status ? all.filter((r) => r.status === status) : all;
    return filtered.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  getReportById(id: number): UserReport | null {
    return this.reports.get(id) || null;
  }

  getReportsCountForUser(reportedId: number, withinHours = 24): number {
    const cutoff = Date.now() - withinHours * 3600 * 1000;
    let count = 0;
    for (const r of this.reports.values()) {
      if (r.reported_id === reportedId && new Date(r.created_at).getTime() >= cutoff) {
        count++;
      }
    }
    return count;
  }

  resolveReport(
    reportId: number,
    action: 'ban' | 'dismiss',
    resolvedBy = 'Admin'
  ): UserReport | null {
    const report = this.reports.get(reportId);
    if (!report) return null;

    const now = new Date().toISOString();
    report.resolved_at = now;
    report.resolved_by = resolvedBy;

    if (action === 'ban') {
      report.status = 'resolved_banned';
      this.banUser(report.reported_id, `Banned by admin resolution of report #${reportId}`);
    } else {
      report.status = 'dismissed';
    }

    this.persistReportAsync(report);
    return report;
  }

  banUser(userId: number, reason = 'Violation of community guidelines'): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    user.status = 'banned';
    user.updated_at = new Date().toISOString();
    this.users.set(userId, user);
    this.persistUserAsync(user, false);

    redisService.setUserStatus(userId, 'banned');
    redisService.removeFromMatchQueue(userId);
    redisService.endActiveChat(userId);

    console.log(
      `[Moderation] User ${user.internal_id} (ID: ${userId}) has been BANNED. Reason: ${reason}`
    );
    return true;
  }

  unbanUser(userId: number): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    user.status = 'idle';
    user.updated_at = new Date().toISOString();
    this.users.set(userId, user);
    this.persistUserAsync(user, false);

    redisService.setUserStatus(userId, 'idle');
    console.log(`[Moderation] User ${user.internal_id} (ID: ${userId}) has been UNBANNED.`);
    return true;
  }

  getStats() {
    const usersList = Array.from(this.users.values());
    const bannedUsers = usersList.filter((u) => u.status === 'banned');
    const allReports = Array.from(this.reports.values());
    const pendingReports = allReports.filter((r) => r.status === 'pending');
    const totalCoinsInCirculation = usersList.reduce((acc, u) => acc + (u.coins || 0), 0);

    return {
      totalUsers: this.users.size,
      activeChats: Array.from(this.chatSessions.values()).filter((c) => c.status === 'active')
        .length,
      totalTransactions: this.transactions.length,
      totalCoinsInCirculation,
      bannedUsersCount: bannedUsers.length,
      bannedUsers,
      totalReports: allReports.length,
      pendingReportsCount: pendingReports.length,
      reports: allReports.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
      users: usersList,
      preferences: Array.from(this.preferences.values()),
    };
  }
}

export const mongoDb = new MongoDatastore();
export const inMemoryDb = mongoDb;

/**
 * Connects to MongoDB using MONGODB_URI and hydrates state.
 */
export async function connectMongoDB(): Promise<boolean> {
  const rawUri = process.env.MONGODB_URI?.trim().replace(/^["']|["']$/g, '');

  if (!rawUri) {
    console.log(
      '[MongoDB] ℹ️ MONGODB_URI is not set in .env — running in ephemeral memory until MONGODB_URI is configured.'
    );
    return false;
  }

  try {
    console.log('[MongoDB] 🔄 Connecting to MongoDB via MONGODB_URI...');
    await mongoose.connect(rawUri, {
      serverSelectionTimeoutMS: 5000,
    });
    mongoConnected = true;
    console.log('[MongoDB] ✅ Connected successfully to MongoDB!');

    mongoose.connection.on('disconnected', () => {
      mongoConnected = false;
      console.warn('[MongoDB] ⚠️ MongoDB disconnected.');
    });

    mongoose.connection.on('reconnected', () => {
      mongoConnected = true;
      console.log('[MongoDB] 🔄 MongoDB reconnected.');
    });

    await mongoDb.syncWithMongo();
    return true;
  } catch (err: any) {
    mongoConnected = false;
    console.warn(`[MongoDB] ⚠️ Could not connect to MongoDB (${err.message}).`);
    return false;
  }
}
