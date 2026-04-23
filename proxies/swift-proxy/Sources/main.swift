import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Zero-dependency HTTP proxy using POSIX sockets + URLSession (Apple TLS)

let args = CommandLine.arguments
guard args.count == 3, let port = UInt16(args[2]) else {
    fputs("usage: swift-proxy <origin> <port>\n", stderr)
    Foundation.exit(1)
}

let origin = args[1]

let serverFd = socket(AF_INET, SOCK_STREAM, 0)
guard serverFd >= 0 else { fputs("socket() failed\n", stderr); Foundation.exit(1) }

var yes: Int32 = 1
setsockopt(serverFd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))

var addr = sockaddr_in()
addr.sin_family = sa_family_t(AF_INET)
addr.sin_port = port.bigEndian
addr.sin_addr.s_addr = inet_addr("127.0.0.1")

let bindResult = withUnsafePointer(to: &addr) { ptr in
    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(serverFd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
}
guard bindResult == 0 else { fputs("bind() failed: \(errno)\n", stderr); Foundation.exit(1) }
guard listen(serverFd, 128) == 0 else { fputs("listen() failed\n", stderr); Foundation.exit(1) }

fputs("swift-proxy listening on http://127.0.0.1:\(port)\n", stderr)
fputs("forwarding to \(origin) via Apple TLS (URLSession)\n", stderr)

let skipRequestHeaders: Set<String> = ["connection", "transfer-encoding"]
let skipResponseHeaders: Set<String> = ["transfer-encoding", "connection", "content-length"]

/// Reads from fd until we have the full headers + body based on Content-Length
func readRequest(fd: Int32) -> Data? {
    var data = Data()
    var buf = [UInt8](repeating: 0, count: 8192)
    let headerTerminator = Data("\r\n\r\n".utf8)

    // Phase 1: read until we have the full headers
    while data.range(of: headerTerminator) == nil {
        let n = recv(fd, &buf, buf.count, 0)
        if n <= 0 { return data.isEmpty ? nil : data }
        data.append(contentsOf: buf[0..<n])
    }

    // Phase 2: if there's a Content-Length, read the remaining body bytes
    guard let headerEnd = data.range(of: headerTerminator) else { return data }
    let headerData = data[data.startIndex..<headerEnd.lowerBound]
    guard let headerStr = String(data: headerData, encoding: .utf8) else { return data }

    var contentLength: Int? = nil
    var isChunked = false
    for line in headerStr.components(separatedBy: "\r\n") {
        let lower = line.lowercased()
        if lower.hasPrefix("content-length:") {
            let val = line.dropFirst("content-length:".count).trimmingCharacters(in: .whitespaces)
            contentLength = Int(val)
        }
        if lower.hasPrefix("transfer-encoding:") && lower.contains("chunked") {
            isChunked = true
        }
    }

    let bodyStart = headerEnd.upperBound

    if let cl = contentLength {
        // Read exactly Content-Length bytes
        let bodyReceived = data.count - bodyStart
        var remaining = cl - bodyReceived
        while remaining > 0 {
            let toRead = min(remaining, buf.count)
            let n = recv(fd, &buf, toRead, 0)
            if n <= 0 { break }
            data.append(contentsOf: buf[0..<n])
            remaining -= n
        }
    } else if isChunked {
        // Read chunked transfer encoding until we see the terminator "0\r\n\r\n"
        let terminator = Data("0\r\n\r\n".utf8)
        while !data[bodyStart...].contains(terminator) {
            let n = recv(fd, &buf, buf.count, 0)
            if n <= 0 { break }
            data.append(contentsOf: buf[0..<n])
        }
    }

    return data
}

/// Decode a chunked transfer-encoded body into plain data
func decodeChunked(_ data: Data) -> Data {
    var result = Data()
    var pos = data.startIndex
    let crlf = Data("\r\n".utf8)

    while pos < data.endIndex {
        // Find the end of the chunk size line
        guard let crlfRange = data[pos...].range(of: crlf) else { break }
        let sizeStr = String(data: data[pos..<crlfRange.lowerBound], encoding: .ascii) ?? ""
        guard let chunkSize = Int(sizeStr.trimmingCharacters(in: .whitespaces), radix: 16) else { break }
        if chunkSize == 0 { break }

        let chunkStart = crlfRange.upperBound
        let chunkEnd = chunkStart + chunkSize
        guard chunkEnd <= data.endIndex else { break }

        result.append(data[chunkStart..<chunkEnd])
        pos = chunkEnd + crlf.count // skip trailing \r\n after chunk data
    }

    return result
}

func parseRequest(_ raw: Data) -> (method: String, path: String, headers: [(String, String)], body: Data)? {
    guard let headerEnd = raw.range(of: Data("\r\n\r\n".utf8)) else { return nil }
    let headerData = raw[raw.startIndex..<headerEnd.lowerBound]
    let rawBody = Data(raw[headerEnd.upperBound...])

    guard let headerStr = String(data: headerData, encoding: .utf8) else { return nil }
    let lines = headerStr.components(separatedBy: "\r\n")
    guard let requestLine = lines.first else { return nil }

    let parts = requestLine.split(separator: " ", maxSplits: 2)
    guard parts.count >= 2 else { return nil }

    let method = String(parts[0])
    let path = String(parts[1])

    var headers: [(String, String)] = []
    var isChunked = false
    for line in lines.dropFirst() {
        guard let colonIdx = line.firstIndex(of: ":") else { continue }
        let name = String(line[line.startIndex..<colonIdx]).trimmingCharacters(in: .whitespaces)
        let value = String(line[line.index(after: colonIdx)...]).trimmingCharacters(in: .whitespaces)
        headers.append((name, value))
        if name.lowercased() == "transfer-encoding" && value.lowercased().contains("chunked") {
            isChunked = true
        }
    }

    let body = isChunked ? decodeChunked(rawBody) : rawBody

    return (method, path, headers, body)
}

func sendAll(fd: Int32, data: Data) {
    data.withUnsafeBytes { ptr in
        var sent = 0
        let total = ptr.count
        while sent < total {
            let n = send(fd, ptr.baseAddress! + sent, total - sent, 0)
            if n <= 0 { break }
            sent += n
        }
    }
}

func buildResponse(status: Int, headers: [(String, String)], body: Data) -> Data {
    var resp = "HTTP/1.1 \(status) \(HTTPURLResponse.localizedString(forStatusCode: status))\r\n"
    for (name, value) in headers {
        resp += "\(name): \(value)\r\n"
    }
    resp += "Content-Length: \(body.count)\r\n"
    resp += "Connection: close\r\n"
    resp += "\r\n"
    var data = resp.data(using: .utf8)!
    data.append(body)
    return data
}

// Accept loop
while true {
    var clientAddr = sockaddr_in()
    var clientAddrLen = socklen_t(MemoryLayout<sockaddr_in>.size)
    let clientFd = withUnsafeMutablePointer(to: &clientAddr) { ptr in
        ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            accept(serverFd, $0, &clientAddrLen)
        }
    }
    guard clientFd >= 0 else { continue }

    let fd = clientFd
    Task.detached {
        defer { close(fd) }

        // Read timeout
        var tv = timeval(tv_sec: 10, tv_usec: 0)
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))

        guard let raw = readRequest(fd: fd), let parsed = parseRequest(raw) else { return }

        let targetURL = URL(string: "\(origin)\(parsed.path)")!

        var urlRequest = URLRequest(url: targetURL)
        urlRequest.httpMethod = parsed.method
        urlRequest.timeoutInterval = 30

        for (name, value) in parsed.headers {
            if skipRequestHeaders.contains(name.lowercased()) { continue }
            urlRequest.addValue(value, forHTTPHeaderField: name)
        }
        urlRequest.setValue(targetURL.host!, forHTTPHeaderField: "Host")

        if !parsed.body.isEmpty {
            urlRequest.httpBody = parsed.body
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: urlRequest)
            let httpResp = response as! HTTPURLResponse

            var respHeaders: [(String, String)] = []
            for (key, value) in httpResp.allHeaderFields {
                let name = "\(key)"
                if skipResponseHeaders.contains(name.lowercased()) { continue }
                respHeaders.append((name, "\(value)"))
            }

            let responseData = buildResponse(status: httpResp.statusCode, headers: respHeaders, body: data)
            sendAll(fd: fd, data: responseData)

            fputs("\(parsed.method) \(parsed.path) -> \(httpResp.statusCode)\n", stderr)
        } catch {
            let errBody = Data("Proxy error: \(error.localizedDescription)".utf8)
            let responseData = buildResponse(status: 502, headers: [("Content-Type", "text/plain")], body: errBody)
            sendAll(fd: fd, data: responseData)
            fputs("\(parsed.method) \(parsed.path) -> 502 (\(error.localizedDescription))\n", stderr)
        }
    }
}
