import AppKit
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
    var projectRoot = "~/Projects/eju-study"

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let configURL = Bundle.main.url(forResource: "runtime", withExtension: "json"), let data = try? Data(contentsOf: configURL), let config = try? JSONSerialization.jsonObject(with: data) as? [String: String], let root = config["projectRoot"] { projectRoot = root }
        if qa { baseURL = URL(string: "http://127.0.0.1:18764")! }
        if qa, let index = CommandLine.arguments.firstIndex(of: "--qa-url"), CommandLine.arguments.count > index + 1, let url = URL(string: CommandLine.arguments[index + 1]), url.scheme == "http", ["127.0.0.1", "localhost"].contains(url.host ?? ""), url.port != 18763 { baseURL = url }
        if !qa, let identifier = Bundle.main.bundleIdentifier, let other = NSRunningApplication.runningApplications(withBundleIdentifier: identifier).first(where: { $0.processIdentifier != getpid() }) {
            other.activate(options: [.activateAllWindows]); DistributedNotificationCenter.default().postNotificationName(NSNotification.Name("local.user.eju-study.reopen"), object: nil, userInfo: nil, deliverImmediately: true); NSApp.terminate(nil); return
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
        web.navigationDelegate = self; web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = false
        if #available(macOS 13.3, *) { web.isInspectable = false }
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 850), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "澄学 EJU"; window.minSize = NSSize(width: 920, height: 680); window.tabbingMode = .disallowed; window.isReleasedWhenClosed = false; window.delegate = self; window.contentView = web
        window.setFrameAutosaveName(qa ? "ChengxueQA" : "ChengxueStudyWindow"); window.center()
        makeOverlay(); showWindow()
        if !qa { DistributedNotificationCenter.default().addObserver(self, selector: #selector(reopenNotification), name: NSNotification.Name("local.user.eju-study.reopen"), object: nil) }
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
        let navigation = ["今日学习", "课前复习", "我的笔记", "每日复盘"].enumerated().map { i, name -> NSMenuItem in let item = menuItem(name, String(i + 1), #selector(navigateMenu(_:)), target: self); item.tag = i; return item }
        add("学习", navigation + [.separator(), menuItem("播放／暂停音乐", "m", #selector(musicMenu), mask: [.command, .shift], target: self), menuItem("开始／暂停专注", "f", #selector(focusMenu), mask: [.command, .shift], target: self)])
        add("编辑", [menuItem("撤销", "z", Selector(("undo:"))), menuItem("重做", "z", Selector(("redo:")), mask: [.command, .shift]), .separator(), menuItem("剪切", "x", Selector(("cut:"))), menuItem("复制", "c", Selector(("copy:"))), menuItem("粘贴", "v", Selector(("paste:"))), menuItem("全选", "a", Selector(("selectAll:")))])
        add("窗口", [menuItem("关闭窗口", "w", #selector(closeStudyWindow), target: self), menuItem("最小化", "m", #selector(NSWindow.performMiniaturize(_:))), menuItem("缩放", "", #selector(NSWindow.performZoom(_:))), menuItem("进入／退出全屏", "f", #selector(NSWindow.toggleFullScreen(_:)), mask: [.command, .control])])
        add("帮助", [menuItem("键盘快捷键", "/", #selector(shortcutsMenu), target: self)])
        NSApp.mainMenu = bar
    }
    @objc func about() { NSApp.orderFrontStandardAboutPanel(options: [.applicationName: "澄学 EJU", .applicationVersion: "1.3.0", .credits: NSAttributedString(string: "每天一步，学有所成。")]) }
    @objc func navigateMenu(_ item: NSMenuItem) { command("navigate", page: ["today", "learning", "notebook", "report"][item.tag]) }
    @objc func musicMenu() { command("toggle-music") }
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
            if !flags.contains(.shift), let number = Int(key), (1...4).contains(number) { if !event.isARepeat { command("navigate", page: ["today", "learning", "notebook", "report"][number - 1]) }; return true }
            if flags.contains(.shift), ["m", "f"].contains(key) { if !event.isARepeat { command(key == "m" ? "toggle-music" : "toggle-focus") }; return true }
            if key == "/", !flags.contains(.shift) { if !event.isARepeat { command("shortcuts") }; return true }
        }
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
    func applicationWillTerminate(_ notification: Notification) { restoreClipboard(); emit("eju-window-hidden"); web?.pauseAllMediaPlayback {} }
    func makeOverlay() {
        overlay = NSView(frame: web.bounds); overlay.autoresizingMask = [.width, .height]; overlay.wantsLayer = true; overlay.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        let stack = NSStackView(); stack.orientation = .vertical; stack.spacing = 20; stack.translatesAutoresizingMaskIntoConstraints = false
        statusLabel = NSTextField(wrappingLabelWithString: "正在打开你的学习空间…"); statusLabel.font = .systemFont(ofSize: 19, weight: .medium); statusLabel.alignment = .center
        retryButton = NSButton(title: "重新连接", target: self, action: #selector(retry)); retryButton.isHidden = true
        stack.addArrangedSubview(statusLabel); stack.addArrangedSubview(retryButton); overlay.addSubview(stack)
        NSLayoutConstraint.activate([stack.centerXAnchor.constraint(equalTo: overlay.centerXAnchor), stack.centerYAnchor.constraint(equalTo: overlay.centerYAnchor), stack.widthAnchor.constraint(lessThanOrEqualToConstant: 540)])
        web.addSubview(overlay)
    }
    @objc func retry() { startBackend() }
    func startBackend() {
        guard !loadingBackend else { return }; loadingBackend = true; overlay.isHidden = false; statusLabel.stringValue = "正在打开你的学习空间…"; retryButton.isHidden = true
        if qa { loadingBackend = false; web.load(URLRequest(url: baseURL)); return }
        DispatchQueue.global(qos: .userInitiated).async {
            let process = Process(); process.executableURL = URL(fileURLWithPath: "/usr/bin/python3"); process.arguments = [self.projectRoot + "/launch.py", "--server-only", "--json", "--no-error-dialog"]
            let pipe = Pipe(); process.standardOutput = pipe; process.standardError = pipe
            do { try process.run(); let data = pipe.fileHandleForReading.readDataToEndOfFile(); process.waitUntilExit(); DispatchQueue.main.async { self.loadingBackend = false; if process.terminationStatus == 0 { self.web.load(URLRequest(url: self.baseURL)) } else { self.showError(String(data: data, encoding: .utf8) ?? "启动服务失败。") } } }
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
        default: completeBridge(id, error: "不支持的操作。")
        }
    }
    let bridgeScript = """
    (()=>{let next=0;const pending=new Map();
      Object.defineProperty(window,'__ejuNativeComplete',{value:r=>{const p=pending.get(r.id);if(!p)return;pending.delete(r.id);r.ok?p.resolve(r.value):p.reject(new Error(r.error));}});
      const invoke=(action,extra={})=>new Promise((resolve,reject)=>{const id=String(++next);pending.set(id,{resolve,reject});window.webkit.messageHandlers.ejuNative.postMessage({id,action,...extra});});
      Object.defineProperty(window,'ejuNative',{value:Object.freeze({saveText:(name,text)=>invoke('save-text',{name:String(name),text:String(text)}),writeClipboard:text=>invoke('clipboard-write',{text:String(text)}),readClipboard:()=>invoke('clipboard-read')}),writable:false});window.print=()=>{};
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
let app = StudyApplication.shared
let owner = StudyApp()
app.delegate = owner
app.setActivationPolicy(.regular)
app.run()
