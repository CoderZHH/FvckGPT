# 夜班货场

电脑显示废土货场的第一人称画面，手机负责选择玩法、移动、转向、开火、换装、冲刺和重赛。每名玩家需要一台电脑和一部手机。

## 开玩

这台已装好依赖的 Mac 可以在 Finder 双击「打开夜班货场.command」。大厅会在浏览器打开，另一台电脑打开同一个网址即可。开房期间保留启动窗口，按 Ctrl+C 可结束本次试玩。

安装 Node.js 22 或更新版本及 cloudflared，在项目目录运行 `npm ci` 和 `npm run preview:https`。两台电脑打开同一个临时 HTTPS 地址。玩家各扫自己屏幕上的二维码，在手机上允许体感，侧立握稳并对准大屏完成校准。触屏模式可在引导中选择。

| 手机模式 | 规则 |
| --- | --- |
| 单人 · 限时清场 | 60 秒内命中巡逻机。连续命中依次获得 1 至 4 倍伤害积分，打空或受击会打断连击。结算显示本机纪录。 |
| 局域网联机 · 断电争夺 | 支持 1v1 至 5v5。房主用手机创建房间，其他玩家用手机输入房间码。两队满员、全员直连且准备后，房主点「开始对局」。击倒得 1 分，交付电池得 2 分。90 秒到时比较比分，同分为平局。 |

左摇杆移动，体感微调准星，右区横拖快速转身。冲刺沿摇杆方向发动，松杆时向前，冷却 4 秒。手机上可切换武器，快速抬起手机顶端或点击换弹。三种武器的射程、散布、换弹速度和弹药独立。单人结算可再次挑战，联机结算后可以返回同一房间重新准备。1v1 先得 5 分获胜，其余规模的目标为每队人数 × 4 分。

## 联机方式

四台设备连在可互访的同一局域网。HTTPS 入口提供游戏资源、配对和匹配。每只手柄与自己的电脑建立 WebRTC 连接，匹配后两台电脑也建立 WebRTC 连接。先入队的电脑计算命中、碰撞和得分，同步给另一台电脑。实时控制与画面状态走局域网，无需 GitHub 登录。

本地开发可运行 `npm start`，两台电脑打开房主局域网首页。普通 HTTP 可使用触屏；iPhone 体感需要 HTTPS。临时 HTTPS 地址随进程关闭而失效。

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

## 项目目录与代码入口

```text
web/     电脑画面、手机手柄、WebRTC 直连和共享游戏规则
game/    Node.js 网页服务、扫码配对、HTTPS 启动和集成测试
ios/     同款手机手柄的 iOS 工程，提供扫码和原生触感
art/     可编辑 GLB、实机预览与美术说明
motion/  原生 Swift 体感算法参考。网页体感由 web/gyro.js 负责
```

| 模块 | 文件 |
| --- | --- |
| 电脑画面、声音与反馈 | [`web/screen.js`](web/screen.js)、[`web/scene.js`](web/scene.js)、[`web/audio.js`](web/audio.js) |
| 手机手柄与体感算法 | [`web/phone.js`](web/phone.js)、[`web/gyro.js`](web/gyro.js) |
| 扫码配对与 WebRTC | [`game/practice-signals.js`](game/practice-signals.js)、[`web/practice-link.js`](web/practice-link.js) |
| 游戏规则、HTTP 服务与 HTTPS 预览 | [`web/simulation.js`](web/simulation.js)、[`game/server.js`](game/server.js)、[`game/https-preview.js`](game/https-preview.js) |

## 场景与反馈

当前美术为 34 × 46 米的废土转接站。黄绿色标记通向电池，青色标记沿货柜和掩体绕行，橙色标记通向可破拆的铁门。地面的轨道、路线和静态阴影共用贴图。模型以分段明暗、粗轮廓和做旧网点呈现漫画质感。选择「限时清场」即可在货场与巡逻机交火。双人开局时中央吊机放下电池。运芯者被击倒后，电池沿地面弹落，在掩体前停住。交付后吊机沿顶轨把电池送回中场。

卡宾打出黄绿短光束，散射器打出橙色扇形弹道，重脉冲器有青色长光束和沿弹道推进的波环。远距离命中会出现短促的落点闪光、准星确认和伤害数。原创合成器音轨由 Web Audio 实时播放，交火时乐声自动降低。右上角可静音或切换装备后坐反馈。可编辑 GLB、插画和风格说明见 [美术包](art/README.md)。

Safari 手柄用画面显示命中、受击和换弹反馈。支持网页震动的设备也会振动。iPhone 的原生触感可用 [iOS 手柄工程](ios/README.md) 验证，仍然用同一张二维码和本地 WebRTC 直连。

靶场镜头在下一渲染帧读取最新角度。联机对局由房主电脑计算并通过局域网逐帧发送状态。房间服务负责房间码、名单、准备和直连协商。自适应画质会在帧间隔持续偏长时降低内部画幅。准星不会跟随装备后坐移动。

`motion/` 保留原生 iPhone 的顶边瞄准、校准及平滑算法。网页体感沿用顶边方向，并把转动量转换为第一人称视角变化。

`npm test` 检查配对隔离、移动、铁板碰撞、命中、单人对练、抢电池、再开一局和体感方向。

<details>
<summary>原创远景素材</summary>

使用内置 ImageGen 生成，游戏加载 `web/assets/night-shift-sky.jpg`。提示词如下。

> Original game environment matte painting for the far background of Night Shift Yard, an indie browser 3D FPS. Wide 2:1 horizon panorama, eye-level view toward a distant industrial freight district at late night. Low horizon occupies bottom 35 percent: silhouettes of freight cranes, stepped factory rooftops, two distant smokestacks, tiny sodium-yellow windows; upper 65 percent is layered midnight slate-blue cloud and mist. Bold hand-inked contours and understated offset-printed halftone dots in shadow transitions, simple cel-shaded shapes, desaturated cold navy and steely blue with sparse warm amber lights. Keep the center and the skyline low contrast so brighter interactive game objects stand out in front. Keep both far edges simple and the same dark blue. Background only. No foreground floor, no characters, no weapons, no marker symbols, no lettering, no frames, no logos.

</details>
