/**
 * Screen 1: Send — waiting for scan (QR code displayed)
 */
import { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import QRCode from 'qrcode';
import { StatusPill } from '../components/StatusPill';
import { Button } from '../components/Button';
import { Footnote } from '../components/Footnote';
import { RemoveIcon, PlusIcon } from '../components/Icons';
import { formatBytes } from '../lib/state';
import './SendWaiting.css';

interface SendWaitingProps {
  files: File[];
  thumbnails: string[];
  qrUrl: string;
  connectionState: 'waiting' | 'connected';
  code: string | null;
  onCancel: () => void;
  onShowCode: () => void;
  onShowQr?: () => void;
  expired: boolean;
  onNewCode: () => void;
  onRemoveFile: (index: number) => void;
  onAddMore: () => void;
}

export function SendWaiting({
  files,
  thumbnails,
  qrUrl,
  connectionState,
  code,
  onCancel,
  onShowCode,
  onShowQr,
  expired,
  onNewCode,
  onRemoveFile,
  onAddMore,
}: SendWaitingProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showCode, setShowCode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const [isExpired, setIsExpired] = useState(expired);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const visibleThumbs = thumbnails.slice(0, 4);
  const extraCount = files.length - visibleThumbs.length;

  useEffect(() => {
    setTimeLeft(showCode ? 120 : 300);
    setIsExpired(false);
  }, [showCode, code]);

  useEffect(() => {
    if (isExpired) return;
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
  }, [isExpired, showCode]);

  useEffect(() => {
    if (canvasRef.current && qrUrl) {
      QRCode.toCanvas(canvasRef.current, qrUrl, {
        width: 220,
        margin: 1,
        color: { dark: '#12141A', light: '#FFFFFF' },
        errorCorrectionLevel: 'M',
      });
    }
  }, [qrUrl]);

  const handleShowCode = () => {
    setShowCode(true);
    onShowCode();
  };

  const handleShowQr = () => {
    setShowCode(false);
    onShowQr?.();
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const effectiveExpired = expired || isExpired;

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

      {/* QR / Code card */}
      <div class="qr-card">
        {!effectiveExpired ? (
          <>
            {/* QR view */}
            {!showCode && (
              <>
                <canvas
                  ref={canvasRef}
                  class="qr-card__canvas"
                  width={220}
                  height={220}
                  aria-label={`QR code linking to ${qrUrl}`}
                />
                <h2 class="qr-card__title">Scan to receive</h2>
                <p class="qr-card__body">
                  Point the other phone's camera at this code. Photos go straight to them, nothing is stored.
                </p>
                <p class="qr-card__timer" aria-live="polite">
                  Expires in {formatTimer(timeLeft)}
                </p>
              </>
            )}

            {/* Code view */}
            {showCode && (
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
                  Go to the Receive tab on the other device and type this code.
                </p>
                <p class="qr-card__timer" aria-live="polite">
                  Expires in {formatTimer(timeLeft)}
                </p>
              </>
            )}

            <StatusPill
              status={connectionState === 'connected' ? 'connected' : 'waiting'}
              text={connectionState === 'connected' ? 'Receiver connected' : 'Waiting for the other phone\u2026'}
            />

            {/* Toggle link */}
            {!showCode ? (
              <button type="button" class="qr-card__link" onClick={handleShowCode}>
                Show a 6-digit code instead
              </button>
            ) : (
              <button type="button" class="qr-card__link" onClick={handleShowQr}>
                Show QR code instead
              </button>
            )}
          </>
        ) : (
          <>
            <h2 class="qr-card__title">Session expired</h2>
            <p class="qr-card__body">
              The pairing session has timed out.
            </p>
            <Button variant="primary" onClick={onNewCode}>
              Make a new code
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
