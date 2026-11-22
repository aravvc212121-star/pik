import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Cross-device mock relay plugin.
 * Enables live communication between phones, tablets, and computers on the local network.
 */
function mockRelayPlugin(): Plugin {
  const clients = new Set<ServerResponse>();
  let activeSenderState: { code: string; manifest?: any[]; totalSize?: number } | null = null;

  return {
    name: 'mock-relay-plugin',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const reqUrl = req.url || '';

        // CORS headers for all local network requests
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        // Server-Sent Events stream for cross-device updates
        if (reqUrl.startsWith('/api/mock-events')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });
          res.write(': connected\n\n');
          clients.add(res);

          req.on('close', () => {
            clients.delete(res);
          });
          return;
        }

        // Broadcast endpoint
        if (reqUrl.startsWith('/api/mock-broadcast') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const msg = JSON.parse(body);
              if (msg.type === 'sender-ready') {
                activeSenderState = { code: (msg.code || '').replace(/\s+/g, '').toUpperCase() };
              } else if (msg.type === 'sender-connected') {
                activeSenderState = {
                  code: (msg.code || '').replace(/\s+/g, '').toUpperCase(),
                  manifest: msg.manifest,
                  totalSize: msg.totalSize,
                };
              } else if (msg.type === 'sender-cancelled' || msg.type === 'transfer-done') {
                activeSenderState = null;
              }
            } catch (_) {}

            for (const client of clients) {
              try {
                client.write(`data: ${body}\n\n`);
              } catch (_) {
                clients.delete(client);
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    mockRelayPlugin(),
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['fonts/**/*.woff2', 'icons/**/*.png', 'icons/**/*.svg'],
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/ws/, /^\/api\//],
        runtimeCaching: [],
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
      },
      manifest: {
        name: 'Pik',
        short_name: 'Pik',
        description: 'Send photos and videos directly to another device. No upload, no account, no compression.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#FFFFFF',
        background_color: '#FFFFFF',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'media',
                accept: ['image/*', 'video/*'],
              },
            ],
          },
        } as unknown as undefined, // Type workaround for share_target
      },
    }),
  ],
  resolve: {
    alias: {
      '@picbeam/protocol': path.resolve(__dirname, '../../packages/protocol/src'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {},
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
