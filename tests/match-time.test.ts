import { describe, it, expect } from 'vitest';
import {
  MAX_MATCH_MINUTES, MAX_MATCH_SECONDS, MIN_MATCH_MINUTES, MIN_MATCH_SECONDS,
  clampMatchSeconds, matchMinutes, matchSecondsForMap,
} from '../src/game/core/match-time';

describe('custom match duration', () => {
  it('keeps the current per-map defaults', () => {
    expect(matchSecondsForMap('docks')).toBe(600);
    expect(matchSecondsForMap('broken_bridge')).toBe(600);
    expect(matchSecondsForMap('garden')).toBe(600);
    expect(matchSecondsForMap('airfield')).toBe(600);
    expect(matchSecondsForMap('pharaoh')).toBe(1200);
    expect(matchSecondsForMap('miao_village')).toBe(1200);
    expect(matchSecondsForMap('unknown-map')).toBe(600);
  });

  it('allows 1..60 whole minutes and clamps outside that range', () => {
    expect(MIN_MATCH_MINUTES).toBe(1);
    expect(MAX_MATCH_MINUTES).toBe(60);
    expect(clampMatchSeconds(60)).toBe(MIN_MATCH_SECONDS);
    expect(clampMatchSeconds(0)).toBe(600); // invalid -> docks default
    expect(clampMatchSeconds(0, 'pharaoh')).toBe(1200);
    expect(clampMatchSeconds(120)).toBe(120);
    expect(clampMatchSeconds(600)).toBe(600);
    expect(clampMatchSeconds(3600)).toBe(MAX_MATCH_SECONDS);
    expect(clampMatchSeconds(3601)).toBe(MAX_MATCH_SECONDS);
    expect(clampMatchSeconds(999999)).toBe(MAX_MATCH_SECONDS);
  });

  it('snaps arbitrary seconds to minute boundaries', () => {
    expect(clampMatchSeconds(89)).toBe(60);
    expect(clampMatchSeconds(90)).toBe(120); // round half up
    expect(clampMatchSeconds(149)).toBe(120);
    expect(clampMatchSeconds(150)).toBe(180);
  });

  it('falls back to the current map default for missing/invalid values', () => {
    expect(clampMatchSeconds(undefined, 'pharaoh')).toBe(1200);
    expect(clampMatchSeconds('nope', 'docks')).toBe(600);
    expect(clampMatchSeconds(-30, 'garden')).toBe(600);
  });

  it('exposes whole minutes for the room UI', () => {
    expect(matchMinutes(60)).toBe(1);
    expect(matchMinutes(600)).toBe(10);
    expect(matchMinutes(1200)).toBe(20);
    expect(matchMinutes(3600)).toBe(60);
    expect(matchMinutes(999999)).toBe(60);
  });
});
