/**
 * Catching screen (Receiver state 2)
 *
 * Shows the tray receiving photos in real-time with landing animations.
 */

import { JSX } from 'preact';
import { CatchTray } from '../components/CatchTray';
import { ProgressBar } from '../components/ProgressBar';
import { Button } from '../components/Button';
import { formatBytes, formatSpeed } from '../lib/state';
import './Catching.css';

interface CatchingProps {
  completedCount: number;
  totalFiles: number;
  bytesReceived: number;
  totalBytes: number;
  speed: number;
  receivedThumbnails: string[];
  onCancel: () => void;
}

export function Catching({
  completedCount,
  totalFiles,
  bytesReceived,
  totalBytes,
  speed,
  receivedThumbnails,
  onCancel,
}: CatchingProps): JSX.Element {
  const percent = totalBytes > 0 ? Math.round((bytesReceived / totalBytes) * 100) : 0;

  return (
    <div class="catching">
      {/* Screen reader live announcement */}
      <div
        class="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {`Received ${completedCount} of ${totalFiles} photos.`}
      </div>

      {/* Grid tray with falling animation */}
      <CatchTray
        totalFiles={totalFiles}
        receivedThumbnails={receivedThumbnails}
        isTransferring={true}
      />

      {/* Progress card */}
      <div class="catching__progress-card">
        <h2 class="catching__title">
          Catching {completedCount} of {totalFiles}
        </h2>

        <ProgressBar progress={percent} aria-label="Catching progress" />

        <div class="catching__meta">
          {formatBytes(bytesReceived)} of {formatBytes(totalBytes)} · {formatSpeed(speed)}
        </div>
      </div>

      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
