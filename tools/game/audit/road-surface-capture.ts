/**
 * 跨地图道路表层合成 · before/after 真实 world 截图。
 *
 * 每张图单独加载真实 `game.html?map=<id>`（真实体素/材质/建筑，不是平面图），
 * 冻结引擎循环后设置相机、关雾、渲染一次再截图。四张旧图各一个代表性
 * 道路/特殊地表交点，另加一张断桥桥面（水体不被铺路）作为补充证据。
 *
 * 用法（dev server 在 127.0.0.1:5174）：
 *   npx tsx tools/game/audit/road-surface-capture.ts --out=docs/road-surface-fix/before
 *   npx tsx tools/game/audit/road-surface-capture.ts --out=docs/road-surface-fix/after
 *   npx tsx tools/game/audit/road-surface-capture.ts --plan
 *
 * 说明：世界只读；本脚本只写 --out 指定目录。
 */
import { chromium, type Browser, type Page } from 'playwright';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { browserExecutable } from './browser';

type Vec3 = [number, number, number];

interface Scene {
  id: string;
  map: string;
  title: string;
  /** 相机世界坐标（x, y, z），y 为高度。 */
  pos: Vec3;
  /** 注视点（世界坐标）。 */
  look: Vec3;
  fov?: number;
  far?: number;
  near?: number;
  note?: string;
}

interface SceneResult {
  id: string;
  map: string;
  title: string;
  file: string;
  pos: Vec3;
  quat: number[];
  fov: number;
  far: number;
  calls: number;
  triangles: number;
  memory: { geometries: number; textures: number };
  bytes: number;
  note?: string;
}

interface VersionInfo {
  version?: string;
  buildId?: string;
  mapRevision?: string;
  materialRevision?: string;
}

const SCENES: Scene[] = [
  {
    id: 'docks-east-pier',
    map: 'docks',
    title: '船坞 · 东码头（主路 / PIER A 横穿混凝土码头）',
    pos: [264, 22, 121],
    look: [220, 1, 121],
    fov: 60,
    far: 700,
    note: '码头作业区 asphalt 与东码头 concrete 两层作者地表；东侧主路 x≈205、PIER A z≈120 都在此交叉。',
  },
  {
    id: 'broken-bridge-gas-station',
    map: 'broken_bridge',
    title: '断桥 · 加油站前庭（镇前道路斜切混凝土场坪）',
    pos: [204, 20, 190],
    look: [170, 1, 214],
    fov: 62,
    far: 700,
    note: '加油站 concrete patch [144..186, 204..228]；镇前 secondary 从北缘 z≈202 斜穿。',
  },
  {
    id: 'broken-bridge-deck',
    map: 'broken_bridge',
    title: '断桥 · 桥面与河谷（后置桥体箱，不被道路填色）',
    pos: [154, 18, 198],
    look: [130, 2, 150],
    fov: 65,
    far: 800,
    note: '完整桥面 concrete [110..150, 130..170]；主路 x≈132 穿过，但桥面是后置 box，水下格子不得被铺路。',
  },
  {
    id: 'garden-service-yard',
    map: 'garden',
    title: '花园 · 东服务院（外环 path 纵穿混凝土院坪）',
    pos: [248, 32, 134],
    look: [278, 1, 82],
    fov: 60,
    far: 700,
    note: '东侧服务院 concrete [262..298, 52..112]；外环 path x=276.5 纵穿整块混凝土院坪。',
  },
  {
    id: 'garden-east-gate',
    map: 'garden',
    title: '花园 · 东门房前庭（外环 secondary 压到混凝土门庭）',
    pos: [274, 30, 184],
    look: [250, 1, 150],
    fov: 62,
    far: 700,
    note: '东门房前庭 concrete [236..260, 134..166]；东门 secondary x=260..276.5 的核心伸进前庭西缘。',
  },
  {
    id: 'airfield-runway-taxiway',
    map: 'airfield',
    title: '机场 · 南机坪 / 机库道 / 09-27 跑道与滑行道',
    pos: [188, 32, 104],
    look: [148, 1, 142],
    fov: 62,
    far: 900,
    note: '南侧机坪 asphalt [84..214, 14..112] 被机库道 x=150 穿过；北侧滑行道 z=184 与跑道 z=150 在远处交会。',
  },
];

const HIDE_HUD_CSS =
  '.game-hud,.prep-overlay,.game-loading,.nameplate-layer,.lobby,.respawn-map,.tactical-map{display:none!important}';

function arg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const OUT_DIR = arg('out', 'docs/road-surface-fix/before');
const RES = arg('res', '64');
const QUALITY = arg('quality', 'high');
const BASE_URL = arg('base', process.env.GAME_BASE_URL || 'http://127.0.0.1:5174');
const VIEWPORT = arg('viewport', '1600x900').split('x').map((n) => Number(n) || 0);
const ONLY = arg('only', '');
const PLAN = flag('plan');
const TIMEOUT_MS = Number(arg('timeout', '180000'));

function selectedScenes(): Scene[] {
  const only = ONLY.split(',').map((item) => item.trim()).filter(Boolean);
  return SCENES.filter((scene) => !only.length || only.some((token) => scene.map === token || scene.id.startsWith(token)));
}

/**
 * 与 vite.config.ts 完全相同的 BUILD_ID 算法：src + public 逐文件 SHA-256 前 16 位。
 * dev server 的 `/version.json` 在启动时冻结，HMR 改代码不会刷新，所以另记源文件指纹。
 */
function sourceBuildId(): string {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };
  const hash = createHash('sha256');
  const fingerprint = (dir: string) => {
    for (const item of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, item);
      if (fs.statSync(file).isDirectory()) fingerprint(file);
      else if (!file.endsWith('version.json')) hash.update(file).update(fs.readFileSync(file));
    }
  };
  fingerprint('src');
  fingerprint('public');
  hash.update(pkg.version);
  return hash.digest('hex').slice(0, 16);
}

async function readServerVersion(page: Page): Promise<VersionInfo | null> {
  try {
    return (await page.evaluate(async () => {
      try {
        const response = await fetch('/version.json', { cache: 'no-store' });
        return response.ok ? await response.json() : null;
      } catch {
        return null;
      }
    })) as VersionInfo | null;
  } catch {
    return null;
  }
}

/** dev server 启动时冻结的 identity 不一定是最新 build；另读 dist/version.json。 */
function readDistVersion(): VersionInfo | null {
  try {
    return JSON.parse(fs.readFileSync('dist/version.json', 'utf8')) as VersionInfo;
  } catch {
    return null;
  }
}

function gameUrl(map: string) {
  return `${BASE_URL}/game.html?map=${map}&size=8&bots=0&prep=999&res=${RES}&quality=${QUALITY}&seed=1106&audit=1`;
}

async function bootFrozenPage(browser: Browser, map: string) {
  const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text().slice(0, 400));
  });
  await page.addInitScript('window.__name = (v) => v');
  await page.goto(gameUrl(map));
  await page.locator('.lobby-solo').evaluate((button) => (button as HTMLButtonElement).click());
  await page.waitForFunction(() => (window as any).__game?.activated === true, null, { timeout: TIMEOUT_MS });
  await page.waitForFunction(() => !document.querySelector('.game-loading'), null, { timeout: 60000 });
  // 等世界贴图/材质图集 decode 完成，否则截到灰块。
  await page.waitForFunction(
    () => {
      const game = (window as any).__game;
      if (!game?.scene) return false;
      let pending = false;
      game.scene.traverse((object: any) => {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          const image = material?.map?.image;
          if (image instanceof HTMLImageElement && (!image.complete || !image.naturalWidth)) pending = true;
        }
      });
      return !pending;
    },
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(500);
  await page.addStyleTag({ content: HIDE_HUD_CSS });
  // 冻结引擎循环；恢复被距离裁剪的载具，保存地图雾供手动关雾。
  await page.evaluate(() => {
    const game = (window as any).__game;
    cancelAnimationFrame(game.raf);
    game.disposed = true;
    game.input?.release?.();
    game.viewmodel?.setEquipped?.(false);
    game.__auditFog = game.scene.fog;
    for (const vehicle of game.vehicles ?? []) vehicle.model.visible = true;
  });
  return { page, errors };
}

async function captureScene(page: Page, scene: Scene): Promise<Omit<SceneResult, 'bytes'>> {
  const file = path.join(OUT_DIR, `${scene.id}.png`);
  const info = await page.evaluate((spec: Scene) => {
    const game = (window as any).__game;
    const camera = game.camera;
    camera.up.set(0, 1, 0);
    const ground = game.arena.navigationHeight?.(spec.pos[0], spec.pos[2]) ?? game.arena.heightAt?.(spec.pos[0], spec.pos[2]) ?? 0;
    const eyeY = Number.isFinite(ground) ? Math.max(spec.pos[1], ground + 0.9) : spec.pos[1];
    camera.position.set(spec.pos[0], eyeY, spec.pos[2]);
    camera.lookAt(...spec.look);
    camera.fov = spec.fov ?? 55;
    camera.near = spec.near ?? 0.15;
    camera.far = spec.far ?? 2000;
    camera.updateProjectionMatrix();
    game.scene.fog = null;
    game.renderer.info.reset();
    game.renderer.render(game.scene, camera);
    const memory = game.renderer.info.memory;
    return {
      pos: camera.position.toArray() as [number, number, number],
      quat: camera.quaternion.toArray() as number[],
      fov: camera.fov,
      far: camera.far,
      calls: game.renderer.info.render.calls,
      triangles: game.renderer.info.render.triangles,
      memory: { geometries: memory.geometries, textures: memory.textures },
    };
  }, scene);
  await page.screenshot({ path: file });
  const bytes = fs.statSync(file).size;
  if (bytes < 10_000) throw new Error(`${scene.id} 截图过小（${bytes} B），可能黑屏/未渲染`);
  return {
    id: scene.id,
    map: scene.map,
    title: scene.title,
    file: path.basename(file),
    pos: info.pos,
    quat: info.quat,
    fov: info.fov,
    far: info.far,
    calls: info.calls,
    triangles: info.triangles,
    memory: info.memory,
    note: scene.note,
  };
}

function writeIndex(rows: SceneResult[], version: VersionInfo | null, serverVersion: VersionInfo | null, distVersion: VersionInfo | null, sourceId: string, errors: string[]) {
  const lines: string[] = [];
  lines.push('# 跨地图道路表层合成 · 真实 world 截图');
  lines.push('');
  lines.push(
    `> 采集时间：${new Date().toISOString()} · 源文件 BUILD_ID：\`${sourceId}\` · dist/version.json：\`${distVersion?.buildId ?? '未构建'}\` · dev server BUILD_ID：\`${serverVersion?.buildId ?? 'unknown'}\``,
  );
  lines.push(
    `> 版本 ${version?.version ?? 'unknown'} · MAP_REVISION \`${version?.mapRevision ?? 'unknown'}\` · MATERIAL_REVISION \`${version?.materialRevision ?? 'unknown'}\` · viewport ${VIEWPORT[0]}×${VIEWPORT[1]} · res=${RES} quality=${QUALITY}`,
  );
  lines.push('> 真实体素 world（`game.html`），非平面图/预览模型；冻结 `engine.raf` 后手动机位、关雾渲染，HUD 已隐藏。');
  lines.push('> `源文件 BUILD_ID` 与 vite 的同一算法（src+public 内容哈希）；dev server 的 `/version.json` 在启动时冻结，仅作参考。');
  lines.push('');
  lines.push('| 图 | 场景 | 文件 | 相机 (x,y,z) | FOV | far | calls | tris |');
  lines.push('|---|---|---|---|---:|---:|---:|---:|');
  for (const row of rows) {
    lines.push(
      `| ${row.map} | ${row.title} | [${row.file}](${row.file}) | ${row.pos.map((n) => n.toFixed(1)).join(', ')} | ${row.fov} | ${row.far} | ${row.calls} | ${row.triangles} |`,
    );
  }
  lines.push('');
  for (const row of rows) {
    lines.push(`## ${row.map} · ${row.title}`);
    lines.push('');
    lines.push(`![${row.title}](${row.file})`);
    lines.push('');
    lines.push(
      `文件 \`${row.file}\` · 相机 \`${row.pos.map((n) => n.toFixed(1)).join(', ')}\` · 四元数 \`${row.quat.map((n) => n.toFixed(3)).join(', ')}\` · FOV ${row.fov} · far ${row.far} · calls ${row.calls} · tris ${row.triangles} · ${Math.round(row.bytes / 1024)} KB`,
    );
    if (row.note) lines.push('', `> ${row.note}`);
    lines.push('');
  }
  if (errors.length) {
    lines.push('## 采集告警');
    lines.push('');
    for (const error of errors) lines.push(`- \`${error}\``);
    lines.push('');
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.md'), lines.join('\n'));
}

function writeComparison(sourceId: string) {
  const beforePath = 'docs/road-surface-fix/before/manifest.json';
  const afterPath = 'docs/road-surface-fix/after/manifest.json';
  if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) return;
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
  const pair = (rows: any[]) => new Map(rows.map((row) => [row.id, row]));
  const beforeRows = pair(before.scenes ?? []);
  const afterRows = pair(after.scenes ?? []);
  const ids = [...new Set([...beforeRows.keys(), ...afterRows.keys()])];
  const lines: string[] = [];
  lines.push('# 跨地图道路表层合成修复 · before / after');
  lines.push('');
  lines.push(`> before 源文件 BUILD_ID：\`${before.sourceBuildId ?? before.version?.buildId ?? 'unknown'}\` · dev server \`${before.serverVersion?.buildId ?? 'unknown'}\``);
  lines.push(`> after 源文件 BUILD_ID：\`${after.sourceBuildId ?? after.version?.buildId ?? 'unknown'}\` · dist/version.json \`${after.distVersion?.buildId ?? '未构建'}\` · dev server \`${after.serverVersion?.buildId ?? 'unknown'}\``);
  lines.push(`> after 采集时间：${after.generatedAt ?? 'unknown'}`);
  lines.push('');
  lines.push('同一机位、同一场景、同一 URL 参数、同一冻结逻辑；before 在改代码前采集，after 在修复后采集。');
  lines.push('');
  lines.push('| 场景 | before | after | 机位 |');
  lines.push('|---|---|---|---|');
  for (const id of ids) {
    const b = beforeRows.get(id) as any;
    const a = afterRows.get(id) as any;
    const pos = (a ?? b)?.pos?.map((n: number) => n.toFixed(1)).join(', ') ?? '';
    lines.push(`| ${(a ?? b)?.title ?? id} | ${b ? `[before/${b.file}](before/${b.file})` : '—'} | ${a ? `[after/${a.file}](after/${a.file})` : '—'} | ${pos} |`);
  }
  lines.push('');
  lines.push('完整清单见 [before/index.md](before/index.md) 与 [after/index.md](after/index.md)。');
  lines.push('');
  const comparison = {
    generatedAt: new Date().toISOString(),
    sourceBuildId: { before: before.sourceBuildId ?? null, after: after.sourceBuildId ?? null },
    serverBuildId: { before: before.serverVersion?.buildId ?? null, after: after.serverVersion?.buildId ?? null },
    distBuildId: { before: before.distVersion?.buildId ?? null, after: after.distVersion?.buildId ?? null },
    version: { before: before.version ?? null, after: after.version ?? null },
    scenes: ids.map((id) => ({ id, before: beforeRows.get(id) ?? null, after: afterRows.get(id) ?? null })),
    errors: { before: before.errors ?? [], after: after.errors ?? [] },
  };
  fs.writeFileSync('docs/road-surface-fix/manifest.json', JSON.stringify(comparison, null, 2));
  fs.writeFileSync('docs/road-surface-fix/index.md', lines.join('\n'));
}

async function main() {
  const scenes = selectedScenes();
  if (!scenes.length) throw new Error(`--only=${ONLY} 没有匹配场景`);
  const sourceId = sourceBuildId();
  if (PLAN) {
    console.log(`[road-surface] 输出目录：${OUT_DIR}`);
    console.log(`[road-surface] 源文件 BUILD_ID：${sourceId}`);
    console.log(`[road-surface] viewport ${VIEWPORT[0]}×${VIEWPORT[1]} · scenes ${scenes.length}`);
    for (const scene of scenes) console.log(`  ${scene.id.padEnd(30)} ${scene.map.padEnd(14)} ${scene.title}`);
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'], executablePath: browserExecutable() });
  const rows: SceneResult[] = [];
  const errors: string[] = [];
  let version: VersionInfo | null = null;
  let serverVersion: VersionInfo | null = null;
  try {
    for (const map of [...new Set(scenes.map((scene) => scene.map))]) {
      const mapScenes = scenes.filter((scene) => scene.map === map);
      const { page, errors: pageErrors } = await bootFrozenPage(browser, map);
      if (!version) { version = await readServerVersion(page); serverVersion = version; }
      for (const scene of mapScenes) {
        try {
          const result = await captureScene(page, scene);
          const bytes = fs.statSync(path.join(OUT_DIR, result.file)).size;
          rows.push({ ...result, bytes });
          console.log(
            `[road-surface] ${result.id.padEnd(30)} calls ${String(result.calls).padStart(4)} tris ${String(result.triangles).padStart(7)} ${Math.round(bytes / 1024)} KB`,
          );
        } catch (error) {
          const message = `${scene.id}: ${String((error as Error)?.message ?? error)}`;
          errors.push(message);
          console.error(`[road-surface] FAIL ${message}`);
        }
      }
      errors.push(...pageErrors);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const distVersion = readDistVersion();
  const manifest = {
    tool: 'road-surface-capture',
    generatedAt: new Date().toISOString(),
    phase: path.basename(OUT_DIR),
    urlPattern: gameUrl('<map>'),
    viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}`,
    res: Number(RES),
    quality: QUALITY,
    sourceBuildId: sourceId,
    serverVersion,
    distVersion,
    version,
    scenes: rows,
    errors,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeIndex(rows, version, serverVersion, distVersion, sourceId, errors);
  writeComparison(sourceId);
  console.log(`[road-surface] 完成 ${rows.length}/${scenes.length} 张 → ${OUT_DIR}/index.md`);
  console.log(`[road-surface] 源文件 BUILD_ID ${sourceId} · dev server ${serverVersion?.buildId ?? 'unknown'}`);
  if (rows.length !== scenes.length || errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
