import { Redis } from '@upstash/redis';

const SESSION_TTL_SEC = 600; // 10 minutes
const KEY_PREFIX = 'session:';
export const SESSION_ID_LENGTH = 12;
export const MAX_SESSION_EVENTS = 50;

const SESSION_ID_PATTERN = new RegExp(
  `^[A-Za-z0-9_-]{${SESSION_ID_LENGTH}}$`,
);

export interface SessionEvent {
  url: string;
  expiresAt: number;
}

interface SessionData {
  createdAt: number;
  events: SessionEvent[];
}

function redis(): Redis {
  return Redis.fromEnv();
}

export function isValidSessionId(id: string): boolean {
  return SESSION_ID_PATTERN.test(id);
}

function key(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

function isSessionEvent(value: unknown): value is SessionEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SessionEvent>;

  return (
    typeof candidate.url === 'string' &&
    typeof candidate.expiresAt === 'number' &&
    Number.isFinite(candidate.expiresAt)
  );
}

function parseSessionData(raw: unknown): SessionData | null {
  const parsed =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as Partial<SessionData>;
  if (typeof candidate.createdAt !== 'number' || !Number.isFinite(candidate.createdAt)) {
    return null;
  }

  const events = Array.isArray(candidate.events)
    ? candidate.events.filter(isSessionEvent).slice(-MAX_SESSION_EVENTS)
    : [];

  return {
    createdAt: candidate.createdAt,
    events,
  };
}

/** Create a new session. Returns the 12-char ID. */
export async function createSession(): Promise<string> {
  const { randomBytes } = await import('node:crypto');
  const id = randomBytes(9).toString('base64url'); // 12 chars, URL-safe
  const data: SessionData = { createdAt: Date.now(), events: [] };
  await redis().set(key(id), JSON.stringify(data), { ex: SESSION_TTL_SEC });
  return id;
}

/** Check whether a session exists. */
export async function sessionExists(id: string): Promise<boolean> {
  if (!isValidSessionId(id)) {
    return false;
  }

  const exists = await redis().exists(key(id));
  return exists === 1;
}

/** Push an image event into a session. Returns false if not found. */
export async function pushEvent(id: string, event: SessionEvent): Promise<boolean> {
  if (!isValidSessionId(id)) {
    return false;
  }

  const redisKey = key(id);
  const raw = await redis().get<string>(redisKey);
  if (!raw) return false;

  const data = parseSessionData(raw);
  if (!data) return false;

  data.events.push(event);

  if (data.events.length > MAX_SESSION_EVENTS) {
    data.events = data.events.slice(-MAX_SESSION_EVENTS);
  }

  // Re-set with remaining TTL
  const ttl = await redis().ttl(redisKey);
  await redis().set(redisKey, JSON.stringify(data), {
    ex: ttl > 0 ? ttl : SESSION_TTL_SEC,
  });
  return true;
}

/** Get all events for a session. Returns null if not found. */
export async function getEvents(id: string): Promise<SessionEvent[] | null> {
  if (!isValidSessionId(id)) {
    return null;
  }

  const raw = await redis().get<string>(key(id));
  if (!raw) return null;

  const data = parseSessionData(raw);
  if (!data) {
    return null;
  }

  return data.events;
}
