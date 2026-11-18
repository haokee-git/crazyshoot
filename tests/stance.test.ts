import { describe, expect, it } from 'vitest';
import { LEAN_MAX_DEGREES, LEAN_RADIUS, leanArc, leanTarget } from '../src/game/player/stance';

describe('lean direction', () => {
  it('maps Q to left, E to right and both to upright', () => {
    expect(leanTarget(true, false, true)).toBe(-1);
    expect(leanTarget(false, true, true)).toBe(1);
    expect(leanTarget(true, true, true)).toBe(0);
    expect(leanTarget(false, false, true)).toBe(0);
  });

  it('ignores lean while prone, sprinting or otherwise disallowed', () => {
    expect(leanTarget(true, false, false)).toBe(0);
    expect(leanTarget(false, true, false)).toBe(0);
  });
});

describe('lean arc (upper body around the waist pivot)', () => {
  const maxRad = (LEAN_MAX_DEGREES * Math.PI) / 180;

  it('is a no-op while upright', () => {
    expect(leanArc(0)).toEqual({ side: 0, drop: 0 });
  });

  it('reaches the analytic radius at full lean', () => {
    const right = leanArc(1);
    expect(right.side).toBeCloseTo(LEAN_RADIUS * Math.sin(maxRad), 6);
    expect(right.drop).toBeCloseTo(LEAN_RADIUS * (1 - Math.cos(maxRad)), 6);
    // 0.6*sin20° and 0.6*(1-cos20°) — the reported maxima.
    expect(right.side).toBeCloseTo(0.2052, 4);
    expect(right.drop).toBeCloseTo(0.0362, 4);
  });

  it('mirrors side for a left lean and keeps the drop', () => {
    const left = leanArc(-1);
    expect(left.side).toBeLessThan(0);
    expect(left.side).toBeCloseTo(-leanArc(1).side, 6);
    expect(left.drop).toBeCloseTo(leanArc(1).drop, 6);
  });

  it('clamps out-of-range input to full lean', () => {
    expect(leanArc(3)).toEqual(leanArc(1));
    expect(leanArc(-3)).toEqual(leanArc(-1));
  });

  it('grows side and drop monotonically from upright to full lean', () => {
    let lastSide = -Infinity;
    let lastDrop = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const arc = leanArc(i / 20);
      expect(arc.side).toBeGreaterThan(lastSide);
      expect(arc.drop).toBeGreaterThan(lastDrop);
      lastSide = arc.side;
      lastDrop = arc.drop;
    }
  });

  it('moves the eye sideways far more than it sinks it', () => {
    // Real lean geometry: the lateral travel dominates the small downward drop.
    expect(leanArc(1).side).toBeGreaterThan(5 * leanArc(1).drop);
  });
});
