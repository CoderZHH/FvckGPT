const masterLevel = .59;
const musicLevel = .67;
const stepLength = 60 / 124 / 4;

// Four bars in E minor, played through short mechanical percussion and detuned tones.
const bassline = [
  40, 0, 0, 40, 0, 0, 47, 0, 40, 0, 0, 43, 0, 0, 45, 0,
  40, 0, 0, 0, 40, 0, 47, 0, 43, 0, 0, 43, 0, 0, 38, 0,
  36, 0, 0, 36, 0, 0, 43, 0, 36, 0, 0, 40, 0, 0, 45, 0,
  38, 0, 0, 38, 0, 0, 45, 0, 38, 0, 0, 47, 0, 45, 43, 0,
];
const motif = new Map([[0, 64], [7, 67], [12, 71], [21, 62], [24, 67], [30, 66], [32, 64], [39, 67], [44, 72],
  [53, 62], [57, 69], [62, 66]]);
const hertz = note => 440 * 2 ** ((note - 69) / 12);

export function makeAudio() {
  let context, volume, effects, track, noise;
  let muted = false;
  let playing = false;
  let nextBeat = 0;
  let beat = 0;

  function unlock() {
    if (!context) {
      const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Audio) return;
      context = new Audio({ latencyHint: 'interactive' });
      volume = context.createGain();
      volume.gain.value = muted ? 0 : masterLevel;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -13;
      limiter.knee.value = 13;
      limiter.ratio.value = 4;
      volume.connect(limiter).connect(context.destination);

      effects = context.createGain();
      track = context.createGain();
      effects.gain.value = .91;
      track.gain.value = 0;
      effects.connect(volume);
      track.connect(volume);

      noise = context.createBuffer(1, Math.ceil(context.sampleRate * .45), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    if (context.state === 'suspended') void context.resume().catch(() => {});
  }

  function envelope(node, at, power, duration, attack = .004) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(.0005, at);
    gain.gain.exponentialRampToValueAtTime(power, at + attack);
    gain.gain.exponentialRampToValueAtTime(.0005, at + duration);
    node.connect(gain);
    return gain;
  }

  function tone(frequency, finish, duration, power, { wave = 'sine', delay = 0, bus = effects, attack } = {}) {
    const at = context.currentTime + delay;
    const oscillator = context.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(finish, at + duration);
    envelope(oscillator, at, power, duration, attack).connect(bus);
    oscillator.start(at);
    oscillator.stop(at + duration);
  }

  function burst(frequency, duration, power, { delay = 0, bus = effects, q = 1, attack } = {}) {
    const at = context.currentTime + delay;
    const sample = context.createBufferSource();
    sample.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    sample.connect(filter);
    envelope(filter, at, power, duration, attack).connect(bus);
    sample.start(at, Math.random() * Math.max(0, noise.duration - duration));
    sample.stop(at + duration);
  }

  function setTrackGain(level, delay = 0, transition = .07) {
    const at = context.currentTime;
    track.gain.cancelScheduledValues(at);
    track.gain.setTargetAtTime(level, at + delay, transition);
  }

  function duck() {
    if (!playing) return;
    const at = context.currentTime;
    setTrackGain(.26, 0, .024);
    track.gain.setTargetAtTime(musicLevel, at + .13, .24);
  }

  function spatial(x, z, listener) {
    if (!listener) return { bus: effects, gain: 1 };
    const dx = x - listener.x;
    const dz = z - listener.z;
    const distance = Math.hypot(dx, dz);
    const gain = Math.max(.09, 1 / (1 + distance * .165));
    if (!context.createStereoPanner) return { bus: effects, gain };
    const pan = context.createStereoPanner();
    const right = dx * Math.cos(listener.yaw) + dz * Math.sin(listener.yaw);
    pan.pan.value = Math.max(-.85, Math.min(.85, right / Math.max(2.5, distance)));
    pan.connect(effects);
    setTimeout(() => pan.disconnect(), 560);
    return { bus: pan, gain };
  }

  function shot(event, slot, listener) {
    const ours = event.player === slot;
    const source = ours ? { bus: effects, gain: 1 } : spatial(event.origin[0], event.origin[2], listener);
    const force = source.gain * (ours ? 1 : .84);
    const bus = source.bus;
    if (event.weapon === 'scatter') {
      burst(1560, .13, .49 * force, { bus, q: .47 });
      tone(116, 40, .225, .28 * force, { bus, wave: 'triangle' });
      burst(540, .18, .19 * force, { bus, delay: .045 });
    } else if (event.weapon === 'pulse') {
      tone(1040, 260, .155, .20 * force, { bus, wave: 'triangle' });
      tone(284, 83, .28, .23 * force, { bus, wave: 'sine' });
      burst(3280, .074, .30 * force, { bus, q: 1.9 });
      tone(402, 176, .18, .09 * force, { bus, wave: 'triangle', delay: .073 });
    } else {
      burst(2700, .066, .36 * force, { bus, q: .83 });
      tone(168, 54, .15, .25 * force, { bus, wave: 'triangle' });
      tone(920, 238, .092, .11 * force, { bus, wave: 'triangle', delay: .012 });
      burst(780, .10, .13 * force, { bus, delay: .030 });
    }

    if (event.impact !== 'miss' && event.end) {
      const impact = spatial(event.end[0], event.end[2], listener);
      const bus = impact.bus;
      const gain = ours ? Math.max(.32, impact.gain) : impact.gain;
      if (event.impact === 'wood') {
        burst(580, .098, .17 * gain, { bus, delay: .018 });
        burst(2120, .078, .14 * gain, { bus, delay: .022 });
      }
      if (event.impact === 'metal' || event.impact === 'shutter') {
        const base = event.impact === 'shutter' ? 528 : 890;
        tone(base, base * .87, .19, .14 * gain, { bus, wave: 'triangle', delay: .014 });
        tone(base * 1.57, base * 1.48, .13, .085 * gain, { bus, delay: .019 });
        burst(3800, .057, .18 * gain, { bus, delay: .019 });
      }
      if (event.impact === 'player') burst(950, .11, .14 * gain, { bus, delay: .021 });
    }

    if (event.target != null && ours) {
      tone(884, 1280, .083, .18, { wave: 'triangle', delay: .018 });
      tone(1332, 1700, .11, .13, { delay: .059 });
    }
    const receivedHit = event.target === slot || event.impacts?.some(impact => impact.target === slot && impact.damage > 0);
    if (receivedHit) {
      tone(100, 35, .25, .30, { wave: 'triangle' });
      burst(330, .22, .21, { q: .62 });
    }
    if (ours || receivedHit) duck();
  }

  function performBeat(step, delay) {
    const pattern = step % 16;
    const timing = { bus: track, delay };
    if ([0, 7, 10].includes(pattern)) tone(114, 42, .19, .24, timing);
    if ([4, 12].includes(pattern)) {
      tone(207, 118, .12, .16, { ...timing, wave: 'triangle' });
      burst(1970, .115, .19, { ...timing, q: .81 });
    }
    if (pattern % 2 === 0 || [11, 15].includes(pattern)) {
      burst(pattern === 8 ? 4810 : 6210, pattern === 8 ? .094 : .033, pattern === 8 ? .095 : .048, timing);
    }
    if ([2, 6, 15].includes(pattern)) tone(365, 323, .036, .041, { ...timing, wave: 'square' });

    const bass = bassline[step];
    if (bass) {
      const root = hertz(bass);
      tone(root, root * .98, .24, .19, { ...timing, wave: 'triangle', attack: .016 });
      tone(root * .5, root * .493, .28, .11, { ...timing, attack: .02 });
    }
    const key = motif.get(step);
    if (key) {
      const pitch = hertz(key);
      tone(pitch, pitch * .996, .34, .064, { ...timing, wave: 'triangle', attack: .021 });
      tone(pitch * 2.004, pitch * 2, .16, .025, timing);
      tone(pitch, pitch * .994, .22, .027, { ...timing, delay: delay + stepLength * 2.5, attack: .016 });
    }
  }

  return {
    unlock,
    isRunning() { return context?.state === 'running'; },
    toggle() {
      unlock();
      muted = !muted;
      if (context) volume.gain.setTargetAtTime(muted ? 0 : masterLevel, context.currentTime, .027);
      return muted;
    },
    event(event, slot, player) {
      if (context?.state !== 'running' || muted) return;
      if (event.type === 'shot') shot(event, slot, player);
      if (event.player === slot) {
        if (event.type === 'reload-start') {
          if (event.weapon === 'pulse') {
            tone(710, 126, .36, .15, { wave: 'triangle' });
            burst(2450, .19, .10, { delay: .22, q: .8 });
          } else if (event.weapon === 'scatter') {
            for (const delay of [0, .075, .16]) burst(920, .054, .16, { delay, q: 1.4 });
          } else {
            burst(720, .09, .18);
            tone(220, 122, .13, .12, { wave: 'triangle' });
          }
        }
        if (event.type === 'reload-complete') {
          burst(1800, .048, .14, { q: 2 });
          const lock = event.weapon === 'scatter' ? 275 : event.weapon === 'pulse' ? 580 : 440;
          tone(lock, lock * 1.16, .10, .13, { wave: 'triangle', delay: .02 });
        }
        if (event.type === 'dry-fire') {
          tone(218, 134, .06, .11, { wave: 'triangle' });
        }
      }
      if (event.type === 'break') {
        const { bus, gain } = spatial(event.x, event.z, player);
        const power = Math.max(.18, gain);
        tone(98, 34, .28, .27 * power, { bus, wave: 'triangle' });
        burst(625, .31, .37 * power, { bus, q: .65 });
        for (const [index, pitch] of [871, 381, 1106, 643].entries()) {
          tone(pitch, pitch * .81, .15, .12 * power, { bus, wave: 'triangle', delay: .045 + .044 * index });
        }
        duck();
      }
      if (event.type === 'pickup') {
        tone(410, 615, .156, .17, { wave: 'triangle' });
        tone(740, 982, .195, .12, { delay: .070 });
      }
      if (event.type === 'drop') {
        const { bus, gain } = spatial(event.x, event.z, player);
        for (const [delay, pitch] of [[.31, 360], [.44, 252]]) {
          tone(pitch, pitch * .62, .13, .16 * gain, { bus, delay, wave: 'triangle' });
        }
      }
      if (event.type === 'start') {
        tone(203, 310, .22, .17, { wave: 'triangle' });
        tone(312, 330, .21, .14, { delay: .105, wave: 'triangle' });
      }
      if (event.type === 'score') {
        if (event.reason === 'delivery') {
          tone(96, 167, .43, .16, { wave: 'triangle' });
          burst(720, .11, .16, { delay: .40 });
        }
        const notes = event.player === slot ? [64, 67, 71, 76] : [52, 59, 55];
        for (const [index, note] of notes.entries()) {
          const pitch = hertz(note);
          tone(pitch, pitch * 1.013, .24, .20, { wave: 'triangle', delay: index * .077 });
        }
        duck();
      }
    },
    music(active) {
      if (context?.state !== 'running') return;
      if (active !== playing) {
        playing = active;
        beat = nextBeat = 0;
        setTrackGain(active ? musicLevel : 0);
      }
      if (!active || muted) return;
      const now = context.currentTime;
      if (nextBeat < now - .20) nextBeat = now + .015;
      while (nextBeat < now + .075) {
        performBeat(beat++ % bassline.length, Math.max(0, nextBeat - now));
        nextBeat += stepLength;
      }
    },
  };
}
