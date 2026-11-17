/**
 * Screen 6: Send done
 */
import { JSX } from 'preact';
import { CheckIcon } from '../components/Icons';
import { Button } from '../components/Button';
import { formatBytes } from '../lib/state';
import './SendDone.css';

interface SendDoneProps {
  totalFiles: number;
  totalBytes: number;
  onSendMore: () => void;
  onDone: () => void;
}

export function SendDone({ totalFiles, totalBytes, onSendMore, onDone }: SendDoneProps): JSX.Element {
  return (
    <div class="send-done">
      <div class="send-done__center">
        <CheckIcon size={64} />
        <h2 class="send-done__title">Sent</h2>
        <p class="send-done__meta">
          {totalFiles} photo{totalFiles !== 1 ? 's' : ''} · {formatBytes(totalBytes)} · Original quality
        </p>
        <p class="send-done__desc">
          The connection is closed. Nothing was stored anywhere.
        </p>
      </div>

      <Button variant="primary" onClick={onSendMore}>
        Send more photos
      </Button>
      <Button variant="secondary" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
