import { drawRoster, roomInstruction } from './room-view.js';
import { matchRoom } from './relay-session.js';
import { makeAudio } from './audio.js';
import { combatFeedback } from './combat-feedback.js';
import { createScene } from './scene.js';
import { openPracticeLink } from './practice-link.js';
import { YardDrill } from './yard-drill.js';
import { defaultWeapon, getWeapon, weapons } from './weapons.js';
import { maxHealth, roundSeconds, teams } from './yard.js';

const practice = location.pathname !== '/duel';
const element = id => document.getElementById(id);
const arena = element('arena');
const ready = element('ready');
const pairing = element('pairing');
const stage = element('stage-title');
const note = element('stage-note');
const lobby = element('lobby');
const toast = element('toast');
const sparring = element('sparring');
const objective = element('objective');
const healthPoints = element('health-points');
const healthMeter = element('health-meter');
const controlPanel = element('control-panel');
const mouseSlider = element('mouse-sensitivity');
const qualityPicker = element('quality');
const ammoReadout = element('ammo');
const reserveReadout = element('reserve');
const weaponReadout = element('weapon-name');
const armory = element('armory');
const armoryPanel = element('armory-panel');
const armoryOptions = element('loadout-options');
const weaponIds = Object.keys(weapons);
const weaponRoles = { carbine: '中距离短连发', scatter: '近距离散射', pulse: '远距离单点' };
const reloadGauge = element('reload-progress');
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
let practiceMatch, practiceLink, practiceChannel;
let lastPracticeCombat = '';
let lastScreenAudio;
let practiceMusic = false;
let connectionError = false;
let phone = false;
let phoneMode, pairingProtocol;
let fire = false;
let reload = false;
let yaw = 0;
let pitch = 0;
let lastPhase;
const savedShake = sessionStorage.getItem('nightshift-shake');
let shakeEnabled = savedShake !== 'off';
const storedMouseScale = Number(localStorage.getItem('nightshift-mouse-scale'));
if (storedMouseScale >= .35 && storedMouseScale <= 2.5) mouseSlider.value = storedMouseScale;
const storedQuality = localStorage.getItem('nightshift-quality');
if ([...qualityPicker.options].some(option => option.value === storedQuality)) qualityPicker.value = storedQuality;
healthMeter.max = maxHealth;
for (const id of weaponIds) {
  const weapon = getWeapon(id);
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.weapon = id;
  const name = document.createElement('b');
  name.textContent = weapon.name;
  const description = document.createElement('small');
  description.textContent = `${weaponRoles[id]} · ${weapon.capacity} 发 / 弹匣`;
  button.append(name, description);
  button.addEventListener('click', () => selectWeapon(id));
  armoryOptions.append(button);
}

try { scene = createScene(arena, { directAim: practice, beforeFrame: practice ? drawPractice : undefined }); }
catch {
  stage.textContent = '游戏画面无法启动';
  note.textContent = '请用支持 WebGL 2 的桌面浏览器打开房间。';
}
scene?.setQuality(qualityPicker.value);

function send(message) {
  if (practiceMatch) {
    if (message.type === 'input') practiceMatch.control(0, message);
    if (message.type === 'pairing') practiceLink?.requestInvite();
    return;
  }
  if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 8000) socket.send(JSON.stringify(message));
}

function showInvite(data) {
  element('room-url').value = practice ? data.pairURL : data.lan;
  element('qr').src = data.qr;
  element('qr').hidden = false;
  element('pair-url').href = data.pairURL;
  pairingProtocol = new URL(data.pairURL).protocol;
  updatePairingStatus();
}

let relay;
let activity = 'menu';
let soloTime = 0, soloPoints = 0, streak = 0;
let battleRoom;

function presentActivity(next, message = '') {
  activity = next;
  if (next !== 'solo') { practiceMusic = false; audio.music(false); }
  lastPracticeCombat = '';
  lastPhase = undefined;
  document.body.dataset.activity = next;
  const menu = next === 'menu' || next === 'room' || next === 'results';
  lobby.hidden = !menu;
  element('screen-room').hidden = next !== 'room' || !battleRoom;
  ready.hidden = true;
  sparring.hidden = true;
  document.querySelector('.keyboard').hidden = true;
  document.querySelector('.scoreboard').hidden = next !== 'duel';
  element('crosshair').hidden = element('hud-foot').hidden = menu;
  const titles = { menu: '夜班货场', room: '联机房间', solo: '单人 · 限时清场', duel: '断电争夺', results: '清场结束' };
  stage.textContent = titles[next];
  note.textContent = message || (phone ? '请在手机上选择行动。' : '用手机扫码，选择单人挑战或局域网联机。');
  element('game-mode').textContent = titles[next];
  if (practiceChannel?.readyState === 'open') practiceChannel.send(JSON.stringify({ type: 'activity', activity, slot, team: battleRoom?.players.find(player => player.id === slot)?.team ?? 0, message }));
}

function chooseActivity(next, message = '') {
  if (next === 'room' && relay) return;
  relay?.close();
  relay = null;
  battleRoom = undefined;
  slot = 0;
  armory.disabled = false;
  practiceMatch.setSparring(next === 'solo');
  clearInputs();
  presentActivity(next, message);
  if (next === 'solo') {
    soloTime = 60;
    soloPoints = streak = 0;
    startPracticeAudio();
  }
  if (next === 'room') {
    note.textContent = '请在手机上创建房间，或输入朋友发来的房间码。';
    relay = matchRoom({
      onRoom(room) {
        battleRoom = room;
        slot = room.self;
        const next = room.phase === 'match' ? 'duel' : 'room';
        if (activity !== next) presentActivity(next);
        if (next === 'room') {
          element('screen-room').hidden = false;
          stage.textContent = `${room.size}v${room.size} 房间 · ${room.code}`;
          note.textContent = roomInstruction(room);
          drawRoster(element('screen-roster'), room);
        }
        phoneRoom(room);
      },
      onFrame(frame, index) {
        slot = index;
        if (activity !== 'duel') return;
        display(frame);
        publishPracticeCombat(frame, frame.players[index]);
      },
      onError(message, closed) {
        if (closed) chooseActivity('menu', message);
        else phoneRoom({ type: 'room-error', message });
        note.textContent = message;
      },
      onLink(message) {
        phoneRoom({ type: 'room-link-note', message });
        if (activity === 'room') note.textContent = message || (battleRoom ? roomInstruction(battleRoom) : '');
      },
    });
  }
}

function phoneRoom(data) {
  if (practiceChannel?.readyState !== 'open') return;
  practiceChannel.send(JSON.stringify({ type: 'room-state', ...data }));
}

function startPractice() {
  document.body.classList.add('practice');
  lobby.setAttribute('aria-label', '行动大厅');
  document.querySelector('.seats').hidden = true;
  document.querySelector('label[for="room-url"]').textContent = '手机手柄链接';
  element('room-url').setAttribute('aria-label', '手机手柄链接');
  slot = 0;
  practiceMatch = new YardDrill();
  element('pair').disabled = false;
  element('switch-mode').hidden = true;
  document.title = '夜班货场 · 行动大厅';
  presentActivity('menu');
  connectPractice();
}

function drawPractice(dt) {
  if (!practiceMatch) return;
  if (relay) return activity === 'duel';
  if (activity !== 'solo') return false;
  practiceMatch.step(dt);
  const snapshot = practiceMatch.snapshot();
  snapshot.battery.visible = false;
  const player = snapshot.players[slot];
  scene.draw(snapshot, slot);
  showCombatStatus(player);
  publishPracticeCombat(snapshot, player);
  const crosshair = element('crosshair');
  if (crosshair.hidden !== (player.hp === 0)) crosshair.hidden = player.hp === 0;
  soloTime = Math.max(0, soloTime - dt);
  for (const event of snapshot.events) {
    if (event.type !== 'shot') continue;
    if (event.target === 0 || (event.player === 0 && event.target == null)) streak = 0;
    if (event.player === 0 && event.target === 1) soloPoints += event.damage * Math.min(4, ++streak);
  }
  if (!soloTime) {
    const best = Math.max(Number(localStorage.getItem('yard-solo-best')) || 0, soloPoints);
    localStorage.setItem('yard-solo-best', best);
    chooseActivity('results', `得分 ${soloPoints} · 本机纪录 ${best}`);
    return;
  }
  const instruction = `${Math.ceil(soloTime)} 秒 · ${soloPoints} 分 · 连击 ×${Math.min(streak, 4)}`;
  if (objective.textContent !== instruction) objective.textContent = instruction;
  renderEffects(snapshot, player);
  audio.music(practiceMusic);
}

function connectPractice() {
  element('qr').hidden = true;
  element('pair-url').removeAttribute('href');
  element('room-url').value = '';
  element('pair-status').textContent = '正在生成配对二维码…';
  practiceLink = openPracticeLink({
    onInvite(data) {
      showInvite(data);
      if (!phone) pairing.hidden = false;
    },
    onChannel(channel) {
      phone = true;
      document.body.classList.add('phone-linked');
      practiceChannel = channel;
      lastPracticeCombat = '';
      clearInputs();
      practiceMatch.release(slot);
      if (document.pointerLockElement) document.exitPointerLock();
      chooseActivity('menu');
      pairing.hidden = true;
      showToast('手机已直连');
      updatePairingStatus();
      channel.addEventListener('message', packet => {
        let data;
        try { data = JSON.parse(packet.data); } catch { return; }
        if (data?.type === 'activity' && ['menu', 'solo', 'room'].includes(data.activity)) {
          chooseActivity(data.activity);
          return;
        }
        if (relay) { relay.command(data); return; }
        if (activity !== 'solo' && data?.type !== 'aim-mode') return;
        if (data?.type === 'input') practiceMatch.control(slot, data);
        if (data?.type === 'dash') practiceMatch.dash(slot);
        if (data?.type === 'reload') practiceMatch.reload(slot);
        if (data?.type === 'equip') selectWeapon(data.weapon);
        if (data?.type === 'start') startPracticeAudio();
        if (data?.type === 'sparring' && typeof data.enabled === 'boolean') setSparring(data.enabled);
        if (data?.type === 'aim-mode' && Object.hasOwn(aimModeLabel, data.mode)) {
          phoneMode = data.mode;
          updatePairingStatus();
        }
      });
    },
    onLost(reason) {
      phone = false;
      document.body.classList.remove('phone-linked');
      practiceChannel = null;
      chooseActivity('menu');
      phoneMode = undefined;
      practiceMatch.release(slot);
      element('game-mode').textContent = '行动大厅';
      if (reason === 'replacing') return;
      if (reason === 'signaling') {
        practiceLink?.close();
        practiceLink = null;
        clearTimeout(retry);
        retry = setTimeout(connectPractice, 1800);
        pairingProtocol = undefined;
        element('qr').hidden = true;
        element('pair-url').removeAttribute('href');
        element('room-url').value = '';
      }
      const message = reason === 'signaling' ? '正在重新连接配对服务…'
        : '直连断开。确认两台设备在同一 Wi-Fi 后重新扫码。';
      pairing.hidden = false;
      element('pair-status').textContent = message;
      showToast(message, 3500);
    },
  });
}

function publishPracticeCombat(snapshot, player) {
  if (practiceChannel?.readyState !== 'open' || practiceChannel.bufferedAmount > 4096) return;
  const screenAudio = audio.isRunning();
  const identity = `${player.dashWait}/${snapshot.phase}/${player.ready}/${snapshot.score}/${player.weapon}/${player.hp}/${player.ammo}/${player.reserve}/${player.reloading}/${practiceMatch.sparring}/${screenAudio}`;
  if (identity === lastPracticeCombat && !snapshot.events.length) return;
  practiceChannel.send(JSON.stringify({ ...combatFeedback(snapshot, slot), sparring: practiceMatch.sparring, score: snapshot.score, winner: snapshot.winner, screenAudio }));
  lastPracticeCombat = identity;
}

function connect() {
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  socket.addEventListener('open', () => {
    connectionError = false;
    lastScreenAudio = undefined;
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
    if (data.type === 'welcome' || data.type === 'pairing') showInvite(data);
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
      if (!paired && phone) {
        pairing.hidden = false;
        showToast('手机已断开，可重新扫码');
      }
      phone = paired;
      document.body.classList.toggle('phone-linked', paired);
      const nextMode = data.seats[slot]?.aimMode;
      if (nextMode === 'motion' && phoneMode !== 'motion') showToast('手机体感已校准');
      phoneMode = nextMode;
      updatePairingStatus();
    }
    if (data.type === 'state' && slot != null) display(data);
    if (data.type === 'aim' && slot != null) scene?.setAim(data.yaw, data.pitch);
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
    phone = false;
    document.body.classList.remove('phone-linked');
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
  armory.disabled = countdown;
  if (armory.disabled && !armoryPanel.hidden) showArmory(false);
  scene.draw(data, slot);
  element('score-a').textContent = data.score[0];
  element('score-b').textContent = data.score[1];
  const seconds = playing || countdown ? data.remaining : (ended ? 0 : roundSeconds);
  element('clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  lobby.hidden = playing || countdown;
  ready.disabled = player.ready;
  ready.textContent = player.ready ? '已准备，等对手' : (ended ? '再来一局' : '准备开打');
  stage.textContent = ended ? (data.winner == null ? '平局' : (data.winner === player.team ? '这局赢了' : '这局输了')) : '夜班货场';
  note.textContent = ended ? `${teams[0].name} ${data.score[0]}  ·  ${teams[1].name} ${data.score[1]}`
    : relay ? `击倒得 1 分，交付电池得 2 分。90 秒内先得 ${battleRoom.size === 1 ? 5 : battleRoom.size * 4} 分获胜。`
    : '抢到电池，送回己方货台。90 秒内先拿两分获胜。';
  element('crosshair').hidden = player.hp === 0 || countdown || ended;
  element('hud-foot').hidden = !playing;
  showCombatStatus(player);
  objective.textContent = data.paused ? '等待对手重连' : (player.respawn ? `${player.respawn} 秒后复活`
    : (data.battery.carrier === slot ? '带回你的货台' : (data.battery.carrier != null ? (data.players[data.battery.carrier]?.team === player.team ? '保护运芯队友' : '对手拿了电池') : '去中央拿电池')));

  if (data.paused) showToast('等待对手重连', 150);
  else if (countdown && toast.textContent !== String(data.remaining)) showToast(`${data.remaining}`, 1050);
  if (playing && lastPhase !== 'playing') {
    pairing.hidden = true;
    showToast('抢占中央电池');
  }
  if (ended && lastPhase !== 'ended' && document.pointerLockElement) document.exitPointerLock();
  lastPhase = data.phase;
  renderEffects(data, player);
  audio.music(playing && !data.paused);
  const running = audio.isRunning();
  if (running !== lastScreenAudio) {
    lastScreenAudio = running;
    if (!relay) send({ type: 'screen-audio', running });
  }
}

function showCombatStatus(player) {
  const hp = Math.ceil(player.hp);
  if (healthMeter.value !== hp) {
    healthMeter.value = hp;
    healthPoints.textContent = hp;
  }
  const ammo = String(player.ammo ?? '–');
  const reserve = `/ ${player.reserve ?? '–'}`;
  const kit = getWeapon(player.weapon) ?? getWeapon(defaultWeapon);
  const label = player.reloading ? `${kit.name} · 换弹中` : kit.name;
  if (ammoReadout.textContent !== ammo) ammoReadout.textContent = ammo;
  if (reserveReadout.textContent !== reserve) reserveReadout.textContent = reserve;
  if (weaponReadout.textContent !== label) weaponReadout.textContent = label;
  if (!armoryPanel.hidden) markWeapon(kit.id);
  if (reloadGauge.hidden === Boolean(player.reloading)) reloadGauge.hidden = !player.reloading;
  if (player.reloading) reloadGauge.value = player.reloadProgress ?? 0;
}

function renderEffects(data, player) {
  for (const event of data.events) {
    scene.event(event);
    if (event.type === 'dash' && event.player === slot) blink('dash-wake', 'active', 220);
    audio.event(event, slot, player);
    if (event.type === 'pickup' && event.player === slot) showToast('拿到电池，回己方货台');
    if (event.type === 'drop') showToast('电池脱落');
    if (event.type === 'score') showImpact(`${teams[event.team ?? event.player].name} · ${event.reason === 'knockout' ? '击倒' : '交付'} +${event.points || 1}`, 'break');
    if (event.type === 'break') showImpact('破开！', 'break');
    if (event.player === slot && event.type === 'dry-fire') showToast('弹匣已空 · 请换弹');
    if (event.type === 'shot' && (event.target === slot || event.impacts?.some(impact => impact.target === slot && impact.damage > 0))) {
      blink('flash', 'active', 80);
      const bearing = Math.atan2(event.origin[0] - player.x, player.z - event.origin[2]) - player.yaw;
      element('damage-bearing').style.setProperty('--bearing', `${bearing}rad`);
      blink('damage-bearing', null, 650);
    }
    if (event.type === 'shot' && event.player === slot && (event.target != null || (practice && event.impact === 'shutter'))) {
      blink('hit', null, 110);
      if (event.target != null) {
        const down = data.players[event.target]?.hp === 0;
        const amount = event.damage > 0 ? ` ${event.damage}` : '';
        showImpact(down ? `击倒${amount}` : `命中${amount}`, down ? 'break' : 'hit');
      }
    }
  }
}

function showImpact(text, tone) {
  const word = element('impact-word');
  word.textContent = text;
  word.dataset.tone = tone;
  blink('impact-word', null, 620);
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
  reload = false;
  yaw = pitch = 0;
}

element('pair').disabled = true;
element('pair').addEventListener('click', () => {
  if (practice) startPracticeAudio();
  showControlPanel(false);
  showArmory(false);
  if (practiceMatch && !practiceLink) {
    pairing.hidden = false;
    connectPractice();
    return;
  }
  pairing.hidden = !pairing.hidden;
  if (!pairing.hidden) send({ type: 'pairing' });
});
function showControlPanel(open) {
  controlPanel.hidden = !open;
  element('controls').setAttribute('aria-expanded', String(open));
  if (open) {
    pairing.hidden = true;
    showArmory(false);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function markWeapon(id) {
  for (const button of armoryOptions.children) {
    const selected = String(button.dataset.weapon === id);
    if (button.getAttribute('aria-pressed') !== selected) button.setAttribute('aria-pressed', selected);
  }
}

function showArmory(open) {
  armoryPanel.hidden = !open;
  armory.setAttribute('aria-expanded', String(open));
  if (open) {
    pairing.hidden = true;
    showControlPanel(false);
    if (document.pointerLockElement) document.exitPointerLock();
    markWeapon((practiceMatch?.players[slot] ?? state?.players[slot])?.weapon ?? defaultWeapon);
  }
}

function selectWeapon(id) {
  if (slot == null || armory.disabled || !getWeapon(id)) return;
  if (relay) return relay.command({ type: 'equip', weapon: id });
  if (practiceMatch) {
    if (practiceMatch.equip(slot, id)) showToast(getWeapon(id).name);
    return;
  }
  send({ type: 'equip', weapon: id });
}

armory.addEventListener('click', () => showArmory(armoryPanel.hidden));
element('close-armory').addEventListener('click', () => showArmory(false));
element('controls').addEventListener('click', () => showControlPanel(controlPanel.hidden));
element('close-controls').addEventListener('click', () => showControlPanel(false));
function updateMouseSensitivity() {
  element('mouse-sensitivity-value').value = `${Number(mouseSlider.value).toFixed(2)}×`;
}
mouseSlider.addEventListener('input', () => {
  localStorage.setItem('nightshift-mouse-scale', mouseSlider.value);
  updateMouseSensitivity();
});
updateMouseSensitivity();
qualityPicker.addEventListener('change', () => {
  localStorage.setItem('nightshift-quality', qualityPicker.value);
  scene?.setQuality(qualityPicker.value);
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
function startPracticeAudio() {
  audio.unlock();
  practiceMusic = true;
}

function setSparring(enabled) {
  if (!practiceMatch || enabled === practiceMatch.sparring) return;
  startPracticeAudio();
  clearInputs();
  practiceMatch.setSparring(enabled);
  sparring.textContent = enabled ? '结束对练' : '开始对练';
  sparring.setAttribute('aria-pressed', String(enabled));
  lobby.hidden = true;
  pairing.hidden = true;
  showToast(enabled ? '巡逻机已启动' : '已回到铁板训练');
}
sparring.addEventListener('click', () => setSparring(!practiceMatch.sparring));
ready.addEventListener('click', () => {
  if (practice) {
    startPracticeAudio();
    lobby.hidden = true;
  } else {
    audio.unlock();
    send({ type: 'ready' });
  }
});
arena.addEventListener('pointerdown', event => {
  audio.unlock();
  if (phone || event.button !== 0) return;
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
  if (document.activeElement?.matches('input, textarea, select, [contenteditable]')) return;
  if (phone) return;
  if (!event.repeat && /^Digit[1-3]$/.test(event.code)) {
    selectWeapon(weaponIds[Number(event.code.at(-1)) - 1]);
    return;
  }
  if (phone) return;
  if (!event.repeat && event.code === 'KeyR') {
    reload = true;
    sendInput();
    return;
  }
  if (!controlKeys.has(event.code)) return;
  event.preventDefault();
  keys.add(event.code);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', clearInputs);
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) clearInputs(); });
window.addEventListener('mousemove', event => {
  if (document.pointerLockElement !== arena || phone) return;
  const scale = .0032 * Number(mouseSlider.value);
  yaw += event.movementX * scale;
  pitch -= event.movementY * scale;
});

function sendInput() {
  if (slot == null || phone) return;
  const held = (...codes) => Number(codes.some(code => keys.has(code)));
  send({ type: 'input', lateral: held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft'),
    forward: held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown'), yaw, pitch, fire, reload });
  reload = false;
  yaw = pitch = 0;
}

setInterval(sendInput, 1000 / 50);
if (scene) {
  if (practice) startPractice();
  else connect();
}
