/**
 * Unit tests: protocol validators
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeFileName,
  deduplicateNames,
  isAllowedMimeType,
  validateControlMessage,
  parseChunkHeader,
  buildChunk,
  PROTOCOL_VERSION,
  CHUNK_MSG_TYPE,
  CHUNK_HEADER_SIZE,
} from '@picbeam/protocol';

describe('sanitizeFileName', () => {
  it('removes path separators', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('etc_passwd');
  });

  it('removes control characters', () => {
    expect(sanitizeFileName('file\x00name\x1f.jpg')).toBe('filename.jpg');
  });

  it('removes leading dots', () => {
    const result = sanitizeFileName('...hidden');
    expect(result).toBe('hidden');
  });

  it('caps length preserving extension', () => {
    const long = 'a'.repeat(250) + '.jpg';
    const result = sanitizeFileName(long);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith('.jpg')).toBe(true);
  });

  it('returns "unnamed" for empty after sanitize', () => {
    expect(sanitizeFileName('...')).toBe('unnamed');
  });

  it('throws on non-string', () => {
    expect(() => sanitizeFileName(null)).toThrow();
    expect(() => sanitizeFileName(123)).toThrow();
    expect(() => sanitizeFileName('')).toThrow();
  });
});

describe('deduplicateNames', () => {
  it('appends numbers to duplicates', () => {
    const result = deduplicateNames(['photo.jpg', 'photo.jpg', 'photo.jpg']);
    expect(result).toEqual(['photo.jpg', 'photo (1).jpg', 'photo (2).jpg']);
  });

  it('is case-insensitive', () => {
    const result = deduplicateNames(['Photo.JPG', 'photo.jpg']);
    expect(result[1]).toContain('(1)');
  });

  it('handles files without extensions', () => {
    const result = deduplicateNames(['readme', 'readme']);
    expect(result).toEqual(['readme', 'readme (1)']);
  });
});

describe('isAllowedMimeType', () => {
  it('allows image types', () => {
    expect(isAllowedMimeType('image/jpeg')).toBe(true);
    expect(isAllowedMimeType('image/png')).toBe(true);
    expect(isAllowedMimeType('image/heic')).toBe(true);
  });

  it('allows video types', () => {
    expect(isAllowedMimeType('video/mp4')).toBe(true);
    expect(isAllowedMimeType('video/quicktime')).toBe(true);
  });

  it('rejects other types', () => {
    expect(isAllowedMimeType('application/javascript')).toBe(false);
    expect(isAllowedMimeType('text/html')).toBe(false);
    expect(isAllowedMimeType('')).toBe(false);
  });
});

describe('validateControlMessage', () => {
  it('validates hello', () => {
    const msg = validateControlMessage({ v: PROTOCOL_VERSION, type: 'hello' });
    expect(msg.type).toBe('hello');
  });

  it('validates accept', () => {
    const msg = validateControlMessage({ v: PROTOCOL_VERSION, type: 'accept' });
    expect(msg.type).toBe('accept');
  });

  it('validates cancel with reason', () => {
    const msg = validateControlMessage({ v: PROTOCOL_VERSION, type: 'cancel', reason: 'User cancelled' });
    expect(msg.type).toBe('cancel');
  });

  it('rejects wrong version', () => {
    expect(() => validateControlMessage({ v: 999, type: 'hello' })).toThrow();
  });

  it('rejects unknown type', () => {
    expect(() => validateControlMessage({ v: PROTOCOL_VERSION, type: 'unknown' })).toThrow();
  });

  it('rejects non-object', () => {
    expect(() => validateControlMessage('hello')).toThrow();
    expect(() => validateControlMessage(null)).toThrow();
  });

  it('validates manifest with files', () => {
    const msg = validateControlMessage({
      v: PROTOCOL_VERSION,
      type: 'manifest',
      files: [
        { id: 'f1', name: 'photo.jpg', size: 1024, mimeType: 'image/jpeg', lastModified: Date.now() },
      ],
      totalSize: 1024,
      locationStripped: false,
    });
    expect(msg.type).toBe('manifest');
  });

  it('rejects manifest with disallowed mime', () => {
    expect(() =>
      validateControlMessage({
        v: PROTOCOL_VERSION,
        type: 'manifest',
        files: [
          { id: 'f1', name: 'script.js', size: 100, mimeType: 'application/javascript', lastModified: Date.now() },
        ],
        totalSize: 100,
        locationStripped: false,
      })
    ).toThrow();
  });

  it('validates file-end with valid sha256', () => {
    const hash = 'a'.repeat(64);
    const msg = validateControlMessage({ v: PROTOCOL_VERSION, type: 'file-end', fileId: 'f1', sha256: hash });
    expect(msg.type).toBe('file-end');
  });

  it('rejects file-end with invalid sha256', () => {
    expect(() =>
      validateControlMessage({ v: PROTOCOL_VERSION, type: 'file-end', fileId: 'f1', sha256: 'invalid' })
    ).toThrow();
  });

  it('truncates long reason in file-bad', () => {
    const msg = validateControlMessage({
      v: PROTOCOL_VERSION,
      type: 'file-bad',
      fileId: 'f1',
      reason: 'x'.repeat(500),
    });
    if (msg.type === 'file-bad') {
      expect(msg.reason.length).toBeLessThanOrEqual(200);
    }
  });
});

describe('chunk encoding/decoding', () => {
  it('round-trips correctly', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = buildChunk(10, 42, data);
    const decoded = parseChunkHeader(encoded);

    expect(decoded.fileIndex).toBe(10);
    expect(decoded.chunkIndex).toBe(42);
    expect(decoded.data).toEqual(data);
  });

  it('rejects too-small buffer', () => {
    expect(() => parseChunkHeader(new ArrayBuffer(3))).toThrow();
  });

  it('rejects wrong message type', () => {
    const buf = new ArrayBuffer(CHUNK_HEADER_SIZE + 10);
    const view = new DataView(buf);
    view.setUint8(0, 0xFF); // Wrong type
    expect(() => parseChunkHeader(buf)).toThrow();
  });
});
