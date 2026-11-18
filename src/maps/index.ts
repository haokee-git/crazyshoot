import type { MapDef } from './types';
import { docks } from './docks';
import { brokenBridge } from './broken-bridge';
import { garden } from './garden';
import { airfield } from './airfield';
import { pharaoh } from './pharaoh';
import { miaoVillage } from './miao-village';
import { enhanceBattlefield } from './battlefield-design';

/** 内容注册表：新地图在此增加一行即可；UI/玩法从注册表读取，不硬编码地图列表。 */
export const MAPS: MapDef[] = [docks, brokenBridge, garden, airfield, pharaoh, miaoVillage].map(enhanceBattlefield);

export const MAP_BY_ID = new Map(MAPS.map((m) => [m.id, m]));

export function getMap(id: string): MapDef | undefined {
  return MAP_BY_ID.get(id);
}

export function assertUniqueMapIds(): void {
  const seen = new Set<string>();
  for (const m of MAPS) {
    if (seen.has(m.id)) throw new Error(`duplicate map id: ${m.id}`);
    seen.add(m.id);
  }
}

assertUniqueMapIds();
