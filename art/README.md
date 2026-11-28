# 夜班货场美术包

场景是荒废的货运转接站。以风格库的「混合媒介漫画」组织三维空间，「美式漫画」和「复古印刷」负责黑色墨线、半色调网点和做旧表面。「构成主义」用于导视、倾斜的命中字幕和龙门架的结构节奏，「磁带未来风」用于巡逻机、发射器与电池。

场景以石油青钢材、锈铜和暖灰混凝土为底。橙色与青色识别阵营，黄绿色给电池和确认命中，亮奶油色用于关键信息。远景降低反差，场内的掩体边缘、敌方护甲和走位空间保持可读。

## 可编辑模型

| 文件 | 内容 |
| --- | --- |
| [freight-yard.glb](models/freight-yard.glb) | 34 × 46 米 3D 货场、三条路线、货柜、钢架龙门、围挡、补给箱、两队回收位和破拆门 |
| [salvager-ember.glb](models/salvager-ember.glb) | 橙色重装回收员 |
| [salvager-tide.glb](models/salvager-tide.glb) | 青色轻装回收员与巡逻机造型 |
| [arc-emitter.glb](models/arc-emitter.glb) | 电弧卡宾、手套和前臂 |
| [shard-scatterer.glb](models/shard-scatterer.glb) | 宽头裂片散射器 |
| [heavy-pulse.glb](models/heavy-pulse.glb) | 双侧长导轨、外露青色线圈和悬浮能量芯的重脉冲器 |
| [salvage-power-cell.glb](models/salvage-power-cell.glb) | 荧光电池，带保护壳和提环 |

GLB 以米为单位，纹理内嵌。货场包含放芯、交付回运和击落三段动画。两名回收员各有待机、横移急停、肩部受击和倒地四段动作。三件设备各有独立的换弹片段，时长与对局一致。可在 Blender 的动作编辑器里选择片段查看。游戏内的墨线、线圈亮度、弹道、门板破拆和声音由客户端实时生成。实现见 [环境模型](../web/wasteland-environment.js)、[角色与设备](../web/wasteland-characters.js)、[战斗特效](../web/wasteland-effects.js) 和 [音频](../web/audio.js)。

## 插画和天空贴图

两张图均通过内置 ImageGen 从文字生成，并转换为 JPG 以控制网页资源体积。

### 主视觉

[全尺寸主视觉](illustrations/wasteland-key-art.jpg) 可用于展示和继续制作。[网页版本](../web/assets/wasteland-key-art.jpg) 用于靶场和对战大厅。

> Use case: illustration-story. Hero key art for original browser FPS Night Shift Yard, a cinematic horizontal 3:2 illustrated splash art. Full scene, low three-quarter camera in a post-collapse freight station with giant loading gantry and ribbed petrol-teal shipping modules receding into dust. Two rival original human-scale salvage automatons in muted graphite armor with distinctive ochre-orange and storm-cyan panels weave across the yard, one carrying a luminous chartreuse industrial power cell. Iconic wedge helmets, dark slits, articulated industrial armor, retro mechanical salvage equipment, graphic silhouettes; sharp inky motion streaks and hot amber debris against deep cool teal. Palette deep petroleum / dark steel, warm newsprint cream and dust, oxidized amber, with only one acid-green objective focal point. Premium American comic / constructivist graphic composition, mixed-media 3D forms drawn and screen-printed, bold angular black outlines, limited color separations, selective halftone and subtle registration offset in shadow. Asymmetric strong diagonal, clear foreground/midground/background, single graphic flash drawn like a comic. No writing, no title, no logos, no gore, no real firearm product design, no layout template, no white border.

### 三维天空贴图

[wasteland-horizon.jpg](../web/assets/wasteland-horizon.jpg) 用于环绕货场的 2:1 远景。

> Use case: stylized-concept. A finished backdrop texture meant to wrap around a real-time 3D videogame arena as a 360-degree horizon cylinder. Extra wide equirectangular 2:1 panoramic composition with horizon joining the left and right edges in both color and height, original abandoned freight transfer station in a post-collapse dust basin. Distant refinery chimneys, bent loading cranes, skeletal conveyor structures and broad far mesas, silhouettes mostly in the bottom third. Storm-teal sky and dense dirty cream / burnt-sienna dust near the low horizon, slightly brighter in the left-center, dark desaturated petrol overhead. Vintage American wastepunk printed comic, hybrid Comic-Print 3D, confident black ink contours, selective shadow halftones, coarse screen-printed paper grain and gently misregistered muted ochre in the darkest edges. Cinematic but low-contrast accents so the actual 3D foreground has hierarchy. Backdrop only, original, with no foreground street/floor, no people, no logos, no type, no frames, no silhouettes of weapons.

## 实际画面

- [双人对局实录，击倒运芯者、拾取与交付](previews/relay-combat-animation.mp4)
- [第一视角实录，三种设备的换弹动作](previews/equipment-animation.mp4)

两段录像直接采集桌面端的 3D 画布，均为无声画面。

- [大屏行动大厅](previews/wasteland-lobby.jpg)
- [手机玩法选择](previews/action-selection.jpg)

- [对练交火](previews/wasteland-sparring.jpg)
- [新版货场与重脉冲器](previews/wasteland-loadout.jpg)
- [铁门破拆](previews/wasteland-breach.jpg)
- [手机手柄](previews/wasteland-controller.jpg)
