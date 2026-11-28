import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';

const maxRequestBytes = 18_000;
const sessionLifetime = 45_000;

class SignalPeer extends EventEmitter {
  httpsPolling = true;
  readyState = WebSocket.OPEN;
  bufferedAmount = 0;
  expiresAt = Date.now() + sessionLifetime;
  messages = [];
  closeCode = 0;

  send(message) {
    this.messages.push(message);
    this.bufferedAmount += Buffer.byteLength(message);
  }

  close(code = 1000) {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.closeCode = code;
    this.emit('close', code);
  }

  drain() {
    const messages = this.messages;
    this.messages = [];
    this.bufferedAmount = 0;
    return { messages, closeCode: this.closeCode };
  }
}

export function createPracticeMailbox(accept, makeToken) {
  const sessions = new Map();

  function remove(id, peer) {
    sessions.delete(id);
    peer.close();
  }

  function sweep(now = Date.now()) {
    for (const [id, peer] of sessions) if (peer.expiresAt <= now) remove(id, peer);
  }

  async function serve(request, response) {
    function reply(status, data) {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(data));
    }

    let data;
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > maxRequestBytes) {
          reply(413, {});
          return;
        }
        chunks.push(chunk);
      }
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      if (!response.destroyed) reply(400, {});
      return;
    }

    if (data?.type === 'open') {
      sweep();
      if (sessions.size >= 96) return reply(503, {});
      if (!['host', 'phone', 'room'].includes(data.hello?.type)) return reply(400, {});
      const id = makeToken();
      const peer = new SignalPeer();
      sessions.set(id, peer);
      accept(peer, request);
      peer.emit('message', JSON.stringify(data.hello));
      return reply(200, { id, ...peer.drain() });
    }

    const peer = sessions.get(data?.id);
    if (!peer) return reply(410, {});
    if (data.type === 'close') {
      remove(data.id, peer);
      return reply(200, {});
    }
    if (data.type !== 'exchange') return reply(400, {});
    peer.expiresAt = Date.now() + sessionLifetime;
    if (!peer.closeCode && typeof data.message === 'string') peer.emit('message', data.message);
    const packet = peer.drain();
    if (packet.closeCode) sessions.delete(data.id);
    reply(200, packet);
  }

  return { serve, sweep, close() { for (const [id, peer] of sessions) remove(id, peer); } };
}
