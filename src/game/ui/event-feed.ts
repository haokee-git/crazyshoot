/**
 * Local event-feed projection.
 *
 * The host is authoritative for kills, but the bottom-left feed is *personal*:
 * a guest must never see the host's "击杀 X" / "X 击杀了你" lines, and the host
 * must not hide a guest's own kill. Events therefore travel with actor/target
 * ids and every client projects them through this function.
 */
export type FeedKind = 'kill' | 'capture' | 'death' | 'vehicle' | 'assist';

export interface FeedEvent {
  id: number;
  kind: FeedKind;
  text: string;
  points: number;
  at: number;
  actorId?: string;
  targetId?: string;
  attackerName?: string;
  targetName?: string;
  targetLabel?: string;
  team?: 'blue' | 'orange';
}

export interface FeedLine {
  id: number;
  kind: FeedKind;
  text: string;
  points: number;
}

export const FEED_WINDOW_MS = 6000;

/** Project authoritative events into the lines this client should display. */
export function localFeedLines(
  events: readonly FeedEvent[],
  localId: string,
  now: number,
  windowMs = FEED_WINDOW_MS,
  max = 4,
): FeedLine[] {
  const out: FeedLine[] = [];
  for (const event of events) {
    if (now - event.at >= windowMs) continue;
    switch (event.kind) {
      case 'capture':
        out.push({ id: event.id, kind: 'capture', text: event.text, points: event.points });
        break;
      case 'assist':
        // Assist events are only ever addressed to one client.
        out.push({ id: event.id, kind: 'assist', text: event.text, points: event.points });
        break;
      case 'kill':
        if (event.actorId === localId) {
          out.push({ id: event.id, kind: 'kill', text: `击杀 ${event.targetName ?? '目标'}`, points: event.points || 5 });
        } else if (event.targetId === localId) {
          out.push({ id: event.id, kind: 'death', text: `${event.attackerName ?? '敌人'} 击杀了你`, points: 0 });
        }
        break;
      case 'vehicle':
        if (event.actorId === localId) {
          out.push({ id: event.id, kind: 'vehicle', text: `摧毁 ${event.targetLabel ?? '载具'}`, points: event.points || 15 });
        }
        break;
      case 'death':
        if (event.targetId === localId) {
          out.push({ id: event.id, kind: 'death', text: '你已自杀', points: 0 });
        }
        break;
    }
    if (out.length >= max) break;
  }
  return out;
}
