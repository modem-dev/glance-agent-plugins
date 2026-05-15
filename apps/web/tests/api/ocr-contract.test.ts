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

const sentryMock = vi.hoisted(() => ({
  captureException: vi.fn(),
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

vi.mock('@sentry/nextjs', () => sentryMock);

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

describe('POST /api/ocr', () => {
  beforeEach(() => {
    blobMock.get.mockReset();
    aiMock.generateText.mockReset();
    rateLimitMock.checkRateLimit.mockReset();
    sentryMock.captureException.mockReset();

    rateLimitMock.checkRateLimit.mockReturnValue({ allowed: true });
  });

  it('returns sanitized OCR errors without leaking upstream details', async () => {
    const { token } = issueToken();
    const encrypted = await encrypt(
      new Uint8Array([1, 2, 3]).buffer as ArrayBuffer,
      'image/png',
      token,
    );

    blobMock.get.mockResolvedValue({
      blob: {
        contentType: 'application/octet-stream',
        url: 'https://blob.example/ocr',
      },
      stream: streamFromBuffer(encrypted),
    });

    aiMock.generateText.mockRejectedValue(
      new Error('upstream model timeout: request id abc123'),
    );

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await ocrPost(
      new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-real-ip': '198.51.100.44',
        },
        body: JSON.stringify({ token }),
      }) as any,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'OCR processing failed.',
    });

    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
