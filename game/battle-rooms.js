const sizes = [1, 2, 3, 4, 5];
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function battleRooms(send, makeToken) {
  const rooms = new Map();
  const members = new Map();
  const unseat = member => ({ id: member.id, team: member.team, ready: member.ready, connected: member.connected });

  function error(peer, message) { send(peer, { type: 'room-error', message }); }

  function publish(room, notice = '') {
    const players = [...room.members.values()].map(unseat);
    const counts = [0, 1].map(team => players.filter(player => player.team === team).length);
    const canStart = counts.every(count => count === room.size) && players.every(player => player.ready && player.connected);
    for (const member of room.members.values()) send(member.peer, { type: 'room-state',
      code: room.code, size: room.size, phase: room.phase, players, counts, canStart, self: member.id, notice });
  }

  function leave(peer) {
    const member = members.get(peer);
    if (!member) return;
    members.delete(peer);
    const room = member.room;
    room.members.delete(member.id);
    if (member.id === 0) {
      rooms.delete(room.code);
      for (const other of room.members.values()) {
        members.delete(other.peer);
        send(other.peer, { type: 'room-closed', message: '房主已离开，房间关闭。' });
      }
    } else {
      send(room.members.get(0).peer, { type: 'room-peer-left', id: member.id });
      room.phase = 'lobby';
      for (const other of room.members.values()) other.ready = false;
      publish(room, `玩家 ${member.id + 1} 已离开。请重新准备。`);
    }
  }

  function handle(peer, message) {
    const member = members.get(peer);
    if (!member) {
      let room;
      let id = 0;
      if (message.type === 'room-create') {
        if (!sizes.includes(message.size) || rooms.size >= 64) return error(peer, '暂时无法创建该房间。');
        let code;
        do {
          const hex = makeToken();
          code = Array.from({ length: 6 }, (_, index) =>
            alphabet[parseInt(hex.slice(index * 2, index * 2 + 2), 16) % alphabet.length]).join('');
        } while (rooms.has(code));
        room = { code, size: message.size, phase: 'lobby', members: new Map() };
        rooms.set(code, room);
      } else if (message.type === 'room-join') {
        if (typeof message.code !== 'string' || !/^[A-Z2-9]{6}$/.test(message.code)) return error(peer, '请输入 6 位房间码。');
        room = rooms.get(message.code);
        if (!room) return error(peer, '房间不存在或已经关闭。');
        if (room.phase !== 'lobby') return error(peer, '该房间正在对局，请等下一局。');
        if (room.members.size >= room.size * 2) return error(peer, '房间已满。');
        id = Array.from({ length: 9 }, (_, seat) => seat + 1).find(seat => !room.members.has(seat));
      } else return;
      const orange = [...room.members.values()].filter(p => p.team === 0).length;
      const team = orange <= room.members.size - orange ? 0 : 1;
      const joined = { id, team, room, peer, connected: id === 0, ready: false };
      room.members.set(id, joined);
      members.set(peer, joined);
      publish(room);
      if (id) send(room.members.get(0).peer, { type: 'room-new-peer', id });
      return;
    }
    const { room, id } = member;
    if (message.type === 'room-offer' || message.type === 'room-answer') {
      const offer = message.type === 'room-offer';
      if (offer !== (id === 0) || !Number.isInteger(message.exchange) || typeof message.sdp !== 'string' || message.sdp.length > 15_000) return;
      const to = room.members.get(offer ? message.id : 0);
      if (to && to !== member) send(to.peer, { type: message.type, id, exchange: message.exchange, sdp: message.sdp });
    } else if (!id && message.type === 'room-link') {
      const other = room.members.get(message.id);
      if (!other || other.id === 0 || other.connected === (message.connected === true)) return;
      other.connected = message.connected === true;
      if (!other.connected) {
        room.phase = 'lobby';
        for (const player of room.members.values()) player.ready = false;
      }
      publish(room, other.connected ? '' : `玩家 ${other.id + 1} 的局域网连接断开。`);
    } else if (message.type === 'room-retry') {
      if (!id || member.connected) return;
      send(room.members.get(0).peer, { type: 'room-new-peer', id });
    } else if (message.type === 'room-reset' && room.phase === 'match') {
      if (id !== 0) return;
      room.phase = 'lobby';
      for (const player of room.members.values()) player.ready = false;
      publish(room, '已返回房间，请重新准备。');
    } else if (room.phase === 'lobby') {
      if (message.type === 'room-team') {
        const team = message.team;
        if ((team !== 0 && team !== 1) || team === member.team) return;
        if ([...room.members.values()].filter(player => player.team === team).length >= room.size) return error(peer, '这支队伍已满。');
        member.team = team;
        member.ready = false;
      } else if (message.type === 'room-ready') {
        if (!member.connected) return error(peer, '正在建立直连，请先连接房主。');
        member.ready = !member.ready;
      } else if (message.type === 'room-start' && id === 0) {
        const players = [...room.members.values()];
        if (!players.every(player => player.connected && player.ready)
          || ![0, 1].every(team => players.filter(player => player.team === team).length === room.size)) {
          return error(peer, '两队满员且所有玩家准备后才能开始。');
        }
        room.phase = 'match';
      } else return;
      publish(room);
    }
  }

  return { handle, leave };
}
