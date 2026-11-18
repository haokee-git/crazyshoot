import { describe, expect, it } from 'vitest';
import { miaoVillage } from '../src/maps/miao-village';
import { matchSecondsForMap } from '../src/game/core/match-time';

const BASE_RATE = 1.2; // engine: dt * 1.2 * scoreRate * owned caps
const SCORE_MAX = 1000;
const KILL_POINTS = 5;

describe('miao village 20-minute scoring model', () => {
  it('applies 1200 s and 0.18 only to miao_village', () => {
    expect(matchSecondsForMap('miao_village')).toBe(1200);
    expect(matchSecondsForMap('docks')).toBe(600);
    expect(miaoVillage.extensions?.matchSeconds).toBe(1200);
    expect(miaoVillage.scoreRate).toBe(0.18);
  });

  it('derives the authored points-per-second table', () => {
    const rate = miaoVillage.scoreRate!;
    const per = (caps: number) => BASE_RATE * rate * caps;
    expect(per(1)).toBeCloseTo(0.216, 6);
    expect(per(2)).toBeCloseTo(0.432, 6);
    expect(per(2.5)).toBeCloseTo(0.54, 6);
    expect(per(3)).toBeCloseTo(0.648, 6);
    expect(per(5)).toBeCloseTo(1.08, 6);
  });

  it('matches the documented time-to-1000 examples', () => {
    const rate = miaoVillage.scoreRate!;
    const secondsFor = (caps: number, kills: number) => (SCORE_MAX - kills * KILL_POINTS) / (BASE_RATE * rate * caps);
    expect(secondsFor(3, 50)).toBeCloseTo((1000 - 250) / 0.648, 3);
    expect(secondsFor(3, 50)).toBeGreaterThan(1150);
    expect(secondsFor(3, 50)).toBeLessThan(1165);
    expect(secondsFor(5, 0)).toBeCloseTo(1000 / 1.08, 3);
    expect(secondsFor(5, 0)).toBeGreaterThan(920);
    expect(secondsFor(5, 0)).toBeLessThan(930);
    expect(secondsFor(2.5, 0)).toBeGreaterThan(1840);
    expect(secondsFor(2.5, 0)).toBeLessThan(1860);
  });

  it('keeps team kills at 5 and the win score at 1000', () => {
    expect(KILL_POINTS).toBe(5);
    expect(SCORE_MAX).toBe(1000);
  });

  it('shows that a 20-minute cap is a limit, not a guaranteed 20-minute round', () => {
    const capSeconds = matchSecondsForMap('miao_village');
    const fivePointNoKill = 1000 / (BASE_RATE * miaoVillage.scoreRate! * 5);
    const threePointFortyKills = (1000 - 40 * 5) / (BASE_RATE * miaoVillage.scoreRate! * 3);
    expect(capSeconds).toBe(1200);
    expect(fivePointNoKill).toBeLessThan(capSeconds);
    // 40 kills lands past the 20-minute cap; it goes to time-limit scoring.
    expect(threePointFortyKills).toBeGreaterThan(capSeconds);
    // 3 caps + 50 kills ends just before the cap (≈19.3 min)
    expect((1000 - 50 * 5) / (BASE_RATE * miaoVillage.scoreRate! * 3)).toBeLessThan(capSeconds);
  });
});
