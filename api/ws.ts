/**
 * WebSocket signaling endpoint for Vercel
 * 
 * Note: Vercel serverless functions don't support persistent WebSocket connections.
 * For production, deploy the signaling server (apps/signal) on:
 * - Cloudflare Workers (recommended — uses Durable Objects)
 * - A WebSocket-capable host (Railway, Render, Fly.io)
 * 
 * Set the NEXT_PUBLIC_WS_URL environment variable in Vercel to point to 
 * your signaling server, e.g. wss://signal.picbeam.app/ws
 * 
 * This file returns a helpful error if someone hits /api/ws directly.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(501).json({
    error: 'WebSocket signaling not available on this endpoint',
    message: 'Deploy the signaling server (apps/signal) on Cloudflare Workers or another WebSocket-capable host, then set NEXT_PUBLIC_WS_URL in your Vercel environment.',
  });
}
