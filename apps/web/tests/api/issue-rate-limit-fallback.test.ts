import { describe, expect, it, vi } from 'vitest';

const rateLimitMock = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: rateLimitMock.checkRateLimit,
}));

// Keep proof generation from failing in this test.
vi.mock('@/lib/upload-proof', async () => {
  const actual = await vi.importActual<typeof import('@/lib/upload-proof')>('@/lib/upload-proof');
  return {
    ...actual,
    createUploadProof: vi.fn(() => 'proof'),
  };
});

import { POST as issuePost } from '@/app/api/issue/route';

describe('issue route rate-limit fallback', () => {
  it('uses Retry-After=3600 when rate limiter omits retryAfterSeconds', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ allowed: false });

    const response = await issuePost(
      new Request('http://localhost/api/issue', {
        method: 'POST',
      }) as any,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('3600');
  });
});
