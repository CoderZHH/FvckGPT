import { SideGripAim, topEdge } from './gyro.js';
import { teams } from './yard.js';

const token = location.hash.slice(1);
const element = id => document.getElementById(id);
const connection = element('connection');
const note = element('controller-note');
const pads = element('pads');
const move = element('move');
const look = element('look');
const trigger = element('fire');
const motionButton = element('motion');
const touchButton = element('touch-mode');
const aimHelp = element('aim-help');
const aim = new SideGripAim();
const canUseMotion = isSecureContext && typeof DeviceOrientationEvent !== 'undefined';
let socket, resend, slot, moveTouch, lookTouch;
let lateral = 0, forward = 0, yaw = 0, pitch = 0, fire = false;
let paired = false;
let rejected = false;
let motionAllowed = false;
let mode = 'touch';
let pose = null;
let sensorTimeout;

function sendInput(includeAim = true) {
  if (!paired || socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount >= 4000) return;
  const motion = includeAim && mode === 'motion' ? aim.consume() : { yaw: 0, pitch: 0 };
  socket.send(JSON.stringify({ type: 'input', lateral, forward, fire,
    yaw: includeAim ? yaw + motion.yaw : 0, pitch: includeAim ? pitch + motion.pitch : 0 }));
  if (includeAim) yaw = pitch = 0;
}

function renderAim(help) {
  document.body.dataset.aim = mode;
  aimHelp.hidden = !paired;
  motionButton.hidden = !paired;
  motionButton.disabled = !canUseMotion || mode === 'requesting';
  touchButton.hidden = !paired || mode === 'touch' || mode === 'requesting';
  element('look-label').textContent = mode === 'motion' ? '拖动转身' : '拖动瞄准';
  if (!isSecureContext) {
    motionButton.textContent = '体感需 HTTPS';
    aimHelp.textContent = '当前是普通 HTTP，Safari 无法读取体感。可先用触屏，或扫描可信 HTTPS 房间的二维码。';
  } else if (!canUseMotion) {
    motionButton.textContent = '体感不可用';
    aimHelp.textContent = '当前浏览器未提供手机姿态数据，可以用触屏。';
  } else {
    const states = {
      touch: ['开启体感', '点「开启体感」并授权，就能转动手机瞄准。'],
      requesting: ['正在授权', '请在 Safari 允许访问动作与方向。'],
      calibrating: ['校准准星', '充电口朝自己，手机侧立。顶边指向显示器中央，点「校准准星」。'],
      motion: ['重新校准', '转手机瞄准，左手摇杆移动，右手按开火。快速转身时可拖动右区。'],
    };
    const [label, instructions] = states[mode];
    motionButton.textContent = label;
    aimHelp.textContent = help ?? instructions;
  }
}

function setMode(next, help) {
  mode = next;
  renderAim(help);
  if (paired && socket?.readyState === WebSocket.OPEN) {
    const announced = !isSecureContext ? 'insecure' : (next === 'requesting' ? 'calibrating' : next);
    socket.send(JSON.stringify({ type: 'aim-mode', mode: announced }));
  }
}

function connect() {
  connection.textContent = '正在连接电脑';
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'phone', token })));
  socket.addEventListener('message', packet => {
    const data = JSON.parse(packet.data);
    if (data.type === 'welcome') {
      slot = data.slot;
      paired = true;
      pads.hidden = false;
      connection.textContent = `${teams[slot].name} · 已连接`;
      document.documentElement.style.setProperty('--orange', teams[slot].color);
      note.textContent = '在电脑上准备开打。';
      setMode(motionAllowed && mode !== 'touch' ? 'calibrating' : 'touch');
    }
    if (data.type === 'round') {
      note.textContent = data.phase === 'playing' ? (data.carry ? '拿到电池，回己方货台。'
        : `${data.score[slot]} 比 ${data.score[1 - slot]} · ${data.hp} 格生命`) : '在电脑上准备下一局。';
    }
    if (data.type === 'error') {
      rejected = true;
      connection.textContent = '配对未完成';
      note.textContent = data.message;
    }
  });
  socket.addEventListener('close', event => {
    paired = false;
    clearControls();
    pads.hidden = true;
    renderAim();
    if (event.code === 4001) {
      connection.textContent = '控制已交接';
      note.textContent = '另一部手机已接管。需要切回来时，重新扫描电脑上的二维码。';
      return;
    }
    if (!rejected) {
      connection.textContent = '正在重连';
      note.textContent = '请保持手机与电脑在同一 Wi-Fi。';
      clearTimeout(resend);
      resend = setTimeout(connect, 1200);
    }
  });
}

move.addEventListener('pointerdown', event => {
  if (moveTouch) return;
  const rect = move.getBoundingClientRect();
  const radius = Math.min(rect.width * .28, 53);
  moveTouch = { id: event.pointerId, x: event.clientX, y: event.clientY, radius };
  move.setPointerCapture(event.pointerId);
  move.style.setProperty('--stick-x', `${Math.max(radius, Math.min(rect.width - radius, event.clientX - rect.x))}px`);
  move.style.setProperty('--stick-y', `${Math.max(radius, Math.min(rect.height - radius, event.clientY - rect.y))}px`);
});

move.addEventListener('pointermove', event => {
  if (moveTouch?.id !== event.pointerId) return;
  const x = event.clientX - moveTouch.x;
  const y = event.clientY - moveTouch.y;
  const reach = Math.max(moveTouch.radius, Math.hypot(x, y));
  lateral = x / reach;
  forward = -y / reach;
  move.style.setProperty('--thumb-x', `${lateral * moveTouch.radius * .61}px`);
  move.style.setProperty('--thumb-y', `${-forward * moveTouch.radius * .61}px`);
});

function stopMove() {
  moveTouch = null;
  lateral = forward = 0;
  for (const name of ['--stick-x', '--stick-y', '--thumb-x', '--thumb-y']) move.style.removeProperty(name);
}

look.addEventListener('pointerdown', event => {
  if (lookTouch) return;
  const shooting = Boolean(event.target.closest('#fire'));
  lookTouch = { id: event.pointerId, x: event.clientX, y: event.clientY, shooting };
  look.setPointerCapture(event.pointerId);
  if (shooting) {
    fire = true;
    trigger.classList.add('pressed');
    navigator.vibrate?.(22);
    sendInput(false);
  }
});

look.addEventListener('pointermove', event => {
  if (lookTouch?.id !== event.pointerId) return;
  if (mode !== 'motion' || !lookTouch.shooting) {
    yaw += (event.clientX - lookTouch.x) * .007;
    if (mode !== 'motion') pitch -= (event.clientY - lookTouch.y) * .006;
  }
  lookTouch.x = event.clientX;
  lookTouch.y = event.clientY;
});

function stopLook() {
  lookTouch = null;
  fire = false;
  trigger.classList.remove('pressed');
}

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  move.addEventListener(type, event => { if (moveTouch?.id === event.pointerId) { stopMove(); sendInput(false); } });
  look.addEventListener(type, event => { if (lookTouch?.id === event.pointerId) { stopLook(); sendInput(false); } });
}

trigger.addEventListener('click', event => {
  if (event.detail !== 0 || lookTouch) return;
  fire = true;
  sendInput(false);
  fire = false;
  sendInput(false);
});
pads.addEventListener('contextmenu', event => event.preventDefault());

function clearControls() {
  stopMove();
  stopLook();
  yaw = pitch = 0;
  aim.reset();
  pose = null;
  clearTimeout(sensorTimeout);
  sendInput(false);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  clearControls();
  if (mode === 'motion') setMode('calibrating');
});
window.addEventListener('pagehide', clearControls);
window.addEventListener('hashchange', () => location.reload());

motionButton.addEventListener('click', async () => {
  if (!paired || !canUseMotion || mode === 'requesting') return;
  if (mode === 'motion' || mode === 'calibrating') {
    if (!pose) {
      renderAim('还没有收到体感数据。轻轻转动手机，再点校准。');
      return;
    }
    if (!aim.calibrate(pose)) {
      renderAim('请让手机侧立，充电口朝自己，顶边对准大屏，再点校准。');
      return;
    }
    clearTimeout(sensorTimeout);
    yaw = pitch = 0;
    setMode('motion');
    return;
  }
  setMode('requesting');
  try {
    if (!motionAllowed && typeof DeviceOrientationEvent.requestPermission === 'function'
        && await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('denied');
    motionAllowed = true;
    setMode('calibrating');
    sensorTimeout = setTimeout(() => {
      if (paired && mode === 'calibrating' && !pose) renderAim('Safari 还没返回体感数据。转动手机后再点校准。');
    }, 2000);
  } catch {
    setMode('touch', 'Safari 未授予体感权限。可以再次点「开启体感」。');
  }
});

touchButton.addEventListener('click', () => {
  clearControls();
  setMode('touch');
});

window.addEventListener('deviceorientation', event => {
  if (!motionAllowed || !paired || document.hidden || mode === 'touch') return;
  const current = topEdge(event);
  if (!current) return;
  const firstPose = !pose;
  pose = current;
  if (firstPose && mode === 'calibrating') renderAim();
  if (mode === 'motion') aim.update(current);
});

setInterval(sendInput, 1000 / 60);
if (/^[a-f0-9]{32}$/.test(token)) connect();
else {
  connection.textContent = '等待配对';
  note.textContent = '在电脑上打开房间并点「连手机」，再扫描二维码。';
}
