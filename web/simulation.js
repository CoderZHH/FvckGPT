import { bounds, clamp, cover, eyeHeight, perimeter, roundSeconds, shutter, shutterMaxHP, teams, winScore } from './yard.js';

const emptyInput = () => ({ lateral: 0, forward: 0, fire: false });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const neutralBattery = () => ({ x: 0, z: 0, carrier: null, availableAt: 0 });

function rayBox(origin, direction, min, max) {
  let near = 0;
  let far = 40;
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(direction[axis]) < 1e-7) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return Infinity;
      continue;
    }
    const low = (min[axis] - origin[axis]) / direction[axis];
    const high = (max[axis] - origin[axis]) / direction[axis];
    near = Math.max(near, Math.min(low, high));
    far = Math.min(far, Math.max(low, high));
    if (far < near) return Infinity;
  }
  return near;
}

export class YardMatch {
  players = [null, null];
  phase = 'lobby';
  score = [0, 0];
  battery = neutralBattery();
  shutterHP = shutterMaxHP;
  now = 0;
  endAt = 0;
  winner = null;
  events = [];

  join(slot) {
    const player = { slot, ready: false, pitch: 0, hp: 3, respawnAt: 0,
      input: emptyInput(), inputUntil: 0, nextShot: 0, pendingShot: false, ...teams[slot].spawn };
    this.players[slot] = player;
    return player;
  }

  leave(slot) {
    this.players[slot] = null;
    this.phase = 'lobby';
    this.reset();
  }

  ready(slot) {
    if (this.phase !== 'lobby' && this.phase !== 'ended') return;
    const player = this.players[slot];
    if (!player) return;
    player.ready = true;
    if (!this.players.every(other => other?.ready)) return;
    this.reset();
    this.phase = 'countdown';
    this.endAt = this.now + 3;
  }

  control(slot, input) {
    const player = this.players[slot];
    if (!player || !Number.isFinite(input.lateral) || !Number.isFinite(input.forward)
        || !Number.isFinite(input.yaw) || !Number.isFinite(input.pitch)) return;
    const fire = input.fire === true;
    if (fire && !player.input.fire && (this.phase === 'lobby' || this.phase === 'playing')) {
      player.pendingShot = true;
    }
    player.input = { lateral: clamp(input.lateral, -1, 1), forward: clamp(input.forward, -1, 1), fire };
    player.inputUntil = this.now + 0.35;
    player.yaw = Math.atan2(Math.sin(player.yaw + clamp(input.yaw, -0.7, 0.7)),
      Math.cos(player.yaw + clamp(input.yaw, -0.7, 0.7)));
    player.pitch = clamp(player.pitch + clamp(input.pitch, -0.45, 0.45), -1.15, 1.15);
  }

  release(slot) {
    const player = this.players[slot];
    if (!player) return;
    player.input = emptyInput();
    player.pendingShot = false;
  }

  step(dt) {
    this.now += dt;
    if (this.phase === 'countdown' && this.now >= this.endAt) {
      this.phase = 'playing';
      this.endAt = this.now + roundSeconds;
      this.events.push({ type: 'start' });
    }
    if (this.phase === 'playing' && this.now >= this.endAt) {
      const [a, b] = this.score;
      this.finish(a === b ? null : Number(b > a));
    }
    if (this.phase !== 'lobby' && this.phase !== 'playing') return;

    const solids = this.shutterHP > 0 ? [...cover, shutter] : cover;
    for (const player of this.players) {
      if (!player) continue;
      if (player.hp <= 0) {
        if (this.now >= player.respawnAt) this.spawn(player);
        continue;
      }
      if (player.inputUntil < this.now) this.release(player.slot);
      this.move(player, solids, dt);
      if ((player.input.fire || player.pendingShot) && this.now >= player.nextShot) this.shoot(player, solids);
    }
    if (this.phase === 'playing') this.updateBattery();
  }

  snapshot() {
    const snapshot = {
      phase: this.phase, remaining: Math.max(0, Math.ceil(this.endAt - this.now)),
      score: this.score, winner: this.winner, shutterHP: this.shutterHP,
      battery: { x: this.battery.x, z: this.battery.z, carrier: this.battery.carrier,
        visible: this.battery.availableAt <= this.now },
      players: this.players.map(player => player && ({ slot: player.slot, x: player.x, z: player.z,
        yaw: player.yaw, pitch: player.pitch, hp: player.hp, ready: player.ready,
        respawn: Math.max(0, Math.ceil(player.respawnAt - this.now)) })),
      events: this.events,
    };
    this.events = [];
    return snapshot;
  }

  reset() {
    this.score = [0, 0];
    this.endAt = 0;
    this.winner = null;
    this.shutterHP = shutterMaxHP;
    this.battery = neutralBattery();
    this.events = [];
    for (const player of this.players) {
      if (player) {
        player.ready = false;
        this.spawn(player);
      }
    }
  }

  spawn(player) {
    Object.assign(player, teams[player.slot].spawn, { pitch: 0, hp: 3, respawnAt: 0,
      nextShot: 0, pendingShot: false });
    player.input = emptyInput();
  }

  move(player, solids, dt) {
    const { forward, lateral } = player.input;
    const stride = 5.5 * dt / Math.max(1, Math.hypot(forward, lateral));
    const sine = Math.sin(player.yaw);
    const cosine = Math.cos(player.yaw);
    const x = clamp(player.x + (sine * forward + cosine * lateral) * stride, -bounds.x + 0.34, bounds.x - 0.34);
    const z = clamp(player.z + (-cosine * forward + sine * lateral) * stride, -bounds.z + 0.34, bounds.z - 0.34);
    const blocked = (px, pz) => solids.some(box => (box !== shutter || this.shutterHP > 0)
      && Math.abs(box.x - px) < box.w / 2 + 0.33 && Math.abs(box.z - pz) < box.d / 2 + 0.33);
    if (!blocked(x, player.z)) player.x = x;
    if (!blocked(player.x, z)) player.z = z;
  }

  shoot(player, solids) {
    player.pendingShot = false;
    player.nextShot = this.now + 0.24;
    const origin = [player.x, eyeHeight, player.z];
    const direction = [Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch),
      -Math.cos(player.yaw) * Math.cos(player.pitch)];
    let best = 36;
    let impact = 'miss';
    let target = null;
    for (const box of [...solids, ...perimeter]) {
      if (box === shutter && this.shutterHP === 0) continue;
      const range = rayBox(origin, direction, [box.x - box.w / 2, 0, box.z - box.d / 2],
        [box.x + box.w / 2, box.h, box.z + box.d / 2]);
      if (range < best) {
        best = range;
        impact = box === shutter ? 'shutter' : (box.kind === 'crate' ? 'wood' : 'metal');
      }
    }
    if (this.phase === 'playing') {
      const enemy = this.players[1 - player.slot];
      if (enemy?.hp > 0) {
        const range = rayBox(origin, direction, [enemy.x - 0.40, 0.10, enemy.z - 0.40],
          [enemy.x + 0.40, 1.83, enemy.z + 0.40]);
        if (range < best) {
          best = range;
          target = enemy;
          impact = 'player';
        }
      }
    }
    if (impact === 'shutter') {
      this.shutterHP--;
      if (!this.shutterHP) this.events.push({ type: 'break', x: shutter.x, z: shutter.z });
    }
    if (target) {
      target.hp--;
      if (target.hp === 0) {
        target.respawnAt = this.now + 3;
        this.release(target.slot);
        if (this.battery.carrier === target.slot) {
          this.battery = { x: target.x, z: target.z, carrier: null, availableAt: this.now + 0.45 };
        }
      }
    }
    this.events.push({ type: 'shot', player: player.slot, target: target?.slot ?? null, impact,
      origin, end: origin.map((value, axis) => value + direction[axis] * best) });
  }

  updateBattery() {
    if (this.battery.availableAt > this.now) return;
    if (this.battery.carrier == null) {
      const pickup = this.players.filter(player => player?.hp > 0 && distance(player, this.battery) < 0.95)
        .sort((left, right) => distance(left, this.battery) - distance(right, this.battery))[0];
      if (pickup) {
        this.battery.carrier = pickup.slot;
        this.events.push({ type: 'pickup', player: pickup.slot });
      }
    }
    if (this.battery.carrier == null) return;
    const carrier = this.players[this.battery.carrier];
    this.battery.x = carrier.x;
    this.battery.z = carrier.z;
    if (distance(carrier, teams[carrier.slot].goal) < 1.7) {
      this.score[carrier.slot]++;
      this.events.push({ type: 'score', player: carrier.slot });
      this.battery = { ...neutralBattery(), availableAt: this.now + 2 };
      if (this.score[carrier.slot] >= winScore) this.finish(carrier.slot);
    }
  }

  finish(winner) {
    this.phase = 'ended';
    this.endAt = this.now;
    this.winner = winner;
    for (const player of this.players) {
      if (player) player.ready = false;
    }
  }
}
