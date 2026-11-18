import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAPS, getMap } from '../src/maps';
import { miaoVillage } from '../src/maps/miao-village';
import {
  MIAO_BUILDING_COUNTS, MIAO_CAPTURES, MIAO_FERRY_DATA, MIAO_LUSHENG_PLAZA, MIAO_PADDIES,
  MIAO_PIG_FARM, MIAO_PLOTS, MIAO_PLOT_BY_ID, MIAO_PLOT_FOOTPRINTS, MIAO_SPAWNS,
  MIAO_SPAWN_EXITS, MIAO_THEATER, MIAO_VEHICLE_PADS, MIAO_SPECIAL_CRATES, MIAO_VIEWPOINTS,
  distanceToRoads, spawnInteriorSamples,
} from '../src/maps/miao-village/layout';
import { MIAO_BRIDGES, MIAO_FERRIES, MIAO_FERRY_BASINS, MIAO_RIVER_LADDERS, RIVER_CONTROL, riverAt } from '../src/maps/miao-village/river';
import { MIAO_ROADS, maxRoadGrade } from '../src/maps/miao-village/network';
import { miaoCoverage } from '../src/maps/miao-village/coverage';
import { buildVoxelMapData } from '../src/game/world/voxel-map-data';
import { VoxelWorldQueries } from '../src/game/world/voxel-world-queries';

describe('miao village map data', () => {
  it('registers order 6 with 500 m, 20 minutes and 0.18 score rate', () => {
    expect(getMap('miao_village')?.id).toBe('miao_village');
    expect(miaoVillage.order).toBe(6);
    expect(miaoVillage.size).toBe(500);
    expect(miaoVillage.assetBundle).toBe('miao-v1');
    expect(miaoVillage.scoreRate).toBe(0.18);
    expect(miaoVillage.extensions?.matchSeconds).toBe(1200);
    expect(miaoVillage.extensions?.navigationLayers).toBe(5);
    expect((miaoVillage.extensions?.vertical as { minY: number; height: number }).height).toBe(108);
    expect(MAPS.some((m) => m.id === 'miao_village')).toBe(true);
    expect(miaoVillage.capturePoints.every((c) => c.initialOwner === 'neutral')).toBe(true);
  });

  it('keeps exact authored building counts and district distribution', () => {
    expect(MIAO_BUILDING_COUNTS.total).toBe(138);
    expect(MIAO_BUILDING_COUNTS.main).toBe(112);
    expect(MIAO_BUILDING_COUNTS.sheds).toBe(26);
    expect(MIAO_BUILDING_COUNTS.two).toBe(84);
    expect(MIAO_BUILDING_COUNTS.one).toBe(24);
    expect(MIAO_BUILDING_COUNTS.three).toBe(4);
    const expected = {
      A: { main: 30, two: 24, one: 5, three: 1, sheds: 6 },
      B: { main: 10, two: 6, one: 4, three: 0, sheds: 10 },
      C: { main: 18, two: 14, one: 3, three: 1, sheds: 4 },
      D: { main: 28, two: 22, one: 5, three: 1, sheds: 3 },
      E: { main: 16, two: 12, one: 3, three: 1, sheds: 2 },
      O: { main: 10, two: 6, one: 4, three: 0, sheds: 1 },
    } as const;
    for (const [district, counts] of Object.entries(expected)) expect(MIAO_BUILDING_COUNTS[district as keyof typeof expected]).toEqual(counts);
    for (const p of MIAO_PLOTS) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
      expect(p.w).toBeGreaterThanOrEqual(4);
      expect(p.d).toBeGreaterThanOrEqual(4);
      expect(p.floors).toBeGreaterThanOrEqual(1);
      expect(p.navigable).toBe(true);
    }
    for (const district of ['A', 'C', 'D', 'E']) expect(MIAO_PLOTS.filter((p) => p.district === district && p.floors === 3)).toHaveLength(1);
  });

  it('has a collision-free authored layout: no plot/plot or plot/road overlap', () => {
    const overlaps: string[] = [];
    for (let i = 0; i < MIAO_PLOT_FOOTPRINTS.length; i++) {
      for (let j = i + 1; j < MIAO_PLOT_FOOTPRINTS.length; j++) {
        const a = MIAO_PLOT_FOOTPRINTS[i], b = MIAO_PLOT_FOOTPRINTS[j];
        if (a.x0 < b.x1 - 0.01 && a.x1 > b.x0 + 0.01 && a.z0 < b.z1 - 0.01 && a.z1 > b.z0 + 0.01) overlaps.push(`${a.plot.id}/${b.plot.id}`);
      }
    }
    expect(overlaps).toEqual([]);
    const roadOverlaps: string[] = [];
    for (const f of MIAO_PLOT_FOOTPRINTS) {
      for (const fx of [0.05, 0.5, 0.95]) {
        for (const fz of [0.05, 0.5, 0.95]) {
          const x = f.x0 + (f.x1 - f.x0) * fx, z = f.z0 + (f.z1 - f.z0) * fz;
          if (distanceToRoads(x, z) < -0.05) roadOverlaps.push(`${f.plot.id}@${x.toFixed(1)},${z.toFixed(1)}`);
        }
      }
    }
    expect(roadOverlaps).toEqual([]);
  });

  it('capture points are authored neutral and C uses a real bridge footprint', () => {
    expect(MIAO_CAPTURES.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    const c = MIAO_CAPTURES.find((x) => x.id === 'C')!;
    expect(c.floorY).toBe(3);
    expect(c.verticalTolerance).toBe(1.2);
    expect(c.footprint).toBeDefined();
    expect(c.footprint!.z0).toBeGreaterThan(246);
    expect(c.footprint!.z1).toBeLessThan(254);
    const bridge = MIAO_BRIDGES.find((b) => b.id === 'central')!;
    expect(c.footprint!.x0).toBeGreaterThanOrEqual(bridge.x0);
    expect(c.footprint!.x1).toBeLessThanOrEqual(bridge.x1);
    // no ordinary capture point may have a footprint (only the bridge C)
    expect(MIAO_CAPTURES.filter((p) => p.footprint)).toHaveLength(1);
  });

  it('keeps the required 500 m coordinates: five caps, two spawns, plaza/theatre/pig farm', () => {
    const by = new Map(MIAO_CAPTURES.map((c) => [c.id, c]));
    expect([by.get('A')!.x, by.get('A')!.y, by.get('A')!.radius]).toEqual([150, 170, 14]);
    expect([by.get('B')!.x, by.get('B')!.y, by.get('B')!.radius]).toEqual([335, 150, 13]);
    expect([by.get('C')!.x, by.get('C')!.y, by.get('C')!.radius]).toEqual([244, 250, 10.5]);
    expect([by.get('D')!.x, by.get('D')!.y, by.get('D')!.radius]).toEqual([155, 365, 13]);
    expect([by.get('E')!.x, by.get('E')!.y, by.get('E')!.radius]).toEqual([365, 325, 14]);
    expect(MIAO_SPAWNS.map((s) => [s.team, s.x, s.y, s.w, s.d])).toEqual([
      ['blue', 48, 48, 64, 56], ['orange', 384, 396, 64, 56],
    ]);
    expect(MIAO_LUSHENG_PLAZA.y).toBe(3.5);
    expect(MIAO_THEATER.stageY).toBe(11.5);
    expect(MIAO_PIG_FARM.w).toBe(26);
    expect(MIAO_PIG_FARM.d).toBe(20);
    expect(MIAO_SPAWN_EXITS.filter((e) => e.team === 'blue')).toHaveLength(3);
    expect(MIAO_SPAWN_EXITS.filter((e) => e.team === 'orange')).toHaveLength(3);
  });

  it('uses exactly 12 light vehicles, 3 crates and no MBT/IFV/AMR/MG', () => {
    expect(MIAO_VEHICLE_PADS).toHaveLength(12);
    const kinds = MIAO_VEHICLE_PADS.map((p) => p.vehicleId);
    expect(kinds.filter((k) => k === 'motorcycle')).toHaveLength(8);
    expect(kinds.filter((k) => k === 'jeep')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'apc')).toHaveLength(2);
    expect(kinds.some((k) => ['mbt', 'light_tank', 'ifv'].includes(k))).toBe(false);
    expect(MIAO_SPECIAL_CRATES.map((c) => c.weaponId).sort()).toEqual(['flamethrower', 'rocket', 'rocket']);
    expect(miaoVillage.mgNests).toEqual([]);
    expect(MIAO_SPECIAL_CRATES.some((c) => c.weaponId === 'amr')).toBe(false);
  });

  it('keeps the river control points and monotone interpolation without overshoot', () => {
    expect(RIVER_CONTROL).toHaveLength(10);
    for (const control of RIVER_CONTROL) {
      const sample = riverAt(control.z);
      expect(Math.abs(sample.x - control.x)).toBeLessThan(0.01);
      expect(Math.abs(sample.halfWidth - control.halfWidth)).toBeLessThan(0.01);
      expect(sample.halfWidth * 2).toBeGreaterThanOrEqual(20);
      expect(sample.halfWidth * 2).toBeLessThanOrEqual(26);
    }
    const xs = RIVER_CONTROL.map((c) => c.x);
    const min = Math.min(...xs), max = Math.max(...xs);
    for (let z = -32; z <= 532; z += 1) {
      const r = riverAt(z);
      expect(r.x).toBeGreaterThanOrEqual(min - 0.01);
      expect(r.x).toBeLessThanOrEqual(max + 0.01);
      expect(r.waterWest).toBeLessThan(r.waterEast);
    }
  });

  it('has three static bridges, two ferries, four basins and nine ladders (8 banks + 1 bridge)', () => {
    expect(MIAO_BRIDGES).toHaveLength(3);
    expect(MIAO_BRIDGES.filter((b) => b.vehicles)).toHaveLength(2);
    expect(MIAO_BRIDGES.find((b) => b.id === 'central')!.vehicles).toBe(false);
    expect(MIAO_FERRIES).toHaveLength(2);
    expect(MIAO_FERRY_DATA.map((f) => f.id)).toEqual(['south', 'north']);
    expect(MIAO_FERRY_BASINS).toHaveLength(4);
    expect(MIAO_RIVER_LADDERS).toHaveLength(9);
    expect(MIAO_RIVER_LADDERS.filter((l) => l.id.startsWith('river-ladder')).length).toBe(8);
    expect(MIAO_RIVER_LADDERS.filter((l) => l.id === 'central-bridge-side-ladder')).toHaveLength(1);
    expect(MIAO_PADDIES).toHaveLength(14);
    expect(miaoVillage.waterVolumes?.length).toBe(19);
    for (const p of MIAO_PADDIES) {
      const v = miaoVillage.waterVolumes!.find((w) => w.id === p.id)!;
      expect(v.surfaceY - v.bedY!).toBeGreaterThan(0.15);
      expect(v.surfaceY - v.bedY!).toBeLessThan(0.36);
      expect(v.swim).toBe(false);
    }
  });

  it('uses only stone/dirt/wood roads, never asphalt or markings', () => {
    expect(MIAO_ROADS.length).toBeGreaterThan(15);
    for (const r of MIAO_ROADS) {
      expect(['stone', 'dirt', 'gravel']).toContain(r.surface);
      expect(r.kind).not.toBe('runway');
      expect(r.kind).not.toBe('taxiway');
    }
    for (const r of miaoVillage.roads) {
      expect(r.markings).toBe(false);
      expect(['stone', 'dirt', 'gravel']).toContain(r.surface);
      expect(r.surface).not.toBe('asphalt');
    }
    expect(miaoVillage.terrain.some((p) => p.kind === 'asphalt')).toBe(false);
    for (const r of MIAO_ROADS.filter((q) => q.kind === 'main')) expect(maxRoadGrade(r)).toBeLessThanOrEqual(12);
  });

  it('measures playable coverage in the 68–72% band with 0.5 m sampling', () => {
    const stats = miaoCoverage(0.5);
    expect(stats.totalArea).toBe(250000);
    expect(stats.playablePct).toBeGreaterThanOrEqual(68);
    expect(stats.playablePct).toBeLessThanOrEqual(72);
    expect(stats.waterArea).toBeGreaterThan(12000);
    expect(stats.buildingArea).toBeGreaterThan(10000);
    expect(stats.bridgeArea).toBeGreaterThan(1200);
    expect(stats.districts.reduce((sum, d) => sum + d.area, 0)).toBe(stats.playableArea);
  });
});

describe('miao village world data', () => {
  let data: ReturnType<typeof buildVoxelMapData>;
  let queries: VoxelWorldQueries;
  beforeAll(() => { data = buildVoxelMapData(miaoVillage); queries = new VoxelWorldQueries(data); }, 180_000);

  it('passes the authored height expansion into the terrain worker and keeps all high voxels', () => {
    expect(data.minY).toBe(-8);
    expect(data.height).toBe(108);
    expect(data.width).toBe(564);
    expect(data.navLayers).toBe(5);
    expect(data.chunkSize).toBe(100);
    let maxColumnTop = 0; if (data.columnTop) for (const v of data.columnTop) if (v > maxColumnTop) maxColumnTop = v;
    expect(maxColumnTop).toBeGreaterThan(80);
    expect(data.minY + data.height).toBe(100);
    for (const s of MIAO_SPAWNS) expect(queries.height(s.x + s.w / 2, s.y + s.d / 2)).toBe(s.team === 'blue' ? 6 : 12);
  });

  it('keeps every authored building pad at its plot base height', () => {
    const problems: string[] = [];
    for (const p of MIAO_PLOTS) {
      const ground = queries.height(p.x, p.z);
      if (Math.abs(ground - p.baseY) > 0.01) problems.push(`${p.id}: base ${p.baseY}, ground ${ground}`);
    }
    expect(problems).toEqual([]);
  });

  it('has real multi-height water: river, shallow paddies and ferry basins', () => {
    const river = queries.water(240, 250, -3);
    expect(river?.surface).toBe(-2);
    expect(river?.bottom).toBeLessThan(-3.5);
    for (const p of MIAO_PADDIES) {
      const water = queries.water(p.x, p.z, p.levelY + 0.02);
      expect(water?.surface).toBeCloseTo(p.levelY + 0.28, 2);
      expect(water!.surface - water!.bottom).toBeLessThan(0.36);
    }
    for (const ferry of MIAO_FERRIES) {
      const sample = queries.water((ferry.westX + ferry.eastX) / 2, ferry.z, -2.2);
      expect(sample).not.toBeNull();
    }
    expect(queries.water(244, 250, 10)).toBeNull();
  });

  it('contains the 9 real ladders with usable bottom/top standing space', () => {
    expect(data.ladders?.length).toBe(9);
    for (const ladder of data.ladders!) {
      const bottomSupport = queries.support(ladder.x + ladder.normalX * 0.5, ladder.z + ladder.normalZ * 0.5, 2);
      expect(bottomSupport).toBeGreaterThanOrEqual(-1.45);
      const topSupport = queries.support(ladder.exitX, ladder.exitZ, ladder.top + 1);
      expect(Math.abs(topSupport - ladder.top)).toBeLessThan(0.2);
      expect(queries.blocked(ladder.exitX, ladder.exitZ, 0.4, ladder.top)).toBe(false);
    }
  });

  it('never lets a cap, 3F window, balcony or authored observation deck see a spawn interior', () => {
    const violations: string[] = [];
    for (const vp of MIAO_VIEWPOINTS) {
      for (const spawn of MIAO_SPAWNS) {
        for (const target of spawnInteriorSamples(spawn)) {
          const a = new THREE.Vector3(vp.x, vp.y, vp.z);
          const b = new THREE.Vector3(target.x, target.y, target.z);
          if (!queries.line(a, b)) violations.push(`${vp.id} -> ${spawn.team}(${target.x.toFixed(1)},${target.z.toFixed(1)})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('capture footprint predicate (C bridge)', () => {
  it('allows only the real bridge deck, not water / towpath / roof / outside', async () => {
    const { capturePointAllows } = await import('../src/game/world/capture-rules');
    const c = MIAO_CAPTURES.find((x) => x.id === 'C')!;
    const shape = { id: c.id, x: c.x, z: c.y, r: c.radius, floorY: c.floorY, verticalTolerance: c.verticalTolerance, footprint: c.footprint };
    expect(capturePointAllows(shape, 244, 250, 3, 3)).toBe(true);
    expect(capturePointAllows(shape, 240, 250, 3, 3)).toBe(true); // deck west, still inside footprint x212..276
    expect(capturePointAllows(shape, 210, 250, 3, 3)).toBe(false); // bridge head outside footprint
    expect(capturePointAllows(shape, 244, 250, -2, -5)).toBe(false); // river surface
    expect(capturePointAllows(shape, 244, 250, -1.2, -1.2)).toBe(false); // towpath
    expect(capturePointAllows(shape, 244, 250, 7, 3)).toBe(false); // roof/pavilion
    expect(capturePointAllows(shape, 244, 240, 3, 3)).toBe(false); // bridge outside z246..254
    const a = MIAO_CAPTURES.find((x) => x.id === 'A')!;
    const aShape = { id: a.id, x: a.x, z: a.y, r: a.radius, floorY: a.floorY, verticalTolerance: a.verticalTolerance };
    expect(capturePointAllows(aShape, 150, 170, 5, 5)).toBe(true);
    expect(capturePointAllows(aShape, 150, 170, 9, 9)).toBe(false);
    expect(capturePointAllows(aShape, 150, 170, 5, 5.8)).toBe(true);
  });
});
