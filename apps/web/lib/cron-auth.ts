import { NextResponse } from 'next/server';

export const CRON_DEV_BYPASS_ENV = 'GLANCE_ALLOW_UNAUTHENTICATED_CRON';
const LEGACY_CRON_DEV_BYPASS_ENV = 'AGENTPASTE_ALLOW_UNAUTHENTICATED_CRON';

function isLocalDevEnvironment(): boolean {
  return process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
}

function allowUnauthenticatedCronInDev(): boolean {
  return (
    isLocalDevEnvironment() &&
    (process.env[CRON_DEV_BYPASS_ENV] === '1' ||
      process.env[LEGACY_CRON_DEV_BYPASS_ENV] === '1')
  );
}

export function authorizeCronRequest(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (allowUnauthenticatedCronInDev()) {
      return null;
    }

    return NextResponse.json(
      {
        error:
          'CRON_SECRET is required. For local dev only, set GLANCE_ALLOW_UNAUTHENTICATED_CRON=1.',
      },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  return null;
}
