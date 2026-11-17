/**
 * PicBeam Protocol — shared message types and validators
 *
 * All signaling and data-channel messages are typed here.
 * The protocol version is bumped on breaking changes.
 */

export const PROTOCOL_VERSION = 1;

// ── Signaling message types (over WebSocket, encrypted in QR mode) ──

export type SignalingRole = 'sender' | 'receiver';

export interface SignalingEnvelope {
  /** Protocol version */
  v: number;
  /** Message type */
  type: SignalingMessageType;
  /** Payload (encrypted ciphertext in QR mode, plaintext in code mode) */
  payload: string;
}

export type SignalingMessageType =
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'dtls-fingerprint'
  | 'sas-confirm'
  | 'sas-reject'
  | 'error';

export interface SignalingOffer {
  type: 'offer';
  sdp: string;
  dtlsFingerprint: string;
}

export interface SignalingAnswer {
  type: 'answer';
  sdp: string;
  dtlsFingerprint: string;
}

export interface SignalingIceCandidate {
  type: 'ice-candidate';
  candidate: RTCIceCandidateInit;
}

export interface SignalingError {
  type: 'error';
  code: string;
  message: string;
}

// ── Data channel control messages (JSON) ──

export type DataChannelMessageType =
  | 'hello'
  | 'manifest'
  | 'accept'
  | 'decline'
  | 'file-start'
  | 'file-end'
  | 'file-ok'
  | 'file-bad'
  | 'resume'
  | 'cancel'
  | 'done';

export interface HelloMessage {
  v: number;
  type: 'hello';
}

export interface FileManifestEntry {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  lastModified: number;
}

export interface ManifestMessage {
  v: number;
  type: 'manifest';
  files: FileManifestEntry[];
  totalSize: number;
  locationStripped: boolean;
}

export interface AcceptMessage {
  v: number;
  type: 'accept';
}

export interface DeclineMessage {
  v: number;
  type: 'decline';
}

export interface FileStartMessage {
  v: number;
  type: 'file-start';
  fileId: string;
  offset: number;
}

export interface FileEndMessage {
  v: number;
  type: 'file-end';
  fileId: string;
  sha256: string;
}

export interface FileOkMessage {
  v: number;
  type: 'file-ok';
  fileId: string;
}

export interface FileBadMessage {
  v: number;
  type: 'file-bad';
  fileId: string;
  reason: string;
}

export interface ResumeMessage {
  v: number;
  type: 'resume';
  fileId: string;
  offset: number;
}

export interface CancelMessage {
  v: number;
  type: 'cancel';
  reason?: string;
}

export interface DoneMessage {
  v: number;
  type: 'done';
}

export type DataChannelControlMessage =
  | HelloMessage
  | ManifestMessage
  | AcceptMessage
  | DeclineMessage
  | FileStartMessage
  | FileEndMessage
  | FileOkMessage
  | FileBadMessage
  | ResumeMessage
  | CancelMessage
  | DoneMessage;

// ── Binary chunk header ──

/**
 * Binary chunk format:
 * [0]    = message type (0x01 = chunk)
 * [1-2]  = file index (uint16 big-endian)
 * [3-6]  = chunk index (uint32 big-endian)
 * [7...] = chunk data (up to 16 KiB)
 */
export const CHUNK_MSG_TYPE = 0x01;
export const CHUNK_HEADER_SIZE = 7;
export const CHUNK_SIZE = 16 * 1024; // 16 KiB

// ── Limits ──

export const MAX_FILE_COUNT = 500;
export const MAX_TOTAL_SIZE = 20 * 1024 * 1024 * 1024; // 20 GB
export const MAX_FILE_NAME_LENGTH = 200;
export const MAX_MANIFEST_SIZE = 256 * 1024; // 256 KB
export const SESSION_TTL_QR = 5 * 60 * 1000; // 5 minutes
export const SESSION_TTL_CODE = 2 * 60 * 1000; // 2 minutes
export const CODE_MAX_ATTEMPTS = 5;
export const RESUME_TIMEOUT = 60 * 1000; // 60 seconds
export const BACKPRESSURE_HIGH = 1 * 1024 * 1024; // 1 MiB
export const BACKPRESSURE_LOW = 512 * 1024; // 512 KiB

// ── Allowed MIME type prefixes ──

export const ALLOWED_MIME_PREFIXES = ['image/', 'video/'] as const;

// ── WebSocket close codes ──

export const WS_CLOSE_NORMAL = 1000;
export const WS_CLOSE_SESSION_EXPIRED = 4001;
export const WS_CLOSE_SESSION_FULL = 4002;
export const WS_CLOSE_RATE_LIMITED = 4003;
export const WS_CLOSE_INVALID_ORIGIN = 4004;
export const WS_CLOSE_PROTOCOL_ERROR = 4005;

// Re-export validators
export {
  ValidationError,
  validateSignalingEnvelope,
  sanitizeFileName,
  deduplicateNames,
  isAllowedMimeType,
  validateControlMessage,
  parseChunkHeader,
  buildChunk,
} from './validators.js';
