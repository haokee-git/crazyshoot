import type { MapDef } from '../../maps/types';

/**
 * 通用地图世界结构注册表。
 *
 * 每张“手工地图”可以注册一个 builder：它通过同一组 TerrainData 写入原语生成
 * 建筑/桥梁/堤岸等体素与半格细节。builder 声明 `handlesBuildings` 后，通用
 * 1 m 方块建筑循环会跳过本图，避免两套几何重叠。旧四图与法老不注册 builder，
 * 行为完全不变。
 */
export interface MapWorldOps {
  ground(x: number, z: number): number;
  put(x: number, y: number, z: number, id: number): void;
  column(x: number, z: number, y0: number, y1: number, id: number): void;
  box(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, id: number): void;
  carve(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): void;
  detail(id: string, cx: number, cz: number, w: number, d: number, y: number, h: number, material: number, angle?: number, solid?: boolean): void;
  setPrimary(x: number, z: number, y: number): void;
  addLamp(x: number, y: number, z: number): void;
  addLadder(ladder: import('../../maps/battlefield-design').LadderDef): void;
}

export interface MapWorldBuilder {
  id: string;
  /** 本 builder 接管 map.buildings，通用方块建筑循环跳过。 */
  handlesBuildings?: boolean;
  build(map: MapDef, ops: MapWorldOps): void;
}

const builders = new Map<string, MapWorldBuilder>();

export function registerMapWorldBuilder(builder: MapWorldBuilder): void {
  builders.set(builder.id, builder);
}

export function getMapWorldBuilder(id: string): MapWorldBuilder | undefined {
  return builders.get(id);
}
