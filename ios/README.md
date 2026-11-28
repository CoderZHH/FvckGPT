# 夜班货场 iOS 手柄

iOS 手柄和 Safari 使用同一个操作页面、同一套配对和 WebRTC 直连。App 使用系统扫码器打开手柄，按开火、命中、受击、换弹和得分触发系统触感。iPhone 仍需要能访问电脑上启动的 HTTPS 靶场。

## 真机调试

需要 Xcode、XcodeGen 和 iOS 17 或更新版本的 iPhone。在项目根目录运行以下命令。

```sh
xcodegen generate --spec ios/project.yml
open ios/NightShiftController.xcodeproj
```

在 Xcode 选择自己的签名团队和已连接的 iPhone，运行 `NightShiftController`。电脑启动 `npm run preview:https` 并打开靶场。iPhone 在 App 内扫码，也可以粘贴大屏配对面板里的完整 HTTPS 手柄链接。首次按提示授权相机、局域网和动作方向。进入靶场后用开火、受击和换弹区分触感。
