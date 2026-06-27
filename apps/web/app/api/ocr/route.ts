import { google } from '@ai-sdk/google';
import * as Sentry from '@sentry/nextjs';
import { generateText } from 'ai';
import { get } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

import { decrypt } from '@/lib/encryption.server';
import { parseToken, pathForToken } from '@/lib/tokens';
import { checkRateLimit } from '@/lib/rate-limit';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const CACHE_TTL_MS = 30 * 60 * 1000; // match image TTL

type CacheEntry = { text: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();

let lastPrune = Date.now();
function pruneCache(now: number) {
  if (now - lastPrune < 60_000) return;
  for (const [k, v] of cache) {
    if (now >= v.expiresAt) cache.delete(k);
  }
  lastPrune = now;
}

function getCached(token: string): string | null {
  const now = Date.now();
  pruneCache(now);
  const entry = cache.get(token);
  if (!entry || now >= entry.expiresAt) return null;
  return entry.text;
}

export async function POST(request: NextRequest): Promise<Response> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  const { allowed, retryAfterSeconds } = await checkRateLimit(ip, {
    bucket: 'ocr',
    maxRequests: 20,
    windowMs: 3_600_000,
  });

  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds ?? 3600) },
      },
    );
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const token = body.token;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing token.' }, { status: 400 });
  }

  const parsed = parseToken(token);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid token.' }, { status: 400 });
  }

  if (parsed.expired) {
    return NextResponse.json({ error: 'Token expired.' }, { status: 410 });
  }

  const cached = getCached(token);
  if (cached !== null) {
    return NextResponse.json({ text: cached });
  }

  let blob;
  try {
    blob = await get(pathForToken(token), { access: 'private' });
  } catch {
    return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
  }

  if (!blob) {
    return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = (blob.stream as ReadableStream<Uint8Array>).getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_IMAGE_BYTES) {
      reader.cancel();
      return NextResponse.json({ error: 'Image too large for OCR.' }, { status: 413 });
    }
    chunks.push(value);
  }

  const encryptedBuffer = Buffer.concat(chunks);

  let imageBuffer: Buffer;
  let contentType: string;
  try {
    const encryptedArray = encryptedBuffer.buffer.slice(
      encryptedBuffer.byteOffset,
      encryptedBuffer.byteOffset + encryptedBuffer.byteLength,
    );
    const decrypted = decrypt(encryptedArray, token);
    imageBuffer = Buffer.from(decrypted.data);
    contentType = decrypted.contentType;
  } catch {
    return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
  }

  try {
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'file', data: imageBuffer, mediaType: contentType },
            {
              type: 'text',
              text: 'Extract all visible text from this image exactly as shown. Include code, terminal output, UI labels, error messages, and any other readable text. Preserve formatting and line breaks. Return only the extracted text, no commentary.',
            },
          ],
        },
      ],
    });

    cache.set(token, { text: result.text, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ text: result.text });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, {
      tags: { route: 'api/ocr' },
      extra: { detail },
    });
    console.error('OCR failed:', detail);
    return NextResponse.json({ error: 'OCR processing failed.' }, { status: 502 });
  }
}
