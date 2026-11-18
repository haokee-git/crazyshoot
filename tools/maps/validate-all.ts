import { MAPS } from '../../src/maps';
import type { MapDef, Vec2 } from '../../src/maps/types';
import { assertMapValid } from '../../src/maps/helpers';
import { getVehicle } from '../../src/content/vehicles/catalog';
import { getSpecialWeapon } from '../../src/content/special-weapons/catalog';

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function center(zone: { x: number; y: number; w: number; d: number }): Vec2 {
  return [zone.x + zone.w / 2, zone.y + zone.d / 2];
}

function dist(a: Vec2, b: Vec2) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

let failed = false;
for (const map of MAPS) {
  const problems = assertMapValid(map);
  const ids = new Map<string, number>();
  const dup = (id: string) => {
    ids.set(id, (ids.get(id) ?? 0) + 1);
  };
  map.capturePoints.forEach((c) => dup(c.id));
  for (const [id, count] of ids) if (count > 1) problems.push(`duplicate capture id ${id}`);
  if (map.capturePoints.length !== 3) problems.push(`expected 3 capture points, got ${map.capturePoints.length}`);
  if (map.spawns.length !== 2) problems.push(`expected 2 spawns, got ${map.spawns.length}`);
  if (map.mgNests.length !== 2) problems.push(`expected 2 MG, got ${map.mgNests.length}`);
  const specialCounts = new Map<string, number>();
  for (const s of map.specialCrates) specialCounts.set(s.weaponId, (specialCounts.get(s.weaponId) ?? 0) + 1);
  const specialCount = (weaponId: string) => specialCounts.get(weaponId) ?? 0;
  if (specialCount('amr') !== 2) problems.push(`expected 2 amr specials, got ${specialCount('amr')}`);
  if (specialCount('rocket') !== 2) problems.push(`expected 2 rocket specials, got ${specialCount('rocket')}`);
  if (specialCount('at_mine') !== 0) problems.push(`expected 0 at_mine specials, got ${specialCount('at_mine')}`);
  if (map.specialCrates.length < 4 || map.specialCrates.length > 5) {
    problems.push(`unexpected specials total: ${map.specialCrates.length} (expected 4-5)`);
  }
  if (map.vehiclePads.length < 6 || map.vehiclePads.length > 8) problems.push(`unexpected vehicle pads: ${map.vehiclePads.length}`);
  if (map.size !== 300) problems.push(`unexpected size: ${map.size}`);

  for (const p of map.vehiclePads) {
    if (!getVehicle(p.vehicleId)) problems.push(`unknown vehicleId ${p.vehicleId}`);
    const hits = map.buildings.filter((b) => pointInPolygon([p.x, p.y], b.polygon));
    if (hits.length) problems.push(`vehicle ${p.vehicleId} at ${p.x},${p.y} inside ${hits.map((b) => b.name).join(',')}`);
  }
  for (const p of map.specialCrates) {
    if (!getSpecialWeapon(p.weaponId)) problems.push(`unknown special ${p.weaponId}`);
  }
  for (const c of map.capturePoints) {
    const hits = map.buildings.filter((b) => pointInPolygon([c.x, c.y], b.polygon));
    if (hits.length) problems.push(`capture ${c.id} inside ${hits.map((b) => b.name).join(',')}`);
  }

  const blue = map.spawns.find((s) => s.team === 'blue');
  const orange = map.spawns.find((s) => s.team === 'orange');
  const table = map.capturePoints.map((c) => {
    const b = blue ? Math.round(dist(center(blue), [c.x, c.y])) : 0;
    const o = orange ? Math.round(dist(center(orange), [c.x, c.y])) : 0;
    return `${c.id}:${b}/${o}`;
  }).join('  ');

  console.log(`\n### ${map.order} ${map.name} / ${map.nameEn}  [${map.id}]`);
  console.log(`  grid=${map.size} caps=${map.capturePoints.length} spawns=${map.spawns.length} vehicles=${map.vehiclePads.length} mg=${map.mgNests.length} specials=${map.specialCrates.length}`);
  console.log(`  covers=${map.covers.length} buildings=${map.buildings.length} roads=${map.roads.length} routes=${map.routes.length}`);
  console.log(`  blue/orange → caps: ${table}`);
  console.log(`  specials: ${map.specialCrates.map((s) => `${s.weaponId}@${s.x},${s.y}`).join('  ')}`);
  console.log(`  vehicle set: ${[...new Set(map.vehiclePads.map((p) => p.vehicleId))].join(', ')}`);
  if (problems.length) {
    failed = true;
    console.log('  PROBLEMS:');
    for (const p of problems) console.log(`   - ${p}`);
  } else {
    console.log('  OK');
  }
}

if (failed) process.exitCode = 1;
