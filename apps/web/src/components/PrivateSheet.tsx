/**
 * PrivateSheet — bottom sheet on phones, centered dialog on desktop
 */
import { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { CheckIconSmall, LockIcon } from './Icons';
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
    text: 'The QR stops working once the receiver connects.',
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

  if (!open) return null;

  return (
    <div class="sheet-overlay" onClick={onClose} aria-modal="true" role="dialog" aria-label="Privacy settings">
      <div
        class="sheet"
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="sheet__handle" aria-hidden="true" />

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
              <div class="sheet__switch-desc">Strips GPS info. Quality is unchanged.</div>
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
              <div class="sheet__switch-desc">Photos go through a relay. Can be slower.</div>
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

