// ChillTimer v2 sound. Everything is made with Web Audio. No audio files.
// This module does not touch the DOM or localStorage. It makes no sound by itself.
//
// Signal path:
//   layers -> ambience bus -> master
//   music  -> music bus    -> master
//   chimes and ring        -> master
//   master -> limiter -> analyser -> destination

const LAYERS = ['rain', 'fire', 'vinyl', 'wind', 'forest', 'ocean'];
const AHEAD = 1.6;   // schedule this many seconds ahead (hidden tabs tick once a second)
const TICK = 100;    // scheduler interval in ms

// Level of each layer at slider 1.0, and of each music style. Tuned by measurement.
const LAYER_GAIN = { rain: 0.5, fire: 0.5, vinyl: 0.5, wind: 2.2, forest: 1.8, ocean: 0.65 };
const STYLE_GAIN = { beat: 0.75, piano: 1.4 };

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, +v || 0));
const R = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const expo = mean => -Math.log(1 - Math.random()) * mean;   // random gap, like raindrops
const mtof = m => 440 * 2 ** ((m - 69) / 12);

// Values set before unlock() are kept here and applied when the context starts.
const st = {
  master: 0.8, muted: false, vol: 1, style: 'beat', kit: { beat: 'mellow', piano: 'felt' }, want: false, ring: false,
  layers: { rain: 0, fire: 0, vinyl: 0, wind: 0, forest: 0, ocean: 0 },
};

let ctx = null, master, limiter, an, ambBus, musBus;
let timer = 0, song = null, ring = null;
const live = {};   // running layers
const bufs = {};   // cached noise buffers

// ---------- small helpers ----------

const gn = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
const filt = (type, f, q = 0.7) => {
  const b = ctx.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q;
  return b;
};

// Smooth move of a parameter. tc is the time constant: 95% of the way in 3 * tc.
function ramp(p, v, tc) {
  const t = ctx.currentTime;
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.setTargetAtTime(v, t, tc);
}

// Long noise buffer. The end is cross-faded into the start so the loop has no seam.
function noise(kind, sec) {
  const key = kind + sec;
  if (bufs[key]) return bufs[key];
  const sr = ctx.sampleRate, n = Math.floor(sec * sr), x = Math.floor(0.05 * sr);
  const d = new Float32Array(n + x);
  let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else {   // pink
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  }
  const buf = ctx.createBuffer(1, n, sr), o = buf.getChannelData(0);
  o.set(d.subarray(0, n));
  for (let i = 0; i < x; i++) {
    const k = (Math.PI / 2) * (i / x);
    o[i] = d[i] * Math.sin(k) + d[n + i] * Math.cos(k);
  }
  return (bufs[key] = buf);
}

function loopSrc(buf) {
  const s = ctx.createBufferSource();
  s.buffer = buf; s.loop = true;
  s.start(0, Math.random() * buf.duration);
  return s;
}

// A short filtered noise burst: a drop, a crackle, a click, a hat.
function burst(t, dest, type, f, q, amp, dur, buf = noise('white', 3)) {
  const s = ctx.createBufferSource(), fl = filt(type, f, q), g = ctx.createGain();
  s.buffer = buf;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(amp, t + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(dest);
  s.start(t, Math.random() * (buf.duration - dur - 0.1), dur + 0.01);
}

// A slow pitch wobble, like tape. Connect .node to an oscillator's detune.
function wobble(centsA, centsB) {
  const sum = gn(1);
  const oscs = [[R(0.45, 0.7), centsA], [R(0.08, 0.2), centsB]].map(([f, c]) => {
    const o = ctx.createOscillator(), g = gn(c);
    o.frequency.value = f; o.connect(g); g.connect(sum); o.start();
    return o;
  });
  return { node: sum, stop: () => oscs.forEach(o => o.stop()) };
}

// ---------- ambience layers ----------
// Each maker returns { stop(), ev: [{ t, f(t) }] }.
// f(t) schedules sound at time t and returns the gap to the next call.

const make = {
  // Rain on a window: three noise bands that drift, plus soft drops.
  rain(out) {
    const src = loopSrc(noise('pink', 8));
    const bands = [['lowpass', 700, 0.5, 1], ['bandpass', 2400, 0.6, 0.9], ['highpass', 6500, 0.5, 1.2]].map(([ty, f, q, base]) => {
      const fl = filt(ty, f, q), g = gn(base);
      src.connect(fl); fl.connect(g); g.connect(out);
      return { g, base };
    });
    return {
      stop: () => src.stop(),
      ev: [
        { t: 0, f: t => { bands.forEach(b => b.g.gain.setTargetAtTime(b.base * R(0.7, 1.15), t, 1.2)); return R(1.5, 4); } },
        { t: 0, f: t => { burst(t, out, 'bandpass', R(2500, 7000), R(4, 9), R(0.05, 0.22), R(0.015, 0.04)); return expo(0.09); } },
      ],
    };
  },

  // Fireplace: low rumble, a little flame breath, random crackles and pops.
  fire(out) {
    const src = loopSrc(noise('brown', 9));
    const lo = filt('lowpass', 220), g1 = gn(1), mid = filt('bandpass', 700, 0.6), g2 = gn(0.25);
    src.connect(lo); lo.connect(g1); g1.connect(out);
    src.connect(mid); mid.connect(g2); g2.connect(out);
    return {
      stop: () => src.stop(),
      ev: [
        { t: 0, f: t => { g1.gain.setTargetAtTime(R(0.7, 1.1), t, 0.8); g2.gain.setTargetAtTime(R(0.1, 0.45), t, 0.8); return R(0.8, 2.5); } },
        { t: 0, f: t => {
          const k = Math.random() < 0.3 ? 2 + Math.floor(Math.random() * 3) : 1;   // sometimes a small cluster
          for (let i = 0; i < k; i++) {
            const tt = t + i * R(0.01, 0.06), a = 0.04 + Math.random() ** 3 * 0.5;
            if (Math.random() < 0.15) burst(tt, out, 'lowpass', R(500, 1100), 0.7, a * 1.6, R(0.015, 0.035));   // pop
            else burst(tt, out, 'bandpass', R(1200, 5000), R(0.8, 2.5), a, R(0.004, 0.03));                  // crackle
          }
          return expo(0.22);
        } },
      ],
    };
  },

  // Record surface: quiet hiss, random clicks and pops, and one tick per turn at 33 rpm.
  vinyl(out) {
    const src = loopSrc(noise('white', 6));
    const hp = filt('highpass', 1800), lp = filt('lowpass', 8500), g = gn(0.35);
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out);
    return {
      stop: () => src.stop(),
      ev: [
        { t: 0, f: t => { burst(t, out, 'highpass', R(1500, 4000), 0.7, 0.04 + Math.random() ** 2 * 0.35, R(0.001, 0.004)); return expo(0.3); } },
        { t: 0, f: t => { burst(t, out, 'lowpass', R(900, 2200), 0.7, R(0.2, 0.5), R(0.006, 0.02)); return expo(2.2); } },
        { t: 0, f: t => { burst(t, out, 'lowpass', 700, 0.7, 0.25, 0.02); return 60 / 33.333; } },
      ],
    };
  },

  // Slow gusts: two band-passed noise bands. Their frequency and level drift.
  wind(out) {
    const src = loopSrc(noise('pink', 10));
    const gust = gn(0.6);
    const fa = filt('bandpass', 400, 1.2), ga = gn(0.5), fb = filt('bandpass', 900, 2), gb = gn(0.2);
    src.connect(fa); fa.connect(ga); ga.connect(gust);
    src.connect(fb); fb.connect(gb); gb.connect(gust);
    gust.connect(out);
    return {
      stop: () => src.stop(),
      ev: [{ t: 0, f: t => {
        fa.frequency.setTargetAtTime(R(180, 700), t, 1.6); ga.gain.setTargetAtTime(R(0.15, 1), t, 1.6);
        fb.frequency.setTargetAtTime(R(500, 1500), t, 1.6); gb.gain.setTargetAtTime(R(0, 0.7), t, 1.6);
        gust.gain.setTargetAtTime(R(0.25, 1), t, 2);
        return R(2.5, 6);
      } }],
    };
  },

  // Quiet wood: a soft leaf rustle, and three birds that each have their own song and rhythm.
  // Every note is a fast pitch glide with a short envelope, so it chirps and does not beep.
  forest(out) {
    const src = loopSrc(noise('pink', 7));
    const hp = filt('highpass', 1500, 0.5), bp = filt('bandpass', 4000, 0.4), rg = gn(0.4);
    src.connect(hp); hp.connect(bp); bp.connect(rg); rg.connect(out);
    // One glide note: f0 -> f1 -> f2 in dur seconds, with a weak second harmonic.
    const note = (t, f0, f1, f2, dur, amp) => {
      const g = gn(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.007);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.15);
      [[1, 1], [2, 0.18]].forEach(([r, lv]) => {
        const o = ctx.createOscillator(), og = gn(lv);
        o.frequency.setValueAtTime(f0 * r, t);
        o.frequency.exponentialRampToValueAtTime(f1 * r, t + dur * 0.55);
        o.frequency.exponentialRampToValueAtTime(f2 * r, t + dur);
        o.connect(og); og.connect(g); o.start(t); o.stop(t + dur * 1.2);
      });
      g.connect(out);
    };
    const hz = f => Math.min(6500, Math.max(1800, f));
    const f1 = R(2300, 3000), f2 = R(3300, 4300), f3 = R(4600, 5800);
    // Bird 1: short rising chirps, one to three at a time.
    const b1 = t => {
      const k = 1 + Math.floor(Math.random() * 3), f = f1 * R(0.95, 1.05);
      for (let i = 0; i < k; i++) note(t + i * R(0.13, 0.22), hz(f * R(0.9, 1)), hz(f * R(1.25, 1.5)), hz(f * R(1.2, 1.7)), R(0.06, 0.1), R(0.06, 0.1));
      return 1.5 + expo(5);
    };
    // Bird 2: a fast trill of small up and down glides.
    const b2 = t => {
      const k = 5 + Math.floor(Math.random() * 5), f = f2 * R(0.95, 1.05), step = R(0.05, 0.07);
      for (let i = 0; i < k; i++) {
        const base = f * (1 + i * 0.015), up = i % 2 === 0;
        note(t + i * step, hz(base * (up ? 0.92 : 1.12)), hz(base * (up ? 1.12 : 0.92)), hz(base * (up ? 1.1 : 0.94)), 0.04, 0.05 * (1 - i / (k + 2)) + 0.015);
      }
      return 2 + expo(7);
    };
    // Bird 3: two falling notes, "tee-tew".
    const b3 = t => {
      const f = f3 * R(0.92, 1.05);
      note(t, hz(f), hz(f * 1.1), hz(f * 0.85), R(0.09, 0.12), R(0.05, 0.08));
      note(t + R(0.14, 0.2), hz(f * 0.85), hz(f * 0.92), hz(f * 0.68), R(0.1, 0.14), R(0.04, 0.07));
      return 2.5 + expo(8);
    };
    return {
      stop: () => src.stop(),
      ev: [
        { t: 0, f: t => { rg.gain.setTargetAtTime(R(0.25, 0.6), t, 1.5); bp.frequency.setTargetAtTime(R(3000, 5000), t, 1.5); return R(1.5, 4); } },
        { t: 0, f: t => { burst(t, out, 'bandpass', R(3000, 7000), 1, R(0.01, 0.04), R(0.02, 0.06)); return expo(0.25); } },   // single leaves
        { t: 0.5, f: b1 }, { t: 1.5, f: b2 }, { t: 3, f: b3 },
      ],
    };
  },

  // Slow waves: the swell comes up and falls back every 7 to 11 s. The period drifts.
  // A brighter wash is on top of each swell, and a low rumble is underneath.
  ocean(out) {
    const src = loopSrc(noise('pink', 11)), rum = loopSrc(noise('brown', 9));
    const body = filt('lowpass', 550, 0.6), bg = gn(0.25);
    const wash = filt('bandpass', 1500, 0.5), wg = gn(0.02);
    const low = filt('lowpass', 110, 0.7), lg = gn(0.6);
    src.connect(body); body.connect(bg); bg.connect(out);
    src.connect(wash); wash.connect(wg); wg.connect(out);
    rum.connect(low); low.connect(lg); lg.connect(out);
    let T = R(8, 10);
    return {
      stop: () => { src.stop(); rum.stop(); },
      ev: [{ t: 0, f: t => {
        T = clamp(T + R(-1, 1), 7, 11);
        const pk = R(0.7, 1), base = 0.2;
        bg.gain.setValueAtTime(base, t);
        bg.gain.linearRampToValueAtTime(pk, t + T * 0.4);
        bg.gain.setTargetAtTime(base, t + T * 0.4, T * 0.12);
        // The wash comes a little later than the swell, then falls quickly.
        wg.gain.setValueAtTime(0.02, t);
        wg.gain.linearRampToValueAtTime(pk * 0.7, t + T * 0.5);
        wg.gain.setTargetAtTime(0.02, t + T * 0.5, T * 0.1);
        wash.frequency.setValueAtTime(1200, t);
        wash.frequency.linearRampToValueAtTime(R(2800, 4200), t + T * 0.5);
        wash.frequency.setTargetAtTime(1200, t + T * 0.5, T * 0.15);
        lg.gain.setValueAtTime(0.5, t);
        lg.gain.linearRampToValueAtTime(0.5 + pk * 0.4, t + T * 0.4);
        lg.gain.setTargetAtTime(0.5, t + T * 0.4, T * 0.15);
        return T;
      } }],
    };
  },
};

function startLayer(name) {
  const out = gn(0);
  out.connect(ambBus);
  const l = make[name](out);
  l.out = out;
  l.ev.forEach(e => { e.t = ctx.currentTime + e.t; });   // e.t is a start delay, so the birds do not all start at once
  live[name] = l;
  wake();
  return l;
}

function setL(name, v, tc) {
  st.layers[name] = v;
  if (!ctx) return;
  let l = live[name];
  if (v > 0 && !l) l = startLayer(name);
  if (!l) return;
  clearTimeout(l.timer);
  ramp(l.out.gain, v * LAYER_GAIN[name], tc);
  // At 0 wait for the fade, then stop the sources so the layer costs nothing.
  if (v === 0) l.timer = setTimeout(() => {
    if (live[name] === l && st.layers[name] === 0) { l.stop(); l.out.disconnect(); delete live[name]; }
  }, tc * 8000 + 50);
}

// ---------- music ----------

// Chord shapes: intervals above the root, without the root (the bass plays it).
const SHAPE = {
  maj7: [4, 7, 11, 16], maj9: [4, 7, 11, 14], m7: [3, 7, 10, 17], m9: [3, 7, 10, 14], 9: [4, 10, 14, 21],
  add9: [4, 7, 14, 16],
};

// Voice a chord near the last one so the top does not jump around.
function voice(rootPc, shape, prevAvg) {
  const r = 48 + (((rootPc - 48) % 12) + 12) % 12;
  let notes = shape.map(i => r + i);
  if (prevAvg) {
    const avg = notes.reduce((a, b) => a + b, 0) / notes.length;
    const best = [-12, 0, 12].reduce((a, b) => Math.abs(avg + b - prevAvg) < Math.abs(avg + a - prevAvg) ? b : a);
    notes = notes.map(m => m + best);
  }
  if (Math.max(...notes) > 82) notes = notes.map(m => m - 12);
  return notes;
}

// m = 1 means a minor key. c = list of [semitones above the key, chord type].
const BEAT_PROGS = [
  { m: 0, c: [[2, 'm9'], [7, 9], [0, 'maj9'], [9, 'm7']] },
  { m: 0, c: [[0, 'maj9'], [9, 'm7'], [2, 'm9'], [7, 9]] },
  { m: 0, c: [[5, 'maj7'], [4, 'm7'], [9, 'm9'], [2, 'm7']] },
  { m: 1, c: [[0, 'm9'], [5, 'm7'], [10, 9], [3, 'maj7']] },
  { m: 0, c: [[9, 'm9'], [2, 'm7'], [7, 9], [0, 'maj7']] },
  { m: 1, c: [[0, 'm7'], [8, 'maj7'], [3, 'maj9'], [10, 9]] },
  { m: 0, c: [[4, 'm7'], [9, 'm9'], [2, 'm7'], [7, 9]] },
  { m: 1, c: [[0, 'm9'], [7, 'm7'], [8, 'maj7'], [5, 'm7']] },
];
const KEYS = [0, 2, 3, 5, 7, 8, 10];
const KICKS = [[0, 10], [0, 7, 10], [0, 6, 10], [0, 10, 13], [0, 3, 10]];
const COMPS = [[0], [0, 6], [0, 7, 10], [0, 10], [3, 10], [0, 5, 8, 13]];
const BASSES = [[0], [0, 6], [0, 10], [0, 7, 10], [0, 8, 14]];

// The beats to choose from. It is the same small band each time, with different habits: how fast, how
// much swing, where the drums land, how bright the tape sounds. A kit only lists what it changes; the
// rest comes from the defaults at the top of makeBeat.
//   bpm, sw: [low, high] speed and swing    kicks, comps, basses: lists of patterns (16th-note steps in a bar)
//   snares: steps of the snare              rim: chance of a rim click on the back beat (1 = every snare is a rim click)
//   hat: eighth | quarter | ride | shaker | open | off      progs: 0 = major keys only, 1 = minor only
//   lp, klp: how bright the whole mix and the keys are      mel: how often a melody note comes
const BEATS = {
  mellow: {},
  boombap: { bpm: [84, 92], sw: [0.12, 0.2], kicks: [[0, 6, 10], [0, 3, 10], [0, 10, 11]], rim: 0, comps: [[0, 10], [3, 10], [0, 7]], basses: [[0, 6, 10], [0, 3, 10], [0, 10, 14]], kickV: 1.1 },
  sleepy: { bpm: [58, 66], sw: [0.22, 0.34], kicks: [[0], [0, 10], [0, 11]], snares: [8], comps: [[0], [0, 10]], basses: [[0], [0, 10]], hat: 'quarter', lp: 3600, mel: 0.09 },
  jazzy: { bpm: [76, 86], sw: [0.3, 0.4], rim: 1, hat: 'ride', comps: [[0, 5, 8, 13], [3, 10], [0, 7, 10]], basses: [[0, 4, 8, 12], [0, 6, 8, 14]], mel: 0.24 },
  bossa: { bpm: [80, 88], sw: [0, 0.04], kicks: [[0, 8], [0, 6, 8, 14]], snares: [3, 6, 10, 12], rim: 1, hat: 'shaker', comps: [[0, 3, 6, 10], [0, 6, 10]], basses: [[0, 6, 8, 14]], progs: 0 },
  dusty: { bpm: [66, 74], sw: [0.25, 0.35], lp: 3000, klp: 1500, wob: [15, 11], rim: 1, kickV: 0.8, hatV: 0.5, mel: 0.07 },
  sunny: { bpm: [82, 90], sw: [0.15, 0.22], lp: 7000, klp: 3200, progs: 0, mel: 0.22, hat: 'open' },
  drive: { bpm: [72, 78], sw: [0.06, 0.12], kicks: [[0, 4, 8, 12]], hat: 'off', basses: [[0, 3, 6, 8, 11, 14], [0, 6, 8, 14]], comps: [[0], [0, 10]], progs: 1, kickV: 0.85 },
};

// Lofi hip-hop. A new random choice is made every 4 bars, so no bar repeats.
function makeBeat(out, kit = {}) {
  const K = { bpm: [70, 80], sw: [0.2, 0.32], lp: 5200, klp: 2300, wob: [7, 5], kicks: KICKS, comps: COMPS, basses: BASSES, snares: [4, 12], rim: 0.4, hat: 'eighth', hatV: 1, mel: 0.14, kickV: 1, ...kit };
  const progs = K.progs == null ? BEAT_PROGS : BEAT_PROGS.filter(pr => pr.m === K.progs);
  const bpm = R(...K.bpm), s = 15 / bpm, sw = R(...K.sw);   // s = one 16th note
  const mix = gn(1), lp = filt('lowpass', K.lp, 0.5);
  mix.connect(lp); lp.connect(out);
  const keys = gn(1), klp = filt('lowpass', K.klp, 0.6);
  keys.connect(klp); klp.connect(mix);
  // A soft echo on the keys.
  const dly = ctx.createDelay(1), fb = gn(0.32), dlp = filt('lowpass', 1600, 0.5), send = gn(0.22);
  dly.delayTime.value = s * 3;
  klp.connect(send); send.connect(dly); dly.connect(dlp); dlp.connect(mix); dlp.connect(fb); fb.connect(dly);
  const wob = wobble(...K.wob);

  // Soft electric piano note.
  const ep = (t, midi, v, dur, dest = keys) => {
    const f = mtof(midi), g = gn(0), tau = clamp(dur, 0.4, 3) * 0.33, a = 0.025, end = t + a + tau * 7;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.setTargetAtTime(0, t + a, tau);
    [['triangle', f, -5, 1], ['sine', f, 5, 0.8], ['sine', f * 2, 0, 0.22]].forEach(([ty, fr, dt, lv]) => {
      const o = ctx.createOscillator();
      o.type = ty; o.frequency.value = fr; o.detune.value = dt;
      wob.node.connect(o.detune);
      if (lv < 1) { const og = gn(lv); o.connect(og); og.connect(g); } else o.connect(g);
      o.start(t); o.stop(end);
    });
    g.connect(dest);
  };
  const bass = (t, m, dur) => {
    const f = mtof(m), g = gn(0), l = filt('lowpass', 380), tau = dur * 0.4, end = t + 0.012 + tau * 7;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.012);
    g.gain.setTargetAtTime(0, t + 0.012, tau);
    [['sine', 1], ['triangle', 0.3]].forEach(([ty, lv]) => {
      const o = ctx.createOscillator(), og = gn(lv);
      o.type = ty; o.frequency.value = f; wob.node.connect(o.detune);
      o.connect(og); og.connect(l); o.start(t); o.stop(end);
    });
    l.connect(g); g.connect(mix);
  };
  const kick = (t, v) => {
    const o = ctx.createOscillator(), g = gn(0);
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.003); g.gain.setTargetAtTime(0, t + 0.005, 0.09);
    o.connect(g); g.connect(mix); o.start(t); o.stop(t + 0.7);
  };
  const snare = (t, v, rim) => {
    if (rim) {
      burst(t, mix, 'bandpass', 1800, 5, v * 0.5, 0.04);
      const o = ctx.createOscillator(), g = gn(0);
      o.frequency.value = 820; g.gain.setValueAtTime(v * 0.15, t); g.gain.setTargetAtTime(0, t, 0.012);
      o.connect(g); g.connect(mix); o.start(t); o.stop(t + 0.15);
    } else {
      burst(t, mix, 'bandpass', 1900, 0.8, v * 0.5, 0.15);
      const o = ctx.createOscillator(), g = gn(0);
      o.frequency.value = 185; g.gain.setValueAtTime(v * 0.25, t); g.gain.setTargetAtTime(0, t, 0.03);
      o.connect(g); g.connect(mix); o.start(t); o.stop(t + 0.3);
    }
  };

  let n = 0, bar = -1, last = -1, key = pick(KEYS);
  let prog, chord, voicing = null, prevAvg = 0, kicks, comp, bassSteps, rim, fill, melIdx = 6, lastMel = 0, pool = [];
  const t0 = ctx.currentTime + 0.15;
  const at = i => t0 + i * s + (i % 2 ? sw * s : 0);   // swing: odd 16ths come late

  function newBar(b) {
    if (b % 4 === 0) {
      do prog = pick(progs); while (prog === last);
      last = prog;
      if (Math.random() < 0.3) key = pick(KEYS);
      kicks = pick(K.kicks); comp = pick(K.comps); bassSteps = pick(K.basses); rim = Math.random() < K.rim;
      const pent = prog.m ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
      pool = [];
      for (let m = 70; m <= 88; m++) if (pent.includes((((m - key) % 12) + 12) % 12)) pool.push(m);
    }
    chord = prog.c[b % 4];
    voicing = voice(key + chord[0], SHAPE[chord[1]], prevAvg);
    prevAvg = voicing.reduce((a, c) => a + c, 0) / voicing.length;
    fill = b % 4 === 3 && Math.random() < 0.6;
  }

  function play(k, t) {
    const i = k & 15;
    if (i === 0) {
      // A little change inside the 4 bars.
      if (Math.random() < 0.3) comp = pick(K.comps);
      if (Math.random() < 0.3) kicks = pick(K.kicks);
    }
    const hum = R(-0.006, 0.006);
    t = Math.max(ctx.currentTime, t + hum);
    // Chords
    const ci = comp.indexOf(i);
    if (ci >= 0) {
      const dur = clamp(((comp[ci + 1] ?? 16) - i) * s * 1.1, 0.5, 2.6);
      voicing.forEach((m, j) => ep(t + j * 0.014 + R(0, 0.01), m, R(0.07, 0.1) * (i === 0 ? 1 : 0.8), dur));
    }
    // Bass on the root
    if (bassSteps.includes(i)) {
      const pc = key + chord[0], m = 36 + (((pc - 36) % 12) + 12) % 12;
      bass(t, m, i === 0 ? s * 6 : s * 3);
    }
    // Drums
    if (kicks.includes(i)) kick(t, R(0.7, 1) * K.kickV);
    if (K.snares.includes(i)) snare(t, R(0.8, 1) * (K.rim === 1 ? 0.7 : 1), K.rim === 1 || (rim && i === 12));
    if (fill && i >= 12 && Math.random() < 0.5) snare(t, R(0.3, 0.55), Math.random() < 0.5);
    if (i === 15 && Math.random() < 0.15) snare(t, 0.3, false);
    // Hats: each kit has its own habit
    const hv = K.hatV, open = (K.hat === 'open' || K.hat === 'off') && i % 4 === 2;
    if (K.hat === 'shaker') burst(t, mix, 'highpass', 6500, 0.7, R(0.02, 0.04) * (i % 4 === 2 ? 1.6 : 1) * hv, 0.035);
    else if (K.hat === 'quarter') { if (i % 4 === 0 && Math.random() < 0.9) burst(t, mix, 'highpass', 7500, 0.7, R(0.04, 0.08) * hv, 0.03); }
    else if (K.hat === 'off') { if (open) burst(t, mix, 'highpass', 7000, 0.7, R(0.05, 0.09) * hv, 0.1); }
    else if (i % 2 === 0) {
      if (Math.random() < 0.92) burst(t, mix, 'highpass', 7500, 0.7, R(0.05, 0.1) * hv, open || (i === 14 && Math.random() < 0.35) ? 0.13 : K.hat === 'ride' ? 0.07 : 0.03);
    } else if (Math.random() < (fill ? 0.7 : K.hat === 'ride' ? 0.5 : 0.3)) burst(t, mix, 'highpass', 8000, 0.7, R(0.02, 0.05) * hv, 0.02);
    // Sparse melody from the pentatonic scale
    if (i % 2 === 0 && t - lastMel > 1.3 && Math.random() < K.mel) {
      melIdx = clamp(melIdx + pick([-2, -1, -1, 0, 1, 1, 2]), 0, pool.length - 1);
      ep(t, pool[Math.round(melIdx)], R(0.045, 0.075), 1.4);
      lastMel = t;
    }
  }

  return {
    step(until) {
      const now = ctx.currentTime;
      while (at(n) < until) {
        const b = n >> 4;
        if (b !== bar) { bar = b; newBar(b); }
        if (at(n) > now - 0.05) play(n, at(n));   // skip steps that are already late
        n++;
      }
    },
    kill() { wob.stop(); },
  };
}

// Piano progressions: major-7 and add-9 colours. Each chord lasts 8 beats.
const PIANO_PROGS = [
  [[0, 'maj7'], [5, 'add9'], [9, 'm7'], [7, 'add9']],
  [[0, 'add9'], [9, 'm7'], [5, 'maj7'], [7, 'add9']],
  [[5, 'maj7'], [7, 'add9'], [4, 'm7'], [9, 'm7']],
  [[0, 'maj7'], [4, 'm7'], [5, 'add9'], [0, 'maj7']],
  [[9, 'm7'], [5, 'maj7'], [0, 'add9'], [7, 'add9']],
  [[2, 'm7'], [7, 'add9'], [0, 'maj7'], [5, 'add9']],
];
const PIANO_MINOR = [
  [[0, 'm7'], [8, 'maj7'], [3, 'add9'], [10, 'add9']],
  [[0, 'm7'], [5, 'm7'], [8, 'maj7'], [7, 'm7']],
  [[0, 'm7'], [10, 'add9'], [8, 'maj7'], [3, 'maj7']],
];
const PSHAPE = { maj7: [0, 4, 7, 11], add9: [0, 4, 7, 14], m7: [0, 3, 7, 10] };

// The pianos to choose from: one player, different pieces. A kit only lists what it changes; the rest
// comes from the defaults at the top of makePiano.
//   bpm: [low, high]     minor: 1 = minor keys     bar: beats per chord     pad: how loud the warm pad is (0 = none)
//   left: what the left hand does: roll | arp (broken chord) | waltz (one, two-three) | block (soft chords) | none
//   lo, hi: the lowest and highest melody note     mel: how often a melody note comes     v: [soft, loud]
//   tau: how long a note rings (1 = normal)        bright: how bright the hit is          rsend, dsend: room and echo
//   gain: evens out how loud the kits are (measured, so that picking another one does not jump in level)
const PIANOS = {
  felt: {},
  rain: { gain: 1.6, bpm: [60, 66], mel: 0.55, lo: 72, hi: 96, v: [0.05, 0.1], pad: 0.03, dsend: 0.42, left: 'none' },
  nocturne: { gain: 1.1, bpm: [50, 54], minor: 1, left: 'arp', mel: 0.26, pad: 0.03 },
  mist: { gain: 0.75, bpm: [40, 46], pad: 0.075, rsend: 0.85, mel: 0.2, v: [0.07, 0.12] },
  waltz: { gain: 0.7, bpm: [84, 92], bar: 6, left: 'waltz', mel: 0.3, pad: 0.025 },
  musicbox: { gain: 1.7, bpm: [66, 72], lo: 76, hi: 98, tau: 0.45, bright: 5200, pad: 0, left: 'arp', arpUp: 24, mel: 0.4, v: [0.06, 0.1], rsend: 0.7 },
  hymn: { bpm: [56, 60], left: 'block', mel: 0.14 },
  blue: { bpm: [50, 56], minor: 1, lo: 55, hi: 76, bright: 2200, mel: 0.28, pad: 0.055 },
};

function impulse(sec) {
  if (bufs.ir) return bufs.ir;
  const sr = ctx.sampleRate, n = Math.floor(sec * sr), buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += ((Math.random() * 2 - 1) * Math.exp(-5 * i / n) - lp) * 0.3;   // dark, fading tail
      d[i] = lp;
    }
  }
  return (bufs.ir = buf);
}

// Slow, sparse felt piano over a warm pad.
function makePiano(out, kit = {}) {
  const K = { bpm: [54, 58], minor: 0, bar: 8, pad: 0.045, left: 'roll', lo: 60, hi: 84, mel: 0.32, v: [0.1, 0.18], tau: 1, bright: 3000, rsend: 0.5, dsend: 0.28, arpUp: 0, ...kit };
  const progs = K.minor ? PIANO_MINOR : PIANO_PROGS, scale = K.minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const beat = 60 / R(...K.bpm);
  const mix = gn(1);
  mix.connect(out);
  const rev = ctx.createConvolver(), rsend = gn(K.rsend), rwet = gn(0.6);
  rev.buffer = impulse(3.2);
  rsend.connect(rev); rev.connect(rwet); rwet.connect(mix);
  const dly = ctx.createDelay(2), dfb = gn(0.38), dlp = filt('lowpass', 1700, 0.5), dsend = gn(K.dsend);
  dly.delayTime.value = beat * 0.75;
  dsend.connect(dly); dly.connect(dlp); dlp.connect(mix); dlp.connect(dfb); dfb.connect(dly); dlp.connect(rsend);
  const dry = gn(1);
  dry.connect(mix); dry.connect(rsend); dry.connect(dsend);
  const padLP = filt('lowpass', 750, 0.4), padG = gn(1);
  padLP.connect(padG); padG.connect(mix); padG.connect(rsend);
  const wob = wobble(4, 3);

  const fp = (t, midi, v) => {   // felt piano note
    const f = mtof(midi), a = 0.012, tau = clamp(1.7 - (midi - 48) * 0.025, 0.6, 1.8) * K.tau, end = t + a + tau * 7;
    const g = gn(0), lp = filt('lowpass', K.bright, 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.setTargetAtTime(0, t + a, tau);
    lp.frequency.setValueAtTime(K.bright, t);
    lp.frequency.setTargetAtTime(K.bright * 0.3, t, 0.25);   // felt: bright at the hit, then dark
    [[f, 1], [f * 1.003, 0.5], [f * 2, 0.3], [f * 3, 0.08]].forEach(([fr, lv]) => {
      const o = ctx.createOscillator(), og = gn(lv);
      o.frequency.value = fr; o.connect(og); og.connect(lp); o.start(t); o.stop(end);
    });
    lp.connect(g); g.connect(dry);
  };
  const pad = (t, notes, dur) => {
    const lp = filt('lowpass', 700, 0.4), g = gn(0), end = t + dur + 5;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(K.pad, t + 2.4);
    g.gain.setValueAtTime(K.pad, t + dur);
    g.gain.setTargetAtTime(0, t + dur, 1);
    notes.forEach(m => [-7, 7].forEach(dt => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt;
      wob.node.connect(o.detune); o.connect(lp); o.start(t); o.stop(end);
    }));
    lp.connect(g); g.connect(padLP);
  };

  let n = 0, bt = ctx.currentTime + 0.2, key = pick([0, 2, 5, 7, 9]), prog = null, chord, notes = [], pool = [], melIdx = 8, lastNote = 0;

  function beatAt(k, t) {
    const b = k % K.bar;
    if (b === 0) {                                                   // a new chord
      const ci = Math.floor(k / K.bar);
      if (ci % 4 === 0) { prog = pick(progs); if (Math.random() < 0.4) key = pick([0, 2, 5, 7, 9]); }
      chord = prog[ci % 4];
      const rootPc = key + chord[0];
      notes = PSHAPE[chord[1]].map(i => 48 + ((((rootPc - 48) % 12) + 12) % 12) + i);
      if (K.pad) pad(t, notes.slice(0, 4).map(m => m - (m > 66 ? 12 : 0)), beat * K.bar + 0.5);
      if (K.left !== 'none') fp(t, 36 + ((((rootPc - 36) % 12) + 12) % 12) + 12, 0.14);   // low root
      const pcs = notes.map(m => m % 12);
      pool = [];
      for (let m = K.lo; m <= K.hi; m++) if (scale.some(pc => (m - key - pc) % 12 === 0) || pcs.includes(m % 12)) pool.push(m);
      if (K.left === 'roll' && Math.random() < 0.6) notes.slice(0, 3).forEach((m, j) => fp(t + beat * 0.5 + j * beat * R(0.3, 0.6), m + 12, R(0.08, 0.12)));   // a slow roll
      if (K.left === 'block') notes.forEach((m, j) => fp(t + j * 0.02, m, R(0.05, 0.08)));
      lastNote = t;
    }
    // what the left hand does between chord changes
    if (K.left === 'arp') fp(t, notes[[0, 2, 1, 3, 2, 1, 3, 2][b % 8]] + K.arpUp, R(0.05, 0.08));
    else if (K.left === 'waltz' && b % 3) notes.slice(1).forEach((m, j) => fp(t + j * 0.012, m, R(0.035, 0.055)));
    else if (K.left === 'waltz' && b) fp(t, notes[2] - 12, 0.1);
    else if (K.left === 'block' && b === K.bar / 2) notes.forEach((m, j) => fp(t + j * 0.02, m, R(0.04, 0.06)));
    if (b === 0) return;
    if (t - lastNote > beat * 0.9 && Math.random() < K.mel) {
      const tt = t + R(0, beat * 0.6);
      melIdx = clamp(melIdx + pick([-3, -2, -1, 0, 1, 2, 3]), 0, pool.length - 1);
      const m = pool[Math.round(melIdx)];
      fp(tt, m, R(...K.v));
      if (Math.random() < 0.2) fp(tt + R(0.01, 0.05), pool[Math.max(0, Math.round(melIdx) - 2)], R(K.v[0] * 0.6, K.v[0]));
      lastNote = tt;
    }
  }

  return {
    step(until) {
      const now = ctx.currentTime;
      while (bt < until) {
        if (bt > now - 0.05 || n % K.bar === 0) beatAt(n, Math.max(bt, now));
        n++; bt += beat;
      }
    },
    kill() { wob.stop(); },
  };
}

function startSong(fade) {
  const g = gn(0);
  g.connect(musBus);
  const inst = st.style === 'piano' ? makePiano(g, PIANOS[st.kit.piano]) : makeBeat(g, BEATS[st.kit.beat]);
  inst.g = g; inst.id = st.style; inst.kit = st.kit[st.style];
  ramp(g.gain, STYLE_GAIN[st.style] * ((st.style === 'piano' ? PIANOS : BEATS)[inst.kit].gain || 1), fade / 3);
  song = inst;
  wake();
}

function stopSong(inst, fade) {
  ramp(inst.g.gain, 0, fade / 5);
  setTimeout(() => { inst.kill(); inst.g.disconnect(); }, fade * 1500 + 100);
}

// ---------- chimes and ring ----------

// A bell strike: inharmonic partials, each fading at its own speed.
function bell(t, f, amp, dest, tail = 1) {
  [[1, 1, 1.6], [2.76, 0.55, 0.9], [5.4, 0.28, 0.5], [8.93, 0.12, 0.3]].forEach(([r, lv, tau]) => {
    const o = ctx.createOscillator(), g = gn(0), tc = tau * tail;
    o.frequency.value = f * r;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp * lv, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.003, tc);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.003 + tc * 7);
  });
}

function chimeAt(kind, t, dest) {
  if (kind === 'bell') {
    bell(t, 880, 0.17, dest, 1);
    bell(t + 1, 660, 0.12, dest, 1);
  } else if (kind === 'digital') {
    [[988, 0], [988, 0.17], [1319, 0.34]].forEach(([f, dt]) => {
      const o = ctx.createOscillator(), l = filt('lowpass', 3200), g = gn(0), s = t + dt;
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.25, s + 0.004);
      g.gain.setValueAtTime(0.25, s + 0.09);
      g.gain.linearRampToValueAtTime(0, s + 0.1);
      o.connect(l); l.connect(g); g.connect(dest); o.start(s); o.stop(s + 0.12);
    });
  } else {   // soft
    [[784, 0], [988, 0.22], [1175, 0.44]].forEach(([f, dt]) => {
      const s = t + dt;
      [[1, 1], [2, 0.15]].forEach(([r, lv]) => {
        const o = ctx.createOscillator(), g = gn(0);
        o.frequency.value = f * r;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.14 * lv, s + 0.015);
        g.gain.setTargetAtTime(0, s + 0.015, 0.7);
        o.connect(g); g.connect(dest); o.start(s); o.stop(s + 5.2);
      });
    });
  }
}

function startRing() {
  if (!ctx || ring) return;
  const g = gn(1);
  g.connect(master);
  ring = { g, t: ctx.currentTime + 0.05, end: ctx.currentTime + 60 };   // stops by itself after 60 s
  wake();
}

function stopRing() {
  st.ring = false;
  if (!ring) return;
  const r = ring;
  ring = null;
  ramp(r.g.gain, 0, 0.01);   // notes already scheduled go quiet at once
  setTimeout(() => r.g.disconnect(), 300);
}

// ---------- scheduler ----------

function wake() { if (!timer) timer = setInterval(tick, TICK); }

function tick() {
  const now = ctx.currentTime, until = now + AHEAD;
  for (const l of Object.values(live)) {
    for (const e of l.ev) {
      if (e.t < now) e.t = now;
      while (e.t < until) e.t += e.f(e.t);
    }
  }
  if (song) song.step(until);
  if (ring) {
    if (now > ring.end) stopRing();
    else while (ring.t < until && ring.t < ring.end) {
      [[880, 0], [880, 0.28], [1175, 0.56]].forEach(([f, dt]) => bell(ring.t + dt, f, 0.15, ring.g, 0.6));
      ring.t += 2.2;
    }
  }
  if (!song && !ring && !Object.keys(live).length) { clearInterval(timer); timer = 0; }
}

// ---------- public API ----------

function build() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  ctx = new AC({ latencyHint: 'playback' });
  master = gn(st.muted ? 0 : st.master);
  limiter = ctx.createDynamicsCompressor();   // gentle limiter: only touches the loud peaks
  limiter.threshold.value = -3; limiter.knee.value = 2; limiter.ratio.value = 12;
  limiter.attack.value = 0.003; limiter.release.value = 0.15;
  // Safety ceiling after the limiter: the compressor can overshoot for a few ms,
  // so loud peaks are bent softly and never go over 0.95.
  const ceil = ctx.createWaveShaper(), curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / 1024 - 1), a = Math.abs(x);
    curve[i] = a < 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
  }
  ceil.curve = curve;
  an = ctx.createAnalyser();
  an.fftSize = 2048; an.smoothingTimeConstant = 0.72;   // finer in the lows and a little quicker, for the sound wave
  ambBus = gn(1); musBus = gn(st.vol);
  ambBus.connect(master); musBus.connect(master);
  master.connect(limiter); limiter.connect(ceil); ceil.connect(an); an.connect(ctx.destination);
  LAYERS.forEach(n => setL(n, st.layers[n], 0.13));
  if (st.want) startSong(0.4);
  if (st.ring) startRing();
}

const applyMaster = () => { if (ctx) ramp(master.gain, st.muted ? 0 : st.master, 0.015); };

export const sound = {
  unlock() {
    if (!ctx) build();
    return ctx && ctx.state !== 'running' ? ctx.resume().catch(() => {}) : Promise.resolve();
  },
  get ready() { return !!ctx && ctx.state === 'running'; },
  setMaster(v) { st.master = clamp(v); applyMaster(); },
  mute(on) { st.muted = !!on; applyMaster(); },
  get muted() { return st.muted; },
  LAYERS,
  setLayer(name, v) { if (LAYERS.includes(name)) setL(name, clamp(v), 0.13); },
  setMix(mix) { LAYERS.forEach(n => setL(n, clamp(mix && mix[n]), 0.65)); },   // slow 2 s ramp. A missing key means 0.
  music: {
    play() { st.want = true; if (ctx && !song) startSong(0.4); },
    pause() {
      st.want = false;
      if (song) { const s = song; song = null; stopSong(s, 0.3); }
    },
    toggle() { st.want ? this.pause() : this.play(); },
    get playing() { return st.want; },
    setStyle(id) {
      if (id !== 'piano' && id !== 'beat') return;
      st.style = id;
      if (ctx && song && song.id !== id) { const old = song; song = null; stopSong(old, 1.8); startSong(1.8); }
    },
    KITS: { beat: Object.keys(BEATS), piano: Object.keys(PIANOS) },      // the beats and the pianos to choose from
    setKit(style, id) {
      if (!(style === 'piano' ? PIANOS : style === 'beat' ? BEATS : {})[id]) return;
      st.kit[style] = id;
      if (ctx && song && song.id === style && song.kit !== id) { const old = song; song = null; stopSong(old, 1.2); startSong(1.2); }
    },
    setVolume(v) { st.vol = clamp(v); if (ctx) ramp(musBus.gain, st.vol, 0.05); },
  },
  chime(kind) { if (ctx) chimeAt(kind, ctx.currentTime + 0.03, master); },
  ringStart() { st.ring = true; startRing(); },
  ringStop() { stopRing(); },
  analyser() { return an || null; },
  // Send an <audio> element through the music bus, so master volume, mute and the sound wave apply to it.
  attach(el) {
    if (!ctx) return false;
    if (!el._node) { el._node = ctx.createMediaElementSource(el); el._node.connect(musBus); }
    return true;
  },
};
