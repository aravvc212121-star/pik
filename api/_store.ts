/**
 * Shared in-memory code store for Vercel Edge Runtime.
 * 
 * Note: This is per-isolate and will reset on cold starts.
 * For production, use Vercel KV or an external store.
 */

interface CodeEntry {
  sessionId: string;
  expires: number;
  attempts: number;
}

// Global code map — survives across requests within the same Edge isolate
const CODE_MAP = new Map<string, CodeEntry>();

/** Clean expired codes */
function cleanExpired(): void {
  const now = Date.now();
  for (const [k, v] of CODE_MAP) {
    if (now > v.expires) CODE_MAP.delete(k);
  }
}

/** Generate a random 6-digit code */
function generateCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num = new DataView(bytes.buffer).getUint32(0) % 1000000;
  return num.toString().padStart(6, '0');
}

export { CODE_MAP, cleanExpired, generateCode, type CodeEntry };
