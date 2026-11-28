import * as T from '/vendor/three.module.js';
import { weapons } from './weapons.js';

const ramp = new T.DataTexture(new Uint8Array([42, 119, 203, 255]), 4, 1, T.RedFormat);
ramp.magFilter = ramp.minFilter = T.NearestFilter;
ramp.needsUpdate = true;

const toon = (color, map = null) => new T.MeshToonMaterial({ color, gradientMap: ramp, map });
const lit = color => new T.MeshBasicMaterial({ color, toneMapped: false });
const ink = new T.MeshBasicMaterial({ color: 0x101319, side: T.BackSide });
const wear = paintWear();
const canvas = toon(0x4b4b43);
const rubber = toon(0x2a3032);
const shell = toon(0x48655d, wear);
const steel = toon(0x7c8274, wear);
const paper = toon(0xd8c497, wear);
const primer = toon(0xae653f, wear);
const arc = lit(0xdafbb0);
const contact = lit(0xfbf0bb);

function paintWear() {
  if (!globalThis.document) return null;
  const sheet = document.createElement('canvas');
  const size = 128;
  sheet.width = sheet.height = size;
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  let seed = 5941;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let index = 0; index < 380; index++) {
    const x = random() * size;
    const y = random() * size;
    const edge = Math.min(x, y, size - x, size - y) < 15;
    ctx.fillStyle = edge ? '#3a363e50' : '#38394120';
    ctx.fillRect(x, y, 1 + random() * (edge ? 6 : 2), random() * 1.4 + .5);
  }
  ctx.fillStyle = '#0b142127';
  for (let y = 95; y < size; y += 3) {
    for (let x = (y % 2) * 3; x < size; x += 6) {
      ctx.fillRect(x, y, 1 + (y - 95) / 23, 1.2);
    }
  }
  ctx.strokeStyle = '#3e364c70';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(6, 45);
  ctx.lineTo(24, 36);
  ctx.lineTo(38, 35);
  ctx.moveTo(109, 53);
  ctx.lineTo(120, 60);
  ctx.stroke();
  const texture = new T.CanvasTexture(sheet);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function fitArmorUV(geometry, w, h, d) {
  const { position, normal, uv } = geometry.attributes;
  for (let index = 0; index < uv.count; index++) {
    const px = position.getX(index) / w + .5;
    const py = position.getY(index) / h + .5;
    const pz = position.getZ(index) / d + .5;
    const end = Math.abs(normal.getZ(index)) > .5;
    const top = Math.abs(normal.getY(index)) > .5;
    uv.setXY(index, end || top ? px : pz, top && !end ? pz : py);
  }
}

function mount(parent, x, y, z) {
  const group = new T.Group();
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}

function armor(parent, surface, x, y, z, w, h, d, corner = 0, outline = 0) {
  let geometry;
  if (corner) {
    const left = -w / 2;
    const right = w / 2;
    const low = -h / 2;
    const high = h / 2;
    const shape = new T.Shape();
    shape.moveTo(left + corner, low);
    shape.lineTo(right - corner, low);
    shape.lineTo(right, low + corner);
    shape.lineTo(right, high - corner);
    shape.lineTo(right - corner, high);
    shape.lineTo(left + corner, high);
    shape.lineTo(left, high - corner);
    shape.lineTo(left, low + corner);
    shape.closePath();
    geometry = new T.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, steps: 1 });
    geometry.translate(0, 0, -d / 2);
    if (surface.map) fitArmorUV(geometry, w, h, d);
  } else {
    geometry = new T.BoxGeometry(w, h, d);
  }
  const piece = new T.Mesh(geometry, surface);
  piece.position.set(x, y, z);
  if (outline) {
    const contour = new T.Mesh(geometry, ink);
    contour.scale.set(1 + outline / w, 1 + outline / h, 1 + outline / d);
    piece.add(contour);
  }
  parent.add(piece);
  return piece;
}

function ribs(parent, surface, count, x, y, z, spacing, w, h, d) {
  const rib = new T.InstancedMesh(new T.BoxGeometry(w, h, d), surface, count);
  const matrix = new T.Matrix4();
  for (let index = 0; index < count; index++) {
    rib.setMatrixAt(index, matrix.makeTranslation(x, y, z + index * spacing));
  }
  parent.add(rib);
}

function bolt(parent, x, y, z, radius = .018) {
  const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, radius * .55, 6), rubber);
  mesh.position.set(x, y, z);
  mesh.rotation.x = Math.PI / 2;
  parent.add(mesh);
}

function addCarrier(rig, accent) {
  const carrier = mount(rig, 0, 1.19, .20);
  armor(carrier, rubber, 0, 0, .04, .30, .33, .18, .036, .014);
  armor(carrier, paper, 0, .09, .142, .22, .09, .036, .012);
  armor(carrier, accent, 0, -.06, .139, .19, .07, .028, .012);
  armor(carrier, steel, 0, .19, .045, .14, .035, .089, .012);
  for (const side of [-1, 1]) armor(carrier, steel, .126 * side, 0, .138, .032, .22, .036, .012);
  const indicator = armor(carrier, arc, 0, -.06, .158, .16, .033, .016, .006);
  indicator.visible = false;
  return indicator;
}

export function createWastelandFighter(parent, color, { heavy = false } = {}) {
  const accent = toon(color);
  const faceGlow = lit(color);
  const body = mount(parent, 0, 0, 0);
  body.visible = false;
  const rig = mount(body, 0, 0, 0);
  const chest = mount(rig, 0, .94, 0);
  rig.name = 'Pelvis';
  chest.name = 'Chest';
  const hipWidth = heavy ? .38 : .34;
  const chestWidth = heavy ? .47 : .40;

  armor(rig, canvas, 0, .84, 0, hipWidth, .24, .28, .040, .016);
  armor(rig, rubber, 0, .88, -.016, hipWidth + .023, .085, .292, .025, .012);
  armor(rig, paper, 0, .884, -.178, .119, .065, .032, .011);
  armor(chest, canvas, 0, .182, 0, .406, .455, .32, .067, .023);
  const chestPlate = armor(chest, shell, -.013, .226, -.187, chestWidth, .353, .102, .064, .019);
  chestPlate.rotation.z = heavy ? .06 : -.10;
  armor(chest, paper, 0, .323, -.246, chestWidth * .83, .091, .015, .014);
  for (const side of [-1, 1]) bolt(chest, side * chestWidth * .36, .324, -.259, .013);
  const sash = armor(chest, accent, -.085, .168, -.249, .137, .041, .016, .006);
  sash.rotation.z = -.41;
  armor(chest, steel, .077, .101, -.227, .115, .062, .04, .008);
  armor(chest, rubber, 0, .407, -.013, .275, .082, .27, .027, .013);
  armor(chest, canvas, 0, .469, -.016, .139, .127, .161, .021, .008);

  if (heavy) {
    armor(chest, primer, .125, .186, -.247, .072, .092, .018, .012).rotation.z = .22;
    armor(chest, paper, .128, .193, -.258, .053, .027, .010, .006).rotation.z = .22;
  } else {
    armor(chest, accent, .143, .214, -.234, .048, .213, .025, .009).rotation.z = .39;
    armor(chest, rubber, .098, .116, -.251, .062, .043, .019, .008).rotation.z = .38;
  }

  // A salvage yoke and a mismatched reinforced shoulder give each team a distinct silhouette.
  if (heavy) {
    armor(chest, primer, -.235, .374, .065, .185, .24, .32, .046, .015).rotation.z = .28;
    armor(chest, rubber, -.205, .462, .07, .132, .048, .27, .015);
    armor(chest, accent, -.23, .497, .045, .115, .038, .20, .014);
  } else {
    const aerialRack = mount(chest, .12, .29, .17);
    aerialRack.rotation.z = -.22;
    armor(aerialRack, steel, 0, .095, .04, .134, .39, .12, .024, .012);
    armor(aerialRack, accent, 0, .254, .04, .159, .049, .135, .014);
  }
  const helmet = mount(chest, 0, .517, -.008);
  helmet.name = 'Helmet';
  armor(helmet, paper, 0, .134, 0, heavy ? .401 : .347, .313, .318, .067, .026);
  armor(helmet, shell, 0, .078, -.122, heavy ? .353 : .302, .172, .17, .035, .019);
  armor(helmet, rubber, 0, .155, -.193, heavy ? .341 : .284, .100, .098, .025, .015);
  armor(helmet, faceGlow, 0, .156, -.246, heavy ? .271 : .227, .043, .011, .012);
  armor(helmet, contact, -.058, .164, -.253, .074, .018, .010, .005);
  armor(helmet, accent, -.101, .230, -.141, .073, .086, .045, .012);
  armor(helmet, rubber, .176, .121, .021, .081, .127, .090, .021, .012);
  if (!heavy) {
    // The scout's cut-away cowl and swept receiver read against the bright sky.
    armor(helmet, accent, .115, .256, .08, .082, .13, .205, .018, .009).rotation.x = -.36;
    const aerial = armor(helmet, steel, .167, .249, .060, .024, .191, .029);
    aerial.rotation.z = -.18;
    armor(helmet, faceGlow, .184, .34, .06, .032, .035, .024, .008);
  }

  const legs = [-1, 1].map(side => {
    const thigh = mount(rig, side * .148, .792, 0);
    armor(thigh, canvas, 0, -.176, 0, .203, .384, .245, .041, .014);
    armor(thigh, shell, side * .024, -.178, -.104, .151, .245, .087, .025, .012);
    const calf = mount(thigh, 0, -.361, .011);
    armor(calf, rubber, 0, -.169, .004, .179, .373, .212, .033, .014);
    armor(calf, side === -1 ? paper : steel, 0, -.14, -.102, .156, .237, .078, .026, .012);
    armor(calf, accent, 0, -.110, -.149, .10, .043, .015, .006);
    const ankle = mount(calf, 0, -.362, 0);
    const label = side < 0 ? 'L' : 'R';
    thigh.name = 'Thigh ' + label;
    calf.name = 'Shin ' + label;
    ankle.name = 'Boot ' + label;
    armor(ankle, rubber, 0, 0, -.05, .198, .116, .342, .026, .015);
    armor(ankle, steel, 0, .009, -.169, .173, .069, .089, .016);
    return { thigh, calf, ankle, side, planted: false, anchorX: 0, anchorZ: 0 };
  });

  const arms = [-1, 1].map(side => {
    const arm = mount(chest, side * .29, .34, -.006);
    arm.rotation.z = side * .13;
    const plated = side === -1;
    armor(arm, canvas, 0, -.169, 0, .164, .294, .204, .032, .012);
    armor(arm, plated ? accent : shell, side * .024, -.038, -.036,
      plated && heavy ? .217 : .183, .158, .285, .042, .019);
    armor(arm, plated ? paper : accent, 0, -.031, -.181, .104, .051, .016, .010);
    const elbow = mount(arm, 0, -.253, .006);
    arm.name = side < 0 ? 'Upper arm L' : 'Upper arm R';
    elbow.name = side < 0 ? 'Forearm L' : 'Forearm R';
    armor(elbow, rubber, 0, -.133, 0, .154, .285, .165, .033, .014);
    armor(elbow, steel, side * .033, -.107, -.040, .112, .169, .135, .024);
    armor(elbow, canvas, 0, -.233, -.013, .143, .123, .167, .023, .012);
    return { arm, elbow };
  });

  const wrist = mount(arms[1].elbow, -.027, -.232, -.07);
  armor(wrist, shell, -.026, -.058, 0, .173, .274, .173, .021, .012);
  armor(wrist, paper, -.026, -.095, -.083, .143, .12, .026, .022);
  const muzzle = armor(wrist, faceGlow, -.026, -.20, .012, .079, .088, .083, .014);
  const carrierIndicator = addCarrier(rig, accent);
  const joints = [];
  rig.traverse(node => { if (node.isGroup) joints.push(node); });
  for (const joint of joints) {
    const rigidParts = [];
    for (const part of joint.children) {
      if (!part.isMesh || part === carrierIndicator || part === muzzle) continue;
      rigidParts.push(part, ...part.children.filter(child => child.isMesh));
    }
    batchMeshes(joint, rigidParts);
  }
  let recoil = 0;
  let hitAge = 1, hitPower = 0, hitSide = 1;
  let gaitPhase = 0, gaitWeight = 0, lateralLean = 0;
  let downAge = 0, wasDown = false, service = 0, carry = 0;
  const clamp = T.MathUtils.clamp;
  const smooth = T.MathUtils.smoothstep;

  return {
    body, muzzle,
    hit(damage = 25, side = 1) {
      hitAge = 0;
      hitPower = clamp(damage / 38, .32, 1.3);
      hitSide = side < 0 ? -1 : 1;
    },
    fire() { recoil = 1; },
    animate({ time = 0, pitch = 0, carrying = false, dt = 1 / 60, reloading = false,
      velocityX = 0, velocityZ = 0, down = false, reset = false, reducedMotion = false }) {
      if (reset || (wasDown && !down)) {
        gaitPhase = gaitWeight = lateralLean = downAge = service = carry = recoil = 0;
        hitAge = 1;
        legs.forEach(leg => { leg.planted = false; });
      }
      wasDown = down;
      const response = 1 - Math.exp(-14 * dt);
      const speed = down ? 0 : Math.hypot(velocityX, velocityZ);
      const cs = Math.cos(body.rotation.y), sn = Math.sin(body.rotation.y);
      const vx = velocityX * cs - velocityZ * sn;
      const vz = velocityX * sn + velocityZ * cs;
      const lateral = clamp(vx / 4.8, -1, 1);
      const brake = clamp(lateralLean - lateral, -1, 1);
      lateralLean += (lateral - lateralLean) * response;
      gaitPhase = (gaitPhase + dt * Math.min(speed, 7.6) / 1.18) % 1;
      gaitWeight += (clamp(speed / 3.3, 0, 1) - gaitWeight) * response;
      service += (Number(reloading) - service) * response;
      carry += (Number(carrying) - carry) * response;

      hitAge += dt;
      const hit = hitPower * smooth(hitAge, 0, .043) * (1 - smooth(hitAge, .055, .30));
      const catchWeight = hitPower * smooth(hitAge, .04, .17) * (1 - smooth(hitAge, .19, .40));
      downAge = down ? downAge + dt : 0;
      const buckle = smooth(downAge, 0, reducedMotion ? .14 : .32);
      const fold = smooth(downAge, reducedMotion ? 0 : .10, reducedMotion ? .16 : .53);
      const secondary = reducedMotion ? 0 : 1;
      const stride = Math.sin(gaitPhase * Math.PI * 2) * gaitWeight;
      const breathing = Math.sin(time * .0032) * .007 * secondary;
      rig.position.y = breathing - .066 * gaitWeight - .04 * Math.abs(brake)
        - .085 * catchWeight - .025 * carry - .48 * buckle;
      rig.position.x = .036 * lateralLean - .044 * brake + .05 * hitSide * catchWeight;
      rig.rotation.z = -.055 * lateralLean + .07 * brake + .045 * hitSide * hit;
      chest.rotation.set(-.11 * gaitWeight - .12 * carry + .26 * hit - .10 * recoil - .99 * fold,
        -.13 * stride + hitSide * .36 * hit - .10 * carry, hitSide * (.22 * hit + .39 * fold));
      helmet.rotation.set(-.36 * pitch + breathing + .23 * hit - .36 * fold, hitSide * .15 * hit, -.10 * brake);

      // During the support half of a stride, retain the boot's ground position in world space.
      // Solve the two-link leg to it; the swing half lifts the other boot toward its next contact.
      for (const leg of legs) {
        const { thigh, calf, ankle, side } = leg;
        const phase = (gaitPhase + (side < 0 ? 0 : .5)) % 1;
        const swing = phase >= .5 && gaitWeight > .025 && !down;
        const sx = side * (.158 + .035 * Math.abs(brake) + .025 * buckle);
        let footX = sx, footZ = side * .045, lift = 0;
        if (!swing) {
          if (!leg.planted) {
            leg.anchorX = body.position.x + cs * sx + sn * footZ;
            leg.anchorZ = body.position.z - sn * sx + cs * footZ;
          }
          leg.planted = true;
          const dx = leg.anchorX - body.position.x, dz = leg.anchorZ - body.position.z;
          footX = clamp(dx * cs - dz * sn, sx - .22, sx + .22);
          footZ = clamp(dx * sn + dz * cs, -.24, .24);
        } else {
          leg.planted = false;
          const swingTime = (phase - .5) * 2;
          const sweep = (smooth(swingTime, 0, 1) - .5) * .42 * gaitWeight;
          footX += vx / Math.max(.1, speed) * sweep;
          footZ += vz / Math.max(.1, speed) * sweep;
          lift = .12 * Math.sin(swingTime * Math.PI) * gaitWeight;
        }
        const offsetX = footX - side * .148 - rig.position.x;
        const height = .792 + rig.position.y - .062 - lift;
        const length = clamp(Math.hypot(offsetX, height, footZ), .20, .722);
        const bend = Math.acos(clamp(length / .723, 0, 1));
        thigh.rotation.order = 'ZXY';
        thigh.rotation.set(Math.atan2(-footZ, Math.hypot(offsetX, height)) + bend, 0,
          Math.atan2(offsetX, height) - rig.rotation.z);
        calf.rotation.x = -2 * bend;
        ankle.rotation.x = -(thigh.rotation.x + calf.rotation.x);
        ankle.rotation.z = -thigh.rotation.z - rig.rotation.z;
      }

      carrierIndicator.visible = carrying;
      arms[0].arm.rotation.set(.25 - .26 * stride - .24 * pitch + .59 * carry - .30 * fold,
        -.31 * carry, -.15 - .18 * catchWeight - .24 * fold);
      arms[1].arm.rotation.set(.64 + .10 * stride - .55 * pitch - .18 * recoil - .46 * service - .59 * fold,
        .08 + .22 * hitSide * hit, .14 + .28 * hit + .17 * fold);
      arms[0].elbow.rotation.x = .58 + .28 * carry + .25 * catchWeight;
      arms[1].elbow.rotation.x = 1.05 - .23 * recoil - .36 * fold;
      recoil = Math.max(0, recoil - dt * 6.8);
    },
  };
}

function addHand(tool, side) {
  const support = side < 0;
  const wrist = mount(tool, support ? -.10 : .035, support ? -.126 : -.182, support ? -.168 : .157);
  wrist.rotation.x = support ? -.32 : -.58;
  wrist.rotation.z = support ? .45 : -.23;
  armor(wrist, shell, 0, -.123, .236, .165, .145, .402, .03, .014);
  for (const z of [.25, .36]) {
    armor(wrist, rubber, 0, -.123, z, .172, .152, .025, .028);
    armor(wrist, steel, side * .067, -.073, z, .042, .044, .033, .009);
  }
  armor(wrist, paper, 0, -.087, .132, .174, .157, .109, .027, .012);
  armor(wrist, rubber, 0, -.020, -.017, .140, .142, .187, .029, .012);
  armor(wrist, canvas, side * .031, .043, -.081, .093, .071, .097, .021);
  for (const offset of [-.045, 0, .045]) armor(wrist, steel, offset, .054, .007, .027, .020, .050, .006);
  return wrist;
}

// Join the moving gauntlet to a shoulder below the frame. Both endpoints
// stay in view-model space, so turning the phone cannot detach a sleeve.
function makeSleeve(tool, wrist, shoulder) {
  const sleeve = new T.Mesh(new T.CylinderGeometry(.10, .077, 1, 7), canvas);
  tool.add(sleeve);
  const cuff = new T.Vector3(), end = new T.Vector3(), axis = new T.Vector3();
  const up = new T.Vector3(0, 1, 0);
  return inverseTool => {
    wrist.updateMatrix();
    cuff.set(0, -.124, .39).applyMatrix4(wrist.matrix);
    end.copy(shoulder).applyMatrix4(inverseTool);
    axis.subVectors(end, cuff);
    sleeve.scale.y = axis.length();
    sleeve.position.copy(cuff).lerp(end, .5);
    sleeve.quaternion.setFromUnitVectors(up, axis.normalize());
  };
}

function batchMeshes(group, meshes) {
  if (meshes.length < 2) return;
  group.updateWorldMatrix(true, true);
  const localSpace = group.matrixWorld.clone().invert();
  const batches = new Map();
  for (const mesh of meshes) {
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(mesh);
  }

  for (const [surface, meshes] of batches) {
    if (meshes.length < 2) continue;
    const vertices = meshes.reduce((count, { geometry }) =>
      count + (geometry.index?.count ?? geometry.attributes.position.count), 0);
    const positions = new Float32Array(vertices * 3);
    const normals = new Float32Array(vertices * 3);
    const uvs = new Float32Array(vertices * 2);
    let offset = 0;
    for (const mesh of meshes) {
      const transform = new T.Matrix4().multiplyMatrices(localSpace, mesh.matrixWorld);
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(transform);
      const { position, normal, uv } = geometry.attributes;
      positions.set(position.array, offset * 3);
      normals.set(normal.array, offset * 3);
      uvs.set(uv.array, offset * 2);
      offset += position.count;
      geometry.dispose();
      mesh.removeFromParent();
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new T.BufferAttribute(uvs, 2));
    group.add(new T.Mesh(geometry, surface));
  }
}

const emitterStyles = {
  carbine: { glow: 0xddfba8, shell: 0x54796d, length: .54, width: .23, recoil: .90 },
  scatter: { glow: 0xff9049, shell: 0xa75f39, length: .41, width: .36, recoil: 1.24 },
  pulse: { glow: 0x44daff, shell: 0x365387, length: .77, width: .19, recoil: 1.04 },
};

function combineRigidParts(root) {
  const meshes = [];
  root.traverse(node => { if (node.isMesh && !node.isInstancedMesh) meshes.push(node); });
  batchMeshes(root, meshes);
}

function buildEmitterChassis(tool, id, style, coilLamps) {
  const model = mount(tool, 0, 0, 0);
  const housing = toon(style.shell, wear);
  const lamp = lit(style.glow);
  const { length, width } = style;
  armor(model, housing, 0, .003, .116, width, .204, .44, .037, .017);
  armor(model, paper, 0, .095, .061, width * 1.04, .078, .35, .027, .014);
  armor(model, rubber, 0, -.143, .15, .135, .19, .165, .026, .015).rotation.x = -.22;
  armor(model, rubber, 0, .154, .084, .125, .034, .139, .009, .008);
  ribs(model, lamp, 3, -.03, .177, .035, .037, .052, .009, .019);
  armor(model, rubber, .079, -.110, -.029, .076, .12, .18, .014, .013);

  if (id === 'scatter') {
    // The operator sees this end of the housing throughout play.
    armor(model, steel, 0, .004, .343, .305, .153, .026, .028);
    for (const side of [-1, 1]) {
      armor(model, rubber, side * .074, .005, .36, .128, .112, .018, .020);
      for (const y of [-.029, .005, .039]) {
        armor(model, primer, side * .074, y, .371, .087, .012, .012).rotation.z = side * .13;
      }
      armor(model, lamp, side * .148, .065, .362, .013, .026, .013, .004);
    }
    armor(model, housing, 0, -.004, -.204, .39, .254, .34, .045, .025);
    armor(model, steel, 0, .008, -.370, .40, .232, .10, .042, .016);
    for (const side of [-1, 1]) {
      armor(model, rubber, side * .105, .031, -.426, .119, .103, .026, .022);
      armor(model, lamp, side * .104, .028, -.441, .066, .043, .010, .010);
      armor(model, paper, side * .189, .026, -.18, .022, .139, .252, .009);
      ribbons(model, side * .203, -.004, -.235, primer);
    }
  } else if (id === 'pulse') {
    armor(model, steel, 0, 0, .342, .165, .164, .028, .025);
    armor(model, rubber, -.008, .003, .36, .131, .111, .016, .017);
    armor(model, rubber, 0, -.044, -.40, .12, .07, .68, .023, .012);
    const loop = new T.TorusGeometry(.084, .015, 6, 12);
    for (const z of [-.28, -.43, -.58, -.73]) {
      const coilLight = lit(style.glow);
      coilLamps.push(coilLight);
      const coil = new T.Mesh(loop, coilLight);
      coil.position.set(0, .04, z);
      model.add(coil);
      // The four segments repeat the state of the rails at the player's end.
      const index = coilLamps.length - 1;
      armor(model, coilLight, -.049 + index * .027, .006, .374, .016, .058, .016, .005);
    }
    for (const side of [-1, 1]) {
      armor(model, paper, side * .115, .030, -.414, .067, .111, .52, .020, .013);
      ribs(model, housing, 5, side * .15, .068, -.593, .074, .033, .057, .039);
    }
    armor(model, housing, 0, .124, -.719, .23, .062, .124, .022, .015);
    armor(model, primer, 0, .144, -.105, .088, .053, .099, .015, .010);
  } else {
    armor(model, rubber, 0, -.001, .344, .197, .157, .025, .027);
    armor(model, steel, -.013, .002, .36, .132, .117, .016, .021);
    armor(model, rubber, -.016, .003, .371, .102, .084, .012, .013);
    for (const [i, h] of [.028, .043, .058].entries()) {
      armor(model, lamp, -.048 + i * .031, -.023 + h / 2, .38, .017, h, .012, .004);
    }
    for (const y of [-.044, .038]) armor(model, primer, .080, y, .36, .018, .029, .015, .005);
    armor(model, rubber, 0, -.035, -.249, .18, .114, .33, .028, .012);
    for (const side of [-1, 1]) {
      const rail = armor(model, primer, side * .112, .008, -.30, .080, .079, .33, .024, .014);
      rail.rotation.y = side * -.09;
      armor(model, paper, side * .119, .02, -.44, .09, .09, .14, .020, .015);
      armor(model, lamp, side * .106, .020, -length + .021, .050, .041, .010, .008);
    }
    armor(model, steel, 0, .023, -.244, .132, .133, .11, .019, .014);
    armor(model, lamp, 0, .099, -.253, .060, .017, .080, .006);
  }
  combineRigidParts(model);
  return model;
}

function ribbons(model, x, y, z, surface) {
  for (let index = 0; index < 3; index++) {
    const plate = armor(model, surface, x, y, z + index * .062, .012, .125, .031);
    plate.rotation.x = .36;
  }
}

// The three units carry their feed mechanisms in different places. All motion
// is sampled from the authoritative reload progress so reconnects seek correctly.
const ease = T.MathUtils.smoothstep;
const mix = T.MathUtils.lerp;

function makePulseCore(parent, light) {
  const core = mount(parent, 0, .04, -.49);
  const glass = new T.Mesh(new T.CylinderGeometry(.049, .049, .36, 6), light);
  glass.rotation.x = Math.PI / 2;
  core.add(glass);
  for (const z of [-.165, -.055, .055, .165]) {
    const band = new T.Mesh(new T.CylinderGeometry(.059, .059, .025, 8), steel);
    band.rotation.x = Math.PI / 2;
    band.position.z = z;
    core.add(band);
  }
  armor(core, paper, 0, .06, .12, .092, .08, .12, .016, .009);
  combineRigidParts(core);
  return core;
}

function magazineReload(p, clip, hand, chamber, kick) {
  const reach = ease(p, 0, .16) * (1 - ease(p, .82, .98));
  const out = ease(p, .16, .36) - ease(p, .54, .74);
  const lock = ease(p, .76, .86) - ease(p, .87, .93);
  clip.position.set(-.045 - out * .19, -.095 - out * .19, .015 + out * .16);
  clip.rotation.z = -.33 * out;
  hand.position.set(mix(-.10, clip.position.x - .04, reach), mix(-.126, clip.position.y - .055, reach),
    mix(-.168, clip.position.z + .09, reach));
  hand.rotation.z = .45 + .42 * out;
  chamber.position.set(-.055, .125, .10 + .09 * lock + .054 * kick);
  chamber.rotation.set(0, 0, 0);
}

function makeScatterCassette(parent) {
  const cassette = mount(parent, -.13, .055, -.16);
  for (const side of [-1, 1]) {
    const spool = new T.Mesh(new T.CylinderGeometry(.057, .057, .16, 8), primer);
    spool.rotation.z = Math.PI / 2;
    spool.position.z = side * .065;
    cassette.add(spool);
    armor(cassette, contact, -.088, 0, side * .065, .012, .047, .047, .012);
  }
  armor(cassette, steel, -.071, .045, 0, .06, .05, .21, .012);
  combineRigidParts(cassette);
  return cassette;
}

function scatterReload(p, cassette, hand, chamber, kick) {
  const reach = ease(p, 0, .13) - ease(p, .81, 1);
  const slide = ease(p, .10, .34) - ease(p, .57, .78);
  const index = ease(p, .34, .56);
  cassette.position.set(-.17 - .21 * slide, .05 + .055 * slide, -.19 + .08 * slide);
  cassette.rotation.set(index * Math.PI, 0, .12 * slide);
  hand.position.set(mix(-.16, cassette.position.x - .035, reach), mix(-.12, cassette.position.y - .05, reach),
    mix(-.24, cassette.position.z + .075, reach));
  hand.rotation.z = .4 + .64 * slide;
  const ram = ease(p, .77, .89) - ease(p, .89, .95);
  chamber.position.set(-.085, .12, -.25 + .16 * ram + .10 * kick);
  chamber.rotation.set(0, 0, 0);
}

function pulseReload(p, core, hotCore, hand, chamber, kick) {
  const pull = ease(p, .09, .34);
  const insert = ease(p, .49, .75);
  const reach = ease(p, 0, .11) - ease(p, .83, .98);
  // Pull the handle toward the shoulder to clear the coil bore, then sweep left.
  // The spent orange cell continues falling as a separate fresh cyan cell enters.
  hotCore.visible = p > .001 && p < .75;
  const fall = ease(p, .37, .75);
  hotCore.position.set(-.31 * ease(p, .19, .36) - .24 * fall, .04 + .13 * pull - .85 * fall * fall,
    -.49 + .30 * pull + .18 * fall);
  hotCore.rotation.set(.24 * pull + 1.35 * fall, -.43 * pull, -.75 * fall);
  core.visible = p === 0 || p >= .36;
  const out = p === 0 ? 0 : 1 - insert;
  core.position.set(-.31 * out, .04 + .13 * out - .39 * (1 - ease(p, .36, .5)) * Number(p > 0),
    -.49 + .30 * out);
  core.rotation.set(.24 * out, -.43 * out, 0);
  const held = p > 0 && p < .37 ? hotCore : core;
  hand.position.set(mix(-.12, held.position.x - .046, reach), mix(-.12, held.position.y + .009, reach),
    mix(-.25, held.position.z + .145, reach));
  hand.rotation.z = .45 + .62 * reach;
  const hatch = ease(p, .02, .13) - ease(p, .75, .84);
  chamber.position.set(-.05, .15 + .065 * hatch, -.14 + .08 * kick);
  chamber.rotation.set(-hatch * 1.2, 0, .18 * hatch);
}

export function createArcEmitter(camera) {
  const tool = mount(camera, .34, -.29, -.87);
  tool.scale.setScalar(.84);
  tool.visible = false;
  const coilLamps = [];
  const chassis = Object.fromEntries(Object.entries(emitterStyles).map(([id, style]) =>
    [id, buildEmitterChassis(tool, id, style, coilLamps)]));
  for (const [id, model] of Object.entries(chassis)) model.visible = id === 'carbine';

  const leftHand = addHand(tool, -1);
  const rightHand = addHand(tool, 1);
  combineRigidParts(leftHand);
  combineRigidParts(rightHand);
  const leftSleeve = makeSleeve(tool, leftHand, new T.Vector3(.08, -.60, -.22));
  const rightSleeve = makeSleeve(tool, rightHand, new T.Vector3(.48, -.44, -.22));
  const inverseTool = new T.Matrix4();
  const clip = mount(chassis.carbine, -.045, -.095, .015);
  const meterLight = lit(emitterStyles.carbine.glow);
  armor(clip, steel, 0, -.055, 0, .127, .18, .154, .020, .014);
  armor(clip, rubber, 0, -.111, .006, .142, .056, .169, .017, .011);
  armor(clip, meterLight, -.068, -.043, .002, .013, .083, .064, .006);
  combineRigidParts(clip);
  const cassette = makeScatterCassette(chassis.scatter);
  const core = makePulseCore(chassis.pulse, lit(0x6af5ff));
  const hotCore = makePulseCore(chassis.pulse, lit(0xff893c));
  hotCore.visible = false;
  const meter = armor(tool, meterLight, .082, .116, .066, .029, .017, .086, .006);
  const chamber = mount(tool, -.055, .126, .13);
  chamber.name = 'Service latch';
  clip.name = 'Magazine';
  cassette.name = 'Twin cassette';
  core.name = 'Fresh core';
  hotCore.name = 'Spent core';
  leftHand.name = 'Service gauntlet';
  rightHand.name = 'Grip gauntlet';
  armor(chamber, steel, 0, .021, 0, .105, .048, .108, .013, .007);
  armor(chamber, meterLight, -.029, .050, -.012, .040, .018, .064, .005, .004);
  combineRigidParts(chamber);

  const muzzle = mount(tool, 0, .015, -.553);
  muzzle.visible = false;
  const flare = new T.Mesh(new T.OctahedronGeometry(.072), lit(emitterStyles.carbine.glow));
  flare.rotation.z = .42;
  muzzle.add(flare);
  const flashRing = new T.Mesh(new T.RingGeometry(.046, .058, 10), new T.MeshBasicMaterial({
    color: 0xffaa55, side: T.DoubleSide, toneMapped: false,
  }));
  muzzle.add(flashRing);
  let equipped = 'carbine', requested = 'carbine', switchAt = -Infinity;
  let lastKick = 0, shotAt = -Infinity, obstruction = 0;

  return {
    tool,
    muzzle,
    animate({ time, weapon, ammo, kick = 0, movement = 0, dt = 1 / 60, recoilEnabled = true,
      reloading = false, reloadProgress = 0, nearWall = false }) {
      const target = Object.hasOwn(chassis, weapon) ? weapon : 'carbine';
      if (target !== requested) {
        requested = target;
        switchAt = time === 0 ? -Infinity : time;
      }
      const swap = T.MathUtils.clamp((time - switchAt) / 245, 0, 1);
      const firing = kick > lastKick + .08;
      lastKick = kick;
      if (requested !== equipped && (swap >= .45 || firing || reloading)) {
        chassis[equipped].visible = false;
        equipped = requested;
        chassis[equipped].visible = true;
        shotAt = -Infinity;
      }
      if (firing) shotAt = time;
      const style = emitterStyles[equipped];
      const p = reloading ? reloadProgress : 0;
      const pose = ease(p, 0, .18) - ease(p, .81, 1);
      const lower = swap < .45 ? ease(swap, 0, .45) : 1 - ease(swap, .45, 1);
      if (equipped === 'pulse') {
        pulseReload(p, core, hotCore, leftHand, chamber, kick);
        const shotProgress = (time - shotAt) / (weapons.pulse.cooldown * 1000);
        const charge = reloading ? (p - .77) / .23 : ammo === 0 ? 0 : shotProgress;
        coilLamps.forEach((lamp, index) => lamp.color.setHex(charge >= (index + 1) / 4 ? style.glow : 0x284756));
      } else if (equipped === 'scatter') scatterReload(p, cassette, leftHand, chamber, kick);
      else magazineReload(p, clip, leftHand, chamber, kick);
      meter.visible = !reloading || p > .90;
      meterLight.color.setHex(style.glow);
      flare.material.color.setHex(style.glow);
      flashRing.material.color.setHex(style.glow);
      const bob = Math.sin(time * .011) * movement;
      obstruction = T.MathUtils.lerp(obstruction, Number(nearWall), 1 - Math.exp(-14 * dt));
      const recoil = recoilEnabled ? kick * style.recoil : 0;
      const baseX = equipped === 'scatter' ? .30 : equipped === 'pulse' ? .38 : .35;
      tool.position.set(baseX + bob * .008 - pose * .13 + lower * .11,
        -.29 + Math.abs(bob) * .005 + recoil * .015 + pose * .16 - lower * .23 - obstruction * .07,
        -.87 + recoil * .047 - pose * .035 + lower * .085 + obstruction * .16);
      tool.rotation.set(-.025 + recoil * .09 + pose * .045 - lower * .38 - obstruction * .14,
        .26 + bob * .013 + pose * (equipped === 'pulse' ? .69 : .53),
        -.075 - bob * .013 + recoil * .023 + pose * (equipped === 'scatter' ? .56 : .34) + lower * .24);
      muzzle.position.z = -style.length - .018;
      tool.updateMatrix();
      inverseTool.copy(tool.matrix).invert();
      leftSleeve(inverseTool);
      rightSleeve(inverseTool);
      flare.scale.set(equipped === 'scatter' ? 1.85 : 1.1, .9, equipped === 'pulse' ? 2.55 : 1.6);
      flashRing.scale.setScalar(1 + (1 - kick) * 2.2);
      muzzle.visible = kick > .64;
    },
  };
}
