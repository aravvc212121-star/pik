/**
 * Header component: logo + name on left, Private button on right
 */
import { JSX } from 'preact';
import { LogoIcon, LockIcon } from './Icons';
import './Header.css';

interface HeaderProps {
  onPrivateClick: () => void;
}

export function Header({ onPrivateClick }: HeaderProps): JSX.Element {
  return (
    <header class="header">
      <div class="header__brand">
        <LogoIcon size={30} />
        <span class="header__name">PicBeam</span>
      </div>
      <button
        type="button"
        class="header__private-btn"
        onClick={onPrivateClick}
        aria-label="Privacy settings"
      >
        <LockIcon size={14} />
        <span>Private</span>
      </button>
    </header>
  );
}

