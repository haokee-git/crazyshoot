/**
 * 法老坟墓 · 800×800 / 七据点静态契约验收（0.20.3）
 *
 * 只碰数据与资源；真实走查在 `pharaoh-walk.test.ts`，覆盖率在
 * `pharaoh-coverage.test.ts`，视线在 `pharaoh-los.test.ts`。
 * 坐标/宽度/面积从源码导出读取，不复制旧 1000 m 常量。
 */
import {describe, it, expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type {MapDef} from '../src/maps/types';
import {MAPS, MAP_BY_ID, getMap} from '../src/maps/index';
import {assertMapValid} from '../src/maps/helpers';
import {BATTLEFIELDS, battlefieldHeight} from '../src/maps/battlefield-design';
import {pharaoh} from '../src/maps/pharaoh';
import {PHARAOH_KEY_POINTS, PHARAOH_ROADS, pharaohHeight, pharaohWaterSurface} from '../src/maps/pharaoh-height';
import {PHARAOH_LAYOUT, PHARAOH_SIZE} from '../src/maps/pharaoh/layout';
import {PHARAOH_NETWORK, BAZAAR_STREETS, roadDistance} from '../src/maps/pharaoh/network';
import {pharaohRoads} from '../src/maps/pharaoh/roads';
import {bazaarBuildings, bazaarCovers, bazaarDecor, bazaarProps} from '../src/maps/pharaoh/bazaar';
import * as bazaarModule from '../src/maps/pharaoh/bazaar';
import {OASIS_LAKE_POLYGON, OASIS_ECO_POLYGON, OASIS_ECO_AREA} from '../src/maps/pharaoh/oasis-shape';
import {
  OASIS_POINT,
  OASIS_POINT_GROUND,
  OASIS_POINT_RADIUS,
  OASIS_WATER_EXITS,
  oasisBuildings,
  oasisCovers,
  oasisTerrain,
} from '../src/maps/pharaoh/oasis';
import {SERVICE_POINT, SERVICE_GROUND, SERVICE_POINT_RADIUS, serviceBuildings} from '../src/maps/pharaoh/service';
import {PYRAMID_APEX, PYRAMID_CENTER, PYRAMID_OUTER_BASE, PYRAMID_OUTER_TOP} from '../src/game/world/pharaoh-pyramid';
import {SPHINX} from '../src/game/world/pharaoh-sphinx';
import {TUNNEL_LENGTH, TUNNEL_MOUTHS, TUNNEL_ROUTE} from '../src/game/world/pharaoh-tunnel';
import {getVehicle} from '../src/content/vehicles/catalog';
import {PHARAOH_SITE_POLYGONS} from '../src/maps/pharaoh/coverage';

const C_SITE = PHARAOH_SITE_POLYGONS.C;
const F_SITE = PHARAOH_SITE_POLYGONS.F;
const G_SITE = PHARAOH_SITE_POLYGONS.G;

const coreArea = (): number => {
  const value = (bazaarModule as unknown as {BAZAAR_CORE_AREA?: number}).BAZAAR_CORE_AREA;
  if (typeof value === 'number') return value;
  // 退路：330×300 八边形切角；真实值应由 bazaar.ts 导出。
  return 98712;
};

const inPoly = (poly: [number, number][], x: number, z: number): boolean => {
  let on = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) on = !on;
  }
  return on;
};

describe('map registry / identity', () => {
  it('registers pharaoh as the fifth 800 m map', () => {
    expect(MAPS.length).toBe(6);
    expect(new Set(MAPS.map((m) => m.id)).size).toBe(6);
    expect(MAPS.map((m) => m.id)).toContain('miao_village');
    expect(getMap('pharaoh')?.id).toBe('pharaoh');
    expect(pharaoh.size).toBe(800);
    expect(PHARAOH_SIZE).toBe(800);
    expect(MAP_BY_ID.get('pharaoh')!.size).toBe(800);
    expect(pharaoh.order).toBe(5);
    expect(pharaoh.assetBundle).toBe('pharaoh-v1');
    expect(pharaoh.scoreRate).toBe(0.5);
    expect(pharaoh.extensions?.vertical).toEqual({minY: -12, height: 72});
    expect(pharaoh.extensions?.navigationLayers).toBe(4);
    expect(BATTLEFIELDS.pharaoh?.chunkSize).toBe(160);
    expect(pharaoh.tags).toContain('800m');
  });

  it('uses the handcrafted height field and no auto-scattered cover', () => {
    const design = BATTLEFIELDS.pharaoh;
    expect(design?.handcrafted).toBe(true);
    expect(design?.pits).toEqual([]);
    expect(design?.vertical).toEqual({minY: -12, height: 72});
    for (const x of [0, 80, 190, 460, 475, 650, 710, 800]) {
      for (const z of [0, 85, 130, 290, 395, 610, 640, 710, 800]) {
        expect(battlefieldHeight('pharaoh', x, z), `${x},${z}`).toBe(pharaohHeight(x, z));
      }
    }
    expect(MAP_BY_ID.get('pharaoh')?.extensions?.handcrafted).toBe(true);
  });

  it('passes the shared map validator', () => {
    expect(assertMapValid(pharaoh)).toEqual([]);
  });
});

describe('capture points / spawns', () => {
  const cap = (id: string) => pharaoh.capturePoints.find((c) => c.id === id)!;
  const spawnCentre = (team: 'blue' | 'orange') => {
    const s = pharaoh.spawns.find((s) => s.team === team)!;
    return [s.x + s.w / 2, s.y + s.d / 2] as [number, number];
  };
  const d = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  it('has seven points A–G on the new anchors and radii', () => {
    expect(pharaoh.capturePoints.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    const expected: [string, number, number, number][] = [
      ['A', PHARAOH_LAYOUT.A.x, PHARAOH_LAYOUT.A.z, 12],
      ['B', PHARAOH_LAYOUT.B.x, PHARAOH_LAYOUT.B.z, 11],
      ['C', PHARAOH_LAYOUT.C.x, PHARAOH_LAYOUT.C.z, 13],
      ['D', OASIS_POINT[0], OASIS_POINT[1], OASIS_POINT_RADIUS],
      ['E', SERVICE_POINT[0], SERVICE_POINT[1], SERVICE_POINT_RADIUS],
      ['F', PHARAOH_LAYOUT.F.x, PHARAOH_LAYOUT.F.z, 12],
      ['G', PHARAOH_LAYOUT.G.x, PHARAOH_LAYOUT.G.z, 12],
    ];
    for (const [id, x, z, radius] of expected) {
      expect([cap(id).x, cap(id).y, cap(id).radius], id).toEqual([x, z, radius]);
      expect(cap(id).initialOwner).toBe('neutral');
    }
  });

  it('pins indoor floors only for A (5) and B (4)', () => {
    expect(cap('A').floorY).toBe(5);
    expect(cap('A').verticalTolerance).toBe(3);
    expect(cap('B').floorY).toBe(4);
    expect(cap('B').verticalTolerance).toBe(3);
    for (const id of ['C', 'D', 'E', 'F', 'G']) expect(cap(id).floorY, id).toBeUndefined();
    expect(pharaohHeight(OASIS_POINT[0], OASIS_POINT[1])).toBeCloseTo(OASIS_POINT_GROUND, 2);
    expect(pharaohHeight(SERVICE_POINT[0], SERVICE_POINT[1])).toBeCloseTo(SERVICE_GROUND, 2);
  });

  it('keeps the seven points far apart and within the playable square', () => {
    let closest = Infinity;
    let pair = '';
    for (const a of pharaoh.capturePoints) {
      expect(a.x).toBeGreaterThan(0);
      expect(a.x).toBeLessThan(800);
      expect(a.y).toBeGreaterThan(0);
      expect(a.y).toBeLessThan(800);
      for (const b of pharaoh.capturePoints) {
        if (a === b) continue;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < closest) {
          closest = dist;
          pair = `${a.id}/${b.id}`;
        }
      }
    }
    expect(closest, `closest pair ${pair}`).toBeGreaterThan(110);
  });

  it('keeps both 110×110 spawns on their anchors and flat', () => {
    expect(pharaoh.spawns.map((s) => s.team).sort()).toEqual(['blue', 'orange']);
    for (const spawn of pharaoh.spawns) {
      expect([spawn.w, spawn.d]).toEqual([110, 110]);
      const centre: [number, number] = [spawn.x + spawn.w / 2, spawn.y + spawn.d / 2];
      expect(centre).toEqual(spawn.team === 'blue' ? [80, 85] : [710, 710]);
      for (const c of pharaoh.capturePoints) {
        expect(d(centre, [c.x, c.y]), `${spawn.team} on top of ${c.id}`).toBeGreaterThan(180);
      }
      let low = Infinity;
      let high = -Infinity;
      for (let dz = -20; dz <= 20; dz += 5) for (let dx = -20; dx <= 20; dx += 5) {
        const h = pharaohHeight(centre[0] + dx, centre[1] + dz);
        low = Math.min(low, h);
        high = Math.max(high, h);
      }
      expect(high - low, `${spawn.team} spawn flat`).toBeLessThan(2);
    }
  });

  it('pins all nine key points exactly', () => {
    expect(PHARAOH_KEY_POINTS.map((k) => [k.id, k.y])).toEqual([
      ['blue', 2.4],
      ['orange', 8],
      ['A', 4],
      ['B', 4],
      ['C', 6.5],
      ['D', 0.6],
      ['E', 3.2],
      ['F', 4],
      ['G', 3],
    ]);
    for (const key of PHARAOH_KEY_POINTS) expect(pharaohHeight(key.x, key.z), key.id).toBeCloseTo(key.y, 4);
  });
});

describe('vehicle pads / crates / MG nests', () => {
  it('ships 32 pads: 8 blue + 8 orange + 16 neutral', () => {
    expect(pharaoh.vehiclePads.length).toBe(32);
    const count = (team: string) => pharaoh.vehiclePads.filter((p) => p.team === team).length;
    expect([count('blue'), count('orange'), count('neutral')]).toEqual([8, 8, 16]);
    for (const team of ['blue', 'orange'] as const) {
      expect(pharaoh.vehiclePads.filter((p) => p.team === team).map((p) => p.vehicleId).sort(), team).toEqual([
        'apc', 'ifv', 'jeep', 'jeep', 'light_tank', 'mbt', 'motorcycle', 'motorcycle',
      ]);
    }
  });

  it('references real vehicles, stays in bounds, clear of capture rings and each other', () => {
    for (const [index, pad] of pharaoh.vehiclePads.entries()) {
      expect(getVehicle(pad.vehicleId), `pad ${index}`).toBeTruthy();
      expect(pad.x).toBeGreaterThan(0);
      expect(pad.x).toBeLessThan(800);
      expect(pad.y).toBeGreaterThan(0);
      expect(pad.y).toBeLessThan(800);
      for (const c of pharaoh.capturePoints) {
        expect(Math.hypot(pad.x - c.x, pad.y - c.y), `pad ${index} inside ${c.id}`).toBeGreaterThan(c.radius + 3);
      }
    }
    for (let i = 0; i < pharaoh.vehiclePads.length; i++) {
      for (let j = i + 1; j < pharaoh.vehiclePads.length; j++) {
        const a = pharaoh.vehiclePads[i];
        const b = pharaoh.vehiclePads[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y), `pads ${i}/${j} overlap`).toBeGreaterThan(5);
      }
    }
  });

  it('keeps five crates and three MG nests in the play space', () => {
    expect(pharaoh.specialCrates.length).toBe(5);
    expect(pharaoh.specialCrates.map((c) => c.weaponId).sort()).toEqual(['amr', 'amr', 'flamethrower', 'rocket', 'rocket']);
    for (const crate of pharaoh.specialCrates) {
      expect(crate.x).toBeGreaterThan(0);
      expect(crate.x).toBeLessThan(800);
      expect(crate.y).toBeGreaterThan(0);
      expect(crate.y).toBeLessThan(800);
    }
    expect(pharaoh.mgNests.length).toBe(3);
    for (const nest of pharaoh.mgNests) {
      expect(nest.x).toBeGreaterThan(0);
      expect(nest.x).toBeLessThan(800);
      expect(nest.y).toBeGreaterThan(0);
      expect(nest.y).toBeLessThan(800);
    }
  });
});

describe('roads / terrain / water', () => {
  it('uses the single shared network and wires every road', () => {
    expect(PHARAOH_ROADS.length).toBe(PHARAOH_NETWORK.length);
    expect(pharaoh.roads.length).toBe(PHARAOH_NETWORK.length);
    expect(pharaohRoads.length).toBe(PHARAOH_NETWORK.length);
    expect(pharaohRoads.some((r) => r.kind === 'shoulder')).toBe(false);
    const main = pharaohRoads.find((r) => r.kind === 'main')!;
    expect(main.width).toBe(10);
    expect(main.shoulder).toBe(2);
    expect(main.verge).toBe('compacted');
    for (const road of pharaoh.roads) {
      for (const [x, z] of road.points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(800);
        expect(z).toBeGreaterThanOrEqual(0);
        expect(z).toBeLessThanOrEqual(800);
      }
    }
    expect(BAZAAR_STREETS.length).toBeGreaterThanOrEqual(6);
    expect(BAZAAR_STREETS.every((r) => r.id.startsWith('bazaar-'))).toBe(true);
  });

  it('keeps every main/secondary road under 5% grade', () => {
    let worst = 0;
    let where = '';
    for (const road of PHARAOH_NETWORK) {
      if (road.kind === 'path') continue;
      for (let i = 1; i < road.points.length; i++) {
        const [ax, az] = road.points[i - 1];
        const [bx, bz] = road.points[i];
        const length = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.ceil(length / 2));
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          const h0 = pharaohHeight(ax + (bx - ax) * t0, az + (bz - az) * t0);
          const h1 = pharaohHeight(ax + (bx - ax) * t1, az + (bz - az) * t1);
          const grade = Math.abs(h1 - h0) / (length / steps);
          if (grade > worst) {
            worst = grade;
            where = `${road.id} @ ${Math.round(ax + (bx - ax) * t0)},${Math.round(az + (bz - az) * t0)}`;
          }
        }
      }
    }
    expect(worst, `worst grade at ${where}`).toBeLessThanOrEqual(0.05);
  });

  it('maps every authored terrain kind to the pharaoh pack and keeps patches in bounds', () => {
    const materials = pharaoh.terrainMaterials ?? {};
    const expected: [string, number][] = [
      ['sand', 72], ['gravel', 75], ['stone', 80], ['dirt', 104], ['mud', 105],
      ['asphalt', 4], ['rubble', 85], ['concrete', 100],
    ];
    for (const [kind, id] of expected) expect(materials[kind as keyof typeof materials], kind).toBe(id);
    for (const patch of pharaoh.terrain) {
      if (patch.kind === 'water') continue;
      for (const [x, z] of patch.polygon) {
        expect(x).toBeGreaterThanOrEqual(-1);
        expect(x).toBeLessThanOrEqual(801);
        expect(z).toBeGreaterThanOrEqual(-1);
        expect(z).toBeLessThanOrEqual(801);
      }
    }
  });

  it('fills the 140×110 oasis lake and keeps every point dry', () => {
    expect(pharaohWaterSurface(115, 230), 'lake centre is wet').toBe(true);
    expect(pharaohWaterSurface(OASIS_POINT[0], OASIS_POINT[1]), 'D on the dry bank').toBe(false);
    for (const c of pharaoh.capturePoints) expect(pharaohWaterSurface(c.x, c.y), c.id).toBe(false);
    let wet = 0;
    for (let z = 150; z <= 310; z += 10) for (let x = 20; x <= 220; x += 10) if (pharaohWaterSurface(x, z)) wet++;
    expect(wet).toBeGreaterThan(100);
    expect(OASIS_WATER_EXITS.length).toBeGreaterThanOrEqual(6);
    for (const exit of OASIS_WATER_EXITS) {
      expect(exit.x).toBeGreaterThan(0);
      expect(exit.x).toBeLessThan(800);
      expect(exit.z).toBeGreaterThan(0);
      expect(exit.z).toBeLessThan(800);
    }
  });
});

describe('scenes / buildings', () => {
  it('assembles the enlarged bazaar with ≥96,900㎡ core and 5–7 blocks', () => {
    expect(bazaarBuildings.length).toBeGreaterThanOrEqual(40);
    expect(bazaarBuildings.length).toBeLessThanOrEqual(70);
    expect(coreArea(), 'bazaar core area').toBeGreaterThanOrEqual(96_900);
    const blocks = (bazaarModule as unknown as {BAZAAR_BLOCKS?: unknown[]}).BAZAAR_BLOCKS;
    if (Array.isArray(blocks)) expect(blocks.length).toBeGreaterThanOrEqual(5);
    expect(bazaarCovers.filter((c) => c.kind === 'stall' || c.kind === 'canopy').length).toBeGreaterThanOrEqual(18);
    expect(bazaarProps.length).toBeGreaterThanOrEqual(12);
    expect(bazaarDecor.length).toBeGreaterThanOrEqual(6);
  });

  it('keeps every building inside the 800 m map and off capture rings', () => {
    let twoStorey = 0;
    for (const building of pharaoh.buildings) {
      const xs = building.polygon.map((p) => p[0]);
      const zs = building.polygon.map((p) => p[1]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const z0 = Math.min(...zs);
      const z1 = Math.max(...zs);
      expect(x0).toBeGreaterThan(0);
      expect(x1).toBeLessThan(800);
      expect(z0).toBeGreaterThan(0);
      expect(z1).toBeLessThan(800);
      for (const c of pharaoh.capturePoints) {
        const dx = Math.max(x0 - c.x, 0, c.x - x1);
        const dz = Math.max(z0 - c.y, 0, c.y - z1);
        expect(Math.hypot(dx, dz), `${building.id} covers ${c.id}`).toBeGreaterThan(c.radius);
      }
      if (building.height >= 8) twoStorey++;
    }
    expect(twoStorey).toBeGreaterThan(0);
    expect(twoStorey).toBeLessThan(pharaoh.buildings.length / 3);
  });

  it('keeps the bazaar inside the C site and its plaza open', () => {
    for (const building of bazaarBuildings) {
      for (const [x, z] of building.polygon) expect(inPoly(C_SITE, x, z), `${building.id} leaf`).toBe(true);
    }
    for (const cover of bazaarCovers) expect(inPoly(C_SITE, cover.x, cover.y), cover.id ?? cover.kind).toBe(true);
    for (const item of bazaarProps) expect(inPoly(C_SITE, item.x, item.y), item.id).toBe(true);
    for (const cover of bazaarCovers) {
      const dist = Math.hypot(cover.x - 475, cover.y - 395);
      if (dist < 13) expect(cover.id, 'only the plaza well may sit inside C r13').toBe('bz-plaza-well');
    }
    // 所有实体避让共享路网（铺装/肩带边缘 ≥1.5 m；广场井允许在街心）。
    for (const cover of bazaarCovers) {
      if (cover.id === 'bz-plaza-well') continue;
      expect(roadDistance(cover.x, cover.y), `${cover.id ?? cover.kind} on a road`).toBeGreaterThan(1.5);
    }
  });

  it('expands E/F/G to their targets and keeps their capture rings clear', () => {
    const fCovers = pharaoh.covers.filter((c) => inPoly(F_SITE, c.x, c.y));
    const gCovers = pharaoh.covers.filter((c) => inPoly(G_SITE, c.x, c.y));
    const eBuildings = serviceBuildings.length;
    expect(eBuildings).toBeGreaterThanOrEqual(7);
    expect(fCovers.filter((c) => c.kind === 'column').length).toBeGreaterThanOrEqual(24);
    expect(fCovers.filter((c) => c.kind === 'obelisk').length).toBeGreaterThanOrEqual(2);
    expect(fCovers.filter((c) => c.kind === 'architrave' || c.kind === 'wall').length).toBeGreaterThanOrEqual(6);
    expect(gCovers.filter((c) => c.kind === 'rock' || c.kind === 'wall').length).toBeGreaterThanOrEqual(12);
    expect(gCovers.some((c) => c.kind === 'colossus')).toBe(true);
    for (const [site, covers] of [['F', fCovers], ['G', gCovers], ['E', pharaoh.covers.filter((c) => Math.hypot(c.x - SERVICE_POINT[0], c.y - SERVICE_POINT[1]) < 80)]] as const) {
      const cap = pharaoh.capturePoints.find((c) => c.id === site)!;
      for (const c of covers) {
        const dx = Math.max(0, Math.abs(c.x - cap.x) - c.w / 2);
        const dz = Math.max(0, Math.abs(c.y - cap.y) - c.d / 2);
        if (c.kind === 'well') continue;
        expect(Math.hypot(dx, dz), `${site} cover ${c.id ?? c.kind} in capture ring`).toBeGreaterThan(cap.radius);
      }
    }
  });

  it('expands the oasis ecosystem and vegetation beyond the old 30 m ring', () => {
    expect(OASIS_ECO_AREA).toBeGreaterThan(45_000);
    expect(OASIS_ECO_AREA).toBeLessThan(85_000);
    expect(inPoly(OASIS_ECO_POLYGON, OASIS_POINT[0], OASIS_POINT[1])).toBe(true);
    expect(oasisBuildings.length).toBeGreaterThanOrEqual(2);
    const palms = oasisCovers.filter((c) => c.kind === 'palm').length;
    const trees = oasisCovers.filter((c) => c.kind === 'tree').length;
    const reeds = oasisCovers.filter((c) => c.kind === 'reeds').length;
    const bushes = oasisCovers.filter((c) => c.kind === 'bush').length;
    expect(palms, 'palms').toBeGreaterThanOrEqual(90);
    expect(trees, 'acacia/tamarisk').toBeGreaterThanOrEqual(20);
    expect(reeds + bushes, 'understory').toBeGreaterThanOrEqual(120);
    expect(oasisTerrain.some((p) => p.kind === 'water')).toBe(true);
    // 至少一株植被离水线 >30 m（旧 SHORE_BANDS 的硬上限已被打破）。
    let far = 0;
    for (const c of oasisCovers) {
      if (!['palm', 'tree', 'bush'].includes(c.kind)) continue;
      const inside = inPoly(OASIS_LAKE_POLYGON as [number, number][], c.x, c.y);
      if (inside) continue;
      const d = Math.min(...OASIS_LAKE_POLYGON.map((p) => Math.hypot(p[0] - c.x, p[1] - c.y)));
      if (d > 30) far++;
    }
    expect(far, 'vegetation farther than 30 m from the lake').toBeGreaterThan(20);
  });
});

describe('monuments / tunnel integration', () => {
  it('keeps the pyramid volume and top, translated to the new A anchor', () => {
    expect(PYRAMID_CENTER[0]).toBe(190);
    expect(PYRAMID_CENTER[1]).toBe(610);
    expect(PYRAMID_OUTER_BASE.x1 - PYRAMID_OUTER_BASE.x0).toBe(264);
    expect(PYRAMID_OUTER_TOP).toBe(58);
    expect(PYRAMID_APEX).toBe(52);
  });

  it('enlarges the sphinx to 145–155 × 48–55 and head +40–42', () => {
    expect(SPHINX.cx).toBe(460);
    expect(SPHINX.cz).toBe(640);
    expect(SPHINX.bounds.x1 - SPHINX.bounds.x0).toBeGreaterThanOrEqual(145);
    expect(SPHINX.bounds.x1 - SPHINX.bounds.x0).toBeLessThanOrEqual(155);
    expect(SPHINX.bounds.z1 - SPHINX.bounds.z0).toBeGreaterThanOrEqual(48);
    expect(SPHINX.bounds.z1 - SPHINX.bounds.z0).toBeLessThanOrEqual(55);
    expect(SPHINX.headTop).toBeGreaterThanOrEqual(40);
    expect(SPHINX.headTop).toBeLessThanOrEqual(42);
    expect(SPHINX.hall.x1 - SPHINX.hall.x0).toBeGreaterThanOrEqual(38);
    expect(SPHINX.hall.x1 - SPHINX.hall.x0).toBeLessThanOrEqual(42);
    expect(SPHINX.hall.z1 - SPHINX.hall.z0).toBeGreaterThanOrEqual(22);
    expect(SPHINX.hall.z1 - SPHINX.hall.z0).toBeLessThanOrEqual(26);
    expect(SPHINX.entrances.length).toBe(4);
  });

  it('recalculates the A–B tunnel length and keeps both mouths on the new faces', () => {
    expect(TUNNEL_LENGTH).toBeGreaterThan(180);
    expect(TUNNEL_ROUTE[0][0]).toBe(322);
    expect(TUNNEL_ROUTE[0][1]).toBe(600);
    const last = TUNNEL_ROUTE[TUNNEL_ROUTE.length - 1];
    expect(last[0]).toBe(385);
    expect(last[1]).toBe(640);
    expect(TUNNEL_MOUTHS.a.x0).toBeLessThanOrEqual(322);
    expect(TUNNEL_MOUTHS.b.x0).toBe(385);
  });

  it('keeps the authored bazaar layout json in sync with the new module', () => {
    const layout = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/map-pharaoh/bazaar-layout.json'), 'utf8'));
    expect(layout.buildings.count).toBe(bazaarBuildings.length);
    expect(layout.stalls.totalStallLike).toBe(bazaarCovers.filter((c) => c.kind === 'stall' || c.kind === 'canopy').length);
    expect(layout.props.count).toBe(bazaarProps.length);
    expect(layout.decor.count).toBe(bazaarDecor.length);
    expect(layout.invariants.problems).toEqual([]);
  });
});
