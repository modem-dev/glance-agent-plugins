import { checkRateLimit } from '@/lib/rate-limit';
import { getRequestIp } from '@/lib/request-ip';
import { getEvents, sessionExists, type SessionEvent } from '@/lib/sessions';

const EVENTS_RATE_LIMIT = {
  bucket: 'session-events',
  maxRequests: 120,
  windowMs: 3_600_000,
};

function eventCursorKey(event: SessionEvent): string {
  return `${event.url}\u0000${event.expiresAt}`;
}

function nextEventIndex(
  events: SessionEvent[],
  lastSentEventKey: string | null,
  lastSentEventOrdinal: number,
): number {
  if (!lastSentEventKey || lastSentEventOrdinal <= 0) {
    return 0;
  }

  let seen = 0;

  // Find the same occurrence (ordinal) of the last-sent key.
  for (let index = 0; index < events.length; index += 1) {
    if (eventCursorKey(events[index]) !== lastSentEventKey) {
      continue;
    }

    seen += 1;
    if (seen === lastSentEventOrdinal) {
      return index + 1;
    }
  }

  // History window shifted past our cursor (e.g. capped list): send current window.
  return 0;
}

export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ip = getRequestIp(req);
  const { allowed, retryAfterSeconds } = await checkRateLimit(
    ip,
    EVENTS_RATE_LIMIT,
  );

  if (!allowed) {
    return Response.json(
      { error: 'Too many session stream connections. Try again later.' },
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

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // If enqueue fails (closed stream), stop polling immediately.
          cancelled = true;
        }
      };

      send('event: connected\ndata: {}\n\n');

      let lastSentEventKey: string | null = null;
      let lastSentEventOrdinal = 0;
      const startedAt = Date.now();
      const TIMEOUT_MS = 295_000; // close before maxDuration (300s)
      const POLL_MS = 500;
      const PING_MS = 15_000;
      let lastPing = Date.now();

      let expired = false;

      while (!cancelled && Date.now() - startedAt < TIMEOUT_MS) {
        const events = await getEvents(id);

        if (events === null) {
          // Session expired / deleted
          send('event: expired\ndata: {}\n\n');
          expired = true;
          break;
        }

        // Send any new events, resilient to capped/shifted history windows.
        const startIndex = nextEventIndex(
          events,
          lastSentEventKey,
          lastSentEventOrdinal,
        );

        for (let index = startIndex; index < events.length; index += 1) {
          const event = events[index];
          send(`event: image\ndata: ${JSON.stringify(event)}\n\n`);

          const key = eventCursorKey(event);
          let ordinal = 0;
          for (let seenIndex = 0; seenIndex <= index; seenIndex += 1) {
            if (eventCursorKey(events[seenIndex]) === key) {
              ordinal += 1;
            }
          }

          lastSentEventKey = key;
          lastSentEventOrdinal = ordinal;
        }

        // Keep-alive ping
        if (Date.now() - lastPing >= PING_MS) {
          send(': ping\n\n');
          lastPing = Date.now();
        }

        // Wait before next poll
        await new Promise((r) => setTimeout(r, POLL_MS));
      }

      if (!cancelled && !expired) {
        send('event: timeout\ndata: {}\n\n');
      }

      try {
        controller.close();
      } catch {
        // already closed
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
