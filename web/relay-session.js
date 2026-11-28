import { YardMatch } from './simulation.js';
import { PracticePollingSignal } from './practice-poll.js';

const directTimeout = 16_000;
const commands = new Set(['input', 'dash', 'reload', 'equip']);

export function matchRoom({ onRoom, onFrame, onError, onLink }) {
  const hello = { type: 'room' };
  const polling = new URLSearchParams(location.search).get('preview') === '1';
  const socket = polling ? new PracticePollingSignal(hello)
    : new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/practice-signal`);
  const peers = new Map();
  let room, match, closed = false, pending, guestWait, elapsed = 0, frameDelay = 0;
  let clock = performance.now();

  function signal(packet) {
    if (closed) return;
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(packet));
    else if (socket.readyState === WebSocket.CONNECTING) pending = packet;
  }

  function closePeer(id) {
    const link = peers.get(id);
    if (!link) return;
    peers.delete(id);
    clearTimeout(link.timeout);
    clearTimeout(link.disconnect);
    link.peer.close();
  }

  function lost(id, link, timeout) {
    if (peers.get(id) !== link) return;
    closePeer(id);
    if (room?.self === 0) {
      signal({ type: 'room-link', id, connected: false });
      onLink(timeout ? `玩家 ${id + 1} 直连超时，等对方重试。` : `玩家 ${id + 1} 已断开。`);
    } else {
      onLink('无法直连房主。确认两台电脑在同一 Wi-Fi、允许浏览器访问本地网络，然后点「重试直连」。');
    }
  }

  function openPeer(id, exchange) {
    closePeer(id);
    if (id === 0) clearTimeout(guestWait);
    const peer = new RTCPeerConnection({ iceServers: [] });
    const link = { peer, exchange };
    peers.set(id, link);
    link.timeout = setTimeout(() => lost(id, link, true), directTimeout);
    peer.onconnectionstatechange = () => {
      clearTimeout(link.disconnect);
      if (peer.connectionState === 'failed') lost(id, link, true);
      if (peer.connectionState === 'disconnected') link.disconnect = setTimeout(() => lost(id, link, false), 4000);
    };
    return link;
  }

  function bindChannel(id, link, channel) {
    link.channel = channel;
    channel.onopen = () => {
      if (peers.get(id) !== link) return;
      clearTimeout(link.timeout);
      if (room.self === 0) signal({ type: 'room-link', id, connected: true });
      onLink('');
    };
    channel.onclose = () => lost(id, link, false);
    channel.onmessage = event => {
      let packet;
      try { packet = JSON.parse(event.data); } catch { return; }
      if (room?.phase !== 'match') return;
      if (room.self === 0) apply(id, packet);
      else if (packet?.type === 'frame' && packet.players[room.self]) onFrame(packet, room.self);
    };
  }

  async function describe(id, link, description) {
    await link.peer.setLocalDescription(description);
    function sendDescription() {
      if (peers.get(id) !== link || link.peer.iceGatheringState !== 'complete') return;
      link.peer.removeEventListener('icegatheringstatechange', sendDescription);
      const { type, sdp } = link.peer.localDescription;
      signal({ type: `room-${type}`, id, exchange: link.exchange, sdp });
    }
    link.peer.addEventListener('icegatheringstatechange', sendDescription);
    sendDescription();
  }

  function apply(id, packet) {
    if (packet?.type === 'room-return' && match?.phase === 'ended') {
      signal({ type: 'room-reset' });
      return;
    }
    if (!match || !packet || !match.players[id] || !commands.has(packet.type)) return;
    switch (packet.type) {
      case 'input': match.control(id, packet); break;
      case 'dash': match.dash(id); break;
      case 'reload': match.reload(id); break;
      case 'equip': match.equip(id, packet.weapon); break;
    }
  }

  function updateRoom(data) {
    const previousPhase = room?.phase;
    if (!room && data.self > 0) waitForOffer();
    room = data;
    if (data.phase === 'match' && previousPhase !== 'match' && data.self === 0) {
      match = new YardMatch();
      match.targetScore = data.size > 1 ? data.size * 4 : 5;
      match.deliveryPoints = 2;
      match.knockoutPoints = 1;
      const spawns = [0, 0];
      for (const player of data.players) match.join(player.id, player.team, spawns[player.team]++);
      match.start();
      clock = performance.now();
      elapsed = frameDelay = 0;
    } else if (data.phase === 'lobby') {
      match = undefined;
    }
    onRoom(data);
  }

  function waitForOffer() {
    clearTimeout(guestWait);
    guestWait = setTimeout(() => onLink('连接房主超时。请确认同一 Wi-Fi 后重试直连。'), directTimeout);
  }

  const ticker = setInterval(() => {
    if (!match) return;
    const now = performance.now();
    elapsed += Math.min(.12, (now - clock) / 1000);
    clock = now;
    while (elapsed >= 1 / 60) {
      match.step(1 / 60);
      elapsed -= 1 / 60;
      frameDelay++;
    }
    if (frameDelay < 2) return;
    frameDelay = 0;
    const frame = match.snapshot();
    onFrame(frame, 0);
    const payload = JSON.stringify({ ...frame, type: 'frame' });
    for (const { channel } of peers.values()) {
      if (channel?.readyState === 'open' && channel.bufferedAmount < 16_384) channel.send(payload);
    }
  }, 1000 / 60);

  socket.addEventListener('open', () => {
    if (!polling) signal(hello);
    if (pending) { signal(pending); pending = undefined; }
  });
  socket.addEventListener('close', () => {
    if (closed) return;
    close();
    onError('房间服务已断开。确认开房的电脑还在运行，然后重新进入联机大厅。', true);
  });
  socket.addEventListener('message', async event => {
    const data = JSON.parse(event.data);
    try {
      if (data.type === 'room-state') updateRoom(data);
      if (data.type === 'room-error') onError(data.message);
      if (data.type === 'room-closed') { close(); onError(data.message, true); }
      if (data.type === 'room-peer-left') closePeer(data.id);
      if (data.type === 'room-new-peer' && room?.self === 0) {
        const link = openPeer(data.id, crypto.getRandomValues(new Uint32Array(1))[0]);
        bindChannel(data.id, link, link.peer.createDataChannel('nightshift-room'));
        await describe(data.id, link, await link.peer.createOffer());
      }
      if (data.type === 'room-offer' && room?.self > 0) {
        const link = openPeer(0, data.exchange);
        link.peer.ondatachannel = ({ channel }) => bindChannel(0, link, channel);
        await link.peer.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        await describe(0, link, await link.peer.createAnswer());
      }
      if (data.type === 'room-answer' && room?.self === 0) {
        const link = peers.get(data.id);
        if (link?.exchange === data.exchange && link.peer.signalingState === 'have-local-offer') {
          await link.peer.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        }
      }
    } catch {
      onLink('无法建立局域网直连，请确认网络后重试。');
    }
  });

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(ticker);
    clearTimeout(guestWait);
    window.removeEventListener('pagehide', close);
    for (const id of peers.keys()) closePeer(id);
    socket.close();
  }
  window.addEventListener('pagehide', close, { once: true });

  return {
    close,
    command(packet) {
      if (packet.type === 'room-retry') {
        onLink('正在重新连接房主…');
        waitForOffer();
      }
      if (packet.type !== 'room-return' && packet.type.startsWith('room-')) return signal(packet);
      if (room?.phase !== 'match' || (!commands.has(packet.type) && packet.type !== 'room-return')) return;
      if (room.self === 0) apply(0, packet);
      else {
        const channel = peers.get(0)?.channel;
        if (channel?.readyState === 'open' && channel.bufferedAmount < 8192) channel.send(JSON.stringify(packet));
      }
    },
  };
}
