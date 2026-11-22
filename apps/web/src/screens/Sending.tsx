import { Header, ProgressRail, Button } from '../components';
import './Sending.css';

interface SendingProps {
  currentFile: number;
  totalFiles: number;
  bytesSent: number;
  totalBytes: number;
  speed?: number;
  timeLeft?: number | string;
  thumbnails?: string[];
  onCancel: () => void;
}

function formatBytesMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function formatTimeLeft(timeLeft?: number | string): string {
  if (timeLeft === undefined || timeLeft === null) return '0s';
  if (typeof timeLeft === 'string') return timeLeft;
  if (timeLeft < 60) return `${Math.ceil(timeLeft)}s`;
  const mins = Math.floor(timeLeft / 60);
  const secs = Math.ceil(timeLeft % 60);
  return `${mins}m ${secs}s`;
}

export function Sending({
  currentFile,
  totalFiles,
  bytesSent,
  totalBytes,
  timeLeft,
  onCancel,
}: SendingProps) {
  const progress = totalBytes > 0 ? Math.min(1, bytesSent / totalBytes) : 0;
  const sentMB = formatBytesMB(bytesSent);
  const totalMB = formatBytesMB(totalBytes);
  const timeFormatted = formatTimeLeft(timeLeft);

  return (
    <div class="screen-page sending-root" data-theme="light">
      <div class="screen-container">
        {/* Top header with close icon */}
        <Header mode="close" onBack={onCancel} />

        {/* Flight stage (flex:1, overflow hidden) — populated by motion worker */}
        <div class="flight-stage" aria-hidden="true" />

        {/* Transfer stats & controls */}
        <div class="sending-info-area">
          {/* Counter "{n} of {total}" in Bricolage 800 64px */}
          <div class="sending-counter" aria-live="polite">
            <span class="sending-counter__current">{currentFile}</span>
            <span class="sending-counter__total"> of {totalFiles}</span>
          </div>

          {/* Progress rail */}
          <div class="sending-rail-wrap">
            <ProgressRail progress={progress} />
          </div>

          {/* Meta text */}
          <p class="sending-meta">
            Sending · {sentMB} of {totalMB} MB · about {timeFormatted} left
          </p>
        </div>

        {/* Ghost Cancel button */}
        <div class="sending-footer">
          <Button variant="ghost" label="Cancel" onClick={onCancel} />
        </div>
      </div>
    </div>
  );
}
