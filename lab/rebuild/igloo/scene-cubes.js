// Scene 2, one block of ice per project. As on igloo.inc: the blocks hang 5.75 apart down a
// column, spin hard on the way in and out, refract what is inside them in three colours, and
// the frost wipes off where the mouse goes. The objects inside are our own, one per project.
import * as THREE from 'three';
import { gsap, Rig, GL_FIT, GL_NOISE, FS_VERT, fullscreen, drawFS, fit, clamp, lerpFPS, rng, textTexture } from './lib.js';

const OFFSET = -5.75;

// ─── the ice ──────────────────────────────────────────────────────────────────────────────
// A tall block with hewn faces: a subdivided box whose faces are pushed in by noise and whose
// edges are chipped, so the light breaks on it like on cut ice.
function iceGeometry(seed) {
  const rand = rng(seed);
  const g = new THREE.BoxGeometry(1.5, 2.9, 1.5, 6, 12, 6);
  const p = g.attributes.position;
  const bumps = Array.from({ length: 24 }, () => [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1, 0.25 + rand() * 0.5, rand() * 0.12]);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const n = new THREE.Vector3(v.x / 0.75, v.y / 1.45, v.z / 0.75);
    let push = 0;
    for (const [bx, by, bz, r, d] of bumps) {
      const dd = Math.hypot(n.x - bx, n.y - by, n.z - bz);
      if (dd < r) push += (1 - dd / r) * d;
    }
    const edge = (Math.abs(n.x) > 0.95 ? 1 : 0) + (Math.abs(n.y) > 0.97 ? 1 : 0) + (Math.abs(n.z) > 0.95 ? 1 : 0);
    if (edge >= 2) push += 0.05 + rand() * 0.07;
    v.addScaledVector(n.normalize(), -push);
    // a slight taper and lean, so no two blocks stand the same
    v.x *= 1 - (v.y / 2.9) * 0.08;
    v.x += v.y * 0.03 * (rand() > 0.5 ? 1 : 1);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const iceVert = /* glsl */`
  varying vec3 vWorld, vNormal; varying vec2 vUv; varying vec3 vLocal;
  void main() {
    vUv = uv; vLocal = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const iceFrag = /* glsl */`
  uniform sampler2D tTrans, tFrost, tNoise;
  uniform vec2 uTransSize, uNoiseOffset;
  uniform float uIor, uCA, uThickness, uRoughness, uTime, uActive;
  uniform vec3 uColor, uFrostColor, uSkyTop, uSkyBottom;
  uniform mat4 projectionMatrix;
  varying vec3 vWorld, vNormal; varying vec2 vUv; varying vec3 vLocal;
  ${GL_FIT}
  ${GL_NOISE}
  vec2 project(vec3 p) { vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0); return c.xy / c.w * 0.5 + 0.5; }
  void main() {
    float wiped = texture2D(tFrost, vUv).r * uActive;
    // Frost: roughness and a bumpy normal from noise, both cleared where the mouse has been.
    float rough = uRoughness * (0.55 + 0.45 * fbm3(vLocal * 3.0)) * (1.0 - wiped);
    vec3 n = normalize(vNormal);
    vec3 bump = vec3(vnoise3(vLocal * 9.0), vnoise3(vLocal * 9.0 + 7.1), vnoise3(vLocal * 9.0 + 3.7)) - 0.5;
    n = normalize(n + bump * rough * 0.9);
    vec3 v = normalize(cameraPosition - vWorld);
    if (!gl_FrontFacing) n = -n;
    vec4 bn = texture2D(tNoise, gl_FragCoord.xy / 64.0 + uNoiseOffset);
    vec3 jitter = (bn.xyz - 0.5) * rough * rough * 2.0;
    vec3 sn = normalize(n + jitter);
    float lod = log2(uTransSize.x) * rough * clamp(uIor * 2.0 - 2.0, 0.0, 1.0) * 1.6;
    // Three samples per channel, each a little further and more bent: chromatic refraction.
    vec3 trans = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float k = (float(i) + bn.w) / 3.0;
      float th = uThickness + uThickness * pow(rough, 0.33) * k;
      vec3 rr = refract(-v, sn, 1.0 / uIor) * th;
      vec3 rg = refract(-v, sn, 1.0 / (uIor * (1.0 + uCA * k))) * th;
      vec3 rb = refract(-v, sn, 1.0 / (uIor * (1.0 + 2.0 * uCA * k))) * th;
      trans.r += textureLod(tTrans, project(vWorld + rr), lod).r;
      trans.g += textureLod(tTrans, project(vWorld + rg), lod).g;
      trans.b += textureLod(tTrans, project(vWorld + rb), lod).b;
    }
    trans /= 3.0;
    float nv = clamp(dot(n, v), 0.0, 1.0);
    float F = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
    vec3 r = reflect(-v, n);
    vec3 env = mix(uSkyBottom, uSkyTop, r.y * 0.5 + 0.5) * (0.85 + 0.3 * smoothstep(0.6, 1.0, r.y));
    vec3 color = trans * uColor * (1.0 - F) + env * F * mix(1.0, 0.6, rough);
    // Soft sheen on the frost, and a glowing rim of triangles round the wiped patch.
    color += uFrostColor * rough * 0.18 * (0.5 + 0.5 * n.y);
    float rim = smoothstep(0.04, 0.22, wiped) * smoothstep(0.6, 0.22, wiped);
    color += rim * uFrostColor * (0.6 + 2.2 * triangles(vUv * 18.0)) * 0.9;
    gl_FragColor = vec4(color, 1.0);
  }
`;

// The trail the mouse leaves on the block, in the block's own UV space: a brush that fades back
// to frost over a few seconds (Igloo runs a small fluid sim for this).
class Frost {
  constructor() {
    const rt = () => new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, depthBuffer: false });
    this.a = rt(); this.b = rt();
    this.pass = fullscreen(new THREE.ShaderMaterial({
      uniforms: { tPrev: { value: null }, uPoint: { value: new THREE.Vector2(-9, -9) }, uLast: { value: new THREE.Vector2(-9, -9) }, uForce: { value: 0 }, uDecay: { value: 0.992 } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tPrev; uniform vec2 uPoint, uLast; uniform float uForce, uDecay; varying vec2 vUv;
        float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }
        void main() {
          float prev = texture2D(tPrev, vUv).r * uDecay;
          float d = seg(vUv, uLast, uPoint);
          float brush = smoothstep(0.11, 0.0, d) * uForce;
          gl_FragColor = vec4(clamp(max(prev, brush), 0.0, 1.0), 0.0, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.has = false;
    this.velocity = 0;
  }
  get texture() { return this.a.texture; }
  step(renderer, hitUv, force) {
    const u = this.pass.material.uniforms;
    if (hitUv) {
      if (!this.has) u.uLast.value.copy(hitUv);
      else u.uLast.value.copy(u.uPoint.value);
      u.uPoint.value.copy(hitUv);
      this.velocity = Math.min(1, this.velocity + u.uLast.value.distanceTo(hitUv) * 6);
      this.has = true;
    } else {
      this.has = false;
    }
    this.velocity *= 0.94;
    u.uForce.value = hitUv ? force : 0;
    u.tPrev.value = this.a.texture;
    drawFS(renderer, this.pass, this.b);
    [this.a, this.b] = [this.b, this.a];
  }
}

// ─── what is inside each block, one object per project ────────────────────────────────────
function emblemMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */`varying vec3 vN, vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying vec3 vN, vV;
      void main() {
        vec3 n = normalize(vN), v = normalize(vV);
        float l = 0.45 + 0.55 * max(dot(n, normalize(vec3(0.4, 0.8, 0.6))), 0.0);
        float rim = pow(1.0 - max(dot(n, v), 0.0), 2.0);
        gl_FragColor = vec4(uColor * l + rim * 0.5 + 0.06, 1.0);
      }`,
  });
}

function emblem(id, color) {
  const g = new THREE.Group();
  const m = emblemMaterial(color);
  const light = emblemMaterial(new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55));
  const add = (geo, mat = m, f) => { const mesh = new THREE.Mesh(geo, mat); f && f(mesh); g.add(mesh); return mesh; };
  if (id === 'relay') {
    // Nine stages threaded on one request.
    add(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 12), light);
    for (let i = 0; i < 9; i++) add(new THREE.TorusGeometry(0.28 - Math.abs(i - 4) * 0.025, 0.045, 10, 36), i % 3 === 1 ? light : m, (o) => { o.rotation.x = Math.PI / 2; o.position.y = -0.8 + i * 0.2; });
    add(new THREE.ConeGeometry(0.16, 0.28, 24), light, (o) => { o.position.y = 1.05; });
  } else if (id === 'tracewise') {
    // A trace waterfall: spans, each starting where its parent's work begins.
    [[0, 1.3], [0.1, 0.9], [0.2, 0.4], [0.65, 0.35], [0.35, 0.7], [0.5, 0.25], [0.8, 0.45]].forEach(([s, w], i) => {
      add(new THREE.BoxGeometry(w, 0.13, 0.22), i === 3 ? light : m, (o) => { o.position.set(-0.65 + s + w / 2, 0.75 - i * 0.24, 0); });
    });
  } else if (id === 'onboard') {
    // Two records becoming one.
    add(new THREE.IcosahedronGeometry(0.42, 3), m, (o) => o.position.set(-0.2, 0.15, 0));
    add(new THREE.IcosahedronGeometry(0.36, 3), light, (o) => o.position.set(0.22, -0.18, 0.05));
    add(new THREE.TorusGeometry(0.62, 0.025, 8, 64), light, (o) => { o.rotation.set(1.2, 0.3, 0); });
  } else if (id === 'dispatch') {
    // A route re-planned round the day, with its stops.
    const curve = new THREE.CatmullRomCurve3([[-0.5, -0.9, 0], [0.4, -0.5, 0.2], [-0.3, 0, -0.1], [0.45, 0.45, 0.1], [-0.1, 0.95, 0]].map((a) => new THREE.Vector3(...a)));
    add(new THREE.TubeGeometry(curve, 80, 0.045, 10), light);
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => add(new THREE.ConeGeometry(0.09, 0.22, 16), m, (o) => { o.position.copy(curve.getPoint(t)).add(new THREE.Vector3(0, 0.14, 0)); o.rotation.x = Math.PI; }));
  } else if (id === 'atlas') {
    // A notebook you can ask a question.
    add(new THREE.BoxGeometry(0.9, 0.16, 0.65), m, (o) => o.position.y = -0.55);
    add(new THREE.BoxGeometry(0.86, 0.12, 0.62), light, (o) => { o.position.y = -0.4; o.rotation.y = 0.08; });
    add(new THREE.TorusGeometry(0.3, 0.05, 12, 48), light, (o) => o.position.set(0.05, 0.35, 0));
    add(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 12), m, (o) => { o.position.set(0.37, -0.02, 0); o.rotation.z = 0.75; });
  } else if (id === 'intonation') {
    // A tuning fork.
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 16), m, (o) => o.position.y = -0.55);
    const u = new THREE.TorusGeometry(0.22, 0.06, 12, 32, Math.PI);
    add(u, light, (o) => { o.rotation.z = Math.PI; o.position.y = -0.15; });
    [-0.22, 0.22].forEach((x) => add(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 16), light, (o) => o.position.set(x, 0.35, 0)));
  } else {
    // Layerline: a gear, sliced into layers.
    const shape = new THREE.Shape();
    const teeth = 12;
    for (let i = 0; i <= teeth * 4; i++) {
      const a = (i / (teeth * 4)) * Math.PI * 2, r = (i % 4 < 2) ? 0.55 : 0.44;
      i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.16, 0, Math.PI * 2, true); shape.holes.push(hole);
    for (let i = 0; i < 7; i++) add(new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false }), i % 2 ? light : m, (o) => { o.rotation.x = -Math.PI / 2; o.position.y = -0.5 + i * 0.15; o.rotation.z = i * 0.03; });
  }
  return g;
}

// ─── the scene ────────────────────────────────────────────────────────────────────────────
export class CubesScene {
  constructor(ctx, projects) {
    this.ctx = ctx;
    this.name = 'cubes';
    this.projects = projects;
    this.height = projects.length;
    this.progress = 0;
    this.visible = false;
    this.bloomThreshold = 0.2;
    this.bloomScale = 0.08;
    this.scene = new THREE.Scene();
    const rig = (this.rig = new Rig(45));
    rig.basePosition.set(0, 0, 5);
    rig.baseTarget.set(0, 0, 0);
    rig.displacement.position.set(0.1, 0.05);
    rig.shake.setScalar(0.02);
    rig.shakeSpeed.setScalar(0.1);
    this.initialPosition = rig.basePosition.clone();
    this.initialTarget = rig.baseTarget.clone();
    this.cameraZoom = { value: 0 };
    this.cubes = [];
    this.transRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, samples: 0 });
    this.noiseOffset = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.hover = -1;
    this.buildBackground();
    this.buildBlurryText();
    this.buildShapes();
    projects.forEach((p, i) => this.buildCube(p, i));
  }

  buildBackground() {
    this.bgU = { uProgress: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.bgU, uTime: this.ctx.uniforms.uTime, uResolution: this.ctx.uniforms.uResolution, uColor1: { value: new THREE.Color('#c9d0df') }, uColor2: { value: new THREE.Color('#545b6b') } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        uniform float uProgress, uTime; uniform vec2 uResolution; uniform vec3 uColor1, uColor2; varying vec2 vUv;
        ${GL_NOISE}
        void main() {
          vec2 s = vUv; s.x *= uResolution.x / uResolution.y; s *= 0.3;
          float t = uTime * 0.075;
          vec2 o1 = vec2(-t, t * 0.25 - uProgress * 0.65), o2 = vec2(t, -t * 0.5);
          float perlin = (fbm(s * 4.0 + o1) + fbm(s * 2.0 + o2)) * 0.5;
          vec3 color = mix(uColor1, uColor2, smoothstep(0.25, 0.85, perlin) * 0.8);
          vec2 d = s * 45.0 + vec2(0.0, -uProgress * 10.0);
          float dots = smoothstep(0.18, 0.08, length(fract(d) - 0.5));
          float id = hash12(floor(d));
          color += dots * (1.0 - abs(fract(id + uTime * 0.1) - 0.5) * 2.0) * 0.12;
          color += (hash12(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.02;
          gl_FragColor = vec4(color, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry().copy(fullscreen(mat).mesh.geometry), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -99;
    this.scene.add(mesh);
  }

  // Out-of-focus words far behind the blocks, drifting at their own speed.
  buildBlurryText() {
    this.blurry = new THREE.Group();
    const words = [];
    this.projects.forEach((p) => words.push(p.name.toUpperCase(), String(p.year), p.kind.toUpperCase()));
    words.forEach((w, i) => {
      const cv = document.createElement('canvas');
      cv.width = 1024; cv.height = 256;
      const c = cv.getContext('2d');
      c.filter = 'blur(10px)';
      c.font = '500 120px "IBM Plex Mono", monospace';
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.textBaseline = 'middle';
      c.fillText(w, 40, 128);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.55 }));
      const k = Math.floor(i / 3);
      m.position.set((i % 2 ? 1 : -1) * (2.2 + (i % 3) * 0.9), (k + 1) * OFFSET + ((i % 3) - 1) * 1.3, -4 - (i % 3) * 1.5);
      m.userData.speed = 0.15 + (i % 3) * 0.12;
      m.userData.y = m.position.y;
      this.blurry.add(m);
    });
    this.scene.add(this.blurry);
  }

  buildShapes() {
    this.shapes = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false });
    for (let i = 0; i < this.projects.length + 1; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(1.6 + (i % 3) * 0.6, 0.012, 6, 96), mat);
      t.position.set((i % 2 ? 2.4 : -2.6), (i + 0.5) * OFFSET, -3);
      t.userData.spin = (i % 2 ? 1 : -1) * 0.1;
      this.shapes.add(t);
    }
    this.scene.add(this.shapes);
  }

  buildCube(p, i) {
    const n = this.projects.length;
    const group = new THREE.Group();
    const scrollPosition = (1 + i) * OFFSET;
    group.position.y = scrollPosition;
    const frost = new Frost();
    const u = {
      tTrans: { value: this.transRT.texture }, tFrost: { value: frost.texture }, tNoise: { value: this.ctx.noiseTex },
      uTransSize: { value: new THREE.Vector2(2, 2) }, uNoiseOffset: { value: this.noiseOffset },
      uIor: { value: 1.18 }, uCA: { value: 0.1 }, uThickness: { value: 2 }, uRoughness: { value: 0.65 }, uTime: this.ctx.uniforms.uTime, uActive: { value: 0 },
      uColor: { value: new THREE.Color('#a9b8ca') }, uFrostColor: { value: new THREE.Color('#83a1c5') },
      uSkyTop: { value: new THREE.Color('#eef1f7') }, uSkyBottom: { value: new THREE.Color('#5d6575') },
    };
    const ice = new THREE.Mesh(iceGeometry(100 + i * 7), new THREE.ShaderMaterial({ uniforms: u, vertexShader: iceVert, fragmentShader: iceFrag, side: THREE.FrontSide }));
    ice.renderOrder = 3;
    group.add(ice);
    const inner = emblem(p.id, p.color);
    inner.scale.setScalar(0.85);
    group.add(inner);

    // Smoke curling round the block's feet.
    const smoke = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.5), new THREE.ShaderMaterial({
      uniforms: { uTime: this.ctx.uniforms.uTime, uProgress: { value: 100 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); c.xy += position.xy; gl_Position = projectionMatrix * c; }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uProgress; varying vec2 vUv;
        ${GL_NOISE}
        void main() {
          vec2 st = vUv; st.y *= 0.75; st *= 1.5;
          float t = uTime * 0.075;
          float n = fbm(st * 3.0 + vec2(0.0, t)) * fbm(st * 1.5 + vec2(0.0, t) + 4.0);
          n *= 1.0 - clamp(length(vUv - 0.5) * 2.0, 0.0, 1.0);
          n *= length(vUv - 0.5) * 6.5 * 1.6;
          n *= clamp(1.0 - abs(uProgress) * 20.0, 0.0, 1.0);
          gl_FragColor = vec4(vec3(1.0), clamp(n, 0.0, 1.0) * 0.8);
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    }));
    smoke.position.y = -0.35;
    smoke.renderOrder = 15;
    group.add(smoke);

    // Plexus: 18 points round the block, joined where they come close.
    const rand = rng(500 + i);
    const pts = Array.from({ length: 18 }, () => {
      const a = rand() * Math.PI * 2, y = (rand() - 0.5) * 3.4, r = 1.25 + rand() * 0.9;
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    });
    const seg = [];
    pts.forEach((a, j) => pts.forEach((b, k) => { if (k > j && a.distanceTo(b) < 1.3) seg.push(a.x, a.y, a.z, b.x, b.y, b.z); }));
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    const plexusMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const plexus = new THREE.Group();
    plexus.add(new THREE.LineSegments(pg, plexusMat));
    const dg = new THREE.BufferGeometry().setFromPoints(pts);
    const dotMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.045, transparent: true, opacity: 0, depthWrite: false });
    plexus.add(new THREE.Points(dg, dotMat));
    plexus.position.y = scrollPosition;
    this.scene.add(plexus);

    // The label on its leader line: PROJECT_01 Relay, the year and what it is, the number.
    const idx = String(i + 1).padStart(2, '0');
    const metric = p.metrics[0];
    const tex = textTexture([
      { text: `PROJECT_${idx}`, color: '#67707E', font: '500 40px "IBM Plex Mono", monospace' },
      { text: p.name, color: '#ffffff', font: '500 64px "IBM Plex Mono", monospace', lineHeight: 1.15 },
      { text: `${p.year} · ${p.kind.toUpperCase()}`, color: '#A1AAB7', font: '400 34px "IBM Plex Mono", monospace' },
      { text: `${metric[0]} ${metric[1]}`, color: '#A1AAB7', font: '400 34px "IBM Plex Mono", monospace' },
    ], { width: 1024, height: 300, pad: 24 });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 0.513), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
    label.renderOrder = 20;
    this.scene.add(label);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const leader = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false }));
    leader.renderOrder = 20;
    leader.frustumCulled = false;
    this.scene.add(leader);

    this.scene.add(group);
    this.cubes.push({
      p, i, group, ice, inner, smoke, plexus, plexusMat, dotMat, label, leader, frost, u,
      scrollPosition, centeredProgress: (1 + i) / (n + 1), rand: rng(900 + i)(), extra: { value: 1 },
    });
  }

  set isSceneVisible(v) {
    if (v && !this.visible) this.cubes.forEach((c) => { c.rand = Math.random(); });
    this.visible = v;
  }

  resize(w, h) {
    const cam = this.rig.camera;
    cam.aspect = w / h;
    cam.zoom = Math.min(1, (w / h) * 1.25);
    cam.updateProjectionMatrix();
    // The label sits up and left of the block; on a tall screen it moves above it to stay in view.
    this.labelLayout = w / h < 1 ? { x: -0.55, y: 1.75, s: 0.85 } : { x: -1.45, y: 1.05, s: 1 };
    this.cubes.forEach((c) => c.label.scale.setScalar(this.labelLayout.s));
    this.transRT.setSize(Math.max(2, Math.round(w * this.ctx.pixelRatio())), Math.max(2, Math.round(h * this.ctx.pixelRatio())));
    this.cubes.forEach((c) => c.u.uTransSize.value.set(this.transRT.width, this.transRT.height));
  }

  nearest() {
    let best = Infinity, idx = 0, delta = 0;
    this.cubes.forEach((c, i) => { const d = c.centeredProgress - this.progress; if (Math.abs(d) < best) { best = Math.abs(d); idx = i; delta = d; } });
    return { idx, delta };
  }

  // Igloo's autoCenter for this scene: glide to the nearest block, 1.6 to 2.4 s.
  autoCenter(controller) {
    const { delta } = this.nearest();
    const r = delta * (this.height + 1);
    controller.centerScroll(controller.scroll.y + r, clamp(Math.abs(r) * 6, 1.6, 2.4));
  }

  detailIn(delay = 0) {
    gsap.to(this.cameraZoom, { overwrite: true, value: -3.5, duration: 1.25 + delay, ease: 'power3.in' });
    gsap.to(this.cubes.map((c) => c.extra), { overwrite: true, value: 0, duration: 1 + delay, ease: 'power1.in' });
    gsap.to(this.rig, { touchAmount: 0, overwrite: true, duration: 1.25 + delay });
  }

  detailOut() {
    gsap.to(this.cameraZoom, { overwrite: true, value: 0, duration: 1.45, ease: 'power3.out' });
    gsap.to(this.cubes.map((c) => c.extra), { overwrite: true, value: 1, duration: 1.45, ease: 'power2.out' });
    gsap.to(this.rig, { touchAmount: 1, overwrite: true, duration: 1.45 });
  }

  // Which block is under the pointer, and where on it (for the frost).
  pick(mouse) {
    const { idx } = this.nearest();
    const c = this.cubes[idx];
    if (!this.visible || Math.abs(c.scrollPosition - this.rig.basePosition.y) > 2) return { idx: -1 };
    this.raycaster.setFromCamera(mouse, this.rig.camera);
    const hit = this.raycaster.intersectObject(c.ice, false)[0];
    return hit ? { idx, uv: hit.uv } : { idx: -1 };
  }

  update(dt, time, mouse, controller) {
    const n = this.projects.length;
    const e = (n + 1) * OFFSET * this.progress;
    const rig = this.rig;
    rig.basePosition.y = this.initialPosition.y + e;
    rig.baseTarget.y = this.initialTarget.y + e;
    rig.basePosition.z = this.initialPosition.z + this.cameraZoom.value;
    const cam = rig.camera;
    const vel = controller ? Math.abs(controller.scroll.velocity) : 0;
    cam.fov = 45 - 5 * vel;
    cam.updateProjectionMatrix();
    rig.update(dt, time, mouse);
    this.bgU.uProgress.value = this.progress;
    this.noiseOffset.set(Math.random(), Math.random());

    const pick = this.pick(mouse);
    this.hover = pick.idx;
    const detailOpen = controller && controller.detailOpen;
    this.cubes.forEach((c, s) => {
      const d = c.centeredProgress - this.progress;
      const r = c.scrollPosition - rig.basePosition.y;
      const o = ((s + this.cubes[0].rand) * 242.45353) % 1 < 0.5 ? -1 : 1;
      const dx = fit((c.rand * 12.3423) % 1, 0, 1, 0.1, 0.2), dy = fit((c.rand * 123.5343) % 1, 0, 1, 0.1, 0.3), dz = fit((c.rand * 54.654) % 1, 0, 1, 0.1, 0.25);
      const amp = 0.1 * c.extra.value, sg = Math.sign(c.rand - 0.5) || 1;
      c.group.rotation.y = 11 * o * (1 - dx) * d + Math.sin(time * 0.3 + c.rand * 12.423) * amp * sg;
      c.group.rotation.x = 14 * -o * (1 - dy) * d + Math.sin(time * 0.3 + c.rand * 42.987) * amp * sg;
      c.group.rotation.z = 6 * o * (1 - dz) * d + Math.sin(time * 0.3 + c.rand * 2.53) * amp * sg;
      c.inner.rotation.y = time * 0.35 + s;
      c.smoke.material.uniforms.uProgress.value = d;
      const near = clamp(1 - Math.abs(r) / 2.2, 0, 1);
      c.plexus.rotation.y = time * 0.05 + d * 4;
      c.plexusMat.opacity = near * 0.35;
      c.dotMat.opacity = near * 0.8;
      // Label on the upper left, joined to the block's top corner.
      const show = clamp(1 - Math.abs(r) / 1.2, 0, 1) * (detailOpen ? 0 : 1);
      c.label.material.opacity = lerpFPS(c.label.material.opacity, show, 0.12, dt);
      c.leader.material.opacity = c.label.material.opacity;
      const anchor = new THREE.Vector3(-0.35, 1.25, 0.4).applyEuler(c.group.rotation).add(c.group.position);
      const L = this.labelLayout || { x: -1.45, y: 1.05, s: 1 };
      c.label.position.set(L.x, c.scrollPosition + L.y + d * 6, 0.6);
      c.label.quaternion.copy(cam.quaternion);
      const lp = c.leader.geometry.attributes.position.array;
      const corner = c.label.position.clone().add(new THREE.Vector3(0.65 * L.s, -0.28 * L.s, 0).applyQuaternion(cam.quaternion));
      const elbow = corner.clone().add(new THREE.Vector3(0.35 * L.s, 0, 0).applyQuaternion(cam.quaternion));
      lp.set([corner.x, corner.y, corner.z, elbow.x, elbow.y, elbow.z, anchor.x, anchor.y, anchor.z]);
      c.leader.geometry.attributes.position.needsUpdate = true;
      c.u.uActive.value = s === pick.idx || c.frost.has ? 1 : lerpFPS(c.u.uActive.value, 1, 0.05, dt);
    });
    this.blurry.children.forEach((m) => { m.position.y = m.userData.y + this.progress * m.userData.speed * 20; });
    this.shapes.children.forEach((t, i) => { t.rotation.z = time * t.userData.spin + this.progress * (i % 2 ? 3 : -3); t.rotation.x = 0.6 + this.progress; });
    this.frostPick = pick;
  }

  render(renderer, target) {
    // Frost trails first, for the block under the mouse.
    const pick = this.frostPick || { idx: -1 };
    this.cubes.forEach((c, i) => {
      if (i === pick.idx && pick.uv) c.frost.step(renderer, pick.uv, 1);
      else if (c.u.uActive.value > 0 && Math.abs(c.centeredProgress - this.progress) < 0.25) c.frost.step(renderer, null, 0);
      c.u.tFrost.value = c.frost.texture;
    });
    // Pass 1: everything behind the ice, with the objects inside, into a mip-mapped target.
    this.cubes.forEach((c) => { c.ice.visible = false; c.inner.visible = true; c.smoke.visible = false; c.label.visible = false; c.leader.visible = false; });
    renderer.setRenderTarget(this.transRT);
    renderer.clear();
    renderer.render(this.scene, this.rig.camera);
    // Pass 2: the ice samples that, and the objects are only seen through it.
    this.cubes.forEach((c) => { c.ice.visible = true; c.inner.visible = false; c.smoke.visible = true; c.label.visible = true; c.leader.visible = true; });
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.rig.camera);
  }
}

// ─── the project view a block opens into (Igloo's detail scene) ───────────────────────────
export class DetailScene {
  constructor(ctx, projects) {
    this.ctx = ctx;
    this.name = 'detail';
    this.bloomThreshold = 0.5;
    this.bloomScale = 0.08;
    this.scene = new THREE.Scene();
    this.rig = new Rig(35);
    this.rig.basePosition.set(0, 0, 6);
    this.rig.displacement.position.set(0.05, 0.03);
    // Their HF: a dark diagonal gradient (#09121f to #6b7685, rotated -0.66), so the text reads.
    this.bgMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: ctx.uniforms.uTime, uResolution: ctx.uniforms.uResolution, uTint: { value: new THREE.Color('#ffffff') },
        uColor1: { value: new THREE.Color('#09121f') }, uColor2: { value: new THREE.Color('#6b7685') }, uRotation: { value: -0.66 },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        uniform float uTime, uRotation; uniform vec2 uResolution; uniform vec3 uTint, uColor1, uColor2; varying vec2 vUv;
        ${GL_NOISE}
        void main() {
          vec2 uv = vUv - 0.5;
          uv.x *= uResolution.x / uResolution.y;
          uv *= 0.5;
          float c = cos(uRotation), s = sin(uRotation);
          uv = mat2(c, -s, s, c) * uv + 0.5;
          float g = pow(clamp(uv.y, 0.0, 1.0), 3.0) * 0.5;
          g += (fbm(vUv * 3.0 + vec2(uTime * 0.03, -uTime * 0.02)) - 0.5) * 0.06;
          g += hash12(vUv * 1000.0 + uTime) * 0.01;
          vec3 col = mix(uColor1, uColor2, g);
          col = mix(col, col * uTint, 0.15);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    const bg = new THREE.Mesh(new THREE.BufferGeometry().copy(fullscreen(this.bgMat).mesh.geometry), this.bgMat);
    bg.frustumCulled = false;
    bg.renderOrder = -99;
    this.scene.add(bg);
    this.emblems = projects.map((p) => {
      const e = emblem(p.id, p.color);
      e.scale.setScalar(1.35);
      e.position.set(1.4, 0, 0);
      e.visible = false;
      this.scene.add(e);
      return e;
    });
    // Particles drifting round the object.
    const N = 700, rand = rng(44);
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([(rand() - 0.5) * 9, (rand() - 0.5) * 6, (rand() - 0.5) * 4], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uTime: ctx.uniforms.uTime, uPixel: ctx.uniforms.uPixel },
      vertexShader: /* glsl */`uniform float uTime, uPixel; varying float vA; void main() { vec3 p = position; p.y = mod(p.y + uTime * 0.1 + 3.0, 6.0) - 3.0; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 0.035 * uPixel * 600.0 / -mv.z; vA = 0.5 + 0.5 * sin(uTime + p.x * 3.0); }`,
      fragmentShader: /* glsl */`varying float vA; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.1, d) * vA * 0.6); }`,
      transparent: true, depthWrite: false,
    }));
    this.scene.add(this.points);
    this.index = 0;
  }

  show(i, color) {
    this.index = i;
    this.emblems.forEach((e, k) => { e.visible = k === i; });
    this.bgMat.uniforms.uTint.value.set(color);
    this.emblems[i].rotation.set(0.3, -0.6, 0);
    gsap.fromTo(this.emblems[i].rotation, { y: -1.6 }, { y: 0.2, duration: 2.4, ease: 'power3.out' });
  }

  resize(w, h) {
    const cam = this.rig.camera;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    // Wide: the object stands right of the 500px text column. Tall: above the text, smaller.
    const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 6, halfW = halfH * cam.aspect;
    const colEdge = (Math.min(500, w - 40) / w) * halfW;
    const room = halfW - colEdge;
    this.emblems.forEach((e) => {
      if (room > 1.7) {
        const s = Math.min(1.35, room / 2.1);
        e.scale.setScalar(s);
        e.position.set(colEdge + room * 0.5, 0, 0);
      } else {
        e.scale.setScalar(0.6);
        e.position.set(0, halfH * 0.58, 0);
      }
    });
  }

  update(dt, time, mouse) {
    this.rig.update(dt, time, mouse);
    const e = this.emblems[this.index];
    if (e) e.rotation.y += dt * 0.25;
  }

  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.rig.camera);
  }
}
