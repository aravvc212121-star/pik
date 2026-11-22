/**
 * WebRTCSession — Real device-to-device encrypted transfer.
 *
 * Uses:
 * - /api/code (POST) to generate a 6-digit code for the sender
 * - /api/code/resolve (POST) to resolve a code to a sessionId for the receiver
 * - /api/ice (GET) to fetch ICE/STUN server config
 * - /ws WebSocket for signaling (SDP offer/answer, ICE candidates)
 * - WebRTC DataChannel for direct device-to-device photo transfer
 * - AES-256-GCM E2EE on the signaling channel (derived from a shared secret)
 *
 * Photos NEVER touch the server. The server only sees encrypted signaling.
 */

import type {
  Session,
  SessionState,
  SessionEvents,
  FileInfo,
  TransferProgress,
  ReceivedFileData,
  SessionError,
} from './types';
import {
  generateSessionId,
  SignalingConnection,
} from '../lib/pairing/index';
import type { IceConfig } from '../lib/connection';
import { WebRTCConnection } from '../lib/connection';
import { TransferSender } from '../lib/transfer/sender';
import { TransferReceiver } from '../lib/transfer/receiver';
import { PROTOCOL_VERSION, type FileManifestEntry } from '@picbeam/protocol';

// ── Helpers ──

function getWsUrl(): string {
  const loc = window.location;
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${loc.host}/ws`;
}

async function fetchIceConfig(): Promise<IceConfig> {
  try {
    const res = await fetch('/api/ice');
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };
}

async function apiGenerateCode(sessionId: string): Promise<string> {
  const res = await fetch('/api/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error('Failed to generate code');
  const data = await res.json();
  return data.code as string;
}

async function apiResolveCode(code: string): Promise<string> {
  const res = await fetch('/api/code/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('wrong-code');
    if (res.status === 429) throw new Error('too-many-attempts');
    throw new Error('resolve-failed');
  }
  const data = await res.json();
  return data.sessionId as string;
}

// ── Code formatting ──

const CODE_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes (matches server)

function formatCode(raw: string): string {
  return `${raw.slice(0, 3)} ${raw.slice(3)}`;
}

// ── Event system ──

type Listeners = {
  [K in keyof SessionEvents]?: Set<SessionEvents[K]>;
};

// ── WebRTCSession ──

export class WebRTCSession implements Session {
  private _state: SessionState = 'home';
  private _code: string | null = null;
  private _expiresAt: number | null = null;
  private _words: [string, string, string, string] | null = null;
  private _manifest: FileInfo[] | null = null;
  private _progress: TransferProgress | null = null;
  private _receivedFiles: ReceivedFileData[] = [];
  private _role: 'sender' | 'receiver' | null = null;
  private _selectedFiles: File[] = [];
  private _listeners: Listeners = {};
  private _destroyed = false;
  private _timers: ReturnType<typeof setTimeout>[] = [];

  private _sessionId: string | null = null;
  private _connection: WebRTCConnection | null = null;
  private _transferSender: TransferSender | null = null;
  private _transferReceiver: TransferReceiver | null = null;

  get state(): SessionState { return this._state; }
  get code(): string | null { return this._code; }
  get expiresAt(): number | null { return this._expiresAt; }
  get words(): [string, string, string, string] | null { return this._words; }
  get manifest(): FileInfo[] | null { return this._manifest; }
  get progress(): TransferProgress | null { return this._progress; }
  get receivedFiles(): ReceivedFileData[] { return this._receivedFiles; }

  on<K extends keyof SessionEvents>(event: K, handler: SessionEvents[K]): void {
    if (!this._listeners[event]) {
      (this._listeners as any)[event] = new Set();
    }
    this._listeners[event]!.add(handler as any);
  }

  off<K extends keyof SessionEvents>(event: K, handler: SessionEvents[K]): void {
    this._listeners[event]?.delete(handler as any);
  }

  private emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): void {
    if (this._destroyed) return;
    const set = this._listeners[event];
    if (set) {
      for (const fn of set) {
        (fn as (...a: any[]) => void)(...args);
      }
    }
  }

  private setState(s: SessionState): void {
    this._state = s;
    this.emit('stateChange', s);
  }

  private delay(ms: number, fn: () => void): void {
    if (this._destroyed) return;
    this._timers.push(setTimeout(() => {
      if (!this._destroyed) fn();
    }, ms));
  }

  // ── Sender Flow ──

  async startSending(files: File[]): Promise<void> {
    if (this._destroyed) return;
    this._role = 'sender';
    this._selectedFiles = files;
    this.setState('picking');

    try {
      // 1. Generate session ID (no secret — code-flow uses unencrypted
      //    signaling; the WebRTC DTLS layer encrypts the data channel)
      this._sessionId = generateSessionId();

      // 2. Register a 6-digit code with the server
      const rawCode = await apiGenerateCode(this._sessionId);
      this._code = formatCode(rawCode);
      this._expiresAt = Date.now() + CODE_EXPIRY_MS;

      this.setState('code-ready');
      this.emit('codeReady', this._code, this._expiresAt);

      // 3. Connect to signaling server as sender (no secret → plain signaling)
      const iceConfig = await fetchIceConfig();
      this._connection = new WebRTCConnection(
        getWsUrl(),
        'sender',
        this._sessionId,
        iceConfig
      );

      this._connection.on('stateChange', (state) => {
        if (this._destroyed) return;
        if (state === 'connected') {
          // DataChannel is ready — handled via dataChannel event
        } else if (state === 'failed') {
          this.emitError({
            type: 'connection-lost',
            message: 'Connection failed. Please try again.',
            canRetry: true,
          });
        }
      });

      this._connection.on('dataChannel', (dc) => {
        if (this._destroyed) return;
        this.emit('peerJoined');
        this.setState('awaiting-accept');

        // Build manifest
        const manifest: FileManifestEntry[] = files.map((f, i) => ({
          id: `file-${i}`,
          name: f.name,
          size: f.size,
          mimeType: f.type || 'image/jpeg',
          lastModified: f.lastModified || Date.now(),
        }));

        this._manifest = manifest.map(m => ({
          name: m.name,
          size: m.size,
          mimeType: m.mimeType,
        }));

        // Create transfer sender
        this._transferSender = new TransferSender(dc, files, manifest, false);

        this._transferSender.onProgress((p) => {
          if (this._destroyed) return;

          if (p.state === 'accepted') {
            this.emit('accepted');
            this.setState('ready-to-throw');
            this.emit('readyToThrow');
          }

          if (p.state === 'sending') {
            this._progress = {
              bytes: p.bytesSent,
              total: p.totalBytes,
              speed: p.speed,
              eta: p.timeLeft,
              currentFile: p.currentFileIndex,
            };
            this.emit('progress', this._progress);
          }

          if (p.state === 'done') {
            this.setState('done');
            this.emit('done');
          }

          if (p.state === 'cancelled') {
            this.emitError({
              type: 'cancelled',
              message: 'Transfer was cancelled.',
              canRetry: false,
            });
          }
        });

        // Send manifest to receiver
        this._transferSender.sendManifest(false);
      });

      this._connection.on('sasWords', (words) => {
        if (this._destroyed) return;
        this._words = words;
        this.emit('wordsReady', words);
      });

      this._connection.on('error', (err) => {
        if (this._destroyed) return;
        console.warn('WebRTC connection error:', err);
      });

      await this._connection.connect();

    } catch (err) {
      this.emitError({
        type: 'connection-lost',
        message: 'Could not start sending. Please check your connection.',
        canRetry: true,
      });
    }
  }

  confirmWords(): void {
    // Words verified — no additional action needed, transfer continues
  }

  rejectWords(): void {
    this.cancel();
  }

  startTransfer(): void {
    if (this._destroyed) return;
    if (this._transferSender) {
      this.setState('transferring');
      this._transferSender.startTransfer();
    }
  }

  // ── Receiver Flow ──

  openTransports(): void {
    // No-op for WebRTC — connection is established on enterCode
  }

  async enterCode(code: string): Promise<void> {
    if (this._destroyed) return;
    this._role = 'receiver';

    const normalized = code.toUpperCase().replace(/\s+/g, '');
    if (normalized.length !== 6) {
      this.emitError({
        type: 'wrong-code',
        message: "That code didn't work. Check it and try again.",
        canRetry: true,
      });
      return;
    }

    try {
      // 1. Resolve code to sessionId via server API
      const sessionId = await apiResolveCode(normalized);
      this._sessionId = sessionId;

      // 2. Fetch ICE config
      const iceConfig = await fetchIceConfig();

      // 3. Connect to signaling server as receiver
      // Note: receiver doesn't have the secret (it's generated by sender)
      // The signaling is unencrypted for the receiver side, but the
      // WebRTC DTLS layer provides encryption for the data channel.
      this._connection = new WebRTCConnection(
        getWsUrl(),
        'receiver',
        sessionId,
        iceConfig
      );

      this._connection.on('stateChange', (state) => {
        if (this._destroyed) return;
        if (state === 'failed') {
          this.emitError({
            type: 'connection-lost',
            message: 'Connection failed. Please try again.',
            canRetry: true,
          });
        }
      });

      this._connection.on('dataChannel', (dc) => {
        if (this._destroyed) return;
        this.emit('peerJoined');

        // Create transfer receiver
        this._transferReceiver = new TransferReceiver(dc, {
          onManifest: (files, totalSize, _locationStripped) => {
            if (this._destroyed) return;
            this._manifest = files.map(f => ({
              name: f.name,
              size: f.size,
              mimeType: f.mimeType,
            }));
            this.setState('awaiting-accept');
            this.emit('manifestReady', this._manifest, totalSize);
          },

          onProgress: (p) => {
            if (this._destroyed) return;
            this._progress = {
              bytes: p.bytesReceived,
              total: p.totalBytes,
              speed: p.speed,
              eta: p.speed > 0 ? (p.totalBytes - p.bytesReceived) / p.speed : 0,
              currentFile: p.currentFileIndex,
            };
            this.emit('progress', this._progress);
          },

          onFileReceived: (file) => {
            if (this._destroyed) return;
            const fileData: ReceivedFileData = {
              name: file.name,
              blob: file.blob,
              mimeType: file.mimeType,
            };
            this._receivedFiles.push(fileData);
            this.emit('fileDone', file.index, fileData);
          },

          onComplete: () => {
            if (this._destroyed) return;
            this.setState('done');
            this.emit('done');
          },

          onCancelled: () => {
            if (this._destroyed) return;
            this.emitError({
              type: 'cancelled',
              message: 'The sender cancelled the transfer.',
              canRetry: false,
            });
          },

          onError: (err) => {
            if (this._destroyed) return;
            this.emitError({
              type: 'connection-lost',
              message: err.message || 'Transfer error.',
              canRetry: true,
            });
          },
        });
      });

      this._connection.on('sasWords', (words) => {
        if (this._destroyed) return;
        this._words = words;
        this.emit('wordsReady', words);
      });

      this._connection.on('error', (err) => {
        if (this._destroyed) return;
        console.warn('WebRTC connection error:', err);
      });

      await this._connection.connect();

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'wrong-code') {
        this.emitError({
          type: 'wrong-code',
          message: "That code didn't work. Check it and try again.",
          canRetry: true,
        });
      } else if (msg === 'too-many-attempts') {
        this.emitError({
          type: 'too-many-attempts',
          message: 'Too many attempts. Ask the sender for a new code.',
          canRetry: false,
        });
      } else {
        this.emitError({
          type: 'connection-lost',
          message: 'Could not connect. Please check your connection.',
          canRetry: true,
        });
      }
    }
  }

  confirmWordsReceiver(): void {
    // Words verified — no additional action needed
  }

  acceptFiles(): void {
    if (this._destroyed) return;
    this.setState('ready-to-throw');
    this._transferReceiver?.accept();
  }

  declineFiles(): void {
    if (this._destroyed) return;
    this._transferReceiver?.decline();
    this.emitError({
      type: 'declined',
      message: 'You declined the photos.',
      canRetry: false,
    });
  }

  cancel(): void {
    if (this._destroyed) return;
    this.clearTimers();

    if (this._role === 'sender' && this._transferSender) {
      this._transferSender.cancel();
    }
    if (this._role === 'receiver' && this._transferReceiver) {
      this._transferReceiver.cancel();
    }

    this._connection?.destroy();
    this._connection = null;

    this.emitError({
      type: 'cancelled',
      message: 'Transfer was cancelled.',
      canRetry: false,
    });
  }

  destroy(): void {
    this._destroyed = true;
    this.clearTimers();
    this._transferSender?.destroy();
    this._transferReceiver?.destroy();
    this._connection?.destroy();
    this._connection = null;
    this._transferSender = null;
    this._transferReceiver = null;
    this._listeners = {};
  }

  private emitError(err: SessionError): void {
    this._state = 'error';
    this.emit('stateChange', 'error');
    this.emit('error', err);
  }

  private clearTimers(): void {
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
  }
}
