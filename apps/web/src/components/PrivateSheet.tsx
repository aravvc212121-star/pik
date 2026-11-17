/**
 * PrivateSheet — bottom sheet on phones, centered dialog on desktop
 *
 * Supports intuitive pull-down / pull-up gestures via the handle bar:
 * - Pull down -> follows finger down
 * - Pull up -> follows finger up
 * - Released >= 50% (halfway down) -> slides all the way down and closes
 * - Released < 50% -> springs back up to 0 (fully open)
 */
import { JSX } from 'preact';
import { useEffect, useRef, useCallback, useState } from 'preact/hooks';
import { CheckIconSmall } from './Icons';
import { Switch } from './Switch';
import { Button } from './Button';
import './PrivateSheet.css';

interface PrivateSheetProps {
  open: boolean;
  onClose: () => void;
  removeLocation: boolean;
  onRemoveLocationChange: (v: boolean) => void;
  hideIp: boolean;
  onHideIpChange: (v: boolean) => void;
}

const features = [
  {
    title: 'Phone to phone',
    text: 'Photos travel directly between the two devices.',
  },
  {
    title: 'Nothing stored',
    text: 'No account, no upload, no copy on any server.',
  },
  {
    title: 'Encrypted',
    text: 'The connection is encrypted while photos travel.',
  },
  {
    title: 'One-time code',
    text: 'The code stops working once the receiver connects.',
  },
];

export function PrivateSheet({
  open,
  onClose,
  removeLocation,
  onRemoveLocationChange,
  hideIp,
  onHideIpChange,
}: PrivateSheetProps): JSX.Element | null {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const startY = useRef(0);
  const lastY = useRef(0);
  const lastTime = useRef(0);
  const velocityY = useRef(0);
  const pointerId = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Trap focus
  useEffect(() => {
    if (!open || !sheetRef.current) return;
    const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
      'button, [role="switch"], a, input'
    );
    if (focusable.length > 0) focusable[0]?.focus();
  }, [open]);

  // Reset drag offset when sheet opens/closes
  useEffect(() => {
    setDragOffset(0);
    setIsDragging(false);
  }, [open]);

  // ── Pull-down / Pull-up gesture handling ──

  const handlePointerDown = useCallback((e: PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    pointerId.current = e.pointerId;
    startY.current = e.clientY - dragOffset;
    lastY.current = e.clientY;
    lastTime.current = e.timeStamp;
    velocityY.current = 0;
    setIsDragging(true);
  }, [dragOffset]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;

    const currentY = e.clientY;
    const rawDy = currentY - startY.current;

    const dt = e.timeStamp - lastTime.current;
    if (dt > 0) {
      velocityY.current = (currentY - lastY.current) / dt;
    }
    lastY.current = currentY;
    lastTime.current = e.timeStamp;

    // Pull down: 1:1 movement
    // Pull up: slight rubber-band resistance
    if (rawDy >= 0) {
      setDragOffset(rawDy);
    } else {
      setDragOffset(rawDy * 0.15);
    }
  }, []);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;

    const target = e.currentTarget as HTMLElement;
    try {
      target.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    pointerId.current = null;
    setIsDragging(false);

    const sheet = sheetRef.current;
    const sheetHeight = sheet?.offsetHeight || 420;
    const halfway = sheetHeight * 0.5;

    // If released >= halfway down OR downward flick, slide down and close
    if (dragOffset >= halfway || (velocityY.current > 0.5 && dragOffset > 40)) {
      setDragOffset(sheetHeight + 80);
      setTimeout(() => {
        onClose();
        setDragOffset(0);
      }, 240);
    } else {
      // If released before halfway, spring back up to 0 (open)
      setDragOffset(0);
    }
  }, [dragOffset, onClose]);

  const handlePointerCancel = useCallback((e: PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    setIsDragging(false);
    setDragOffset(0);
  }, []);

  if (!open) return null;

  const sheetStyle: JSX.CSSProperties = {
    transform: `translateY(${Math.max(0, dragOffset)}px)`,
    transition: isDragging
      ? 'none'
      : 'transform 0.28s cubic-bezier(0.2, 0.7, 0.2, 1)',
  };

  const overlayOpacity = Math.max(
    0,
    1 - (dragOffset / (sheetRef.current?.offsetHeight || 420)) * 0.8
  );

  return (
    <div
      class="sheet-overlay"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label="Privacy settings"
      style={{ opacity: String(overlayOpacity) }}
    >
      <div
        class="sheet"
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        style={sheetStyle}
      >
        {/* Handle zone — touch target to pull down or pull up */}
        <div
          class="sheet__handle-zone"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          aria-label="Drag down to close"
        >
          <div class="sheet__handle" aria-hidden="true" />
        </div>

        <h2 class="sheet__title">Private by design</h2>

        <div class="sheet__features">
          {features.map((f) => (
            <div class="sheet__feature" key={f.title}>
              <CheckIconSmall size={20} />
              <div>
                <div class="sheet__feature-title">{f.title}</div>
                <div class="sheet__feature-text">{f.text}</div>
              </div>
            </div>
          ))}
        </div>

        <div class="sheet__divider" />

        <div class="sheet__switches">
          <div class="sheet__switch-row">
            <div class="sheet__switch-info">
              <div class="sheet__switch-title">Remove location data</div>
              <div class="sheet__switch-desc">
                Strips GPS info. Quality is unchanged.
              </div>
            </div>
            <Switch
              checked={removeLocation}
              onChange={onRemoveLocationChange}
              label="Remove location data"
              id="switch-location"
            />
          </div>
          <div class="sheet__switch-row">
            <div class="sheet__switch-info">
              <div class="sheet__switch-title">Hide my IP address</div>
              <div class="sheet__switch-desc">
                Photos go through a relay. Can be slower.
              </div>
            </div>
            <Switch
              checked={hideIp}
              onChange={onHideIpChange}
              label="Hide my IP address"
              id="switch-ip"
            />
          </div>
        </div>

        <Button variant="primary" onClick={onClose}>
          Got it
        </Button>
      </div>
    </div>
  );
}
