/**
 * Send — file picker / dropzone (initial screen)
 */
import { JSX } from 'preact';
import { useRef, useCallback, useState } from 'preact/hooks';
import { Button } from '../components/Button';
import './SendPick.css';

interface SendPickProps {
  onFilesSelected: (files: File[]) => void;
}

export function SendPick({ onFilesSelected }: SendPickProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      onFilesSelected(files);
    },
    [onFilesSelected]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer?.files ?? null);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  return (
    <div class="send-pick">
      <div
        class={`dropzone ${dragOver ? 'dropzone--active' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <h2 class="dropzone__title">Drop photos here</h2>
        <p class="dropzone__text">
          or pick them from your device. Originals only, no compression.
        </p>
        <Button
          variant="primary"
          onClick={() => inputRef.current?.click()}
        >
          Choose photos
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          class="dropzone__input"
          onChange={(e) => handleFiles((e.target as HTMLInputElement).files)}
          aria-label="Select photos and videos to send"
        />
      </div>

      <p class="send-pick__note">
        iPhone Safari may convert HEIC photos to JPEG when picked through a web page.
      </p>
    </div>
  );
}
