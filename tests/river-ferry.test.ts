import { describe, expect, it } from 'vitest';
import { FerrySystem, isCountdown, isDocked, isMoving, type FerryConfig } from '../src/game/mechanisms/river-ferry';
import { MIAO_FERRIES } from '../src/maps/miao-village/river';

const configs: FerryConfig[] = MIAO_FERRIES.map((f) => ({ ...f }));
const advance = (ferries: FerrySystem, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) ferries.tick(1 / 60); };

describe('authoritative cable ferries', () => {
  it('starts on the authored shores with a 40 m / 2.5 m/s route', () => {
    const ferries = new FerrySystem(configs);
    const south = ferries.state('south')!;
    const north = ferries.state('north')!;
    expect(south.phase).toBe('dockedWest');
    expect(south.x).toBe(212);
    expect(north.phase).toBe('dockedEast');
    expect(north.x).toBe(286);
    for (const f of configs) {
      expect(f.eastX - f.westX).toBe(40);
      expect(f.speed).toBe(2.5);
      expect(f.dwellSeconds).toBe(8);
      expect(f.countdownSeconds).toBe(2);
      expect(f.deckLength).toBe(5);
      expect(f.deckWidth).toBe(6);
      expect(f.deckY).toBeCloseTo(-1.15, 2);
    }
  });

  it('runs dwell → 2 s countdown → 16 s crossing → 8 s dwell', () => {
    const ferries = new FerrySystem([configs[0]]);
    const id = 'south';
    // The first request is accepted only after the initial dwell; speed up by requesting directly.
    expect(isDocked(ferries.phaseOf(id)!)).toBe(true);
    expect(ferries.requestById(id, 'west')).toBe(true);
    expect(ferries.state(id)!.phase).toBe('countdownWest');
    advance(ferries, 1.9);
    expect(ferries.state(id)!.phase).toBe('countdownWest');
    advance(ferries, 0.2);
    expect(ferries.state(id)!.phase).toBe('movingEast');
    advance(ferries, 15.8);
    // 16 s at 2.5 m/s: still approaching at 15.8 s
    expect(ferries.state(id)!.x).toBeGreaterThan(250);
    expect(ferries.state(id)!.x).toBeLessThan(252);
    advance(ferries, 0.4);
    const arrived = ferries.state(id)!;
    expect(arrived.phase).toBe('dockedEast');
    expect(arrived.x).toBe(252);
    // 8 s dwell then auto-return countdown
    advance(ferries, 7.4);
    expect(ferries.state(id)!.phase).toBe('dockedEast');
    advance(ferries, 0.4);
    expect(isCountdown(ferries.state(id)!.phase)).toBe(true);
  });

  it('never reverses mid-crossing and rejects a second call', () => {
    const ferries = new FerrySystem([configs[1]]);
    expect(ferries.requestById('north', 'east')).toBe(true);
    advance(ferries, 2.1);
    expect(ferries.state('north')!.phase).toBe('movingWest');
    for (let i = 0; i < 120; i++) {
      expect(ferries.requestById('north', 'east')).toBe(false);
      expect(ferries.requestById('north', 'west')).toBe(false);
      ferries.tick(1 / 60);
    }
    expect(isMoving(ferries.state('north')!.phase)).toBe(true);
  });

  it('lets an empty ferry be called from the far shore and resets between rounds', () => {
    const ferries = new FerrySystem([configs[0]]);
    // The system only validates phase; the engine validates caller distance and ship emptiness.
    expect(ferries.requestById('south', 'east')).toBe(true);
    expect(ferries.state('south')!.phase).toBe('countdownWest');
    for (let i = 0; i < 60 * 20; i++) ferries.tick(1 / 60);
    expect(ferries.state('south')!.phase).toBe('dockedEast');
    ferries.reset();
    expect(ferries.state('south')!.phase).toBe('dockedWest');
    expect(ferries.state('south')!.x).toBe(212);
    expect(ferries.state('south')!.t).toBe(0);
  });

  it('adopts authoritative guest snapshots without predicting phase', () => {
    const ferries = new FerrySystem([configs[0]]);
    ferries.applySnapshot({ id: 'south', phase: 'movingEast', t: 7.5, x: 233.75, z: 205, yaw: Math.PI });
    const s = ferries.state('south')!;
    expect(s.phase).toBe('movingEast');
    expect(s.x).toBeCloseTo(233.75, 3);
    expect(ferries.canRequest('south')).toBe(false);
    ferries.applySnapshot({ id: 'south', phase: 'dockedEast', t: 0, x: 252, z: 205, yaw: Math.PI });
    expect(ferries.canRequest('south')).toBe(true);
  });

  it('exposes the deck footprint for platform carrying and rejects calls while moving', () => {
    const ferries = new FerrySystem([configs[0]]);
    expect(ferries.contains('south', 212, 205)).toBe(true);
    expect(ferries.contains('south', 214, 207.5)).toBe(true);
    expect(ferries.contains('south', 220, 205)).toBe(false);
    ferries.requestById('south', 'west');
    advance(ferries, 2.1);
    expect(ferries.canRequest('south')).toBe(false);
  });
});
