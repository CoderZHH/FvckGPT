import SwiftUI
import UIKit
import WebKit

struct WebController: UIViewRepresentable {
    let url: URL
    let onFailure: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(url: url, onFailure: onFailure) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.userContentController.add(context.coordinator, name: Coordinator.bridgeName)
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = context.coordinator
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.07, green: 0.12, blue: 0.10, alpha: 1)
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.load(URLRequest(url: url))
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.stopLoading()
        web.navigationDelegate = nil
        web.configuration.userContentController.removeScriptMessageHandler(forName: Coordinator.bridgeName)
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        static let bridgeName = "nightshiftHaptics"

        private let url: URL
        private let onFailure: (String) -> Void
        private let shot = UIImpactFeedbackGenerator(style: .light)
        private let hit = UIImpactFeedbackGenerator(style: .rigid)
        private let damage = UIImpactFeedbackGenerator(style: .heavy)
        private let action = UISelectionFeedbackGenerator()
        private let award = UINotificationFeedbackGenerator()
        private var lastPulse: TimeInterval = -.infinity

        init(url: URL, onFailure: @escaping (String) -> Void) {
            self.url = url
            self.onFailure = onFailure
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard navigationAction.targetFrame?.isMainFrame == true,
                  let destination = navigationAction.request.url,
                  destination.scheme == "https", destination.host == url.host,
                  destination.path == "/controller", destination.port == url.port else {
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            shot.prepare()
            hit.prepare()
            damage.prepare()
            action.prepare()
            award.prepare()
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code == NSURLErrorCancelled { return }
            onFailure("手柄页面无法打开。请确认预览仍在运行，再扫一次新的配对码。")
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            onFailure("手柄页面已中断，请重新扫码。")
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == Self.bridgeName, message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "https",
                  message.frameInfo.securityOrigin.host == url.host,
                  let kind = message.body as? String else { return }
            let now = ProcessInfo.processInfo.systemUptime
            guard now - lastPulse >= 0.075 else { return }
            switch kind {
            case "shot": shot.impactOccurred()
            case "hit", "break": hit.impactOccurred()
            case "damage", "drop": damage.impactOccurred()
            case "reload", "reload-start", "empty", "dash": action.selectionChanged()
            case "score", "delivery", "pickup": award.notificationOccurred(.success)
            default: return
            }
            lastPulse = now
        }
    }
}
