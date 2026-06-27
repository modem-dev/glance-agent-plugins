import { Redis } from '@upstash/redis';

type Entry = {
  count: number;
  resetAt: number;
};

type BucketConfig = {
  maxRequests: number;
  windowMs: number;
  bucket?: string;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

interface CounterStore {
  increment(key: string, ttlMs: number): Promise<number>;
}

const DEFAULT_BUCKET = 'default';
const REDIS_KEY_PREFIX = 'ratelimit';

const memoryStores = new Map<string, Map<string, Entry>>();
const memoryPruneTimers = new Map<string, number>();

let redisStore: CounterStore | null = null;
let useRedisStore = false;
let hasResolvedStore = false;
let testStore: CounterStore | null = null;

function getMemoryStore(bucket: string): Map<string, Entry> {
  let store = memoryStores.get(bucket);
  if (!store) {
    store = new Map();
    memoryStores.set(bucket, store);
  }
  return store;
}

function pruneMemory(bucket: string, windowMs: number, now: number) {
  const last = memoryPruneTimers.get(bucket) ?? 0;
  if (now - last < windowMs) return;

  const store = getMemoryStore(bucket);
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) {
      store.delete(key);
    }
  }

  memoryPruneTimers.set(bucket, now);
}

async function checkMemoryRateLimit(
  ip: string,
  bucket: string,
  maxRequests: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  pruneMemory(bucket, windowMs, now);

  const store = getMemoryStore(bucket);
  const entry = store.get(ip);

  if (!entry || now >= entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true };
}

function hasRedisEnv(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

const INCR_WITH_PEXPIRE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

function resolveRedisStore(): CounterStore {
  if (redisStore) {
    return redisStore;
  }

  const redis = Redis.fromEnv();
  redisStore = {
    async increment(key: string, ttlMs: number): Promise<number> {
      return redis.eval<[string], number>(
        INCR_WITH_PEXPIRE_SCRIPT,
        [key],
        [String(ttlMs)],
      );
    },
  };

  return redisStore;
}

function resolveStore(): CounterStore | null {
  if (testStore) {
    return testStore;
  }

  if (!hasResolvedStore) {
    useRedisStore = hasRedisEnv();
    hasResolvedStore = true;
  }

  if (!useRedisStore) {
    return null;
  }

  return resolveRedisStore();
}

function redisKey(bucket: string, ip: string, windowStart: number): string {
  return `${REDIS_KEY_PREFIX}:${bucket}:${ip}:${windowStart}`;
}

function fixedWindow(now: number, windowMs: number): {
  start: number;
  end: number;
} {
  const start = Math.floor(now / windowMs) * windowMs;
  return { start, end: start + windowMs };
}

/**
 * Test-only hook for injecting a custom store implementation.
 */
export function __setCounterStoreForTests(store: CounterStore | null): void {
  testStore = store;
  useRedisStore = Boolean(store);
  hasResolvedStore = true;
  if (!store) {
    redisStore = null;
  }
}

/**
 * Test-only hook for clearing in-memory local state.
 */
export function __resetRateLimitMemoryForTests(): void {
  memoryStores.clear();
  memoryPruneTimers.clear();
  testStore = null;
  redisStore = null;
  useRedisStore = false;
  hasResolvedStore = false;
}

export async function checkRateLimit(
  ip: string,
  config: BucketConfig = { maxRequests: 20, windowMs: 3_600_000 },
): Promise<RateLimitResult> {
  const bucket = config.bucket ?? DEFAULT_BUCKET;
  const now = Date.now();
  const window = fixedWindow(now, config.windowMs);
  const retryAfterSeconds = Math.ceil(Math.max(window.end - now, 1) / 1000);

  const store = resolveStore();
  if (store) {
    const key = redisKey(bucket, ip, window.start);
    const ttlMs = Math.max(window.end - now, 1);

    try {
      const count = await store.increment(key, ttlMs);
      if (count > config.maxRequests) {
        return {
          allowed: false,
          retryAfterSeconds,
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Distributed rate limit failed, falling back to memory store', error);
      return checkMemoryRateLimit(
        ip,
        bucket,
        config.maxRequests,
        config.windowMs,
        now,
      );
    }
  }

  return checkMemoryRateLimit(ip, bucket, config.maxRequests, config.windowMs, now);
}
