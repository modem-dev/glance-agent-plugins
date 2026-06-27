import { randomInt } from 'node:crypto';

import {
  MINUTE_MS,
  SHARE_TTL_MS,
  TOKEN_EPOCH_MS,
  TOKEN_PREFIX_LENGTH,
  TOKEN_RANDOM_LENGTH,
  UPLOADS_PREFIX,
} from '@/lib/config';
export {
  assetFilenameForToken,
  describeExpiry,
  extensionForContentType,
  formatExpiryUtc,
  sharePathForToken,
} from './share';

const BASE36_EPOCH_MINUTE = Math.floor(TOKEN_EPOCH_MS / MINUTE_MS);
const RANDOM_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const TOKEN_PATTERN = new RegExp(
  `^[0-9a-z]{${TOKEN_PREFIX_LENGTH}}[A-Za-z0-9]{${TOKEN_RANDOM_LENGTH}}$`,
);
const EXTENSION_PATTERN = /^[a-z0-9]+$/;

export type ParsedToken = {
  expired: boolean;
  expiresAt: number;
  token: string;
};

function alignToMinute(timestamp: number): number {
  return Math.ceil(timestamp / MINUTE_MS) * MINUTE_MS;
}

function encodeExpiry(expiresAt: number): string {
  const expiryMinute = Math.floor(expiresAt / MINUTE_MS);
  const offset = expiryMinute - BASE36_EPOCH_MINUTE;

  if (offset < 0) {
    throw new Error('Expiry cannot be before token epoch');
  }

  const encoded = offset.toString(36).padStart(TOKEN_PREFIX_LENGTH, '0');
  if (encoded.length > TOKEN_PREFIX_LENGTH) {
    throw new Error('Expiry exceeded token capacity');
  }

  return encoded;
}

function decodeExpiry(prefix: string): number {
  const offset = Number.parseInt(prefix, 36);
  return (BASE36_EPOCH_MINUTE + offset) * MINUTE_MS;
}

function randomSegment(length: number): string {
  let result = '';

  for (let index = 0; index < length; index += 1) {
    result += RANDOM_ALPHABET[randomInt(RANDOM_ALPHABET.length)];
  }

  return result;
}

export function issueToken(now = Date.now(), ttlMs = SHARE_TTL_MS): {
  expiresAt: number;
  token: string;
} {
  const expiresAt = alignToMinute(now + ttlMs);
  const token = `${encodeExpiry(expiresAt)}${randomSegment(TOKEN_RANDOM_LENGTH)}`;

  return { token, expiresAt };
}

export function isValidToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function parseToken(token: string, now = Date.now()): ParsedToken | null {
  if (!isValidToken(token)) {
    return null;
  }

  const expiresAt = decodeExpiry(token.slice(0, TOKEN_PREFIX_LENGTH));

  return {
    token,
    expiresAt,
    expired: now >= expiresAt,
  };
}

export function pathForToken(token: string): string {
  return `${UPLOADS_PREFIX}${token}`;
}

export function parseAssetSlug(
  slug: string,
): { extension: string | null; token: string } | null {
  const [token, extensionPart, ...rest] = slug.split('.');

  if (rest.length > 0 || !isValidToken(token)) {
    return null;
  }

  if (!extensionPart) {
    return { token, extension: null };
  }

  const extension = extensionPart.toLowerCase();
  if (!EXTENSION_PATTERN.test(extension)) {
    return null;
  }

  return { token, extension };
}

export function tokenFromPathname(pathname: string): string | null {
  if (!pathname.startsWith(UPLOADS_PREFIX)) {
    return null;
  }

  const token = pathname.slice(UPLOADS_PREFIX.length);
  return isValidToken(token) ? token : null;
}

export function resultPathForToken(token: string): string {
  return `/p/${token}`;
}
