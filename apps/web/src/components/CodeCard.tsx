/**
 * CodeCard — Lime bg card showing 6-digit code with expiry rail.
 */
import { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import './CodeCard.css';

interface CodeCardProps {
  code: string;
  expiresAt: number; // unix ms timestamp
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

const EXPIRY_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export function CodeCard({ code, expiresAt }: CodeCardProps): JSX.Element {
  const railRef = useRef<HTMLDivElement>(null);
  const [timeLeft, setTimeLeft] = useState(() => expiresAt - Date.now());

  useEffect(() => {
    const update = () => {
      const remaining = expiresAt - Date.now();
      setTimeLeft(remaining);
      if (railRef.current) {
        const frac = Math.max(0, remaining / EXPIRY_DURATION_MS);
        railRef.current.style.setProperty('--expiry-progress', String(frac));
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // Format code with space in middle: "482913" → "482 913"
  const formatted = code.length === 6
    ? `${code.slice(0, 3)} ${code.slice(3)}`
    : code;

  return (
    <div class="code-card">
      <p class="code-card__code" aria-label={`Code: ${code.split('').join(' ')}`}>
        {formatted}
      </p>
      <div class="code-card__expiry">
        <div class="code-card__rail">
          <div class="code-card__rail-fill" ref={railRef} />
        </div>
        <span class="code-card__time">
          {timeLeft > 0 ? `Expires in ${formatTimeLeft(timeLeft)}` : 'Expired'}
        </span>
      </div>
    </div>
  );
}
