// Dawn and dusk: the homepage's sea of cloud, now in the same renderer as everything else. The sky is
// a gradient with the sun low in it; the sea is the homepage's ray-marched heaps (../unfold/deck.js),
// ported to write depth, so paper ridges can stand in it with their feet in the cloud; mist drifts
// between the ranges. The camera only ever moves, never turns, so every ray the sea follows is the
// camera's own (a shifted lens moves the horizon up and down).
//
// A scene is { scene, camera, bg, ink, size(W, H, narrow), update(q, t, dt) }; q runs 0 to 1 over its
// part of the page. Dawn starts on the cloud and dives into it; dusk comes up out of it.
import * as THREE from 'three';
import { skyline } from '../unfold/art.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };
const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const hex = (c) => { const n = parseInt(c.slice(1), 16); return new THREE.Vector3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };

// the light at each end of the day (the homepage's own colours)
export const LIGHT = {
  dawn: {
    sky: ['#33405f', '#626888', '#bb8a89', '#f0b88e'], sun: { x: 0.6, y: 0.93, r: 0.05, c: '#fff0d2', glow: '#ffb070', ga: 0.55 },
    ridges: [{ c: '#8a7484', d: 96, h: 0.27, sh: { seed: 11, base: 0.22, peaks: [[0.1, 0.62, 0.05], [0.4, 0.98, 0.055], [0.52, 0.7, 0.05], [0.76, 0.74, 0.06]], rough: 0.12 } },
      { c: '#66596c', d: 72, h: 0.2, sh: { seed: 23, base: 0.25, peaks: [[0.2, 0.82, 0.05], [0.63, 0.55, 0.06], [0.9, 0.92, 0.055]], rough: 0.12 } }],
    rock: '#121218', rim: '#ffd3a1', rimA: [0.85, 0.6], mist: ['#b08a96', '#ffd2aa'],
    deck: { lit: '#ffc9a0', shade: '#7a6482', deep: '#2a2236' }, fog: '#c9a8a6', hz: 0.44
  },
  dusk: {
    sky: ['#05060a', '#0c0f1d', '#2a2140', '#94523c'], sun: { x: 0.2, y: 0.99, r: 0.06, c: '#ffb07a', glow: '#ff8250', ga: 0.45 },
    ridges: [{ c: '#3a2d43', d: 92, h: 0.36, sh: { seed: 13, base: 0.1, peaks: [[0.56, 0.99, 0.06], [0.45, 0.66, 0.07], [0.67, 0.72, 0.06], [0.28, 0.4, 0.09], [0.9, 0.46, 0.1]], rough: 0.035 }, camp: [0.6, 0.62] },
      { c: '#2b2332', d: 70, h: 0.16, sh: { seed: 71, base: 0.5, peaks: [[0.15, 0.95, 0.16], [0.82, 0.9, 0.16]], rough: 0.1, dip: [0.5, 0.35, 0.3] } }],
    rock: '#0c0b10', rim: '#ffa679', rimA: [0.6, 0.35], mist: ['#6a4058', '#ff9a70'],
    deck: { lit: '#ff9d76', shade: '#523a58', deep: '#1a1422' }, fog: '#6d5566', hz: 0.5
  }
};

const CAM = 1.35, DEEP = 0.75, FOG = 0.012;

/* ------------------------------------------------------------------ the sky */
const SKY_FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes, uBuf;
uniform float uHz;             // the horizon, in CSS pixels from the top
uniform vec3 cA, cB, cC, cD;   // top to horizon
uniform vec4 uSun;             // x, y (CSS px), radius, how much of it shows
uniform vec3 cSun, cGlow;
uniform float uGlowA, uLight;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 s = vec2(gl_FragCoord.x, uBuf.y - gl_FragCoord.y) * (uRes / uBuf);
  float t = clamp(s.y / max(uHz, 1.0), 0.0, 1.0);
  vec3 c = t < 0.45 ? mix(cA, cB, t / 0.45) : t < 0.8 ? mix(cB, cC, (t - 0.45) / 0.35) : mix(cC, cD, (t - 0.8) / 0.2);
  if (s.y > uHz) c = cD;
  float big = min(uRes.x, uHz * 1.6);
  float d = length(s - uSun.xy);
  float gr = max(uSun.z, 0.05 * big) * 6.0;
  c += cGlow * uGlowA * pow(max(0.0, 1.0 - d / gr), 2.2) * uLight;
  // the disc, its foot already behind the far range
  c = mix(c, cSun, (1.0 - smoothstep(uSun.z - 1.2, uSun.z + 1.2, d)) * uSun.w);
  c *= mix(0.35, 1.0, uLight);
  c += (hash(floor(gl_FragCoord.xy)) - 0.5) * 0.01;
  gl_FragColor = vec4(lin(c), 1.0);
  #include <colorspace_fragment>
}`;

/* ------------------------------------------------------------------ the sea of cloud */
// deck.js's sea, one pass, writing its own depth
const DECK_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uN;
uniform vec2 uRes, uBuf;
uniform vec4 uView;   // horizon (px), focal length (px), slide (px), -
uniform vec4 uCam;    // eye across, height over the tops, along; how deep the heaps are
uniform vec4 uRange;  // near, far, haze, steps
uniform vec4 uW0, uW1;
uniform vec4 uSun;
uniform float uLight;
uniform vec4 uGlow;
uniform vec3 cLit, cShade, cDeep, cGlow, cHaze;
uniform mat4 uProj;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
float heaps(vec2 p, vec2 cov) {
  vec2 r = vec2(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8);
  float h = max(texture(uN, p * 0.03 + uW0.xy).r, texture(uN, r * 0.045 + uW0.zw).r * 0.85);
  return h * mix(0.55, 1.05, cov.x) * cov.y;
}
float cover(vec2 p) { return texture(uN, p * 0.006 + uW1.zw).g; }
float detailed(vec2 p, vec2 cov) { return clamp(heaps(p, cov) + texture(uN, p * 0.075 + uW1.xy).b * 0.2 * mix(0.55, 1.05, cov.x) * cov.y, 0.0, 1.0); }
void main() {
  vec2 s = vec2(gl_FragCoord.x, uBuf.y - gl_FragCoord.y) * (uRes / uBuf);
  float A = uCam.w;
  float x = s.x - uView.z;
  float dy = (s.y - uView.x) / uView.y;
  if (dy < 0.0005) discard;
  vec3 d = normalize(vec3((x - uRes.x * 0.5) / uView.y, -dy, -1.0));
  vec3 o = uCam.xyz;
  float t1 = (o.y + A) / -d.y;
  float tTop = max(o.y, 0.0) / -d.y, settle = mix(1.0, 0.3, smoothstep(9.0, 60.0, tTop));
  float t0 = max((o.y + A * (1.0 - min(1.0, settle * 1.1))) / -d.y, 0.0);
  float ts = max(t0, uRange.x), te = min(t1, uRange.y);
  if (te <= ts) discard;
  vec2 cov = vec2(cover((o + d * tTop).xz), settle);
  float t = ts, tp = ts, hit = -1.0;
  float k = pow(max(te / ts, 1.0001), 1.0 / uRange.w);
  for (int i = 0; i <= 24; i++) {
    if (float(i) > uRange.w) break;
    vec3 q = o + d * t;
    if (q.y + A * (1.0 - heaps(q.xz, cov)) < 0.0) { hit = t; break; }
    tp = t; t *= k;
  }
  if (hit > ts) {
    float a = tp, b = hit;
    for (int j = 0; j < 5; j++) {
      float m = (a + b) * 0.5;
      vec3 q = o + d * m;
      if (q.y + A * (1.0 - heaps(q.xz, cov)) < 0.0) b = m; else a = m;
    }
    hit = (a + b) * 0.5;
  }
  if (hit < 0.0) hit = t1;
  vec3 p = o + d * hit;
  float e = max(0.2, hit * 0.008);
  float h0 = detailed(p.xz, cov), hx = detailed(p.xz + vec2(e, 0.0), cov), hz = detailed(p.xz + vec2(0.0, e), cov);
  vec3 n = normalize(vec3(-A * (hx - h0) / e, 1.0, -A * (hz - h0) / e));
  vec3 sun = uSun.xyz;
  float sd = max(dot(d, sun), 0.0);
  float fog = 1.0 - exp(-hit * uRange.z);
  float lit = clamp(uLight * 1.5 - (1.0 - fog) * 0.5, 0.0, 1.0);
  float sunlit = max(dot(n, sun), 0.0);
  float ao = mix(0.22, 1.0, smoothstep(0.05, 0.85, h0));
  float crest = pow(1.0 - clamp(dot(n, -d), 0.0, 1.0), 2.0) * 0.8 * smoothstep(0.35, 0.85, h0);
  vec3 c = mix(cDeep, cShade, ao);
  c = mix(c, mix(cShade, cLit, 0.55), smoothstep(0.45, 0.95, h0) * 0.6 * lit);
  c = mix(c, cLit, clamp(sunlit * 1.5, 0.0, 1.0) * ao * lit);
  c += cGlow * (crest * (0.2 + 1.5 * pow(sd, 5.0)) * (1.0 - fog) + pow(sd, 12.0) * 0.45) * lit;
  c *= 0.3 + 0.7 * clamp(uLight * 1.2, 0.0, 1.0);
  float gl = max(0.0, 1.0 - length(vec2(s.x, uView.x) - uGlow.xy) / max(uGlow.z, 1.0)) * uGlow.w;
  c = mix(c, mix(cHaze, cGlow, gl), fog);
  // its depth, as the camera would have drawn it there
  vec3 v = d * hit;
  vec4 cl = uProj * vec4(v, 1.0);
  gl_FragDepth = clamp(cl.z / cl.w * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(lin(c), 1.0);
  #include <colorspace_fragment>
}`;

// noise for the heaps (deck.js's own bake, the same seeds)
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let HEAPS = null;
function heapsTexture(n = 256) {
  if (HEAPS) return HEAPS;
  const out = new Uint8Array(n * n * 4);
  const domes = (g, seed, ch) => {
    const r = rng(seed), pts = [];
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) pts.push([i + 0.1 + r() * 0.8, j + 0.1 + r() * 0.8, 0.35 + 0.65 * r() ** 1.5, 0.7 + r() * 0.3]);
    const c = n / g;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = x / c, fy = y / c, ci = Math.floor(fx), cj = Math.floor(fy);
      let v = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const I = ci + di, J = cj + dj, ii = (I + g) % g, jj = (J + g) % g, p = pts[jj * g + ii];
        const px = p[0] + I - ii, py = p[1] + J - jj, d = ((px - fx) ** 2 + (py - fy) ** 2) / (p[3] * p[3]);
        if (d < 1) { const u = p[2] * Math.sqrt(1 - d), q = Math.max(0.22 - Math.abs(u - v), 0) / 0.22; v = Math.max(u, v) + q * q * 0.055; }
      }
      out[(y * n + x) * 4 + ch] = Math.min(255, Math.round(v * 240));
    }
  };
  const swells = (g, seed, ch) => {
    const r = rng(seed), v = Array.from({ length: g * g }, r), c = n / g, q = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = x / c, fy = y / c, i = Math.floor(fx), j = Math.floor(fy), u = q(fx - i), w = q(fy - j);
      const a = v[j * g + i], b = v[j * g + (i + 1) % g], cc = v[((j + 1) % g) * g + i], d = v[((j + 1) % g) * g + (i + 1) % g];
      out[(y * n + x) * 4 + ch] = Math.round((a + (b - a) * u + (cc - a) * w + (a - b - cc + d) * u * w) * 255);
    }
  };
  domes(8, 3, 0); swells(8, 5, 1); domes(16, 9, 2); swells(32, 11, 3);
  const t = new THREE.DataTexture(out, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return (HEAPS = t);
}

/* ------------------------------------------------------------------ the paper ranges */
const RIDGE_VERT = /* glsl */ `
attribute float aDown;
varying float vDown;
varying vec3 vW;
void main() {
  vDown = aDown;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const RIDGE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 cBody, cRim, cHaze, cFeet;
uniform float uRimA, uRimW, uFog, uHazeA, uLight, uSunX, uSunW;
uniform vec3 uEye;
varying float vDown;
varying vec3 vW;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
void main() {
  // lit from the sky above, darker down toward the cloud
  vec3 c = cBody * mix(1.12, 0.8, smoothstep(0.0, uRimW * 40.0, vDown));
  // the cut edge, backlit: brightest toward the sun
  float toward = exp(-abs(vW.x - uSunX) / uSunW);
  float rim = exp(-vDown / uRimW) * uRimA * (0.35 + 0.65 * toward) * uLight;
  c += cRim * rim;
  // paper: a little uneven
  c *= 0.95 + 0.07 * noise(vW.xy * vec2(3.0, 6.0)) + 0.03 * hash(floor(vW.xy * 40.0));
  c *= mix(0.4, 1.0, uLight);
  float dist = length(vW - uEye);
  c = mix(c, cHaze, (1.0 - exp(-dist * uFog)) * uHazeA);
  gl_FragColor = vec4(lin(c), 1.0);
  #include <colorspace_fragment>
}`;

// a range: a strip from its feet (deep in the cloud) to its skyline
function ridgeGeometry(sh, width, height, base, n = 220) {
  const f = skyline(sh), pos = [], down = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = (u - 0.5) * width, top = base + f(u) * height;
    pos.push(x, top, 0, x, base - 4, 0);
    down.push(0, top - base + 4);
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDown', new THREE.Float32BufferAttribute(down, 1));
  g.setIndex(idx);
  return { geo: g, f };
}

/* ------------------------------------------------------------------ mist between the ranges */
const MIST_FRAG = /* glsl */ `
precision highp float;
uniform vec3 cA, cB;
uniform float uTime, uA, uSeed;
varying vec2 vUv;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
void main() {
  vec2 p = vUv * vec2(9.0, 1.6) + vec2(uTime * 0.012 + uSeed, uSeed * 0.3);
  float n = fbm(p + fbm(p * 0.7 + uTime * 0.01) * 0.6);
  float band = smoothstep(0.0, 0.2, vUv.y) * (1.0 - smoothstep(0.25, 0.6, vUv.y));
  float a = smoothstep(0.42, 0.78, n) * band * uA;
  gl_FragColor = vec4(lin(mix(cA, cB, smoothstep(0.3, 0.9, n))), a);
  #include <colorspace_fragment>
}`;

/* ------------------------------------------------------------------ the scene */
export function skyScene(which, { tier = 'mid' } = {}) {
  const L = LIGHT[which];
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 400);
  const quad = () => new THREE.PlaneGeometry(2, 2);
  const VS = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const buf = new THREE.Vector2(1, 1), res = new THREE.Vector2(1, 1);

  // the sky, behind everything
  const SU = {
    uRes: { value: res }, uBuf: { value: buf }, uHz: { value: 400 },
    cA: { value: hex(L.sky[0]) }, cB: { value: hex(L.sky[1]) }, cC: { value: hex(L.sky[2]) }, cD: { value: hex(L.sky[3]) },
    uSun: { value: new THREE.Vector4() }, cSun: { value: hex(L.sun.c) }, cGlow: { value: hex(L.sun.glow) }, uGlowA: { value: L.sun.ga }, uLight: { value: 1 }
  };
  const sky = new THREE.Mesh(quad(), new THREE.ShaderMaterial({ uniforms: SU, vertexShader: VS, fragmentShader: SKY_FRAG, depthTest: false, depthWrite: false }));
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  // the sea
  const DU = {
    uN: { value: heapsTexture() }, uRes: { value: res }, uBuf: { value: buf },
    uView: { value: new THREE.Vector4() }, uCam: { value: new THREE.Vector4(0, CAM, 0, DEEP) },
    uRange: { value: new THREE.Vector4(0.05, 400, FOG, tier === 'high' ? 12 : tier === 'mid' ? 10 : 8) },
    uW0: { value: new THREE.Vector4() }, uW1: { value: new THREE.Vector4() },
    uSun: { value: new THREE.Vector4(0, 0.1, -1, 1) }, uLight: { value: 1 }, uGlow: { value: new THREE.Vector4() },
    cLit: { value: hex(L.deck.lit) }, cShade: { value: hex(L.deck.shade) }, cDeep: { value: hex(L.deck.deep) },
    cGlow: { value: hex(L.sun.glow) }, cHaze: { value: hex(L.sky[3]) }, uProj: { value: new THREE.Matrix4() }
  };
  const deck = new THREE.Mesh(quad(), new THREE.ShaderMaterial({ uniforms: DU, vertexShader: VS, fragmentShader: DECK_FRAG, depthTest: true, depthWrite: true }));
  deck.frustumCulled = false; deck.renderOrder = 1;
  scene.add(deck);

  // the ranges, far to near, and the rock you stand on
  const ranges = [];
  const sunW = { x: 0 };
  const mkRidge = (spec, k) => {
    const U = {
      cBody: { value: hex(spec.c) }, cRim: { value: hex(L.rim) }, cHaze: { value: hex(L.sky[3]) }, cFeet: { value: hex(L.deck.shade) },
      uRimA: { value: L.rimA[Math.min(k, L.rimA.length - 1)] }, uRimW: { value: spec.d * 0.0045 }, uFog: { value: FOG }, uHazeA: { value: 0.32 }, uLight: { value: 1 },
      uSunX: { value: 0 }, uSunW: { value: 30 }, uEye: { value: new THREE.Vector3() }
    };
    const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms: U, vertexShader: RIDGE_VERT, fragmentShader: RIDGE_FRAG }));
    m.renderOrder = 0;
    scene.add(m);
    return { spec, mesh: m, U };
  };
  L.ridges.forEach((r, k) => ranges.push(mkRidge(r, k)));
  const rock = mkRidge({ c: L.rock, d: 3.2, top: 0.8, foot: 1.15, sh: { seed: 53, base: 0.6, peaks: [[0.1, 0.92, 0.2], [0.88, 0.95, 0.18]], rough: 0.06 }, near: true }, 9);
  rock.U.uRimA.value = 0.55; rock.U.uFog.value = 0.0;
  // The rock is the nearest thing there is, so it's drawn over the sea, never into it: otherwise the
  // cloud between you and the rock's foot shows as a strip under it, and the rock floats. (It still
  // writes depth, so the mist and the camp's light stay behind it.)
  rock.mesh.material.depthFunc = THREE.AlwaysDepth;
  rock.mesh.renderOrder = 1.5;

  // mist between the ranges
  const mists = [0, 1].map((k) => {
    const U = { cA: { value: hex(L.mist[0]) }, cB: { value: hex(L.mist[1]) }, uTime: { value: 0 }, uA: { value: k ? 0.32 : 0.4 }, uSeed: { value: k * 5.3 + 1.1 } };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: U, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: MIST_FRAG, transparent: true, depthWrite: false
    }));
    m.renderOrder = 2;
    scene.add(m);
    return { m, U, d: k ? 64 : 84 };
  });

  // the camp's light, on the mountain, at dusk
  let camp = null;
  if (L.ridges[0].camp) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,214,160,1)'); g.addColorStop(0.25, 'rgba(255,170,100,0.55)'); g.addColorStop(1, 'rgba(255,140,80,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    camp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    camp.renderOrder = 3;
    scene.add(camp);
  }

  // into the cloud: the last of the view goes to fog
  const FU = { cFog: { value: hex(L.fog) }, uA: { value: 0 } };
  const fogQuad = new THREE.Mesh(quad(), new THREE.ShaderMaterial({
    uniforms: FU, vertexShader: VS, transparent: true, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform vec3 cFog; uniform float uA; void main() { gl_FragColor = vec4(pow(cFog, vec3(2.2)), uA);\n#include <colorspace_fragment>\n}'
  }));
  fogQuad.frustumCulled = false; fogQuad.renderOrder = 50;
  scene.add(fogQuad);

  let W = 1, H = 1, f = 1, narrow = false, sunDir = new THREE.Vector3(0, 0.1, -1);
  const eye = new THREE.Vector3(0, CAM, 0);
  const view = { hz: 0, slide: 0 };
  function size(w, h, n, px = 1) {
    W = w; H = h; narrow = n;
    res.set(W, H); buf.set(Math.round(W * px), Math.round(H * px));
    f = Math.max(H * 0.9, W * 0.75);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(H / 2 / f));
    camera.aspect = W / H;
    // the ranges: each wide enough to fill the view at its distance, with room to slide (on a tall
    // phone screen, wider than the view, so the peaks keep their shape and only the middle shows)
    const hz = L.hz * H, span = Math.max(W / f, 1.0);
    // the sun: its place in the sky, as a direction, so it stays put while the camera moves
    sunDir.set((L.sun.x * W - W / 2) / f, (hz - (L.sun.y * hz)) / f, -1).normalize();
    for (const r of [...ranges, rock]) {
      const s = r.spec, wd = s.d * span * 1.14 + 2;
      // (a world height that shows at a given height on screen, at this distance)
      const Y = (sy) => CAM - (sy * H - hz) / f * s.d;
      const base = s.near ? Y(s.foot) : -DEEP - 0.6, ht = s.near ? Y(s.top) - base : s.h * H / f * s.d + DEEP + 0.6;
      r.mesh.geometry.dispose();
      const { geo, f: fn } = ridgeGeometry(s.sh, wd, ht, base);
      r.mesh.geometry = geo; r.fn = fn; r.wd = wd; r.ht = ht; r.base = base;
      r.mesh.position.set(0, 0, -s.d);
      r.U.uSunX.value = sunDir.x / -sunDir.z * s.d;
      r.U.uSunW.value = s.d * 0.5;
    }
    mists.forEach((m) => { const wd = m.d * (W / f) * 1.6 + 30, ht = H * 0.22 / f * m.d; m.m.scale.set(wd, ht, 1); m.m.position.set(0, ht * 0.32, -m.d); });
    if (camp) {
      const r = ranges[0], [cx] = r.spec.camp, top = r.base + r.fn(cx) * r.ht;
      camp.position.set((cx - 0.5) * r.wd, top - 0.2, -r.spec.d + 0.5);
      camp.scale.setScalar(r.spec.d * 0.05);
    }
  }

  const ink = new THREE.Color(L.rim);
  const sunPx = new THREE.Vector2();
  function setView(hzPx, slidePx) {
    view.hz = hzPx; view.slide = slidePx;
    camera.setViewOffset(W, H, -slidePx, H / 2 - hzPx, W, H);
    camera.updateProjectionMatrix();
  }
  const fract = (v) => v - Math.floor(v);
  return {
    scene, camera, ink, bg: scene.background, sunPx,
    size,
    // q: 0 to 1 over its part; t: the clock; o: { light, dive, rise, sway: [x, y], drag }
    update(q, t, dt, o = {}) {
      const light = o.light ?? 1;
      // where the eye is: dawn sinks into the cloud as you scroll, dusk rises out of it
      const into = which === 'dawn' ? easeInOut(smooth(0.12, 1.0, q)) : 1 - easeInOut(smooth(-0.6, 0.45, q));
      const sway = o.sway || [0, 0];
      eye.set(sway[0] * 0.25 + (o.drag || 0), lerp(CAM * (0.8 + 0.2 * light), 0.06, into) + sway[1] * 0.08, lerp(0, -9, into));
      camera.position.copy(eye);
      const hz = lerp(L.hz * H, -H * 0.15, Math.pow(into, 1.3));
      setView(hz, 0);
      camera.updateMatrixWorld();
      // the sky's sun, on screen, from its direction
      const sp = sunDir.clone().multiplyScalar(300).add(eye).project(camera);
      const sx = (sp.x * 0.5 + 0.5) * W, sy = (0.5 - sp.y * 0.5) * H;
      sunPx.set(sx, sy);
      const rise = which === 'dawn' ? lerp(18, 0, light) : 0;
      SU.uHz.value = hz;
      SU.uSun.value.set(sx, sy + rise, L.sun.r * Math.min(W, hz * 1.6), 1);
      SU.uLight.value = 0.25 + 0.75 * light;
      // the sea's own camera is the camera
      DU.uView.value.set(hz, f, 0, 0);
      DU.uCam.value.set(eye.x, eye.y, eye.z, DEEP);
      DU.uLight.value = 0.18 + 0.82 * light;
      DU.uSun.value.set(sunDir.x, Math.max(0.02, sunDir.y), sunDir.z, 1);
      DU.uGlow.value.set(sx, sy, Math.max(L.sun.r * Math.min(W, hz * 1.6), 0.05 * Math.min(W, hz * 1.6)) * 6, L.sun.ga);
      DU.uProj.value.copy(camera.projectionMatrix);
      const T = t, v = [[0.18, 0.25], [0.28, 0.14], [0.35, 0.3], [0.04, 0.06]].map(([a, b]) => [a * T, b * T]);
      const R = (w) => [w[0] * 0.8 - w[1] * 0.6, w[0] * 0.6 + w[1] * 0.8];
      DU.uW0.value.set(fract(-v[0][0] * 0.03), fract(-v[0][1] * 0.03), fract(0.37 - R(v[1])[0] * 0.045), fract(0.37 - R(v[1])[1] * 0.045));
      DU.uW1.value.set(fract(0.53 - v[2][0] * 0.075), fract(0.53 - v[2][1] * 0.075), fract(-v[3][0] * 0.006), fract(-v[3][1] * 0.006));
      for (const r of [...ranges, rock]) { r.U.uLight.value = 0.3 + 0.7 * light; r.U.uEye.value.copy(eye); }
      mists.forEach((m) => { m.U.uTime.value = t; });
      if (camp) camp.material.opacity = 0.75 + 0.25 * Math.sin(t * 2.3) * Math.sin(t * 1.7);
      FU.uA.value = which === 'dawn' ? smooth(0.72, 1.0, q) : 1 - smooth(-0.35, 0.2, q);
    }
  };
}
