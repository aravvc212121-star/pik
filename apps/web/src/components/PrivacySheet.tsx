/**
 * PrivacySheet — Bottom sheet on phones, centered dialog (420px) on desktop.
 * Over backdrop #2B2B30. Focus-traps, Escape/backdrop/swipe-down to close.
 */
import { JSX } from 'preact';
import { useEffect, useRef, useCallback } from 'preact/hooks';
import { Wordmark } from './Wordmark';
import { IconButton } from './IconButton';
import { CheckMark } from './CheckMark';
import { Switch } from './Switch';
import { Button } from './Button';
import './PrivacySheet.css';

interface PrivacySheetProps {
  open: boolean;
  onClose: () => void;
  removeLocation: boolean;
  onRemoveLocationChange: (v: boolean) => void;
  hideIp: boolean;
  onHideIpChange: (v: boolean) => void;
}

export function PrivacySheet({
  open,
  onClose,
  removeLocation,
  onRemoveLocationChange,
  hideIp,
  onHideIpChange,
}: PrivacySheetProps): JSX.Element | null {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Focus trap + escape key
  useEffect(() => {
    if (!open) return;

    // Focus the sheet
    const timer = setTimeout(() => {
      const firstBtn = sheetRef.current?.querySelector<HTMLElement>('button');
      firstBtn?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      // Focus trap
      if (e.key === 'Tab' && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [role="switch"]:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  // Swipe down to close
  const touchStartY = useRef(0);
  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? 0;
  }, []);
  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const endY = e.changedTouches[0]?.clientY ?? 0;
    if (endY - touchStartY.current > 80) {
      onClose();
    }
  }, [onClose]);

  if (!open) return null;

  return (
    <div class="privacy-backdrop" onClick={onClose}>
      <div
        class="privacy-sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Privacy information"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle */}
        <div class="privacy-sheet__handle-area">
          <div class="privacy-sheet__handle" />
        </div>

        {/* Wordmark + lock icon */}
        <div class="privacy-sheet__header">
          <Wordmark />
          <IconButton
            aria-label="Privacy"
            variant="privacy"
            icon="lock"
          />
        </div>

        {/* Title */}
        <h2 class="privacy-sheet__title">Private by design</h2>

        {/* Three check rows */}
        <div class="privacy-sheet__rows">
          <div class="privacy-sheet__row">
            <div class="privacy-sheet__row-icon">
              <CheckMark size="sm" />
            </div>
            <div class="privacy-sheet__row-text">
              <span class="privacy-sheet__row-title">Direct and encrypted</span>
              <span class="privacy-sheet__row-desc">Photos go straight between the two phones.</span>
            </div>
          </div>

          <div class="privacy-sheet__row">
            <div class="privacy-sheet__row-icon">
              <CheckMark size="sm" />
            </div>
            <div class="privacy-sheet__row-text">
              <span class="privacy-sheet__row-title">Nothing stored</span>
              <span class="privacy-sheet__row-desc">No account, no upload, no copy on any server.</span>
            </div>
          </div>

          <div class="privacy-sheet__row">
            <div class="privacy-sheet__row-icon">
              <CheckMark size="sm" />
            </div>
            <div class="privacy-sheet__row-text">
              <span class="privacy-sheet__row-title">One-time code</span>
              <span class="privacy-sheet__row-desc">Your code works once and expires in 5 minutes.</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div class="privacy-sheet__divider" />

        {/* Switch rows */}
        <div class="privacy-sheet__switch-rows">
          <div class="privacy-sheet__switch-row">
            <div class="privacy-sheet__switch-info">
              <span class="privacy-sheet__switch-title">Remove location data</span>
              <span class="privacy-sheet__switch-desc">Strips GPS info. Quality is unchanged.</span>
            </div>
            <Switch
              checked={removeLocation}
              onChange={onRemoveLocationChange}
              label="Remove location data"
            />
          </div>

          <div class="privacy-sheet__switch-row">
            <div class="privacy-sheet__switch-info">
              <span class="privacy-sheet__switch-title">Hide my IP address</span>
              <span class="privacy-sheet__switch-desc">Uses a relay. Can be slower.</span>
            </div>
            <Switch
              checked={hideIp}
              onChange={onHideIpChange}
              label="Hide my IP address"
            />
          </div>
        </div>

        {/* Got it button */}
        <div class="privacy-sheet__footer" data-theme="light">
          <Button variant="primary" label="Got it" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
