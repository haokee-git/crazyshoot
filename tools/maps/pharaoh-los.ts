/**
 * 法老坟墓 · 中央沙脊 DDA 视线验收。
 * 用法：npx tsx tools/maps/pharaoh-los.ts
 * 输出：docs/map-pharaoh/plans/los.json + 控制台表。
 */
import fs from 'node:fs';
import path from 'node:path';
import {pharaoh} from '../../src/maps/pharaoh';
import {buildVoxelMapData} from '../../src/game/world/voxel-map-data';
import {pharaohLosReport} from '../../src/maps/pharaoh/los';

const data = buildVoxelMapData(pharaoh);
const report = pharaohLosReport(data, pharaoh);
const outDir = path.resolve('docs/map-pharaoh/plans');
fs.mkdirSync(outDir, {recursive: true});
const file = path.join(outDir, 'los.json');
fs.writeFileSync(file, JSON.stringify({generatedAt: new Date().toISOString(), ...report}, null, 2));

console.log('法老坟墓 · 中央沙脊视线');
for (const r of report.ridges) {
  console.log(`  ${r.ridge.padEnd(11)} @(${r.x},${r.z}) y=${r.ground}  露天=${r.openSites.join('/') || '-'}  入口 A=${r.entrances.A ? 'Y' : 'n'} B=${r.entrances.B ? 'Y' : 'n'}`);
}
console.log('  据点被中央脊看到次数：', report.siteCoverage);
console.log('  入口被中央脊看到次数：', report.entranceCoverage);
console.log(`  单脊最多控制露天据点：${report.maxOpenSitesPerRidge} (${report.worstRidge})`);
for (const route of report.routes) console.log(`  路线暴露 ${route.exposurePct}%  ${route.route} (${route.exposed}/${route.samples})`);
if (report.failures.length) {
  console.error('  FAIL:', report.failures.join(' | '));
  process.exitCode = 1;
} else {
  console.log('  PASS');
}
console.log(`  → ${file}`);
