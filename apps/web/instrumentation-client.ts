// This file configures Sentry on the client when a DSN is provided.
// Self-hosted installs are telemetry-free by default.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    enableLogs: process.env.NEXT_PUBLIC_SENTRY_ENABLE_LOGS === '1',

    // Minimize client-side PII collection by default.
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii: false,

    beforeSend(event) {
      // Defense-in-depth scrub: keep diagnostics, drop direct user identifiers.
      if (event.user) {
        delete event.user.email;
        delete event.user.id;
        delete event.user.ip_address;
        delete event.user.username;

        if (Object.keys(event.user).length === 0) {
          delete event.user;
        }
      }

      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
