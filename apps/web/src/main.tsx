import { render } from 'preact';
import { App } from './App';
import './styles/global.css';

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
