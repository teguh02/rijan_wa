/**
 * Rate Limiting Utility for Message APIs
 * 
 * Prevents spam and abuse of message sending endpoints.
 * Uses in-memory sliding window counter approach with automatic cleanup.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // milliseconds
}

/**
 * In-memory rate limit store
 * Key format: "${tenantId}:${deviceId}:${endpoint}"
 */
class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Check if request is within rate limit
   * Returns: { allowed: boolean, remaining: number, resetIn: number }
   */
  check(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    // Create new entry or use existing
    if (!entry || now >= entry.resetAt) {
      // Window expired, reset
      const newEntry: RateLimitEntry = {
        count: 1,
        resetAt: now + config.windowMs,
      };
      this.store.set(key, newEntry);
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetIn: config.windowMs,
      };
    }

    // Within current window
    const remaining = config.maxRequests - entry.count;
    if (entry.count < config.maxRequests) {
      entry.count++;
      return {
        allowed: true,
        remaining: remaining - 1,
        resetIn: entry.resetAt - now,
      };
    }

    // Limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetIn: entry.resetAt - now,
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Reset all rate limits for a device
   */
  resetDevice(tenantId: string, deviceId: string): void {
    const prefix = `${tenantId}:${deviceId}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Destroy and cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }

  /**
   * Get stats for debugging (admin only)
   */
  getStats(): { totalKeys: number; entries: Array<{ key: string; count: number; resetIn: number }> } {
    const now = Date.now();
    const entries = Array.from(this.store.entries())
      .filter(([_, entry]) => now < entry.resetAt)
      .map(([key, entry]) => ({
        key,
        count: entry.count,
        resetIn: entry.resetAt - now,
      }));

    return {
      totalKeys: entries.length,
      entries,
    };
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

/**
 * Rate limit configurations for different message endpoints
 */
export const MESSAGE_RATE_LIMITS: Record<string, RateLimitConfig> = {
  text: {
    maxRequests: 60,
    windowMs: 60 * 1000, // 1 minute
  },
  media: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute (slower for media due to file processing)
  },
  location: {
    maxRequests: 40,
    windowMs: 60 * 1000, // 1 minute
  },
  contact: {
    maxRequests: 40,
    windowMs: 60 * 1000, // 1 minute
  },
  reaction: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute (reactions are lightweight)
  },
  poll: {
    maxRequests: 40,
    windowMs: 60 * 1000, // 1 minute
  },
  forward: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute
  },
  group: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 1 minute (group ops are more expensive)
  },
};

/**
 * Generate rate limit key for a message operation
 * Format: "tenantId:deviceId:endpoint"
 */
export function generateRateLimitKey(
  tenantId: string,
  deviceId: string,
  endpoint: string
): string {
  return `${tenantId}:${deviceId}:${endpoint}`;
}

/**
 * Check rate limit and throw error if exceeded
 * Returns headers to include in response (Retry-After, X-RateLimit-*, etc)
 */
export function checkMessageRateLimit(
  tenantId: string,
  deviceId: string,
  endpoint: string
): {
  allowed: boolean;
  headers: Record<string, string | number>;
  message?: string;
} {
  const config = MESSAGE_RATE_LIMITS[endpoint];
  if (!config) {
    throw new Error(`Unknown endpoint: ${endpoint}`);
  }

  const key = generateRateLimitKey(tenantId, deviceId, endpoint);
  const result = rateLimiter.check(key, config);

  const headers: Record<string, string | number> = {
    'X-RateLimit-Limit': config.maxRequests,
    'X-RateLimit-Remaining': Math.max(0, result.remaining),
    'X-RateLimit-Reset': Math.ceil(result.resetIn / 1000),
  };

  if (!result.allowed) {
    headers['Retry-After'] = Math.ceil(result.resetIn / 1000);
    return {
      allowed: false,
      headers,
      message: `Rate limit exceeded for ${endpoint} messages. Max ${config.maxRequests} requests per minute. Retry after ${Math.ceil(result.resetIn / 1000)} seconds.`,
    };
  }

  return {
    allowed: true,
    headers,
  };
}
