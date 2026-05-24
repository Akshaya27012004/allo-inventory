// src/lib/redis.ts
import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis: Redis | null };

function createRedis(): Redis | null {
  if (process.env.USE_REDIS === "false") return null;
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableReadyCheck: false,
  });

  client.on("error", (err) => {
    // Log but don't crash — fallback to DB locking
    console.error("[Redis] Connection error:", err.message);
  });

  return client;
}

export const redis: Redis | null =
  globalForRedis.redis !== undefined
    ? globalForRedis.redis
    : (globalForRedis.redis = createRedis());

/**
 * Acquire a distributed lock via Redis SET NX PX.
 * Returns a release function, or null if lock could not be acquired.
 */
export async function acquireLock(
  key: string,
  ttlMs = 5000
): Promise<(() => Promise<void>) | null> {
  if (!redis) return null;

  const token = crypto.randomUUID();
  const lockKey = `lock:${key}`;

  const acquired = await redis.set(lockKey, token, "PX", ttlMs, "NX");
  if (!acquired) return null;

  const release = async () => {
    // Lua script ensures we only delete our own lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis!.eval(script, 1, lockKey, token);
  };

  return release;
}
