import Foundation

struct AimPoint: Codable {
    let x: Double
    let y: Double

    static let center = AimPoint(x: 0.5, y: 0.5)

    var normalizedPoint: CGPoint? {
        guard x.isFinite, y.isFinite, (0...1).contains(x), (0...1).contains(y) else { return nil }
        return CGPoint(x: x, y: y)
    }
}
