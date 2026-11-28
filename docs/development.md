# 开发与部署

## 本地运行

执行 `npm ci` 安装锁定版本的依赖，再执行 `npm start`。默认端口是 8787，终端会打印局域网大厅地址。电脑通过这个地址加载游戏，手机扫二维码进入手柄。普通 HTTP 可以测试触屏控制。iPhone 体感使用受信任的 HTTPS 地址。

## 联机数据路径

1. 网页服务提供大屏、手柄、配对二维码和房间服务。房间码、名单、准备状态，以及用于建立 WebRTC 的协商消息经这个服务交换。
2. 手机和对应大屏浏览器建立 WebRTC 数据通道。移动、瞄准、开火等操作从手机直达自己的电脑。
3. 房主的大屏浏览器和其他玩家的大屏浏览器建立 WebRTC 数据通道。房主计算命中、碰撞、掉芯和比分，再将对局状态发给各玩家。对局控制与状态在局域网中传输。

快速 HTTPS 预览在本机启动 Node.js 和临时 Cloudflare Tunnel。浏览器通过 `/practice-mailbox` 用 HTTPS 交换信令。用 `npm start` 启动的标准服务通过 `/practice-signal` 的 WebSocket 交换信令。联机连接使用局域网 ICE 候选，适合可相互访问的同一局域网。

## 项目结构

| 目录 | 内容 |
| --- | --- |
| `game/` | Node.js 网页服务、临时 HTTPS 入口、房间管理、扫码信令和自动化测试 |
| `web/` | 电脑与手机网页、WebRTC 通道、游戏规则、操作、渲染和声音 |
| `ios/` | 可选的 iPhone 扫码手柄源码与 XcodeGen 配置 |
| `motion/` | Swift 体感算法参考 |
| `art/` | 可编辑 GLB、原始插画、实战录像和视觉说明 |

| 要改的内容 | 从这里入手 |
| --- | --- |
| 房间码、选队、准备和开局条件 | [房间规则](../game/battle-rooms.js)、[联机客户端](../web/relay-session.js)、[房间名单](../web/room-view.js) |
| 电脑配对和手柄页面 | [大屏入口](../web/screen.js)、[手机入口](../web/phone.js)、[扫码直连](../web/practice-link.js) |
| 体感方向与换弹手势 | [陀螺仪](../web/gyro.js)、[换弹识别](../web/reload-gesture.js) |
| 碰撞、武器、计分与单人巡逻机 | [比赛规则](../web/simulation.js)、[武器表](../web/weapons.js)、[单人挑战](../web/yard-drill.js) |
| 第一视角和美术 | [渲染入口](../web/scene.js)、[场景](../web/wasteland-environment.js)、[角色与武器](../web/wasteland-characters.js)、[战斗特效](../web/wasteland-effects.js)、[声音](../web/audio.js) |

## 自有 HTTPS 或反向代理

用受信任的证书和私钥直接启动标准服务。将示例域名替换成参赛设备能访问的实际域名。在纯局域网部署中，该域名应在各设备上解析到运行服务的电脑。

```sh
NIGHTSHIFT_TLS_CERT=/path/to/fullchain.pem \
NIGHTSHIFT_TLS_KEY=/path/to/privkey.pem \
NIGHTSHIFT_ORIGIN=https://yard.example.com:8787 \
npm start
```

如果由反向代理提供 TLS，使用 `NIGHTSHIFT_ORIGIN` 配置外部地址，并转发主页、静态资源及 `/practice-signal` 的 WebSocket 升级。直接使用普通 HTTP 时，可以用 `NIGHTSHIFT_IP` 指定二维码中使用的局域网地址。

## 验收

`npm test` 覆盖 1v1 至 5v5 房间、满员与准备条件、不同比赛设备的信令交换、配对更换、掉芯、碰撞、体感角度和武器数值。

实机验收时，检查扫码和校准、同房间分队、未满员和未准备提示、直连超时后重试、交火与夺芯、离开提示、赛后返回原房间。用 iPhone 另测体感手感和触感，用目标电脑测多人交火时的帧率。
