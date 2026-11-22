/**
 * EnterCode — Dark-theme screen for the receiver to type a 6-digit code.
 * Six individual inputs, inputmode=numeric, autocomplete=one-time-code.
 */
import { JSX } from 'preact';
import { useState, useRef, useCallback, useEffect } from 'preact/hooks';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import './EnterCode.css';

interface EnterCodeProps {
  onSubmit: (code: string) => void;
  onBack: () => void;
  error?: string | null;
  loading?: boolean;
}

export function EnterCode({ onSubmit, onBack, error, loading }: EnterCodeProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const digitsRef = useRef<string[]>(['', '', '', '', '', '']);
  const submittedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [shake, setShake] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(error ?? null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join('');
  const isComplete = code.length === 6;

  // Shake effect on error, clear all code & sync displayError
  useEffect(() => {
    setDisplayError(error ?? null);
    if (error) {
      submittedRef.current = false;
      setShake(true);
      // Clear all code cells on wrong code
      digitsRef.current = ['', '', '', '', '', ''];
      setDigits(['', '', '', '', '', '']);
      setActiveIndex(0);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 50);
      const timer = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const focusInput = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(5, index));
    setActiveIndex(clamped);
    inputRefs.current[clamped]?.focus();
  }, []);

  const handleInput = useCallback((index: number, value: string) => {
    if (displayError) setDisplayError(null);

    // Allow uppercase alphanumeric (A-Z, 0-9)
    const cleaned = value.toUpperCase().replace(/[^0-9A-Z]/g, '');

    // Handle paste of full code
    if (cleaned.length >= 6) {
      const newDigits = cleaned.slice(0, 6).split('');
      digitsRef.current = newDigits;
      setDigits(newDigits);
      setActiveIndex(5);
      inputRefs.current[5]?.focus();
      if (!loading && !submittedRef.current) {
        submittedRef.current = true;
        setTimeout(() => onSubmit(newDigits.join('')), 20);
      }
      return;
    }

    if (cleaned.length === 0) {
      digitsRef.current[index] = '';
      setDigits([...digitsRef.current]);
      return;
    }

    // Take the newest alphanumeric character entered
    const char = cleaned.slice(-1);
    digitsRef.current[index] = char;
    setDigits([...digitsRef.current]);

    const fullCode = digitsRef.current.join('');
    const isAllFilled = digitsRef.current.every(d => d.length === 1);

    if (isAllFilled && fullCode.length === 6) {
      // 6th character entered: automatically confirm and submit!
      if (!loading && !submittedRef.current) {
        submittedRef.current = true;
        setTimeout(() => onSubmit(fullCode), 20);
      }
    } else if (index < 5) {
      focusInput(index + 1);
    }
  }, [displayError, focusInput, loading, onSubmit]);

  const handleKeyDown = useCallback((index: number, e: KeyboardEvent) => {
    if (displayError) setDisplayError(null);

    if (e.key === 'Enter') {
      e.preventDefault();
      const currentCode = digitsRef.current.join('');
      if (currentCode.length === 6 && !loading && !submittedRef.current) {
        submittedRef.current = true;
        onSubmit(currentCode);
      }
      return;
    }

    // Block any character that is not a letter or digit
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && !/^[0-9a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      submittedRef.current = false;
      if (digitsRef.current[index]) {
        digitsRef.current[index] = '';
        setDigits([...digitsRef.current]);
      } else if (index > 0) {
        digitsRef.current[index - 1] = '';
        setDigits([...digitsRef.current]);
        focusInput(index - 1);
      }
      return;
    } else if (e.key === 'ArrowLeft' && index > 0) {
      focusInput(index - 1);
    } else if (e.key === 'ArrowRight' && index < 5) {
      focusInput(index + 1);
    }
  }, [displayError, focusInput, loading, onSubmit]);

  const handleSubmit = useCallback(() => {
    const currentCode = digitsRef.current.join('');
    if (currentCode.length === 6 && !loading) {
      submittedRef.current = true;
      onSubmit(currentCode);
    }
  }, [loading, onSubmit]);

  const reducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  return (
    <div class="screen-page entercode-root" data-theme="dark">
      <div class="screen-container">
        <Header mode="back" onBack={onBack} />

        <div class="entercode-content">
          <h1 class="entercode-title">Enter the code</h1>
          <p class="entercode-subtitle">Ask the sender for their 6-digit code.</p>

          <div
            class={`entercode-cells ${shake && !reducedMotion ? 'entercode-cells--shake' : ''}`}
            role="group"
            aria-label="6-digit code"
          >
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellcheck={false}
                pattern="[0-9a-zA-Z]*"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={6}
                value={digit}
                class={`entercode-cell ${i === activeIndex ? 'entercode-cell--active' : ''}`}
                aria-label={`Character ${i + 1}`}
                onInput={(e) => handleInput(i, (e.target as HTMLInputElement).value)}
                onKeyDown={(e) => handleKeyDown(i, e as unknown as KeyboardEvent)}
                onFocus={() => setActiveIndex(i)}
                onClick={() => setActiveIndex(i)}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = (e as ClipboardEvent).clipboardData?.getData('text') ?? '';
                  handleInput(i, pasted);
                }}
              />
            ))}
          </div>

          {displayError && (
            <p class="entercode-error" role="alert">{displayError}</p>
          )}
        </div>

        <div class="entercode-footer">
          <Button
            variant="primary"
            label={loading ? 'Connecting…' : 'Connect'}
            onClick={handleSubmit}
            disabled={!isComplete}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
