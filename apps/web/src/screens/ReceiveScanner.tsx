/**
 * Screen 2: Receive — scanner with code field
 */
import { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Button } from '../components/Button';
import './ReceiveScanner.css';

interface ReceiveScannerProps {
  onQrScanned: (url: string) => void;
  onCodeSubmit: (code: string) => void;
}

export function ReceiveScanner({ onQrScanned, onCodeSubmit }: ReceiveScannerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [codeValue, setCodeValue] = useState('');
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let scanner: any = null;
    let cancelled = false;

    async function startScanner() {
      try {
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
      } catch {
        setCameraAvailable(false);
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      scanner?.stop();
      scanner?.destroy();
      // Stop all tracks
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onQrScanned]);

  const handleCodeInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    // Only allow digits, format as "000 000"
    const raw = input.value.replace(/\D/g, '').slice(0, 6);
    const formatted = raw.length > 3 ? `${raw.slice(0, 3)} ${raw.slice(3)}` : raw;
    setCodeValue(formatted);
  };

  const handleSubmit = () => {
    const digits = codeValue.replace(/\D/g, '');
    if (digits.length === 6) {
      onCodeSubmit(digits);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div class="receive-scanner">
      {/* Scanner panel */}
      {cameraAvailable && (
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

      {/* Code card */}
      <div class="code-card">
        <label class="code-card__label" for="code-input">
          Can't scan? Type the 6-digit code
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
        <Button variant="primary" onClick={handleSubmit} disabled={codeValue.replace(/\D/g, '').length !== 6}>
          Connect
        </Button>
      </div>
    </div>
  );
}
