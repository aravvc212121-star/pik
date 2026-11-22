import { JSX } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { Button } from './Button';
import { IconButton } from './IconButton';
import './PhotoPreviewModal.css';

export interface PhotoPreviewItem {
  name: string;
  blob: Blob;
  mimeType?: string;
  objectUrl?: string;
}

export interface PhotoPreviewModalProps {
  files: PhotoPreviewItem[];
  initialIndex?: number;
  onClose: () => void;
  onSaveSingle?: (file: PhotoPreviewItem) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PhotoPreviewModal({
  files,
  initialIndex = 0,
  onClose,
  onSaveSingle,
}: PhotoPreviewModalProps): JSX.Element | null {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);

  const total = files.length;
  const current = files[currentIndex];

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < total - 1) setCurrentIndex(prev => prev + 1);
  }, [currentIndex, total]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'ArrowRight') handleNext();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, onClose]);

  // Touch swipe support
  function handleTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(e: TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) handlePrev();
      else handleNext();
    }
    touchStartX.current = null;
  }

  const handleSave = useCallback(async () => {
    if (!current) return;
    if (onSaveSingle) {
      onSaveSingle(current);
      return;
    }

    const mime = current.mimeType && current.mimeType.startsWith('image/') ? current.mimeType : 'image/jpeg';
    const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
    const name = current.name.includes('.') ? current.name : `${current.name}${ext}`;
    const file = new File([current.blob], name, { type: mime, lastModified: Date.now() });

    // Try native share sheet for direct saving to Camera Roll / Photos
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        if (!('canShare' in navigator) || navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: current.name,
          });
          return;
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }

    // Direct blob download fallback
    const url = URL.createObjectURL(current.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [current, onSaveSingle]);

  if (!current) return null;

  const imageUrl = current.objectUrl ?? URL.createObjectURL(current.blob);

  return (
    <div
      class="photo-preview-overlay"
      data-theme="dark"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="Photo Preview"
    >
      <div class="photo-preview-container">
        {/* Header bar */}
        <div class="photo-preview-header">
          <IconButton
            variant="default"
            icon="close"
            onClick={onClose}
            aria-label="Close preview"
          />
          <span class="photo-preview-counter">
            {total > 1 ? `${currentIndex + 1} of ${total}` : 'Photo'}
          </span>
          <span class="photo-preview-size">{formatSize(current.blob.size)}</span>
        </div>

        {/* Image viewport */}
        <div class="photo-preview-body">
          <img
            src={imageUrl}
            alt={current.name}
            class="photo-preview-img"
          />
        </div>

        {/* Bottom controls */}
        <div class="photo-preview-footer">
          {total > 1 && (
            <div class="photo-preview-nav">
              <button
                type="button"
                class="photo-preview-nav-btn"
                onClick={handlePrev}
                disabled={currentIndex === 0}
                aria-label="Previous photo"
              >
                ←
              </button>
              <span class="photo-preview-filename">{current.name}</span>
              <button
                type="button"
                class="photo-preview-nav-btn"
                onClick={handleNext}
                disabled={currentIndex === total - 1}
                aria-label="Next photo"
              >
                →
              </button>
            </div>
          )}

          <div class="photo-preview-actions">
            <Button
              variant="primary"
              label="Save to Photos"
              onClick={handleSave}
            />
          </div>

          <p class="photo-preview-hint">
            Touch and hold photo to save directly to Gallery
          </p>
        </div>
      </div>
    </div>
  );
}
