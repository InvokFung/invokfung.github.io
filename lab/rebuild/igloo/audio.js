// Sound, off until asked for (Igloo starts muted too). Theirs is an AudioWorklet mixer playing
// recorded loops; this one synthesises its layers in WebAudio, with the same mix rules: wind
// while the igloo is on screen, a hum that swells through each ring, a hiss when the sculpture's
// particles are stirred, a room tone in the room, and short blips for the interface.
export class Sound {
  constructor() {
    this.on = false;
    this.ctx = null;
    this.layers = {};
    this.last = {};
  }

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const c = (this.ctx = new AC());
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp).connect(c.destination);

    // Two seconds of brown noise feeds every noisy layer.
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; }
    this.noise = buf;
    const loop = () => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * 2); return s; };

    const layer = (name, input, gain = 0) => {
      const g = c.createGain();
      g.gain.value = gain;
      input.connect(g).connect(this.master);
      this.layers[name] = g;
      return g;
    };

    // Wind: noise through a band that wanders, opened up by scroll speed.
    const wf = c.createBiquadFilter();
    wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.8;
    const wlfo = c.createOscillator(), wl = c.createGain();
    wlfo.frequency.value = 0.07; wl.gain.value = 180;
    wlfo.connect(wl).connect(wf.frequency); wlfo.start();
    loop().connect(wf);
    layer('wind', wf);
    this.windFilter = wf;

    // Portals: a low fifth with a slow beat, and a breath of high noise.
    const pf = c.createBiquadFilter();
    pf.type = 'lowpass'; pf.frequency.value = 600;
    [55, 82.6, 110.4].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      const g = c.createGain(); g.gain.value = i === 2 ? 0.25 : 0.5;
      o.connect(g).connect(pf); o.start();
    });
    const ph = c.createBiquadFilter();
    ph.type = 'bandpass'; ph.frequency.value = 2400; ph.Q.value = 3;
    loop().connect(ph);
    const phg = c.createGain(); phg.gain.value = 0.35;
    ph.connect(phg).connect(pf);
    layer('portals', pf);

    // Particles: a fine hiss that flutters.
    const xf = c.createBiquadFilter();
    xf.type = 'bandpass'; xf.frequency.value = 6500; xf.Q.value = 1.5;
    const flutter = c.createGain(); flutter.gain.value = 0.6;
    const flo = c.createOscillator(), flg = c.createGain();
    flo.frequency.value = 11; flg.gain.value = 0.4;
    flo.connect(flg).connect(flutter.gain); flo.start();
    loop().connect(xf).connect(flutter);
    layer('particles', flutter);

    // Room tone: a soft open chord, filtered, very quiet.
    const rf = c.createBiquadFilter();
    rf.type = 'lowpass'; rf.frequency.value = 900;
    [146.8, 220, 329.6, 370].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 4;
      const g = c.createGain(); g.gain.value = 0.18;
      o.connect(g).connect(rf); o.start();
    });
    layer('room', rf);
    return true;
  }

  toggle() {
    if (!this.ctx && !this.init()) return false;
    this.on = !this.on;
    if (this.on) this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.on ? 0.8 : 0, t, 0.25);
    if (!this.on) setTimeout(() => { if (!this.on) this.ctx.suspend(); }, 1500);
    else this.blip('click');
    return this.on;
  }

  set(name, v, k = 0.12) {
    if (Math.abs((this.last[name] ?? -1) - v) < 0.004) return;
    this.last[name] = v;
    this.layers[name].gain.setTargetAtTime(v, this.ctx.currentTime, k);
  }

  update({ wind = 0, portals = 0, particles = 0, room = 0, velocity = 0 }) {
    if (!this.on) return;
    this.set('wind', wind * (0.22 + velocity * 0.6));
    this.set('portals', portals * 0.5, 0.08);
    this.set('particles', Math.min(1, particles * 6) * 0.25, 0.05);
    this.set('room', room * 0.12, 0.4);
    const f = 420 + velocity * 1400;
    if (Math.abs((this.last.wf ?? 0) - f) > 10) { this.last.wf = f; this.windFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.2); }
  }

  // UI: tick on hover, click on open, long when the room changes shape.
  blip(kind = 'tick') {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    const spec = {
      tick: { f0: 2400, f1: 2200, dur: 0.035, vol: 0.05, type: 'square' },
      click: { f0: 880, f1: 440, dur: 0.12, vol: 0.12, type: 'triangle' },
      long: { f0: 330, f1: 990, dur: 0.5, vol: 0.1, type: 'sine' },
    }[kind] || {};
    o.type = spec.type;
    o.frequency.setValueAtTime(spec.f0, t);
    o.frequency.exponentialRampToValueAtTime(spec.f1, t + spec.dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(spec.vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + spec.dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + spec.dur + 0.02);
  }

  // The frost opening (or closing) a project: noise swept through a band.
  whoosh(reverse = false) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    f.type = 'bandpass'; f.Q.value = 1.2;
    const [a, b] = reverse ? [3200, 260] : [260, 3200];
    f.frequency.setValueAtTime(a, t);
    f.frequency.exponentialRampToValueAtTime(b, t + 1.1);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    s.connect(f).connect(g).connect(this.master);
    s.start(t); s.stop(t + 1.35);
  }
}
