import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = vi.hoisted(() => {
  const data = new Map<string, string>();
  const ttl = new Map<string, number>();

  const client = {
    set: vi.fn(async (key: string, value: string, options?: { ex?: number }) => {
      data.set(key, value);
      if (options?.ex !== undefined) {
        ttl.set(key, options.ex);
      }
      return 'OK';
    }),
    get: vi.fn(async (key: string) => data.get(key) ?? null),
    exists: vi.fn(async (key: string) => (data.has(key) ? 1 : 0)),
    ttl: vi.fn(async (key: string) => ttl.get(key) ?? -2),
  };

  return {
    client,
    data,
    ttl,
    reset() {
      data.clear();
      ttl.clear();
      client.set.mockClear();
      client.get.mockClear();
      client.exists.mockClear();
      client.ttl.mockClear();
    },
  };
});

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv() {
      return redisMock.client;
    },
  },
}));

import {
  MAX_SESSION_EVENTS,
  createSession,
  getEvents,
  pushEvent,
  sessionExists,
} from './sessions';

describe('sessions store', () => {
  beforeEach(() => {
    redisMock.reset();
  });

  it('creates URL-safe 12-char session IDs', async () => {
    const id = await createSession();

    expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(await sessionExists(id)).toBe(true);
  });

  it('returns null events for unknown session', async () => {
    await expect(getEvents('missing')).resolves.toBeNull();
  });

  it('rejects invalid session ids before hitting redis', async () => {
    await expect(sessionExists('bad')).resolves.toBe(false);
    await expect(getEvents('bad')).resolves.toBeNull();
    await expect(
      pushEvent('bad', {
        url: 'https://glance.sh/nope.png',
        expiresAt: Date.now() + 60_000,
      }),
    ).resolves.toBe(false);

    expect(redisMock.client.exists).not.toHaveBeenCalled();
  });

  it('pushes and reads events for an existing session', async () => {
    const id = await createSession();

    const pushed = await pushEvent(id, {
      url: 'https://glance.sh/abc.png',
      expiresAt: Date.now() + 60_000,
    });

    expect(pushed).toBe(true);
    await expect(getEvents(id)).resolves.toEqual([
      {
        url: 'https://glance.sh/abc.png',
        expiresAt: expect.any(Number),
      },
    ]);
  });

  it('keeps only the most recent bounded set of events', async () => {
    const id = await createSession();

    for (let index = 0; index < MAX_SESSION_EVENTS + 5; index += 1) {
      await pushEvent(id, {
        url: `https://glance.sh/${index}.png`,
        expiresAt: Date.now() + 60_000,
      });
    }

    const events = await getEvents(id);

    expect(events).toHaveLength(MAX_SESSION_EVENTS);
    expect(events?.[0]?.url).toBe('https://glance.sh/5.png');
    expect(events?.at(-1)?.url).toBe(
      `https://glance.sh/${MAX_SESSION_EVENTS + 4}.png`,
    );
  });

  it('returns false when pushing to missing session', async () => {
    const pushed = await pushEvent('missing', {
      url: 'https://glance.sh/missing.png',
      expiresAt: Date.now() + 60_000,
    });

    expect(pushed).toBe(false);
  });

  it('handles object payloads from redis get when reading events', async () => {
    const id = await createSession();

    redisMock.client.get.mockResolvedValueOnce({
      id,
      createdAt: Date.now(),
      events: [{ url: 'https://glance.sh/object.png', expiresAt: Date.now() + 1000 }],
    });

    await expect(getEvents(id)).resolves.toEqual([
      { url: 'https://glance.sh/object.png', expiresAt: expect.any(Number) },
    ]);
  });

  it('handles object payloads from redis get when pushing events', async () => {
    const id = await createSession();
    const redisKey = `session:${id}`;

    redisMock.ttl.set(redisKey, 42);
    redisMock.client.get.mockResolvedValueOnce({
      id,
      createdAt: Date.now(),
      events: [],
    });

    const pushed = await pushEvent(id, {
      url: 'https://glance.sh/object-push.png',
      expiresAt: Date.now() + 60_000,
    });

    expect(pushed).toBe(true);
  });

  it('falls back to default TTL when redis ttl is non-positive', async () => {
    const id = await createSession();
    const redisKey = `session:${id}`;

    redisMock.ttl.set(redisKey, -1);

    const pushed = await pushEvent(id, {
      url: 'https://glance.sh/default-ttl.png',
      expiresAt: Date.now() + 60_000,
    });

    expect(pushed).toBe(true);
    expect(redisMock.client.set).toHaveBeenLastCalledWith(
      redisKey,
      expect.any(String),
      { ex: 600 },
    );
  });

  it('preserves remaining session ttl when pushing events', async () => {
    const id = await createSession();
    const redisKey = `session:${id}`;

    redisMock.ttl.set(redisKey, 42);

    const pushed = await pushEvent(id, {
      url: 'https://glance.sh/ttl.png',
      expiresAt: Date.now() + 60_000,
    });

    expect(pushed).toBe(true);
    expect(redisMock.client.set).toHaveBeenLastCalledWith(
      redisKey,
      expect.any(String),
      { ex: 42 },
    );
  });

  it('returns null for malformed JSON session payloads', async () => {
    const id = await createSession();
    redisMock.data.set(`session:${id}`, '{bad-json');

    await expect(getEvents(id)).resolves.toBeNull();
    await expect(
      pushEvent(id, {
        url: 'https://glance.sh/bad-json.png',
        expiresAt: Date.now() + 60_000,
      }),
    ).resolves.toBe(false);
  });

  it('returns null when session payload has invalid shape', async () => {
    const id = await createSession();

    redisMock.data.set(`session:${id}`, JSON.stringify(null));
    await expect(getEvents(id)).resolves.toBeNull();

    redisMock.data.set(
      `session:${id}`,
      JSON.stringify({ createdAt: 'not-a-number', events: [] }),
    );
    await expect(getEvents(id)).resolves.toBeNull();
  });
});
