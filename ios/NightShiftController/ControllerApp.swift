import AVFoundation
import SwiftUI
import VisionKit

@main
struct NightShiftControllerApp: App {
    var body: some Scene {
        WindowGroup {
            ControllerRoot()
                .preferredColorScheme(.dark)
        }
    }
}

private struct ControllerRoot: View {
    @State private var controllerURL: URL?
    @State private var address = ""
    @State private var showingScanner = false
    @State private var errorText: String?

    private let ink = Color(red: 0.07, green: 0.12, blue: 0.10)
    private let accent = Color(red: 0.87, green: 0.95, blue: 0.48)

    var body: some View {
        Group {
            if let controllerURL {
                WebController(url: controllerURL) { failure in
                    errorText = failure
                    self.controllerURL = nil
                }
                .safeAreaInset(edge: .top, spacing: 0) {
                    HStack {
                        Button { self.controllerURL = nil } label: {
                            Label("断开手柄", systemImage: "chevron.left")
                                .font(.footnote.weight(.semibold))
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 7)
                    .background(ink)
                }
            } else {
                setup
            }
        }
        .tint(accent)
        .background(ink.ignoresSafeArea())
        .sheet(isPresented: $showingScanner) {
            NavigationStack {
                QRScanner(onValue: { value in
                    showingScanner = false
                    open(value)
                }, onFailure: {
                    showingScanner = false
                    errorText = "相机暂时不可用。可以从电脑复制手柄链接。"
                })
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("扫电脑上的二维码")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("取消") { showingScanner = false }
                    }
                }
            }
        }
    }

    private var setup: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Image(systemName: "scope")
                    .font(.system(size: 43, weight: .light))
                    .foregroundStyle(accent)
                    .accessibilityHidden(true)
                Text("夜班货场")
                    .font(.largeTitle.weight(.black))
                Text("电脑打开靶场，iPhone 接入同一个 Wi-Fi，再扫描大屏上的配对码。")
                    .foregroundStyle(.secondary)
                if DataScannerViewController.isSupported {
                    Button { beginScanning() } label: {
                        Label("扫描配对码", systemImage: "qrcode.viewfinder")
                            .frame(maxWidth: .infinity, minHeight: 35)
                            .font(.headline)
                    }
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(ink)
                }
                TextField("HTTPS 手柄链接", text: $address)
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(13)
                    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                    .onSubmit { open(address) }
                Button("连接手柄") { open(address) }
                    .buttonStyle(.bordered)
                    .disabled(address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if let errorText {
                    Text(errorText)
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
            }
            .frame(maxWidth: 460)
            .padding(24)
            .frame(maxWidth: .infinity)
        }
    }

    private func open(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), url.scheme == "https", url.host != nil,
              url.user == nil, url.password == nil, url.path == "/controller",
              let code = url.fragment, code.range(of: "^[0-9a-f]{32}$", options: .regularExpression) != nil else {
            errorText = "请扫描游戏里的 HTTPS 配对码，或粘贴完整的手机手柄链接。"
            return
        }
        errorText = nil
        controllerURL = url
    }

    private func beginScanning() {
        Task {
            if AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
                _ = await AVCaptureDevice.requestAccess(for: .video)
            }
            if DataScannerViewController.isAvailable {
                showingScanner = true
            } else {
                errorText = "需要相机权限才能扫码，也可以直接粘贴手柄链接。"
            }
        }
    }
}

private struct QRScanner: UIViewControllerRepresentable {
    var onValue: (String) -> Void
    var onFailure: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(view: self) }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])],
                                                qualityLevel: .balanced, recognizesMultipleItems: false,
                                                isHighFrameRateTrackingEnabled: false, isPinchToZoomEnabled: true,
                                                isGuidanceEnabled: true, isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        DispatchQueue.main.async { [weak scanner] in
            guard let scanner else { return }
            do { try scanner.startScanning() }
            catch { onFailure() }
        }
        return scanner
    }

    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}

    static func dismantleUIViewController(_ uiViewController: DataScannerViewController, coordinator: Coordinator) {
        uiViewController.stopScanning()
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let view: QRScanner
        var finished = false

        init(view: QRScanner) { self.view = view }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !finished, let item = addedItems.first, case let .barcode(barcode) = item,
                  let value = barcode.payloadStringValue else { return }
            finished = true
            dataScanner.stopScanning()
            view.onValue(value)
        }
    }
}
