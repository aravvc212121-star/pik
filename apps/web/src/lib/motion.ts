/**
 * PicBeam Flick-to-Throw — animation constants and helpers
 * All timings, easings, and thresholds in one place.
 */

// ── Easings ──
export const SPRING_EASING = 'cubic-bezier(.2,.7,.2,1)';

// ── Durations (ms) ──
export const COMMIT_DURATION = 450;
export const CANCEL_DURATION = 220;
export const LANDING_DURATION = 280;
export const STAGGER_DELAY = 40;
export const DONE_PAUSE = 600;

// ── Flick thresholds ──
export const DRAG_COMMIT_PX = 120;
export const DRAG_COMMIT_RATIO = 0.35; // fraction of stage height
export const VELOCITY_COMMIT = 0.6; // px/ms
export const VELOCITY_MIN_DRAG = 40; // px minimum drag for velocity commit
export const ROTATION_FACTOR = 0.05; // deg per px of horizontal movement
export const ROTATION_CLAMP = 10; // max degrees of rotation

// ── Card stack layout ──
export const STACK_WIDTH = 240;
export const STACK_HEIGHT = 300;
export const CARD_WIDTH = 200;
export const CARD_HEIGHT = 262;
export const CARD_BORDER = 6;
export const CARD_RADIUS = 20;

// Cards in the stack: [back, middle, front]
export const STACK_CARDS = [
  { rotate: -8, offsetX: 10, offsetY: 24 },
  { rotate: 7, offsetX: 30, offsetY: 18 },
  { rotate: 0, offsetX: 20, offsetY: 10 },
] as const;

// ── Flight ──
export const FLIGHT_TARGET_VH = -120; // vh
export const MAX_CONCURRENT_ANIMATIONS = 4;
export const BATCH_AFTER_COUNT = 24;

// ── Catch tray ──
export const TRAY_COLUMNS = 4;
export const TRAY_GAP = 8;
export const TRAY_SLOT_RADIUS = 12;
export const LANDING_OVERSHOOT = 6; // px

// ── Haptics ──
export const HAPTIC_COMMIT = 10; // ms
export const HAPTIC_LANDING = 8; // ms
export const HAPTIC_LANDING_THROTTLE = 120; // ms between landing vibrations
export const HAPTIC_COMPLETE = 30; // ms

// ── Idle ──
export const IDLE_WARNING_MS = 2 * 60 * 1000; // 2 minutes

// ── Thumbnail ──
export const THUMB_SIZE = 320; // px target dimension

/**
 * Pure function: decide whether a flick gesture commits the send.
 *
 * @param dy   - vertical drag distance (negative = upward)
 * @param vy   - vertical velocity in px/ms (negative = upward)
 * @param stageHeight - height of the stage container in px
 * @returns true to commit (send), false to cancel (spring back)
 */
export function decideFlick(dy: number, vy: number, stageHeight: number): boolean {
  // Only upward drags count
  if (dy >= 0) return false;

  const absDy = Math.abs(dy);
  const absVy = Math.abs(vy);

  // Long drag: commit
  if (absDy >= DRAG_COMMIT_PX) return true;
  if (absDy >= stageHeight * DRAG_COMMIT_RATIO) return true;

  // Fast short flick: commit
  if (absVy >= VELOCITY_COMMIT && absDy >= VELOCITY_MIN_DRAG) return true;

  return false;
}
