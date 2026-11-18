import assert from 'node:assert/strict';
import { chromium, type Page } from 'playwright';
import { browserExecutable } from './browser';

const base = process.env.CRAZYSHOOT_BASE_URL ?? 'http://127.0.0.1:5174';
const mode = process.env.CRAZYSHOOT_NET_MODE ?? 'auto';
const guestCount = Number(process.env.CRAZYSHOOT_GUESTS ?? 2);
assert.ok(Number.isInteger(guestCount) && guestCount >= 1 && guestCount <= 23, 'guest count must be between 1 and 23');
const errors: string[] = [];
const browsers = await Promise.all(Array.from({ length: Math.min(guestCount + 1, 3) }, () =>
  chromium.launch({ executablePath: browserExecutable(), headless: true }),
));

async function load(index: number) {
  const browser = browsers[index % browsers.length];
  const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
  page.on('pageerror', error => errors.push(`${index}: ${error.message}`));
  if (mode === 'relay' && index !== 0) {
    // Exercise the real signaling relay even where RTCDataChannel is unavailable.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'RTCPeerConnection', { value: undefined });
    });
  }
  await page.goto(`${base}/game.html?map=docks&size=12&prep=60&bots=0&quality=low&res=32${index > 1 ? '&lite=1' : ''}${mode === 'turn' ? '&turn=1' : ''}`);
  return page;
}

async function state(host: Page, id: string) {
  return host.evaluate(id => {
    const g = (window as any).__game;
    const h = g.hosted.get(id);
    return {
      x: h.controller.position.x, y: h.controller.position.y, z: h.controller.position.z,
      at: g.simulationNow, inputSeq: h.inputSeq, velocity: h.controller.velocity.length(),
    };
  }, id);
}

async function lock(page: Page) {
  if (await page.evaluate(() => (window as any).__game.input.pointerLocked)) return;
  if (await page.getByRole('button', { name: '继续游戏' }).isVisible()) {
    await page.getByRole('button', { name: '继续游戏' }).click();
  } else {
    await page.locator('.game-canvas').click({ position: { x: 10, y: 10 } });
  }
  await page.waitForFunction(() => (window as any).__game.input.pointerLocked);
}

async function combat(host: Page, guest: Page, id: string) {
  // Put opposing players on a clear lane. Movement, fire mode, aim, shots and reloads use browser input.
  await host.evaluate(id => {
    const g = (window as any).__game;
    const h = g.hosted.get(id);
    if (h.team === g.myTeam) throw new Error('Duel needs opposing teams');
    g.controller.teleport(g.controller.position.clone().set(15, g.arena.navigationHeight(15, 140), 140), Math.PI);
    h.controller.teleport(h.controller.position.clone().set(15, g.arena.navigationHeight(15, 150), 150), 0);
    h.yaw = 0;
    h.pitch = 0;
  }, id);
  await guest.waitForFunction(() => Math.abs((window as any).__game.controller.position.z - 150) < .05);
  await guest.evaluate(() => {
    const g = (window as any).__game;
    g.controller.yaw = g.controller.pitch = 0;
  });
  await lock(host);
  await host.keyboard.down('KeyS');
  await host.waitForFunction(() => (window as any).__game.controller.position.z < 139.5);
  await host.keyboard.up('KeyS');
  await lock(guest);
  await guest.keyboard.down('KeyS');
  await host.waitForFunction(id => (window as any).__game.hosted.get(id).controller.position.z > 150.5, id);
  await guest.keyboard.up('KeyS');

  for (const page of [host, guest]) {
    await lock(page);
    await page.keyboard.press('KeyB');
    await page.waitForFunction(() => (window as any).__game.fireMode === 'semi');
    const pitch = await page.evaluate(() => (window as any).__game.controller.pitch as number);
    await page.mouse.move(10, 22);
    await page.waitForFunction(pitch => (window as any).__game.controller.pitch < pitch - .01, pitch);
  }
  await lock(host);
  await host.mouse.down();
  await host.mouse.up();
  await guest.waitForFunction(() => {
    const g = (window as any).__game;
    return g.health > 0 && g.health < 100;
  });
  const guestHp = await guest.evaluate(() => (window as any).__game.health as number);
  await lock(guest);
  await guest.mouse.down();
  await guest.mouse.up();
  await host.waitForFunction(() => {
    const g = (window as any).__game;
    return g.health > 0 && g.health < 100;
  });
  const hostHp = await host.evaluate(() => (window as any).__game.health as number);
  await guest.waitForFunction(() => (window as any).__game.remotes.get((window as any).__game.net.hostId)?.health < 100);

  for (const page of [host, guest]) {
    await lock(page);
    await page.waitForFunction(() => (window as any).__game.ammo === 29);
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => {
      const g = (window as any).__game;
      return g.ammo === 30 && g.reserve === 119 && !g.reloading;
    });
  }
  await lock(guest);
  for (let i = 0; i < 6; i++) {
    if (await host.evaluate(() => (window as any).__game.dead)) break;
    await guest.mouse.down();
    await guest.mouse.up();
    await guest.waitForTimeout(260);
  }
  await host.waitForFunction(() => (window as any).__game.dead);
  await guest.waitForFunction(() => {
    const g = (window as any).__game;
    return g.remotes.get(g.net.hostId)?.dead && g.scores[g.myTeam] > 0;
  });
  await host.waitForFunction(() => !(window as any).__game.dead && (window as any).__game.health === 100,
    null, { timeout: 15000 });
  const protection = host.getByRole('timer', { name: '复活无敌倒计时' });
  await protection.getByText('5 秒').waitFor();
  await guest.waitForFunction(() => {
    const g = (window as any).__game;
    const host = g.remotes.get(g.net.hostId);
    return host && !host.dead && host.health === 100 && host.rig.materials[0].emissive.getHex() !== 0;
  });

  const spawn = await host.evaluate(() => {
    const g = (window as any).__game;
    const spawn = { position: g.controller.position.toArray() as number[], yaw: g.controller.yaw as number };
    g.controller.teleport(g.controller.position.clone().set(15, g.arena.navigationHeight(15, 140), 140), Math.PI);
    const apply = g.applyCombatHit.bind(g);
    g.protectionHit = false;
    g.applyCombatHit = (hit: any, ...args: any[]) => {
      if (hit?.kind === 'player' && hit.id === g.localNetId && g.simulationNow < g.protectedUntil) g.protectionHit = true;
      apply(hit, ...args);
    };
    return spawn;
  });
  await guest.waitForFunction(() => {
    const g = (window as any).__game;
    return Math.abs(g.remotes.get(g.net.hostId).target.z - 140) < .05;
  });
  await lock(guest);
  const ammoBefore = await host.evaluate(id => (window as any).__game.hosted.get(id).ammo, id);
  await guest.mouse.down();
  await guest.mouse.up();
  await host.waitForFunction(({ id, ammoBefore }) => (window as any).__game.hosted.get(id).ammo < ammoBefore, { id, ammoBefore });
  await host.waitForFunction(() => (window as any).__game.protectionHit);
  assert.equal(await host.evaluate(() => (window as any).__game.health), 100);
  await protection.getByText('1 秒').waitFor();
  await protection.waitFor({ state: 'hidden' });
  await guest.waitForFunction(() => {
    const g = (window as any).__game;
    return g.remotes.get(g.net.hostId).rig.materials[0].emissive.getHex() === 0;
  });
  await guest.mouse.down();
  await guest.mouse.up();
  await host.waitForFunction(() => (window as any).__game.health < 100);
  await host.evaluate(spawn => {
    const g = (window as any).__game;
    g.controller.teleport(g.controller.position.clone().fromArray(spawn.position), spawn.yaw);
  }, spawn);
  return { guestHp, hostHp, reloadBoth: true, guestKill: true, hostRespawn: true, protectionExpires: true };
}

async function drive(host: Page, guest: Page, id: string) {
  const vehicle = await host.evaluate(id => {
    const g = (window as any).__game;
    const h = g.hosted.get(id);
    const v = g.vehicles.find((v: any) => v.kind === 'jeep' && v.team === h.team);
    if (!v) throw new Error('Missing jeep for guest team');
    v.x = 150;
    v.z = 135;
    v.yaw = Math.PI;
    v.model.position.set(v.x, g.arena.navigationHeight(v.x, v.z), v.z);
    v.model.rotation.set(0, v.yaw, 0);
    h.controller.teleport(h.controller.position.clone().set(150, g.arena.navigationHeight(150, 139), 139), 0);
    return v.id as string;
  }, id);
  await guest.waitForFunction(vehicle => (window as any).__game.nearestVehicle()?.id === vehicle, vehicle);
  await lock(guest);
  await guest.keyboard.press('KeyE');
  await guest.waitForFunction(vehicle => (window as any).__game.drivingId === vehicle, vehicle);
  await guest.keyboard.down('KeyW');
  await host.waitForFunction(vehicle => {
    const v = (window as any).__game.vehicles.find((v: any) => v.id === vehicle);
    return v.z < 129;
  }, vehicle);
  await guest.keyboard.up('KeyW');
  await guest.waitForFunction(vehicle => {
    const v = (window as any).__game.vehicles.find((v: any) => v.id === vehicle);
    return v.z < 129;
  }, vehicle);
  await guest.keyboard.down('KeyS');
  await host.waitForFunction(vehicle => {
    const v = (window as any).__game.vehicles.find((v: any) => v.id === vehicle);
    return v.z > 134 && v.speed < 0;
  }, vehicle);
  await guest.keyboard.up('KeyS');
  await guest.keyboard.press('KeyE');
  await guest.waitForFunction(() => !(window as any).__game.drivingId);
  assert.equal(await host.evaluate(id => (window as any).__game.hosted.get(id).vehicleId, id), null);
}

try {
  const host = await load(0);
  await host.getByRole('button', { name: /创建房间/ }).click();
  await host.waitForFunction(() => /^\d{4}$/.test(document.querySelector('.lobby-code')?.textContent?.trim() ?? ''));
  const code = (await host.locator('.lobby-code').innerText()).trim();

  const guests = [];
  for (let i = 1; i <= guestCount; i++) {
    const guest = await load(i);
    await guest.getByRole('textbox', { name: '房间码' }).fill(code);
    await guest.getByRole('button', { name: '加入', exact: true }).click();
    await guest.locator('.lobby-code').getByText(code, { exact: true }).waitFor();
    guests.push(guest);
  }

  await host.locator('.lobby-primary.start').click();
  await Promise.all([host, ...guests].map(p => p.waitForFunction(() => (window as any).__game?.activated, null, { timeout: 120000 })));
  await host.evaluate(() => (window as any).__game.forceStart());
  await Promise.all(guests.map(p => p.waitForFunction(() => (window as any).__game.phase === 'live')));
  const ids = await Promise.all(guests.map(p => p.evaluate(() => (window as any).__game.localNetId as string)));
  assert.equal(new Set(ids).size, guestCount);
  assert.equal(await host.evaluate(() => (window as any).__game.hosted.size), guestCount);
  for (const p of guests) {
    const player = await p.evaluate(() => {
      const g = (window as any).__game;
      return { remotes: g.remotes.size, facing: g.controller.yaw, spawnYaw: g.spawnYawFor(g.myTeam) };
    });
    assert.equal(player.remotes, guestCount);
    assert.ok(Math.abs(player.facing - player.spawnYaw) < .05, 'guest should face into the map at spawn');
  }
  if (mode === 'p2p' || mode === 'turn') {
    await host.waitForFunction(count => [...(window as any).__game.net.links.values()].filter(
      (link: any) => link.stateChannel?.readyState === 'open',
    ).length === count, guestCount);
  }

  // Isolate locomotion from each team's spawn geometry while retaining real map physics.
  const guest = guests[0];
  const id = ids[0];
  const duel = await combat(host, guest, id);
  await host.evaluate(id => {
    const g = (window as any).__game;
    const h = g.hosted.get(id);
    const position = h.controller.position.clone().set(15, g.arena.navigationHeight(15, 150), 150);
    h.controller.teleport(position, 0);
    h.yaw = h.pitch = 0;
  }, id);
  await guest.waitForFunction(() => Math.abs((window as any).__game.controller.position.z - 150) < .05);
  await guest.evaluate(() => {
    const g = (window as any).__game;
    g.controller.yaw = 0;
    const send = g.net.send.bind(g.net);
    let next = 0;
    // Deliver real input packets in bursts. Each arriving packet has recent, valid commands.
    g.net.send = (message: any) => {
      if (message.t === 'inputs') {
        const now = performance.now();
        if ((window as any).dropInput || now < next) return;
        next = now + 95;
      }
      send(message);
    };
  });

  await lock(guest);
  const before = await state(host, id);
  await guest.keyboard.down('KeyW');
  await guest.waitForTimeout(2400);
  const moving = await state(host, id);
  const speed = (before.z - moving.z) / ((moving.at - before.at) / 1000);
  assert.ok(speed > 4.4 && speed < 5.5, `held-W speed ${speed.toFixed(2)} m/s`);
  assert.ok(Math.abs(before.y - moving.y) < .1 && Math.abs(before.x - moving.x) < .1);
  await guest.keyboard.press('Space');
  await host.waitForFunction(({ id, y }) => (window as any).__game.hosted.get(id).controller.position.y > y + .2,
    { id, y: before.y }, { timeout: 3000 });

  // Stale controls must expire if a browser or its transport stops sending altogether.
  await guest.evaluate(() => { (window as any).dropInput = true; });
  await guest.waitForTimeout(950);
  const stopped = await state(host, id);
  assert.ok(stopped.velocity < .05, `velocity after input loss ${stopped.velocity}`);
  assert.ok(moving.z - stopped.z < 3.5, 'stale input carried the player too far');
  const predicted = await guest.evaluate(() => (window as any).__game.controller.position.toArray() as number[]);
  assert.ok(Math.hypot(stopped.x - predicted[0], stopped.y - predicted[1], stopped.z - predicted[2]) < 1.2,
    'guest prediction diverged from the stopped player');

  await guest.keyboard.up('KeyW');
  await guest.evaluate(() => { (window as any).dropInput = false; });
  await host.waitForFunction(({ id, seq }) => (window as any).__game.hosted.get(id).inputSeq > seq,
    { id, seq: stopped.inputSeq });
  const resumed = await state(host, id);
  await guest.keyboard.down('KeyS');
  await host.waitForFunction(({ id, z }) => (window as any).__game.hosted.get(id).controller.position.z > z + .5,
    { id, z: resumed.z });
  await guest.keyboard.up('KeyS');
  await drive(host, guest, id);

  await guest.close();
  await host.waitForFunction(id => !(window as any).__game.hosted.has(id), id);
  const replacement = await load(1);
  await replacement.getByRole('textbox', { name: '房间码' }).fill(code);
  await replacement.getByRole('button', { name: '加入', exact: true }).click();
  await replacement.waitForFunction(() => (window as any).__game?.activated && (window as any).__game.phase === 'live',
    null, { timeout: 120000 });
  assert.notEqual(await replacement.evaluate(() => (window as any).__game.localNetId), id);
  assert.equal(await host.evaluate(() => (window as any).__game.hosted.size), guestCount);

  const rtcLinks = await host.evaluate(() => [...(window as any).__game.net.links.values()].filter(
    (link: any) => link.pc.connectionState === 'connected' && link.stateChannel?.readyState === 'open',
  ).length);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ base, mode, players: guestCount + 1, rtcLinks, duel, guestDriving: true, speed, stopVelocity: stopped.velocity, errors }));
} finally {
  await Promise.all(browsers.map(browser => browser.close()));
}
