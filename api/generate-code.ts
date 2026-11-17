/**
 * POST /api/code — Generate a 6-digit pairing code
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CODE_MAP, cleanExpired, generateCode } from './_store';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;
  const sessionId = body?.sessionId;

  if (typeof sessionId !== 'string' || sessionId.length > 64) {
    return res.status(400).json({ error: 'Invalid sessionId' });
  }

  cleanExpired();

  let code: string;
  let attempts = 0;
  do {
    code = generateCode();
    attempts++;
  } while (CODE_MAP.has(code) && attempts < 100);

  CODE_MAP.set(code, {
    sessionId,
    expires: Date.now() + 120000,
    attempts: 0,
  });

  return res.status(200).json({ code });
}
