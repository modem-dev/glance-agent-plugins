import { NextRequest, NextResponse } from 'next/server';

import { checkRateLimit } from '@/lib/rate-limit';
import { issueToken, pathForToken } from '@/lib/tokens';
import { createUploadProof } from '@/lib/upload-proof';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  const { allowed, retryAfterSeconds } = await checkRateLimit(ip, {
    bucket: 'upload',
    maxRequests: 30,
    windowMs: 3_600_000,
  });

  if (!allowed) {
    return NextResponse.json(
      { error: 'Upload limit reached. Try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds ?? 3600) },
      },
    );
  }

  const { token, expiresAt } = issueToken();
  const pathname = pathForToken(token);

  let uploadProof: string;
  try {
    uploadProof = createUploadProof({
      token,
      pathname,
      tokenExpiresAt: expiresAt,
    });
  } catch {
    return NextResponse.json(
      { error: 'Upload service is misconfigured.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      token,
      pathname,
      expiresAt,
      uploadProof,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
