/**
 * PicBeam Production Server for Render / Railway / Node.js
 *
 * Provides:
 * 1. Fast static file serving for the Preact PWA (dist/)
 * 2. SPA client-side routing fallback (dist/index.html)
 * 3. 6-digit code pairing API (/api/code and /api/code/resolve)
 * 4. ICE / STUN server configuration (/api/ice)
 * 5. Full WebSocket signaling server (/ws) for WebRTC handshakes
 * 6. Health check endpoint (/health)
 *
 * Zero external dependencies except 'ws'.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = parseInt(process.env.PORT || '10000', 10);
const HOST = '0.0.0.0';
const DIST_DIR = path.resolve(__dirname, 'dist');

// ── In-Memory 6-Digit Code Pairing Store ──
const codeStore = new Map(); // code -> { sessionId, expires, attempts }

function cleanExpiredCodes() {
  const now = Date.now();
  for (const [code, entry] of codeStore.entries()) {
    if (now > entry.expires) {
      codeStore.delete(code);
    }
  }
}

// ── In-Memory WebSocket Signaling Sessions ──
const sessions = new Map(); // sessionId -> Session

const MAX_MESSAGE_SIZE = 65536;
const PING_INTERVAL = 30000;
const SESSION_TTL = 120000; // 2 minutes

class SignalingSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.peers = new Map(); // peerId -> { ws, role, msgCount, msgResetAt, lastPong }
    this.createdAt = Date.now();
    this.sealed = false;

    this.ttlTimer = setTimeout(() => {
      this.destroy('Session expired');
    }, SESSION_TTL);

    this.pingTimer = setInterval(() => {
      this.checkPeers();
    }, PING_INTERVAL);
  }

  addPeer(ws, role) {
    if (this.sealed || this.peers.size >= 2) {
      try {
        ws.close(4003, 'Session full');
      } catch (_) {}
      return false;
    }

    for (const peer of this.peers.values()) {
      if (peer.role === role) {
        try {
          ws.close(4009, 'Role already taken');
        } catch (_) {}
        return false;
      }
    }

    const peerId = crypto.randomUUID();
    const peer = {
      ws,
      role,
      msgCount: 0,
      msgResetAt: Date.now() + 60000,
      lastPong: Date.now(),
    };
    this.peers.set(peerId, peer);

    ws.on('message', (data) => {
      this.handleMessage(peerId, data);
    });

    ws.on('close', () => {
      this.removePeer(peerId);
    });

    ws.on('error', () => {
      this.removePeer(peerId);
    });

    // When both sender and receiver have joined, announce pairing
    if (this.peers.size === 2) {
      this.sealed = true;
      for (const p of this.peers.values()) {
        try {
          p.ws.send(JSON.stringify({ event: 'peer-joined' }));
        } catch (_) {}
      }
    }

    return true;
  }

  handleMessage(senderId, data) {
    const sender = this.peers.get(senderId);
    if (!sender) return;

    const text = typeof data === 'string' ? data : data.toString('utf8');

    // Handle pong
    if (text === 'pong') {
      sender.lastPong = Date.now();
      return;
    }

    // Rate limiting: 100 msg/min
    const now = Date.now();
    if (now > sender.msgResetAt) {
      sender.msgCount = 0;
      sender.msgResetAt = now + 60000;
    }
    sender.msgCount++;
    if (sender.msgCount > 100) {
      try {
        sender.ws.close(4003, 'Rate limited');
      } catch (_) {}
      this.removePeer(senderId);
      return;
    }

    if (text.length > MAX_MESSAGE_SIZE) {
      try {
        sender.ws.close(4005, 'Message too large');
      } catch (_) {}
      this.removePeer(senderId);
      return;
    }

    try {
      const parsed = JSON.parse(text);
      if (parsed.event === 'ready') {
        this.destroy('Handshake complete');
        return;
      }
    } catch (_) {}

    // Relay to other peer
    for (const [id, peer] of this.peers.entries()) {
      if (id !== senderId) {
        try {
          peer.ws.send(text);
        } catch (_) {
          this.removePeer(id);
        }
      }
    }
  }

  removePeer(peerId) {
    this.peers.delete(peerId);
    if (this.peers.size < 2) {
      this.sealed = false;
      // Notify remaining peer
      for (const peer of this.peers.values()) {
        try {
          peer.ws.send(JSON.stringify({ event: 'peer-left' }));
        } catch (_) {}
      }
    }
    if (this.peers.size === 0) {
      this.destroy('All peers left');
    }
  }

  checkPeers() {
    const now = Date.now();
    for (const [id, peer] of this.peers.entries()) {
      if (now - peer.lastPong > PING_INTERVAL * 2) {
        try {
          peer.ws.close(4000, 'Ping timeout');
        } catch (_) {}
        this.removePeer(id);
      } else {
        try {
          peer.ws.send('ping');
        } catch (_) {
          this.removePeer(id);
        }
      }
    }
  }

  destroy(_reason) {
    clearTimeout(this.ttlTimer);
    clearInterval(this.pingTimer);
    for (const peer of this.peers.values()) {
      try {
        peer.ws.close(1000, 'Session ended');
      } catch (_) {}
    }
    this.peers.clear();
    sessions.delete(this.sessionId);
  }
}

// ── MIME Types ──
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// ── Read JSON Request Body Helper ──
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 65536) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// ── SSE Relay for Cross-Device Mock Communication ──
// Mirrors the Vite mockRelayPlugin so the same BroadcastChannel + SSE
// mechanism works in production on Render / Railway.
const sseClients = new Set();

// ── HTTP Request Handler ──
function handleHttpRequest(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');

  // CORS headers for APIs
  if (pathname.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
  }

  // ── SSE: Server-Sent Events stream for cross-device relay ──
  if (pathname === '/api/mock-events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // ── SSE: Broadcast endpoint for cross-device relay ──
  if (pathname === '/api/mock-broadcast' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_MESSAGE_SIZE) {
        req.destroy();
      }
    });
    req.on('end', () => {
      // Broadcast to all connected SSE clients
      for (const client of sseClients) {
        try {
          client.write(`data: ${body}\n\n`);
        } catch (_) {
          sseClients.delete(client);
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // ── Health Check Endpoint ──
  if (pathname === '/health' || pathname === '/api/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() }));
    return;
  }

  // ── POST /api/code: Generate 6-digit code ──
  if (pathname === '/api/code' && req.method === 'POST') {
    readJsonBody(req)
      .then((body) => {
        const sessionId = body && body.sessionId;
        if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 64) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid sessionId' }));
          return;
        }

        cleanExpiredCodes();

        // Generate alphanumeric 6-char code (unambiguous chars)
        const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let code;
        let attempts = 0;
        do {
          code = '';
          for (let i = 0; i < 6; i++) {
            code += CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)];
          }
          attempts++;
        } while (codeStore.has(code) && attempts < 100);

        codeStore.set(code, {
          sessionId,
          expires: Date.now() + 120000,
          attempts: 0,
        });

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code }));
      })
      .catch((err) => {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: err.message || 'Invalid JSON' }));
      });
    return;
  }

  // ── POST /api/code/resolve: Resolve 6-digit code ──
  if (pathname === '/api/code/resolve' && req.method === 'POST') {
    readJsonBody(req)
      .then((body) => {
        const code = body && body.code;
        if (typeof code !== 'string' || !/^[0-9A-Z]{6}$/.test(code.toUpperCase())) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid code format' }));
          return;
        }

        const normalizedCode = code.toUpperCase();
        cleanExpiredCodes();

        const entry = codeStore.get(normalizedCode);
        if (!entry || Date.now() > entry.expires) {
          codeStore.delete(normalizedCode);
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Code expired or invalid' }));
          return;
        }

        entry.attempts++;
        if (entry.attempts > 5) {
          codeStore.delete(normalizedCode);
          res.statusCode = 429;
          res.end(JSON.stringify({ error: 'Too many attempts' }));
          return;
        }

        const sessionId = entry.sessionId;
        codeStore.delete(normalizedCode); // Single use

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ sessionId }));
      })
      .catch((err) => {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: err.message || 'Invalid JSON' }));
      });
    return;
  }

  // ── GET /api/ice: Return ICE servers ──
  if (pathname === '/api/ice' && req.method === 'GET') {
    const iceServers = [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      iceServers.push({
        urls: process.env.TURN_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ iceServers }));
    return;
  }

  // ── Static Files & SPA Fallback ──
  if (req.method === 'GET' || req.method === 'HEAD') {
    let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
      safePath = '/index.html';
    }

    let filePath = path.join(DIST_DIR, safePath);

    // Prevent directory traversal
    if (!filePath.startsWith(DIST_DIR)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      // If file exists and is a file, serve it
      if (!err && stats.isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // Caching policy
        if (pathname.startsWith('/assets/') || pathname.startsWith('/fonts/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (pathname === '/sw.js' || pathname === '/manifest.webmanifest') {
          res.setHeader('Cache-Control', 'no-cache');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stats.size);

        if (req.method === 'HEAD') {
          res.end();
          return;
        }

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        return;
      }

      // SPA Fallback: serve index.html for unknown routes
      const indexPath = path.join(DIST_DIR, 'index.html');
      fs.stat(indexPath, (indexErr, indexStats) => {
        if (!indexErr && indexStats.isFile()) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Content-Length', indexStats.size);

          if (req.method === 'HEAD') {
            res.end();
            return;
          }

          const stream = fs.createReadStream(indexPath);
          stream.pipe(res);
          return;
        }

        res.statusCode = 404;
        res.end('Not found. Please build the frontend with `npm run build` first.');
      });
    });
    return;
  }

  res.statusCode = 405;
  res.end('Method Not Allowed');
}

// ── Start HTTP Server ──
const server = http.createServer(handleHttpRequest);

// ── WebSocket Server on /ws ──
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const reqUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (reqUrl.pathname === '/ws') {
    const sessionId = reqUrl.searchParams.get('session');
    const role = reqUrl.searchParams.get('role');

    if (!sessionId || !role || (role !== 'sender' && role !== 'receiver')) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\nMissing session or valid role');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      let session = sessions.get(sessionId);
      if (!session) {
        session = new SignalingSession(sessionId);
        sessions.set(sessionId, session);
      }

      const added = session.addPeer(ws, role);
      if (!added) {
        // addPeer closes the socket if rejected
      }
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[PicBeam] Server listening on http://${HOST}:${PORT}`);
  console.log(`[PicBeam] Serving static files from: ${DIST_DIR}`);
  console.log(`[PicBeam] WebSocket signaling active on: ws://${HOST}:${PORT}/ws`);
});

// Graceful shutdown
function shutdown() {
  console.log('[PicBeam] Shutting down server...');
  server.close(() => {
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
