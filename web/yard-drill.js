import { YardMatch } from './simulation.js';
import { clamp, shutter } from './yard.js';

const gateDrillSpawn = { x: shutter.x, z: 2.35, yaw: 0 };
const sparringSpawns = [{ x: 0, z: 8.5, yaw: 0 }, { x: 0, z: -3.7, yaw: Math.PI }];

function turnDelta(target, current) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

export class YardDrill extends YardMatch {
  sparring = false;
  patrolStarts = 0;
  nextReturnShot = Infinity;

  constructor() {
    super();
    this.join(0);
  }

  setSparring(enabled) {
    this.sparring = enabled;
    if (enabled) this.join(1);
    else this.players[1] = null;
    this.reset();
  }

  canEquip(slot) {
    return slot === 0;
  }

  spawn(player) {
    super.spawn(player);
    Object.assign(player, this.sparring ? sparringSpawns[player.slot] : gateDrillSpawn);
    if (this.sparring) {
      this.patrolStarts = this.now + 1.6;
      this.nextReturnShot = this.now + 2.8;
    }
  }

  opponentsFor(player) {
    return this.sparring ? this.players.filter(other => other && other.team !== player.team) : [];
  }

  step(dt) {
    const [player, sentinel] = this.players;
    if (sentinel?.hp > 0 && player.hp > 0) {
      const dx = player.x - sentinel.x;
      const dz = player.z - sentinel.z;
      // A measured burst leaves time to find the target with a phone controller.
      const reload = sentinel.ammo === 0 && sentinel.reserve > 0;
      const shoot = !reload && this.now >= this.nextReturnShot;
      if (shoot) this.nextReturnShot = this.now + 1.7;
      const aim = Math.atan2(dx, -dz) + Math.sin(this.now * 4.2) * .10;
      const targetX = .38 + Math.sin(this.now * 1.7) * 1.12;
      const lateral = this.now < this.patrolStarts ? 0
        : clamp((targetX - sentinel.x) * Math.cos(sentinel.yaw) * .65, -.38, .38);
      this.control(1, { forward: 0, lateral, fire: shoot, reload,
        yaw: clamp(turnDelta(aim, sentinel.yaw), -.10, .10), pitch: 0 });
    } else if (sentinel) {
      this.release(1);
    }
    super.step(dt);
  }
}
