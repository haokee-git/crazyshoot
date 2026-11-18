/**
 * Host-side admission of a guest's reliable `shoot` message.
 *
 * The guest's unordered movement packets may be lost or bunched, and several
 * reliable shots can be delivered in one host tick after a hitch. Comparing the
 * host's simulation clock to `nextFire` therefore ate real bullets. The guest
 * stamps each shot with its own fire time; consecutive stamps must respect the
 * weapon cadence, which is immune to host tick grouping.
 */
export interface ShotAdmissionInput {
  seq: number;
  lastAcceptedSeq: number;
  /** Guest-side fire timestamp (monotonic ms); 0/undefined for old clients. */
  clientAt: number;
  lastClientAt: number;
  /** Host simulation clock (ms). */
  now: number;
  /** Host simulation time at which the next shot is allowed (ms). */
  nextFire: number;
  /** Weapon shot interval (ms). */
  interval: number;
  /** Allowance for timestamp jitter. */
  tolerance?: number;
}

export interface ShotAdmission {
  accept: boolean;
  lastClientAt: number;
  nextFire: number;
}

/**
 * Accept a shot when:
 *  - it is a new sequence number;
 *  - the client-side cadence is at least 55 % of the weapon interval (allows
 *    jitter, rejects a spamming client);
 *  - legacy clients without timestamps still pass the simulation-clock gate;
 *  - otherwise, reject without consuming the sequence number so the snapshot ack
 *    tells the client the shot was not applied.
 */
export function admitGuestShot(input: ShotAdmissionInput): ShotAdmission {
  const { seq, lastAcceptedSeq, clientAt, lastClientAt, now, nextFire, interval } = input;
  const tolerance = input.tolerance ?? 40;
  if (!Number.isSafeInteger(seq) || seq <= lastAcceptedSeq) {
    return { accept: false, lastClientAt, nextFire };
  }
  if (clientAt > 0 && lastClientAt > 0 && clientAt - lastClientAt < interval * 0.55) {
    return { accept: false, lastClientAt, nextFire };
  }
  if (clientAt <= 0 && now < nextFire - tolerance) {
    return { accept: false, lastClientAt, nextFire };
  }
  return {
    accept: true,
    lastClientAt: clientAt > 0 ? clientAt : lastClientAt,
    nextFire: Math.max(now, nextFire) + interval,
  };
}
