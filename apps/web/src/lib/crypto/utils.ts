/**
 * Crypto utility functions — base64url, hex, constant-time compare, wipe
 */

const B64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Encode Uint8Array to base64url (no padding) */
export function base64urlEncode(data: Uint8Array): string {
  let result = '';
  for (let i = 0; i < data.length; i += 3) {
    const a = data[i]!;
    const b = data[i + 1] ?? 0;
    const c = data[i + 2] ?? 0;
    result += B64URL_CHARS[(a >> 2)!]!;
    result += B64URL_CHARS[((a & 3) << 4) | (b >> 4)]!;
    if (i + 1 < data.length) result += B64URL_CHARS[((b & 15) << 2) | (c >> 6)]!;
    if (i + 2 < data.length) result += B64URL_CHARS[c & 63]!;
  }
  return result;
}

/** Decode base64url string to Uint8Array */
export function base64urlDecode(str: string): Uint8Array {
  const lookup = new Uint8Array(128);
  for (let i = 0; i < B64URL_CHARS.length; i++) {
    lookup[B64URL_CHARS.charCodeAt(i)!] = i;
  }

  // Remove padding if present
  const s = str.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((s.length * 3) / 4));
  let j = 0;

  for (let i = 0; i < s.length; i += 4) {
    const a = lookup[s.charCodeAt(i)!]!;
    const b = lookup[s.charCodeAt(i + 1)!]!;
    const c = lookup[s.charCodeAt(i + 2)!] ?? 0;
    const d = lookup[s.charCodeAt(i + 3)!] ?? 0;
    bytes[j++] = (a << 2) | (b >> 4);
    if (i + 2 < s.length) bytes[j++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < s.length) bytes[j++] = ((c & 3) << 6) | d;
  }

  return bytes.slice(0, j);
}

/** Encode Uint8Array to hex string */
export function hexEncode(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Decode hex string to Uint8Array */
export function hexDecode(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/** Constant-time string comparison */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Zero out sensitive buffer data */
export function wipeBuffer(buf: ArrayBuffer | Uint8Array): void {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  arr.fill(0);
}

/** Generate cryptographically random bytes */
export function randomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}
