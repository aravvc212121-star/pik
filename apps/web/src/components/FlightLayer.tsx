/**
 * FlightLayer — Manages sender's mid-flight thumbnail animations
 *
 * Implements:
 * - Real-time launches as files finish sending
 * - Motion budget: max 4 concurrent animations
 * - Max 24 animated files (batch mode after 24)
 * - Faint ink trail beneath each card
 * - Reduced motion support (skips animations)
 */

import { JSX } from 'preact';
import { useRef, useEffect } from 'preact/hooks';
import {
  MAX_CONCURRENT_ANIMATIONS,
  BATCH_AFTER_COUNT,
  SPRING_EASING,
} from '../lib/motion';
import './FlightLayer.css';

interface FlightLayerProps {
  thumbnails: string[];
  sentCount: number;
  totalFiles: number;
}

export function FlightLayer({
  thumbnails,
  sentCount,
  totalFiles,
}: FlightLayerProps): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const activeCountRef = useRef(0);
  const queueRef = useRef<number[]>([]);
  const lastProcessedRef = useRef(0);

  // Function to launch a single card
  const launchCard = (fileIndex: number) => {
    const stage = stageRef.current;
    if (!stage) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    activeCountRef.current++;

    const thumbUrl = thumbnails[fileIndex % thumbnails.length] || '';

    // Create container
    const container = document.createElement('div');
    container.className = 'flight-card-container';

    // Card with thumbnail
    const card = document.createElement('div');
    card.className = 'flight-card';

    if (thumbUrl) {
      const img = document.createElement('img');
      img.className = 'flight-card__img';
      img.src = thumbUrl;
      img.alt = '';
      card.appendChild(img);
    }

    // Faint 4px trail
    const trail = document.createElement('div');
    trail.className = 'flight-trail';

    container.appendChild(card);
    container.appendChild(trail);
    stage.appendChild(container);

    const randomRot = -8 + Math.random() * 15; // -8 to 7 deg
    const randomOffsetX = (Math.random() - 0.5) * 80; // slight horizontal spread

    container.style.willChange = 'transform, opacity';

    const anim = container.animate(
      [
        {
          transform: `translate(0px, 0px) rotate(0deg) scale(0.95)`,
          opacity: '1',
        },
        {
          transform: `translate(${randomOffsetX * 0.5}px, -180px) rotate(${randomRot * 0.5}deg) scale(1)`,
          opacity: '1',
          offset: 0.5,
        },
        {
          transform: `translate(${randomOffsetX}px, -450px) rotate(${randomRot}deg) scale(0.9)`,
          opacity: '0.2',
        },
      ],
      {
        duration: 850,
        easing: SPRING_EASING,
        fill: 'forwards',
      }
    );

    anim.onfinish = () => {
      container.remove();
      activeCountRef.current = Math.max(0, activeCountRef.current - 1);
      // Process next queued launch
      if (queueRef.current.length > 0) {
        const nextIndex = queueRef.current.shift()!;
        launchCard(nextIndex);
      }
    };
  };

  useEffect(() => {
    // When sentCount increments
    if (sentCount > lastProcessedRef.current) {
      for (let i = lastProcessedRef.current; i < sentCount; i++) {
        if (i < BATCH_AFTER_COUNT) {
          if (activeCountRef.current < MAX_CONCURRENT_ANIMATIONS) {
            launchCard(i);
          } else {
            queueRef.current.push(i);
          }
        }
      }
      lastProcessedRef.current = sentCount;
    }
  }, [sentCount, thumbnails]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      queueRef.current = [];
      activeCountRef.current = 0;
    };
  }, []);

  const waitingThumbIndex = Math.min(sentCount, thumbnails.length - 1);
  const waitingThumb = thumbnails[waitingThumbIndex] || thumbnails[0];
  const hasRemaining = sentCount < totalFiles;

  return (
    <div ref={stageRef} class="flight-stage" aria-hidden="true">
      {/* Waiting card at bottom if transfer is still ongoing */}
      {hasRemaining && waitingThumb && (
        <div class="flight-stage__waiting-card">
          <img class="flight-stage__waiting-img" src={waitingThumb} alt="" />
        </div>
      )}
    </div>
  );
}
