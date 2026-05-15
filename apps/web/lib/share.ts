const MINUTE_MS = 60_000;
const CONTENT_TYPE_EXTENSION_MAP = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export function extensionForContentType(
  contentType: string | null | undefined,
): string | null {
  if (!contentType) {
    return null;
  }

  return (
    CONTENT_TYPE_EXTENSION_MAP[
      contentType as keyof typeof CONTENT_TYPE_EXTENSION_MAP
    ] ?? null
  );
}

export function assetFilenameForToken(
  token: string,
  extension: string | null | undefined,
): string {
  return `${token}.${extension ?? 'img'}`;
}

export function sharePathForToken(
  token: string,
  extension?: string | null,
): string {
  return `/${token}${extension ? `.${extension}` : ''}`;
}

export function formatExpiryUtc(expiresAt: number): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    timeZoneName: 'short',
    year: 'numeric',
  }).format(expiresAt);
}

export function describeExpiry(
  expiresAt: number,
  now = Date.now(),
): string {
  const delta = expiresAt - now;

  if (delta <= 0) {
    return 'expired';
  }

  const minutes = Math.ceil(delta / MINUTE_MS);
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;

  if (hours === 0) {
    return `expires in ${minutes}m`;
  }

  if (remainderMinutes === 0) {
    return `expires in ${hours}h`;
  }

  return `expires in ${hours}h ${remainderMinutes}m`;
}
