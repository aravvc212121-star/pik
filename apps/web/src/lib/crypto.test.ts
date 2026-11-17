/**
 * Unit tests: crypto utilities
 */
import { describe, it, expect } from 'vitest';
import {
  base64urlEncode,
  base64urlDecode,
  hexEncode,
  hexDecode,
  constantTimeEqual,
  wipeBuffer,
  randomBytes,
} from './crypto/utils';

describe('base64url', () => {
  it('round-trips random bytes', () => {
    const original = randomBytes(32);
    const encoded = base64urlEncode(original);
    const decoded = base64urlDecode(encoded);
    expect(decoded).toEqual(original);
  });

  it('produces URL-safe characters', () => {
    const encoded = base64urlEncode(randomBytes(100));
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('handles empty input', () => {
    expect(base64urlEncode(new Uint8Array(0))).toBe('');
    expect(base64urlDecode('')).toEqual(new Uint8Array(0));
  });
});

describe('hex', () => {
  it('round-trips', () => {
    const original = new Uint8Array([0, 127, 255, 1, 128]);
    const hex = hexEncode(original);
    expect(hex).toBe('007fff0180');
    expect(hexDecode(hex)).toEqual(original);
  });

  it('throws on odd-length string', () => {
    expect(() => hexDecode('abc')).toThrow();
  });
});

describe('constantTimeEqual', () => {
  it('returns true for equal strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('wipeBuffer', () => {
  it('zeroes all bytes', () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5]);
    wipeBuffer(buf);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it('works with ArrayBuffer', () => {
    const ab = new ArrayBuffer(8);
    new Uint8Array(ab).fill(0xff);
    wipeBuffer(ab);
    expect(new Uint8Array(ab).every((b) => b === 0)).toBe(true);
  });
});

describe('randomBytes', () => {
  it('generates the requested length', () => {
    expect(randomBytes(16).length).toBe(16);
    expect(randomBytes(32).length).toBe(32);
  });

  it('generates different values each time', () => {
    const a = randomBytes(16);
    const b = randomBytes(16);
    // Probabilistically always different
    expect(hexEncode(a)).not.toBe(hexEncode(b));
  });
});
