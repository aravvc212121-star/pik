/**
 * MidThrow screen (Sender state 2)
 *
 * Live progress screen with FlightLayer animation stage.
 */

import { JSX } from 'preact';
import { FlightLayer } from '../components/FlightLayer';
import { ProgressBar } from '../components/ProgressBar';
import { Button } from '../components/Button';
import { formatBytes, formatTime } from '../lib/state';
import './MidThrow.css';

interface MidThrowProps {
  totalFiles: number;
  sentCount: number;
  bytesSent: number;
  totalBytes: number;
  timeLeft: number;
  thumbnails: string[];
  onCancel: () => void;
}

export function MidThrow({
  totalFiles,
  sentCount,
  bytesSent,
  totalBytes,
  timeLeft,
  thumbnails,
  onCancel,
}: MidThrowProps): JSX.Element {
  const percent = totalBytes > 0 ? Math.round((bytesSent / totalBytes) * 100) : 0;
  const timeStr = formatTime(timeLeft);

  return (
    <div class="mid-throw">
      {/* Screen reader live announcement */}
      <div
        class="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {`Sending ${totalFiles} photos. Sent ${sentCount} of ${totalFiles}.`}
      </div>

      {/* Flight animation stage */}
      <FlightLayer
        thumbnails={thumbnails}
        sentCount={sentCount}
        totalFiles={totalFiles}
      />

      {/* Progress Card */}
      <div class="mid-throw__progress-card">
        <h2 class="mid-throw__title">
          Sent {sentCount} of {totalFiles}
        </h2>

        <ProgressBar progress={percent} aria-label="Sending progress" />

        <div class="mid-throw__meta">
          {formatBytes(bytesSent)} of {formatBytes(totalBytes)}
          {timeStr ? ` · ${timeStr}` : ''}
        </div>
      </div>

      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
