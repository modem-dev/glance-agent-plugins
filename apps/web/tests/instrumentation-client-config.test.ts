import { afterEach, describe, expect, it, vi } from 'vitest';

const sentryMock = vi.hoisted(() => ({
  captureRouterTransitionStart: vi.fn(),
  init: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => sentryMock);

describe('instrumentation-client Sentry config', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    sentryMock.init.mockReset();
  });

  it('does not initialize Sentry without an explicit DSN', async () => {
    vi.resetModules();
    await import('@/instrumentation-client');

    expect(sentryMock.init).not.toHaveBeenCalled();
  });

  it('disables default PII and scrubs direct user identifiers', async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://example.com/1';
    vi.resetModules();
    await import('@/instrumentation-client');

    expect(sentryMock.init).toHaveBeenCalledTimes(1);

    const options = sentryMock.init.mock.calls[0]?.[0] as {
      sendDefaultPii?: boolean;
      beforeSend?: (event: any) => any;
    };

    expect(options.sendDefaultPii).toBe(false);
    expect(typeof options.beforeSend).toBe('function');

    const scrubbed = options.beforeSend?.({
      user: {
        id: 'user-123',
        email: 'person@example.com',
        ip_address: '203.0.113.10',
        username: 'dev',
        segment: 'beta',
      },
    });

    expect(scrubbed).toEqual({
      user: {
        segment: 'beta',
      },
    });
  });
});
