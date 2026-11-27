import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { angularDelta, SideGripAim, topEdge } from '../web/gyro.js';
import { shutter, teams } from '../web/yard.js';
import { startYardServer } from './server.js';
import { YardMatch } from '../web/simulation.js';

const idle = { lateral: 0, forward: 0, yaw: 0, pitch: 0, fire: false };

function advance(match, seconds, actions = () => {}) {
  for (let frame = 0; frame < seconds * 60; frame++) {
    actions();
    match.step(1 / 60);
  }
}

function pairMatch() {
  const match = new YardMatch();
  const left = match.join(0);
  const right = match.join(1);
  match.ready(0);
  match.ready(1);
  advance(match, 3.1);
  return { match, left, right };
}

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
  assert.equal(right.hp, 3);
  advance(match, .49, () => match.control(0, { ...idle, fire: true }));
  assert.equal(match.shutterHP, 0);
  assert.ok(match.snapshot().events.some(event => event.type === 'break'));
  advance(match, .45, () => match.control(0, { ...idle, fire: true, forward: 1 }));
  assert.ok(left.z < 0);
  assert.ok(right.hp < 3);
});

test('quick taps register, knocked-out carriers drop the battery, and it can be scored twice', () => {
  const { match, left, right } = pairMatch();
  Object.assign(right, { x: 0, z: 0 });
  advance(match, .05);
  assert.equal(match.battery.carrier, 1);
  Object.assign(left, { x: 0, z: 2.2, yaw: 0 });
  for (let shot = 0; shot < 3; shot++) {
    match.control(0, { ...idle, fire: true });
    match.control(0, idle);
    advance(match, .28);
  }
  assert.equal(right.hp, 0);
  assert.equal(match.battery.carrier, null);
  Object.assign(left, { x: 0, z: 0 });
  advance(match, .5);
  assert.equal(match.battery.carrier, 0);
  Object.assign(left, teams[0].goal);
  advance(match, .1);
  assert.equal(match.score[0], 1);
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
  phoneB.send({ type: 'input', ...idle, fire: true });
  await screenA.receive(data => data.events?.some(event => event.type === 'shot' && event.player === b.slot));
  screenA.send({ type: 'ready' });
  screenB.send({ type: 'ready' });
  await screenB.receive(data => data.phase === 'countdown');
  await screenA.receive(data => data.phase === 'playing', 4000);
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
