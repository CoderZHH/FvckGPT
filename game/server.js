import { randomBytes } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { WebSocket, WebSocketServer } from 'ws';
import { YardMatch } from '../web/simulation.js';
import { acceptPracticeSignals } from './practice-signals.js';

const web = fileURLToPath(new URL('../web/', import.meta.url));
const three = fileURLToPath(new URL('../node_modules/three/build/', import.meta.url));
const token = () => randomBytes(16).toString('hex');
const defaultPort = 8787;
const reserveFor = 15_000;
const aimModes = new Set(['touch', 'calibrating', 'motion', 'insecure']);
const mime = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', jpg: 'image/jpeg' };

function networkAddress() {
  const addresses = Object.entries(networkInterfaces()).flatMap(([name, ips]) => ips
    .filter(ip => ip.family === 'IPv4' && !ip.internal)
    .map(ip => ({ name, address: ip.address })));
  return addresses.find(ip => /^(en|eth|wlan)/.test(ip.name))?.address ?? addresses[0]?.address ?? '127.0.0.1';
}

function page(request, response, practiceOnly) {
  const path = new URL(request.url, 'http://nightshift.local').pathname;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  if (practiceOnly && path === '/') {
    response.writeHead(302, { Location: '/practice?preview=1', 'Cache-Control': 'no-store' }).end();
    return;
  }
  let file;
  if (path === '/' || path === '/practice') file = `${web}index.html`;
  else if (path === '/controller') file = `${web}controller.html`;
  else if (path === '/assets/night-shift-sky.jpg') file = `${web}assets/night-shift-sky.jpg`;
  else if (/^\/vendor\/three\.(module|core)\.js$/.test(path)) file = `${three}${path.split('/').at(-1)}`;
  else if (/^\/[a-z-]+\.(js|css)$/.test(path)) file = `${web}${path.slice(1)}`;
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  const stream = createReadStream(file);
  stream.once('error', () => response.writeHead(404).end());
  stream.once('open', () => {
    response.writeHead(200, { 'Content-Type': mime[file.split('.').at(-1)],
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
    if (request.method === 'HEAD') {
      stream.destroy();
      response.end();
    } else stream.pipe(response);
  });
}

function parseOrigin(origin) {
  const externalURL = origin ? new URL(origin) : null;
  if (externalURL && !['https:', 'http:'].includes(externalURL.protocol)) {
    throw new Error('NIGHTSHIFT_ORIGIN must be an HTTP or HTTPS address.');
  }
  return externalURL?.origin;
}

export async function startYardServer({ port = defaultPort, host = '0.0.0.0', ip, tls, origin, practiceOnly = false,
  readNetworkAddress = networkAddress } = {}) {
  const match = new YardMatch();
  const seats = [null, null];
  const scheme = tls ? 'https' : 'http';
  let externalOrigin = parseOrigin(origin);
  const servePage = (request, response) => page(request, response, practiceOnly);
  const server = tls ? httpsServer(tls, servePage) : httpServer(servePage);
  const ws = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  const practice = new WebSocketServer({ noServer: true, maxPayload: 16_384, perMessageDeflate: false });
  const send = (socket, data) => {
    if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 64_000) socket.send(data);
  };

  function inviteOrigin(address) {
    return `${scheme}://${address}:${server.address().port}`;
  }

  function screenOrigin(request) {
    const inbound = new URL(`${scheme}://${request.headers.host ?? `localhost:${server.address().port}`}`);
    return externalOrigin ?? (['localhost', '127.0.0.1', '[::1]'].includes(inbound.hostname) ? null : inbound.origin);
  }

  acceptPracticeSignals(practice, request => screenOrigin(request) ?? inviteOrigin(ip ?? readNetworkAddress()), token);

  function status() {
    const message = JSON.stringify({ type: 'seats', seats: seats.map(seat => ({ screen: Boolean(seat?.screen),
      phone: Boolean(seat?.phone), aimMode: seat?.phone ? (seat.aimMode ?? null) : null })) });
    for (const seat of seats) if (seat) send(seat.screen, message);
  }

  async function publishPairing(seat, address) {
    const socket = seat.screen;
    const lan = seat.inboundOrigin ?? inviteOrigin(address);
    if (seat.lan === lan) return;
    seat.lan = lan;
    const pairURL = `${lan}/controller#${seat.pair}`;
    try {
      const qr = await QRCode.toDataURL(pairURL, { margin: 2, width: 220 });
      if (seat.screen !== socket || seat.lan !== lan) return;
      const type = seat.welcomed ? 'pairing' : 'welcome';
      send(socket, JSON.stringify({ type, slot: seat.slot, key: seat.key, lan, qr, pairURL }));
      seat.welcomed = true;
      if (type === 'welcome') status();
    } catch {
      if (seat.screen === socket && seat.lan === lan) socket.close(1011, 'pairing code');
    }
  }

  server.on('upgrade', (request, socket, head) => {
    try {
      const client = request.headers.origin ? new URL(request.headers.origin) : null;
      const endpoint = request.url === '/ws' && !practiceOnly ? ws : request.url === '/practice-signal' ? practice : null;
      if (!endpoint || (client && client.host !== request.headers.host && client.origin !== externalOrigin)) {
        socket.destroy();
        return;
      }
      endpoint.handleUpgrade(request, socket, head, client => endpoint.emit('connection', client, request));
    } catch {
      socket.destroy();
    }
  });

  ws.on('connection', (socket, request) => {
    let role;
    let seat;
    let seen = 0;
    let windowStarted = Date.now();
    socket.alive = true;
    socket.on('pong', () => { socket.alive = true; });
    socket.on('error', () => socket.terminate());
    const deadline = setTimeout(() => { if (!role) socket.close(1008, 'handshake'); }, 5_000);

    socket.on('message', raw => {
      const now = Date.now();
      if (now - windowStarted > 1000) {
        seen = 0;
        windowStarted = now;
      }
      if (++seen > 100) return;
      let data;
      try { data = JSON.parse(raw); } catch { return; }
      if (!data || typeof data !== 'object') return;

      if (!role && data.type === 'screen') {
        let inboundOrigin;
        try {
          inboundOrigin = screenOrigin(request);
        } catch {
          socket.close(1008, 'host');
          return;
        }
        seat = typeof data.key === 'string' && seats.find(candidate => candidate?.key === data.key);
        if (!seat) {
          const slot = seats.indexOf(null);
          if (slot < 0) {
            send(socket, JSON.stringify({ type: 'error', message: '房间已满，当前一局支持两人。' }));
            socket.close(1008, 'full');
            return;
          }
          seat = { slot, key: token(), pair: token(), screen: null, phone: null, expiresAt: 0 };
          seats[slot] = seat;
          match.join(slot);
        }
        role = 'screen';
        const previous = seat.screen;
        seat.screen = socket;
        seat.inboundOrigin = inboundOrigin;
        seat.welcomed = false;
        seat.lan = null;
        previous?.close(4001, 'reconnected');
        clearTimeout(deadline);
        void publishPairing(seat, ip ?? readNetworkAddress());
        return;
      }

      if (!role && data.type === 'phone') {
        seat = typeof data.token === 'string' && seats.find(candidate => candidate?.screen && candidate.pair === data.token);
        if (!seat) {
          send(socket, JSON.stringify({ type: 'error', message: '配对码已失效。请扫描电脑上的二维码。' }));
          socket.close(1008, 'invalid pairing');
          return;
        }
        role = 'phone';
        const previous = seat.phone;
        match.release(seat.slot);
        seat.phone = socket;
        seat.aimMode = null;
        previous?.close(4001, 'reconnected');
        clearTimeout(deadline);
        send(socket, JSON.stringify({ type: 'welcome', slot: seat.slot }));
        status();
        return;
      }

      if (!seat?.screen || seat[role] !== socket) return;
      if (role === 'screen' && data.type === 'ready') match.ready(seat.slot);
      if (role === 'screen' && data.type === 'pairing') void publishPairing(seat, ip ?? readNetworkAddress());
      if (role === 'phone' && data.type === 'aim-mode' && aimModes.has(data.mode) && seat.aimMode !== data.mode) {
        seat.aimMode = data.mode;
        status();
      }
      if (data.type === 'input' && (role === 'phone' || !seat.phone)) match.control(seat.slot, data);
    });

    socket.on('close', () => {
      clearTimeout(deadline);
      if (!seat || seat[role] !== socket) return;
      seat[role] = null;
      match.release(seat.slot);
      if (role === 'screen') {
        seat.expiresAt = Date.now() + reserveFor;
        match.players[seat.slot].ready = false;
      }
      status();
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  let previous = performance.now();
  let tick = 0;
  const gameTimer = setInterval(() => {
    for (const seat of seats) {
      if (seat && !seat.screen && seat.expiresAt <= Date.now()) {
        seat.phone?.close(1008, 'screen left');
        seats[seat.slot] = null;
        match.leave(seat.slot);
        status();
      }
    }
    const time = performance.now();
    const paused = (match.phase === 'countdown' || match.phase === 'playing') && !seats.every(seat => seat?.screen);
    if (!paused) match.step(Math.min((time - previous) / 1000, 0.05));
    previous = time;
    if (++tick % 2 !== 0) return;
    const state = match.snapshot();
    const content = JSON.stringify({ type: 'state', paused, ...state });
    for (const seat of seats) {
      if (!seat?.screen) continue;
      send(seat.screen, content);
      if (tick % 12 === 0 || state.events.length) {
        send(seat.phone, JSON.stringify({ type: 'round', phase: state.phase, score: state.score,
          hp: state.players[seat.slot].hp, carry: state.battery.carrier === seat.slot }));
      }
    }
  }, 1000 / 60);

  const keepAlive = setInterval(() => {
    for (const socket of [...ws.clients, ...practice.clients]) {
      if (!socket.alive) socket.terminate();
      else { socket.alive = false; socket.ping(); }
    }
  }, 8_000);

  const pairingTimer = setInterval(() => {
    const localScreens = seats.filter(seat => seat?.screen && !seat.inboundOrigin);
    if (!localScreens.length) return;
    const address = ip ?? readNetworkAddress();
    for (const seat of localScreens) void publishPairing(seat, address);
  }, 2000);

  return { server, match, port: server.address().port, get ip() { return ip ?? readNetworkAddress(); }, scheme,
    setOrigin(value) { externalOrigin = parseOrigin(value); }, close: () => {
    clearInterval(gameTimer);
    clearInterval(keepAlive);
    clearInterval(pairingTimer);
    for (const socket of [...ws.clients, ...practice.clients]) socket.terminate();
    return new Promise(resolve => server.close(resolve));
  } };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { NIGHTSHIFT_PORT, NIGHTSHIFT_HOST, NIGHTSHIFT_IP, NIGHTSHIFT_TLS_CERT, NIGHTSHIFT_TLS_KEY,
    NIGHTSHIFT_ORIGIN, CODESPACES, CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN } = process.env;
  const port = Number(NIGHTSHIFT_PORT ?? defaultPort);
  const codespaceOrigin = CODESPACES === 'true' && CODESPACE_NAME && GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? `https://${CODESPACE_NAME}-${port}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}` : undefined;
  const origin = NIGHTSHIFT_ORIGIN ?? codespaceOrigin;
  const tls = NIGHTSHIFT_TLS_CERT && NIGHTSHIFT_TLS_KEY ? { cert: readFileSync(NIGHTSHIFT_TLS_CERT),
    key: readFileSync(NIGHTSHIFT_TLS_KEY) } : undefined;
  const yard = await startYardServer({ port, host: NIGHTSHIFT_HOST, ip: NIGHTSHIFT_IP, origin, tls });
  const local = `${yard.scheme}://localhost:${yard.port}`;
  const publicOrigin = parseOrigin(origin);
  const room = publicOrigin ?? `${yard.scheme}://${yard.ip}:${yard.port}`;
  console.log(`夜班货场\n直连靶场（电脑）  ${publicOrigin ?? local}/practice\n双人对战原型      ${room}/`);
}
