// Resn's about page, rebuilt from how the original works (see ../README.md for the teardown).
// Everything here is our own code and our own procedural assets: the drop is generated, the
// texture it refracts is drawn on a canvas, and the shaders are written fresh against the same
// optics. Numbers marked "Resn" are the values the original ships with.
import * as THREE from 'three';

const gsap = window.gsap;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const frameK = (k, dt) => 1 - Math.pow(1 - k, dt * 60); // a per-frame ease that holds at any refresh rate

// ─── scale: the whole page is in rem, and the root size follows the window (Resn) ─────────
function scaleRoot() {
  const w = innerWidth;
  const v = (Math.min(w, 2560) / 1536) * 10;
  const max = w < 2048 ? 10 : 12;
  document.documentElement.style.fontSize = Math.round(Math.max(Math.min(v, max), 6)) + 'px';
}
scaleRoot();

// ─── the drop: a faceted teardrop, generated ──────────────────────────────────────────────
// A teardrop curve turned on a lathe, every other ring offset half a step so the faces come out
// as triangles, then each vertex nudged so no two facets match. Flat normals: every face bends
// the view on its own, which is what breaks the refraction into shards.
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function dropGeometry() {
  const rand = rng(20231026);
  const rings = 40, segs = 48, m = 1.15;
  const ringPts = [];
  for (let i = 1; i < rings; i++) {
    const t = (i / rings) * Math.PI;
    const r = Math.sin(t) * Math.pow(Math.sin(t / 2), m) * 2.1;
    const y = Math.cos(t) * 1.8;
    const off = (i % 2) * 0.5;
    const ring = [];
    for (let j = 0; j < segs; j++) {
      const a = ((j + off) / segs) * Math.PI * 2;
      const jr = r * (1 + (rand() - 0.5) * 0.09);
      const jy = y + (rand() - 0.5) * 0.05;
      ring.push(new THREE.Vector3(Math.cos(a) * jr, jy, Math.sin(a) * jr));
    }
    ringPts.push(ring);
  }
  const top = new THREE.Vector3(0, 1.8, 0), bottom = new THREE.Vector3(0, -1.8, 0);
  const tris = [];
  for (let j = 0; j < segs; j++) tris.push([top, ringPts[0][(j + 1) % segs], ringPts[0][j]]);
  for (let i = 0; i < ringPts.length - 1; i++) {
    const A = ringPts[i], B = ringPts[i + 1];
    const k = ((i + 2) % 2) > ((i + 1) % 2) ? 0 : 1; // pick the B vertex that sits between A[j] and A[j+1]
    for (let j = 0; j < segs; j++) {
      const a0 = A[j], a1 = A[(j + 1) % segs];
      const b0 = B[(j + k) % segs], b1 = B[(j + 1 + k) % segs];
      tris.push([a0, a1, b0]);
      tris.push([a1, b1, b0]);
    }
  }
  const last = ringPts[ringPts.length - 1];
  for (let j = 0; j < segs; j++) tris.push([bottom, last[j], last[(j + 1) % segs]]);

  const pos = new Float32Array(tris.length * 9), nor = new Float32Array(tris.length * 9);
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();
  tris.forEach((t, k) => {
    let [p0, p1, p2] = t;
    e1.subVectors(p1, p0); e2.subVectors(p2, p0); n.crossVectors(e1, e2).normalize();
    c.copy(p0).add(p1).add(p2).multiplyScalar(1 / 3);
    if (n.dot(c.set(c.x, c.y * 0.35, c.z)) < 0) { [p1, p2] = [p2, p1]; n.negate(); } // face outwards
    [p0, p1, p2].forEach((p, v) => {
      pos.set([p.x, p.y, p.z], k * 9 + v * 3);
      nor.set([n.x, n.y, n.z], k * 9 + v * 3);
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

// ─── what the drop refracts: dark cut gems and "FDE", drawn here, tiling ───────────────────
// Resn's texture is the word "Resn" over a field of dark gems; the post pass zooms the red
// channel 3x, which is where the giant red forms and the smaller teal letters come from.
function drawGem(ctx, x, y, s, rot, rand) {
  const outline = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const r = Math.sin(t / 2) ** 1.1;
    outline.push([Math.sin(t) * r * 0.62 * s, -Math.cos(t) * s * 0.85]);
  }
  const inner = outline.map(([px, py]) => [px * 0.5 + s * 0.04, py * 0.5 + s * 0.12]);
  const core = [s * 0.06, s * 0.2];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineJoin = 'round';
  const facet = (pts) => {
    const l = 8 + rand() * rand() * 90;
    ctx.fillStyle = `rgb(${l},${l},${l + 2})`;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.03 + rand() * 0.07})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    facet([outline[i], outline[j], inner[j], inner[i]]);
  }
  for (let i = 0; i < N; i++) facet([inner[i], inner[(i + 1) % N], core]);
  ctx.restore();
}

async function lensTexture() {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  const rand = rng(7);
  const gems = [];
  for (let i = 0; i < 26; i++) {
    gems.push([rand() * S, rand() * S, 70 + rand() * 70, (rand() - 0.5) * 1.2]);
  }
  for (const [x, y, s, r] of gems) {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const gx = x + ox * S, gy = y + oy * S;
      if (gx < -s * 1.2 || gx > S + s * 1.2 || gy < -s * 1.2 || gy > S + s * 1.2) continue;
      drawGem(ctx, gx, gy, s, r, rng(Math.round(x * 13 + y)));
    }
  }
  try { await document.fonts.load('500 300px Outfit'); } catch (_) {}
  ctx.fillStyle = '#a3a3a3';
  ctx.font = '500 300px Outfit, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FDE', S / 2, S / 2 + 10);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ─── shaders (ours), same optics as the original ───────────────────────────────────────────
const NOISE = /* glsl */`
  float hash13(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float a = mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x);
    float b = mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x);
    float c = mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x);
    float d = mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z) * 2.0 - 1.0;
  }
  float turbulence(vec3 p) {
    float t = -0.5;
    for (int k = 1; k <= 6; k++) {
      float s = exp2(float(k));
      t += abs(vnoise(p * s)) / s;
    }
    return t;
  }
`;

const dropVert = /* glsl */`
  uniform float uIor, uSpread, uTime, uWeight, uRipple;
  varying vec3 vReflect, vBendR, vBendG, vBendB, vNormal, vToEye, vLost;
  varying float vFacing;
  ${NOISE}
  // Past the critical angle refract() returns nothing. The original normalises that into NaN, which
  // blacks out every facet it touches; vLost marks those facets so they go dark on purpose.
  vec3 bend(vec3 I, vec3 n, float eta, out float lost) {
    vec3 r = refract(I, n, eta);
    lost = dot(r, r) < 1e-6 ? 1.0 : 0.0;
    return lost > 0.5 ? vec3(0.0) : normalize(r);
  }
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);
    vec3 I = normalize(world.xyz - cameraPosition);
    vNormal = n;
    vToEye = -I;
    vFacing = normalize(normalMatrix * normal).z;
    vReflect = normalize(reflect(I, n));
    vBendR = bend(I, n, uIor, vLost.r);
    vBendG = bend(I, n, uIor * (1.0 - uSpread), vLost.g);
    vBendB = bend(I, n, uIor * (1.0 - uSpread * 2.0), vLost.b);
    // The surface boils while the menu is open (Resn: weight and periodPn).
    float d = -uWeight * 18.0 * turbulence(0.5 * normal + uTime) + uRipple * vnoise(0.06 * position + 2.0 * uTime);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * d, 1.0);
  }
`;

const dropFrag = /* glsl */`
  uniform sampler2D uLens;
  uniform float uTiling, uReflectGain, uRefractGain, uFresnelPow, uBlend, uDiffuse, uSpecPow, uSpecGain;
  varying vec3 vReflect, vBendR, vBendG, vBendB, vNormal, vToEye, vLost;
  varying float vFacing;
  vec2 lensUv(vec3 d) { return (d.xy * 0.25 + 0.5) * uTiling; }
  float lamp(vec3 L, vec3 n, vec3 v) {
    L = normalize(L);
    float nl = dot(n, L);
    float spec = nl > 0.0 ? pow(max(0.0, dot(reflect(-L, n), v)), uSpecPow) * uSpecGain : 0.0;
    return max(0.0, nl) * uDiffuse + spec;
  }
  void main() {
    vec3 reflected = texture2D(uLens, vec2(vReflect.x * 0.25 + 0.5, 1.5 - vReflect.y * 0.25) * uTiling).rgb * uReflectGain;
    vec3 refracted = vec3(
      texture2D(uLens, lensUv(vBendR)).r,
      texture2D(uLens, lensUv(vBendG)).g,
      texture2D(uLens, lensUv(vBendB)).b
    ) * uRefractGain * (1.0 - step(1e-4, vLost));
    float f = pow(clamp(1.0 - vFacing, 0.0, 1.0), uFresnelPow);
    f = 1.0 - (1.0 - f) * uBlend;
    vec3 c = mix(refracted, reflected, f);
    vec3 n = normalize(vNormal), v = normalize(vToEye);
    c += lamp(vec3(1.0, 1.0, 1.0), n, v) + lamp(vec3(-1.0, 0.75, -0.75), n, v) + lamp(vec3(0.5, -0.5, -0.5), n, v);
    gl_FragColor = vec4(c, 1.0);
  }
`;

// One pass for Resn's five: darken, split the channels about the centre, lighten, tint, grain.
const postVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const postFrag = /* glsl */`
  uniform sampler2D tScene;
  uniform vec3 uScale;
  uniform float uFade, uTime, uGrain;
  varying vec2 vUv;
  float bc(float c, float b, float k) {
    c += b;
    c = k > 0.0 ? (c - 0.5) / (1.0 - k) + 0.5 : (c - 0.5) * (1.0 + k) + 0.5;
    return clamp(c, 0.0, 1.0);
  }
  float grain(vec2 p, float t) {
    return fract(sin(dot(p + fract(t * 7.13) * 431.0, vec2(12.9898, 78.233))) * 43758.5453);
  }
  void main() {
    vec2 q = vUv - 0.5;
    vec3 c = vec3(
      bc(texture2D(tScene, q / uScale.x + 0.5).r, -0.11, 0.15),
      bc(texture2D(tScene, q / uScale.y + 0.5).g, -0.11, 0.15),
      bc(texture2D(tScene, q / uScale.z + 0.5).b, -0.11, 0.15)
    );
    c = vec3(bc(c.r, 0.14, 0.1), bc(c.g, 0.14, 0.1), bc(c.b, 0.14, 0.1));
    c = pow(c, vec3(1.0 / 1.02, 1.0, 1.0 / 1.04)) * uFade;
    c = clamp(c + grain(gl_FragCoord.xy, uTime) * uGrain, 0.0, 1.0);
    gl_FragColor = vec4(c, 1.0);
  }
`;

// ─── the gem view ──────────────────────────────────────────────────────────────────────────
const gem = {
  ok: false,
  mode: 'HOME',
  state: { cameraDist: 200, motionSpeed: 1, overNav: 1 },   // Resn: stateParamns
  intro: { progress: 1, saturation: 0 },                     // Resn: introTweenObj
  drag: { progress: 0 },                                     // Resn: dragTweenObj
  tilt: { x: 0, y: 0 },
  autoAngle: 0,
  mouse: { x: innerWidth / 2, y: innerHeight / 2 },
  pixelRatio: coarse ? Math.min(devicePixelRatio, 2) : 1,    // Resn renders desktop at 1x and lets the grain hide it
  frameTimes: [],

  async init(canvas) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    } catch (_) { return false; }
    renderer.setClearColor(0x000000, 1);
    renderer.setPixelRatio(this.pixelRatio);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.rig = new THREE.Object3D();          // Resn: cameraContainer, orbits the drop
    this.camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 1000);
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    this.lens = await lensTexture();
    this.uniforms = {
      uLens: { value: this.lens },
      uIor: { value: 0.7 },
      uSpread: { value: 0.0005 },
      uTime: { value: 0 },
      uWeight: { value: 0 },
      uRipple: { value: 0 },
      uTiling: { value: 4 },
      uReflectGain: { value: 0.9 },
      uRefractGain: { value: 0.9 },
      uFresnelPow: { value: 2.75 },
      uBlend: { value: 0.86 },
      uDiffuse: { value: 0.1 },
      uSpecPow: { value: 80 },
      uSpecGain: { value: 0.8 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: dropVert, fragmentShader: dropFrag, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(dropGeometry(), mat);
    this.mesh.scale.setScalar(14);            // Resn: modelScale 14. The bulb sits on the axis,
    this.mesh.position.y = 6;                 // so close up the drop fills the screen as theirs does
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    this.post = {
      tScene: { value: this.target.texture },
      uScale: { value: new THREE.Vector3(0.99, 0.999, 1.0) },   // Resn: lensColorScaleR/G/B
      uFade: { value: 0 },
      uTime: { value: 0 },
      uGrain: { value: 0.03 },
    };
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.postMesh = new THREE.Mesh(tri, new THREE.ShaderMaterial({ uniforms: this.post, vertexShader: postVert, fragmentShader: postFrag, depthTest: false, depthWrite: false }));
    this.postMesh.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.postMesh);
    this.postCam = new THREE.Camera();

    this.resize();
    renderer.compile(this.scene, this.camera);
    renderer.compile(this.postScene, this.postCam);
    this.start = performance.now();
    this.ok = true;
    return true;
  },

  resize() {
    if (!this.renderer) return;
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.target.setSize(Math.round(w * this.pixelRatio), Math.round(h * this.pixelRatio));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },

  // Resn: animateIntro. Fades up from black while the orbit closes 30 units.
  animateIntro() {
    gsap.to(this.intro, { progress: 0, duration: reduced ? 0.01 : 4, delay: reduced ? 0 : 0.5, ease: 'sine.out' });
  },

  setMode(mode) {
    if (this.mode === mode || !this.ok) return;
    this.mode = mode;
    const u = this.uniforms, scale = this.post.uScale.value;
    gsap.killTweensOf([this.drag, this.state]);
    const T = (t) => (reduced ? 0.01 : t);
    if (mode === 'ABOUT') {
      this.animateIntro();
      gsap.to(this.drag, { progress: 0, duration: T(2), ease: 'expo.out' });
      gsap.to(this.state, { cameraDist: 40, motionSpeed: 0.2, overNav: 1, duration: T(2), ease: 'expo.out' });
      // Resn: setToFlat. The red channel zooms 3x and the drop turns to a lens.
      gsap.to(scale, { x: 0.99 * 3, duration: T(1), ease: 'expo.out' });
      gsap.to(u.uRefractGain, { value: 0.8, duration: T(1), ease: 'expo.out' });
      gsap.to(u.uIor, { value: 1.2, duration: T(1), ease: 'expo.out' });
      gsap.to(u.uReflectGain, { value: 2.0, duration: T(1), ease: 'expo.out' });
    } else if (mode === 'MENU') {
      this.animateIntro();
      gsap.to(this.drag, { progress: 2, duration: T(1), ease: 'expo.out' });
      gsap.to(this.state, { cameraDist: 190, motionSpeed: 0.3, duration: T(1), ease: 'expo.out' });
      gsap.to(this.state, { overNav: 0.3, duration: T(3), delay: 1, ease: 'sine.out' });
      // Resn: setToDrop. Back to a gem you look at, not through.
      gsap.to(scale, { x: 0.99, duration: T(0.5), ease: 'expo.out' });
      gsap.to(u.uRefractGain, { value: 0.9, duration: T(0.5), ease: 'expo.out' });
      gsap.to(u.uIor, { value: 0.7, duration: T(0.5), ease: 'expo.out' });
      gsap.to(u.uReflectGain, { value: 0.9, duration: T(0.5), ease: 'expo.out' });
    }
  },

  render(dt, now) {
    if (!this.ok) return;
    const { state, intro, tilt } = this;
    const elapsed = now - this.start;

    this.uniforms.uTime.value = 0.001 * elapsed;
    this.uniforms.uWeight.value = 0.04 * this.drag.progress * state.overNav;
    this.uniforms.uRipple.value = 0.05 * this.drag.progress * state.overNav;
    this.post.uFade.value = (1 - intro.progress) * (1 - intro.saturation);
    this.post.uTime.value = elapsed / 1000;

    // Resn's orbit: the mouse leans the camera, and it creeps round towards whichever half the
    // mouse is in.
    const tgX = (this.mouse.x / innerWidth - 0.5) * -1 * state.motionSpeed;
    const tgY = (this.mouse.y / innerHeight - 0.5) * 0.5 * state.motionSpeed;
    tilt.x += (tgX - tilt.x) * frameK(0.02, dt);
    tilt.y += (tgY - tilt.y) * frameK(0.05, dt);
    if (!reduced) this.autoAngle += (this.mouse.x > innerWidth * 0.5 ? -0.0006 : 0.0006) * dt * 60;

    const angle = tilt.x + this.autoAngle;
    const elev = tilt.y * (1 - intro.progress);
    const dist = intro.progress * 30 + state.cameraDist;
    this.rig.position.set(Math.sin(angle) * dist * Math.cos(elev), Math.sin(elev) * dist, Math.cos(angle) * dist * Math.cos(elev));
    this.rig.rotation.y = angle;
    this.camera.rotation.x = -elev * 0.94;

    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);

    this.watchSpeed(dt);
  },

  // Resn drops the pixel ratio 0.1 at a time while frames average over 22 ms.
  watchSpeed(dt) {
    const t = this.frameTimes;
    t.push(dt * 1000);
    if (t.length < 90) return;
    const avg = t.reduce((a, b) => a + b, 0) / t.length;
    t.length = 0;
    if (avg > 22 && this.pixelRatio > 0.6) {
      this.pixelRatio = Math.round((this.pixelRatio - 0.1) * 10) / 10;
      this.resize();
    }
  },
};

// ─── text shards: copy cut by giant spinning triangles (Resn: base_text_effect_view) ────────
// Resn draws the text into a canvas and masks it with destination-in. Here the real text keeps
// its place in the DOM and the same mask becomes a clip-path, with a copy underneath at the 5%
// base. Triangle maths as in the original, including its "180 and 360 read as radians" corners.
const SHARD_KIND = {
  heading:   { count: 3, size: 1,   seed: () => Math.random() * 10 },
  paragraph: { count: 5, size: 1,   seed: () => Math.random() * 360 },
  menu:      { count: 3, size: 0.5, seed: () => Math.random() * 10 },
};

class Shards {
  constructor(el) {
    this.el = el;
    this.kind = SHARD_KIND[el.dataset.shards] || SHARD_KIND.paragraph;
    this.base = 0;
    this.radius = el.dataset.shards === 'paragraph' ? 2.2 : 2;
    this.tris = Array.from({ length: this.kind.count }, () => ({
      rotation: this.kind.seed(),
      speed: (Math.random() * 0.1 + 0.08) * (Math.random() > 0.5 ? 1 : -1),
    }));
    const text = document.createElement('span');
    text.className = 'shards-text';
    while (el.firstChild) text.appendChild(el.firstChild);
    const ghost = text.cloneNode(true);
    ghost.className = 'shards-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    el.append(text, ghost);
    this.text = text;
    this.ghost = ghost;
    this.draw();
  }

  draw(dt = 1 / 60) {
    const w = this.text.offsetWidth, h = this.text.offsetHeight;
    const side = Math.max(w, h) * this.kind.size;
    const rx = side * 0.8, ry = side * 0.6;
    let d = '';
    this.tris.forEach((t, i) => {
      const a = (i / this.tris.length) * Math.PI * 2;
      const px = Math.cos(a) * rx * this.radius + w / 2;
      const py = Math.sin(a) * ry * this.radius + h / 2;
      t.rotation += t.speed * 0.01 * dt * 60;
      for (let k = 0; k < 3; k++) {
        const o = (k / 2) * 360 + t.rotation;
        d += `${k ? 'L' : 'M'}${(Math.cos(o) * side + px).toFixed(1)} ${(Math.sin(o) * side + py).toFixed(1)}`;
      }
      d += 'Z';
    });
    this.text.style.clipPath = `path('${d}')`;
    this.ghost.style.opacity = this.base;
  }

  // Resn: show / hide / onMouseEnter. The mask is only redrawn while one of these runs, so the
  // shards freeze where the reveal ends, as on the original.
  tween(vars, onDone) {
    const props = new Set();
    vars.forEach((v) => Object.keys(v).forEach((k) => (k === 'base' || k === 'radius') && props.add(k)));
    gsap.killTweensOf(this, [...props].join(','));
    const end = (v) => (v.duration || 0) + (v.delay || 0);
    const longest = vars.reduce((a, v) => (end(v) > end(a) ? v : a), vars[0]);
    vars.forEach((v) => gsap.to(this, v === longest && onDone ? { ...v, onComplete: onDone } : v));
  }

  get moving() { return gsap.isTweening(this); }
}

function showShards(s, duration, delay) {
  const kind = s.el.dataset.shards;
  if (kind === 'heading') {
    s.base = 0; s.radius = 2;
    s.tween([
      { base: 0.05, duration, delay: delay + 0.5, ease: 'sine.inOut' },
      { radius: 0.5, duration, delay, ease: 'expo.out' },
    ]);
  } else if (kind === 'menu') {
    s.base = 0; s.radius = 2;
    s.tween([
      { base: 0.05, duration, delay: delay + 0.5, ease: 'sine.inOut' },
      { radius: 0.9, duration, delay, ease: 'cubic.out' },
    ]);
  } else {
    s.base = 0; s.radius = 2.2;
    s.tween([
      { base: 0.05, duration, delay, ease: 'sine.inOut' },
      { radius: 0.8, duration, delay, ease: 'power1.out' },
    ]);
  }
}

function hideShards(s, duration, onDone) {
  const out = s.el.dataset.shards === 'paragraph' ? 2 : 2.5;
  s.tween([{ base: 0, radius: out, duration, ease: 'sine.out' }], onDone);
}

// ─── page: a fixed layer eased towards the scroll position (Resn: scroll_controller) ────────
const page = $('#page');
const spacer = document.createElement('div');
spacer.className = 'force-height';
spacer.setAttribute('aria-hidden', 'true');
document.body.appendChild(spacer);
const scroll = { cur: window.scrollY };
const measure = () => { spacer.style.height = page.offsetHeight + 'px'; };
new ResizeObserver(measure).observe(page);
measure();

// The page can't be scrolled to a focused link by the browser, so do it for keyboard users.
page.addEventListener('focusin', (e) => {
  const r = e.target.getBoundingClientRect();
  if (r.top < 90 || r.bottom > innerHeight - 90) {
    window.scrollTo(0, Math.max(0, r.top + scroll.cur - innerHeight * 0.4));
  }
});

// Clicking empty space beside the column opens the menu, as on the original.
let downOutside = false;
page.addEventListener('pointerdown', (e) => { downOutside = e.target === page; });
page.addEventListener('pointerup', (e) => {
  if (downOutside && e.target === page) openMenu(false);
  downOutside = false;
});

// ─── page show / hide (Resn: about_view.show / hide) ───────────────────────────────────────
const fadeEls = $$('[data-fade-in]', page);
const nameEl = $('.about__name', page);
const pageShards = $$('[data-shards]', page).map((el) => new Shards(el));
const menuShards = $$('[data-shards]', $('#menu')).map((el) => new Shards(el));
const allShards = [...pageShards, ...menuShards];

function showPage(first) {
  gsap.killTweensOf(fadeEls);
  if (reduced) {
    gsap.set([...fadeEls, nameEl], { autoAlpha: 1 });
    pageShards.forEach((s) => { s.base = 0.05; s.radius = 0.3; s.draw(); });
    return;
  }
  if (!first) gsap.to(nameEl, { autoAlpha: 1, duration: 0.6, ease: 'sine.inOut' });
  fadeEls.forEach((el, i) => gsap.to(el, { autoAlpha: 1, duration: 1.5, delay: 1 + i * 0.1, ease: 'sine.inOut' }));
  pageShards.forEach((s) => {
    const heading = s.el.dataset.shards === 'heading';
    showShards(s, heading ? 3.2 : 2.5, heading ? 0.7 : 0.2);
  });
}

function hidePage() {
  gsap.killTweensOf([...fadeEls, nameEl]);
  gsap.to([...fadeEls, nameEl], { autoAlpha: 0, duration: 0.3, ease: 'sine.out' });
  pageShards.forEach((s) => hideShards(s, 0.8));
}

// Hovering a shattered line pulls the shards in over it (the menu's own hover, borrowed).
pageShards.forEach((s) => {
  const settle = s.el.dataset.shards === 'heading' ? 0.5 : 0.8;
  s.el.addEventListener('pointerenter', () => !reduced && s.tween([{ radius: 0.3, duration: 0.5, ease: 'sine.out' }]));
  s.el.addEventListener('pointerleave', () => !reduced && s.tween([{ radius: settle, duration: 2, ease: 'expo.out' }]));
});

// ─── menu (Resn: menu route; the drop pulls back to a gem and starts to boil) ───────────────
const menu = $('#menu');
const menuBtn = $('#menuBtn');
let menuOpen = false;

function openMenu(byKeyboard) {
  if (menuOpen) return;
  menuOpen = true;
  document.body.classList.add('is-menu');
  menuBtn.setAttribute('aria-expanded', 'true');
  menuBtn.setAttribute('aria-label', 'Close menu');
  menu.hidden = false;
  page.inert = true;
  hidePage();
  gem.setMode('MENU');
  sound.blip(1);
  menuShards.forEach((s, i) => {
    if (reduced) { s.base = 0.05; s.radius = 0.3; s.draw(); return; }
    showShards(s, 1.6, 0.25 + i * 0.1);
  });
  if (byKeyboard) requestAnimationFrame(() => $('a', menu).focus({ preventScroll: true }));
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  document.body.classList.remove('is-menu');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.setAttribute('aria-label', 'Open menu');
  page.inert = false;
  gem.setMode('ABOUT');
  sound.blip(0);
  let left = menuShards.length;
  menuShards.forEach((s) => hideShards(s, reduced ? 0.01 : 0.6, () => { if (--left === 0 && !menuOpen) menu.hidden = true; }));
  showPage(false);
  menuBtn.focus({ preventScroll: true });
}

menuBtn.addEventListener('click', (e) => (menuOpen ? closeMenu() : openMenu(e.detail === 0)));
menu.addEventListener('click', (e) => {
  if (e.target === menu) closeMenu();
  const close = e.target.closest('[data-close]');
  if (close) { e.preventDefault(); closeMenu(); }
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') (menuOpen ? closeMenu() : openMenu(true));
});

// Menu hover: the word under the pointer closes up, the others scatter (Resn: menu_text_effect).
menuShards.forEach((s) => {
  const enter = () => {
    if (reduced) return;
    menuShards.forEach((o) => o.tween(o === s
      ? [{ radius: 0.3, duration: 0.5, ease: 'sine.out' }]
      : [{ radius: 1.4, duration: 0.7, ease: 'expo.out' }]));
  };
  const leave = () => {
    if (reduced) return;
    menuShards.forEach((o) => o.tween(o === s
      ? [{ radius: 1, duration: 2, ease: 'expo.out' }]
      : [{ radius: 1, duration: 3, ease: 'expo.out' }]));
  };
  s.el.addEventListener('pointerenter', enter);
  s.el.addEventListener('pointerleave', leave);
  s.el.addEventListener('focus', () => s.el.matches(':focus-visible') && enter());
  s.el.addEventListener('blur', leave);
});

// ─── sound: off until asked for. A low drone, made here with WebAudio ──────────────────────
const sound = {
  on: false,
  amp: 0.18,
  phase: 0,
  btn: $('#soundBtn'),
  icon: $('#soundBtn canvas'),
  build() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 0.8;
    filter.connect(master);
    [[55, 'triangle', 0.5], [82.41, 'sine', 0.35], [110.3, 'sine', 0.22], [164.2, 'sine', 0.08]].forEach(([f, type, g]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const v = ctx.createGain();
      v.gain.value = g;
      o.connect(v).connect(filter);
      o.start();
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const depth = ctx.createGain();
    depth.gain.value = 160;
    lfo.connect(depth).connect(filter.frequency);
    lfo.start();
    // Air: filtered noise, very quiet.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 0.6;
    const air = ctx.createGain();
    air.gain.value = 0.04;
    noise.connect(band).connect(air).connect(master);
    noise.start();
    this.ctx = ctx; this.master = master; this.filter = filter;
  },
  toggle() {
    this.on = !this.on;
    this.btn.setAttribute('aria-pressed', String(this.on));
    this.btn.setAttribute('aria-label', this.on ? 'Sound on' : 'Sound off');
    if (this.on) {
      if (!this.ctx) this.build();
      this.ctx.resume();
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.6);
    } else if (this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    }
  },
  // The drone opens up when the menu pulls the camera back, and closes when you dive in.
  blip(open) {
    if (!this.on || !this.ctx) return;
    this.filter.frequency.setTargetAtTime(open ? 900 : 380, this.ctx.currentTime, 0.5);
  },
  draw(dt) {
    const c = this.icon.getContext('2d');
    const W = this.icon.width, H = this.icon.height;
    this.amp += ((this.on ? 1 : 0.18) - this.amp) * frameK(0.08, dt);
    if (this.on && !reduced) this.phase += dt * 6;
    c.clearRect(0, 0, W, H);
    c.strokeStyle = '#fff';
    c.lineWidth = 2.6;
    c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i <= 24; i++) {
      const x = (i / 24) * (W - 4) + 2;
      const y = H / 2 + Math.sin(i * 0.52 + this.phase) * (H / 2 - 3) * this.amp * (0.55 + 0.45 * Math.sin(i * 0.26 - this.phase * 0.3));
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  },
};
sound.btn.addEventListener('click', () => sound.toggle());

// ─── loop ──────────────────────────────────────────────────────────────────────────────────
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const target = window.scrollY;
  scroll.cur = reduced ? target : scroll.cur + (target - scroll.cur) * frameK(0.1, dt);
  if (Math.abs(target - scroll.cur) < 0.05) scroll.cur = target;
  page.style.transform = `translate3d(0, ${(-scroll.cur).toFixed(2)}px, 0)`;

  for (const s of allShards) if (s.moving) s.draw(dt);
  sound.draw(dt);
  gem.render(dt, now);
  requestAnimationFrame(frame);
}

addEventListener('pointermove', (e) => { gem.mouse.x = e.clientX; gem.mouse.y = e.clientY; }, { passive: true });
addEventListener('resize', () => {
  scaleRoot();
  gem.resize();
  measure();
  allShards.forEach((s) => s.draw(0));
});

// ─── boot: loader bar, then the page and the drop together ─────────────────────────────────
async function boot() {
  const bar = $('#loaderBar');
  const step = (v) => gsap.to(bar, { scaleX: v, duration: 0.4, ease: 'power2.out' });
  gsap.set([...fadeEls], { autoAlpha: 0 });
  requestAnimationFrame(frame);
  step(0.2);
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (_) {}
  measure();
  allShards.forEach((s) => s.draw(0));
  step(0.55);
  await gem.init($('#gem'));
  step(1);
  await new Promise((r) => setTimeout(r, reduced ? 0 : 450));
  $('#loader').classList.add('is-done');
  gem.setMode('ABOUT');
  showPage(true);
}
// Anything that throws while starting still shows the page, without the drop if need be.
boot().catch((err) => {
  if (self.reportError) self.reportError(err); else console.error(err);
  $('#loader').classList.add('is-done');
  try { showPage(true); } catch (_) { gsap.set(fadeEls, { autoAlpha: 1 }); }
});
