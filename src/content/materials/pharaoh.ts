/**
 * Pharaoh material pack (v1), 30 voxel finishes (block ids 72-101) plus two
 * decoration atlases. PNGs live in public/textures/pharaoh-v1/{32,64,128} and
 * are described by the generated manifest.json.
 *
 * The pack is deliberately NOT part of the classic battlefield bundle: only a
 * map whose `assetBundle === 'pharaoh-v1'` preloads it (see preloadWorld), and
 * the voxel renderer only uploads the material names that map really uses.
 */
import manifest from '../../../public/textures/pharaoh-v1/manifest.json';

export type PharaohTextureResolution = 32 | 64 | 128;

/** Upper two digits of the atlas UV cell grid (4 x 4 pixel cells). */
export const PHARAOH_ATLAS_CELLS = 4;
/** Every 0.5 x 0.5 UV quadrant is one complete decoration panel. */
export const PHARAOH_ATLAS_PANEL_SPAN = 0.5;

export const PHARAOH_BLOCK_TEXTURES: Record<number, string> = {
  72: 'sand_fine',
  73: 'sand_ripple',
  74: 'sand_compact',
  75: 'sand_gravel',
  76: 'limestone_dust',
  77: 'earth_cracked',
  78: 'mud_wet',
  79: 'asphalt_buried',
  80: 'limestone_shell',
  81: 'sandstone_block',
  82: 'rock_strata',
  83: 'granite_dark',
  84: 'tomb_plaster',
  85: 'relief_fragment',
  86: 'stone_soot',
  87: 'mudbrick',
  88: 'plaster_ochre',
  89: 'plaster_white_old',
  90: 'palm_wood',
  91: 'terracotta',
  92: 'basket_weave',
  93: 'metal_faded',
  94: 'palm_bark',
  95: 'palm_leaf',
  96: 'reed_grass',
  97: 'oasis_soil',
  98: 'water_shallow',
  99: 'enamel_sun',
  100: 'pavement_oil',
  101: 'rubber_worn',
  102: 'sand_ultrafine',
  103: 'sand_ripple_soft',
  104: 'sand_compact_dark',
  105: 'sand_damp',
  106: 'sandstone_fine',
  107: 'limestone_pale',
  108: 'limestone_weathered',
  109: 'rock_strata_pale',
  110: 'mudbrick_pale',
  111: 'mudbrick_dark',
  112: 'plaster_ochre_worn',
  113: 'plaster_white_clean',
  114: 'palm_wood_old',
  115: 'terracotta_pale',
  116: 'oasis_grass',
  117: 'oasis_mud',
  118: 'reed_dry',
  119: 'asphalt_clean',
  120: 'pavement_plain',
  121: 'enamel_worn',
};

export const PHARAOH_ATLAS_NAMES: readonly string[] = ['atlas_cloth_signs', 'atlas_murals_objects', 'atlas_plants', 'atlas_market_goods'];

/** Every decoration atlas, in manifest order. */
export const PHARAOH_ATLASES: readonly string[] = PHARAOH_ATLAS_NAMES;

export interface PharaohMaterialRecord {
  name: string;
  family: string;
  palette: number[];
  paletteColors: number;
  average: [number, number, number];
  nativeGrid: number;
  files: Record<'32' | '64' | '128', string>;
  source: string;
  masterSha256: string;
  atlas?: boolean;
  seam?: {
    wrapDelta: number;
    neighborDelta: number;
    neighborP99: number;
    wrapRatio: number;
    offsetWrapDelta: number;
    offsetWrapRatio: number;
  };
  detailVs32?: Record<'64' | '128', number>;
}

const RECORDS: PharaohMaterialRecord[] = manifest.textures.map((texture) => texture as unknown as PharaohMaterialRecord);

/** All 32 patterns (30 block finishes first, then the two atlases). */
export const PHARAOH_MATERIAL_NAMES: readonly string[] = RECORDS.map((texture) => texture.name);

export const PHARAOH_MATERIAL_RECORDS: ReadonlyMap<string, PharaohMaterialRecord> = new Map(
  RECORDS.map((texture) => [texture.name, texture]),
);

export const PHARAOH_AVERAGES: Readonly<Record<string, [number, number, number]>> = Object.fromEntries(
  RECORDS.map((texture) => [texture.name, texture.average]),
);

const PHARAOH_NAMES: ReadonlySet<string> = new Set(PHARAOH_MATERIAL_NAMES);
const PHARAOH_ATLAS_SET: ReadonlySet<string> = new Set(PHARAOH_ATLAS_NAMES);
const PHARAOH_BY_BLOCK: ReadonlyMap<number, string> = new Map(
  Object.entries(PHARAOH_BLOCK_TEXTURES).map(([id, name]) => [Number(id), name]),
);

export const isPharaohMaterial = (name: string): boolean => PHARAOH_NAMES.has(name);
export const isPharaohAtlas = (name: string): boolean => PHARAOH_ATLAS_SET.has(name);
export const pharaohMaterialNameForBlock = (id: number): string | undefined => PHARAOH_BY_BLOCK.get(id);

/** Every pack file is served by the site's own nginx, never a CDN. */
export const pharaohMaterialUrl = (name: string, res: PharaohTextureResolution): string =>
  `/textures/pharaoh-v1/${res}/${name}.png`;

export const pharaohMaterialPackUrls = (res: PharaohTextureResolution): string[] =>
  PHARAOH_MATERIAL_NAMES.map((name) => pharaohMaterialUrl(name, res));

/** Atlas URL helper for the decoration renderer. */
export const pharaohAtlasUrl = (atlas: string, res: PharaohTextureResolution): string =>
  pharaohMaterialUrl(atlas, res);

/**
 * Low-contrast ground/rock variants for zoneHash-driven selection. Every id is
 * a real block finish in this pack; tones differ only slightly (±~8 RGB) so a
 * map stays visually coherent while repeated 1 m faces stop looking identical.
 *
 * Example (world generation):
 *   const id = pharaohGroundVariant('sand', zoneHash(x, z, seed));
 */
export type PharaohGroundKind = 'sand' | 'gravel' | 'stone' | 'mudbrick' | 'plaster' | 'soil' | 'vegetation';

export const PHARAOH_GROUND_VARIANTS: Readonly<Record<PharaohGroundKind, readonly number[]>> = {
  /** 细沙/风纹沙/压实沙/浅湿沙：轻微色差，主要靠颗粒与纹理区分 */
  sand: [72, 73, 74, 102, 103, 104, 105],
  /** 沙砾 / 石灰尘（极低对比的暖灰砾石） */
  gravel: [75, 76],
  /** 石灰岩/砂岩/层理岩（金字塔与古迹大面、门框、台阶） */
  stone: [80, 81, 82, 106, 107, 108, 109],
  /** 泥砖深浅与旧灰泥 */
  mudbrick: [87, 110, 111],
  /** 赭灰 / 旧白灰 / 干净白灰 */
  plaster: [88, 89, 112, 113],
  /** 干裂土 / 湿泥 / 绿洲土 / 绿洲湿泥 */
  soil: [77, 78, 97, 117],
  /** 棕榈叶 / 芦苇 / 绿洲草 / 干芦苇 */
  vegetation: [95, 96, 116, 118],
};

/** Stable, deterministic variant pick (same hash -> same finish). */
export const pharaohGroundVariant = (kind: PharaohGroundKind, hash: number): number => {
  const list = PHARAOH_GROUND_VARIANTS[kind];
  return list[Math.abs(Math.trunc(hash)) % list.length];
};

/** Manifest file is imported so the runtime knows tiers/palettes without fetching. */
export const PHARAOH_MANIFEST = manifest;
