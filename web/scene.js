import * as T from '/vendor/three.module.js';
import { bounds, cover, eyeHeight, shutter, teams } from './yard.js';
import { createWastelandEnvironment } from './wasteland-environment.js';
import { createArcEmitter, createWastelandFighter } from './wasteland-characters.js';
import { makeCombatEffects } from './wasteland-effects.js';

const cameraClearance = .08;
const renderProfiles = {
  smooth: { pixels: 1_000_000, density: 1, floor: .75 },
  auto: { pixels: 1_700_000, density: 1.1, floor: .80 },
  detail: { pixels: 3_400_000, density: 1.5, floor: 1 },
};

function addBackdrops(scene) {
  const loader = new T.TextureLoader();
  function mount(texture) {
    texture.colorSpace = T.SRGBColorSpace;
    const surface = new T.MeshBasicMaterial({ map: texture, side: T.BackSide, fog: false, toneMapped: false });
    const skyline = new T.Mesh(new T.CylinderGeometry(62, 62, 60, 64, 1, true), surface);
    skyline.position.y = 22;
    skyline.rotation.y = .32;
    scene.add(skyline);
  }
  loader.load('/assets/wasteland-horizon.jpg', mount, undefined, () => loader.load('/assets/night-shift-sky.jpg', mount));
}

function lightYard(scene) {
  scene.add(new T.HemisphereLight(0xd0e4d9, 0x96725d, 2.05));

  const sun = new T.DirectionalLight(0xffc091, 2.7);
  sun.position.set(-11, 15, -10);
  scene.add(sun);

  const reflected = new T.DirectionalLight(0xa6ccc9, .84);
  reflected.position.set(6, 8, 12);
  scene.add(reflected);
}

function viewLighting(scene) {
  scene.add(new T.HemisphereLight(0xd0e4d9, 0x96725d, 2.05));
  const key = new T.DirectionalLight(0xffd9b1, 2.3);
  key.position.set(-3, 5, 2);
  scene.add(key);
}

function projectedShadows(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const falloff = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
  falloff.addColorStop(0, '#161b1ac0');
  falloff.addColorStop(.55, '#161b1a71');
  falloff.addColorStop(1, '#161b1a00');
  ctx.fillStyle = falloff;
  ctx.fillRect(0, 0, 32, 32);
  const surface = new T.MeshBasicMaterial({ map: new T.CanvasTexture(canvas), transparent: true, depthWrite: false });
  const geometry = new T.PlaneGeometry(.94, .78);
  return Array.from({ length: 10 }, () => {
    const shadow = new T.Mesh(geometry, surface);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = .084;
    shadow.visible = false;
    scene.add(shadow);
    return shadow;
  });
}

function hasCameraRoom(x, z, state) {
  const intersects = block => Math.abs(x - block.x) < block.w / 2 + cameraClearance
    && Math.abs(z - block.z) < block.d / 2 + cameraClearance;
  return !cover.some(intersects) && (state.shutterHP <= 0 || !intersects(shutter));
}

function hasCoverAhead(player, state) {
  const dx = Math.sin(player.yaw);
  const dz = -Math.cos(player.yaw);
  const dy = Math.tan(player.pitch);
  const height = (player.eyeHeight ?? eyeHeight) - .24;
  for (const reach of [.36, .60, .84]) {
    const x = player.x + dx * reach;
    const z = player.z + dz * reach;
    const y = height + dy * reach;
    const overlaps = block => y < block.h && y > 0
      && Math.abs(x - block.x) < block.w / 2 + .09
      && Math.abs(z - block.z) < block.d / 2 + .09;
    if (cover.some(overlaps) || (state.shutterHP > 0 && overlaps(shutter))) return true;
    if (y < 3.1 && (Math.abs(x) >= bounds.x || Math.abs(z) >= bounds.z)) return true;
  }
  return false;
}

export function createScene(container, { directAim = false, beforeFrame } = {}) {
  const scene = new T.Scene();
  scene.background = new T.Color(0x1b3231);
  scene.fog = new T.Fog(0x6a6857, 27, 76);
  addBackdrops(scene);
  lightYard(scene);

  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  container.append(renderer.domElement);

  const camera = new T.PerspectiveCamera(67, 1, .05, 110);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, eyeHeight, teams[0].spawn.z);
  scene.add(camera);

  // Foreground hands and equipment get their own depth buffer after the world pass.
  const view = new T.Scene();
  const viewCamera = new T.PerspectiveCamera(67, 1, .06, 5);
  view.add(viewCamera);
  viewLighting(view);
  const emitter = createArcEmitter(viewCamera);

  const environment = createWastelandEnvironment(scene);
  const fighters = [];
  const fighterModels = teams.map(() => new Map());
  function assignFighters(snapshot, localSeat) {
    for (const [index, player] of snapshot.players.entries()) {
      if (!player || index === localSeat) continue;
      const models = fighterModels[player.team];
      if (!models.has(index)) models.set(index,
        createWastelandFighter(scene, teams[player.team].color, { heavy: player.team === 0 }));
      const fighter = models.get(index);
      if (fighters[index] && fighters[index] !== fighter) fighters[index].body.visible = false;
      fighters[index] = fighter;
    }
  }
  const fighterShadows = projectedShadows(scene);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const effects = makeCombatEffects(scene, { reducedMotion });
  let kick = 0;
  let shakeEnabled = !reducedMotion;
  let movement = 0;
  let state = null;
  let slot = null;
  let followSeat = null;
  let lastTime = performance.now();
  let densityCeiling = Infinity;
  let frameSamples = 0;
  let frameTime = 0;
  let quality = 'auto';

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    camera.aspect = viewCamera.aspect = width / height;
    camera.updateProjectionMatrix();
    viewCamera.updateProjectionMatrix();
    const profile = renderProfiles[quality];
    const budgetScale = Math.sqrt(profile.pixels / (width * height));
    const floor = Math.min(profile.floor, budgetScale * 1.2);
    const density = Math.max(floor, Math.min(devicePixelRatio, profile.density, budgetScale, densityCeiling));
    renderer.setPixelRatio(density);
    renderer.setSize(width, height, false);
  }
  window.addEventListener('resize', resize);
  resize();

  function event(action) {
    if (action.type === 'shot') {
      if (action.player === slot) kick = 1;
      else fighters[action.player]?.fire();
      const hits = new Map();
      for (const impact of action.impacts ?? []) {
        if (impact.target == null || impact.target === slot || !impact.damage) continue;
        const previous = hits.get(impact.target);
        hits.set(impact.target, { end: impact.end, damage: impact.damage + (previous?.damage ?? 0) });
      }
      for (const [id, hit] of hits) {
        const target = state?.players[id];
        if (!target) continue;
        const side = (hit.end[0] - target.x) * Math.cos(target.yaw)
          + (hit.end[2] - target.z) * Math.sin(target.yaw);
        fighters[id]?.hit(hit.damage, side);
      }
    }
    effects.emit(action, slot);
  }

  renderer.setAnimationLoop(now => {
    const interval = now - lastTime;
    const dt = Math.max(0, Math.min(.05, interval / 1000));
    lastTime = now;
    if (beforeFrame?.(dt) === false) return;
    if (quality === 'auto' && interval > 0 && interval < 180 && renderer.getPixelRatio() > .81) {
      frameTime += interval;
      if (++frameSamples === 48) {
        if (frameTime / frameSamples > 20) {
          densityCeiling = Math.max(.80, renderer.getPixelRatio() * .9);
          resize();
        }
        frameSamples = frameTime = 0;
      }
    }
    const blend = 1 - Math.exp(-26 * dt);
    const local = state?.players[slot];
    if (local) {
      const gap = Math.hypot(camera.position.x - local.x, camera.position.z - local.z);
      const resetCamera = followSeat !== slot || gap > 3.2;
      const targetHeight = Number.isFinite(local.eyeHeight) ? local.eyeHeight : eyeHeight;
      const mix = resetCamera || directAim ? 1 : blend;
      const x = T.MathUtils.lerp(camera.position.x, local.x, mix);
      const z = T.MathUtils.lerp(camera.position.z, local.z, mix);
      if (hasCameraRoom(x, z, state)) camera.position.set(x, camera.position.y, z);
      else camera.position.set(local.x, camera.position.y, local.z);
      camera.position.y = T.MathUtils.lerp(camera.position.y, targetHeight, mix);
      camera.rotation.set(local.pitch, -local.yaw, 0);
      followSeat = slot;
      const stride = resetCamera || !dt ? 0 : Math.min(1, gap * mix / dt / 5.5);
      movement += (stride - movement) * blend;
    }
    emitter.tool.visible = local?.hp > 0;
    emitter.animate({ time: now, kick, dt,
      movement: reducedMotion ? 0 : movement,
      recoilEnabled: shakeEnabled && !reducedMotion,
      weapon: local?.weapon,
      ammo: local?.ammo,
      reloading: local?.reloading ?? false,
      reloadProgress: local?.reloadProgress ?? 0,
      nearWall: local && hasCoverAhead(local, state) });
    kick = Math.max(0, kick - dt * 7.8);

    for (const [index, fighter] of fighters.entries()) {
      if (!fighter) continue;
      const player = state?.players[index];
      const { body } = fighter;
      const visible = index !== slot && !!player;
      const shadow = fighterShadows[index];
      if (visible) {
        const gap = Math.hypot(body.position.x - player.x, body.position.z - player.z);
        const snap = !body.visible || gap > 3;
        const mix = snap ? 1 : blend;
        const oldX = body.position.x, oldZ = body.position.z;
        const x = T.MathUtils.lerp(body.position.x, player.x, mix);
        const z = T.MathUtils.lerp(body.position.z, player.z, mix);
        if (hasCameraRoom(x, z, state)) body.position.set(x, 0, z);
        else body.position.set(player.x, 0, player.z);
        body.rotation.y = -player.yaw;
        fighter.animate({ time: now, dt, pitch: player.pitch, carrying: state.battery.carrier === index,
          reloading: player.reloading, down: player.hp <= 0, reset: snap, reducedMotion,
          velocityX: snap || !dt ? 0 : (body.position.x - oldX) / dt,
          velocityZ: snap || !dt ? 0 : (body.position.z - oldZ) / dt });
        shadow.position.x = body.position.x;
        shadow.position.z = body.position.z;
      }
      body.visible = visible;
      shadow.visible = visible;
    }
    environment.update(state, now, slot);
    effects.step(dt);
    renderer.render(scene, camera);
    if (emitter.tool.visible) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(view, viewCamera);
      renderer.autoClear = true;
    }
  });

  // Compile the two render passes before the first fast turn or loadout change.
  void renderer.compileAsync(scene, camera).catch(() => {});
  void renderer.compileAsync(view, viewCamera).catch(() => {});

  return {
    draw(snapshot, localSeat) { state = snapshot; slot = localSeat; assignFighters(snapshot, localSeat); },
    setAim(yaw, pitch) {
      const local = state?.players[slot];
      if (local) Object.assign(local, { yaw, pitch });
    },
    event,
    setShake(enabled) { shakeEnabled = enabled; },
    setQuality(value) {
      if (!Object.hasOwn(renderProfiles, value) || value === quality) return;
      quality = value;
      densityCeiling = Infinity;
      frameTime = frameSamples = 0;
      resize();
    },
  };
}
