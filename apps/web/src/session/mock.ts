/**
 * PicBeam MockSession — Multi-tab & Cross-Device communication.
 *
 * Real photo transmission:
 * - Sender converts selected photos to Data URLs / Blobs.
 * - Receiver receives the actual images and displays them in the Catching tray and Received grid.
 *
 * Dynamic Alphanumeric Code:
 * - Refreshed with a fresh random 6-character alphanumeric code for every send.
 * - Receiver accepts letters and numbers.
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

// ── Dynamic Alphanumeric Code Generator ──

// Uses unambiguous uppercase characters (excluding confusing O, 0, I, 1)
const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRandomCode(): string {
  let result = '';
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * CODE_CHARS.length);
    result += CODE_CHARS[idx];
  }
  return result;
}

const CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const CHANNEL_NAME = 'picbeam-mock';

const MOCK_FILE_NAMES = [
  'IMG_2847.jpg',
  'IMG_2848.jpg',
  'IMG_2849.jpg',
  'IMG_2850.jpg',
  'IMG_2851.jpg',
  'IMG_2852.jpg',
  'IMG_2853.jpg',
  'DSC_0024.jpg',
  'DSC_0025.jpg',
  'VID_20241103.mp4',
  'Screenshot.png',
  'Notes_scan.jpg',
];

/** Generate scenic gradient SVG blob for mock fallback */
function createScenicPhotoBlob(index: number): Blob {
  const gradients = [
    ['#FF7E5F', '#FEB47B'],
    ['#6A11CB', '#2575FC'],
    ['#37ECBA', '#72AFD3'],
    ['#F857A6', '#FF5858'],
    ['#00C9FF', '#92FE9D'],
    ['#FC466B', '#3F5EFB'],
    ['#FDBB2D', '#22C1C3'],
    ['#11998E', '#38EF7D'],
  ];
  const [c1, c2] = gradients[index % gradients.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" fill="url(#g)"/>
    <circle cx="150" cy="110" r="45" fill="rgba(255,255,255,0.4)"/>
    <path d="M40 250 L120 160 L180 210 L220 170 L260 250 Z" fill="rgba(255,255,255,0.6)"/>
  </svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

/** Convert a File to a compressed Data URL for fast cross-tab/cross-device transmission */
async function fileToDataUrl(file: File): Promise<string> {
  if (typeof createImageBitmap !== 'undefined' && file.type.startsWith('image/')) {
    try {
      const bitmap = await createImageBitmap(file, { resizeWidth: 480, resizeQuality: 'medium' });
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (_) {}
  }

  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function randomFileSize(): number {
  return Math.floor(2_000_000 + Math.random() * 4_000_000);
}

function generateMockManifest(): FileInfo[] {
  return MOCK_FILE_NAMES.map((name) => ({
    name,
    size: randomFileSize(),
    mimeType: 'image/jpeg',
  }));
}

// ── Message types ──

interface MockMessage {
  msgId: string;
  senderClientId: string;
  type:
    | 'sender-ready'
    | 'receiver-connect'
    | 'sender-connected'
    | 'receiver-accepted'
    | 'receiver-declined'
    | 'sender-throwing'
    | 'transfer-progress'
    | 'transfer-file-done'
    | 'transfer-done'
    | 'sender-cancelled'
    | 'receiver-cancelled'
    | 'wrong-code'
    | 'code-expired';
  code?: string;
  manifest?: FileInfo[];
  totalSize?: number;
  progress?: TransferProgress;
  fileIndex?: number;
  fileName?: string;
  fileMime?: string;
  fileDataUrl?: string;
}

type Listeners = {
  [K in keyof SessionEvents]?: Set<SessionEvents[K]>;
};

// ── MockSession ──

export class MockSession implements Session {
  private _state: SessionState = 'home';
  private _code: string | null = null;
  private _enteredCode: string | null = null;
  private _expiresAt: number | null = null;
  private _words: [string, string, string, string] | null = null;
  private _manifest: FileInfo[] | null = null;
  private _progress: TransferProgress | null = null;
  private _receivedFiles: ReceivedFileData[] = [];
  private _role: 'sender' | 'receiver' | null = null;
  private _selectedFiles: File[] = [];
  private _hasSenderPeer = false;
  private _timers: ReturnType<typeof setTimeout>[] = [];
  private _intervals: ReturnType<typeof setInterval>[] = [];
  private _listeners: Listeners = {};
  private _destroyed = false;
  private _wrongCodeAttempts = 0;
  private _clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  private _seenMessageIds = new Set<string>();

  private _channel: BroadcastChannel | null = null;
  private _eventSource: EventSource | null = null;

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

  openTransports(): void {
    if (this._channel || this._eventSource) return;

    // 1. BroadcastChannel for same-origin tabs
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this._channel = new BroadcastChannel(CHANNEL_NAME);
        this._channel.onmessage = (e: MessageEvent<MockMessage>) => {
          this.handleIncomingMessage(e.data);
        };
      }
    } catch (_) {}

    // 2. Server-Sent Events for cross-device Wi-Fi relay
    try {
      if (typeof EventSource !== 'undefined') {
        const es = new EventSource('/api/mock-events');
        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data) as MockMessage;
            this.handleIncomingMessage(data);
          } catch (_) {}
        };
        this._eventSource = es;
      }
    } catch (_) {}
  }

  private broadcast(data: Omit<MockMessage, 'msgId' | 'senderClientId'>): void {
    const msg: MockMessage = {
      ...data,
      msgId: Math.random().toString(36).slice(2) + Date.now().toString(36),
      senderClientId: this._clientId,
    };
    this._seenMessageIds.add(msg.msgId);

    try {
      this._channel?.postMessage(msg);
    } catch (_) {}

    try {
      fetch('/api/mock-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      }).catch(() => {});
    } catch (_) {}
  }

  private async handleIncomingMessage(msg: MockMessage): Promise<void> {
    if (this._destroyed || !msg || typeof msg !== 'object') return;
    if (msg.senderClientId === this._clientId) return;
    if (this._seenMessageIds.has(msg.msgId)) return;
    this._seenMessageIds.add(msg.msgId);

    // ── SENDER ──
    if (this._role === 'sender') {
      if (msg.type === 'receiver-connect') {
        const targetCode = this._code ? this._code.replace(/\s+/g, '').toUpperCase() : '';
        const incomingCode = (msg.code || '').replace(/\s+/g, '').toUpperCase();

        if (this._expiresAt && Date.now() > this._expiresAt) {
          this.broadcast({
            type: 'code-expired',
            code: incomingCode,
          });
          return;
        }

        if (incomingCode === targetCode && targetCode) {
          this.emit('peerJoined');
          this.setState('awaiting-accept');

          const manifest: FileInfo[] = this._selectedFiles.length > 0
            ? this._selectedFiles.map((f) => ({
                name: f.name,
                size: f.size,
                mimeType: f.type || 'image/jpeg',
              }))
            : generateMockManifest();

          this._manifest = manifest;
          const totalSize = manifest.reduce((sum, f) => sum + f.size, 0);

          // Send preview manifest to receiver
          this.broadcast({
            type: 'sender-connected',
            code: targetCode,
            manifest,
            totalSize,
          });

          // Sender stays on "Waiting for them to accept" until receiver confirms
        } else {
          // Entered code does not match this sender's code!
          this.broadcast({
            type: 'wrong-code',
            code: incomingCode,
          });
        }
      }

      if (msg.type === 'receiver-accepted') {
        // Receiver confirmed/accepted! Move sender device to "Flick to send" page!
        this.emit('accepted');
        this.setState('ready-to-throw');
        this.emit('readyToThrow');
      }

      if (msg.type === 'receiver-declined') {
        try {
          localStorage.removeItem('picbeam_active_code');
        } catch (_) {}
        this.emitError({
          type: 'declined',
          message: 'They declined the photos.',
          canRetry: false,
        });
      }

      if (msg.type === 'receiver-cancelled') {
        try {
          localStorage.removeItem('picbeam_active_code');
        } catch (_) {}
        this.emitError({
          type: 'cancelled',
          message: 'The receiver cancelled the transfer.',
          canRetry: false,
        });
      }
    }

    // ── RECEIVER ──
    if (this._role === 'receiver') {
      if (msg.type === 'sender-connected') {
        const senderCode = (msg.code || '').replace(/\s+/g, '').toUpperCase();
        if (this._enteredCode && senderCode && senderCode !== this._enteredCode) {
          return; // Ignore messages intended for different codes
        }
        this._hasSenderPeer = true;
        this._manifest = msg.manifest || generateMockManifest();
        const totalSize = msg.totalSize || this._manifest.reduce((s, f) => s + f.size, 0);
        this.emit('peerJoined');
        this.setState('awaiting-accept');
        // Receiver receives preview of what sender is sending: count, memory, file list
        this.emit('manifestReady', this._manifest, totalSize);
      }

      if (msg.type === 'wrong-code') {
        const wrongCode = (msg.code || '').replace(/\s+/g, '').toUpperCase();
        if (this._enteredCode && wrongCode === this._enteredCode) {
          this.emitError({
            type: 'wrong-code',
            message: "That code didn't work. Check it and try again.",
            canRetry: true,
          });
        }
      }

      if (msg.type === 'code-expired') {
        const expCode = (msg.code || '').replace(/\s+/g, '').toUpperCase();
        if (this._enteredCode && expCode === this._enteredCode) {
          this.emitError({
            type: 'code-expired',
            message: 'The code has timed out. Ask the sender for a new one.',
            canRetry: true,
          });
        }
      }

      if (msg.type === 'sender-throwing') {
        this.setState('transferring');
        if (!this._hasSenderPeer) {
          this.simulateTransfer();
        }
      }

      if (msg.type === 'transfer-progress' && msg.progress) {
        this._progress = msg.progress;
        this.emit('progress', msg.progress);
      }

      if (msg.type === 'transfer-file-done') {
        let blob: Blob;
        if (msg.fileDataUrl) {
          try {
            const res = await fetch(msg.fileDataUrl);
            blob = await res.blob();
          } catch (_) {
            blob = createScenicPhotoBlob(msg.fileIndex ?? 0);
          }
        } else {
          blob = createScenicPhotoBlob(msg.fileIndex ?? 0);
        }

        const fileData: ReceivedFileData = {
          name: msg.fileName || `Photo ${(msg.fileIndex ?? 0) + 1}`,
          blob,
          mimeType: msg.fileMime || 'image/jpeg',
        };
        this._receivedFiles.push(fileData);
        this.emit('fileDone', msg.fileIndex ?? 0, fileData);
      }

      if (msg.type === 'transfer-done') {
        this.setState('done');
        this.emit('done');
      }

      if (msg.type === 'sender-cancelled') {
        this.emitError({
          type: 'cancelled',
          message: 'The sender cancelled the transfer.',
          canRetry: true,
        });
      }
    }
  }

  // ── Sender Flow ──

  startSending(files: File[]): void {
    if (this._destroyed) return;
    this._role = 'sender';
    this._selectedFiles = files;
    this.setState('picking');

    this.openTransports();

    // Generate a fresh random alphanumeric code on every send!
    const rawCode = generateRandomCode();
    this._code = `${rawCode.slice(0, 3)} ${rawCode.slice(3)}`;
    this._expiresAt = Date.now() + CODE_EXPIRY_MS;

    try {
      localStorage.setItem('picbeam_active_code', rawCode);
    } catch (_) {}

    this.delay(400, () => {
      this.setState('code-ready');
      this.emit('codeReady', this._code!, this._expiresAt!);
      this.broadcast({ type: 'sender-ready', code: rawCode });
    });
  }

  confirmWords(): void {}
  rejectWords(): void {}

  startTransfer(): void {
    if (this._destroyed) return;
    if (this._state !== 'ready-to-throw' && this._role !== 'receiver') return;

    if (this._role === 'sender') {
      this.broadcast({ type: 'sender-throwing' });
    }

    this.setState('transferring');
    this.simulateTransfer();
  }

  // ── Receiver Flow ──

  enterCode(code: string): void {
    if (this._destroyed) return;
    this._role = 'receiver';

    const normalized = code.toUpperCase().replace(/\s+/g, '');
    this._enteredCode = normalized;

    // Verify code: must be 6 alphanumeric characters
    if (normalized.length !== 6) {
      this.emitError({
        type: 'wrong-code',
        message: "That code didn't work. Check it and try again.",
        canRetry: true,
      });
      return;
    }

    this.openTransports();
    // Broadcast receiver-connect
    this.broadcast({ type: 'receiver-connect', code: normalized });

    // Send a second ping at 400ms to guarantee delivery over Wi-Fi
    this.delay(400, () => {
      if (!this._hasSenderPeer && !this._manifest && !this._destroyed && this._role === 'receiver') {
        this.broadcast({ type: 'receiver-connect', code: normalized });
      }
    });

    // Timeout: if no sender confirms within 3.5s, report wrong code.
    this.delay(3500, () => {
      if (!this._hasSenderPeer && !this._manifest && !this._destroyed && this._role === 'receiver') {
        this.emitError({
          type: 'wrong-code',
          message: "That code didn't work. Check it and try again.",
          canRetry: true,
        });
      }
    });
  }

  confirmWordsReceiver(): void {}

  acceptFiles(): void {
    if (this._destroyed) return;
    this.setState('ready-to-throw');
    // Tell sender device that receiver accepted -> sender opens flick to send!
    this.broadcast({ type: 'receiver-accepted' });

    // Fallback only if no sender device is present (standalone receiver test):
    if (!this._hasSenderPeer) {
      this.delay(3000, () => {
        if (this._state === 'ready-to-throw' && !this._destroyed) {
          this.setState('transferring');
          this.simulateTransfer();
        }
      });
    }
  }

  declineFiles(): void {
    if (this._destroyed) return;
    this.clearAllTimers();
    this.broadcast({ type: 'receiver-declined' });
    this.emitError({
      type: 'declined',
      message: 'You declined the photos.',
      canRetry: false,
    });
  }

  cancel(): void {
    if (this._destroyed) return;
    this.clearAllTimers();
    if (this._role === 'sender') {
      try {
        localStorage.removeItem('picbeam_active_code');
      } catch (_) {}
    }
    this.broadcast({
      type: this._role === 'sender' ? 'sender-cancelled' : 'receiver-cancelled',
    });
    this.emitError({
      type: 'cancelled',
      message: 'Transfer was cancelled.',
      canRetry: false,
    });
  }

  destroy(): void {
    if (this._role === 'sender') {
      try {
        localStorage.removeItem('picbeam_active_code');
      } catch (_) {}
    }
    this._destroyed = true;
    this.clearAllTimers();
    this._listeners = {};
    try {
      this._channel?.close();
    } catch (_) {}
    try {
      this._eventSource?.close();
    } catch (_) {}
    this._channel = null;
    this._eventSource = null;
  }

  private emitError(err: SessionError): void {
    this._state = 'error';
    this.emit('stateChange', 'error');
    this.emit('error', err);
  }

  private clearAllTimers(): void {
    for (const t of this._timers) clearTimeout(t);
    for (const i of this._intervals) clearInterval(i);
    this._timers = [];
    this._intervals = [];
  }

  private async simulateTransfer(): Promise<void> {
    const manifest = this._manifest ?? generateMockManifest();
    if (!this._manifest) this._manifest = manifest;

    const totalSize = manifest.reduce((sum, f) => sum + f.size, 0);
    const totalDurationMs = 6000;
    const tickMs = 300;
    const totalTicks = Math.ceil(totalDurationMs / tickMs);
    const bytesPerTick = totalSize / totalTicks;

    let tick = 0;
    let bytesSent = 0;
    let lastFileDoneIndex = -1;

    // Pre-cache data URLs for any selected files
    const fileDataUrls: Record<number, string> = {};
    if (this._role === 'sender' && this._selectedFiles.length > 0) {
      for (let i = 0; i < this._selectedFiles.length; i++) {
        const f = this._selectedFiles[i];
        if (f) {
          try {
            fileDataUrls[i] = await fileToDataUrl(f);
          } catch (_) {}
        }
      }
    }

    const interval = setInterval(() => {
      if (this._destroyed) {
        clearInterval(interval);
        return;
      }

      tick++;
      bytesSent = Math.min(bytesSent + bytesPerTick, totalSize);

      let cumulativeBytes = 0;
      let currentFile = 0;
      for (let i = 0; i < manifest.length; i++) {
        const entry = manifest[i]!;
        cumulativeBytes += entry.size;
        if (bytesSent < cumulativeBytes) {
          currentFile = i;
          break;
        }
        currentFile = i;
      }

      let fileBoundary = 0;
      for (let i = 0; i < manifest.length; i++) {
        const entry = manifest[i]!;
        fileBoundary += entry.size;
        if (bytesSent >= fileBoundary && i > lastFileDoneIndex) {
          lastFileDoneIndex = i;

          const actualFile = this._selectedFiles[i];
          const dataUrl = fileDataUrls[i];
          const fileBlob: Blob = actualFile || createScenicPhotoBlob(i);

          const fileData: ReceivedFileData = {
            name: entry.name,
            blob: fileBlob,
            mimeType: entry.mimeType,
          };
          this._receivedFiles.push(fileData);
          this.emit('fileDone', i, fileData);

          if (this._role === 'sender') {
            this.broadcast({
              type: 'transfer-file-done',
              fileIndex: i,
              fileName: entry.name,
              fileMime: entry.mimeType,
              fileDataUrl: dataUrl,
            });
          }
        }
      }

      const elapsed = (tick * tickMs) / 1000;
      const speed = bytesSent / Math.max(elapsed, 0.1);
      const remaining = totalSize - bytesSent;
      const eta = speed > 0 ? remaining / speed : 0;

      this._progress = {
        bytes: Math.round(bytesSent),
        total: totalSize,
        speed: Math.round(speed),
        eta: Math.max(0, Math.round(eta * 10) / 10),
        currentFile,
      };
      this.emit('progress', this._progress);

      if (this._role === 'sender') {
        this.broadcast({
          type: 'transfer-progress',
          progress: this._progress,
        });
      }

      if (bytesSent >= totalSize) {
        clearInterval(interval);
        this.setState('done');
        this.emit('done');
        if (this._role === 'sender') {
          this.broadcast({ type: 'transfer-done' });
        }
      }
    }, tickMs);

    this._intervals.push(interval);
  }
}
