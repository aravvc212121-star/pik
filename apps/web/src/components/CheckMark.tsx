/**
 * CheckMark — Lime circle with ink check glyph.
 * lg: 80px, sm: 22px.
 * Light theme: 2px ink ring so visible on white.
 */
import { JSX } from 'preact';
import './CheckMark.css';

interface CheckMarkProps {
  size: 'lg' | 'sm';
}

export function CheckMark({ size }: CheckMarkProps): JSX.Element {
  const px = size === 'lg' ? 80 : 22;
  const strokeW = 2.4;
  // Check path scaled for each size
  const path = size === 'lg'
    ? 'M24 42l16 16 20-28'
    : 'M6 11l4 4 7-8';

  return (
    <svg
      class={`checkmark checkmark--${size}`}
      width={px}
      height={px}
      viewBox={`0 0 ${px} ${px}`}
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx={px / 2}
        cy={px / 2}
        r={px / 2}
        fill="#D4FF3A"
        class="checkmark__circle"
      />
      <path
        d={path}
        stroke="#0E0E10"
        stroke-width={strokeW}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
