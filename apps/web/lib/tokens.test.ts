import { describe, expect, it } from 'vitest';

import {
  assetFilenameForToken,
  extensionForContentType,
  formatExpiryUtc,
  issueToken,
  isValidToken,
  parseAssetSlug,
  parseToken,
  pathForToken,
  resultPathForToken,
  sharePathForToken,
  tokenFromPathname,
} from './tokens';

describe('tokens', () => {
  it('issueToken creates a valid round-trippable token', () => {
    const now = Date.UTC(2026, 2, 6, 12, 0, 0);
    const { token, expiresAt } = issueToken(now, 4 * 60 * 60 * 1000);
    const parsed = parseToken(token, now);

    expect(parsed).toEqual({
      token,
      expiresAt,
      expired: false,
    });
    expect(token).toHaveLength(20);
    expect(isValidToken(token)).toBe(true);
  });

  it('parseToken marks expired tokens correctly', () => {
    const now = Date.UTC(2026, 2, 6, 12, 0, 0);
    const { token, expiresAt } = issueToken(now, 60 * 60 * 1000);
    const parsed = parseToken(token, expiresAt + 1);

    expect(parsed?.expired).toBe(true);
  });

  it('token path helpers round-trip uploads pathnames', () => {
    const { token } = issueToken(Date.UTC(2026, 2, 6, 12, 0, 0));
    const pathname = pathForToken(token);

    expect(tokenFromPathname(pathname)).toBe(token);
    expect(tokenFromPathname('avatars/not-a-token')).toBeNull();
    expect(sharePathForToken(token, 'png')).toBe(`/${token}.png`);
  });

  it('asset slug helpers keep token and extension aligned', () => {
    const { token } = issueToken(Date.UTC(2026, 2, 6, 12, 0, 0));

    expect(parseAssetSlug(`${token}.PNG`)).toEqual({
      token,
      extension: 'png',
    });
    expect(parseAssetSlug(`${token}.bad-ext!`)).toBeNull();
    expect(assetFilenameForToken(token, 'webp')).toBe(`${token}.webp`);
  });

  it('content types map to the expected file extensions', () => {
    expect(extensionForContentType('image/jpeg')).toBe('jpg');
    expect(extensionForContentType('image/png')).toBe('png');
    expect(extensionForContentType('application/json')).toBeNull();
  });

  it('invalid tokens are rejected', () => {
    expect(parseToken('bad-token')).toBeNull();
    expect(isValidToken('bad-token')).toBe(false);
  });

  it('formatExpiryUtc renders a UTC timestamp', () => {
    const formatted = formatExpiryUtc(Date.UTC(2026, 2, 6, 12, 34, 0));

    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/UTC$/);
  });

  it('resultPathForToken returns /p/<token>', () => {
    expect(resultPathForToken('abc123')).toBe('/p/abc123');
  });

  it('parseToken returns null for tokens with corrupt expiry prefix', () => {
    // Valid format but prefix that triggers decode error
    const fakeToken = '!!!!!abcdefghijklmno';
    expect(parseToken(fakeToken)).toBeNull();
  });

  it('issueToken throws when expiry is before token epoch', () => {
    // Token epoch is Jan 1 2025 — issuing a token with a date far before that
    expect(() => issueToken(0, 1000)).toThrow(/before token epoch/);
  });

  it('issueToken throws when expiry exceeds prefix capacity', () => {
    // 36^5 minutes of capacity (~115 years). 200 years should overflow.
    const twoHundredYearsMs = 200 * 365 * 24 * 60 * 60 * 1000;
    expect(() => issueToken(Date.UTC(2026, 0, 1), twoHundredYearsMs)).toThrow(
      /token capacity/,
    );
  });

  it('sharePathForToken omits extension when null', () => {
    const { token } = issueToken(Date.UTC(2026, 2, 6, 12, 0, 0));
    expect(sharePathForToken(token)).toBe(`/${token}`);
    expect(sharePathForToken(token, null)).toBe(`/${token}`);
  });

  it('parseAssetSlug returns token with null extension for bare tokens', () => {
    const { token } = issueToken(Date.UTC(2026, 2, 6, 12, 0, 0));
    const result = parseAssetSlug(token);
    expect(result).toEqual({ token, extension: null });
  });

  it('parseAssetSlug rejects slugs with multiple dots', () => {
    const { token } = issueToken(Date.UTC(2026, 2, 6, 12, 0, 0));
    expect(parseAssetSlug(`${token}.a.b`)).toBeNull();
  });

  it('tokenFromPathname rejects valid prefix with invalid token', () => {
    expect(tokenFromPathname('uploads/short')).toBeNull();
  });
});
