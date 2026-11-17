/**
 * Screen 2: Receive — scanner with code field
 */
import { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Button } from '../components/Button';
import { CameraIcon } from '../components/Icons';
import './ReceiveScanner.css';

interface ReceiveScannerProps {
  onQrScanned: (url: string) => void;
  onCodeSubmit: (code: string) => void;
}

export function ReceiveScanner({ onQrScanned, onCodeSubmit }: ReceiveScannerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraState, setCameraState] = useState<'loading' | 'active' | 'denied' | 'unavailable'>('loading');
  const [codeValue, setCodeValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let scanner: any = null;
    let cancelled = false;

    async function startScanner() {
      try {
        // Check if running in a secure context (HTTPS or localhost)
        if (!window.isSecureContext) {
          setCameraState('unavailable');
          return;
        }

        // Dynamic import for QrScanner
        const QrScanner = (await import('qr-scanner')).default;

        if (cancelled || !videoRef.current) return;

        scanner = new QrScanner(
          videoRef.current,
          (result: { data: string }) => {
            if (result.data) {
              onQrScanned(result.data);
              scanner?.stop();
            }
          },
          {
            preferredCamera: 'environment',
            highlightScanRegion: false,
            highlightCodeOutline: false,
          }
        );

        await scanner.start();
        if (!cancelled) setCameraState('active');
      } catch {
        if (!cancelled) setCameraState('denied');
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      scanner?.stop();
      scanner?.destroy();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onQrScanned]);

  const handleCodeInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '').slice(0, 6);
    const formatted = raw.length > 3 ? `${raw.slice(0, 3)} ${raw.slice(3)}` : raw;
    setCodeValue(formatted);
  };

  const handleSubmit = () => {
    const digits = codeValue.replace(/\D/g, '');
    if (digits.length === 6 && !submitting) {
      setSubmitting(true);
      onCodeSubmit(digits);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const isCodeComplete = codeValue.replace(/\D/g, '').length === 6;

  return (
    <div class="receive-scanner">
      {/* Scanner panel — only when camera is active */}
      {cameraState === 'active' && (
        <div class="scanner-panel">
          <video
            ref={videoRef}
            class="scanner-panel__video"
            playsInline
            muted
            aria-label="Camera viewfinder for QR scanning"
          />
          <div class="scanner-panel__viewfinder" aria-hidden="true" />
          <p class="scanner-panel__caption">
            Point your camera at the QR code on the sender's screen
          </p>
        </div>
      )}

      {/* Loading camera */}
      {cameraState === 'loading' && (
        <div class="scanner-panel scanner-panel--placeholder">
          <video
            ref={videoRef}
            class="scanner-panel__video"
            playsInline
            muted
            style={{ display: 'none' }}
          />
          <p class="scanner-panel__caption-dark">Starting camera…</p>
        </div>
      )}

      {/* Camera unavailable (HTTP) */}
      {cameraState === 'unavailable' && (
        <div class="scanner-panel scanner-panel--placeholder">
          <CameraIcon size={48} />
          <p class="scanner-panel__caption-dark">
            Camera requires a secure connection (HTTPS).
          </p>
          <p class="scanner-panel__hint">
            Use the 6-digit code from the sender's screen below.
          </p>
        </div>
      )}

      {/* Camera denied */}
      {cameraState === 'denied' && (
        <div class="scanner-panel scanner-panel--placeholder">
          <CameraIcon size={48} />
          <p class="scanner-panel__caption-dark">
            Camera access was denied.
          </p>
          <p class="scanner-panel__hint">
            Allow camera in your browser settings, or use the code below.
          </p>
        </div>
      )}

      {/* Code card */}
      <div class="code-card">
        <label class="code-card__label" for="code-input">
          {cameraState === 'active' ? "Can't scan? Type the 6-digit code" : 'Enter the 6-digit code from the sender'}
        </label>
        <input
          id="code-input"
          type="text"
          class="code-card__input"
          placeholder="000 000"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={7}
          value={codeValue}
          onInput={handleCodeInput}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          aria-label="6-digit connection code"
        />
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!isCodeComplete || submitting}
        >
          {submitting ? 'Connecting…' : 'Connect'}
        </Button>
      </div>
    </div>
  );
}
