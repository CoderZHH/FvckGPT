import QRCode from 'qrcode';
import { WebSocket } from 'ws';

export function acceptPracticeSignals(server, inviteOrigin, makeToken) {
  const rooms = new Map();

  function send(socket, message) {
    if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 32_768) {
      socket.send(JSON.stringify(message));
    }
  }

  async function sendInvite(room, request) {
    try {
      const pairURL = `${inviteOrigin(request)}/controller?practice=1#${room.token}`;
      if (room.pairURL === pairURL) return;
      room.pairURL = pairURL;
      const qr = await QRCode.toDataURL(pairURL, { margin: 2, width: 220 });
      if (room.pairURL === pairURL) send(room.host, { type: 'invite', pairURL, qr });
    } catch {
      room.host.close(1011, 'invite');
    }
  }

  server.on('connection', (socket, request) => {
    let room, role;
    let messages = 0;
    let countSince = Date.now();
    const deadline = setTimeout(() => { if (!role) socket.close(1008, 'handshake'); }, 5_000);
    socket.alive = true;
    socket.on('pong', () => { socket.alive = true; });
    socket.on('error', () => socket.terminate());

    socket.on('message', raw => {
      if (Date.now() - countSince >= 1_000) {
        messages = 0;
        countSince = Date.now();
      }
      if (++messages > 20) {
        socket.close(1008, 'signaling limit');
        return;
      }
      let message;
      try { message = JSON.parse(raw); } catch { return; }
      if (!message || typeof message !== 'object') return;

      if (!role && message.type === 'host') {
        role = 'host';
        room = { host: socket, token: makeToken(), exchange: 0 };
        rooms.set(room.token, room);
        clearTimeout(deadline);
        void sendInvite(room, request);
        return;
      }
      if (!role && message.type === 'phone') {
        room = rooms.get(message.token);
        if (!room || room.host.readyState !== WebSocket.OPEN) {
          socket.close(1008, 'invalid pairing');
          return;
        }
        role = 'phone';
        room.phone?.close(4001, 'reconnected');
        room.phone = socket;
        room.exchange++;
        clearTimeout(deadline);
        send(room.host, { type: 'peer', exchange: room.exchange });
        return;
      }
      if (!room || room[role] !== socket) return;
      if (role === 'host' && message.type === 'invite') {
        void sendInvite(room, request);
        return;
      }
      if (message.exchange !== room.exchange || typeof message.sdp !== 'string') return;
      if (role === 'host' && message.type === 'offer') {
        send(room.phone, { type: 'offer', exchange: room.exchange, sdp: message.sdp });
      }
      if (role === 'phone' && message.type === 'answer') {
        send(room.host, { type: 'answer', exchange: room.exchange, sdp: message.sdp });
      }
    });

    socket.on('close', () => {
      clearTimeout(deadline);
      if (!room || room[role] !== socket) return;
      if (role === 'host') {
        rooms.delete(room.token);
        room.phone?.close(4000, 'host left');
      } else {
        room.phone = null;
      }
    });
  });
}
