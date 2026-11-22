/**
 * ProgressRail — 4px tall progress bar.
 * Uses CSS custom property --progress-value set from script.
 */
import { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import './ProgressRail.css';

interface ProgressRailProps {
  progress: number; // 0–1
}

export function ProgressRail({ progress }: ProgressRailProps): JSX.Element {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fillRef.current) {
      fillRef.current.style.setProperty('--progress-value', String(Math.max(0, Math.min(1, progress))));
    }
  }, [progress]);

  return (
    <div class="progress-rail" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div class="progress-rail__fill" ref={fillRef} />
    </div>
  );
}
