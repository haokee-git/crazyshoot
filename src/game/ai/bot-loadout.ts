import type { LoadoutSelection, OpticId, ThrowableId, WeaponId } from '../../content/weapons/catalog';
import { getWeapon } from '../../content/weapons/catalog';

export type BotRole = 'sniper' | 'marksman' | 'rifle' | 'smg' | 'lmg' | 'shotgun';

export interface BotLoadout {
  role: BotRole;
  weaponId: WeaponId;
  opticId: OpticId;
}

const POOLS: Record<BotRole, { weapons: WeaponId[]; optics: OpticId[] }> = {
  sniper: { weapons: ['awm'], optics: ['8x', '6x'] },
  marksman: { weapons: ['mk14'], optics: ['6x', '4x'] },
  rifle: { weapons: ['m16', 'm4a1', 'akm'], optics: ['3x', '2x', 'red_dot', 'holo'] },
  smg: { weapons: ['uzi', 'vector', 'ump45', 'mp5'], optics: ['red_dot', 'holo'] },
  lmg: { weapons: ['m249'], optics: ['4x', '3x'] },
  shotgun: { weapons: ['m870'], optics: ['iron', 'red_dot'] },
};

export function roleForWeapon(id: string): BotRole {
  const weapon = getWeapon(id);
  if (!weapon) return 'rifle';
  if (weapon.id === 'awm' || weapon.id === 'amr') return 'sniper';
  if (weapon.className === 'dmr') return 'marksman';
  if (weapon.className === 'smg') return 'smg';
  if (weapon.className === 'lmg') return 'lmg';
  if (weapon.className === 'shotgun') return 'shotgun';
  return 'rifle';
}

function pickFrom<T>(list: readonly T[], rng: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

export function pickBotLoadout(role: BotRole, rng: () => number): BotLoadout {
  const pool = POOLS[role];
  return { role, weaponId: pickFrom(pool.weapons, rng), opticId: pickFrom(pool.optics, rng) };
}

export function loadoutSelection(loadout: BotLoadout): LoadoutSelection {
  const throwables: [ThrowableId, ThrowableId] = ['frag', 'smoke'];
  return { weaponId: loadout.weaponId, opticId: loadout.opticId, throwables };
}

/**
 * One role per team slot. A full team always carries a bolt sniper and a marksman,
 * a share of rifles, a couple of SMGs and (on big teams) one LMG.
 */
export function teamLoadoutPlan(size: number, rng: () => number, closeQuarters = false): BotLoadout[] {
  const slots = Math.max(1, Math.floor(size));
  const plan: BotRole[] = [];
  if (slots >= 4) plan.push('sniper');
  if (slots >= 5) plan.push('marksman');
  if (slots >= 9) plan.push('lmg');
  if (closeQuarters && slots >= 6) plan.push('shotgun');
  const support = Math.max(1, Math.round((slots - plan.length) * 0.36));
  for (let i = 0; i < support && plan.length < slots; i++) plan.push('smg');
  while (plan.length < slots) plan.push('rifle');
  // Shuffle so the roles are not always carried by the first spawned bots.
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  return plan.slice(0, slots).map(role => pickBotLoadout(role, rng));
}

export interface RoleCounts {
  sniper: number; marksman: number; rifle: number; smg: number; lmg: number; shotgun: number;
}

export function countRoles(roles: readonly BotRole[]): RoleCounts {
  const counts: RoleCounts = { sniper: 0, marksman: 0, rifle: 0, smg: 0, lmg: 0, shotgun: 0 };
  for (const role of roles) counts[role]++;
  return counts;
}

/**
 * Respawn decision: fill a missing long-range or close-range role, or switch when the
 * team is short on a counter. Falls back to keeping the current role.
 */
export function chooseRespawnRole(current: BotRole, teammates: readonly BotRole[], teamSize: number, longRangePressure: boolean, rng: () => number, dominatingLongRange = false): BotRole {
  const counts = countRoles(teammates);
  // 对面有长枪在压着打：先凑出两把长枪对枪（0 把拿狙击，已有 1 把拿精确射手）。
  if (dominatingLongRange && counts.sniper + counts.marksman < 2) return counts.sniper + counts.marksman === 0 ? 'sniper' : 'marksman';
  if (longRangePressure && counts.sniper + counts.marksman === 0) return 'sniper';
  if (teamSize >= 4 && counts.sniper === 0 && counts.marksman === 0) return rng() < 0.5 ? 'sniper' : 'marksman';
  if (teamSize >= 5 && counts.sniper === 0) return 'sniper';
  if (teamSize >= 5 && counts.marksman === 0) return 'marksman';
  const closeRange = counts.smg + counts.shotgun;
  if (teamSize >= 8 && counts.lmg === 0 && rng() < 0.55) return 'lmg';
  if (closeRange < Math.max(1, Math.floor(teamSize * 0.25)) && (current === 'rifle' || current === 'sniper')) return 'smg';
  if (counts.rifle < Math.max(1, Math.floor(teamSize * 0.4)) && current !== 'rifle') return 'rifle';
  // Keep the current weapon most of the time so the team does not oscillate.
  return rng() < 0.7 ? current : pickFrom(['rifle', 'smg', 'marksman'] as const, rng);
}
