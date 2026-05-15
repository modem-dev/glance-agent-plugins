import { del } from '@vercel/blob';
import { upload } from '@vercel/blob/client';
import { afterEach, describe, expect, it } from 'vitest';

type IssueResponse = {
  token: string;
  pathname: string;
  expiresAt: number;
  uploadProof: string;
};

type SessionResponse = {
  id: string;
  url: string;
};

type ParsedSseEvent = {
  event: string;
  data: string;
};

type SessionImageEvent = {
  url: string;
  expiresAt: number;
};

const BASE_URL = process.env.LIVE_E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const ENABLED = process.env.RUN_LIVE_E2E === '1';
const describeLive = ENABLED ? describe : describe.skip;

const uploadedPathnames = new Set<string>();

const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9xq4QAAAAASUVORK5CYII=';

async function issueToken(): Promise<IssueResponse> {
  const response = await fetch(`${BASE_URL}/api/issue`, { method: 'POST' });
  expect(response.status).toBe(200);
  return response.json() as Promise<IssueResponse>;
}

async function createSession(): Promise<SessionResponse> {
  const response = await fetch(`${BASE_URL}/api/session`, { method: 'POST' });
  expect(response.status).toBe(200);
  return response.json() as Promise<SessionResponse>;
}

function parseSseChunk(buffer: string): {
  events: ParsedSseEvent[];
  remainder: string;
} {
  const events: ParsedSseEvent[] = [];
  const blocks = buffer.split('\n\n');
  const remainder = blocks.pop() ?? '';

  for (const block of blocks) {
    const lines = block.split('\n');
    let event = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        event = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataLines.push(line.slice(6));
      }
    }

    events.push({ event, data: dataLines.join('\n') });
  }

  return { events, remainder };
}

async function waitForSseEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  state: { buffer: string },
  eventName: string,
  timeoutMs: number,
): Promise<ParsedSseEvent> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const parsedBeforeRead = parseSseChunk(state.buffer);
    state.buffer = parsedBeforeRead.remainder;

    const foundBeforeRead = parsedBeforeRead.events.find(
      (event) => event.event === eventName,
    );

    if (foundBeforeRead) {
      return foundBeforeRead;
    }

    const remaining = Math.max(deadline - Date.now(), 1);

    const readResult = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), remaining);
      }),
    ]);

    if (readResult.done) {
      break;
    }

    state.buffer += decoder.decode(readResult.value, { stream: true });
  }

  throw new Error(`Did not receive SSE event: ${eventName}`);
}

describeLive('live session SSE integration', () => {
  afterEach(async () => {
    if (uploadedPathnames.size === 0) {
      return;
    }

    const pathnames = [...uploadedPathnames];
    uploadedPathnames.clear();

    try {
      await del(pathnames);
    } catch {
      // best effort cleanup; TTL + cleanup cron are a fallback
    }
  });

  it(
    'streams connected + image events after push',
    async () => {
      const session = await createSession();
      expect(session.id).toHaveLength(12);
      expect(session.url).toContain(`/s/${session.id}`);

      const eventsResponse = await fetch(
        `${BASE_URL}/api/session/${session.id}/events`,
        {
          headers: { Accept: 'text/event-stream' },
        },
      );

      expect(eventsResponse.status).toBe(200);
      expect(eventsResponse.headers.get('content-type')).toContain(
        'text/event-stream',
      );

      if (!eventsResponse.body) {
        throw new Error('Expected SSE response body');
      }

      const reader = eventsResponse.body.getReader();
      const decoder = new TextDecoder();
      const state = { buffer: '' };

      try {
        const connectedEvent = await waitForSseEvent(
          reader,
          decoder,
          state,
          'connected',
          5_000,
        );
        expect(connectedEvent.data).toBe('{}');

        const issue = await issueToken();
        const imageBytes = Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64');
        const imageBlob = new Blob([imageBytes], { type: 'image/png' });

        const uploaded = await upload(issue.pathname, imageBlob, {
          access: 'private',
          contentType: 'image/png',
          clientPayload: issue.uploadProof,
          handleUploadUrl: `${BASE_URL}/api/upload`,
        });

        uploadedPathnames.add(uploaded.pathname);

        const shareUrl = `${BASE_URL}/${issue.token}.png`;

        const pushResponse = await fetch(
          `${BASE_URL}/api/session/${session.id}/push`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: shareUrl,
              expiresAt: issue.expiresAt,
            }),
          },
        );

        expect(pushResponse.status).toBe(200);
        await expect(pushResponse.json()).resolves.toEqual({ ok: true });

        const imageEvent = await waitForSseEvent(
          reader,
          decoder,
          state,
          'image',
          7_000,
        );

        const imagePayload = JSON.parse(imageEvent.data) as SessionImageEvent;
        expect(imagePayload).toEqual({
          url: shareUrl,
          expiresAt: issue.expiresAt,
        });

        const shareResponse = await fetch(shareUrl);
        expect(shareResponse.status).toBe(200);
        expect(shareResponse.headers.get('content-type')).toContain('image/png');
      } finally {
        await reader.cancel().catch(() => {});
      }
    },
    35_000,
  );
});
