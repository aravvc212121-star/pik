/**
 * FlickToThrow — Light-theme flick-to-send screen.
 * Integrates useFlick for drag gesture; "Tap to send instead" fallback.
 */
import { JSX } from 'preact';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { useFlick } from '../lib/useFlick';
import { ROTATION_FACTOR, ROTATION_CLAMP } from '../lib/motion';
import './FlickToThrow.css';

interface FlickToThrowProps {
  files: File[];
  thumbnails: string[];
  totalSize: number;
  onCommit: () => void;
  onCancel: () => void;
  enabled?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FlickToThrow({
  files,
  thumbnails,
  totalSize,
  onCommit,
  onCancel,
  enabled = true,
}: FlickToThrowProps) {
  const count = files.length;
  const countText = `${count} ${count === 1 ? 'photo' : 'photos'} · ${formatSize(totalSize)}`;

  const { bind, dy, dx, flickState } = useFlick({
    onCommit,
    enabled,
    cardCount: 3,
  });

  // Calculate transforms based on drag
  const rotation = Math.max(-ROTATION_CLAMP, Math.min(ROTATION_CLAMP, dx * ROTATION_FACTOR));
  const dragTransform = flickState === 'dragging'
    ? `translateY(${dy}px) rotate(${rotation}deg)`
    : '';

  // Fade chevrons and guide as stack rises
  const dragProgress = flickState === 'dragging' ? Math.min(1, Math.abs(dy) / 200) : 0;
  const guideFade = 1 - dragProgress;

  // Thumbnails for stack cards
  const frontThumb = thumbnails[0];
  const midThumb = thumbnails[1] ?? thumbnails[0];
  const backThumb = thumbnails[2] ?? thumbnails[1] ?? thumbnails[0];

  return (
    <div class="screen-page flick-root" data-theme="light">
      <div class="screen-container">
        <Header mode="close" onBack={onCancel} />

        <div class="flick-title-area">
          <h1 class="flick-title">Flick up to send.</h1>
          <p class="flick-subtitle">{countText}</p>
        </div>

        <div class="flick-action-area flick-ready__stage">
          {/* Chevron arrows */}
          <div
            class="flick-chevrons"
            aria-hidden="true"
            style={`opacity:${guideFade}`}
          >
            <svg class="flick-chevron flick-chevron--top" width="28" height="16" viewBox="0 0 28 16" fill="none">
              <path d="M4 12L14 4L24 12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <svg class="flick-chevron flick-chevron--mid" width="28" height="16" viewBox="0 0 28 16" fill="none">
              <path d="M4 12L14 4L24 12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <svg class="flick-chevron flick-chevron--bot" width="28" height="16" viewBox="0 0 28 16" fill="none">
              <path d="M4 12L14 4L24 12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>

          {/* Vertical dashed guide */}
          <div
            class="flick-dashed-guide"
            aria-hidden="true"
            style={`opacity:${guideFade}`}
          />

          {/* Interactive card stack */}
          <div
            class="flick-stack-container flick-stack"
            role="button"
            tabIndex={0}
            aria-label={`Send ${count} photos. Flick up, or press Enter`}
            style={`touch-action:none;${dragTransform ? `transform:${dragTransform}` : ''}`}
            {...bind}
          >
            <div class="flick-card flick-card--back flick-stack__card">
              {backThumb ? (
                <img src={backThumb} alt="" class="flick-card-img" />
              ) : (
                <div class="flick-card-placeholder" />
              )}
            </div>

            <div class="flick-card flick-card--mid flick-stack__card">
              {midThumb ? (
                <img src={midThumb} alt="" class="flick-card-img" />
              ) : (
                <div class="flick-card-placeholder" />
              )}
            </div>

            <div class="flick-card flick-card--front flick-stack__card">
              {frontThumb ? (
                <img src={frontThumb} alt="" class="flick-card-img" />
              ) : (
                <div class="flick-card-placeholder" />
              )}
              {/* Lime photo count pill */}
              <div class="flick-card-pill" aria-hidden="true">
                {count} photos
              </div>
            </div>
          </div>

          <div class="flick-tap-instead">
            <Button
              variant="ghost"
              label="Tap to send instead"
              onClick={onCommit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
