/**
 * PicBeam Session — Type definitions and interfaces
 *
 * Redesign: no word verification. Code-only flow.
 * States: home, picking, code-ready, connected, awaiting-accept,
 *         ready-to-throw, transferring, done, error.
 */

// ── Session State Machine ──

export type SessionState =
  | 'home'
  | 'picking'
  | 'code-ready'
  | 'connected'
  | 'awaiting-accept'
  | 'ready-to-throw'
  | 'transferring'
  | 'done'
  | 'error';

// ── Data Types ──

export interface FileInfo {
  name: string;
  size: number;
  mimeType: string;
}

export interface TransferProgress {
  bytes: number;
  total: number;
  speed: number;
  eta: number;
  currentFile: number;
}

export interface ReceivedFileData {
  name: string;
  blob: Blob;
  mimeType: string;
}

export type SessionErrorType =
  | 'wrong-code'
  | 'too-many-attempts'
  | 'code-expired'
  | 'declined'
  | 'connection-lost'
  | 'cancelled'
  | 'storage-full'
  | 'browser-unsupported'
  | 'offline';

export interface SessionError {
  type: SessionErrorType;
  message: string;
  canRetry: boolean;
}

// ── Event System ──

export interface SessionEvents {
  stateChange: (state: SessionState) => void;
  codeReady: (code: string, expiresAt: number) => void;
  peerJoined: () => void;
  wordsReady: (words: [string, string, string, string]) => void;
  manifestReady: (files: FileInfo[], totalSize: number) => void;
  accepted: () => void;
  readyToThrow: () => void;
  progress: (p: TransferProgress) => void;
  fileDone: (index: number, file: ReceivedFileData) => void;
  done: () => void;
  error: (err: SessionError) => void;
}

// ── Session Interface ──

export interface Session {
  // Sender flow
  startSending(files: File[]): void;
  confirmWords(): void;
  rejectWords(): void;
  startTransfer(): void;

  // Receiver flow
  openTransports?(): void;
  enterCode(code: string): void;
  confirmWordsReceiver(): void;
  acceptFiles(): void;
  declineFiles(): void;

  // Shared
  cancel(): void;
  destroy(): void;

  // State (readonly)
  readonly state: SessionState;
  readonly code: string | null;
  readonly expiresAt: number | null;
  readonly words: [string, string, string, string] | null;
  readonly manifest: FileInfo[] | null;
  readonly progress: TransferProgress | null;
  readonly receivedFiles: ReceivedFileData[];

  // Events
  on<K extends keyof SessionEvents>(event: K, handler: SessionEvents[K]): void;
  off<K extends keyof SessionEvents>(event: K, handler: SessionEvents[K]): void;
}
