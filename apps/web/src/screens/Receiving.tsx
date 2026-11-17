/**
 * Screen 3: Receiving — file transfer in progress
 */
import { JSX } from 'preact';
import { StatusPill } from '../components/StatusPill';
import { ProgressBar } from '../components/ProgressBar';
import { Button } from '../components/Button';
import { Footnote } from '../components/Footnote';
import { CheckIconSmall } from '../components/Icons';
import { formatBytes, formatSpeed } from '../lib/state';
import type { FileStatus } from '../lib/transfer/index';
import './Receiving.css';

interface ReceivingProps {
  currentFile: number;
  totalFiles: number;
  bytesReceived: number;
  totalBytes: number;
  speed: number;
  files: FileStatus[];
  onCancel: () => void;
}

export function Receiving({
  currentFile,
  totalFiles,
  bytesReceived,
  totalBytes,
  speed,
  files,
  onCancel,
}: ReceivingProps): JSX.Element {
  const percent = totalBytes > 0 ? Math.round((bytesReceived / totalBytes) * 100) : 0;

  return (
    <div class="receiving">
      {/* Progress card */}
      <div class="receiving__progress-card">
        <StatusPill status="connected" text="Connected to sender" />
        <h2 class="receiving__title">
          Receiving {currentFile + 1} of {totalFiles}
        </h2>
        <ProgressBar progress={percent} aria-label="Overall receiving progress" />
        <p class="receiving__meta">
          {formatBytes(bytesReceived)} of {formatBytes(totalBytes)} · {formatSpeed(speed)}
        </p>
      </div>

      {/* File list */}
      <div class="receiving__file-list">
        {files.map((f, i) => {
          const filePercent = f.size > 0 ? Math.round((f.received / f.size) * 100) : 0;
          return (
            <div class="receiving__file-row" key={f.id}>
              <div class="receiving__file-thumb" aria-hidden="true" />
              <div class="receiving__file-info">
                <span class="receiving__file-name">{f.name}</span>
                <span class="receiving__file-size">{formatBytes(f.size)}</span>
              </div>
              <div class="receiving__file-status">
                {f.status === 'done' && <CheckIconSmall size={22} />}
                {f.status === 'receiving' && (
                  <span class="receiving__file-percent">{filePercent}%</span>
                )}
                {f.status === 'waiting' && (
                  <span class="receiving__file-waiting">Waiting</span>
                )}
                {f.status === 'error' && (
                  <span class="receiving__file-error">Error</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Footnote>Keep this screen open until it finishes</Footnote>
    </div>
  );
}
