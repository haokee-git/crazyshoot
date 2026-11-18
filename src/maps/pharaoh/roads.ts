/**
 * 法老坟墓 · 公路层（MapDef Road[]）
 *
 * 单一真相是 `src/maps/pharaoh-height.ts` 的 `PHARAOH_ROADS`：地形整平与铺装
 * 共用同一组折线/宽度/高程剖面。本文件只做类型适配，**不改坐标、不改宽度**。
 *
 *  - 主路是两层：shoulder 18 m 沙砾（宽 18）+ main 10 m 沥青（宽 10），同点位。
 *    世界生成器按数组顺序铺装，后面的 main 覆盖在 shoulder 上，天然形成 4 m 路肩。
 *  - 支路 secondary 8 m（蓝/橙/绿洲/集市/古迹/狮身），path 6 m（驿站前场、A–B 便道）。
 */
import type { Road } from '../types';
import { PHARAOH_ROADS } from '../pharaoh-height';

const LABELS: Record<string, string> = {
  'main-road-shoulder': '沙漠公路路肩',
  'main-road': '沙漠公路',
  'spur-blue': '蓝队基地支路',
  'spur-orange': '橙队营地支路',
  'spur-oasis': '绿洲支路',
  'spur-bazaar': '集市支路',
  'spur-ruins': '古迹支路',
  'spur-sphinx': '狮身支路',
  'spur-service': '驿站前场',
  'link-ruins-sphinx': 'A–B 北侧便道',
};

export const pharaohRoads: Road[] = PHARAOH_ROADS.map((spec) => ({
  // 与 PHARAOH_ROADS 完全同点位：新建数组只为避免消费方改动共享常量。
  points: spec.points.map(([x, z]) => [x, z] as [number, number]),
  width: spec.width,
  kind: spec.kind,
  label: LABELS[spec.id] ?? spec.label ?? spec.id,
  shoulder: spec.shoulder,
  verge: spec.verge,
  surface: spec.surface,
  markings: spec.markings,
}));

export default pharaohRoads;
