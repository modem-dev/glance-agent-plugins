export const APP_NAME = 'glance-sh';
export const TOKEN_PREFIX_LENGTH = 5;
export const TOKEN_RANDOM_LENGTH = 15;
export const TOKEN_EPOCH_MS = Date.UTC(2025, 0, 1);
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const UPLOADS_PREFIX = 'uploads/';

const DEFAULT_TTL_MINUTES = 30;
const DEFAULT_MAX_UPLOAD_MB = 15;
const DEFAULT_UPLOAD_TOKEN_TTL_SECONDS = 300;
const DEFAULT_CLEANUP_BATCH_SIZE = 100;
const CLOCK_SKEW_MINUTES = 5;

export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

type NumberOptions = {
  max?: number;
  min?: number;
};

function readEnv(name: string, legacyName?: string): string | undefined {
  return process.env[name] ?? (legacyName ? process.env[legacyName] : undefined);
}

function readNumber(
  value: string | undefined,
  fallback: number,
  options: NumberOptions = {},
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (options.min !== undefined && parsed < options.min) {
    return options.min;
  }

  if (options.max !== undefined && parsed > options.max) {
    return options.max;
  }

  return parsed;
}

export const SHARE_TTL_MINUTES = readNumber(
  readEnv('GLANCE_TTL_MINUTES', 'AGENTPASTE_TTL_MINUTES'),
  DEFAULT_TTL_MINUTES,
  { min: 5, max: 1440 },
);

export const SHARE_TTL_MS = SHARE_TTL_MINUTES * MINUTE_MS;

/** Human-readable TTL label, e.g. "30m" or "2h". */
export const SHARE_TTL_LABEL =
  SHARE_TTL_MINUTES >= 60 && SHARE_TTL_MINUTES % 60 === 0
    ? `${SHARE_TTL_MINUTES / 60}h`
    : `${SHARE_TTL_MINUTES}m`;

export const MAX_UPLOAD_MB = readNumber(
  readEnv('GLANCE_MAX_UPLOAD_MB', 'AGENTPASTE_MAX_UPLOAD_MB'),
  DEFAULT_MAX_UPLOAD_MB,
  { min: 1, max: 64 },
);

export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export const UPLOAD_TOKEN_TTL_MS =
  readNumber(
    readEnv(
      'GLANCE_UPLOAD_TOKEN_TTL_SECONDS',
      'AGENTPASTE_UPLOAD_TOKEN_TTL_SECONDS',
    ),
    DEFAULT_UPLOAD_TOKEN_TTL_SECONDS,
    { min: 60, max: 3600 },
  ) * 1000;

export const CLEANUP_BATCH_SIZE = readNumber(
  readEnv('GLANCE_CLEANUP_BATCH_SIZE', 'AGENTPASTE_CLEANUP_BATCH_SIZE'),
  DEFAULT_CLEANUP_BATCH_SIZE,
  { min: 1, max: 1000 },
);

export const MAX_ALLOWED_EXPIRY_AHEAD_MS =
  SHARE_TTL_MS + CLOCK_SKEW_MINUTES * MINUTE_MS;
