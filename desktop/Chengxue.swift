import AppKit
import CryptoKit
import WebKit
import UniformTypeIdentifiers

final class StudyApplication: NSApplication {
    override func sendEvent(_ event: NSEvent) {
        if event.type == .keyDown, let owner = delegate as? StudyApp, owner.handleKey(event) { return }
        super.sendEvent(event)
    }
}

final class StudyApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var overlay: NSView!
    var statusLabel: NSTextField!
    var retryButton: NSButton!
    var savePanel: NSSavePanel?
    var commandCount = 0
    var blockedCount = 0
    var hidden = false
    var loadingBackend = false
    var pendingDownloads = [ObjectIdentifier: WKDownload]()
    var clipboardSnapshot: [[NSPasteboard.PasteboardType: Data]]?
    var qaSaveURL: URL?
    let qa = CommandLine.arguments.contains("--qa")
    var baseURL = URL(string: "http://127.0.0.1:18763")!
    var projectRoot = ""
    private var updateCache: (expires: TimeInterval, result: [String: Any])?
    private var updating = false
    private var installerReady = false
    var bundleVersion: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "" }
    var studySupport: URL { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("澄学 EJU", isDirectory: true) }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let configURL = Bundle.main.url(forResource: "runtime", withExtension: "json"), let data = try? Data(contentsOf: configURL), let config = try? JSONSerialization.jsonObject(with: data) as? [String: String], let root = config["projectRoot"] { projectRoot = root }
        if qa { baseURL = URL(string: "http://127.0.0.1:18764")! } else if embeddedRoot != nil { baseURL = URL(string: "http://127.0.0.1:18773")! }
        if qa, let index = CommandLine.arguments.firstIndex(of: "--qa-url"), CommandLine.arguments.count > index + 1, let url = URL(string: CommandLine.arguments[index + 1]), url.scheme == "http", ["127.0.0.1", "localhost"].contains(url.host ?? ""), url.port != 18763 { baseURL = url }
        if !qa, let identifier = Bundle.main.bundleIdentifier, let other = NSRunningApplication.runningApplications(withBundleIdentifier: identifier).first(where: { $0.processIdentifier != getpid() }) {
            other.activate(options: [.activateAllWindows]); DistributedNotificationCenter.default().postNotificationName(NSNotification.Name((Bundle.main.bundleIdentifier ?? "eju-study") + ".reopen"), object: nil, userInfo: nil, deliverImmediately: true); NSApp.terminate(nil); return
        }
        NSWindow.allowsAutomaticWindowTabbing = false
        makeMenus()
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = qa ? .nonPersistent() : .default()
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.userContentController.add(self, name: "ejuNative")
        configuration.userContentController.addUserScript(WKUserScript(source: bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: configuration)
        web.pageZoom = 1
        web.navigationDelegate = self; web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = false
        web.allowsLinkPreview = false; web.allowsMagnification = false
        if #available(macOS 13.3, *) { web.isInspectable = false }
        // 3.0: the scene fills the whole window; the traffic lights float over a transparent title bar.
        web.setValue(false, forKey: "drawsBackground")
        if #available(macOS 12.0, *) { web.underPageBackgroundColor = NSColor(red: 0.04, green: 0.055, blue: 0.094, alpha: 1) }
        let vis = NSScreen.main?.visibleFrame.size ?? NSSize(width: 1440, height: 900)
        let startSize = NSSize(width: min(1440, vis.width - 80), height: min(900, vis.height - 60))
        window = NSWindow(contentRect: NSRect(origin: .zero, size: startSize), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.titlebarAppearsTransparent = true; window.titleVisibility = .hidden
        window.backgroundColor = NSColor(red: 0.04, green: 0.055, blue: 0.094, alpha: 1)
        window.title = "澄学 EJU"; window.minSize = NSSize(width: 960, height: 680); window.tabbingMode = .disallowed; window.isReleasedWhenClosed = false; window.delegate = self; window.contentView = web
        window.setFrameAutosaveName(qa ? "ChengxueQA" : "ChengxueStudyWindow"); window.center()
        makeOverlay(); showWindow()
        if !qa { DistributedNotificationCenter.default().addObserver(self, selector: #selector(reopenNotification), name: NSNotification.Name((Bundle.main.bundleIdentifier ?? "eju-study") + ".reopen"), object: nil) }
        if qa { startQA() }
        startBackend()
    }
    func menuItem(_ title: String, _ key: String = "", _ action: Selector, mask: NSEvent.ModifierFlags = .command, target: AnyObject? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key); item.keyEquivalentModifierMask = mask; item.target = target; return item
    }
    func makeMenus() {
        let bar = NSMenu()
        func add(_ title: String, _ items: [NSMenuItem]) { let holder = NSMenuItem(title: title, action: nil, keyEquivalent: ""); let menu = NSMenu(title: title); items.forEach { menu.addItem($0) }; holder.submenu = menu; bar.addItem(holder) }
        add("澄学 EJU", [menuItem("关于澄学 EJU", "", #selector(about), target: self), .separator(), menuItem("隐藏澄学 EJU", "h", #selector(NSApplication.hide(_:)), target: NSApp), menuItem("隐藏其他", "h", #selector(NSApplication.hideOtherApplications(_:)), mask: [.command, .option], target: NSApp), .separator(), menuItem("退出澄学 EJU", "q", #selector(NSApplication.terminate(_:)), target: NSApp)])
        let navigation = ["今天", "计划", "练习", "复习", "模考", "笔记", "数据"].enumerated().map { i, name -> NSMenuItem in let item = menuItem(name, String(i + 1), #selector(navigateMenu(_:)), target: self); item.tag = i; return item }
        let settingsItem = menuItem("设置", ",", #selector(navigateMenu(_:)), target: self); settingsItem.tag = 7
        add("学习", navigation + [.separator(), settingsItem, .separator(), menuItem("播放／暂停音乐", "m", #selector(musicMenu), mask: [.command, .shift], target: self), menuItem("专注模式", "f", #selector(focusMenu), mask: [.command, .shift], target: self)])
        add("编辑", [menuItem("撤销", "z", Selector(("undo:"))), menuItem("重做", "z", Selector(("redo:")), mask: [.command, .shift]), .separator(), menuItem("剪切", "x", Selector(("cut:"))), menuItem("复制", "c", Selector(("copy:"))), menuItem("粘贴", "v", Selector(("paste:"))), menuItem("全选", "a", Selector(("selectAll:")))])
        add("窗口", [menuItem("关闭窗口", "w", #selector(closeStudyWindow), target: self), menuItem("最小化", "m", #selector(NSWindow.performMiniaturize(_:))), menuItem("缩放", "", #selector(NSWindow.performZoom(_:))), menuItem("进入／退出全屏", "f", #selector(NSWindow.toggleFullScreen(_:)), mask: [.command, .control])])
        add("帮助", [menuItem("键盘快捷键", "/", #selector(shortcutsMenu), target: self)])
        NSApp.mainMenu = bar
    }
    @objc func about() { NSApp.orderFrontStandardAboutPanel(options: [.applicationName: "澄学 EJU", .applicationVersion: (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "3", .credits: NSAttributedString(string: "2027 年 6 月 20 日 · 第 1 回 EJU")]) }
    @objc func navigateMenu(_ item: NSMenuItem) { command("navigate", page: Self.pages[item.tag]) }
    static let pages = ["today", "plan", "practice", "review", "mock", "notes", "insights", "settings"]
    @objc func musicMenu() { command("toggle-music") }
    @objc func zoomIn() { setZoom(web.pageZoom + 0.1) }
    @objc func zoomOut() { setZoom(web.pageZoom - 0.1) }
    @objc func zoomReset() { setZoom(1.0) }
    func setZoom(_ value: CGFloat) { let z = min(1.6, max(0.7, (value * 10).rounded() / 10)); web.pageZoom = z; UserDefaults.standard.set(Double(z), forKey: "pageZoom") }
    @objc func focusMenu() { command("toggle-focus") }
    @objc func shortcutsMenu() { command("shortcuts") }
    @objc func closeStudyWindow() { window.performClose(nil) }
    @objc func reopenNotification() { showWindow() }
    func handleKey(_ event: NSEvent) -> Bool {
        guard NSApp.keyWindow === window, window.attachedSheet == nil else { return false }
        let marked = (window.firstResponder as? NSTextInputClient)?.hasMarkedText() ?? false
        if marked { return false }
        if event.keyCode == 96 { blockedCount += 1; return true }
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        guard flags.contains(.command), !flags.contains(.control) else { return false }
        let key = (event.charactersIgnoringModifiers ?? "").lowercased()
        if !flags.contains(.option) {
            if !flags.contains(.shift), let number = Int(key), (1...7).contains(number) { if !event.isARepeat { command("navigate", page: Self.pages[number - 1]) }; return true }
            if !flags.contains(.shift), key == "," { if !event.isARepeat { command("navigate", page: "settings") }; return true }
            if flags.contains(.shift), ["m", "f"].contains(key) { if !event.isARepeat { command(key == "m" ? "toggle-music" : "toggle-focus") }; return true }
            if key == "/", !flags.contains(.shift) { if !event.isARepeat { command("shortcuts") }; return true }
        }
        if !flags.contains(.option), ["+", "=", "-", "0"].contains(key) { blockedCount += 1; return true }
        if ["r", "l", "t", "n", "p", "f", "[", "]", "{", "}", "+", "=", "-", "0"].contains(key) || (flags.contains(.option) && ["i", "j", "c", "u"].contains(key)) { blockedCount += 1; return true }
        return false
    }
    func command(_ action: String, page: String? = nil) { guard !((window.firstResponder as? NSTextInputClient)?.hasMarkedText() ?? false) else { return }; showWindow(); var detail = ["action": action]; if let page = page { detail["page"] = page }; commandCount += 1; emit("eju-command", detail: detail) }
    func emit(_ name: String, detail: [String: String]? = nil) { guard web != nil else { return }; let object: [String: Any] = detail.map { ["detail": $0] } ?? [:]; guard let data = try? JSONSerialization.data(withJSONObject: object), let json = String(data: data, encoding: .utf8) else { return }; web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('\(name)',\(json)))", completionHandler: nil) }
    func showWindow() { if window.isMiniaturized { window.deminiaturize(nil) }; window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true); if hidden { hidden = false; web.setAllMediaPlaybackSuspended(false) { if !self.hidden { self.emit("eju-window-visible") } } } }
    func hideMedia() { guard !hidden else { return }; hidden = true; emit("eju-window-hidden"); web.pauseAllMediaPlayback { if self.hidden { self.web.setAllMediaPlaybackSuspended(true, completionHandler: {}) } } }
    func windowShouldClose(_ sender: NSWindow) -> Bool { hideMedia(); sender.orderOut(nil); return false }
    func windowDidMiniaturize(_ notification: Notification) { hideMedia() }
    func windowDidDeminiaturize(_ notification: Notification) { showWindow() }
    func applicationDidHide(_ notification: Notification) { hideMedia() }
    func applicationDidUnhide(_ notification: Notification) { showWindow() }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showWindow(); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationWillTerminate(_ notification: Notification) {
        restoreClipboard(); emit("eju-window-hidden"); web?.pauseAllMediaPlayback {}
        if let server = embeddedServer, server.isRunning { server.terminate() }
        if installerReady, let (pid, executable) = reusedEmbedded, Self.embeddedExecutable(pid) == executable { _ = kill(pid, SIGTERM) }
    }
    func makeOverlay() {
        overlay = NSView(frame: web.bounds); overlay.appearance = NSAppearance(named: .darkAqua); overlay.autoresizingMask = [.width, .height]; overlay.wantsLayer = true; overlay.layer?.backgroundColor = NSColor(red: 0.04, green: 0.055, blue: 0.094, alpha: 1).cgColor
        let stack = NSStackView(); stack.orientation = .vertical; stack.spacing = 20; stack.translatesAutoresizingMaskIntoConstraints = false
        statusLabel = NSTextField(wrappingLabelWithString: "正在打开你的学习空间…"); statusLabel.font = .systemFont(ofSize: 19, weight: .medium); statusLabel.alignment = .center
        retryButton = NSButton(title: "重新连接", target: self, action: #selector(retry)); retryButton.isHidden = true
        stack.addArrangedSubview(statusLabel); stack.addArrangedSubview(retryButton); overlay.addSubview(stack)
        NSLayoutConstraint.activate([stack.centerXAnchor.constraint(equalTo: overlay.centerXAnchor), stack.centerYAnchor.constraint(equalTo: overlay.centerYAnchor), stack.widthAnchor.constraint(lessThanOrEqualToConstant: 540)])
        web.addSubview(overlay)
    }
    @objc func retry() { startBackend() }
    // Standalone build: the bundle carries its own node runtime and the whole app under Resources/app,
    // keeps the learner's data in ~/Library/Application Support/澄学 EJU, and serves on its own port.
    var embeddedServer: Process?
    private var reusedEmbedded: (Int32, URL)?
    var embeddedRoot: URL? {
        guard let res = Bundle.main.resourceURL else { return nil }
        let root = res.appendingPathComponent("app")
        return FileManager.default.fileExists(atPath: root.appendingPathComponent("server.mjs").path) ? root : nil
    }
    static func embeddedVersion(at health: URL) async -> String? {
        var request = URLRequest(url: health, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 1.5)
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        guard let (body, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              json["app"] as? String == "eju-study" else { return nil }
        return json["version"] as? String
    }
    nonisolated static func embeddedListeners(_ port: Int) throws -> [Int32] {
        let process = Process(); process.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof")
        process.arguments = ["-nP", "-iTCP:\(port)", "-sTCP:LISTEN", "-t"]
        let output = Pipe(); process.standardOutput = output; process.standardError = FileHandle.nullDevice
        try process.run()
        let data = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard [0, 1].contains(process.terminationStatus) else { throw UpdateProblem("无法检查独立版服务端口。") }
        return (String(data: data, encoding: .utf8) ?? "").split(whereSeparator: { $0.isWhitespace }).compactMap { Int32($0) }
    }
    nonisolated static func embeddedExecutable(_ pid: Int32) -> URL? {
        var path = [CChar](repeating: 0, count: 4096)
        guard proc_pidpath(pid, &path, UInt32(path.count)) > 0 else { return nil }
        return URL(fileURLWithPath: String(cString: path))
    }
    nonisolated static func ownedEmbeddedExecutable(_ pid: Int32) -> URL? {
        guard pid > 0, let executable = embeddedExecutable(pid), executable.path.hasSuffix("/Contents/Resources/node"),
              let identifier = Bundle.main.bundleIdentifier else { return nil }
        let app = executable.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        guard app.pathExtension == "app", NSDictionary(contentsOf: app.appendingPathComponent("Contents/Info.plist"))?["CFBundleIdentifier"] as? String == identifier else { return nil }
        return executable
    }
    nonisolated static func clearEmbeddedPort(_ port: Int, recognizedServer: Bool) throws {
        let listeners = try embeddedListeners(port)
        guard !listeners.isEmpty else { return }
        let occupied = UpdateProblem("独立版服务端口 \(port) 被其他进程占用。请关闭占用程序后重试。")
        guard recognizedServer, listeners.count == 1, let pid = listeners.first, let executable = ownedEmbeddedExecutable(pid) else { throw occupied }
        let confirmed = try embeddedListeners(port)
        guard !confirmed.isEmpty else { return }
        guard confirmed == [pid], embeddedExecutable(pid) == executable else { throw occupied }
        guard kill(pid, SIGTERM) == 0 || errno == ESRCH else { throw UpdateProblem("无法停止旧版独立服务。") }
        let deadline = ProcessInfo.processInfo.systemUptime + 5
        repeat {
            if try embeddedListeners(port).isEmpty { return }
            Thread.sleep(forTimeInterval: 0.15)
        } while ProcessInfo.processInfo.systemUptime < deadline
        throw UpdateProblem("旧版独立服务仍占用端口，请关闭旧版应用后重试。")
    }
    func startEmbedded(_ root: URL) {
        let fm = FileManager.default
        let support = studySupport
        let data = support.appendingPathComponent("data", isDirectory: true)
        try? fm.createDirectory(at: data, withIntermediateDirectories: true)
        let seed = root.appendingPathComponent("seed/state-v3.json")
        if !fm.fileExists(atPath: data.appendingPathComponent("state-v3.json").path), !fm.fileExists(atPath: data.appendingPathComponent("state-v2.json").path), fm.fileExists(atPath: seed.path) {
            try? fm.copyItem(at: seed, to: data.appendingPathComponent("state-v3.json"))
        }
        let health = baseURL.appendingPathComponent("api/health")
        let port = baseURL.port ?? 18773
        Task { @MainActor in
            defer { loadingBackend = false }
            reusedEmbedded = nil
            let observed = await Self.embeddedVersion(at: health)
            if observed != bundleVersion {
                do {
                    try await Task.detached { try Self.clearEmbeddedPort(port, recognizedServer: observed != nil) }.value
                } catch { showError((error as? UpdateProblem)?.message ?? "无法检查独立版服务端口。"); return }
                let p = Process(); p.executableURL = Bundle.main.resourceURL!.appendingPathComponent("node"); p.arguments = [root.appendingPathComponent("server.mjs").path]
                p.currentDirectoryURL = root
                var env = ProcessInfo.processInfo.environment; env["PORT"] = String(port); env["EJU_DATA_DIR"] = data.path
                env["PATH"] = (env["PATH"] ?? "") + ":/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:" + NSHomeDirectory() + "/.local/bin"
                p.environment = env
                let log = support.appendingPathComponent("server.log"); fm.createFile(atPath: log.path, contents: nil)
                if let h = try? FileHandle(forWritingTo: log) { p.standardOutput = h; p.standardError = h }
                do { try p.run(); embeddedServer = p } catch { showError(error.localizedDescription); return }
                var ready = false
                for _ in 0..<60 {
                    if await Self.embeddedVersion(at: health) == bundleVersion { ready = true; break }
                    if !p.isRunning { break }
                    try? await Task.sleep(nanoseconds: 250_000_000)
                }
                if !ready {
                    if p.isRunning { p.terminate() }
                    showError("启动独立版服务失败，请检查 server.log。"); return
                }
            } else if embeddedServer?.isRunning != true {
                reusedEmbedded = await Task.detached {
                    guard let listeners = try? Self.embeddedListeners(port), listeners.count == 1,
                          let pid = listeners.first, let executable = Self.ownedEmbeddedExecutable(pid) else { return nil as (Int32, URL)? }
                    return (pid, executable)
                }.value
            }
            web.load(URLRequest(url: baseURL))
        }
    }
    func startBackend() {
        guard !loadingBackend else { return }; loadingBackend = true; overlay.isHidden = false; statusLabel.stringValue = "正在打开你的学习空间…"; retryButton.isHidden = true
        if qa { loadingBackend = false; web.load(URLRequest(url: baseURL)); return }
        if let root = embeddedRoot { startEmbedded(root); return }
        DispatchQueue.global(qos: .userInitiated).async {
            let process = Process(); process.executableURL = URL(fileURLWithPath: "/usr/bin/python3"); process.arguments = [self.projectRoot + "/launch.py", "--server-only", "--json", "--no-error-dialog"]
            let pipe = Pipe(); process.standardOutput = pipe; process.standardError = pipe
            do { try process.run(); DispatchQueue.global().asyncAfter(deadline: .now() + 30) { if process.isRunning { process.terminate() } }; let data = pipe.fileHandleForReading.readDataToEndOfFile(); process.waitUntilExit(); DispatchQueue.main.async { self.loadingBackend = false; if process.terminationStatus == 0 { self.web.load(URLRequest(url: self.baseURL)) } else { let raw = String(data: data, encoding: .utf8) ?? ""; let parsed = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]; self.showError((parsed?["error"] as? String) ?? (raw.isEmpty ? "启动服务超时。" : raw)) } } }
            catch { DispatchQueue.main.async { self.loadingBackend = false; self.showError(error.localizedDescription) } }
        }
    }
    func showError(_ message: String) { overlay.isHidden = false; statusLabel.stringValue = "学习空间暂时无法连接。学习记录仍然保留。\n" + String(message.prefix(300)); retryButton.isHidden = false }
    func isLocal(_ url: URL?) -> Bool { guard let url = url else { return false }; return url.scheme == baseURL.scheme && url.host == baseURL.host && url.port == baseURL.port }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { overlay.isHidden = true; if qa { qaReply(["event": "ready", "url": webView.url?.absoluteString ?? ""]) } }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { if (error as NSError).code != NSURLErrorCancelled { showError(error.localizedDescription) } }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { if (error as NSError).code != NSURLErrorCancelled { showError(error.localizedDescription) } }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { showError("显示进程已停止，请重新连接。") }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.navigationType == .reload || action.navigationType == .backForward { blockedCount += 1; decisionHandler(.cancel); return }
        if action.shouldPerformDownload, isLocal(url) || url.scheme == "blob" { decisionHandler(.download); return }
        if isLocal(url), (url.path == "/" || url.path.isEmpty), action.targetFrame?.isMainFrame != false { decisionHandler(.allow); return }
        if action.targetFrame?.isMainFrame == false, isLocal(url) { decisionHandler(.allow); return }
        if ["https", "http", "mailto"].contains(url.scheme ?? ""), action.navigationType == .linkActivated || action.targetFrame == nil { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) { if let http = response.response as? HTTPURLResponse, http.value(forHTTPHeaderField: "Content-Disposition")?.lowercased().contains("attachment") == true { decisionHandler(.download) } else { decisionHandler(response.canShowMIMEType ? .allow : .cancel) } }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection; panel.canChooseDirectories = false; panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { response in completionHandler(response == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { if let url = action.request.url, ["http", "https", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }; return nil }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { retainDownload(download) }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { retainDownload(download) }
    func retainDownload(_ download: WKDownload) { download.delegate = self; pendingDownloads[ObjectIdentifier(download)] = download }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) { chooseSave(suggestedFilename) { completionHandler($0) } }
    func downloadDidFinish(_ download: WKDownload) { pendingDownloads.removeValue(forKey: ObjectIdentifier(download)); if qa { qaReply(["event": "download-finished"]) } }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { pendingDownloads.removeValue(forKey: ObjectIdentifier(download)); if qa { qaReply(["event": "download-failed", "error": error.localizedDescription]) } }
    func chooseSave(_ name: String, completion: @escaping (URL?) -> Void) {
        guard savePanel == nil else { completion(nil); return }
        let panel = NSSavePanel(); savePanel = panel; panel.title = "保存学习备份"; panel.nameFieldStringValue = URL(fileURLWithPath: name).lastPathComponent; panel.canCreateDirectories = true; panel.isExtensionHidden = false
        if qa, let destination = qaSaveURL { panel.directoryURL = destination.deletingLastPathComponent(); panel.nameFieldStringValue = destination.lastPathComponent; qaSaveURL = nil }
        if name.lowercased().hasSuffix(".json") { panel.allowedContentTypes = [.json] } else if name.lowercased().hasSuffix(".txt") { panel.allowedContentTypes = [.plainText] }
        panel.beginSheetModal(for: window) { response in self.savePanel = nil; completion(response == .OK ? panel.url : nil) }
    }
    func completeBridge(_ id: String, value: Any? = nil, error: String? = nil) { let object: [String: Any] = ["id": id, "ok": error == nil, "value": value ?? NSNull(), "error": error ?? ""]; guard let data = try? JSONSerialization.data(withJSONObject: object), let json = String(data: data, encoding: .utf8) else { return }; web.evaluateJavaScript("window.__ejuNativeComplete(\(json))", completionHandler: nil) }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, isLocal(message.frameInfo.request.url), let body = message.body as? [String: Any], let id = body["id"] as? String, let action = body["action"] as? String else { return }
        switch action {
        case "save-text":
            guard let name = body["name"] as? String, let text = body["text"] as? String, text.utf8.count <= 32 * 1024 * 1024 else { completeBridge(id, error: "备份内容过大或格式无效。"); return }
            chooseSave(name) { url in guard let url = url else { self.completeBridge(id, value: ["cancelled": true]); return }; do { try text.write(to: url, atomically: true, encoding: .utf8); self.completeBridge(id, value: ["saved": true, "filename": url.lastPathComponent]) } catch { self.completeBridge(id, error: error.localizedDescription) } }
        case "clipboard-write": guard let text = body["text"] as? String else { completeBridge(id, error: "复制内容无效。"); return }; NSPasteboard.general.clearContents(); let ok = NSPasteboard.general.setString(text, forType: .string); completeBridge(id, value: ok)
        case "clipboard-read": completeBridge(id, value: NSPasteboard.general.string(forType: .string) ?? "")
        case "check-update": checkUpdate(id)
        case "install-update": installUpdate(id)
        default: completeBridge(id, error: "不支持的操作。")
        }
    }
    let bridgeScript = """
    (()=>{let next=0;const pending=new Map();
      Object.defineProperty(window,'__ejuNativeComplete',{value:r=>{const p=pending.get(r.id);if(!p)return;pending.delete(r.id);r.ok?p.resolve(r.value):p.reject(new Error(r.error));}});
      const invoke=(action,extra={})=>new Promise((resolve,reject)=>{const id=String(++next);pending.set(id,{resolve,reject});window.webkit.messageHandlers.ejuNative.postMessage({id,action,...extra});});
      Object.defineProperty(window,'ejuNative',{value:Object.freeze({saveText:(name,text)=>invoke('save-text',{name:String(name),text:String(text)}),writeClipboard:text=>invoke('clipboard-write',{text:String(text)}),readClipboard:()=>invoke('clipboard-read'),checkUpdate:()=>invoke('check-update'),installUpdate:()=>invoke('install-update')}),writable:false});window.print=()=>{};
    })();
    """
    // Clipboard QA preserves every existing item/type in memory and never logs it.
    func captureClipboard() { guard qa, clipboardSnapshot == nil else { return }; clipboardSnapshot = (NSPasteboard.general.pasteboardItems ?? []).map { item in var data = [NSPasteboard.PasteboardType: Data](); for type in item.types { if let value = item.data(forType: type) { data[type] = value } }; return data } }
    func restoreClipboard() { guard let snapshot = clipboardSnapshot else { return }; NSPasteboard.general.clearContents(); let items = snapshot.map { data -> NSPasteboardItem in let item = NSPasteboardItem(); for (type, value) in data { item.setData(value, forType: type) }; return item }; NSPasteboard.general.writeObjects(items); clipboardSnapshot = nil }
    func qaReply(_ result: [String: Any]) { guard qa, JSONSerialization.isValidJSONObject(result), let data = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), let line = String(data: data, encoding: .utf8) else { return }; print("EJU_QA " + line); fflush(stdout) }
    func startQA() {
        qaReply(["event": "boot", "pid": getpid(), "url": baseURL.absoluteString])
        DispatchQueue.global(qos: .utility).async { while let line = readLine() { guard let data = line.data(using: .utf8), let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }; DispatchQueue.main.async { self.qaCommand(request) } }; DispatchQueue.main.async { NSApp.terminate(nil) } }
    }
    func qaCommand(_ request: [String: Any]) {
        guard qa else { return }; let id = request["id"] ?? NSNull()
        func reply(_ value: Any? = nil, _ error: String? = nil) { qaReply(["id": id, "ok": error == nil, "value": value ?? NSNull(), "error": error ?? ""]) }
        switch request["command"] as? String ?? "" {
        case "status": reply(["visible": window.isVisible, "key": window.isKeyWindow, "windowNumber": window.windowNumber, "windowCount": NSApp.windows.filter { $0 === self.window }.count, "url": web.url?.absoluteString ?? "", "loading": web.isLoading, "title": window.title, "commandCount": commandCount, "blockedCount": blockedCount, "savePanel": savePanel != nil, "persistent": web.configuration.websiteDataStore.isPersistent, "autoplayRequiresGesture": !web.configuration.mediaTypesRequiringUserActionForPlayback.isEmpty, "backForwardGestures": web.allowsBackForwardNavigationGestures])
        case "eval": web.evaluateJavaScript(request["script"] as? String ?? "null") { value, error in reply(value, error?.localizedDescription) }
        case "evalAsync": Task { @MainActor in do { let value = try await web.callAsyncJavaScript(request["script"] as? String ?? "return null", arguments: [:], in: nil, contentWorld: .page); reply(value) } catch { reply(nil, error.localizedDescription) } }
        case "key":
            var modifiers: NSEvent.ModifierFlags = []; for value in request["modifiers"] as? [String] ?? [] { switch value { case "command": modifiers.insert(.command); case "shift": modifiers.insert(.shift); case "option": modifiers.insert(.option); case "control": modifiers.insert(.control); default: break } }
            let characters = request["characters"] as? String ?? ""
            if let event = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: modifiers, timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, characters: characters, charactersIgnoringModifiers: characters, isARepeat: request["repeat"] as? Bool ?? false, keyCode: UInt16(request["keyCode"] as? Int ?? 0)) { NSApp.sendEvent(event); reply(true) } else { reply(nil, "无法创建按键事件") }
        case "menu": let action = request["action"] as? String ?? ""; if ["navigate", "toggle-music", "toggle-focus", "shortcuts"].contains(action) { command(action, page: request["page"] as? String); reply(true) } else { reply(nil, "未知菜单命令") }
        case "edit": let action = request["action"] as? String ?? ""; if ["copy:", "paste:", "cut:", "selectAll:", "undo:", "redo:"].contains(action) { reply(NSApp.sendAction(Selector(action), to: nil, from: nil)) } else { reply(nil, "未知编辑操作") }
        case "clipboard-preserve": captureClipboard(); reply(true)
        case "clipboard-restore": restoreClipboard(); reply(true)
        case "media": web.requestMediaPlaybackState { state in reply(["state": state.rawValue]) }
        case "snapshot":
            guard let path = request["path"] as? String else { reply(nil, "需要截图路径"); return }
            web.takeSnapshot(with: nil) { image, error in guard let image = image, let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) else { reply(nil, error?.localizedDescription ?? "截图失败"); return }; do { try png.write(to: URL(fileURLWithPath: path), options: .atomic); reply(["path": path, "width": bitmap.pixelsWide, "height": bitmap.pixelsHigh]) } catch { reply(nil, error.localizedDescription) } }
        case "hide": window.performClose(nil); reply(true)
        case "show": showWindow(); reply(true)
        case "save-panel-prepare":
            guard savePanel == nil, let path = request["path"] as? String else { reply(nil, "请在打开保存面板前指定目标路径"); return }
            qaSaveURL = URL(fileURLWithPath: path); reply(true)
        case "save-panel-info":
            guard let panel = savePanel else { reply(nil, "保存面板未打开"); return }
            reply(["url": panel.url?.path ?? "", "directory": panel.directoryURL?.path ?? "", "name": panel.nameFieldStringValue, "visible": panel.isVisible, "isKey": panel.isKeyWindow, "windowNumber": panel.windowNumber, "keyWindowNumber": NSApp.keyWindow?.windowNumber ?? 0, "keyWindowClass": NSApp.keyWindow.map { NSStringFromClass(type(of: $0)) } ?? "", "defaultButton": panel.defaultButtonCell != nil, "buttonEnabled": panel.defaultButtonCell?.isEnabled ?? false, "buttonAction": panel.defaultButtonCell?.action.map { NSStringFromSelector($0) } ?? "", "sheetParent": panel.sheetParent != nil])
        case "save-panel":
            guard let panel = savePanel else { reply(nil, "保存面板未打开"); return }
            let cancel = request["cancel"] as? Bool == true
            if !cancel {
                guard let path = request["path"] as? String else { reply(nil, "需要保存路径"); return }
                let url = URL(fileURLWithPath: path); panel.directoryURL = url.deletingLastPathComponent(); panel.nameFieldStringValue = url.lastPathComponent
            }
            // NSSavePanel.ok(_:) is an abstract stub on some current macOS
            // remote-panel implementations. Exercise the actual sheet control,
            // never call its completion handler or write a pretend test file.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                guard self.savePanel === panel else { reply(nil, "保存面板已关闭"); return }
                if request["method"] as? String != "keyboard" {
                    guard cancel || panel.url?.path == request["path"] as? String else { reply(nil, "保存面板实际选中的路径与测试目标不同"); return }
                    self.window.endSheet(panel, returnCode: cancel ? .cancel : .OK)
                    reply(true); return
                }
                if !cancel, let button = panel.defaultButtonCell { button.performClick(nil); reply(true); return }
                let target = NSApp.keyWindow ?? panel
                let characters = cancel ? "\u{1b}" : "\r"
                let code: UInt16 = cancel ? 53 : 36
                for type: NSEvent.EventType in [.keyDown, .keyUp] {
                    if let event = NSEvent.keyEvent(with: type, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: target.windowNumber, context: nil, characters: characters, charactersIgnoringModifiers: characters, isARepeat: false, keyCode: code) { NSApp.sendEvent(event) }
                }
                reply(true)
            }
        case "quit": reply(true); NSApp.terminate(nil)
        default: reply(nil, "未知诊断命令")
        }
    }
}
private struct UpdateProblem: Error {
    let message: String
    init(_ message: String) { self.message = message }
}

private struct UpdateRelease: Decodable {
    struct Asset: Decodable {
        let name: String
        let size: Int?
        let browser_download_url: URL
    }
    let tag_name: String
    let body: String?
    let published_at: String?
    let assets: [Asset]?
    var version: String { tag_name.hasPrefix("v") ? String(tag_name.dropFirst()) : tag_name }
    var archive: Asset? { assets?.first { $0.name == "Chengxue-EJU-\(version).zip" } }
    var checksum: Asset? { assets?.first { $0.name == "Chengxue-EJU-\(version).zip.sha256" } }
}

private final class UpdateDownload: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    let destination: URL
    let size: Int64
    let progress: @Sendable (String) -> Void
    let completion: CheckedContinuation<Void, Error>
    var lastFraction = 0.0
    var lastReport = ProcessInfo.processInfo.systemUptime
    var result: Result<Void, Error> = .failure(UpdateProblem("安装包下载失败。"))

    init(destination: URL, size: Int, progress: @escaping @Sendable (String) -> Void, completion: CheckedContinuation<Void, Error>) {
        self.destination = destination; self.size = Int64(size); self.progress = progress; self.completion = completion
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        let total = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : size
        guard total > 0 else { return }
        let fraction = min(1, Double(totalBytesWritten) / Double(total))
        let now = ProcessInfo.processInfo.systemUptime
        guard fraction - lastFraction >= 0.02 || now - lastReport >= 0.2 else { return }
        lastFraction = fraction; lastReport = now
        progress(String(format: "%.3f", locale: Locale(identifier: "en_US_POSIX"), fraction))
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard (downloadTask.response as? HTTPURLResponse)?.statusCode == 200 else { return }
        do {
            try FileManager.default.moveItem(at: location, to: destination)
            result = .success(())
        } catch { result = .failure(UpdateProblem("无法保存已下载的安装包。")) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        session.finishTasksAndInvalidate()
        if error != nil { completion.resume(throwing: UpdateProblem("安装包下载失败，请检查网络后重试。")) }
        else { completion.resume(with: result) }
    }

    static func fetch(_ url: URL, to destination: URL, size: Int, progress: @escaping @Sendable (String) -> Void) async throws {
        try await withCheckedThrowingContinuation { completion in
            let delegate = UpdateDownload(destination: destination, size: size, progress: progress, completion: completion)
            let config = URLSessionConfiguration.ephemeral
            config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 1800
            URLSession(configuration: config, delegate: delegate, delegateQueue: nil).downloadTask(with: url).resume()
        }
    }
}

private extension StudyApp {
    var updateMode: String { embeddedRoot == nil ? "dev" : "standalone" }

    nonisolated static func versionParts(_ version: String) -> [Int]? {
        let parts = version.split(separator: ".", omittingEmptySubsequences: false)
        let numbers = parts.compactMap { part in
            part.utf8.allSatisfy { (48...57).contains($0) } ? Int(part) : nil
        }
        return numbers.count == parts.count && !numbers.isEmpty ? numbers : nil
    }

    nonisolated static func newer(_ latest: String, than current: String) -> Bool {
        guard let a = versionParts(latest), let b = versionParts(current) else { return false }
        for i in 0..<max(a.count, b.count) {
            let next = i < a.count ? a[i] : 0, previous = i < b.count ? b[i] : 0
            if next != previous { return next > previous }
        }
        return false
    }

    func updateAPI() throws -> URL {
        if qa, let value = ProcessInfo.processInfo.environment["EJU_UPDATE_API"] {
            guard let url = URL(string: value), ["http", "https"].contains(url.scheme ?? ""),
                  ["localhost", "127.0.0.1"].contains(url.host ?? ""), url.port != 18763, url.port != 18773 else {
                throw UpdateProblem("QA 更新地址必须使用隔离的本地服务。")
            }
            return url
        }
        return URL(string: "https://api.github.com")!
    }

    func updateData(_ url: URL, githubAPI: Bool = false) async throws -> Data {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.setValue("Chengxue-EJU-Updater", forHTTPHeaderField: "User-Agent")
        if githubAPI {
            request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            request.setValue("2022-11-28", forHTTPHeaderField: "X-GitHub-Api-Version")
        }
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForResource = 15
        let session = URLSession(configuration: config)
        defer { session.finishTasksAndInvalidate() }
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await session.data(for: request) }
        catch { throw UpdateProblem(githubAPI ? "无法连接更新服务，请检查网络后重试。" : "无法下载校验文件，请检查网络后重试。") }
        switch (response as? HTTPURLResponse)?.statusCode {
        case 200: return data
        case 404 where githubAPI: throw UpdateProblem("暂时查不到已发布的版本。")
        case 403 where githubAPI, 429 where githubAPI: throw UpdateProblem("更新服务暂时限制访问，请稍后重试。")
        default: throw UpdateProblem(githubAPI ? "更新服务暂时不可用，请稍后重试。" : "无法下载校验文件。")
        }
    }

    func latestRelease() async throws -> UpdateRelease {
        guard let slug = Bundle.main.object(forInfoDictionaryKey: "ChengxueUpdateRepo") as? String,
              slug.range(of: #"\A[A-Za-z0-9-]+/[A-Za-z0-9_.-]+\z"#, options: .regularExpression) != nil,
              !slug.hasSuffix("/."), !slug.hasSuffix("/..") else { throw UpdateProblem("未配置更新源。") }
        let api = try updateAPI().appendingPathComponent("repos/\(slug)/releases/latest")
        let data = try await updateData(api, githubAPI: true)
        guard let release = try? JSONDecoder().decode(UpdateRelease.self, from: data),
              Self.versionParts(release.version) != nil else { throw UpdateProblem("更新服务返回的版本信息无效。") }
        return release
    }

    func checkUpdate(_ id: String) {
        if let cached = updateCache, cached.expires > ProcessInfo.processInfo.systemUptime {
            completeBridge(id, value: cached.result); return
        }
        Task { @MainActor in
            var result: [String: Any] = ["mode": updateMode, "current": bundleVersion, "available": false]
            do {
                let release = try await latestRelease()
                result["latest"] = release.version; result["notes"] = release.body; result["publishedAt"] = release.published_at
                result["size"] = release.archive?.size
                if release.archive == nil || release.checksum == nil { result["error"] = "这个版本还没有安装包。" }
                else { result["available"] = Self.newer(release.version, than: bundleVersion) }
            } catch { result["error"] = (error as? UpdateProblem)?.message ?? "暂时无法检查更新。" }
            updateCache = (ProcessInfo.processInfo.systemUptime + 600, result)
            completeBridge(id, value: result)
        }
    }

    func installUpdate(_ id: String) {
        guard embeddedRoot != nil else { completeBridge(id, error: "开发版请在项目目录里更新。"); return }
        guard !updating else { completeBridge(id, error: "已经有一次安装在进行中。"); return }
        let bundle = Bundle.main.bundleURL
        let target = bundle.resolvingSymlinksInPath()
        guard !bundle.path.contains("/AppTranslocation/"), !target.path.contains("/AppTranslocation/") else {
            completeBridge(id, error: "请先把 app 拖到「应用程序」文件夹再更新。"); return
        }
        let parent = target.deletingLastPathComponent()
        let fm = FileManager.default
        guard fm.isWritableFile(atPath: parent.path) else { completeBridge(id, error: "应用所在目录不可写。"); return }
        if qa {
            let temporaryRoots = [fm.temporaryDirectory, URL(fileURLWithPath: "/tmp", isDirectory: true)]
            guard temporaryRoots.contains(where: { parent.path.hasPrefix($0.resolvingSymlinksInPath().path + "/") }) else {
                completeBridge(id, error: "QA 只能替换临时目录中的应用。"); return
            }
        }

        updating = true
        completeBridge(id, value: ["started": true])
        Task { @MainActor in
            do {
                let release = try await latestRelease()
                guard let archive = release.archive, let checksum = release.checksum else { throw UpdateProblem("这个版本还没有安装包。") }
                let current = bundleVersion, identifier = Bundle.main.bundleIdentifier
                guard Self.newer(release.version, than: current) else { throw UpdateProblem("当前已经是最新版本。") }
                let api = try updateAPI()
                for asset in [archive, checksum] {
                    let url = asset.browser_download_url
                    let allowed = api.host == "api.github.com" ? (url.scheme == "https" && url.host == "github.com" && url.port == nil)
                        : (url.scheme == api.scheme && url.host == api.host && url.port == api.port)
                    guard allowed, url.user == nil, url.password == nil else { throw UpdateProblem("安装包下载地址无效。") }
                }

                let support = qa ? parent.appendingPathComponent(".eju-update-qa", isDirectory: true) : studySupport
                let caches = qa ? support : fm.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("app.chengxue.eju", isDirectory: true)
                let work = caches.appendingPathComponent("update/\(release.version)", isDirectory: true)
                let zip = work.appendingPathComponent(archive.name)
                if fm.fileExists(atPath: work.path) { try fm.removeItem(at: work) }
                try fm.createDirectory(at: work, withIntermediateDirectories: true)
                self.emit("eju-update-progress", detail: ["phase": "download", "fraction": "0"])
                try await UpdateDownload.fetch(archive.browser_download_url, to: zip, size: archive.size ?? 0) { fraction in
                    DispatchQueue.main.async { self.emit("eju-update-progress", detail: ["phase": "download", "fraction": fraction]) }
                }
                emit("eju-update-progress", detail: ["phase": "verify"])
                let checksumData = try await updateData(checksum.browser_download_url)
                let qaURL = qa ? baseURL : nil
                try await Task.detached(priority: .userInitiated) {
                    let fresh = try Self.verifyUpdate(zip, checksum: checksumData, work: work, identifier: identifier, version: release.version, current: current)
                    try Self.launchInstaller(work: work, support: support, target: target, fresh: fresh, qaURL: qaURL)
                }.value
                installerReady = true
                emit("eju-update-progress", detail: ["phase": "install"])
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { NSApp.terminate(nil) }
            } catch {
                updating = false
                emit("eju-update-progress", detail: ["phase": "error", "message": (error as? UpdateProblem)?.message ?? "无法写入更新文件，请检查磁盘空间和权限。"])
            }
        }
    }

    nonisolated static func runUpdateTool(_ path: String, _ args: [String]) -> Bool {
        let process = Process(); process.executableURL = URL(fileURLWithPath: path); process.arguments = args
        process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
        do { try process.run(); process.waitUntilExit(); return process.terminationStatus == 0 } catch { return false }
    }

    nonisolated static func verifyUpdate(_ zip: URL, checksum: Data, work: URL, identifier: String?, version: String, current: String) throws -> URL {
        let fm = FileManager.default
        let expected = String(data: checksum, encoding: .utf8)?.split(whereSeparator: { $0.isWhitespace }).first
        let file = try FileHandle(forReadingFrom: zip)
        defer { try? file.close() }
        var digest = SHA256()
        while let chunk = try file.read(upToCount: 1024 * 1024), !chunk.isEmpty { digest.update(data: chunk) }
        let actual = digest.finalize().map { String(format: "%02x", $0) }.joined()
        guard expected?.lowercased() == actual else {
            try? fm.removeItem(at: zip)
            throw UpdateProblem("安装包的 SHA-256 校验失败，请重新下载。")
        }

        let extracted = work.appendingPathComponent("extracted", isDirectory: true)
        try fm.createDirectory(at: extracted, withIntermediateDirectories: false)
        guard runUpdateTool("/usr/bin/ditto", ["-x", "-k", zip.path, extracted.path]) else { throw UpdateProblem("无法解开安装包。") }
        let apps = try fm.contentsOfDirectory(at: extracted, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            .filter { $0.pathExtension == "app" }
        guard apps.count == 1, let app = apps.first,
              let properties = try? app.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey]),
              properties.isDirectory == true, properties.isSymbolicLink == false else { throw UpdateProblem("安装包必须包含一个应用。") }
        let infoURL = app.appendingPathComponent("Contents/Info.plist")
        guard let infoData = try? Data(contentsOf: infoURL),
              let info = (try? PropertyListSerialization.propertyList(from: infoData, options: [], format: nil)) as? [String: Any],
              let identifier = identifier, info["CFBundleIdentifier"] as? String == identifier else { throw UpdateProblem("安装包的应用标识不符。") }
        guard info["CFBundleShortVersionString"] as? String == version, newer(version, than: current) else {
            throw UpdateProblem("安装包的版本号与发布版本不符。")
        }
        guard runUpdateTool("/usr/bin/codesign", ["--verify", "--deep", "--strict", app.path]) else { throw UpdateProblem("安装包的签名验证失败。") }
        guard runUpdateTool("/usr/bin/xattr", ["-cr", app.path]) else { throw UpdateProblem("无法清理新应用的扩展属性。") }
        return app
    }

    nonisolated static func launchInstaller(work: URL, support: URL, target: URL, fresh: URL, qaURL: URL?) throws {
        let fm = FileManager.default
        try fm.createDirectory(at: support, withIntermediateDirectories: true)
        let log = support.appendingPathComponent("update.log")
        let script = work.appendingPathComponent("install.sh")
        let ready = work.appendingPathComponent("installer-ready")
        let armed = work.appendingPathComponent("installer-armed")
        try installerScript.write(to: script, atomically: true, encoding: .utf8)
        let process = Process(); process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = ["-c", #"/usr/bin/nohup /bin/sh "$@" </dev/null >/dev/null 2>&1 &"#, "chengxue-update",
                             script.path, String(getpid()), target.path, fresh.path, log.path, ready.path, armed.path, qaURL?.absoluteString ?? ""]
        process.standardInput = FileHandle.nullDevice; process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
        try process.run(); process.waitUntilExit()
        let deadline = ProcessInfo.processInfo.systemUptime + 2
        while process.terminationStatus == 0, ProcessInfo.processInfo.systemUptime < deadline {
            if fm.fileExists(atPath: ready.path) {
                try Data().write(to: armed, options: .atomic)
                return
            }
            Thread.sleep(forTimeInterval: 0.05)
        }
        throw UpdateProblem("无法启动安装程序，请检查更新日志。")
    }

    nonisolated static var installerScript: String { #"""
    pid="$1"
    target="$2"
    fresh="$3"
    log="$4"
    ready="$5"
    armed="$6"
    qa_url="$7"
    exec >> "$log" 2>&1
    say() { echo "$(/bin/date '+%Y-%m-%d %H:%M:%S') $*"; }
    reopen() {
        if [ -n "$qa_url" ]; then
            /usr/bin/open -n "$target" --args --qa --qa-url "$qa_url"
        else
            /usr/bin/open -n "$target"
        fi
    }
    [ -d "$target" ] && [ -d "$fresh" ] && [ -w "$(/usr/bin/dirname "$target")" ] || { say "安装路径不可用。"; exit 1; }
    say "等待应用退出：$target"
    : > "$ready" || exit 1
    count=0
    while kill -0 "$pid" 2>/dev/null; do
        [ "$count" -lt 30 ] || { say "等待应用退出超时。"; exit 1; }
        /bin/sleep 1
        count=$((count + 1))
    done
    [ -f "$armed" ] || { say "安装未启动。"; exit 1; }
    stage=$(/usr/bin/mktemp -d "$(/usr/bin/dirname "$target")/.chengxue-update.XXXXXX") || exit 1
    trap '/bin/rm -rf "$stage"' EXIT
    /bin/mv "$fresh" "$stage/new.app" || { say "无法暂存新应用。"; reopen; exit 1; }
    old="$target.old-$(/bin/date '+%Y%m%d-%H%M%S')-$$"
    [ ! -e "$old" ] && /bin/mv "$target" "$old" || { say "无法移走旧应用。"; reopen; exit 1; }
    if ! /bin/mv "$stage/new.app" "$target"; then
        say "无法安装新应用，正在恢复旧应用。"
        if [ ! -e "$target" ] && /bin/mv "$old" "$target"; then reopen; else say "恢复失败，旧应用保存在：$old"; fi
        exit 1
    fi
    /bin/rm -rf "$old" || say "未能清理旧应用：$old"
    if reopen; then say "更新完成。"; else say "更新完成，无法自动打开应用。"; exit 1; fi
    """# }
}

let app = StudyApplication.shared
let owner = StudyApp()
app.delegate = owner
app.setActivationPolicy(.regular)
app.run()
