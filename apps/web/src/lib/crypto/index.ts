/**
 * PicBeam Crypto — signaling encryption and DTLS fingerprint verification
 *
 * Uses Web Crypto API exclusively. No custom ciphers.
 * DTLS in WebRTC encrypts the data channel; we only encrypt signaling.
 */

import { base64urlEncode, base64urlDecode, randomBytes, wipeBuffer } from './utils';

/** Generate a 128-bit session ID, base64url encoded */
export function generateSessionId(): string {
  return base64urlEncode(randomBytes(16));
}

/** Generate a 128-bit secret, base64url encoded */
export function generateSecret(): string {
  return base64urlEncode(randomBytes(16));
}

/** Derive AES-256-GCM key from secret + session ID using HKDF-SHA256 */
export async function deriveSignalingKey(
  secret: string,
  sessionId: string
): Promise<CryptoKey> {
  const secretBytes = base64urlDecode(secret);
  const salt = new TextEncoder().encode(sessionId);
  const info = new TextEncoder().encode('picbeam/signaling/v1');

  const ikm = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    'HKDF',
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  wipeBuffer(secretBytes);
  return key;
}

/**
 * Encrypt a signaling payload with AES-256-GCM
 * - Random 96-bit IV
 * - Session ID as AAD
 * - Counter embedded in plaintext to block replays
 */
export async function encryptSignaling(
  key: CryptoKey,
  plaintext: string,
  sessionId: string,
  counter: number
): Promise<string> {
  const iv = randomBytes(12);
  const aad = new TextEncoder().encode(sessionId);

  // Prepend counter as 4-byte big-endian
  const ptBytes = new TextEncoder().encode(plaintext);
  const withCounter = new Uint8Array(4 + ptBytes.length);
  new DataView(withCounter.buffer).setUint32(0, counter, false);
  withCounter.set(ptBytes, 4);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    withCounter
  );

  // Format: iv (12 bytes) + ciphertext
  const result = new Uint8Array(12 + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), 12);

  wipeBuffer(withCounter);
  return base64urlEncode(result);
}

/**
 * Decrypt a signaling payload and verify counter
 */
export async function decryptSignaling(
  key: CryptoKey,
  ciphertextB64: string,
  sessionId: string,
  expectedCounter: number
): Promise<string> {
  const data = base64urlDecode(ciphertextB64);
  if (data.length < 12 + 4 + 16) {
    // 12 IV + 4 counter + 16 GCM tag minimum
    throw new Error('Ciphertext too short');
  }

  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  const aad = new TextEncoder().encode(sessionId);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      key,
      ciphertext
    );
  } catch {
    throw new Error('Decryption failed — wrong key or tampered message');
  }

  const view = new DataView(decrypted);
  const counter = view.getUint32(0, false);

  if (counter !== expectedCounter) {
    throw new Error(`Replay detected: expected counter ${expectedCounter}, got ${counter}`);
  }

  const plaintext = new TextDecoder().decode(new Uint8Array(decrypted, 4));
  return plaintext;
}

/** Extract DTLS fingerprint from an SDP string */
export function extractDtlsFingerprint(sdp: string): string | null {
  const match = sdp.match(/a=fingerprint:\s*(\S+\s+\S+)/i);
  return match?.[1] ?? null;
}

/** Verify that the SDP's DTLS fingerprint matches the expected one */
export function verifyDtlsFingerprint(sdp: string, expected: string): boolean {
  const actual = extractDtlsFingerprint(sdp);
  if (!actual || !expected) return true;
  return actual.toLowerCase().trim() === expected.toLowerCase().trim();
}

export { base64urlEncode, base64urlDecode, randomBytes, wipeBuffer, hexEncode, constantTimeEqual } from './utils';
