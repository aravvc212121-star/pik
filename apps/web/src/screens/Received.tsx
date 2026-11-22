/**
 * Received — Dark-theme completion screen.
 * Check mark, count, 4-column thumbnail grid,
 * Save to gallery (lime), Download as ZIP, footnote.
 * Tapping photos or Save opens native mobile preview.
 */
import { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { CheckMark } from '../components/CheckMark';
import { Button } from '../components/Button';
import { PhotoPreviewModal } from '../components/PhotoPreviewModal';
import type { ReceivedFileData } from '../session/types';
import './Received.css';

interface ReceivedProps {
  files: Array<ReceivedFileData & { objectUrl?: string }>;
  totalBytes: number;
  onSaveGallery: () => void;
  onDownloadZip: () => void;
  canShare: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Received({ files, totalBytes, onSaveGallery, onDownloadZip, canShare }: ReceivedProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const count = files.length;

  function handleSaveClick() {
    if (canShare) {
      onSaveGallery();
    } else {
      setPreviewIndex(0);
    }
  }

  return (
    <div class="screen-page received-root" data-theme="dark">
      <div class="screen-container">
        {/* Centered content */}
        <div class="received-center">
          <div class="received-icon-wrap">
            <CheckMark size="lg" />
          </div>

          <h1 class="received-title">{count} photos received.</h1>
          <p class="received-meta">{formatSize(totalBytes)} · Original quality</p>

          {/* Thumbnail grid — tap any photo for native mobile preview */}
          <div class="received-grid">
            {files.map((f, i) => (
              <button
                key={i}
                type="button"
                class="received-grid-item"
                onClick={() => setPreviewIndex(i)}
                aria-label={`View photo ${i + 1}: ${f.name}`}
              >
                <img
                  src={f.objectUrl ?? URL.createObjectURL(f.blob)}
                  alt={f.name}
                  class="received-grid-img"
                />
              </button>
            ))}
          </div>
        </div>

        {/* Bottom actions */}
        <div class="received-footer">
          <Button
            variant="primary"
            label="Save to gallery"
            onClick={handleSaveClick}
          />
          <Button
            variant="secondary"
            label="Download as ZIP"
            onClick={onDownloadZip}
          />
          <p class="received-footnote">
            Photos live only on this page until you save them
          </p>
        </div>
      </div>

      {/* Native-style fullscreen photo preview modal */}
      {previewIndex !== null && (
        <PhotoPreviewModal
          files={files}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}
