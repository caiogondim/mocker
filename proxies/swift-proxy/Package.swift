// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "swift-proxy",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "swift-proxy"),
    ]
)
