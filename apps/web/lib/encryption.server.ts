/**
 * Server-only decryption for images at rest.
 *
 * Uses node:crypto to decrypt envelopes produced by the browser-side
 * `encrypt()` in `lib/encryption.ts`.
 *
 * This module must NOT be imported from client components.
 */

import { createDecipheriv, hkdfSync } from 'node:crypto';

import {
  HKDF_INFO,
  HKDF_SALT,
  IV_BYTES,
  KEY_BITS,
  parseHeader,
} from './encryption';

const KEY_BYTES = KEY_BITS / 8;

/**
 * Derive raw key bytes via node:crypto HKDF — exported for cross-env tests.
 */
export function deriveKeyBytesNode(token: string): Uint8Array {
  const derived = hkdfSync(
    'sha256',
    new TextEncoder().encode(token),
    HKDF_SALT,
    HKDF_INFO,
    KEY_BYTES,
  );
  return new Uint8Array(derived);
}

/**
 * Decrypt an encrypted envelope on the server.
 *
 * @param encrypted  The full envelope (header + IV + ciphertext).
 * @param token  The share token used as key material.
 * @returns Decrypted image data and the original content-type.
 */
export function decrypt(
  encrypted: ArrayBuffer,
  token: string,
): { contentType: string; data: ArrayBuffer } {
  const buf = new Uint8Array(encrypted);

  const { contentType, headerLength } = parseHeader(buf);
  const header = buf.subarray(0, headerLength);
  const iv = buf.subarray(headerLength, headerLength + IV_BYTES);
  const ciphertextWithTag = buf.subarray(headerLength + IV_BYTES);

  if (ciphertextWithTag.byteLength < 16) {
    throw new Error('Encrypted payload is too short to contain an auth tag.');
  }

  const keyBytes = deriveKeyBytesNode(token);

  // GCM auth tag is the last 16 bytes
  const tagStart = ciphertextWithTag.byteLength - 16;
  const ciphertext = ciphertextWithTag.subarray(0, tagStart);
  const authTag = ciphertextWithTag.subarray(tagStart);

  const decipher = createDecipheriv('aes-256-gcm', keyBytes, iv);
  decipher.setAAD(header);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return {
    contentType,
    data: decrypted.buffer.slice(
      decrypted.byteOffset,
      decrypted.byteOffset + decrypted.byteLength,
    ) as ArrayBuffer,
  };
}
