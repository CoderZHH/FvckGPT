import * as T from '/vendor/three.module.js';
import { bounds, cover, eyeHeight, shutter, teams } from './yard.js';

const ink = new T.LineBasicMaterial({ color: 0x10151d });
const tracerInk = new T.LineBasicMaterial({ color: 0xffef9e, transparent: true, opacity: 0.88 });
const spark = new T.MeshBasicMaterial({ color: 0xffba61 });
const splinter = new T.MeshBasicMaterial({ color: 0xebc592 });
const confirmed = new T.MeshBasicMaterial({ color: 0xdbff9e });
const sparkShape = new T.BoxGeometry(0.07, 0.07, 0.07);
const junkShape = new T.BoxGeometry(0.19, 0.12, 0.13);
const inkHull = new T.MeshBasicMaterial({ color: 0x0c131d, side: T.BackSide });
const toneRamp = new T.DataTexture(new Uint8Array([56, 113, 170, 255]), 4, 1, T.RedFormat);
toneRamp.minFilter = toneRamp.magFilter = T.NearestFilter;
toneRamp.needsUpdate = true;
const metal = material(0x4c5767);
const dark = material(0x242d3a);
const signal = new T.MeshStandardMaterial({ color: 0xd6ff75, emissive: 0xa8fd56, emissiveIntensity: 0.65 });

function material(color, map = null) {
  return new T.MeshToonMaterial({ color, gradientMap: toneRamp, map });
}

function box(parent, x, y, z, w, h, d, surface, outline = false) {
  const geometry = new T.BoxGeometry(w, h, d);
  const mesh = new T.Mesh(geometry, surface);
  mesh.position.set(x, y, z);
  if (outline === 'bold') {
    const line = new T.Mesh(geometry, inkHull);
    line.scale.set(1 + .028 / w, 1 + .028 / h, 1 + .028 / d);
    mesh.add(line);
  } else if (outline) mesh.add(new T.LineSegments(new T.EdgesGeometry(geometry), ink));
  parent.add(mesh);
  return mesh;
}

function floorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#566377';
  ctx.fillRect(0, 0, 256, 256);
  let state = 1979;
  for (let i = 0; i < 2100; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const x = state & 255;
    const y = (state >>> 12) & 255;
    ctx.fillStyle = i % 3 === 0 ? '#a6adad36' : '#1824354d';
    ctx.fillRect(x, y, i % 7 === 0 ? 3 : 1, 1);
  }
  ctx.strokeStyle = '#202c3d';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 256, 256);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(9, 11);
  return texture;
}

function sign(parent, text, color, width) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#171d26';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.font = 'bold 74px monospace';
  const measured = ctx.measureText(text).width;
  if (measured > 452) ctx.font = `bold ${Math.floor(74 * 452 / measured)}px monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 67);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const surface = new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide });
  const panel = new T.Mesh(new T.PlaneGeometry(width, width / 4), surface);
  parent.add(panel);
  return panel;
}

function printedTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f3f3f3';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#747474';
  for (let row = 0; row < 13; row++) {
    for (let column = 0; column < 16; column++) {
      ctx.beginPath();
      ctx.arc(column * 8 + (row % 2) * 4, 31 + row * 8, .25 + row * .14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const result = new T.CanvasTexture(canvas);
  result.colorSpace = T.SRGBColorSpace;
  return result;
}

function yard(scene) {
  const floor = new T.Mesh(new T.PlaneGeometry(22, 28), new T.MeshStandardMaterial({ map: floorTexture() }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const paint = material(0xaf8741);
  for (let z = -11; z <= 11; z += 2.5) {
    for (const x of [-2.5, 2.5]) box(scene, x, 0.012, z, 0.09, 0.014, 1.07, paint);
  }
  for (const x of [-10.35, 10.35]) box(scene, x, 0.014, 0, 0.06, 0.015, 26.5, paint);

  for (const side of [-1, 1]) {
    box(scene, side * (bounds.x + 0.15), 1.55, 0, 0.3, 3.1, 28, dark);
    box(scene, 0, 1.55, side * (bounds.z + 0.15), 22.3, 3.1, 0.3, metal);
    box(scene, side * (bounds.x + 0.12), 3.18, 0, 0.36, .12, 28, metal);
    for (let z = -12; z <= 12; z += 4) {
      box(scene, side * 10.93, 1.75, z, 0.3, 3.5, 0.23, metal, true);
      box(scene, side * (13 + (z % 2) / 3), 2.5, z - 0.8, 2.2, 5 + Math.cos(z) * 1.8, 3.1,
        material(0x262f3e), true);
    }
    box(scene, side * 10.6, 3.95, -2.3, 0.16, 7.9, 0.16, metal);
    box(scene, side * 9.9, 7.6, -2.3, 1.4, 0.13, 0.17, metal);
    const lamp = new T.MeshStandardMaterial({ color: 0xffc173, emissive: 0xffad44, emissiveIntensity: 1.9 });
    box(scene, side * 9.2, 7.53, -2.3, 0.62, 0.12, 0.36, lamp, true);
    const glow = new T.PointLight(0xffba77, 84, 18, 2);
    glow.position.set(side * 8.8, 6, -2.3);
    scene.add(glow);
  }
  for (let x = -8; x <= 8; x += 4) {
    box(scene, x, 5.3, -16, 0.22, 10.6, 0.22, metal);
  }
  box(scene, 0, 8.3, -16, 20.4, 0.36, 0.41, metal, true);
  box(scene, 0, 10.1, -16, 20.4, 0.29, 0.35, metal, true);
  for (let x = -8; x <= 8; x += 2) {
    const brace = box(scene, x, 9.3, -16, 0.16, 2.4, 0.16, metal);
    brace.rotation.z = (x % 4 ? 1 : -1) * .68;
  }
  const name = sign(scene, 'NIGHT SHIFT  /  YARD', '#fcb46c', 5.7);
  name.position.set(0, 4.8, -13.8);

  const halftone = printedTexture();
  for (const block of cover) {
    const surface = material(block.color ?? (block.kind === 'crate' ? 0x796350 : 0x506174), halftone);
    const { x, z, w, d, h } = block;
    const shell = box(scene, x, h / 2, z, w, h, d, surface, true);
    shell.castShadow = shell.receiveShadow = true;
    if (block.kind === 'container') {
      for (let offset = -d / 2 + .26; offset < d / 2; offset += .38) {
        for (const side of [-1, 1]) box(scene, x + side * w / 2, h / 2, z + offset, .11, h * .89, .085, surface);
      }
      for (const side of [-1, 1]) {
        box(scene, x, h * .13, z + side * (d / 2 + .015), w * .9, .10, .07, dark);
        box(scene, x, h * .89, z + side * (d / 2 + .015), w * .9, .10, .07, dark);
        const label = sign(scene, block.number, '#f4d499', w * .54);
        label.position.set(x, h * .65, z + side * (d / 2 + .05));
        label.rotation.y = side === 1 ? 0 : Math.PI;
      }
    }
    if (block.kind === 'crate') {
      for (const side of [-1, 1]) {
        const brace = box(scene, x, h / 2, z + side * d / 2, w * .89, .14, .055, dark);
        brace.rotation.z = side * .36;
        box(scene, x, h - .09, z + side * d / 2, w, .15, .09, metal);
      }
    }
  }
  const door = new T.Group();
  scene.add(door);
  box(door, shutter.x, shutter.h / 2, 0, shutter.w, shutter.h, shutter.d, material(0x9e7952, halftone), 'bold').castShadow = true;
  for (let y = .22; y < shutter.h; y += .25) box(door, shutter.x, y, 0, shutter.w, .04, .22, dark);
  const doorLabel = sign(door, 'BREAK', '#ffd06a', 1.25);
  doorLabel.position.set(shutter.x, 1.54, .125);
  for (const side of [-1, 1]) box(scene, shutter.x + side * (shutter.w / 2 + .06), 1.5, 0, .13, 3, .3, paint, true);

  teams.forEach(team => {
    const color = new T.MeshBasicMaterial({ color: team.color });
    const z = team.goal.z;
    box(scene, 0, .035, z, 3.1, .06, 2.3, dark);
    for (const side of [-1, 1]) {
      box(scene, side * 1.51, .082, z, .085, .06, 2.24, color);
      box(scene, 0, .082, z + side * 1.10, 2.96, .06, .08, color);
    }
    const label = sign(scene, z > 0 ? 'ORANGE BAY' : 'BLUE BAY', team.color, 3.1);
    label.position.set(0, 2.4, Math.sign(z) * 13.91);
    label.rotation.y = z > 0 ? Math.PI : 0;
  });
  return door;
}

function makeRobot(scene, color) {
  const body = new T.Group();
  const chest = material(color);
  const face = new T.MeshBasicMaterial({ color });
  box(body, 0, 1.03, 0, .73, .61, .43, chest, 'bold').castShadow = true;
  box(body, 0, 1.56, 0, .55, .38, .40, metal, 'bold').castShadow = true;
  box(body, 0, 1.60, -.22, .42, .10, .06, face);
  box(body, 0, 1.06, .25, .35, .26, .11, dark, true);
  const legs = [-1, 1].map(side => {
    box(body, side * .42, 1.13, -.05, .18, .38, .49, dark, true);
    return box(body, side * .20, .36, 0, .23, .64, .27, metal, true);
  });
  scene.add(body);
  return { body, legs };
}

function makeTool(camera) {
  const tool = new T.Group();
  camera.add(tool);
  const shell = new T.Shape();
  const profile = [[-.27, -.083], [-.28, .052], [-.16, .128], [.28, .111], [.44, .039], [.43, -.077], [.10, -.092]];
  profile.forEach(([x, y], index) => index ? shell.lineTo(x, y) : shell.moveTo(x, y));
  shell.closePath();
  const shape = new T.ExtrudeGeometry(shell, { depth: .186, bevelEnabled: true, bevelSize: .016,
    bevelThickness: .016, bevelSegments: 1, steps: 1 });
  shape.translate(0, 0, -.093);
  const amber = material(0xd58a45);
  const casing = new T.Mesh(shape, [amber, metal]);
  casing.rotation.y = Math.PI / 2;
  casing.add(new T.LineSegments(new T.EdgesGeometry(shape, 26), ink));
  tool.add(casing);
  box(tool, 0, -.018, -.405, .203, .160, .192, metal, 'bold');
  box(tool, 0, -.025, -.535, .135, .115, .12, dark, 'bold');
  for (const offset of [-.13, -.066, 0]) box(tool, -.104, .018, offset, .032, .058, .035, signal, true);
  box(tool, 0, .148, -.225, .073, .07, .09, dark, 'bold');
  box(tool, .027, -.132, .175, .124, .20, .16, dark, 'bold');
  box(tool, .025, -.236, .245, .151, .132, .215, material(0x4c7580), 'bold');
  const muzzle = new T.Mesh(new T.OctahedronGeometry(.091), new T.MeshBasicMaterial({ color: 0xffe894 }));
  muzzle.position.set(0, -.02, -.635);
  tool.add(muzzle);
  tool.scale.setScalar(.83);
  return { tool, muzzle };
}

export function createScene(container, { directAim = false } = {}) {
  const scene = new T.Scene();
  scene.background = new T.Color(0x17283d);
  scene.fog = new T.Fog(0x26374d, 17, 46);
  new T.TextureLoader().load('/assets/night-shift-sky.jpg', texture => {
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = T.MirroredRepeatWrapping;
    texture.repeat.x = 3;
    const surface = new T.MeshBasicMaterial({ map: texture, side: T.BackSide, fog: false, toneMapped: false });
    const horizon = new T.Mesh(new T.CylinderGeometry(40, 40, 38, 48, 1, true), surface);
    horizon.position.y = 13;
    scene.add(horizon);
  });
  scene.add(new T.HemisphereLight(0xbdd9fc, 0x69544d, 1.45));
  const moon = new T.DirectionalLight(0xa9cdf9, 2.15);
  moon.position.set(-7, 13, -7);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = moon.shadow.camera.bottom = -18;
  moon.shadow.camera.right = moon.shadow.camera.top = 18;
  moon.shadow.camera.far = 42;
  moon.shadow.camera.updateProjectionMatrix();
  moon.shadow.normalBias = .038;
  scene.add(moon);
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.21;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  container.append(renderer.domElement);

  const camera = new T.PerspectiveCamera(67, 1, .05, 85);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, eyeHeight, 11.9);
  scene.add(camera);
  const door = yard(scene);
  const robots = teams.map(team => makeRobot(scene, team.color));
  const battery = new T.Group();
  scene.add(battery);
  box(battery, 0, 0, 0, .46, .65, .38, dark, 'bold');
  box(battery, 0, 0, 0, .34, .45, .44, signal, 'bold');
  box(battery, 0, .34, 0, .23, .10, .26, metal);
  const ring = new T.Mesh(new T.RingGeometry(.74, .79, 28), new T.MeshBasicMaterial({ color: 0xcdf875, side: T.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .021;
  scene.add(ring);

  const { tool, muzzle } = makeTool(camera);
  let kick = 0;
  let shake = 0;
  let shakeEnabled = !matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight, false);
  }
  window.addEventListener('resize', resize);
  resize();

  const particles = [];
  const streaks = [];
  let state = null;
  let slot = null;
  let followSeat = null;
  let lastTime = performance.now();

  function debris(position, count, surface = spark, broken = false) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const mesh = new T.Mesh(broken ? junkShape : sparkShape, surface);
      mesh.position.fromArray(position);
      scene.add(mesh);
      particles.push({ mesh, velocity: new T.Vector3(Math.sin(angle) * (1 + Math.random() * 3),
        1 + Math.random() * 3.5, Math.cos(angle) * (1 + Math.random() * 3)), life: broken ? 1.05 : .34 });
    }
  }

  function event(action) {
    if (action.type === 'shot') {
      const start = new T.Vector3(...action.origin);
      const end = new T.Vector3(...action.end);
      const line = new T.Line(new T.BufferGeometry().setFromPoints([start, end]), tracerInk);
      scene.add(line);
      streaks.push({ line, life: .065 });
      if (action.player === slot) {
        kick = 1;
        shake = Math.max(shake, 1.5);
      }
      if (action.target === slot) shake = Math.max(shake, 3.5);
      if (action.impact === 'player') debris(action.end, 10, confirmed);
      else if (action.impact !== 'miss') debris(action.end, 6, action.impact === 'wood' ? splinter : spark);
    }
    if (action.type === 'break') {
      debris([action.x, 1.2, action.z], 20, metal, true);
      const local = state?.players[slot];
      if (local && Math.hypot(local.x - action.x, local.z - action.z) < 7) shake = Math.max(shake, 4.4);
    }
    if (action.type === 'score') debris([0, .8, teams[action.player].goal.z], 24, confirmed);
  }

  renderer.setAnimationLoop(now => {
    const dt = Math.max(0, Math.min(.05, (now - lastTime) / 1000));
    lastTime = now;
    const blend = 1 - Math.exp(-26 * dt);
    const local = state?.players[slot];
    if (local) {
      const seatChanged = followSeat !== slot;
      if (seatChanged || Math.hypot(camera.position.x - local.x, camera.position.z - local.z) > 3.2) {
        camera.position.set(local.x, eyeHeight, local.z);
        camera.rotation.set(local.pitch, -local.yaw, 0);
        followSeat = slot;
      } else {
        camera.position.x += (local.x - camera.position.x) * blend;
        camera.position.z += (local.z - camera.position.z) * blend;
        if (directAim) {
          camera.rotation.set(local.pitch, -local.yaw, 0);
        } else {
          const yawGap = -local.yaw - camera.rotation.y;
          camera.rotation.y += Math.atan2(Math.sin(yawGap), Math.cos(yawGap)) * blend;
          camera.rotation.x += (local.pitch - camera.rotation.x) * blend;
        }
      }
    }
    tool.visible = local?.hp > 0;
    kick = Math.max(0, kick - dt * 8.6);
    tool.position.set(.39, -.28 + .021 * kick, -.89 + .125 * kick);
    tool.rotation.x = -.07 + .11 * kick;
    tool.rotation.y = .13;
    muzzle.visible = kick > .63;
    if (shake > 0) {
      shake = Math.max(0, shake - 29 * dt);
      // Shifting the canvas and crosshair together preserves the aim ray.
      const amount = shakeEnabled ? shake : 0;
      document.documentElement.style.setProperty('--shake-x', `${amount * Math.sin(now * .105)}px`);
      document.documentElement.style.setProperty('--shake-y', `${amount * Math.cos(now * .135)}px`);
    }
    for (const [index, { body, legs }] of robots.entries()) {
      const player = state?.players[index];
      body.visible = index !== slot && player?.hp > 0;
      if (body.visible) {
        const gap = Math.hypot(body.position.x - player.x, body.position.z - player.z);
        const mix = gap > 3 ? 1 : blend;
        body.position.x += (player.x - body.position.x) * mix;
        body.position.z += (player.z - body.position.z) * mix;
        body.rotation.y = -player.yaw;
        const swing = Math.sin(now * .019) * Math.min(.42, gap * 3);
        legs[0].rotation.x = swing;
        legs[1].rotation.x = -swing;
      }
    }
    door.visible = !state || state.shutterHP > 0;
    battery.visible = state?.battery.visible !== false && state?.battery.carrier !== slot;
    ring.visible = battery.visible && state?.battery.carrier == null;
    const pos = state?.battery ?? { x: 0, z: 0 };
    battery.position.set(pos.x, (pos.carrier == null ? .88 : 2.20) + Math.sin(now * .0038) * .11, pos.z);
    battery.rotation.y = now * .002;
    ring.position.x = pos.x;
    ring.position.z = pos.z;
    for (let i = particles.length - 1; i >= 0; i--) {
      const item = particles[i];
      item.life -= dt;
      item.velocity.y -= dt * 9.8;
      item.mesh.position.addScaledVector(item.velocity, dt);
      item.mesh.position.y = Math.max(.045, item.mesh.position.y);
      item.mesh.rotation.x += dt * 4;
      item.mesh.rotation.z += dt * 6;
      if (item.life <= 0) { item.mesh.removeFromParent(); particles.splice(i, 1); }
    }
    for (let i = streaks.length - 1; i >= 0; i--) {
      const item = streaks[i];
      item.life -= dt;
      if (item.life <= 0) { item.line.removeFromParent(); item.line.geometry.dispose(); streaks.splice(i, 1); }
    }
    renderer.render(scene, camera);
  });

  return { draw(snapshot, localSeat) { state = snapshot; slot = localSeat; }, event,
    setShake(enabled) { shakeEnabled = enabled; } };
}
