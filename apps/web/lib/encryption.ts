/**
 * Client-safe encryption for images at rest.
 *
 * The share token doubles as the encryption key: HKDF derives an AES-256-GCM
 * key from the token string. The browser encrypts before uploading.
 *
 * Envelope format (all fields are concatenated into a single ArrayBuffer):
 *
 *   [1 byte  – content-type length N]
 *   [N bytes – content-type UTF-8]
 *   [12 bytes – IV]
 *   [remaining – AES-256-GCM ciphertext + 16-byte auth tag]
 *
 * The content-type header lives *outside* the ciphertext so the envelope can
 * be parsed without decryption, but integrity is still guaranteed because we
 * feed the header bytes as GCM additional authenticated data (AAD).
 */

// ---------------------------------------------------------------------------
// Shared constants  (also imported by encryption.server.ts)
// ---------------------------------------------------------------------------

export const HKDF_SALT = new TextEncoder().encode('glance.sh-image-encryption-v1');
export const HKDF_INFO = new TextEncoder().encode('aes-256-gcm');
export const IV_BYTES = 12;
export const KEY_BITS = 256;
export const MAX_CONTENT_TYPE_LENGTH = 255;

// ---------------------------------------------------------------------------
// Envelope helpers
// ---------------------------------------------------------------------------

export function buildHeader(contentType: string): Uint8Array {
  const ctBytes = new TextEncoder().encode(contentType);

  if (ctBytes.byteLength > MAX_CONTENT_TYPE_LENGTH) {
    throw new Error(
      `Content-type exceeds ${MAX_CONTENT_TYPE_LENGTH} bytes: ${contentType}`,
    );
  }

  const header = new Uint8Array(1 + ctBytes.byteLength);
  header[0] = ctBytes.byteLength;
  header.set(ctBytes, 1);
  return header;
}

export function parseHeader(data: Uint8Array): { contentType: string; headerLength: number } {
  if (data.byteLength < 1) {
    throw new Error('Encrypted payload is too short to contain a header.');
  }

  const ctLength = data[0];

  if (data.byteLength < 1 + ctLength + IV_BYTES + 1) {
    throw new Error('Encrypted payload is truncated.');
  }

  const contentType = new TextDecoder().decode(data.subarray(1, 1 + ctLength));
  return { contentType, headerLength: 1 + ctLength };
}

// ---------------------------------------------------------------------------
// Web Crypto (browser) implementation
// ---------------------------------------------------------------------------

async function deriveKeyWebCrypto(token: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(token),
    'HKDF',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: HKDF_INFO },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_BITS },
    true, // extractable for testing parity
    ['encrypt', 'decrypt'],
  );
}

/** Derive raw key bytes via Web Crypto — exported for cross-env tests. */
export async function deriveKeyBytesWebCrypto(token: string): Promise<Uint8Array> {
  const key = await deriveKeyWebCrypto(token);
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

/**
 * Encrypt an image in the browser before uploading.
 *
 * @param plaintext  Raw image bytes.
 * @param contentType  Original MIME type (e.g. `image/png`).
 * @param token  The share token used as key material.
 * @param iv  Optional IV override — **only** for deterministic tests.
 * @returns Encrypted envelope as an ArrayBuffer.
 */
export async function encrypt(
  plaintext: ArrayBuffer,
  contentType: string,
  token: string,
  iv?: Uint8Array,
): Promise<ArrayBuffer> {
  const header = buildHeader(contentType);
  const actualIv = iv ?? crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKeyWebCrypto(token);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: actualIv as Uint8Array<ArrayBuffer>,
      additionalData: header as Uint8Array<ArrayBuffer>,
    },
    key,
    plaintext,
  );

  // Assemble envelope: header | iv | ciphertext+tag
  const envelope = new Uint8Array(
    header.byteLength + IV_BYTES + ciphertext.byteLength,
  );
  envelope.set(header, 0);
  envelope.set(actualIv, header.byteLength);
  envelope.set(new Uint8Array(ciphertext), header.byteLength + IV_BYTES);

  return envelope.buffer as ArrayBuffer;
}
