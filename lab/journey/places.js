// The places between the work: the mountain the career climbs (a paper relief model, a sheet of card
// for every contour, with the trail, a flag a year and the camp where 2026 stands, so far), the three
// ways I work (a city with a pin dropped on one desk, the whole stack in four slabs, a chart of what
// finding the culprit first is worth) and the toolbox (every tool on a paper tag, a globe you can spin
// that sorts itself into shelves).
//
// A scene is { scene, camera, bg, ink, size(W, H, narrow), update(q, t, dt, o) }, as in works.js.
import * as THREE from 'three';
import { grainTexture, textTexture } from './comp.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const back = (t) => { t = clamp(t); const c = 1.70158 * 1.3; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SERIF = '"Instrument Serif", Georgia, serif', MONO = '"JetBrains Mono", ui-monospace, monospace', SANS = 'Inter, system-ui, sans-serif';
let GRAIN = null;
const grain = () => (GRAIN = GRAIN || grainTexture(256, 17));
const paper = (color, o = {}) => new THREE.MeshLambertMaterial({ color, map: grain(), ...o });

// a soft round puff, for cloud and glow
let PUFF = null;
function puffTexture() {
  if (PUFF) return PUFF;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (PUFF = t);
}
// the sky behind a scene: a gradient from its top to its foot
function backdrop(scene, top, mid, low) {
  const U = { cT: { value: new THREE.Color(top) }, cM: { value: new THREE.Color(mid) }, cL: { value: new THREE.Color(low) } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: U, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: `uniform vec3 cT, cM, cL; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() { vec3 c = vUv.y > 0.45 ? mix(cM, cT, smoothstep(0.45, 1.0, vUv.y)) : mix(cL, cM, smoothstep(0.0, 0.45, vUv.y));
        c += (hash(gl_FragCoord.xy) - 0.5) * 0.006; gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  }));
  m.frustumCulled = false; m.renderOrder = -10;
  scene.add(m);
  return U;
}
function framer(cam, shift = 0.14, up = 0.17) {
  return (W, H, narrow) => {
    cam.aspect = W / H;
    const base = cam.userData.fov || (cam.userData.fov = cam.fov);
    cam.fov = narrow ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) * Math.min(1.6, 1.25 / cam.aspect))) : base;
    cam.userData.k = narrow ? clamp(1.25 / cam.aspect / 1.6, 1, 1.7) : 1;
    if (narrow) cam.setViewOffset(W, H, 0, H * up, W, H);
    else cam.setViewOffset(W, H, -W * shift, 0, W, H);
    cam.updateProjectionMatrix();
  };
}
// aim, standing further back on a tall screen; remember the target so a drag can orbit round it
function aim(cam, look, orbit) {
  const k = cam.userData.k || 1;
  if (k !== 1) cam.position.sub(look).multiplyScalar(k).add(look);
  if (orbit && (orbit.x || orbit.y)) {
    const off = cam.position.clone().sub(look), sph = new THREE.Spherical().setFromVector3(off);
    sph.theta += orbit.x; sph.phi = clamp(sph.phi + orbit.y, 0.15, Math.PI / 2 - 0.02);
    cam.position.copy(look).add(off.setFromSpherical(sph));
  }
  cam.lookAt(look);
  cam.userData.look = look;
}
function light(scene, { key = '#fff4e2', keyI = 2.4, sky = '#cfe0ee', ground = '#2a2622', fill = 1.0, pos = [-6, 10, 6], shadows = 0, box = 9 }) {
  scene.add(new THREE.HemisphereLight(sky, ground, fill));
  const sun = new THREE.DirectionalLight(key, keyI);
  sun.position.set(...pos);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadows, shadows);
    const c = sun.shadow.camera; c.left = -box; c.right = box; c.top = box; c.bottom = -box; c.near = 1; c.far = 40;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  }
  scene.add(sun);
  return sun;
}
function labelSprite(text, w, o = {}) {
  const tex = textTexture(text, { w: o.tw || 512, h: o.th || 128, font: o.font || `500 46px ${MONO}`, color: o.color || '#1c2027', align: o.align || 'center', bg: o.bg || null, pad: o.pad || 0 });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest ?? true }));
  sp.scale.set(w, w * (o.th || 128) / (o.tw || 512), 1);
  return sp;
}
// a paper chip with a word on it, drawn once
function chipTexture(text, { fg = '#1c2027', bg = '#f2ede3', dot = null, w = 512, h = 112, font = `500 40px ${MONO}` } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), r = h / 2 - 6;
  x.fillStyle = bg; x.beginPath(); x.roundRect(4, 4, w - 8, h - 8, r); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 2; x.stroke();
  x.font = font; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillStyle = fg;
  let tx = w / 2;
  if (dot) { x.fillStyle = dot; x.beginPath(); x.arc(h * 0.62, h / 2, h * 0.11, 0, 7); x.fill(); x.fillStyle = fg; tx += h * 0.18; }
  x.fillText(text, tx, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/* ================================================================== the climb */
// The mountain as a paper relief: 28 sheets of card, each cut to one contour of a massif with two
// tops, the lower one the shoulder where the camp is. The trail winds up from the foot; a flag stands
// at each year, and the camera walks the trail with you. Above the camp the summit is in cloud.
const D = window.PORTFOLIO || {};
const PATH = D.path || [];
const ERAS = D.eras || [];
const NL = 28, DZ = 0.15;
// the massif: a height (0 to 1) at (x, z); the summit at S, the camp's shoulder at C
const S = [0.9, -1.1], C = [-0.55, 0.65];
function height(x, z) {
  const g = (cx, cz, r, h) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * r * r));
  // ridges run down from each top: the radius swells and pinches with the bearing from it
  const fan = (cx, cz, k) => { const a = Math.atan2(z - cz, x - cx); return 1 + 0.11 * Math.sin(a * 5 + k) + 0.07 * Math.sin(a * 8 + k * 2.3) + 0.04 * Math.sin(a * 13 + k * 0.7); };
  const a = Math.atan2(z, x), n = 1 + 0.08 * Math.sin(a * 3 + 1.2) + 0.05 * Math.sin(a * 7 + 0.4);
  return Math.max(g(S[0], S[1], 1.75 * fan(S[0], S[1], 0.3), 1.0), g(C[0], C[1], 1.95 * fan(C[0], C[1], 2.1), 0.76), g(0, 0, 3.3 * n, 0.36));
}
// the contours at level u: rays from a top, out to where the ground drops below u. Below the saddle
// one outline takes in both tops (from the summit, to the last point still above u); above it the
// summit and the shoulder are islands, each traced from its own top
function ray(o, u, a, last) {
  const dx = Math.cos(a), dz = Math.sin(a);
  let r = 0, hi = 8.1;
  for (let k = 1; k < 90; k++) {
    const rr = k * 0.09, up = height(o[0] + dx * rr, o[1] + dz * rr) >= u;
    if (up) r = rr; else if (!last) { hi = rr; break; }
  }
  if (last || hi < 8.1) { hi = Math.min(8.1, r + 0.09); for (let k = 0; k < 7; k++) { const m = (r + hi) / 2; if (height(o[0] + dx * m, o[1] + dz * m) >= u) r = m; else hi = m; } }
  return new THREE.Vector2(o[0] + dx * r, -(o[1] + dz * r));
}
let SADDLE = null;
function contours(u, n = 180) {
  if (SADDLE === null) { SADDLE = 1; for (let i = 0; i <= 60; i++) { const f = i / 60; SADDLE = Math.min(SADDLE, height(lerp(S[0], C[0], f), lerp(S[1], C[1], f))); } }
  const loop = (o, last) => { const pts = []; for (let i = 0; i < n; i++) pts.push(ray(o, u, (i / n) * Math.PI * 2, last)); return pts; };
  if (u <= SADDLE) return [loop(S, true)];
  const out = [loop(S, false)];
  if (height(C[0], C[1]) > u) out.push(loop(C, false));
  return out;
}
// the trail: from the foot, round the shoulder, up to the camp; then on toward the summit
const TRAIL = [[-3.9, 2.6], [-2.6, 3.1], [-1.4, 2.4], [-2.3, 1.5], [-1.2, 1.0], [-2.0, 0.2], [-1.0, -0.2], [-0.55, 0.65]];
const BEYOND = [[-0.55, 0.65], [0.1, 0.1], [0.4, -0.7], [0.9, -1.1]];
// where each year's flag stands, along the trail (0 to 1)
const CAMP_T = [0.0, 0.2, 0.42, 0.6, 0.78, 1.0];
// the walk starts at WALK[0] of the climb's scroll and takes WALK[1] of it (story.js times the years by it)
export const WALK = [0.2, 0.74];
function surface(x, z) { const h = height(x, z); return Math.max(0, Math.floor(h * NL)) * DZ; }
// a thread laid over the card: it rides the smooth slope, never below a sheet's top
function drape(x, z) { const h = height(x, z); return Math.max(surface(x, z), h * NL * DZ - DZ * 0.35); }

export function climbScene({ shadows = 0 } = {}) {
  const scene = new THREE.Scene();
  // mid-morning: the cover's dawn, an hour on
  backdrop(scene, '#7f98b8', '#d3d0d8', '#f1dccb');
  scene.fog = new THREE.Fog('#eadbd0', 15, 34);
  const sun = light(scene, { key: '#ffeedd', keyI: 2.3, sky: '#e6edf6', ground: '#6a7086', fill: 1.0, pos: [-8, 9, 5], shadows, box: 7 });
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);

  // the sheets of card, slate at the foot to cream at the top, every other one a shade darker
  const relief = new THREE.Group();
  const TONE = ['#7d879d', '#b9b6c4', '#e2d8d3', '#f5eee7', '#ffffff'].map((c) => new THREE.Color(c));
  const tone = (u) => { const x = clamp(u) * (TONE.length - 1), i = Math.min(TONE.length - 2, Math.floor(x)); return TONE[i].clone().lerp(TONE[i + 1], x - i); };
  for (let i = 1; i < NL; i++) {
    const u = i / NL;
    const g = new THREE.ExtrudeGeometry(contours(u).map((pts) => new THREE.Shape(pts)), { depth: DZ * 0.97, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    const c = tone(Math.pow(u, 0.8)); if (i % 2) c.multiplyScalar(0.955);
    const m = new THREE.Mesh(g, paper(c));
    m.position.y = (i - 1) * DZ;
    m.castShadow = m.receiveShadow = true;
    relief.add(m);
  }
  scene.add(relief);
  // the cloud the mountain stands in: soft puffs round its foot (they thin out near the lens)
  const NP = 150;
  const puffMat = new THREE.MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false, color: '#fbf3ec', opacity: 0.78, fog: true });
  const puffs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), puffMat, NP);
  const PU = [], R = rng(7);
  for (let i = 0; i < NP; i++) { const a = R() * Math.PI * 2, r = 4.4 + R() * 10, s = 1.6 + R() * 2.8; PU.push([Math.cos(a) * r, -0.15 + R() * 0.45, Math.sin(a) * r, s, R()]); }
  puffs.renderOrder = 2;
  scene.add(puffs);
  // a cap of cloud on the summit: above the camp, the climb isn't done
  const cap = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false, color: '#ffffff', opacity: 0.82, fog: false }), 30);
  const CU = [];
  for (let i = 0; i < 30; i++) { const a = R() * Math.PI * 2, r = R() * 1.4; CU.push([S[0] + Math.cos(a) * r, NL * DZ * (0.78 + R() * 0.3), S[1] + Math.sin(a) * r, 1.1 + R() * 1.5, R()]); }
  cap.renderOrder = 3;
  scene.add(cap);

  // the trail: a thread laid over the card
  const toV = ([x, z], lift = 0.05) => new THREE.Vector3(x, drape(x, z) + lift, z);
  const rough = new THREE.CatmullRomCurve3(TRAIL.map((p) => toV(p)), false, 'catmullrom', 0.4);
  const dense = rough.getSpacedPoints(500).map((p) => toV([p.x, p.z]));
  const trail = new THREE.CatmullRomCurve3(dense, false, 'centripetal');
  const trailU = { uDraw: { value: 0 }, uLen: { value: trail.getLength() }, cA: { value: new THREE.Color('#ff6a2b') }, cB: { value: new THREE.Color('#5e6880') } };
  const tube = new THREE.Mesh(new THREE.TubeGeometry(trail, 700, 0.02, 6, false), new THREE.ShaderMaterial({
    uniforms: trailU,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uDraw, uLen; uniform vec3 cA, cB; varying vec2 vUv;
      void main() {
        bool walked = vUv.x < uDraw;
        if (!walked && fract(vUv.x * uLen * 6.0) < 0.5) discard;
        gl_FragColor = vec4(walked ? cA : cB, 1.0);
        #include <colorspace_fragment>
      }`
  }));
  tube.castShadow = true;
  scene.add(tube);
  // the way on to the summit, faint and dotted
  const beyondR = new THREE.CatmullRomCurve3(BEYOND.map((p) => toV(p, 0.07)), false, 'catmullrom', 0.3);
  const beyond = new THREE.CatmullRomCurve3(beyondR.getSpacedPoints(240).map((p) => toV([p.x, p.z], 0.06)));
  const future = new THREE.Mesh(new THREE.TubeGeometry(beyond, 240, 0.014, 5, false), new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0.0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uA; varying vec2 vUv; void main() { if (fract(vUv.x * 46.0) < 0.55 || vUv.x > uA) discard; gl_FragColor = vec4(vec3(1.0, 0.98, 0.95), 1.0 - vUv.x * 0.5);
      #include <colorspace_fragment>
    }`,
    transparent: true, depthWrite: false
  }));
  scene.add(future);

  // a flag a year
  const flags = PATH.map((p, k) => {
    const g = new THREE.Group(), now = k === PATH.length - 1;
    const at = trail.getPointAt(CAMP_T[k] * 0.999);
    g.position.copy(at);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), paper('#2c3038'));
    pole.position.y = 0.25; pole.castShadow = true;
    const fg = new THREE.BufferGeometry();
    const seg = 8, vs = [], uv = [], ix = [];
    for (let i = 0; i <= seg; i++) { const s = i / seg; vs.push(s * 0.26, 0.49, 0, s * 0.26, 0.49 - 0.15 * (1 - s * 0.85), 0); uv.push(s, 1, s, 0); if (i < seg) { const a = i * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    fg.setAttribute('position', new THREE.Float32BufferAttribute(vs, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); fg.setIndex(ix); fg.computeVertexNormals();
    const cloth = new THREE.Mesh(fg, paper(now ? '#ff6a2b' : '#fbf7f0', { side: THREE.DoubleSide }));
    cloth.castShadow = true;
    const year = labelSprite(now ? `${p.y} · so far` : p.y, now ? 0.8 : 0.42, { font: `600 54px ${MONO}`, color: now ? '#ff6a2b' : '#262b33' });
    year.position.set(0.12, 0.66, 0);
    g.add(pole, cloth, year);
    g.scale.setScalar(0.001);
    scene.add(g);
    return { g, cloth, year, base: fg.attributes.position.array.slice(), at, now };
  });
  // the camp: a small tent, lit from inside
  const tent = new THREE.Group();
  const tg = new THREE.ConeGeometry(0.11, 0.13, 4, 1); tg.rotateY(Math.PI / 4);
  const tentM = new THREE.Mesh(tg, paper('#ff9a5c'));
  tentM.position.y = 0.065; tentM.castShadow = true;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: '#ffb070', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(0.55); glow.position.y = 0.07;
  const lamp = new THREE.PointLight('#ffab66', 1.2, 1.6, 2);
  lamp.position.y = 0.16;
  tent.add(tentM, glow, lamp);
  const campAt = flags.length ? flags[flags.length - 1].at : new THREE.Vector3();
  tent.position.set(campAt.x + 0.22, 0, campAt.z + 0.12);
  tent.position.y = surface(tent.position.x, tent.position.z);
  scene.add(tent);

  // what each year added, on paper tags round its flag
  const tags = [];
  const yearOf = (y) => ERAS.find((e) => e.id === y);
  PATH.forEach((p, k) => {
    const e = yearOf(p.y) || (k === PATH.length - 1 ? yearOf('2026') : null);
    const list = (e?.picked || []).slice(0, 5);
    list.forEach((name, j) => {
      const tex = chipTexture(name, { font: `500 38px ${MONO}`, w: 420, h: 96 });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      sp.renderOrder = 5;
      const a = -1.2 + j * 0.62, r = 0.7 + (j % 2) * 0.18;
      sp.userData = { k, j, off: new THREE.Vector3(Math.cos(a) * r, 0.42 + j * 0.15, Math.sin(a) * r * 0.6) };
      sp.material.opacity = 0;
      scene.add(sp);
      tags.push(sp);
    });
  });
  // the years to come: flags along the way to the summit, into the cloud (what's next)
  const nexts = [0, 1, 2, 3].map((k) => {
    const at = beyond.getPointAt(0.22 + k * 0.2);
    const g = new THREE.Group();
    g.position.copy(at);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 6), paper('#d9dee6'));
    pole.position.y = 0.2;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    cloth.position.set(0.1, 0.33, 0);
    g.add(pole, cloth);
    g.scale.setScalar(0.001);
    scene.add(g);
    return g;
  });

  // the camera's bearing round the mountain follows the trail, plus a slow turn of its own
  const AZ = [];
  { let prev = null, acc = 0; for (let i = 0; i <= 200; i++) { const p = trail.getPointAt(i / 200); let a = Math.atan2(p.z, p.x); if (prev !== null) { let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; acc += d; } else acc = a; prev = a; AZ.push(acc); } }
  // smooth the bearing so the camera never jerks round a hairpin
  const AZS = AZ.map((_, i) => { let s = 0, n = 0; for (let k = -18; k <= 18; k++) { const j = clamp(i + k, 0, 200); s += AZ[j]; n++; } return s / n; });
  const azi = (w) => { const x = clamp(w) * 200, i = Math.min(199, Math.floor(x)); return lerp(AZS[i], AZS[i + 1], x - i); };

  const ink = new THREE.Color('#ff6a2b');
  const look = new THREE.Vector3(), tmp = new THREE.Vector3(), M = new THREE.Matrix4(), Sc = new THREE.Vector3(), cpos = new THREE.Vector3(), lk = new THREE.Vector3();
  // the walk: how far up the trail you are at q, slowing at each flag
  function walk(q) {
    const s = clamp((q - WALK[0]) / WALK[1]);
    const n = CAMP_T.length - 1, x = s * n, i = Math.min(n - 1, Math.floor(x)), f = x - i;
    return lerp(CAMP_T[i], CAMP_T[i + 1], easeInOut(smooth(0.12, 0.88, f)));
  }
  const at = (q) => Math.round(clamp((q - WALK[0]) / WALK[1]) * (CAMP_T.length - 1));
  return {
    scene, camera, ink, bg: scene.background,
    size: framer(camera, 0.17),
    camp: at,
    // o.next: 0 to 1 through what's next (the camera at the camp, looking up the trail into the cloud)
    update(q, t, dt, o = {}) {
      const nx = o.next ?? -1, isNext = nx >= 0;
      const w = isNext ? 1 : walk(q);
      trailU.uDraw.value = isNext ? 1 : clamp(w + 0.003);
      future.material.uniforms.uA.value = isNext ? easeInOut(smooth(0.05, 0.7, nx)) : smooth(0.9, 1, q) * 0.15;
      // flags rise as the walk reaches them
      flags.forEach((f, k) => {
        const on = isNext ? 1 : back(smooth(CAMP_T[k] - 0.07, CAMP_T[k] + 0.01, w + 0.01));
        f.g.scale.setScalar(Math.max(0.001, on));
        const a = f.cloth.geometry.attributes.position, b = f.base;
        for (let i = 0; i < a.count; i++) { const s = b[i * 3] / 0.26; a.array[i * 3 + 2] = Math.sin(s * 5 - t * 4 + k) * 0.025 * s; }
        a.needsUpdate = true;
      });
      // the tags of the year you're at
      const k0 = isNext ? -1 : at(q);
      const near = isNext ? 0 : 1 - Math.min(1, Math.abs(w - CAMP_T[Math.max(0, k0)]) * 10);
      tags.forEach((sp) => {
        const { k, j, off } = sp.userData;
        const on = k === k0 ? back(clamp(near * 1.7 - j * 0.14)) : 0;
        sp.material.opacity = clamp(on);
        sp.position.copy(flags[k].at).add(off).add(tmp.set(0, Math.sin(t * 1.3 + j) * 0.02, 0));
        const s = 0.56 * Math.max(0.001, on);
        sp.scale.set(s, s * 96 / 420, 1);
        sp.visible = on > 0.01;
      });
      nexts.forEach((g, k) => g.scale.setScalar(Math.max(0.001, isNext ? back(smooth(0.12 + k * 0.13, 0.28 + k * 0.13, nx)) : 0)));
      glow.material.opacity = 0.7 + 0.3 * Math.sin(t * 2.1) * Math.sin(t * 1.3);
      // the camera: the whole mountain first, then round it, keeping the walker in front
      const wide = 1 - smooth(0.0, WALK[0] * 0.95, q);
      const p = trail.getPointAt(clamp(w));
      if (isNext) {
        // at the camp, looking past it up the way on, into the summit's cloud
        const s = easeInOut(nx);
        const dx = S[0] - campAt.x, dz = S[1] - campAt.z, dl = Math.hypot(dx, dz);
        cpos.set(campAt.x - dx / dl * lerp(5.4, 4.6, s), campAt.y + lerp(2.0, 1.5, s), campAt.z - dz / dl * lerp(5.4, 4.6, s));
        lk.set(lerp(campAt.x, campAt.x * 0.55 + S[0] * 0.45, s), lerp(campAt.y + 0.3, campAt.y + 0.8, s), lerp(campAt.z, campAt.z * 0.55 + S[1] * 0.45, s));
      } else {
        const a = azi(w) + w * 0.5 - 0.12, rc = Math.hypot(p.x, p.z) + 4.6;
        cpos.set(Math.cos(a) * rc, p.y + 2.5, Math.sin(a) * rc);
        lk.copy(p).add(tmp.set(0, 0.3, 0)).lerp(tmp.set(0, p.y * 0.9 + 0.3, 0), 0.3);
        const far = tmp.set(Math.cos(azi(0) - 0.12) * 13.5, 8.2, Math.sin(azi(0) - 0.12) * 13.5);
        cpos.lerp(far, easeInOut(wide));
        lk.lerp(new THREE.Vector3(0.1, 1.5, 0), easeInOut(wide));
      }
      camera.position.copy(cpos); look.copy(lk);
      aim(camera, look, o.orbit);
      // cloud drifts, faces you, and thins out where it would fill the lens
      const qc = camera.quaternion;
      PU.forEach(([x, y, z, s, r], i) => {
        tmp.set(x + Math.sin(t * 0.05 + r * 6) * 0.4, y, z);
        const d = tmp.distanceTo(camera.position);
        Sc.setScalar(s * smooth(1.5, 4.5, d)); M.compose(tmp, qc, Sc); puffs.setMatrixAt(i, M);
      });
      puffs.instanceMatrix.needsUpdate = true;
      CU.forEach(([x, y, z, s, r], i) => {
        tmp.set(x + Math.sin(t * 0.08 + r * 6) * 0.25, y, z);
        const d = tmp.distanceTo(camera.position);
        Sc.setScalar(s * (1 + 0.06 * Math.sin(t * 0.4 + r * 9)) * smooth(0.8, 2.6, d)); M.compose(tmp, qc, Sc); cap.setMatrixAt(i, M);
      });
      cap.instanceMatrix.needsUpdate = true;
    }
  };
}

/* ================================================================== how I work */
// Three set pieces in a row on one long sheet of paper; the camera trucks from one to the next.
//   1 go where the problem lives: a city in card, a pin drops on one desk, rings spread from it
//   2 ship the whole stack: four slabs, interface to infra, slide in and close up
//   3 put a number on it: three bars, how often each way names the right service first
export const HOW_X = [0, 10, 20];
export function howScene({ shadows = 0 } = {}) {
  const scene = new THREE.Scene();
  const bg = '#ebe5d8';
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 16, 34);
  const sun = light(scene, { key: '#fff6e8', keyI: 2.3, sky: '#ffffff', ground: '#b8ad99', fill: 1.2, pos: [-5, 10, 7], shadows, box: 10 });
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 90);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 60), paper('#e9e2d4'));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  floor.material.map = grain().clone(); floor.material.map.repeat.set(40, 18); floor.material.map.needsUpdate = true;
  scene.add(floor);
  sun.target.position.set(0, 0, 0); scene.add(sun.target);
  const R = rng(31);

  // 1 · the city
  const city = new THREE.Group(); city.position.x = HOW_X[0];
  const blocks = [];
  const BX = 9, BZ = 7;
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const tones = ['#f4efe6', '#e6dfd1', '#ddd5c5', '#f0e9dc'];
  for (let i = 0; i < BX; i++) for (let j = 0; j < BZ; j++) {
    if (R() < 0.12) continue;
    const h = 0.2 + Math.pow(R(), 2.2) * 1.6;
    const m = new THREE.Mesh(box, paper(tones[(i + j * 3) % 4]));
    m.scale.set(0.78, h, 0.78);
    m.position.set((i - (BX - 1) / 2) * 1.05, 0, (j - (BZ - 1) / 2) * 1.05);
    m.castShadow = m.receiveShadow = true;
    m.userData = { h, d: Math.hypot(i - 5, j - 3) };
    city.add(m); blocks.push(m);
  }
  // the desk: one block, where the problem is
  const target = blocks.reduce((a, b) => (Math.abs(b.position.x - 1.05) + Math.abs(b.position.z - 0) < Math.abs(a.position.x - 1.05) + Math.abs(a.position.z) ? b : a));
  target.material = paper('#ffd9c2');
  const pin = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), paper('#ff5a1f'));
  head.position.y = 0.62; head.castShadow = true;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.46, 18), paper('#ff5a1f'));
  cone.rotation.x = Math.PI; cone.position.y = 0.3; cone.castShadow = true;
  pin.add(head, cone);
  city.add(pin);
  const rings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), new THREE.MeshBasicMaterial({ color: '#ff5a1f', transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    city.add(m);
    return m;
  });
  scene.add(city);

  // 2 · the stack
  const stack = new THREE.Group(); stack.position.x = HOW_X[1];
  const LAYERS = [
    ['Interface', 'React · Three.js · GLSL', '#f8f2e8'],
    ['API', 'Node.js · WebSockets · LLM calls', '#eddcc4'],
    ['Data', 'PostgreSQL · MongoDB · search', '#dcc4a3'],
    ['Infra', 'Docker · Kubernetes · AWS', '#c6aa86']
  ];
  const slabs = LAYERS.map(([name, tools, col], k) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.46, 2.2), paper(col));
    m.castShadow = m.receiveShadow = true;
    // the layer's name and its tools, printed along its front edge
    const c = document.createElement('canvas'); c.width = 1536; c.height = 192;
    const x = c.getContext('2d');
    x.fillStyle = '#1f1c18'; x.font = `400 120px ${SERIF}`; x.textBaseline = 'middle'; x.fillText(name, 40, 104);
    x.fillStyle = '#6b5e4d'; x.font = `500 46px ${MONO}`; x.textAlign = 'right'; x.fillText(tools, 1500, 108);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.4375), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    front.position.set(0, 0, 1.101);
    g.add(m, front);
    g.userData = { k };
    stack.add(g);
    return g;
  });
  scene.add(stack);

  // 3 · the numbers
  const chart = new THREE.Group(); chart.position.x = HOW_X[2];
  const BARS = [[17, 'the service nearest the alert', '#d8cfbf'], [66.1, 'the usual dashboard guess', '#cbbfa9'], [98.9, 'Tracewise', '#62b6ff']];
  const bars = BARS.map(([v, name, col], k) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(box, paper(col));
    m.scale.set(0.9, 0.001, 0.9); m.castShadow = m.receiveShadow = true;
    const l = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: textTexture(name, { w: 1024, h: 256, font: `500 ${k === 2 ? 84 : 58}px ${k === 2 ? SANS : MONO}`, color: k === 2 ? '#1673c8' : '#5a5045' }), transparent: true }));
    l.rotation.x = -Math.PI / 2.6; l.position.set(0, 0.06, 0.8);
    const n = labelSprite(`${v}%`, 1.0, { font: `400 110px ${SERIF}`, color: k === 2 ? '#1673c8' : '#3b342b', th: 160 });
    g.add(m, l, n);
    g.position.set((k - 1) * 1.7, 0, 0);
    chart.add(g);
    return { g, m, n, v };
  });
  // a line at 100%: the ceiling
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: '#8c7f6b' }));
  ceil.position.set(0, 3.2, -0.6);
  chart.add(ceil);
  scene.add(chart);

  const ink = new THREE.Color('#ebe5d8');
  const look = new THREE.Vector3();
  // the camera's stop for each piece: offset from its centre, and where it looks
  const STOP = [
    { from: [3.5, 10.5, 9.5], to: [2.2, 3.0, 5.2], look: [1.05, 0.4, 0] },
    { from: [3.6, 4.2, 9.6], to: [2.8, 3.4, 8.6], look: [0, 1.3, 0] },
    { from: [2.4, 2.6, 10.4], to: [1.7, 2.35, 9.2], look: [0.35, 1.75, 0] }
  ];
  return {
    scene, camera, ink, bg: scene.background,
    size: framer(camera, 0.17),
    // which piece is in front at q
    piece: (q) => clamp(Math.round(q * 3 - 0.5), 0, 2),
    update(q, t, dt, o = {}) {
      // each piece has a third of the scroll; the camera dwells on it, then trucks on to the next
      const x = clamp(q) * 3, i = Math.min(2, Math.floor(x)), f = x - i;
      // (each piece starts to build while the camera is still on its way to it)
      const p = [0, 1, 2].map((k) => clamp(x - k + (k ? 0.28 : 0)));
      // 1 · the pin drops, and rings spread from the desk
      const pd = smooth(0.15, 0.45, p[0]);
      pin.position.set(target.position.x, target.userData.h * target.scale.y + lerp(4, 0, back(pd)), target.position.z);
      pin.visible = pd > 0.001;
      rings.forEach((r, k) => {
        const s = ((t * 0.5 + k / 3) % 1);
        r.position.set(target.position.x, 0.02, target.position.z);
        r.scale.setScalar(0.4 + s * 4.5);
        r.material.opacity = (1 - s) * 0.7 * smooth(0.4, 0.55, p[0]) * (1 - smooth(0.0, 0.4, p[1]));
      });
      // (and each piece clears away once the camera has gone on: the city sinks, the stack lifts off)
      const gone0 = smooth(0.35, 0.85, p[1]), gone1 = smooth(0.35, 0.85, p[2]);
      blocks.forEach((b) => { b.scale.y = b.userData.h * back(clamp((p[0] * 2.2 + 0.25) - b.userData.d * 0.08)) * (1 - gone0 * smooth(0, 1, 1.2 - b.userData.d * 0.12)); b.visible = b.scale.y > 0.002; });
      pin.visible = pin.visible && gone0 < 0.9;
      // 2 · the stack: from four sides, then closed up, then turning
      const pk = p[1];
      slabs.forEach((s, k) => {
        // each drops in from above, the bottom one first, then they close up into one block
        const inn = back(clamp(pk * 2.4 - (3 - k) * 0.2));
        const gap = lerp(0.42, 0.03, easeInOut(smooth(0.5, 0.78, pk)));
        const dirX = k % 2 ? 1 : -1;
        s.position.set(0, (3 - k) * (0.46 + gap) + 0.23 + (1 - inn) * 7 + Math.pow(gone1, 2) * (9 + k * 1.5), 0);
        s.rotation.y = (1 - inn) * dirX * 0.9 + Math.sin(t * 0.5 + k) * 0.04 * (1 - smooth(0.5, 0.78, pk));
        s.visible = inn > 0.002;
      });
      // 3 · the bars grow, in turn
      bars.forEach((b, k) => {
        const g = easeOut(smooth(0.02 + k * 0.12, 0.3 + k * 0.12, p[2]));
        const hgt = Math.max(0.001, b.v / 100 * 3.2 * g);
        b.m.scale.y = hgt;
        b.n.position.set(0, hgt + 0.32, 0);
        b.n.material.opacity = smooth(0.3, 0.8, g);
      });
      // the camera trucks along the row
      const k0 = i, k1 = Math.min(2, i + 1);
      const truck = easeInOut(smooth(0.72, 1.0, f));
      const at = (k, s) => { const st = STOP[k]; const v = new THREE.Vector3(...st.from).lerp(new THREE.Vector3(...st.to), easeInOut(s)); v.x += HOW_X[k]; return v; };
      const lk = (k) => new THREE.Vector3(...STOP[k].look).add(new THREE.Vector3(HOW_X[k], 0, 0));
      const s0 = smooth(0.0, 0.7, clamp(x - k0));
      camera.position.copy(at(k0, s0)).lerp(at(k1, 0), truck);
      look.copy(lk(k0)).lerp(lk(k1), truck);
      sun.position.set(look.x - 5, 10, 7); sun.target.position.copy(look); sun.target.updateMatrixWorld();
      aim(camera, look, o.orbit);
    }
  };
}

/* ================================================================== the toolbox */
// Every tool from data.js on a paper tag. They gather into a globe that turns (drag it), then sort
// themselves onto five shelves, one per kind of work.
export function toolsScene({ shadows = 0 } = {}) {
  const scene = new THREE.Scene();
  const bgC = '#101317';
  scene.background = new THREE.Color(bgC);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  const groups = (D.skills || []).map((g) => ({ name: g.group, items: g.items }));
  const HUE = ['#ffb547', '#62b6ff', '#4fe3c1', '#ff7ab6', '#c8ff4a'];
  // all the tags in one atlas, one draw
  const all = [];
  groups.forEach((g, gi) => g.items.forEach(([name, year, proof]) => all.push({ name, year, proof, gi })));
  const N = all.length, COLS = 4, CW = 512, CH = 112, ROWS = Math.ceil(N / COLS);
  const atlas = document.createElement('canvas'); atlas.width = CW * COLS; atlas.height = CH * ROWS;
  const ax = atlas.getContext('2d');
  all.forEach((it, k) => {
    const x0 = (k % COLS) * CW, y0 = Math.floor(k / COLS) * CH, r = CH / 2 - 8;
    ax.fillStyle = '#f2ede3'; ax.beginPath(); ax.roundRect(x0 + 6, y0 + 6, CW - 12, CH - 12, r); ax.fill();
    ax.fillStyle = HUE[it.gi]; ax.beginPath(); ax.arc(x0 + 44, y0 + CH / 2, 11, 0, 7); ax.fill();
    ax.fillStyle = '#16191e'; ax.font = `500 40px ${MONO}`; ax.textBaseline = 'middle'; ax.textAlign = 'left';
    let s = it.name; while (ax.measureText(s).width > CW - 110 && s.length > 3) s = s.slice(0, -2) + '…';
    ax.fillText(s, x0 + 72, y0 + CH / 2 + 2);
  });
  const tex = new THREE.CanvasTexture(atlas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const geo = new THREE.PlaneGeometry(1, CH / CW);
  const cell = new Float32Array(N * 2);
  all.forEach((_, k) => { cell[k * 2] = k % COLS; cell[k * 2 + 1] = Math.floor(k / COLS); });
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
  const glow = new Float32Array(N);
  geo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glow, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uGrid: { value: new THREE.Vector2(COLS, ROWS) }, uDim: { value: 0 } },
    vertexShader: `attribute vec2 aCell; attribute float aGlow; varying vec2 vUv; varying float vGlow; varying float vFace; uniform vec2 uGrid;
      void main() { vUv = (aCell + vec2(uv.x, 1.0 - uv.y)) / uGrid; vUv.y = 1.0 - vUv.y; vGlow = aGlow;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * vec3(0.0, 0.0, 1.0));
        vFace = dot(n, normalize(cameraPosition - w.xyz));
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uDim; varying vec2 vUv; varying float vGlow; varying float vFace;
      void main() { vec4 c = texture2D(uMap, vUv); if (c.a < 0.05) discard;
        float back = smoothstep(0.1, -0.3, vFace);
        c.rgb = mix(c.rgb, c.rgb * 0.35, back) * (1.0 - uDim * (1.0 - vGlow) * 0.55) + vGlow * vec3(0.18, 0.14, 0.06);
        gl_FragColor = vec4(c.rgb, c.a);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide, transparent: true
  });
  const tags = new THREE.InstancedMesh(geo, mat, N);
  tags.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(tags);
  // where each tag sits on the globe (a Fibonacci sphere), and on its shelf
  const R0 = 3.0;
  const sphere = all.map((_, k) => { const y = 1 - (k + 0.5) / N * 2, r = Math.sqrt(1 - y * y), a = k * 2.399963; return new THREE.Vector3(Math.cos(a) * r * R0, y * R0, Math.sin(a) * r * R0); });
  let SX = 1.72;
    // five shelves in a row; on a tall screen, three over two
  let shelf = [], headAt = [];
  function shelves(narrow) {
    const pos = (gi) => { const row = narrow && gi > 2 ? 1 : 0, col = narrow ? (row ? gi - 3 : gi) : gi, nc = narrow ? (row ? 2 : 3) : groups.length; return [(col - (nc - 1) / 2) * (narrow ? 2.15 : SX), row ? -1.2 : (narrow ? 3.5 : 1.55)]; };
    headAt = groups.map((_, gi) => { const [x, y] = pos(gi); return new THREE.Vector3(x, y + 0.5, 0); });
    shelf = all.map((it) => { const j = groups[it.gi].items.findIndex((x) => x[0] === it.name); const [x, y] = pos(it.gi); return new THREE.Vector3(x, y - j * 0.34, 0); });
  }
  shelves(false);
  const scatter = all.map((_, k) => { const R = rng(k + 3); return new THREE.Vector3((R() - 0.5) * 22, (R() - 0.5) * 14, -6 - R() * 18); });
  // the shelves' names
  const heads = groups.map((g, gi) => {
    const sp = labelSprite(g.name, 1.6, { font: `500 40px ${MONO}`, color: HUE[gi], th: 128 });
    sp.position.copy(headAt[gi]);
    sp.material.opacity = 0;
    scene.add(sp);
    return sp;
  });
  const spin = { a: 0.4, b: -0.25, va: 0, vb: 0 };
  const fr = framer(camera, 0.17, -0.1);
  let narrowNow = false;
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Qt = new THREE.Quaternion(), Qs = new THREE.Quaternion(), E = new THREE.Euler(), Sc = new THREE.Vector3(1, 1, 1);
  const look = new THREE.Vector3(0, 0, 0);
  let hover = -1;
  const ink = new THREE.Color('#ffb547');
  return {
    scene, camera, ink, bg: scene.background, all, tags,
    size(W, H, narrow) { fr(W, H, narrow); narrowNow = narrow; shelves(narrow); heads.forEach((h, gi) => h.position.copy(headAt[gi])); },
    hover(i) { hover = i; },
    // a drag turns the globe
    spinBy(dx, dy) { spin.va += dx; spin.vb += dy; },
    update(q, t, dt, o = {}) {
      const gather = easeOut(smooth(-0.1, 0.32, q)), sort = easeInOut(smooth(0.5, 0.8, q));
      // the globe turns by itself, and as you drag it; the drag runs on and slows
      spin.a += spin.va + dt * 0.18 * (1 - sort); spin.b += spin.vb;
      spin.va *= 0.92; spin.vb *= 0.92; spin.b = clamp(spin.b, -0.9, 0.9);
      E.set(spin.b * (1 - sort), spin.a * (1 - sort), 0);
      Qs.setFromEuler(E);
      const camQ = camera.quaternion;
      all.forEach((it, k) => {
        P.copy(sphere[k]).applyQuaternion(Qs);
        P.lerp(shelf[k], sort);
        P.lerpVectors(scatter[k], P, gather);
        // on the globe a tag faces out; on the shelf, it faces you
        const out = sphere[k].clone().applyQuaternion(Qs).normalize();
        Qt.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
        Qt.slerp(camQ, Math.max(sort, 0.72));
        const s = (k === hover ? 1.18 : 1) * (0.92 + 0.08 * gather) * lerp(1.12, narrowNow ? 1.6 : 1.42, sort);
        Sc.set(s, s, 1);
        M.compose(P, Qt, Sc);
        tags.setMatrixAt(k, M);
        glow[k] += ((k === hover ? 1 : 0) - glow[k]) * 0.2;
      });
      tags.instanceMatrix.needsUpdate = true;
      geo.attributes.aGlow.needsUpdate = true;
      mat.uniforms.uDim.value = hover >= 0 ? 1 : 0;
      heads.forEach((h, gi) => { h.material.opacity = smooth(0.62 + gi * 0.03, 0.78 + gi * 0.03, q); });
      camera.position.set(Math.sin(t * 0.1) * 0.3 * (1 - sort), 0.15 + (narrowNow ? sort * 1.0 : 0), lerp(9.6, narrowNow ? 8.8 : 12.2, sort));
      look.set(0, narrowNow ? sort * 1.0 : 0, 0);
      aim(camera, look, null);
    }
  };
}
