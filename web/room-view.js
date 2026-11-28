import { teams } from './yard.js';

export function drawRoster(container, room) {
  const columns = teams.map((team, index) => {
    const section = document.createElement('section');
    section.className = 'room-team';
    section.style.setProperty('--room-team', team.color);
    const title = document.createElement('h3');
    title.textContent = `${team.name} ${room.counts[index]} / ${room.size}`;
    const list = document.createElement('ol');
    for (const player of room.players.filter(player => player.team === index)) {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = `玩家 ${player.id + 1}${player.id === 0 ? ' · 房主' : ''}${player.id === room.self ? ' · 你' : ''}`;
      const badge = document.createElement('small');
      badge.textContent = !player.connected ? '等待直连' : player.ready ? '已准备' : '未准备';
      if (player.ready) badge.className = 'room-ready';
      row.append(name, badge);
      list.append(row);
    }
    for (let seat = room.counts[index]; seat < room.size; seat++) {
      const row = document.createElement('li');
      row.className = 'room-empty';
      row.textContent = '空位';
      list.append(row);
    }
    section.append(title, list);
    return section;
  });
  container.replaceChildren(...columns);
}

export function roomInstruction(room) {
  if (room.notice) return room.notice;
  if (room.players.length < room.size * 2) return `还差 ${room.size * 2 - room.players.length} 人。请把房间码发给队友。`;
  if (room.players.some(player => !player.connected)) return '人数已齐，等待玩家与房主建立局域网直连。';
  if (!room.canStart) return '两队已满。所有玩家准备后，房主可以开局。';
  return room.self === 0 ? '所有玩家已准备。请在手机点「开始对局」。' : '所有玩家已准备，等待房主开局。';
}
