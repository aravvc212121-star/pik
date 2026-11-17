/**
 * POST /api/code/resolve — Resolve a 6-digit code to a sessionId
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CODE_MAP, cleanExpired } from './_store';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  cleanExpired();

  const body = req.body;
  const code = body?.code;

  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid code format' });
  }

  const entry = CODE_MAP.get(code);
  if (!entry || Date.now() > entry.expires) {
    CODE_MAP.delete(code);
    return res.status(404).json({ error: 'Code expired or invalid' });
  }

  entry.attempts++;
  if (entry.attempts > 5) {
    CODE_MAP.delete(code);
    return res.status(429).json({ error: 'Too many attempts' });
  }

  const sessionId = entry.sessionId;
  CODE_MAP.delete(code); // Single use

  return res.status(200).json({ sessionId });
}
