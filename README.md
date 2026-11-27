# 夜班货场

一款用手机操控的第一人称网页游戏。当前 MVP 是单人直连靶场。一台电脑显示游戏，一部 iPhone 扫码当手柄，可以移动、体感瞄准、快速转头和打碎铁板。

## 试玩 MVP

需要 Node.js 22 或更新版本。在项目目录运行 `npm ci`，再选一种方式启动。

| 要试什么 | 启动命令 | 电脑打开 |
| --- | --- | --- |
| iPhone 体感与触屏 | `npm run preview:https`，需要安装 `cloudflared` | 终端打印的临时 HTTPS 地址 |
| 局域网触屏 | `npm start` | `http://localhost:8787/practice` |

1. 手机和电脑连同一个 Wi-Fi。电脑打开靶场，点「进入靶场」开启声音，手机用 Safari 打开大屏二维码。
2. 左手用摇杆移动，右手横拖右区快速转头，按「开火」打铁板。电脑也可用 WASD 和鼠标练习，按 Esc 释放鼠标。
3. 试体感时，在手机上点「开启体感」并授权。充电口朝自己，手机侧立，顶边对准大屏中央，再点「校准准星」。用手腕小幅转动精瞄，用右区横拖完成大幅转身。

## 通信与交互基线

后续玩法沿用这版体验。电脑网页负责画面和游戏反馈，手机网页扫码加入，摇杆负责移动，体感负责精瞄，右区横拖负责转身。

```text
配对    电脑网页 ↔ Node.js 配对服务 ↔ 手机网页
游戏    手机手柄 ── 局域网 WebRTC DataChannel ──→ 电脑网页
判定    电脑浏览器计算移动、碰撞和命中，再绘制游戏画面
```

- 配对时，二维码携带对应的配对码。Node.js 通过 `/practice-signal` 转送连接信息。连接建立后，手机的实时操作交给 WebRTC，电脑本地更新镜头和命中反馈。
- 直连只尝试本地地址。手机和电脑要能在当前 Wi-Fi 或热点上互相访问。换网络后重新打开配对面板并扫码。
- `npm run preview:https` 用免费的 Cloudflare Quick Tunnel 提供网页和配对入口。知道链接的人可以打开靶场，无需 GitHub 或 Cloudflare 账号。按 Ctrl+C 关闭进程，重启后使用新网址和新二维码。

## 双人对战原型

用 `npm start` 启动，双方的电脑打开房主的局域网首页。每个玩家扫自己电脑上的码，两边点「准备开打」。90 秒内把中央电池送回己方货台，先拿两分获胜。瞄准铁板打三次可以打开侧路，玩家被击倒时会掉落电池，三秒后复活。这条路径目前用 Node.js 统一判定，通过 `/ws` 同步对局。

## 自己的 HTTPS 证书或反向代理

手机手柄和游戏连接使用同一个 HTTPS 入口。反向代理需要转发 `/practice-signal` 的靶场配对请求。如果也提供对战房，需同时转发 `/ws`。GitHub Pages 的静态托管无法运行项目里的房间服务。

如果需要在局域网里玩，让证书覆盖的域名在电脑和 iPhone 上都解析到游戏 Mac 的局域网地址。用自己的域名和证书替换下面的示例值，然后让电脑打开相同的网址，再扫描新二维码。

```sh
NIGHTSHIFT_TLS_CERT=/path/to/fullchain.pem \
NIGHTSHIFT_TLS_KEY=/path/to/privkey.pem \
NIGHTSHIFT_ORIGIN=https://yard.example.com:8787 \
npm start
```

使用反向代理时，用 `NIGHTSHIFT_ORIGIN` 指定浏览器访问的 HTTPS 网址，二维码会使用该网址。用 `NIGHTSHIFT_IP` 可以指定直接走 HTTP 时二维码里的局域网 IP。

## 代码入口

| 模块 | 文件 |
| --- | --- |
| 电脑画面、声音与反馈 | [`web/screen.js`](web/screen.js)、[`web/scene.js`](web/scene.js)、[`web/audio.js`](web/audio.js) |
| 手机手柄与体感算法 | [`web/phone.js`](web/phone.js)、[`web/gyro.js`](web/gyro.js) |
| 扫码配对与 WebRTC | [`game/practice-signals.js`](game/practice-signals.js)、[`web/practice-link.js`](web/practice-link.js) |
| 游戏规则、HTTP 服务与 HTTPS 预览 | [`web/simulation.js`](web/simulation.js)、[`game/server.js`](game/server.js)、[`game/https-preview.js`](game/https-preview.js) |

## 场景与反馈

Three.js 实时渲染原创货柜、货台、维修机器人和第一人称装置。远景插画围在地图外，玩家可以转身看向不同方向。深蓝背景托住中景掩体，橙蓝区分玩家，黄铜色铁板可打穿，荧光绿留给电池和回合目标。物件用分段明暗、网点纹理和重点墨线表现漫画质感。

音轨由 Web Audio 实时合成。开火、金属、木箱、命中、铁板碎裂与得分各有声音。左右声像提示对手开火的大致方位，交火时音乐自动降低。开火、受击与近处碎裂有不同幅度的短振屏，场景和准星一起动，计时和比分留在原位。右上角可静音或关闭振屏。

`motion/` 保留原生 iPhone 的顶边瞄准、校准及平滑算法。网页体感沿用顶边方向，并把转动量转换为第一人称视角变化。

`npm test` 检查配对隔离、移动、铁板碰撞、命中、抢电池、再开一局和体感方向。

<details>
<summary>原创远景素材</summary>

使用内置 ImageGen 生成，游戏加载 `web/assets/night-shift-sky.jpg`。提示词如下。

> Original game environment matte painting for the far background of Night Shift Yard, an indie browser 3D FPS. Wide 2:1 horizon panorama, eye-level view toward a distant industrial freight district at late night. Low horizon occupies bottom 35 percent: silhouettes of freight cranes, stepped factory rooftops, two distant smokestacks, tiny sodium-yellow windows; upper 65 percent is layered midnight slate-blue cloud and mist. Bold hand-inked contours and understated offset-printed halftone dots in shadow transitions, simple cel-shaded shapes, desaturated cold navy and steely blue with sparse warm amber lights. Keep the center and the skyline low contrast so brighter interactive game objects stand out in front. Keep both far edges simple and the same dark blue. Background only. No foreground floor, no characters, no weapons, no marker symbols, no lettering, no frames, no logos.

</details>
