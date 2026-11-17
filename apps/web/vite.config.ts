import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { devSignalingPlugin } from './vite-plugin-signaling';

export default defineConfig({
  plugins: [
    preact(),
    devSignalingPlugin(),
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
        name: 'PicBeam',
        short_name: 'PicBeam',
        description: 'Send photos and videos directly to another device. No upload, no account, no compression.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#F4F6FA',
        background_color: '#F4F6FA',
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

