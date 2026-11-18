import { describe, it, expect } from 'vitest';
import { admitGuestShot } from '../src/game/combat/shot-admission';

const interval = 100; // 600 RPM

function shot(seq: number, clientAt: number, last = { seq: 0, at: 0, nextFire: 0 }, now = 1000) {
  return admitGuestShot({ seq, lastAcceptedSeq: last.seq, clientAt, lastClientAt: last.at, now, nextFire: last.nextFire, interval });
}

describe('guest shot admission', () => {
  it('accepts shots fired at the weapon cadence', () => {
    let state = { seq: 0, at: 0, nextFire: 0 };
    for (let i = 1; i <= 6; i++) {
      const result = shot(i, 1000 + (i - 1) * interval, state);
      expect(result.accept, `shot ${i}`).toBe(true);
      state = { seq: i, at: result.lastClientAt, nextFire: result.nextFire };
    }
  });

  it('accepts several shots delivered in one host tick when their client timestamps are spaced', () => {
    // Both shots arrive with the host clock unchanged after a hitch.
    const first = shot(1, 1000, { seq: 0, at: 0, nextFire: 1000 });
    expect(first.accept).toBe(true);
    const second = shot(2, 1100, { seq: 1, at: first.lastClientAt, nextFire: 1100 });
    expect(second.accept, 'a real second bullet must not be eaten by the host tick').toBe(true);
  });

  it('rejects a spamming client using client timestamps', () => {
    const first = shot(1, 1000);
    expect(first.accept).toBe(true);
    const spam = shot(2, 1010, { seq: 1, at: first.lastClientAt, nextFire: first.nextFire });
    expect(spam.accept).toBe(false);
  });

  it('does not consume the sequence number of a rejected shot', () => {
    const rejected = admitGuestShot({ seq: 4, lastAcceptedSeq: 4, clientAt: 0, lastClientAt: 0, now: 0, nextFire: 0, interval });
    expect(rejected.accept).toBe(false);
    expect(rejected.lastClientAt).toBe(0);
    expect(rejected.nextFire).toBe(0);
  });

  it('keeps the legacy simulation-clock gate for old clients without timestamps', () => {
    expect(admitGuestShot({ seq: 1, lastAcceptedSeq: 0, clientAt: 0, lastClientAt: 0, now: 970, nextFire: 1000, interval }).accept).toBe(true);
    expect(admitGuestShot({ seq: 1, lastAcceptedSeq: 0, clientAt: 0, lastClientAt: 0, now: 900, nextFire: 1000, interval }).accept).toBe(false);
  });

  it('never accepts a stale/duplicate sequence', () => {
    expect(admitGuestShot({ seq: 3, lastAcceptedSeq: 3, clientAt: 5000, lastClientAt: 0, now: 5000, nextFire: 0, interval }).accept).toBe(false);
    expect(admitGuestShot({ seq: 2, lastAcceptedSeq: 3, clientAt: 5000, lastClientAt: 0, now: 5000, nextFire: 0, interval }).accept).toBe(false);
  });
});
