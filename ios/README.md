# 夜班货场 iOS 手柄

iOS 手柄通过系统相机扫码，在 App 内载入同一个 HTTPS 手柄页面。房间、体感和游戏操作共用网页实现。App 为开火、受击、换弹、掉芯和交付等事件提供系统触感。也可以直接用 Safari 扫码游玩。

## 真机运行

需要 Xcode、XcodeGen 和运行 iOS 17 或更新版本的 iPhone。从项目根目录运行以下命令。

```sh
xcodegen generate --spec ios/project.yml
open ios/NightShiftController.xcodeproj
```

1. 在 Xcode 选择自己的签名团队和已连接的 iPhone，运行 `NightShiftController`。
2. 按 [启动说明](../README.md#启动) 开启 HTTPS 大厅。让电脑和 iPhone 接入同一个可互访的局域网。
3. 在 App 内扫描自己电脑上的配对二维码。也可以粘贴大屏配对面板中带配对信息的完整 HTTPS 手柄链接。
4. 按提示允许相机、局域网和动作方向。在单人或联机对局中检查开火、命中、换弹和交付时的触感。

`project.yml` 是 Xcode 工程配置。生成的 `NightShiftController.xcodeproj` 可由 XcodeGen 重建。
