import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const blobClientMock = vi.hoisted(() => ({
  handleUpload: vi.fn(),
}));

vi.mock('@vercel/blob/client', () => ({
  handleUpload: blobClientMock.handleUpload,
}));

import { UPLOAD_TOKEN_TTL_MS } from '@/lib/config';
import { POST as issuePost } from '@/app/api/issue/route';
import { POST as uploadPost } from '@/app/api/upload/route';

type IssueResponse = {
  expiresAt: number;
  pathname: string;
  token: string;
  uploadProof: string;
};

const ORIGINAL_ENV = { ...process.env };

function uploadEvent(pathname: string, clientPayload: string | null) {
  return {
    type: 'blob.generate-client-token',
    payload: {
      pathname,
      clientPayload,
      multipart: false,
    },
  };
}

async function issue(ip: string) {
  const response = await issuePost(
    new Request('http://localhost/api/issue', {
      method: 'POST',
      headers: { 'x-real-ip': ip },
    }) as any,
  );

  return {
    response,
    payload: (await response.json()) as IssueResponse,
  };
}

async function requestUpload(pathname: string, proof: string | null) {
  return uploadPost(
    new Request('http://localhost/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploadEvent(pathname, proof)),
    }),
  );
}

describe('issue + upload contract', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test_store_secret';
    process.env.GLANCE_UPLOAD_PROOF_SECRET = 'upload-proof-contract-secret';

    blobClientMock.handleUpload.mockReset();
    blobClientMock.handleUpload.mockImplementation(async (options: any) => {
      const event = options.body;
      if (event?.type !== 'blob.generate-client-token') {
        throw new Error('Unexpected upload event type in test.');
      }

      await options.onBeforeGenerateToken(
        event.payload.pathname,
        event.payload.clientPayload,
        event.payload.multipart,
      );

      return {
        type: 'blob.generate-client-token',
        clientToken: 'client-token-from-mock',
      };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = ORIGINAL_ENV;
  });

  it('issues an upload proof with each token', async () => {
    const { response, payload } = await issue('198.51.100.11');

    expect(response.status).toBe(200);
    expect(payload.token).toHaveLength(20);
    expect(payload.pathname).toBe(`uploads/${payload.token}`);
    expect(payload.expiresAt).toBeTypeOf('number');
    expect(payload.uploadProof).toBeTypeOf('string');
    expect(payload.uploadProof.length).toBeGreaterThan(20);
  });

  it('accepts /api/upload only when proof matches issued token + pathname', async () => {
    const { payload } = await issue('198.51.100.12');

    const response = await requestUpload(payload.pathname, payload.uploadProof);
    const body = (await response.json()) as {
      clientToken?: string;
      type?: string;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      type: 'blob.generate-client-token',
      clientToken: 'client-token-from-mock',
    });
  });

  it('rejects uploads without proof (legacy bypass attempt)', async () => {
    const { payload } = await issue('198.51.100.13');

    const response = await requestUpload(payload.pathname, null);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing upload proof.',
    });
  });

  it('rejects tampered proofs', async () => {
    const { payload } = await issue('198.51.100.14');

    const response = await requestUpload(
      payload.pathname,
      `${payload.uploadProof}x`,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid upload proof signature.',
    });
  });

  it('rejects proofs reused on a different pathname/token', async () => {
    const first = await issue('198.51.100.15');
    const second = await issue('198.51.100.16');

    const response = await requestUpload(
      first.payload.pathname,
      second.payload.uploadProof,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Upload proof does not match upload token.',
    });
  });

  it('rejects expired proofs', async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 2, 7, 12, 0, 0);
    vi.setSystemTime(now);

    const { payload } = await issue('198.51.100.17');

    vi.setSystemTime(now + UPLOAD_TOKEN_TTL_MS + 1);

    const response = await requestUpload(payload.pathname, payload.uploadProof);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Upload proof has expired.',
    });
  });
});
