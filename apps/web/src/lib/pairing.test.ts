/**
 * Unit tests: pairing (QR URL, code, SAS words)
 */
import { describe, it, expect } from 'vitest';
import { buildQrUrl, parseQrUrl, generateCode } from './pairing/index';

describe('QR URL', () => {
  it('builds and parses correctly', () => {
    const url = buildQrUrl('picbeam.app', 'session123', 'secret456');
    expect(url).toBe('https://picbeam.app/r#session123.secret456');

    const parsed = parseQrUrl(url);
    expect(parsed).toEqual({ sessionId: 'session123', secret: 'secret456' });
  });

  it('returns null for invalid URLs', () => {
    expect(parseQrUrl('https://evil.com')).toBe(null);
    expect(parseQrUrl('not a url')).toBe(null);
    expect(parseQrUrl('https://picbeam.app/r#')).toBe(null);
    expect(parseQrUrl('https://picbeam.app/r#noseparator')).toBe(null);
  });

  it('secret is in fragment only', () => {
    const url = buildQrUrl('picbeam.app', 'sid', 'sec');
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/r');
    expect(parsed.search).toBe('');
    // Fragment is not sent to server
    expect(parsed.hash).toBe('#sid.sec');
  });
});

describe('generateCode', () => {
  it('generates 6-digit string', () => {
    const code = generateCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('generates different codes', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateCode()));
    expect(codes.size).toBeGreaterThan(90);
  });
});
