# PicBeam Privacy Disclosure

PicBeam is designed to send photos and videos directly between two devices without storing anything on a server. Here is exactly what happens with your data:

## What stays on your devices

- **Your files** (photos and videos) travel directly from the sender's browser to the receiver's browser over an encrypted WebRTC connection. They are never uploaded to, stored on, or processed by any server.
- **File names, thumbnails, and metadata** are exchanged directly between the two browsers. The server never sees them.
- **Received files** exist only in the receiver's browser memory until they tap "Save." Closing the page deletes them.

## What the signaling server handles

PicBeam uses a Cloudflare Worker as a signaling server to help the two browsers find each other. During this brief setup phase:

- The server relays **encrypted connection messages** (offers, answers, ICE candidates). In QR mode, these are encrypted with a key the server never has. In code mode, they are relayed as-is, but the browsers verify each other's identity with a word-based check.
- The server sees your **network address** (IP address) because that is how the internet works. It does not log or store it.
- The server keeps **no logs**. Session data exists only in memory and is deleted when the connection is established or the session expires (5 minutes maximum).

## What Cloudflare sees

Cloudflare hosts the app and the signaling server. As the network provider, Cloudflare can see ordinary connection metadata (IP addresses, request timing) at its edge, as with any website. PicBeam has disabled all Cloudflare logging and analytics features.

## What the other device sees

- The other device receives the files you chose to send, at full quality.
- By default, **GPS location data is stripped** from JPEG photos before sending.
- Unless "Hide my IP address" is on, the other device can see your **network address**. This is standard for all WebRTC applications. Browsers hide local network addresses with mDNS where supported.

## What PicBeam does not do

- No accounts, logins, or sign-ups
- No cookies, analytics, ads, or fingerprinting
- No third-party scripts, fonts, or tracking pixels
- No data stored in localStorage except your two privacy preferences (location removal, IP hiding) and theme
- No background data collection or telemetry

## Automated verification

The build includes an automated test that fails if the app makes requests to any origin other than its own (STUN/TURN excluded). This ensures no third-party requests are introduced.
