/**
 * Screen 4: Receive done — files received, save options
 */
import { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { CheckIcon } from '../components/Icons';
import { Button } from '../components/Button';
import { Footnote } from '../components/Footnote';
import { formatBytes } from '../lib/state';
import type { ReceivedFile } from '../lib/state';
import './ReceiveDone.css';

interface ReceiveDoneProps {
  files: ReceivedFile[];
  totalBytes: number;
  onSaveGallery: () => void;
  onDownloadZip: () => void;
  canShare: boolean;
}

export function ReceiveDone({
  files,
  totalBytes,
  onSaveGallery,
  onDownloadZip,
  canShare,
}: ReceiveDoneProps): JSX.Element {
  const thumbnails = useMemo(() => {
    return files.slice(0, 8).map((f) => ({
      url: URL.createObjectURL(f.blob),
      name: f.name,
    }));
  }, [files]);

  return (
    <div class="receive-done">
      <div class="receive-done__center">
        <CheckIcon size={64} />
        <h2 class="receive-done__title">
          {files.length} photo{files.length !== 1 ? 's' : ''} received
        </h2>
        <p class="receive-done__meta">
          {formatBytes(totalBytes)} · Original quality
        </p>

        <div class="receive-done__grid">
          {thumbnails.map((t, i) => (
            <img
              key={i}
              src={t.url}
              alt={t.name}
              class="receive-done__thumb"
              loading="lazy"
            />
          ))}
        </div>
      </div>

      {canShare && (
        <Button variant="primary" onClick={onSaveGallery}>
          Save to gallery
        </Button>
      )}
      <Button variant={canShare ? 'secondary' : 'primary'} onClick={onDownloadZip}>
        Download as ZIP
      </Button>
      <Footnote>Photos live only on this page until you save them</Footnote>
    </div>
  );
}
