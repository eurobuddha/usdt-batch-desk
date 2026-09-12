import AppKit
import Foundation
import Network

// A static-file host only. Wallet RPC and signing remain inside Chrome/MetaMask.
final class LocalServer {
    let root: URL
    let port: UInt16
    let listener: NWListener
    let queue = DispatchQueue(label: "app.usdtbatchdesk.http")
    var onReady: (() -> Void)?
    var onFailure: ((Error) -> Void)?

    init(root: URL, port: UInt16) throws {
        self.root = root.resolvingSymlinksInPath().standardizedFileURL
        self.port = port
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
        listener = try NWListener(using: parameters)
    }

    func start() {
        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready: DispatchQueue.main.async { self?.onReady?() }
            case .failed(let error): DispatchQueue.main.async { self?.onFailure?(error) }
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            guard let self else { connection.cancel(); return }
            connection.start(queue: self.queue)
            self.queue.asyncAfter(deadline: .now() + 10) { connection.cancel() }
            self.receive(connection, data: Data())
        }
        listener.start(queue: queue)
    }

    func receive(_ connection: NWConnection, data: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] chunk, _, complete, error in
            guard let self else { connection.cancel(); return }
            var request = data
            if let chunk { request.append(chunk) }
            if request.count > 16384 { self.reply(connection, status: 431); return }
            if let end = request.range(of: Data("\r\n\r\n".utf8)) {
                self.handle(connection, header: String(decoding: request[..<end.lowerBound], as: UTF8.self))
            } else if complete || error != nil { connection.cancel() }
            else { self.receive(connection, data: request) }
        }
    }

    func handle(_ connection: NWConnection, header: String) {
        let lines = header.components(separatedBy: "\r\n")
        let first = (lines.first ?? "").split(separator: " ")
        guard first.count == 3 else { reply(connection, status: 400); return }
        let method = String(first[0])
        guard method == "GET" || method == "HEAD" else { reply(connection, status: 405); return }
        let hosts = lines.dropFirst().compactMap { line -> String? in
            guard let colon = line.firstIndex(of: ":"), line[..<colon].lowercased() == "host" else { return nil }
            return line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        guard hosts == ["127.0.0.1:\(port)"] else { reply(connection, status: 403); return }
        let rawPath = String(first[1]).components(separatedBy: "?")[0]
        guard let path = rawPath.removingPercentEncoding, path.hasPrefix("/"),
              !path.contains("\0"), !path.contains("\\"),
              !path.split(separator: "/").contains("..") else { reply(connection, status: 403); return }
        if path == "/__batch_desk_health" {
            reply(connection, status: 200, body: Data("{\"app\":\"shared-usdt-batch-desk-v2\",\"native\":true}".utf8), mime: "application/json", head: method == "HEAD")
            return
        }
        let relative = path == "/" ? "index.html" : String(path.dropFirst())
        let file = root.appendingPathComponent(relative).resolvingSymlinksInPath().standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"),
              let values = try? file.resourceValues(forKeys: [.isRegularFileKey]), values.isRegularFile == true,
              let body = try? Data(contentsOf: file) else { reply(connection, status: 404); return }
        let types = ["html":"text/html; charset=utf-8", "js":"text/javascript; charset=utf-8", "css":"text/css; charset=utf-8", "json":"application/json", "svg":"image/svg+xml", "png":"image/png", "ico":"image/x-icon", "woff2":"font/woff2", "txt":"text/plain; charset=utf-8", "rsc":"text/x-component"]
        reply(connection, status: 200, body: body, mime: types[file.pathExtension] ?? "application/octet-stream", head: method == "HEAD")
    }

    func reply(_ connection: NWConnection, status: Int, body: Data = Data(), mime: String = "text/plain", head: Bool = false) {
        let reason = [200:"OK", 400:"Bad Request", 403:"Forbidden", 404:"Not Found", 405:"Method Not Allowed", 431:"Request Header Fields Too Large"][status] ?? "Error"
        let header = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: \(mime)\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n"
        var response = Data(header.utf8)
        if !head { response.append(body) }
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var server: LocalServer?
    var window: NSWindow!
    let status = NSTextField(wrappingLabelWithString: "Starting your local interface…")
    let url = URL(string: "http://127.0.0.1:38762/")!
    var ready = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let item = NSMenuItem()
        menu.addItem(item)
        let submenu = NSMenu()
        submenu.addItem(withTitle: "Quit USDT Batch Desk", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.submenu = submenu
        NSApplication.shared.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 255), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        window.title = "USDT Batch Desk \(version)"
        window.isReleasedWhenClosed = false
        window.center()
        let title = NSTextField(labelWithString: "Your batch desk. On your Mac.")
        title.font = .systemFont(ofSize: 22, weight: .semibold)
        let detail = NSTextField(wrappingLabelWithString: "Use Chrome with MetaMask to review payments and sign from the connected wallet.")
        detail.textColor = .secondaryLabelColor
        status.textColor = .secondaryLabelColor
        let button = NSButton(title: "Open in Chrome", target: self, action: #selector(openChrome))
        button.bezelStyle = .rounded
        button.keyEquivalent = "\r"
        let stack = NSStackView(views: [title, detail, status, button])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -28),
            stack.centerYAnchor.constraint(equalTo: window.contentView!.centerYAnchor)
        ])
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
        do {
            guard let root = Bundle.main.resourceURL?.appendingPathComponent("app"),
                  FileManager.default.fileExists(atPath: root.appendingPathComponent("index.html").path) else {
                status.stringValue = "The bundled interface is missing. Reinstall the app."; return
            }
            server = try LocalServer(root: root, port: 38762)
            server?.onReady = { [weak self] in
                self?.ready = true
                self?.status.stringValue = "Running locally · Quit this app to stop the server."
                self?.openChrome()
            }
            server?.onFailure = { [weak self] _ in self?.checkExistingServer() }
            server?.start()
        } catch { status.stringValue = "Could not start the local server: \(error.localizedDescription)" }
    }

    func checkExistingServer() {
        var request = URLRequest(url: url.appendingPathComponent("__batch_desk_health"))
        request.timeoutInterval = 2
        let configuration = URLSessionConfiguration.ephemeral
        configuration.connectionProxyDictionary = [:]
        URLSession(configuration: configuration).dataTask(with: request) { [weak self] data, _, _ in
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            DispatchQueue.main.async {
                guard let self else { return }
                if json?["app"] as? String == "shared-usdt-batch-desk-v2" {
                    self.ready = true
                    self.status.stringValue = "An earlier Batch Desk server is already running. Using that session."
                    self.openChrome()
                } else {
                    self.status.stringValue = "Port 38762 is occupied. Close the earlier local launcher, then reopen this app."
                }
            }
        }.resume()
    }

    @objc func openChrome() {
        guard ready else { return }
        guard let chrome = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.google.Chrome") else {
            status.stringValue = "Install Google Chrome to use MetaMask. Your local address is \(url.absoluteString)"; return
        }
        NSWorkspace.shared.open([url], withApplicationAt: chrome, configuration: NSWorkspace.OpenConfiguration()) { [weak self] _, error in
            if let error { DispatchQueue.main.async { self?.status.stringValue = error.localizedDescription } }
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        openChrome()
        return true
    }
    func applicationWillTerminate(_ notification: Notification) { server?.listener.cancel() }
}

let arguments = CommandLine.arguments
if arguments.contains("--serve-only") {
    guard let index = arguments.firstIndex(of: "--assets"), arguments.count > index + 1 else { exit(2) }
    let port: UInt16
    if let index = arguments.firstIndex(of: "--port"), arguments.count > index + 1, let value = UInt16(arguments[index + 1]), value > 0 { port = value }
    else { port = 38762 }
    let server = try LocalServer(root: URL(fileURLWithPath: arguments[index + 1]), port: port)
    server.onReady = { print("READY \(port)"); fflush(stdout) }
    server.onFailure = { error in fputs("\(error)\n", stderr); exit(1) }
    server.start()
    RunLoop.main.run()
} else {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.setActivationPolicy(.regular)
    app.delegate = delegate
    app.run()
}
