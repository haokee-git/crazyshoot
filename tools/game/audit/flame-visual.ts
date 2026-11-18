// 喷火器视觉验收：第一人称喷火 / 受害者视角（火焰与烧脸致盲）/ 第三人称旁观多角度。
// 用法：npx tsx tools/game/audit/flame-visual.ts [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { browserExecutable } from './browser';

const outDir = process.argv[2] || 'docs/flame-visual';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.addInitScript('window.__name = (v) => v');
await page.goto('http://127.0.0.1:5174/game.html?map=garden&bots=1&prep=999&seed=1106');
await page.waitForTimeout(700);await page.locator('.lobby-solo').click();
await page.waitForFunction(() => !!(window as any).__game, null, { timeout: 90000 });
await page.waitForFunction(() => !document.querySelector('.game-loading'), null, { timeout: 90000 });

/** 初始化：装备喷火器、冻结 AI、装好逐帧火焰驱动。 */
await page.evaluate(async () => {
  const T: any = await import(/* @vite-ignore */ String('/node_modules/three/build/three.module.js'));
  const W: any = await import(/* @vite-ignore */ String('/src/content/weapons/special.ts'));
  const g: any = (window as any).__game;
  (window as any).__T = T;
  g.forceStart();
  g.overlayOpen = false; g.paused = false; g.dead = false; g.winner = null;
  g.input.pointerLocked = true; g.bannerUntil = 0; g.hudDirty = true;
  g.protectedUntil = 0; g.health = 100; g.armed = true;
  g.equipWeapon(W.FLAME_WEAPON);
  g.ammo = 100; g.reserve = 0;

  const all = [...g.hosted.values()];
  const enemy = all.find((h: any) => h.bot && h.team !== g.myTeam);
  for (const h of all) {
    h.nextThink = Infinity; h.input.clear(); h.burnUntil = 0;
    if (h !== enemy) { h.dead = true; h.respawnAt = Infinity; }
  }
  enemy.dead = false; enemy.health = 100; enemy.burnUntil = 0;
  (window as any).__enemyId = enemy.id;

  let acc = 0, dmgAcc = 0, last = performance.now();
  function tick() {
    const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
    const s = (window as any).__flame;
    if (s && s.on && g) {
      const b = g.hosted.get(s.botId);
      if (s.mode === 'player') {
        const origin = new T.Vector3(); g.viewmodel.getMuzzleWorld(origin);
        const dir = g.aimDirection(true);
        g.flameJet.emit(origin, dir, dt);
        if (b) b.health = 100;
        acc += dt;
        if (acc >= .1) { acc = 0; g.ammo = 100; g.health = 100; g.fire(); }
      } else if (b) {
        const f = new T.Vector3(-Math.sin(b.yaw), 0, -Math.cos(b.yaw));
        const origin = b.controller.position.clone().add(new T.Vector3(0, 1.42, 0)).addScaledVector(f, .55);
        const target = s.target
          ? new T.Vector3(s.target[0], s.target[1], s.target[2])
          : b.controller.position.clone().add(new T.Vector3(0, 1.42, 0)).addScaledVector(f, 10);
        const dir = target.sub(origin).normalize();
        g.flameJet.emit(origin, dir, dt);
        b.health = 100;
        if (s.damage) {
          dmgAcc += dt;
          if (dmgAcc >= .2) { dmgAcc = 0; g.health = 100; g.flameDamage(b.id, origin.clone(), dir.clone()); }
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  (window as any).__placeBot = (id: string, x: number, z: number, yaw: number) => {
    const h = g.hosted.get(id);
    const y = g.arena.navigationHeight?.(x, z) ?? g.arena.heightAt?.(x, z) ?? 0;
    h.controller.teleport(new T.Vector3(x, y, z), yaw);
    h.yaw = yaw; h.pitch = 0; h.health = 100; h.dead = false;
    h.nextThink = Infinity; h.input.clear();
    h.targetId = g.localNetId;
  };
  (window as any).__placePlayer = (x: number, z: number, yaw: number, pitch: number) => {
    const y = g.arena.navigationHeight?.(x, z) ?? g.arena.heightAt?.(x, z) ?? 0;
    g.controller.teleport(new T.Vector3(x, y, z), yaw);
    g.controller.pitch = pitch; g.controller.yaw = yaw;
    g.health = 100; g.dead = false; g.protectedUntil = 0;
  };
});

const enemyId = (await page.evaluate(() => (window as any).__enemyId)) as string;
const setFlame = (cfg: any) => page.evaluate((c) => { (window as any).__flame = c; }, cfg);
const stopFlame = () => page.evaluate(() => { (window as any).__flame = { on: false }; });
const shot = async (name: string) => {
  await page.waitForTimeout(240);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('shot', name);
};
const clear = async () => {
  await stopFlame();
  await page.waitForTimeout(650);
  await page.evaluate(() => { (window as any).__game.burnBlindUntil = 0; });
};

// ---- 场景 1：第一人称喷火（自己喷向 6m 外的敌人） -------------------------
await page.evaluate(({ id }) => {
  const P: any = (window as any).__placePlayer, B: any = (window as any).__placeBot;
  const g: any = (window as any).__game;
  g.armed = true; g.viewmodel.setEquipped(true); g.bannerUntil = 0;
  P(288, 150, Math.PI / 2, -.03);
  B(id, 282, 150, -Math.PI / 2);
}, { id: enemyId });
await page.waitForTimeout(900);
await setFlame({ on: true, mode: 'player', botId: enemyId });
await shot('01-first-person-spray');
await shot('02-first-person-spray-late');
await clear();

// ---- 场景 2：受害者视角，火焰扑面（尚未致盲） -----------------------------
await page.evaluate(({ id }) => {
  const P: any = (window as any).__placePlayer, B: any = (window as any).__placeBot;
  const g: any = (window as any).__game;
  g.burnBlindUntil = 0; g.bannerUntil = 0;
  P(288, 150, Math.PI / 2, .02);
  B(id, 283.5, 150, -Math.PI / 2);
  g.viewmodel.setEquipped(true);
}, { id: enemyId });
await page.waitForTimeout(900);
await setFlame({ on: true, mode: 'bot', botId: enemyId, target: [288, 4.6, 150], damage: false });
await shot('03-second-person-flame-in-face');

// ---- 场景 3：同一视角，正面头被烧到 → 1.5s 重度致盲 ------------------------
await page.evaluate(() => { (window as any).__flame.damage = true; });
await page.waitForTimeout(260);
await shot('04-second-person-blinded');
await page.waitForTimeout(340);
await shot('05-second-person-blinded-peak');

// ---- 场景 4：旁观第三人称，侧面看角色喷火 ---------------------------------
await clear();
await page.evaluate(({ id }) => {
  const P: any = (window as any).__placePlayer, B: any = (window as any).__placeBot;
  const g: any = (window as any).__game;
  g.armed = false; g.viewmodel.setEquipped(false); g.input.pointerLocked = true;
  P(278.5, 154.5, -.5, -.06);
  B(id, 281, 150, Math.PI / 2);
  g.viewmodel.setEquipped(false);
}, { id: enemyId });
await page.waitForTimeout(1200);
await setFlame({ on: true, mode: 'bot', botId: enemyId, target: [272, 4.2, 150], damage: false });
await shot('06-third-person-side');

// ---- 场景 5：第三人称背后 45° --------------------------------------------
await clear();
await page.evaluate(() => {
  const P: any = (window as any).__placePlayer;
  P(276.5, 154, -.79, -.05);
  const g: any = (window as any).__game;
  g.armed = false; g.viewmodel.setEquipped(false);
});
await page.waitForTimeout(900);
await setFlame({ on: true, mode: 'bot', botId: enemyId, target: [272, 4.2, 150], damage: false });
await shot('07-third-person-rear');

// ---- 场景 6：第一人称俯角看地面火焰 ---------------------------------------
await clear();
await page.evaluate(({ id }) => {
  const P: any = (window as any).__placePlayer, B: any = (window as any).__placeBot;
  const g: any = (window as any).__game;
  g.armed = true; g.viewmodel.setEquipped(true); g.health = 100; g.bannerUntil = 0;
  P(288, 150, Math.PI / 2, -.36);
  B(id, 283, 150, -Math.PI / 2);
}, { id: enemyId });
await page.waitForTimeout(900);
await setFlame({ on: true, mode: 'player', botId: enemyId });
await shot('08-first-person-lookdown');

// ---- 场景 7：正对镜头的火焰（旁观者站在火焰来向） -------------------------
await clear();
await page.evaluate(({ id }) => {
  const P: any = (window as any).__placePlayer, B: any = (window as any).__placeBot;
  const g: any = (window as any).__game;
  g.armed = false; g.viewmodel.setEquipped(false);
  P(287, 150, Math.PI / 2, -.02);
  B(id, 282, 150, -Math.PI / 2);
}, { id: enemyId });
await page.waitForTimeout(1000);
await setFlame({ on: true, mode: 'bot', botId: enemyId, target: [291, 4.5, 150], damage: false });
await shot('09-third-person-front');

await clear();
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
if (errors.length) process.exitCode = 1;
