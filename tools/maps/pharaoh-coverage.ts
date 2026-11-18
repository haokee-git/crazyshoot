/**
 * 法老坟墓 · 800 图内容覆盖率审计（1 m 栅格 union）。
 * 用法：npx tsx tools/maps/pharaoh-coverage.ts [--json]
 * 输出：docs/map-pharaoh/plans/coverage.json + 控制台表。
 */
import fs from 'node:fs';
import path from 'node:path';
import {pharaohCoverageStats} from '../../src/maps/pharaoh/coverage';

const outDir = path.resolve('docs/map-pharaoh/plans');
fs.mkdirSync(outDir, {recursive: true});
const stats = pharaohCoverageStats(1);
const file = path.join(outDir, 'coverage.json');
fs.writeFileSync(file, JSON.stringify({generatedAt: new Date().toISOString(), ...stats}, null, 2));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(stats, null, 2));
} else {
  console.log('法老坟墓 800×800 内容覆盖率（1 m 栅格，union 只算一次）');
  console.log(`  设计覆盖 ${stats.designedArea.toLocaleString()}㎡ / ${stats.totalArea.toLocaleString()}㎡ = ${stats.designedPct}%`);
  console.log(`  场景场地 ${stats.siteArea.toLocaleString()}㎡ · 道路走廊 ${stats.roadArea.toLocaleString()}㎡ · 生态 ${stats.ecoArea.toLocaleString()}㎡ · 沙丘/岩脊 ${stats.duneRidgeArea.toLocaleString()}㎡`);
  console.log(`  重叠 ${stats.overlapCells.toLocaleString()}㎡ · 未设计 ${stats.undesignedArea.toLocaleString()}㎡`);
  console.log(`  建筑 footprint ${stats.buildingFootprintArea.toLocaleString()}㎡ (${stats.buildingFootprintPct}%) · 掩体 footprint ${stats.coverFootprintArea.toLocaleString()}㎡ (${stats.coverFootprintPct}%)`);
  console.log('  场景面积：');
  for (const site of stats.sites) {
    console.log(`    ${site.id.padEnd(7)} ${String(site.area).padStart(7)}㎡  建筑 ${String(site.buildingArea).padStart(6)}㎡  实体 ${String(site.structureArea).padStart(6)}㎡  道路 ${site.roadArea}㎡  ${site.name}`);
  }
  console.log(`  → ${file}`);
}
if (stats.designedPct < 62 || stats.designedPct > 70) {
  console.error(`[coverage] 覆盖率 ${stats.designedPct}% 不在 62–70% 目标区间`);
  process.exitCode = 1;
}
