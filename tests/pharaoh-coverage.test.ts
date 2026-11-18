/**
 * 法老坟墓 · 800 图内容覆盖率（1 m 栅格 union，重叠只算一次）。
 */
import {describe, it, expect} from 'vitest';
import {pharaohCoverageStats, polygonArea} from '../src/maps/pharaoh/coverage';
import {PHARAOH_LAYOUT} from '../src/maps/pharaoh/layout';
import {PHARAOH_NETWORK} from '../src/maps/pharaoh/network';

const stats = pharaohCoverageStats(1);

describe('pharaoh 800 coverage', () => {
  it('reports 62%–70% designed coverage without counting base sand', () => {
    expect(stats.designedPct).toBeGreaterThanOrEqual(62);
    expect(stats.designedPct).toBeLessThanOrEqual(70);
    expect(stats.designedArea).toBeLessThan(stats.totalArea);
    expect(stats.undesignedArea).toBeGreaterThan(stats.totalArea * 0.25);
    expect(stats.undesignedArea).toBeLessThan(stats.totalArea * 0.4);
  });

  it('counts overlapping site/road/eco/dune cells only once', () => {
    const sum = stats.siteCells + stats.roadCells + stats.ecoCells + stats.duneRidgeCells;
    expect(stats.overlapCells).toBeGreaterThan(0);
    expect(stats.designedCells).toBe(sum - stats.overlapCells);
    expect(stats.designedCells).toBeLessThan(sum);
  });

  it('keeps the seven scene areas inside their target budgets', () => {
    const area = (id: string) => stats.sites.find((s) => s.id === id)!.area;
    expect(area('blue')).toBeGreaterThan(10_000);
    expect(area('blue')).toBeLessThan(14_000);
    expect(area('orange')).toBeGreaterThan(10_000);
    expect(area('orange')).toBeLessThan(14_000);
    expect(area('A')).toBeGreaterThan(70_000);
    expect(area('A')).toBeLessThan(90_000);
    expect(area('B')).toBeGreaterThan(28_000);
    expect(area('B')).toBeLessThan(40_000);
    expect(area('C')).toBeGreaterThanOrEqual(96_900);
    expect(area('C')).toBeLessThanOrEqual(102_000);
    expect(area('D')).toBeGreaterThan(45_000);
    expect(area('D')).toBeLessThan(80_000);
    expect(area('E')).toBeGreaterThan(16_000);
    expect(area('E')).toBeLessThan(22_000);
    expect(area('F')).toBeGreaterThan(26_000);
    expect(area('F')).toBeLessThan(34_000);
    expect(area('G')).toBeGreaterThan(24_000);
    expect(area('G')).toBeLessThan(40_000);
  });

  it('reports real road/eco/dune areas and entity footprints separately', () => {
    expect(stats.roadArea).toBeGreaterThan(30_000);
    expect(stats.roadArea).toBeLessThan(80_000);
    expect(stats.ecoArea).toBeGreaterThan(45_000);
    expect(stats.ecoArea).toBeLessThan(85_000);
    expect(stats.duneRidgeArea).toBeGreaterThan(30_000);
    expect(stats.lakeArea).toBeGreaterThan(10_000);
    expect(stats.lakeArea).toBeLessThan(14_000);
    expect(stats.buildingFootprintPct).toBeGreaterThan(0.5);
    expect(stats.buildingFootprintPct).toBeLessThan(5);
    expect(stats.coverFootprintPct).toBeGreaterThan(1);
    expect(stats.coverFootprintPct).toBeLessThan(10);
    expect(stats.monumentFootprintArea).toBeGreaterThan(70_000);
  });

  it('uses the layout anchors and network as the only site/road truth', () => {
    for (const id of ['A', 'B', 'C', 'E', 'F', 'G'] as const) {
      expect(stats.sites.find((s) => s.id === id)!.name).toBe(PHARAOH_LAYOUT[id].label);
    }
    expect(PHARAOH_NETWORK.length).toBeGreaterThan(20);
    expect(polygonArea([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(100);
  });
});
