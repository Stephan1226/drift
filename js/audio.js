// Adaptive procedural soundtrack for DRIFT — no audio files, all synthesised
// with the Web Audio API. A small layered ambient engine (drone + pad + shimmer
// + noise + tension) crossfades between narrative "moods" as the story unfolds.

const MOODS = {
  // master, layer gains, chord (semitones over root), filter [base, lfoDepth], lfo rate, root(Hz)
  menu:    { master: 0.55, drone: 0.40, pad: 0.16, shimmer: 0.10, noise: 0.00, tension: 0.00, chord: [0, 7, 12],        cutoff: [520, 260],  lfo: 0.05, root: 146.83 },
  calm:    { master: 0.80, drone: 0.48, pad: 0.30, shimmer: 0.18, noise: 0.00, tension: 0.00, chord: [0, 4, 7, 11],     cutoff: [560, 360],  lfo: 0.06, root: 146.83 },
  tense:   { master: 0.92, drone: 0.66, pad: 0.30, shimmer: 0.05, noise: 0.11, tension: 0.10, chord: [0, 3, 7, 10],     cutoff: [420, 900],  lfo: 0.26, root: 138.59 },
  dilemma: { master: 0.84, drone: 0.54, pad: 0.30, shimmer: 0.11, noise: 0.05, tension: 0.05, chord: [0, 5, 7, 10],     cutoff: [470, 560],  lfo: 0.12, root: 146.83 },
  hope:    { master: 0.98, drone: 0.44, pad: 0.34, shimmer: 0.28, noise: 0.00, tension: 0.00, chord: [0, 4, 7, 14],     cutoff: [760, 520],  lfo: 0.08, root: 164.81 },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.mood = 'menu';
    this._moodMaster = MOODS.menu.master;
  }

  /** Must be called from a user gesture (the entry click). */
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = this.ctx = new Ctx();

    // ---- master ----
    const master = this.master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);

    // ---- layer buses ----
    const mk = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(master); return g; };
    this.droneG = mk(); this.padG = mk(); this.shimmerG = mk();
    this.noiseG = mk(); this.tensionG = mk();

    // ---- drone (two slightly detuned sines an octave below the pad root) ----
    this.drone = [];
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 73.42;
      o.detune.value = i === 0 ? -4 : 4;
      o.connect(this.droneG);
      o.start();
      this.drone.push(o);
    }

    // ---- pad: 4 oscillators through a slowly sweeping low-pass ----
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 560;
    this.padFilter.Q.value = 4;
    this.padFilter.connect(this.padG);
    this.pad = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = 146.83;
      o.detune.value = (i - 1.5) * 5;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g); g.connect(this.padFilter);
      o.start();
      this.pad.push(o);
    }

    // filter-sweep LFO
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.06;
    this.lfoDepth = ctx.createGain();
    this.lfoDepth.gain.value = 360;
    this.lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(this.padFilter.frequency);
    this.lfo.start();

    // ---- shimmer: airy high partials ----
    this.shimmer = [];
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = i ? 587.32 : 440.0;
      o.detune.value = i ? 6 : -6;
      o.connect(this.shimmerG);
      o.start();
      this.shimmer.push(o);
    }

    // ---- noise wind (band-passed white noise) ----
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf; this.noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 700; nf.Q.value = 0.7;
    this.noise.connect(nf); nf.connect(this.noiseG);
    this.noise.start();

    // ---- tension: a beating minor-second cluster ----
    this.tension = [];
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = i ? 155.56 : 146.83;
      o.connect(this.tensionG);
      o.start();
      this.tension.push(o);
    }

    this.ready = true;
    this.setMood('menu', 0.5);
    master.gain.linearRampToValueAtTime(this.enabled ? this._moodMaster : 0, ctx.currentTime + 3);
  }

  setMood(name, fade = 4) {
    const m = MOODS[name];
    if (!m || !this.ready) { this.mood = name; this._moodMaster = m ? m.master : this._moodMaster; return; }
    this.mood = name;
    this._moodMaster = m.master;
    const t = this.ctx.currentTime;
    const ramp = (param, v) => { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(v, t + fade); };

    if (this.enabled) ramp(this.master.gain, m.master);
    ramp(this.droneG.gain, m.drone);
    ramp(this.padG.gain, m.pad);
    ramp(this.shimmerG.gain, m.shimmer);
    ramp(this.noiseG.gain, m.noise);
    ramp(this.tensionG.gain, m.tension);

    // retune the pad to the mood chord (glide for a smooth morph)
    const glide = (osc, freq) => {
      osc.frequency.cancelScheduledValues(t);
      osc.frequency.setValueAtTime(osc.frequency.value, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq), t + fade);
    };
    for (let i = 0; i < 4; i++) {
      const semi = m.chord[i % m.chord.length] + (i >= m.chord.length ? 12 : 0);
      glide(this.pad[i], m.root * Math.pow(2, semi / 12));
    }
    this.drone.forEach((o) => glide(o, m.root / 2));
    this.shimmer.forEach((o, i) => glide(o, m.root * (i ? 4 : 3)));
    this.tension.forEach((o, i) => glide(o, m.root * Math.pow(2, (i ? 1 : 0) / 12)));

    ramp(this.padFilter.frequency, m.cutoff[0]);
    this.lfoDepth.gain.setTargetAtTime(m.cutoff[1], t, fade * 0.4);
    this.lfo.frequency.setTargetAtTime(m.lfo, t, fade * 0.4);
  }

  toggleMute() {
    this.enabled = !this.enabled;
    if (!this.ready) return this.enabled;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(this.enabled ? this._moodMaster : 0, t + 0.4);
    return this.enabled;
  }

  // ----------------------------- SFX -----------------------------
  _blip(freq, dur, type, peak, glideTo, delay = 0) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  collect() { this._blip(880, 0.18, 'sine', 0.5, 1320); this._blip(1320, 0.22, 'sine', 0.28, null, 0.06); }
  seed()    { this._blip(1318, 0.16, 'triangle', 0.4, 1976); this._blip(1976, 0.5, 'sine', 0.18, null, 0.05); }

  transition() {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // deep impact
    this._blip(70, 1.4, 'sine', 0.7, 42);
    // noise riser
    const src = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(4000, t + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 1.8);
  }

  activate() { // ark / new-era sting
    this.transition();
    this._blip(261.63, 1.8, 'triangle', 0.3, null, 0.1);
    this._blip(392.00, 1.8, 'triangle', 0.26, null, 0.1);
    this._blip(659.25, 2.2, 'sine', 0.22, null, 0.2);
  }
}
