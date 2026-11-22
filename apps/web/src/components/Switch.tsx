/**
 * Switch — Accessible toggle switch.
 * 52×30, fully round.
 * On: ink track (light) or lime track (dark). Off: #CFCFD6.
 * 24px knob inset 3px (white, or ink on lime).
 */
import { JSX } from 'preact';
import './Switch.css';

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
  disabled?: boolean;
  class?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  id,
  disabled = false,
  class: className = '',
}: SwitchProps): JSX.Element {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      class={`switch ${checked ? 'switch--checked' : ''} ${className}`.trim()}
      onClick={() => {
        if (!disabled) {
          onChange(!checked);
        }
      }}
    >
      <span class="switch__knob" aria-hidden="true" />
    </button>
  );
}
