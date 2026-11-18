import type {
  Building,
  CapturePoint,
  Cover,
  MapDef,
  MgNest,
  Polygon,
  Prop,
  Road,
  Route,
  SpecialCrate,
  SpawnZone,
  Team,
  TerrainKind,
  TerrainPatch,
  Vec2,
  VehiclePad,
  RoofKind,
} from '../../src/maps/types';
import { TEAM_COLORS, TEAM_NAMES } from '../../src/maps/types';
import { getVehicle, vehicleFallback } from '../../src/content/vehicles/catalog';
import fs from 'node:fs';
import path from 'node:path';
import { getSpecialWeapon, specialFallback } from '../../src/content/special-weapons/catalog';

const W = 2400;
const H = 1800;
const MAP_X = 80;
const MAP_Y = 150;
const MAP_SIZE = 1560;
const PANEL_X = 1690;
const PANEL_Y = 150;
const PANEL_W = 640;
const PANEL_H = 1560;

/** 当前平面图的像素/米；渲染前按 map.size 设置。仅用于单线程预览渲染。 */

let UNIT = MAP_SIZE / 300;

const TEX_DATA = new Map<string, string>();
function texData(name: string): string {
  let data = TEX_DATA.get(name);
  if (data !== undefined) return data;
  try {
    const file = path.resolve('public/textures/32', `${name}.png`);
    data = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    data = '';
  }
  TEX_DATA.set(name, data);
  return data;
}

function texturePattern(id: string, texName: string, tint = 'rgba(0,0,0,0)', tintOpacity = 0.24): string {
  const data = texData(texName);
  if (!data) return '';
  const u = n(UNIT);
  return `<pattern id="${id}" width="${u}" height="${u}" patternUnits="userSpaceOnUse"><image href="${data}" width="${u}" height="${u}" preserveAspectRatio="none" image-rendering="pixelated"/><rect width="${u}" height="${u}" fill="${tint}" opacity="${tintOpacity}"/></pattern>`;
}

function textureDefs(): string {
  const defs: [string, string, string, number][] = [
    ['tex-grass', 'grass_dirt', 'rgba(27,44,28,0.18)', 0.18],
    ['tex-concrete', 'concrete_wall', 'rgba(12,18,20,0.16)', 0.24],
    ['tex-asphalt', 'asphalt_clean', 'rgba(10,14,16,0.14)', 0.22],
    ['tex-gravel', 'rock', 'rgba(25,27,24,0.12)', 0.22],
    ['tex-dirt', 'dirt', 'rgba(30,22,15,0.1)', 0.2],
    ['tex-sand', 'dirt', 'rgba(86,70,42,0.28)', 0.3],
    ['tex-mud', 'dirt', 'rgba(37,30,22,0.3)', 0.3],
    ['tex-rubble', 'rock', 'rgba(40,38,34,0.28)', 0.3],
    ['tex-stone', 'rock', 'rgba(36,42,42,0.2)', 0.24],
    ['tex-wood', 'wood_planks', 'rgba(20,15,10,0.1)', 0.18],
    ['tex-flowers', 'grass_dirt', 'rgba(58,71,52,0.3)', 0.28],
    ['tex-roof', 'roof_tile', 'rgba(12,18,20,0.1)', 0.16],
    ['tex-saw', 'steel_corrugated', 'rgba(12,18,20,0.08)', 0.14],
    ['tex-gable', 'roof_tile', 'rgba(20,18,14,0.1)', 0.16],
    ['tex-glass', 'window_dark', 'rgba(10,20,22,0.2)', 0.24],
    ['tex-container-rust', 'container_rust', 'rgba(0,0,0,0)', 0],
    ['tex-container-teal', 'container_blue', 'rgba(0,0,0,0)', 0],
    ['tex-container-olive', 'container_olive', 'rgba(0,0,0,0)', 0],
    ['tex-sandbags', 'sandbags', 'rgba(0,0,0,0)', 0],
    ['tex-crate', 'wood_planks', 'rgba(0,0,0,0)', 0],
    ['tex-wall', 'concrete_wall', 'rgba(0,0,0,0)', 0],
    ['tex-rock', 'rock', 'rgba(0,0,0,0)', 0],
    ['tex-steel', 'steel_rust', 'rgba(0,0,0,0)', 0],
  ];
  return defs.map(([id, tex, tint, op]) => texturePattern(id, tex, tint, op)).join('\n');
}


const C = {
  bg: '#0b0e11',
  panel: '#0e1317',
  panel2: '#11171c',
  line: 'rgba(214, 231, 227, 0.14)',
  lineSoft: 'rgba(214, 231, 227, 0.07)',
  text: '#e6efec',
  muted: '#819095',
  faint: '#56656b',
  cyan: '#35e0d0',
  amber: '#ffb454',
  blue: '#4aa8ff',
  orange: '#ff7a3d',
  white: '#eef5f1',
  grid10: 'rgba(220, 238, 233, 0.045)',
  grid50: 'rgba(220, 238, 233, 0.10)',
  road: '#1b2125',
  roadLine: 'rgba(220, 230, 224, 0.40)',
  concrete: '#31383c',
  asphalt: '#282f33',
  grass: '#2f3d31',
  water: '#12333d',
  dirt: '#393227',
  sand: '#453d2d',
  gravel: '#373630',
  mud: '#302d26',
  rubble: '#3a3934',
  stone: '#343b3a',
  wood: '#3e3228',
  flowers: '#3a4734',
  building: '#58615e',
  buildingDark: '#3a4241',
  containerRust: '#7c4e34',
  containerTeal: '#3e6668',
  containerOlive: '#5a6242',
  sandbag: '#85764f',
  hedge: '#38543b',
  tree: '#2e4a33',
  steel: '#697573',
  hazard: '#d08a45',
};

const FONT = `'Rajdhani','DIN Alternate','Helvetica Neue','PingFang SC','Microsoft YaHei',sans-serif`;
const MONO = `'SFMono-Regular','Cascadia Mono','Roboto Mono',monospace`;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function n(v: number): string {
  return v.toFixed(1).replace(/\.0$/, '');
}

function teamColor(team: Team | 'neutral'): string {
  return team === 'neutral' ? '#c8b98d' : TEAM_COLORS[team];
}

function terrainColor(kind: TerrainKind): string {
  switch (kind) {
    case 'water': return C.water;
    case 'grass': return C.grass;
    case 'concrete': return C.concrete;
    case 'asphalt': return C.asphalt;
    case 'gravel': return C.gravel;
    case 'dirt': return C.dirt;
    case 'sand': return C.sand;
    case 'mud': return C.mud;
    case 'rubble': return C.rubble;
    case 'stone': return C.stone;
    case 'wood': return C.wood;
    case 'flowers': return C.flowers;
  }
}

function terrainFill(kind: TerrainKind): string {
  if (kind === 'water') return 'url(#waterPattern)';
  return `url(#tex-${kind})`;
}

function roofColor(roof: RoofKind | undefined): string {
  switch (roof) {
    case 'glass': return '#355f61';
    case 'sawtooth': return '#525b58';
    case 'gable': return '#5b5b50';
    case 'open': return 'rgba(30,37,39,0.55)';
    default: return '#5b615c';
  }
}

function roofFill(roof: RoofKind | undefined): string {
  switch (roof) {
    case 'glass': return 'url(#tex-glass)';
    case 'sawtooth': return 'url(#tex-saw)';
    case 'gable': return 'url(#tex-gable)';
    case 'open': return 'rgba(30, 37, 39, 0.55)';
    default: return 'url(#tex-roof)';
  }
}

function pointsAttr(poly: Polygon, px: (x: number) => number, py: (y: number) => number): string {
  return poly.map(([x, y]) => `${n(px(x))},${n(py(y))}`).join(' ');
}

function centroid(poly: Polygon): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

function pathD(points: Vec2[], px: (x: number) => number, py: (y: number) => number): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(px(p[0]))},${n(py(p[1]))}`).join(' ');
}

function midPoint(points: Vec2[]): Vec2 {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return points[0];
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    segs.push(d);
    total += d;
  }
  let target = total / 2;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const t = target / segs[i];
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * t,
        points[i][1] + (points[i + 1][1] - points[i][1]) * t,
      ];
    }
    target -= segs[i];
  }
  return points[points.length - 1];
}

function textWidth(s: string, size: number): number {
  let units = 0;
  for (const ch of Array.from(s)) {
    if (/[\u3000-\u9fff]/.test(ch)) units += 1;
    else if (/\s/.test(ch)) units += 0.35;
    else units += 0.54;
  }
  return units * size;
}

function labelBg(
  x: number,
  y: number,
  text: string,
  size: number,
  fill: string,
  anchor: 'start' | 'middle' | 'end' = 'start',
  weight = 600,
): string {
  const w = textWidth(text, size) + 10;
  const bx = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x - 5;
  return `<g><rect x="${n(bx)}" y="${n(y - size + 2)}" width="${n(w)}" height="${n(size + 6)}" rx="2" fill="rgba(7,11,13,0.68)"/><text x="${n(x)}" y="${n(y)}" fill="${fill}" font-family="${FONT}" font-size="${n(size)}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="0.3">${esc(text)}</text></g>`;
}

function paragraph(
  text: string,
  x: number,
  y: number,
  maxUnits: number,
  size: number,
  lineHeight: number,
  fill: string,
  weight = 400,
): { svg: string; endY: number } {
  const lines: string[] = [];
  let line = '';
  let used = 0;
  for (const ch of Array.from(text)) {
    const u = /[\u3000-\u9fff]/.test(ch) ? 1 : /\s/.test(ch) ? 0.35 : 0.54;
    if (used + u > maxUnits && line.length > 0) {
      lines.push(line.trimEnd());
      line = ch;
      used = u;
    } else {
      line += ch;
      used += u;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  const svg = lines
    .map(
      (l, i) =>
        `<text x="${n(x)}" y="${n(y + i * lineHeight)}" fill="${fill}" font-family="${FONT}" font-size="${n(size)}" font-weight="${weight}" letter-spacing="0.2">${esc(l)}</text>`,
    )
    .join('');
  return { svg, endY: y + lines.length * lineHeight };
}

function drawTerrain(map: MapDef, px: (x: number) => number, py: (y: number) => number): string {
  let out = `<rect x="${MAP_X}" y="${MAP_Y}" width="${MAP_SIZE}" height="${MAP_SIZE}" fill="${terrainColor(map.baseTerrain)}"/>`;
  out += `<rect x="${MAP_X}" y="${MAP_Y}" width="${MAP_SIZE}" height="${MAP_SIZE}" fill="${terrainFill(map.baseTerrain)}" opacity="0.42"/>`;
  out += `<rect x="${MAP_X}" y="${MAP_Y}" width="${MAP_SIZE}" height="${MAP_SIZE}" fill="url(#terrainNoise)" opacity="0.22"/>`;
  for (const t of map.terrain) {
    const pts = pointsAttr(t.polygon, px, py);
    const fill = terrainFill(t.kind);
    const op = t.opacity ?? 1;
    if (t.kind === 'water') {
      out += `<polygon points="${pts}" fill="url(#waterPattern)" opacity="${op}"/>`;
      out += `<polygon points="${pts}" fill="none" stroke="rgba(120,205,215,0.45)" stroke-width="1.5"/>`;
    } else {
      out += `<polygon points="${pts}" fill="${terrainColor(t.kind)}" opacity="${op}"/>`;
      out += `<polygon points="${pts}" fill="${fill}" opacity="${op * 0.52}"/>`;
      out += `<polygon points="${pts}" fill="url(#terrainNoise)" opacity="0.12"/>`;
    }
    if (t.elevation && t.elevation !== 0) {
      const sign = t.elevation > 0 ? '+' : '';
      out += `<polygon points="${pts}" fill="none" stroke="rgba(230,239,236,0.22)" stroke-width="1.2" stroke-dasharray="5 5"/>`;
      const c = centroid(t.polygon);
      out += labelBg(px(c[0]), py(c[1]) + 4, `${sign}${t.elevation}m`, 9, C.muted, 'middle', 500);
    }
  }
  return out;
}

function drawRoad(road: Road, px: (x: number) => number, py: (y: number) => number): string {
  const d = pathD(road.points, px, py);
  const w = road.width * UNIT;
  let out = '';
  if (road.kind === 'runway') {
    out += `<path d="${d}" fill="none" stroke="#171c20" stroke-width="${n(w + 12)}" stroke-linecap="butt" stroke-linejoin="round" opacity="0.8"/>`;
    out += `<path d="${d}" fill="none" stroke="${C.asphalt}" stroke-width="${n(w)}" stroke-linecap="butt" stroke-linejoin="round"/>`;
    out += `<path d="${d}" fill="none" stroke="rgba(225,232,226,0.5)" stroke-width="1.5" stroke-linecap="butt"/>`;
    out += `<path d="${d}" fill="none" stroke="rgba(225,232,226,0.44)" stroke-width="${n(w * 0.94)}" stroke-dasharray="2 22" stroke-linecap="butt" opacity="0.8"/>`;
    out += `<path d="${d}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="${n(w * 0.82)}" stroke-dasharray="1 35" opacity="0.45"/>`;
  } else if (road.kind === 'rail') {
    out += `<path d="${d}" fill="none" stroke="#2f3537" stroke-width="${n(w + 5)}" stroke-linecap="round"/>`;
    out += `<path d="${d}" fill="none" stroke="${C.steel}" stroke-width="2" stroke-dasharray="2 8"/>`;
    out += `<path d="${d}" fill="none" stroke="rgba(220,230,224,0.3)" stroke-width="${n(w)}" stroke-dasharray="1 6"/>`;
  } else {
    const width = road.kind === 'path' ? w : road.kind === 'taxiway' ? w : w;
    out += `<path d="${d}" fill="none" stroke="rgba(0,0,0,0.38)" stroke-width="${n(width + 6)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    out += `<path d="${d}" fill="none" stroke="${road.kind === 'path' ? '#2a302e' : C.road}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (road.kind === 'main' || road.kind === 'secondary') {
      out += `<path d="${d}" fill="none" stroke="${C.roadLine}" stroke-width="1.2" stroke-dasharray="${road.kind === 'main' ? '10 14' : '6 14'}" opacity="0.55" stroke-linecap="round"/>`;
    }
    if (road.kind === 'taxiway') {
      out += `<path d="${d}" fill="none" stroke="${C.amber}" stroke-width="1.4" stroke-dasharray="8 10" opacity="0.55"/>`;
    }
  }
  if (road.label) {
    const m = midPoint(road.points);
    out += labelBg(px(m[0]), py(m[1]) - 7, road.label, 9, 'rgba(230,239,236,0.72)', 'middle', 500);
  }
  return out;
}

function drawBuilding(b: Building, px: (x: number) => number, py: (y: number) => number): string {
  const pts = pointsAttr(b.polygon, px, py);
  const c = centroid(b.polygon);
  const labelAt = b.labelAt ?? c;
  const h = b.height;
  const sx = 3 + h * 0.45;
  const sy = 4 + h * 0.7;
  let out = `<g>`;
  out += `<polygon points="${pts}" fill="rgba(0,0,0,0.46)" transform="translate(${n(sx)} ${n(sy)})"/>`;
  out += `<polygon points="${pts}" fill="${b.roofColor ?? roofColor(b.roof)}" stroke="rgba(215,230,222,0.36)" stroke-width="1.4" stroke-linejoin="round"/>`;
  out += `<polygon points="${pts}" fill="${roofFill(b.roof)}" opacity="0.55"/>`;
  out += `<polygon points="${pts}" fill="rgba(255,255,255,0.035)"/>`;
  if (b.roof === 'glass') {
    out += `<polygon points="${pts}" fill="url(#glassPattern)" opacity="0.55"/>`;
  }
  if (b.roof === 'open') {
    out += `<polygon points="${pts}" fill="none" stroke="rgba(230,239,236,0.42)" stroke-width="1" stroke-dasharray="7 5"/>`;
  }
  out += `</g>`;
  if (b.label !== false) {
    const size = b.labelSize ?? 14;
    const name = b.name;
    out += labelBg(px(labelAt[0]), py(labelAt[1]) - 3, name, size, C.white, 'middle', 600);
    out += labelBg(px(labelAt[0]), py(labelAt[1]) + 12, `H ${n(h)}m`, 8.8, 'rgba(230,239,236,0.62)', 'middle', 500);
  }
  return out;
}

function coverColor(kind: Cover['kind'], index: number): string {
  switch (kind) {
    case 'container':
      return ['url(#tex-container-rust)', 'url(#tex-container-teal)', 'url(#tex-container-olive)', 'url(#tex-container-rust)'][index % 4];
    case 'sandbag': return 'url(#tex-sandbags)';
    case 'crate': return 'url(#tex-crate)';
    case 'wall': return 'url(#tex-wall)';
    case 'hedge': return C.hedge;
    case 'tree': return C.tree;
    case 'rock': return 'url(#tex-rock)';
    case 'barrier': return 'url(#tex-steel)';
    case 'wreck': return '#3f4441';
    case 'planter': return '#4a5b42';
    case 'statue': return '#858b83';
    case 'fuel_tank': return 'url(#tex-steel)';
    case 'silo': return 'url(#tex-steel)';
    case 'trench': return '#4b4434';
    case 'pump': return '#a84635';
    case 'dumpster': return '#355a48';
    case 'palm': return C.tree;
    case 'bush': return C.hedge;
    case 'reeds': return '#6f7a45';
    case 'stall': return '#8a6a43';
    case 'canopy': return '#59625f';
    case 'dome': return '#8d8065';
    case 'well': return '#6a6a60';
    case 'pots': return '#9a5a3d';
    case 'table': return '#6b5638';
    case 'sack': return '#8a7c56';
    case 'tires': return '#242826';
    default: return '#4b4b45';
  }
}

function drawCover(cv: Cover, index: number, px: (x: number) => number, py: (y: number) => number): string {
  const cx = px(cv.x);
  const cy = py(cv.y);
  const w = cv.w * UNIT;
  const d = cv.d * UNIT;
  const rot = -(cv.rot ?? 0);
  const fill = cv.color ?? coverColor(cv.kind, index);
  const g = (inner: string) =>
    `<g transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})">${inner}</g>`;
  switch (cv.kind) {
    case 'container': {
      const corr = Math.max(2, Math.floor(w / 9));
      let lines = '';
      for (let i = 1; i < corr; i++) {
        lines += `<line x1="${n(cx - w / 2 + (w * i) / corr)}" y1="${n(cy - d / 2 + 2)}" x2="${n(cx - w / 2 + (w * i) / corr)}" y2="${n(cy + d / 2 - 2)}" stroke="rgba(0,0,0,0.28)" stroke-width="1"/>`;
      }
      return g(
        `<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" rx="1.5" fill="${fill}" stroke="rgba(230,236,228,0.22)" stroke-width="0.8"/>${lines}<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="0.6"/>`,
      );
    }
    case 'sandbag':
      return g(
        `<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" rx="${n(d / 2)}" fill="${fill}" stroke="rgba(240,230,195,0.25)" stroke-width="0.8"/><path d="M${n(cx - w / 2 + 3)},${n(cy)} h${n(Math.max(0, w - 6))}" stroke="rgba(50,40,24,0.45)" stroke-width="0.8" stroke-dasharray="3 3"/>`,
      );
    case 'crate':
      return g(
        `<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" fill="${fill}" stroke="rgba(238,225,196,0.22)" stroke-width="0.8"/><path d="M${n(cx - w / 2)},${n(cy - d / 2)} L${n(cx + w / 2)},${n(cy + d / 2)} M${n(cx + w / 2)},${n(cy - d / 2)} L${n(cx - w / 2)},${n(cy + d / 2)}" stroke="rgba(0,0,0,0.3)" stroke-width="0.8"/>`,
      );
    case 'wall':
      return g(
        `<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" fill="${fill}" stroke="rgba(255,255,255,0.22)" stroke-width="0.8"/>`,
      );
    case 'hedge':
      return g(
        `<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" rx="${n(d / 2)}" fill="${fill}" stroke="rgba(150,190,150,0.25)" stroke-width="0.8"/><path d="M${n(cx - w / 2 + 2)},${n(cy - d / 2 + 1)} q6 4 12 0 q6 -4 12 0 q6 4 12 0" fill="none" stroke="rgba(190,220,180,0.18)" stroke-width="0.8"/>`,
      );
    case 'tree': {
      const r = w / 2;
      return `<g><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" opacity="0.92"/><circle cx="${n(cx - r * 0.2)}" cy="${n(cy - r * 0.2)}" r="${n(r * 0.78)}" fill="rgba(80,120,84,0.4)"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.22)}" fill="#3d3224"/></g>`;
    }
    case 'rock':
      return `<polygon points="${n(cx - w / 2)},${n(cy + d / 2)} ${n(cx - w * 0.35)},${n(cy - d / 2)} ${n(cx + w * 0.15)},${n(cy - d * 0.95)} ${n(cx + w / 2)},${n(cy + d * 0.3)} ${n(cx + w * 0.2)},${n(cy + d / 2)}" fill="${fill}" stroke="rgba(255,255,255,0.16)" stroke-width="0.8"/>`;
    case 'barrier':
      return g(
        `<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" fill="${fill}" stroke="rgba(255,255,255,0.22)" stroke-width="0.8"/><path d="M${n(cx - w / 2 + 2)},${n(cy + d / 2 - 1)} l8,-${n(d - 2)} M${n(cx - w / 2 + 12)},${n(cy + d / 2 - 1)} l8,-${n(d - 2)} M${n(cx - w / 2 + 22)},${n(cy + d / 2 - 1)} l8,-${n(d - 2)}" stroke="${C.hazard}" stroke-width="3" opacity="0.7"/>`,
      );
    case 'wreck':
      return g(
        `<polygon points="${n(cx - w / 2)},${n(cy - d / 2)} ${n(cx + w * 0.25)},${n(cy - d / 2)} ${n(cx + w / 2)},${n(cy)} ${n(cx + w * 0.25)},${n(cy + d / 2)} ${n(cx - w / 2)},${n(cy + d / 2)}" fill="${fill}" stroke="rgba(220,230,224,0.2)" stroke-width="0.8"/><path d="M${n(cx - w / 2)},${n(cy - d / 2)} L${n(cx + w / 2)},${n(cy + d / 2)}" stroke="rgba(0,0,0,0.45)" stroke-width="1"/>`,
      );
    case 'planter':
      return g(
        `<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" fill="${fill}" stroke="rgba(220,230,224,0.2)" stroke-width="0.6"/><rect x="${n(cx - w / 2 + 2)}" y="${n(cy - d / 2 + 2)}" width="${n(Math.max(0, w - 4))}" height="${n(Math.max(0, d - 4))}" fill="rgba(70,100,70,0.7)"/>`,
      );
    case 'statue':
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(Math.min(w, d) / 2)}" fill="${fill}" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/><circle cx="${n(cx)}" cy="${n(cy)}" r="2" fill="rgba(0,0,0,0.35)"/>`;
    case 'fuel_tank':
      return `<g><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(w / 2)}" fill="${fill}" stroke="rgba(255,255,255,0.28)" stroke-width="1"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(w * 0.28)}" fill="rgba(20,25,26,0.45)" stroke="rgba(255,255,255,0.2)" stroke-width="0.8"/></g>`;
    case 'silo':
      return `<g><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(w / 2)}" fill="${fill}" stroke="rgba(255,255,255,0.3)" stroke-width="1"/><path d="M${n(cx - w / 2 + 3)},${n(cy)} h${n(Math.max(0, w - 6))}" stroke="rgba(0,0,0,0.3)" stroke-width="0.8"/></g>`;
    case 'trench':
      return g(
        `<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" rx="${n(d / 2)}" fill="rgba(40,36,28,0.45)" stroke="${C.hazard}" stroke-width="1" stroke-dasharray="4 3" opacity="0.8"/>`,
      );
    case 'pump':
      return g(
        `<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" fill="${fill}" stroke="rgba(255,255,255,0.28)" stroke-width="0.8"/><rect x="${n(cx - w * 0.28)}" y="${n(cy - d * 0.3)}" width="${n(w * 0.56)}" height="${n(d * 0.35)}" fill="rgba(15,30,28,0.8)"/>`,
      );
    case 'dumpster':
      return g(
        `<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" fill="${fill}" stroke="rgba(255,255,255,0.24)" stroke-width="0.8"/><rect x="${n(cx - w * 0.32)}" y="${n(cy - d * 0.42)}" width="${n(w * 0.64)}" height="${n(d * 0.22)}" fill="rgba(12,22,18,0.55)"/>`,
      );
    default:
      return g(
        `<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" rx="1.5" fill="${fill}" stroke="rgba(255,255,255,0.22)" stroke-width="0.8"/>`,
      );
  }
}

function drawRoadsAndCovers(
  map: MapDef,
  px: (x: number) => number,
  py: (y: number) => number,
): string {
  let out = '';
  for (const road of map.roads) out += drawRoad(road, px, py);
  for (let i = 0; i < map.covers.length; i++) out += drawCover(map.covers[i], i, px, py);
  return out;
}

function drawProp(p: Prop, px: (x: number) => number, py: (y: number) => number): string {
  const cx = px(p.x);
  const cy = py(p.y);
  const rot = -(p.rot ?? 0);
  const w = (p.w ?? 8) * UNIT;
  const d = (p.d ?? 8) * UNIT;
  const g = (inner: string) =>
    `<g transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})">${inner}</g>`;
  let body = '';
  switch (p.kind) {
    case 'crane': {
      const beam = Math.max(w, 40);
      body = `<g opacity="0.92"><line x1="${n(cx - beam / 2)}" y1="${n(cy - d / 2)}" x2="${n(cx - beam / 2)}" y2="${n(cy + d / 2)}" stroke="${C.steel}" stroke-width="3"/><line x1="${n(cx + beam / 2)}" y1="${n(cy - d / 2)}" x2="${n(cx + beam / 2)}" y2="${n(cy + d / 2)}" stroke="${C.steel}" stroke-width="3"/><line x1="${n(cx - beam / 2)}" y1="${n(cy - d / 2)}" x2="${n(cx + beam / 2)}" y2="${n(cy - d / 2)}" stroke="${C.steel}" stroke-width="4"/><line x1="${n(cx - beam / 2)}" y1="${n(cy - d / 2)}" x2="${n(cx - beam / 2 + 10)}" y2="${n(cy + d / 2)}" stroke="rgba(200,210,200,0.35)" stroke-width="1"/><line x1="${n(cx + beam / 2)}" y1="${n(cy - d / 2)}" x2="${n(cx + beam / 2 - 10)}" y2="${n(cy + d / 2)}" stroke="rgba(200,210,200,0.35)" stroke-width="1"/></g>`;
      break;
    }
    case 'fountain': {
      const r = Math.max(6, (p.w ?? 12) / 2) * UNIT;
      body = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="#3b4744" stroke="rgba(210,225,215,0.55)" stroke-width="2"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.8)}" fill="url(#waterPattern)" stroke="rgba(160,210,215,0.3)" stroke-width="1"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.18)}" fill="#9fb0a5" opacity="0.7"/>`;
      break;
    }
    case 'radar': {
      body = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(w / 2)}" fill="rgba(60,70,68,0.6)" stroke="rgba(210,225,215,0.35)" stroke-width="1"/><path d="M${n(cx)},${n(cy)} L${n(cx + w * 0.8)},${n(cy - w * 0.3)} A${n(w * 0.8)} ${n(w * 0.8)} 0 0 1 ${n(cx + w * 0.2)},${n(cy - w * 0.75)} Z" fill="rgba(210,225,215,0.28)" stroke="rgba(210,225,215,0.5)" stroke-width="1"/>`;
      break;
    }
    case 'tower': {
      body = `<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" fill="url(#roofPattern)" stroke="rgba(230,239,236,0.42)" stroke-width="1.5"/><line x1="${n(cx)}" y1="${n(cy - d / 2)}" x2="${n(cx)}" y2="${n(cy - d / 2 - 22)}" stroke="${C.steel}" stroke-width="2"/><circle cx="${n(cx)}" cy="${n(cy - d / 2 - 24)}" r="2.5" fill="${C.amber}"/>`;
      break;
    }
    case 'flag': {
      const col = p.team ? teamColor(p.team) : C.amber;
      body = `<line x1="${n(cx)}" y1="${n(cy + 10)}" x2="${n(cx)}" y2="${n(cy - 20)}" stroke="${C.steel}" stroke-width="1.6"/><path d="M${n(cx)},${n(cy - 20)} L${n(cx + 18)},${n(cy - 16)} L${n(cx)},${n(cy - 10)} Z" fill="${col}" opacity="0.85"/>`;
      break;
    }
    case 'lamp': {
      body = `<circle cx="${n(cx)}" cy="${n(cy)}" r="3.5" fill="${C.amber}" opacity="0.8"/><circle cx="${n(cx)}" cy="${n(cy)}" r="8" fill="none" stroke="${C.amber}" stroke-width="0.8" opacity="0.25"/>`;
      break;
    }
    case 'sign': {
      body = `<rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" fill="rgba(210,220,212,0.5)" stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/>`;
      break;
    }
    case 'bridge_gap': {
      body = `<g><rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" fill="rgba(20,24,26,0.75)" stroke="${C.hazard}" stroke-width="1.5"/><path d="M${n(cx - w / 2 + 4)},${n(cy + d / 2 - 2)} l10,-${n(d - 4)} M${n(cx - w / 2 + 18)},${n(cy + d / 2 - 2)} l10,-${n(d - 4)} M${n(cx - w / 2 + 32)},${n(cy + d / 2 - 2)} l10,-${n(d - 4)}" stroke="${C.hazard}" stroke-width="4" opacity="0.55"/></g>`;
      break;
    }
    case 'gate': {
      body = `<line x1="${n(cx - w / 2)}" y1="${n(cy - d / 2)}" x2="${n(cx - w / 2)}" y2="${n(cy + d / 2)}" stroke="${C.steel}" stroke-width="3"/><line x1="${n(cx + w / 2)}" y1="${n(cy - d / 2)}" x2="${n(cx + w / 2)}" y2="${n(cy + d / 2)}" stroke="${C.steel}" stroke-width="3"/><line x1="${n(cx - w / 2)}" y1="${n(cy - d / 2)}" x2="${n(cx + w / 2)}" y2="${n(cy - d / 2)}" stroke="rgba(230,239,236,0.35)" stroke-width="1" stroke-dasharray="4 4"/>`;
      break;
    }
    case 'aircraft': {
      body = `<g opacity="0.75"><polygon points="${n(cx - w / 2)},${n(cy)} ${n(cx - w * 0.1)},${n(cy - d * 0.15)} ${n(cx + w * 0.1)},${n(cy - d * 0.15)} ${n(cx + w / 2)},${n(cy)} ${n(cx + w * 0.1)},${n(cy + d * 0.15)} ${n(cx - w * 0.1)},${n(cy + d * 0.15)}" fill="${C.steel}" stroke="rgba(230,239,236,0.35)" stroke-width="1"/><polygon points="${n(cx - w * 0.1)},${n(cy + d * 0.1)} ${n(cx + w * 0.1)},${n(cy + d * 0.1)} ${n(cx + w * 0.05)},${n(cy + d * 0.48)} ${n(cx - w * 0.05)},${n(cy + d * 0.48)}" fill="${C.steel}" opacity="0.7"/></g>`;
      break;
    }
    case 'barrels':
    case 'pipes':
    case 'pallets': {
      body = `<rect x="${n(cx - w * 0.35)}" y="${n(cy - d * 0.35)}" width="${n(w * 0.7)}" height="${n(d * 0.7)}" fill="rgba(120,120,105,0.35)" stroke="rgba(220,230,220,0.3)" stroke-width="0.8"/>`;
      break;
    }
    case 'gas_station': {
      body = `<g opacity="0.9"><rect x="${n(cx - w / 2)}" y="${n(cy - d / 2)}" width="${n(w)}" height="${n(d)}" fill="rgba(70,90,82,0.35)" stroke="${C.cyan}" stroke-width="1" stroke-dasharray="5 4"/><rect x="${n(cx - w * 0.42)}" y="${n(cy - d * 0.3)}" width="${n(w * 0.84)}" height="${n(d * 0.6)}" fill="url(#roofPattern)" stroke="rgba(230,239,236,0.28)" stroke-width="1"/></g>`;
      break;
    }
    case 'silo':
    case 'fuel_tank': {
      const r = w / 2;
      body = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${p.kind === 'fuel_tank' ? '#59625f' : '#707873'}" stroke="rgba(255,255,255,0.3)" stroke-width="1"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.55)}" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>`;
      break;
    }
  }
  if (p.kind === 'fountain' || p.kind === 'crane' || p.kind === 'tower' || p.kind === 'bridge_gap' || p.kind === 'aircraft') {
    if (p.label) body += labelBg(cx, cy + (p.kind === 'fountain' ? 0 : 22), p.label, 8, 'rgba(230,239,236,0.65)', 'middle', 500);
  }
  return g(body);
}

function drawRoute(route: Route, px: (x: number) => number, py: (y: number) => number): string {
  const d = pathD(route.points, px, py);
  const col = teamColor(route.team);
  const dash = route.kind === 'vehicle' ? '2 8' : '9 8';
  const marker = route.team === 'blue' ? 'url(#arrowBlue)' : 'url(#arrowOrange)';
  const m = midPoint(route.points);
  const label = route.kind === 'flank' || route.kind === 'vehicle' ? '' : labelBg(px(m[0]), py(m[1]) - 7, route.label, 9, col, 'middle', 600);
  return `<g opacity="${route.kind === 'vehicle' ? 0.42 : 0.62}"><path d="${d}" fill="none" stroke="${col}" stroke-width="${route.kind === 'vehicle' ? 2 : 2.6}" stroke-dasharray="${dash}" stroke-linecap="round" marker-end="${marker}"/>${label}</g>`;
}

function drawCapture(cp: CapturePoint, px: (x: number) => number, py: (y: number) => number): string {
  const cx = px(cp.x);
  const cy = py(cp.y);
  const r = cp.radius * UNIT;
  const col = cp.initialOwner === 'neutral' ? C.white : teamColor(cp.initialOwner);
  return `<g>
    <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${col}" opacity="0.055"/>
    <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="${col}" stroke-width="2" opacity="0.9" stroke-dasharray="7 5"/>
    <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.48)}" fill="rgba(9,13,15,0.88)" stroke="${col}" stroke-width="1.4"/>
    <text x="${n(cx)}" y="${n(cy + 9)}" fill="${col}" font-family="${FONT}" font-size="27" font-weight="700" text-anchor="middle">${cp.id}</text>
    ${labelBg(cx, cy + r + 19, cp.name, 11.5, C.white, 'middle', 600)}
  </g>`;
}

function drawSpawn(spawn: SpawnZone, px: (x: number) => number, py: (y: number) => number): string {
  const x = px(spawn.x);
  const y = py(spawn.y + spawn.d);
  const w = spawn.w * UNIT;
  const h = spawn.d * UNIT;
  const col = teamColor(spawn.team);
  let marks = '';
  for (let i = 0; i < 3; i++) {
    const mx = x + w * (0.22 + i * 0.28);
    const my = y + h * 0.62;
    marks += `<path d="M${n(mx)},${n(my - 7)} L${n(mx + 6)},${n(my + 5)} L${n(mx - 6)},${n(my + 5)} Z" fill="${col}" opacity="0.9"/>`;
  }
  return `<g>
    <rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="3" fill="${col}" opacity="0.10" stroke="${col}" stroke-width="1.4" stroke-dasharray="6 4"/>
    ${marks}
    ${labelBg(x + 6, y - 6, `${TEAM_NAMES[spawn.team]} ${spawn.label}`, 10.5, col, 'start', 700)}
  </g>`;
}

function drawVehiclePad(pad: VehiclePad, px: (x: number) => number, py: (y: number) => number): string {
  const cx = px(pad.x);
  const cy = py(pad.y);
  const size = 10 * UNIT;
  const col = teamColor(pad.team);
  const rot = -(pad.angle ?? 0);
  const vehicle = getVehicle(pad.vehicleId) ?? vehicleFallback(pad.vehicleId);
  const vclass = vehicle.class;
  const abbr = vehicle.short;
  let icon = '';
  const s = size;
  if (vclass === 'motorcycle') {
    icon = `<circle cx="${n(-s * 0.26)}" cy="0" r="${n(s * 0.12)}" fill="none" stroke="rgba(230,239,236,0.8)" stroke-width="1.4"/><circle cx="${n(s * 0.26)}" cy="0" r="${n(s * 0.12)}" fill="none" stroke="rgba(230,239,236,0.8)" stroke-width="1.4"/><line x1="${n(-s * 0.26)}" y1="0" x2="${n(s * 0.26)}" y2="0" stroke="rgba(230,239,236,0.8)" stroke-width="1.4"/>`;
  } else if (vclass === 'jeep' || vclass === 'apc') {
    const wheels = vclass === 'apc' ? 6 : 4;
    let ws = '';
    for (let i = 0; i < wheels; i++) {
      const wx = -s * 0.28 + (i % 3) * s * 0.28;
      const wy = (i < wheels / 2 ? -1 : 1) * s * 0.27;
      ws += `<rect x="${n(wx - 2)}" y="${n(wy - 3)}" width="4" height="6" rx="1" fill="rgba(10,14,16,0.8)" stroke="rgba(230,239,236,0.65)" stroke-width="0.8"/>`;
    }
    icon = `<rect x="${n(-s * 0.4)}" y="${n(-s * 0.25)}" width="${n(s * 0.8)}" height="${n(s * 0.5)}" rx="2" fill="rgba(40,48,46,0.7)" stroke="rgba(230,239,236,0.75)" stroke-width="1"/>${ws}<rect x="${n(-s * 0.1)}" y="${n(-s * 0.08)}" width="${n(s * 0.28)}" height="${n(s * 0.16)}" rx="1" fill="${col}" opacity="0.8"/>`;
  } else {
    const tracks = vclass === 'ifv' || vclass === 'light_tank' || vclass === 'mbt';
    const longBarrel = vclass === 'mbt' ? 0.55 : vclass === 'light_tank' ? 0.45 : 0.3;
    icon = `<rect x="${n(-s * 0.38)}" y="${n(-s * 0.22)}" width="${n(s * 0.76)}" height="${n(s * 0.44)}" rx="1.5" fill="rgba(42,50,47,0.8)" stroke="rgba(230,239,236,0.7)" stroke-width="1"/>${tracks ? `<rect x="${n(-s * 0.44)}" y="${n(-s * 0.27)}" width="${n(s * 0.1)}" height="${n(s * 0.54)}" fill="rgba(10,14,16,0.7)" stroke="rgba(230,239,236,0.4)" stroke-width="0.7"/><rect x="${n(s * 0.34)}" y="${n(-s * 0.27)}" width="${n(s * 0.1)}" height="${n(s * 0.54)}" fill="rgba(10,14,16,0.7)" stroke="rgba(230,239,236,0.4)" stroke-width="0.7"/>` : ''}<circle cx="0" cy="0" r="${n(s * 0.16)}" fill="${col}" opacity="0.8"/><line x1="0" y1="0" x2="${n(s * longBarrel)}" y2="0" stroke="rgba(230,239,236,0.85)" stroke-width="2"/>`;
  }
  return `<g>
    <rect x="${n(cx - size / 2)}" y="${n(cy - size / 2)}" width="${n(size)}" height="${n(size)}" rx="3" fill="rgba(7,11,13,0.72)" stroke="${col}" stroke-width="1" opacity="0.92" transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})"/>
    <g transform="rotate(${n(rot)} ${n(cx)} ${n(cy)}) translate(${n(cx)} ${n(cy)})">${icon}</g>
    ${labelBg(cx, cy + size / 2 + 11, abbr, 7.8, col, 'middle', 700)}
  </g>`;
}

function drawMg(mg: MgNest, px: (x: number) => number, py: (y: number) => number): string {
  const cx = px(mg.x);
  const cy = py(mg.y);
  const r = 5 * UNIT;
  const rot = -(mg.angle ?? 0);
  let bags = '';
  for (let i = -3; i <= 3; i++) {
    const a = (i * 14 * Math.PI) / 180;
    const bx = Math.cos(a) * r * 0.9;
    const by = Math.sin(a) * r * 0.9;
    bags += `<rect x="${n(bx - 7)}" y="${n(by - 3)}" width="14" height="6" rx="3" fill="${C.sandbag}" stroke="rgba(240,230,190,0.25)" stroke-width="0.7"/>`;
  }
  return `<g transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})">
    <g transform="translate(${n(cx)} ${n(cy)})">${bags}</g>
    <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.42)}" fill="rgba(8,12,14,0.85)" stroke="${C.amber}" stroke-width="1.4"/>
    <line x1="${n(cx - 8)}" y1="${n(cy)}" x2="${n(cx + 8)}" y2="${n(cy)}" stroke="${C.amber}" stroke-width="1.2"/>
    <line x1="${n(cx)}" y1="${n(cy - 8)}" x2="${n(cx)}" y2="${n(cy + 8)}" stroke="${C.amber}" stroke-width="1.2"/>
    ${labelBg(cx, cy + 22, 'MG', 7, C.amber, 'middle', 700)}
  </g>`;
}

function drawSpecial(crate: SpecialCrate, px: (x: number) => number, py: (y: number) => number): string {
  const cx = px(crate.x);
  const cy = py(crate.y);
  const specialDef = getSpecialWeapon(crate.weaponId) ?? specialFallback(crate.weaponId);
  const abbr = specialDef.short;
  const crateLabel = crate.label ?? specialDef.name;
  return `<g>
    <rect x="${n(cx - 9)}" y="${n(cy - 9)}" width="18" height="18" rx="2" fill="${C.amber}" opacity="0.16" stroke="${C.amber}" stroke-width="1.2" transform="rotate(45 ${n(cx)} ${n(cy)})"/>
    <text x="${n(cx)}" y="${n(cy + 3)}" fill="${C.amber}" font-family="${MONO}" font-size="7.5" font-weight="700" text-anchor="middle">${abbr}</text>
    ${labelBg(cx, cy + 19, crateLabel, 8.2, 'rgba(230,239,236,0.75)', 'middle', 500)}
  </g>`;
}

function drawVoxelGrid(): string {
  return `<rect x="${MAP_X}" y="${MAP_Y}" width="${MAP_SIZE}" height="${MAP_SIZE}" fill="url(#voxelGrid)" opacity="0.17"/>`;
}

function drawGrid(map: MapDef, px: (x: number) => number, py: (y: number) => number): string {
  let out = '';
  for (let m = 0; m <= map.size; m += 10) {
    const major = m % 50 === 0;
    const x = px(m);
    const y = py(m);
    out += `<line x1="${n(x)}" y1="${MAP_Y}" x2="${n(x)}" y2="${MAP_Y + MAP_SIZE}" stroke="${major ? C.grid50 : C.grid10}" stroke-width="${major ? 1 : 0.6}"/>`;
    out += `<line x1="${MAP_X}" y1="${n(y)}" x2="${MAP_X + MAP_SIZE}" y2="${n(y)}" stroke="${major ? C.grid50 : C.grid10}" stroke-width="${major ? 1 : 0.6}"/>`;
  }
  return out;
}

function drawCoordinates(map: MapDef): string {
  let out = '';
  for (let m = 0; m <= map.size; m += 50) {
    const x = MAP_X + (m / map.size) * MAP_SIZE;
    const y = MAP_Y + MAP_SIZE - (m / map.size) * MAP_SIZE;
    out += `<text x="${n(x)}" y="${MAP_Y - 12}" fill="${C.faint}" font-family="${MONO}" font-size="9" text-anchor="middle">${m}</text>`;
    out += `<text x="${MAP_X - 12}" y="${n(y + 3)}" fill="${C.faint}" font-family="${MONO}" font-size="9" text-anchor="end">${m}</text>`;
  }
  out += `<text x="${MAP_X + MAP_SIZE + 10}" y="${MAP_Y + MAP_SIZE - 8}" fill="${C.faint}" font-family="${MONO}" font-size="8" text-anchor="start">X →</text>`;
  out += `<text x="${MAP_X + 8}" y="${MAP_Y - 12}" fill="${C.faint}" font-family="${MONO}" font-size="8" text-anchor="end">Y ↑</text>`;
  return out;
}

function drawNorthArrow(): string {
  const x = MAP_X + MAP_SIZE - 46;
  const y = MAP_Y + 46;
  return `<g opacity="0.75"><circle cx="${x}" cy="${y}" r="20" fill="rgba(7,11,13,0.55)" stroke="rgba(230,239,236,0.25)" stroke-width="1"/><path d="M${x},${y - 13} L${x + 6},${y + 5} L${x},${y + 1} L${x - 6},${y + 5} Z" fill="${C.amber}"/><text x="${x}" y="${y + 18}" fill="${C.muted}" font-family="${MONO}" font-size="7" text-anchor="middle">N</text></g>`;
}

function drawScaleBar(): string {
  const x = MAP_X + 22;
  const y = MAP_Y + MAP_SIZE - 28;
  const len = 100 * UNIT;
  return `<g><rect x="${x - 8}" y="${y - 12}" width="${len + 34}" height="26" rx="2" fill="rgba(7,11,13,0.62)"/><line x1="${x}" y1="${y}" x2="${x + len}" y2="${y}" stroke="${C.white}" stroke-width="2"/><line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}" stroke="${C.white}" stroke-width="1"/><line x1="${x + len / 2}" y1="${y - 4}" x2="${x + len / 2}" y2="${y + 4}" stroke="${C.white}" stroke-width="1"/><line x1="${x + len}" y1="${y - 4}" x2="${x + len}" y2="${y + 4}" stroke="${C.white}" stroke-width="1"/><text x="${x}" y="${y + 14}" fill="${C.muted}" font-family="${MONO}" font-size="7">0</text><text x="${x + len / 2}" y="${y + 14}" fill="${C.muted}" font-family="${MONO}" font-size="7" text-anchor="middle">50m</text><text x="${x + len}" y="${y + 14}" fill="${C.muted}" font-family="${MONO}" font-size="7" text-anchor="end">100m</text></g>`;
}

function statRow(label: string, value: string, x: number, y: number): string {
  return `<text x="${x}" y="${y}" fill="${C.muted}" font-family="${FONT}" font-size="10" letter-spacing="0.8">${esc(label)}</text><text x="${x + 190}" y="${y}" fill="${C.text}" font-family="${MONO}" font-size="11" text-anchor="end">${esc(value)}</text>`;
}

function legendItem(kind: string, label: string, x: number, y: number): string {
  let icon = '';
  if (kind === 'capture') icon = `<circle cx="${x + 7}" cy="${y - 4}" r="6" fill="none" stroke="${C.white}" stroke-width="1" stroke-dasharray="2 2"/><text x="${x + 7}" y="${y - 1.5}" fill="${C.white}" font-family="${FONT}" font-size="7" text-anchor="middle">A</text>`;
  else if (kind === 'spawn') icon = `<path d="M${x + 2},${y + 2} L${x + 2},${y - 9} L${x + 13},${y - 6} L${x + 2},${y - 2} Z" fill="${C.blue}"/><line x1="${x + 2}" y1="${y - 9}" x2="${x + 2}" y2="${y + 2}" stroke="${C.blue}" stroke-width="1"/>`;
  else if (kind === 'vehicle') icon = `<rect x="${x}" y="${y - 9}" width="14" height="10" rx="1" fill="rgba(74,168,255,0.15)" stroke="${C.blue}" stroke-width="1"/><line x1="${x + 7}" y1="${y - 4}" x2="${x + 14}" y2="${y - 4}" stroke="${C.white}" stroke-width="1"/>`;
  else if (kind === 'mg') icon = `<circle cx="${x + 7}" cy="${y - 4}" r="5" fill="none" stroke="${C.amber}" stroke-width="1"/><line x1="${x}" y1="${y - 4}" x2="${x + 14}" y2="${y - 4}" stroke="${C.amber}" stroke-width="0.8"/><line x1="${x + 7}" y1="${y - 11}" x2="${x + 7}" y2="${y + 3}" stroke="${C.amber}" stroke-width="0.8"/>`;
  else if (kind === 'special') icon = `<rect x="${x + 1}" y="${y - 10}" width="12" height="12" fill="${C.amber}" opacity="0.2" stroke="${C.amber}" stroke-width="1" transform="rotate(45 ${x + 7} ${y - 4})"/>`;
  else if (kind === 'building') icon = `<rect x="${x}" y="${y - 9}" width="14" height="10" fill="url(#roofPattern)" stroke="rgba(230,239,236,0.4)" stroke-width="0.8"/>`;
  else if (kind === 'water') icon = `<rect x="${x}" y="${y - 9}" width="14" height="10" fill="url(#waterPattern)" stroke="rgba(120,205,215,0.4)" stroke-width="0.8"/>`;
  else if (kind === 'cover') icon = `<rect x="${x}" y="${y - 8}" width="8" height="8" fill="${C.containerRust}" stroke="rgba(255,255,255,0.25)" stroke-width="0.7"/><rect x="${x + 9}" y="${y - 8}" width="8" height="8" fill="${C.hedge}" stroke="rgba(255,255,255,0.2)" stroke-width="0.7"/>`;
  else if (kind === 'route') icon = `<line x1="${x}" y1="${y - 4}" x2="${x + 14}" y2="${y - 4}" stroke="${C.cyan}" stroke-width="1.4" stroke-dasharray="3 2"/><path d="M${x + 14},${y - 7} L${x + 19},${y - 4} L${x + 14},${y - 1} Z" fill="${C.cyan}"/>`;
  return `<g>${icon}<text x="${x + 26}" y="${y}" fill="${C.muted}" font-family="${FONT}" font-size="9.5" letter-spacing="0.3">${esc(label)}</text></g>`;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function spawnCenter(s: SpawnZone): Vec2 {
  return [s.x + s.w / 2, s.y + s.d / 2];
}

export function renderMapPlan(map: MapDef): string {
  UNIT = MAP_SIZE / map.size;
  const px = (x: number) => MAP_X + (x / map.size) * MAP_SIZE;
  const py = (y: number) => MAP_Y + MAP_SIZE - (y / map.size) * MAP_SIZE;

  const blueSpawn = map.spawns.find((s) => s.team === 'blue');
  const orangeSpawn = map.spawns.find((s) => s.team === 'orange');
  const distances = map.capturePoints.map((cp) => {
    const b = blueSpawn ? distance(spawnCenter(blueSpawn), [cp.x, cp.y]) : 0;
    const o = orangeSpawn ? distance(spawnCenter(orangeSpawn), [cp.x, cp.y]) : 0;
    return { cp, b, o };
  });

  let layers = '';
  layers += drawTerrain(map, px, py);
  layers += drawRoadsAndCovers(map, px, py);
  for (const b of map.buildings) layers += drawBuilding(b, px, py);
  for (const p of map.props) layers += drawProp(p, px, py);
  layers += drawVoxelGrid();
  for (const r of map.routes) layers += drawRoute(r, px, py);
  layers += drawGrid(map, px, py);

  for (const s of map.spawns) layers += drawSpawn(s, px, py);
  for (const p of map.vehiclePads) layers += drawVehiclePad(p, px, py);
  for (const m of map.mgNests) layers += drawMg(m, px, py);
  for (const s of map.specialCrates) layers += drawSpecial(s, px, py);
  for (const cp of map.capturePoints) layers += drawCapture(cp, px, py);
  layers += drawNorthArrow();
  layers += drawScaleBar();

  const side: string[] = [];
  side.push(`<rect x="${PANEL_X}" y="${PANEL_Y}" width="${PANEL_W}" height="${PANEL_H}" rx="3" fill="${C.panel}" stroke="${C.line}"/>`);
  side.push(`<rect x="${PANEL_X}" y="${PANEL_Y}" width="3" height="${PANEL_H}" fill="${C.cyan}" opacity="0.7"/>`);
  side.push(`<text x="${PANEL_X + 30}" y="${PANEL_Y + 42}" fill="${C.cyan}" font-family="${MONO}" font-size="9" letter-spacing="2.4">MAP SURVEY // ${String(map.order).padStart(2, '0')} / 06</text>`);
  side.push(`<text x="${PANEL_X + 30}" y="${PANEL_Y + 94}" fill="${C.text}" font-family="${FONT}" font-size="46" font-weight="700" letter-spacing="2">${esc(map.name)}</text>`);
  side.push(`<text x="${PANEL_X + 32}" y="${PANEL_Y + 120}" fill="${C.muted}" font-family="${MONO}" font-size="12" letter-spacing="3">${esc(map.nameEn)}</text>`);
  side.push(`<line x1="${PANEL_X + 30}" y1="${PANEL_Y + 142}" x2="${PANEL_X + PANEL_W - 30}" y2="${PANEL_Y + 142}" stroke="${C.line}"/>`);

  let y = PANEL_Y + 172;
  const intro = paragraph(map.summary, PANEL_X + 30, y, 50, 12.5, 19, '#b8c5c1');
  side.push(intro.svg);
  y = intro.endY + 26;

  side.push(`<text x="${PANEL_X + 30}" y="${y}" fill="${C.amber}" font-family="${MONO}" font-size="9" letter-spacing="2">SITE DATA</text>`);
  y += 24;
  const statCols = [
    [['尺寸', `${map.size} × ${map.size} m`], ['据点', `${map.capturePoints.length} 个`], ['出生区', `${map.spawns.length} 个`]],
    [['载具位', `${map.vehiclePads.length} 个`], ['重机枪', `${map.mgNests.length} 个`], ['特殊点', `${map.specialCrates.length} 个`]],
  ];
  for (let c = 0; c < 2; c++) {
    const x = PANEL_X + 30 + c * 290;
    let yy = y;
    for (const [k, v] of statCols[c]) {
      side.push(statRow(k, v, x, yy));
      side.push(`<line x1="${x}" y1="${yy + 7}" x2="${x + 250}" y2="${yy + 7}" stroke="${C.lineSoft}"/>`);
      yy += 24;
    }
  }
  y += 82;

  side.push(`<text x="${PANEL_X + 30}" y="${y}" fill="${C.amber}" font-family="${MONO}" font-size="9" letter-spacing="2">LEGEND</text>`);
  y += 24;
  const legend = [
    ['capture', '据点 / CAPTURE'],
    ['spawn', '出生区 / SPAWN'],
    ['vehicle', '载具位 / VEHICLE'],
    ['mg', '重机枪 / MG NEST'],
    ['special', '特殊武器 / SPECIAL'],
    ['building', '建筑 / BUILDING'],
    ['water', '水域 / WATER'],
    ['cover', '掩体 / COVER'],
    ['route', '推进路线 / ROUTE'],
  ];
  for (let i = 0; i < legend.length; i++) {
    const x = PANEL_X + 30 + (i % 2) * 300;
    const yy = y + Math.floor(i / 2) * 26;
    side.push(legendItem(legend[i][0], legend[i][1], x, yy));
  }
  y += 5 * 26 + 20;

  side.push(`<line x1="${PANEL_X + 30}" y1="${y}" x2="${PANEL_X + PANEL_W - 30}" y2="${y}" stroke="${C.line}"/>`);
  y += 26;
  side.push(`<text x="${PANEL_X + 30}" y="${y}" fill="${C.amber}" font-family="${MONO}" font-size="9" letter-spacing="2">SPAWN → OBJECTIVE</text>`);
  y += 22;
  for (const d of distances) {
    side.push(`<text x="${PANEL_X + 30}" y="${y}" fill="${C.white}" font-family="${FONT}" font-size="10" font-weight="600">${d.cp.id} ${esc(d.cp.name)}</text>`);
    side.push(`<text x="${PANEL_X + 300}" y="${y}" fill="${C.blue}" font-family="${MONO}" font-size="9.5" text-anchor="end">蓝 ${Math.round(d.b)}m</text>`);
    side.push(`<text x="${PANEL_X + 390}" y="${y}" fill="${C.orange}" font-family="${MONO}" font-size="9.5" text-anchor="end">橙 ${Math.round(d.o)}m</text>`);
    side.push(`<line x1="${PANEL_X + 30}" y1="${y + 7}" x2="${PANEL_X + PANEL_W - 30}" y2="${y + 7}" stroke="${C.lineSoft}"/>`);
    y += 23;
  }
  y += 8;

  side.push(`<text x="${PANEL_X + 30}" y="${y}" fill="${C.amber}" font-family="${MONO}" font-size="9" letter-spacing="2">ASYMMETRY</text>`);
  y += 18;
  let asym = paragraph(map.asymmetry, PANEL_X + 30, y, 50, 11, 16.5, '#aebbb7');
  side.push(asym.svg);
  y = asym.endY + 12;

  side.push(`<text x="${PANEL_X + 30}" y="${y}" fill="${C.amber}" font-family="${MONO}" font-size="9" letter-spacing="2">BALANCE</text>`);
  y += 18;
  let bal = paragraph(map.balance, PANEL_X + 30, y, 50, 11, 16.5, '#aebbb7');
  side.push(bal.svg);
  y = bal.endY + 14;

  side.push(`<text x="${PANEL_X + 30}" y="${y}" fill="${C.amber}" font-family="${MONO}" font-size="9" letter-spacing="2">SITE NOTES</text>`);
  y += 20;
  for (const note of map.notes) {
    if (y > PANEL_Y + PANEL_H - 84) break;
    side.push(`<circle cx="${PANEL_X + 34}" cy="${y - 3}" r="2" fill="${C.cyan}" opacity="0.7"/>`);
    let p = paragraph(note, PANEL_X + 44, y, 47, 10.2, 15, '#9daaa6');
    side.push(p.svg);
    y = p.endY + 4;
  }

  y += 8;
  if (y < PANEL_Y + PANEL_H - 160) {
    side.push(`<text x="${PANEL_X + 30}" y="${y}" fill="${C.amber}" font-family="${MONO}" font-size="9" letter-spacing="2">ROUTES</text>`);
    y += 18;
    for (const r of map.routes) {
      side.push(`<line x1="${PANEL_X + 30}" y1="${y - 3}" x2="${PANEL_X + 58}" y2="${y - 3}" stroke="${teamColor(r.team)}" stroke-width="2" stroke-dasharray="4 3"/>`);
      side.push(`<text x="${PANEL_X + 68}" y="${y}" fill="${C.muted}" font-family="${FONT}" font-size="10" letter-spacing="0.3">${TEAM_NAMES[r.team]} · ${esc(r.label)}</text>`);
      y += 15;
    }
  }
  side.push(`<line x1="${PANEL_X + 30}" y1="${PANEL_Y + PANEL_H - 58}" x2="${PANEL_X + PANEL_W - 30}" y2="${PANEL_Y + PANEL_H - 58}" stroke="${C.line}"/>`);
  side.push(`<text x="${PANEL_X + 30}" y="${PANEL_Y + PANEL_H - 32}" fill="${C.faint}" font-family="${MONO}" font-size="8" letter-spacing="1.6">1M VOXEL / 32PX TEXTURE STYLE — LAYOUT REVIEW</text>`);
  side.push(`<text x="${PANEL_X + PANEL_W - 30}" y="${PANEL_Y + PANEL_H - 32}" fill="${C.cyan}" font-family="${MONO}" font-size="8" letter-spacing="1.6" text-anchor="end">CRAZYSHOOT // ${map.size}×${map.size}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${textureDefs()}
    <pattern id="voxelGrid" width="${n(UNIT)}" height="${n(UNIT)}" patternUnits="userSpaceOnUse"><path d="M${n(UNIT)} 0 H0 V${n(UNIT)}" fill="none" stroke="rgba(225,240,235,0.34)" stroke-width="0.45"/></pattern>
    <pattern id="roofPattern" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${C.building}"/><path d="M0 8 L8 0" stroke="rgba(230,239,236,0.12)" stroke-width="1"/></pattern>
    <pattern id="gablePattern" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#565d59"/><path d="M0 12 L12 0 M-3 3 L3 -3 M9 15 L15 9" stroke="rgba(0,0,0,0.18)" stroke-width="1"/></pattern>
    <pattern id="sawPattern" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#4b5453"/><path d="M0 10 L7 4 L14 10" fill="none" stroke="rgba(230,239,236,0.15)" stroke-width="1"/></pattern>
    <pattern id="glassPattern" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="rgba(50,80,80,0.42)"/><path d="M0 0 H10 V10" fill="none" stroke="rgba(150,220,215,0.35)" stroke-width="0.8"/></pattern>
    <pattern id="waterPattern" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="${C.water}"/><path d="M0 16 q5 -4 11 0 q6 4 11 0 M-4 7 q5 -4 11 0 q6 4 11 0" fill="none" stroke="rgba(120,205,215,0.18)" stroke-width="1"/></pattern>
    <pattern id="grassPattern" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="3" cy="5" r="0.8" fill="rgba(170,205,160,0.22)"/><circle cx="13" cy="12" r="0.7" fill="rgba(170,205,160,0.16)"/><circle cx="7" cy="15" r="0.5" fill="rgba(170,205,160,0.14)"/></pattern>
    <pattern id="terrainNoise" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="4" cy="7" r="0.8" fill="rgba(255,255,255,0.09)"/><circle cx="18" cy="16" r="0.6" fill="rgba(0,0,0,0.22)"/><circle cx="12" cy="3" r="0.5" fill="rgba(255,255,255,0.06)"/></pattern>
    <marker id="arrowBlue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="${C.blue}"/></marker>
    <marker id="arrowOrange" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="${C.orange}"/></marker>
    <linearGradient id="mapShade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgba(255,255,255,0.03)"/><stop offset="0.55" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="rgba(0,0,0,0.12)"/></linearGradient>
    <clipPath id="mapClip"><rect x="${MAP_X}" y="${MAP_Y}" width="${MAP_SIZE}" height="${MAP_SIZE}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#terrainNoise)" opacity="0.16"/>

  <g>
    <text x="${MAP_X}" y="58" fill="${C.text}" font-family="${FONT}" font-size="24" font-weight="700" letter-spacing="4">CRAZYSHOOT</text>
    <text x="${MAP_X}" y="80" fill="${C.muted}" font-family="${MONO}" font-size="9" letter-spacing="3.4">BATTLEFIELD SURVEY // LAYOUT REVIEW</text>
    <line x1="${MAP_X}" y1="100" x2="${W - 80}" y2="100" stroke="${C.line}"/>
    <text x="${W - 80}" y="58" fill="${C.cyan}" font-family="${MONO}" font-size="10" letter-spacing="2" text-anchor="end">MAP ${String(map.order).padStart(2, '0')} / 06</text>
    <text x="${W - 80}" y="80" fill="${C.faint}" font-family="${MONO}" font-size="8" letter-spacing="2" text-anchor="end">${map.size} × ${map.size} M // 1 M VOXEL / 32PX TEX // NOT FINAL</text>
  </g>

  <g id="map">
    <rect x="${MAP_X - 8}" y="${MAP_Y - 8}" width="${MAP_SIZE + 16}" height="${MAP_SIZE + 16}" fill="rgba(5,8,10,0.8)" stroke="${C.line}"/>
    <g clip-path="url(#mapClip)">
      ${layers}
      <rect x="${MAP_X}" y="${MAP_Y}" width="${MAP_SIZE}" height="${MAP_SIZE}" fill="url(#mapShade)"/>
    </g>
    <rect x="${MAP_X}" y="${MAP_Y}" width="${MAP_SIZE}" height="${MAP_SIZE}" fill="none" stroke="rgba(230,239,236,0.35)" stroke-width="1.5"/>
    ${drawCoordinates(map)}
    <text x="${MAP_X + 18}" y="${MAP_Y + MAP_SIZE - 46}" fill="${C.faint}" font-family="${MONO}" font-size="8" letter-spacing="1.5">GRID 10M // COORDINATES IN METERS</text>
  </g>

  ${side.join('')}
  </svg>`;
}
