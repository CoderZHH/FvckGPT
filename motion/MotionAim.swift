import Foundation
import simd

struct MotionAim {
    struct Sample {
        let attitude: simd_quatd
        let gravity: SIMD3<Double>

        // Use the measured device-frame gravity to identify which way the attitude
        // maps the reference frame. The two rotations can agree in some poses.
        var invertAttitude: Bool? {
            let down = -MotionAim.up
            let directError = simd_length_squared(attitude.act(down) - gravity)
            let inverseError = simd_length_squared(attitude.inverse.act(down) - gravity)
            guard abs(directError - inverseError) > 0.01 else { return nil }
            return directError < inverseError
        }
    }

    private static let up = SIMD3<Double>(0, 0, 1)
    private static let topEdge = SIMD3<Double>(0, 1, 0)
    private static let horizontalRange = 48.0 * Double.pi / 180
    private static let verticalRange = 28.0 * Double.pi / 180

    private var center: simd_quatd?
    private var invertAttitude: Bool?

    mutating func calibrate(at sample: Sample) -> Bool {
        // With the phone on its side, its short axis is mostly vertical and its top points forward.
        guard abs(sample.gravity.x) > 0.5, abs(sample.gravity.y) < 0.88 else { return false }
        center = sample.attitude
        if invertAttitude == nil { invertAttitude = sample.invertAttitude }
        return true
    }

    mutating func point(at sample: Sample, sensitivity: Double) -> AimPoint {
        guard let center else { return .center }
        if invertAttitude == nil { invertAttitude = sample.invertAttitude }
        guard let invertAttitude else { return .center }

        let forward = (invertAttitude ? center.inverse : center).act(Self.topEdge)
        let ray = (invertAttitude ? sample.attitude.inverse : sample.attitude).act(Self.topEdge)
        let right = simd_normalize(simd_cross(forward, Self.up))
        let up = simd_cross(right, forward)
        let x = simd_dot(ray, right)
        let y = simd_dot(ray, up)
        let z = simd_dot(ray, forward)
        let yaw = atan2(x, z)
        let pitch = atan2(y, hypot(x, z))
        return AimPoint(x: Self.clamp(0.5 + yaw * sensitivity / Self.horizontalRange),
                        y: Self.clamp(0.5 + pitch * sensitivity / Self.verticalRange))
    }

    private static func clamp(_ position: Double) -> Double {
        min(max(position, 0), 1)
    }
}
