import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = vi.hoisted(() => ({
  eval: vi.fn(),
}));

const fromEnvMock = vi.hoisted(() => vi.fn(() => redisMock));

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: fromEnvMock,
  },
}));

const ORIGINAL_ENV = { ...process.env };

describe('rate limit redis store path', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      UPSTASH_REDIS_REST_URL: 'https://redis.example',
      UPSTASH_REDIS_REST_TOKEN: 'token',
    };
    redisMock.eval.mockReset();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('uses Redis.fromEnv store when redis env vars are present', async () => {
    vi.resetModules();
    const mod = await import('./rate-limit');

    redisMock.eval.mockResolvedValue(1);

    const result = await mod.checkRateLimit('198.51.100.9', {
      bucket: 'redis-bucket',
      maxRequests: 2,
      windowMs: 60_000,
    });

    // Second call should reuse cached redisStore (line 101 path)
    await mod.checkRateLimit('198.51.100.9', {
      bucket: 'redis-bucket',
      maxRequests: 2,
      windowMs: 60_000,
    });

    expect(result.allowed).toBe(true);
    expect(redisMock.eval).toHaveBeenCalledTimes(2);
    expect(fromEnvMock).toHaveBeenCalledTimes(1);

    mod.__resetRateLimitMemoryForTests();
  });

  it('returns blocked response from redis counter when over limit', async () => {
    vi.resetModules();
    const mod = await import('./rate-limit');

    redisMock.eval.mockResolvedValue(3);

    const result = await mod.checkRateLimit('198.51.100.10', {
      bucket: 'redis-bucket-2',
      maxRequests: 2,
      windowMs: 60_000,
    });

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);

    mod.__resetRateLimitMemoryForTests();
  });
});
