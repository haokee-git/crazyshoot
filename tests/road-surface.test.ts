/**
 * 跨地图道路表层合成契约（voxel-map-data 道路阶段）。
 *
 * 这里不测数组/颜色常量，而是真的跑 `buildVoxelMapData`，再用 `blockAt` /
 * `columnTop` / `heights` 读生成后的顶层材质：
 *  - 四张旧图的作者场坪（preserveUnderRoads）在道路核心/肩带下保持原材质；
 *  - 法老图的人工场坪与道路交点逐格保留，且主路横断面是「沥青核心 + 压实自然肩带
 *    + 肩带外恢复自然」，不再出现 18 m 沙砾色带；
 *  - 肩带只在 road.shoulder > 0 时出现，local 不动底层；preserve 格不改；
 *  - 跑道/滑行道仍覆盖人工场坪，水体不被道路填色；
 *  - 普通自然地面上的道路仍然正常铺装；
 *  - surfacePriority 高者胜、平手后 patch 胜。
 *
 * 法老图的 preserve 元数据与肩带宽度由法老任务负责写入；本测试动态读取当前
 * `MapDef`。若法老 roads 适配层尚未带 shoulder，则用同一套法老几何/地形注入
 * 合约要求的 main 10 m + shoulder 2 m / compacted（不修改源文件）来验证消费端。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { BLOCK, blockAt, buildVoxelMapData, inPolygon, type TerrainData } from '../src/game/world/voxel-map-data';
import type { MapDef, Road, TerrainPatch, TerrainKind } from '../src/maps/types';
import { docks } from '../src/maps/docks';
import { brokenBridge } from '../src/maps/broken-bridge';
import { garden } from '../src/maps/garden';
import { airfield } from '../src/maps/airfield';
import { pharaoh } from '../src/maps/pharaoh';

/* ------------------------------------------------------------------ */
/* 读数工具                                                            */
/* ------------------------------------------------------------------ */

function cellIndex(data: TerrainData, x: number, z: number) {
  return (Math.floor(z) - data.minZ) * data.width + (Math.floor(x) - data.minX);
}

function isInsideCell(data: TerrainData, x: number, z: number) {
  const ix = Math.floor(x) - data.minX;
  const iz = Math.floor(z) - data.minZ;
  return ix >= 0 && iz >= 0 && ix < data.width && iz < data.depth;
}

/** 地面顶层体素（道路/patch 都写 heights-1；不受树冠/屋顶影响）。 */
function groundTop(data: TerrainData, x: number, z: number) {
  if (!isInsideCell(data, x, z)) return -1;
  const k = cellIndex(data, x, z);
  return blockAt(data, x + 0.5, Math.floor(data.heights[k]) - 1, z + 0.5);
}

/** 整列最高体素（桥面箱等后置几何用；普通地面与 groundTop 相同）。 */
function columnTop(data: TerrainData, x: number, z: number) {
  if (!isInsideCell(data, x, z)) return -1;
  const k = cellIndex(data, x, z);
  const top = data.columnTop?.[k] ?? 0;
  return top > 0 ? blockAt(data, x + 0.5, data.minY + top - 1, z + 0.5) : -1;
}

function roadDistance(road: Road, x: number, z: number) {
  let best = Infinity;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1];
    const b = road.points[i];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return best;
}

function roadCoreAt(map: MapDef, x: number, z: number) {
  return map.roads.find((road) => roadDistance(road, x, z) <= road.width / 2);
}

function patchBounds(patch: TerrainPatch) {
  const xs = patch.polygon.map((p) => p[0]);
  const zs = patch.polygon.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

function forEachPatchCell(patch: TerrainPatch, fn: (x: number, z: number) => void) {
  const b = patchBounds(patch);
  for (let z = Math.floor(b.z0); z <= Math.ceil(b.z1); z++) {
    for (let x = Math.floor(b.x0); x <= Math.ceil(b.x1); x++) {
      if (inPolygon(x + 0.5, z + 0.5, patch.polygon)) fn(x, z);
    }
  }
}

function patchContaining(map: MapDef, kind: TerrainKind, x: number, z: number) {
  return map.terrain.find((patch) => patch.kind === kind && inPolygon(x, z, patch.polygon));
}

function insidePreservedPatch(map: MapDef, x: number, z: number) {
  return map.terrain.some((patch) => patch.preserveUnderRoads && inPolygon(x, z, patch.polygon));
}

/* ------------------------------------------------------------------ */
/* 夹具                                                                */
/* ------------------------------------------------------------------ */

interface Built {
  map: MapDef;
  data: TerrainData;
}

let docksReal: Built;
let brokenReal: Built;
let gardenReal: Built;
let airfieldReal: Built;
let pharaohReal: Built;
/** 法老图去掉 roads 后的同一份地形/建筑/场坪：用来读“作者地表本来是什么”。 */
let pharaohBaseline: Built;
/** 带 main 10 m + shoulder 2 m / compacted 的道路消费夹具（法老适配层未就绪时使用）。 */
let pharaohShoulder: Built;
let pharaohShoulderMap: MapDef;
let microPriority: TerrainData;
let microWater: TerrainData;

const build = (map: MapDef) => ({ map, data: buildVoxelMapData(map) });

/** 与维塔斯配置无关的最小地图：只用来钉 priority / tie / 水体行为。 */
function microMap(
  terrain: TerrainPatch[],
  roads: Road[],
  baseTerrain: TerrainKind = 'grass',
): MapDef {
  return {
    id: 'road-surface-micro',
    order: 99,
    schemaVersion: 1,
    name: '道路表层单测',
    nameEn: 'ROAD SURFACE MICRO',
    size: 64,
    baseTerrain,
    theme: 'test',
    summary: '',
    asymmetry: '',
    balance: '',
    terrain,
    roads,
    buildings: [],
    covers: [],
    props: [],
    capturePoints: [],
    spawns: [],
    vehiclePads: [],
    mgNests: [],
    specialCrates: [],
    routes: [],
    notes: [],
  };
}

const testTerrain = (kind: TerrainKind, polygon: [number, number][], extra: Partial<TerrainPatch> = {}): TerrainPatch => ({
  kind,
  polygon,
  elevation: 0,
  opacity: 1,
  ...extra,
});

/** 把法老主路适配成任务约定的 10 m + 两侧 2 m compacted 肩带（不写回源文件）。 */
function pharaohWithAuthoredShoulders(): MapDef {
  const roads = pharaoh.roads
    .filter((road) => road.kind !== 'shoulder')
    .map((road) =>
      road.kind === 'main' ? { ...road, shoulder: 2, verge: 'compacted' as const } : road,
    );
  return { ...pharaoh, roads };
}

const COMPACT_SOURCES = new Set([72, 73, 75, 76, 77, 78, 97, 102, 103, 105, 117]);
const COMPACT_TARGETS = new Set([74, 76, 104]);

function compactedVariant(id: number): number | null {
  if ([72, 73, 102, 103, 105].includes(id)) return 74;
  if ([75, 76].includes(id)) return 76;
  if ([77, 78, 97, 117].includes(id)) return 104;
  return null;
}

/** 法老当地铺装的 zoneHash 变体族（与 content/materials/pharaoh.ts 对齐）。 */
const PHARAOH_GROUND_GROUPS: number[][] = [
  [72, 73, 74, 102, 103, 104, 105],
  [75, 76],
  [80, 81, 82, 106, 107, 108, 109],
  [87, 110, 111],
  [88, 89, 112, 113],
  [77, 78, 97, 117],
  [95, 96, 116, 118],
];

function expectedSurfaceIds(map: MapDef, kind: TerrainKind): Set<number> {
  const base = map.terrainMaterials?.[kind];
  if (base === undefined) return new Set();
  if (map.id !== 'pharaoh') return new Set([base]);
  for (const group of PHARAOH_GROUND_GROUPS) if (group.includes(base)) return new Set(group);
  return new Set([base]);
}

beforeAll(() => {
  docksReal = build(docks);
  brokenReal = build(brokenBridge);
  gardenReal = build(garden);
  airfieldReal = build(airfield);
  pharaohReal = build(pharaoh);
  pharaohBaseline = build({ ...pharaoh, roads: [] });
  const authored = pharaoh.roads.some((road) => road.kind === 'main' && (road.shoulder ?? 0) > 0);
  pharaohShoulderMap = authored ? pharaoh : pharaohWithAuthoredShoulders();
  pharaohShoulder = authored ? pharaohReal : build(pharaohShoulderMap);

  // priority：低优先级 sand 全铺，高优先级 concrete 只压右半边；后 patch 平手覆盖。
  microPriority = buildVoxelMapData(
    microMap(
      [
        testTerrain('sand', [[10, 10], [40, 10], [40, 40], [10, 40]], { surfacePriority: 1 }),
        testTerrain('concrete', [[25, 10], [50, 10], [50, 40], [25, 40]], {
          surfacePriority: 2,
          preserveUnderRoads: true,
        }),
        testTerrain('stone', [[10, 45], [20, 45], [20, 55], [10, 55]]),
        testTerrain('asphalt', [[15, 45], [25, 45], [25, 55], [15, 55]]),
      ],
      [{ points: [[10, 30], [55, 30]], width: 4, kind: 'secondary' }],
    ),
  );

  // 水体：低水位（heights < -2）与水面 patch 两种都不得被铺路。
  microWater = buildVoxelMapData(
    microMap(
      [testTerrain('water', [[40, 40], [60, 40], [60, 60], [40, 60]])],
      [{ points: [[30, 50], [64, 50]], width: 4, kind: 'secondary' }],
    ),
  );
}, 240_000);

/* ------------------------------------------------------------------ */
/* 旧四图：作者人工场坪保留                                             */
/* ------------------------------------------------------------------ */

describe('旧四图作者场坪（preserveUnderRoads）', () => {
  it('docks 东码头 concrete 不被 EAST QUAY RD / PIER A / PIER SPUR 盖成沥青', () => {
    const patch = patchContaining(docks, 'concrete', 225.5, 120.5)!;
    expect(patch, '东码头 concrete patch 必须存在').toBeTruthy();
    expect(patch.preserveUnderRoads, '东码头应显式 preserveUnderRoads').toBe(true);
    let coreCells = 0;
    const bad: string[] = [];
    forEachPatchCell(patch, (x, z) => {
      if (!roadCoreAt(docks, x + 0.5, z + 0.5)) return;
      coreCells++;
      const top = groundTop(docksReal.data, x, z);
      if (top !== BLOCK.CONCRETE) bad.push(`(${x},${z})=${top}`);
    });
    expect(coreCells, '东码头必须真的与道路核心相交（不是空断言）').toBeGreaterThan(50);
    expect(bad, `保留格不得被沥青/白漆覆盖：${bad.slice(0, 8).join(', ')}`).toEqual([]);
    expect(groundTop(docksReal.data, 225, 120)).toBe(BLOCK.CONCRETE);
    expect(groundTop(docksReal.data, 206, 120)).toBe(BLOCK.CONCRETE);
  });

  it('broken_bridge 加油站 concrete 与完整桥面 concrete 保留', () => {
    const gas = patchContaining(brokenBridge, 'concrete', 165.5, 210.5)!;
    expect(gas.preserveUnderRoads).toBe(true);
    let gasHits = 0;
    const gasBad: string[] = [];
    forEachPatchCell(gas, (x, z) => {
      if (!roadCoreAt(brokenBridge, x + 0.5, z + 0.5)) return;
      gasHits++;
      const top = groundTop(brokenReal.data, x, z);
      if (top !== BLOCK.CONCRETE) gasBad.push(`(${x},${z})=${top}`);
    });
    expect(gasHits, '加油站混凝土必须真的被镇前道路核心压到').toBeGreaterThan(5);
    expect(gasBad).toEqual([]);

    const deckPatch = patchContaining(brokenBridge, 'concrete', 130.5, 150.5)!;
    expect(deckPatch.preserveUnderRoads, '完整桥面 patch 应 preserveUnderRoads').toBe(true);
    // 桥面是后置 box（y=1..2），不受道路材质影响；顶端仍是混凝土。
    expect(columnTop(brokenReal.data, 130, 150)).toBe(BLOCK.CONCRETE);
    // 河谷低于水面：主路核心经过的河床不得被铺成沥青/白漆（断桥桥面另有 box）。
    const bedK = cellIndex(brokenReal.data, 132, 140);
    expect(brokenReal.data.heights[bedK], '河床应低于水面 -2 m').toBeLessThan(-2);
    const bedTop = groundTop(brokenReal.data, 132, 140);
    expect([BLOCK.ROAD, BLOCK.WHITE], '水体不得被道路填色').not.toContain(bedTop);
    expect(columnTop(brokenReal.data, 132, 140)).toBe(BLOCK.CONCRETE);
  });

  it('garden 石铺广场 / 庄园前庭 / 服务院 / 门房前庭保持作者材质', () => {
    const plaza = patchContaining(garden, 'stone', 150.5, 135.5)!;
    expect(plaza.preserveUnderRoads, '中央广场 stone preserve').toBe(true);
    expect(groundTop(gardenReal.data, 150, 135)).toBe(27); // terrainMaterial('stone') = 27 (limestone)

    const forecourt = patchContaining(garden, 'stone', 210.5, 118.5)!;
    expect(forecourt.preserveUnderRoads, '庄园前庭 stone preserve').toBe(true);
    expect(groundTop(gardenReal.data, 210, 118)).toBe(27);

    // 东服务院：外环 path x=276.5 真的纵穿它 —— 逐格必须是 concrete。
    const yard = patchContaining(garden, 'concrete', 276.5, 80.5)!;
    expect(yard.preserveUnderRoads, '东服务院 concrete preserve').toBe(true);
    let yardHits = 0;
    const yardBad: string[] = [];
    forEachPatchCell(yard, (x, z) => {
      if (!roadCoreAt(garden, x + 0.5, z + 0.5)) return;
      yardHits++;
      const top = groundTop(gardenReal.data, x, z);
      if (top !== BLOCK.CONCRETE) yardBad.push(`(${x},${z})=${top}`);
    });
    expect(yardHits, '服务院必须真的被外环道路压到').toBeGreaterThan(50);
    expect(yardBad).toEqual([]);

    // 东门房前庭：东门外环 secondary 的核心伸进前庭西缘。
    const gate = patchContaining(garden, 'concrete', 258.5, 150.5)!;
    expect(gate.preserveUnderRoads, '门房前庭 concrete preserve').toBe(true);
    let gateHits = 0;
    const gateBad: string[] = [];
    forEachPatchCell(gate, (x, z) => {
      if (!roadCoreAt(garden, x + 0.5, z + 0.5)) return;
      gateHits++;
      const top = groundTop(gardenReal.data, x, z);
      if (top !== BLOCK.CONCRETE) gateBad.push(`(${x},${z})=${top}`);
    });
    expect(gateHits).toBeGreaterThan(5);
    expect(gateBad).toEqual([]);
  });

  it('airfield 机坪 asphalt / 塔台货运场 / 员工停车场 concrete 保留；机库道白漆被抑制', () => {
    const south = patchContaining(airfield, 'asphalt', 150.5, 60.5)!;
    expect(south.preserveUnderRoads, '南侧机坪 asphalt preserve').toBe(true);
    const north = patchContaining(airfield, 'asphalt', 143.5, 220.5)!;
    expect(north.preserveUnderRoads, '北侧航站坪 asphalt preserve').toBe(true);
    const cargo = patchContaining(airfield, 'concrete', 250.5, 230.5)!;
    expect(cargo.preserveUnderRoads, '塔台货运场 concrete preserve').toBe(true);
    const parking = patchContaining(airfield, 'concrete', 60.5, 210.5)!;
    expect(parking.preserveUnderRoads, '员工停车场 concrete preserve').toBe(true);

    // 机库道（secondary）穿过南侧机坪：中线本该有交替白漆，preserve 后必须是纯 asphalt。
    const hangarRoad = airfield.roads.find((road) => road.label === '机库道')!;
    let centerline = 0;
    let wouldBeDash = 0;
    const dashBad: string[] = [];
    forEachPatchCell(south, (x, z) => {
      const distance = roadDistance(hangarRoad, x + 0.5, z + 0.5);
      if (distance > hangarRoad.width / 2) return;
      if (distance >= 0.55) return;
      // 南滑行道 z=116 的 10 m 核心会压到机坪南缘 z=111..112；跑道/滑行道例外优先，
      // 这些格不是 secondary 的 preserve 断言对象。
      const governed = airfield.roads.some(
        (road) => (road.kind === 'runway' || road.kind === 'taxiway') && roadDistance(road, x + 0.5, z + 0.5) <= road.width / 2,
      );
      if (governed) return;
      centerline++;
      const top = groundTop(airfieldReal.data, x, z);
      if (top !== BLOCK.ROAD) dashBad.push(`(${x},${z})=${top}`);
      if (top !== BLOCK.WHITE && top !== BLOCK.ROAD) dashBad.push(`(${x},${z})=?${top}`);
      // 同一格在未 preserve 时会落白漆的奇偶段：这里只确认确实存在这种格。
      const a = hangarRoad.points[0];
      const b = hangarRoad.points[1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const t = Math.max(0, Math.min(1, ((x + 0.5 - a[0]) * (b[0] - a[0]) + (z + 0.5 - a[1]) * (b[1] - a[1])) / (len * len || 1)));
      if (Math.floor((t * len) / 6) % 2 === 0) wouldBeDash++;
    });
    expect(centerline, '机库道必须真的穿过南机坪').toBeGreaterThan(20);
    expect(wouldBeDash, '应存在“无 preserve 会落白漆”的中线格').toBeGreaterThan(5);
    expect(dashBad, `机坪上的道路中线不得压白漆：${dashBad.slice(0, 6).join(', ')}`).toEqual([]);

    expect(groundTop(airfieldReal.data, 150, 60)).toBe(BLOCK.ROAD);
    expect(groundTop(airfieldReal.data, 143, 220)).toBe(BLOCK.ROAD);
    expect(groundTop(airfieldReal.data, 60, 210)).toBe(BLOCK.CONCRETE);
    expect(groundTop(airfieldReal.data, 250, 230)).toBe(BLOCK.CONCRETE);
  });

  it('airfield 跑道/滑行道仍覆盖人工场坪：跑道口混凝土、滑行道压过北机坪边缘', () => {
    // (78,150) 同时位于 09/27 跑道与南北向联络滑行道核心，顶层必须是混凝土/白漆。
    expect([BLOCK.CONCRETE, BLOCK.WHITE]).toContain(groundTop(airfieldReal.data, 78, 150));
    // 离开中线一点，排除白漆：仍是跑道混凝土。
    expect(groundTop(airfieldReal.data, 78, 152)).toBe(BLOCK.CONCRETE);
    // 北侧滑行道 z=184 的南缘压到北机坪 (preserve) 的 z=188 行：runway/taxiway 例外必须胜出。
    expect(groundTop(airfieldReal.data, 100, 188)).toBe(BLOCK.CONCRETE);
    // 跑道 × 滑行道交叉口整块不得露出草地/asphalt。
    for (let x = 74; x <= 82; x++) {
      for (let z = 146; z <= 154; z++) {
        expect([BLOCK.CONCRETE, BLOCK.WHITE], `(${x},${z}) 应为跑道混凝土/标线`).toContain(
          groundTop(airfieldReal.data, x, z),
        );
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 法老图                                                              */
/* ------------------------------------------------------------------ */

describe('法老图：作者场坪与主路横断面', () => {
  it('所有 preserve 场坪与道路核心交点都保持作者地表（含 stone/concrete 场坪）', () => {
    let intersections = 0;
    let preserved = 0;
    let hardHits = 0;
    const changed: string[] = [];
    const hardSamples: string[] = [];
    for (const patch of pharaoh.terrain) {
      if (!patch.preserveUnderRoads) continue;
      forEachPatchCell(patch, (x, z) => {
        if (!roadCoreAt(pharaoh, x + 0.5, z + 0.5)) return;
        intersections++;
        const realTop = groundTop(pharaohReal.data, x, z);
        const authoredTop = groundTop(pharaohBaseline.data, x, z);
        if (realTop === authoredTop) preserved++;
        else changed.push(`(${x},${z}) ${patch.kind} ${authoredTop}->${realTop}`);
        if (['stone', 'concrete', 'asphalt'].includes(patch.kind)) {
          hardHits++;
          if (hardSamples.length < 5) hardSamples.push(`${patch.kind}@${x},${z}=${realTop}`);
        }
      });
    }
    expect(intersections, '法老人工场坪必须真的与道路核心相交').toBeGreaterThan(100);
    expect(changed, `preserve 格被道路改材质：${changed.slice(0, 8).join(', ')}`).toEqual([]);
    expect(preserved).toBe(intersections);
    expect(hardHits, '必须包含 stone/concrete/asphalt 人工场坪交点').toBeGreaterThan(0);
    expect(hardSamples.length).toBeGreaterThan(0);
  });

  it('主路横断面：沥青核心 → 2 m 压实肩带 → 肩带外自然地表（没有 18 m 色带）', () => {
    const road = pharaohShoulderMap.roads.find((candidate) => candidate.kind === 'main' && (candidate.shoulder ?? 0) > 0);
    expect(road, '主路必须有 shoulder 宽度（法老适配层或测试夹具）').toBeTruthy();
    const shoulder = road!.shoulder ?? 0;
    expect(shoulder, '法老主路肩带应为 2 m').toBe(2);
    expect(road!.verge).toBe('compacted');

    const half = road!.width / 2;
    let cross: {
      cx: number;
      cz: number;
      core: [number, number];
      inner: [number, number];
      outside: [number, number];
    } | null = null;

    outer: for (let i = 1; i < road!.points.length; i++) {
      const a = road!.points[i - 1];
      const b = road!.points[i];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 60) continue;
      const nx = -dz / len;
      const nz = dx / len;
      for (let s = 15; s < len - 15; s += 4) {
        const cx = a[0] + (dx * s) / len;
        const cz = a[1] + (dz * s) / len;
        for (const sign of [1, -1]) {
          const at = (d: number): [number, number] => [
            Math.floor(cx + nx * d * sign) + 0.5,
            Math.floor(cz + nz * d * sign) + 0.5,
          ];
          const core = at(1.5);
          const inner = at(half + shoulder * 0.5);
          const outside = at(half + shoulder + 2.5);
          const coreTop = groundTop(pharaohShoulder.data, ...core);
          const innerBase = groundTop(pharaohBaseline.data, ...inner);
          const outsideBase = groundTop(pharaohBaseline.data, ...outside);
          const outsideTop = groundTop(pharaohShoulder.data, ...outside);
          if (coreTop !== BLOCK.ROAD) continue;
          if (!COMPACT_SOURCES.has(innerBase)) continue;
          if (outsideTop !== outsideBase) continue;
          if ([BLOCK.ROAD, BLOCK.WHITE, 22].includes(outsideBase)) continue;
          if (insidePreservedPatch(pharaoh, ...core) || insidePreservedPatch(pharaoh, ...inner) || insidePreservedPatch(pharaoh, ...outside)) continue;
          cross = { cx, cz, core, inner, outside };
          break outer;
        }
      }
    }

    expect(cross, '应能找到一段自然沙地上的主路横断面').toBeTruthy();
    const innerTop = groundTop(pharaohShoulder.data, ...cross!.inner);
    expect(innerTop, '肩带内应为低对比压实变体（74/76/104）').toBe(compactedVariant(groundTop(pharaohBaseline.data, ...cross!.inner)));
    expect(COMPACT_TARGETS.has(innerTop)).toBe(true);
    expect(innerTop).not.toBe(BLOCK.ROAD);
    expect(innerTop).not.toBe(22);
    expect(groundTop(pharaohShoulder.data, ...cross!.outside), '肩带外恢复自然地表').toBe(
      groundTop(pharaohBaseline.data, ...cross!.outside),
    );

    // 沿法线扫 0..12 m：核心沥青，肩带压实，外侧自然；任何位置都不得出现 classic 22 宽沙砾带。
    const nx = (cross!.inner[0] - cross!.core[0]) / (half + shoulder * 0.5);
    const nz = (cross!.inner[1] - cross!.core[1]) / (half + shoulder * 0.5);
    const line: { d: number; dist: number; x: number; z: number; top: number }[] = [];
    for (let d = 0; d <= 12; d += 1) {
      const x = Math.floor(cross!.cx + nx * d) + 0.5;
      const z = Math.floor(cross!.cz + nz * d) + 0.5;
      line.push({ d, dist: roadDistance(road!, x, z), x, z, top: groundTop(pharaohShoulder.data, x, z) });
    }
    expect(
      line.filter((sample) => sample.dist <= half - 1).every((sample) => sample.top === BLOCK.ROAD || sample.top === BLOCK.WHITE),
      '核心应为沥青（中线允许白漆）',
    ).toBe(true);
    expect(line.filter((sample) => sample.top === 22), '不得出现 22 号 gravel 宽色带').toEqual([]);
    for (const sample of line.filter((entry) => entry.dist > half + shoulder + 0.5)) {
      // 外侧可能碰到别的道路/建筑；只要求“不是被本条主路刷成沥青”的自然材质。
      expect(sample.top, `d=${sample.d} dist=${sample.dist.toFixed(2)} 外侧应恢复自然`).toBe(
        groundTop(pharaohBaseline.data, sample.x, sample.z),
      );
    }
  });

  it('Road.surface / markings 被消费：当地铺装生效，markings:false 不落白漆', () => {
    const surfaceRoads = pharaoh.roads.filter((road) => road.surface && road.markings === false);
    expect(surfaceRoads.length, '法老集市/神庙/驿站等当地铺装道路').toBeGreaterThan(5);
    let surfaceCells = 0;
    const wrong: string[] = [];
    for (const road of surfaceRoads) {
      const expected = expectedSurfaceIds(pharaoh, road.surface!);
      expect(expected.size, `${road.label ?? road.kind} 的铺装材质族`).toBeGreaterThan(0);
      const index = pharaoh.roads.indexOf(road);
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let s = 0.5; s < len; s += 2) {
          const x = Math.floor(a[0] + ((b[0] - a[0]) * s) / len);
          const z = Math.floor(a[1] + ((b[1] - a[1]) * s) / len);
          if (!isInsideCell(pharaohReal.data, x, z)) continue;
          if (insidePreservedPatch(pharaoh, x + 0.5, z + 0.5)) continue;
          const k = cellIndex(pharaohReal.data, x, z);
          if (pharaohReal.data.heights[k] < -2) continue;
          // 只认本条道路是最后一层道路核心的格，避免被交叉道路材质/标线干扰。
          const writers = pharaoh.roads
            .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
            .filter(({ candidate }) => roadDistance(candidate, x + 0.5, z + 0.5) <= candidate.width / 2);
          if (writers[writers.length - 1]?.candidateIndex !== index) continue;
          // 屋顶/建筑地板会盖过地面；地面层应与整列最高点一致。
          if ((pharaohReal.data.columnTop?.[k] ?? 0) !== Math.max(1, Math.floor(pharaohReal.data.heights[k]) - pharaohReal.data.minY)) continue;
          const top = groundTop(pharaohReal.data, x, z);
          surfaceCells++;
          if (!expected.has(top)) wrong.push(`${road.label ?? road.kind}@${x},${z}=${top}`);
          if (top === BLOCK.WHITE) wrong.push(`${road.label ?? road.kind}@${x},${z}=白漆`);
        }
      }
    }
    expect(surfaceCells, '当地铺装道路必须有真实生成格').toBeGreaterThan(100);
    expect(wrong, `当地铺装/无标线不符：${wrong.slice(0, 8).join(', ')}`).toEqual([]);

    // 主路仍按 kind 铺沥青并保留白漆中线（markings 缺省 = 旧行为）。
    const main = pharaoh.roads.find((road) => road.kind === 'main' && road.markings !== false)!;
    expect(main).toBeTruthy();
    let whiteMarks = 0;
    let asphalt = 0;
    for (let i = 1; i < main.points.length; i++) {
      const a = main.points[i - 1];
      const b = main.points[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0.5; s < len; s += 1) {
        const x = Math.floor(a[0] + ((b[0] - a[0]) * s) / len);
        const z = Math.floor(a[1] + ((b[1] - a[1]) * s) / len);
        if (!isInsideCell(pharaohReal.data, x, z)) continue;
        if (insidePreservedPatch(pharaoh, x + 0.5, z + 0.5)) continue;
        const k = cellIndex(pharaohReal.data, x, z);
        if (pharaohReal.data.heights[k] < -2) continue;
        const writers = pharaoh.roads.filter((candidate) => roadDistance(candidate, x + 0.5, z + 0.5) <= candidate.width / 2);
        if (writers[writers.length - 1] !== main) continue;
        const top = groundTop(pharaohReal.data, x, z);
        if (top === BLOCK.WHITE) whiteMarks++;
        if (top === BLOCK.ROAD) asphalt++;
      }
    }
    expect(whiteMarks, '主路应仍有白漆虚线').toBeGreaterThan(5);
    expect(asphalt, '主路核心应仍是沥青').toBeGreaterThan(100);
  });
});

/* ------------------------------------------------------------------ */
/* 通用行为                                                            */
/* ------------------------------------------------------------------ */

describe('道路合成通用规则', () => {
  it('普通自然地面上的道路仍正常铺装（断桥主路）', () => {
    // 断桥主路 x≈150 z=80：普通草地/土坡，不在任何 preserve 场坪内。
    expect(insidePreservedPatch(brokenBridge, 150.5, 80.5)).toBe(false);
    expect(groundTop(brokenReal.data, 150, 80)).toBe(BLOCK.ROAD);
    let paved = 0;
    for (let z = 70; z <= 100; z++) {
      if (groundTop(brokenReal.data, 150, z) === BLOCK.ROAD) paved++;
    }
    expect(paved).toBeGreaterThan(20);
  });

  it('surfacePriority 高者胜、平手后 patch 胜，preserve 格道路不覆盖', () => {
    // sand priority 1 全铺，concrete priority 2 压右半：左半 sand，右半 concrete。
    expect(groundTop(microPriority, 15, 20)).toBe(BLOCK.SAND);
    expect(groundTop(microPriority, 35, 20)).toBe(BLOCK.CONCRETE);
    // 平手（均默认 0）：后写的 asphalt 覆盖先写的 stone。
    expect(groundTop(microPriority, 12, 50)).toBe(27);
    expect(groundTop(microPriority, 18, 50)).toBe(BLOCK.ROAD);
    // 高优先级 concrete 带 preserve：横穿道路仍保持 concrete（连白漆都不落）。
    expect(groundTop(microPriority, 30, 30)).toBe(BLOCK.CONCRETE);
  });

  it('水体（水面 patch / 低于 -2）不得被道路填色', () => {
    // 新地图 micro：水面 patch 区域被 secondary 横穿，顶层仍是基础草地而不是沥青/白漆。
    for (let x = 42; x <= 58; x += 2) {
      expect([BLOCK.ROAD, BLOCK.WHITE]).not.toContain(groundTop(microWater, x, 50));
    }
    // 断桥河谷：heights < -2 的道路核心格不得落沥青。
    for (let z = 136; z <= 164; z += 2) {
      const k = cellIndex(brokenReal.data, 132, z);
      if (brokenReal.data.heights[k] >= -2) continue;
      expect([BLOCK.ROAD, BLOCK.WHITE]).not.toContain(groundTop(brokenReal.data, 132, z));
    }
  });
});
