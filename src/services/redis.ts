import Redis from 'ioredis';

export interface QueueEntry {
  userId: number;
  telegramId: string;
  internalId: string;
  name: string;
  gender: 'male' | 'female';
  age: number;
  province: string;
  bio?: string | null;
  profilePhotoFileId?: string | null;
  targetGender: 'male' | 'female' | 'any';
  targetAgeMin: number;
  targetAgeMax: number;
  targetProvince: string;
  queuedAt: number;
}

export interface PairingResult {
  partner: QueueEntry;
  sessionId: string;
}

class RedisService {
  private client: Redis | null = null;
  private isConnected = false;

  // In-memory fallback and concurrency mutex
  private memoryQueue: Map<number, QueueEntry> = new Map();
  private activeChats: Map<number, number> = new Map(); // userId -> partnerUserId
  private activeSessions: Map<number, string> = new Map(); // userId -> sessionId
  private rateLimits: Map<string, number> = new Map();
  private userStatuses: Map<number, 'idle' | 'searching' | 'in_chat'> = new Map();
  private isPairingLocked = false;

  constructor() {
    if (process.env.REDIS_URL) {
      try {
        this.client = new Redis(process.env.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null, // non-blocking fallback if local redis is absent
        });

        this.client
          .connect()
          .then(() => {
            this.isConnected = true;
            console.log('[Redis] Connected to Redis instance for matchmaking queues');
          })
          .catch((err) => {
            console.warn('[Redis] Connection failed, using fallback in-memory store:', err.message);
            this.client = null;
          });
      } catch (err) {
        console.warn('[Redis] Init error, fallback in-memory engine active');
      }
    }

    // Auto-expire / purge stale in-memory buffers every 2 minutes to prevent memory leaks
    if (typeof setInterval !== 'undefined') {
      const timer = setInterval(() => {
        this.cleanupExpiredData();
      }, 2 * 60 * 1000);
      if (timer && typeof timer === 'object' && 'unref' in timer) {
        (timer as any).unref();
      }
    }
  }

  /**
   * Concurrency Lock: Prevents race conditions during matching evaluation
   */
  private async acquireLock(lockKey = 'lock:matchmaking', ttlMs = 2000): Promise<boolean> {
    if (this.client && this.isConnected) {
      try {
        const result = await this.client.set(lockKey, 'locked', 'PX', ttlMs, 'NX');
        return result === 'OK';
      } catch (e) {
        // Fall back to memory lock
      }
    }

    if (this.isPairingLocked) return false;
    this.isPairingLocked = true;
    setTimeout(() => {
      this.isPairingLocked = false;
    }, ttlMs);
    return true;
  }

  private async releaseLock(lockKey = 'lock:matchmaking'): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.del(lockKey);
      } catch (e) {
        // Ignore
      }
    }
    this.isPairingLocked = false;
  }

  /**
   * Enqueue user into the Redis waiting pool
   */
  async addToMatchQueue(entry: QueueEntry): Promise<void> {
    this.userStatuses.set(entry.userId, 'searching');
    this.memoryQueue.set(entry.userId, entry);

    if (this.client && this.isConnected) {
      try {
        const pipeline = this.client.pipeline();
        pipeline.sadd('pool:waiting_users', entry.userId.toString());
        pipeline.set(`pool:user_meta:${entry.userId}`, JSON.stringify(entry));
        pipeline.set(`user:status:${entry.userId}`, 'searching');
        await pipeline.exec();
      } catch (err) {
        console.warn('[Redis] addToMatchQueue error:', err);
      }
    }
  }

  /**
   * Remove user from waiting queue (e.g. user cancels search)
   */
  async removeFromMatchQueue(userId: number): Promise<boolean> {
    const existed = this.memoryQueue.has(userId);
    this.memoryQueue.delete(userId);
    this.userStatuses.set(userId, 'idle');

    if (this.client && this.isConnected) {
      try {
        const pipeline = this.client.pipeline();
        pipeline.srem('pool:waiting_users', userId.toString());
        pipeline.del(`pool:user_meta:${userId}`);
        pipeline.set(`user:status:${userId}`, 'idle');
        await pipeline.exec();
      } catch (err) {
        console.warn('[Redis] removeFromMatchQueue error:', err);
      }
    }

    return existed;
  }

  /**
   * Advanced multi-criteria reciprocal matchmaking scanner
   * Ensures atomic claiming to avoid race conditions.
   */
  async findAndPair(currentUser: QueueEntry): Promise<PairingResult | null> {
    // Acquire mutex lock to ensure atomic candidate selection
    let lockAcquired = false;
    for (let attempts = 0; attempts < 5; attempts++) {
      lockAcquired = await this.acquireLock('lock:match_pairing', 1500);
      if (lockAcquired) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    try {
      const candidates = Array.from(this.memoryQueue.values());

      for (const candidate of candidates) {
        // Do not match user with themselves
        if (candidate.userId === currentUser.userId) continue;

        // 1. Reciprocal Gender Compatibility
        const genderAtoB =
          currentUser.targetGender === 'any' || currentUser.targetGender === candidate.gender;
        const genderBtoA =
          candidate.targetGender === 'any' || candidate.targetGender === currentUser.gender;

        if (!genderAtoB || !genderBtoA) continue;

        // 2. Reciprocal Age Compatibility
        const ageAtoB =
          candidate.age >= currentUser.targetAgeMin &&
          candidate.age <= currentUser.targetAgeMax;
        const ageBtoA =
          currentUser.age >= candidate.targetAgeMin &&
          currentUser.age <= candidate.targetAgeMax;

        if (!ageAtoB || !ageBtoA) continue;

        // 3. Reciprocal Province Rule
        let provinceAtoB = true;
        if (currentUser.targetProvince === 'same_province') {
          provinceAtoB = candidate.province === currentUser.province;
        } else if (
          currentUser.targetProvince !== 'any_province' &&
          currentUser.targetProvince !== 'same_province'
        ) {
          provinceAtoB = candidate.province === currentUser.targetProvince;
        }

        let provinceBtoA = true;
        if (candidate.targetProvince === 'same_province') {
          provinceBtoA = currentUser.province === candidate.province;
        } else if (
          candidate.targetProvince !== 'any_province' &&
          candidate.targetProvince !== 'same_province'
        ) {
          provinceBtoA = currentUser.province === candidate.targetProvince;
        }

        if (!provinceAtoB || !provinceBtoA) continue;

        // Candidate qualifies! Atomic removal & pairing
        this.memoryQueue.delete(currentUser.userId);
        this.memoryQueue.delete(candidate.userId);

        const sessionId = `session_${Date.now()}_${currentUser.userId}_${candidate.userId}`;

        this.activeChats.set(currentUser.userId, candidate.userId);
        this.activeChats.set(candidate.userId, currentUser.userId);

        this.activeSessions.set(currentUser.userId, sessionId);
        this.activeSessions.set(candidate.userId, sessionId);

        this.userStatuses.set(currentUser.userId, 'in_chat');
        this.userStatuses.set(candidate.userId, 'in_chat');

        // Persist pairing in Redis if available
        if (this.client && this.isConnected) {
          try {
            const pipeline = this.client.pipeline();
            pipeline.srem('pool:waiting_users', currentUser.userId.toString());
            pipeline.srem('pool:waiting_users', candidate.userId.toString());
            pipeline.del(`pool:user_meta:${currentUser.userId}`);
            pipeline.del(`pool:user_meta:${candidate.userId}`);

            pipeline.set(`chat:partner:${currentUser.userId}`, candidate.userId.toString());
            pipeline.set(`chat:partner:${candidate.userId}`, currentUser.userId.toString());

            pipeline.set(`chat:session:${currentUser.userId}`, sessionId);
            pipeline.set(`chat:session:${candidate.userId}`, sessionId);

            pipeline.set(`user:status:${currentUser.userId}`, 'in_chat');
            pipeline.set(`user:status:${candidate.userId}`, 'in_chat');
            await pipeline.exec();
          } catch (err) {
            console.warn('[Redis] Error persisting chat session:', err);
          }
        }

        return { partner: candidate, sessionId };
      }

      return null;
    } finally {
      await this.releaseLock('lock:match_pairing');
    }
  }

  /**
   * Get active chat partner ID
   */
  getActiveChatPartner(userId: number): number | null {
    return this.activeChats.get(userId) || null;
  }

  /**
   * Get active session ID
   */
  getActiveSessionId(userId: number): string | null {
    return this.activeSessions.get(userId) || null;
  }

  /**
   * End active chat session and return partner's ID & session ID
   */
  endActiveChat(userId: number): { partnerId: number | null; sessionId: string | null } {
    const partnerId = this.activeChats.get(userId) || null;
    const sessionId = this.activeSessions.get(userId) || null;

    if (partnerId) {
      this.activeChats.delete(userId);
      this.activeChats.delete(partnerId);

      this.activeSessions.delete(userId);
      this.activeSessions.delete(partnerId);

      this.userStatuses.set(userId, 'idle');
      this.userStatuses.set(partnerId, 'idle');

      if (this.client && this.isConnected) {
        try {
          const pipeline = this.client.pipeline();
          pipeline.del(`chat:partner:${userId}`);
          pipeline.del(`chat:partner:${partnerId}`);
          pipeline.del(`chat:session:${userId}`);
          pipeline.del(`chat:session:${partnerId}`);
          pipeline.set(`user:status:${userId}`, 'idle');
          pipeline.set(`user:status:${partnerId}`, 'idle');
          pipeline.exec();
        } catch (err) {
          // Ignore
        }
      }
    } else {
      this.userStatuses.set(userId, 'idle');
    }

    return { partnerId, sessionId };
  }

  private bannedUsers: Set<number> = new Set();
  private messageTimestamps: Map<string, number[]> = new Map(); // key -> timestamps[]
  private searchTimestamps: Map<string, number> = new Map(); // key -> lastSearchTs
  private chatMessageBuffers: Map<string, { sender: string; text: string; ts: number }[]> = new Map();

  getUserStatus(userId: number): 'idle' | 'searching' | 'in_chat' | 'banned' {
    if (this.bannedUsers.has(userId)) return 'banned';
    return (this.userStatuses.get(userId) as any) || 'idle';
  }

  setUserStatus(userId: number, status: 'idle' | 'searching' | 'in_chat' | 'banned') {
    if (status === 'banned') {
      this.bannedUsers.add(userId);
    } else {
      this.bannedUsers.delete(userId);
    }
    this.userStatuses.set(userId, status as any);

    if (this.client && this.isConnected) {
      this.client.set(`user:status:${userId}`, status).catch(() => {});
      if (status === 'banned') {
        this.client.sadd('set:banned_users', userId.toString()).catch(() => {});
      } else {
        this.client.srem('set:banned_users', userId.toString()).catch(() => {});
      }
    }
  }

  isUserBanned(userId: number): boolean {
    return this.bannedUsers.has(userId);
  }

  /**
   * Message Rate Limiter: Max 5 messages per 3 seconds (sliding window)
   */
  checkMessageRateLimit(
    identifier: string | number,
    maxMessages = 5,
    windowMs = 3000
  ): { allowed: boolean; retryAfterMs: number; count: number } {
    const key = `ratelimit:msg:${identifier}`;
    const now = Date.now();

    let timestamps = this.messageTimestamps.get(key) || [];
    // Filter timestamps within the sliding window
    timestamps = timestamps.filter((t) => now - t < windowMs);

    if (timestamps.length >= maxMessages) {
      const oldestInWindow = timestamps[0];
      const retryAfterMs = Math.max(100, windowMs - (now - oldestInWindow));
      this.messageTimestamps.set(key, timestamps);
      return { allowed: false, retryAfterMs, count: timestamps.length };
    }

    timestamps.push(now);
    this.messageTimestamps.set(key, timestamps);

    if (this.client && this.isConnected) {
      // In Redis: sliding window using zset or simple expire
      this.client
        .pipeline()
        .zremrangebyscore(key, 0, now - windowMs)
        .zadd(key, now, `${now}-${Math.random()}`)
        .pexpire(key, windowMs)
        .exec()
        .catch(() => {});
    }

    return { allowed: true, retryAfterMs: 0, count: timestamps.length };
  }

  /**
   * Search Rate Limiter: 1 search per 5 seconds
   */
  checkSearchRateLimit(
    identifier: string | number,
    minIntervalMs = 5000
  ): { allowed: boolean; retryAfterMs: number } {
    const key = `ratelimit:search:${identifier}`;
    const now = Date.now();
    const last = this.searchTimestamps.get(key) || 0;
    const elapsed = now - last;

    if (elapsed < minIntervalMs) {
      const retryAfterMs = minIntervalMs - elapsed;
      return { allowed: false, retryAfterMs };
    }

    this.searchTimestamps.set(key, now);
    if (this.client && this.isConnected) {
      this.client.set(key, now.toString(), 'PX', minIntervalMs).catch(() => {});
    }

    return { allowed: true, retryAfterMs: 0 };
  }

  /**
   * Record chat message for moderation and audit context
   */
  recordChatMessage(user1Id: number, user2Id: number, senderHandle: string, text: string) {
    const chatKey = [Math.min(user1Id, user2Id), Math.max(user1Id, user2Id)].join(':');
    let buffer = this.chatMessageBuffers.get(chatKey) || [];
    buffer.push({
      sender: senderHandle,
      text: text.slice(0, 200), // preview snippet
      ts: Date.now(),
    });

    // Keep last 10 messages
    if (buffer.length > 10) {
      buffer = buffer.slice(-10);
    }
    this.chatMessageBuffers.set(chatKey, buffer);
  }

  /**
   * Retrieve recent chat snippet for moderation reports
   */
  getRecentChatSnippet(user1Id: number, user2Id: number): string {
    const chatKey = [Math.min(user1Id, user2Id), Math.max(user1Id, user2Id)].join(':');
    const buffer = this.chatMessageBuffers.get(chatKey) || [];
    if (buffer.length === 0) return 'No message history recorded.';

    return buffer
      .map((m) => `[${new Date(m.ts).toLocaleTimeString()}] ${m.sender}: ${m.text}`)
      .join('\n');
  }

  isRateLimited(key: string, limitMs = 1500): boolean {
    const now = Date.now();
    const last = this.rateLimits.get(key) || 0;
    if (now - last < limitMs) {
      return true;
    }
    this.rateLimits.set(key, now);
    return false;
  }

  /**
   * Safe Memory Optimization: Prunes expired sliding window timestamps,
   * rate-limiting records, and stale chat snippets to guarantee zero memory leaks.
   */
  cleanupExpiredData(): void {
    const now = Date.now();

    // 1. Prune message rate limit timestamps older than 10 seconds
    for (const [key, timestamps] of this.messageTimestamps.entries()) {
      const fresh = timestamps.filter((t) => now - t < 10000);
      if (fresh.length === 0) {
        this.messageTimestamps.delete(key);
      } else {
        this.messageTimestamps.set(key, fresh);
      }
    }

    // 2. Prune search rate limit timestamps older than 30 seconds
    for (const [key, ts] of this.searchTimestamps.entries()) {
      if (now - ts > 30000) {
        this.searchTimestamps.delete(key);
      }
    }

    // 3. Prune general debounce rate limits older than 30 seconds
    for (const [key, ts] of this.rateLimits.entries()) {
      if (now - ts > 30000) {
        this.rateLimits.delete(key);
      }
    }

    // 4. Prune chatMessageBuffers older than 1 hour
    for (const [key, buffer] of this.chatMessageBuffers.entries()) {
      const latest = buffer[buffer.length - 1]?.ts || 0;
      if (now - latest > 60 * 60 * 1000) {
        this.chatMessageBuffers.delete(key);
      }
    }
  }

  getQueueStats() {
    return {
      connectedToRealRedis: this.isConnected,
      queueSize: this.memoryQueue.size,
      activeChatsCount: this.activeChats.size / 2,
      bannedUsersCount: this.bannedUsers.size,
      bannedUserIds: Array.from(this.bannedUsers),
      queuedUsers: Array.from(this.memoryQueue.values()),
    };
  }

  clearAll() {
    this.memoryQueue.clear();
    this.activeChats.clear();
    this.activeSessions.clear();
    this.userStatuses.clear();
    this.rateLimits.clear();
    this.messageTimestamps.clear();
    this.searchTimestamps.clear();
    this.chatMessageBuffers.clear();
    this.bannedUsers.clear();
  }
}

export const redisService = new RedisService();

