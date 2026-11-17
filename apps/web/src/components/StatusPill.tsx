/**
 * StatusPill — shows connection state with colored dot
 */
import { JSX } from 'preact';
import './StatusPill.css';

interface StatusPillProps {
  status: 'waiting' | 'connected';
  text: string;
}

export function StatusPill({ status, text }: StatusPillProps): JSX.Element {
  return (
    <div class="status-pill" role="status" aria-live="polite">
      <span
        class={`status-pill__dot status-pill__dot--${status}`}
        aria-hidden="true"
      />
      <span class="status-pill__text">{text}</span>
    </div>
  );
}

