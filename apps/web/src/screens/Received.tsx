/**
 * Received — Dark-theme completion screen.
 * Check mark, count, 4-column thumbnail grid,
 * Save to gallery (lime), Download as ZIP, footnote.
 */
import { JSX } from 'preact';
import { CheckMark } from '../components/CheckMark';
import { Button } from '../components/Button';
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
  const count = files.length;

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

          {/* Thumbnail grid */}
          <div class="received-grid">
            {files.map((f, i) => (
              <div key={i} class="received-grid-item">
                <img
                  src={f.objectUrl ?? URL.createObjectURL(f.blob)}
                  alt={f.name}
                  class="received-grid-img"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom actions */}
        <div class="received-footer">
          <Button
            variant="primary"
            label="Save to gallery"
            onClick={onSaveGallery}
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
    </div>
  );
}
