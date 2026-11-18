/**
 * 法老坟墓 · AUD-01 真实 world 截图（0.20.3 / 800 m 七据点）。
 *
 * 一次性加载真实 `game.html?map=pharaoh`（真实体素/材质/载具/HUD 以外的世界），
 * 冻结引擎循环后逐场景设置相机/裁剪/雾并调用 renderer.render，再 page.screenshot。
 * 场景按 A–G 七据点分组，每据点 ≥3 个机位（A/B 含室内，C–G 含全景/近景/细节），
 * 另有 2 张总览、3+ 张墓道、2 张基地；机位坐标从 layout/builder 导出常量派生。
 *
 * 用法（地图冻结后执行；默认写入 docs/map-pharaoh/render/）：
 *   npx tsx tools/game/audit/pharaoh-capture.ts
 *   npx tsx tools/game/audit/pharaoh-capture.ts --plan                 # 只打印场景/命令，不启动浏览器
 *   npx tsx tools/game/audit/pharaoh-capture.ts --only=A               # 只拍 A 组（也接受 id 前缀）
 *   npx tsx tools/game/audit/pharaoh-capture.ts --res=128 --quality=high --viewport=1920x1080
 *   npx tsx tools/game/audit/pharaoh-capture.ts --scenes=/tmp/scenes.json  # 按 id 覆盖相机（调机位用）
 *   npx tsx tools/game/audit/pharaoh-capture.ts --probe              # 打印运行时结构几何（墓道出口/画廊/摊位），机位校准用
 *
 * 依赖：dev server 在 5174（`npm run dev -- --host 127.0.0.1 --port 5174`）。
 * 说明：世界只读——本脚本不修改 src/**，只写 docs/map-pharaoh/render/**。
 */
import { chromium, type Browser, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { browserExecutable } from './browser';
import { PHARAOH_LAYOUT } from '../../../src/maps/pharaoh/layout';
import {
  PYRAMID_CENTER,
  PYRAMID_OUTER_BASE,
  PYRAMID_OUTER_TOP,
  PYRAMID_APEX,
  PYRAMID_TOP,
  PYRAMID_ROOMS,
} from '../../../src/game/world/pharaoh-pyramid';
import { SPHINX } from '../../../src/game/world/pharaoh-sphinx';
import { TUNNEL_MOUTHS, tunnelAt, tunnelExitGeom, tunnelFloor } from '../../../src/game/world/pharaoh-tunnel';
import { pharaohHeight } from '../../../src/maps/pharaoh-height';

type Vec3 = [number, number, number];

interface Scene {
  /** 文件名前缀，同时是 manifest 里的稳定 id。 */
  id: string;
  /** index.md 分组：overview / A–G（七据点）/ tunnel / base。 */
  group: string;
  title: string;
  /** 相机世界坐标。 */
  pos: Vec3;
  /** 注视点（世界坐标）。 */
  look: Vec3;
  fov?: number;
  far?: number;
  near?: number;
  /** scene = 保留 map-arena 的雾；off = 关雾（建筑/总览用）。 */
  fog?: 'scene' | 'off';
  /** 俯视图用：[0,0,-1] 表示屏幕上方为 -Z。 */
  up?: Vec3;
  note?: string;
}

interface SceneResult {
  id: string;
  group: string;
  title: string;
  file: string;
  pos: Vec3;
  quat: number[];
  fov: number;
  far: number;
  fog: 'scene' | 'off';
  note?: string;
  buildId?: string;
  res: number;
  quality: string;
  viewport: string;
  calls: number;
  triangles: number;
  memory: { geometries: number; textures: number };
  vehicles: number;
  caps: number;
  bytes: number;
}

interface VersionInfo {
  version?: string;
  buildId?: string;
  mapRevision?: string;
  materialRevision?: string;
}

/* ------------------------------------------------------------------ */
/* 场景清单（800 m / 七据点 A–G；坐标由 layout 与 builder 导出常量派生） */
/* ------------------------------------------------------------------ */

const A = PHARAOH_LAYOUT.A;
const B = PHARAOH_LAYOUT.B;
const C = PHARAOH_LAYOUT.C;
const D = PHARAOH_LAYOUT.D;
const E = PHARAOH_LAYOUT.E;
const F = PHARAOH_LAYOUT.F;
const G = PHARAOH_LAYOUT.G;
const CHAMBER = PYRAMID_ROOMS.find((room) => room.id === 'burial-chamber')!;
const UPPER = PYRAMID_ROOMS.find((room) => room.id === 'upper-spine')!;
const TUNNEL_MID = tunnelAt(48);
const TUNNEL_LOOK = tunnelAt(78);
const EXITS = tunnelExitGeom((x, z) => Math.round(pharaohHeight(x, z)));
const EXIT_A = EXITS[0];
const EXIT_B = EXITS[1];

const SCENES: Scene[] = [
  /* 总览：800 m 全图。 */
  { id: '00-overview-oblique', group: 'overview', title: '800 m 全图斜俯视（南向北）', pos: [400, 720, 1060], look: [400, 0, 400], fov: 55, far: 3400, fog: 'off' },
  { id: '01-overview-top', group: 'overview', title: '800 m 全图正俯视（北向上）', pos: [400.5, 1150, 400.5], look: [400.5, 0, 401.5], fov: 45, far: 4200, fog: 'off', up: [0, 0, -1] },

  /* A 金字塔：中心 (190,610)，外层 264×264 / 外顶 +58，墓室 +5 / 上层 +20。 */
  { id: '10-pyramid-far', group: 'A', title: 'A 金字塔远景（264 m 外层 / 外顶 +58）', pos: [A.x + 240, 130, A.z + 170], look: [A.x, 30, A.z], fov: 55, far: 3600, fog: 'off' },
  { id: '11-pyramid-near', group: 'A', title: 'A 金字塔西面近景（外层西大阶梯）', pos: [A.x - 150, 70, A.z - 90], look: [A.x, 24, A.z], fov: 55, far: 1800, fog: 'off' },
  { id: '12-pyramid-summit', group: 'A', title: 'A 金字塔顶俯视（+58 平台）', pos: [A.x, 92, A.z + 90], look: [A.x, 57, A.z], fov: 56, far: 3000, fog: 'off' },
  { id: '13-pyramid-a-chamber', group: 'A', title: 'A 墓室（32×26，地面 +5）', pos: [(CHAMBER.x0 + CHAMBER.x1) / 2, 7.0, CHAMBER.z0 - 7], look: [(CHAMBER.x0 + CHAMBER.x1) / 2, 6.3, CHAMBER.z0 + 15], fov: 70, far: 160, fog: 'off' },
  { id: '14-pyramid-upper-gallery', group: 'A', title: 'A 上层南北廊（+20）', pos: [UPPER.x0 + 3, 21.65, UPPER.z1 - 2], look: [UPPER.x0 + 3, 21.25, UPPER.z0 + 2], fov: 76, far: 140, fog: 'off' },

  /* B 狮身人面像：中心 (460,640)，本体 150×52 / 头顶 +41，内殿 40×24 地面 +4。 */
  { id: '20-sphinx-side', group: 'B', title: 'B 狮身人面像 3/4 南侧（臀拱 / 背凹 / 胸肩）', pos: [B.x + 75, 28, B.z + 105], look: [B.x - 10, 14, B.z - 5], fov: 56, far: 1600, fog: 'off' },
  { id: '20b-sphinx-profile', group: 'B', title: 'B 狮身人面像正侧面（比例审查）', pos: [B.x - 30, 42, B.z + 100], look: [B.x, 16, B.z], fov: 58, far: 1600, fog: 'off' },
  { id: '21-sphinx-front', group: 'B', title: 'B 狮身人面像正面（东侧）', pos: [B.x + 180, 30, B.z], look: [B.x + 10, 16, B.z], fov: 55, far: 2200, fog: 'off' },
  { id: '22-sphinx-paws', group: 'B', title: 'B 狮身双前爪 / 前庭近景', pos: [B.x + 115, 16, B.z + 10], look: [(SPHINX.forecourt.x0 + SPHINX.forecourt.x1) / 2, 10, B.z], fov: 60, far: 600, fog: 'scene' },
  { id: '23-sphinx-b-chamber', group: 'B', title: 'B 内殿（40×24，地面 +4）', pos: [SPHINX.hall.x1 - 6, 5.9, B.z], look: [SPHINX.hall.x0 + 5, 5.1, B.z], fov: 72, far: 160, fog: 'off' },

  /* C 沙漠集市：中心 (475,395)，街区 330×300，主街南北向。 */
  { id: '40-bazaar-main-street', group: 'C', title: 'C 集市主街（北向南）', pos: [C.x + 3, 8.2, C.z + 145], look: [C.x, 2.6, C.z + 15], fov: 70, far: 700, fog: 'scene' },
  { id: '41-bazaar-c-point', group: 'C', title: 'C 街心广场（斜俯视）', pos: [C.x + 50, 30, C.z - 60], look: [C.x, 2.2, C.z], fov: 58, far: 900, fog: 'scene' },
  { id: '42-bazaar-stalls-a', group: 'C', title: 'C 西侧陶匠院 / 摊位群 A', pos: [C.x - 90, 12, C.z + 75], look: [C.x - 45, 2.0, C.z + 75], fov: 62, far: 400, fog: 'scene' },
  { id: '43-bazaar-stalls-b', group: 'C', title: 'C 东侧货运院 / 摊位群 B', pos: [C.x + 165, 16, C.z + 55], look: [C.x + 125, 2.0, C.z + 25], fov: 60, far: 400, fog: 'scene' },
  { id: '44-bazaar-cross-street', group: 'C', title: 'C 集市横街（东向西）', pos: [C.x + 125, 8.2, C.z - 1], look: [C.x - 55, 3.0, C.z - 1], fov: 66, far: 800, fog: 'scene' },

  /* D 绿洲：D 点 (175,290)，湖心 (115,230)，水面 −2。 */
  { id: '50-oasis-lake', group: 'D', title: 'D 绿洲湖泊全景（东南向西）', pos: [D.x + 125, 60, D.z + 90], look: [115, -2, 230], fov: 55, far: 2200, fog: 'off' },
  { id: '51-oasis-d-point', group: 'D', title: 'D 东北岸据点', pos: [D.x + 45, 11, D.z + 50], look: [D.x, 0.8, D.z], fov: 64, far: 700, fog: 'scene' },
  { id: '52-oasis-water-fp', group: 'D', title: 'D 湖面第一人称（向湖心）', pos: [180, -0.3, 280], look: [140, -1.8, 250], fov: 75, far: 900, fog: 'scene', note: '眼位约水面 +1.7 m' },

  /* E 公路驿站：E 点 (350,105)，场区 165×120，环场道 + 加油棚 + 维修库。 */
  { id: '60-service-area', group: 'E', title: 'E 驿站场区全景（南向北）', pos: [E.x + 110, 35, E.z + 105], look: [E.x, 3, E.z], fov: 58, far: 1600, fog: 'off' },
  { id: '61-service-canopy', group: 'E', title: 'E 加油棚与加油岛（棚下沿岛）', pos: [340, 4.8, 105], look: [310, 3.0, 105], fov: 68, far: 350, fog: 'scene' },
  { id: '62-service-garage', group: 'E', title: 'E 维修库（北侧开口，向库内看）', pos: [330, 8, 150], look: [320, 3.4, 112], fov: 66, far: 350, fog: 'scene' },
  { id: '63-service-parking', group: 'E', title: 'E 东侧停车区（3 中立载具位）', pos: [430, 12, 152], look: [395, 2.0, 125], fov: 62, far: 400, fog: 'scene' },

  /* F 卡纳克列柱神庙：中心 (650,130)，仪式轴 x=650，柱厅/方尖碑/南门楼。 */
  { id: '70-temple-f', group: 'F', title: 'F 卡纳克列柱神庙全景（柱阵 + 方尖碑）', pos: [F.x + 120, 35, F.z + 125], look: [F.x, 14, F.z], fov: 58, far: 1400, fog: 'off' },
  { id: '71-temple-f-court', group: 'F', title: 'F 主柱厅内景（中殿柱列）', pos: [700, 12, 158], look: [650, 9, 118], fov: 68, far: 300, fog: 'scene' },
  { id: '72-temple-f-obelisk', group: 'F', title: 'F 前庭双列柱与方尖碑', pos: [700, 14, 72], look: [650, 10, 92], fov: 62, far: 350, fog: 'scene' },
  { id: '73-temple-f-pylon', group: 'F', title: 'F 南门楼（20 m 门洞）', pos: [760, 20, 42], look: [650, 12, 76], fov: 58, far: 600, fog: 'scene' },

  /* G 帝王谷采石场：中心 (210,420)，三级开采台阶 / 石料堆场 / 半埋巨像。 */
  { id: '80-quarry-g', group: 'G', title: 'G 帝王谷采石场全景（三级台阶 + 装车台 + 石料堆）', pos: [G.x + 90, 30, G.z + 80], look: [G.x - 10, 5, G.z - 20], fov: 60, far: 1200, fog: 'off' },
  { id: '81-quarry-colossus', group: 'G', title: 'G 半埋巨像头近景（从东看脸）', pos: [G.x + 58, 14, G.z - 76], look: [152, 8, 344], fov: 62, far: 500, fog: 'scene' },
  { id: '82-quarry-terraces', group: 'G', title: 'G 西侧三级开采台阶', pos: [250, 18, 460], look: [150, 4, 400], fov: 62, far: 700, fog: 'scene' },
  { id: '83-quarry-dock', group: 'G', title: 'G 东北装车台与石料堆场', pos: [330, 12, 470], look: [270, 3, 430], fov: 60, far: 500, fog: 'scene' },

  /* A–B 地下墓道：A 口 +5 → 最低 +1 → B 口 +4，L≈266 m，两个中途出口。 */
  { id: '90-tunnel-interior', group: 'tunnel', title: 'A–B 墓道主通道（s≈48 m，向 B 下坡）', pos: [TUNNEL_MID.x, tunnelFloor(48) + 1.7, TUNNEL_MID.z], look: [TUNNEL_LOOK.x, tunnelFloor(78) + 1.5, TUNNEL_LOOK.z], fov: 76, far: 120, fog: 'off' },
  { id: '91-tunnel-exit-a', group: 'tunnel', title: '墓道中途出口 exit-1（井口爬升）', pos: [EXIT_A.mouth[0] + 18, EXIT_A.top + 16, EXIT_A.mouth[1] + 18], look: [EXIT_A.entry[0], EXIT_A.entryFloor + 1.5, EXIT_A.entry[1]], fov: 62, far: 400, fog: 'scene', note: `井底 +${EXIT_A.entryFloor} → 井口 +${EXIT_A.top}，${EXIT_A.steps} 级` },
  { id: '92-tunnel-exit-b', group: 'tunnel', title: '墓道中途出口 exit-2（井口爬升）', pos: [EXIT_B.mouth[0] + 18, EXIT_B.top + 16, EXIT_B.mouth[1] + 18], look: [EXIT_B.entry[0], EXIT_B.entryFloor + 1.5, EXIT_B.entry[1]], fov: 62, far: 400, fog: 'scene', note: `井底 +${EXIT_B.entryFloor} → 井口 +${EXIT_B.top}，${EXIT_B.steps} 级` },
  { id: '93-tunnel-mouth-b', group: 'tunnel', title: '墓道 B 口（狮身西侧）', pos: [TUNNEL_MOUTHS.b.x0 + 8, TUNNEL_MOUTHS.b.floor + 3, (TUNNEL_MOUTHS.b.z0 + TUNNEL_MOUTHS.b.z1) / 2], look: [TUNNEL_MOUTHS.b.x0 - 2, TUNNEL_MOUTHS.b.floor + 1, (TUNNEL_MOUTHS.b.z0 + TUNNEL_MOUTHS.b.z1) / 2], fov: 62, far: 300, fog: 'scene' },

  /* 双方基地：蓝 (80,85) / 橙 (710,710)，各 8 个载具位。 */
  { id: '95-base-blue', group: 'base', title: '蓝队西南基地与载具区', pos: [155, 12, 150], look: [85, 2, 100], fov: 58, far: 1200, fog: 'off' },
  { id: '96-base-orange', group: 'base', title: '橙队东北沙丘营地与载具区', pos: [675, 12, 660], look: [710, 6, 715], fov: 58, far: 1200, fog: 'off' },
];

const GROUP_LABELS: Record<string, string> = {
  overview: '总览（800 m 全图）',
  A: 'A · 阶梯金字塔',
  B: 'B · 狮身人面像',
  C: 'C · 沙漠集市',
  D: 'D · 绿洲',
  E: 'E · 公路驿站',
  F: 'F · 卡纳克列柱神庙',
  G: 'G · 帝王谷采石场',
  tunnel: 'A–B 地下墓道',
  base: '双方基地',
};

/* 材质 contact sheet / 代表 2×2：直接复用 pharaoh-v1 生成器产物，保证与运行时 PNG 一致。 */
const MATERIAL_COPIES: Array<{ from: string; to: string; title: string }> = [
  { from: 'contact_sheet_64.png', to: '80-materials-contact-sheet.png', title: '54 材质 contact sheet（64 档）' },
  { from: 'tiles/sand_fine_128_2x2.png', to: '81-material-2x2-sand-fine.png', title: '代表材质 2×2：sand_fine' },
  { from: 'tiles/sandstone_block_128_2x2.png', to: '81-material-2x2-sandstone-block.png', title: '代表材质 2×2：sandstone_block' },
  { from: 'tiles/mudbrick_128_2x2.png', to: '82-material-2x2-mudbrick.png', title: '代表材质 2×2：mudbrick' },
  { from: 'tiles/palm_leaf_128_2x2.png', to: '83-material-2x2-palm-leaf.png', title: '代表材质 2×2：palm_leaf' },
];

const MATERIAL_ROOT = 'docs/map-pharaoh/materials';
const HIDE_HUD_CSS = '.game-hud,.prep-overlay,.game-loading,.nameplate-layer,.lobby,.respawn-map,.tactical-map{display:none!important}';

/* ------------------------------------------------------------------ */
/* CLI                                                                */
/* ------------------------------------------------------------------ */

function arg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}
function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

const OUT_DIR = arg('out', 'docs/map-pharaoh/render');
const RES = arg('res', '64');
const QUALITY = arg('quality', 'high');
const BASE_URL = arg('base', process.env.GAME_BASE_URL || 'http://127.0.0.1:5174');
const VIEWPORT = arg('viewport', '1920x1080').split('x').map((n) => Number(n) || 0);
const ONLY = arg('only', '');
const SCENES_FILE = arg('scenes', '');
const KEEP_HUD = flag('hud');
const PLAN = flag('plan');
const PROBE = flag('probe');
const TIMEOUT_MS = Number(arg('timeout', '180000'));

function loadSceneOverrides(): Record<string, Partial<Scene>> {
  if (!SCENES_FILE) return {};
  if (!fs.existsSync(SCENES_FILE)) throw new Error(`场景覆盖文件不存在：${SCENES_FILE}`);
  return JSON.parse(fs.readFileSync(SCENES_FILE, 'utf8')) as Record<string, Partial<Scene>>;
}

function selectedScenes(): Scene[] {
  const overrides = loadSceneOverrides();
  const only = ONLY.split(',').map((item) => item.trim()).filter(Boolean);
  return SCENES
    .filter((scene) => !only.length || only.some((token) => scene.group === token || scene.id.startsWith(token)))
    .map((scene) => ({ ...scene, ...(overrides[scene.id] ?? {}) }));
}

async function readVersion(page: Page): Promise<VersionInfo | null> {
  try {
    return await page.evaluate(async () => {
      try {
        const response = await fetch('/version.json', { cache: 'no-store' });
        return response.ok ? (await response.json()) : null;
      } catch { return null; }
    }) as VersionInfo | null;
  } catch { return null; }
}

function gameUrl() {
  return `${BASE_URL}/game.html?map=pharaoh&size=8&bots=0&prep=999&res=${RES}&quality=${QUALITY}&seed=1106&audit=1`;
}

async function bootFrozenPage(browser: Browser) {
  const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 400)); });
  await page.addInitScript('window.__name = (v) => v');
  await page.goto(gameUrl());
  // 大厅覆盖层会吞普通 click：必须走 locator.evaluate 直接触发按钮。
  await page.locator('.lobby-solo').evaluate((button) => (button as HTMLButtonElement).click());
  await page.waitForFunction(() => (window as any).__game?.activated === true, null, { timeout: TIMEOUT_MS });
  // 等世界贴图/材质图集全部 decode 完成，否则截到灰块。
  await page.waitForFunction(() => {
    const game = (window as any).__game;
    if (!game?.scene) return false;
    let pending = false;
    game.scene.traverse((object: any) => {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const image = material?.map?.image;
        if (image && image instanceof HTMLImageElement && (!image.complete || !image.naturalWidth)) pending = true;
      }
    });
    return !pending;
  }, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  if (!KEEP_HUD) await page.addStyleTag({ content: HIDE_HUD_CSS });
  // 冻结引擎循环：cancelAnimationFrame + disposed，之后相机/雾/裁剪才不会被主循环重置。
  await page.evaluate(() => {
    const game = (window as any).__game;
    cancelAnimationFrame(game.raf);
    game.disposed = true;
    game.input?.release?.();
    game.viewmodel?.setEquipped?.(false);
    game.__auditFog = game.scene.fog; // 保存地图氛围雾，供 fog:'scene' 场景恢复
    // 引擎每帧按相机距离裁剪载具；冻结后必须恢复全图车辆，否则远处基地/车位会空。
    for (const vehicle of game.vehicles ?? []) vehicle.model.visible = true;
  });
  return { page, errors };
}

async function captureScene(page: Page, scene: Scene): Promise<Omit<SceneResult, 'buildId' | 'res' | 'quality' | 'viewport'>> {
  const file = path.join(OUT_DIR, `${scene.id}.png`);
  const info = await page.evaluate((spec: Scene) => {
    const game = (window as any).__game;
    const camera = game.camera;
    camera.up.set(...(spec.up ?? [0, 1, 0]));
    // 机位防埋地：低机位场景若落在地表/建筑内，自动抬到地面以上 0.9 m。
    const ground = game.arena.navigationHeight?.(spec.pos[0], spec.pos[2]) ?? game.arena.heightAt?.(spec.pos[0], spec.pos[2]) ?? 0;
    const eyeY = Number.isFinite(ground) ? Math.max(spec.pos[1], ground + 0.9) : spec.pos[1];
    camera.position.set(spec.pos[0], eyeY, spec.pos[2]);
    camera.lookAt(...spec.look);
    camera.fov = spec.fov ?? 55;
    camera.near = spec.near ?? 0.15;
    camera.far = spec.far ?? 2000;
    camera.updateProjectionMatrix();
    game.scene.fog = spec.fog === 'off' ? null : (game.__auditFog ?? game.scene.fog);
    game.renderer.info.reset(); // 引擎关了 autoReset：每张只统计本次 render
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
      vehicles: game.vehicles?.length ?? 0,
      caps: game.caps?.length ?? 0,
    };
  }, scene);
  await page.screenshot({ path: file });
  const bytes = fs.statSync(file).size;
  if (bytes < 10_000) throw new Error(`${scene.id} 截图过小（${bytes} B），可能黑屏/未渲染`);
  return {
    id: scene.id, group: scene.group, title: scene.title, file: path.relative(OUT_DIR, file),
    pos: info.pos as Vec3, quat: info.quat, fov: info.fov, far: info.far, fog: scene.fog ?? 'scene', note: scene.note,
    calls: info.calls, triangles: info.triangles, memory: info.memory,
    vehicles: info.vehicles, caps: info.caps, bytes,
  };
}

function copyMaterials() {
  const copied: Array<{ file: string; title: string; from: string; bytes: number }> = [];
  for (const item of MATERIAL_COPIES) {
    const source = path.join(MATERIAL_ROOT, item.from);
    if (!fs.existsSync(source)) { console.warn(`[capture] 跳过缺失材质图：${source}`); continue; }
    const target = path.join(OUT_DIR, item.to);
    fs.copyFileSync(source, target);
    copied.push({ file: item.to, title: item.title, from: source, bytes: fs.statSync(target).size });
  }
  return copied;
}

/** 全量重跑时清掉旧机位的 PNG（例如 0.19 的 30-tunnel-interior.png），避免 index 与实际目录混层。 */
function pruneStalePngs(scenes: Scene[]) {
  if (!fs.existsSync(OUT_DIR)) return;
  const keep = new Set([...scenes.map((scene) => `${scene.id}.png`), ...MATERIAL_COPIES.map((item) => item.to)]);
  for (const file of fs.readdirSync(OUT_DIR)) {
    if (file.endsWith('.png') && !keep.has(file)) {
      fs.unlinkSync(path.join(OUT_DIR, file));
      console.log(`[capture] 清理旧截图 ${file}`);
    }
  }
}

function writeIndex(rows: SceneResult[], materials: ReturnType<typeof copyMaterials>, version: VersionInfo | null, errors: string[]) {
  const groups = new Map<string, SceneResult[]>();
  for (const row of rows) { const list = groups.get(row.group) ?? []; list.push(row); groups.set(row.group, list); }
  const lines: string[] = [];
  lines.push('# 法老坟墓 · AUD-01 真实 world 截图（0.20.3 / 800 m 七据点）');
  lines.push('');
  lines.push(`> 采集时间：${new Date().toISOString()} · BUILD_ID：\`${version?.buildId ?? 'unknown'}\` · MAP_REVISION：\`${version?.mapRevision ?? 'unknown'}\` · MATERIAL_REVISION：\`${version?.materialRevision ?? 'unknown'}\``);
  lines.push(`> 运行参数：\`map=pharaoh size=8 bots=0 prep=999 res=${RES} quality=${QUALITY}\` · viewport ${VIEWPORT[0]}×${VIEWPORT[1]} · 真实体素 world（非预览模型/概念图）`);
  lines.push('> 相机在 `cancelAnimationFrame(engine.raf); engine.disposed=true;` 后手动设置，逐张记录坐标/朝向/FOV/far/雾；HUD 已隐藏。');
  lines.push(`> 场景：${rows.length} 张 · 七据点分组 A–G（每据点 ≥3 机位，A/B 含室内）+ 总览 2 + 墓道 ${rows.filter((r) => r.group === 'tunnel').length} + 基地 ${rows.filter((r) => r.group === 'base').length}。`);
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push('| 文件 | 场景 | BUILD_ID | res/quality | 相机 (x,y,z) | 注视四元数 | FOV | far | 雾 | draw calls | tris | 车辆 |');
  lines.push('|---|---|---|---|---|---|---:|---:|---|---:|---:|---:|');
  for (const row of rows) {
    lines.push(`| [${row.file}](${row.file}) | ${row.title} | \`${row.buildId ?? 'unknown'}\` | ${row.res}/${row.quality} | ${row.pos.map((n) => n.toFixed(1)).join(', ')} | ${row.quat.map((n) => n.toFixed(3)).join(', ')} | ${row.fov} | ${row.far} | ${row.fog} | ${row.calls} | ${row.triangles} | ${row.vehicles} |`);
  }
  lines.push('');
  for (const [group, groupRows] of groups) {
    lines.push(`## ${GROUP_LABELS[group] ?? group}（${groupRows.length} 张）`);
    lines.push('');
    for (const row of groupRows) {
      lines.push(`### ${row.title}`);
      lines.push('');
      lines.push(`![${row.title}](${row.file})`);
      lines.push('');
      if (row.note) lines.push(`> ${row.note}`);
      lines.push(`文件：\`${row.file}\` · BUILD_ID \`${row.buildId ?? 'unknown'}\` · ${row.res}/${row.quality} · 相机 \`${row.pos.map((n) => n.toFixed(1)).join(', ')}\` · FOV ${row.fov} · far ${row.far} · 雾 ${row.fog} · calls ${row.calls} · tris ${row.triangles}`);
      lines.push('');
    }
  }
  if (materials.length) {
    lines.push('## 材质（来自 pharaoh-v1 生成器产物，与运行时 PNG 一致）');
    lines.push('');
    lines.push('| 文件 | 说明 |');
    lines.push('|---|---|');
    for (const item of materials) lines.push(`| [${item.file}](${item.file}) | ${item.title} |`);
    lines.push('');
    for (const item of materials) {
      lines.push(`### ${item.title}`);
      lines.push('');
      lines.push(`![${item.title}](${item.file})`);
      lines.push('');
    }
  }
  if (errors.length) {
    lines.push('## 采集告警');
    lines.push('');
    for (const error of errors) lines.push(`- \`${error}\``);
    lines.push('');
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.md'), lines.join('\n'));
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const scenes = selectedScenes();
  if (!scenes.length) throw new Error(`--only=${ONLY} 没有匹配场景`);
  if (PLAN) {
    console.log(`[capture] 输出目录：${OUT_DIR}`);
    console.log(`[capture] URL：${gameUrl()}`);
    console.log(`[capture] viewport ${VIEWPORT[0]}×${VIEWPORT[1]} · scenes ${scenes.length}`);
    for (const scene of scenes) console.log(`  ${scene.id.padEnd(26)} ${scene.group.padEnd(9)} ${scene.title}`);
    console.log(`[capture] 材质复制：${MATERIAL_COPIES.map((m) => m.to).join(', ')}`);
    return;
  }
  if (PROBE) {
    const browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
    try {
      const { page, errors } = await bootFrozenPage(browser);
      const probe = await page.evaluate(async () => {
        const game = (window as any).__game;
        // Vite dev server 的绝对路径动态 import；变量路径避免 tsx/tsc 解析。
        const load = (specifier: string) => import(/* @vite-ignore */ specifier);
        const tunnel = await load('/src/game/world/pharaoh-tunnel.ts');
        const pyramid = await load('/src/game/world/pharaoh-pyramid.ts');
        const sphinx = await load('/src/game/world/pharaoh-sphinx.ts');
        const bazaar = await load('/src/maps/pharaoh/bazaar.ts');
        const service = await load('/src/maps/pharaoh/service.ts');
        const ground = (x: number, z: number) => game.arena.navigationHeight?.(x, z) ?? game.arena.altitude?.(x, z) ?? game.arena.heightAt?.(x, z) ?? 0;
        const routeS = [15, 30, 45, 60, 75, 90, 105, 120, 139, 160, 180];
        return {
          exits: tunnel.tunnelExitGeom(ground),
          route: routeS.map((s: number) => { const point = tunnel.tunnelAt(s); return { s, x: +point.x.toFixed(1), z: +point.z.toFixed(1), floor: tunnel.tunnelFloor(s) }; }),
          rooms: pyramid.PYRAMID_ROOMS,
          sphinx: sphinx.SPHINX,
          covers: (bazaar.bazaarCovers ?? []).filter((cover: any) => ['stall', 'canopy', 'dome', 'well'].includes(cover.kind)).map((cover: any) => ({ kind: cover.kind, x: cover.x, z: cover.y, w: cover.w, d: cover.d, h: cover.height })),
          streets: bazaar.bazaarStreets,
          service: (service.serviceBuildings ?? []).map((building: any) => { const xs = (building.polygon ?? []).map((p: any) => p[0]); const zs = (building.polygon ?? []).map((p: any) => p[1]); return { id: building.id, name: building.name, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cz: (Math.min(...zs) + Math.max(...zs)) / 2, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs), height: building.height }; }),
        };
      });
      console.log(JSON.stringify({ probe, errors }, null, 1));
      await page.close();
    } finally { await browser.close(); }
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!ONLY) pruneStalePngs(scenes);
  const browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'], executablePath: browserExecutable() });
  const rows: SceneResult[] = [];
  const errors: string[] = [];
  let version: VersionInfo | null = null;
  try {
    const { page, errors: pageErrors } = await bootFrozenPage(browser);
    version = await readVersion(page);
    for (const scene of scenes) {
      try {
        const result = await captureScene(page, scene);
        rows.push({ ...result, buildId: version?.buildId, res: Number(RES), quality: QUALITY, viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}` });
        console.log(`[capture] ${result.id.padEnd(26)} calls ${String(result.calls).padStart(4)} tris ${String(result.triangles).padStart(7)} ${Math.round(result.bytes / 1024)} KB`);
      } catch (error) {
        const message = `${scene.id}: ${String((error as Error)?.message ?? error)}`;
        errors.push(message);
        console.error(`[capture] FAIL ${message}`);
      }
    }
    errors.push(...pageErrors);
    await page.close();
  } finally {
    await browser.close();
  }
  const materials = copyMaterials();
  const groups = rows.reduce<Record<string, number>>((acc, row) => { acc[row.group] = (acc[row.group] ?? 0) + 1; return acc; }, {});
  const manifest = {
    tool: 'pharaoh-capture', generatedAt: new Date().toISOString(), url: gameUrl(),
    viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}`, res: Number(RES), quality: QUALITY,
    version, groups, scenes: rows, materials, errors,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeIndex(rows, materials, version, errors);
  console.log(`[capture] 完成 ${rows.length}/${scenes.length} 张 → ${OUT_DIR}/index.md`);
  const pageErrors = errors.filter((error) => !error.includes('.png 截图过小'));
  if (rows.length !== scenes.length || pageErrors.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
