# PicBeam Deployment Guide

Deploy PicBeam on Cloudflare's free tier: Pages for the static app, Workers for signaling.

## Prerequisites

- A Cloudflare account (free)
- Node.js 20+
- Wrangler CLI (`npm i -g wrangler`)

## Step 1: Set up the project

```bash
git clone <repo-url>
cd picbeam
npm install
npm run build --workspace=packages/protocol
```

## Step 2: Deploy the signaling Worker

```bash
cd apps/signal

# Log in to Cloudflare
wrangler login

# Update wrangler.toml with your domain
# Set ALLOWED_ORIGIN to your Pages domain (e.g., https://picbeam.pages.dev)

# Deploy
wrangler deploy
```

Note the Worker URL (e.g., `picbeam-signal.<account>.workers.dev`).

## Step 3: Configure TURN (optional)

If you want relay support for strict networks:

1. Go to Cloudflare Dashboard → Calls → TURN
2. Create a TURN key
3. Add secrets to your Worker:

```bash
wrangler secret put TURN_KEY_ID
wrangler secret put TURN_API_TOKEN
```

The app works without TURN — it's needed only when direct connections are blocked.

## Step 4: Deploy the web app to Pages

```bash
cd apps/web

# Build
npm run build

# Option A: Cloudflare Pages via dashboard
# 1. Go to Pages → Create a project
# 2. Connect your Git repo or upload the dist/ folder
# 3. Build command: cd ../.. && npm install && npm run build
# 4. Build output: apps/web/dist
# 5. Root directory: /

# Option B: Wrangler direct upload
wrangler pages deploy dist --project-name=picbeam
```

## Step 5: Route the Worker to the same domain

To keep everything same-origin (`/ws` and `/api/*` on the same domain as the app):

1. Go to Cloudflare Dashboard → your Pages project → Settings → Functions
2. Or use a custom domain with Workers routes:

```bash
# In wrangler.toml, add:
# routes = [
#   { pattern = "picbeam.yourdomain.com/ws", zone_name = "yourdomain.com" },
#   { pattern = "picbeam.yourdomain.com/api/*", zone_name = "yourdomain.com" }
# ]
```

Alternatively, use a Pages Function or `_routes.json` to proxy `/ws` and `/api/*` to the Worker.

## Step 6: Verify

- Open the deployed URL
- Check security headers at [securityheaders.com](https://securityheaders.com)
- Verify no third-party requests in DevTools Network tab
- Test a transfer between two devices

## Free tier limits (as of 2024)

| Resource | Free limit |
|----------|-----------|
| Workers requests | 100,000/day |
| Durable Object requests | 1,000/day (then $0.15/million) |
| Durable Object duration | 400,000 GB-s/month |
| Pages deployments | 500/month |
| Pages bandwidth | Unlimited |
| TURN | 1 GB/month free |

For a personal-use app, the free tier is more than sufficient. Each transfer uses ~2-4 Durable Object requests (session creation + WebSocket upgrade per peer).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ALLOWED_ORIGIN` | Yes | Your Pages domain (e.g., `https://picbeam.pages.dev`) |
| `TURN_KEY_ID` | No | Cloudflare TURN key ID |
| `TURN_API_TOKEN` | No | Cloudflare TURN API token |

## Updating

```bash
git pull
npm install
npm run build
wrangler pages deploy dist --project-name=picbeam  # web app
cd apps/signal && wrangler deploy                    # worker
```
