export function makeAudio() {
  let context, volume, effects, track, noise;
  let muted = false;
  let nextBeat = 0;
  let beat = 0;

  function unlock() {
    if (!context) {
      context = new AudioContext();
      volume = context.createGain();
      volume.gain.value = muted ? 0 : .55;
      volume.connect(context.destination);
      effects = context.createGain();
      track = context.createGain();
      effects.connect(volume);
      track.gain.value = .65;
      track.connect(volume);
      noise = context.createBuffer(1, context.sampleRate * .35, context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    if (context.state === 'suspended') void context.resume();
  }

  function tone(frequency, finish, duration, power, wave = 'sine', delay = 0, bus = effects) {
    const when = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, when);
    oscillator.frequency.exponentialRampToValueAtTime(finish, when + duration);
    gain.gain.setValueAtTime(power, when);
    gain.gain.exponentialRampToValueAtTime(.001, when + duration);
    oscillator.connect(gain).connect(bus);
    oscillator.start(when);
    oscillator.stop(when + duration);
  }

  function burst(frequency, duration, power, delay = 0, bus = effects) {
    const at = context.currentTime + delay;
    const sample = context.createBufferSource();
    sample.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(power, at);
    gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    sample.connect(filter).connect(gain).connect(bus);
    sample.start(at);
    sample.stop(at + duration);
  }

  function duck() {
    const now = context.currentTime;
    track.gain.cancelScheduledValues(now);
    track.gain.setTargetAtTime(.27, now, .02);
    track.gain.setTargetAtTime(.65, now + .18, .15);
  }

  return {
    unlock,
    toggle() {
      unlock();
      muted = !muted;
      volume.gain.setTargetAtTime(muted ? 0 : .55, context.currentTime, .02);
      return muted;
    },
    event(event, slot, player) {
      if (context?.state !== 'running' || muted) return;
      if (event.type === 'shot') {
        const dx = player ? event.origin[0] - player.x : 0;
        const dz = player ? event.origin[2] - player.z : 0;
        const near = Math.hypot(dx, dz);
        const power = event.player === slot ? .68 : Math.max(.10, .45 - near * .017);
        const panner = context.createStereoPanner();
        const right = player ? dx * Math.cos(player.yaw) + dz * Math.sin(player.yaw) : 0;
        panner.pan.value = Math.max(-.85, Math.min(.85, right / Math.max(2, near)));
        panner.connect(effects);
        setTimeout(() => panner.disconnect(), 380);
        tone(138, 43, .14, power * .75, 'triangle', 0, panner);
        burst(1320, .083, power, 0, panner);
        if (event.impact === 'wood') burst(440, .12, power, .019, panner);
        if (event.impact === 'metal' || event.impact === 'shutter') tone(744, 540, .16, power * .34, 'triangle', .025, panner);
        if (event.target != null && event.player === slot) tone(1080, 690, .15, .38, 'triangle', .028);
        if (event.target === slot) tone(104, 30, .21, .46);
        if (event.player === slot || event.target === slot) duck();
      }
      if (event.type === 'break') {
        burst(670, .29, .8);
        tone(406, 115, .29, .36, 'triangle');
        duck();
      }
      if (event.type === 'pickup') tone(395, 707, .22, .32, 'triangle');
      if (event.type === 'score') {
        for (const [index, pitch] of [330, 440, 659].entries()) tone(pitch, pitch * 1.05, .23, .30, 'triangle', index * .09);
        duck();
      }
    },
    music(active) {
      if (!active) { beat = nextBeat = 0; return; }
      if (muted || context?.state !== 'running' || context.currentTime < nextBeat - .06) return;
      const delay = Math.max(0, nextBeat - context.currentTime);
      nextBeat = context.currentTime + delay + 60 / 236;
      const step = beat++ % 16;
      if ([0, 3, 8, 10].includes(step)) tone(108, 40, .19, .32, 'sine', delay, track);
      if (step % 4 === 2) burst(1500, .098, .17, delay, track);
      if (step % 2 === 1) burst(5300, .038, .08, delay, track);
      const bass = [55, 0, 0, 55, 65, 0, 0, 49, 55, 0, 55, 0, 73, 0, 65, 49][step];
      if (bass) tone(bass, bass * .985, .18, .14, 'triangle', delay, track);
    },
  };
}
