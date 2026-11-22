/**
 * FileRow — Accept screen file rows.
 * 44×44 square (radius 14) surface bg with 20px picture glyph in muted.
 * File name 16px/500, size 13px muted. No thumbnails.
 */
import { JSX } from 'preact';
import { Picture } from './Icons';
import './FileRow.css';

interface FileRowProps {
  name: string;
  size: number;
  class?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileRow({ name, size, class: className = '' }: FileRowProps): JSX.Element {
  return (
    <div class={`file-row ${className}`.trim()}>
      <div class="file-row__icon" aria-hidden="true">
        <Picture size={20} />
      </div>
      <div class="file-row__info">
        <span class="file-row__name" title={name}>{name}</span>
        <span class="file-row__size">{formatFileSize(size)}</span>
      </div>
    </div>
  );
}
