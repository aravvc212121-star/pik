/**
 * Screen 5: Send — transferring (receiver connected, sending files)
 */
import { JSX } from 'preact';
import { StatusPill } from '../components/StatusPill';
import { ProgressBar } from '../components/ProgressBar';
import { Button } from '../components/Button';
import { Footnote } from '../components/Footnote';
import { LockIcon } from '../components/Icons';
import { formatBytes, formatTime } from '../lib/state';
import './SendTransferring.css';

interface SendTransferringProps {
  totalFiles: number;
  bytesSent: number;
  totalBytes: number;
  speed: number;
  timeLeft: number;
  onCancel: () => void;
}

export function SendTransferring({
  totalFiles,
  bytesSent,
  totalBytes,
  speed,
  timeLeft,
  onCancel,
}: SendTransferringProps): JSX.Element {
  const percent = totalBytes > 0 ? Math.round((bytesSent / totalBytes) * 100) : 0;

  return (
    <div class="send-transferring">
      {/* Summary row */}
      <div class="summary-card">
        <div class="summary-card__header">
          <span class="summary-card__count">
            {totalFiles} photo{totalFiles !== 1 ? 's' : ''}
          </span>
          <span class="summary-card__meta">
            {formatBytes(totalBytes)} · Original quality
          </span>
        </div>
      </div>

      {/* Main transfer card */}
      <div class="transfer-card">
        <StatusPill status="connected" text="Receiver connected" />

        <div class="transfer-card__percent">{percent}%</div>
        <div class="transfer-card__label">Sending\u2026</div>

        <ProgressBar progress={percent} aria-label="Transfer progress" />

        <div class="transfer-card__meta">
          {formatBytes(bytesSent)} of {formatBytes(totalBytes)} · {formatTime(timeLeft)}
        </div>
      </div>

      {/* Lock note */}
      <div class="lock-note">
        <LockIcon size={14} />
        <span>QR code is now locked. Nobody else can join.</span>
      </div>

      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Footnote>Keep this screen open until the transfer finishes</Footnote>
    </div>
  );
}
