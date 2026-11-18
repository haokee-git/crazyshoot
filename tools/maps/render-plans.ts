import { MAPS } from '../../src/maps';
import { renderMapPlan } from './plan-svg';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('previews/maps');
fs.mkdirSync(outDir, { recursive: true });

for (const map of MAPS) {
  const svg = renderMapPlan(map);
  const svgPath = path.join(outDir, `${String(map.order).padStart(2, '0')}-${map.id}.svg`);
  fs.writeFileSync(svgPath, svg, 'utf8');
  console.log(
    `[map] ${map.id} ${map.name} → ${path.relative(process.cwd(), svgPath)}  ` +
      `(${map.capturePoints.length} caps, ${map.vehiclePads.length} vehicle pads, ` +
      `${map.mgNests.length} MG, ${map.specialCrates.length} specials)`,
  );
}
