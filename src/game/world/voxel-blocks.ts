/**
 * Voxel material ids. The first 67 ids keep the historical battlefield pack and
 * remain stable for saves/tests; 68-70 are the interior finishes introduced with
 * the enterable-building pass (three extra layers in the voxel array texture).
 */
export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  ROAD: 4,
  CONCRETE: 5,
  BRICK: 6,
  WOOD: 7,
  BARK: 8,
  LEAVES: 9,
  METAL: 10,
  GLASS: 11,
  SAND: 12,
  ROOF: 13,
  RUST: 14,
  DARK: 15,
  WATER: 16,
  GRASS_SIDE: 17,
  WHITE: 18,
  INTERIOR_PLASTER: 68,
  INTERIOR_CONCRETE_FLOOR: 69,
  INTERIOR_WOOD_FLOOR: 70,
} as const;

export type BlockId = (typeof BLOCK)[keyof typeof BLOCK];
