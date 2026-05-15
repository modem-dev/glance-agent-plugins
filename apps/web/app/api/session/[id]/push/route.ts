import { MAX_ALLOWED_EXPIRY_AHEAD_MS } from '@/lib/config';
import { checkRateLimit } from '@/lib/rate-limit';
import { getRequestIp } from '@/lib/request-ip';
import { pushEvent, sessionExists } from '@/lib/sessions';
import { parseAssetSlug, parseToken } from '@/lib/tokens';

const PUSH_RATE_LIMIT = {
  bucket: 'session-push',
  maxRequests: 240,
  windowMs: 3_600_000,
};

function canonicalOrigin(url: URL): string {
  const host = url.host.replace(/^www\./i, '');
  return `${url.protocol}//${host}`;
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const first = value.split(',')[0]?.trim();
  return first || null;
}

function requestOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const host =
    firstHeaderValue(request.headers.get('x-forwarded-host')) ??
    firstHeaderValue(request.headers.get('host')) ??
    requestUrl.host;
  const normalizedHost = host.replace(/^www\./i, '');

  const forwardedProto = firstHeaderValue(
    request.headers.get('x-forwarded-proto'),
  )?.toLowerCase();

  const proto =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : normalizedHost.startsWith('localhost') || normalizedHost.startsWith('127.0.0.1')
        ? 'http'
        : 'https';

  return `${proto}://${normalizedHost}`;
}

function isAllowedOrigin(url: URL, currentRequestOrigin: string): boolean {
  const allowedOrigins = new Set<string>([
    canonicalOrigin(new URL(currentRequestOrigin)),
  ]);

  if (process.env.NEXT_PUBLIC_BASE_URL) {
    try {
      allowedOrigins.add(
        canonicalOrigin(new URL(process.env.NEXT_PUBLIC_BASE_URL)),
      );
    } catch {
      // ignore malformed base URL env
    }
  }

  return allowedOrigins.has(canonicalOrigin(url));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ip = getRequestIp(req);
  const { allowed, retryAfterSeconds } = await checkRateLimit(
    ip,
    PUSH_RATE_LIMIT,
  );

  if (!allowed) {
    return Response.json(
      { error: 'Too many session updates. Try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds ?? 3600) },
      },
    );
  }

  const { id } = await params;

  if (!(await sessionExists(id))) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  let body: { url?: string; expiresAt?: number };
  try {
    body = (await req.json()) as { url?: string; expiresAt?: number };
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.url || typeof body.url !== 'string') {
    return Response.json({ error: 'Missing url' }, { status: 400 });
  }

  if (!body.expiresAt || typeof body.expiresAt !== 'number') {
    return Response.json({ error: 'Missing expiresAt' }, { status: 400 });
  }

  const currentOrigin = requestOrigin(req);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.url, currentOrigin);
  } catch {
    return Response.json({ error: 'Invalid url' }, { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return Response.json({ error: 'Invalid url protocol' }, { status: 400 });
  }

  if (!isAllowedOrigin(parsedUrl, currentOrigin)) {
    return Response.json({ error: 'URL must be a first-party glance link' }, { status: 400 });
  }

  if (parsedUrl.search || parsedUrl.hash) {
    return Response.json({ error: 'URL must not include query/hash' }, { status: 400 });
  }

  const slug = parsedUrl.pathname.replace(/^\/+/, '');
  if (!slug || slug.includes('/')) {
    return Response.json({ error: 'URL must target a share token route' }, { status: 400 });
  }

  const parsedSlug = parseAssetSlug(slug);
  if (!parsedSlug) {
    return Response.json({ error: 'URL must target a share token route' }, { status: 400 });
  }

  const parsedToken = parseToken(parsedSlug.token)!;

  if (parsedToken.expired) {
    return Response.json({ error: 'Token expired.' }, { status: 410 });
  }

  if (body.expiresAt <= Date.now()) {
    return Response.json({ error: 'expiresAt must be in the future' }, { status: 400 });
  }

  if (body.expiresAt > Date.now() + MAX_ALLOWED_EXPIRY_AHEAD_MS) {
    return Response.json(
      { error: 'expiresAt exceeds allowed lifetime' },
      { status: 400 },
    );
  }

  if (body.expiresAt !== parsedToken.expiresAt) {
    return Response.json(
      { error: 'expiresAt does not match token expiry' },
      { status: 400 },
    );
  }

  const ok = await pushEvent(id, { url: parsedUrl.toString(), expiresAt: body.expiresAt });
  if (!ok) {
    return Response.json({ error: 'Session expired' }, { status: 410 });
  }

  return Response.json({ ok: true });
}
