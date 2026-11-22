/**
 * Catching — Dark-theme transfer progress. Thumbnails fill a 4-column tray.
 * Next slot has lime dashed border.
 */
import { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { ProgressRail } from '../components/ProgressRail';
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

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function Catching({
  completedCount,
  totalFiles,
  bytesReceived,
  totalBytes,
  speed,
  receivedThumbnails,
  onCancel,
}: CatchingProps) {
  const progress = totalBytes > 0 ? Math.min(1, bytesReceived / totalBytes) : 0;
  const slotsToShow = Math.max(12, totalFiles);
  const slots = Array.from({ length: slotsToShow });
  const trayRef = useRef<HTMLDivElement>(null);

  // Keep newest slot visible
  useEffect(() => {
    if (trayRef.current && completedCount > 0) {
      const slotElements = trayRef.current.children;
      const nextIndex = Math.min(completedCount, slotElements.length - 1);
      const el = slotElements[nextIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [completedCount]);

  return (
    <div class="screen-page catching-root" data-theme="dark">
      <div class="screen-container">
        <Header mode="close" onBack={onCancel} />

        {/* Top stage for future drop animation */}
        <div class="catching-stage" aria-hidden="true" />

        {/* Tray */}
        <div class="catching-tray" ref={trayRef}>
          {slots.map((_, i) => {
            const thumb = receivedThumbnails[i];
            const isFilled = i < completedCount;
            const isNext = i === completedCount;

            return (
              <div
                key={i}
                class={`catching-slot ${isNext ? 'catching-slot--next' : ''} ${!isFilled && !isNext ? 'catching-slot--empty' : ''}`}
              >
                {isFilled && thumb && (
                  <img src={thumb} alt="" class="catching-slot__img" />
                )}
              </div>
            );
          })}
        </div>

        {/* Info area */}
        <div class="catching-info">
          <h2 class="catching-title">
            Catching {completedCount} of {totalFiles}
          </h2>
          <ProgressRail progress={progress} />
          <p class="catching-meta">
            {formatMB(bytesReceived)} of {formatMB(totalBytes)} MB · {formatSpeed(speed)}
          </p>
        </div>

        <div class="catching-footer">
          <Button variant="ghost" label="Cancel" onClick={onCancel} />
        </div>
      </div>
    </div>
  );
}
