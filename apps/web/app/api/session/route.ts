import { checkRateLimit } from '@/lib/rate-limit';
import { getRequestIp } from '@/lib/request-ip';
import { createSession } from '@/lib/sessions';

const CREATE_SESSION_RATE_LIMIT = {
  bucket: 'session-create',
  maxRequests: 60,
  windowMs: 3_600_000,
};

export async function POST(request: Request): Promise<Response> {
  const ip = getRequestIp(request);
  const { allowed, retryAfterSeconds } = await checkRateLimit(
    ip,
    CREATE_SESSION_RATE_LIMIT,
  );

  if (!allowed) {
    return Response.json(
      { error: 'Too many sessions created. Try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds ?? 3600) },
      },
    );
  }

  const id = await createSession();
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://glance.sh';

  return Response.json({ id, url: `${base}/s/${id}` });
}
