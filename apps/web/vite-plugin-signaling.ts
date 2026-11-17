/**
 * Vite Dev Signaling & API Plugin for PicBeam
 *
 * Embeds the signaling WebSocket and code pairing APIs directly into Vite's dev server.
 * This eliminates the need to run an external worker on port 8787 during local development,
 * preventing `ECONNREFUSED` proxy errors when selecting photos.
 */

import type { Plugin } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import crypto from 'node:crypto';

interface Peer {
  ws: WebSocket;
  role: 'sender' | 'receiver';
  msgCount: number;
  msgResetAt: number;
  lastPong: number;
}

class DevSession {
  private peers = new Map<string, Peer>();
  private sealed = false;
  private ttlTimer: NodeJS.Timeout;
  private pingTimer: NodeJS.Timeout;

  constructor(
    public sessionId: string,
    private parentSessions: Map<string, DevSession>
  ) {
    this.ttlTimer = setTimeout(() => this.destroy('Session expired'), 120000);
    this.pingTimer = setInterval(() => this.checkPeers(), 30000);
  }

  addPeer(ws: WebSocket, role: 'sender' | 'receiver'): boolean {
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
    const peer: Peer = {
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

  handleMessage(senderId: string, data: unknown) {
    const sender = this.peers.get(senderId);
    if (!sender) return;

    const text = typeof data === 'string' ? data : (data as Buffer).toString('utf8');

    if (text === 'pong') {
      sender.lastPong = Date.now();
      return;
    }

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

    if (text.length > 65536) {
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

  removePeer(peerId: string) {
    this.peers.delete(peerId);
    if (this.peers.size < 2) {
      this.sealed = false;
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
      if (now - peer.lastPong > 60000) {
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

  destroy(_reason: string) {
    clearTimeout(this.ttlTimer);
    clearInterval(this.pingTimer);
    for (const peer of this.peers.values()) {
      try {
        peer.ws.close(1000, 'Session ended');
      } catch (_) {}
    }
    this.peers.clear();
    this.parentSessions.delete(this.sessionId);
  }
}

export function devSignalingPlugin(): Plugin {
  const codeStore = new Map<string, { sessionId: string; expires: number; attempts: number }>();
  const sessions = new Map<string, DevSession>();

  function cleanExpiredCodes() {
    const now = Date.now();
    for (const [code, entry] of codeStore.entries()) {
      if (now > entry.expires) {
        codeStore.delete(code);
      }
    }
  }

  return {
    name: 'picbeam-dev-signaling',
    configureServer(server) {
      // ── API Middleware ──
      server.middlewares.use((req, res, next) => {
        const reqUrl = new URL(req.url || '/', 'http://localhost');
        const pathname = reqUrl.pathname;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
          res.statusCode = 204;
          res.end();
          return;
        }

        // ── POST /api/code ──
        if (pathname === '/api/code' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (c) => (bodyStr += c));
          req.on('end', () => {
            try {
              const body = bodyStr ? JSON.parse(bodyStr) : {};
              const sessionId = body.sessionId;
              if (typeof sessionId !== 'string' || !sessionId) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid sessionId' }));
                return;
              }

              cleanExpiredCodes();

              let code: string;
              let attempts = 0;
              do {
                const num = crypto.randomInt(0, 1000000);
                code = num.toString().padStart(6, '0');
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
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        // ── POST /api/code/resolve ──
        if (pathname === '/api/code/resolve' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (c) => (bodyStr += c));
          req.on('end', () => {
            try {
              const body = bodyStr ? JSON.parse(bodyStr) : {};
              const code = body.code;
              if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid code format' }));
                return;
              }

              cleanExpiredCodes();

              const entry = codeStore.get(code);
              if (!entry || Date.now() > entry.expires) {
                codeStore.delete(code);
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Code expired or invalid' }));
                return;
              }

              entry.attempts++;
              if (entry.attempts > 5) {
                codeStore.delete(code);
                res.statusCode = 429;
                res.end(JSON.stringify({ error: 'Too many attempts' }));
                return;
              }

              const sessionId = entry.sessionId;
              codeStore.delete(code);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ sessionId }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        // ── GET /api/ice ──
        if (pathname === '/api/ice' && req.method === 'GET') {
          const iceServers = [
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ];
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ iceServers }));
          return;
        }

        next();
      });

      // ── WebSocket Upgrade on /ws ──
      const wss = new WebSocketServer({ noServer: true });

      server.httpServer?.on('upgrade', (request, socket, head) => {
        const reqUrl = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);

        if (reqUrl.pathname === '/ws') {
          const sessionId = reqUrl.searchParams.get('session');
          const role = reqUrl.searchParams.get('role') as 'sender' | 'receiver' | null;

          if (!sessionId || !role || (role !== 'sender' && role !== 'receiver')) {
            socket.destroy();
            return;
          }

          wss.handleUpgrade(request, socket, head, (ws) => {
            let session = sessions.get(sessionId);
            if (!session) {
              session = new DevSession(sessionId, sessions);
              sessions.set(sessionId, session);
            }
            session.addPeer(ws, role);
          });
        }
      });
    },
  };
}
