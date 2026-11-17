/**
 * useFlick — Pointer Events hook for the flick-to-send gesture.
 *
 * Uses Pointer Events with pointer capture for unified touch/mouse/trackpad.
 * Calls decideFlick on release to commit or cancel.
 */

import { useRef, useCallback, useState } from 'preact/hooks';
import {
  decideFlick,
  ROTATION_FACTOR,
  ROTATION_CLAMP,
  CANCEL_DURATION,
  COMMIT_DURATION,
  SPRING_EASING,
  STAGGER_DELAY,
} from './motion';

export type FlickState = 'idle' | 'dragging' | 'committed' | 'cancelling';

interface FlickResult {
  /** Props to spread on the draggable element */
  bind: {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: (e: PointerEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
  };
  /** Current drag offset Y (negative = up) */
  dy: number;
  /** Current drag offset X */
  dx: number;
  /** Current state */
  flickState: FlickState;
}

interface UseFlickOptions {
  /** Called when the flick commits */
  onCommit: () => void;
  /** Whether the gesture is enabled */
  enabled: boolean;
  /** Number of cards for stagger */
  cardCount?: number;
}

export function useFlick({ onCommit, enabled, cardCount = 3 }: UseFlickOptions): FlickResult {
  const [flickState, setFlickState] = useState<FlickState>('idle');
  const [dy, setDy] = useState(0);
  const [dx, setDx] = useState(0);

  const startY = useRef(0);
  const startX = useRef(0);
  const lastY = useRef(0);
  const lastTime = useRef(0);
  const velocityY = useRef(0);
  const pointerId = useRef<number | null>(null);
  const committed = useRef(false);
  const stageRef = useRef<HTMLElement | null>(null);

  const onPointerDown = useCallback((e: PointerEvent) => {
    if (!enabled || committed.current || flickState === 'committed') return;

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    pointerId.current = e.pointerId;
    stageRef.current = target.closest('.flick-ready__stage') as HTMLElement ?? target.parentElement;

    startY.current = e.clientY;
    startX.current = e.clientX;
    lastY.current = e.clientY;
    lastTime.current = e.timeStamp;
    velocityY.current = 0;

    setFlickState('dragging');
    setDy(0);
    setDx(0);

    // Apply will-change while animating
    target.style.willChange = 'transform';
  }, [enabled, flickState]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (pointerId.current !== e.pointerId || flickState !== 'dragging') return;

    const currentDy = e.clientY - startY.current;
    const currentDx = e.clientX - startX.current;

    // Calculate velocity (px/ms)
    const dt = e.timeStamp - lastTime.current;
    if (dt > 0) {
      velocityY.current = (e.clientY - lastY.current) / dt;
    }
    lastY.current = e.clientY;
    lastTime.current = e.timeStamp;

    // Only allow upward drag for visual feedback
    setDy(Math.min(0, currentDy));
    setDx(currentDx);
  }, [flickState]);

  const doCommit = useCallback((target: HTMLElement) => {
    if (committed.current) return;
    committed.current = true;
    setFlickState('committed');
    setDy(0);
    setDx(0);

    // Haptic feedback on commit
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }

    // Start transfer immediately
    onCommit();

    // Animate cards out (staggered)
    const cards = target.querySelectorAll<HTMLElement>('.flick-stack__card');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    cards.forEach((card, i) => {
      if (reducedMotion) {
        card.style.opacity = '0';
        return;
      }
      const rotation = (Math.random() - 0.5) * 10;
      card.animate([
        { transform: card.style.transform || 'none', opacity: '1' },
        { transform: `translateY(-120vh) rotate(${rotation}deg)`, opacity: '0.8' },
      ], {
        duration: COMMIT_DURATION,
        delay: i * STAGGER_DELAY,
        easing: SPRING_EASING,
        fill: 'forwards',
      });
    });

    // Clean up will-change after animation
    setTimeout(() => {
      target.style.willChange = '';
    }, COMMIT_DURATION + (cardCount * STAGGER_DELAY));
  }, [onCommit, cardCount]);

  const onPointerUp = useCallback((e: PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;

    const target = e.currentTarget as HTMLElement;
    const currentDy = e.clientY - startY.current;
    const stageHeight = stageRef.current?.clientHeight ?? window.innerHeight;

    if (flickState === 'dragging') {
      const shouldCommit = decideFlick(currentDy, velocityY.current, stageHeight);

      if (shouldCommit) {
        doCommit(target);
      } else {
        // Spring back
        setFlickState('cancelling');
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (!reducedMotion) {
          target.animate([
            { transform: `translateY(${Math.min(0, currentDy)}px)` },
            { transform: 'translateY(0)' },
          ], {
            duration: CANCEL_DURATION,
            easing: SPRING_EASING,
            fill: 'forwards',
          });
        }

        setDy(0);
        setDx(0);
        setTimeout(() => {
          setFlickState('idle');
          target.style.willChange = '';
        }, CANCEL_DURATION);
      }
    }
  }, [flickState, doCommit]);

  const onPointerCancel = useCallback((e: PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;

    setDy(0);
    setDx(0);
    setFlickState('idle');

    const target = e.currentTarget as HTMLElement;
    target.style.willChange = '';
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled || committed.current) return;

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      doCommit(target);
    }
  }, [enabled, doCommit]);

  return {
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onKeyDown,
    },
    dy,
    dx,
    flickState,
  };
}
