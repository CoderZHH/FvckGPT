import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { battleRooms } from './battle-rooms.js';
import { YardMatch } from '../web/simulation.js';

test('rooms enforce their code, full teams, readiness, owner start and departure for every size', () => {
  for (const size of [1, 2, 3, 4, 5]) {
    const rooms = battleRooms((peer, packet) => peer.inbox.push(packet), () => randomBytes(16).toString('hex'));
    const players = Array.from({ length: size * 2 }, () => ({ inbox: [] }));
    const [host, guest] = players;
    const send = (peer, type, body) => rooms.handle(peer, { type: `room-${type}`, ...body });
    const last = peer => peer.inbox.at(-1);
    send(host, 'create', { size });
    const { code } = last(host);
    send(guest, 'join', { code: 'INVALID' });
    assert.equal(last(guest).type, 'room-error');
    for (const player of players.slice(1)) send(player, 'join', { code });
    assert.deepEqual(last(guest).counts, [size, size]);
    const overflow = { inbox: [] };
    send(overflow, 'join', { code });
    assert.match(last(overflow).message, /房间已满/);
    send(guest, 'ready');
    assert.match(last(guest).message, /直连/);
    send(host, 'start');
    assert.equal(last(host).type, 'room-error');
    players.forEach((player, id) => {
      if (id) send(host, 'link', { id, connected: true });
      send(player, 'ready');
    });
    send(guest, 'ready');
    assert.equal(last(host).canStart, false);
    send(guest, 'ready');
    send(guest, 'start');
    assert.equal(last(host).phase, 'lobby');
    assert.equal(last(host).canStart, true);
    send(host, 'start');
    assert.equal(last(guest).phase, 'match');
    rooms.leave(guest);
    assert.equal(last(host).phase, 'lobby');
    assert.ok(last(host).players.every(player => !player.ready));
    send(guest, 'join', { code });
    assert.equal(last(guest).phase, 'lobby');
    rooms.leave(host);
    assert.equal(last(guest).type, 'room-closed');
  }
});

test('a ten-player match spawns five distinct positions per side and scores by team', () => {
  const match = new YardMatch();
  match.knockoutPoints = 1;
  for (let id = 0; id < 10; id++) match.join(id, id % 2, Math.floor(id / 2));
  match.start();
  assert.equal(new Set(match.players.map(player => `${player.x}/${player.z}`)).size, 10);
  while (match.phase === 'countdown') match.step(1 / 60);
  for (const player of match.players) Object.assign(player, { x: 15, z: 18 });
  const [shooter, enemy, ally, other] = match.players;
  Object.assign(shooter, { x: 0, z: 8 });
  Object.assign(ally, { x: 0, z: 7 });
  Object.assign(enemy, { x: 0, z: 5, hp: 20 });
  Object.assign(other, { x: 0, z: 2 });
  match.control(shooter.slot, { lateral: 0, forward: 0, yaw: 0, pitch: 0, fire: true });
  match.step(1 / 60);
  assert.equal(ally.hp, 100);
  assert.equal(enemy.hp, 0);
  assert.equal(other.hp, 100);
  assert.deepEqual(match.score, [1, 0]);
  assert.equal(match.snapshot().players[9].team, 1);
});
