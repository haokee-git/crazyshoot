/**
 * Per-map texture bundle registry. A map's `assetBundle` string selects exactly
 * one pack; unknown/absent bundles load nothing extra. New maps add a row here
 * instead of adding `if (assetBundle === ...)` branches to loading.ts.
 */
import { pharaohMaterialPackUrls } from '../../content/materials/pharaoh';
import { miaoMaterialPackUrls } from '../../content/materials/miao-village';
import type { TextureResolution } from '../../content/materials/battlefield';

export interface AssetBundle {
  id: string;
  /** Human-readable label for loading/audit UI. */
  label: string;
  /** Every texture URL this bundle owns at a given tier. */
  urls(res: TextureResolution): string[];
}

export const ASSET_BUNDLES: Readonly<Record<string, AssetBundle>> = {
  'pharaoh-v1': {
    id: 'pharaoh-v1',
    label: '法老坟墓材质包',
    urls: (res) => pharaohMaterialPackUrls(res),
  },
  'miao-v1': {
    id: 'miao-v1',
    label: '千户苗寨材质包',
    urls: (res) => miaoMaterialPackUrls(res),
  },
};

export function bundleUrls(id: string | undefined, res: TextureResolution): string[] {
  if (!id) return [];
  return ASSET_BUNDLES[id]?.urls(res) ?? [];
}

export function bundleTextureCount(id: string | undefined, res: TextureResolution): number {
  return bundleUrls(id, res).length;
}
