import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const blobMock = vi.hoisted(() => ({
  del: vi.fn(),
  list: vi.fn(),
}));

const sentryMock = vi.hoisted(() => ({
  metrics: {
    count: vi.fn(),
  },
}));

vi.mock('@vercel/blob', () => ({
  del: blobMock.del,
  list: blobMock.list,
}));

vi.mock('@sentry/nextjs', () => sentryMock);

import { GET as cleanupGet } from '@/app/api/cron/cleanup/route';

const ORIGINAL_ENV = { ...process.env };

describe('cron endpoint auth contract', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.CRON_SECRET;
    delete process.env.GLANCE_ALLOW_UNAUTHENTICATED_CRON;
    delete process.env.AGENTPASTE_ALLOW_UNAUTHENTICATED_CRON;
    delete process.env.VERCEL;

    blobMock.del.mockReset();
    blobMock.list.mockReset();
    blobMock.list.mockResolvedValue({ blobs: [], hasMore: false });

    sentryMock.metrics.count.mockReset();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('denies by default when CRON_SECRET is unset', async () => {
    const cleanup = await cleanupGet(new Request('http://localhost/api/cron/cleanup'));

    expect(cleanup.status).toBe(500);
    await expect(cleanup.json()).resolves.toMatchObject({
      error: expect.stringContaining('CRON_SECRET is required'),
    });
  });

  it('rejects bad bearer token and accepts a valid secret', async () => {
    process.env.CRON_SECRET = 'super-secret';

    const badCleanup = await cleanupGet(
      new Request('http://localhost/api/cron/cleanup', {
        headers: { authorization: 'Bearer nope' },
      }),
    );

    expect(badCleanup.status).toBe(401);

    const goodCleanup = await cleanupGet(
      new Request('http://localhost/api/cron/cleanup', {
        headers: { authorization: 'Bearer super-secret' },
      }),
    );

    expect(goodCleanup.status).toBe(200);
  });

  it('allows local-dev bypass only when explicitly enabled', async () => {
    process.env.NODE_ENV = 'development';
    process.env.GLANCE_ALLOW_UNAUTHENTICATED_CRON = '1';

    const cleanup = await cleanupGet(new Request('http://localhost/api/cron/cleanup'));

    expect(cleanup.status).toBe(200);
  });
});
