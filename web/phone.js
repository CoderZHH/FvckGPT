import { drawRoster, roomInstruction } from './room-view.js';
import { SideGripAim, topEdge } from './gyro.js';
import { makeAudio } from './audio.js';
import { openPracticeLink } from './practice-link.js';
import { ReloadFlick } from './reload-gesture.js';
import { clamp, teams } from './yard.js';
import { weapons } from './weapons.js';

const token = location.hash.slice(1);
const practice = new URLSearchParams(location.search).get('practice') === '1';
const element = id => document.getElementById(id);
const connection = element('connection');
const note = element('controller-note');
const pads = element('pads');
const move = element('move');
const look = element('look');
const trigger = element('fire');
const motionButton = element('motion');
const touchButton = element('touch-mode');
const retryButton = element('retry-pair');
const aimHelp = element('aim-help');
const settings = element('settings');
const reloadButton = element('reload');
const flickSetting = element('flick-reload');
const weaponName = element('weapon-name');
const combatStatus = element('combat-status');
const combatFeedback = element('combat-feedback');
const guide = element('onboarding');
const guideTitle = element('guide-title');
const guideHelp = element('guide-help');
const guidePermission = element('guide-permission');
const guideTouch = element('guide-touch');
const phoneMenu = element('phone-menu');
const phoneArmory = element('phone-armory');
const phoneRound = element('phone-round');
const loadouts = element('phone-loadouts');
const aim = new SideGripAim();
const reloadFlick = new ReloadFlick();
const phoneAudio = makeAudio();
const canUseMotion = isSecureContext && typeof DeviceOrientationEvent !== 'undefined';
const sensitivity = { gyro: 1.6, touch: 1.2 };
const feedback = new Map([
  ['drop', { text: '电池脱落', pattern: [32, 58, 16] }],
  ['delivery', { text: '交付成功', pattern: [18, 35, 18, 50, 55] }],
  ['damage', { text: '受击', pattern: [24, 38, 32] }],
  ['score', { text: '得分', pattern: [26, 40, 26, 40, 45] }],
  ['break', { text: '击碎', pattern: [33, 35, 20] }],
  ['hit', { text: '命中', pattern: [15, 22, 24] }],
  ['reload', { text: '换弹完成', pattern: [14, 40, 16] }],
  ['reload-start', { text: '换弹中', pattern: 23 }],
  ['pickup', { text: '拿到电池', pattern: [15, 34, 25] }],
  ['empty', { text: '弹药不足', pattern: 18 }],
  ['dash', { text: '冲刺', pattern: [12, 18, 26] }],
  ['shot', { text: '', pattern: 13 }],
]);
let socket, resend, slot, moveTouch, lookTouch;
let lateral = 0, forward = 0, yaw = 0, pitch = 0, fire = false;
let reloading = false;
let activeWeapon, ammo, capacity, reserve;
let feedbackTimer;
let lastHaptic = -Infinity;
let lastStrongHaptic = -Infinity;
let lastInputSent = -Infinity;
let paired = false;
let rejected = false;
let motionAllowed = false;
let mode = 'touch';
let sensorTimeout;
let calibrationAnchor;
let calibrationTime;
let roundPhase = 'lobby';
let activity = 'menu';
let activityMessage = '';
let room, team = 0, roomNote = '';
const roomPanel = element('phone-room');

function paintRoom() {
  roomPanel.hidden = !paired || !guide.hidden || activity !== 'room';
  element('room-entry').hidden = !!room;
  element('phone-room-live').hidden = !room;
  element('room-back').textContent = room ? '离开房间' : '返回大厅';
  element('phone-room-title').textContent = room ? `${room.size}v${room.size} · ${room.code}` : '联机房间';
  element('phone-room-status').textContent = roomNote || (room ? roomInstruction(room) : '创建房间后，把房间码发给朋友。');
  if (!room) return;
  drawRoster(element('phone-roster'), room);
  const me = room.players.find(player => player.id === room.self);
  team = me.team;
  for (const [id, index] of [['team-orange', 0], ['team-blue', 1]]) {
    element(id).disabled = team === index || room.counts[index] >= room.size;
  }
  element('room-ready').disabled = !me.connected;
  element('room-ready').textContent = me.ready ? '取消准备' : '准备';
  element('room-retry').hidden = me.connected || room.self === 0;
  element('room-retry').disabled = roomNote.includes('正在重新');
  element('room-start').hidden = room.self !== 0;
  element('room-start').disabled = !room.canStart;
}

element('copy-battle-code').addEventListener('click', async () => {
  if (!room) return;
  try {
    await navigator.clipboard.writeText(room.code);
    roomNote = `已复制 ${room.code}。让朋友在同一 Wi-Fi 下输入这个房间码。`;
  } catch {
    roomNote = `把房间码 ${room.code} 发给朋友。`;
  }
  paintRoom();
});

element('create-room').addEventListener('submit', event => {
  event.preventDefault();
  roomNote = '正在创建房间…';
  paintRoom();
  sendCommand({ type: 'room-create', size: Number(element('room-size').value) });
});
element('join-room').addEventListener('submit', event => {
  event.preventDefault();
  roomNote = '正在查找房间…';
  paintRoom();
  sendCommand({ type: 'room-join', code: element('battle-code').value.trim().toUpperCase() });
});
for (const [id, payload] of [
  ['room-ready', { type: 'room-ready' }], ['room-start', { type: 'room-start' }], ['room-retry', { type: 'room-retry' }],
  ['team-orange', { type: 'room-team', team: 0 }], ['team-blue', { type: 'room-team', team: 1 }],
]) element(id).addEventListener('click', () => sendCommand(payload));
let phoneMusic = false;
setInterval(() => phoneAudio.music(phoneMusic && !document.hidden), 110);
let sparring = false;

function setSensitivity(kind, input) {
  const value = input.valueAsNumber;
  sensitivity[kind] = value;
  const label = `${Math.round(value * 100)}%`;
  element(`${kind}-value`).textContent = label;
  input.setAttribute('aria-valuetext', label);
}

for (const kind of Object.keys(sensitivity)) {
  const input = element(`${kind}-sensitivity`);
  const key = `night-shift-sensitivity-${kind}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null && Number.isFinite(Number(saved))) input.value = saved;
  } catch {
    // Safari private sessions can deny storage. The control still works in this tab.
  }
  setSensitivity(kind, input);
  input.addEventListener('input', () => {
    setSensitivity(kind, input);
    try { localStorage.setItem(key, input.value); } catch { /* Storage is optional. */ }
  });
}

const flickSettingKey = 'night-shift-flick-reload-v2';
flickSetting.checked = true;
try { flickSetting.checked = localStorage.getItem(flickSettingKey) !== 'off'; } catch { /* Storage is optional. */ }
flickSetting.addEventListener('change', () => {
  reloadFlick.reset();
  try { localStorage.setItem(flickSettingKey, flickSetting.checked ? 'on' : 'off'); } catch { /* Storage is optional. */ }
});

element('reset-sensitivity').addEventListener('click', () => {
  for (const kind of Object.keys(sensitivity)) {
    const input = element(`${kind}-sensitivity`);
    input.value = input.defaultValue;
    input.dispatchEvent(new Event('input'));
  }
  flickSetting.checked = true;
  flickSetting.dispatchEvent(new Event('change'));
});

function renderReload() {
  reloadButton.classList.toggle('reloading', reloading);
  reloadButton.textContent = reloading ? '换弹中' : '换弹';
}

function pulse(kind, pattern) {
  if (document.hidden) return;
  const now = performance.now();
  // Let decisive outcomes through before the next regular shot pulse.
  const strong = kind !== 'shot';
  if (strong ? now - lastStrongHaptic < 145 : now - lastHaptic < 100 || now - lastStrongHaptic < 160) return;
  lastHaptic = now;
  if (strong) lastStrongHaptic = now;
  try {
    const native = window.webkit?.messageHandlers?.nightshiftHaptics;
    if (native) native.postMessage(kind);
    else navigator.vibrate?.(pattern);
  } catch {
    // Browsers without actuators still have the visible control and combat feedback.
  }
}

function showActivity() {
  if (!practice) return;
  element('round-summary').hidden = true;
  phoneMusic = false;
  const selecting = activity !== 'duel' && activity !== 'solo';
  const usable = paired && guide.hidden;
  element('operations').hidden = !usable || !selecting || activity === 'room';
  phoneMenu.hidden = pads.hidden = !usable || selecting;
  element('aim-controls').hidden = !usable || selecting;
  combatStatus.hidden = !usable || selecting;
  element('return-menu').hidden = selecting;
  phoneArmory.hidden = false;
  phoneRound.hidden = activity !== 'duel';
  element('operation-title').textContent = activity === 'results' ? '清场结束' : '选择行动';
  element('operation-status').textContent = activityMessage;
  paintRoom();
}
for (const [id, next] of [['choose-duel', 'room'], ['choose-solo', 'solo'], ['room-back', 'menu'], ['return-menu', 'menu']]) {
  element(id).addEventListener('click', () => {
    stopMove();
    stopLook();
    yaw = pitch = 0;
    sendInput(false);
    showLoadouts(false);
    sendCommand({ type: 'activity', activity: next });
  });
}

function reportCombat(data) {
  combatStatus.hidden = !guide.hidden;
  const dash = element('dash');
  dash.hidden = !practice;
  dash.disabled = data.dashWait > 0 || roundPhase === 'countdown';
  dash.textContent = data.dashWait ? `冲刺 · ${data.dashWait}s` : '冲刺';
  if (Number.isFinite(data.hp)) element('hp-count').textContent = Math.max(0, data.hp);
  if (typeof data.weapon === 'string' && data.weapon !== activeWeapon) {
    reloadFlick.reset();
    activeWeapon = data.weapon;
    ammo = capacity = reserve = undefined;
  }
  if (typeof data.weaponName === 'string' && data.weaponName) {
    weaponName.textContent = data.weaponName;
    weaponName.hidden = false;
  }
  if (typeof data.phase === 'string') roundPhase = data.phase;
  phoneMusic = data.screenAudio === false && (activity === 'solo' || (activity === 'duel' && roundPhase === 'playing'));
  if (activity === 'duel' && guide.hidden) {
    const ended = roundPhase === 'ended';
    element('round-summary').hidden = !ended;
    pads.hidden = ended;
    element('aim-controls').hidden = ended;
    combatStatus.hidden = ended;
    phoneArmory.hidden = ended;
    if (ended) {
      element('round-outcome').textContent = data.winner == null ? '平局' : data.winner === team ? '行动胜利' : '行动失利';
      element('final-score').textContent = data.score.join(' ∶ ');
      showLoadouts(false);
    }
  }
  const kitLocked = (!practice || activity === 'duel') && roundPhase === 'countdown';
  phoneArmory.disabled = kitLocked;
  if (kitLocked && !loadouts.hidden) showLoadouts(false);
  if (practice && activity !== 'duel') {
    sparring = data.sparring === true;
    phoneRound.textContent = sparring ? '结束对练' : '开始对练';
  } else {
    const matchActive = kitLocked || roundPhase === 'playing';
    phoneRound.disabled = matchActive || data.ready === true;
    phoneRound.textContent = matchActive ? '对局中' : data.ready ? '已准备' : roundPhase === 'ended' ? '返回房间' : '准备开打';
  }
  if (activity === 'duel' && Array.isArray(data.score)) {
    const score = data.score.join(' ∶ ');
    note.textContent = roundPhase === 'ended' ? `${data.winner == null ? '平局' : data.winner === team ? '胜利' : '惜败'} · ${score}` : `${teams[team].name} · ${score}`;
  }
  for (const button of loadouts.children) {
    const selected = String(button.dataset.weapon === activeWeapon);
    if (button.getAttribute('aria-pressed') !== selected) button.setAttribute('aria-pressed', selected);
  }
  if (Number.isFinite(data.ammo)) {
    ammo = Math.max(0, data.ammo);
    element('ammo-count').textContent = ammo;
    combatStatus.dataset.empty = String(ammo <= 0);
  }
  if (Number.isFinite(data.capacity)) capacity = data.capacity;
  if (Number.isFinite(data.reserve)) {
    reserve = Math.max(0, data.reserve);
    element('reserve-count').textContent = `/ ${reserve}`;
  }
  if (typeof data.reloading === 'boolean' && data.reloading !== reloading) {
    reloading = data.reloading;
    renderReload();
  }
  if (!Array.isArray(data.signals)) return;
  const kind = [...feedback.keys()].find(signal => data.signals.includes(signal));
  if (!kind) return;
  const cue = feedback.get(kind);
  pulse(kind, cue.pattern);
  if (data.screenAudio === false) {
    if (kind === 'shot' || kind === 'hit') {
      phoneAudio.event({ type: 'shot', player: slot, target: kind === 'hit' ? 1 - slot : null, weapon: activeWeapon }, slot);
    } else if (kind === 'reload' || kind === 'reload-start' || kind === 'empty') {
      const effect = kind === 'empty' ? 'dry-fire' : kind === 'reload' ? 'reload-complete' : kind;
      phoneAudio.event({ type: effect, player: slot, weapon: activeWeapon }, slot);
    } else if (['drop', 'pickup', 'score', 'delivery'].includes(kind)) {
      phoneAudio.event({ type: kind === 'delivery' ? 'score' : kind, reason: kind, player: slot }, slot);
    }
  }
  if (!cue.text) return;
  combatFeedback.textContent = cue.text;
  document.body.dataset.feedback = kind;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    combatFeedback.textContent = '';
    delete document.body.dataset.feedback;
  }, 900);
}

function isConnected() {
  return socket?.readyState === (practice ? 'open' : WebSocket.OPEN);
}

function sendCommand(message) {
  if (paired && isConnected()) socket.send(JSON.stringify(message));
}

function showLoadouts(open) {
  loadouts.hidden = !open;
  phoneArmory.setAttribute('aria-expanded', String(open));
  if (open) {
    stopMove();
    stopLook();
    sendInput(false);
  }
}

for (const weapon of Object.values(weapons)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.weapon = weapon.id;
  button.textContent = `${weapon.name} · ${weapon.capacity} 发`;
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => {
    sendCommand({ type: 'equip', weapon: weapon.id });
    showLoadouts(false);
  });
  loadouts.append(button);
}
phoneArmory.addEventListener('click', () => showLoadouts(loadouts.hidden));
phoneRound.addEventListener('click', () => sendCommand(
  activity === 'duel' ? { type: 'room-return' } : practice ? { type: 'sparring', enabled: !sparring } : { type: 'ready' },
));

function sendInput(includeAim = true, force = false) {
  if (!paired || !isConnected() || socket.bufferedAmount >= 900) return;
  const now = performance.now();
  // Keep ordinary aim samples below the room socket's message budget.
  if (includeAim && !force && now - lastInputSent < 10) return;
  if (includeAim && mode === 'motion') {
    const angle = aim.consume(1);
    yaw += angle.yaw * sensitivity.gyro;
    pitch += angle.pitch * sensitivity.gyro * .9;
  }
  const turn = includeAim ? clamp(yaw, -.7, .7) : 0;
  const tilt = includeAim ? clamp(pitch, -.45, .45) : 0;
  socket.send(JSON.stringify({ type: 'input', lateral, forward, fire, yaw: turn, pitch: tilt }));
  lastInputSent = now;
  yaw -= turn;
  pitch -= tilt;
}

function renderAim(help) {
  document.body.dataset.aim = mode;
  element('aim-controls').hidden = !paired || !guide.hidden;
  aimHelp.hidden = !paired;
  motionButton.hidden = !paired;
  motionButton.disabled = !canUseMotion || mode === 'requesting';
  touchButton.hidden = !paired || mode === 'touch' || mode === 'requesting';
  element('look-label').textContent = mode === 'motion' ? '拖动转身' : '拖动瞄准';
  if (!isSecureContext) {
    motionButton.textContent = '体感需 HTTPS';
    aimHelp.textContent = '可先用触屏。试体感时，从 HTTPS 靶场重新扫码。';
  } else if (!canUseMotion) {
    motionButton.textContent = '体感不可用';
    aimHelp.textContent = '当前浏览器未提供手机姿态数据，可以用触屏。';
  } else {
    const states = {
      touch: ['开启体感', '左手移动，右手拖动瞄准。'],
      requesting: ['正在授权', '请在 Safari 允许访问动作与方向。'],
      calibrating: ['正在校准', '充电口朝自己，手机侧立。保持对准大屏中央。'],
      motion: ['重新校准', '小幅转动手机精瞄，大幅转向用右区横拖。'],
    };
    const [label, instructions] = states[mode];
    motionButton.textContent = label;
    aimHelp.textContent = help ?? instructions;
  }
}

function setMode(next, help) {
  if (mode !== next) reloadFlick.reset();
  mode = next;
  renderAim(help);
  if (paired && isConnected()) {
    const announced = !isSecureContext ? 'insecure' : (next === 'requesting' ? 'calibrating' : next);
    socket.send(JSON.stringify({ type: 'aim-mode', mode: announced }));
  }
}

function enterController(index) {
  slot = index;
  paired = true;
  settings.hidden = true;
  retryButton.hidden = true;
  connection.textContent = practice ? '已直连电脑' : `${teams[slot].name} · 已连接`;
  document.documentElement.style.setProperty('--team', teams[slot].color);
  note.textContent = '';
  guide.hidden = false;
  pads.hidden = phoneMenu.hidden = true;
  guidePermission.hidden = !canUseMotion;
  guideTitle.textContent = canUseMotion ? '让手机对准大屏' : '手机就是手柄';
  guideHelp.textContent = canUseMotion
    ? '充电口朝自己，侧立握稳，手机顶边指向大屏中央。授权后保持握稳，手机会自动校准。'
    : '左手用摇杆移动，右手拖动转向。武器和开火都在手机上。';
  guideTouch.textContent = canUseMotion ? '先用触屏' : '开始';
  setMode('touch');
  if (canUseMotion && (motionAllowed || typeof DeviceOrientationEvent.requestPermission !== 'function')) void beginCalibration();
}

document.addEventListener('click', () => phoneAudio.unlock(), { once: true });

function leaveController() {
  paired = false;
  element('operations').hidden = element('round-summary').hidden = roomPanel.hidden = true;
  phoneMusic = false;
  activity = 'menu';
  room = undefined;
  roomNote = '';
  roomPanel.hidden = true;
  clearControls();
  reloading = false;
  renderReload();
  pads.hidden = true;
  phoneMenu.hidden = guide.hidden = true;
  showLoadouts(false);
  settings.open = false;
  settings.hidden = true;
  combatStatus.hidden = true;
  delete combatStatus.dataset.empty;
  weaponName.hidden = true;
  weaponName.textContent = '';
  activeWeapon = ammo = capacity = reserve = undefined;
  delete document.body.dataset.feedback;
  clearTimeout(feedbackTimer);
  combatFeedback.textContent = '';
  element('hp-count').textContent = '—';
  element('ammo-count').textContent = '—';
  element('reserve-count').textContent = '';
  renderAim();
}

function receive(packet) {
  if (packet.currentTarget !== socket) return;
  let data;
  try { data = JSON.parse(packet.data); } catch { return; }
  if (!data || typeof data !== 'object') return;
  if (data.type === 'activity') {
    if (activity !== data.activity) {
      stopMove();
      stopLook();
      yaw = pitch = 0;
      aim.consume(1);
      showLoadouts(false);
    }
    activity = data.activity;
    activityMessage = data.message || '';
    slot = data.slot;
    team = data.team ?? 0;
    if (activity !== 'room' && activity !== 'duel') { room = undefined; roomNote = ''; }
    note.textContent = '';
    document.documentElement.style.setProperty('--team', teams[team].color);
    showActivity();
  }
  if (data.type === 'room-state') { room = data; roomNote = ''; paintRoom(); }
  if (data.type === 'room-error' || data.type === 'room-link-note') { roomNote = data.message; paintRoom(); }
  if (data.type === 'combat') reportCombat(data);
  if (data.type === 'welcome') enterController(data.slot);
  if (data.type === 'round') {
    note.textContent = data.phase === 'playing' ? (data.carry ? '拿到电池，回己方货台。'
      : `${data.score?.[slot] ?? 0} 比 ${data.score?.[1 - slot] ?? 0}`) : '';
  }
  if (data.type === 'error') {
    rejected = true;
    connection.textContent = '配对未完成';
    note.textContent = data.message;
  }
}

function connect() {
  connection.textContent = '正在连接电脑';
  if (practice) {
    note.textContent = '正在建立局域网直连。';
    openPracticeLink({ token,
      onChannel(channel) {
        socket = channel;
        channel.addEventListener('message', receive);
        enterController(0);
      },
      onLost(reason) {
        leaveController();
        connection.textContent = reason === 'replacing' ? '控制已交接' : '直连未完成';
        note.textContent = reason === 'signaling' ? '请确认电脑上的靶场仍然打开，必要时重新扫码。'
          : '请确认两台设备连同一个 Wi-Fi，再重新连接。';
        retryButton.hidden = false;
      },
    });
    return;
  }
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'phone', token })));
  socket.addEventListener('message', receive);
  socket.addEventListener('close', event => {
    leaveController();
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

retryButton.addEventListener('click', () => {
  retryButton.hidden = true;
  connect();
});

element('dash').addEventListener('click', () => sendCommand({ type: 'dash' }));
move.addEventListener('pointerdown', event => {
  if (event.target.closest('#dash')) return;
  if (!paired || settings.open || !loadouts.hidden || moveTouch || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const rect = move.getBoundingClientRect();
  const radius = clamp(Math.min(rect.width, rect.height) * .28, 29, 53);
  moveTouch = { id: event.pointerId, x: event.clientX, y: event.clientY, radius };
  move.setPointerCapture(event.pointerId);
  move.style.setProperty('--stick-x', `${Math.max(radius, Math.min(rect.width - radius, event.clientX - rect.x))}px`);
  move.style.setProperty('--stick-y', `${Math.max(radius, Math.min(rect.height - radius, event.clientY - rect.y))}px`);
});

move.addEventListener('pointermove', event => {
  if (moveTouch?.id !== event.pointerId) return;
  const x = event.clientX - moveTouch.x;
  const y = event.clientY - moveTouch.y;
  const distance = Math.hypot(x, y);
  const deadZone = moveTouch.radius * .13;
  const push = clamp((distance - deadZone) / (moveTouch.radius - deadZone), 0, 1) ** 1.15;
  lateral = x / Math.max(1, distance) * push;
  forward = -y / Math.max(1, distance) * push;
  move.style.setProperty('--thumb-x', `${lateral * moveTouch.radius * .61}px`);
  move.style.setProperty('--thumb-y', `${-forward * moveTouch.radius * .61}px`);
  sendInput();
});

function stopMove() {
  const id = moveTouch?.id;
  moveTouch = null;
  lateral = forward = 0;
  if (id !== undefined && move.hasPointerCapture(id)) move.releasePointerCapture(id);
  for (const name of ['--stick-x', '--stick-y', '--thumb-x', '--thumb-y']) move.style.removeProperty(name);
}

look.addEventListener('pointerdown', event => {
  if (!paired || settings.open || !loadouts.hidden || lookTouch || event.target.closest('#reload') || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const shooting = Boolean(event.target.closest('#fire'));
  lookTouch = { id: event.pointerId, x: event.clientX, y: event.clientY };
  look.setPointerCapture(event.pointerId);
  if (shooting) {
    fire = true;
    trigger.classList.add('pressed');
    sendInput(true, true);
  }
});

look.addEventListener('pointermove', event => {
  if (lookTouch?.id !== event.pointerId) return;
  const gain = sensitivity.touch;
  yaw += (event.clientX - lookTouch.x) * .0135 * gain;
  if (mode !== 'motion') pitch -= (event.clientY - lookTouch.y) * .0075 * gain;
  lookTouch.x = event.clientX;
  lookTouch.y = event.clientY;
  sendInput();
});

function stopLook() {
  const id = lookTouch?.id;
  lookTouch = null;
  fire = false;
  if (id !== undefined && look.hasPointerCapture(id)) look.releasePointerCapture(id);
  trigger.classList.remove('pressed');
}

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  move.addEventListener(type, event => { if (moveTouch?.id === event.pointerId) { stopMove(); sendInput(false); } });
  look.addEventListener(type, event => { if (lookTouch?.id === event.pointerId) { stopLook(); sendInput(false); } });
}

trigger.addEventListener('click', event => {
  if (!paired || settings.open || event.detail !== 0 || lookTouch) return;
  fire = true;
  sendInput(false);
  fire = false;
  sendInput(false);
});

function requestReload() {
  if (!paired || settings.open || !loadouts.hidden || reloading) return;
  sendCommand({ type: 'reload' });
}

reloadButton.addEventListener('click', requestReload);

settings.addEventListener('toggle', () => {
  reloadFlick.reset();
  if (!settings.open) return;
  showLoadouts(false);
  stopMove();
  stopLook();
  sendInput(false);
});

pads.addEventListener('contextmenu', event => event.preventDefault());

function clearControls() {
  stopMove();
  stopLook();
  yaw = pitch = 0;
  aim.reset();
  reloadFlick.reset();
  clearTimeout(sensorTimeout);
  sendInput(false);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  clearControls();
  if (mode === 'motion') {
    calibrationAnchor = undefined;
    guide.hidden = false;
    element('operations').hidden = element('round-summary').hidden = roomPanel.hidden = true;
    guideTitle.textContent = '保持握稳，重新校准';
    guidePermission.hidden = true;
    settings.open = false;
    settings.hidden = true;
    combatStatus.hidden = true;
    showLoadouts(false);
    pads.hidden = phoneMenu.hidden = true;
    setMode('calibrating');
  }
});
window.addEventListener('pagehide', clearControls);
window.addEventListener('hashchange', () => location.reload());

function finishGuide(next) {
  clearTimeout(sensorTimeout);
  guide.hidden = true;
  settings.hidden = false;
  combatStatus.hidden = ammo === undefined;
  pads.hidden = phoneMenu.hidden = false;
  setMode(next);
  showActivity();
  sendCommand({ type: 'start' });
}

async function beginCalibration() {
  if (!paired || !canUseMotion || mode === 'requesting') return;
  element('operations').hidden = true;
  guide.hidden = false;
  guidePermission.hidden = true;
  guideTitle.textContent = '正在等待体感授权';
  clearControls();
  settings.open = false;
  settings.hidden = true;
  showLoadouts(false);
  pads.hidden = phoneMenu.hidden = true;
  setMode('requesting');
  try {
    if (!motionAllowed && typeof DeviceOrientationEvent.requestPermission === 'function'
        && await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('denied');
    motionAllowed = true;
    if (!paired || mode !== 'requesting') return;
    guideTitle.textContent = '保持握稳，自动校准';
    calibrationAnchor = undefined;
    setMode('calibrating');
    sensorTimeout = setTimeout(() => {
      if (paired && mode === 'calibrating') guideTitle.textContent = '侧立手机，顶边对准大屏';
    }, 2200);
  } catch {
    if (!paired || mode !== 'requesting') return;
    guideTitle.textContent = '体感权限尚未打开';
    guidePermission.hidden = false;
    setMode('touch');
  }
}

motionButton.addEventListener('click', beginCalibration);
guidePermission.addEventListener('click', beginCalibration);
guideTouch.addEventListener('click', () => finishGuide('touch'));

touchButton.addEventListener('click', () => {
  clearControls();
  setMode('touch');
});

window.addEventListener('deviceorientation', event => {
  if (!motionAllowed || !paired || document.hidden || mode === 'touch') return;
  const current = topEdge(event);
  if (!current) return;
  if (mode === 'calibrating') {
    const now = performance.now();
    if (current.sideUp < .5 || Math.abs(current.pitch) > .75) calibrationAnchor = undefined;
    else if (!calibrationAnchor || Math.abs(current.pitch - calibrationAnchor.pitch) > .055
      || Math.abs(Math.sin((current.yaw - calibrationAnchor.yaw) / 2)) > .028) {
      calibrationAnchor = current;
      calibrationTime = now;
    } else if (now - calibrationTime >= 320 && aim.calibrate(current)) {
      yaw = pitch = 0;
      finishGuide('motion');
    }
    return;
  }
  if (mode === 'motion') {
    const armed = flickSetting.checked && !settings.open && loadouts.hidden && !fire && !lookTouch && !reloading
      && Number.isFinite(ammo) && Number.isFinite(capacity) && ammo < capacity && (reserve === undefined || reserve > 0);
    const gesture = reloadFlick.sample(current, performance.now(), armed);
    aim.update(current, gesture.pitch);
    if (gesture.reload) requestReload();
    if (settings.open || !loadouts.hidden) aim.consume(1);
    else sendInput();
  }
});

setInterval(sendInput, 1000 / 60);
if (/^[a-f0-9]{32}$/.test(token)) connect();
else {
  connection.textContent = '等待配对';
  note.textContent = '在电脑上打开房间并点「连手机」，再扫描二维码。';
}
