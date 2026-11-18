import { PerspectiveCamera, Vector3 } from 'three';
import { MAPS } from '../../src/maps';
import { isWaterMaterial } from '../../src/content/materials/battlefield';
import { PlayerController } from '../../src/game/player/controller';
import { SWIM_ASCENT_DEPTH, SWIM_DEPTH } from '../../src/game/player/swimming';
import type { Arena } from '../../src/game/world/arena';
import { BLOCK, blockAt, buildVoxelMapData } from '../../src/game/world/voxel-map-data';
import { VoxelWorldQueries } from '../../src/game/world/voxel-world-queries';
import { buildWaterExitRoutes } from '../../src/game/world/water-navigation';

const directions = [[-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [0, -1, 0]];
const maps = MAPS.filter(map => process.argv.length === 2 || process.argv.slice(2).includes(map.id));
if (!maps.length) throw new Error('No matching maps');

const reports = maps.map(map => {
  const data = buildVoxelMapData(map), q = new VoxelWorldQueries(data);
  const { minX, minZ, minY, width, depth, height, water, voxels } = data;
  const routes = data.waterExits = buildWaterExitRoutes(data, q);
  let waterBlocks = 0, openFaces = 0, navigable = 0, missingExit = 0;
  const leaks: number[][] = [], traps: number[][] = [];
  const samples: {x:number;y:number;z:number}[] = [];
  for (let iz = 0; iz < depth; iz++) for (let ix = 0; ix < width; ix++) {
    const k = iz * width + ix;
    const x = minX + ix, z = minZ + iz;
    for (let iy = 0; iy < height; iy++) {
      if (!isWaterMaterial(voxels[k * height + iy])) continue;
      waterBlocks++;
      const y = minY + iy;
      for (const [dx, dy, dz] of directions) {
        // The ocean and river can continue beyond the generated horizontal margin.
        if (ix + dx < 0 || ix + dx >= width || iz + dz < 0 || iz + dz >= depth) continue;
        if (blockAt(data, x + dx, y + dy, z + dz) !== BLOCK.AIR) continue;
        openFaces++;
        if (leaks.length < 12) leaks.push([x, y, z, x + dx, y + dy, z + dz]);
      }
    }
    if (x < 1 || x >= map.size - 1 || z < 1 || z >= map.size - 1 || water[k] === -32768) continue;
    const w = q.water(x + .5, z + .5, water[k])!;
    const deep = w.surface - w.bottom >= SWIM_DEPTH;
    const y = deep ? w.surface - SWIM_ASCENT_DEPTH : w.bottom;
    if (q.blocked(x + .5, z + .5, .38, y)) continue;
    navigable++;
    if (routes[k] < 0) {
      missingExit++;
      if (traps.length < 12) traps.push([x, y, z]);
    } else if (deep) samples.push({ x: x + .5, y: w.bottom, z: z + .5 });
  }

  const arena = {
    bounds: {minX:1,maxX:map.size-1,minZ:1,maxZ:map.size-1},
    waterAt: (x:number,z:number,y?:number) => q.water(x,z,y),
    heightAt: (x:number,z:number) => q.height(x,z),
    supportAt: (x:number,z:number,y:number) => q.support(x,z,y),
    blockedAt: (x:number,z:number,r:number,y:number,h?:number) => q.blocked(x,z,r,y,h),
  } as Arena;
  const escapeFailures: unknown[] = [];
  const count = Math.min(samples.length, 32);
  for (let sample = 0; sample < count; sample++) {
    const start = samples[Math.floor((sample + .5) / count * samples.length)];
    const player = new PlayerController(new PerspectiveCamera());
    player.teleport(new Vector3(start.x, start.y, start.z));
    let escaped = false;
    for (let tick = 0; tick < 60 * 45; tick++) {
      const {x,y,z} = player.position, w = q.water(x,z,y);
      if (player.mantle || !w || y >= w.surface - .015) {
        if (!player.mantle && player.grounded) { escaped = true; break; }
        player.update(1/60,{down:()=>false,consumeLook:()=>({x:0,y:0})},arena,true);
        continue;
      }
      const step = q.waterExit(x,z);
      if (!step) break;
      const dx = step.x-x, dz = step.z-z;
      player.yaw = Math.atan2(-dx,-dz);
      player.update(1/60, {
        worldMove: {x:dx,z:dz},
        down: key => key === 'KeyW' || key === 'ShiftLeft' || key === 'Space',
        consumeLook: () => ({x:0,y:0}),
      },arena,true);
    }
    if (!escaped) escapeFailures.push({start,end:player.position.toArray()});
  }
  return {map:map.id,waterBlocks,openFaces,leaks,navigable,missingExit,traps,escapeTrials:count,escapeFailures};
});
console.log(JSON.stringify(reports,null,2));
if (reports.some(report => report.openFaces || report.missingExit || report.escapeFailures.length)) process.exitCode=1;
