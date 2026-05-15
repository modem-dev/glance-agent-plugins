import * as Sentry from '@sentry/nextjs';
import { del, list } from '@vercel/blob';
import { NextResponse } from 'next/server';

import { authorizeCronRequest } from '@/lib/cron-auth';
import { CLEANUP_BATCH_SIZE, UPLOADS_PREFIX } from '@/lib/config';
import { parseToken, tokenFromPathname } from '@/lib/tokens';
async function deleteBatch(pathnames: string[]): Promise<void> {
  await del(pathnames);
}

export async function GET(request: Request): Promise<NextResponse | Response> {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  let cursor: string | undefined;
  let deleted = 0;
  let scanned = 0;
  const toDelete: string[] = [];

  do {
    const page = await list({
      cursor,
      limit: 1000,
      prefix: UPLOADS_PREFIX,
    });

    scanned += page.blobs.length;

    for (const blob of page.blobs) {
      const token = tokenFromPathname(blob.pathname);
      if (!token) {
        continue;
      }

      const parsed = parseToken(token);
      if (!parsed?.expired) {
        continue;
      }

      toDelete.push(blob.pathname);

      if (toDelete.length >= CLEANUP_BATCH_SIZE) {
        const batch = toDelete.splice(0, toDelete.length);
        await deleteBatch(batch);
        deleted += batch.length;
      }
    }

    cursor = page.cursor;

    if (!page.hasMore) {
      break;
    }
  } while (cursor);

  if (toDelete.length > 0) {
    deleted += toDelete.length;
    await deleteBatch(toDelete);
  }

  Sentry.metrics.count('cleanup.run', 1);
  Sentry.metrics.count('cleanup.scanned', scanned);
  Sentry.metrics.count('cleanup.deleted', deleted);

  return NextResponse.json({
    deleted,
    now: new Date().toISOString(),
    scanned,
  });
}
