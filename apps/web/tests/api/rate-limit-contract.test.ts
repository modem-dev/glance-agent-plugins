import { beforeEach, describe, expect, it } from 'vitest';

import { POST as issuePost } from '@/app/api/issue/route';
import { POST as ocrPost } from '@/app/api/ocr/route';
import { __resetRateLimitMemoryForTests } from '@/lib/rate-limit';

describe('rate-limit headers and limits', () => {
  beforeEach(() => {
    __resetRateLimitMemoryForTests();
  });

  it('returns Retry-After for upload issue limit (30/hr)', async () => {
    const ip = '198.51.100.200';
    let response: Response | null = null;

    for (let i = 0; i < 31; i += 1) {
      response = await issuePost(
        new Request('http://localhost/api/issue', {
          method: 'POST',
          headers: { 'x-real-ip': ip },
        }) as any,
      );
    }

    if (!response) {
      throw new Error('Expected response from /api/issue');
    }

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).not.toBeNull();
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('returns Retry-After for OCR limit (20/hr)', async () => {
    const ip = '198.51.100.201';
    let response: Response | null = null;

    for (let i = 0; i < 21; i += 1) {
      response = await ocrPost(
        new Request('http://localhost/api/ocr', {
          method: 'POST',
          headers: {
            'x-real-ip': ip,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: 'not-a-valid-token' }),
        }) as any,
      );
    }

    if (!response) {
      throw new Error('Expected response from /api/ocr');
    }

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).not.toBeNull();
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
  });
});
