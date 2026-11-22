/**
 * WaitingForThrow — Dark-theme screen. Connected pill, title,
 * empty 4×3 tray with dashed slots (first has lime border).
 */
import { JSX } from 'preact';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { StatusPill } from '../components/StatusPill';
import './WaitingForThrow.css';

interface WaitingForThrowProps {
  totalFiles: number;
  totalSize: number;
  onCancel: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WaitingForThrow({ totalFiles, totalSize, onCancel }: WaitingForThrowProps) {
  const slotsToShow = Math.max(12, totalFiles);
  const slots = Array.from({ length: Math.min(slotsToShow, 12) });

  return (
    <div class="screen-page waitthrow-root" data-theme="dark">
      <div class="screen-container">
        <Header mode="close" onBack={onCancel} />

        <div class="waitthrow-top">
          <StatusPill status="connected" label="Connected" />
          <h1 class="waitthrow-title">Waiting for the sender to throw…</h1>
          <p class="waitthrow-meta">{totalFiles} photos · {formatSize(totalSize)}</p>
        </div>

        <div class="waitthrow-tray">
          {slots.map((_, i) => (
            <div
              key={i}
              class={`waitthrow-slot ${i === 0 ? 'waitthrow-slot--next' : ''}`}
            />
          ))}
        </div>

        <div class="waitthrow-footer">
          <Button variant="ghost" label="Cancel" onClick={onCancel} />
        </div>
      </div>
    </div>
  );
}
