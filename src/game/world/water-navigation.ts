import type { Arena } from './arena';
import type { TerrainData } from './voxel-map-data';
import type { VoxelWorldQueries } from './voxel-world-queries';
import { findWaterMantle, SWIM_ASCENT_DEPTH, SWIM_DEPTH } from '../player/swimming';

/** A reverse flood from reachable dry banks gives each swim cell its next step. */
export function buildWaterExitRoutes(data: TerrainData, queries: VoxelWorldQueries) {
  const { width, depth, minX, minZ } = data;
  const next = new Int32Array(width * depth).fill(-1);
  const feet = new Float32Array(next.length).fill(-Infinity);
  const swim = new Uint8Array(next.length);
  const neighbours = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const arena = {
    supportAt: (x: number, z: number, y: number) => queries.support(x, z, y),
    blockedAt: (x: number, z: number, r: number, y: number, height?: number) => queries.blocked(x, z, r, y, height),
    waterAt: (x: number, z: number, y?: number) => queries.water(x, z, y),
  } as Arena;
  const wet: number[] = [];
  for (let index = 0; index < next.length; index++) {
    const surface = data.water[index];
    if (surface === -32768) continue;
    const x = minX + index % width + .5, z = minZ + Math.floor(index / width) + .5;
    const water = queries.water(x, z, surface);
    if (!water) continue;
    const deep = surface - water.bottom >= SWIM_DEPTH;
    const y = deep ? surface - SWIM_ASCENT_DEPTH : water.bottom;
    if (queries.blocked(x, z, .38, y)) continue;
    feet[index] = y;
    swim[index] = Number(deep);
    wet.push(index);
  }
  const queue: number[] = [];
  for (const index of wet) {
    const ix = index % width, iz = Math.floor(index / width);
    const x = minX + ix + .5, z = minZ + iz + .5, surface = data.water[index], y = feet[index];
    for (const [dx, dz] of neighbours) {
      const tx = x + dx, tz = z + dz;
      if (tx < 1 || tz < 1 || tx > data.size - 1 || tz > data.size - 1) continue;
      const land = queries.support(tx, tz, surface + 1.1);
      if (land < surface - .025 || land > surface + 1.1 || queries.water(tx, tz, land) || queries.blocked(tx, tz, .38, land)) continue;
      const canWalk = !swim[index] && land - y <= 1.05 &&
        !queries.blocked(x + dx * .5, z + dz * .5, .38, Math.max(y, land));
      if (!canWalk) {
        const climbY = Math.max(y, surface - SWIM_ASCENT_DEPTH);
        if (queries.blocked(x, z, .38, climbY) || !findWaterMantle(arena, x, climbY, z, surface, dx, dz)) continue;
      }
      next[index] = (iz + dz) * width + ix + dx;
      queue.push(index);
      break;
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], ix = index % width, iz = Math.floor(index / width);
    for (const [dx, dz] of neighbours) {
      if (ix + dx < 0 || ix + dx >= width || iz + dz < 0 || iz + dz >= depth) continue;
      const from = (iz + dz) * width + ix + dx;
      if (next[from] >= 0 || !Number.isFinite(feet[from]) || Math.abs(feet[from] - feet[index]) > 1.05) continue;
      const x = minX + ix + .5 + dx * .5, z = minZ + iz + .5 + dz * .5;
      if (queries.blocked(x, z, .38, Math.max(feet[from], feet[index]))) continue;
      next[from] = index;
      queue.push(from);
    }
  }
  return next;
}
