import { render } from 'preact';
import { App } from './App';
import './styles/global.css';

// Prevent multi-touch pinch zoom on mobile
if (typeof document !== 'undefined') {
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener('gestureend', (e) => e.preventDefault());
}

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}

// Register service worker update prompt
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() {
        if (confirm('New version ready. Reload?')) {
          updateSW(true);
        }
      },
      onOfflineReady() {
        // App is cached and ready for offline
      },
    });
  });
}
