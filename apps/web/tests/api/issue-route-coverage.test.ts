import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { POST as issuePost } from '@/app/api/issue/route';

const ORIGINAL_ENV = { ...process.env };

describe('issue route coverage', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns 429 with Retry-After when upload issuance is rate limited', async () => {
    const ip = '198.51.100.55';
    let response: Response | null = null;

    for (let i = 0; i < 31; i += 1) {
      response = await issuePost(
        new Request('http://localhost/api/issue', {
          method: 'POST',
          headers: { 'x-real-ip': ip },
        }) as any,
      );
    }

    if (!response) throw new Error('Expected response');

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).not.toBeNull();
  });

  it('extracts IP from x-forwarded-for header', async () => {
    process.env.GLANCE_UPLOAD_PROOF_SECRET = 'test-secret';

    const response = await issuePost(
      new Request('http://localhost/api/issue', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
      }) as any,
    );

    expect(response.status).toBe(200);
  });

  it('falls back to unknown IP when no headers present', async () => {
    process.env.GLANCE_UPLOAD_PROOF_SECRET = 'test-secret';

    const response = await issuePost(
      new Request('http://localhost/api/issue', {
        method: 'POST',
      }) as any,
    );

    expect(response.status).toBe(200);
  });

  it('returns 500 when upload proof secret configuration is missing', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.GLANCE_UPLOAD_PROOF_SECRET;

    const response = await issuePost(
      new Request('http://localhost/api/issue', {
        method: 'POST',
        headers: { 'x-real-ip': '198.51.100.56' },
      }) as any,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Upload service is misconfigured.',
    });
  });
});
