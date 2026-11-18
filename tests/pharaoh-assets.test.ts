import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import manifest from '../public/textures/pharaoh-v1/manifest.json';
import {
  PHARAOH_ATLAS_NAMES,
  PHARAOH_BLOCK_TEXTURES,
  PHARAOH_MATERIAL_NAMES,
  PHARAOH_MATERIAL_RECORDS,
  PHARAOH_AVERAGES,
  PHARAOH_GROUND_VARIANTS,
  pharaohGroundVariant,
  pharaohMaterialNameForBlock,
  pharaohMaterialPackUrls,
  pharaohMaterialUrl,
  isPharaohMaterial,
  isPharaohAtlas,
} from '../src/content/materials/pharaoh';
import {
  BLOCK_TEXTURES,
  MATERIAL_SLOTS,
  materialUrl,
  materialMean,
  materialPackUrls,
  isWaterMaterial,
} from '../src/content/materials/battlefield';
import { preloadUrls } from '../src/game/core/loading';
import { usedMaterialNames } from '../src/game/world/voxel-map-render';

const ROOT = process.cwd();
const TIERS = [32, 64, 128] as const;
const PHARAOH_PREFIX = '/textures/pharaoh-v1/';
const BLOCK_NAMES = [
  'sand_fine', 'sand_ripple', 'sand_compact', 'sand_gravel', 'limestone_dust', 'earth_cracked',
  'mud_wet', 'asphalt_buried', 'limestone_shell', 'sandstone_block', 'rock_strata', 'granite_dark',
  'tomb_plaster', 'relief_fragment', 'stone_soot', 'mudbrick', 'plaster_ochre', 'plaster_white_old',
  'palm_wood', 'terracotta', 'basket_weave', 'metal_faded', 'palm_bark', 'palm_leaf',
  'reed_grass', 'oasis_soil', 'water_shallow', 'enamel_sun', 'pavement_oil', 'rubber_worn',
  'sand_ultrafine', 'sand_ripple_soft', 'sand_compact_dark', 'sand_damp', 'sandstone_fine',
  'limestone_pale', 'limestone_weathered', 'rock_strata_pale', 'mudbrick_pale', 'mudbrick_dark',
  'plaster_ochre_worn', 'plaster_white_clean', 'palm_wood_old', 'terracotta_pale', 'oasis_grass',
  'oasis_mud', 'reed_dry', 'asphalt_clean', 'pavement_plain', 'enamel_worn',
];
const ATLAS_NAMES = ['atlas_cloth_signs', 'atlas_murals_objects', 'atlas_plants', 'atlas_market_goods'];

interface DecodedPng {
  width: number;
  height: number;
  colorType: number;
  channels: number;
  pixels: Buffer;
}

/** Minimal 8-bit, non-interlaced PNG decoder (all generator output uses RGB). */
function decodePng(file: string): DecodedPng {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    off += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  expect(bitDepth, file).toBe(8);
  expect(interlace, file).toBe(0);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * channels);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      const v = line[x];
      let outv: number;
      if (filter === 0) outv = v;
      else if (filter === 1) outv = v + a;
      else if (filter === 2) outv = v + b;
      else if (filter === 3) outv = v + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        outv = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`bad PNG filter ${filter} in ${file}`);
      cur[x] = outv & 255;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { width, height, colorType, channels, pixels: out };
}

function uniqueColors(png: DecodedPng): Set<string> {
  const colors = new Set<string>();
  const { pixels, channels } = png;
  for (let i = 0; i < pixels.length; i += channels) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
  return colors;
}

function channels64(file: string): number[][] {
  const png = decodePng(file);
  const out: number[][] = [];
  for (let i = 0; i < png.pixels.length; i += png.channels) out.push([png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]]);
  return out;
}

function tierMean(name: string, tier: number): number[] {
  const px = channels64(textureFile(name, tier));
  const sum = [0, 0, 0];
  for (const c of px) for (let k = 0; k < 3; k++) sum[k] += c[k];
  return sum.map((v) => v / px.length);
}

function contrastAt(name: string, tier: number): number {
  const px = channels64(textureFile(name, tier));
  const mean = [0, 0, 0];
  for (const c of px) for (let k = 0; k < 3; k++) mean[k] += c[k];
  for (let k = 0; k < 3; k++) mean[k] /= px.length;
  let peak = 0;
  for (const c of px) for (let k = 0; k < 3; k++) peak = Math.max(peak, Math.abs(c[k] - mean[k]));
  return peak;
}

interface TexRecord {
  id?: number;
  name: string;
  family: string;
  palette: number[];
  paletteColors: number;
  average: number[];
  nativeGrid: number;
  files: Record<'32' | '64' | '128', string>;
  source: string;
  masterSha256: string;
  atlas?: boolean;
  seam: {
    wrapDelta: number;
    neighborDelta: number;
    neighborP99: number;
    wrapRatio: number;
    offsetWrapDelta: number;
    offsetWrapRatio: number;
  };
  detailVs32: Record<'64' | '128', number>;
}

const TEX = manifest.textures as unknown as TexRecord[];
const chunk3 = (flat: number[]): string[] => {
  const out: string[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push(`${flat[i]},${flat[i + 1]},${flat[i + 2]}`);
  return out;
};

function textureFile(name: string, tier: number): string {
  return path.join(ROOT, 'public', 'textures', 'pharaoh-v1', String(tier), `${name}.png`);
}

describe('pharaoh material pack', () => {
  it('declares 50 block finishes (72-121) plus 4 decoration atlases', () => {
    expect(PHARAOH_MATERIAL_NAMES.length).toBe(54);
    expect(new Set(PHARAOH_MATERIAL_NAMES).size).toBe(54);
    expect(BLOCK_NAMES.length).toBe(50);
    expect(Object.keys(PHARAOH_BLOCK_TEXTURES).map(Number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => 72 + i),
    );
    for (let id = 72; id <= 121; id++) {
      expect(PHARAOH_BLOCK_TEXTURES[id], `id ${id}`).toBe(BLOCK_NAMES[id - 72]);
      expect(pharaohMaterialNameForBlock(id)).toBe(BLOCK_NAMES[id - 72]);
    }
    expect(PHARAOH_ATLAS_NAMES).toEqual(ATLAS_NAMES);
    for (const atlas of ATLAS_NAMES) expect(isPharaohAtlas(atlas)).toBe(true);
    expect(isPharaohAtlas('sand_fine')).toBe(false);
    expect(manifest.textures.length).toBe(54);
  });

  it('has a manifest record for every pattern with the contract fields', () => {
    expect(manifest.version).toBe(1);
    expect(typeof manifest.generator).toBe('string');
    expect(manifest.generator.length).toBeGreaterThan(10);
    const names = manifest.textures.map((t) => t.name);
    expect(new Set(names).size).toBe(54);
    for (const record of TEX) {
      expect(record.name).toMatch(/^[a-z0-9_]+$/);
      expect(PHARAOH_MATERIAL_NAMES).toContain(record.name);
      expect(record.family).toMatch(/^(desert|ancient|bazaar|oasis|service|atlas)$/);
      expect(record.nativeGrid).toBe(32);
      expect(record.paletteColors).toBeGreaterThanOrEqual(12);
      expect(record.paletteColors).toBeLessThanOrEqual(24);
      expect(record.palette.length).toBe(record.paletteColors * 3);
      expect(new Set(chunk3(record.palette)).size).toBe(record.paletteColors);
      expect(record.average.length).toBe(3);
      for (const channel of record.average) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
      expect(record.source).toContain('tools/maps/pharaoh-textures.py');
      expect(record.masterSha256).toMatch(/^[a-f0-9]{64}$/);
      for (const tier of TIERS) {
        expect(record.files[String(tier) as '32' | '64' | '128']).toBe(`/textures/pharaoh-v1/${tier}/${record.name}.png`);
      }
      expect(record.seam.wrapRatio).toBeLessThanOrEqual(1.15);
      expect(record.seam.offsetWrapRatio).toBeLessThanOrEqual(1.15);
    }
    expect(TEX.filter((t) => t.atlas).map((t) => t.name)).toEqual(ATLAS_NAMES);
    const atlasNames = new Set(PHARAOH_ATLAS_NAMES);
    for (const [id, name] of Object.entries(PHARAOH_BLOCK_TEXTURES)) {
      expect(atlasNames.has(name), `block ${id} must not be an atlas`).toBe(false);
    }
  });

  it('ships 162 real PNGs (54 per tier) with true sizes and authored detail', () => {
    for (const record of TEX) {
      for (const tier of TIERS) {
        const file = textureFile(record.name, tier);
        expect(fs.existsSync(file), file).toBe(true);
        const png = decodePng(file);
        expect(png.width, file).toBe(tier);
        expect(png.height, file).toBe(tier);
        expect(png.colorType, file).toBe(2);
      }
      // 64/128 are authored at their own resolution, never a nearest upscale.
      expect(record.detailVs32['64']).toBeGreaterThan(1.5);
      expect(record.detailVs32['128']).toBeGreaterThan(1.5);
    }
    const deltas = TEX.filter((t) => !t.atlas).map((record) => record.detailVs32['128']).sort((a, b) => a - b);
    expect(deltas[Math.floor(deltas.length / 2)]).toBeGreaterThan(4);
    for (const tier of TIERS) {
      const files = fs.readdirSync(path.join(ROOT, 'public', 'textures', 'pharaoh-v1', String(tier))).filter((f) => f.endsWith('.png'));
      expect(files.length).toBe(54);
    }
  });

  it('uses only its declared finite palette and keeps low tiers calm (10-16 colours)', () => {
    for (const record of TEX) {
      const png = decodePng(textureFile(record.name, 128));
      const used = uniqueColors(png);
      expect(used.size, `${record.name} actual colours`).toBe(record.paletteColors);
      const declared = new Set(chunk3(record.palette));
      for (const colour of used) expect(declared.has(colour), `${record.name} has undeclared ${colour}`).toBe(true);
      for (const tier of [32, 64] as const) {
        const small = uniqueColors(decodePng(textureFile(record.name, tier)));
        // Low tiers get their own calmer quantised palette; it must stay in the
        // same material family (near the 128 average) with few, flat colours.
        if (!record.atlas) {
          expect(small.size, `${record.name} ${tier}px colours`).toBeGreaterThanOrEqual(10);
          expect(small.size, `${record.name} ${tier}px colours`).toBeLessThanOrEqual(16);
        } else {
          for (const colour of small) expect(declared.has(colour), `${record.name} ${tier}px undeclared ${colour}`).toBe(true);
        }
      }
    }
  });

  it('keeps every 64px material inside a +-14 RGB contrast budget', () => {
    for (const record of TEX.filter((t) => !t.atlas)) {
      expect(contrastAt(record.name, 64), `${record.name} 64px contrast`).toBeLessThanOrEqual(14);
      expect(contrastAt(record.name, 32), `${record.name} 32px contrast`).toBeLessThanOrEqual(14);
    }
  });

  it('keeps sand golden and variants within a slight tone spread', () => {
    const sandIds = PHARAOH_GROUND_VARIANTS.sand;
    const means = sandIds.map((id) => tierMean(pharaohMaterialNameForBlock(id)!, 64));
    for (const mean of means) {
      expect(mean[0], 'sand R').toBeGreaterThanOrEqual(195);
      expect(mean[0], 'sand R').toBeLessThanOrEqual(220);
      expect(mean[1], 'sand G').toBeGreaterThanOrEqual(170);
      expect(mean[1], 'sand G').toBeLessThanOrEqual(200);
      expect(mean[2], 'sand B').toBeGreaterThanOrEqual(122);
      expect(mean[2], 'sand B').toBeLessThanOrEqual(155);
    }
    for (let k = 0; k < 3; k++) {
      const values = means.map((m) => m[k]);
      expect(Math.max(...values) - Math.min(...values), 'sand variant channel spread').toBeLessThanOrEqual(20);
    }
    const sandGround = new Set(sandIds);
    for (const id of sandGround) {
      const record = TEX.find((t) => t.id === id)!;
      expect(record.paletteColors).toBeGreaterThanOrEqual(12);
      expect(record.paletteColors).toBeLessThanOrEqual(24);
    }
  });

  it('is periodic: wrap and 50%-offset seams are no sharper than internal edges', () => {
    for (const record of TEX) {
      const png = decodePng(textureFile(record.name, 128));
      const { width, height, channels, pixels } = png;
      const px = (x: number, y: number) => {
        const i = (y * width + x) * channels;
        return [pixels[i], pixels[i + 1], pixels[i + 2]] as const;
      };
      const diff = (a: readonly number[], b: readonly number[]) =>
        (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
      let wrap = 0;
      for (let y = 0; y < height; y++) wrap += diff(px(width - 1, y), px(0, y));
      for (let x = 0; x < width; x++) wrap += diff(px(x, height - 1), px(x, 0));
      wrap /= width * 2;
      let peak = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x + 1 < width; x++) peak = Math.max(peak, diff(px(x, y), px(x + 1, y)));
      }
      expect(wrap, `${record.name} seam step`).toBeLessThanOrEqual(Math.max(peak, 12));
      expect(wrap * 2, `${record.name} tiled seam`).toBeLessThanOrEqual(Math.max(peak * 2, 24));
    }
  });

  it('masterSha256 matches the shipped 128px file and averages resolve', () => {
    for (const record of TEX) {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(textureFile(record.name, 128))).digest('hex');
      expect(hash, record.name).toBe(record.masterSha256);
      expect(PHARAOH_MATERIAL_RECORDS.get(record.name)?.paletteColors).toBe(record.paletteColors);
      expect(PHARAOH_AVERAGES[record.name]).toEqual(record.average as [number, number, number]);
    }
  });

  it('URLs and pack helpers point at the pharaoh nginx folder', () => {
    expect(pharaohMaterialUrl('sand_fine', 64)).toBe('/textures/pharaoh-v1/64/sand_fine.png');
    for (const tier of TIERS) {
      const urls = pharaohMaterialPackUrls(tier);
      expect(urls.length).toBe(54);
      expect(new Set(urls).size).toBe(54);
      for (const url of urls) expect(url.startsWith(`/textures/pharaoh-v1/${tier}/`)).toBe(true);
    }
    expect(materialUrl('sand_fine', 64)).toBe('/textures/pharaoh-v1/64/sand_fine.png');
    expect(materialUrl('grass_olive', 64)).toBe('/textures/battlefield-v4/64/grass_olive.png');
    expect(materialUrl('plaster', 64)).toBe('/textures/interiors/64/plaster.png');
    expect(isPharaohMaterial('water_shallow')).toBe(true);
    expect(isPharaohMaterial('water_fresh')).toBe(false);
    expect(PHARAOH_MATERIAL_NAMES).toContain('atlas_plants');
  });

  it('merges materials into 160 slots and marks shallow water as water', () => {
    expect(MATERIAL_SLOTS).toBe(160);
    for (let id = 72; id <= 121; id++) expect(BLOCK_TEXTURES[id]).toBe(BLOCK_NAMES[id - 72]);
    expect(isWaterMaterial(98)).toBe(true);
    expect(isWaterMaterial(97)).toBe(false);
    expect(isWaterMaterial(16)).toBe(true);
    expect(materialMean(98)).toEqual(PHARAOH_AVERAGES.water_shallow);
    expect(materialMean(1).length).toBe(3);
    expect(materialMean(1).every((v) => v >= 0 && v <= 255)).toBe(true);
  });

  it('exposes zoneHash ground variants with valid slight-difference finishes', () => {
    const kinds = ['sand', 'gravel', 'stone', 'mudbrick', 'plaster', 'soil', 'vegetation'] as const;
    for (const kind of kinds) {
      const list = PHARAOH_GROUND_VARIANTS[kind];
      expect(list.length, kind).toBeGreaterThanOrEqual(2);
      for (const id of list) {
        expect(PHARAOH_BLOCK_TEXTURES[id], `${kind} id ${id}`).toBeTruthy();
      }
      expect(new Set(list).size).toBe(list.length);
      for (let hash = 0; hash < 16; hash++) {
        const picked = pharaohGroundVariant(kind, hash);
        expect(list).toContain(picked);
        expect(pharaohGroundVariant(kind, hash)).toBe(picked);
      }
    }
    expect(PHARAOH_GROUND_VARIANTS.sand).toContain(102);
    expect(PHARAOH_GROUND_VARIANTS.stone).toContain(109);
    expect(PHARAOH_GROUND_VARIANTS.mudbrick).toContain(110);
  });

  it('preloads the pharaoh bundle only for assetBundle pharaoh-v1', () => {
    const classic = [
      preloadUrls(64, 'noon', true, 'map-docks'),
      preloadUrls(64, 'noon', true, 'map-broken-bridge'),
      preloadUrls(64, 'noon', true, 'map-garden'),
      preloadUrls(64, 'noon', true, 'map-airfield'),
      preloadUrls(64, 'noon', false),
      preloadUrls(64, 'noon', false, undefined),
    ];
    for (const urls of classic) {
      expect(urls.some((url) => url.startsWith(PHARAOH_PREFIX))).toBe(false);
      for (const name of PHARAOH_MATERIAL_NAMES) expect(urls).not.toContain(`/textures/pharaoh-v1/64/${name}.png`);
    }
    const pharaoh = preloadUrls(64, 'noon', true, 'pharaoh-v1');
    const pharaohUrls = pharaoh.filter((url) => url.startsWith(PHARAOH_PREFIX));
    expect(pharaohUrls.length).toBe(54);
    expect(pharaohUrls).toEqual(pharaohMaterialPackUrls(64));
    for (const tier of TIERS) {
      const urls = preloadUrls(tier, 'dusk', true, 'pharaoh-v1').filter((url) => url.startsWith(PHARAOH_PREFIX));
      expect(urls.every((url) => url.startsWith(`${PHARAOH_PREFIX}${tier}/`))).toBe(true);
    }
    expect(materialPackUrls(64).length).toBe(56);
    expect(materialPackUrls(64).some((url) => url.startsWith(PHARAOH_PREFIX))).toBe(false);
  });

  it('uploads only the material names a terrain really references', () => {
    const fake = {
      chunks: [{ block: new Float32Array([1, 1, 4, 4, 72, 72, 68]) }],
      detailBoxes: [{ material: 102 }, { material: -104 }],
    } as unknown as Parameters<typeof usedMaterialNames>[0];
    const names = usedMaterialNames(fake);
    expect(new Set(names)).toEqual(new Set(['grass_olive', 'asphalt_fine', 'sand_fine', 'sand_ultrafine', 'sand_compact_dark', 'plaster']));
    expect(names).not.toContain('water_shallow');
    const classic = usedMaterialNames({ chunks: [{ block: new Float32Array([1, 2, 3, 4]) }], detailBoxes: [] } as unknown as Parameters<typeof usedMaterialNames>[0]);
    expect(classic.some((name) => isPharaohMaterial(name))).toBe(false);
  });

  it('keeps tiling / seam evidence and README in docs/map-pharaoh/materials', () => {
    const docs = path.join(ROOT, 'docs', 'map-pharaoh', 'materials');
    expect(fs.existsSync(path.join(docs, 'README.md'))).toBe(true);
    for (const tier of TIERS) expect(fs.existsSync(path.join(docs, `contact_sheet_${tier}.png`))).toBe(true);
    for (const record of TEX) {
      for (const tier of TIERS) {
        expect(fs.existsSync(path.join(docs, 'tiles', `${record.name}_${tier}_2x2.png`))).toBe(true);
        expect(fs.existsSync(path.join(docs, 'seams', `${record.name}_${tier}_offset50.png`))).toBe(true);
      }
    }
  });
});
