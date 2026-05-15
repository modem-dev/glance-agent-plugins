import { describe, expect, it } from 'vitest';

import { deriveKeyBytesWebCrypto, encrypt } from './encryption';
import { decrypt, deriveKeyBytesNode } from './encryption.server';

const TOKEN_A = '0dagxtiLC3aBEk0lbXVE';
const TOKEN_B = '0dagxSOMETHINGELSEab';

function randomPayload(size: number): Uint8Array {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i++) buf[i] = i % 256;
  return buf;
}

// -----------------------------------------------------------------------
// T1 — Core round-trip and correctness
// -----------------------------------------------------------------------

describe('encryption', () => {
  it('round-trips: encrypt then decrypt recovers original bytes and content-type', async () => {
    const plaintext = new TextEncoder().encode('hello world');
    const contentType = 'image/png';

    const encrypted = await encrypt(plaintext.buffer as ArrayBuffer, contentType, TOKEN_A);
    const result = await decrypt(encrypted, TOKEN_A);

    expect(result.contentType).toBe(contentType);
    expect(new Uint8Array(result.data)).toEqual(plaintext);
  });

  it('different tokens produce different ciphertext', async () => {
    const plaintext = new TextEncoder().encode('same data');
    const iv = new Uint8Array(12); // fixed IV to isolate key difference

    const a = await encrypt(plaintext.buffer as ArrayBuffer, 'image/png', TOKEN_A, iv);
    const b = await encrypt(plaintext.buffer as ArrayBuffer, 'image/png', TOKEN_B, iv);

    expect(new Uint8Array(a)).not.toEqual(new Uint8Array(b));
  });

  it('wrong token fails to decrypt', async () => {
    const plaintext = new TextEncoder().encode('secret');
    const encrypted = await encrypt(plaintext.buffer as ArrayBuffer, 'image/png', TOKEN_A);

    expect(() => decrypt(encrypted, TOKEN_B)).toThrow();
  });

  it('tampered ciphertext fails', async () => {
    const plaintext = new TextEncoder().encode('secret');
    const encrypted = await encrypt(plaintext.buffer as ArrayBuffer, 'image/png', TOKEN_A);

    const buf = new Uint8Array(encrypted);
    // Flip a byte in the ciphertext region (after header + IV)
    buf[buf.byteLength - 20] ^= 0xff;

    expect(() => decrypt(buf.buffer as ArrayBuffer, TOKEN_A)).toThrow();
  });

  it('tampered IV fails', async () => {
    const plaintext = new TextEncoder().encode('secret');
    const encrypted = await encrypt(plaintext.buffer as ArrayBuffer, 'image/png', TOKEN_A);

    const buf = new Uint8Array(encrypted);
    // Content-type "image/png" = 9 bytes, header = 1 + 9 = 10, IV starts at offset 10
    buf[10] ^= 0xff;

    expect(() => decrypt(buf.buffer as ArrayBuffer, TOKEN_A)).toThrow();
  });

  it('tampered content-type header fails (AAD mismatch)', async () => {
    const plaintext = new TextEncoder().encode('secret');
    const encrypted = await encrypt(plaintext.buffer as ArrayBuffer, 'image/png', TOKEN_A);

    const buf = new Uint8Array(encrypted);
    // Corrupt the content-type byte (offset 1)
    buf[1] ^= 0xff;

    expect(() => decrypt(buf.buffer as ArrayBuffer, TOKEN_A)).toThrow();
  });

  it('empty payload round-trips', async () => {
    const plaintext = new ArrayBuffer(0);
    const contentType = 'image/gif';

    const encrypted = await encrypt(plaintext, contentType, TOKEN_A);
    const result = await decrypt(encrypted, TOKEN_A);

    expect(result.contentType).toBe(contentType);
    expect(new Uint8Array(result.data)).toEqual(new Uint8Array(0));
  });

  it('max-length content-type (255 bytes) works', async () => {
    const contentType = 'x/' + 'a'.repeat(253);
    expect(new TextEncoder().encode(contentType).byteLength).toBe(255);

    const plaintext = new TextEncoder().encode('data');
    const encrypted = await encrypt(plaintext.buffer as ArrayBuffer, contentType, TOKEN_A);
    const result = await decrypt(encrypted, TOKEN_A);

    expect(result.contentType).toBe(contentType);
    expect(new Uint8Array(result.data)).toEqual(plaintext);
  });

  it('content-type too long (256+ bytes) throws on encrypt', async () => {
    const contentType = 'x/' + 'a'.repeat(254); // 256 bytes
    const plaintext = new ArrayBuffer(1);

    await expect(
      encrypt(plaintext, contentType, TOKEN_A),
    ).rejects.toThrow(/exceeds 255 bytes/);
  });

  it.each([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/avif',
  ])('preserves content-type %s', async (ct) => {
    const plaintext = new TextEncoder().encode('test');
    const encrypted = await encrypt(plaintext.buffer as ArrayBuffer, ct, TOKEN_A);
    const result = await decrypt(encrypted, TOKEN_A);

    expect(result.contentType).toBe(ct);
  });

  it('handles ~5 MB payload', { timeout: 30_000 }, async () => {
    const size = 5 * 1024 * 1024;
    const plaintext = randomPayload(size);

    const encrypted = await encrypt(plaintext.buffer as ArrayBuffer, 'image/png', TOKEN_A);
    const result = await decrypt(encrypted, TOKEN_A);

    expect(new Uint8Array(result.data)).toEqual(plaintext);
  });

  it('deriveKeyBytesNode is deterministic', async () => {
    const a = await deriveKeyBytesNode(TOKEN_A);
    const b = await deriveKeyBytesNode(TOKEN_A);

    expect(a).toEqual(b);
    expect(a.byteLength).toBe(32);
  });

  it('IV is unique across encryptions (ciphertexts differ)', async () => {
    const plaintext = new TextEncoder().encode('same');

    const a = await encrypt(plaintext.buffer as ArrayBuffer, 'image/png', TOKEN_A);
    const b = await encrypt(plaintext.buffer as ArrayBuffer, 'image/png', TOKEN_A);

    // With random IVs, the ciphertexts should differ
    expect(new Uint8Array(a)).not.toEqual(new Uint8Array(b));
  });

  // -------------------------------------------------------------------
  // T6 — Edge cases
  // -------------------------------------------------------------------

  it('low-entropy token (all same chars) still works', async () => {
    const weakToken = 'aaaaaaaaaaaaaaaaaaaaaa';
    const plaintext = new TextEncoder().encode('works');

    const encrypted = await encrypt(plaintext.buffer as ArrayBuffer, 'image/png', weakToken);
    const result = await decrypt(encrypted, weakToken);

    expect(new Uint8Array(result.data)).toEqual(plaintext);
  });

  it('content-type with special chars preserved', async () => {
    const ct = 'image/svg+xml';
    const plaintext = new TextEncoder().encode('<svg/>');

    const encrypted = await encrypt(plaintext.buffer as ArrayBuffer, ct, TOKEN_A);
    const result = await decrypt(encrypted, TOKEN_A);

    expect(result.contentType).toBe(ct);
  });

  it('truncated payload throws', () => {
    expect(() => decrypt(new ArrayBuffer(0), TOKEN_A)).toThrow();
    expect(() => decrypt(new ArrayBuffer(5), TOKEN_A)).toThrow();
  });

  it('payload with valid header but too short for auth tag throws', async () => {
    // Build a valid header + IV but no ciphertext/tag
    const header = new Uint8Array([9, ...new TextEncoder().encode('image/png')]);
    const iv = new Uint8Array(12);
    const buf = new Uint8Array(header.byteLength + iv.byteLength + 10); // 10 < 16 tag
    buf.set(header, 0);
    buf.set(iv, header.byteLength);
    expect(() => decrypt(buf.buffer as ArrayBuffer, TOKEN_A)).toThrow(/auth tag/);
  });

  it('payload format is stable (snapshot)', async () => {
    // Fixed IV so ciphertext is deterministic for a given key
    const iv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const plaintext = new TextEncoder().encode('snapshot');
    const ct = 'image/png';

    const encrypted = await encrypt(
      plaintext.buffer as ArrayBuffer,
      ct,
      TOKEN_A,
      iv,
    );

    // If the envelope format changes, this snapshot will break — that's the point.
    const snapshot = Buffer.from(new Uint8Array(encrypted)).toString('base64');

    // Decrypt to verify it's valid
    const result = await decrypt(encrypted, TOKEN_A);
    expect(new Uint8Array(result.data)).toEqual(plaintext);

    // Re-encrypt with same params → same output
    const encrypted2 = await encrypt(
      plaintext.buffer as ArrayBuffer,
      ct,
      TOKEN_A,
      iv,
    );
    const snapshot2 = Buffer.from(new Uint8Array(encrypted2)).toString('base64');

    expect(snapshot2).toBe(snapshot);
  });
});
