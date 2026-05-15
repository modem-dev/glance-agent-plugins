// This file configures Sentry for edge features when a DSN is provided.
// Self-hosted installs are telemetry-free by default.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    enableLogs: process.env.SENTRY_ENABLE_LOGS === '1',

    // Do not collect user PII by default.
    sendDefaultPii: false,
  });
}
