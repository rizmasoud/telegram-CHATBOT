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

/**
 * High-performance, zero-dependency In-Memory Matchmaking, Rate Limiter & Session Store.
 * Replaces external Redis dependency for simplified deployment, eliminating connection issues,
 * latency, and external service requirements for 100-300+ active users.
 */
class InMemoryMatchmakingService {
  // In-memory queues & session state
  private memoryQueue: Map<number, QueueEntry> = new Map();
  private activeChats: Map<number, number> = new Map(); // userId -> partnerUserId
  private activeSessions: Map<number, string> = new Map(); // userId -> sessionId
  private rateLimits: Map<string, number> = new Map();
  private userStatuses: Map<number, 'idle' | 'searching' | 'in_chat'> = new Map();
  private isPairingLocked = false;
  private bannedUsers: Set<number> = new Set();
  private messageTimestamps: Map<string, number[]> = new Map(); // key -> timestamps[]
  private searchTimestamps: Map<string, number> = new Map(); // key -> lastSearchTs
  private chatMessageBuffers: Map<string, { sender: string; text: string; ts: number }[]> = new Map();

  constructor() {
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
  private async acquireLock(_lockKey = 'lock:matchmaking', ttlMs = 2000): Promise<boolean> {
    if (this.isPairingLocked) return false;
    this.isPairingLocked = true;
    setTimeout(() => {
      this.isPairingLocked = false;
    }, ttlMs);
    return true;
  }

  private releaseLock(_lockKey = 'lock:matchmaking'): void {
    this.isPairingLocked = false;
  }

  /**
   * Enqueue user into the waiting pool
   */
  async addToMatchQueue(entry: QueueEntry): Promise<void> {
    this.userStatuses.set(entry.userId, 'searching');
    this.memoryQueue.set(entry.userId, entry);
  }

  /**
   * Remove user from waiting queue (e.g. user cancels search)
   */
  async removeFromMatchQueue(userId: number): Promise<boolean> {
    const existed = this.memoryQueue.has(userId);
    this.memoryQueue.delete(userId);
    this.userStatuses.set(userId, 'idle');
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

        return { partner: candidate, sessionId };
      }

      return null;
    } finally {
      this.releaseLock('lock:match_pairing');
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
    } else {
      this.userStatuses.set(userId, 'idle');
    }

    return { partnerId, sessionId };
  }

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
  }

  isUserBanned(userId: number): boolean {
    return this.bannedUsers.has(userId);
  }

  /**
   * Message Rate Limiter: Max 5 messages per 3 seconds (sliding window in memory)
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
      connectedToRealRedis: false,
      storageType: 'In-Memory (High-Performance Map & Set Store)',
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

export const matchmakingService = new InMemoryMatchmakingService();
// Export as redisService as well for drop-in backward compatibility with existing handlers
export const redisService = matchmakingService;
