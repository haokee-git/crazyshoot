/**
 * 千户苗寨 · 0.5 m 可达面积统计（可重复）。
 * 用法：npx tsx tools/maps/miao-village-coverage.ts [--json]
 * 输出：docs/map-miao-village/plans/coverage.json + 控制台表。
 */
import fs from 'node:fs';
import path from 'node:path';
import { miaoCoverage } from '../../src/maps/miao-village/coverage';

const outDir = path.resolve('docs/map-miao-village/plans');
fs.mkdirSync(outDir, { recursive: true });
const stats = miaoCoverage(0.5);
const file = path.join(outDir, 'coverage.json');
fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), ...stats }, null, 2));
if (process.argv.includes('--json')) console.log(JSON.stringify(stats, null, 2));
else {
  console.log('千户苗寨 500×500 可活动面积（0.5 m 可达 BFS + union）');
  console.log(`  可活动 ${stats.playableArea.toLocaleString()}㎡ / ${stats.totalArea.toLocaleString()}㎡ = ${stats.playablePct}%`);
  console.log(`  陆地 ${stats.landArea.toLocaleString()}㎡ · 水面 ${stats.waterArea.toLocaleString()}㎡ · 室内投影 ${stats.buildingArea.toLocaleString()}㎡ · 桥面 ${stats.bridgeArea.toLocaleString()}㎡`);
  for (const d of stats.districts) console.log(`    ${d.id} ${d.name.padEnd(8)} ${String(d.area).padStart(7)}㎡ ${String(d.pct).padStart(5)}%`);
  console.log(`  → ${file}`);
}
if (stats.playablePct < 68 || stats.playablePct > 72) {
  console.error(`[coverage] ${stats.playablePct}% 不在 68–72% 目标区间`);
  process.exitCode = 1;
}
