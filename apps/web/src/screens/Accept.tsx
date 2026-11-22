/**
 * Accept — Dark-theme screen showing incoming file manifest.
 * Shows first 5 file rows + "and X more". Accept (lime) + Decline (secondary).
 */
import { JSX } from 'preact';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { FileRow } from '../components/FileRow';
import type { FileInfo } from '../session/types';
import './Accept.css';

interface AcceptProps {
  files: FileInfo[];
  totalSize: number;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Accept({ files, totalSize, onAccept, onDecline, onClose }: AcceptProps) {
  const count = files.length;
  const displayFiles = files.slice(0, 5);
  const remaining = count - 5;

  return (
    <div class="screen-page accept-root" data-theme="dark">
      <div class="screen-container">
        <Header mode="close" onBack={onClose} />

        <div class="accept-content">
          <h1 class="accept-title">{count} photos incoming</h1>
          <p class="accept-subtitle">{formatSize(totalSize)} from the sender</p>

          <div class="accept-file-list">
            {displayFiles.map((f, i) => (
              <FileRow key={i} name={f.name} size={f.size} />
            ))}
            {remaining > 0 && (
              <p class="accept-more">and {remaining} more</p>
            )}
          </div>
        </div>

        <div class="accept-footer">
          <Button variant="primary" label="Accept" onClick={onAccept} />
          <Button variant="secondary" label="Decline" onClick={onDecline} />
        </div>
      </div>
    </div>
  );
}
