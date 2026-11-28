import { angularDelta } from './gyro.js';

const degree = Math.PI / 180;
const startSpeed = 185 * degree / 1000;
const flickHeight = 16 * degree;
const maxFlickTime = 155;
const rearmTime = 700;

export class ReloadFlick {
  previous = null;
  candidate = null;
  returning = null;
  nextAttempt = 0;

  reset() {
    this.previous = this.candidate = this.returning = null;
    this.nextAttempt = 0;
  }

  sample(pose, now, armed) {
    const previous = this.previous;
    this.previous = { pose, time: now };
    const dt = previous ? now - previous.time : 0;
    if (!previous || dt <= 0 || dt > 120) {
      this.candidate = this.returning = null;
      return { reload: false };
    }
    const delta = angularDelta(previous.pose, pose);
    if (this.returning) {
      if (Math.abs(pose.pitch - this.returning.pitch) < 5 * degree || now > this.returning.until) {
        this.returning = null;
      }
      return { pitch: 0, reload: false };
    }
    if (this.candidate) {
      const excursion = angularDelta(this.candidate.pose, pose);
      if (!armed || pose.sideUp < .40 || now - this.candidate.time > maxFlickTime ||
          Math.abs(excursion.yaw) > 12 * degree || delta.pitch < -3 * degree) {
        this.candidate = null;
        return { pitch: excursion.pitch, reload: false };
      }
      if (excursion.pitch >= flickHeight && excursion.pitch / Math.max(18, now - this.candidate.time) >= .12 * degree) {
        this.returning = { pitch: this.candidate.pose.pitch, until: now + 390 };
        this.candidate = null;
        this.nextAttempt = now + rearmTime;
        return { pitch: 0, reload: true };
      }
      return { pitch: 0, reload: false };
    }
    if (armed && now >= this.nextAttempt && pose.sideUp >= .43 &&
        delta.pitch > 2 * degree && delta.pitch / dt > startSpeed && Math.abs(delta.yaw) < delta.pitch * .82) {
      this.candidate = previous;
      return { pitch: 0, reload: false };
    }
    return { reload: false };
  }
}
