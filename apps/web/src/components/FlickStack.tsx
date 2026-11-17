/**
 * FlickStack — Signature Flick-to-Send gesture and card stack visual
 *
 * Implements:
 * - 3-card angled stack layout with real thumbnails
 * - Pointer events drag with pointer capture
 * - Fanning out and rotation while dragging
 * - Velocity + drag distance commit via decideFlick
 * - Staggered launch animation (Web Animations API)
 * - Spring back animation on cancel
 * - Keyboard accessibility (Enter, Space, ArrowUp)
 * - Strict CSP: no inline style attributes in markup; uses element.style in script.
 */

import { JSX } from 'preact';
import { useRef, useCallback, useEffect } from 'preact/hooks';
import {
  decideFlick,
  ROTATION_FACTOR,
  ROTATION_CLAMP,
  COMMIT_DURATION,
  CANCEL_DURATION,
  SPRING_EASING,
  STAGGER_DELAY,
  HAPTIC_COMMIT,
} from '../lib/motion';
import './FlickStack.css';

interface FlickStackProps {
  thumbnails: string[];
  totalCount: number;
  onCommit: () => void;
  onDragProgress?: (progress: number) => void;
  disabled?: boolean;
}

export function FlickStack({
  thumbnails,
  totalCount,
  onCommit,
  onDragProgress,
  disabled = false,
}: FlickStackProps): JSX.Element {
  const stackRef = useRef<HTMLDivElement>(null);
  const cardBackRef = useRef<HTMLDivElement>(null);
  const cardMidRef = useRef<HTMLDivElement>(null);
  const cardFrontRef = useRef<HTMLDivElement>(null);

  const startY = useRef(0);
  const startX = useRef(0);
  const lastY = useRef(0);
  const lastTime = useRef(0);
  const velocityY = useRef(0);
  const isDragging = useRef(false);
  const isCommitted = useRef(false);
  const pointerId = useRef<number | null>(null);

  // Cards display slice: up to 3 thumbnails
  const displayThumbs: string[] = [];
  if (thumbnails.length >= 3) {
    if (thumbnails[2]) displayThumbs.push(thumbnails[2]);
    if (thumbnails[1]) displayThumbs.push(thumbnails[1]);
    if (thumbnails[0]) displayThumbs.push(thumbnails[0]);
  } else if (thumbnails.length === 2) {
    if (thumbnails[1]) displayThumbs.push(thumbnails[1]);
    if (thumbnails[0]) displayThumbs.push(thumbnails[0]);
  } else if (thumbnails.length === 1 && thumbnails[0]) {
    displayThumbs.push(thumbnails[0]);
  }

  // Trigger commit animation and callback
  const triggerCommit = useCallback(() => {
    if (isCommitted.current) return;
    isCommitted.current = true;

    // Haptic feedback on Android if supported
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(HAPTIC_COMMIT);
      } catch {
        /* ignore */
      }
    }

    // Call commit immediately
    onCommit();

    const stack = stackRef.current;
    if (!stack) return;

    const cards = stack.querySelectorAll<HTMLElement>('.flick-stack__card');
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      cards.forEach((card) => {
        card.style.opacity = '0';
      });
      return;
    }

    // Staggered launch animation
    cards.forEach((card, idx) => {
      card.style.willChange = 'transform, opacity';
      const rot = idx === 0 ? -12 : idx === 1 ? 10 : -4;
      const anim = card.animate(
        [
          { transform: card.style.transform || 'none', opacity: '1' },
          { transform: `translateY(-120vh) rotate(${rot}deg)`, opacity: '0.7' },
        ],
        {
          duration: COMMIT_DURATION,
          delay: (cards.length - 1 - idx) * STAGGER_DELAY,
          easing: SPRING_EASING,
          fill: 'forwards',
        }
      );
      anim.onfinish = () => {
        card.style.willChange = '';
      };
    });
  }, [onCommit]);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (disabled || isCommitted.current) return;
      const stack = stackRef.current;
      if (!stack) return;

      try {
        stack.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      pointerId.current = e.pointerId;
      isDragging.current = true;
      startY.current = e.clientY;
      startX.current = e.clientX;
      lastY.current = e.clientY;
      lastTime.current = e.timeStamp;
      velocityY.current = 0;

      stack.style.willChange = 'transform';
    },
    [disabled]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDragging.current || pointerId.current !== e.pointerId) return;
      const stack = stackRef.current;
      if (!stack) return;

      const rawDy = e.clientY - startY.current;
      const dx = e.clientX - startX.current;

      // Only allow upward drag (dy <= 0)
      const dy = Math.min(0, rawDy);

      // Velocity calculation (px/ms)
      const dt = e.timeStamp - lastTime.current;
      if (dt > 0) {
        velocityY.current = (e.clientY - lastY.current) / dt;
      }
      lastY.current = e.clientY;
      lastTime.current = e.timeStamp;

      // Horizontal tilt
      const rot = Math.max(-ROTATION_CLAMP, Math.min(ROTATION_CLAMP, dx * ROTATION_FACTOR));

      // Apply transform to stack container
      stack.style.transform = `translateY(${dy}px) rotate(${rot}deg)`;

      // Fanning out effect on cards
      const fanRatio = Math.min(1, Math.abs(dy) / 120);
      if (cardBackRef.current) {
        const backRot = -8 - fanRatio * 4;
        cardBackRef.current.style.transform = `rotate(${backRot}deg) translateX(${-fanRatio * 6}px)`;
      }
      if (cardMidRef.current) {
        const midRot = 7 + fanRatio * 4;
        cardMidRef.current.style.transform = `rotate(${midRot}deg) translateX(${fanRatio * 6}px)`;
      }

      // Drag progress for fading hints
      if (onDragProgress) {
        const progress = Math.min(1, Math.abs(dy) / 120);
        onDragProgress(progress);
      }
    },
    [onDragProgress]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (!isDragging.current || pointerId.current !== e.pointerId) return;
      isDragging.current = false;
      pointerId.current = null;

      const stack = stackRef.current;
      if (!stack) return;

      try {
        stack.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const dy = Math.min(0, e.clientY - startY.current);
      const stageHeight = stack.parentElement?.clientHeight || window.innerHeight;

      const shouldCommit = decideFlick(dy, velocityY.current, stageHeight);

      if (shouldCommit) {
        triggerCommit();
      } else {
        // Cancel: spring back to origin
        const reducedMotion =
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (onDragProgress) {
          onDragProgress(0);
        }

        if (reducedMotion) {
          stack.style.transform = '';
          stack.style.willChange = '';
          if (cardBackRef.current) cardBackRef.current.style.transform = '';
          if (cardMidRef.current) cardMidRef.current.style.transform = '';
          return;
        }

        const anim = stack.animate(
          [{ transform: stack.style.transform }, { transform: 'translateY(0px) rotate(0deg)' }],
          {
            duration: CANCEL_DURATION,
            easing: SPRING_EASING,
            fill: 'forwards',
          }
        );

        anim.onfinish = () => {
          stack.style.transform = '';
          stack.style.willChange = '';
          if (cardBackRef.current) cardBackRef.current.style.transform = '';
          if (cardMidRef.current) cardMidRef.current.style.transform = '';
        };
      }
    },
    [triggerCommit, onDragProgress]
  );

  const handlePointerCancel = useCallback(
    (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      isDragging.current = false;
      pointerId.current = null;

      const stack = stackRef.current;
      if (stack) {
        try {
          stack.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        stack.style.transform = '';
        stack.style.willChange = '';
        if (cardBackRef.current) cardBackRef.current.style.transform = '';
        if (cardMidRef.current) cardMidRef.current.style.transform = '';
      }
      if (onDragProgress) {
        onDragProgress(0);
      }
    },
    [onDragProgress]
  );

  // Keyboard accessibility
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled || isCommitted.current) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        triggerCommit();
      }
    },
    [disabled, triggerCommit]
  );

  // Clean up pointer captures if unmounted
  useEffect(() => {
    return () => {
      isDragging.current = false;
      isCommitted.current = false;
    };
  }, []);

  const labelText = `Send ${totalCount} photo${totalCount !== 1 ? 's' : ''}. Flick up, or press Enter`;
  const countPillText = `${totalCount} photo${totalCount !== 1 ? 's' : ''}`;

  return (
    <div class="flick-stack-wrapper">
      <div
        ref={stackRef}
        class="flick-stack"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={labelText}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
      >
        {/* Back card (if >= 3 files) */}
        {displayThumbs.length >= 3 && (
          <div ref={cardBackRef} class="flick-stack__card flick-stack__card--back">
            <img class="flick-stack__img" src={displayThumbs[0]} alt="" />
          </div>
        )}

        {/* Middle card (if >= 2 files) */}
        {displayThumbs.length >= 2 && (
          <div
            ref={cardMidRef}
            class="flick-stack__card flick-stack__card--middle"
          >
            <img
              class="flick-stack__img"
              src={displayThumbs.length >= 3 ? displayThumbs[1] : displayThumbs[0]}
              alt=""
            />
          </div>
        )}

        {/* Front card (always visible) */}
        <div ref={cardFrontRef} class="flick-stack__card flick-stack__card--front">
          <img
            class="flick-stack__img"
            src={displayThumbs[displayThumbs.length - 1]}
            alt=""
          />
          <div class="flick-stack__pill">{countPillText}</div>
        </div>
      </div>
    </div>
  );
}
