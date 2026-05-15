import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { UPLOAD_TOKEN_TTL_MS } from '@/lib/config';
import {
  createUploadProof,
  type UploadProofContext,
  verifyUploadProof,
} from '@/lib/upload-proof';

const ORIGINAL_ENV = { ...process.env };

function context(overrides: Partial<UploadProofContext> = {}): UploadProofContext {
  return {
    token: '0dagxtiLC3aBEk0lbXVE',
    pathname: 'uploads/0dagxtiLC3aBEk0lbXVE',
    tokenExpiresAt: Date.UTC(2026, 2, 8, 12, 0, 0),
    ...overrides,
  };
}

describe('upload proof', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.GLANCE_UPLOAD_PROOF_SECRET = 'test-proof-secret';
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('creates and verifies a valid proof', () => {
    const now = Date.UTC(2026, 2, 7, 12, 0, 0);
    const proof = createUploadProof(context(), now);

    expect(
      verifyUploadProof(proof, context(), now + 1_000),
    ).toEqual({ ok: true });
  });

  it('rejects missing or malformed proof strings', () => {
    expect(verifyUploadProof(null, context())).toEqual({
      ok: false,
      error: 'Missing upload proof.',
    });

    expect(verifyUploadProof('not-a-proof', context())).toEqual({
      ok: false,
      error: 'Invalid upload proof.',
    });
  });

  it('rejects tampered signatures', () => {
    const proof = createUploadProof(context());
    const tampered = `${proof}x`;

    expect(verifyUploadProof(tampered, context())).toEqual({
      ok: false,
      error: 'Invalid upload proof signature.',
    });
  });

  it('rejects proofs that do not match pathname/token context', () => {
    const proof = createUploadProof(context({ pathname: 'uploads/abc' }));

    expect(verifyUploadProof(proof, context())).toEqual({
      ok: false,
      error: 'Upload proof does not match upload token.',
    });
  });

  it('expires proofs after upload token TTL window', () => {
    const now = Date.UTC(2026, 2, 7, 12, 0, 0);
    const proof = createUploadProof(context(), now);

    expect(
      verifyUploadProof(proof, context(), now + UPLOAD_TOKEN_TTL_MS + 1),
    ).toEqual({
      ok: false,
      error: 'Upload proof has expired.',
    });
  });

  it('throws when no signing secret is configured', () => {
    delete process.env.GLANCE_UPLOAD_PROOF_SECRET;
    delete process.env.BLOB_READ_WRITE_TOKEN;

    expect(() => createUploadProof(context())).toThrow(
      /Missing upload proof secret/,
    );
  });

  it('returns unavailable error when secret is missing during verify', () => {
    const proof = createUploadProof(context());
    delete process.env.GLANCE_UPLOAD_PROOF_SECRET;
    delete process.env.BLOB_READ_WRITE_TOKEN;

    expect(verifyUploadProof(proof, context())).toEqual({
      ok: false,
      error: 'Upload proof verification is unavailable.',
    });
  });

  it('rejects proofs with corrupted base64 payload', () => {
    // Valid signature format but garbage payload that won't parse as JSON
    const garbage = Buffer.from('not-valid-json', 'utf8').toString('base64url');
    const proof = `${garbage}.fakesig`;

    expect(verifyUploadProof(proof, context())).toEqual({
      ok: false,
      error: 'Invalid upload proof signature.',
    });
  });

  it('rejects proofs with valid signature but invalid claims shape', () => {
    // Create a proof with missing fields
    const { createHmac } = require('node:crypto');
    const secret = process.env.GLANCE_UPLOAD_PROOF_SECRET!;
    const payload = Buffer.from(JSON.stringify({ v: 2, bad: true }), 'utf8').toString('base64url');
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');

    expect(verifyUploadProof(`${payload}.${sig}`, context())).toEqual({
      ok: false,
      error: 'Invalid upload proof payload.',
    });
  });

  it('rejects proofs with valid signature but non-JSON payload bytes', () => {
    const { createHmac } = require('node:crypto');
    const secret = process.env.GLANCE_UPLOAD_PROOF_SECRET!;
    const payload = Buffer.from('{"bad":', 'utf8').toString('base64url');
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');

    expect(verifyUploadProof(`${payload}.${sig}`, context())).toEqual({
      ok: false,
      error: 'Invalid upload proof payload.',
    });
  });
});
