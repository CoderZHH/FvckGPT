import * as T from '/vendor/three.module.js';
import { teams } from './yard.js';

const ink = 0x231917;
const cream = 0xffecae;
const copper = 0xe77743;
const chalk = 0xc6a784;
const cyan = 0x8edbe0;
const charge = 0xd4ed71;
const up = new T.Vector3(0, 1, 0);
const planeNormal = new T.Vector3(0, 0, 1);

function flashGeometry() {
  const shape = new T.Shape();
  const radii = [1, .29, .59, .20, .89, .34, .65, .25, .92, .22, .53, .30, 1.14, .21, .71, .30];
  radii.forEach((radius, index) => {
    const angle = index * Math.PI * 2 / radii.length;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return new T.ShapeGeometry(shape);
}

function tracerGeometry() {
  const shape = new T.Shape();
  const points = [[0, -.5], [.49, -.22], [.28, .30], [0, .5], [-.28, .30], [-.49, -.22]];
  shape.moveTo(...points[0]);
  for (const point of points.slice(1)) shape.lineTo(...point);
  shape.closePath();
  return new T.ShapeGeometry(shape);
}

function pool(scene, geometry, capacity, { twoSided = false, overlay = false } = {}) {
  const material = new T.MeshBasicMaterial({ toneMapped: false, side: twoSided ? T.DoubleSide : T.FrontSide,
    polygonOffset: overlay, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new T.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  scene.add(mesh);
  const parts = [];
  const transform = new T.Object3D();
  const inkColor = new T.Color();

  return {
    add(part) {
      if (parts.length === capacity) parts.shift();
      parts.push({ age: 0, ...part });
    },
    step(dt) {
      if (!parts.length && mesh.count === 0) return;
      let count = 0;
      for (const part of parts) {
        part.age += dt;
        const lifetime = part.age / part.life;
        if (lifetime >= 1) continue;
        if (part.velocity) {
          part.velocity.y -= (part.gravity ?? 0) * dt;
          part.position.addScaledVector(part.velocity, dt);
          if (part.position.y < .045 && part.velocity.y < 0) {
            part.position.y = .045;
            part.velocity.y *= -.22;
            part.velocity.multiplyScalar(.58);
          }
        }
        const envelope = part.grow ? (.35 + Math.sin(Math.PI * lifetime * .9)) * Math.min(1, 4 * (1 - lifetime))
          : Math.min(1, 3.5 * (1 - lifetime));
        transform.position.copy(part.position);
        transform.quaternion.copy(part.orientation);
        if (part.spin) transform.rotateZ(part.age * part.spin);
        transform.scale.copy(part.size).multiplyScalar(envelope);
        transform.updateMatrix();
        mesh.setMatrixAt(count, transform.matrix);
        mesh.setColorAt(count, inkColor.setHex(part.color));
        parts[count++] = part;
      }
      parts.length = mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}

export function makeCombatEffects(scene, { reducedMotion = false } = {}) {
  const flash = pool(scene, flashGeometry(), 20, { twoSided: true, overlay: true });
  const burstRing = pool(scene, new T.RingGeometry(.71, 1, 9), 12, { twoSided: true, overlay: true });
  const waveArcs = pool(scene, new T.RingGeometry(.91, 1, 15, 1, .15, Math.PI * 1.38), 12, { twoSided: true });
  const trails = pool(scene, tracerGeometry(), 20, { twoSided: true });
  const shards = pool(scene, new T.TetrahedronGeometry(1), reducedMotion ? 40 : 116);
  const dust = pool(scene, new T.IcosahedronGeometry(1, 0), reducedMotion ? 12 : 28);
  const batches = [flash, burstRing, waveArcs, trails, shards, dust];

  function flare(position, normal, size, color, life = .15) {
    const orientation = new T.Quaternion().setFromUnitVectors(planeNormal, normal);
    orientation.multiply(new T.Quaternion().setFromAxisAngle(planeNormal, Math.random() * Math.PI));
    const outerSize = new T.Vector3(size * 1.15, size * 1.15, 1);
    flash.add({ position: position.clone().addScaledVector(normal, -.006), orientation,
      size: outerSize, color: ink, life });
    flash.add({ position: position.clone(), orientation, size: new T.Vector3(size, size, 1), color, life });
  }

  function ring(position, normal, size, color, life) {
    burstRing.add({ position: position.clone(), orientation: new T.Quaternion().setFromUnitVectors(planeNormal, normal),
      size: new T.Vector3(size, size, 1), color, life, grow: true });
  }

  function tracer(start, end, color, width, life = .082) {
    const delta = end.clone().sub(start);
    const length = delta.length();
    if (length < .07) return;
    const direction = delta.divideScalar(length);
    const orientation = new T.Quaternion().setFromUnitVectors(up, direction);
    trails.add({ position: start.clone().lerp(end, .5), orientation,
      size: new T.Vector3(width, length, 1), color, life });
    // A second plane keeps the printed streak readable from the side as well as head-on.
    trails.add({ position: start.clone().lerp(end, .5),
      orientation: orientation.clone().multiply(new T.Quaternion().setFromAxisAngle(up, Math.PI / 2)),
      size: new T.Vector3(width * .53, length * .96, 1), color: cream, life: life * .8 });
  }

  function pulseWave(start, end) {
    const direction = end.clone().sub(start);
    const length = direction.length();
    direction.normalize();
    tracer(start, end, 0x48d9fc, .052, .13);
    if (reducedMotion) return;
    const axis = new T.Quaternion().setFromUnitVectors(planeNormal, direction);
    for (const phase of [.14, .31, .48]) {
      const position = start.clone().lerp(end, phase);
      const life = .19;
      const radius = .13 + phase * .18;
      const orientation = axis.clone().multiply(new T.Quaternion().setFromAxisAngle(planeNormal, phase * 13));
      waveArcs.add({ position, orientation, velocity: direction.clone().multiplyScalar(length * (.88 - phase) / life),
        size: new T.Vector3(radius, radius, 1), color: 0x78eafd, life, grow: true });
    }
  }

  function eject(position, normal, amount, colors, { power = 1, heavy = false } = {}) {
    const count = reducedMotion ? Math.ceil(amount * .45) : amount;
    for (let i = 0; i < count; i++) {
      const velocity = new T.Vector3(Math.random() - .5, Math.random() - .2, Math.random() - .5)
        .multiplyScalar(4 * power).addScaledVector(normal, 3 * Math.random() * power);
      const orientation = new T.Quaternion().setFromUnitVectors(up, velocity.clone().normalize());
      const size = (heavy ? .065 : .028) * (.65 + Math.random() * .9);
      shards.add({ position: position.clone(), velocity, orientation, size: new T.Vector3(size, size * (heavy ? 2 : 4), size),
        color: colors[i % colors.length], life: heavy ? .54 + Math.random() * .55 : .22 + Math.random() * .27,
        gravity: heavy ? 10.8 : 6.5, spin: heavy ? 8 * (Math.random() - .5) : 2 });
    }
  }

  function cloud(position, amount, palette, scale = 1) {
    const count = reducedMotion ? Math.ceil(amount * .40) : amount;
    for (let i = 0; i < count; i++) {
      const size = (.075 + .12 * Math.random()) * scale;
      dust.add({ position: position.clone().add(new T.Vector3(Math.random() - .5, 0, Math.random() - .5).multiplyScalar(size)),
        velocity: new T.Vector3((Math.random() - .5) * scale, .22 + .38 * Math.random(), (Math.random() - .5) * scale),
        orientation: new T.Quaternion(), spin: Math.random() * 2, size: new T.Vector3(size, size * .65, size),
        color: palette[i % palette.length], life: .48 + Math.random() * .5, grow: true });
    }
  }

  function emit(action, slot) {
    if (action.type === 'shot') {
      const start = new T.Vector3(...action.origin);
      const end = new T.Vector3(...action.end);
      const ray = end.clone().sub(start);
      const distance = ray.length();
      if (distance < .05) return;
      const direction = ray.divideScalar(distance);
      if (action.player === slot) {
        // Leave the foreground to the model's muzzle burst and keep the reticle legible.
        start.addScaledVector(direction, Math.min(2.6, distance * .42));
        const right = new T.Vector3().crossVectors(direction, up).normalize();
        start.addScaledVector(right, .19);
        start.y -= .12;
      } else {
        flare(start.clone().addScaledVector(direction, .42), direction, .27, cream, .10);
      }
      if (action.weapon === 'pulse') pulseWave(start, end);
      else tracer(start, end, action.weapon === 'scatter' ? copper : charge, action.weapon === 'scatter' ? .075 : .043);
      if (action.weapon === 'scatter' && !reducedMotion && action.impacts) {
        const paths = action.impacts.filter(impact => impact.end.some((value, axis) => value !== action.end[axis]));
        for (const impact of paths) {
          const endPoint = new T.Vector3(...impact.end);
          if (endPoint.distanceToSquared(start) > .025) tracer(start, endPoint, 0xff9557, .041, .12);
        }
      }
      if (action.impact === 'miss') return;

      const normal = direction.clone().negate();
      const point = end.clone().addScaledVector(normal, .035);
      const readability = Math.min(2.5, Math.max(1, distance / 13));
      if (action.impact === 'player') {
        flare(point, normal, .15, action.weapon === 'pulse' ? 0x52defe : cream, .11);
        eject(point, normal, 7, [cyan, cream, charge], { power: .8 });
      } else if (action.impact === 'wood') {
        flare(point, normal, .17, chalk, .12);
        eject(point, normal, 8, [chalk, 0xa86743, 0xe2c098], { heavy: true });
        cloud(point, 4, [0xa78163, chalk], .68);
      } else {
        const isShutter = action.impact === 'shutter';
        flare(point, normal, (isShutter ? .31 : .23) * readability, cream, .18);
        eject(point, normal, isShutter ? 13 : 8, [cream, copper, 0xd4aa75]);
      }
    }
    if (action.type === 'dash') {
      const origin = new T.Vector3(action.x, .12, action.z);
      ring(origin, up, .9, cyan, .24);
      cloud(origin, 6, [chalk, copper], .7);
    }
    if (action.type === 'break') {
      const point = new T.Vector3(action.x, 1.17, action.z);
      const front = new T.Vector3(0, 0, 1);
      flare(point, front, 1.16, cream, .20);
      ring(point.clone().addScaledVector(front, .03), front, 1.48, copper, .36);
      eject(point, front, 22, [cream, copper, 0x987c62, ink], { power: 1.55, heavy: true });
      eject(point, front.clone().negate(), 12, [0xc59359, chalk, ink], { power: 1.05, heavy: true });
      cloud(point.clone().setY(.45), 10, [0x5c544b, 0x876b54, chalk], 1.7);
    }
    if (action.type === 'score' && action.reason !== 'knockout' && teams[action.team ?? action.player]) {
      const { x, z } = teams[action.team ?? action.player].goal;
      const point = new T.Vector3(x, .12, z);
      ring(point, up, 2.02, charge, .75);
      eject(point, up, 22, [charge, cream, cyan], { power: 1.18 });
    }
  }

  return { emit, step(dt) { for (const batch of batches) batch.step(dt); } };
}
