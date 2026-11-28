import assert from 'node:assert/strict';
import { once } from 'node:events';
import { ReloadFlick } from '../web/reload-gesture.js';
import { yardRoutes } from '../web/yard-layout.js';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { angularDelta, SideGripAim, topEdge } from '../web/gyro.js';
import { batterySpeedMultiplier, cover, eyeHeight, maxHealth, shutter, teams } from '../web/yard.js';
import { weapons } from '../web/weapons.js';
import { startYardServer } from './server.js';
import { YardMatch } from '../web/simulation.js';
import { YardDrill } from '../web/yard-drill.js';

const idle = { lateral: 0, forward: 0, yaw: 0, pitch: 0, fire: false };

test('all marked routes fit the player, and only the shortcut passes through the closed shutter', () => {
  for (const [name, route] of Object.entries(yardRoutes)) {
    let reachesShutter = false;
    for (const [index, [x0, z0]] of route.slice(0, -1).entries()) {
      const [x1, z1] = route[index + 1];
      const samples = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / .05);
      for (let i = 0; i <= samples; i++) {
        const x = x0 + (x1 - x0) * i / samples;
        const z = z0 + (z1 - z0) * i / samples;
        const intersects = box => Math.abs(x - box.x) < box.w / 2 + .33 && Math.abs(z - box.z) < box.d / 2 + .33;
        assert.ok(!cover.some(intersects), `${name} enters cover at ${x}, ${z}`);
        reachesShutter ||= intersects(shutter);
      }
    }
    assert.equal(reachesShutter, name === 'shortcut');
  }
});

test('gesture reload fires at the top of a quick upward flick and ignores its return', () => {
  const flick = new ReloadFlick();
  const pose = (pitch, yaw = 0) => ({ pitch: pitch * Math.PI / 180, yaw: yaw * Math.PI / 180, sideUp: 1 });
  const samples = [[0, 0], [35, 0], [70, 0], [100, 9], [127, 21], [150, 31], [182, 20], [217, 5]];
  const run = (points, armed) => points.map(([time, pitch, yaw]) => flick.sample(pose(pitch, yaw), time, armed));
  const quick = run(samples, true);
  assert.equal(quick[4].reload, true);
  assert.equal(quick.filter(result => result.reload).length, 1);
  assert.equal(flick.sample(pose(2), 245, true).pitch, 0);
  flick.reset();
  assert.ok(run(samples, false).every(result => !result.reload));
  flick.reset();
  const aim = run([[0, 0], [35, 3], [70, 6], [100, 9], [127, 13], [150, 16], [182, 20], [217, 24]], true);
  assert.ok(aim.every(result => !result.reload));
  assert.equal(aim.at(-1).pitch, undefined);
});

test('the HTTPS preview can pair screens and phones using only ordinary HTTP requests', { timeout: 4000 }, async t => {
  const origin = 'https://preview.yard.example';
  const yard = await startYardServer({ host: '127.0.0.1', port: 0, origin, practiceOnly: true });
  t.after(() => yard.close());
  const endpoint = `http://127.0.0.1:${yard.port}/practice-mailbox`;
  const post = (payload, from = origin) => fetch(endpoint, { method: 'POST',
    headers: { Origin: from, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  async function exchange(id, message) {
    const response = await post({ type: 'exchange', id, message: message && JSON.stringify(message) });
    assert.equal(response.status, 200);
    const packet = await response.json();
    return { ...packet, messages: packet.messages.map(raw => JSON.parse(raw)) };
  }

  assert.equal((await post({ type: 'open', hello: { type: 'host' } }, 'https://other.example')).status, 403);
  const host = await (await post({ type: 'open', hello: { type: 'host' } })).json();
  let invite;
  for (let attempt = 0; attempt < 10 && !invite; attempt++) {
    invite = (await exchange(host.id)).messages.find(data => data.type === 'invite');
    if (!invite) await delay(20);
  }
  assert.ok(invite?.qr.startsWith('data:image/png'));
  const url = new URL(invite.pairURL);
  assert.equal(url.origin, origin);
  assert.equal(url.searchParams.get('signal'), 'poll');
  const hello = { type: 'phone', token: url.hash.slice(1) };
  const peer = await (await post({ type: 'open', hello })).json();
  const [joined] = (await exchange(host.id)).messages;
  const offer = { type: 'offer', exchange: joined.exchange, sdp: 'example offer' };
  await exchange(host.id, offer);
  assert.deepEqual((await exchange(peer.id)).messages, [offer]);
  const answer = { type: 'answer', exchange: joined.exchange, sdp: 'example answer' };
  await exchange(peer.id, { type: 'input', ...idle, fire: true });
  await exchange(peer.id, answer);
  assert.deepEqual((await exchange(host.id)).messages, [answer]);
  await post({ type: 'open', hello });
  assert.equal((await exchange(peer.id)).closeCode, 4001);
});

function advance(match, seconds, actions = () => {}) {
  for (let frame = 0; frame < seconds * 60; frame++) {
    actions();
    match.step(1 / 60);
  }
}

function pairMatch(weapon = 'carbine') {
  const match = new YardMatch();
  const left = match.join(0);
  const right = match.join(1);
  assert.ok(match.equip(0, weapon));
  match.ready(0);
  match.ready(1);
  advance(match, 3.1);
  return { match, left, right };
}

function tapShot(match, slot = 0) {
  match.control(slot, { ...idle, fire: true });
  match.control(slot, idle);
  match.step(1 / 60);
  return match.snapshot().events.find(event => event.type === 'shot' && event.player === slot);
}

test('the solo drill can trade hits with a sentinel and return to the intact shutter', () => {
  const drill = new YardDrill();
  assert.equal(drill.players[1], null);
  drill.setSparring(true);
  drill.control(0, { ...idle, fire: true });
  drill.step(1 / 60);
  assert.ok(drill.snapshot().events.some(event => event.type === 'shot' && event.target === 1));
  let returnedFire = false;
  advance(drill, 4, () => {
    if (drill.snapshot().events.some(event => event.type === 'shot' && event.player === 1)) returnedFire = true;
  });
  assert.ok(returnedFire);
  drill.setSparring(false);
  assert.equal(drill.players[1], null);
  assert.equal(drill.players[0].x, shutter.x);
  assert.equal(drill.shutterHP, 3);
});

test('browsers track the top edge, preserve yaw continuity and ignore roll', () => {
  const neutral = topEdge({ alpha: 0, beta: 0, gamma: 90 });
  assert.equal(neutral.sideUp, 1);
  const lifted = topEdge({ alpha: 0, beta: 12, gamma: 90 });
  const right = topEdge({ alpha: 348, beta: 0, gamma: 90 });
  assert.ok(angularDelta(neutral, right).yaw > .20);
  assert.ok(angularDelta(neutral, lifted).pitch > .20);
  assert.deepEqual(angularDelta(neutral, topEdge({ alpha: 0, beta: 0, gamma: -60 })), { yaw: 0, pitch: 0 });
  assert.equal(topEdge({ alpha: null, beta: 0, gamma: 90 }), null);
  const across = angularDelta(topEdge({ alpha: 179, beta: 0, gamma: 90 }), topEdge({ alpha: 181, beta: 0, gamma: 90 }));
  assert.ok(Math.abs(across.yaw) < .04);
});

test('side-grip calibration maps rotation to look while rejecting roll and large rebases', () => {
  const motion = new SideGripAim();
  const neutral = topEdge({ alpha: 0, beta: 0, gamma: 90 });
  assert.equal(motion.calibrate(topEdge({ alpha: 0, beta: 0, gamma: 0 })), false);
  assert.equal(motion.calibrate(neutral), true);
  motion.update(topEdge({ alpha: 0, beta: 0, gamma: -70 }));
  assert.deepEqual(motion.consume(), { yaw: 0, pitch: 0 });
  motion.update(topEdge({ alpha: 349, beta: 10, gamma: 87 }));
  const turn = motion.consume();
  assert.ok(turn.yaw > .14 && turn.pitch > .12);
  motion.update(topEdge({ alpha: 90, beta: 10, gamma: 87 }));
  assert.deepEqual(motion.consume(), { yaw: 0, pitch: 0 });
  assert.equal(motion.calibrate(neutral), true);
  assert.deepEqual(motion.consume(), { yaw: 0, pitch: 0 });
});

test('shutter blocks movement and shots, then opens the route after three hits', () => {
  const { match, left, right } = pairMatch();
  Object.assign(left, { x: shutter.x, z: 2.4, yaw: 0 });
  Object.assign(right, { x: shutter.x, z: -2.4, yaw: Math.PI });
  advance(match, .7, () => match.control(0, { ...idle, forward: 1 }));
  assert.ok(left.z > .4);
  match.control(0, { ...idle, fire: true });
  match.step(1 / 60);
  assert.equal(match.shutterHP, 2);
  assert.equal(right.hp, maxHealth);
  advance(match, .49, () => match.control(0, { ...idle, fire: true }));
  assert.equal(match.shutterHP, 0);
  assert.ok(match.snapshot().events.some(event => event.type === 'break'));
  advance(match, .45, () => match.control(0, { ...idle, fire: true, forward: 1 }));
  assert.ok(left.z < 0);
  assert.ok(right.hp < maxHealth);
});

test('quick taps register, knocked-out carriers drop the battery, and it can be scored twice', () => {
  const { match, left, right } = pairMatch();
  Object.assign(right, { x: 0, z: 0 });
  advance(match, .05);
  assert.equal(match.battery.carrier, 1);
  Object.assign(left, { x: 0, z: 2.2, yaw: 0 });
  for (let shot = 0; shot < 4; shot++) {
    match.control(0, { ...idle, fire: true });
    match.control(0, idle);
    advance(match, .28);
  }
  assert.equal(right.hp, 0);
  assert.equal(match.battery.carrier, null);
  const dropped = match.snapshot().battery;
  assert.equal(dropped.motion.kind, 'drop');
  assert.ok(dropped.z < right.z - 1);
  Object.assign(left, { x: dropped.x, z: dropped.z });
  advance(match, .65);
  assert.equal(match.battery.carrier, 0);
  Object.assign(left, teams[0].goal);
  advance(match, .1);
  assert.equal(match.score[0], 1);
  const transfer = match.snapshot().battery.motion;
  assert.equal(transfer.kind, 'delivery');
  assert.equal(transfer.fromZ, teams[0].goal.z);
  assert.equal(transfer.toZ, 0);
  Object.assign(left, { x: 0, z: 0 });
  advance(match, 2.1);
  Object.assign(left, teams[0].goal);
  advance(match, .1);
  assert.equal(match.phase, 'ended');
  assert.equal(match.winner, 0);
  match.ready(0);
  match.ready(1);
  assert.equal(match.phase, 'countdown');
  assert.deepEqual(match.score, [0, 0]);
});

test('a released battery stops before cover and only becomes collectible after landing', () => {
  const { match, left, right } = pairMatch();
  const wall = cover.find(block => block.kind === 'wall');
  Object.assign(left, { x: wall.x, z: wall.z + 4, yaw: 0 });
  Object.assign(right, { x: wall.x, z: wall.z + 1.2, hp: 1 });
  match.battery.carrier = right.slot;
  tapShot(match);
  const dropped = match.snapshot().battery;
  assert.equal(dropped.motion.kind, 'drop');
  assert.ok(dropped.z < right.z && dropped.z >= wall.z + wall.d / 2 + .32);
  Object.assign(left, { x: dropped.x, z: dropped.z });
  advance(match, .20);
  assert.equal(match.battery.carrier, null);
  advance(match, .40);
  assert.equal(match.battery.carrier, left.slot);
});

test('carrying the battery modestly slows standing movement and releasing input stops it', () => {
  const { match, left } = pairMatch();
  left.z = 6;
  const walk = () => match.control(0, { ...idle, forward: 1 });
  advance(match, .25, walk);
  const distance = 6 - left.z;
  left.z = 6;
  match.battery.carrier = 0;
  advance(match, .25, walk);
  const carried = 6 - left.z;
  assert.ok(Math.abs(carried / distance - batterySpeedMultiplier) < 1e-9);
  match.release(0);
  const stoppedAt = left.z;
  advance(match, .5);
  assert.equal(left.z, stoppedAt);
  assert.equal(match.snapshot().players[0].eyeHeight, eyeHeight);
});

test('the three weapons apply their advertised damage up close', () => {
  for (const [id, damage, capacity, impacts] of [['carbine', 25, 24, 1], ['scatter', 75, 5, 5], ['pulse', 38, 8, 1]]) {
    const { match, left, right } = pairMatch(id);
    Object.assign(left, { x: 0, z: 1.4, yaw: 0 });
    Object.assign(right, { x: 0, z: -1.4, yaw: Math.PI });
    const shot = tapShot(match);
    assert.equal(shot.origin[1], eyeHeight);
    assert.equal(shot.weapon, id);
    assert.equal(shot.target, right.slot);
    assert.equal(shot.damage, damage);
    assert.equal(shot.impacts.length, impacts);
    assert.equal(shot.impacts.reduce((total, impact) => total + impact.damage, 0), damage);
    assert.equal(right.hp, maxHealth - damage);
    assert.equal(left.ammo, capacity - 1);
  }
});

test('scatter loses damage with distance and pulse keeps full damage at the far end of the yard', () => {
  const training = pairMatch('scatter');
  Object.assign(training.left, { x: 0, z: 2.2, yaw: 0 });
  Object.assign(training.right, { x: 0, z: -6.7 });
  const faded = tapShot(training.match);
  assert.ok(faded.damage > 0 && faded.damage < weapons.scatter.damage);
  assert.ok(faded.impacts.some(impact => impact.target === null));

  for (const [id, expected] of [['carbine', 11], ['pulse', 38], ['scatter', 0]]) {
    const { match, left, right } = pairMatch(id);
    Object.assign(left, { x: 0, z: 11, yaw: 0 });
    Object.assign(right, { x: 0, z: -11 });
    const shot = tapShot(match);
    assert.equal(shot.damage, expected);
    assert.equal(right.hp, maxHealth - expected);
  }
});

test('scatter hits the shutter only once per trigger even with multiple impacts', () => {
  const drill = new YardDrill();
  assert.ok(drill.equip(0, 'scatter'));
  const shot = tapShot(drill);
  assert.ok(shot.impacts.filter(impact => impact.impact === 'shutter').length > 1);
  assert.equal(drill.shutterHP, 2);
});

test('carbine sustained fire widens the beam and a pause restores the first-shot line', () => {
  const drill = new YardDrill();
  Object.assign(drill.players[0], { x: 0, z: 8, yaw: 0 });
  const shots = [];
  advance(drill, .82, () => {
    drill.control(0, { ...idle, fire: true });
    shots.push(...drill.snapshot().events.filter(event => event.type === 'shot'));
  });
  assert.ok(shots.length >= 4);
  assert.equal(shots[0].end[0], 0);
  assert.equal(shots[1].end[0], 0);
  assert.ok(Math.abs(shots[2].end[0]) > .05);
  drill.release(0);
  advance(drill, .5);
  assert.equal(tapShot(drill).end[0], 0);
});

test('practicing a different weapon remembers stock and cannot clear cooldown', () => {
  const drill = new YardDrill();
  const player = drill.players[0];
  assert.equal(drill.equip(0, '__proto__'), false);
  assert.equal(drill.equip(0, {}), false);
  assert.equal(drill.equip(1, 'scatter'), false);
  assert.equal(tapShot(drill).weapon, 'carbine');
  assert.ok(drill.equip(0, 'carbine'));
  assert.equal(player.ammo, 23);
  drill.control(0, { ...idle, reload: true });
  drill.control(0, idle);
  advance(drill, weapons.carbine.reloadSeconds + .1);
  assert.equal(player.reserve, weapons.carbine.reserve - 1);
  assert.equal(tapShot(drill).weapon, 'carbine');
  assert.ok(drill.equip(0, 'pulse'));
  assert.equal(player.ammo, weapons.pulse.capacity);
  assert.equal(tapShot(drill), undefined);
  advance(drill, .3);
  assert.equal(player.ammo, 7);
  assert.ok(drill.equip(0, 'carbine'));
  assert.equal(player.ammo, 23);
  assert.equal(player.reserve, weapons.carbine.reserve - 1);
  assert.ok(drill.equip(0, 'pulse'));
  assert.equal(player.ammo, 7);
  drill.setSparring(true);
  assert.equal(drill.players[0].weapon, 'pulse');
});

test('normal matches allow swaps in combat, preserve ammunition, and lock equipment during countdown', () => {
  const { match, left } = pairMatch('scatter');
  assert.equal(left.weapon, 'scatter');
  left.ammo--;
  assert.ok(match.equip(0, 'pulse'));
  assert.ok(left.nextShot > match.now);
  assert.ok(match.equip(0, 'scatter'));
  assert.equal(left.ammo, weapons.scatter.capacity - 1);
  match.finish(null);
  assert.ok(match.equip(0, 'pulse'));
  match.ready(0);
  match.ready(1);
  assert.equal(match.phase, 'countdown');
  assert.equal(match.equip(0, 'carbine'), false);
  advance(match, 3.1);
  left.ammo = 0;
  left.hp = 0;
  left.respawnAt = match.now;
  match.step(1 / 60);
  const player = match.snapshot().players[0];
  assert.equal(player.weapon, 'pulse');
  assert.equal(player.hp, maxHealth);
  assert.equal(player.ammo, weapons.pulse.capacity);
});

test('reload accepts a quick button tap, loads only reserve rounds, and resets on spawn', () => {
  const match = new YardMatch();
  const player = match.join(0);
  const { capacity, reserve, reloadSeconds } = weapons.carbine;
  assert.equal(player.ammo, capacity);
  assert.equal(player.reserve, reserve);
  Object.assign(player, { ammo: 1, reserve: 2 });
  advance(match, .8, () => match.control(0, { ...idle, fire: true }));
  const empty = match.snapshot();
  assert.equal(empty.players[0].ammo, 0);
  assert.equal(empty.events.filter(event => event.type === 'shot').length, 1);
  assert.equal(empty.events.filter(event => event.type === 'dry-fire').length, 1);

  match.control(0, { ...idle, reload: true });
  match.control(0, idle);
  assert.ok(match.snapshot().events.some(event => event.type === 'reload-start'));
  advance(match, .5);
  match.control(0, { ...idle, fire: true });
  match.control(0, idle);
  const halfway = match.snapshot().players[0];
  assert.equal(halfway.reloading, true);
  assert.ok(halfway.reloadProgress > .3 && halfway.reloadProgress < .5);

  advance(match, reloadSeconds);
  const loaded = match.snapshot();
  assert.equal(loaded.players[0].ammo, 2);
  assert.equal(loaded.players[0].reserve, 0);
  assert.equal(loaded.players[0].reloading, false);
  assert.ok(loaded.events.some(event => event.type === 'reload-complete'));
  assert.ok(!loaded.events.some(event => event.type === 'shot'));
  match.control(0, { ...idle, reload: true });
  assert.equal(match.snapshot().players[0].reloading, false);

  match.spawn(player);
  const respawned = match.snapshot().players[0];
  assert.equal(respawned.ammo, capacity);
  assert.equal(respawned.reserve, reserve);
  assert.equal(respawned.reloading, false);
});

test('each loadout uses its own shot interval and reload duration', () => {
  for (const { id, capacity, reserve, cooldown, reloadSeconds } of Object.values(weapons)) {
    const drill = new YardDrill();
    assert.ok(drill.equip(0, id));
    const player = drill.players[0];
    assert.ok(tapShot(drill));
    const hold = () => drill.control(0, { ...idle, fire: true });
    advance(drill, cooldown * .7, hold);
    assert.equal(player.ammo, capacity - 1);
    advance(drill, cooldown * .4, hold);
    assert.equal(player.ammo, capacity - 2);
    drill.control(0, { ...idle, reload: true });
    drill.control(0, idle);
    advance(drill, reloadSeconds * .85);
    assert.equal(player.ammo, capacity - 2);
    assert.equal(drill.snapshot().players[0].reloading, true);
    advance(drill, reloadSeconds * .25);
    assert.equal(player.ammo, capacity);
    assert.equal(player.reserve, reserve - 2);
  }
});

test('two screens and their paired phone sockets join, play and update QR codes when the host changes networks', { timeout: 10_000 }, async t => {
  let networkAddress = '127.0.0.1';
  const yard = await startYardServer({ host: '127.0.0.1', port: 0, readNetworkAddress: () => networkAddress });
  t.after(() => yard.close());
  const endpoint = `ws://127.0.0.1:${yard.port}/ws`;
  const address = `http://127.0.0.1:${yard.port}`;
  assert.match(await (await fetch(address)).text(), /夜班货场/);
  assert.match(await (await fetch(`${address}/controller`)).text(), /手机手柄/);
  assert.equal((await fetch(`${address}/vendor/three.module.js`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(`${address}/assets/night-shift-sky.jpg`, { method: 'HEAD' })).headers.get('content-type'), 'image/jpeg');

  async function peer(handshake) {
    const socket = new WebSocket(endpoint);
    const messages = [];
    socket.on('message', raw => messages.push(JSON.parse(raw)));
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    socket.send(JSON.stringify(handshake));
    return {
      send: data => socket.send(JSON.stringify(data)),
      receive: async (predicate, limit = 1500) => {
        const expires = Date.now() + limit;
        while (Date.now() < expires) {
          const message = messages.find(predicate);
          if (message) return message;
          await delay(20);
        }
        assert.fail('Expected socket message did not arrive');
      },
    };
  }

  const screenA = await peer({ type: 'screen' });
  const screenB = await peer({ type: 'screen' });
  const welcome = ({ type }) => type === 'welcome';
  const a = await screenA.receive(welcome);
  const b = await screenB.receive(welcome);
  assert.notEqual(a.slot, b.slot);
  assert.notEqual(a.pairURL, b.pairURL);
  assert.match(a.qr, /^data:image\/png;base64,/);
  const invalid = await peer({ type: 'phone', token: 'invalid' });
  await invalid.receive(data => data.type === 'error');
  const phoneA = await peer({ type: 'phone', token: new URL(a.pairURL).hash.slice(1) });
  const phoneB = await peer({ type: 'phone', token: new URL(b.pairURL).hash.slice(1) });
  assert.equal((await phoneA.receive(welcome)).slot, a.slot);
  assert.equal((await phoneB.receive(welcome)).slot, b.slot);
  await screenA.receive(data => data.type === 'seats' && data.seats.every(seat => seat.phone));
  phoneA.send({ type: 'aim-mode', mode: 'motion' });
  await screenA.receive(data => data.type === 'seats' && data.seats[a.slot].aimMode === 'motion');
  phoneA.send({ type: 'input', ...idle, lateral: 1 });
  const moved = await screenB.receive(data => data.type === 'state' && data.players[a.slot].x > .2);
  assert.equal(moved.players[b.slot].x, 0);
  assert.equal(moved.players[a.slot].eyeHeight, eyeHeight);
  screenB.send({ type: 'equip', weapon: 'pulse' });
  const equipped = await screenA.receive(data => data.type === 'state' && data.players[b.slot]?.weapon === 'pulse');
  assert.equal(equipped.players[b.slot].ammo, weapons.pulse.capacity);
  phoneB.send({ type: 'equip', weapon: 'scatter' });
  phoneB.send({ type: 'input', ...idle, fire: true });
  const fired = await screenA.receive(data => data.events?.some(event => event.type === 'shot' && event.player === b.slot));
  assert.equal(fired.players[b.slot].weapon, 'scatter');
  assert.equal(fired.players[b.slot].ammo, weapons.scatter.capacity - 1);
  phoneB.send({ type: 'input', ...idle });
  phoneB.send({ type: 'reload' });
  await screenA.receive(data => data.type === 'state' && data.players[b.slot]?.reloading);
  phoneA.send({ type: 'ready' });
  phoneB.send({ type: 'ready' });
  await screenB.receive(data => data.phase === 'countdown');
  const started = await screenA.receive(data => data.phase === 'playing', 4000);
  assert.equal(started.players[b.slot].weapon, 'scatter');
  await phoneB.receive(data => data.phase === 'playing', 1000);

  networkAddress = '172.20.10.4';
  const refreshed = await screenA.receive(data => data.type === 'pairing', 2500);
  assert.equal(refreshed.lan, `http://${networkAddress}:${yard.port}`);
  assert.equal(new URL(refreshed.pairURL).hostname, networkAddress);
  assert.equal(new URL(refreshed.pairURL).hash, new URL(a.pairURL).hash);
  assert.equal(refreshed.key, a.key);
  assert.notEqual(refreshed.qr, a.qr);
});

test('an HTTPS reverse proxy can rewrite Host and still pair the screen and phone', { timeout: 4000 }, async t => {
  const origin = 'https://nightshift-8787.app.github.dev';
  const yard = await startYardServer({ host: '127.0.0.1', port: 0, origin: `${origin}/` });
  t.after(() => yard.close());
  const endpoint = `ws://127.0.0.1:${yard.port}/ws`;

  await assert.rejects(new Promise((resolve, reject) => {
    const client = new WebSocket(endpoint, { origin: 'https://unrelated.example' });
    client.once('open', resolve);
    client.once('error', reject);
  }));

  function connect(handshake) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(endpoint, { origin });
      socket.once('open', () => socket.send(JSON.stringify(handshake)));
      socket.once('error', reject);
      socket.on('message', raw => {
        const message = JSON.parse(raw);
        if (message.type === 'welcome') resolve({ socket, message });
      });
    });
  }

  const screen = await connect({ type: 'screen' });
  const pairURL = new URL(screen.message.pairURL);
  assert.equal(pairURL.origin, origin);
  assert.equal(pairURL.pathname, '/controller');
  const phone = await connect({ type: 'phone', token: pairURL.hash.slice(1) });
  assert.equal(phone.message.slot, screen.message.slot);
  phone.socket.send(JSON.stringify({ type: 'input', ...idle, yaw: .18, pitch: .11 }));
  const aimed = await new Promise(resolve => screen.socket.on('message', raw => {
    const state = JSON.parse(raw);
    if (state.type === 'state' && state.players[screen.message.slot]?.yaw > .17) resolve(state.players[screen.message.slot]);
  }));
  assert.ok(aimed.pitch > .10);
});

test('practice signaling pairs one phone and forwards only its current offer and answer', { timeout: 4000 }, async t => {
  const origin = 'https://yard.example';
  const yard = await startYardServer({ host: '127.0.0.1', port: 0, practiceOnly: true });
  t.after(() => yard.close());
  yard.setOrigin(origin);
  const endpoint = `ws://127.0.0.1:${yard.port}/practice-signal`;
  const address = `http://127.0.0.1:${yard.port}`;
  const landing = await fetch(address, { redirect: 'manual' });
  assert.equal(landing.headers.get('location'), '/practice?preview=1');
  const match = new WebSocket(`ws://127.0.0.1:${yard.port}/ws`, { origin });
  await assert.rejects(once(match, 'open'));
  assert.equal((await fetch(`${address}/practice`)).status, 200);
  assert.equal((await fetch(`${address}/simulation.js`)).status, 200);

  async function open() {
    const socket = new WebSocket(endpoint, { origin });
    await once(socket, 'open');
    return socket;
  }
  const receive = async socket => JSON.parse((await once(socket, 'message'))[0]);
  const send = (socket, message) => socket.send(JSON.stringify(message));
  const host = await open();
  const invite = receive(host);
  send(host, { type: 'host' });
  const url = new URL((await invite).pairURL);
  assert.equal(url.origin, origin);
  assert.equal(url.pathname, '/controller');
  assert.equal(url.searchParams.get('practice'), '1');

  const invalid = await open();
  const rejected = once(invalid, 'close');
  send(invalid, { type: 'phone', token: 'missing' });
  assert.equal((await rejected)[0], 1008);

  const phone = await open();
  const peer = receive(host);
  send(phone, { type: 'phone', token: url.hash.slice(1) });
  const { exchange } = await peer;
  const offer = { type: 'offer', exchange, sdp: 'offer' };
  const receivedOffer = receive(phone);
  send(host, { ...offer, exchange: exchange - 1 });
  send(host, offer);
  assert.deepEqual(await receivedOffer, offer);
  const answer = { type: 'answer', exchange, sdp: 'answer' };
  const receivedAnswer = receive(host);
  send(phone, { type: 'input', ...idle, fire: true });
  send(phone, answer);
  assert.deepEqual(await receivedAnswer, answer);
  assert.deepEqual(yard.match.players, [null, null]);
});

test('dash follows the stick, cannot cross the closed shutter and has a four-second cooldown', () => {
  const drill = new YardDrill();
  const p = drill.players[0];
  drill.control(0, { ...idle, forward: 1 });
  drill.dash(0);
  const expires = p.dashReady;
  advance(drill, .25);
  assert.ok(p.z >= shutter.d / 2 + .33 && p.z < 1.4);
  drill.dash(0);
  assert.equal(p.dashReady, expires);
  advance(drill, 4);
  Object.assign(p, { x: 0, z: 3 });
  drill.control(0, { ...idle, lateral: 1 });
  drill.dash(0);
  const x = p.x;
  advance(drill, .20);
  assert.ok(p.x > x + 1);
});

test('relay match settles at five points through a combination of deliveries and knockouts', () => {
  const { match, left, right } = pairMatch('pulse');
  match.targetScore = 5;
  match.deliveryPoints = 2;
  match.knockoutPoints = 1;
  for (let i = 0; i < 2; i++) {
    match.battery = { carrier: 0, availableAt: 0 };
    Object.assign(left, teams[0].goal);
    match.updateBattery();
  }
  assert.equal(match.score[0], 4);
  Object.assign(left, { x: 0, z: 7, yaw: 0 });
  Object.assign(right, { x: 0, z: 2, hp: 1 });
  tapShot(match);
  assert.equal(match.phase, 'ended');
  assert.deepEqual(match.score, [5, 0]);
  assert.equal(match.winner, 0);
});

test('two HTTPS room members with different public IPs can join and exchange direct connection offers', async t => {
  const origin = 'https://yard.example';
  const yard = await startYardServer({ host: '127.0.0.1', port: 0, practiceOnly: true, origin });
  t.after(() => yard.close());
  async function post(ip, packet) {
    const response = await fetch(`http://127.0.0.1:${yard.port}/practice-mailbox`, {
      method: 'POST', headers: { origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(packet),
    });
    assert.equal(response.status, 200);
    return response.json();
  }
  async function player(ip) {
    const { id } = await post(ip, { type: 'open', hello: { type: 'room' } });
    return {
      async exchange(message) {
        const response = await post(ip, { type: 'exchange', id, message: message && JSON.stringify(message) });
        return response.messages.map(JSON.parse);
      },
      close: () => post(ip, { type: 'close', id }),
    };
  }
  const host = await player('192.0.2.1');
  const guest = await player('198.51.100.1');
  const [room] = await host.exchange({ type: 'room-create', size: 1 });
  const [joined] = await guest.exchange({ type: 'room-join', code: room.code });
  assert.equal(joined.players.length, 2);
  assert.equal(joined.self, 1);
  const waiting = await host.exchange();
  assert.deepEqual(waiting.at(-1), { type: 'room-new-peer', id: 1 });
  await host.exchange({ type: 'room-offer', id: 1, exchange: 123, sdp: 'example offer' });
  assert.deepEqual(await guest.exchange(), [{ type: 'room-offer', id: 0, exchange: 123, sdp: 'example offer' }]);
  await guest.exchange({ type: 'room-answer', exchange: 123, sdp: 'example answer' });
  assert.deepEqual(await host.exchange(), [{ type: 'room-answer', id: 1, exchange: 123, sdp: 'example answer' }]);
  await host.close();
  assert.equal((await guest.exchange()).at(-1).type, 'room-closed');
});
