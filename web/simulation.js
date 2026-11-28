import { batterySpeedMultiplier, bounds, clamp, cover, eyeHeight, maxHealth, perimeter,
  roundSeconds, shutter, shutterMaxHP, teams, winScore } from './yard.js';
import { defaultWeapon, getWeapon } from './weapons.js';

const emptyInput = () => ({ lateral: 0, forward: 0, fire: false, reload: false });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const neutralBattery = () => ({ x: 0, z: 0, carrier: null, availableAt: 0 });
function movingBattery(kind, from, to, now, duration) {
  return { x: to.x, z: to.z, carrier: null, availableAt: now + duration,
    motion: { kind, fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, start: now, duration } };
}
const burstPattern = [[0, 0], [.57, .36], [-.71, .64], [.92, -.32], [-.83, -.70]];

function rayBox(origin, direction, min, max) {
  let near = 0;
  let far = Infinity;
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

function traceBolt(origin, yaw, pitch, range, solids, enemies = []) {
  const direction = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  let distance = range;
  let impact = 'miss';
  let target = null;
  for (const box of solids) {
    const hitAt = rayBox(origin, direction, [box.x - box.w / 2, 0, box.z - box.d / 2],
      [box.x + box.w / 2, box.h, box.z + box.d / 2]);
    if (hitAt < distance) {
      distance = hitAt;
      impact = box === shutter ? 'shutter' : (box.kind === 'crate' ? 'wood' : 'metal');
    }
  }
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const hitAt = rayBox(origin, direction, [enemy.x - .40, .10, enemy.z - .40],
      [enemy.x + .40, 1.83, enemy.z + .40]);
    if (hitAt < distance) {
      distance = hitAt;
      target = enemy.slot;
      impact = 'player';
    }
  }
  return { target, impact, distance, end: origin.map((value, axis) => value + direction[axis] * distance) };
}

function boltDamage(weapon, distance) {
  const falloff = distance <= weapon.fullDamageRange ? 0
    : (distance - weapon.fullDamageRange) / (weapon.range - weapon.fullDamageRange);
  return Math.round((weapon.damage / weapon.rays.length) * (1 - .8 * falloff));
}

export class YardMatch {
  players = [null, null];
  phase = 'lobby';
  score = [0, 0];
  targetScore = winScore;
  deliveryPoints = 1;
  knockoutPoints = 0;
  battery = neutralBattery();
  shutterHP = shutterMaxHP;
  now = 0;
  endAt = 0;
  winner = null;
  events = [];

  join(slot, team = slot, spawnIndex = 0) {
    const player = { slot, team, spawnIndex, ready: false, weapon: defaultWeapon };
    this.players[slot] = player;
    this.spawn(player);
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
    this.start();
  }

  start() {
    this.reset();
    this.phase = 'countdown';
    this.endAt = this.now + 3;
    this.battery = movingBattery('arrival', this.battery, this.battery, this.now, 3);
  }

  canEquip() {
    return this.phase !== 'countdown';
  }

  equip(slot, id) {
    const player = this.players[slot];
    const weapon = getWeapon(id);
    if (!player || !weapon || !this.canEquip(slot)) return false;
    if (player.weapon === id) return true;
    player.ammoByWeapon.set(player.weapon, { ammo: player.ammo, reserve: player.reserve });
    const rounds = player.ammoByWeapon.get(id) ?? { ammo: weapon.capacity, reserve: weapon.reserve };
    Object.assign(player, rounds, { weapon: id, reloadUntil: 0, pendingShot: false, dryFired: false, burst: 0 });
    if (this.phase === 'playing') player.nextShot = Math.max(player.nextShot, this.now + .30);
    return true;
  }

  reload(slot) {
    const player = this.players[slot];
    if (player?.hp > 0 && (this.phase === 'lobby' || this.phase === 'playing')) this.startReload(player);
  }

  control(slot, input) {
    const player = this.players[slot];
    if (!player || !Number.isFinite(input.lateral) || !Number.isFinite(input.forward)
        || !Number.isFinite(input.yaw) || !Number.isFinite(input.pitch)) return;
    const fire = input.fire === true;
    const reload = input.reload === true;
    if (player.hp > 0 && (this.phase === 'lobby' || this.phase === 'playing')) {
      if (reload && !player.input.reload) this.startReload(player);
      if (fire && !player.input.fire && !player.reloadUntil) player.pendingShot = true;
    }
    if (!fire) player.dryFired = false;
    player.input = { lateral: clamp(input.lateral, -1, 1), forward: clamp(input.forward, -1, 1), fire, reload };
    player.inputUntil = this.now + 0.35;
    player.yaw = Math.atan2(Math.sin(player.yaw + clamp(input.yaw, -0.7, 0.7)),
      Math.cos(player.yaw + clamp(input.yaw, -0.7, 0.7)));
    player.pitch = clamp(player.pitch + clamp(input.pitch, -0.45, 0.45), -1.15, 1.15);
  }

  release(slot) {
    const player = this.players[slot];
    if (!player) return;
    player.input = emptyInput();
    player.inputUntil = 0;
    player.pendingShot = false;
    player.dryFired = false;
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
      if (this.phase === 'ended') break;
      if (player.inputUntil && player.inputUntil < this.now) this.release(player.slot);
      if (player.reloadUntil && this.now >= player.reloadUntil) this.completeReload(player);
      this.move(player, solids, dt);
      if ((player.input.fire || player.pendingShot) && !player.reloadUntil && this.now >= player.nextShot) {
        this.shoot(player, solids);
      }
    }
    if (this.phase === 'playing') this.updateBattery();
  }

  snapshot() {
    const transfer = this.battery.motion;
    let motion = null;
    if (transfer && this.now < this.battery.availableAt && this.battery.carrier == null) {
      const { kind, fromX, fromZ, toX, toZ, start, duration } = transfer;
      motion = { kind, fromX, fromZ, toX, toZ, progress: clamp((this.now - start) / duration, 0, 1) };
    }
    const snapshot = {
      phase: this.phase, remaining: Math.max(0, Math.ceil(this.endAt - this.now)),
      score: this.score, winner: this.winner, shutterHP: this.shutterHP,
      battery: { x: this.battery.x, z: this.battery.z, carrier: this.battery.carrier,
        visible: this.battery.availableAt <= this.now, motion },
      players: this.players.map(player => player && ({ slot: player.slot, team: player.team, x: player.x, z: player.z,
        yaw: player.yaw, pitch: player.pitch, hp: player.hp, ready: player.ready,
        eyeHeight, weapon: player.weapon, ammo: player.ammo, reserve: player.reserve,
        reloading: player.reloadUntil > 0,
        dashWait: Math.max(0, Math.ceil(player.dashReady - this.now)),
        reloadProgress: player.reloadUntil
          ? clamp(1 - (player.reloadUntil - this.now) / getWeapon(player.weapon).reloadSeconds, 0, 1) : 0,
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
    const weapon = getWeapon(player.weapon);
    const spawn = teams[player.team].spawn;
    let spawnX = [0, -2.6, 2.6, -5.2, 5.2][player.spawnIndex];
    const [opponent] = this.opponentsFor(player);
    if (this.knockoutPoints && player.hp === 0 && opponent?.hp > 0) {
      // Re-enter behind cover when the opponent can see the central spawn.
      const candidates = [spawn.x, 7.1, -7.3];
      let best = -Infinity;
      for (const x of candidates) {
        const dx = x - opponent.x, dz = spawn.z - opponent.z;
        const distance = Math.hypot(dx, dz);
        const ray = traceBolt([opponent.x, eyeHeight, opponent.z], Math.atan2(dx, -dz), 0,
          distance, this.shutterHP ? [...cover, shutter] : cover);
        const safety = distance + (ray.impact !== 'miss' ? 100 : 0);
        if (safety > best) { best = safety; spawnX = x; }
      }
    }
    Object.assign(player, spawn, { x: spawnX, pitch: 0, hp: maxHealth, respawnAt: 0,
      ammo: weapon.capacity, reserve: weapon.reserve, ammoByWeapon: new Map(), nextShot: 0, reloadUntil: 0,
      dashUntil: 0, dashReady: 0, dashInput: null, burst: 0, lastBolt: -Infinity });
    this.release(player.slot);
  }

  dash(slot) {
    const player = this.players[slot];
    if (!player || player.hp <= 0 || player.dashReady > this.now ||
        (this.phase !== 'playing' && this.phase !== 'lobby')) return;
    const { lateral, forward } = player.input;
    const length = Math.hypot(lateral, forward);
    player.dashInput = length > .15 ? { lateral: lateral / length, forward: forward / length } : { lateral: 0, forward: 1 };
    player.dashUntil = this.now + .22;
    player.dashReady = this.now + 4;
    this.events.push({ type: 'dash', player: slot, x: player.x, z: player.z });
  }

  ammoEvent(type, player) {
    this.events.push({ type, player: player.slot, weapon: player.weapon, ammo: player.ammo, reserve: player.reserve });
  }

  startReload(player) {
    const weapon = getWeapon(player.weapon);
    if (player.reloadUntil || player.ammo >= weapon.capacity || !player.reserve) return;
    player.reloadUntil = this.now + weapon.reloadSeconds;
    player.pendingShot = false;
    this.ammoEvent('reload-start', player);
  }

  completeReload(player) {
    const rounds = Math.min(player.reserve, getWeapon(player.weapon).capacity - player.ammo);
    player.ammo += rounds;
    player.reserve -= rounds;
    player.reloadUntil = 0;
    player.dryFired = false;
    this.ammoEvent('reload-complete', player);
  }

  move(player, solids, dt) {
    const boosting = player.dashUntil > this.now;
    const { forward, lateral } = boosting ? player.dashInput : player.input;
    const speed = this.battery.carrier === player.slot ? 5.5 * batterySpeedMultiplier : 5.5;
    const stride = speed * (boosting ? 3 : 1) * dt / Math.max(1, Math.hypot(forward, lateral));
    const sine = Math.sin(player.yaw);
    const cosine = Math.cos(player.yaw);
    const x = clamp(player.x + (sine * forward + cosine * lateral) * stride, -bounds.x + 0.34, bounds.x - 0.34);
    const z = clamp(player.z + (-cosine * forward + sine * lateral) * stride, -bounds.z + 0.34, bounds.z - 0.34);
    const blocked = (px, pz) => solids.some(box => (box !== shutter || this.shutterHP > 0)
      && Math.abs(box.x - px) < box.w / 2 + 0.33 && Math.abs(box.z - pz) < box.d / 2 + 0.33);
    if (!blocked(x, player.z)) player.x = x;
    if (!blocked(player.x, z)) player.z = z;
  }

  opponentsFor(player) {
    return this.phase === 'playing' ? this.players.filter(other => other && other.team !== player.team) : [];
  }

  shoot(player, solids) {
    const weapon = getWeapon(player.weapon);
    player.pendingShot = false;
    player.nextShot = this.now + weapon.cooldown;
    if (!player.ammo) {
      if (!player.dryFired) {
        this.ammoEvent('dry-fire', player);
        player.dryFired = true;
      }
      return;
    }
    player.ammo--;
    const shotGap = this.now - player.lastBolt;
    player.burst = shotGap > .34 ? 0 : player.burst + 1;
    player.lastBolt = this.now;
    const wobble = weapon.id === 'carbine' ? Math.min(.036, Math.max(0, player.burst - 1) * .012) : 0;
    const [yawBias, pitchBias] = burstPattern[player.burst % burstPattern.length];
    const origin = [player.x, eyeHeight, player.z];
    const enemies = this.opponentsFor(player);
    const obstacles = [...solids, ...perimeter].filter(box => box !== shutter || this.shutterHP > 0);
    const damageByTarget = new Map();
    const impacts = weapon.rays.map(([yaw, pitch]) => {
      const bolt = traceBolt(origin, player.yaw + yaw + yawBias * wobble, player.pitch + pitch + pitchBias * wobble,
        weapon.range, obstacles, enemies);
      let amount = 0;
      if (bolt.target != null) {
        const previous = damageByTarget.get(bolt.target) ?? 0;
        amount = Math.min(this.players[bolt.target].hp - previous, boltDamage(weapon, bolt.distance));
        damageByTarget.set(bolt.target, previous + amount);
      }
      return { target: bolt.target, impact: bolt.impact, end: bolt.end, damage: amount };
    });
    const breach = impacts.find(bolt => bolt.impact === 'shutter');
    if (breach) {
      this.shutterHP--;
      if (!this.shutterHP) this.events.push({ type: 'break', x: shutter.x, z: shutter.z });
    }
    for (const [target, amount] of damageByTarget) {
      const enemy = this.players[target];
      enemy.hp -= amount;
      if (enemy.hp === 0) {
        if (this.phase === 'playing' && this.knockoutPoints) this.award(player, this.knockoutPoints, 'knockout');
        enemy.respawnAt = this.now + 3;
        enemy.reloadUntil = 0;
        this.release(enemy.slot);
        if (this.battery.carrier === enemy.slot) {
          const dx = enemy.x - player.x, dz = enemy.z - player.z;
          const length = Math.hypot(dx, dz) || 1;
          const landing = { x: enemy.x, z: enemy.z };
          for (let step = 1; step <= 9; step++) {
            const x = clamp(enemy.x + dx / length * step * .15, -bounds.x + .36, bounds.x - .36);
            const z = clamp(enemy.z + dz / length * step * .15, -bounds.z + .36, bounds.z - .36);
            if (obstacles.some(box => Math.abs(x - box.x) < box.w / 2 + .32 &&
                Math.abs(z - box.z) < box.d / 2 + .32)) break;
            Object.assign(landing, { x, z });
          }
          this.battery = movingBattery('drop', enemy, landing, this.now, .59);
          this.events.push({ type: 'drop', player: enemy.slot, x: enemy.x, z: enemy.z });
        }
      }
    }
    const primary = impacts.find(bolt => bolt.target != null) ?? breach ?? impacts[0];
    this.events.push({ type: 'shot', player: player.slot, weapon: weapon.id, origin,
      target: primary.target, impact: primary.impact, end: primary.end, damage: damageByTarget.get(primary.target) ?? 0, impacts });
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
    if (distance(carrier, teams[carrier.team].goal) < 1.7) {
      this.award(carrier, this.deliveryPoints, 'delivery');
      this.battery = movingBattery('delivery', carrier, neutralBattery(), this.now, 2);
    }
  }

  award(player, points, reason) {
    const { team, slot } = player;
    this.score[team] += points;
    this.events.push({ type: 'score', player: slot, team, points, reason });
    if (this.phase === 'playing' && this.score[team] >= this.targetScore) this.finish(team);
  }

  finish(winner) {
    this.phase = 'ended';
    this.endAt = this.now;
    this.winner = winner;
    for (const player of this.players) {
      if (player) {
        player.ready = false;
        player.reloadUntil = 0;
        this.release(player.slot);
      }
    }
  }
}
