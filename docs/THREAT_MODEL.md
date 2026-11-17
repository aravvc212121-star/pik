# PicBeam Threat Model

## Assets

1. **File contents** — photos and videos the user selects
2. **File metadata** — names, sizes, MIME types, timestamps
3. **GPS/location data** — embedded in JPEG Exif
4. **Network addresses** — IP addresses of both devices
5. **Session credentials** — session ID, secret, 6-digit code

## Trust boundaries

```
┌─────────────┐    encrypted WS     ┌──────────────┐    encrypted WS     ┌─────────────┐
│   Sender    │◄───────────────────►│   Worker     │◄───────────────────►│  Receiver   │
│   Browser   │                     │  (untrusted) │                     │   Browser   │
└──────┬──────┘                     └──────────────┘                     └──────┬──────┘
       │                                                                        │
       └──────────────── WebRTC DataChannel (DTLS encrypted) ──────────────────┘
```

The Worker is explicitly treated as **untrusted**. It relays ciphertext only.

## Threats and mitigations

### T1: Server reads signaling messages
- **Mitigation**: In QR mode, all signaling payloads are encrypted with AES-256-GCM. The key is derived from a secret that lives only in the URL fragment (never sent to the server).
- **Code mode**: No shared secret exists, so signaling is not encrypted. The SAS (Short Authentication String) verification catches MITM.

### T2: Server performs MITM on WebRTC
- **Mitigation**: Both peers include their DTLS fingerprints inside the encrypted signaling payload (QR mode) or verify them via SAS words (code mode). A fingerprint mismatch aborts the connection.

### T3: Replay attacks on signaling
- **Mitigation**: Message counters embedded in encrypted payloads. Each counter must increment; replays are rejected.

### T4: Session hijacking (third party joins)
- **Mitigation**: Sessions are single-use. Once two peers connect, the Durable Object rejects any further connections. The session ID is 128-bit random.

### T5: Code brute-force
- **Mitigation**: 6-digit codes expire after 2 minutes. After 5 wrong guesses, the code is invalidated. Rate limiting per IP.

### T6: GPS/location leakage
- **Mitigation**: "Remove location data" is on by default. For JPEG files, the GPS IFD is stripped from Exif without re-encoding pixels.

### T7: IP address exposure to peer
- **Mitigation**: "Hide my IP address" sets `iceTransportPolicy: 'relay'` so the peer only sees the TURN relay's address. Off by default with a clear explanation.

### T8: Malicious file content
- **Mitigation**: Files are never rendered or executed. Thumbnails use `object-fit: cover` on `<img>` with object URLs. No `innerHTML`. File names are sanitized (path separators, control characters removed). Trusted Types enforced.

### T9: XSS via peer messages
- **Mitigation**: All peer data is validated against strict schemas. No `innerHTML`, `eval`, or `document.write`. CSP with `default-src 'none'` and Trusted Types.

### T10: Supply chain attack
- **Mitigation**: Exact dependency versions pinned. Lockfile committed. `npm ci --ignore-scripts`. `npm audit` in CI. SBOM generated. No CDN scripts.

### T11: Data at rest
- **Mitigation**: Temporary files in OPFS are deleted on completion, cancellation, and app startup (orphan cleanup). No sensitive data in localStorage (only theme + 2 boolean settings).

### T12: Side-channel via timing
- **Mitigation**: Constant-time string comparison for cryptographic values.

## Out of scope

- Protection against a compromised browser or OS
- Protection against physical device access
- DDoS on the signaling server (mitigated by Cloudflare's default protections)
- Covert channel analysis of encrypted traffic patterns
