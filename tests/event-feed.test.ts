import { describe, it, expect } from 'vitest';
import { localFeedLines, type FeedEvent } from '../src/game/ui/event-feed';

const HOST = 'host-peer';
const GUEST = 'guest-peer';
const now = 10_000;
const base = { at: now - 100, points: 5 } as const;

function kill(attackId: string, targetId: string): FeedEvent {
  return {
    ...base,
    id: 1,
    kind: 'kill',
    text: 'HOST 击杀 GUEST',
    actorId: attackId,
    targetId,
    attackerName: 'HOST',
    targetName: 'GUEST',
  };
}

describe('personal event feed (guest view)', () => {
  it('does not leak the host’s own kill into the guest feed', () => {
    const lines = localFeedLines([kill(HOST, 'some-bot')], GUEST, now);
    expect(lines).toHaveLength(0);
  });

  it('does not tell the guest “你死了” when the host died', () => {
    const lines = localFeedLines([kill('some-bot', HOST)], GUEST, now);
    expect(lines).toHaveLength(0);
  });

  it('shows the guest’s own kill with local wording', () => {
    const lines = localFeedLines([kill(GUEST, HOST)], GUEST, now);
    expect(lines).toMatchObject([{ kind: 'kill', text: '击杀 GUEST', points: 5 }]);
  });

  it('shows the guest’s own death with the attacker name', () => {
    const lines = localFeedLines([kill(HOST, GUEST)], GUEST, now);
    expect(lines).toMatchObject([{ kind: 'death', text: 'HOST 击杀了你', points: 0 }]);
  });

  it('projects exactly one line for a kill, even when both sides are local (self-kill never happens)', () => {
    const lines = localFeedLines([kill(GUEST, GUEST)], GUEST, now);
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe('kill');
  });

  it('keeps captures global, assists addressed, and vehicle kills actor-only', () => {
    const events: FeedEvent[] = [
      { id: 2, kind: 'capture', text: '蓝队占领 A', points: 0, at: now - 50 },
      { id: -3, kind: 'assist', text: '助攻 ENEMY', points: 2, at: now - 40 },
      { id: 4, kind: 'vehicle', text: 'HOST 摧毁 主战坦克', points: 15, at: now - 30, actorId: HOST, targetLabel: '主战坦克' },
      { id: 5, kind: 'vehicle', text: 'GUEST 摧毁 吉普', points: 15, at: now - 20, actorId: GUEST, targetLabel: '吉普' },
    ];
    const lines = localFeedLines(events, GUEST, now);
    expect(lines.map((line) => [line.kind, line.text])).toEqual([
      ['capture', '蓝队占领 A'],
      ['assist', '助攻 ENEMY'],
      ['vehicle', '摧毁 吉普'],
    ]);
  });

  it('drops events older than the feed window and caps the list', () => {
    const old: FeedEvent = { ...kill(GUEST, HOST), id: 9, at: now - 6000 };
    expect(localFeedLines([old], GUEST, now)).toHaveLength(0);
    const many: FeedEvent[] = Array.from({ length: 8 }, (_, i) => ({ ...kill(GUEST, HOST), id: i + 10 }));
    expect(localFeedLines(many, GUEST, now)).toHaveLength(4);
  });
});
