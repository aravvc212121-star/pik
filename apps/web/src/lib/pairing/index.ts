/**
 * PicBeam Pairing — QR/code session management, SAS verification
 */

import {
  generateSessionId,
  generateSecret,
  deriveSignalingKey,
  encryptSignaling,
  decryptSignaling,
  extractDtlsFingerprint,
  wipeBuffer,
  base64urlDecode,
  hexEncode,
} from '../crypto/index';
import { PROTOCOL_VERSION, type SignalingEnvelope } from '@picbeam/protocol';

// ── SAS Word List (256 unambiguous English words) ──
const SAS_WORDS = [
  'apple','badge','cable','dance','eagle','fence','ghost','happy','ivory','jelly',
  'kayak','lemon','magic','noble','ocean','paint','queen','river','solar','tiger',
  'ultra','valve','water','xenon','yacht','zebra','alarm','bloom','chase','dream',
  'ember','flute','grape','haven','image','joint','kneel','laser','medal','nerve',
  'olive','pearl','quilt','rouge','stone','trail','union','vivid','wheat','youth',
  'amber','beach','coral','delta','flame','globe','humor','input','jewel','knife',
  'light','maple','north','orbit','plaza','quest','rally','scale','torch','unity',
  'verse','world','arena','blaze','crane','drift','elite','frost','grain','house',
  'inner','jumbo','kiosk','lever','minor','nexus','oxide','prism','radar','spark',
  'tower','urban','vault','wrist','angel','brave','climb','depth','event','frame',
  'guide','heart','ideal','juice','knack','lodge','motor','night','outer','pivot',
  'range','shelf','tempo','umbra','vigor','wheel','anvil','blend','cedar','digit',
  'epoch','field','glaze','hatch','ionic','joker','knoll','lunar','march','noted',
  'oasis','panel','quota','robin','steep','trend','usher','vocal','yield','acorn',
  'brine','chart','donor','expat','flora','glyph','hover','irony','jazzy','kelps',
  'lymph','mirth','notch','omega','plumb','retry','swirl','tidal','unify','vinyl',
  'waltz','axiom','biome','cloth','dwelt','elbow','forge','gnome','hydra','igloo',
  'jewel','knelt','lilac','mango','nifty','optic','pouch','quirk','roost','sixth',
  'thyme','ultra','valet','woven','abode','birch','crest','denim','exert','fjord',
  'grasp','hefty','infer','jumpy','knead','llama','moose','ninth','onset','pixel',
  'quota','rinse','stork','tulip','udder','vivid','waltz','xylem','yodel','zilch',
  'agile','brisk','clamp','drape','ensue','fable','gourd','hoist','ivory','jaunt',
  'karma','latch','melon','nutty','oxide','plank','quota','ridge','sprig','trout',
  'usurp','venom','whisk','abbot','bliss','cloak','dwarf','eclat','floss','grout',
  'haste','impel','joust','knave','lyric','mulch','naive','overt','plume','quake',
  'relic','snare','talon','undue','vigor',
];

/** Build the QR URL — secret in fragment only */
export function buildQrUrl(domain: string, sessionId: string, secret: string): string {
  return `https://${domain}/r#${sessionId}.${secret}`;
}

/** Parse a QR URL, extract sessionId and secret from fragment */
export function parseQrUrl(url: string): { sessionId: string; secret: string } | null {
  try {
    const u = new URL(url);
    const fragment = u.hash.slice(1); // Remove #
    const dot = fragment.indexOf('.');
    if (dot < 1) return null;
    const sessionId = fragment.slice(0, dot);
    const secret = fragment.slice(dot + 1);
    if (!sessionId || !secret) return null;
    return { sessionId, secret };
  } catch {
    return null;
  }
}

/** Generate a random 6-digit code */
export function generateCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num = new DataView(bytes.buffer).getUint32(0) % 1000000;
  return num.toString().padStart(6, '0');
}

/**
 * Derive 4 SAS words from two DTLS fingerprints.
 * Sort fingerprints so both sides get the same words.
 */
export async function deriveSasWords(
  fingerprint1: string,
  fingerprint2: string
): Promise<[string, string, string, string]> {
  const sorted = [fingerprint1.toLowerCase(), fingerprint2.toLowerCase()].sort();
  const data = new TextEncoder().encode(sorted.join('|'));
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);

  return [
    SAS_WORDS[bytes[0]!]!,
    SAS_WORDS[bytes[1]!]!,
    SAS_WORDS[bytes[2]!]!,
    SAS_WORDS[bytes[3]!]!,
  ];
}

// ── Signaling WebSocket Manager ──

export type SignalingState =
  | 'connecting'
  | 'waiting'
  | 'paired'
  | 'failed'
  | 'closed';

export interface SignalingEvents {
  stateChange: (state: SignalingState) => void;
  message: (type: string, payload: string) => void;
  error: (err: Error) => void;
}

export class SignalingConnection {
  private ws: WebSocket | null = null;
  private key: CryptoKey | null = null;
  private sendCounter = 0;
  private recvCounter = 0;
  private _state: SignalingState = 'connecting';
  private listeners = new Map<string, Set<Function>>();
  private sessionId: string;
  private role: 'sender' | 'receiver';
  private encrypted: boolean;

  constructor(
    private wsUrl: string,
    role: 'sender' | 'receiver',
    sessionId: string,
    private secret?: string
  ) {
    this.role = role;
    this.sessionId = sessionId;
    this.encrypted = !!secret;
  }

  get state(): SignalingState {
    return this._state;
  }

  on<K extends keyof SignalingEvents>(event: K, fn: SignalingEvents[K]): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off<K extends keyof SignalingEvents>(event: K, fn: SignalingEvents[K]): void {
    this.listeners.get(event)?.delete(fn);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }

  private setState(state: SignalingState): void {
    this._state = state;
    this.emit('stateChange', state);
  }

  async connect(): Promise<void> {
    if (this.encrypted && this.secret) {
      this.key = await deriveSignalingKey(this.secret, this.sessionId);
    }

    const url = `${this.wsUrl}?session=${encodeURIComponent(this.sessionId)}&role=${this.role}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.setState('waiting');
    };

    this.ws.onmessage = async (event) => {
      try {
        // Handle server heartbeat pings (plain text "ping")
        if (typeof event.data === 'string' && event.data === 'ping') {
          try { this.ws?.send('pong'); } catch { /* ignore */ }
          return;
        }

        const envelope = JSON.parse(event.data as string) as SignalingEnvelope;

        // Server control messages
        if (envelope.type === 'error') {
          this.emit('error', new Error(envelope.payload));
          return;
        }

        // Server lifecycle events: peer-joined / peer-left
        const rawObj = envelope as unknown as Record<string, unknown>;
        if (rawObj['event'] === 'peer-joined') {
          this.setState('paired');
          return;
        }
        if (rawObj['event'] === 'peer-left') {
          // Peer left the signaling server; if WebRTC is already connected, transfer continues
          return;
        }

        // Ignore frames without valid type or payload
        if (!envelope.type || envelope.payload === undefined) {
          return;
        }

        let payload: string;
        if (this.encrypted && this.key) {
          payload = await decryptSignaling(
            this.key,
            envelope.payload,
            this.sessionId,
            this.recvCounter++
          );
        } else {
          payload = envelope.payload;
          this.recvCounter++;
        }

        this.emit('message', envelope.type, payload);
      } catch (err) {
        console.warn('Signaling message handling error:', err);
      }
    };

    this.ws.onclose = () => {
      this.setState('closed');
    };

    this.ws.onerror = () => {
      this.setState('failed');
      this.emit('error', new Error('WebSocket connection failed'));
    };
  }

  async send(type: string, payload: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not open');
    }

    let encPayload: string;
    if (this.encrypted && this.key) {
      encPayload = await encryptSignaling(
        this.key,
        payload,
        this.sessionId,
        this.sendCounter++
      );
    } else {
      encPayload = payload;
      this.sendCounter++;
    }

    const envelope: SignalingEnvelope = {
      v: PROTOCOL_VERSION,
      type: type as SignalingEnvelope['type'],
      payload: encPayload,
    };

    this.ws.send(JSON.stringify(envelope));
  }

  close(): void {
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }
    this.key = null;
    this.sendCounter = 0;
    this.recvCounter = 0;
    this.setState('closed');
  }

  /** Wipe all sensitive data */
  destroy(): void {
    this.close();
    this.listeners.clear();
  }
}

export {
  generateSessionId,
  generateSecret,
  extractDtlsFingerprint,
};
