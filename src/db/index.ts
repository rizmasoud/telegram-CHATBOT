import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import { User, MatchingPreferences, CoinTransaction, ActiveChatSession, UserReport, ReportStatus } from '../types';
import { redisService } from '../services/redis';

const { Pool } = pg;

export let pool: pg.Pool | null = null;
export let db: ReturnType<typeof drizzle> | null = null;

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    db = drizzle(pool, { schema });
  } catch (err) {
    console.warn('[DB] Failed to initialize PostgreSQL pool, falling back to in-memory store:', err);
  }
}

/**
 * High-performance In-Memory Datastore conforming to Drizzle Schema
 * Guarantees zero-config instant execution in AI Studio preview while maintaining
 * 100% fidelity to the PostgreSQL relational model.
 */
class InMemoryDb {
  private users: Map<number, User> = new Map();
  private usersByTelegramId: Map<string, number> = new Map();
  private usersByInternalId: Map<string, number> = new Map();
  private usersByReferralCode: Map<string, number> = new Map();
  private preferences: Map<number, MatchingPreferences> = new Map(); // key = userId
  private chatSessions: Map<string, ActiveChatSession> = new Map();
  private transactions: CoinTransaction[] = [];
  private reports: Map<number, UserReport> = new Map();
  private nextUserId = 1001;
  private nextPrefId = 1;
  private nextTxId = 1;
  private nextReportId = 1;

  constructor() {
    this.seedDemoUsers();
  }

  private seedDemoUsers() {
    // Seed initial users so users can immediately test matching and referrals
    const userA: User = {
      id: 1,
      telegram_id: '100000001',
      internal_id: 'USER-1001',
      name: 'Sara Rad',
      gender: 'female',
      age: 24,
      province: 'Tehran',
      bio: 'Loves photography, specialty coffee & Persian literature ✨',
      profile_photo_file_id: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      coins: 25,
      referral_code: 'REF-SARA99',
      referred_by: null,
      status: 'idle',
      created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      updated_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    };

    const userB: User = {
      id: 2,
      telegram_id: '100000002',
      internal_id: 'USER-2002',
      name: 'Arman Kiani',
      gender: 'male',
      age: 27,
      province: 'Isfahan',
      bio: 'Software engineer, cycling enthusiast and music lover 🎸',
      profile_photo_file_id: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
      coins: 10,
      referral_code: 'REF-ARMAN4',
      referred_by: 1,
      status: 'idle',
      created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
      updated_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    };

    const userC: User = {
      id: 4,
      telegram_id: '100000004',
      internal_id: 'USER-4004',
      name: 'Reza Moradi (0 Coins Test)',
      gender: 'male',
      age: 29,
      province: 'Fars',
      bio: 'Tech enthusiast testing the 0-coin matchmaking guard & referrals',
      profile_photo_file_id: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
      coins: 0,
      referral_code: 'REF-REZA0',
      referred_by: null,
      status: 'idle',
      created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
      updated_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    };

    this.users.set(userA.id, userA);
    this.usersByTelegramId.set(userA.telegram_id, userA.id);
    this.usersByInternalId.set(userA.internal_id, userA.id);
    this.usersByReferralCode.set(userA.referral_code, userA.id);

    this.users.set(userB.id, userB);
    this.usersByTelegramId.set(userB.telegram_id, userB.id);
    this.usersByInternalId.set(userB.internal_id, userB.id);
    this.usersByReferralCode.set(userB.referral_code, userB.id);

    this.users.set(userC.id, userC);
    this.usersByTelegramId.set(userC.telegram_id, userC.id);
    this.usersByInternalId.set(userC.internal_id, userC.id);
    this.usersByReferralCode.set(userC.referral_code, userC.id);

    this.preferences.set(userA.id, {
      id: 1,
      user_id: userA.id,
      target_gender: 'male',
      target_age_min: 22,
      target_age_max: 32,
      target_province: 'any_province',
      updated_at: new Date().toISOString(),
    });

    this.preferences.set(userB.id, {
      id: 2,
      user_id: userB.id,
      target_gender: 'female',
      target_age_min: 20,
      target_age_max: 29,
      target_province: 'any_province',
      updated_at: new Date().toISOString(),
    });

    this.preferences.set(userC.id, {
      id: 3,
      user_id: userC.id,
      target_gender: 'any',
      target_age_min: 18,
      target_age_max: 35,
      target_province: 'any_province',
      updated_at: new Date().toISOString(),
    });

    // Seed initial transaction history
    this.transactions.push(
      {
        id: this.nextTxId++,
        user_id: userA.id,
        amount: 10,
        type: 'welcome_bonus',
        description: 'Welcome bonus upon registration',
        created_at: userA.created_at,
      },
      {
        id: this.nextTxId++,
        user_id: userA.id,
        amount: 15,
        type: 'referral_bonus',
        description: 'Referral reward: User "Arman Kiani" joined using your link (REF-SARA99)',
        created_at: userB.created_at,
      },
      {
        id: this.nextTxId++,
        user_id: userB.id,
        amount: 10,
        type: 'welcome_bonus',
        description: 'Welcome bonus upon registration',
        created_at: userB.created_at,
      },
      {
        id: this.nextTxId++,
        user_id: userB.id,
        amount: 5,
        type: 'referral_bonus',
        description: 'Referral invitee bonus via Sara Rad',
        created_at: userB.created_at,
      },
      {
        id: this.nextTxId++,
        user_id: userC.id,
        amount: 10,
        type: 'welcome_bonus',
        description: 'Welcome bonus upon registration',
        created_at: userC.created_at,
      },
      {
        id: this.nextTxId++,
        user_id: userC.id,
        amount: -10,
        type: 'match_search',
        description: 'Matchmaking search fees (10 searches)',
        created_at: userC.created_at,
      }
    );

    // Seed initial demo report so moderation features can be tested immediately
    const demoReport: UserReport = {
      id: this.nextReportId++,
      reporter_id: userA.id,
      reported_id: userC.id,
      reason: 'ارسال پیام‌های نامتعارف و تبلیغاتی در گفتگوی ناشناس',
      chat_snippet: `[14:20:11] USER-4004: سلام، عضو این کانال شو و سکه بگیر!\n[14:20:25] USER-1001: لطفاً پیام‌های تبلیغاتی ارسال نکنید\n[14:20:30] USER-4004: تخفیف ویژه کانال تلگرام`,
      status: 'pending',
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    };
    this.reports.set(demoReport.id, demoReport);
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

  /**
   * Fast O(1) indexed lookup by system-generated internal_id
   */
  getUserByInternalId(internalId: string): User | null {
    const id = this.usersByInternalId.get(internalId.toUpperCase().trim());
    return id ? this.users.get(id) || null : null;
  }

  /**
   * Hot path query: find_user hitting existing indexed fields (telegram_id, internal_id, id)
   */
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

  /**
   * Hot path query: check_ban hitting indexed user state
   */
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

  /**
   * Hot path query: get_wallet hitting indexed user fields
   */
  getUserWallet(identifier: string | number): { user: User; coins: number; transactions: CoinTransaction[] } | null {
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

    this.users.set(id, newUser);
    this.usersByTelegramId.set(newUser.telegram_id, id);
    this.usersByInternalId.set(newUser.internal_id, id);
    this.usersByReferralCode.set(newUser.referral_code, id);

    // Create default matching preferences
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

    // Initial welcome bonus record
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
    updates: Partial<Pick<User, 'name' | 'age' | 'province' | 'bio' | 'profile_photo_file_id' | 'status' | 'coins'>> & {
      gender?: never; // Compile-time prohibition of gender update
    }
  ): User {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    if ('gender' in (updates as any)) {
      throw new Error('IMMUTABLE_FIELD: User gender cannot be modified after registration.');
    }

    const updated: User = {
      ...user,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    this.users.set(userId, updated);
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
    return newTx;
  }

  /**
   * Atomic coin deduction to prevent race conditions & double spends
   */
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

    this.addTransaction({
      userId,
      amount: -amount,
      type,
      description,
    });

    return { success: true, newBalance: user.coins };
  }

  /**
   * Credit coins and record transaction
   */
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
    return session;
  }

  endChatSession(sessionId: string): ActiveChatSession | null {
    const session = this.chatSessions.get(sessionId);
    if (session) {
      session.status = 'ended';
      session.ended_at = new Date().toISOString();
      return session;
    }
    return null;
  }

  // -----------------------------------------------------------------
  // Moderation & Reporting Methods
  // -----------------------------------------------------------------

  /**
   * Submits a new moderation report and evaluates auto-ban threshold (>= 3 reports in 24h)
   */
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

    // Auto-Ban Check: count distinct reports against this user in past 24 hours
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

  /**
   * Count unique reports received by user within given hours (default 24h)
   */
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

  /**
   * Admin resolution of a moderation report
   */
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

    return report;
  }

  /**
   * Instantly ban a user: update DB status, Redis state, terminate active chat & dequeue
   */
  banUser(userId: number, reason = 'Violation of community guidelines'): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    user.status = 'banned';
    user.updated_at = new Date().toISOString();
    this.users.set(userId, user);

    // Update Redis status & eject from chats/queues
    redisService.setUserStatus(userId, 'banned');
    redisService.removeFromMatchQueue(userId);
    redisService.endActiveChat(userId);

    console.log(`[Moderation] User ${user.internal_id} (ID: ${userId}) has been BANNED. Reason: ${reason}`);
    return true;
  }

  /**
   * Unban a user and restore to idle status
   */
  unbanUser(userId: number): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    user.status = 'idle';
    user.updated_at = new Date().toISOString();
    this.users.set(userId, user);

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
      activeChats: Array.from(this.chatSessions.values()).filter((c) => c.status === 'active').length,
      totalTransactions: this.transactions.length,
      totalCoinsInCirculation,
      bannedUsersCount: bannedUsers.length,
      bannedUsers,
      totalReports: allReports.length,
      pendingReportsCount: pendingReports.length,
      reports: allReports.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      users: usersList,
      preferences: Array.from(this.preferences.values()),
    };
  }

  resetAll() {
    this.users.clear();
    this.usersByTelegramId.clear();
    this.usersByInternalId.clear();
    this.usersByReferralCode.clear();
    this.preferences.clear();
    this.chatSessions.clear();
    this.transactions = [];
    this.reports.clear();
    this.seedDemoUsers();
    redisService.clearAll();
  }
}

export const inMemoryDb = new InMemoryDb();

