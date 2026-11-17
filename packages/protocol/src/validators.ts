/**
 * PicBeam Protocol — message validators
 *
 * Validates all incoming messages from peers and signaling.
 * Treats all input as hostile: bounds every length, count, and size.
 */

import {
  PROTOCOL_VERSION,
  ALLOWED_MIME_PREFIXES,
  MAX_FILE_COUNT,
  MAX_TOTAL_SIZE,
  MAX_FILE_NAME_LENGTH,
  CHUNK_MSG_TYPE,
  CHUNK_HEADER_SIZE,
  CHUNK_SIZE,
  type DataChannelControlMessage,
  type FileManifestEntry,
  type SignalingEnvelope,
} from './index.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Type guard for plain objects */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate a signaling envelope from the WebSocket */
export function validateSignalingEnvelope(data: unknown): SignalingEnvelope {
  if (!isObject(data)) throw new ValidationError('Signaling message must be an object');
  if (data['v'] !== PROTOCOL_VERSION) throw new ValidationError(`Unsupported protocol version: ${String(data['v'])}`);

  const validTypes = ['offer', 'answer', 'ice-candidate', 'dtls-fingerprint', 'sas-confirm', 'sas-reject', 'error'];
  if (typeof data['type'] !== 'string' || !validTypes.includes(data['type'])) {
    throw new ValidationError(`Invalid signaling type: ${String(data['type'])}`);
  }
  if (typeof data['payload'] !== 'string') throw new ValidationError('Payload must be a string');
  if (data['payload'].length > 65536) throw new ValidationError('Payload too large');

  return data as unknown as SignalingEnvelope;
}

/** Validate and sanitize a file name */
export function sanitizeFileName(name: unknown): string {
  if (typeof name !== 'string' || name.length === 0) {
    throw new ValidationError('File name must be a non-empty string');
  }

  // Remove path separators and control characters
  let sanitized = name
    .replace(/[/\\]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\.\./g, '_')
    .trim();

  // Remove leading dots and underscores (hidden files, artifacts of sanitization)
  sanitized = sanitized.replace(/^[._]+/, '');

  if (sanitized.length === 0) {
    sanitized = 'unnamed';
  }

  // Cap length
  if (sanitized.length > MAX_FILE_NAME_LENGTH) {
    const ext = sanitized.lastIndexOf('.');
    if (ext > 0 && sanitized.length - ext <= 10) {
      const extension = sanitized.slice(ext);
      sanitized = sanitized.slice(0, MAX_FILE_NAME_LENGTH - extension.length) + extension;
    } else {
      sanitized = sanitized.slice(0, MAX_FILE_NAME_LENGTH);
    }
  }

  return sanitized;
}

/** De-duplicate file names by appending (1), (2), etc. */
export function deduplicateNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const lower = name.toLowerCase();
    const count = seen.get(lower);
    if (count === undefined) {
      seen.set(lower, 1);
      return name;
    }
    seen.set(lower, count + 1);
    const dot = name.lastIndexOf('.');
    if (dot > 0) {
      return `${name.slice(0, dot)} (${count})${name.slice(dot)}`;
    }
    return `${name} (${count})`;
  });
}

/** Validate a MIME type against allowed prefixes */
export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

/** Validate a single manifest file entry */
function validateManifestEntry(entry: unknown, index: number): FileManifestEntry {
  if (!isObject(entry)) throw new ValidationError(`File entry ${index} must be an object`);

  if (typeof entry['id'] !== 'string' || entry['id'].length === 0 || entry['id'].length > 64) {
    throw new ValidationError(`File entry ${index}: invalid id`);
  }

  const name = sanitizeFileName(entry['name']);

  if (typeof entry['size'] !== 'number' || !Number.isFinite(entry['size']) || entry['size'] < 0) {
    throw new ValidationError(`File entry ${index}: invalid size`);
  }

  if (typeof entry['mimeType'] !== 'string' || !isAllowedMimeType(entry['mimeType'])) {
    throw new ValidationError(`File entry ${index}: disallowed mime type "${String(entry['mimeType'])}"`);
  }

  if (typeof entry['lastModified'] !== 'number' || !Number.isFinite(entry['lastModified'])) {
    throw new ValidationError(`File entry ${index}: invalid lastModified`);
  }

  return {
    id: entry['id'] as string,
    name,
    size: entry['size'] as number,
    mimeType: entry['mimeType'] as string,
    lastModified: entry['lastModified'] as number,
  };
}

/** Validate a data channel control message (JSON parsed) */
export function validateControlMessage(data: unknown): DataChannelControlMessage {
  if (!isObject(data)) throw new ValidationError('Control message must be an object');
  if (data['v'] !== PROTOCOL_VERSION) throw new ValidationError(`Unsupported protocol version: ${String(data['v'])}`);

  const type = data['type'];

  switch (type) {
    case 'hello':
      return { v: PROTOCOL_VERSION, type: 'hello' };

    case 'manifest': {
      if (!Array.isArray(data['files'])) throw new ValidationError('Manifest files must be an array');
      if (data['files'].length > MAX_FILE_COUNT) throw new ValidationError(`Too many files: ${data['files'].length}`);

      const files = (data['files'] as unknown[]).map((f, i) => validateManifestEntry(f, i));
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);

      if (totalSize > MAX_TOTAL_SIZE) throw new ValidationError(`Total size too large: ${totalSize}`);
      if (typeof data['totalSize'] !== 'number' || Math.abs(data['totalSize'] - totalSize) > 1) {
        throw new ValidationError('totalSize mismatch');
      }

      return {
        v: PROTOCOL_VERSION,
        type: 'manifest',
        files: deduplicateNames(files.map((f) => f.name)).map((name, i) => ({
          ...files[i]!,
          name,
        })),
        totalSize,
        locationStripped: Boolean(data['locationStripped']),
      };
    }

    case 'accept':
      return { v: PROTOCOL_VERSION, type: 'accept' };

    case 'decline':
      return { v: PROTOCOL_VERSION, type: 'decline' };

    case 'file-start': {
      if (typeof data['fileId'] !== 'string') throw new ValidationError('file-start: invalid fileId');
      if (typeof data['offset'] !== 'number' || data['offset'] < 0) throw new ValidationError('file-start: invalid offset');
      return { v: PROTOCOL_VERSION, type: 'file-start', fileId: data['fileId'], offset: data['offset'] as number };
    }

    case 'file-end': {
      if (typeof data['fileId'] !== 'string') throw new ValidationError('file-end: invalid fileId');
      if (typeof data['sha256'] !== 'string' || !/^[a-f0-9]{64}$/i.test(data['sha256'])) {
        throw new ValidationError('file-end: invalid sha256');
      }
      return { v: PROTOCOL_VERSION, type: 'file-end', fileId: data['fileId'], sha256: data['sha256'] as string };
    }

    case 'file-ok': {
      if (typeof data['fileId'] !== 'string') throw new ValidationError('file-ok: invalid fileId');
      return { v: PROTOCOL_VERSION, type: 'file-ok', fileId: data['fileId'] };
    }

    case 'file-bad': {
      if (typeof data['fileId'] !== 'string') throw new ValidationError('file-bad: invalid fileId');
      const reason = typeof data['reason'] === 'string' ? data['reason'].slice(0, 200) : 'unknown';
      return { v: PROTOCOL_VERSION, type: 'file-bad', fileId: data['fileId'], reason };
    }

    case 'resume': {
      if (typeof data['fileId'] !== 'string') throw new ValidationError('resume: invalid fileId');
      if (typeof data['offset'] !== 'number' || data['offset'] < 0) throw new ValidationError('resume: invalid offset');
      return { v: PROTOCOL_VERSION, type: 'resume', fileId: data['fileId'], offset: data['offset'] as number };
    }

    case 'cancel': {
      const reason = typeof data['reason'] === 'string' ? data['reason'].slice(0, 200) : undefined;
      return { v: PROTOCOL_VERSION, type: 'cancel', reason };
    }

    case 'done':
      return { v: PROTOCOL_VERSION, type: 'done' };

    default:
      throw new ValidationError(`Unknown message type: ${String(type)}`);
  }
}

/** Parse and validate a binary chunk header */
export function parseChunkHeader(buffer: ArrayBuffer): {
  fileIndex: number;
  chunkIndex: number;
  data: Uint8Array;
} {
  if (buffer.byteLength < CHUNK_HEADER_SIZE) {
    throw new ValidationError('Chunk too small');
  }

  const view = new DataView(buffer);
  const msgType = view.getUint8(0);
  if (msgType !== CHUNK_MSG_TYPE) {
    throw new ValidationError(`Invalid chunk message type: ${msgType}`);
  }

  const fileIndex = view.getUint16(1, false);
  const chunkIndex = view.getUint32(3, false);
  const data = new Uint8Array(buffer, CHUNK_HEADER_SIZE);

  if (data.byteLength > CHUNK_SIZE) {
    throw new ValidationError(`Chunk data too large: ${data.byteLength}`);
  }

  return { fileIndex, chunkIndex, data };
}

/** Build a binary chunk with header */
export function buildChunk(fileIndex: number, chunkIndex: number, data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(CHUNK_HEADER_SIZE + data.byteLength);
  const view = new DataView(buffer);
  view.setUint8(0, CHUNK_MSG_TYPE);
  view.setUint16(1, fileIndex, false);
  view.setUint32(3, chunkIndex, false);
  new Uint8Array(buffer, CHUNK_HEADER_SIZE).set(data);
  return buffer;
}

