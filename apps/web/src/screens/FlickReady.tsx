/**
 * FlickReady screen (Sender state 1)
 *
 * Appears when the receiver has accepted.
 * Displays the 3-card stack ready to be flicked upward.
 */

import { JSX } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { StatusPill } from '../components/StatusPill';
import { Button } from '../components/Button';
import { FlickChevrons } from '../components/Icons';
import { FlickStack } from '../components/FlickStack';
import { formatBytes } from '../lib/state';
import { IDLE_WARNING_MS } from '../lib/motion';
import './FlickReady.css';

interface FlickReadyProps {
  files: File[];
  thumbnails: string[];
  onCommit: () => void;
  onCancel: () => void;
}

export function FlickReady({
  files,
  thumbnails,
  onCommit,
  onCancel,
}: FlickReadyProps): JSX.Element {
  const [isIdle, setIsIdle] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  // 2-minute inactivity timer
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsIdle(true);
    }, IDLE_WARNING_MS);

    return () => clearTimeout(timer);
  }, []);

  // Fade hint block as stack rises during drag
  const handleDragProgress = useCallback((progress: number) => {
    if (hintRef.current) {
      hintRef.current.style.opacity = String(Math.max(0, 1 - progress * 1.5));
    }
  }, []);

  return (
    <div class="flick-ready">
      {/* Status pill */}
      <div class="flick-ready__pill-wrap">
        <StatusPill status="connected" text="Receiver accepted" />
      </div>

      {/* 2-min Idle Warning Banner if inactive */}
      {isIdle && (
        <div class="flick-ready__idle-banner" role="alert">
          <span class="flick-ready__idle-text">Still there? Flick to send or cancel</span>
          <button
            type="button"
            class="flick-ready__idle-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Hint block */}
      <div ref={hintRef} class="flick-ready__hint-block">
        <FlickChevrons />
        <h2 class="flick-ready__title">Flick up to send</h2>
        <p class="flick-ready__subtitle">
          Swipe the photos off the top of your screen
        </p>
      </div>

      {/* Flick Stage with Stack */}
      <div class="flick-ready__stage">
        <FlickStack
          thumbnails={thumbnails}
          totalCount={files.length}
          onCommit={onCommit}
          onDragProgress={handleDragProgress}
        />
      </div>

      {/* Footer */}
      <div class="flick-ready__footer">
        <div class="flick-ready__meta">
          {formatBytes(totalBytes)} · Original quality
        </div>

        <Button variant="secondary" onClick={onCommit}>
          Tap to send instead
        </Button>
      </div>
    </div>
  );
}
