/**
 * In-Memory Cache Client (Redis Replacement)
 * Used to satisfy the 'cache' interface without requiring a Redis server.
 */

class InMemoryCache {
    constructor() {
        this.cache = new Map();
        this.ttls = new Map();
    }

    async get(key) {
        if (!this.cache.has(key)) {
            return null;
        }

        const ttl = this.ttls.get(key);
        if (ttl && Date.now() > ttl) {
            this.cache.delete(key);
            this.ttls.delete(key);
            return null;
        }

        return this.cache.get(key);
    }

    async set(key, value, options = {}) {
        this.cache.set(key, value);
        if (options.EX) {
            // options.EX is in seconds
            this.ttls.set(key, Date.now() + (options.EX * 1000));
        } else if (typeof options === 'number') {
            // Handle case where 3rd arg is just a number (seconds)
            this.ttls.set(key, Date.now() + (options * 1000));
        }
        return 'OK';
    }

    async del(key) {
        this.cache.delete(key);
        this.ttls.delete(key);
        return 1;
    }

    async flushAll() {
        this.cache.clear();
        this.ttls.clear();
        return 'OK';
    }

    async keys(pattern = '*') {
        if (pattern === '*') {
            return Array.from(this.cache.keys());
        }
        // Simple regex for glob patterns
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return Array.from(this.cache.keys()).filter(key => regex.test(key));
    }

    async quit() {
        return 'OK';
    }
}

// Global singleton instance
const cache = new InMemoryCache();

// Stub for the redisClient to prevent breaking imports that expect it
const redisClient = {
    connect: async () => 'OK',
    on: () => { },
    ping: async () => 'PONG',
    ...cache // Mix in cache methods just in case someone uses redisClient directly
};

const isRedisAvailable = false; // Explicitly false as we are not using Redis

// No-op for compatibility
async function ensureInitialized() {
    return true;
}

module.exports = {
    cache,
    redisClient,
    isRedisAvailable,
    ensureInitialized,
};
