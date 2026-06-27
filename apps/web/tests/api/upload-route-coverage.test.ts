import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const blobClientMock = vi.hoisted(() => ({
  handleUpload: vi.fn(),
}));

vi.mock('@vercel/blob/client', () => ({
  handleUpload: blobClientMock.handleUpload,
}));

import { POST as uploadPost } from '@/app/api/upload/route';
import { issueToken, parseToken } from '@/lib/tokens';
import { createUploadProof } from '@/lib/upload-proof';

const ORIGINAL_ENV = { ...process.env };

function uploadEvent(pathname: string, clientPayload: string | null = null) {
  return {
    type: 'blob.generate-client-token',
    payload: {
      pathname,
      clientPayload,
      multipart: false,
    },
  };
}

describe('upload route branch coverage', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test_store_secret';
    process.env.GLANCE_UPLOAD_PROOF_SECRET = 'test-proof-secret';

    blobClientMock.handleUpload.mockReset();
    blobClientMock.handleUpload.mockImplementation(async (options: any) => {
      const event = options.body;
      await options.onBeforeGenerateToken(
        event.payload.pathname,
        event.payload.clientPayload,
        event.payload.multipart,
      );
      return { type: 'blob.generate-client-token', clientToken: 'ok' };
    });
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.useRealTimers();
  });

  it('rejects invalid upload pathname payloads', async () => {
    const response = await uploadPost(
      new Request('http://localhost/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadEvent('not-uploads-prefix')),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid upload pathname.',
    });
  });

  it('rejects malformed upload path tokens', async () => {
    const response = await uploadPost(
      new Request('http://localhost/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadEvent('uploads/not-a-token')),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid upload pathname.',
    });
  });

  it('rejects already-expired upload tokens', async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 2, 7, 12, 0, 0);

    vi.setSystemTime(now - 2 * 60 * 60 * 1000);
    const { token } = issueToken();
    vi.setSystemTime(now);

    const response = await uploadPost(
      new Request('http://localhost/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadEvent(`uploads/${token}`)),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Upload token has already expired.',
    });
  });

  it('executes onUploadCompleted callback in happy path', async () => {
    let completedCalled = false;

    blobClientMock.handleUpload.mockImplementation(async (options: any) => {
      const event = options.body;
      await options.onBeforeGenerateToken(
        event.payload.pathname,
        event.payload.clientPayload,
        event.payload.multipart,
      );
      await options.onUploadCompleted({});
      completedCalled = true;
      return { type: 'blob.generate-client-token', clientToken: 'ok' };
    });

    const { token } = issueToken();
    const parsed = parseToken(token)!;
    const pathname = `uploads/${token}`;
    const proof = createUploadProof({
      token,
      pathname,
      tokenExpiresAt: parsed.expiresAt,
    });

    const response = await uploadPost(
      new Request('http://localhost/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadEvent(pathname, proof)),
      }),
    );

    expect(response.status).toBe(200);
    expect(completedCalled).toBe(true);
  });

  it('rejects tokens that exceed allowed lifetime horizon', async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 2, 7, 12, 0, 0);

    vi.setSystemTime(now + 24 * 60 * 60 * 1000);
    const { token } = issueToken();
    vi.setSystemTime(now);

    const response = await uploadPost(
      new Request('http://localhost/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadEvent(`uploads/${token}`)),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Upload token exceeds the allowed lifetime.',
    });
  });
});
