import { del } from '@vercel/blob';
import { upload } from '@vercel/blob/client';
import { afterEach, describe, expect, it } from 'vitest';

type IssueResponse = {
  token: string;
  pathname: string;
  expiresAt: number;
  uploadProof: string;
};

const BASE_URL = process.env.LIVE_E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const ENABLED = process.env.RUN_LIVE_E2E === '1';
const describeLive = ENABLED ? describe : describe.skip;

const uploadedPathnames = new Set<string>();

const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9xq4QAAAAASUVORK5CYII=';

async function issueToken(): Promise<IssueResponse> {
  const response = await fetch(`${BASE_URL}/api/issue`, { method: 'POST' });
  expect(response.status).toBe(200);
  return response.json() as Promise<IssueResponse>;
}

describeLive('live upload-proof integration', () => {
  afterEach(async () => {
    if (uploadedPathnames.size === 0) {
      return;
    }

    const pathnames = [...uploadedPathnames];
    uploadedPathnames.clear();

    try {
      await del(pathnames);
    } catch {
      // best effort cleanup; TTL + cleanup cron are a fallback
    }
  });

  it(
    'accepts signed upload proofs and rejects missing/tampered proofs',
    async () => {
      const issue = await issueToken();

      expect(issue.token).toHaveLength(20);
      expect(issue.pathname).toBe(`uploads/${issue.token}`);
      expect(issue.uploadProof.length).toBeGreaterThan(20);

      const missingProofResponse = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'blob.generate-client-token',
          payload: {
            pathname: issue.pathname,
            clientPayload: null,
            multipart: false,
          },
        }),
      });

      expect(missingProofResponse.status).toBe(400);
      await expect(missingProofResponse.json()).resolves.toEqual({
        error: 'Missing upload proof.',
      });

      const tamperedProofResponse = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'blob.generate-client-token',
          payload: {
            pathname: issue.pathname,
            clientPayload: `${issue.uploadProof}x`,
            multipart: false,
          },
        }),
      });

      expect(tamperedProofResponse.status).toBe(400);
      await expect(tamperedProofResponse.json()).resolves.toEqual({
        error: 'Invalid upload proof signature.',
      });

      const imageBytes = Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64');
      const imageBlob = new Blob([imageBytes], { type: 'image/png' });

      const uploaded = await upload(issue.pathname, imageBlob, {
        access: 'private',
        contentType: 'image/png',
        clientPayload: issue.uploadProof,
        handleUploadUrl: `${BASE_URL}/api/upload`,
      });

      uploadedPathnames.add(uploaded.pathname);

      expect(uploaded.pathname).toBe(issue.pathname);
      expect(uploaded.contentType).toBe('image/png');

      const shareResponse = await fetch(`${BASE_URL}/${issue.token}.png`);
      expect(shareResponse.status).toBe(200);
      expect(shareResponse.headers.get('content-type')).toContain('image/png');
      expect(shareResponse.headers.get('cache-control')).toContain('private');
    },
    30_000,
  );
});
