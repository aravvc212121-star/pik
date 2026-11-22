/**
 * PhotoTile — Square thumbnail with 18px radius.
 * - Standard: 18px radius, object-fit cover, optional 24px ink circle with white × at top 8 / right 8 (44px hit area)
 * - Add tile: 1.5px dashed border, 26px + icon
 */
import { JSX } from 'preact';
import { Plus } from './Icons';
import './PhotoTile.css';

interface PhotoTileProps {
  src?: string;
  alt?: string;
  onRemove?: () => void;
  isAdd?: boolean;
  onAdd?: () => void;
  class?: string;
}

export function PhotoTile({
  src,
  alt = 'Selected photo',
  onRemove,
  isAdd = false,
  onAdd,
  class: className = '',
}: PhotoTileProps): JSX.Element {
  if (isAdd) {
    return (
      <button
        type="button"
        class={`photo-tile photo-tile--add ${className}`.trim()}
        onClick={onAdd}
        aria-label="Add more photos"
      >
        <Plus size={26} />
      </button>
    );
  }

  return (
    <div class={`photo-tile ${className}`.trim()}>
      {src && <img src={src} alt={alt} class="photo-tile__img" />}
      {onRemove && (
        <button
          type="button"
          class="photo-tile__remove-btn"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove photo"
        >
          <span class="photo-tile__remove-badge" aria-hidden="true">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M2 2l7 7M9 2L2 9"
                stroke="#FFFFFF"
                stroke-width="3"
                stroke-linecap="round"
              />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}
