import type { Arena } from '../world/arena';
import type { MantleState } from './motion';

export const SWIM_DEPTH = 1.3;
export const SWIM_REST_DEPTH = 1.53;
export const SWIM_TRAVEL_DEPTH = 1.03;
export const SWIM_ASCENT_DEPTH = .48;

export function findWaterMantle(
  arena: Arena, x: number, feet: number, z: number, surface: number,
  dx: number, dz: number, ignoreId?: string,
): MantleState | null {
  if (feet < surface - .78) return null;
  const reach = Math.min(surface + 1.1, feet + 1.8);
  const support = (x: number, z: number, max: number) =>
    arena.supportAt?.(x, z, max) ?? arena.heightAt?.(x, z) ?? -Infinity;
  const blocked = (x: number, y: number, z: number) =>
    arena.playerBlocked?.(x, z, .38, y, 1.8, ignoreId) ?? arena.blockedAt?.(x, z, .38, y, 1.8) ?? false;

  for (const distance of [.42, .65, .9, 1.12, 1.35]) {
    const edgeX = x + dx * distance, edgeZ = z + dz * distance;
    const top = support(edgeX, edgeZ, reach);
    if (top < surface - .025 || top > reach || top - feet < .22) continue;
    const landX = edgeX + dx * .42, landZ = edgeZ + dz * .42;
    if (Math.abs(support(landX, landZ, top + .02) - top) > .03 || arena.waterAt?.(landX, landZ, top) || blocked(landX, top, landZ)) continue;
    let clear = true;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      if (blocked(x, feet + (top - feet) * t, z) ||
          blocked(x + (landX - x) * t, top, z + (landZ - z) * t)) {
        clear = false;
        break;
      }
    }
    if (clear) return { from: [x, feet, z], to: [landX, top, landZ], edge: [edgeX, top, edgeZ], elapsed: 0, duration: .86 };
  }
  return null;
}
