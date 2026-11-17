/**
 * Screen 1: Send — waiting for receiver to enter the code
 */
import { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { StatusPill } from '../components/StatusPill';
import { Button } from '../components/Button';
import { Footnote } from '../components/Footnote';
import { RemoveIcon, PlusIcon } from '../components/Icons';
import { formatBytes } from '../lib/state';
import './SendWaiting.css';

interface SendWaitingProps {
  files: File[];
  thumbnails: string[];
  connectionState: 'waiting' | 'connected';
  code: string | null;
  onCancel: () => void;
  onNewCode: () => void;
  onRemoveFile: (index: number) => void;
  onAddMore: () => void;
}

export function SendWaiting({
  files,
  thumbnails,
  connectionState,
  code,
  onCancel,
  onNewCode,
  onRemoveFile,
  onAddMore,
}: SendWaitingProps): JSX.Element {
  const [timeLeft, setTimeLeft] = useState(120);
  const [isExpired, setIsExpired] = useState(false);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const visibleThumbs = thumbnails.slice(0, 4);
  const extraCount = files.length - visibleThumbs.length;

  // Reset timer when code changes
  useEffect(() => {
    setTimeLeft(120);
    setIsExpired(false);
  }, [code]);

  useEffect(() => {
    if (isExpired || connectionState === 'connected') return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isExpired, connectionState]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div class="send-waiting">
      {/* Summary card */}
      <div class="summary-card">
        <div class="summary-card__header">
          <span class="summary-card__count">
            {files.length} photo{files.length !== 1 ? 's' : ''}
          </span>
          <span class="summary-card__meta">
            {formatBytes(totalSize)} · Original quality
          </span>
        </div>
        <div class="summary-card__thumbs">
          {visibleThumbs.map((url, i) => (
            <div class="summary-card__thumb-wrap" key={i}>
              <img
                src={url}
                alt={`Selected photo ${i + 1}`}
                class="summary-card__thumb"
                loading="lazy"
              />
              <button
                type="button"
                class="summary-card__remove-btn"
                onClick={() => onRemoveFile(i)}
                aria-label={`Remove photo ${i + 1}`}
              >
                <RemoveIcon size={18} />
              </button>
            </div>
          ))}
          {extraCount > 0 && (
            <div class="summary-card__extra">+{extraCount}</div>
          )}
          <button
            type="button"
            class="summary-card__add-btn"
            onClick={onAddMore}
            aria-label="Add more photos"
          >
            <PlusIcon size={22} />
          </button>
        </div>
      </div>

      {/* Code card */}
      <div class="qr-card">
        {!isExpired ? (
          <>
            <h2 class="qr-card__title">Enter this code on the other device</h2>
            <div class="qr-card__code" aria-live="polite">
              {code ? (
                <span class="qr-card__code-digits">{code.slice(0, 3)} {code.slice(3)}</span>
              ) : (
                <span class="qr-card__code-loading">Generating…</span>
              )}
            </div>
            <p class="qr-card__body">
              Open PicBeam on the other device, go to the <strong>Receive</strong> tab, and type this code.
            </p>
            <p class="qr-card__timer" aria-live="polite">
              Expires in {formatTimer(timeLeft)}
            </p>

            <StatusPill
              status={connectionState === 'connected' ? 'connected' : 'waiting'}
              text={connectionState === 'connected' ? 'Receiver connected' : 'Waiting for the other device\u2026'}
            />
          </>
        ) : (
          <>
            <h2 class="qr-card__title">Code expired</h2>
            <p class="qr-card__body">
              The code timed out. Generate a new one to continue.
            </p>
            <Button variant="primary" onClick={onNewCode}>
              Get a new code
            </Button>
          </>
        )}
      </div>

      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Footnote>Keep this screen open until the transfer finishes</Footnote>
    </div>
  );
}
