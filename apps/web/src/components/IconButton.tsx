/**
 * IconButton — 44×44 round transparent button with aria-label.
 * Privacy variant: 1px line border + 20px lock icon.
 */
import { JSX } from 'preact';
import { Lock, ChevronLeft, Close } from './Icons';
import './IconButton.css';

interface IconButtonProps {
  'aria-label': string;
  onClick?: () => void;
  variant?: 'default' | 'privacy';
  icon?: 'chevron-left' | 'close' | 'lock';
  class?: string;
}

export function IconButton({
  'aria-label': ariaLabel,
  onClick,
  variant = 'default',
  icon = 'chevron-left',
  class: className = '',
}: IconButtonProps): JSX.Element {
  const cls = ['icon-btn', variant === 'privacy' ? 'icon-btn--privacy' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button class={cls} aria-label={ariaLabel} onClick={onClick} type="button">
      {icon === 'chevron-left' && <ChevronLeft size={22} />}
      {icon === 'close' && <Close size={22} />}
      {icon === 'lock' && <Lock size={variant === 'privacy' ? 20 : 22} />}
    </button>
  );
}
