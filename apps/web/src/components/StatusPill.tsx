/**
 * StatusPill — inline pill with 8px status dot.
 */
import { JSX } from 'preact';
import './StatusPill.css';

interface StatusPillProps {
  status: 'waiting' | 'connected';
  label: string;
}

export function StatusPill({ status, label }: StatusPillProps): JSX.Element {
  return (
    <span class={`status-pill status-pill--${status}`}>
      <span class="status-pill__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
