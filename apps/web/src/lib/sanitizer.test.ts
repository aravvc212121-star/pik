/**
 * Unit tests: file name sanitizer (malicious input)
 */
import { describe, it, expect } from 'vitest';
import { sanitizeFileName } from '@picbeam/protocol';

describe('sanitizeFileName — malicious inputs', () => {
  it('blocks path traversal', () => {
    expect(sanitizeFileName('../../../etc/passwd')).not.toContain('..');
    expect(sanitizeFileName('..\\..\\system32\\config')).not.toContain('..');
  });

  it('strips null bytes', () => {
    expect(sanitizeFileName('photo\x00.jpg')).toBe('photo.jpg');
  });

  it('handles Unicode names', () => {
    const result = sanitizeFileName('写真.jpg');
    expect(result).toBe('写真.jpg');
  });

  it('handles extremely long names', () => {
    const result = sanitizeFileName('a'.repeat(1000) + '.png');
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith('.png')).toBe(true);
  });

  it('strips Windows reserved characters in paths', () => {
    const result = sanitizeFileName('C:\\Users\\photo.jpg');
    expect(result).not.toContain('\\');
  });

  it('handles names that are only dots', () => {
    expect(sanitizeFileName('...')).toBe('unnamed');
    expect(sanitizeFileName('.')).toBe('unnamed');
  });

  it('handles names with only whitespace', () => {
    expect(sanitizeFileName('   ')).toBe('unnamed');
  });
});
