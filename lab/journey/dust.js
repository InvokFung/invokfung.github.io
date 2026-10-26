// The dust: a few thousand motes over the whole film, in screen space, drawn after the frame is
// put together. They drift on their own, lie at different depths (the near ones move more as you
// scroll and as the pointer leans), part round the pointer, and ring out from a click. Their light
// changes with the place: motes in the low sun on the cover, a line drawn in dust where the cover
// turns into the mountain, specks rushing past in the cloud, fireflies in the toolbox, embers at dusk.
// Everything is in the vertex shader; the CPU only sets a dozen numbers a frame.
import * as THREE from 'three';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// how the dust looks in each place: colour, strength, size, wind (x, y in screens a second), how
// much it glows (additive) and how fast it twinkles
const LOOK = {
  hello: { c: '#fff2e0', a: 0.8, s: 1.25, wind: [0.006, 0.004], glow: 1, tw: 0.25, sun: 1, low: 1 },
  path: { c: '#2f2c31', a: 0.5, s: 0.9, wind: [0.004, 0.006], glow: 0, tw: 0.0, sun: 0, sparse: 0.4 },
  work: { c: '#f4f1ec', a: 0.55, s: 0.9, wind: [0.0, 0.0], glow: 1, tw: 0.1, sun: 0, rush: 1 },
  chapter: { c: '#ffe2bd', a: 0.3, s: 1.6, wind: [0.003, 0.005], glow: 1, tw: 0.3, sun: 0, sparse: 0.18 },
  how: { c: '#5b4f40', a: 0.0, s: 0.8, wind: [0.004, 0.002], glow: 0, tw: 0.0, sun: 0 },
  tools: { c: '#ffe08a', a: 0.85, s: 2.6, wind: [0.002, 0.004], glow: 1, tw: 1, sun: 0, sparse: 0.1 },
  next: { c: '#fff7ee', a: 0.38, s: 0.85, wind: [0.004, 0.008], glow: 1, tw: 0.2, sun: 0 },
  contact: { c: '#ffa062', a: 0.95, s: 1.9, wind: [0.004, 0.05], glow: 1, tw: 0.6, sun: 0, embers: 1, low: 1, sparse: 0.35 }
};
const lookOf = (id) => LOOK[id] || LOOK.chapter;

const VERT = /* glsl */ `
attribute vec4 aSeed;      // x, y in 0..1, depth 0..1, a random number
attribute vec2 aForm;      // where it goes in the drawing, in screen heights from the centre
uniform float uTime, uTau, uRush, uForm, uScatter, uSize, uPx, uEmbers, uSunOn, uLow, uSparse;
uniform vec2 uRes, uWind, uLean;
uniform vec3 uMouse;       // x, y in px, strength
uniform vec4 uShock;       // x, y in px, when, strength
uniform vec2 uSun;         // where the low sun is, in px
varying float vA, vTw, vGlow;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float z = aSeed.z, r = aSeed.w;
  float asp = uRes.x / uRes.y;
  // drift: the wind, a slow wander of its own, and the scroll (near motes move more)
  vec2 p = aSeed.xy;
  p += uWind * uTime * (0.4 + z);
  p += vec2(sin(uTime * (0.13 + r * 0.2) + r * 40.0), cos(uTime * (0.11 + r * 0.17) + r * 23.0)) * 0.012 * (0.5 + z);
  p.y += uTau * (0.08 + 0.32 * z);
  // embers rise faster and sway
  p.y += uEmbers * uTime * (0.02 + 0.05 * r) ;
  p.x += uEmbers * sin(uTime * 0.7 + r * 30.0) * 0.01;
  p = fract(p);
  vec2 s = (p - 0.5) * vec2(asp, 1.0) * 1.1;          // screen heights from the centre
  // in the cloud, the motes rush out from the middle as you fly
  if (uRush > 0.0) {
    float k = fract(r * 7.0 + uTau * 1.6 + uTime * 0.04);
    vec2 dir = normalize(s + vec2(0.0001, 0.0001));
    s = mix(s, dir * (0.05 + k * k * 1.4) * vec2(asp, 1.0) * 0.6, uRush);
    vA = smoothstep(0.0, 0.25, k);
  } else vA = 1.0;
  // the pointer leans the near ones
  s += uLean * (z - 0.3) * 0.03;
  // the drawing: each mote goes to its place in it, the near ones a beat later
  float f = smoothstep(r * 0.35, r * 0.35 + 0.65, uForm);
  s = mix(s, aForm + vec2(sin(uTime * 0.9 + r * 50.0), cos(uTime * 0.8 + r * 31.0)) * 0.002, f);
  // and leaves it: blown off sideways and up
  s += vec2(0.6 + r * 0.8, 0.25 + z * 0.5) * uScatter * uScatter * (0.4 + r) * f;
  vec2 px = (s / vec2(asp, 1.0) / 1.0 + 0.5) * uRes;
  // part round the pointer, with a little swirl
  vec2 d = px - uMouse.xy;
  float dl = length(d), R = 140.0 * (0.6 + z);
  if (dl < R && uMouse.z > 0.0) {
    float k = (1.0 - dl / R); k = k * k * uMouse.z;
    vec2 n = d / max(dl, 1.0);
    px += (n * 60.0 + vec2(-n.y, n.x) * 26.0) * k * (0.4 + z);
  }
  // a click rings out
  float age = uTime - uShock.z;
  if (age > 0.0 && age < 2.0) {
    vec2 e = px - uShock.xy; float el = length(e);
    float front = age * 620.0;
    float k = exp(-pow((el - front) / 70.0, 2.0)) * (1.0 - age / 2.0) * uShock.w;
    px += e / max(el, 1.0) * k * 46.0;
  }
  // brighter in the low sun's beam
  float beam = uSunOn * exp(-length((px - uSun) / uRes.y) * 2.2);
  vGlow = 1.0 + beam * 1.6;
  // on the cover and at dusk, only over the sea of cloud, where the low sun catches them
  float yy = px.y / uRes.y;
  vA *= mix(1.0, smoothstep(0.66, 0.42, yy) * smoothstep(0.1, 0.26, yy), uLow * (1.0 - f));
  // in the dark, only a few: fireflies and embers, not a sky full of points
  vA *= 1.0 - smoothstep(uSparse, uSparse + 0.06, r);
  vTw = r;
  gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = uSize * uPx * (1.0 + z * z * 4.5) * (1.0 + f * 0.25);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha, uTime, uTwinkle;
varying float vA, vTw, vGlow;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  float tw = mix(1.0, 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.2 + vTw * 3.0) + vTw * 60.0), 3.0), uTwinkle);
  float k = a * uAlpha * vA * tw * vGlow;
  if (k < 0.004) discard;
  gl_FragColor = vec4(uColor * k, k);
}`;

// the line the dust draws as the cover turns into the mountain: a skyline and two contours under
// it, as points, in screen heights from the centre (x across, y up)
function mountainLine(n, asp) {
  const R = rng(91), out = new Float32Array(n * 2);
  const ridge = (x) => {
    let s = 0;
    s = Math.max(s, 1 - Math.abs(x - 0.56) * 2.6);
    s = Math.max(s, 0.66 - Math.abs(x - 0.3) * 2.4);
    s = Math.max(s, 0.5 - Math.abs(x - 0.82) * 2.2);
    return s + Math.sin(x * 47) * 0.012 + Math.sin(x * 113) * 0.006;
  };
  const span = Math.min(asp * 0.92, 1.5), h = 0.62;
  for (let i = 0; i < n; i++) {
    const which = R(), x = R();
    const k = which < 0.6 ? 0 : which < 0.82 ? 1 : 2;
    const y = Math.max(0, ridge(x) - k * 0.2) * (1 - k * 0.12);
    if (k && y <= 0.001) { out[i * 2] = (x - 0.5) * span; out[i * 2 + 1] = -0.25 + (R() - 0.5) * 0.01; continue; }
    out[i * 2] = (x - 0.5) * span + (R() - 0.5) * 0.004;
    out[i * 2 + 1] = -0.25 + y * h + (R() - 0.5) * 0.006;
  }
  return out;
}

export function createDust(renderer, { count = 2000, reduced = false } = {}) {
  const N = count, R = rng(5);
  const seed = new Float32Array(N * 4), pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { seed[i * 4] = R(); seed[i * 4 + 1] = R(); seed[i * 4 + 2] = Math.pow(R(), 1.8); seed[i * 4 + 3] = R(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const form = new THREE.BufferAttribute(new Float32Array(N * 2), 2);
  geo.setAttribute('aForm', form);
  const U = {
    uTime: { value: 0 }, uTau: { value: 0 }, uRush: { value: 0 }, uForm: { value: 0 }, uScatter: { value: 0 }, uSize: { value: 2.2 }, uPx: { value: 1 },
    uEmbers: { value: 0 }, uSunOn: { value: 0 }, uLow: { value: 0 }, uSparse: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) }, uWind: { value: new THREE.Vector2() }, uLean: { value: new THREE.Vector2() },
    uMouse: { value: new THREE.Vector3(-999, -999, 0) }, uShock: { value: new THREE.Vector4(0, 0, -9, 0) }, uSun: { value: new THREE.Vector2(0, 0) },
    uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uTwinkle: { value: 0 }
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(pts);
  let W = 1, H = 1, on = true, formFor = 0;
  const mouse = { x: -999, y: -999, s: 0 };
  // a click anywhere off a link rings out through the dust
  addEventListener('pointerdown', (e) => {
    if (e.target.closest?.('a, button, input, .rail')) return;
    U.uShock.value.set(e.clientX, (H - e.clientY), U.uTime.value, 1);
  });
  const col = new THREE.Color(), colB = new THREE.Color();
  return {
    size(w, h, px) {
      W = w; H = h;
      U.uRes.value.set(W, H); U.uPx.value = px;
      const asp = W / H;
      if (Math.abs(asp - formFor) > 0.01) { formFor = asp; form.array.set(mountainLine(N, asp)); form.needsUpdate = true; }
    },
    off() { on = false; },
    // o: { tau, t, dt, vel, ptr, intro, shot, move, p }
    frame(o) {
      if (!on) return;
      const s = o.shot;
      // the look here, and while a move plays, part way from the last place's
      const id = s.ch != null ? 'chapter' : s.id;
      const A = lookOf(id), P = o.move && s.from ? lookOf(s.from) : null, k = P ? (s.id === 'path' ? smooth(0.0, 0.2, o.p) : smooth(0.25, 0.75, o.p)) : 1;
      const mix = (key) => (P ? lerp(P[key], A[key], k) : A[key]);
      col.set(A.c); if (P) col.lerp(colB.set(P.c), 1 - k);
      U.uColor.value.copy(col);
      const alpha = mix('a') * (s.id === 'hello' ? smooth(0.15, 0.9, o.intro) : 1);
      U.uAlpha.value = alpha;
      U.uSize.value = 2.2 * mix('s');
      U.uWind.value.set(P ? lerp(P.wind[0], A.wind[0], k) : A.wind[0], P ? lerp(P.wind[1], A.wind[1], k) : A.wind[1]);
      U.uTwinkle.value = mix('tw');
      U.uSunOn.value = mix('sun');
      U.uLow.value = (A.low || 0) * k + (P?.low || 0) * (1 - k);
      U.uSparse.value = (A.sparse ?? 1) * k + (P ? (P.sparse ?? 1) : 1) * (1 - k);
      // (the line needs every mote; most of them go once it's blown away)
      if (s.id === 'path' && o.move) U.uSparse.value = lerp(1, A.sparse, smooth(0.6, 1, o.p));
      U.uEmbers.value = (A.embers || 0) * k + (P?.embers || 0) * (1 - k);
      U.uRush.value = s.id === 'work' && !o.move ? 1 : s.id === 'work' ? smooth(0.5, 1, o.p) : (s.from === 'work' && o.move ? 1 - smooth(0, 0.5, o.p) : 0);
      // the line in dust: drawn as the mist rolls in over the cover, blown away as it clears
      if (s.id === 'path' && o.move) { U.uForm.value = smooth(0.0, 0.42, o.p); U.uScatter.value = smooth(0.5, 1.0, o.p); }
      else { U.uForm.value = 0; U.uScatter.value = 0; }
      U.uTime.value = reduced ? 0 : o.t;
      U.uTau.value = o.tau;
      U.uLean.value.set(o.ptr.x, -o.ptr.y);
      // the pointer: it fades in when it moves, and out when it stops
      const live = o.ptr.mouse && o.ptr.px >= 0;
      mouse.x = live ? o.ptr.px : -999; mouse.y = live ? H - o.ptr.py : -999;
      mouse.s = live ? 1 : 0;
      U.uMouse.value.set(mouse.x, mouse.y, mouse.s);
      if (o.sun) U.uSun.value.set(o.sun.x, H - o.sun.y);
      if (U.uAlpha.value < 0.004) return;
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
    }
  };
}
