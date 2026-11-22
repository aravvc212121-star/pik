/**
 * Button — Primary, Secondary, Ghost variants.
 */
import { JSX } from 'preact';
import './Button.css';

interface ButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  class?: string;
}

export function Button({
  label,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  class: className = '',
}: ButtonProps): JSX.Element {
  const cls = ['btn', `btn--${variant}`, className].filter(Boolean).join(' ');

  return (
    <button
      class={cls}
      onClick={onClick}
      disabled={disabled || loading}
      type="button"
    >
      {loading ? 'Connecting…' : label}
    </button>
  );
}
