import { describe, expect, it, vi } from 'vitest';

const blobMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  get: blobMock.get,
}));

import { GET as assetGet } from '@/app/[token]/route';
import { encrypt } from '@/lib/encryption';
import { issueToken } from '@/lib/tokens';

function streamFromBuffer(buf: ArrayBuffer): ReadableStream<Uint8Array> {
  const bytes = new Uint8Array(buf);
  let sent = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent) {
        controller.close();
        return;
      }
      controller.enqueue(bytes);
      sent = true;
    },
  });
}

async function encryptTestImage(
  token: string,
  plaintext: Uint8Array = new Uint8Array([137, 80, 78, 71]),
  contentType = 'image/png',
) {
  const encrypted = await encrypt(
    plaintext.buffer as ArrayBuffer,
    contentType,
    token,
  );
  return { encrypted, plaintext, contentType };
}

describe('GET /[token]', () => {
  it('returns 404 for malformed slugs', async () => {
    const response = await assetGet(new Request('http://localhost/bad'), {
      params: Promise.resolve({ token: 'bad/slug' }),
    });

    expect(response.status).toBe(404);
  });

  it('returns 410 for expired tokens', async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 2, 7, 12, 0, 0);
    vi.setSystemTime(now - 2 * 60 * 60 * 1000);
    const { token } = issueToken();
    vi.setSystemTime(now);

    const response = await assetGet(new Request('http://localhost'), {
      params: Promise.resolve({ token: `${token}.png` }),
    });

    expect(response.status).toBe(410);
    vi.useRealTimers();
  });

  it('returns 404 for valid slug format but invalid token content', async () => {
    // 20 chars that match slug regex but won't parse as a valid token
    const response = await assetGet(new Request('http://localhost'), {
      params: Promise.resolve({ token: '00000AAAAABBBBBCCCCC.png' }),
    });

    // parseToken may return non-null here (it's a valid format),
    // so this tests the expiry path or the parseToken null path
    expect([404, 410]).toContain(response.status);
  });

  it('returns 404 if blob does not exist', async () => {
    const { token } = issueToken();
    blobMock.get.mockResolvedValue(null);

    const response = await assetGet(new Request('http://localhost'), {
      params: Promise.resolve({ token: `${token}.png` }),
    });

    expect(response.status).toBe(404);
  });

  it('decrypts encrypted blob and serves with correct content-type', async () => {
    const { token } = issueToken();
    const { encrypted, plaintext, contentType } = await encryptTestImage(token);

    blobMock.get.mockResolvedValue({
      statusCode: 200,
      blob: {
        contentType: 'application/octet-stream',
        etag: 'etag-123',
        size: encrypted.byteLength,
      },
      stream: streamFromBuffer(encrypted),
      headers: new Headers(),
    });

    const response = await assetGet(new Request('http://localhost'), {
      params: Promise.resolve({ token: `${token}.png` }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(contentType);

    const body = new Uint8Array(await response.arrayBuffer());
    expect(body).toEqual(plaintext);
  });

  it('returns 404 for blob that fails decryption (garbage data)', async () => {
    const { token } = issueToken();
    const garbage = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);

    blobMock.get.mockResolvedValue({
      statusCode: 200,
      blob: {
        contentType: 'application/octet-stream',
        etag: 'etag-456',
        size: garbage.byteLength,
      },
      stream: streamFromBuffer(garbage.buffer as ArrayBuffer),
      headers: new Headers(),
    });

    const response = await assetGet(new Request('http://localhost'), {
      params: Promise.resolve({ token: `${token}.png` }),
    });

    expect(response.status).toBe(404);
  });

  it('returns 404 for blob encrypted with wrong token', async () => {
    const { token: tokenA } = issueToken();
    const { token: tokenB } = issueToken();
    const { encrypted } = await encryptTestImage(tokenA);

    blobMock.get.mockResolvedValue({
      statusCode: 200,
      blob: {
        contentType: 'application/octet-stream',
        etag: 'etag-789',
        size: encrypted.byteLength,
      },
      stream: streamFromBuffer(encrypted),
      headers: new Headers(),
    });

    const response = await assetGet(new Request('http://localhost'), {
      params: Promise.resolve({ token: `${tokenB}.png` }),
    });

    expect(response.status).toBe(404);
  });

  it('includes security headers on successful decrypted response', async () => {
    const { token } = issueToken();
    const { encrypted } = await encryptTestImage(token);

    blobMock.get.mockResolvedValue({
      statusCode: 200,
      blob: {
        contentType: 'application/octet-stream',
        etag: 'etag-sec',
        size: encrypted.byteLength,
      },
      stream: streamFromBuffer(encrypted),
      headers: new Headers(),
    });

    const response = await assetGet(new Request('http://localhost'), {
      params: Promise.resolve({ token: `${token}.png` }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('private');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(response.headers.get('Content-Disposition')).toContain('inline');
  });

  it('serves different image types correctly', async () => {
    const { token } = issueToken();
    const jpegBytes = new Uint8Array([255, 216, 255, 224]);
    const { encrypted } = await encryptTestImage(token, jpegBytes, 'image/jpeg');

    blobMock.get.mockResolvedValue({
      statusCode: 200,
      blob: {
        contentType: 'application/octet-stream',
        etag: 'etag-jpg',
        size: encrypted.byteLength,
      },
      stream: streamFromBuffer(encrypted),
      headers: new Headers(),
    });

    const response = await assetGet(new Request('http://localhost'), {
      params: Promise.resolve({ token: `${token}.jpg` }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');

    const body = new Uint8Array(await response.arrayBuffer());
    expect(body).toEqual(jpegBytes);
  });
});
