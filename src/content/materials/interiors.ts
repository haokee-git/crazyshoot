/**
 * Interior material pack (v1). The seven textures live under
 * public/textures/interiors/64/ and are listed in
 * public/textures/interiors/manifest.json. Three of them double as voxel
 * block finishes (interior plaster, concrete slab, timber floor); the rest
 * are thin decorative planes (rug, wall art, wall map, industrial sign).
 */
export type InteriorTextureName =
  | 'plaster'
  | 'concrete-floor'
  | 'wood-planks'
  | 'rug'
  | 'wall-art'
  | 'industrial-sign'
  | 'wall-map';

export const INTERIOR_TEXTURE_NAMES: readonly InteriorTextureName[] = [
  'plaster',
  'concrete-floor',
  'wood-planks',
  'rug',
  'wall-art',
  'industrial-sign',
  'wall-map',
];

export const INTERIOR_TEXTURE_RES = 64;
export const interiorUrl = (name: InteriorTextureName) => `/textures/interiors/64/${name}.png`;
export const interiorMaterialPackUrls = () => INTERIOR_TEXTURE_NAMES.map(interiorUrl);

/** Voxel layer names used by BLOCK ids 68-70. Keep in sync with voxel-blocks.ts. */
export const INTERIOR_BLOCK_TEXTURES: Record<number, InteriorTextureName> = {
  68: 'plaster',
  69: 'concrete-floor',
  70: 'wood-planks',
};

/** Approximate albedo means, used for impact dust before the manifest is read. */
export const INTERIOR_AVERAGES: Record<InteriorTextureName, [number, number, number]> = {
  plaster: [193, 185, 169],
  'concrete-floor': [129, 126, 118],
  'wood-planks': [106, 84, 64],
  rug: [142, 92, 72],
  'wall-art': [136, 141, 116],
  'industrial-sign': [183, 146, 66],
  'wall-map': [190, 178, 143],
};
