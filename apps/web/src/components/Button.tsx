/**
 * Button components — Primary and Secondary
 */
import { JSX, ComponentChildren } from 'preact';
import './Button.css';

interface ButtonProps {
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  class?: string;
  children: ComponentChildren;
  'aria-label'?: string;
}

export function Button({
  variant = 'primary',
  onClick,
  disabled = false,
  type = 'button',
  class: className = '',
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      class={`btn btn--${variant} ${className}`}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

