/**
 * 特殊单兵武器目录。
 *
 * 扩展方式：新增一条 SpecialWeaponDef + 模型/参数，地图 SpecialCrate 只引用 id。
 * 不需要改 MapDef、地图渲染器或 UI 枚举。
 */
export interface SpecialWeaponDef {
  id: string;
  name: string;
  short: string;
  /** 3 号槽 */
  slot: 'special';
  ammo?: number;
  assetBundle?: string;
  tags?: string[];
}

export const AMR_CAPACITY = 5;

export const SPECIAL_WEAPONS: SpecialWeaponDef[] = [
  { id: 'at_mine', name: '反坦克地雷', short: 'AT', slot: 'special', ammo: 2, tags: ['anti_vehicle', 'defensive'] },
  { id: 'rocket', name: '火箭筒', short: 'RPG', slot: 'special', ammo: 3, tags: ['anti_vehicle', 'explosive'] },
  { id: 'amr', name: '反器材狙击', short: 'AMR', slot: 'special', ammo: AMR_CAPACITY, tags: ['anti_vehicle', 'sniper'] },
  { id: 'flamethrower', name: '喷火器', short: 'FLM', slot: 'special', ammo: 100, tags: ['cqc', 'area_denial'] },
];

export const SPECIAL_BY_ID = new Map(SPECIAL_WEAPONS.map((s) => [s.id, s]));

export function getSpecialWeapon(id: string): SpecialWeaponDef | undefined {
  return SPECIAL_BY_ID.get(id);
}

export function specialFallback(id: string): SpecialWeaponDef {
  return { id, name: id, short: id.slice(0, 3).toUpperCase(), slot: 'special' };
}
