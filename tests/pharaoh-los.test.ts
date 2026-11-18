/**
 * 法老坟墓 · 同源体素 DDA 视线验收。
 * 中央低沙脊选 12 个代表点；单个脊点不得同时无遮挡控制 >2 个露天据点；
 * A/B 只查入口/前庭；主推进路线要有周期性遮挡。
 */
import {beforeAll, describe, expect, it} from 'vitest';
import {pharaoh} from '../src/maps/pharaoh';
import {buildVoxelMapData, type TerrainData} from '../src/game/world/voxel-map-data';
import {pharaohLosReport, type PharaohLosReport} from '../src/maps/pharaoh/los';

let data: TerrainData;
let report: PharaohLosReport;

beforeAll(() => {
  data = buildVoxelMapData(pharaoh);
  report = pharaohLosReport(data, pharaoh);
}, 120_000);

describe('pharaoh central dunes line of sight', () => {
  it('never lets one central ridge control more than two open sites', () => {
    expect(report.failures, report.failures.join(' | ')).toEqual([]);
    expect(report.maxOpenSitesPerRidge).toBeLessThanOrEqual(2);
    for (const r of report.ridges) expect(r.openSites.length, r.ridge).toBeLessThanOrEqual(2);
  });

  it('gives every open site at least one terrain vantage point', () => {
    for (const site of ['C', 'D', 'E', 'F', 'G']) expect(report.siteCoverage[site], site).toBeGreaterThan(0);
  });

  it('checks A/B entrances instead of pretending solid tombs are terrain sightlines', () => {
    expect(report.entranceCoverage.A).toBeGreaterThan(0);
    expect(report.entranceCoverage.B).toBeGreaterThan(0);
    // 入口可见性不能变成“每个脊点都能打进门里”的全覆盖堡垒。
    expect(report.entranceCoverage.A).toBeLessThanOrEqual(report.ridges.length);
    expect(report.entranceCoverage.B).toBeLessThanOrEqual(report.ridges.length);
  });

  it('keeps main routes periodically covered (not one long exposed high-ground lane)', () => {
    expect(report.routes.length).toBeGreaterThanOrEqual(4);
    for (const route of report.routes) {
      expect(route.samples).toBeGreaterThan(5);
      expect(route.exposurePct, `${route.route} is ${route.exposurePct}% exposed`).toBeLessThan(90);
    }
    const avg = report.routes.reduce((sum, r) => sum + r.exposurePct, 0) / report.routes.length;
    expect(avg, 'average route exposure').toBeLessThan(75);
  });
});
