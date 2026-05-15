import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  __resetRateLimitMemoryForTests,
  __setCounterStoreForTests,
  checkRateLimit,
} from './rate-limit';

describe('checkRateLimit', () => {
  afterEach(() => {
    __resetRateLimitMemoryForTests();
  });

  it('allows requests under the limit', async () => {
    const bucket = `test-under-${Date.now()}`;
    const result = await checkRateLimit('10.0.0.1', {
      bucket,
      maxRequests: 5,
      windowMs: 60_000,
    });

    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBeUndefined();
  });

  it('blocks requests over the limit', async () => {
    const bucket = `test-over-${Date.now()}`;
    const config = { bucket, maxRequests: 3, windowMs: 60_000 };

    await checkRateLimit('10.0.0.2', config);
    await checkRateLimit('10.0.0.2', config);
    await checkRateLimit('10.0.0.2', config);
    const fourth = await checkRateLimit('10.0.0.2', config);

    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('returns correct retryAfterSeconds', async () => {
    const bucket = `test-retry-${Date.now()}`;
    const config = { bucket, maxRequests: 1, windowMs: 30_000 };

    await checkRateLimit('10.0.0.3', config);
    const blocked = await checkRateLimit('10.0.0.3', config);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(30);
  });

  it('separate buckets do not interfere', async () => {
    const ts = Date.now();
    const configA = { bucket: `bucket-a-${ts}`, maxRequests: 1, windowMs: 60_000 };
    const configB = { bucket: `bucket-b-${ts}`, maxRequests: 1, windowMs: 60_000 };

    await checkRateLimit('10.0.0.4', configA);
    const blockedA = await checkRateLimit('10.0.0.4', configA);
    const allowedB = await checkRateLimit('10.0.0.4', configB);

    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });

  it('separate IPs do not interfere', async () => {
    const bucket = `test-ips-${Date.now()}`;
    const config = { bucket, maxRequests: 1, windowMs: 60_000 };

    await checkRateLimit('10.0.0.5', config);
    const blockedFirst = await checkRateLimit('10.0.0.5', config);
    const allowedSecond = await checkRateLimit('10.0.0.6', config);

    expect(blockedFirst.allowed).toBe(false);
    expect(allowedSecond.allowed).toBe(true);
  });

  it('exactly at the limit is allowed, one over is blocked', async () => {
    const bucket = `test-boundary-${Date.now()}`;
    const config = { bucket, maxRequests: 2, windowMs: 60_000 };

    const first = await checkRateLimit('10.0.0.7', config);
    const second = await checkRateLimit('10.0.0.7', config);
    const third = await checkRateLimit('10.0.0.7', config);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
  });

  it('uses injected distributed store and keeps fixed-window retry semantics', async () => {
    const sharedCounts = new Map<string, number>();

    __setCounterStoreForTests({
      async increment(key) {
        const next = (sharedCounts.get(key) ?? 0) + 1;
        sharedCounts.set(key, next);
        return next;
      },
    });

    const config = {
      bucket: `distributed-${Date.now()}`,
      maxRequests: 2,
      windowMs: 60_000,
    };

    expect((await checkRateLimit('198.51.100.1', config)).allowed).toBe(true);
    expect((await checkRateLimit('198.51.100.1', config)).allowed).toBe(true);

    const blocked = await checkRateLimit('198.51.100.1', config);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('clears distributed store when null is passed to setCounterStore', async () => {
    __setCounterStoreForTests({
      async increment() { return 1; },
    });

    // Clear it
    __setCounterStoreForTests(null);

    // Should fall back to memory
    const result = await checkRateLimit('10.0.0.99', {
      bucket: `clear-test-${Date.now()}`,
      maxRequests: 5,
      windowMs: 60_000,
    });
    expect(result.allowed).toBe(true);
  });

  it('prunes expired in-memory entries after a full window', async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 2, 7, 12, 0, 0);
    vi.setSystemTime(now);

    const bucket = `prune-${Date.now()}`;
    const config = { bucket, maxRequests: 1, windowMs: 1_000 };

    // Create two entries
    await checkRateLimit('10.0.0.200', config);
    await checkRateLimit('10.0.0.201', config);

    // Move beyond window to trigger prune path
    vi.setSystemTime(now + 2_000);
    const result = await checkRateLimit('10.0.0.202', config);

    expect(result.allowed).toBe(true);
    vi.useRealTimers();
  });

  it('falls back to memory limiter when distributed backend fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    __setCounterStoreForTests({
      async increment() {
        throw new Error('redis unavailable');
      },
    });

    const config = {
      bucket: `fallback-${Date.now()}`,
      maxRequests: 1,
      windowMs: 60_000,
    };

    const first = await checkRateLimit('203.0.113.2', config);
    const second = await checkRateLimit('203.0.113.2', config);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSeconds).toBeGreaterThan(0);

    errorSpy.mockRestore();
  });
});
