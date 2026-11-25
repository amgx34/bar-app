// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "RailKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "RailKit", targets: ["RailKit"])],
    targets: [
        .target(name: "RailKit"),
        .testTarget(name: "RailKitTests", dependencies: ["RailKit"], resources: [.copy("Fixtures")]),
    ]
)
