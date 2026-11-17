/**
 * SessionDO — Durable Object for signaling relay
 *
 * Memory only. No storage writes. At most 2 WebSocket connections.
 * Relays text frames up to 64 KB. Single-use sessions.
 * Never logs IPs, session IDs, codes or payloads.
 */

const MAX_MESSAGE_SIZE = 65536;
const PING_INTERVAL = 30000;
const PONG_TIMEOUT = 10000;
const QR_TTL = 300000;
const CODE_TTL = 120000;
const MSG_RATE_LIMIT = 100;

interface Peer {
  ws: WebSocket;
  role: 'sender' | 'receiver';
  msgCount: number;
  msgResetAt: number;
  lastPong: number;
}

export class SessionDO implements DurableObject {
  private peers: Map<string, Peer> = new Map();
  private createdAt = Date.now();
  private ttl: number;
  private ttlTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private sealed = false;

  constructor(
    private state: DurableObjectState,
    private env: Record<string, unknown>
  ) {
    this.ttl = QR_TTL;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get('role') as 'sender' | 'receiver';
    const isCode = url.searchParams.get('mode') === 'code';

    if (isCode) this.ttl = CODE_TTL;

    if (this.sealed || this.peers.size >= 2) {
      return new Response(JSON.stringify({ error: 'Session full' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    for (const peer of this.peers.values()) {
      if (peer.role === role) {
        return new Response(JSON.stringify({ error: 'Role already taken' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
    }

    if (Date.now() - this.createdAt > this.ttl) {
      return new Response(JSON.stringify({ error: 'Session expired' }), {
        status: 410,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);

    const peerId = crypto.randomUUID();
    this.peers.set(peerId, {
      ws: server,
      role,
      msgCount: 0,
      msgResetAt: Date.now() + 60000,
      lastPong: Date.now(),
    });

    if (this.peers.size === 2) {
      this.sealed = true;
      for (const peer of this.peers.values()) {
        try { peer.ws.send(JSON.stringify({ event: 'peer-joined' })); } catch { /* closed */ }
      }
    }

    if (!this.ttlTimer) {
      this.ttlTimer = setTimeout(() => this.destroySession('Session expired'), this.ttl);
    }

    if (!this.pingTimer) {
      this.pingTimer = setInterval(() => this.checkPeers(), PING_INTERVAL);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let senderId: string | null = null;
    let sender: Peer | null = null;

    for (const [id, peer] of this.peers) {
      if (peer.ws === ws) { senderId = id; sender = peer; break; }
    }

    if (!sender || !senderId) { ws.close(4005, 'Unknown peer'); return; }

    const now = Date.now();
    if (now > sender.msgResetAt) { sender.msgCount = 0; sender.msgResetAt = now + 60000; }
    sender.msgCount++;
    if (sender.msgCount > MSG_RATE_LIMIT) {
      ws.close(4003, 'Rate limited');
      this.peers.delete(senderId);
      return;
    }

    if (message === 'pong') { sender.lastPong = now; return; }
    if (typeof message !== 'string') return;
    if (message.length > MAX_MESSAGE_SIZE) {
      ws.close(4005, 'Message too large');
      this.peers.delete(senderId);
      return;
    }

    try {
      const parsed = JSON.parse(message);
      if (parsed.event === 'ready') { this.destroySession('Handshake complete'); return; }
    } catch { /* relay as-is */ }

    for (const [id, peer] of this.peers) {
      if (id !== senderId) {
        try { peer.ws.send(message); } catch {
          this.peers.delete(id);
          this.notifyPeerLeft(senderId);
        }
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    for (const [id, peer] of this.peers) {
      if (peer.ws === ws) {
        this.peers.delete(id);
        for (const [otherId] of this.peers) this.notifyPeerLeft(otherId);
        break;
      }
    }
    if (this.peers.size === 0) this.cleanup();
  }

  async webSocketError(ws: WebSocket): Promise<void> { await this.webSocketClose(ws); }

  private notifyPeerLeft(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) { try { peer.ws.send(JSON.stringify({ event: 'peer-left' })); } catch { /* gone */ } }
  }

  private checkPeers(): void {
    const now = Date.now();
    for (const [id, peer] of this.peers) {
      if (now - peer.lastPong > PING_INTERVAL + PONG_TIMEOUT) {
        try { peer.ws.close(1001, 'Idle timeout'); } catch { /* closed */ }
        this.peers.delete(id);
        continue;
      }
      try { peer.ws.send('ping'); } catch { this.peers.delete(id); }
    }
    if (this.peers.size === 0) this.cleanup();
  }

  private destroySession(reason: string): void {
    for (const [, peer] of this.peers) {
      try { peer.ws.close(1000, reason); } catch { /* closed */ }
    }
    this.peers.clear();
    this.cleanup();
  }

  private cleanup(): void {
    if (this.ttlTimer !== null) { clearTimeout(this.ttlTimer); this.ttlTimer = null; }
    if (this.pingTimer !== null) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }
}
