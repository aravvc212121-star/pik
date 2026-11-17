/**
 * Screen 2: Receive — enter the 6-digit code
 */
import { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from '../components/Button';
import './ReceiveScanner.css';

interface ReceiveScannerProps {
  onCodeSubmit: (code: string) => void;
}

export function ReceiveScanner({ onCodeSubmit }: ReceiveScannerProps): JSX.Element {
  const [codeValue, setCodeValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      <div class="receive-scanner__hero">
        <h2 class="receive-scanner__title">Receive photos</h2>
        <p class="receive-scanner__body">
          Enter the 6-digit code shown on the sender's screen to start receiving photos.
        </p>
      </div>

      <div class="code-card">
        <label class="code-card__label" for="code-input">
          6-digit code
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
          autoFocus
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
