/*
 * Round 7: the film. One pinned stage, one timeline, and the scroll is the playhead. Positions on
 * the playhead are counted in screen heights (tau): the dust, the background, the camera and every
 * line of text read the same tau, so they can never drift apart, and jumping anywhere lands on the
 * right frame.
 *
 *   0    the name, out of dust              3.0   seven projects, 1.15 each
 *   0.6  what I do, line by line            11.05 how I got here, year by year
 *   2.05 a window opens on the work         13.25 through the 0 of 2026, into contact
 */
import * as THREE from "three";
import { text, drawing, wave, cloud, ring, vase, photo, rng } from "./shapes.js";

const { gsap, ScrollTrigger, SplitText, Lenis } = window;
gsap.registerPlugin(ScrollTrigger, SplitText, window.ScrambleTextPlugin);
ScrollTrigger.config({ ignoreMobileResize: true });

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const html = document.documentElement;
const calm = html.classList.contains("calm");
const narrowNow = () => innerWidth < 760 || innerHeight > innerWidth * 1.11;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const span = (v, a, b) => clamp01((v - a) / (b - a));
const io3 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out3 = (t) => 1 - Math.pow(1 - t, 3);
const in3 = (t) => t * t * t;

/* ------------------------------------------------------------------ the film's clock */

const W0 = 3.0, SEG = 1.15, NP = 7;
const P0 = W0 + SEG * NP, PL = 2.2, C0 = P0 + PL, END = C0 + 1.15;
const seg = (i, u) => W0 + SEG * (i + u);
const WIN = [2.05, 2.9];
// when each project's dust turns from what it is into what it moved
const MORPH = [[0.32, 0.58], [0.32, 0.58], [0.46, 0.66], [0.32, 0.58], [0.32, 0.58], [0.32, 0.58], [0.44, 0.66]];
const YEAR = (j) => P0 + 0.45 + (j - 1) * 0.34; // the morph into year j starts here, and takes 0.22

const PJ = $$(".pj").map((el) => ({
  el,
  name: $(".pj-n", el).textContent,
  accent: getComputedStyle(el).getPropertyValue("--a").trim() || "#ff5a1f"
}));

const COL = { paper: "#f2efe8", ink: "#12110f", accent: "#ff5a1f" };

/* ------------------------------------------------------------------ scroll */

const lenis = calm ? null : new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.4 });
if (lenis) {
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
}
gsap.ticker.lagSmoothing(0);

const tauNow = () => (lenis ? lenis.scroll : scrollY) / innerHeight;
function go(tau, instant) {
  const y = tau * innerHeight;
  if (lenis) lenis.scrollTo(y, { immediate: !!instant, duration: Math.min(3.2, 0.9 + Math.abs(y - lenis.scroll) / innerHeight / 6) });
  else scrollTo(0, y);
}
$$("[data-go]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  const to = a.dataset.go === "contact" ? END - 0.12 : 0;
  go(to);
  if (to) setTimeout(() => $("#mail").focus({ preventScroll: true }), 1600);
}));
$(".skip").addEventListener("click", (e) => { e.preventDefault(); go(END - 0.12, true); $("#mail").focus({ preventScroll: true }); });

/* ------------------------------------------------------------------ the dust */

const canvas = $("#gl");
let renderer = null;
if (!/[?&]nogl\b/.test(location.search)) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" });
  } catch (e) { renderer = null; }
}
const GL = !!renderer;
html.classList.add(GL ? "gl" : "nogl");

const cores = navigator.hardwareConcurrency || 4;
const memory = navigator.deviceMemory || 8;
const saveData = !!(navigator.connection && navigator.connection.saveData);
let lite = cores <= 2 || memory <= 2 || saveData || /[?&]lite\b/.test(location.search);
const narrowAtLoad = narrowNow();
const TW = 256;
const N = narrowAtLoad ? 16384 : 32768;

THREE.ColorManagement.enabled = false;
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 60);
camera.position.set(0, 0, 12);
const scene = new THREE.Scene();
const V = { W: 1, H: 1, n: narrowAtLoad, px: 1 };

// every particle gets a fixed slot in every shape: perm[k] is the particle that takes point k
const R = rng(20261026);
const perm = new Uint32Array(N);
for (let i = 0; i < N; i++) perm[i] = i;
for (let i = N - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }

const S = {}; // texture name -> { shape, tex }
function store(name, shape) {
  const data = new Float32Array(N * 4);
  for (let k = 0; k < N; k++) {
    const p = perm[k] * 4, q = k * 4;
    data[p] = shape.pos[q]; data[p + 1] = shape.pos[q + 1]; data[p + 2] = shape.pos[q + 2]; data[p + 3] = shape.pos[q + 3];
  }
  let tex = S[name] && S[name].tex;
  if (tex) { tex.image.data = data; tex.needsUpdate = true; }
  else {
    tex = new THREE.DataTexture(data, TW, N / TW, THREE.RGBAFormat, THREE.FloatType);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
  }
  S[name] = { shape, tex };
  if (renderer) renderer.initTexture(tex);
}

const VERT = /* glsl */ `
uniform sampler2D uA;
uniform sampler2D uB;
uniform int uTW;
uniform float uT;
uniform float uTime;
uniform float uNoise;
uniform float uSize;
uniform float uPix;
uniform float uMax;
uniform vec4 uPA;
uniform vec4 uPB;
uniform vec4 uRA;
uniform vec4 uRB;
uniform vec2 uSpin;
uniform vec4 uMouse;
attribute vec4 aRnd;
attribute float aOrd;
varying float vAcc;
varying float vAlpha;

// spin about the shape's own upright, then tilt the whole thing
vec3 turn(vec3 p, float rx, float ry) {
  float c = cos(ry), s = sin(ry);
  p = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
  c = cos(rx); s = sin(rx);
  return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}

// a shape's point, rippled, pulled apart, turned, scaled and moved into place
vec3 put(vec4 q, vec4 P, vec4 R, float spin) {
  vec3 p = q.xyz;
  p.z += R.z * (sin(p.x * 4.2 + uTime * 0.9) * 0.05 + sin(p.y * 6.5 - uTime * 1.25 + p.x * 1.7) * 0.035);
  p.y *= 1.0 + R.w * 0.5;
  p = turn(p, R.x, R.y + spin * uTime);
  return p * P.w + P.xyz;
}

void main() {
  ivec2 c = ivec2(gl_VertexID % uTW, gl_VertexID / uTW);
  vec4 a = texelFetch(uA, c, 0);
  vec4 b = texelFetch(uB, c, 0);
  vec3 pa = put(a, uPA, uRA, uSpin.x);
  vec3 pb = put(b, uPB, uRB, uSpin.y);

  // each point leaves on its own beat: a sweep along the shape, roughened per point
  float len = 0.5;
  float d = (aOrd * 0.72 + aRnd.x * 0.28) * (1.0 - len);
  float e = smoothstep(d, d + len, uT);
  vec3 p = mix(pa, pb, e);

  // in flight, the dust swirls and swings through depth
  float k = sin(3.14159265 * e) * uNoise;
  float sc = mix(uPA.w, uPB.w, e);
  vec3 n = vec3(
    sin(p.y * 2.3 + uTime * 0.8 + aRnd.z * 6.2832),
    cos(p.x * 1.9 + uTime * 0.7 + aRnd.w * 6.2832),
    sin((p.x - p.y) * 1.4 + uTime * 0.6 + aRnd.x * 6.2832));
  p += n * k * (0.3 + aRnd.y * 0.5) * sc * 0.32;
  p.z += k * (aRnd.y - 0.5) * sc * 0.9;

  // held shapes still breathe
  p += vec3(sin(uTime * 0.9 + aRnd.z * 40.0), cos(uTime * 0.8 + aRnd.w * 40.0), 0.0) * sc * 0.0032;

  // the cursor parts the dust
  vec2 dm = p.xy - uMouse.xy;
  float dl = length(dm);
  p.xy += dm / max(dl, 1e-4) * uMouse.w * (1.0 - smoothstep(0.0, uMouse.z, dl)) * uMouse.z * 0.32;

  vAcc = mix(a.w, b.w, e);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float depth = -mv.z;
  vAlpha = smoothstep(0.15, 1.8, depth);
  gl_PointSize = min(uSize * (0.55 + aRnd.y * 0.9) * uPix / max(depth, 0.05), uMax);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uInk;
uniform vec3 uAcc;
uniform float uFade;
varying float vAcc;
varying float vAlpha;
out highp vec4 fragColor;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q);
  if (r > 0.5) discard;
  float a = (1.0 - smoothstep(0.26, 0.5, r)) * vAlpha * uFade;
  fragColor = vec4(mix(uInk, uAcc, step(0.5, vAcc)), a);
}`;

// the background: one colour, a second one inside a window (four corners) or a circle, and grain
const BG_FRAG = /* glsl */ `
uniform vec3 uBgA;
uniform vec3 uBgB;
uniform int uMask;
uniform vec2 uQ[4];
uniform vec3 uCirc;
uniform vec2 uRes;
uniform float uDpr;
out highp vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  float m = 0.0;
  if (uMask == 1) {
    float s = 1e9;
    for (int i = 0; i < 4; i++) {
      vec2 a = uQ[i];
      vec2 e = uQ[(i + 1) % 4] - a;
      s = min(s, (e.x * (p.y - a.y) - e.y * (p.x - a.x)) / max(length(e), 1e-3));
    }
    m = clamp(s + 0.5, 0.0, 1.0);
  } else if (uMask == 2) {
    m = clamp(uCirc.z - length(p - uCirc.xy) + 0.5, 0.0, 1.0);
  }
  vec3 col = mix(uBgA, uBgB, m);
  col += (hash(floor(gl_FragCoord.xy)) - 0.5) * 0.028;
  fragColor = vec4(col, 1.0);
}`;

let points = null, bg = null, U = null, BU = null;
if (GL) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const rnd = new Float32Array(N * 4), ord = new Float32Array(N);
  for (let k = 0; k < N; k++) ord[perm[k]] = k / N;
  for (let i = 0; i < N * 4; i++) rnd[i] = R();
  geo.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 4));
  geo.setAttribute("aOrd", new THREE.BufferAttribute(ord, 1));
  U = {
    uA: { value: null }, uB: { value: null }, uTW: { value: TW }, uT: { value: 0 }, uTime: { value: 0 },
    uNoise: { value: calm ? 0 : 1 }, uSize: { value: 0.01 }, uPix: { value: 500 }, uMax: { value: 64 },
    uPA: { value: new THREE.Vector4() }, uPB: { value: new THREE.Vector4() },
    uRA: { value: new THREE.Vector4() }, uRB: { value: new THREE.Vector4() },
    uSpin: { value: new THREE.Vector2() }, uMouse: { value: new THREE.Vector4(0, 0, 1, 0) },
    uInk: { value: new THREE.Color(COL.ink) }, uAcc: { value: new THREE.Color(COL.accent) }, uFade: { value: 1 }
  };
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, uniforms: U,
    transparent: true, depthTest: false, depthWrite: false
  });
  points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  BU = {
    uBgA: { value: new THREE.Color(COL.paper) }, uBgB: { value: new THREE.Color(COL.ink) }, uMask: { value: 0 },
    uQ: { value: [0, 1, 2, 3].map(() => new THREE.Vector2()) }, uCirc: { value: new THREE.Vector3() },
    uRes: { value: new THREE.Vector2(1, 1) }, uDpr: { value: 1 }
  };
  bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: BU, fragmentShader: BG_FRAG,
    vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
    depthTest: false, depthWrite: false
  }));
  bg.frustumCulled = false;
  bg.renderOrder = -1;
  scene.add(bg);
  store("cloud", cloud(N, 3, 0.9));
}

function size() {
  const w = innerWidth, h = innerHeight;
  V.n = narrowNow();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  V.H = 2 * 12 * Math.tan((camera.fov * Math.PI) / 360);
  V.W = V.H * camera.aspect;
  V.px = V.H / h; // world units per CSS pixel at the shapes' depth
  if (!GL) return;
  const dpr = Math.min(devicePixelRatio || 1, lite ? 1 : V.n ? 2 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(canvas.clientWidth || w, canvas.clientHeight || h, false);
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  U.uPix.value = buf.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
  U.uSize.value = (V.n ? 1.9 : 2.25) * V.px;
  U.uMax.value = lite ? 22 : 64;
  BU.uRes.value.copy(buf);
  BU.uDpr.value = buf.y / (canvas.clientHeight || h);
  points.geometry.setDrawRange(0, lite ? N / 2 : N);
}
size();

/* ------------------------------------------------------------------ where each shape sits */

const xf = (o) => Object.assign({ x: 0, y: 0, z: 0, s: 1, rx: 0, ry: 0, wave: 0, explode: 0, spin: 0 }, o);
const fit = (name, w, h) => { const sh = S[name] ? S[name].shape : { w: 1, h: 1 }; return Math.min(w / sh.w, h / sh.h); };

const EMB = ["relay", "trace", "tables3", "route", "search", "violin", "vase"];
const SLOT = {
  cloud: { tex: "cloud", at: () => xf({ s: V.H * 1.15 }) },
  name: { tex: "name", at: () => xf({ y: V.H * (V.n ? 0.1 : 0.08), s: fit("name", V.W * 0.86, V.H * (V.n ? 0.36 : 0.3)) }) },
  wave: { tex: "wave", at: () => xf({ y: -V.H * (V.n ? 0.5 : 0.52), z: -1.2, s: V.n ? V.H * 0.62 : Math.max(V.W, V.H * 1.6) * 0.62, rx: -1.3, wave: 1 }) },
  ring: { tex: "ring", at: () => xf({ s: V.n ? Math.min(V.W * 0.42, V.H * 0.24) : V.H * 0.24 }) },
  ring2: { tex: "ring", at: () => xf({ s: V.n ? Math.min(V.W * 0.94, V.H * 0.5) : V.H * 0.68, ry: 0.0 }) },
  burst: { tex: "ring", at: () => xf({ s: V.H * 0.012 }) },
  sig: { tex: "sig", at: () => { const t = SLOT.sig.tex, k = t === "face" ? 1.9 : 1; return V.n ? xf({ y: V.H * 0.27, s: fit(t, V.W * 0.62, V.H * 0.17 * k) }) : xf({ x: V.W * 0.27, y: V.H * 0.03, s: fit(t, V.W * 0.36, V.H * 0.36 * k) }); } }
};
const emblemAt = (tex, extra, k = 1) => () => Object.assign(
  V.n ? xf({ y: V.H * 0.2, s: fit(tex, V.W * 0.74, V.H * 0.34 * k) }) : xf({ x: V.W * 0.22, y: V.H * 0.01, s: fit(tex, V.W * 0.36, V.H * 0.6 * k) }),
  extra ? extra() : {}
);
EMB.forEach((tex, i) => {
  SLOT["e" + i] = { tex, at: emblemAt(tex, tex === "vase" ? () => ({ rx: 0.42, spin: calm ? 0 : 0.32, explode: io3(span(tau, seg(6, 0.12), seg(6, 0.36))) }) : null, tex === "vase" ? 0.78 : 1) };
  SLOT["n" + i] = { tex: "num" + i, at: () => V.n ? xf({ y: V.H * 0.21, s: fit("num" + i, V.W * 0.84, V.H * 0.14) }) : xf({ x: V.W * 0.22, y: V.H * 0.06, s: fit("num" + i, V.W * 0.4, V.H * 0.24) }) };
});
SLOT.e2b = { tex: "table1", at: emblemAt("table1") };
for (let j = 0; j < 6; j++) {
  SLOT["y" + j] = { tex: "year" + j, at: () => V.n ? xf({ y: V.H * 0.08, s: fit("year" + j, V.W * 0.88, V.H * 0.2) }) : xf({ x: V.W * 0.14, y: V.H * 0.07, s: fit("year" + j, V.W * 0.6, V.H * 0.36) }) };
}

// the scroll's beats: between a and b (in tau) the dust goes from one slot to the next
const BEATS = [];
{
  const add = (a, b, from, to) => BEATS.push({ a, b, from, to });
  add(0.1, 0.62, "name", "wave");
  add(1.85, 2.25, "wave", "ring");
  add(2.3, 2.7, "ring", "ring2");
  add(2.72, seg(0, 0.12), "ring2", "e0");
  for (let i = 0; i < NP; i++) {
    const [m0, m1] = MORPH[i];
    if (i === 2) { add(seg(i, 0.18), seg(i, 0.38), "e2", "e2b"); add(seg(i, m0), seg(i, m1), "e2b", "n2"); }
    else add(seg(i, m0), seg(i, m1), "e" + i, "n" + i);
    if (i < NP - 1) add(seg(i, 0.8), seg(i + 1, 0.12), "n" + i, "e" + (i + 1));
  }
  add(seg(NP - 1, 0.82), P0 + 0.3, "n" + (NP - 1), "y0");
  for (let j = 1; j < 6; j++) add(YEAR(j), YEAR(j) + 0.22, "y" + (j - 1), "y" + j);
  add(C0 + 0.5, C0 + 0.95, "burst", "sig");
}

const intro = { v: calm ? 1 : 0 };
let introEnd;
const introDone = new Promise((ok) => { introEnd = ok; setTimeout(ok, 4000); });
function stateAt(t) {
  if (t < BEATS[0].a) return { from: "cloud", to: "name", t: intro.v };
  let cur = BEATS[0];
  for (const b of BEATS) { if (t >= b.a) cur = b; else break; }
  return { from: cur.from, to: cur.to, t: span(t, cur.a, cur.b) };
}

// the 0 in 2026, in world space: the camera flies through it
function zeroOf2026() {
  const sh = S.year5 && S.year5.shape, m = sh && sh.marks[1];
  if (!m) return { x: 0, y: 0, r: 0.3 };
  const p = SLOT.y5.at();
  return { x: p.x + m.x * p.s, y: p.y + m.y * p.s, r: m.r * p.s };
}

/* ------------------------------------------------------------------ colour by tau */

const cA = new THREE.Color(), cB = new THREE.Color(), cT = new THREE.Color();
const tint = (i) => cT.set(COL.ink).lerp(new THREE.Color(PJ[i].accent), 0.06).clone();
const TINTS = PJ.map((_, i) => tint(i));
const ACCS = PJ.map((p) => new THREE.Color(p.accent));
function workMix(t, list) {
  const f = clamp01((t - W0) / (SEG * NP)) * NP, i = Math.min(NP - 1, Math.floor(f)), u = f - i;
  return list[i].clone().lerp(list[Math.min(NP - 1, i + 1)], i < NP - 1 ? span(u, 0.86, 1) : 0);
}

const proj = new THREE.Vector3();
function toScreen(x, y, z) {
  proj.set(x, y, z).project(camera);
  return [(proj.x * 0.5 + 0.5) * innerWidth, (-proj.y * 0.5 + 0.5) * innerHeight];
}

const quad = [[0, 0], [0, 0], [0, 0], [0, 0]];
function windowQuad(u) {
  const w = innerWidth, h = innerHeight, cx = w / 2, cy = h / 2, m = Math.min(w, h);
  const k1 = [[cx - 0.26 * m, cy - 0.17 * m], [cx + 0.22 * m, cy - 0.23 * m], [cx + 0.27 * m, cy + 0.17 * m], [cx - 0.2 * m, cy + 0.22 * m]];
  const k2 = [[-6, -6], [w + 6, -6], [w + 6, h + 6], [-6, h + 6]];
  for (let i = 0; i < 4; i++) {
    if (u < 0.38) { const e = out3(u / 0.38); quad[i][0] = lerp(cx, k1[i][0], e); quad[i][1] = lerp(cy, k1[i][1], e); }
    else { const e = io3((u - 0.38) / 0.62); quad[i][0] = lerp(k1[i][0], k2[i][0], e); quad[i][1] = lerp(k1[i][1], k2[i][1], e); }
  }
  return quad;
}

// what's behind everything at tau t, and what colour the dust is
const look = { a: new THREE.Color(), b: new THREE.Color(), mask: 0, circ: [0, 0, 0], ink: new THREE.Color(), acc: new THREE.Color() };
function lookAt(t) {
  look.mask = 0;
  look.a.set(COL.paper); look.ink.set(COL.ink); look.acc.set(COL.accent);
  if (t >= WIN[0] && t < WIN[1]) {
    look.mask = 1; look.b.set(COL.ink); windowQuad(span(t, WIN[0], WIN[1]));
    look.ink.lerp(cA.set(COL.paper), span(t, 2.24, 2.36));
  } else if (t >= WIN[1] && t < P0) {
    look.a.copy(workMix(t, TINTS)); look.ink.set(COL.paper); look.acc.copy(workMix(t, ACCS));
  } else if (t >= P0 && t < P0 + 0.32) {
    const u = span(t, P0, P0 + 0.32);
    look.a.copy(TINTS[NP - 1]); look.b.set(COL.paper); look.mask = 2;
    look.circ[0] = innerWidth / 2; look.circ[1] = innerHeight * 1.08; look.circ[2] = io3(u) * Math.hypot(innerWidth, innerHeight) * 1.15;
    look.ink.set(COL.paper).lerp(cA.set(COL.ink), span(u, 0.2, 0.55)); look.acc.copy(ACCS[NP - 1]).lerp(cA.set(COL.accent), span(u, 0.2, 0.55));
  } else if (t >= C0 && t < C0 + 0.5) {
    look.b.set(COL.accent); look.mask = 2;
    if (calm || !GL) { look.circ[0] = innerWidth / 2; look.circ[1] = innerHeight / 2; look.circ[2] = io3(span(t, C0, C0 + 0.5)) * Math.hypot(innerWidth, innerHeight) * 0.6; }
    else {
      const z = zeroOf2026(), c = toScreen(z.x, z.y, 0), e = toScreen(z.x + z.r, z.y, 0);
      look.circ[0] = c[0]; look.circ[1] = c[1]; look.circ[2] = Math.hypot(e[0] - c[0], e[1] - c[1]) * span(t, C0 + 0.04, C0 + 0.16);
    }
  } else if (t >= C0 + 0.5) {
    look.a.set(COL.accent); look.acc.set(COL.paper);
  }
  return look;
}

/* ------------------------------------------------------------------ shapes, built as the fonts land */

const fontsReady = Promise.race([
  Promise.all([
    document.fonts.load('900 expanded 200px "Archivo"'),
    document.fonts.load('800 200px "Archivo"'),
    document.fonts.load('italic 400 200px "Instrument Serif"')
  ]),
  new Promise((ok) => setTimeout(ok, 2600))
]).catch(() => {});

const ARCH = { family: '"Archivo", sans-serif', weight: 900, stretch: "expanded" };
const NUMS = [
  [{ t: "99.98" }, { t: "%", a: 1 }], [{ t: "98.9" }, { t: "%", a: 1 }], [{ t: "0.977" }], [{ t: "97.0" }, { t: "%", a: 1 }],
  [{ t: "85" }, { t: "%", a: 1 }], [{ t: "0.17" }, { t: "¢", a: 1 }], [{ t: "21" }, { t: " ms", a: 1 }]
];
const YEARS = ["2018", "2020", "2023", "2024", "2025", "2026"];
const nameShape = () => text(V.n ? [[{ t: "ALAN" }], [{ t: "FUNG" }]] : [[{ t: "ALAN FUNG" }]], Object.assign({}, ARCH, { lh: 0.88, track: -0.01 }), N, 11);
const idle = () => new Promise((ok) => (window.requestIdleCallback ? requestIdleCallback(ok, { timeout: 120 }) : setTimeout(ok, 16)));

async function buildShapes() {
  const t0 = performance.now();
  store("name", nameShape());
  const jobs = [
    () => store("wave", wave(N, 5)),
    () => store("ring", ring(N, 6)),
    ...EMB.map((d, i) => () => store(d, d === "vase" ? vase(N, 40 + i) : drawing(d, N, 40 + i))),
    () => store("table1", drawing("table1", N, 50)),
    ...NUMS.map((parts, i) => () => store("num" + i, text([parts], { family: '"Archivo", sans-serif', weight: 800, track: -0.03 }, N, 60 + i))),
    ...YEARS.map((y, j) => () => store("year" + j, text([[{ t: y, a: j === 5 ? 1 : 0 }]], Object.assign({}, ARCH, { track: -0.02 }), N, 70 + j))),
    () => store("sig", text([[{ t: "Alan" }]], { family: '"Instrument Serif", serif', style: "italic", weight: 400, lh: 1.1 }, N, 80))
  ];
  // with a portrait beside the film, the dust ends on a face instead of a signature
  const src = new URLSearchParams(location.search).get("face") || document.body.dataset.face;
  if (src) {
    const face = new Image();
    face.onload = () => { store("face", photo(face, N, 90)); SLOT.sig.tex = "face"; };
    face.src = src;
  }
  // the first scroll needs the floor and the ring; everything else waits for the name to finish gathering
  let worst = 0;
  for (let i = 0; i < jobs.length; i++) {
    if (i === 2) await introDone;
    await idle();
    const t = performance.now(); jobs[i](); worst = Math.max(worst, performance.now() - t);
  }
  cost.build = Math.round(performance.now() - t0); cost.worstShape = Math.round(worst);
}

/* ------------------------------------------------------------------ the timeline: text on the same clock */

const tl = gsap.timeline({ paused: true, defaults: { ease: "none" } });
const D = (from3d, plain) => (calm ? plain || { opacity: 0, duration: 0.15 } : from3d);

function buildTimeline() {
  // hero: the line under the name flies apart, word by word
  const tagWords = SplitText.create("#tag", { type: "words", wordsClass: "w" }).words;
  tl.to(tagWords, D({ yPercent: -170, z: () => gsap.utils.random(-500, 260), rotateX: 75, transformPerspective: 700, opacity: 0, stagger: { each: 0.025, from: "center" }, duration: 0.3, ease: "power2.in" }, { opacity: 0, duration: 0.2 }), 0.12);
  tl.to(".hero-foot", { opacity: 0, y: 24, duration: 0.18 }, 0.1);
  tl.set("#hero", { autoAlpha: 0 }, 0.62);

  // what I do: each line turns up out of the floor
  tl.set("#say", { autoAlpha: 1 }, 0.55);
  const lines = $$("#say .ln");
  [0.62, 0.86, 1.1].forEach((at, i) => {
    const chars = SplitText.create(lines[i], { type: "words,chars", charsClass: "c" }).chars;
    tl.from(chars, D({ rotateX: -100, yPercent: 60, z: -80, opacity: 0, transformPerspective: 800, transformOrigin: "50% 100% -20px", stagger: 0.008, duration: 0.24, ease: "power3.out" }, { opacity: 0, stagger: 0.004, duration: 0.2 }), at);
  });
  tl.from(lines[3], { opacity: 0, y: 24, duration: 0.18 }, 1.34);
  const counts = $$("#say .counts b");
  tl.from("#say .counts li", { opacity: 0, y: 34, stagger: 0.06, duration: 0.2, ease: "power2.out" }, 1.42);
  const n = { v: 0 };
  tl.to(n, { v: 1, duration: 0.34, ease: "power2.out", onUpdate: () => counts.forEach((b) => { b.textContent = Math.round(n.v * +b.dataset.to); }) }, 1.42);
  tl.to("#say .say-in", D({ scale: 0.82, yPercent: -18, opacity: 0, duration: 0.26, ease: "power2.in" }, { opacity: 0, duration: 0.2 }), 1.9);
  tl.to("#say .counts", { opacity: 0, y: 30, duration: 0.2 }, 1.9);
  tl.set("#say", { autoAlpha: 0 }, 2.18);

  // the window: its clip follows the same corners the background is painting
  tl.set("#win", { autoAlpha: 1 }, WIN[0]);
  tl.from("#win .win-in", D({ scale: 1.3, opacity: 0, duration: 0.3, ease: "power2.out" }), 2.42);
  tl.to("#win .win-in", D({ yPercent: -30, opacity: 0, duration: 0.18, ease: "power2.in" }), 2.84);
  tl.set("#win", { autoAlpha: 0 }, 3.04);

  // seven projects: in, the number forms, out
  PJ.forEach((p, i) => {
    const el = p.el, at = (u) => seg(i, u);
    tl.set(el, { autoAlpha: 1 }, at(0));
    const nameChars = SplitText.create($(".pj-n", el), { type: "words,chars", charsClass: "c" }).chars;
    const headLines = SplitText.create($(".pj-h", el), { type: "lines", mask: "lines" }).lines;
    tl.from($(".pj-i", el), { opacity: 0, x: -24, duration: 0.12 }, at(0.02));
    tl.from(nameChars, D({ yPercent: 90, rotateX: -95, opacity: 0, transformPerspective: 700, transformOrigin: "50% 100%", stagger: 0.012, duration: 0.2, ease: "power3.out" }, { opacity: 0, duration: 0.15 }), at(0.03));
    tl.from(headLines, D({ yPercent: 110, duration: 0.18, stagger: 0.03, ease: "power3.out" }, { opacity: 0, duration: 0.15 }), at(0.1));
    tl.from($$(".fits li", el), { opacity: 0, y: 16, scale: 0.9, stagger: 0.02, duration: 0.12, ease: "power2.out" }, at(0.16));
    tl.from($(".pj-open", el), { opacity: 0, duration: 0.1 }, at(0.2));
    tl.from($(".pj-proof", el), { opacity: 0, y: 24, duration: 0.12, ease: "power2.out" }, at(MORPH[i][1] - 0.04));
    tl.to(nameChars, D({ yPercent: -90, rotateX: 80, opacity: 0, transformPerspective: 700, stagger: 0.008, duration: 0.14, ease: "power2.in" }, { opacity: 0, duration: 0.12 }), at(0.8));
    tl.to($$(".pj-i, .pj-h, .fits, .pj-open", el), { opacity: 0, y: -40, stagger: 0.015, duration: 0.14, ease: "power2.in" }, at(0.8));
    tl.to($(".pj-proof", el), { opacity: 0, y: -24, duration: 0.12 }, at(0.82));
    tl.set(el, { autoAlpha: 0 }, at(0.97));
  });

  // how I got here: the title rolls over with every year
  tl.set("#path", { autoAlpha: 1 }, P0 + 0.12);
  tl.from("#path .kicker, #path .ticks", { opacity: 0, y: 20, stagger: 0.05, duration: 0.15 }, P0 + 0.14);
  const yrs = $$("#yrs li");
  const shows = [P0 + 0.22].concat([1, 2, 3, 4, 5].map((j) => YEAR(j) + 0.11));
  yrs.forEach((li, j) => {
    tl.set(li, { autoAlpha: 1 }, shows[j]);
    tl.from(li, D({ yPercent: 70, rotateX: -60, transformPerspective: 900, opacity: 0, duration: 0.12, ease: "power3.out" }, { opacity: 0, duration: 0.1 }), shows[j]);
    if (j < yrs.length - 1) {
      tl.to(li, D({ yPercent: -70, rotateX: 60, transformPerspective: 900, opacity: 0, duration: 0.1, ease: "power2.in" }, { opacity: 0, duration: 0.08 }), shows[j + 1] - 0.1);
      tl.set(li, { autoAlpha: 0 }, shows[j + 1]);
    }
  });
  tl.to("#path .kicker, #yrs, #path .ticks", { opacity: 0, duration: 0.14 }, C0 + 0.04);
  tl.set("#path", { autoAlpha: 0 }, C0 + 0.3);

  // contact: the heading lands from very close, then the way to reach me
  tl.set("#contact", { autoAlpha: 1 }, C0 + 0.48);
  const huge = SplitText.create("#contact .huge", { type: "words,chars", charsClass: "c" }).chars;
  tl.from("#contact .kicker", { opacity: 0, y: 16, duration: 0.12 }, C0 + 0.52);
  tl.from(huge, D({ scale: 2.2, opacity: 0, stagger: { each: 0.016, from: "center" }, duration: 0.3, ease: "power3.out" }, { opacity: 0, duration: 0.2 }), C0 + 0.5);
  tl.from("#contact .c-lede, #contact .reach, #contact .pills", { opacity: 0, y: 26, stagger: 0.05, duration: 0.16, ease: "power2.out" }, C0 + 0.72);
  tl.from("#contact .foot", { opacity: 0, duration: 0.12 }, C0 + 0.86);
  tl.set({}, {}, END);
}

/* ------------------------------------------------------------------ chapter names in the header */

const CHAPS = [[0, "Forward Deployed Engineer"], [0.6, "What I do"], [2.3, "Selected work"]]
  .concat(PJ.map((p, i) => [seg(i, 0), String(i + 1).padStart(2, "0") + " / 07  " + p.name]))
  .concat([[P0, "How I got here"], [C0 + 0.5, "Contact"]]);
const chap = $("#chap");
let chapNow = -1;
function setChap(t) {
  let i = 0;
  for (let k = 0; k < CHAPS.length; k++) if (t >= CHAPS[k][0]) i = k;
  if (i === chapNow) return;
  chapNow = i;
  if (calm) chap.textContent = CHAPS[i][1];
  else gsap.to(chap, { duration: 0.6, scrambleText: { text: CHAPS[i][1], chars: "upperCase", speed: 0.6 }, overwrite: true });
}

/* ------------------------------------------------------------------ the header takes the colour of what's behind it */

const top = $(".top");
let topDark = null;
function behindHeader(L) {
  const x = innerWidth / 2, y = 30;
  if (L.mask === 1) {
    for (let i = 0; i < 4; i++) {
      const a = quad[i], b = quad[(i + 1) % 4];
      if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return L.a;
    }
    return L.b;
  }
  if (L.mask === 2) return Math.hypot(x - L.circ[0], y - L.circ[1]) < L.circ[2] ? L.b : L.a;
  return L.a;
}
function setHeader(L) {
  const c = behindHeader(L), dark = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.4;
  if (dark !== topDark) { topDark = dark; top.classList.toggle("on-dark", dark); }
}

/* ------------------------------------------------------------------ every frame */

const stage = $(".stage");
const win = $("#win");
const prog = $("#prog");
const ticks = $$(".ticks li");
const ticksEl = $(".ticks");
const skews = $$(".skew");
let tau = 0, lastTau = -1, lastClip = "", tickNow = -1;
const mouse = { x: 0, y: 0, on: 0, last: -10 };
let frames = 0, slow = 0, t0 = 0;

const cost = { frame: 0, build: 0, worstShape: 0 };
function frame(time, dt) {
  const c0 = performance.now();
  draw(time, dt);
  cost.frame += (performance.now() - c0 - cost.frame) * 0.05;
}
function draw(time, dt) {
  tau = tauNow();
  const moved = Math.abs(tau - lastTau) > 1e-5;
  lastTau = tau;
  setChap(tau);
  prog.style.transform = "scaleX(" + clamp01(tau / END).toFixed(4) + ")";

  // the year ticks
  let j = -1;
  if (tau >= P0 + 0.2) { j = 0; for (let k = 1; k < 6; k++) if (tau >= YEAR(k) + 0.11) j = k; }
  if (j !== tickNow) { tickNow = j; ticks.forEach((li, k) => li.classList.toggle("on", k === j)); ticksEl.style.setProperty("--p", j < 0 ? 0 : j / 5); }

  // scroll speed leans the project copy, a little
  if (!calm && lenis) {
    const sk = Math.max(-4, Math.min(4, -lenis.velocity * 0.09));
    skews.forEach((el) => { if (el.parentNode.style.visibility !== "hidden") gsap.set(el, { skewY: sk }); });
  }

  const L = lookAt(tau);
  setHeader(L);
  if (tau >= WIN[0] && tau < WIN[1] + 0.2) {
    const q = windowQuad(span(tau, WIN[0], WIN[1]));
    const clip = "polygon(" + q.map((p) => p[0].toFixed(1) + "px " + p[1].toFixed(1) + "px").join(",") + ")";
    if (clip !== lastClip) { win.style.clipPath = clip; lastClip = clip; }
  }

  if (!GL) {
    // without WebGL, the stage carries the colour, switching where a wipe would cross the middle
    stage.style.backgroundColor = "#" + (L.mask === 2 && L.circ[2] > Math.hypot(innerWidth, innerHeight) * 0.3 ? L.b : L.a).getHexString();
    return;
  }

  // slow device: halve the dust and the pixels, once
  if (time > 5) {
    frames++; slow += dt > 34 ? 1 : 0;
    if (frames >= 90) { if (!lite && slow > 45) { lite = true; html.classList.add("lite"); size(); } frames = 0; slow = 0; }
  }

  // when nothing moves, draw every other frame
  const busy = moved || intro.v < 1 || mouse.on > 0.01 || (tau > 2.3 && tau < 2.75);
  if (!busy && (t0++ & 1)) return;

  const st = stateAt(tau);
  const A = SLOT[st.from], B = SLOT[st.to];
  const ta = S[A.tex] ? A.tex : "cloud", tb = S[B.tex] ? B.tex : "cloud";
  const xa = S[A.tex] ? A.at() : SLOT.cloud.at(), xb = S[B.tex] ? B.at() : SLOT.cloud.at();
  U.uA.value = S[ta].tex; U.uB.value = S[tb].tex;
  U.uPA.value.set(xa.x, xa.y, xa.z, xa.s); U.uRA.value.set(xa.rx, xa.ry, xa.wave, xa.explode);
  U.uPB.value.set(xb.x, xb.y, xb.z, xb.s); U.uRB.value.set(xb.rx, xb.ry, xb.wave, xb.explode);
  U.uSpin.value.set(xa.spin, xb.spin);
  U.uT.value = st.t;
  U.uTime.value = time;
  U.uNoise.value = calm ? 0 : lite ? 0.75 : 1;

  // the camera: a slow sway on the floor, then a dive through the 0 of 2026
  let cx = 0, cy = 0, cz = 12, rx = 0;
  if (!calm) {
    rx = 0.035 * Math.sin(Math.PI * span(tau, 0.3, 2.2));
    const u = span(tau, C0, C0 + 0.5);
    if (u > 0 && u < 1) {
      const z = zeroOf2026(), e = io3(u);
      cx = z.x * e; cy = z.y * e; cz = lerp(12, 0.25, in3(u) * 0.75 + u * 0.25);
    }
  }
  camera.position.set(cx, cy, cz);
  camera.rotation.set(rx, 0, 0);
  camera.updateMatrixWorld();

  // the cursor, eased in and out
  mouse.on += ((time - mouse.last < 1.2 ? 1 : 0) - mouse.on) * 0.06;
  U.uMouse.value.set(mouse.x, mouse.y, V.H * 0.12, lite ? 0 : mouse.on);

  U.uInk.value.copy(L.ink); U.uAcc.value.copy(L.acc);
  BU.uBgA.value.copy(L.a); BU.uBgB.value.copy(L.b); BU.uMask.value = L.mask;
  if (L.mask === 1) quad.forEach((p, i) => BU.uQ.value[i].set(p[0], p[1]));
  if (L.mask === 2) BU.uCirc.value.set(L.circ[0], L.circ[1], L.circ[2]);
  renderer.render(scene, camera);
}

if (matchMedia("(pointer: fine)").matches) {
  const ray = new THREE.Vector3();
  addEventListener("pointermove", (e) => {
    ray.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1, 0.5).unproject(camera).sub(camera.position);
    const k = -camera.position.z / ray.z;
    mouse.x = camera.position.x + ray.x * k;
    mouse.y = camera.position.y + ray.y * k;
    mouse.last = gsap.ticker.time;
  }, { passive: true });
}

/* ------------------------------------------------------------------ start */

let pinST = null;
let lastNarrow = V.n;
addEventListener("resize", () => {
  size();
  if (GL && V.n !== lastNarrow && S.name) { lastNarrow = V.n; store("name", nameShape()); }
});

$("#copy").addEventListener("click", () => {
  const mail = "aflung10@gmail.com";
  const done = () => toast("Email copied.");
  const pick = () => { const r = document.createRange(); r.selectNodeContents($("#mail")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selected. Press Ctrl+C or Cmd+C to copy."); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(mail).then(done, pick);
  else pick();
});
let toastT = 0;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2400);
}

gsap.ticker.add(frame);
gsap.set("#hero", { autoAlpha: 1 });
gsap.set(".tag, .hero-foot", { opacity: 0 });

fontsReady.then(async () => {
  buildTimeline();
  pinST = ScrollTrigger.create({
    trigger: "#movie", start: "top top", end: () => "+=" + END * innerHeight,
    pin: ".stage", scrub: true, animation: tl, invalidateOnRefresh: true
  });
  if (GL) buildShapes();
  else introEnd();
  // the name gathers out of the dust, then the line under it rises
  if (!calm) {
    gsap.to(intro, { v: 1, duration: 2.6, ease: "power2.inOut", onComplete: introEnd });
    gsap.fromTo(".tag", { opacity: 0, y: 30, clipPath: "inset(0 0 100% 0)" }, { opacity: 1, y: 0, clipPath: "inset(0 0 -20% 0)", duration: 1.2, delay: 1.5, ease: "power3.out" });
    gsap.to(".hero-foot", { opacity: 1, duration: 0.8, delay: 2.1 });
  } else { gsap.set(".tag, .hero-foot", { opacity: 1 }); introEnd(); }
  ScrollTrigger.refresh();
  // speed the gathering up if the visitor scrolls before it finishes
  if (lenis) lenis.on("scroll", () => { if (intro.v < 1) gsap.getTweensOf(intro).forEach((tw) => tw.timeScale(3)); });
  html.classList.add("ready");
});

window.__reel = {
  go, tau: () => tau, lite: () => lite, gl: GL, N,
  state: () => Object.assign(stateAt(tau), { tau, ready: !!S.sig, cam: camera.position.toArray() }),
  shapes: () => Object.keys(S),
  lenis: () => lenis,
  cost
};
