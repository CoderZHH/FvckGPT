import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { startYardServer } from './server.js';

const yard = await startYardServer({ host: '127.0.0.1', port: 0, practiceOnly: true });
const cloudflared = spawn('cloudflared', [
  'tunnel', '--config', '/dev/null', '--no-autoupdate', '--protocol', 'http2',
  '--url', `http://127.0.0.1:${yard.port}`, '--grace-period', '2s',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let origin;
let registered = false;
let stopping = false;
const startup = setTimeout(() => {
  console.error('Cloudflare 未能建立临时 HTTPS 入口。');
  void stop(1);
}, 45_000);

async function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  clearTimeout(startup);
  cloudflared.kill();
  await yard.close();
  process.exitCode = exitCode;
}

function readLine(line) {
  const url = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i)?.[0];
  if (!origin && url) {
    origin = url;
    yard.setOrigin(origin);
  }
  if (/Registered tunnel connection/i.test(line)) registered = true;
  if (origin && registered && !stopping && !startupReady) {
    startupReady = true;
    clearTimeout(startup);
    console.log(`夜班货场 HTTPS 靶场\n${origin}/\n\n用电脑打开网址，再用 iPhone Safari 扫码。按 Ctrl+C 关闭入口。`);
  }
  if (/\b(ERR|WRN)\b/.test(line)) console.error(line);
}

let startupReady = false;
for (const stream of [cloudflared.stdout, cloudflared.stderr]) {
  createInterface({ input: stream }).on('line', readLine);
}

cloudflared.on('error', error => {
  console.error(error.code === 'ENOENT' ? '找不到 cloudflared，请先安装 Cloudflare Tunnel。' : error.message);
  void stop(1);
});
cloudflared.on('exit', code => {
  if (!stopping) console.error('Cloudflare 临时入口已断开。');
  void stop(code || 1);
});
process.on('SIGINT', () => void stop(0));
process.on('SIGTERM', () => void stop(0));
