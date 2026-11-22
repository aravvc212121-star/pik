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

  // Interactive pull-down to dismiss gesture
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const isDragging = useRef(false);
  const dragOffsetY = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only drag down if scrolled to the top
    if (sheetRef.current && sheetRef.current.scrollTop > 4) return;
    touchStartY.current = e.touches[0]?.clientY ?? 0;
    touchStartTime.current = Date.now();
    isDragging.current = true;
    dragOffsetY.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    const currentY = e.touches[0]?.clientY ?? 0;
    const diffY = currentY - touchStartY.current;

    if (diffY > 0) {
      dragOffsetY.current = diffY;
      sheetRef.current.style.transition = 'none';
      sheetRef.current.style.transform = `translateY(${diffY}px)`;
    } else {
      dragOffsetY.current = 0;
      sheetRef.current.style.transform = 'translateY(0px)';
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current || !sheetRef.current) return;
    isDragging.current = false;

    const diffY = dragOffsetY.current;
    const elapsed = Date.now() - touchStartTime.current;
    const velocity = diffY / Math.max(elapsed, 1);

    // If dragged down past 80px or flicked down, animate down automatically and close
    if (diffY > 80 || velocity > 0.3) {
      sheetRef.current.style.transition = 'transform 0.22s cubic-bezier(0.32, 0, 0.67, 0)';
      sheetRef.current.style.transform = 'translateY(100%)';
      setTimeout(() => {
        if (sheetRef.current) {
          sheetRef.current.style.transform = '';
          sheetRef.current.style.transition = '';
        }
        onClose();
      }, 220);
    } else {
      // Snap back up smoothly
      sheetRef.current.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
      sheetRef.current.style.transform = 'translateY(0px)';
    }
    dragOffsetY.current = 0;
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
        onTouchMove={handleTouchMove}
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
