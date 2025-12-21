/**
 * Insight Cache Service
 * Caches soul insights to reduce redundant calculations
 * Uses in-memory caching with TTL (Time To Live)
 */

class InsightCache {
  constructor() {
    this.cache = new Map(); // userId -> { data, timestamp, expiresAt }
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes default TTL
    this.maxCacheSize = 100; // Maximum number of entries to prevent memory issues

    // Clean up expired entries every minute
    this.startCleanupInterval();
  }

  /**
   * Generate cache key for user and optional platform
   */
  getCacheKey(userId, platform = null) {
    return platform ? `${userId}:${platform}` : userId;
  }

  /**
   * Set insight data in cache
   * @param {string} userId - User identifier
   * @param {any} data - Insight data to cache
   * @param {string} platform - Optional platform identifier
   * @param {number} ttl - Time to live in milliseconds
   */
  set(userId, data, platform = null, ttl = null) {
    const key = this.getCacheKey(userId, platform);
    const expirationTime = ttl || this.defaultTTL;

    // Enforce cache size limit
    if (this.cache.size >= this.maxCacheSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + expirationTime
    });

    console.log(`[InsightCache] Cached insights for ${key}, expires in ${expirationTime}ms`);
  }

  /**
   * Get cached insight data
   * @param {string} userId - User identifier
   * @param {string} platform - Optional platform identifier
   * @returns {any|null} - Cached data or null if not found/expired
   */
  get(userId, platform = null) {
    const key = this.getCacheKey(userId, platform);
    const entry = this.cache.get(key);

    if (!entry) {
      console.log(`[InsightCache] Cache miss for ${key}`);
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      console.log(`[InsightCache] Cache expired for ${key}`);
      this.cache.delete(key);
      return null;
    }

    const age = Date.now() - entry.timestamp;
    console.log(`[InsightCache] Cache hit for ${key}, age: ${age}ms`);
    return entry.data;
  }

  /**
   * Check if cache has valid (non-expired) data
   * @param {string} userId - User identifier
   * @param {string} platform - Optional platform identifier
   * @returns {boolean}
   */
  has(userId, platform = null) {
    const data = this.get(userId, platform);
    return data !== null;
  }

  /**
   * Invalidate cache for a user
   * @param {string} userId - User identifier
   * @param {string} platform - Optional platform identifier
   */
  invalidate(userId, platform = null) {
    const key = this.getCacheKey(userId, platform);
    const deleted = this.cache.delete(key);

    if (deleted) {
      console.log(`[InsightCache] Invalidated cache for ${key}`);
    }
  }

  /**
   * Invalidate all cache entries for a user
   * @param {string} userId - User identifier
   */
  invalidateUser(userId) {
    let deletedCount = 0;

    for (const key of this.cache.keys()) {
      if (key.startsWith(userId)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[InsightCache] Invalidated ${deletedCount} cache entries for user ${userId}`);
    }
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[InsightCache] Cleared ${size} cache entries`);
  }

  /**
   * Get cache statistics
   * @returns {object} - Cache statistics
   */
  getStats() {
    let validCount = 0;
    let expiredCount = 0;
    const now = Date.now();

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expiredCount++;
      } else {
        validCount++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries: validCount,
      expiredEntries: expiredCount,
      maxSize: this.maxCacheSize,
      utilizationPercent: Math.round((this.cache.size / this.maxCacheSize) * 100)
    };
  }

  /**
   * Evict oldest entry when cache is full
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`[InsightCache] Evicted oldest entry: ${oldestKey}`);
    }
  }

  /**
   * Clean up expired entries periodically
   */
  cleanupExpired() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[InsightCache] Cleaned up ${cleanedCount} expired entries`);
    }
  }

  /**
   * Start interval to clean up expired entries
   */
  startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000); // Run every minute
  }

  /**
   * Stop the cleanup interval (useful for tests)
   */
  stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Decorator function to wrap a function with caching
   * @param {Function} fn - Function to wrap
   * @param {Function} keyGenerator - Function to generate cache key from arguments
   * @param {number} ttl - Optional TTL override
   * @returns {Function} - Wrapped function with caching
   */
  withCache(fn, keyGenerator, ttl = null) {
    const cache = this;

    return async function(...args) {
      const cacheKey = keyGenerator(...args);

      // Check cache first
      const cachedData = cache.get(cacheKey);
      if (cachedData !== null) {
        return cachedData;
      }

      // Execute function and cache result
      const result = await fn.apply(this, args);
      cache.set(cacheKey, result, null, ttl);

      return result;
    };
  }
}

// Export singleton instance
export default new InsightCache();

// Also export class for testing
export { InsightCache };