/**
 * ProgressBar component
 */
import { JSX } from 'preact';
import './ProgressBar.css';

interface ProgressBarProps {
  progress: number; // 0-100
  'aria-label'?: string;
}

export function ProgressBar({ progress, ...rest }: ProgressBarProps): JSX.Element {
  const clamped = Math.max(0, Math.min(100, progress));
  return (
    <div
      class="progress-bar"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      {...rest}
    >
      <div
        class="progress-bar__fill"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

