// Shared pieces for the Igloo rebuild: maths that matches the original's helpers, GLSL chunks,
// procedural textures (the original ships these as KTX2 files; ours are generated at load),
// the camera rig every scene uses, and a small bloom.
import * as THREE from 'three';

export const gsap = window.gsap;
gsap.registerPlugin(window.CustomEase);
const CE = window.CustomEase;
// Igloo's eases, as registered in their bundle.
CE.create('inOut1', 'M0,0 C0.5,0 0.1,1 1,1');
CE.create('inOut2', 'M0,0 C0.56,0 0,1 1,1');
CE.create('inOut3', 'M0,0 C0.6,0 0,1 1,1');
CE.create('inOut4', 'M0,0 C0.4,0 -0.06,1 1,1');
CE.create('inOut5', 'M0,0 C0.171,0 0.77,-0.013 0.842,0.272 0.972,0.794 0.972,0.85 1,1');
CE.create('entry_ease', 'M0,0 C0.358,0 0.336,0.209 0.442,0.519 0.59,0.952 0.768,0.918 1,1');
CE.create('entry_ease_2', 'M0,0 C0.388,0.082 0.924,0.862 1,1');
CE.create('entry_ease_3', 'M0,0 C0.272,0 0.472,0.454 0.496,0.496 0.66,0.79 0.685,1 1,1');
CE.create('igloo_ease_1', 'M0,0 C0.662,0.073 0.047,1 1,1');
gsap.defaults({ ease: 'power2.inOut', duration: 0.6 });

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── maths ────────────────────────────────────────────────────────────────────────────────
export const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
export const mix = (a, b, t) => a + (b - a) * t;
export const fit = (x, a1, a2, b1, b2) => clamp(b1 + ((x - a1) * (b2 - b1)) / (a2 - a1), Math.min(b1, b2), Math.max(b1, b2));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerpK = (k, dt) => 1 - Math.pow(1 - k, dt * 60);
export const lerpFPS = (a, b, k, dt) => a + (b - a) * lerpK(k, dt);
export const frictionFPS = (k, dt) => Math.pow(k, dt * 60);
const easeCache = {};
export const ease = (t, name) => (easeCache[name] || (easeCache[name] = gsap.parseEase(name)))(clamp(t, 0, 1));

export function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ─── GLSL ─────────────────────────────────────────────────────────────────────────────────
export const GL_FIT = /* glsl */`
  float efit(float x, float a1, float a2, float b1, float b2) { return b1 + ((x - a1) * (b2 - b1)) / (a2 - a1); }
  float fit(float x, float a1, float a2, float b1, float b2) { return clamp(efit(x, a1, a2, b1, b2), min(b1, b2), max(b1, b2)); }
  float linstep(float a, float b, float t) { return clamp((t - a) / (b - a), 0.0, 1.0); }
  // A step that sweeps from start to end as progress goes 0 to 1, softened over margin.
  float falloff(float x, float start, float end, float margin, float progress) {
    float m = margin * sign(end - start);
    float p = mix(start - m, end, progress);
    return linstep(p + m, p, x);
  }
  float falloffsmooth(float x, float start, float end, float margin, float progress) {
    float m = margin * sign(end - start);
    float p = mix(start - m, end, progress);
    return smoothstep(p + m, p, x);
  }
  float cubicIn(float t) { return t * t * t; }
  float cubicOut(float t) { float f = t - 1.0; return f * f * f + 1.0; }
  float quadIn(float t) { return t * t; }
  float quadOut(float t) { return -t * (t - 2.0); }
  float sineIn(float t) { return 1.0 - cos(t * 1.5707963); }
`;

export const GL_NOISE = /* glsl */`
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float hash13(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
  vec3 hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
  }
  float vnoise3(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), b = mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x);
    float c = mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), d = mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
  float fbm3(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise3(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
  // Streaky drifting snow, the job Igloo's wind_noise texture does.
  float wind(vec2 p) { return smoothstep(0.45, 1.0, vnoise(p * vec2(1.0, 3.5)) * vnoise(p * vec2(0.7, 2.2) + 9.3) * 2.2); }
  // Equilateral triangle tiling: every triangle gets its own brightness, edges dark.
  float triangles(vec2 p) {
    vec2 s = vec2(p.x + p.y * 0.57735, p.y * 1.1547);
    vec2 i = floor(s), f = fract(s);
    float up = step(f.y, f.x);
    float id = hash12(i * 2.0 + up);
    float edge = min(min(f.x, f.y), abs(f.x - f.y));
    edge = min(edge, min(1.0 - f.x, 1.0 - f.y));
    return id * smoothstep(0.02, 0.07, edge);
  }
`;

// Spectral chromatic aberration: five taps along a barrel bend, weighted red to blue.
export const GL_CA = /* glsl */`
  vec3 spectrum(float t) {
    float lo = step(t, 0.5), hi = 1.0 - lo;
    float w = clamp(1.0 - abs(2.0 * clamp((t - 1.0 / 6.0) / (4.0 / 6.0), 0.0, 1.0) - 1.0), 0.0, 1.0);
    return pow(vec3(lo, 1.0, hi) * vec3(1.0 - w, w, 1.0 - w), vec3(1.0 / 2.2));
  }
  vec2 barrel(vec2 uv, float amt) { vec2 c = uv - 0.5; return uv + c * dot(c, c) * amt; }
  vec3 aberrate(sampler2D tex, vec2 uv, float maxBend, float amount) {
    vec3 sum = vec3(0.0), wsum = vec3(0.0);
    for (int i = 0; i < 5; i++) {
      float t = float(i) / 5.0;
      vec3 w = spectrum(t);
      wsum += w;
      sum += w * texture2D(tex, barrel(uv, amount * maxBend * t)).rgb;
    }
    return sum / wsum;
  }
`;

// ─── procedural textures ──────────────────────────────────────────────────────────────────
function dataTex(data, w, h, opts = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = opts.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.magFilter = t.minFilter = opts.nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// The transition texture. r: a shattered-ice reveal order (cracks first, then cell by cell),
// g: blocky "tech" displacement, b: a slow wobble for the cut's slope. Tiles in both directions.
export function scrollTexture(N = 512) {
  const rand = rng(11);
  const G = 9;
  const pts = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) pts.push([(i + 0.15 + rand() * 0.7) / G, (j + 0.15 + rand() * 0.7) / G, rand()]);
  const blocks = Array.from({ length: 4 }, () => Array.from({ length: 64 * 64 }, () => rand()));
  const smooth = Array.from({ length: 8 * 8 }, () => rand());
  const sm = (u, v) => {
    const x = u * 8, y = v * 8, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const g = (a, b) => smooth[((b + 8) % 8) * 8 + ((a + 8) % 8)];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (g(i, j) * (1 - sx) + g(i + 1, j) * sx) * (1 - sy) + (g(i, j + 1) * (1 - sx) + g(i + 1, j + 1) * sx) * sy;
  };
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      let d1 = 9, d2 = 9, id = 0;
      const ci = Math.floor(u * G), cj = Math.floor(v * G);
      for (let oj = -1; oj <= 1; oj++) for (let oi = -1; oi <= 1; oi++) {
        const ii = (ci + oi + G) % G, jj = (cj + oj + G) % G;
        const p = pts[jj * G + ii];
        let dx = p[0] - u, dy = p[1] - v;
        dx -= Math.round(dx); dy -= Math.round(dy); // wrap, so the texture tiles
        const d = Math.hypot(dx, dy);
        if (d < d1) { d2 = d1; d1 = d; id = p[2]; } else if (d < d2) d2 = d;
      }
      const crack = d2 - d1 < 0.006 ? 1 : 0;
      const r = crack ? 0.04 : 0.2 + id * 0.65 + (d1 * G) * 0.12;
      let g = 0;
      [[8, 32], [16, 4], [4, 64], [32, 16]].forEach(([bx, by], k) => {
        const bi = Math.floor(u * bx) % 64, bj = Math.floor(v * by) % 64;
        g += blocks[k][bj * 64 + bi] * [0.4, 0.25, 0.2, 0.15][k];
      });
      const b = sm(u, v) * 0.7 + sm(u * 2 % 1, v * 2 % 1) * 0.3;
      const o = (y * N + x) * 4;
      data[o] = Math.round(clamp(r, 0, 1) * 255);
      data[o + 1] = Math.round(g * 255);
      data[o + 2] = Math.round(b * 255);
      data[o + 3] = 255;
    }
  }
  return dataTex(data, N, N);
}

export function noiseTexture(N = 64) {
  const rand = rng(5);
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rand() * 256);
  return dataTex(data, N, N, { nearest: true });
}

// Periodic value-noise octaves, so a texture built from them tiles with period 1.
function periodicNoise(rand, cells) {
  const g = Float32Array.from({ length: cells * cells }, () => rand());
  return (u, v) => {
    const x = u * cells, y = v * cells, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const at = (a, b) => g[(((b % cells) + cells) % cells) * cells + (((a % cells) + cells) % cells)];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (at(i, j) * (1 - sx) + at(i + 1, j) * sx) * (1 - sy) + (at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx) * sy;
  };
}

// Soft drifting cloud, the job Igloo's wind_noise texture does for every smoke layer: r is the
// cloud, g a second, finer one. Tiles, so smoke can wrap round a ring without a seam.
export function cloudTexture(N = 256) {
  const rand = rng(17);
  const oct = [4, 8, 16, 32].map((c) => periodicNoise(rand, c));
  const fine = [8, 16, 32, 64].map((c) => periodicNoise(rand, c));
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      const a = oct[0](u, v) * 0.5 + oct[1](u, v) * 0.27 + oct[2](u, v) * 0.15 + oct[3](u, v) * 0.08;
      const b = fine[0](u, v) * 0.5 + fine[1](u, v) * 0.27 + fine[2](u, v) * 0.15 + fine[3](u, v) * 0.08;
      const o = (y * N + x) * 4;
      data[o] = Math.round(smoothstep(0.22, 0.78, a) * 255);
      data[o + 1] = Math.round(smoothstep(0.25, 0.75, b) * 255);
      data[o + 2] = Math.round(a * 255);
      data[o + 3] = 255;
    }
  }
  const t = dataTex(data, N, N);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Frost for the project transition: ridged noise, sharp like ice crystals on glass.
export function frostTexture(N = 256) {
  const rand = rng(23);
  const oct = [6, 12, 24, 48, 96].map((c) => periodicNoise(rand, c));
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      let s = 0, a = 0.5;
      oct.forEach((n) => { s += (1 - Math.abs(n(u, v) * 2 - 1)) * a; a *= 0.55; });
      const o = (y * N + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = Math.round(clamp(Math.pow(s / 0.95, 3), 0, 1) * 255);
      data[o + 3] = 255;
    }
  }
  return dataTex(data, N, N);
}

// Text drawn into a canvas, for labels that live inside a scene (so transitions cut through them).
export function textTexture(lines, opts = {}) {
  const {
    font = '500 64px "IBM Plex Mono", monospace', color = '#ffffff', width = 1024, height = 256,
    align = 'left', lineHeight = 1.25, pad = 16, bg = null,
  } = opts;
  const cv = document.createElement('canvas');
  cv.width = width; cv.height = height;
  const c = cv.getContext('2d');
  if (bg) { c.fillStyle = bg; c.fillRect(0, 0, width, height); }
  c.textBaseline = 'top';
  c.textAlign = align;
  let y = pad;
  for (const line of lines) {
    const f = line.font || font;
    c.font = f;
    c.fillStyle = line.color || color;
    const size = parseFloat(f.match(/(\d+)px/)[1]);
    const x = align === 'center' ? width / 2 : align === 'right' ? width - pad : pad;
    c.fillText(line.text, x, y);
    y += size * (line.lineHeight || lineHeight);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ─── geometry helpers ─────────────────────────────────────────────────────────────────────
export function weld(geo) {
  const pos = geo.attributes.position;
  const map = new Map(), index = [], remap = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (!map.has(k)) { map.set(k, remap.length); remap.push(i); }
    index.push(map.get(k));
  }
  const src = geo.index ? geo.index.array : null;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name];
    const arr = new Float32Array(remap.length * a.itemSize);
    remap.forEach((s, d) => { for (let c = 0; c < a.itemSize; c++) arr[d * a.itemSize + c] = a.array[s * a.itemSize + c]; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  out.setIndex(src ? Array.from(src, (i) => index[i]) : index);
  return out;
}

// A rounded box, bent onto whatever shell `place(a, b, c)` describes (a, b, c each 0..1).
export function bentBlock(place, half, round = 0.1, segs = [8, 6, 4]) {
  const box = new THREE.BoxGeometry(2, 2, 2, ...segs);
  box.deleteAttribute('uv');
  box.deleteAttribute('normal');
  const pos = box.attributes.position;
  const rr = half.map((h) => Math.min(round / h, 0.9));
  const emission = new Float32Array(pos.count);
  const q = [0, 0, 0], c = [0, 0, 0], d = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    q[0] = pos.getX(i); q[1] = pos.getY(i); q[2] = pos.getZ(i);
    let len = 0;
    for (let k = 0; k < 3; k++) { c[k] = clamp(q[k], -(1 - rr[k]), 1 - rr[k]); d[k] = (q[k] - c[k]) / rr[k]; len += d[k] * d[k]; }
    len = Math.sqrt(len);
    if (len > 1e-5) for (let k = 0; k < 3; k++) q[k] = c[k] + (d[k] / len) * rr[k];
    const p = place((q[0] + 1) / 2, (q[1] + 1) / 2, (q[2] + 1) / 2);
    pos.setXYZ(i, p.x, p.y, p.z);
    emission[i] = Math.pow(1 - (q[2] + 1) / 2, 1.5);
  }
  box.setAttribute('aEmission', new THREE.BufferAttribute(emission, 1));
  const g = weld(box);
  g.computeVertexNormals();
  return g;
}

// Many blocks into one geometry; each vertex knows its block centre, a random vector and its index.
export function mergeBlocks(blocks) {
  const rand = rng(77);
  let vcount = 0, icount = 0;
  blocks.forEach((b) => { vcount += b.geo.attributes.position.count; icount += b.geo.index.count; });
  const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3), em = new Float32Array(vcount);
  const cen = new Float32Array(vcount * 3), rnd = new Float32Array(vcount * 3), bid = new Float32Array(vcount);
  const idx = new Uint32Array(icount);
  let vo = 0, io = 0;
  blocks.forEach((b, n) => {
    b.rand = new THREE.Vector3(rand(), rand(), rand());
    const g = b.geo, c = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    em.set(g.attributes.aEmission.array, vo);
    for (let i = 0; i < c; i++) {
      cen.set([b.centroid.x, b.centroid.y, b.centroid.z], (vo + i) * 3);
      rnd.set([b.rand.x, b.rand.y, b.rand.z], (vo + i) * 3);
      bid[vo + i] = n;
    }
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += c; io += gi.length;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aEmission', new THREE.BufferAttribute(em, 1));
  geo.setAttribute('aCentroid', new THREE.BufferAttribute(cen, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  geo.setAttribute('aBlock', new THREE.BufferAttribute(bid, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

// ─── camera rig (Igloo's scene camera: a base pose plus mouse sway, shake and smoothing) ──
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3(), _t = new THREE.Vector3();
export class Rig {
  constructor(fov = 30) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 2000);
    this.basePosition = new THREE.Vector3(0, 0, 5);
    this.baseTarget = new THREE.Vector3();
    this.baseUp = new THREE.Vector3(0, 1, 0);
    this.displacement = { position: new THREE.Vector2(), target: new THREE.Vector2(), rotation: 0 };
    this.shake = new THREE.Vector3();
    this.shakeSpeed = new THREE.Vector3(1, 1, 1);
    this.lerpPosition = 0.08;
    this.lerpTarget = 0.08;
    this.touchAmount = 1;
    this.pos = new THREE.Vector3();
    this.tgt = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.fresh = true;
  }

  update(dt, time, mouse) {
    _f.subVectors(this.baseTarget, this.basePosition);
    const dist = _f.length() || 1;
    _f.divideScalar(dist);
    _r.crossVectors(_f, this.baseUp);
    if (_r.lengthSq() < 1e-8) _r.set(1, 0, 0); // looking straight along up
    _r.normalize();
    _u.crossVectors(_r, _f);
    const m = this.touchAmount;
    const s = (k, sp) => (Math.sin(time * sp * 1.31 + k) * 0.6 + Math.sin(time * sp * 2.17 + k * 3.1) * 0.4);
    _p.copy(this.basePosition)
      .addScaledVector(_r, mouse.x * this.displacement.position.x * dist * m + s(0.3, this.shakeSpeed.x) * this.shake.x * dist)
      .addScaledVector(_u, mouse.y * this.displacement.position.y * dist * m + s(1.7, this.shakeSpeed.y) * this.shake.y * dist);
    _t.copy(this.baseTarget)
      .addScaledVector(_r, mouse.x * this.displacement.target.x * dist * m)
      .addScaledVector(_u, mouse.y * this.displacement.target.y * dist * m);
    if (this.fresh) { this.pos.copy(_p); this.tgt.copy(_t); this.up.copy(this.baseUp); this.fresh = false; }
    this.pos.lerp(_p, lerpK(this.lerpPosition, dt));
    this.tgt.lerp(_t, lerpK(this.lerpTarget, dt));
    this.up.lerp(this.baseUp, lerpK(Math.max(this.lerpTarget, 0.05), dt)).normalize();
    const cam = this.camera;
    cam.position.copy(this.pos);
    cam.up.copy(this.up);
    if (this.displacement.rotation) cam.up.applyAxisAngle(_f, this.displacement.rotation * mouse.x * m);
    cam.lookAt(this.tgt);
  }

  snap() { this.fresh = true; }
}

// ─── bloom: threshold, a mip chain down, a tent filter back up ────────────────────────────
const fsVert = /* glsl */`varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const FS_TRIANGLE = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
})();
export function fullscreen(material) {
  const mesh = new THREE.Mesh(FS_TRIANGLE, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { scene, mesh, material };
}
export const FS_VERT = fsVert;
const ORTHO = new THREE.Camera();
export function drawFS(renderer, fs, target) {
  renderer.setRenderTarget(target);
  renderer.render(fs.scene, ORTHO);
}

export class Bloom {
  constructor(levels = 6) {
    this.levels = levels;
    this.down = [];
    this.up = [];
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    for (let i = 0; i < levels; i++) { this.down.push(rt()); this.up.push(rt()); }
    this.bright = fullscreen(new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null }, uThreshold: { value: 0.2 } },
      vertexShader: fsVert,
      fragmentShader: /* glsl */`
        uniform sampler2D tMap; uniform float uThreshold; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tMap, vUv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float k = smoothstep(uThreshold, uThreshold + 0.35, l);
          gl_FragColor = vec4(c * k, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.downPass = fullscreen(new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: fsVert,
      fragmentShader: /* glsl */`
        uniform sampler2D tMap; uniform vec2 uTexel; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tMap, vUv).rgb * 4.0;
          c += texture2D(tMap, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
          c += texture2D(tMap, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
          c += texture2D(tMap, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
          c += texture2D(tMap, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
          gl_FragColor = vec4(c / 8.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.upPass = fullscreen(new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.85 } },
      vertexShader: fsVert,
      fragmentShader: /* glsl */`
        uniform sampler2D tMap, tBase; uniform vec2 uTexel; uniform float uRadius; varying vec2 vUv;
        void main() {
          vec3 c = vec3(0.0);
          c += texture2D(tMap, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
          c += texture2D(tMap, vUv + uTexel * vec2( 0.0, -1.0)).rgb * 2.0;
          c += texture2D(tMap, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
          c += texture2D(tMap, vUv + uTexel * vec2(-1.0,  0.0)).rgb * 2.0;
          c += texture2D(tMap, vUv).rgb * 4.0;
          c += texture2D(tMap, vUv + uTexel * vec2( 1.0,  0.0)).rgb * 2.0;
          c += texture2D(tMap, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
          c += texture2D(tMap, vUv + uTexel * vec2( 0.0,  1.0)).rgb * 2.0;
          c += texture2D(tMap, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
          gl_FragColor = vec4(texture2D(tBase, vUv).rgb + c / 16.0 * uRadius, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
  }

  setSize(w, h) {
    let cw = Math.max(1, w >> 1), ch = Math.max(1, h >> 1);
    for (let i = 0; i < this.levels; i++) {
      this.down[i].setSize(cw, ch);
      this.up[i].setSize(cw, ch);
      cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1);
    }
  }

  render(renderer, input, threshold, radius) {
    this.bright.material.uniforms.tMap.value = input;
    this.bright.material.uniforms.uThreshold.value = threshold;
    drawFS(renderer, this.bright, this.down[0]);
    const d = this.downPass.material.uniforms;
    for (let i = 1; i < this.levels; i++) {
      d.tMap.value = this.down[i - 1].texture;
      d.uTexel.value.set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
      drawFS(renderer, this.downPass, this.down[i]);
    }
    const u = this.upPass.material.uniforms;
    u.uRadius.value = radius;
    let src = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      u.tMap.value = src.texture;
      u.tBase.value = this.down[i].texture;
      u.uTexel.value.set(1 / src.width, 1 / src.height);
      drawFS(renderer, this.upPass, this.up[i]);
      src = this.up[i];
    }
    return this.up[0].texture;
  }
}

// Points sprite material helpers.
export const softDot = /* glsl */`
  float softDot(vec2 pc) { float d = length(pc - 0.5); return smoothstep(0.5, 0.1, d); }
`;
