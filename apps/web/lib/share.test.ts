import { describe, expect, it } from 'vitest';

import {
  assetFilenameForToken,
  describeExpiry,
  extensionForContentType,
  sharePathForToken,
} from './share';

describe('extensionForContentType', () => {
  it('maps all supported image types', () => {
    expect(extensionForContentType('image/png')).toBe('png');
    expect(extensionForContentType('image/jpeg')).toBe('jpg');
    expect(extensionForContentType('image/webp')).toBe('webp');
    expect(extensionForContentType('image/gif')).toBe('gif');
    expect(extensionForContentType('image/avif')).toBe('avif');
  });

  it('returns null for unsupported types', () => {
    expect(extensionForContentType('application/json')).toBeNull();
    expect(extensionForContentType('text/html')).toBeNull();
    expect(extensionForContentType('video/mp4')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(extensionForContentType(null)).toBeNull();
    expect(extensionForContentType(undefined)).toBeNull();
    expect(extensionForContentType('')).toBeNull();
  });
});

describe('sharePathForToken', () => {
  it('returns /<token> with no /a/ prefix', () => {
    expect(sharePathForToken('abc123', 'png')).toBe('/abc123.png');
    expect(sharePathForToken('abc123', 'jpg')).toBe('/abc123.jpg');
  });

  it('supports missing extension', () => {
    expect(sharePathForToken('abc123')).toBe('/abc123');
    expect(sharePathForToken('abc123', null)).toBe('/abc123');
  });
});

describe('assetFilenameForToken', () => {
  it('uses extension or falls back to img', () => {
    expect(assetFilenameForToken('abc', 'png')).toBe('abc.png');
    expect(assetFilenameForToken('abc', null)).toBe('abc.img');
    expect(assetFilenameForToken('abc', undefined)).toBe('abc.img');
  });
});

describe('describeExpiry', () => {
  it('returns expired for past timestamps', () => {
    const now = Date.now();

    expect(describeExpiry(now - 1000, now)).toBe('expired');
    expect(describeExpiry(now, now)).toBe('expired');
  });

  it('returns minutes only when under 1h', () => {
    const now = Date.now();

    expect(describeExpiry(now + 5 * 60_000, now)).toBe('expires in 5m');
    expect(describeExpiry(now + 29 * 60_000, now)).toBe('expires in 29m');
  });

  it('rounds up partial minutes', () => {
    const now = Date.now();

    expect(describeExpiry(now + 60_001, now)).toBe('expires in 2m');
  });

  it('returns hours when exact', () => {
    const now = Date.now();

    expect(describeExpiry(now + 60 * 60_000, now)).toBe('expires in 1h');
    expect(describeExpiry(now + 120 * 60_000, now)).toBe('expires in 2h');
  });

  it('returns hours + minutes combo', () => {
    const now = Date.now();

    expect(describeExpiry(now + 90 * 60_000, now)).toBe('expires in 1h 30m');
    expect(describeExpiry(now + 150 * 60_000, now)).toBe('expires in 2h 30m');
  });
});
