/**
 * PicBeam Signaling Worker
 *
 * Routes: GET /ws, POST /api/code, GET /api/ice. Everything else → 404.
 * Never logs IPs, session IDs, codes or payloads.
 */

import { SessionDO } from './session';

export { SessionDO };

interface Env {
  SESSION_DO: DurableObjectNamespace;
  ALLOWED_ORIGIN: string;
  TURN_KEY_ID?: string;
  TURN_API_TOKEN?: string;
}

// In-memory rate limiting (per-isolate, good enough for free tier)
const rateLimits = new Map<string, { count: number; reset: number }>();
const CODE_MAP = new Map<string, { sessionId: string; expires: number; attempts: number }>();

// Daily rotating salt for IP hashing (lazily initialized — Workers prohibit I/O in global scope)
let currentSalt: Uint8Array | null = null;
let saltDay = 0;

function rotateSalt(): void {
  const today = Math.floor(Date.now() / 86400000);
  if (!currentSalt || today !== saltDay) {
    currentSalt = crypto.getRandomValues(new Uint8Array(16));
    saltDay = today;
  }
}

async function hashIp(ip: string): Promise<string> {
  rotateSalt();
  const data = new TextEncoder().encode(ip + String.fromCharCode(...currentSalt!));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function checkRate(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.reset) {
    rateLimits.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

function noStoreHeaders(extra?: Record<string, string>): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    ...extra,
  });
  return headers;
}

function corsHeaders(origin: string, allowed: string): Record<string, string> {
  if (origin === allowed || allowed === '*') {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }
  return {};
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';
    const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    // OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: noStoreHeaders(corsHeaders(origin, env.ALLOWED_ORIGIN)),
      });
    }

    // Reject large bodies
    const contentLength = parseInt(request.headers.get('Content-Length') ?? '0', 10);
    if (contentLength > 1024) {
      return new Response(JSON.stringify({ error: 'Body too large' }), {
        status: 413,
        headers: noStoreHeaders(),
      });
    }

    const ipHash = await hashIp(clientIp);

    // ── GET /ws — WebSocket upgrade ──
    if (url.pathname === '/ws' && request.method === 'GET') {
      if (env.ALLOWED_ORIGIN !== '*' && origin && origin !== env.ALLOWED_ORIGIN) {
        return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
          status: 403,
          headers: noStoreHeaders(),
        });
      }

      if (!checkRate(`ws:${ipHash}`, 10, 60000)) {
        return new Response(JSON.stringify({ error: 'Rate limited' }), {
          status: 429,
          headers: noStoreHeaders(),
        });
      }

      const sessionId = url.searchParams.get('session');
      const role = url.searchParams.get('role') as 'sender' | 'receiver' | null;

      if (!sessionId || !role || !['sender', 'receiver'].includes(role)) {
        return new Response(JSON.stringify({ error: 'Missing session or role' }), {
          status: 400,
          headers: noStoreHeaders(),
        });
      }

      const doId = env.SESSION_DO.idFromName(sessionId);
      const stub = env.SESSION_DO.get(doId);
      return stub.fetch(request);
    }

    // ── POST /api/code — Reserve a 6-digit code ──
    if (url.pathname === '/api/code' && request.method === 'POST') {
      if (!checkRate(`code:${ipHash}`, 10, 60000)) {
        return new Response(JSON.stringify({ error: 'Rate limited' }), {
          status: 429,
          headers: noStoreHeaders(corsHeaders(origin, env.ALLOWED_ORIGIN)),
        });
      }

      const body = await request.json() as Record<string, unknown>;
      const sessionId = body['sessionId'];

      if (typeof sessionId !== 'string' || sessionId.length > 64) {
        return new Response(JSON.stringify({ error: 'Invalid sessionId' }), {
          status: 400,
          headers: noStoreHeaders(corsHeaders(origin, env.ALLOWED_ORIGIN)),
        });
      }

      let code: string;
      let attempts = 0;
      do {
        const bytes = new Uint8Array(4);
        crypto.getRandomValues(bytes);
        const num = new DataView(bytes.buffer).getUint32(0) % 1000000;
        code = num.toString().padStart(6, '0');
        attempts++;
      } while (CODE_MAP.has(code) && attempts < 100);

      const now = Date.now();
      for (const [k, v] of CODE_MAP) {
        if (now > v.expires) CODE_MAP.delete(k);
      }

      CODE_MAP.set(code, {
        sessionId,
        expires: now + 120000,
        attempts: 0,
      });

      return new Response(JSON.stringify({ code }), {
        status: 200,
        headers: noStoreHeaders(corsHeaders(origin, env.ALLOWED_ORIGIN)),
      });
    }

    // ── POST /api/code/resolve ──
    if (url.pathname === '/api/code/resolve' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>;
      const code = body['code'];

      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        return new Response(JSON.stringify({ error: 'Invalid code format' }), {
          status: 400,
          headers: noStoreHeaders(corsHeaders(origin, env.ALLOWED_ORIGIN)),
        });
      }

      const entry = CODE_MAP.get(code);
      if (!entry || Date.now() > entry.expires) {
        CODE_MAP.delete(code);
        return new Response(JSON.stringify({ error: 'Code expired or invalid' }), {
          status: 404,
          headers: noStoreHeaders(corsHeaders(origin, env.ALLOWED_ORIGIN)),
        });
      }

      entry.attempts++;
      if (entry.attempts > 5) {
        CODE_MAP.delete(code);
        return new Response(JSON.stringify({ error: 'Too many attempts' }), {
          status: 429,
          headers: noStoreHeaders(corsHeaders(origin, env.ALLOWED_ORIGIN)),
        });
      }

      const sessionId = entry.sessionId;
      CODE_MAP.delete(code);

      return new Response(JSON.stringify({ sessionId }), {
        status: 200,
        headers: noStoreHeaders(corsHeaders(origin, env.ALLOWED_ORIGIN)),
      });
    }

    // ── GET /api/ice ──
    if (url.pathname === '/api/ice' && request.method === 'GET') {
      const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
        { urls: 'stun:stun.cloudflare.com:3478' },
      ];

      if (env.TURN_KEY_ID && env.TURN_API_TOKEN) {
        try {
          const ttl = 600;
          const timestamp = Math.floor(Date.now() / 1000) + ttl;
          const username = `${timestamp}:picbeam`;
          const encoder = new TextEncoder();
          const keyData = encoder.encode(env.TURN_API_TOKEN);
          const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
          const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(username));
          const credential = btoa(String.fromCharCode(...new Uint8Array(sig)));
          iceServers.push({
            urls: 'turn:turn.cloudflare.com:3478?transport=udp',
            username,
            credential,
          });
        } catch {
          // TURN not available
        }
      }

      return new Response(JSON.stringify({ iceServers }), {
        status: 200,
        headers: noStoreHeaders(corsHeaders(origin, env.ALLOWED_ORIGIN)),
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: noStoreHeaders(),
    });
  },
};
