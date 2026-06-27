import { describe, expect, it } from 'vitest';

import {
  ALLOWED_IMAGE_TYPES,
  CLEANUP_BATCH_SIZE,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  MINUTE_MS,
  SHARE_TTL_LABEL,
  SHARE_TTL_MINUTES,
  SHARE_TTL_MS,
  TOKEN_PREFIX_LENGTH,
  TOKEN_RANDOM_LENGTH,
  UPLOAD_TOKEN_TTL_MS,
} from './config';

describe('config defaults', () => {
  it('default TTL is 30 minutes', () => {
    expect(SHARE_TTL_MINUTES).toBe(30);
    expect(SHARE_TTL_MS).toBe(30 * MINUTE_MS);
  });

  it('TTL label is 30m at default', () => {
    expect(SHARE_TTL_LABEL).toBe('30m');
  });

  it('token dimensions add up to 20', () => {
    expect(TOKEN_PREFIX_LENGTH + TOKEN_RANDOM_LENGTH).toBe(20);
  });

  it('max upload is 15 MB by default', () => {
    expect(MAX_UPLOAD_MB).toBe(15);
    expect(MAX_UPLOAD_BYTES).toBe(15 * 1024 * 1024);
  });

  it('upload token TTL default is 5 minutes', () => {
    expect(UPLOAD_TOKEN_TTL_MS).toBe(300_000);
  });

  it('cleanup batch size default is 100', () => {
    expect(CLEANUP_BATCH_SIZE).toBe(100);
  });

  it('allowed image types include the 5 supported formats', () => {
    expect(ALLOWED_IMAGE_TYPES).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/avif',
    ]);
  });
});
