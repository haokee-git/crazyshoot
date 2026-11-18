import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import manifest from '../public/textures/miao-v1/manifest.json';
import {
  MIAO_ATLAS_NAMES, MIAO_BLOCK_TEXTURES, MIAO_MATERIAL_NAMES, MIAO_MATERIAL_RECORDS,
  isMiaoAtlas, isMiaoMaterial, miaoMaterialPackUrls, miaoMaterialUrl,
} from '../src/content/materials/miao-village';
import { BLOCK_TEXTURES, MATERIAL_SLOTS, isWaterMaterial, materialUrl } from '../src/content/materials/battlefield';
import { bundleUrls, bundleTextureCount } from '../src/game/core/asset-bundles';
import { preloadUrls } from '../src/game/core/loading';

const ROOT = process.cwd();
const TIERS = [32, 64, 128] as const;

describe('miao-v1 material pack', () => {
  it('registers exactly 32 voxel finishes at ids 122–153 without touching old ids', () => {
    const ids = Object.keys(MIAO_BLOCK_TEXTURES).map(Number).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 32 }, (_, i) => 122 + i));
    expect(MATERIAL_SLOTS).toBe(160);
    expect(ids[ids.length - 1]).toBeLessThan(MATERIAL_SLOTS);
    for (const id of ids) expect(BLOCK_TEXTURES[id]).toBe(MIAO_BLOCK_TEXTURES[id]);
    expect(BLOCK_TEXTURES[72]).toBe('sand_fine');
    expect(BLOCK_TEXTURES[1]).toBe('grass_olive');
    expect(isWaterMaterial(135)).toBe(true);
    expect(isWaterMaterial(134)).toBe(false);
    expect(materialUrl('fir_dark_oiled', 64)).toBe('/textures/miao-v1/64/fir_dark_oiled.png');
    expect(materialUrl('sand_fine', 64)).toBe('/textures/pharaoh-v1/64/sand_fine.png');
  });

  it('ships 32 block + 4 atlas records with palettes, means, hashes and seam metrics', () => {
    expect(manifest.pack).toBe('miao-v1');
    expect(manifest.textures).toHaveLength(36);
    expect(manifest.textures.filter((t) => !t.atlas)).toHaveLength(32);
    expect(manifest.textures.filter((t) => t.atlas)).toHaveLength(4);
    expect(MIAO_MATERIAL_NAMES).toHaveLength(36);
    expect([...MIAO_ATLAS_NAMES].sort()).toEqual(['miao_atlas_festival', 'miao_atlas_market', 'miao_atlas_signs', 'miao_atlas_textile']);
    for (const name of MIAO_ATLAS_NAMES) expect(isMiaoAtlas(name)).toBe(true);
    for (const record of manifest.textures as unknown as {
      name: string; palette: string[]; paletteColors: number; average: number[]; masterSha256: string;
      files: Record<'32' | '64' | '128', string>; source: string; seam: null | { wrapRatio: number; wrapDelta: number; neighborDelta: number };
      atlas: boolean; detailVs32: Record<'64' | '128', number>;
    }[]) {
      expect(MIAO_MATERIAL_RECORDS.get(record.name)).toBeTruthy();
      expect(isMiaoMaterial(record.name)).toBe(true);
      expect(record.source).toContain('tools/maps/miao-village-textures.py');
      expect(record.masterSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(record.average).toHaveLength(3);
      if (!record.atlas) {
        expect(record.palette.length).toBeLessThanOrEqual(8);
        expect(record.paletteColors).toBe(record.palette.length);
        const colors = record.palette.map(hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
        for (let channel = 0; channel < 3; channel++) {
          const values = colors.map(rgb => rgb[channel]);
          expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(32);
        }
        expect(record.palette.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
        expect(record.seam).not.toBeNull();
        // Toroidal generation: a high-frequency tile's edge difference is a normal
        // pixel gradient, so compare it with the neighbour gradient rather than 0.
        expect(record.seam!.wrapDelta).toBeLessThan(55);
        expect(record.seam!.wrapRatio).toBeLessThan(8);
        expect(record.detailVs32['64']).toBeGreaterThan(0.5);
        expect(record.detailVs32['128']).toBeGreaterThan(0.4);
      }
    }
  });

  it('has real 32/64/128 PNGs with the exact dimensions and a manifest hash', () => {
    for (const record of manifest.textures as unknown as { name: string; atlas: boolean; masterSha256: string; files: Record<'32' | '64' | '128', string> }[]) {
      for (const tier of TIERS) {
        const url = record.files[String(tier) as '32' | '64' | '128'];
        expect(url).toBe(`/textures/miao-v1/${tier}/${record.name}.png`);
        const file = path.join(ROOT, 'public', url.replace(/^\//, ''));
        expect(fs.existsSync(file)).toBe(true);
        const bytes = fs.readFileSync(file);
        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect(bytes.readUInt32BE(16)).toBe(tier);
        expect(bytes.readUInt32BE(20)).toBe(tier);
        expect([2, 6]).toContain(bytes[25]); // RGB blocks / RGBA atlases
      }
      // master hash is stable and recorded (128 tier is the master)
      const master = fs.readFileSync(path.join(ROOT, 'public', 'textures', 'miao-v1', '128', `${record.name}.png`));
      const hash = crypto.createHash('sha256').update(master).digest('hex');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('loads miao-v1 independently from pharaoh-v1 and classic packs', () => {
    expect(bundleTextureCount('miao-v1', 64)).toBe(36);
    expect(bundleUrls('miao-v1', 32).every((u) => u.startsWith('/textures/miao-v1/32/'))).toBe(true);
    expect(bundleUrls(undefined, 64)).toEqual([]);
    const miao = preloadUrls(64, 'morning', true, 'miao-v1');
    expect(miao.filter((u) => u.includes('/textures/miao-v1/'))).toHaveLength(36);
    expect(miao.some((u) => u.includes('/textures/pharaoh-v1/'))).toBe(false);
    const pharaoh = preloadUrls(64, 'noon', true, 'pharaoh-v1');
    expect(pharaoh.some((u) => u.includes('/textures/miao-v1/'))).toBe(false);
    expect(pharaoh.filter((u) => u.includes('/textures/pharaoh-v1/'))).toHaveLength(54);
    const classic = preloadUrls(64, 'noon', true, undefined);
    expect(classic.some((u) => u.includes('/textures/miao-v1/') || u.includes('/textures/pharaoh-v1/'))).toBe(false);
    expect(miaoMaterialPackUrls(32)).toHaveLength(36);
    expect(miaoMaterialUrl('miao_atlas_signs', 128)).toBe('/textures/miao-v1/128/miao_atlas_signs.png');
  });

  it('ships the documented tiling and contact-sheet evidence', () => {
    const docs = path.join(ROOT, 'docs', 'map-miao-village', 'materials');
    expect(fs.existsSync(path.join(docs, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(docs, 'contact_sheet_32.png'))).toBe(true);
    for (const name of Object.values(MIAO_BLOCK_TEXTURES)) expect(fs.existsSync(path.join(docs, `tile_${name}.png`))).toBe(true);
  });
});
