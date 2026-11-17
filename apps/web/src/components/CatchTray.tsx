/**
 * CatchTray — Receiver 4x3 slot grid with landing animations
 *
 * Implements:
 * - 4-column grid of square slots (dashed borders)
 * - Landing animation: 280ms with 6px overshoot bounce
 * - Falling cards from top stage with faint trails
 * - Auto-scroll to newest slot for >12 files
 * - Haptic vibration: vibrate(8) throttled to 120ms
 * - Reduced motion support
 */

import { JSX } from 'preact';
import { useRef, useEffect } from 'preact/hooks';
import {
  HAPTIC_LANDING,
  HAPTIC_LANDING_THROTTLE,
  BATCH_AFTER_COUNT,
  SPRING_EASING,
} from '../lib/motion';
import './CatchTray.css';

interface CatchTrayProps {
  totalFiles: number;
  receivedThumbnails: string[];
  isTransferring: boolean;
}

export function CatchTray({
  totalFiles,
  receivedThumbnails,
  isTransferring,
}: CatchTrayProps): JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastVibrateRef = useRef(0);
  const lastAnimatedCountRef = useRef(0);

  const slotCount = Math.max(12, totalFiles);
  const completedCount = receivedThumbnails.length;

  // Haptic feedback throttled
  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      const now = Date.now();
      if (now - lastVibrateRef.current >= HAPTIC_LANDING_THROTTLE) {
        lastVibrateRef.current = now;
        try {
          navigator.vibrate(HAPTIC_LANDING);
        } catch {
          /* ignore */
        }
      }
    }
  };

  // Falling cards in top stage
  useEffect(() => {
    if (!isTransferring) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    const stage = stageRef.current;
    if (!stage) return;

    // Periodically spawn a falling card in top area while transferring
    let active = true;
    const interval = setInterval(() => {
      if (!active || !stageRef.current) return;

      const container = document.createElement('div');
      container.className = 'catch-falling-card-container';

      const card = document.createElement('div');
      card.className = 'catch-falling-card';

      const trail = document.createElement('div');
      trail.className = 'catch-falling-trail';

      container.appendChild(card);
      container.appendChild(trail);
      stage.appendChild(container);

      const rot = Math.random() > 0.5 ? 8 : -6;
      const offsetX = (Math.random() - 0.5) * 120;

      container.style.left = `calc(50% + ${offsetX}px)`;
      container.style.willChange = 'transform, opacity';

      const anim = container.animate(
        [
          {
            transform: `translateY(0px) rotate(${rot}deg)`,
            opacity: '0.9',
          },
          {
            transform: `translateY(220px) rotate(${rot * 0.8}deg)`,
            opacity: '0.1',
          },
        ],
        {
          duration: 900,
          easing: SPRING_EASING,
          fill: 'forwards',
        }
      );

      anim.onfinish = () => {
        container.remove();
      };
    }, 1200);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isTransferring]);

  // Handle new landing
  useEffect(() => {
    if (completedCount > lastAnimatedCountRef.current) {
      triggerHaptic();

      // Auto-scroll grid to newest slot if needed
      if (gridRef.current && totalFiles > 12) {
        const nextSlotEl = gridRef.current.children[completedCount] as HTMLElement;
        if (nextSlotEl) {
          nextSlotEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      lastAnimatedCountRef.current = completedCount;
    }
  }, [completedCount, totalFiles]);

  const slots = Array.from({ length: slotCount }, (_, i) => i);

  return (
    <div class="catch-tray-container">
      {/* Top falling stage */}
      <div ref={stageRef} class="catch-falling-stage" aria-hidden="true" />

      {/* Tray Card */}
      <div class="catch-tray">
        <div ref={gridRef} class="catch-tray__grid">
          {slots.map((idx) => {
            const isFilled = idx < completedCount;
            const isNext = idx === completedCount;
            const isJustLanded =
              isFilled &&
              idx === completedCount - 1 &&
              completedCount <= BATCH_AFTER_COUNT;

            let slotClass = 'catch-slot';
            if (isFilled) {
              slotClass += ' catch-slot--filled';
              if (isJustLanded) slotClass += ' catch-slot--landing';
            } else if (isNext) {
              slotClass += ' catch-slot--next';
            } else {
              slotClass += ' catch-slot--empty';
            }

            return (
              <div key={idx} class={slotClass}>
                {isFilled && receivedThumbnails[idx] && (
                  <img
                    class="catch-slot__img"
                    src={receivedThumbnails[idx]}
                    alt=""
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
