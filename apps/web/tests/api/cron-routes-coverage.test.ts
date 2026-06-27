import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { issueToken } from '@/lib/tokens';

const ORIGINAL_ENV = { ...process.env };

describe('cron routes coverage', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    blobMock.del.mockReset();
    blobMock.list.mockReset();
    sentryMock.metrics.count.mockReset();
  });

  it('rejects cleanup cron with bad auth when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'secret';

    const response = await cleanupGet(
      new Request('http://localhost/api/cron/cleanup', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );

    expect(response.status).toBe(401);
  });

  it('deletes expired blobs during cleanup', async () => {
    process.env.CRON_SECRET = 'secret';

    vi.useFakeTimers();
    const now = Date.UTC(2026, 2, 7, 12, 0, 0);
    vi.setSystemTime(now - 2 * 60 * 60 * 1000);
    const expired = issueToken().token;
    vi.setSystemTime(now);
    const fresh = issueToken().token;

    blobMock.list.mockResolvedValue({
      blobs: [
        { pathname: `uploads/${expired}` },
        { pathname: `uploads/${fresh}` },
      ],
      hasMore: false,
    });

    const response = await cleanupGet(
      new Request('http://localhost/api/cron/cleanup', {
        headers: { authorization: 'Bearer secret' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ deleted: 1, scanned: 2 });
    expect(blobMock.del).toHaveBeenCalledWith([`uploads/${expired}`]);

    vi.useRealTimers();
  });

  it('skips non-token pathnames in blob listing', async () => {
    process.env.CRON_SECRET = 'secret';

    blobMock.list.mockResolvedValue({
      blobs: [
        { pathname: 'uploads/' },
        { pathname: 'random/file.txt' },
      ],
      hasMore: false,
    });

    const response = await cleanupGet(
      new Request('http://localhost/api/cron/cleanup', {
        headers: { authorization: 'Bearer secret' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ deleted: 0, scanned: 2 });
    expect(blobMock.del).not.toHaveBeenCalled();
  });

  it('skips non-expired tokens', async () => {
    process.env.CRON_SECRET = 'secret';

    const fresh = issueToken().token;

    blobMock.list.mockResolvedValue({
      blobs: [{ pathname: `uploads/${fresh}` }],
      hasMore: false,
    });

    const response = await cleanupGet(
      new Request('http://localhost/api/cron/cleanup', {
        headers: { authorization: 'Bearer secret' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ deleted: 0 });
    expect(blobMock.del).not.toHaveBeenCalled();
  });

  it('deletes in batches when many expired blobs are found', async () => {
    process.env.CRON_SECRET = 'secret';

    vi.useFakeTimers();
    const now = Date.UTC(2026, 2, 7, 12, 0, 0);
    vi.setSystemTime(now - 3 * 60 * 60 * 1000);

    const blobs = Array.from({ length: 101 }, () => ({
      pathname: `uploads/${issueToken().token}`,
    }));

    vi.setSystemTime(now);

    blobMock.list.mockResolvedValue({
      blobs,
      hasMore: false,
    });

    const response = await cleanupGet(
      new Request('http://localhost/api/cron/cleanup', {
        headers: { authorization: 'Bearer secret' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ deleted: 101, scanned: 101 });
    expect(blobMock.del).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('iterates through paginated blob listings', async () => {
    process.env.CRON_SECRET = 'secret';

    blobMock.list
      .mockResolvedValueOnce({
        blobs: [{ pathname: 'uploads/not-a-token' }],
        hasMore: true,
        cursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        blobs: [],
        hasMore: false,
      });

    const response = await cleanupGet(
      new Request('http://localhost/api/cron/cleanup', {
        headers: { authorization: 'Bearer secret' },
      }),
    );

    expect(response.status).toBe(200);
    expect(blobMock.list).toHaveBeenCalledTimes(2);
  });

  it('returns 500 when CRON_SECRET is missing in Vercel env', async () => {
    process.env.VERCEL = '1';
    delete process.env.CRON_SECRET;

    const cleanup = await cleanupGet(new Request('http://localhost/api/cron/cleanup'));

    expect(cleanup.status).toBe(500);
  });
});
