# 夜班货场

一款局域网里的第一人称对战游戏。电脑浏览器显示画面，手机扫码就能移动、转视角、开火。90 秒内把中央电池送回己方货台，先拿两分获胜。

## 开房

需要 Node.js 22 或更新版本。在项目目录运行：

```sh
npm ci
npm start
```

房主用电脑打开终端打印的「本机」地址。朋友在同一 Wi-Fi 下，用自己的电脑打开「局域网」地址。每个人扫各自屏幕上的二维码，电脑点击「准备开打」。一个房间支持两名玩家。等待时可以进场练习。

- 手机左边是移动摇杆，右边是开火。用体感时点「开启体感」，允许动作与方向，充电口朝自己、手机侧立、顶边指向大屏中央，再点「校准准星」。转动手机控制第一人称视角，拖动右区可快速转身。触屏模式支持按住「开火」并拖动视角。
- 电脑也可用 WASD 和鼠标。点击场景锁定鼠标，用 Esc 释放。
- 瞄准铁板开三次火，可以打通侧边通道。搬电池被击倒时，电池掉在现场，玩家三秒后复活。
- 普通热点 HTTP 可以配对和用触屏。iPhone 网页体感需要 Safari 信任的 HTTPS。电脑端「连手机」面板会显示当前是否能用体感。`NIGHTSHIFT_IP` 可指定二维码里的局域网地址。
- 电脑从 `localhost` 打开游戏时，切换 Wi-Fi 或手机热点后，二维码会自动跟随电脑的局域网 IP。换网络后用手机重新扫电脑上的码。

## 用 HTTPS 开启 iPhone 体感

手机手柄和游戏连接使用同一个 HTTPS 入口。入口需要有 Safari 信任的证书，并将 `/ws` 上的 WebSocket 请求交给这台游戏主机。GitHub 仓库用于存放源码，GitHub Pages 的静态托管无法运行项目里的房间服务。

如果需要在局域网里玩，让证书覆盖的域名在电脑和 iPhone 上都解析到游戏 Mac 的局域网地址。用自己的域名和证书替换下面的示例值，然后让电脑打开相同的网址，再扫描新二维码。

```sh
NIGHTSHIFT_TLS_CERT=/path/to/fullchain.pem \
NIGHTSHIFT_TLS_KEY=/path/to/privkey.pem \
NIGHTSHIFT_ORIGIN=https://yard.example.com:8787 \
npm start
```

也可以让已有的 HTTPS 反向代理在前面处理证书。代理将网页和 `/ws` 转发给 `npm start` 启动的服务，并保留原始 `Host`。此时只需用 `NIGHTSHIFT_ORIGIN` 指定代理对玩家开放的 HTTPS 网址。证书私钥保留在主机上。

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
