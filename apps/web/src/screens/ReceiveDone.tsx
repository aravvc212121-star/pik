/**
 * Screen 4: Receive done — files received, save options
 */
import { JSX } from 'preact';
import { useMemo, useCallback } from 'preact/hooks';
import { CheckIcon } from '../components/Icons';
import { Button } from '../components/Button';
import { Footnote } from '../components/Footnote';
import { formatBytes } from '../lib/state';
import type { ReceivedFile } from '../lib/state';
import { canShareFiles, shareFiles, downloadBlob } from '../lib/zip/index';
import './ReceiveDone.css';

interface ReceiveDoneProps {
  files: ReceivedFile[];
  totalBytes: number;
  onSaveGallery: () => void;
  onDownloadZip: () => void;
  canShare?: boolean;
}

export function ReceiveDone({
  files,
  totalBytes,
  onSaveGallery,
  onDownloadZip,
}: ReceiveDoneProps): JSX.Element {
  const thumbnails = useMemo(() => {
    return files.slice(0, 8).map((f) => ({
      file: f,
      url: URL.createObjectURL(f.blob),
      name: f.name,
    }));
  }, [files]);

  const handleThumbnailClick = useCallback(async (file: ReceivedFile) => {
    const fileObj = new File([file.blob], file.name, { type: file.mimeType });
    if (canShareFiles([fileObj])) {
      const res = await shareFiles([fileObj]);
      if (res === 'fallback') {
        downloadBlob(file.blob, file.name);
      }
      return;
    }
    downloadBlob(file.blob, file.name);
  }, []);

  const handleDownloadAll = useCallback(async () => {
    for (const f of files) {
      downloadBlob(f.blob, f.name);
      if (files.length > 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
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
            <button
              type="button"
              key={i}
              class="receive-done__thumb-btn"
              onClick={() => handleThumbnailClick(t.file)}
              title={`Save or download ${t.name}`}
              aria-label={`Save or download ${t.name}`}
            >
              <img
                src={t.url}
                alt={t.name}
                class="receive-done__thumb"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>

      <Button variant="primary" onClick={onSaveGallery}>
        Save to Gallery / Photos
      </Button>

      <Button variant="secondary" onClick={handleDownloadAll}>
        Download {files.length === 1 ? 'image' : `all ${files.length} images`}
      </Button>

      {files.length > 1 && (
        <Button variant="secondary" onClick={onDownloadZip}>
          Download as ZIP
        </Button>
      )}

      <Footnote>Tap any photo to save or download individually</Footnote>
    </div>
  );
}
