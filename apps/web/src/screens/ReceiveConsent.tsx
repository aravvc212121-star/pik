/**
 * Screen 7: Receive — consent screen
 */
import { JSX } from 'preact';
import type { FileManifestEntry } from '@picbeam/protocol';
import { Button } from '../components/Button';
import { formatBytes } from '../lib/state';
import './ReceiveConsent.css';

interface ReceiveConsentProps {
  files: FileManifestEntry[];
  totalSize: number;
  onAccept: () => void;
  onDecline: () => void;
}

export function ReceiveConsent({ files, totalSize, onAccept, onDecline }: ReceiveConsentProps): JSX.Element {
  return (
    <div class="receive-consent">
      <div class="consent-card">
        <h2 class="consent-card__title">
          A device wants to send you {files.length} file{files.length !== 1 ? 's' : ''}
        </h2>
        <p class="consent-card__meta">{formatBytes(totalSize)}</p>

        <div class="consent-card__list">
          {files.map((f) => (
            <div class="consent-card__file" key={f.id}>
              <div class="consent-card__file-info">
                <span class="consent-card__file-name">{f.name}</span>
                <span class="consent-card__file-size">{formatBytes(f.size)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Button variant="primary" onClick={onAccept}>
        Accept
      </Button>
      <Button variant="secondary" onClick={onDecline}>
        Decline
      </Button>
    </div>
  );
}
