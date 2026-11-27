import { makeAudio } from './audio.js';
import { createScene } from './scene.js';
import { roundSeconds, teams } from './yard.js';

const element = id => document.getElementById(id);
const arena = element('arena');
const ready = element('ready');
const pairing = element('pairing');
const stage = element('stage-title');
const note = element('stage-note');
const lobby = element('lobby');
const toast = element('toast');
const audio = makeAudio();
const keys = new Set();
const controlKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const aimModeLabel = {
  touch: '手机已连 · 触屏',
  calibrating: '手机已连 · 等待校准',
  motion: '手机已连 · 体感',
  insecure: '手机已连 · 体感需 HTTPS',
};
let scene, socket, state, slot, retry, toastTimer;
let connectionError = false;
let phone = false;
let phoneMode, pairingProtocol;
let fire = false;
let yaw = 0;
let pitch = 0;
let lastPhase;
const savedShake = sessionStorage.getItem('nightshift-shake');
let shakeEnabled = savedShake ? savedShake === 'on' : !matchMedia('(prefers-reduced-motion: reduce)').matches;

try { scene = createScene(arena); }
catch {
  stage.textContent = '游戏画面无法启动';
  note.textContent = '请用支持 WebGL 2 的桌面浏览器打开房间。';
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 8000) socket.send(JSON.stringify(message));
}

function connect() {
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  socket.addEventListener('open', () => {
    connectionError = false;
    send({ type: 'screen', key: sessionStorage.getItem('nightshift-screen') });
  });
  socket.addEventListener('message', packet => {
    const data = JSON.parse(packet.data);
    if (data.type === 'welcome') {
      slot = data.slot;
      sessionStorage.setItem('nightshift-screen', data.key);
      element('pair').disabled = false;
      if (!phone && (!state || state.phase === 'lobby')) pairing.hidden = false;
    }
    if (data.type === 'welcome' || data.type === 'pairing') {
      element('room-url').value = data.lan;
      element('qr').src = data.qr;
      element('pair-url').href = data.pairURL;
      pairingProtocol = new URL(data.pairURL).protocol;
      updatePairingStatus();
    }
    if (data.type === 'seats') {
      for (const [index, seat] of data.seats.entries()) {
        const id = index === 0 ? 'seat-a' : 'seat-b';
        element(id).querySelector('b').textContent = index === slot ? `${teams[index].name} · 你` : teams[index].name;
        element(id).querySelector('small').textContent = seat.screen
          ? (seat.phone ? aimModeLabel[seat.aimMode] ?? '手机已连接' : '电脑已加入') : '等待加入';
      }
      const paired = !!data.seats[slot]?.phone;
      if (paired && !phone) {
        pairing.hidden = true;
        clearInputs();
        if (document.pointerLockElement) document.exitPointerLock();
        showToast('手机已连接');
      }
      if (!paired && phone) showToast('手机已断开，可重新扫码');
      phone = paired;
      const nextMode = data.seats[slot]?.aimMode;
      if (nextMode === 'motion' && phoneMode !== 'motion') showToast('手机体感已校准');
      phoneMode = nextMode;
      updatePairingStatus();
    }
    if (data.type === 'state' && slot != null) display(data);
    if (data.type === 'error') {
      connectionError = true;
      lobby.hidden = false;
      stage.textContent = '无法加入';
      note.textContent = data.message;
      ready.disabled = true;
      pairing.hidden = true;
    }
  });
  socket.addEventListener('close', event => {
    slot = undefined;
    clearInputs();
    ready.disabled = true;
    element('pair').disabled = true;
    if (connectionError) return;
    lobby.hidden = false;
    if (event.code === 4001) {
      stage.textContent = '画面已切换';
      note.textContent = '房间已在另一个标签页打开。';
      return;
    }
    stage.textContent = '正在重连';
    note.textContent = '请确认开房的电脑还在运行。';
    clearTimeout(retry);
    retry = setTimeout(connect, 1300);
  });
}

function updatePairingStatus() {
  element('pair-status').textContent = phone ? aimModeLabel[phoneMode] ?? '手机已连接'
    : (pairingProtocol === 'http:' ? '扫码用触屏，体感需 HTTPS' : '同一 Wi-Fi 下用相机扫码');
}

function showToast(text, duration = 1450) {
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, duration);
}

function display(data) {
  state = data;
  const player = data.players[slot];
  if (!player || !scene) return;
  const playing = data.phase === 'playing';
  const countdown = data.phase === 'countdown';
  const ended = data.phase === 'ended';
  scene.draw(data, slot);
  element('score-a').textContent = data.score[0];
  element('score-b').textContent = data.score[1];
  const seconds = playing ? data.remaining : (ended ? 0 : roundSeconds);
  element('clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  lobby.hidden = playing || countdown;
  ready.disabled = player.ready;
  ready.textContent = player.ready ? '已准备，等对手' : (ended ? '再来一局' : '准备开打');
  stage.textContent = ended ? (data.winner == null ? '平局' : (data.winner === slot ? '这局赢了' : '这局输了')) : '夜班货场';
  note.textContent = ended ? `${teams[0].name} ${data.score[0]}  ·  ${teams[1].name} ${data.score[1]}` : '抢到电池，送回己方货台。90 秒内先拿两分获胜。';
  element('crosshair').hidden = player.hp === 0 || countdown || ended;
  element('hud-foot').hidden = !playing;
  for (const [index, bar] of Array.from(element('health').children).entries()) bar.classList.toggle('lost', index >= player.hp);
  element('objective').textContent = data.paused ? '等待对手重连' : (player.respawn ? `${player.respawn} 秒后复活`
    : (data.battery.carrier === slot ? '带回你的货台' : (data.battery.carrier != null ? '对手拿了电池' : '去中央拿电池')));

  if (data.paused) showToast('等待对手重连', 150);
  else if (countdown) showToast(`${data.remaining}`, 150);
  if (playing && lastPhase !== 'playing') {
    pairing.hidden = true;
    showToast('抢占中央电池');
  }
  if (ended && lastPhase !== 'ended' && document.pointerLockElement) document.exitPointerLock();
  lastPhase = data.phase;
  for (const event of data.events) {
    scene.event(event);
    audio.event(event, slot, player);
    if (event.type === 'pickup' && event.player === slot) showToast('拿到电池，回己方货台');
    if (event.type === 'score') showToast(`${teams[event.player].name}得分`);
    if (event.type === 'shot' && event.target === slot) blink('flash', 'active', 80);
    if (event.type === 'shot' && event.player === slot && event.target != null) blink('hit', null, 110);
  }
  audio.music(playing && !data.paused);
}

const effectTimers = new Map();
function blink(id, className, duration) {
  const node = element(id);
  clearTimeout(effectTimers.get(id));
  if (className) node.classList.add(className);
  else node.hidden = false;
  effectTimers.set(id, setTimeout(() => {
    if (className) node.classList.remove(className);
    else node.hidden = true;
  }, duration));
}

function clearInputs() {
  keys.clear();
  fire = false;
  yaw = pitch = 0;
}

element('pair').disabled = true;
element('pair').addEventListener('click', () => {
  pairing.hidden = !pairing.hidden;
  if (!pairing.hidden) send({ type: 'pairing' });
});
element('close-pair').addEventListener('click', () => { pairing.hidden = true; });
element('room-url').addEventListener('focus', event => event.target.select());
element('sound').addEventListener('click', event => {
  const muted = audio.toggle();
  event.target.textContent = muted ? '打开声音' : '静音';
  event.target.setAttribute('aria-pressed', String(muted));
});
function updateShake() {
  element('shake').setAttribute('aria-pressed', String(shakeEnabled));
  scene?.setShake(shakeEnabled);
}
element('shake').addEventListener('click', () => {
  shakeEnabled = !shakeEnabled;
  sessionStorage.setItem('nightshift-shake', shakeEnabled ? 'on' : 'off');
  updateShake();
});
updateShake();
ready.addEventListener('click', () => { audio.unlock(); send({ type: 'ready' }); });
arena.addEventListener('pointerdown', () => {
  audio.unlock();
  if (phone) return;
  if (document.pointerLockElement !== arena) {
    try { arena.requestPointerLock()?.catch(() => showToast('鼠标锁定不可用，可用手机扫码')); }
    catch { showToast('鼠标锁定不可用，可用手机扫码'); }
  } else {
    fire = true;
    sendInput();
  }
});
window.addEventListener('pointerup', () => { fire = false; sendInput(); });
window.addEventListener('keydown', event => {
  if (document.activeElement?.matches('input, button') || !controlKeys.has(event.code) || phone) return;
  event.preventDefault();
  keys.add(event.code);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', clearInputs);
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) clearInputs(); });
window.addEventListener('mousemove', event => {
  if (document.pointerLockElement !== arena || phone) return;
  yaw += event.movementX * .0032;
  pitch -= event.movementY * .0032;
});

function sendInput() {
  if (slot == null || phone) return;
  const held = (...codes) => Number(codes.some(code => keys.has(code)));
  send({ type: 'input', lateral: held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft'),
    forward: held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown'), yaw, pitch, fire });
  yaw = pitch = 0;
}

setInterval(sendInput, 1000 / 50);
if (scene) connect();
