#if os(iOS)
import CoreMotion
import simd

final class NativeMotionInput {
    private let motion = CMMotionManager()
    private var mapper = MotionAim()
    private var aim = AimPoint.center

    func start() {
        mapper = MotionAim()
        aim = .center
        motion.deviceMotionUpdateInterval = 1.0 / 60
        motion.startDeviceMotionUpdates(using: .xArbitraryZVertical)
    }

    func stop() {
        motion.stopDeviceMotionUpdates()
    }

    func calibrate() -> Bool {
        guard let sample, mapper.calibrate(at: sample) else { return false }
        aim = .center
        return true
    }

    func update(sensitivity: Double) -> AimPoint {
        guard let sample else { return aim }
        let target = mapper.point(at: sample, sensitivity: sensitivity)
        aim = AimPoint(x: aim.x + (target.x - aim.x) * 0.75,
                       y: aim.y + (target.y - aim.y) * 0.75)
        return aim
    }

    private var sample: MotionAim.Sample? {
        guard let data = motion.deviceMotion else { return nil }
        let q = data.attitude.quaternion
        let gravity = data.gravity
        return MotionAim.Sample(attitude: simd_quatd(ix: q.x, iy: q.y, iz: q.z, r: q.w),
                                gravity: SIMD3(gravity.x, gravity.y, gravity.z))
    }
}
#endif
