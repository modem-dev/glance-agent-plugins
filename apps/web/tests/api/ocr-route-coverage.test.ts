import { beforeEach, describe, expect, it, vi } from 'vitest';

const blobMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

const aiMock = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

const rateLimitMock = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  get: blobMock.get,
}));

vi.mock('ai', () => ({
  generateText: aiMock.generateText,
}));

vi.mock('@ai-sdk/google', () => ({
  google: vi.fn(() => 'gemini-test-model'),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: rateLimitMock.checkRateLimit,
}));

import { POST as ocrPost } from '@/app/api/ocr/route';
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

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[index]);
      index += 1;
    },
  });
}

async function encryptedBlob(token: string, plaintext = new Uint8Array([1, 2, 3]), contentType = 'image/png') {
  const encrypted = await encrypt(plaintext.buffer as ArrayBuffer, contentType, token);
  return {
    blob: { contentType: 'application/octet-stream', url: 'https://blob.example/ocr' },
    stream: streamFromBuffer(encrypted),
  };
}

describe('OCR route coverage', () => {
  beforeEach(() => {
    blobMock.get.mockReset();
    aiMock.generateText.mockReset();
    rateLimitMock.checkRateLimit.mockReset();
    rateLimitMock.checkRateLimit.mockReturnValue({ allowed: true });
  });

  it('returns 429 with Retry-After when rate limited', async () => {
    rateLimitMock.checkRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 123,
    });

    const response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: {
          'x-real-ip': '198.51.100.3',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: 'ignored' }),
      }) as any,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('123');
  });

  it('decrypts blob and returns extracted text for a valid token', async () => {
    const { token } = issueToken();

    blobMock.get.mockResolvedValue(await encryptedBlob(token));
    aiMock.generateText.mockResolvedValue({ text: 'hello world' });

    const response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: {
          'x-real-ip': '198.51.100.4',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      }) as any,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ text: 'hello world' });

    // Verify Gemini received the decrypted content-type, not application/octet-stream
    const call = aiMock.generateText.mock.calls[0][0];
    const fileContent = call.messages[0].content[0];
    expect(fileContent.mediaType).toBe('image/png');
  });

  it('passes the correct decrypted content-type to Gemini', async () => {
    const { token } = issueToken();

    blobMock.get.mockResolvedValue(
      await encryptedBlob(token, new Uint8Array([255, 216, 255]), 'image/jpeg'),
    );
    aiMock.generateText.mockResolvedValue({ text: 'jpeg text' });

    const response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: {
          'x-real-ip': '198.51.100.5',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      }) as any,
    );

    expect(response.status).toBe(200);
    const call = aiMock.generateText.mock.calls[0][0];
    expect(call.messages[0].content[0].mediaType).toBe('image/jpeg');
  });

  it('returns 404 when blob cannot be decrypted (wrong key / corrupt)', async () => {
    const { token: tokenA } = issueToken();
    const { token: tokenB } = issueToken();

    // Encrypt with tokenA but try to decrypt with tokenB
    blobMock.get.mockResolvedValue(await encryptedBlob(tokenA));

    const response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenB }),
      }) as any,
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for invalid JSON body', async () => {
    const response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }) as any,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid request body.' });
  });

  it('returns 410 for expired tokens', async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 2, 7, 12, 0, 0);
    vi.setSystemTime(now - 2 * 60 * 60 * 1000);
    const { token } = issueToken();
    vi.setSystemTime(now);

    const response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }) as any,
    );

    expect(response.status).toBe(410);
    vi.useRealTimers();
  });

  it('returns cached result on second call for same token', async () => {
    const { token } = issueToken();

    blobMock.get.mockResolvedValue(await encryptedBlob(token));
    aiMock.generateText.mockResolvedValue({ text: 'cached text' });

    // First call - hits Gemini
    await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: { 'x-real-ip': '198.51.100.20', 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }) as any,
    );

    // Second call - should use cache
    aiMock.generateText.mockReset();
    const response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: { 'x-real-ip': '198.51.100.20', 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }) as any,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ text: 'cached text' });
    expect(aiMock.generateText).not.toHaveBeenCalled();
  });

  it('prunes expired cache entries and recomputes OCR', async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const { token } = issueToken();

    blobMock.get.mockImplementation(async () => encryptedBlob(token));
    aiMock.generateText.mockResolvedValue({ text: 'first text' });

    await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: { 'x-real-ip': '198.51.100.21', 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }) as any,
    );

    // Advance beyond cache TTL (30m) and prune interval (60s),
    // while keeping token valid (issueToken rounds expiry to next minute).
    vi.setSystemTime(now + 30 * 60 * 1000 + 1);

    aiMock.generateText.mockResolvedValue({ text: 'second text' });
    const response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: { 'x-real-ip': '198.51.100.21', 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }) as any,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ text: 'second text' });
    expect(aiMock.generateText).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('returns 404 when blob fetch throws', async () => {
    const { token } = issueToken();
    blobMock.get.mockRejectedValue(new Error('blob store error'));

    const response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }) as any,
    );

    expect(response.status).toBe(404);
  });

  it('rejects missing/invalid tokens before OCR work', async () => {
    let response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }) as any,
    );
    expect(response.status).toBe(400);

    response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'not-a-token' }),
      }) as any,
    );
    expect(response.status).toBe(400);
  });

  it('returns 404 when the referenced image is missing', async () => {
    const { token } = issueToken();
    blobMock.get.mockResolvedValue(null);

    const response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }) as any,
    );

    expect(response.status).toBe(404);
  });

  it('returns 413 when OCR stream exceeds size cap', async () => {
    const { token } = issueToken();

    blobMock.get.mockResolvedValue({
      blob: { contentType: 'application/octet-stream', url: 'https://blob.example/ocr-big' },
      stream: streamFromChunks([new Uint8Array(10 * 1024 * 1024 + 1)]),
    });

    const response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }) as any,
    );

    expect(response.status).toBe(413);
  });
});
