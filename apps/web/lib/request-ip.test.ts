import { describe, expect, it } from 'vitest';

import { getRequestIp } from './request-ip';

describe('getRequestIp', () => {
  it('uses first value from x-forwarded-for', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
    });

    expect(getRequestIp(request)).toBe('203.0.113.10');
  });

  it('falls back to x-real-ip when forwarded-for first value is blank', () => {
    const request = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '   , 10.0.0.1',
        'x-real-ip': '198.51.100.20',
      },
    });

    expect(getRequestIp(request)).toBe('198.51.100.20');
  });

  it('returns unknown when no forwarding headers are present', () => {
    const request = new Request('http://localhost');

    expect(getRequestIp(request)).toBe('unknown');
  });
});
