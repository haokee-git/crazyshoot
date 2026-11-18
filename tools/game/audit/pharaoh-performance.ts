/**
 * 法老坟墓 · AUD-01 性能采样（headless Chromium，真实 world；0.20.3 / 800 m 七据点）。
 *
 * 采样内容：draw calls / triangles / sim step p95 / render submit / frame time /
 * heap / GPU geometries+textures+programs / Worker buildMs / 玩家数 / 载具数。
 * 场景：
 *   - 8v8 基线、8v8 + 4× CPU 节流参考（CDP Emulation.setCPUThrottlingRate）
 *   - 12v12 基线
 *   - 12v12 + 8 辆合成压力车（地图 32 + 8 = 40 辆）
 *
 * 用法（地图冻结后执行）：
 *   npx tsx tools/game/audit/pharaoh-performance.ts --plan
 *   BENCH_MAP=pharaoh BENCH_SIZE=8,12 npx tsx tools/game/audit/pharaoh-performance.ts
 *   BENCH_OUT=docs/map-pharaoh/acceptance-0.20.3/pharaoh-performance.json BENCH_SECONDS=60
 *   BENCH_RUNS=8v8,8v8-cpu4x,12v12,12v12-40veh npx tsx tools/game/audit/pharaoh-performance.ts
 *
 * 依赖：dev server 在 5174（`npm run dev -- --host 127.0.0.1 --port 5174`）。
 * 说明：不改 src/**；默认只写 docs/map-pharaoh/acceptance-0.20.3/**。
 */
import { chromium, type Browser, type CDPSession, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { browserExecutable } from './browser';

interface RunSpec {
  /** JSON 报告里的稳定标签，也用于 BENCH_RUNS 过滤。 */
  label: string;
  size: number;
  /** CDP CPU 节流倍率（1 = 不节流）。 */
  cpu: number;
  /** 额外合成的压力载具数量；地图初始 32 辆，8 → 全图 40 辆。 */
  stress: number;
  seconds: number;
}

interface StatSummary {
  median: number;
  p95: number;
  p99: number;
  max: number;
  count: number;
}

interface RunResult {
  label: string;
  map: string;
  size: number;
  cpuThrottle: number;
  stressVehicles: number;
  seconds: number;
  quality: string;
  res: number;
  frameLimit: number;
  viewport: string;
  hardware: string;
  buildId?: string;
  mapRevision?: string;
  materialRevision?: string;
  version?: string;
  players: number;
  vehicles: number;
  caps: number;
  renderSize?: string;
  frames: number;
  frameMs: StatSummary;
  fps: number;
  simulationStepMs: StatSummary;
  renderSubmitMs: StatSummary;
  calls: StatSummary;
  triangles: StatSummary;
  gpuObjects: { geometries: number; textures: number; programs: number | null };
  heap: number | null;
  workerBuildMs: number | null;
  terrain: { voxels: number | null; chunks: number | null; navLayers: number | null };
  simulationOverload: number | null;
  deadFrames: number;
  failed: boolean;
  errors: string[];
}

const DEFAULT_RUNS: Array<Omit<RunSpec, 'seconds'>> = [
  { label: '8v8', size: 8, cpu: 1, stress: 0 },
  { label: '8v8-cpu4x', size: 8, cpu: 4, stress: 0 },
  { label: '12v12', size: 12, cpu: 1, stress: 0 },
  { label: '12v12-40veh', size: 12, cpu: 1, stress: 8 },
];

function arg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}
function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

const MAP = process.env.BENCH_MAP || 'pharaoh';
const BASE_URL = arg('base', process.env.GAME_BASE_URL || 'http://127.0.0.1:5174');
const OUT_FILE = arg('out', process.env.BENCH_OUT || 'docs/map-pharaoh/acceptance-0.20.3/pharaoh-performance.json');
const APPEND = process.env.BENCH_APPEND === '1';
const PLAN = flag('plan');
const SECONDS = Number(process.env.BENCH_SECONDS || arg('seconds', '60'));
const VIEWPORT = { width: 1280, height: 720 };
const QUALITY = process.env.BENCH_QUALITY || 'low';
const RES = Number(process.env.BENCH_RES || '64');
const TIMEOUT_MS = Number(process.env.BENCH_TIMEOUT || '180000');
const HARDWARE = process.env.BENCH_HARDWARE || 'Apple M5 Pro / Chromium headless (not J1900)';

function selectRuns(): RunSpec[] {
  const only = new Set((process.env.BENCH_RUNS || '').split(',').map((item) => item.trim()).filter(Boolean));
  const sizes = new Set((process.env.BENCH_SIZE || '').split(',').map((item) => item.trim()).filter(Boolean).map(Number).filter((n) => Number.isFinite(n) && n > 0));
  const cpus = new Set((process.env.BENCH_CPU || '').split(',').map((item) => item.trim()).filter(Boolean).map(Number).filter((n) => Number.isFinite(n) && n > 0));
  const stressEnv = (process.env.BENCH_STRESS || '').trim();
  const stressOverride = stressEnv ? Number(stressEnv) : NaN;
  return DEFAULT_RUNS
    .filter((run) => !only.size || only.has(run.label))
    .filter((run) => !sizes.size || sizes.has(run.size))
    .filter((run) => !cpus.size || cpus.has(run.cpu))
    .map((run) => ({
      ...run,
      stress: Number.isFinite(stressOverride) && run.stress > 0 ? stressOverride : run.stress,
      seconds: SECONDS,
    }));
}

function summarize(values: number[]): StatSummary {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return { median: 0, p95: 0, p99: 0, max: 0, count: 0 };
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return {
    median: +at(.5).toFixed(3),
    p95: +at(.95).toFixed(3),
    p99: +at(.99).toFixed(3),
    max: +sorted[sorted.length - 1].toFixed(3),
    count: sorted.length,
  };
}

function gameUrl(size: number) {
  return `${BASE_URL}/game.html?map=${MAP}&size=${size}&bots=1&prep=999&seed=1106&quality=${QUALITY}&res=${RES}&audit=1`;
}

async function readVersion(page: Page) {
  return await page.evaluate(async () => {
    try {
      const response = await fetch('/version.json', { cache: 'no-store' });
      return response.ok ? await response.json() : null;
    } catch { return null; }
  }) as { version?: string; buildId?: string; mapRevision?: string; materialRevision?: string } | null;
}

async function bootPage(browser: Browser, spec: RunSpec) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 400)); });
  await page.addInitScript('window.__name = (v) => v');
  // 固定 60 fps 上限：默认「不限帧」在 headless 下会跑到数千帧，frameMs/fps 失去参考意义。
  await page.addInitScript(() => {
    try {
      const prior = JSON.parse(localStorage.getItem('crazyshoot.settings') || '{}');
      localStorage.setItem('crazyshoot.settings', JSON.stringify({ ...prior, frameLimit: 60, rev: 2 }));
    } catch { /* ignore */ }
  });
  await page.goto(gameUrl(spec.size));
  // 大厅覆盖层会吞普通 click：locator.evaluate 直接触发按钮。
  await page.locator('.lobby-solo').evaluate((button) => (button as HTMLButtonElement).click());
  await page.waitForFunction(() => (window as any).__game?.activated === true, null, { timeout: TIMEOUT_MS });
  return { page, errors };
}

async function applyCpuThrottle(page: Page, rate: number): Promise<CDPSession | null> {
  if (rate <= 1) return null;
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate });
  return session;
}

async function measure(page: Page, spec: RunSpec, version: Awaited<ReturnType<typeof readVersion>>): Promise<RunResult> {
  const data = await page.evaluate(async ({ stress, seconds }) => {
    const game = (window as any).__game;
    // 开局：真实 live 状态、AI 已补位、输入锁定。
    game.winner = '';
    game.forceStart();
    game.paused = false;
    game.overlayOpen = false;
    game.mapOpen = false;
    game.dead = false;
    game.armed = true;
    game.input.pointerLocked = true;
    game.bannerUntil = 0;
    game.protectedUntil = 0;
    await new Promise<void>((resolve) => setTimeout(resolve, 700));

    // 12v12 + 40 辆压力：真实 buildVehicleState（模型/武器/阴影注册全走生产路径）。
    const stressIds: string[] = [];
    // 800 m 新图：南部主轴与绿洲—采石场之间的空旷沙地（不压 C/E/G 建筑与占点圈）。
    const spots: Array<[number, number]> = [
      [250, 190], [270, 200], [230, 210], [290, 210],
      [210, 230], [310, 230], [250, 170], [270, 170],
    ];
    const kinds = ['mbt', 'light_tank', 'ifv', 'apc', 'jeep', 'motorcycle'];
    for (let i = 0; i < stress; i++) {
      const [x, z] = spots[i % spots.length];
      const y = (game.arena.vehicleGroundAt?.(x, z) ?? game.arena.heightAt?.(x, z) ?? 0) + 0.05;
      try {
        game.buildVehicleState({ id: `stress-${i + 1}`, kind: kinds[i % kinds.length], team: 'neutral', x, y, z, yaw: (i * 37) * Math.PI / 180 });
        stressIds.push(`stress-${i + 1}`);
      } catch { /* 压力车失败不致命，记录在 vehicles 差值里 */ }
    }

    // 逐帧统计必须挂在 renderFrame 上：RenderPipeline 一帧内会多次 renderer.render
    // （主场景/glow/hands/合成），按 renderer.render 取样会把一帧拆成 4–6 个假帧。
    const frameGaps: number[] = [];
    const simTimes: number[] = [];
    const renderTimes: number[] = [];
    const calls: number[] = [];
    const triangles: number[] = [];
    let lastFrame = performance.now();
    const renderFrame0 = game.renderFrame.bind(game);
    game.renderFrame = (now: number) => {
      const t0 = performance.now();
      frameGaps.push(t0 - lastFrame);
      lastFrame = t0;
      renderFrame0(now);
      renderTimes.push(performance.now() - t0);
      // RenderPipeline 在帧首 info.reset() 后累计，读到的就是整帧 calls/tris。
      calls.push(game.renderer.info.render.calls);
      triangles.push(game.renderer.info.render.triangles);
    };
    const simulate0 = game.simulate.bind(game);
    game.simulate = (dt: number) => {
      const t0 = performance.now();
      simulate0(dt);
      simTimes.push(performance.now() - t0);
    };

    let deadFrames = 0;
    let decisions = 0;
    let nextDecision = 0;
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const now = performance.now();
        if (now - start > seconds * 1000) { resolve(); return; }
        if (game.dead) deadFrames++;
        if (now > nextDecision) {
          nextDecision = now + 150;
          const target = game.caps[(decisions++) % game.caps.length];
          const position = game.controller.position;
          const waypoint = game.navigation?.next(position.x, position.z, target.x, target.z);
          game.input.clear();
          game.input.pointerLocked = true;
          game.paused = false;
          if (!game.dead && waypoint) {
            game.controller.yaw = Math.atan2(-(waypoint.x - position.x), -(waypoint.z - position.z));
            game.input.keys.add('KeyW');
          }
        }
        requestAnimationFrame(tick);
      };
      tick();
    });

    const memory = game.renderer.info.memory;
    const terrain = (window as any).__terrainStats ?? {};
    return {
      seconds: (performance.now() - start) / 1000,
      players: game.hosted.size + 1,
      vehicles: game.vehicles.length,
      caps: game.caps.length,
      renderSize: game.presentation?.target ? `${game.presentation.target.width}×${game.presentation.target.height}` : undefined,
      frameGaps, simTimes, renderTimes, calls, triangles,
      gpuObjects: {
        geometries: memory.geometries,
        textures: memory.textures,
        programs: game.renderer.info.programs?.length ?? null,
      },
      heap: (performance as any).memory?.usedJSHeapSize ?? null,
      workerBuildMs: Number.isFinite(terrain.buildMs) ? terrain.buildMs : null,
      terrain: {
        voxels: terrain.voxels ?? null,
        chunks: terrain.chunks ?? null,
        navLayers: terrain.navLayers ?? null,
      },
      simulationOverload: Number.isFinite(game.simulation?.overloadSeconds) ? game.simulation.overloadSeconds : null,
      deadFrames,
      failed: !!game.frameFailed,
      stressIds,
    };
  }, { stress: spec.stress, seconds: spec.seconds });

  const frameMs = summarize(data.frameGaps.slice(3));
  return {
    label: spec.label,
    map: MAP,
    size: spec.size,
    cpuThrottle: spec.cpu,
    stressVehicles: data.stressIds.length,
    seconds: +data.seconds.toFixed(2),
    quality: QUALITY,
    res: RES,
    frameLimit: 60,
    viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
    hardware: HARDWARE,
    version: version?.version,
    buildId: version?.buildId,
    mapRevision: version?.mapRevision,
    materialRevision: version?.materialRevision,
    players: data.players,
    vehicles: data.vehicles,
    caps: data.caps,
    renderSize: data.renderSize,
    frames: frameMs.count,
    frameMs,
    fps: frameMs.median ? +(1000 / frameMs.median).toFixed(1) : 0,
    simulationStepMs: summarize(data.simTimes),
    renderSubmitMs: summarize(data.renderTimes),
    calls: summarize(data.calls),
    triangles: summarize(data.triangles),
    gpuObjects: data.gpuObjects,
    heap: data.heap,
    workerBuildMs: data.workerBuildMs,
    terrain: data.terrain,
    simulationOverload: data.simulationOverload,
    deadFrames: data.deadFrames,
    failed: data.failed,
    errors: [],
  };
}

async function main() {
  const runs = selectRuns();
  if (!runs.length) throw new Error('BENCH_RUNS / BENCH_SIZE / BENCH_CPU 过滤后没有可跑场景');
  if (PLAN) {
    console.log(`[perf] map=${MAP} output=${OUT_FILE} seconds=${SECONDS} quality=${QUALITY} res=${RES} viewport=${VIEWPORT.width}x${VIEWPORT.height}`);
    for (const run of runs) console.log(`  ${run.label.padEnd(14)} size=${String(run.size).padEnd(2)} cpu=${run.cpu}× stress=+${run.stress} (${run.seconds}s)`);
    return;
  }
  const browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'], executablePath: browserExecutable() });
  const rows: RunResult[] = APPEND && fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')) as RunResult[] : [];
  try {
    for (const spec of runs) {
      console.log(`[perf] ${spec.label}: ${MAP} ${spec.size}v${spec.size} cpu=${spec.cpu}× stress=+${spec.stress} ${spec.seconds}s`);
      let row: RunResult | undefined;
      let pageErrors: string[] = [];
      let session: CDPSession | null = null;
      try {
        const { page, errors } = await bootPage(browser, spec);
        pageErrors = errors;
        const version = await readVersion(page);
        if (spec.cpu > 1) session = await applyCpuThrottle(page, spec.cpu);
        row = await measure(page, spec, version);
        await page.close();
      } catch (error) {
        console.error(`[perf] ${spec.label} 失败：${String((error as Error)?.message ?? error)}`);
        pageErrors.push(String(error));
      } finally {
        if (session) { try { await session.detach(); } catch { /* page 已关 */ } }
      }
      if (row) {
        row.errors = pageErrors.slice(0, 20);
        rows.push(row);
        const heapMb = row.heap ? (row.heap / 1048576).toFixed(1) : 'n/a';
        console.log(`[perf] ${row.label}: calls p95 ${row.calls.p95} · tris p95 ${row.triangles.p95} · sim p95 ${row.simulationStepMs.p95} ms · fps ${row.fps} · heap ${heapMb} MB · vehicles ${row.vehicles} · players ${row.players}`);
        if (row.failed || row.players !== spec.size * 2) console.error(`[perf] ${row.label}: 异常 failed=${row.failed} players=${row.players}/${spec.size * 2}`);
      } else {
        rows.push({
          label: spec.label, map: MAP, size: spec.size, cpuThrottle: spec.cpu, stressVehicles: 0, seconds: spec.seconds,
          quality: QUALITY, res: RES, frameLimit: 60, viewport: `${VIEWPORT.width}x${VIEWPORT.height}`, hardware: HARDWARE,
          players: 0, vehicles: 0, caps: 0, frames: 0, frameMs: summarize([]), fps: 0,
          simulationStepMs: summarize([]), renderSubmitMs: summarize([]), calls: summarize([]), triangles: summarize([]),
          gpuObjects: { geometries: 0, textures: 0, programs: null }, heap: null, workerBuildMs: null,
          terrain: { voxels: null, chunks: null, navLayers: null }, simulationOverload: null, deadFrames: 0,
          failed: true, errors: pageErrors,
        });
      }
      fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
      fs.writeFileSync(OUT_FILE, JSON.stringify(rows, null, 2));
    }
  } finally {
    await browser.close();
  }
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(rows, null, 2));
  console.log(`[perf] 写入 ${OUT_FILE}（${rows.length} 条）`);
  const failed = rows.some((row) => row.failed || row.errors.length || row.players !== row.size * 2);
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
