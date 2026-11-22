import { useRef } from 'preact/hooks';
import { Header, Button, PhotoTile } from '../components';
import './PickPhotos.css';

interface PickPhotosProps {
  files: File[];
  thumbnails: string[];
  onGetCode: () => void;
  onRemoveFile: (index: number) => void;
  onAddMore: (files: File[]) => void;
  onClear: () => void;
  onBack: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PickPhotos({
  files,
  thumbnails,
  onGetCode,
  onRemoveFile,
  onAddMore,
  onClear,
  onBack,
}: PickPhotosProps) {
  const addInputRef = useRef<HTMLInputElement>(null);

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const sizeLabel = formatSize(totalBytes);
  const count = files.length;

  function handleAddMore() {
    addInputRef.current?.click();
  }

  function handleAddFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const newFiles = input.files ? Array.from(input.files) : [];
    if (newFiles.length > 0) {
      onAddMore(newFiles);
    }
    input.value = '';
  }

  return (
    <div class="screen-page pickphotos-root" data-theme="light">
      <div class="screen-container">
        {/* Hidden add-more input */}
        <input
          ref={addInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          class="pickphotos-hidden-input"
          onChange={handleAddFileChange}
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* Top bar */}
        <Header
          mode="back"
          onBack={onBack}
          rightAction={count > 0 ? 'Clear' : undefined}
          onRightAction={onClear}
        />

        {/* Title area */}
        <div class="pickphotos-title-area">
          <h1 class="pickphotos-title">{count} photos</h1>
          <p class="pickphotos-subtitle">{sizeLabel} · Original quality</p>
        </div>

        {/* Photo grid: flex:1, 3 columns, gap 6, scrolling */}
        <div class="pickphotos-grid-area">
          <div class="pickphotos-grid" role="list" aria-label="Selected photos">
            {thumbnails.map((src, i) => (
              <div key={i} class="pickphotos-grid-item" role="listitem">
                <PhotoTile
                  src={src}
                  alt={files[i]?.name ?? `Photo ${i + 1}`}
                  onRemove={() => onRemoveFile(i)}
                />
              </div>
            ))}
            {/* Add tile */}
            <div class="pickphotos-grid-item" role="listitem">
              <button
                type="button"
                class="pickphotos-add-tile"
                onClick={handleAddMore}
                aria-label="Add more photos"
              >
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                  <path
                    d="M14 6v16M6 14h16"
                    stroke="currentColor"
                    stroke-width="2.4"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div class="pickphotos-footer">
          <Button
            variant="primary"
            label="Get code"
            onClick={onGetCode}
            disabled={count === 0}
          />
        </div>
      </div>
    </div>
  );
}
