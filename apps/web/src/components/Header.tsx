/**
 * Header — 44px tall row: left icon button, optional right ghost button.
 */
import { JSX } from 'preact';
import { IconButton } from './IconButton';
import './Header.css';

interface HeaderProps {
  mode: 'back' | 'close';
  onBack?: () => void;
  rightAction?: string;
  onRightAction?: () => void;
}

export function Header({ mode, onBack, rightAction, onRightAction }: HeaderProps): JSX.Element {
  return (
    <header class="header">
      <IconButton
        aria-label={mode === 'back' ? 'Go back' : 'Close'}
        icon={mode === 'back' ? 'chevron-left' : 'close'}
        onClick={onBack}
      />
      {rightAction && (
        <button class="header__right-action" type="button" onClick={onRightAction}>
          {rightAction}
        </button>
      )}
    </header>
  );
}
