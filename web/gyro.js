const radians = Math.PI / 180;

// Core Motion uses a quaternion. The same top-edge ray is obtained from the
// browser's intrinsic Z-X-Y rotations by transforming the device's +Y axis.
export function topEdge({ alpha, beta, gamma }) {
  if (![alpha, beta, gamma].every(Number.isFinite)) return null;
  const heading = alpha * radians;
  const tilt = beta * radians;
  const x = -Math.sin(heading) * Math.cos(tilt);
  const y = Math.cos(heading) * Math.cos(tilt);
  const z = Math.sin(tilt);
  return { yaw: Math.atan2(x, y), pitch: Math.atan2(z, Math.hypot(x, y)),
    sideUp: Math.abs(Math.cos(tilt) * Math.sin(gamma * radians)) };
}

export function angularDelta(previous, next) {
  const yaw = next.yaw - previous.yaw;
  return { yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)), pitch: next.pitch - previous.pitch };
}

export class SideGripAim {
  previous = null;
  yaw = 0;
  pitch = 0;

  reset() {
    this.previous = null;
    this.yaw = this.pitch = 0;
  }

  calibrate(pose) {
    if (!pose || pose.sideUp < .5 || Math.abs(pose.pitch) > 1.15) return false;
    this.reset();
    this.previous = pose;
    return true;
  }

  update(pose) {
    if (!pose || Math.abs(pose.pitch) > 1.27) {
      this.reset();
      return;
    }
    const previous = this.previous;
    this.previous = pose;
    if (!previous) return;
    const delta = angularDelta(previous, pose);
    // A sensor rebase or singularity should not yank the camera away.
    if (Math.hypot(delta.yaw, delta.pitch) > .78) {
      this.yaw = this.pitch = 0;
      return;
    }
    this.yaw += delta.yaw;
    this.pitch += delta.pitch;
  }

  consume(fraction = .75) {
    const yaw = this.yaw * fraction;
    const pitch = this.pitch * fraction;
    this.yaw -= yaw;
    this.pitch -= pitch;
    return { yaw, pitch };
  }
}
