# PicBeam

**Send photos and videos directly to another device — like AirDrop, in the browser.**

PicBeam is a free, installable PWA that transfers files device-to-device at original quality over an end-to-end encrypted WebRTC connection. No accounts, no uploads, no compression.

## How it works

1. **Sender** picks photos/videos and gets a QR code
2. **Receiver** scans the QR (or types a 6-digit code)
3. Files travel **directly** between devices over WebRTC
4. The signaling server only relays encrypted connection setup messages — it never sees file data

## Privacy

- **Zero storage**: No file bytes, names, or thumbnails ever reach a server
- **Zero tracking**: No accounts, cookies, analytics, or third-party requests
- **Encrypted**: Signaling messages are AES-256-GCM encrypted; file transfer uses DTLS
- **One-time codes**: Sessions are single-use and expire automatically

## Local development

```bash
# Install dependencies
npm install

# Build the shared protocol package
npm run build --workspace=packages/protocol

# Start the web app dev server
npm run dev

# In another terminal, start the signaling worker
npm run dev:signal
```

The web app runs at `http://localhost:5173`, proxying `/ws` and `/api/*` to the Worker at `:8787`.

## Project structure

```
apps/
  web/          Preact PWA (Vite, TypeScript)
  signal/       Cloudflare Worker + Durable Object
packages/
  protocol/     Shared message types and validators
tests/
  e2e/          Playwright end-to-end tests
docs/           THREAT_MODEL.md, PRIVACY.md, DEPLOY.md
```

## Tech stack

- **Frontend**: TypeScript (strict), Vite, Preact, plain CSS custom properties
- **Backend**: Cloudflare Worker + Durable Object (memory only, no storage)
- **WebRTC**: Browser native API with custom signaling
- **ICE**: STUN via `stun.cloudflare.com:3478`, optional TURN via Cloudflare Realtime
- **Hosting**: Cloudflare Pages (static) + Worker (signaling), same domain

## Key design decisions

| Decision | Rationale |
|----------|-----------|
| Preact over React | 3 KB vs 40 KB; sufficient for this UI complexity |
| Plain CSS over Tailwind | Zero build overhead; tokens.css as single source of truth |
| Durable Object over KV | WebSocket state needs in-memory coordination, not storage |
| No PeerJS | Full control over signaling encryption and fingerprint verification |
| OPFS for temp files | Avoids RAM pressure for multi-GB transfers |
| client-zip over JSZip | Streaming, smaller bundle |
| @noble/hashes for SHA-256 | Streaming hash; Web Crypto SHA-256 requires full buffer |

## Known limitations

- Both devices need an internet connection (for signaling and ICE)
- The sender must keep the screen open during transfer
- Browsers cannot discover nearby devices — QR or code is needed
- Very strict corporate networks may need TURN relay
- iPhone Safari may convert HEIC photos to JPEG when picked via web file input
- Web Share Target (share into app) works on Android only
- OPFS is not available in all browsers; large files fall back to in-memory storage
- Placeholder PNG icons — replace with proper sized icons for production

## Security

See [THREAT_MODEL.md](docs/THREAT_MODEL.md) for the full threat model.

## Deployment

See [DEPLOY.md](docs/DEPLOY.md) for step-by-step Cloudflare deployment.

## License

MIT
