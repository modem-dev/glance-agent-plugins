import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sessionsMock = vi.hoisted(() => ({
  createSession: vi.fn(),
  getEvents: vi.fn(),
  pushEvent: vi.fn(),
  sessionExists: vi.fn(),
}));

const rateLimitMock = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('@/lib/sessions', () => ({
  createSession: sessionsMock.createSession,
  getEvents: sessionsMock.getEvents,
  pushEvent: sessionsMock.pushEvent,
  sessionExists: sessionsMock.sessionExists,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: rateLimitMock.checkRateLimit,
}));

import { GET as eventsGet } from '@/app/api/session/[id]/events/route';
import { POST as pushPost } from '@/app/api/session/[id]/push/route';
import { POST as sessionPost } from '@/app/api/session/route';
import { issueToken } from '@/lib/tokens';

describe('session API contract', () => {
  beforeEach(() => {
    sessionsMock.createSession.mockReset();
    sessionsMock.getEvents.mockReset();
    sessionsMock.pushEvent.mockReset();
    sessionsMock.sessionExists.mockReset();
    rateLimitMock.checkRateLimit.mockReset();
    rateLimitMock.checkRateLimit.mockResolvedValue({ allowed: true });

    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('POST /api/session', () => {
    it('returns { id, url } with configured base URL', async () => {
      process.env.NEXT_PUBLIC_BASE_URL = 'https://custom.glance.sh';
      sessionsMock.createSession.mockResolvedValue('abc123def456');

      const response = await sessionPost(
        new Request('http://localhost/api/session', { method: 'POST' }),
      );
      const payload = (await response.json()) as { id: string; url: string };

      expect(response.status).toBe(200);
      expect(payload).toEqual({
        id: 'abc123def456',
        url: 'https://custom.glance.sh/s/abc123def456',
      });
    });

    it('uses https://glance.sh when NEXT_PUBLIC_BASE_URL is missing', async () => {
      sessionsMock.createSession.mockResolvedValue('abc123def456');

      const response = await sessionPost(
        new Request('http://localhost/api/session', { method: 'POST' }),
      );
      const payload = (await response.json()) as { id: string; url: string };

      expect(payload.url).toBe('https://glance.sh/s/abc123def456');
    });

    it('returns 429 when session creation is rate limited', async () => {
      rateLimitMock.checkRateLimit.mockResolvedValue({
        allowed: false,
        retryAfterSeconds: 90,
      });

      const response = await sessionPost(
        new Request('http://localhost/api/session', { method: 'POST' }),
      );

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('90');
      await expect(response.json()).resolves.toEqual({
        error: 'Too many sessions created. Try again later.',
      });
      expect(sessionsMock.createSession).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/session/[id]/push', () => {
    it('returns 404 when session does not exist', async () => {
      sessionsMock.sessionExists.mockResolvedValue(false);

      const response = await pushPost(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'missing' }),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'Session not found' });
    });

    it('returns 429 when push is rate limited', async () => {
      rateLimitMock.checkRateLimit.mockResolvedValue({
        allowed: false,
        retryAfterSeconds: 45,
      });

      const response = await pushPost(
        new Request('http://localhost', { method: 'POST' }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('45');
      await expect(response.json()).resolves.toEqual({
        error: 'Too many session updates. Try again later.',
      });
      expect(sessionsMock.sessionExists).not.toHaveBeenCalled();
    });

    it('returns 400 when url is missing', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiresAt: Date.now() + 60_000 }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Missing url' });
    });

    it('returns 400 when expiresAt is missing', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const { token } = issueToken();
      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: `http://localhost/${token}.png` }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Missing expiresAt' });
    });

    it('rejects non-first-party URLs', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const { token, expiresAt } = issueToken();
      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: `https://evil.example/${token}.png`, expiresAt }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'URL must be a first-party glance link',
      });
    });

    it('rejects expiresAt mismatch against token expiry', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const { token, expiresAt } = issueToken();
      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `http://localhost/${token}.png`,
            expiresAt: expiresAt + 1,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'expiresAt does not match token expiry',
      });
    });

    it('rejects expiresAt values far beyond allowed lifetime', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const { token, expiresAt } = issueToken();
      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `http://localhost/${token}.png`,
            expiresAt: expiresAt + 86_400_000,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'expiresAt exceeds allowed lifetime',
      });
    });

    it('returns 410 when session expired before push', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);
      sessionsMock.pushEvent.mockResolvedValue(false);

      const { token, expiresAt } = issueToken();
      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `http://localhost/${token}.png`,
            expiresAt,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(410);
      await expect(response.json()).resolves.toEqual({ error: 'Session expired' });
    });

    it('returns ok on successful push', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);
      sessionsMock.pushEvent.mockResolvedValue(true);

      const { token, expiresAt } = issueToken();
      const shareUrl = `http://localhost/${token}.png`;
      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: shareUrl, expiresAt }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(sessionsMock.pushEvent).toHaveBeenCalledWith('abc123def456', {
        url: shareUrl,
        expiresAt,
      });
    });

    it('rejects URLs with query strings', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const { token, expiresAt } = issueToken();
      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `http://localhost/${token}.png?foo=bar`,
            expiresAt,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'URL must not include query/hash',
      });
    });

    it('rejects URLs with hash fragments', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const { token, expiresAt } = issueToken();
      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `http://localhost/${token}.png#section`,
            expiresAt,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'URL must not include query/hash',
      });
    });

    it('rejects URLs targeting nested paths', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const { token, expiresAt } = issueToken();
      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `http://localhost/nested/${token}.png`,
            expiresAt,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'URL must target a share token route',
      });
    });

    it('rejects URLs with valid slug format but invalid token parse', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      // 20 chars matching token pattern, but the expiry prefix is corrupt
      const badToken = '00000ABCDEFGHIJKLmno';
      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `http://localhost/${badToken}.png`,
            expiresAt: Date.now() + 60_000,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      // Token parses successfully but the expiry is way in the past → 410
      expect([400, 410]).toContain(response.status);
    });

    it('rejects URLs with invalid asset slugs', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: 'http://localhost/not-a-valid-token',
            expiresAt: Date.now() + 60_000,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(400);
    });

    it('rejects expired share tokens in URL', async () => {
      vi.useFakeTimers();
      const now = Date.UTC(2026, 2, 7, 12, 0, 0);
      vi.setSystemTime(now - 2 * 60 * 60 * 1000);
      const { token, expiresAt } = issueToken();
      vi.setSystemTime(now);

      sessionsMock.sessionExists.mockResolvedValue(true);

      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `http://localhost/${token}.png`,
            expiresAt,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(410);
      vi.useRealTimers();
    });

    it('rejects expiresAt in the past', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const { token } = issueToken();
      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `http://localhost/${token}.png`,
            expiresAt: Date.now() - 1000,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'expiresAt must be in the future',
      });
    });

    it('rejects completely invalid URLs that fail to parse', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      // This URL parses relative to currentOrigin, so we need something truly broken
      // Use a data: URL which passes new URL() but fails the protocol check
      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: 'data:text/plain;base64,SGVsbG8=',
            expiresAt: Date.now() + 60_000,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid url protocol' });
    });

    it('rejects malformed URLs that cannot be parsed', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: 'http://[::1',
            expiresAt: Date.now() + 60_000,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid url' });
    });

    it('rejects invalid URL protocols', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: 'ftp://localhost/something',
            expiresAt: Date.now() + 60_000,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid url protocol',
      });
    });

    it('accepts NEXT_PUBLIC_BASE_URL as allowed origin', async () => {
      process.env.NEXT_PUBLIC_BASE_URL = 'https://glance.sh';
      sessionsMock.sessionExists.mockResolvedValue(true);
      sessionsMock.pushEvent.mockResolvedValue(true);

      const { token, expiresAt } = issueToken();
      const response = await pushPost(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `https://glance.sh/${token}.png`,
            expiresAt,
          }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(200);
    });

    it('handles blank forwarded host header by falling back to host', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);
      sessionsMock.pushEvent.mockResolvedValue(true);

      const { token, expiresAt } = issueToken();
      const shareUrl = `http://127.0.0.1/${token}.png`;

      const response = await pushPost(
        new Request('http://internal-proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-host': ' , proxy.internal',
            host: '127.0.0.1',
          },
          body: JSON.stringify({ url: shareUrl, expiresAt }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(200);
    });

    it('handles comma-separated forwarded host/proto headers', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);
      sessionsMock.pushEvent.mockResolvedValue(true);

      const { token, expiresAt } = issueToken();
      const shareUrl = `http://localhost/${token}.png`;

      const response = await pushPost(
        new Request('http://internal-proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-host': 'localhost, proxy.internal',
            'x-forwarded-proto': 'http, https',
          },
          body: JSON.stringify({ url: shareUrl, expiresAt }),
        }),
        { params: Promise.resolve({ id: 'abc123def456' }) },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    });
  });

  describe('GET /api/session/[id]/events', () => {
    it('returns 429 when stream requests are rate limited', async () => {
      rateLimitMock.checkRateLimit.mockResolvedValue({
        allowed: false,
        retryAfterSeconds: 30,
      });

      const response = await eventsGet(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'abc123def456' }),
      });

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('30');
      await expect(response.json()).resolves.toEqual({
        error: 'Too many session stream connections. Try again later.',
      });
      expect(sessionsMock.sessionExists).not.toHaveBeenCalled();
    });

    it('returns 404 when session does not exist', async () => {
      sessionsMock.sessionExists.mockResolvedValue(false);

      const response = await eventsGet(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'missing' }),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'Session not found' });
    });

    it('emits connected + expired (without timeout) when the session disappears', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);
      sessionsMock.getEvents.mockResolvedValue(null);

      const response = await eventsGet(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'abc123def456' }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/event-stream');

      const text = await response.text();
      expect(text).toContain('event: connected');
      expect(text).toContain('event: expired');
      expect(text).not.toContain('event: timeout');
    });

    it('handles stream cancellation gracefully', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);
      // Never return null (session never expires) so the loop keeps going
      sessionsMock.getEvents.mockResolvedValue([]);

      const response = await eventsGet(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'cancel-test' }),
      });

      expect(response.status).toBe(200);

      // Read just the connected event, then cancel
      const reader = response.body!.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: connected');
      await reader.cancel();
    });

    it('handles immediate body cancellation before reading', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);
      sessionsMock.getEvents.mockResolvedValue([]);

      const response = await eventsGet(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'cancel-immediate' }),
      });

      expect(response.status).toBe(200);
      await response.body?.cancel();
    });

    it('emits keep-alive pings and timeout for long-lived sessions', async () => {
      vi.useFakeTimers();
      sessionsMock.sessionExists.mockResolvedValue(true);
      sessionsMock.getEvents.mockResolvedValue([]);

      const response = await eventsGet(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'long-lived' }),
      });

      const textPromise = response.text();

      // Advance past ping and timeout thresholds.
      await vi.advanceTimersByTimeAsync(296_000);

      const text = await textPromise;
      expect(text).toContain(': ping');
      expect(text).toContain('event: timeout');

      vi.useRealTimers();
    });

    it('emits image events from the session queue', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);
      sessionsMock.getEvents
        .mockResolvedValueOnce([
          {
            url: 'https://glance.sh/one.png',
            expiresAt: 1_750_000_000_000,
          },
        ])
        .mockResolvedValueOnce(null);

      const response = await eventsGet(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'abc123def456' }),
      });

      const text = await response.text();
      expect(text).toContain('event: image');
      expect(text).toContain('https://glance.sh/one.png');
      expect(text).toContain('event: expired');
      expect(text).not.toContain('event: timeout');
    });

    it('continues emitting new events when history is capped and shifted', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const expiresAtBase = 1_750_000_000_000;
      const firstWindow = Array.from({ length: 50 }, (_, index) => ({
        url: `https://glance.sh/${index}.png`,
        expiresAt: expiresAtBase + index,
      }));
      const shiftedWindow = Array.from({ length: 50 }, (_, index) => ({
        url: `https://glance.sh/${index + 1}.png`,
        expiresAt: expiresAtBase + index + 1,
      }));

      sessionsMock.getEvents
        .mockResolvedValueOnce(firstWindow)
        .mockResolvedValueOnce(shiftedWindow)
        .mockResolvedValueOnce(null);

      const response = await eventsGet(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'abc123def456' }),
      });

      const text = await response.text();
      const newestEventMatches = text.match(/https:\/\/glance\.sh\/50\.png/g) ?? [];

      expect(text).toContain('event: image');
      expect(newestEventMatches).toHaveLength(1);
      expect(text).toContain('event: expired');
      expect(text).not.toContain('event: timeout');
    });

    it('does not skip a newly-added duplicate event key', async () => {
      sessionsMock.sessionExists.mockResolvedValue(true);

      const duplicate = {
        url: 'https://glance.sh/dup.png',
        expiresAt: 1_750_000_000_000,
      };

      sessionsMock.getEvents
        .mockResolvedValueOnce([duplicate])
        .mockResolvedValueOnce([duplicate, duplicate])
        .mockResolvedValueOnce(null);

      const response = await eventsGet(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'abc123def456' }),
      });

      const text = await response.text();
      const dupMatches =
        text.match(/https:\/\/glance\.sh\/dup\.png/g) ?? [];

      expect(dupMatches).toHaveLength(2);
      expect(text).toContain('event: expired');
    });
  });
});
