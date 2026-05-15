import { createHmac, timingSafeEqual } from 'node:crypto';

import { UPLOAD_TOKEN_TTL_MS } from '@/lib/config';

type UploadProofClaims = {
  v: 1;
  token: string;
  pathname: string;
  tokenExpiresAt: number;
  proofExpiresAt: number;
};

export type UploadProofContext = {
  pathname: string;
  token: string;
  tokenExpiresAt: number;
};

export type UploadProofVerificationResult =
  | { ok: true }
  | { error: string; ok: false };

function getUploadProofSecret(): string {
  const secret =
    process.env.GLANCE_UPLOAD_PROOF_SECRET ??
    process.env.AGENTPASTE_UPLOAD_PROOF_SECRET ??
    process.env.BLOB_READ_WRITE_TOKEN;

  if (!secret) {
    throw new Error(
      'Missing upload proof secret. Set GLANCE_UPLOAD_PROOF_SECRET or BLOB_READ_WRITE_TOKEN.',
    );
  }

  return secret;
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseClaims(encodedPayload: string): UploadProofClaims | null {
  try {
    const raw = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as Partial<UploadProofClaims>;

    if (
      parsed.v !== 1 ||
      typeof parsed.token !== 'string' ||
      typeof parsed.pathname !== 'string' ||
      typeof parsed.tokenExpiresAt !== 'number' ||
      typeof parsed.proofExpiresAt !== 'number'
    ) {
      return null;
    }

    return parsed as UploadProofClaims;
  } catch {
    return null;
  }
}

export function createUploadProof(
  context: UploadProofContext,
  now = Date.now(),
): string {
  const claims: UploadProofClaims = {
    v: 1,
    token: context.token,
    pathname: context.pathname,
    tokenExpiresAt: context.tokenExpiresAt,
    proofExpiresAt: now + UPLOAD_TOKEN_TTL_MS,
  };

  const encodedPayload = Buffer.from(JSON.stringify(claims), 'utf8').toString(
    'base64url',
  );
  const signature = sign(encodedPayload, getUploadProofSecret());

  return `${encodedPayload}.${signature}`;
}

export function verifyUploadProof(
  proof: string | null | undefined,
  context: UploadProofContext,
  now = Date.now(),
): UploadProofVerificationResult {
  if (!proof) {
    return { ok: false, error: 'Missing upload proof.' };
  }

  const [encodedPayload, signature, ...rest] = proof.split('.');

  if (!encodedPayload || !signature || rest.length > 0) {
    return { ok: false, error: 'Invalid upload proof.' };
  }

  let expectedSignature: string;
  try {
    expectedSignature = sign(encodedPayload, getUploadProofSecret());
  } catch {
    return { ok: false, error: 'Upload proof verification is unavailable.' };
  }

  if (!safeEqual(signature, expectedSignature)) {
    return { ok: false, error: 'Invalid upload proof signature.' };
  }

  const claims = parseClaims(encodedPayload);
  if (!claims) {
    return { ok: false, error: 'Invalid upload proof payload.' };
  }

  if (claims.proofExpiresAt <= now) {
    return { ok: false, error: 'Upload proof has expired.' };
  }

  if (
    claims.pathname !== context.pathname ||
    claims.token !== context.token ||
    claims.tokenExpiresAt !== context.tokenExpiresAt
  ) {
    return { ok: false, error: 'Upload proof does not match upload token.' };
  }

  return { ok: true };
}
