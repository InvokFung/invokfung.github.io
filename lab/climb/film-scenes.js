// The film's scenes: the cloud by the 2026 camp, then one small paper diorama for each project,
// each built from what the project really does (its real stages, services, sources, technicians,
// notes and layers, from the live figures and data.js). A scene is
//   { scene, camera, bg, update(q, t, dt), size(W, H, narrow) }
// where q is how far through the chapter's story the scroll is (0 to 1, a little past either end
// while it hands over) and t the clock, for what moves on its own.
import * as THREE from 'three';
import { grainTexture, textTexture } from './film-gl.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
// paper standing up: a little past upright, then settling (as on the homepage)
const stand = (t) => { t = clamp(t); const c = 1.2 * 1.525; return t < 0.5 ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2 : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2; };
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PAPER = '#ece6da';
const SERIF = '"Instrument Serif", Georgia, serif', MONO = '"JetBrains Mono", ui-monospace, monospace', SANS = 'Inter, system-ui, sans-serif';
let GRAIN = null;
const grain = () => (GRAIN = GRAIN || grainTexture(256, 11));

function paper(color = PAPER, o = {}) {
  const map = grain();
  return new THREE.MeshLambertMaterial({ color, map, ...o });
}
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function sheet(w, h, r, depth, mat) {
  const g = new THREE.ExtrudeGeometry(roundRect(w, h, r), { depth, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// a label lying on (or standing over) the floor
function label(text, w, o = {}) {
  const tex = textTexture(text, { w: 512, h: 128, font: o.font || `500 46px ${MONO}`, color: o.color || '#ece6da', align: o.align || 'center' });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: o.opacity ?? 1 }));
  if (o.flat !== false) m.rotation.x = -Math.PI / 2;
  return m;
}

// a label that always faces you
function tag(text, w, o = {}) {
  const tex = textTexture(text, { w: 512, h: 128, font: o.font || `500 46px ${MONO}`, color: o.color || '#ece6da' });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: o.opacity ?? 1 }));
  sp.scale.set(w, w / 4, 1);
  return sp;
}

// the stage every diorama stands on: a sheet of paper to the horizon, lit low from one side, so
// everything on it throws a long soft shadow
function stage({ bg, floor, key = '#fff0da', keyI = 2.6, fill = 0.9, sky = '#c9d4e0', ground = '#2a2420', keyPos = [-6, 9, 6], shadows }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 14, 34);
  const hemi = new THREE.HemisphereLight(sky, ground, fill);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(key, keyI);
  sun.position.set(...keyPos);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadows, shadows);
    const c = sun.shadow.camera; c.left = -9; c.right = 9; c.top = 7; c.bottom = -7; c.near = 1; c.far = 30;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  }
  scene.add(sun);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), paper(floor));
  fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true;
  const fm = fl.material; fm.map = grain().clone(); fm.map.repeat.set(24, 24); fm.map.needsUpdate = true;
  scene.add(fl);
  return { scene, sun, hemi, floor: fl };
}

// aim the camera; on a tall screen it stands further back, so the whole scene fits across
function pull(cam, look) {
  const k = cam.userData.k || 1;
  if (k !== 1) cam.position.sub(look).multiplyScalar(k).add(look);
  cam.lookAt(look);
}

// the camera, with the subject moved off-centre so the words have room: to the right on a wide
// screen, up on a tall one
function framer(cam, shift = 0.14, up = 0.17) {
  return (W, H, narrow) => {
    cam.aspect = W / H;
    // keep the same width of world in view on a tall screen
    const base = cam.userData.fov || (cam.userData.fov = cam.fov);
    cam.fov = narrow ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) * Math.min(1.6, 1.25 / cam.aspect))) : base;
    cam.userData.k = narrow ? clamp(1.25 / cam.aspect / 1.6, 1, 1.7) : 1;
    if (narrow) cam.setViewOffset(W, H, 0, H * up, W, H);
    else cam.setViewOffset(W, H, -W * shift, 0, W, H);
    cam.updateProjectionMatrix();
  };
}

/* ================================================================== the cloud by the camp */
// Flying through cloud: sheets of it rush past toward you as you scroll, lit by the camp's warm light
// below. The same cloud the homepage flies into, so the hand-over is seamless.
export function cloudScene() {
  const U = { uFly: { value: 0 }, uTime: { value: 0 }, uGlow: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) }, uLift: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: U, depthTest: false, depthWrite: false,
    vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
precision highp float;
uniform float uFly, uTime, uGlow, uLift;
uniform vec2 uRes;
in vec2 vUv;
out highp vec4 fragColor;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + 11.7; a *= 0.5; } return v; }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  float asp = uRes.x / uRes.y;
  vec2 s = (vUv - 0.5) * vec2(asp, 1.0);
  // the fog the homepage leaves you in, lighter above
  vec3 lo = vec3(0.373, 0.416, 0.471), hi = vec3(0.62, 0.66, 0.71);
  vec3 col = mix(lo, hi, smoothstep(-0.7, 0.6, s.y + uLift));
  vec3 warm = vec3(1.0, 0.66, 0.38);
  float n = floor(uFly * 6.0), f = fract(uFly * 6.0);
  for (int k = 0; k < 6; k++) {
    float z = (6.0 - float(k) - f) / 6.0;            // 1 far, 0 at your face
    float id = float(k) - n;
    float sc = z * 1.7 + 0.06;
    vec2 q = s * sc * 1.6 + vec2(id * 7.31, id * 3.17) + vec2(uTime * 0.012 * (1.0 + id * 0.1), 0.0);
    float d = fbm(q * 1.4);
    float a = smoothstep(0.42, 0.78, d) * smoothstep(0.0, 0.22, z) * smoothstep(1.0, 0.72, z);
    // lit from below by the camp, shaded on top
    float lit = smoothstep(0.35, 0.85, fbm(q * 1.4 + vec2(0.0, -0.09)));
    vec3 c = mix(lo * 0.82, hi * 1.15, lit);
    c += warm * uGlow * 0.32 * exp(-length(s - vec2(0.0, -0.35)) * 1.6) * (1.0 - lit * 0.5);
    col = mix(col, c, a * 0.8);
  }
  col += warm * uGlow * 0.42 * exp(-length(s * vec2(0.8, 1.0) - vec2(0.0, -0.32)) * 2.1);
  fragColor = vec4(lin(col), 1.0);
}`
  });
  const scene = new THREE.Scene();
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false;
  scene.add(q);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    scene, camera, U,
    update(fly, t) { U.uFly.value = fly; U.uTime.value = t; },
    size(W, H) { U.uRes.value.set(W, H); }
  };
}

/* ================================================================== 1 · Relay */
// Your app on the left, three model deployments on the right, and between them the gateway's nine
// stages, each a paper arch the requests pass through. One deployment goes down and folds over;
// the breaker trips and the stream bends to the other two, without a gap.
const STAGES = ['redact', 'screen', 'cache', 'route', 'breaker', 'hedge', 'budget', 'canary', 'audit'];
export function relayScene(o) {
  const color = new THREE.Color('#ffb547');
  const S = stage({ bg: '#15120f', floor: '#2a241d', key: '#ffe9cc', keyPos: [-5, 8, 7], shadows: o.shadows });
  const { scene } = S;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);

  // your app: a card with a conversation on it
  const app = new THREE.Group();
  const card = sheet(1.5, 1.05, 0.08, 0.05, paper('#f1ebdf'));
  app.add(card);
  const face = document.createElement('canvas'); face.width = 512; face.height = 360;
  { const x = face.getContext('2d'); x.fillStyle = '#f1ebdf'; x.fillRect(0, 0, 512, 360);
    x.fillStyle = '#1b1712'; x.font = `600 30px ${SANS}`; x.fillText('Support chat', 34, 56);
    x.fillStyle = 'rgba(27,23,18,0.12)'; x.fillRect(34, 76, 444, 2);
    const bub = (bx, by, bw, c) => { x.fillStyle = c; x.beginPath(); x.roundRect(bx, by, bw, 46, 18); x.fill(); };
    bub(34, 104, 300, 'rgba(27,23,18,0.12)'); bub(178, 168, 300, '#ffb547'); bub(34, 232, 250, 'rgba(27,23,18,0.12)'); bub(238, 296, 240, '#ffb547'); }
  const ft = new THREE.CanvasTexture(face); ft.colorSpace = THREE.SRGBColorSpace; ft.anisotropy = 4;
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 1.0), new THREE.MeshLambertMaterial({ map: ft }));
  fm.position.z = 0.027; app.add(fm);
  app.position.set(-4.3, 0.62, 0.1); app.rotation.y = 0.32;
  scene.add(app);
  const appL = tag('your app', 1.3, { font: `500 44px ${MONO}`, color: 'rgba(236,230,218,0.8)' }); appL.position.set(-4.3, 1.45, 0.1); scene.add(appL);

  // the gateway: nine arches, each a stage
  const archShape = new THREE.Shape();
  archShape.moveTo(-0.5, 0); archShape.lineTo(0.5, 0); archShape.lineTo(0.5, 1.0); archShape.lineTo(-0.5, 1.0); archShape.lineTo(-0.5, 0);
  const hole = new THREE.Path(); hole.moveTo(-0.3, 0); hole.lineTo(0.3, 0); hole.lineTo(0.3, 0.55); hole.absarc(0, 0.55, 0.3, 0, Math.PI, false); hole.lineTo(-0.3, 0);
  archShape.holes.push(hole);
  const archG = new THREE.ExtrudeGeometry(archShape, { depth: 0.07, bevelEnabled: false, curveSegments: 16 });
  archG.translate(0, 0, -0.035);
  const arches = STAGES.map((name, i) => {
    const m = new THREE.Mesh(archG, paper('#ece6da'));
    m.castShadow = m.receiveShadow = true;
    m.rotation.y = Math.PI / 2;
    m.position.set(-2.6 + i * 0.62, 0, 0);
    scene.add(m);
    const l = tag(name, 0.84, { font: `500 50px ${MONO}`, color: 'rgba(236,230,218,0.78)' });
    l.position.set(-2.6 + i * 0.62, 1.22 + (i % 2) * 0.2, 0);
    scene.add(l);
    return m;
  });

  // three deployments; each folds down about its base when it fails
  const TW = [[3.55, -1.65], [4.6, 0], [3.55, 1.65]], NAMES = ['us-east', 'eu-west', 'ap-south'];
  const towers = TW.map(([x, z], i) => {
    const pivot = new THREE.Group(); pivot.position.set(x + 0.36, 0, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 2.1, 0.72), paper('#efe8dc'));
    body.position.set(-0.36, 1.05, 0); body.castShadow = body.receiveShadow = true;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), new THREE.MeshBasicMaterial({ color: '#7dff9b' }));
    lamp.position.set(-0.36, 2.13, 0);
    pivot.add(body, lamp);
    scene.add(pivot);
    const l = tag(NAMES[i], 1.1, { font: `500 48px ${MONO}` }); l.position.set(x, 2.55, z); scene.add(l);
    return { pivot, body, lamp, top: new THREE.Vector3(x, 2.15, z) };
  });

  // the requests: paper chips on their way through
  const N = 64, chip = new THREE.BoxGeometry(0.2, 0.13, 0.04);
  const chips = new THREE.InstancedMesh(chip, new THREE.MeshLambertMaterial({ color: '#ffffff' }), N);
  chips.castShadow = true;
  scene.add(chips);
  const R = rng(3), seed = Array.from({ length: N }, () => [R(), R(), R()]);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), Sc = new THREE.Vector3(), E = new THREE.Euler();
  const white = new THREE.Color('#fff7ea'), red = new THREE.Color('#ff5d5d'), amber = color;
  const bez = (a, b, c, t, out) => out.set(lerp(lerp(a.x, b.x, t), lerp(b.x, c.x, t), t), lerp(lerp(a.y, b.y, t), lerp(b.y, c.y, t), t), lerp(lerp(a.z, b.z, t), lerp(b.z, c.z, t), t));
  const A = new THREE.Vector3(2.75, 0.5, 0), B = new THREE.Vector3();
  const look = new THREE.Vector3();

  return {
    scene, camera, bg: S.scene.background, ink: color,
    size: framer(camera, 0.12),
    update(q, t) {
      // us-east fails: it folds over, its lamp goes red, and the breaker arch flashes
      const down = smooth(0.3, 0.44, q);
      const tw = towers[0];
      tw.pivot.rotation.z = -Math.PI / 2 * stand(smooth(0.32, 0.5, q)) * 0.98;
      tw.lamp.material.color.set(down > 0.05 ? '#ff5d5d' : '#7dff9b');
      const brk = arches[4].material;
      brk.color.set(PAPER).lerp(red, Math.max(0, Math.sin(Math.PI * smooth(0.3, 0.56, q))) * 0.8);
      arches[3].material.color.set(PAPER).lerp(amber, 0.35 * smooth(0.4, 0.6, q));
      for (let k = 0; k < N; k++) {
        const [r0, r1, r2] = seed[k];
        const u = (t * 0.06 + k / N) % 1;
        // which deployment: the first third were bound for us-east; once it is down they go elsewhere
        let to = k % 3, fail = false;
        if (to === 0 && down > r1) to = r2 < 0.5 ? 1 : 2;
        if (k % 3 === 0 && down > 0.05 && down < 0.95 && r1 > down && u > 0.62) fail = true;
        if (u < 0.62) {
          const s = u / 0.62;
          P.set(lerp(-3.7, 2.75, s), 0.5 + Math.sin(s * 40 + r0 * 6) * 0.012, (r0 - 0.5) * 0.08);
          E.set(0, 0, Math.sin(s * 30 + r1 * 9) * 0.12);
        } else {
          const s = (u - 0.62) / 0.38, T = towers[to].top;
          B.set(lerp(A.x, T.x, 0.5), 2.3, lerp(A.z, T.z, 0.65));
          bez(A, B, T, s, P);
          if (fail) P.y -= s * s * 1.6;
          E.set(0, Math.atan2(T.z - A.z, T.x - A.x) * -1, -0.4 + s * 0.6);
        }
        Q.setFromEuler(E);
        const sz = u > 0.96 ? (1 - u) / 0.04 : u < 0.03 ? u / 0.03 : 1;
        Sc.setScalar(sz);
        M.compose(P, Q, Sc);
        chips.setMatrixAt(k, M);
        chips.setColorAt(k, fail ? red : (to === 0 ? white : k % 7 === 0 ? amber : white));
      }
      chips.instanceMatrix.needsUpdate = true; chips.instanceColor.needsUpdate = true;
      // the camera walks along the gateway, from in front and to the left, so the arches show their faces
      const c = clamp(q, -0.3, 1.3);
      camera.position.set(lerp(-8.6, -6.4, c), lerp(5.4, 4.6, c), lerp(9.6, 10.4, c));
      look.set(lerp(0.2, 1.3, c), 1.45, 0);
      pull(camera, look);
    }
  };
}

/* ================================================================== 2 · Tracewise */
// The checkout's eleven services as paper discs on threads, calls running down the threads. One
// service deep in the graph slows down; the slowness climbs to the gateway, which pages. A walk
// from the alert follows the slow calls down to the one at fault, and a ring of ink closes round it.
const SV = [['gateway', 0], ['auth', 1], ['orders', 1], ['catalog', 1], ['payments', 2], ['inventory', 2], ['notify', 2], ['card-api', 3], ['postgres', 3], ['redis', 3], ['kafka', 3]];
const EDGES = [[0, 1], [0, 2], [0, 3], [2, 4], [2, 5], [2, 6], [4, 7], [4, 8], [5, 8], [5, 9], [3, 9], [1, 9], [6, 10]];
export function traceScene(o) {
  const color = new THREE.Color('#62b6ff');
  const S = stage({ bg: '#0e1217', floor: '#1a2028', key: '#eaf3ff', sky: '#cfe0f5', ground: '#141820', keyPos: [-4, 9, 8], shadows: o.shadows });
  const { scene } = S;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  // a paper wall behind, to catch the shadows
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), paper('#1d242d'));
  wall.position.set(0, 8, -2.6); wall.receiveShadow = true; scene.add(wall);

  const layerX = [-3.6, -1.3, 1.0, 3.3], counts = [1, 3, 3, 4], seen = [0, 0, 0, 0];
  const R = rng(9);
  const nodes = SV.map(([name, L], i) => {
    const n = counts[L], k = seen[L]++;
    const y = 1.75 + (k - (n - 1) / 2) * 0.98, z = (R() - 0.5) * 1.1;
    const g = new THREE.Group(); g.position.set(layerX[L] + (R() - 0.5) * 0.3, y, z);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.07, 48), paper(PAPER));
    disc.rotation.x = Math.PI / 2; disc.castShadow = true; disc.receiveShadow = true;
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.185), new THREE.MeshBasicMaterial({ map: textTexture(name, { w: 512, h: 128, font: `600 76px ${SANS}`, color: '#141922' }), transparent: true, depthWrite: false }));
    nm.position.z = 0.045;
    g.add(disc, nm);
    // a thread from above, as if each hangs
    const th = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 6, 4), new THREE.MeshBasicMaterial({ color: '#2a333e' }));
    th.position.y = 3.42; g.add(th);
    scene.add(g);
    return { name, g, disc, heat: 0, pos: g.position };
  });
  const curves = EDGES.map(([a, b]) => {
    // (behind the discs, so the names stay clear)
    const A = nodes[a].pos.clone().setZ(nodes[a].pos.z - 0.08), B = nodes[b].pos.clone().setZ(nodes[b].pos.z - 0.08), mid = A.clone().lerp(B, 0.5); mid.z -= 0.45;
    const c = new THREE.QuadraticBezierCurve3(A, mid, B);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(c, 28, 0.014, 5), new THREE.MeshLambertMaterial({ color: '#9aa7b6' }));
    tube.castShadow = true;
    scene.add(tube);
    return { c, tube, a, b };
  });
  // calls running down the threads
  const PER = 4, pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), EDGES.length * PER);
  scene.add(pulses);
  // the alert over the gateway, and the ring round the culprit
  const alert = label('ALERT', 1.5, { flat: false, font: `700 84px ${MONO}`, color: '#ff5d5d' });
  alert.position.copy(nodes[0].pos).add(new THREE.Vector3(0, 0.78, 0.1)); scene.add(alert);
  const ringU = { uP: { value: 0 }, uC: { value: new THREE.Color('#ff5d5d') }, uT: { value: 0 } };
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.ShaderMaterial({
    uniforms: ringU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uP, uT; uniform vec3 uC; varying vec2 vUv;
      float h(float x){ return fract(sin(x * 91.7) * 43758.5); }
      float n(float x){ float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
      void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x) / 6.2832 + 0.5;
        a = fract(a - 0.3);
        float rr = 0.78 + (n(a * 14.0 + 3.0) - 0.5) * 0.06 + a * 0.05;
        float w = 0.035 + 0.025 * n(a * 30.0);
        float stroke = smoothstep(w, w * 0.4, abs(r - rr)) * step(a, uP * 1.06);
        if (stroke < 0.01) discard;
        gl_FragColor = vec4(uC, stroke); }`
  }));
  ring.position.copy(nodes[7].pos).add(new THREE.Vector3(0, 0, 0.08)); scene.add(ring);

  const M = new THREE.Matrix4(), P = new THREE.Vector3(), I = new THREE.Quaternion(), Sc = new THREE.Vector3();
  const paperC = new THREE.Color(PAPER), amber = new THREE.Color('#ffb547'), red = new THREE.Color('#ff5d5d');
  const PATH = [1, 3, 6]; // the walk: gateway → orders → payments → card-api (edges 1, 3, 6)
  const look = new THREE.Vector3(), from = new THREE.Vector3();
  const pos = Array(EDGES.length * PER).fill(0).map((_, k) => (k % PER) / PER);
  return {
    scene, camera, bg: S.scene.background, ink: color,
    size: framer(camera, 0.12),
    update(q, t, dt) {
      const heat = [smooth(0.42, 0.56, q), 0, smooth(0.36, 0.5, q) * 0.55, 0, smooth(0.3, 0.44, q) * 0.7, 0, 0, smooth(0.2, 0.36, q), 0, 0, 0];
      nodes.forEach((n, i) => {
        const h = heat[i], c = n.disc.material.color;
        c.copy(paperC).lerp(amber, clamp(h * 1.6)).lerp(red, clamp(h * 1.6 - 0.6));
        if (i === 0 && h > 0.5) c.lerp(red, 0.3 + 0.3 * Math.sin(t * 6));
      });
      alert.material.opacity = smooth(0.44, 0.54, q) * (0.75 + 0.25 * Math.sin(t * 6));
      // calls slow down on the way into whatever is slow
      for (let e = 0; e < EDGES.length; e++) {
        const slow = Math.max(heat[EDGES[e][1]], 0), sp = (0.5 - 0.42 * slow) * (dt || 0);
        for (let k = 0; k < PER; k++) {
          const j = e * PER + k;
          pos[j] = (pos[j] + sp) % 1;
          // calls into a slow service bunch up at its door
          const u = slow > 0.2 ? 1 - Math.pow(1 - pos[j], 1 + slow * 3) : pos[j];
          curves[e].c.getPoint(u, P);
          Sc.setScalar(Math.sin(Math.PI * u) * 1.1 + 0.1);
          M.compose(P, I, Sc);
          pulses.setMatrixAt(j, M);
        }
      }
      pulses.instanceMatrix.needsUpdate = true;
      // the walk, lighting the threads it takes
      const w = smooth(0.54, 0.76, q) * 3;
      curves.forEach((cv, e) => {
        const k = PATH.indexOf(e), lit = k < 0 ? 0 : clamp(w - k);
        cv.tube.material.color.set('#9aa7b6').lerp(color, lit);
        cv.tube.material.emissive.copy(color).multiplyScalar(lit * 0.6);
      });
      ringU.uP.value = smooth(0.72, 0.9, q); ringU.uT.value = t;
      // the camera leans in on the culprit at the end
      const c = clamp(q, -0.3, 1.3), push = smooth(0.66, 1.0, q);
      from.set(lerp(-1.4, 0.4, c), lerp(2.9, 2.5, c), lerp(14.2, 13.2, c));
      camera.position.copy(from).lerp(nodes[7].pos.clone().add(new THREE.Vector3(-1.6, 0.5, 6.4)), push * 0.5);
      look.set(lerp(-0.2, 0.2, c), 1.75, 0).lerp(nodes[7].pos, push * 0.55);
      pull(camera, look);
    }
  };
}

/* ================================================================== 3 · Onboard */
// Three systems' exports, each a messy pile of cards: the same people under different spellings
// (Robert Chan, Bob Chan, CHAN R.). The cards fly into one table, the same person's cards land on
// one another and merge into a single clean record.
const FIRST = [['Robert', 'Bob'], ['Christopher', 'Chris'], ['Katherine', 'Kate'], ['William', 'Will'], ['Benjamin', 'Ben'], ['Thomas', 'Tom'], ['Elizabeth', 'Liz'], ['Jennifer', 'Jen'], ['Michael', 'Mike'], ['Samantha', 'Sam'], ['Daniel', 'Dan'], ['Rebecca', 'Becky'], ['Anthony', 'Tony'], ['Margaret', 'Maggie'], ['Jonathan', 'Jon'], ['Victoria', 'Vicky'], ['Matthew', 'Matt'], ['Patricia', 'Pat'], ['Nicholas', 'Nick'], ['Alexandra', 'Alex'], ['Stephen', 'Steve'], ['Catherine', 'Cathy']];
const LAST = ['Chan', 'Wong', 'Lee', 'Cheung', 'Lau', 'Ng', 'Ho', 'Tsang', 'Leung', 'Yip', 'Kwok', 'Lam', 'Tang', 'Chow', 'Mak', 'Siu'];
const SRC = [['CRM', '#f1ebdf', '#4fe3c1'], ['BILL', '#efe2cf', '#ffb547'], ['DESK', '#e2e8ee', '#62b6ff']];
export function onboardScene(o) {
  const color = new THREE.Color('#4fe3c1');
  const S = stage({ bg: '#0d1413', floor: '#18221f', key: '#f2fffb', sky: '#d8f5ee', ground: '#101816', keyPos: [-5, 10, 5], shadows: o.shadows });
  const { scene } = S;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  const R = rng(17), COLS = 7, ROWS = 4, PEOPLE = COLS * ROWS;
  const people = Array.from({ length: PEOPLE }, (_, i) => { const [f, n] = FIRST[i % FIRST.length], l = LAST[(i * 7 + 3) % LAST.length]; return { f, n, l }; });
  const recs = [];
  people.forEach((p, i) => {
    const has = [R() < 0.85, R() < 0.7, R() < 0.6];
    if (!has.some(Boolean)) has[(R() * 3) | 0] = true;
    has.forEach((h, s) => { if (h) recs.push({ p: i, s }); });
  });
  // every card's face, in one atlas
  const CW = 256, CH = 144, AC = 8, AR = Math.ceil(recs.length / AC);
  const atlas = document.createElement('canvas'); atlas.width = CW * AC; atlas.height = CH * AR;
  const x = atlas.getContext('2d');
  recs.forEach((r, k) => {
    const cx = (k % AC) * CW, cy = ((k / AC) | 0) * CH, p = people[r.p], [src, bgc, tag] = SRC[r.s];
    x.fillStyle = bgc; x.fillRect(cx, cy, CW, CH);
    x.fillStyle = tag; x.fillRect(cx + 16, cy + 16, 54, 20);
    x.fillStyle = '#16211e'; x.font = `600 13px ${MONO}`; x.fillText(src, cx + 22, cy + 31);
    const name = r.s === 0 ? `${p.f} ${p.l}` : r.s === 1 ? `${p.n} ${p.l}` : `${p.l.toUpperCase()} ${p.f[0]}.`;
    x.font = `400 30px ${SERIF}`; x.fillText(name, cx + 16, cy + 78);
    x.font = `400 14px ${MONO}`; x.fillStyle = 'rgba(22,33,30,0.6)';
    const mail = (r.s === 2 ? p.n : p.f).toLowerCase() + '.' + p.l.toLowerCase() + '@' + ['mail.com', 'corp.co', 'inbox.io'][r.s];
    x.fillText(r.s === 1 ? `+852 ${String(51000000 + r.p * 7919).slice(0, 4)} ${String(r.p * 131 + 1000).slice(0, 4)}` : mail, cx + 16, cy + 108);
    x.fillStyle = 'rgba(22,33,30,0.15)'; x.fillRect(cx + 16, cy + 122, CW - 32, 2);
  });
  const atex = new THREE.CanvasTexture(atlas); atex.colorSpace = THREE.SRGBColorSpace; atex.anisotropy = 8;
  // a card: its face from the atlas by a per-card offset, lit simply, with an edge that lights up
  // when it has merged
  const g = new THREE.PlaneGeometry(1.0, 0.5625);
  g.rotateX(-Math.PI / 2);
  const cell = new Float32Array(recs.length * 2), glow = new Float32Array(recs.length);
  recs.forEach((r, k) => { cell[k * 2] = (k % AC) / AC; cell[k * 2 + 1] = 1 - (((k / AC) | 0) + 1) / AR; });
  g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
  const glowA = new THREE.InstancedBufferAttribute(glow, 1); glowA.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aGlow', glowA);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: atex }, uScale: { value: new THREE.Vector2(1 / AC, 1 / AR) }, uInk: { value: color }, uLight: { value: new THREE.Vector3(-0.4, 0.85, 0.35).normalize() } },
    vertexShader: `attribute vec2 aCell; attribute float aGlow; varying vec2 vUv; varying vec2 vLoc; varying float vGlow; varying vec3 vN; uniform vec2 uScale;
      void main(){ vLoc = uv; vUv = aCell + uv * uScale; vGlow = aGlow; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uInk, uLight; varying vec2 vUv; varying vec2 vLoc; varying float vGlow; varying vec3 vN;
      void main(){ vec3 c = texture2D(map, vUv).rgb; float l = 0.62 + 0.42 * max(dot(normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0), uLight), 0.0);
        if (!gl_FrontFacing) c = vec3(0.86, 0.83, 0.78);
        vec2 e = min(vLoc, 1.0 - vLoc) * vec2(1.0, 0.5625); float edge = 1.0 - smoothstep(0.0, 0.025, min(e.x, e.y));
        c = mix(c * l, uInk, edge * vGlow);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide
  });
  const cards = new THREE.InstancedMesh(g, mat, recs.length);
  scene.add(cards);
  // a soft shadow under each pile, then under the table
  const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const y = c.getContext('2d'); const gr = y.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); y.fillStyle = gr; y.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const pileX = [-3.4, 0, 3.4];
  const pileShadows = pileX.map((px) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(px, 0.003, 0); scene.add(m); return m; });
  const tableShadow = new THREE.Mesh(new THREE.PlaneGeometry(10, 5.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0 }));
  tableShadow.rotation.x = -Math.PI / 2; tableShadow.position.y = 0.003; scene.add(tableShadow);
  const tags = SRC.map(([s], i) => { const l = label(s, 1.4, { font: `600 54px ${MONO}`, color: SRC[i][2] }); l.position.set(pileX[i], 0.005, 1.55); scene.add(l); return l; });

  // where each card starts (in its system's pile) and ends (on its person's place in the table)
  const count = new Array(PEOPLE).fill(0), first = new Array(PEOPLE).fill(-1);
  recs.forEach((r, k) => {
    r.from = new THREE.Vector3(pileX[r.s] + (R() - 0.5) * 2.0, 0.02 + k * 0.0016, (R() - 0.5) * 1.6);
    r.rot0 = (R() - 0.5) * 1.6;
    r.order = count[r.p]++;
    if (first[r.p] < 0) first[r.p] = k;
    const col = r.p % COLS, row = (r.p / COLS) | 0;
    r.to = new THREE.Vector3((col - (COLS - 1) / 2) * 1.16, 0.02, (row - (ROWS - 1) / 2) * 0.7 + 0.2);
    r.delay = 0.24 + R() * 0.26;
    r.spin = R() < 0.5 ? -1 : 1;
  });
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Sc = new THREE.Vector3();
  const look = new THREE.Vector3();
  return {
    scene, camera, bg: S.scene.background, ink: color,
    size: framer(camera, 0.17),
    update(q, t) {
      const merge = smooth(0.74, 0.88, q);
      recs.forEach((r, k) => {
        const f = easeInOut((q - r.delay) / 0.24);
        // the piles breathe a little before they go
        const idle = 1 - f;
        P.copy(r.from).lerp(r.to, f);
        P.y = lerp(r.from.y, 0.03 + r.order * 0.03, f) + Math.sin(Math.PI * f) * (0.7 + r.order * 0.15) + idle * Math.sin(t * 0.8 + k) * 0.01;
        // the same person's cards stack, then merge into the first
        const extra = r.order > 0;
        if (extra) P.y += merge * -r.order * 0.03;
        E.set(Math.sin(Math.PI * f) * 0.5 * r.spin, lerp(r.rot0, 0, f), r.spin * Math.PI * 2 * f);
        Q.setFromEuler(E);
        const s = extra ? 1 - smooth(0.82, 0.9, q) : 1 + merge * 0.06;
        Sc.set(s, 1, s);
        M.compose(P, Q, Sc);
        cards.setMatrixAt(k, M);
        glow[k] = extra ? 0 : merge;
      });
      cards.instanceMatrix.needsUpdate = true; glowA.needsUpdate = true;
      const gone = smooth(0.24, 0.5, q);
      pileShadows.forEach((m) => (m.material.opacity = 1 - gone));
      tags.forEach((m) => (m.material.opacity = 1 - smooth(0.2, 0.36, q)));
      tableShadow.material.opacity = smooth(0.55, 0.8, q) * 0.9;
      const c = clamp(q, -0.3, 1.3);
      camera.position.set(lerp(-0.8, 0.4, c), lerp(9.6, 10.2, c), lerp(9.4, 7.6, c));
      look.set(lerp(-0.2, 0.2, c), 0.2, lerp(0.1, 0.35, c));
      pull(camera, look);
    }
  };
}

/* ================================================================== 4 · Dispatch */
// The day's map as a paper model on a table: a city cut by a river with two bridges, laser-cut hills
// at its corners, five technicians and their routes. One goes home sick at nine; the real planner
// (the same code as the live figure) re-plans the day, and the routes draw again.
export function dispatchScene(o) {
  const color = new THREE.Color('#ff7ab6');
  const S = stage({ bg: '#140e12', floor: '#251b21', key: '#fff1f6', sky: '#f3dce6', ground: '#160f13', keyPos: [-6, 10, 4], shadows: o.shadows });
  const { scene } = S;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  const MW = 10, MH = 6.2, SPLIT = 0.56, BR = [0.27, 0.73];
  const X = (fx) => (fx - 0.5) * MW, Z = (fy) => (fy - 0.5) * MH;
  // the map: streets, blocks, the river and its bridges
  const c = document.createElement('canvas'); c.width = 2048; c.height = Math.round(2048 * MH / MW);
  { const x = c.getContext('2d'), w = c.width, h = c.height, r = rng(5);
    x.fillStyle = '#ece5d8'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const bx = r() * w, by = r() * h; x.fillStyle = `rgba(60,40,50,${0.04 + r() * 0.05})`; x.fillRect(bx, by, 30 + r() * 70, 24 + r() * 50); }
    x.strokeStyle = 'rgba(60,40,50,0.16)'; x.lineWidth = 3;
    for (let gx = 0; gx < w; gx += 92) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, h); x.stroke(); }
    for (let gy = 0; gy < h; gy += 92) { x.beginPath(); x.moveTo(0, gy); x.lineTo(w, gy); x.stroke(); }
    x.fillStyle = '#8fb3cf'; x.fillRect(SPLIT * w - 34, 0, 68, h);
    x.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 40; i++) x.fillRect(SPLIT * w - 20 + r() * 40, r() * h, 2, 18);
    x.fillStyle = '#ece5d8'; for (const b of BR) x.fillRect(SPLIT * w - 44, b * h - 16, 88, 32);
    x.strokeStyle = 'rgba(60,40,50,0.5)'; x.lineWidth = 3; for (const b of BR) { x.strokeRect(SPLIT * w - 44, b * h - 16, 88, 32); } }
  const mt = new THREE.CanvasTexture(c); mt.colorSpace = THREE.SRGBColorSpace; mt.anisotropy = 8;
  const map = new THREE.Mesh(new THREE.BoxGeometry(MW, 0.06, MH), [paper('#ddd5c6'), paper('#ddd5c6'), new THREE.MeshLambertMaterial({ map: mt }), paper('#ddd5c6'), paper('#ddd5c6'), paper('#ddd5c6')]);
  map.position.y = 0.03; map.receiveShadow = true; map.castShadow = true; scene.add(map);
  // hills at two corners: stacked paper contours
  const R = rng(21);
  for (const [hx, hz, n] of [[-MW / 2 - 0.6, -MH / 2 - 0.3, 7], [MW / 2 + 0.7, MH / 2 + 0.2, 6]]) {
    for (let k = 0; k < n; k++) {
      const s = new THREE.Shape(), rad = 2.4 - k * 0.3, seg = 40;
      for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, rr = rad * (1 + 0.16 * Math.sin(a * 3 + k * 0.7 + hx) + 0.08 * Math.sin(a * 5 + R() * 0.3)); i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      const gg = new THREE.ExtrudeGeometry(s, { depth: 0.09, bevelEnabled: false }); gg.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(gg, paper(k % 2 ? '#e6dccd' : '#d9cebd')); m.position.set(hx + k * 0.08, k * 0.09, hz - k * 0.05); m.castShadow = m.receiveShadow = true; scene.add(m);
    }
  }
  // the real planner, from the live figure
  const F = window.Figs?.Dispatch;
  const fig = F ? new F({ color: '#ff7ab6', fx: () => {} }) : null;
  const techs = fig ? fig.techs : [];
  const jobs = fig ? fig.jobs.map((j) => ({ x: j.x, y: j.y })) : [];
  const planA = techs.map((t) => t.route.slice());
  const SICK = 1; // Sam
  if (fig) fig.sendHome(fig.techs[SICK]);
  const planB = techs.map((t) => t.route.slice());
  const west = (p) => p.x < SPLIT;
  const legPts = (a, b) => {
    if (west(a) === west(b)) return [a, { x: b.x, y: a.y }, b];
    let by = BR[0], best = Infinity;
    for (const y of BR) { const d = Math.abs(a.y - y) + Math.abs(b.y - y); if (d < best) { best = d; by = y; } }
    return [a, { x: a.x, y: by }, { x: b.x, y: by }, b];
  };
  // a route as a flat ribbon with the distance along it, so it can be drawn as far as wanted
  const ribbonMat = (col) => new THREE.ShaderMaterial({
    uniforms: { uDraw: { value: 0 }, uC: { value: new THREE.Color(col) }, uA: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'attribute float aD; varying float vD; void main(){ vD = aD; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uDraw, uA; uniform vec3 uC; varying float vD; void main(){ if (vD > uDraw) discard; gl_FragColor = vec4(uC, uA * (0.85 + 0.15 * smoothstep(uDraw - 0.3, uDraw, vD))); }'
  });
  function ribbon(t, route, lift) {
    const pts = [{ x: t.home.x, y: t.home.y }];
    for (const id of route) pts.push(...legPts(pts[pts.length - 1], jobs[id]).slice(1));
    const pos = [], dd = [], idx = [], at = {};
    let d = 0, w = 0.045;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], ax = X(a.x), az = Z(a.y), bx = X(b.x), bz = Z(b.y), len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-5) continue;
      const nx = -(bz - az) / len * w, nz = (bx - ax) / len * w, base = pos.length / 3;
      pos.push(ax + nx, lift, az + nz, ax - nx, lift, az - nz, bx + nx, lift, bz + nz, bx - nx, lift, bz - nz);
      dd.push(d, d, d + len, d + len);
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      d += len;
      for (const id of route) if (jobs[id] === b) at[id] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aD', new THREE.Float32BufferAttribute(dd, 1));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, ribbonMat(t.col));
    scene.add(m);
    return { m, len: d, at };
  }
  const routesA = techs.map((t, i) => ribbon(t, planA[i], 0.065 + i * 0.001));
  const routesB = techs.map((t, i) => (i === SICK ? null : ribbon(t, planB[i], 0.07 + i * 0.001)));
  // technicians: a pin each, at home
  const pins = techs.map((t, i) => {
    const g = new THREE.Group(); g.position.set(X(t.home.x), 0.06, Z(t.home.y));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 6), paper('#efe8dc')); pole.position.y = 0.375;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), new THREE.MeshLambertMaterial({ color: t.col })); head.position.y = 0.78;
    pole.castShadow = head.castShadow = true;
    g.add(pole, head); scene.add(g);
    const l = label(t.name, 0.9, { font: `600 58px ${SANS}`, color: t.col }); l.position.set(X(t.home.x), 0.075, Z(t.home.y) + 0.42); scene.add(l);
    return { g, head, l };
  });
  // jobs: a little paper house each, its roof in the colour of whoever has it
  const houseB = new THREE.BoxGeometry(0.2, 0.16, 0.2); houseB.translate(0, 0.08, 0);
  const roofG = new THREE.ConeGeometry(0.17, 0.13, 4); roofG.rotateY(Math.PI / 4); roofG.translate(0, 0.225, 0);
  const houses = jobs.map((j) => {
    const g = new THREE.Group(); g.position.set(X(j.x), 0.06, Z(j.y));
    const b = new THREE.Mesh(houseB, paper('#f4efe6')); const r = new THREE.Mesh(roofG, new THREE.MeshLambertMaterial({ color: '#888' }));
    b.castShadow = r.castShadow = true;
    g.add(b, r); scene.add(g);
    return { g, roof: r };
  });
  const ownerA = new Array(jobs.length).fill(-1), ownerB = new Array(jobs.length).fill(-1);
  planA.forEach((r, i) => r.forEach((id) => (ownerA[id] = i)));
  planB.forEach((r, i) => r.forEach((id) => (ownerB[id] = i)));
  const grey = new THREE.Color('#77707a'), look = new THREE.Vector3();
  return {
    scene, camera, bg: S.scene.background, ink: color,
    size: framer(camera, 0.1),
    update(q, t) {
      // the morning plan draws itself, each route in turn
      routesA.forEach((r, i) => {
        r.m.material.uniforms.uDraw.value = r.len * smooth(0.02 + i * 0.03, 0.22 + i * 0.03, q);
        r.m.material.uniforms.uA.value = i === SICK ? 1 - smooth(0.34, 0.44, q) * 0.9 : 1 - smooth(0.46, 0.52, q);
      });
      // nine o'clock: one goes home
      const sick = smooth(0.3, 0.42, q);
      const p = pins[SICK];
      p.g.rotation.z = -Math.PI / 2 * 0.92 * stand(smooth(0.3, 0.46, q));
      p.head.material.color.set(techs[SICK]?.col || '#fff').lerp(grey, sick);
      p.l.material.opacity = 1 - sick * 0.6;
      // the re-plan draws over it
      routesB.forEach((r, i) => { if (r) r.m.material.uniforms.uDraw.value = r.len * smooth(0.46 + i * 0.02, 0.8 + i * 0.02, q); });
      houses.forEach((h, k) => {
        let who = ownerA[k] >= 0 && smooth(0.02, 0.24, q) > 0.5 ? ownerA[k] : -1;
        if (q > 0.3 && ownerA[k] === SICK) who = -2;
        const b = ownerB[k], rb = b >= 0 ? routesB[b] : null;
        if (rb && rb.m.material.uniforms.uDraw.value >= (rb.at[k] || 0) - 0.01 && q > 0.46) who = b;
        h.roof.material.color.set(who >= 0 ? techs[who].col : who === -2 ? '#ff5d5d' : '#9a948c');
        // a moved job hops when its new technician reaches it
        const moved = ownerA[k] !== b && who === b && b >= 0;
        h.g.position.y = 0.06 + (moved ? Math.max(0, Math.sin(t * 5 + k)) * 0.06 * (1 - smooth(0.85, 1, q)) : 0);
      });
      const c = clamp(q, -0.3, 1.3), yaw = lerp(-0.18, 0.12, c);
      camera.position.set(Math.sin(yaw) * 11.4, lerp(9.6, 8.6, c), Math.cos(yaw) * 11.4);
      look.set(0.3, 0, 0.3);
      pull(camera, look);
    }
  };
}

/* ================================================================== 5 · Atlas */
// Every note I have published, one card each (174), on a long wall that bends like a door on a hinge
// as you come to it. A question goes across the wall; the notes that answer it light up, and the
// best one comes off the wall to you. All of it real: the titles are the notes', the search is the
// same overlap Atlas starts from.
export function atlasScene(o) {
  const color = new THREE.Color('#a78bfa');
  const S = stage({ bg: '#100e17', floor: '#1d1a26', key: '#f4f0ff', sky: '#e4dcff', ground: '#120f19', keyPos: [-4, 8, 9], shadows: o.shadows });
  const { scene } = S;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  const notes = (window.PORTFOLIO_NOTES || []).slice(0, 174);
  while (notes.length < 174) notes.push(['Note', '', '']);
  const COLS = 29, ROWS = 6, CW = 0.44, CHh = 0.5, GX = 0.06, GY = 0.06;
  const AC = 15, AR = Math.ceil(174 / AC), TW = 136, TH = 155;
  const atlas = document.createElement('canvas'); atlas.width = AC * TW; atlas.height = AR * TH;
  const x = atlas.getContext('2d');
  const wrap = (s, max) => { const words = s.split(' '), out = []; let line = ''; for (const w of words) { const tst = line ? line + ' ' + w : w; if (x.measureText(tst).width > max && line) { out.push(line); line = w; } else line = tst; } if (line) out.push(line); return out; };
  notes.forEach((n, k) => {
    const cx = (k % AC) * TW, cy = ((k / AC) | 0) * TH, [series, title] = n[0].includes(' · ') ? n[0].split(' · ') : ['', n[0]];
    x.fillStyle = '#f2eee6'; x.fillRect(cx, cy, TW, TH);
    x.fillStyle = '#a78bfa'; x.fillRect(cx + 10, cy + 10, 18, 4);
    x.fillStyle = 'rgba(30,26,40,0.55)'; x.font = `500 8px ${MONO}`; x.fillText(series.slice(0, 26), cx + 10, cy + 26);
    x.fillStyle = '#1e1a28'; x.font = `400 15px ${SERIF}`;
    wrap(title, TW - 20).slice(0, 4).forEach((l, i) => x.fillText(l, cx + 10, cy + 46 + i * 15));
    x.fillStyle = 'rgba(30,26,40,0.1)'; for (let i = 0; i < 4; i++) x.fillRect(cx + 10, cy + 112 + i * 9, TW - 20 - (i === 3 ? 40 : 0), 3);
  });
  const atex = new THREE.CanvasTexture(atlas); atex.colorSpace = THREE.SRGBColorSpace; atex.anisotropy = 8;
  // the search: words of the question against each note's title and keywords
  const QUERY = 'how do I write a design doc people read';
  const qw = ['design', 'doc', 'readme', 'read', 'writ', 'people'];
  const score = notes.map((n) => { const s = (n[0] + ' ' + n[2]).toLowerCase(); return qw.reduce((a, w) => a + (s.includes(w) ? 1 : 0), 0); });
  const order = score.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
  const best = order[0][1], hits = new Set(order.slice(0, 7).filter(([s]) => s > 0).map(([, i]) => i));

  const g = new THREE.PlaneGeometry(CW, CHh);
  const cell = new Float32Array(174 * 2), lit = new Float32Array(174);
  for (let k = 0; k < 174; k++) { cell[k * 2] = (k % AC) / AC; cell[k * 2 + 1] = 1 - (((k / AC) | 0) + 1) / AR; }
  g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
  const litA = new THREE.InstancedBufferAttribute(lit, 1); litA.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aLit', litA);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: atex }, uScale: { value: new THREE.Vector2(1 / AC, 1 / AR) }, uInk: { value: color } },
    vertexShader: `attribute vec2 aCell; attribute float aLit; varying vec2 vUv, vLoc; varying float vLit, vShade; uniform vec2 uScale;
      void main(){ vLoc = uv; vUv = aCell + uv * uScale; vLit = aLit; vec3 n = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0));
        vShade = 0.55 + 0.45 * max(dot(n, normalize(vec3(-0.3, 0.4, 1.0))), 0.0);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uInk; varying vec2 vUv, vLoc; varying float vLit, vShade;
      void main(){ vec3 c = texture2D(map, vUv).rgb;
        float dim = vLit < 0.0 ? 1.0 + vLit * 0.7 : 1.0;
        c *= vShade * dim;
        vec2 e = min(vLoc, 1.0 - vLoc); float edge = 1.0 - smoothstep(0.0, 0.05, min(e.x, e.y * 1.13));
        c = mix(c, uInk, edge * max(vLit, 0.0));
        c += uInk * max(vLit, 0.0) * 0.12;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide
  });
  const wall = new THREE.InstancedMesh(g, mat, 174);
  scene.add(wall);
  // the best note, big, to come off the wall
  const big = document.createElement('canvas'); big.width = 880; big.height = 1000;
  { const y = big.getContext('2d'), n = notes[best], [series, title] = n[0].split(' · ');
    y.fillStyle = '#f2eee6'; y.fillRect(0, 0, 880, 1000);
    y.fillStyle = '#a78bfa'; y.fillRect(64, 64, 120, 14);
    y.fillStyle = 'rgba(30,26,40,0.6)'; y.font = `500 30px ${MONO}`; y.fillText((series || '').toUpperCase(), 64, 140);
    y.fillStyle = '#1e1a28'; y.font = `400 84px ${SERIF}`;
    const lines = []; { const words = (title || n[0]).split(' '); let line = ''; for (const w of words) { const tst = line ? line + ' ' + w : w; if (y.measureText(tst).width > 752 && line) { lines.push(line); line = w; } else line = tst; } if (line) lines.push(line); }
    lines.slice(0, 4).forEach((l, i) => y.fillText(l, 64, 260 + i * 92));
    y.font = `500 28px ${MONO}`; y.fillStyle = 'rgba(30,26,40,0.55)'; y.fillText('matched', 64, 690);
    let tx = 64; for (const w of ['design', 'docs', 'readme']) { y.font = `500 30px ${MONO}`; const tw = y.measureText(w).width + 36; y.fillStyle = 'rgba(167,139,250,0.25)'; y.beginPath(); y.roundRect(tx, 716, tw, 54, 27); y.fill(); y.fillStyle = '#4c3a8f'; y.fillText(w, tx + 18, 753); tx += tw + 14; }
    y.fillStyle = 'rgba(30,26,40,0.1)'; for (let i = 0; i < 5; i++) y.fillRect(64, 830 + i * 26, 752 - (i === 4 ? 260 : 0), 8); }
  const btex = new THREE.CanvasTexture(big); btex.colorSpace = THREE.SRGBColorSpace; btex.anisotropy = 8;
  const card = sheet(CW, CHh, 0.02, 0.012, [new THREE.MeshLambertMaterial({ map: btex }), paper('#e6e0d4')]);
  // (the sheet's front face takes the texture through its own uvs, which run in the shape's units)
  btex.repeat.set(1 / CW, 1 / CHh); btex.offset.set(0.5, 0.5);
  scene.add(card);

  const halfW = (COLS * (CW + GX)) / 2;
  const leanRamp = (s) => s * (1.5 - 0.5 * s * s);
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Sc = new THREE.Vector3(1, 1, 1);
  const look = new THREE.Vector3(), far = new THREE.Vector3(), near = new THREE.Vector3(), cq = new THREE.Quaternion();
  const wallAt = (k, lean, bend, out, rot) => {
    const col = k % COLS, row = (k / COLS) | 0;
    const xx = (col - (COLS - 1) / 2) * (CW + GX), s = xx / halfW;
    // Jesper Landberg's lean: the wall turns on a hinge in its middle and curves round you
    const zz = lean * leanRamp(s) * 1.2 + bend * s * s * 3;
    const dz = (lean * (1.5 - 1.5 * s * s) * 1.2 + bend * 2 * s * 3) / halfW;
    out.set(xx, 2.85 - row * (CHh + GY), zz);
    rot.set(0, -Math.atan(dz), 0);
  };
  return {
    scene, camera, bg: S.scene.background, ink: color,
    size: framer(camera, 0.08),
    update(q, t) {
      const c = clamp(q, -0.3, 1.3);
      camera.position.set(lerp(-3.4, -0.6, easeOut(c)), 1.9, lerp(10.4, 9.6, c));
      look.set(lerp(-1.4, 0.2, easeOut(c)), 1.85, 0);
      pull(camera, look);
      camera.updateMatrixWorld();
      const lean = lerp(-2.6, -0.9, easeOut(clamp((q + 0.35) / 0.75)));
      const bend = lerp(-1.2, -0.55, easeOut(clamp((q + 0.35) / 0.75)));
      const scan = lerp(-halfW - 1, halfW + 1, smooth(0.3, 0.56, q));
      const fly = easeInOut(smooth(0.56, 0.84, q));
      for (let k = 0; k < 174; k++) {
        wallAt(k, lean, bend, P, E);
        const passed = P.x < scan;
        const wave = Math.exp(-Math.pow((P.x - scan) / 0.6, 2));
        P.z += wave * 0.22;
        Q.setFromEuler(E);
        Sc.setScalar(k === best && fly > 0 ? 0 : 1);
        M.compose(P, Q, Sc);
        wall.setMatrixAt(k, M);
        lit[k] = hits.has(k) ? (passed ? 1 : wave) : passed ? -smooth(0.3, 0.6, q) * 0.6 : wave * 0.5;
      }
      wall.instanceMatrix.needsUpdate = true; litA.needsUpdate = true;
      // the best note comes off the wall to you, turning to face you as it comes
      wallAt(best, lean, bend, far, E);
      Q.setFromEuler(E);
      near.copy(camera.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(3.4));
      near.add(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(0.55));
      card.position.copy(far).lerp(near, fly);
      card.position.y += Math.sin(Math.PI * fly) * 0.5;
      cq.copy(Q).slerp(camera.quaternion, fly);
      card.quaternion.copy(cq);
      card.scale.setScalar(lerp(1, 2.8, fly));
      card.visible = fly > 0;
    },
    query: QUERY, best: notes[best]
  };
}

/* ================================================================== 6 · Intonation Studio */
// Four strings across a bridge. The A string is drawn and rings; its wave unrolls off it as a paper
// ribbon; the tuner's needle swings, then settles dead centre.
export function studioScene(o) {
  const color = new THREE.Color('#c8ff4a');
  const S = stage({ bg: '#10120c', floor: '#1d2017', key: '#fbffe8', sky: '#eef5d6', ground: '#12140e', keyPos: [-5, 9, 7], shadows: o.shadows });
  const { scene } = S;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
  // the strings, each a thin tube that can ring: its middle swings on a standing wave
  const strU = [];
  const strings = ['G', 'D', 'A', 'E'].map((n, i) => {
    const U = { uAmp: { value: 0 }, uT: { value: 0 }, uC: { value: new THREE.Color(i < 2 ? '#c9b37a' : '#d8d3c8') } };
    strU.push(U);
    const geo = new THREE.CylinderGeometry(0.018 - i * 0.003, 0.018 - i * 0.003, 12, 6, 160, true); geo.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: 'uniform float uAmp, uT; varying float vL; void main(){ vec3 p = position; float s = (p.x + 6.0) / 12.0; float w = sin(3.14159 * s) * uAmp * sin(uT * 52.0) + sin(6.2832 * s) * uAmp * 0.3 * sin(uT * 97.0); p.y += w; p.z += w * 0.4; vL = 0.7 + 0.3 * normal.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
      fragmentShader: 'uniform vec3 uC; varying float vL; void main(){ gl_FragColor = vec4(uC * vL, 1.0); \n #include <colorspace_fragment>\n }'
    }));
    m.position.set(0, 1.25, -0.6 + i * 0.4);
    scene.add(m);
    return m;
  });
  // the bridge: a paper cut-out, feet, heart and kidneys
  { const s = new THREE.Shape();
    s.moveTo(-1.1, 0); s.lineTo(-0.75, 0); s.quadraticCurveTo(-0.6, 0.35, -0.3, 0.35); s.lineTo(0.3, 0.35); s.quadraticCurveTo(0.6, 0.35, 0.75, 0); s.lineTo(1.1, 0);
    s.quadraticCurveTo(1.0, 0.7, 0.85, 1.0); s.quadraticCurveTo(0.0, 1.32, -0.85, 1.0); s.quadraticCurveTo(-1.0, 0.7, -1.1, 0);
    const h = new THREE.Path(); h.absellipse(0, 0.72, 0.13, 0.17, 0, Math.PI * 2, false); s.holes.push(h);
    for (const sx of [-1, 1]) { const k = new THREE.Path(); k.absellipse(sx * 0.48, 0.58, 0.07, 0.13, 0, Math.PI * 2, false); s.holes.push(k); }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false, curveSegments: 18 }); g.translate(0, 0, -0.03);
    const b = new THREE.Mesh(g, paper('#e9dcc2')); b.rotation.y = Math.PI / 2; b.position.set(3.2, 0, 0); b.scale.setScalar(1.05); b.castShadow = b.receiveShadow = true; scene.add(b); }
  // the wave, a ribbon of paper off the A string: lime on its face, paper on its back
  const RU = { uT: { value: 0 }, uShow: { value: 0 }, uAmp: { value: 0 }, uC: { value: color }, uBack: { value: new THREE.Color('#e9e3d6') } };
  const rg = new THREE.PlaneGeometry(9, 0.28, 360, 1);
  const rib = new THREE.Mesh(rg, new THREE.ShaderMaterial({
    uniforms: RU, side: THREE.DoubleSide,
    vertexShader: `uniform float uT, uShow, uAmp; varying float vX, vShade;
      void main(){ vec3 p = position; float s = (p.x + 4.5) / 9.0; vX = s;
        float env = smoothstep(0.0, 0.08, s) * (0.6 + 0.4 * s);
        float ph = s * 26.0 - uT * 5.0;
        float y = sin(ph) * 0.55 * uAmp * env;
        float tw = cos(ph) * 0.9 * uAmp * env;
        vec3 q = vec3(p.x, y + p.y * cos(tw), p.y * sin(tw));
        vShade = 0.65 + 0.35 * cos(tw);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0); }`,
    fragmentShader: `uniform float uShow; uniform vec3 uC, uBack; varying float vX, vShade;
      void main(){ if (vX > uShow) discard; vec3 c = gl_FrontFacing ? uC : uBack; gl_FragColor = vec4(c * vShade, 1.0); \n #include <colorspace_fragment>\n }`
  }));
  rib.position.set(0.9, 2.15, 0.2); rib.scale.x = 0.78;
  scene.add(rib);
  // the tuner: a paper dial, its ticks in cents, and a needle
  const dial = document.createElement('canvas'); dial.width = 1024; dial.height = 600;
  { const y = dial.getContext('2d'), cx = 512, cy = 560;
    y.fillStyle = '#efe9dc'; y.beginPath(); y.arc(cx, cy, 500, Math.PI, 0); y.fill();
    y.strokeStyle = '#1d2017'; y.fillStyle = '#1d2017';
    for (let c = -50; c <= 50; c += 5) { const a = -Math.PI / 2 + (c / 50) * 1.05, r0 = c % 25 ? 410 : 380; y.lineWidth = c % 25 ? 3 : 5; y.beginPath(); y.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); y.lineTo(cx + Math.cos(a) * 460, cy + Math.sin(a) * 460); y.stroke(); }
    y.fillStyle = 'rgba(160,210,40,0.5)'; y.beginPath(); y.moveTo(cx, cy); y.arc(cx, cy, 470, -Math.PI / 2 - 0.05, -Math.PI / 2 + 0.05); y.fill();
    y.fillStyle = '#1d2017'; y.font = `500 34px ${MONO}`; y.textAlign = 'center';
    for (const c of [-50, -25, 25, 50]) { const a = -Math.PI / 2 + (c / 50) * 1.05; y.fillText((c > 0 ? '+' : '') + c, cx + Math.cos(a) * 335, cy + Math.sin(a) * 335 + 12); }
    y.font = `400 150px ${SERIF}`; y.fillText('A', cx, cy - 120); y.font = `500 30px ${MONO}`; y.fillText('cents', cx, cy - 70); }
  const dt = new THREE.CanvasTexture(dial); dt.colorSpace = THREE.SRGBColorSpace; dt.anisotropy = 8;
  const dialG = new THREE.Group(); dialG.position.set(4.4, 0.5, -2.2); dialG.rotation.y = -0.45;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.0), new THREE.MeshLambertMaterial({ map: dt, transparent: true, alphaTest: 0.5 }));
  face.position.y = 1.0; face.castShadow = true; dialG.add(face);
  const needle = new THREE.Group(); needle.position.set(0, 0.13, 0.03);
  const nm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.55, 0.02), new THREE.MeshBasicMaterial({ color: '#ff5d5d' })); nm.position.y = 0.78; needle.add(nm);
  dialG.add(needle);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 20), paper('#1d2017')); hub.rotation.x = Math.PI / 2; hub.position.set(0, 0.13, 0.04); dialG.add(hub);
  scene.add(dialG);
  const look = new THREE.Vector3();
  return {
    scene, camera, bg: S.scene.background, ink: color,
    size: framer(camera, 0.1),
    update(q, t) {
      const ring = smooth(0.02, 0.18, q) * (1 - smooth(0.9, 1.1, q) * 0.6);
      strU.forEach((U, i) => { U.uT.value = t; U.uAmp.value = i === 2 ? ring * 0.07 : 0; });
      RU.uT.value = t; RU.uShow.value = easeOut(smooth(0.16, 0.6, q)) * 1.01; RU.uAmp.value = ring;
      // the needle: way off, swinging in, settling on zero
      const s = clamp((q - 0.45) / 0.4);
      const ang = q < 0.45 ? lerp(0, 34, smooth(0.25, 0.45, q)) + Math.sin(t * 9) * 1.5 * smooth(0.25, 0.45, q) : 34 * Math.exp(-5 * s) * Math.cos(13 * s) + Math.sin(t * 11) * 0.35 * (1 - s);
      needle.rotation.z = -ang * Math.PI / 180;
      const c = clamp(q, -0.3, 1.3);
      camera.position.set(lerp(-2.8, -1.6, c), lerp(3.0, 2.7, c), lerp(10.6, 9.8, c));
      look.set(lerp(0.6, 1.6, c), 1.45, -0.3);
      pull(camera, look);
    }
  };
}

/* ================================================================== 7 · Layerline */
// A gear: first its outline, drawn from the bottom up; then sliced into layers that build up under a
// nozzle, each with its walls and infill; then the layers lift apart, an exploded view, and close
// again into the part.
export function layerScene(o) {
  const color = new THREE.Color('#ff8a65');
  const S = stage({ bg: '#140f0d', floor: '#241b18', key: '#fff0e8', sky: '#ffe2d6', ground: '#160f0d', keyPos: [-5, 9, 6], shadows: o.shadows });
  const { scene } = S;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
  const TEETH = 16, RO = 1.55, RR = 1.28;
  const gear = new THREE.Shape();
  for (let i = 0; i < TEETH; i++) {
    const a0 = (i / TEETH) * Math.PI * 2, da = Math.PI * 2 / TEETH;
    const pts = [[RR, a0], [RR, a0 + da * 0.18], [RO, a0 + da * 0.3], [RO, a0 + da * 0.62], [RR, a0 + da * 0.74]];
    pts.forEach(([r, a], k) => { const px = Math.cos(a) * r, py = Math.sin(a) * r; if (i === 0 && k === 0) gear.moveTo(px, py); else gear.lineTo(px, py); });
  }
  gear.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.42, 0, Math.PI * 2, true); gear.holes.push(hole);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3, h = new THREE.Path(); h.absarc(Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0.17, 0, Math.PI * 2, true); gear.holes.push(h); }
  const N = 22, TH = 0.042, HEIGHT = N * TH;
  // the outline, drawn bottom-up (Igloo's outline: it is there up to a line that rises)
  const solid = new THREE.ExtrudeGeometry(gear, { depth: HEIGHT, bevelEnabled: false, curveSegments: 18 });
  solid.rotateX(-Math.PI / 2);
  const WU = { uCut: { value: 0 }, uA: { value: 1 }, uC: { value: color } };
  const wire = new THREE.LineSegments(new THREE.EdgesGeometry(solid, 25), new THREE.ShaderMaterial({
    uniforms: WU, transparent: true, depthWrite: false,
    vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uCut, uA; uniform vec3 uC; varying float vY; void main(){ if (vY > uCut) discard; float hot = smoothstep(uCut - 0.08, uCut, vY); gl_FragColor = vec4(mix(uC, vec3(1.0), hot), uA); }'
  }));
  wire.position.y = 0.002;
  scene.add(wire);
  // a slice's top: walls round every edge, and infill across
  const tc = document.createElement('canvas'); tc.width = tc.height = 1024;
  { const y = tc.getContext('2d'), k = 1024 / 3.2, P = (px, py) => [512 + px * k, 512 - py * k];
    y.fillStyle = '#f3e7dc'; y.fillRect(0, 0, 1024, 1024);
    y.save(); y.beginPath();
    const trace = (pts) => { pts.forEach((p, i) => { const [a, b] = P(p.x, p.y); i ? y.lineTo(a, b) : y.moveTo(a, b); }); y.closePath(); };
    trace(gear.getPoints(24)); gear.holes.forEach((h) => trace(h.getPoints(24)));
    y.clip('evenodd');
    y.strokeStyle = 'rgba(255,138,101,0.55)'; y.lineWidth = 5;
    for (let d = -1024; d < 2048; d += 26) { y.beginPath(); y.moveTo(d, 0); y.lineTo(d + 1024, 1024); y.stroke(); }
    y.restore();
    // the walls: a line round every edge
    y.strokeStyle = '#ff8a65'; y.lineWidth = 9;
    y.beginPath(); trace(gear.getPoints(24)); y.stroke();
    gear.holes.forEach((h) => { y.beginPath(); trace(h.getPoints(24)); y.stroke(); }); }
  const top = new THREE.CanvasTexture(tc); top.colorSpace = THREE.SRGBColorSpace; top.anisotropy = 8;
  top.repeat.set(1 / 3.2, 1 / 3.2); top.offset.set(0.5, 0.5);
  const sliceG = new THREE.ExtrudeGeometry(gear, { depth: TH * 0.92, bevelEnabled: false, curveSegments: 18 });
  sliceG.rotateX(-Math.PI / 2);
  const slices = new THREE.InstancedMesh(sliceG, [new THREE.MeshLambertMaterial({ map: top }), paper('#f0dccd')], N);
  slices.castShadow = slices.receiveShadow = true;
  scene.add(slices);
  // the nozzle
  const noz = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 18), paper('#d9d2c6')); cone.rotation.x = Math.PI; cone.position.y = 0.15;
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.34), paper('#3a2f2a')); block.position.y = 0.41;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd2bf' }));
  cone.castShadow = block.castShadow = true;
  noz.add(cone, block, tip); scene.add(noz);
  const outline = gear.getSpacedPoints(400);
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Sc = new THREE.Vector3(1, 1, 1);
  const look = new THREE.Vector3();
  return {
    scene, camera, bg: S.scene.background, ink: color,
    size: framer(camera, 0.12),
    update(q, t) {
      WU.uCut.value = lerp(-0.01, HEIGHT + 0.02, easeInOut(smooth(-0.1, 0.24, q)));
      WU.uA.value = 1 - smooth(0.42, 0.62, q) * 0.85;
      const built = smooth(0.24, 0.62, q) * N;
      const gap = Math.sin(Math.PI * smooth(0.64, 0.98, q)) * 0.032;
      const spinAll = (q > 0.62 ? (q - 0.62) * 1.4 : 0) + t * 0.04;
      for (let i = 0; i < N; i++) {
        const k = clamp(built - i);
        P.set(0, i * (TH + gap), 0);
        E.set(0, spinAll + gap * i * 0.35, 0);
        Q.setFromEuler(E);
        Sc.set(1, Math.max(0.0001, k), 1);
        M.compose(P, Q, Sc);
        slices.setMatrixAt(i, M);
      }
      slices.instanceMatrix.needsUpdate = true;
      // the nozzle runs round the outline of the layer it is laying
      const layer = Math.min(N - 1, Math.floor(built)), printing = built > 0.01 && built < N - 0.01;
      const pt = outline[Math.floor((t * 0.35 % 1) * outline.length)];
      const ca = Math.cos(spinAll), sa = Math.sin(spinAll);
      // (a point of the shape, (x, y), stands at (x, h, -y), then turns with the part)
      noz.position.set(pt.x * ca - pt.y * sa, layer * TH + TH + 0.02, -pt.x * sa - pt.y * ca);
      noz.position.lerp(new THREE.Vector3(2.4, HEIGHT + 1.2, -0.8), 1 - smooth(0.2, 0.3, q) + smooth(0.6, 0.7, q));
      tip.visible = printing;
      const c = clamp(q, -0.3, 1.3), orbit = lerp(0.55, 1.05, c);
      camera.position.set(Math.sin(orbit) * 8.6, lerp(5.2, 4.2, c), Math.cos(orbit) * 8.6);
      look.set(0, lerp(0.35, 0.75, c) + gap * N * 0.45, 0);
      pull(camera, look);
    }
  };
}
