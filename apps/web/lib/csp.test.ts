import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy } from './csp';

describe('buildContentSecurityPolicy', () => {
  it('omits unsafe-eval in production policy', () => {
    const policy = buildContentSecurityPolicy({ isDev: false });

    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com");
  });

  it('keeps unsafe-eval in development policy', () => {
    const policy = buildContentSecurityPolicy({ isDev: true });

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });
});
