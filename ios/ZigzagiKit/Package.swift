// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ZigzagiKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "ZigzagiKit", targets: ["ZigzagiKit"])],
    targets: [
        .target(name: "ZigzagiKit"),
        .testTarget(name: "ZigzagiKitTests", dependencies: ["ZigzagiKit"]),
    ]
)
