/**
 * CatchWaiting screen (Receiver state 1)
 *
 * Shows the empty tray and tells receiver to wait for sender to flick.
 */

import { JSX } from 'preact';
import { CatchTray } from '../components/CatchTray';
import { Button } from '../components/Button';
import './CatchWaiting.css';

interface CatchWaitingProps {
  totalFiles: number;
  onCancel: () => void;
}

export function CatchWaiting({
  totalFiles,
  onCancel,
}: CatchWaitingProps): JSX.Element {
  return (
    <div class="catch-waiting">
      {/* Screen reader announcement */}
      <div class="sr-only" role="status" aria-live="polite">
        Waiting for the sender to flick…
      </div>

      {/* Empty slot tray */}
      <CatchTray
        totalFiles={totalFiles}
        receivedThumbnails={[]}
        isTransferring={false}
      />

      {/* Status Card */}
      <div class="catch-waiting__status-card">
        <h2 class="catch-waiting__title">Waiting for the sender to flick…</h2>
        <p class="catch-waiting__subtitle">
          Photos will drop in as soon as they flick them.
        </p>
      </div>

      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
