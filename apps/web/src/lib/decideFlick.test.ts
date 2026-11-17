/**
 * Unit tests for decideFlick — the pure function that decides commit vs cancel.
 */
import { describe, it, expect } from 'vitest';
import { decideFlick } from './motion';

describe('decideFlick', () => {
  const stageHeight = 600;

  it('cancels on a short upward drag (below threshold)', () => {
    // -50px drag, slow velocity — should cancel
    expect(decideFlick(-50, -0.2, stageHeight)).toBe(false);
  });

  it('commits on a long upward drag (>= 120px)', () => {
    expect(decideFlick(-120, -0.1, stageHeight)).toBe(true);
    expect(decideFlick(-200, -0.1, stageHeight)).toBe(true);
  });

  it('commits when drag >= 35% of stage height on smaller screens', () => {
    const smallHeight = 200;
    const threshold = smallHeight * 0.35; // 70px
    expect(decideFlick(-threshold, -0.1, smallHeight)).toBe(true);
    expect(decideFlick(-(threshold - 1), -0.1, smallHeight)).toBe(false);
  });

  it('commits on a fast short flick (velocity >= 0.6 px/ms, drag >= 40px)', () => {
    expect(decideFlick(-50, -0.8, stageHeight)).toBe(true);
    expect(decideFlick(-40, -0.6, stageHeight)).toBe(true);
  });

  it('cancels fast flick if drag < 40px', () => {
    expect(decideFlick(-30, -1.0, stageHeight)).toBe(false);
    expect(decideFlick(-39, -0.8, stageHeight)).toBe(false);
  });

  it('ignores downward drags completely', () => {
    // Positive dy = downward
    expect(decideFlick(200, -1.0, stageHeight)).toBe(false);
    expect(decideFlick(50, -0.8, stageHeight)).toBe(false);
    expect(decideFlick(0, -0.8, stageHeight)).toBe(false);
  });

  it('handles exact threshold: dy = -120, velocity = 0', () => {
    expect(decideFlick(-120, 0, stageHeight)).toBe(true);
  });

  it('handles exact threshold: velocity = 0.6, drag = 40', () => {
    expect(decideFlick(-40, -0.6, stageHeight)).toBe(true);
  });

  it('cancels just below velocity threshold with min drag', () => {
    expect(decideFlick(-40, -0.59, stageHeight)).toBe(false);
  });

  it('cancels with no movement', () => {
    expect(decideFlick(0, 0, stageHeight)).toBe(false);
  });

  it('works with a small stage (threshold < 120px via ratio)', () => {
    const smallStage = 300;
    // 35% of 300 = 105, less than 120px absolute
    expect(decideFlick(-105, -0.1, smallStage)).toBe(true);
    expect(decideFlick(-104, -0.1, smallStage)).toBe(false);
  });
});
