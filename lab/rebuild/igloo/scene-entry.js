// Scene 3, the entry. On igloo.inc you drop down a shaft under the igloo, through three shattered
// stone rings that light up as you pass, roll over and land in a round room where a cloud of
// particles holds the shape of each social link. Here the rings are the years (2023, 2024, 2025),
// the room is 2026, and the shapes are the ways to reach Alan: email, code and notes.
// Distances, the camera timeline and the shader logic follow the original (their UF scene and its
// parts); every mesh, texture and volume is generated below.
import * as THREE from 'three';
import { gsap, Rig, GL_FIT, GL_NOISE, FS_VERT, fullscreen, drawFS, fit, clamp, mix, smoothstep, lerpFPS, rng, bentBlock, mergeBlocks } from './lib.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const BLUE = new THREE.Color(0.5, 0.7, 1.0);

const GL_ENTRY = /* glsl */`
  vec2 rot2(vec2 v, float a) { float s = sin(a), c = cos(a); return mat2(c, s, -s, c) * v; }
  vec3 rotAxis(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
  // Six crossed sine waves: a smooth, cheap field for flicker and drifting gradients.
  float sineField(vec3 p) {
    return (sin(dot(p, vec3(1.3, 3.7, 1.1))) + sin(dot(p, vec3(3.3, -2.9, 3.9))) + sin(dot(p, vec3(0.5, 2.1, -1.7)))
          + sin(dot(p, vec3(-0.2, -3.1, -0.7))) + sin(dot(p, vec3(-3.7, -0.4, -1.3))) + sin(dot(p, vec3(2.2, -1.3, -2.6)))) / 6.0;
  }
  // The room's light: a diagonal ramp that breathes, the same behind every surface in the scene.
  vec3 roomGradient(vec2 frag, vec2 res, float t, vec3 c1, vec3 c2) {
    vec2 s = frag / res;
    float g = (s.x + s.y) * 0.5;
    g *= sineField(vec3(s, t * 0.61)) * 0.5 + 0.5;
    g *= sineField(vec3(s * 2.0, t * 0.17)) * 0.5 + 0.5;
    return mix(c1, c2, g);
  }
`;

// ─── geometry ─────────────────────────────────────────────────────────────────────────────
// A flat disc of rings: uv.x runs out from the centre, uv.y round it, like the smoke meshes
// the original lays over its rings, ceiling and floor.
function annulus(r0, r1, radial = 16, around = 96, dome = 0) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= radial; i++) {
    const u = i / radial, r = mix(r0, r1, u);
    for (let j = 0; j <= around; j++) {
      const v = j / around, a = v * Math.PI * 2;
      pos.push(Math.cos(a) * r, dome * (1 - u) * (1 - u), Math.sin(a) * r);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < radial; i++) for (let j = 0; j < around; j++) {
    const a = i * (around + 1) + j, b = a + around + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// A band of smoke that winds a third of a turn down the shaft.
function spiralRibbon() {
  const along = 72, across = 8, pos = [], uv = [], idx = [];
  for (let i = 0; i <= along; i++) {
    const s = i / along, a = s * Math.PI * 0.75;
    for (let k = 0; k <= across; k++) {
      const t = k / across, r = mix(1.25, 0.45, t);
      pos.push(Math.cos(a) * r, 0.5 - s * 1.2 + t * 0.15, Math.sin(a) * r);
      uv.push(s, t);
    }
  }
  for (let i = 0; i < along; i++) for (let k = 0; k < across; k++) {
    const a = i * (across + 1) + k, b = a + across + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// One shattered ring: a thick outer ring in eight stones, a thinner inner ring with gaps, and a
// few loose chunks. Built in the XY plane (the ring's axis is z), like the original's mesh before
// it is laid flat.
function shatteredRing(seed) {
  const rand = rng(seed);
  const blocks = [];
  const arcs = (rc, wr, h, n, gap, skip, jitter, round) => {
    const off = rand() * Math.PI * 2;
    for (let j = 0; j < n; j++) {
      if (skip && rand() < skip) continue;
      const a0 = off + (j / n) * Math.PI * 2 + gap / 2 + rand() * jitter * 0.3;
      const a1 = off + ((j + 1) / n) * Math.PI * 2 - gap / 2 - rand() * jitter;
      const r0 = rc - wr / 2 + (rand() - 0.5) * 0.02, r1 = rc + wr / 2 + (rand() - 0.5) * 0.02;
      const hh = h * (0.9 + rand() * 0.2);
      const place = (a, b, c) => {
        const t = mix(a0, a1, a), r = mix(r0, r1, c);
        return new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, mix(-hh / 2, hh / 2, b));
      };
      blocks.push({ geo: bentBlock(place, [((a1 - a0) / 2) * rc, hh / 2, wr / 2], round, [10, 3, 3]), centroid: place(0.5, 0.5, 0.5) });
    }
  };
  arcs(0.92, 0.24, 0.26, 8, 0.07, 0, 0.05, 0.06);
  arcs(0.58, 0.12, 0.15, 7, 0.28, 0.15, 0.25, 0.04);
  arcs(0.36, 0.08, 0.09, 6, 0.7, 0.35, 0.2, 0.03);
  return mergeBlocks(blocks);
}

// The floor of the room: a disc and six rings around it, each a separate stone that can tilt
// and sink a little, with gaps that glow from below.
function floorGeometry() {
  const radii = [[0, 0.34], [0.38, 0.6], [0.64, 0.86], [0.9, 1.13], [1.17, 1.41], [1.45, 1.7], [1.74, 2.0]];
  const parts = [];
  radii.forEach(([r0, r1], i) => {
    const pts = r0 === 0
      ? [[0.0, 0.087], [r1 - 0.03, 0.087], [r1, 0.06], [r1, -0.15]]
      : [[r0, -0.15], [r0, 0.06], [r0 + 0.03, 0.087], [r1 - 0.03, 0.087], [r1, 0.06], [r1, -0.15]];
    const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 160);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    g.setAttribute('aIteration', new THREE.BufferAttribute(new Float32Array(n).fill(i), 1));
    g.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(n).fill(i === 0 ? 0 : 1), 1));
    parts.push(g.toNonIndexed());
  });
  const base = new THREE.CircleGeometry(2.0, 96).rotateX(-Math.PI / 2).translate(0, -0.16, 0);
  base.deleteAttribute('uv');
  const bn = base.attributes.position.count;
  base.setAttribute('aIteration', new THREE.BufferAttribute(new Float32Array(bn), 1));
  base.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(bn), 1));
  parts.push(base.toNonIndexed());
  let count = 0;
  parts.forEach((p) => { count += p.attributes.position.count; });
  const out = new THREE.BufferGeometry();
  ['position', 'normal', 'aIteration', 'aMask'].forEach((name) => {
    const size = parts[0].attributes[name].itemSize;
    const arr = new Float32Array(count * size);
    let o = 0;
    parts.forEach((p) => { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  });
  return out;
}

// ─── the shapes in the room: signed distance volumes made from a drawn shape ──────────────
// The original loads one 64³ volume per link (gradient in rgb, signed distance in a). These are
// computed here: draw the shape, take its 2D distance field, extrude it, take the gradient.
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
function edt(grid, S) {
  const f = new Float64Array(S), d = new Float64Array(S), v = new Int32Array(S), z = new Float64Array(S + 1);
  for (let x = 0; x < S; x++) {
    for (let y = 0; y < S; y++) f[y] = grid[y * S + x];
    edt1d(f, S, d, v, z);
    for (let y = 0; y < S; y++) grid[y * S + x] = d[y];
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) f[x] = grid[y * S + x];
    edt1d(f, S, d, v, z);
    for (let x = 0; x < S; x++) grid[y * S + x] = Math.sqrt(d[x]);
  }
  return grid;
}

function drawShape(c, S, shape) {
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (shape === 'at') {
    c.font = `600 ${S * 0.84}px "IBM Plex Mono", monospace`;
    c.fillText('@', S / 2, S * 0.53);
  } else if (shape === 'code') {
    c.font = `600 ${S * 0.4}px "IBM Plex Mono", monospace`;
    c.fillText('</>', S / 2, S * 0.52);
  } else {
    // An open notebook, pages fanned.
    c.lineJoin = 'round';
    c.lineWidth = S * 0.035;
    const P = (pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x * S, y * S) : c.moveTo(x * S, y * S))); c.closePath(); c.fill(); };
    P([[0.1, 0.27], [0.3, 0.24], [0.47, 0.33], [0.47, 0.78], [0.3, 0.7], [0.1, 0.73]]);
    P([[0.53, 0.33], [0.7, 0.24], [0.9, 0.27], [0.9, 0.73], [0.7, 0.7], [0.53, 0.78]]);
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 4; i++) {
      c.fillRect(S * 0.16, S * (0.38 + i * 0.085), S * 0.24, S * 0.022);
      c.fillRect(S * 0.6, S * (0.38 + i * 0.085), S * 0.24, S * 0.022);
    }
    c.globalCompositeOperation = 'source-over';
  }
}

function shapeVolume(shape, N = 64, depth = 0.24) {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, S, S);
  drawShape(c, S, shape);
  const img = c.getImageData(0, 0, S, S).data;
  const inside = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) inside[i] = img[i * 4] > 127 ? 1 : 0;
  const BIG = 1e10;
  const toIn = edt(Float64Array.from(inside, (v) => (v ? 0 : BIG)), S);
  const toOut = edt(Float64Array.from(inside, (v) => (v ? BIG : 0)), S);
  const sd2 = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) sd2[i] = (inside[i] ? -(toOut[i] - 0.5) : toIn[i] - 0.5) / S;
  const sample2 = (u, v) => {
    const x = clamp(u * S - 0.5, 0, S - 1.001), y = clamp(v * S - 0.5, 0, S - 1.001);
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const a = sd2[j * S + i], b = sd2[j * S + i + 1], cc = sd2[(j + 1) * S + i], d = sd2[(j + 1) * S + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
  };
  const dist = new Float32Array(N * N * N);
  for (let z = 0; z < N; z++) {
    const dz = Math.abs((z + 0.5) / N - 0.5) - depth / 2;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        // Volume x runs right to left and y bottom to top as seen from the room's camera.
        const d2 = sample2(1 - (x + 0.5) / N, 1 - (y + 0.5) / N);
        const ox = Math.max(d2, 0), oz = Math.max(dz, 0);
        dist[(z * N + y) * N + x] = Math.hypot(ox, oz) + Math.min(Math.max(d2, dz), 0);
      }
    }
  }
  const data = new Uint8Array(N * N * N * 4);
  const at = (x, y, z) => dist[(clamp(z, 0, N - 1) * N + clamp(y, 0, N - 1)) * N + clamp(x, 0, N - 1)];
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let gx = at(x + 1, y, z) - at(x - 1, y, z), gy = at(x, y + 1, z) - at(x, y - 1, z), gz = at(x, y, z + 1) - at(x, y, z - 1);
    const l = Math.hypot(gx, gy, gz) || 1;
    gx /= l; gy /= l; gz /= l;
    const o = ((z * N + y) * N + x) * 4;
    data[o] = Math.round((gx * 0.5 + 0.5) * 255);
    data[o + 1] = Math.round((gy * 0.5 + 0.5) * 255);
    data[o + 2] = Math.round((gz * 0.5 + 0.5) * 255);
    data[o + 3] = Math.round(clamp(at(x, y, z) + 0.5, 0, 1) * 255);
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// ─── the pointer's wake: a small decaying velocity field in screen space ──────────────────
// The original runs a full fluid simulation (128², two pressure iterations) and samples its
// velocity under each particle. This keeps the part the particles feel: a velocity splat at the
// pointer that fades out.
class Wake {
  constructor() {
    const rt = () => new THREE.WebGLRenderTarget(128, 128, { type: THREE.HalfFloatType, depthBuffer: false });
    this.a = rt(); this.b = rt();
    this.pass = fullscreen(new THREE.ShaderMaterial({
      uniforms: { tPrev: { value: null }, uPoint: { value: new THREE.Vector2(0.5, 0.5) }, uForce: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uDecay: { value: 0.98 } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tPrev; uniform vec2 uPoint, uForce; uniform float uAspect, uDecay; varying vec2 vUv;
        void main() {
          vec2 v = texture2D(tPrev, vUv).xy * uDecay;
          vec2 d = vUv - uPoint; d.x *= uAspect;
          v += uForce * exp(-dot(d, d) / 0.0022);
          gl_FragColor = vec4(v, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.last = null;
  }
  get texture() { return this.a.texture; }
  step(renderer, mouse, aspect, dt) {
    const u = this.pass.material.uniforms;
    const p = new THREE.Vector2(mouse.x * 0.5 + 0.5, mouse.y * 0.5 + 0.5);
    if (!this.last) this.last = p.clone();
    const d = p.clone().sub(this.last);
    this.last.copy(p);
    u.uPoint.value.copy(p);
    u.uForce.value.set(d.x * aspect, d.y).multiplyScalar(22);
    u.uAspect.value = aspect;
    u.uDecay.value = Math.pow(0.98, dt * 60);
    u.tPrev.value = this.a.texture;
    drawFS(renderer, this.pass, this.b);
    [this.a, this.b] = [this.b, this.a];
    return d.length();
  }
}

// ─── the particle sculpture (their wF): 150k points held on a shape's surface ─────────────
const simFrag = /* glsl */`
  precision highp sampler3D;
  uniform sampler2D tPos, tVel, tOrig, tWake;
  uniform sampler3D tVolume;
  uniform mat4 uViewProj, uModel;
  uniform vec3 uRight, uUp, uLight;
  uniform float uTime, uDt, uRotation, uCube, uVolumeScale, uInteract, uExtraNoise, uShowNoise;
  layout(location = 1) out highp vec4 outVel;
  ${GL_NOISE}
  // An ABC flow: each component ignores its own axis, so the field has no divergence and the
  // cloud swirls without bunching up. It stands in for the original's bitangent noise.
  vec3 swirl(vec3 p, float t) {
    vec3 q = p + vec3(t * 0.31, t * 0.23, t * 0.17);
    vec3 a = vec3(sin(q.z) + cos(q.y), sin(q.x) + cos(q.z), sin(q.y) + cos(q.x));
    q = q * 1.93 + 4.1;
    a += 0.5 * vec3(sin(q.z) + cos(q.y), sin(q.x) + cos(q.z), sin(q.y) + cos(q.x));
    return a * 0.6;
  }
  void main() {
    ivec2 ij = ivec2(gl_FragCoord.xy);
    vec4 pos = texelFetch(tPos, ij, 0);
    vec4 vel = texelFetch(tVel, ij, 0);
    vec2 rnd = vec2(hash12(vec2(ij) + 0.5), hash12(vec2(ij) * 1.31 + 7.7));
    float c = cos(uRotation), s = sin(uRotation);
    mat3 R = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
    vec4 vol = texture(tVolume, R * (pos.xyz / uCube) * uVolumeScale + 0.5);
    vec3 grad = normalize(vol.rgb * 2.0 - 1.0 + 1e-4) * R;
    float dist = (vol.a * 2.0 - 1.0) * 0.5;

    // The pointer's wake pushes particles across the screen.
    vec4 clip = uViewProj * uModel * vec4(pos.xyz, 1.0);
    vec2 wake = texture(tWake, clip.xy / clip.w * 0.5 + 0.5).xy;
    vel.xyz += (uRight * wake.x + uUp * wake.y) * 0.0005 * uDt * uInteract;
    float hold = clamp(1.0 - length(wake) * 0.65 * uInteract, 0.0, 1.0);

    float extra = max(uExtraNoise, uShowNoise);
    vel.xyz += swirl(pos.xyz * 7.0, uTime * (1.0 + 0.7 * rnd.x)) * (0.0002 * (0.7 + 0.3 * rnd.x) + 0.0004 * extra) * uDt;
    vec4 orig = texelFetch(tOrig, ij, 0);
    vel.xyz += (orig.xyz - pos.xyz) * 0.001 * uDt * hold;
    // Outside the shape: fall onto its surface. Inside: stay put.
    float onto = dist > 0.0 ? -0.6 : 0.0;
    vel.xyz += grad * 0.0015 * (0.7 + 0.3 * rnd.y) * onto * uDt * hold;
    vel.xyz *= pow(0.9, uDt);
    pos.xyz += vel.xyz * uDt;
    pos.y = clamp(pos.y, -0.34, 0.35);
    float r = length(pos.xz);
    if (r > 0.275) pos.xz *= 0.275 / r;

    // Light wrapped round the surface normal, a little bounce, and dark inside the shape.
    vec3 L = normalize(uLight);
    float dp = dot(L, grad);
    float diffuse = max(0.0, (dp + 0.25) / 1.25) + max(0.0, -dp) * 0.1;
    float shade = mix(diffuse * 0.2, diffuse, smoothstep(-0.05, -0.001, dist));
    pos.w = mix(shade, pos.w, extra);
    vel.w = mix(vel.w, length(vel.xyz), 1.0 - pow(1.0 - 0.035, uDt));
    gl_FragColor = pos;
    outVel = vel;
  }
`;

class Sculpture {
  constructor(ctx, links, quality) {
    this.ctx = ctx;
    this.links = links;
    const N = (this.N = quality === 'low' ? 256 : 384);
    this.cube = 0.65;
    this.volumes = links.map(() => null);
    this.volumes[0] = shapeVolume(links[0].shape);
    this.wake = new Wake();
    const count = N * N, rand = rng(4242);
    const init = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) init.set([(rand() - 0.5) * this.cube, (rand() - 0.5) * this.cube, (rand() - 0.5) * this.cube, rand()], i * 4);
    const tex = (arr) => { const t = new THREE.DataTexture(arr, N, N, THREE.RGBAFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
    this.orig = tex(init);
    const startVel = tex(new Float32Array(count * 4));
    const floatOK = ctx.renderer.extensions.has('EXT_color_buffer_float');
    const rt = () => new THREE.WebGLRenderTarget(N, N, { count: 2, type: floatOK ? THREE.FloatType : THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
    this.read = rt(); this.write = rt();
    // Copy the start state in.
    const copy = fullscreen(new THREE.ShaderMaterial({
      uniforms: { tA: { value: this.orig }, tB: { value: startVel } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tA, tB; layout(location = 1) out highp vec4 outB;
        void main() { ivec2 ij = ivec2(gl_FragCoord.xy); gl_FragColor = texelFetch(tA, ij, 0); outB = texelFetch(tB, ij, 0); }`,
      depthTest: false, depthWrite: false,
    }));
    drawFS(ctx.renderer, copy, this.read);
    copy.material.dispose();
    this.sim = fullscreen(new THREE.ShaderMaterial({
      uniforms: {
        tPos: { value: null }, tVel: { value: null }, tOrig: { value: this.orig }, tWake: { value: this.wake.texture }, tVolume: { value: this.volumes[0] },
        uViewProj: { value: new THREE.Matrix4() }, uModel: { value: new THREE.Matrix4() }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) },
        uLight: { value: new THREE.Vector3(-0.75, 1, -0.1) }, uTime: ctx.uniforms.uTime, uDt: { value: 1 }, uRotation: { value: 0 }, uCube: { value: this.cube },
        uVolumeScale: { value: links[0].scale }, uInteract: { value: 0 }, uExtraNoise: { value: 0 }, uShowNoise: { value: 0 },
      },
      vertexShader: FS_VERT, fragmentShader: simFrag, depthTest: false, depthWrite: false,
    }));
    this.su = this.sim.material.uniforms;
    // The points: one per texel.
    const ref = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) ref.set([((i % N) + 0.5) / N, (Math.floor(i / N) + 0.5) / N], i * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aRef', new THREE.BufferAttribute(ref, 2));
    this.u = {
      tPos: { value: this.read.textures[0] }, tVel: { value: this.read.textures[1] }, uSize: { value: 10 }, uPixelH: { value: 900 },
      uDark: { value: new THREE.Color('#222b42') }, uLit: { value: new THREE.Color('#bdc6d4') }, uFast: { value: new THREE.Color('#d7ebfa') }, uFirst: { value: new THREE.Color('#b5d5ff') },
      uLight: this.su.uLight, uVisible: { value: 0 }, uAlpha: { value: 0 }, uGlow: { value: 1 },
    };
    this.mesh = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */`
        attribute vec2 aRef; uniform sampler2D tPos, tVel; uniform float uSize, uPixelH;
        varying float vShade, vSpeed;
        void main() {
          vec4 p = texture2D(tPos, aRef), v = texture2D(tVel, aRef);
          vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
          vShade = p.w; vSpeed = v.w;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize / length(mv.xyz) * (uPixelH / 1300.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uDark, uLit, uFast, uFirst, uLight; uniform float uVisible, uAlpha, uGlow;
        varying float vShade, vSpeed;
        ${GL_FIT}
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          if (dot(c, c) > 1.0 || uVisible < 0.5) discard;
          vec3 n = vec3(c.x, -c.y, sqrt(1.0 - dot(c, c)));
          float lit = max(0.0, dot(normalize(vec3(-uLight.x, uLight.y, -uLight.z)), n));
          vec3 color = mix(uDark, uLit, lit * vShade);
          color = mix(color, uFast, pow(fit(vSpeed, 0.003, 0.005, 0.0, 1.0), 2.0));
          float a = max(uGlow, pow(fit(vSpeed, 0.002, 0.007, 1.0, 0.0), 2.0) * 0.5 + 0.5);
          color = mix(color, mix(vec3(1.0), uFirst, clamp(uAlpha, 0.0, 1.0)), uGlow);
          gl_FragColor = vec4(clamp(color, 0.0, 1.0), a * uAlpha);
        }`,
      transparent: true, depthWrite: true,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.position.set(0, -9.785, 0);
    this.mesh.renderOrder = 6;
    this.current = 0;
    this.sway = 0;
    this.kick = { value: 0 };
  }

  // Build the other shapes after the first frame, as the original streams its volumes in.
  loadRest() {
    this.links.forEach((l, i) => { if (!this.volumes[i]) setTimeout(() => { this.volumes[i] = shapeVolume(l.shape); }, 200 + i * 150); });
  }

  warm(renderer, steps = 90) {
    this.su.uShowNoise.value = 1;
    for (let i = 0; i < steps; i++) this.step(renderer, null, 1 / 60, 0);
    this.u.uVisible.value = 1;
  }

  set(i, dir) {
    if (!this.volumes[i]) this.volumes[i] = shapeVolume(this.links[i].shape);
    this.current = i;
    this.su.tVolume.value = this.volumes[i];
    this.su.uVolumeScale.value = this.links[i].scale;
    gsap.fromTo(this.su.uExtraNoise, { value: 1 }, { value: 0, duration: 0.5, ease: 'power2.inOut', overwrite: true });
    gsap.fromTo(this.kick, { value: 1.6 * dir }, { value: 0, duration: 2.4, ease: 'power3.out', overwrite: true });
  }

  step(renderer, camera, dt, time) {
    const su = this.su;
    su.uDt.value = clamp(dt * 60, 0, 3);
    // The shape turns, but only as far as it still reads: a slow sway, kicked on each switch.
    su.uRotation.value = Math.sin(time * 0.5) * 0.6 + this.kick.value;
    if (camera) {
      this.mesh.updateMatrixWorld();
      su.uModel.value.copy(this.mesh.matrixWorld);
      su.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      su.uRight.value.setFromMatrixColumn(camera.matrixWorld, 0);
      su.uUp.value.setFromMatrixColumn(camera.matrixWorld, 1);
    }
    su.tPos.value = this.read.textures[0];
    su.tVel.value = this.read.textures[1];
    su.tWake.value = this.wake.texture;
    drawFS(renderer, this.sim, this.write);
    [this.read, this.write] = [this.write, this.read];
    this.u.tPos.value = this.read.textures[0];
    this.u.tVel.value = this.read.textures[1];
  }
}

// ─── the scene ────────────────────────────────────────────────────────────────────────────
export class EntryScene {
  constructor(ctx, { career, links, quality = 'high' }) {
    this.ctx = ctx;
    this.name = 'entry';
    this.height = 5.5;
    this.progress = 0;
    this.lastProgress = 0;
    this.direction = 1;
    this.visible = false;
    this.initialScrollAutocenter = 0.2;
    this.finalScrollAutocenter = 0.76;
    this.bloomThreshold = 0;
    this.bloomScale = 0.08;
    this.career = career;
    this.links = links;
    this.currentLink = 0;
    this.roomActive = false;
    this.portalsVolume = 0;
    this.particlesVolume = 0;
    this.scene = new THREE.Scene();
    const rig = (this.rig = new Rig(25));
    rig.basePosition.set(0, 5.5, 0);
    rig.baseTarget.set(0, 0, 0);
    rig.lerpPosition = 0.02;
    rig.lerpTarget = 0.015;
    rig.shake.setScalar(0.02);
    rig.shakeSpeed.setScalar(0.25);
    this.tlPos = new THREE.Vector3();
    this.tlTarget = new THREE.Vector3();
    this.tlDisp = new THREE.Vector2();
    this.tlDispTarget = new THREE.Vector2();
    this.tlRot = { value: 0 };
    this.extra = { upRotation: 0, upOriginal: 0 };
    this.fov = { value: 22 };
    this.floorTime = { value: 0 };
    // The pass this scene adds after its render (their DF): a radial smear and square glitches
    // as you cross each ring, and a cold glare from the top right.
    this.post = { uRingProximity: { value: 0 }, uSquare: { value: new THREE.Vector3() }, uGlare: { value: 1 } };
    this.u = {
      uTime: ctx.uniforms.uTime, uResolution: ctx.uniforms.uResolution,
      uBg1: { value: new THREE.Color('#6a6f7d') }, uBg2: { value: new THREE.Color('#cfd5e1') },
      tCloud: { value: ctx.cloudTex },
    };
    this.buildLightRoom();
    this.buildTunnel();
    this.buildRings();
    this.buildRingFields();
    this.buildPlasma();
    this.buildSmokeTrails();
    this.buildSnow();
    this.buildTextCylinders();
    this.buildFloor();
    this.buildRoomRing();
    this.buildForcefield();
    this.buildRoomSmoke();
    this.buildAmbient();
    this.sculpture = new Sculpture(ctx, links, quality);
    this.sculpture.warm(ctx.renderer);
    this.sculpture.loadRest();
    this.scene.add(this.sculpture.mesh);
    this.createTimeline();
  }

  // The room the whole shaft sits in: a huge sphere with the gradient and a field of dots.
  buildLightRoom() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec2 uResolution; uniform vec3 uBg1, uBg2; varying vec2 vUv;
        ${GL_NOISE}
        ${GL_ENTRY}
        void main() {
          vec3 color = roomGradient(gl_FragCoord.xy, uResolution, uTime, uBg1, uBg2) * 1.1;
          vec2 d = vUv * vec2(200.0, 100.0);
          float dots = smoothstep(0.12, 0.05, length(fract(d) - 0.5));
          float id = hash12(floor(d));
          color += dots * (1.0 - abs(fract(id + uTime * 0.1) - 0.5) * 2.0) * 0.8;
          gl_FragColor = vec4(color, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 32), mat);
    m.position.y = -12.15;
    m.renderOrder = -10;
    m.frustumCulled = false;
    this.scene.add(m);
  }

  smokeMaterial(frag, extra = {}, opts = {}) {
    return new THREE.ShaderMaterial({
      uniforms: { ...this.u, uAlpha: { value: 1 }, ...extra },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vWorld, vLocal; varying float vDepth;
        void main() {
          vUv = uv; vLocal = position;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vec4 mv = viewMatrix * w;
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uAlpha; uniform vec2 uResolution; uniform sampler2D tCloud;
        varying vec2 vUv; varying vec3 vWorld, vLocal; varying float vDepth;
        ${GL_FIT}
        float cloud(vec2 p) { return texture2D(tCloud, p).r; }
        void main() { ${frag} }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...opts,
    });
  }

  // Smoke on the shaft wall.
  buildTunnel() {
    const g = new THREE.CylinderGeometry(1.3, 1.3, 9, 64, 32, true).translate(0, -4.5, 0);
    const mat = this.smokeMaterial(`
      vec2 uv = vUv * vec2(1.0, 0.25); uv.x += uv.y;
      float t = uTime * 0.05;
      float v = cloud(uv * 3.0 + vec2(-t, t * 0.7)) * cloud(uv * 4.0 + vec2(-t, t * 0.7)) * cloud(uv * 6.0 + vec2(-t, t * 0.7));
      v *= smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
      float a = pow(v, 3.0) * 1.4;
      gl_FragColor = vec4(vec3(0.75, 0.8, 0.9), a);`, {}, { side: THREE.BackSide });
    this.tunnel = new THREE.Mesh(g, mat);
    this.tunnel.position.y = 1;
    this.tunnel.renderOrder = 1;
    this.scene.add(this.tunnel);
  }

  // Three rings, one per year before this one. Their numbers glow round the top as you pass.
  buildRings() {
    const vert = /* glsl */`
      attribute vec3 aCentroid, aRand; attribute float aEmission;
      uniform float uTime;
      varying vec3 vView, vNormalW, vLocal; varying float vEm, vNear, vFade;
      ${GL_FIT}
      ${GL_ENTRY}
      void main() {
        vec3 T = modelMatrix[3].xyz;
        float first = falloff(T.y, -1.66, -1.661, 0.01, 0.5);
        float camOut = clamp(-cameraPosition.z * 0.8, 0.0, 1.0);
        float dist = distance(cameraPosition, T);
        vNear = falloffsmooth(dist, 14.0, 2.0, 13.0, 0.75);
        float apart = 1.0 - smoothstep(0.2, 0.4, 1.0 - vNear);
        float depth = -(modelViewMatrix * vec4(position, 1.0)).z;
        vec3 pivot = aCentroid * 0.3, axis = normalize(aRand * 2.0 - 1.0 + 1e-4);
        float ang = 0.5 * smoothstep(1.5, 12.0, depth) + first * camOut * 0.5;
        vec3 pos = rotAxis(position - pivot, axis, ang) + pivot;
        vec3 nrm = rotAxis(normal, axis, ang);
        pos += aCentroid * apart * mix(0.075, 0.15, aRand.z);
        pos += aRand.y * aCentroid * apart * sin(aRand.x * 5.0 + uTime * 0.5 + (aCentroid.x + aCentroid.y + aCentroid.z) * 15.0) * 0.05;
        pos += aCentroid * camOut * 0.15 * first;
        float spin1 = falloffsmooth(dist, 8.0, 2.0, 5.0, 0.5), spin2 = falloffsmooth(dist, 10.0, 2.0, 8.0, 0.5);
        float a1 = spin1 * 3.14159 * 0.3, a2 = spin2 * 3.14159 * 0.3 + T.y * 0.25 + 1.5;
        pos.xz = rot2(pos.xz, a1); nrm.xz = rot2(nrm.xz, a1);
        pos.xy = rot2(pos.xy, a2); nrm.xy = rot2(nrm.xy, a2);
        vFade = falloffsmooth(dist, 2.0, 16.0, 9.0, 0.5);
        vEm = aEmission; vLocal = position;
        vNormalW = normalize(mat3(modelMatrix) * nrm);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`;
    const frag = /* glsl */`
      uniform float uTime; uniform vec2 uResolution; uniform vec3 uBg1, uBg2, uLit, uShade;
      varying vec3 vView, vNormalW, vLocal; varying float vEm, vNear, vFade;
      ${GL_NOISE}
      ${GL_ENTRY}
      void main() {
        vec3 n = normalize(vNormalW);
        if (!gl_FrontFacing) n = -n;
        float l = max(dot(n, normalize(vec3(-0.35, 1.0, 0.25))), 0.0);
        float grain = vnoise(vLocal.xy * 38.0 + vLocal.z * 11.0) * 0.55 + vnoise(vLocal.xy * 7.0 + 3.0) * 0.45;
        vec3 stone = mix(uShade, uLit, l * 0.75 + 0.25) * (0.78 + 0.38 * grain);
        vec3 color = mix(roomGradient(gl_FragCoord.xy, uResolution, uTime, uBg1, uBg2) * 1.1, stone, vFade * 0.95);
        float glow = smoothstep(0.2, 0.4, 1.0 - vNear);
        float n1 = (sineField(vView + uTime * 0.5 + stone.r * 5.0) * 0.5 + 0.5) * 0.5 + 0.5;
        float centred = pow(1.0 - clamp(-cameraPosition.z, 0.0, 1.0), 4.0);
        color += (0.45 + 0.55 * vEm) * vec3(0.5, 0.7, 1.0) * n1 * glow * 0.8 * centred;
        gl_FragColor = vec4(color, 1.0);
      }`;
    // The year round the top of each ring: the text follows the ring's spin.
    const textFrag = /* glsl */`
      uniform sampler2D tMap; uniform float uTime;
      varying vec3 vLocal; varying float vNear, vFade;
      void main() {
        float ang = atan(vLocal.y, vLocal.x);
        float u = fract(-ang / 6.2831853);
        float v = (length(vLocal.xy) - 0.855) / 0.13;
        float ink = texture2D(tMap, vec2(u, 1.0 - v)).r;
        float glow = smoothstep(0.2, 0.4, 1.0 - vNear);
        float centred = pow(1.0 - clamp(-cameraPosition.z, 0.0, 1.0), 4.0);
        float a = ink * glow * centred * vFade * (0.75 + 0.25 * sin(uTime * 2.0 + u * 30.0));
        gl_FragColor = vec4(vec3(0.75, 0.88, 1.0) * 1.6, a);
      }`;
    const textVert = /* glsl */`
      varying vec3 vLocal; varying float vNear, vFade;
      ${GL_FIT}
      ${GL_ENTRY}
      void main() {
        vec3 T = modelMatrix[3].xyz;
        float dist = distance(cameraPosition, T);
        vNear = falloffsmooth(dist, 14.0, 2.0, 13.0, 0.75);
        vFade = falloffsmooth(dist, 2.0, 16.0, 9.0, 0.5);
        float spin1 = falloffsmooth(dist, 8.0, 2.0, 5.0, 0.5), spin2 = falloffsmooth(dist, 10.0, 2.0, 8.0, 0.5);
        vec3 pos = position;
        pos.xz = rot2(pos.xz, spin1 * 3.14159 * 0.3);
        pos.xy = rot2(pos.xy, spin2 * 3.14159 * 0.3 + T.y * 0.25 + 1.5);
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }`;
    this.rings = [];
    let y = 1.65;
    for (let r = 0; r < 3; r++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...this.u, uLit: { value: new THREE.Color('#a3a9b6') }, uShade: { value: new THREE.Color('#3a404d') } },
        vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(shatteredRing(300 + r * 17), mat);
      mesh.position.y = -y;
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      const step = this.career[r];
      const text = new THREE.Mesh(new THREE.RingGeometry(0.855, 0.985, 160, 1), new THREE.ShaderMaterial({
        uniforms: { uTime: this.u.uTime, tMap: { value: ringText(`${step[1]} · ${step[0].toUpperCase()} · `) } },
        vertexShader: textVert, fragmentShader: textFrag,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      text.position.z = 0.142;
      text.renderOrder = 4;
      mesh.add(text);
      this.rings.push(mesh);
      y += 2.5;
    }
  }

  // The disc of light in each ring (their bF): it closes in as you near it.
  buildRingFields() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.u },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vWorld; varying float vNear;
        ${GL_FIT}
        ${GL_ENTRY}
        void main() {
          vUv = uv;
          vec3 T = modelMatrix[3].xyz;
          float dist = distance(cameraPosition, T);
          float spin1 = falloffsmooth(dist, 8.0, 2.0, 5.0, 0.5), spin2 = falloffsmooth(dist, 10.0, 2.0, 8.0, 0.5);
          float firstTwo = falloff(T.y, -4.5, -4.51, 0.01, 0.5);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNear = smoothstep(3.5, 2.3, -mv.z);
          vec3 pos = position;
          pos.xz = rot2(pos.xz, spin1 * 3.14159 * 0.25 * (1.0 - firstTwo));
          pos.xy = rot2(pos.xy, spin2 * 3.14159 * 0.25 + T.y * 0.5);
          vec4 w = modelMatrix * vec4(pos, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform sampler2D tCloud;
        varying vec2 vUv; varying vec3 vWorld; varying float vNear;
        ${GL_NOISE}
        float aastep(float th, float v) { float w = length(vec2(dFdx(v), dFdy(v))) * 0.7071; return smoothstep(th - w, th + w, v); }
        void main() {
          float y = length(vUv - 0.5) * 2.0;
          float circle = 1.0 - step(0.98, y);
          float radial = smoothstep(0.5, 1.0, y);
          float edge = smoothstep(0.9, 0.85, y);
          float nz = texture2D(tCloud, vUv * 0.25 + vec2(vWorld.y)).b * texture2D(tCloud, vUv * 0.8 + vec2(vWorld.y)).b;
          nz = sin(nz * 13.0 + uTime - y * 10.0) * 0.5 + 0.5;
          float mask = aastep(0.2, nz) * (1.0 - nz * 0.75);
          float tri = triangles(vUv * 16.0 + nz * 0.3) * 4.0;
          float a = tri * mask + pow(mask, 5.0) * 0.5 + radial * 0.5;
          a = min(1.0, a * circle) * edge;
          a *= smoothstep(0.45 - vNear * 0.25, 0.75 - vNear * 0.3, length(vUv - 0.5));
          a *= (1.0 - clamp(-cameraPosition.z * 8.0, 0.0, 1.0)) * 0.65;
          gl_FragColor = vec4(vec3(0.7, 0.8, 1.0), a);
        }`,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.fields = [];
    let y = 1.5;
    for (let r = 0; r < 3; r++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = -y;
      m.scale.setScalar(0.65);
      m.renderOrder = 3 - r;
      this.scene.add(m);
      this.fields.push(m);
      y += 2.5;
    }
  }

  // The plasma round each ring (their MF).
  buildPlasma() {
    const mat = this.smokeMaterial(`
      vec2 uv = vUv * vec2(0.25, 0.5); uv.x += uv.y;
      float t = -uTime * 0.075;
      float wind = cloud(uv * 2.0 + vec2(-t, t * 0.7)) * cloud(uv * 4.0 + vec2(-t, t * 0.7)) * cloud(uv * 6.0 + vec2(-t, t * 0.7));
      float v = wind * smoothstep(0.3, 0.4, vUv.x) * smoothstep(0.6, 0.5, vUv.x);
      float glowMask = smoothstep(0.3, 0.45, vUv.x) * smoothstep(0.8, 0.4, vUv.x);
      v += glowMask * 0.3 + pow(glowMask, 2.0) * wind * 0.2;
      v *= (1.0 - smoothstep(2.0, 4.0, vDepth)) * smoothstep(0.4, 1.0, vDepth);
      float a = min(1.0, pow(v * 1.7, 4.0));
      a *= pow(1.0 - clamp(-cameraPosition.z, 0.0, 1.0), 4.0);
      gl_FragColor = vec4(vec3(0.65, 0.8, 1.0), a);`);
    const g = annulus(0.05, 1.35, 20, 128, 0.12);
    this.plasma = [];
    let y = 1.6;
    for (let r = 0; r < 3; r++) {
      const m = new THREE.Mesh(g, mat);
      m.position.y = -y;
      m.userData.turn = r * Math.PI * 0.5;
      m.renderOrder = 3 - r;
      this.scene.add(m);
      this.plasma.push(m);
      y += 2.5;
    }
  }

  // Smoke winding past each ring (their EF).
  buildSmokeTrails() {
    const mat = this.smokeMaterial(`
      vec2 uv = vUv * vec2(0.25, 0.5); uv.x += vWorld.z * 0.1;
      float t = uTime * 0.15;
      float v = cloud(uv * 3.0 + vec2(-t, t * 0.7)) * cloud(uv * 4.0 + vec2(-t, t * 0.7)) * cloud(uv * 6.0 + vec2(-t, t * 0.7));
      v *= smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.5, vUv.y) * (1.0 - abs((vUv.x - 0.5) * 2.0));
      v *= (1.0 - smoothstep(2.0, 15.0, vDepth)) * smoothstep(0.5, 2.0, vDepth);
      float a = min(1.0, pow(v * 2.4, 3.0)) * 0.55;
      gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), a);`, {}, { depthTest: false, blending: THREE.NormalBlending });
    const g = spiralRibbon();
    this.trails = [];
    let y = 1.6;
    for (let r = 0; r < 3; r++) {
      const m = new THREE.Mesh(g, mat);
      m.position.y = -y;
      m.userData.turn = r * Math.PI * 0.5;
      m.renderOrder = 3 - r;
      this.scene.add(m);
      this.trails.push(m);
      y += 2.5;
    }
  }

  // Flakes falling down the shaft with you (their CF).
  buildSnow() {
    const N = 200, rand = rng(61), pos = new Float32Array(N * 3), rnd = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos.set([rand() * 3 - 1.5, rand() * 8 - 4, rand() * 3 - 1.5], i * 3); rnd.set([rand(), rand(), rand()], i * 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */`
        attribute vec3 aRand; uniform float uTime; uniform vec2 uResolution;
        varying float vAngle, vAlpha; varying vec3 vRand;
        ${GL_ENTRY}
        void main() {
          vRand = aRand;
          vAngle = aRand.y * 6.28 + mix(0.5, 0.2, aRand.x) - uTime * mix(0.5, 1.0, aRand.x * 1.3);
          float t = uTime * mix(0.2, 1.0, aRand.x);
          vec3 p = position;
          p.y -= mix(0.4, 0.7, fract(aRand.x + aRand.y + aRand.z)) * uTime;
          float a = t * 0.5 + p.y;
          p.x += sin(a) * 0.4; p.z += cos(a) * 0.4;
          p.xz = rot2(p.xz, t * 0.5);
          p = mod(p + vec3(3.0, 4.0, 3.0), vec3(6.0, 8.0, 6.0)) - vec3(3.0, 4.0, 3.0);
          vec3 w = (modelMatrix * vec4(p, 1.0)).xyz;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vAlpha = smoothstep(8.0, 0.0, -w.y) * smoothstep(0.0, 2.0, -w.y) * (1.0 - min(1.0, length(w.xz) * 0.5));
          vAlpha *= smoothstep(0.5, 1.0, -mv.z) * smoothstep(0.0, 2.0, -mv.z);
          vAlpha *= (sin(uTime + aRand.x + aRand.z * 13.0) * 0.5 + 0.5) * 0.3;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 50.0 / length(mv.xyz) * (uResolution.y / 1300.0);
        }`,
      fragmentShader: /* glsl */`
        varying float vAngle, vAlpha; varying vec3 vRand;
        ${GL_ENTRY}
        void main() {
          vec2 uv = gl_PointCoord;
          float a = vAlpha * (1.0 - length(uv - 0.5) * 2.0);
          uv = rot2(uv - 0.5, vAngle) + 0.5;
          a *= pow(1.0 - abs(uv.x - 0.5), floor(vRand.y * 3.0 + 2.0));
          gl_FragColor = vec4(vec3(1.0), clamp(a, 0.0, 1.0));
        }`,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.snow = new THREE.Points(g, mat);
    this.snow.position.y = -3.5;
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 1;
    this.scene.add(this.snow);
  }

  // Out-of-focus words on cylinders: two in the room, two lining the shaft (their fF).
  buildTextCylinders() {
    const lines = [
      'GET IN TOUCH.', 'FORWARD DEPLOYED ENGINEER', '2023  2024  2025  2026', 'RELAY  TRACEWISE  ONBOARD',
      'DISPATCH  ATLAS  STUDIO  LAYERLINE', "FROM THE CUSTOMER'S DESK TO PRODUCTION", 'INFORMATION ENGINEERING', 'SHIP IT, THEN STAY',
    ];
    const cv = document.createElement('canvas');
    cv.width = 2048; cv.height = 512;
    const c = cv.getContext('2d');
    c.fillStyle = '#000';
    c.fillRect(0, 0, 2048, 512);
    c.filter = 'blur(7px)';
    c.fillStyle = '#fff';
    c.font = '500 46px "IBM Plex Mono", monospace';
    c.textBaseline = 'middle';
    const rand = rng(88);
    lines.forEach((l, i) => c.fillText(l, 40 + rand() * 900, 34 + i * 62));
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true).translate(0, 0.5, 0);
    const room = (frag, extra) => new THREE.ShaderMaterial({
      uniforms: { uTime: this.u.uTime, tMap: { value: tex }, uAlpha: { value: 0 }, uRepeat: { value: new THREE.Vector2(2, 1) }, ...extra },
      vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vPos; void main() { vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tMap; uniform float uTime, uAlpha; uniform vec2 uRepeat; varying vec2 vUv; varying vec3 vPos;
        ${GL_NOISE}
        ${GL_FIT}
        void main() {
          float rnd = hash12(vec2(floor(vUv.x * 12.0), 3.0));
          float a = texture2D(tMap, vUv * uRepeat).r;
          ${frag}
          gl_FragColor = vec4(vec3(1.0), a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const roomFrag = `
      a *= clamp(vPos.y * 2.0, 0.0, 1.0);
      a *= sin(uTime * 2.0 + rnd * 10.0 + vPos.x * 2.0 + vPos.z * 2.0) * 0.5 + 0.5;
      a *= falloffsmooth(length(vPos.xz), 0.0, 10.0, 3.0, uAlpha) * 0.7 * uAlpha;`;
    this.textRoomMat = room(roomFrag);
    const a = new THREE.Mesh(geo, this.textRoomMat);
    a.position.y = -10.33; a.scale.setScalar(1.75); a.renderOrder = 1;
    const bMat = room(roomFrag, { uAlpha: this.textRoomMat.uniforms.uAlpha, uRepeat: { value: new THREE.Vector2(3, 1) } });
    const b = new THREE.Mesh(geo, bMat);
    b.position.y = -10.33; b.scale.setScalar(3.5); b.rotation.y = Math.PI * 0.5; b.renderOrder = 0;
    const shaftFrag = `
      a *= sin(uTime * 2.0 + rnd * 10.0 + vPos.x * 2.0 + vPos.z * 2.0 + vPos.y) * 0.5 + 0.5;
      a *= 0.25 * uAlpha;`;
    const c3 = new THREE.Mesh(geo, room(shaftFrag, { uAlpha: { value: 1 }, uRepeat: { value: new THREE.Vector2(3, 6) } }));
    c3.position.y = -9.5; c3.scale.set(2, 9, 2); c3.renderOrder = 0;
    const c4 = new THREE.Mesh(geo, room(shaftFrag, { uAlpha: { value: 1 }, uRepeat: { value: new THREE.Vector2(4, 5) } }));
    c4.position.y = -9.5; c4.scale.set(3.3, 8, 3.3); c4.renderOrder = -1;
    this.textRoom = [a, b];
    this.textShaft = [c3, c4];
    this.scene.add(a, b, c3, c4);
  }

  // The rippled floor (their hF): stones that tilt and settle, light leaking from the gaps.
  buildFloor() {
    this.floorU = { uAlpha: { value: 0 }, uRotationTime: { value: 0 }, uLit: { value: new THREE.Color('#b9bfcc') }, uShade: { value: new THREE.Color('#4e5462') } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.u, ...this.floorU },
      vertexShader: /* glsl */`
        attribute float aIteration, aMask; uniform float uRotationTime;
        varying vec3 vPos, vOrig, vNrm;
        ${GL_ENTRY}
        void main() {
          vOrig = position;
          float t = uRotationTime;
          vec3 axis = rotAxis(normalize(vec3(0.0, 0.5, 1.0)), vec3(0.0, 1.0, 0.0), t * 1.25 + aIteration * 1.2);
          vec3 pos = rotAxis(position, axis, 0.03 * aMask);
          vNrm = rotAxis(normal, axis, 0.03 * aMask);
          pos.y -= sin(aIteration - t) * 0.01 * aMask + aMask * 0.04;
          vPos = pos;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uAlpha; uniform vec3 uLit, uShade;
        varying vec3 vPos, vOrig, vNrm;
        ${GL_FIT}
        ${GL_NOISE}
        void main() {
          vec3 n = normalize(vNrm);
          if (!gl_FrontFacing) n = -n;
          float r = length(vPos.xz);
          float grain = vnoise(vPos.xz * 30.0) * 0.6 + vnoise(vPos.xz * 6.0 + 2.0) * 0.4;
          vec3 color = mix(uShade, uLit, clamp(n.y * 0.65 + 0.2 + dot(n, normalize(vec3(-0.5, 0.4, 0.3))) * 0.25, 0.0, 1.0)) * (0.82 + 0.3 * grain);
          color *= mix(0.65, 1.0, vPos.x * 0.5 + 0.5);
          color += (vPos.x + 1.0) * 0.02;
          float alpha = falloffsmooth(r * 3.0, 0.0, 6.0, 3.0, uAlpha) * smoothstep(1.99, 1.3, r);
          // A soft shadow under the sculpture that shivers with its light.
          float shadow = pow(min(1.0, length(vPos * 1.5 + vec3(1.15, 0.0, -0.55))), 2.0);
          shadow += sin(uTime * 3.3 + vPos.z * 5.0) * 0.1 + 0.1 + sin(uTime * 3.1 + vPos.x * 4.0) * 0.1 + 0.1;
          color *= mix(vec3(0.5, 0.7, 1.0) * 0.1, vec3(1.0), mix(0.5, 1.0, shadow));
          vec3 blue = vec3(0.5, 0.7, 1.0) * (1.0 - smoothstep(1.4, 1.6, r));
          float under = smoothstep(0.087, -0.1, vOrig.y);
          float ripple = smoothstep(0.087, 0.05, vOrig.y) * (sin(vPos.z * 5.0 + r * 10.0 - uTime * 0.75) * 0.5 + 0.5);
          color += blue * under + blue * ripple;
          gl_FragColor = vec4(color, alpha);
        }`,
      transparent: true, side: THREE.DoubleSide,
    });
    this.floor = new THREE.Mesh(floorGeometry(), mat);
    this.floor.position.y = -10.19;
    this.floor.scale.setScalar(0.73);
    this.floor.rotation.y = Math.PI;
    this.floor.renderOrder = 3;
    this.scene.add(this.floor);
  }

  // The halo in the ceiling (their oF).
  buildRoomRing() {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(Math.PI * 0.5).translate(0, 1.5, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.u.uTime },
      vertexShader: /* glsl */`
        uniform float uTime; varying vec2 vUv;
        ${GL_ENTRY}
        void main() { vUv = uv; vec3 p = position; p.xz = rot2(p.xz, -uTime * 0.2); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime; varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5);
          float a = smoothstep(0.5, 0.3, d) * smoothstep(0.3, 0.4, d) * smoothstep(0.03, 0.1, abs(vUv.x - 0.5));
          a *= mix(1.0, 0.8, sin(uTime * 2.0 + d + vUv.x * 2.0 + vUv.y) * 0.5 + 0.5);
          gl_FragColor = vec4(vec3(2.0), a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.roomRing = new THREE.Mesh(g, mat);
    this.roomRing.position.y = -10.26;
    this.roomRing.scale.setScalar(0.57);
    this.roomRing.renderOrder = 3;
    this.scene.add(this.roomRing);
  }

  // The column of light round the sculpture (their uF).
  buildForcefield() {
    const g = new THREE.CylinderGeometry(1, 1, 3, 64, 6, true).translate(0, 1.5, 0);
    this.forcefieldU = { uAlpha: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.u, ...this.forcefieldU },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vWorld, vNormal, vEye;
        void main() {
          vUv = uv;
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          vNormal = normalMatrix * normal;
          vEye = -(modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uAlpha; varying vec2 vUv; varying vec3 vWorld, vNormal, vEye;
        ${GL_NOISE}
        ${GL_ENTRY}
        void main() {
          vec2 uv = vUv; uv.x *= 2.0;
          float t = uTime * 0.5;
          float nz = (sineField(vWorld * 4.0 + vec3(0.0, t * 0.45, -t * 0.13)) * 0.5 + 0.5) * (sineField(vWorld * 2.0 + vec3(t * 0.3, -t * 0.27, t * 0.2)) * 0.5 + 0.5);
          nz = pow(sin(nz * 15.0 - t * 7.0) * 0.5 + 0.5, 4.0);
          float tri = triangles(uv * vec2(12.0, 6.0) + nz * 0.4);
          float fres = 1.0 - max(0.0, dot(normalize(vNormal), normalize(vEye)));
          float soft = 1.0 - smoothstep(0.65, 0.99, fres);
          fres = mix(fres, 1.0, 0.25);
          float top = 1.0 - smoothstep(0.5, 1.0, vUv.y);
          float a = (nz * tri * 2.0 + nz * 0.03) * fres * soft * top * uAlpha;
          gl_FragColor = vec4(vec3(1.0), a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.forcefield = new THREE.Mesh(g, mat);
    this.forcefield.position.y = -10.13;
    this.forcefield.scale.setScalar(0.28);
    this.forcefield.renderOrder = 15;
    this.scene.add(this.forcefield);
  }

  // Smoke under the ceiling and over the floor (their TF and IF).
  buildRoomSmoke() {
    const g = annulus(0.02, 1, 16, 128);
    const ceiling = this.smokeMaterial(`
      vec2 s = gl_FragCoord.xy / uResolution;
      vec2 uv = vUv * vec2(0.5, 1.0); uv.x -= uv.y;
      float t = -uTime * 0.075;
      float wind = cloud(uv + vec2(-t, t * 0.7)) * cloud(uv * 2.0 + vec2(-t, t * 0.7)) * cloud(uv * 3.0 + vec2(-t, t * 0.7));
      float fade = smoothstep(0.135, 0.25, vUv.x) * smoothstep(1.0, 0.3, vUv.x);
      float a = pow(wind * fade * 1.8, 2.0) + pow(s.x, 2.0) * fade * 0.2;
      float inner = smoothstep(0.0, 0.1, vUv.x) * smoothstep(0.4, 0.1, vUv.x);
      a += inner * fade * 0.4 * s.x + inner * wind * s.x;
      gl_FragColor = vec4(vec3(0.9, 0.95, 1.0), a);`);
    this.ceiling = new THREE.Mesh(g, ceiling);
    this.ceiling.position.y = -9.4;
    this.ceiling.scale.set(2, 0.1, 2);
    this.ceiling.renderOrder = 2;
    this.groundU = { uAlpha: { value: 0 } };
    const ground = this.smokeMaterial(`
      vec2 s = gl_FragCoord.xy / uResolution;
      vec2 uv = vUv * vec2(0.5, 1.0); uv.x -= uv.y;
      float t = uTime * 0.05 + 0.5;
      float wind = cloud(uv + vec2(-t, t * 0.7)) * cloud(uv * 2.0 + vec2(-t, t * 0.7)) * cloud(uv * 3.0 + vec2(-t, t * 0.7));
      float fade = smoothstep(0.4, 0.5, vUv.x) * smoothstep(1.0, 0.4, vUv.x);
      float a = (pow(wind * fade * 3.0, 3.0) + pow(s.x, 2.0) * fade * 0.15) * uAlpha;
      gl_FragColor = vec4(vec3(0.9, 0.95, 1.0), a);`, this.groundU);
    this.ground = new THREE.Mesh(g, ground);
    this.ground.position.y = -10.17;
    this.ground.scale.set(5, 0.1, 5);
    this.ground.renderOrder = 0;
    this.scene.add(this.ceiling, this.ground);
  }

  // Motes of light drifting in the room (their BF).
  buildAmbient() {
    const N = 60, rand = rng(73), pos = new Float32Array(N * 3), rnd = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos.set([rand() * 2.5 - 1.25, rand() * 0.5 - 0.25, rand() * 2.5 - 1.25], i * 3); rnd.set([rand(), rand(), rand()], i * 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
    this.ambientU = { uAlpha: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.u, ...this.ambientU },
      vertexShader: /* glsl */`
        attribute vec3 aRand; uniform float uTime; uniform vec2 uResolution; varying float vLight;
        void main() {
          float t = uTime * 0.1;
          vec3 p = position;
          p.x += sin(t * 0.4 + position.z * 2.5) * 0.75;
          p.y += sin(t * 0.2 + position.x * 2.5) * 0.75;
          p.z += sin(t * 0.2 + position.y * 2.5) * 0.75;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = mix(7.0, 12.0, aRand.x) * uResolution.y * 0.002;
          vLight = (sin(uTime * 1.8 + aRand.y * 22.43) * 0.4 + 0.6) * smoothstep(0.2, 0.24, length(p.xz)) * 1.25;
        }`,
      fragmentShader: /* glsl */`
        uniform float uAlpha; varying float vLight;
        void main() {
          vec2 uv = gl_PointCoord; uv.y = 1.0 - uv.y;
          float g = (1.0 - clamp(length(uv - 0.5) * 2.0, 0.0, 1.0)) * pow(uv.x, 2.0);
          gl_FragColor = vec4(vec3(1.0), pow(g, 2.0) * vLight * uAlpha);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.ambient = new THREE.Points(g, mat);
    this.ambient.position.y = -9.61;
    this.ambient.frustumCulled = false;
    this.ambient.renderOrder = 15;
    this.scene.add(this.ambient);
  }

  // Their camera timeline, 9.2 s long, scrubbed by the scroll.
  createTimeline() {
    const P = this.tlPos.set(0, 1.5, -2), T = this.tlTarget.set(0, -2.5, -1);
    const tl = (this.timeline = gsap.timeline({ paused: true, defaults: { overwrite: false }, onUpdate: () => this.onTimeline() }));
    tl.to(P, { z: 0, x: 0, duration: 2.5, ease: 'power2.out' }, 0);
    tl.to(T, { z: 0, x: 0, duration: 2.5, ease: 'power2.out' }, 0);
    tl.to(P, { y: -9.83, duration: 7, ease: 'entry_ease_3' }, 0.2);
    tl.to(T, { y: -10, duration: 3, ease: 'power1.inOut' }, 0.2);
    tl.to(T, { y: -9.81, duration: 2.5, ease: 'power1.inOut' }, 3.2);
    tl.to(this.extra, { upRotation: Math.PI, duration: 5.25, ease: 'power3.inOut' }, 1);
    tl.to(this.extra, { upOriginal: 1, duration: 3.7, ease: 'entry_ease' }, 3.5);
    tl.to(P, { z: -1.5, duration: 3.7, ease: 'entry_ease' }, 3.5);
    tl.to(P, { z: -3, duration: 2, ease: 'entry_ease_2' }, 7.2);
    tl.set(this.fov, { value: 22 }, 0);
    tl.to(this.fov, { value: 30, duration: 7.2, ease: 'power1.inOut' }, 0);
    tl.set(this.tlDisp, { x: 0.01, y: 0.005 }, 0);
    tl.set(this.tlRot, { value: 0 }, 0);
    tl.to(this.tlDisp, { x: 0, y: 0, duration: 1, ease: 'power2.inOut' }, 4);
    tl.to(this.tlDispTarget, { x: -0.03, y: -0.01, duration: 2, ease: 'power2.inOut' }, 4);
    tl.to(this.tlRot, { value: 0.05, duration: 2, ease: 'power2.inOut' }, 4);
    tl.to(T, { y: -10.35, duration: 2, ease: 'power2.in' }, 7.2);

    const sc = this.sculpture;
    tl.set(sc.mesh, { visible: false }, 0);
    tl.set(sc.mesh, { visible: true }, 1.5);
    tl.fromTo(sc.u.uAlpha, { value: 0 }, { value: 1, duration: 2.5, ease: 'power2.inOut' }, 1.5);
    tl.fromTo(sc.u.uGlow, { value: 1 }, { value: 0, duration: 1, ease: 'power1.inOut' }, 3.9);
    tl.fromTo(sc.su.uShowNoise, { value: 1 }, { value: 0, duration: 1.5, ease: 'power1.inOut' }, 3.5);
    tl.set(this.floor, { visible: false }, 0);
    tl.set(this.floor, { visible: true }, 3.4);
    tl.fromTo(this.floorU.uAlpha, { value: 0 }, { value: 1, duration: 5, ease: 'power2.out' }, 3.4);
    tl.set(this.textRoom, { visible: false }, 0);
    tl.set(this.textRoom, { visible: true }, 4.5);
    tl.fromTo(this.textRoomMat.uniforms.uAlpha, { value: 0 }, { value: 1, duration: 2, ease: 'power2.inOut' }, 4.5);
    tl.set(this.forcefield, { visible: false }, 0);
    tl.set(this.forcefield, { visible: true }, 4);
    tl.fromTo(this.forcefieldU.uAlpha, { value: 0 }, { value: 1, duration: 2, ease: 'power2.inOut' }, 4);
    tl.set([this.ground, this.ceiling], { visible: false }, 0);
    tl.set(this.ground, { visible: true }, 3.4);
    tl.set(this.ceiling, { visible: true }, 4.5);
    tl.fromTo(this.groundU.uAlpha, { value: 0 }, { value: 1, duration: 3, ease: 'power2.out' }, 4.4);
    tl.set(this.ambient, { visible: false }, 0);
    tl.set(this.ambient, { visible: true }, 3.4);
    tl.fromTo(this.ambientU.uAlpha, { value: 0 }, { value: 1, duration: 3, ease: 'power2.out' }, 4.4);

    // Crossing a ring: the frame smears round its centre and breaks into squares.
    const square = (dirAware = null, force = null) => {
      const a = force !== null ? force : dirAware === null || this.direction === -1 ? 1 : 0.5;
      this.post.uSquare.value.set(Math.random() * 25.424, Math.random() * 64.453, a);
    };
    const prox = this.post.uRingProximity;
    [[2, 0.4], [2.95, 0.4], [3.8, 0.6]].forEach(([t, out], k) => {
      tl.call(k === 2 ? () => square(true) : () => square(), null, t);
      tl.fromTo(prox, { value: 0 }, { value: 1, duration: 0.5, ease: 'power1.in', immediateRender: false }, t);
      tl.fromTo(prox, { value: 1 }, { value: 0, duration: out, ease: 'power1.out', immediateRender: false }, t + 0.5);
    });
    tl.call(() => square(false, 0.5), null, 4.9);
    tl.progress(1).progress(0);
  }

  onTimeline() {
    const p = this.progress;
    this.rings[0].visible = p < 0.34;
    this.rings[1].visible = p < 0.43;
    this.rings[2].visible = p < 0.52;
    this.fields[0].visible = p > 0.1 && p < 0.34;
    this.fields[1].visible = p > 0.25 && p < 0.43;
    this.fields[2].visible = p > 0.36 && p < 0.52;
    this.plasma[0].visible = p > 0.06 && p < 0.34;
    this.plasma[1].visible = p > 0.25 && p < 0.43;
    this.plasma[2].visible = p > 0.35 && p < 0.52;
    this.trails[0].visible = p > 0 && p < 0.37;
    this.trails[1].visible = p > 0 && p < 0.47;
    this.trails[2].visible = p > 0 && p < 0.56;
    this.tunnel.visible = p < 0.52;
    this.snow.visible = p < 0.52;
    this.roomRing.visible = p > 0.53;
    let n = Infinity;
    [0.28, 0.375, 0.465].forEach((r) => { n = Math.min(n, Math.abs(p - r)); });
    this.portalsVolume = Math.pow(1 - fit(n, 0, 0.04, 0, 1), 3) * 0.9;
  }

  // Which step of the path the camera is at: the degree above the shaft, a year per ring, now
  // in the room.
  get pathStep() {
    const p = this.progress;
    return p < 0.235 ? -1 : p < 0.33 ? 0 : p < 0.42 ? 1 : p < 0.51 ? 2 : 3;
  }

  changeLink(dir = 1) {
    const n = this.links.length;
    this.currentLink = (this.currentLink + dir + n) % n;
    this.sculpture.set(this.currentLink, dir);
    gsap.to(this.floorTime, { value: this.floorTime.value - 4 * dir, duration: 3, ease: 'power4.out', overwrite: true });
    this.splat = Math.min(1.5, (this.splat || 0) + 1);
  }

  set isSceneVisible(v) {
    if (v && !this.visible) { this.lastProgress = this.progress; this.direction = 1; this.rig.snap(); }
    if (!v) { this.portalsVolume = 0; this.particlesVolume = 0; this.roomActive = false; }
    this.visible = v;
  }

  resize(w, h) {
    const cam = this.rig.camera;
    cam.aspect = w / h;
    cam.zoom = Math.min(1, (w / h) * 1.5);
    cam.updateProjectionMatrix();
    this.sculpture.u.uPixelH.value = h * this.ctx.pixelRatio();
  }

  autoCenter(controller) {
    if (this.progress > 0.15) {
      const s = (this.finalScrollAutocenter - this.progress) * (this.height + 1);
      controller.centerScroll(controller.scroll.y + s, clamp(Math.abs(s) * 4, 2, 20));
    }
  }

  update(dt, time, mouse) {
    this.direction = this.progress > this.lastProgress ? 1 : this.progress < this.lastProgress ? -1 : this.direction;
    this.lastProgress = this.progress;
    this.timeline.progress(this.progress);
    const up = this.extra.upRotation;
    this.rings.forEach((r) => { r.rotation.z = up * 0.4; });
    this.textShaft[1].rotation.y = up * 0.65;
    this.textShaft[0].rotation.y = up * 0.65 + 2;
    this.tunnel.rotation.y = up * 0.65;
    this.trails.forEach((m) => { m.rotation.y = m.userData.turn + up * 0.5; });
    this.plasma.forEach((m) => { m.rotation.y = m.userData.turn + up * 0.5; });
    const rig = this.rig, cam = rig.camera;
    rig.basePosition.copy(this.tlPos);
    rig.baseTarget.copy(this.tlTarget);
    rig.displacement.position.copy(this.tlDisp);
    rig.displacement.target.copy(this.tlDispTarget);
    rig.displacement.rotation = this.tlRot.value;
    rig.baseUp.set(0, 0, -1).applyAxisAngle(Y_AXIS, up).lerp(Y_AXIS, this.extra.upOriginal).normalize();
    if (cam.fov !== this.fov.value) { cam.fov = this.fov.value; cam.updateProjectionMatrix(); }
    rig.update(dt, time, mouse);
    cam.updateMatrixWorld();
    this.floorU.uRotationTime.value = time * 0.5 + this.floorTime.value;
    const p = this.progress;
    this.interact = smoothstep(0.45, 0.65, p) * (1 - smoothstep(0.8, 0.93, p));
    this.sculpture.su.uInteract.value = this.interact;
    this.roomActive = this.visible && p > 0.64 && p < 0.9;
    this.mouse = mouse;
    this.dt = dt;
    this.time = time;
  }

  render(renderer, target) {
    const sc = this.sculpture;
    if (sc.mesh.visible) {
      const speed = sc.wake.step(renderer, this.mouse || { x: 0, y: 0 }, this.rig.camera.aspect, this.dt || 1 / 60);
      sc.step(renderer, this.rig.camera, this.dt || 1 / 60, this.time || 0);
      // Their sound for the particles: a floor of 0.04 in the room, more as the pointer stirs them.
      this.splat = clamp(((this.splat || 0) + speed * 4) * 0.97, 0, this.interact);
      this.particlesVolume = 0.04 * this.interact + this.splat * 0.21;
    }
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.rig.camera);
  }
}

// The year and title, set to wrap exactly twice round a ring.
function ringText(str) {
  const cv = document.createElement('canvas');
  cv.width = 4096; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, 4096, 128);
  const twice = str + str;
  c.font = '500 64px "IBM Plex Mono", monospace';
  const size = Math.min(84, (64 * 4096) / c.measureText(twice).width);
  c.font = `500 ${size}px "IBM Plex Mono", monospace`;
  const w = c.measureText(twice).width;
  c.fillStyle = '#fff';
  c.textBaseline = 'middle';
  c.fillText(twice, (4096 - w) / 2, 66);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
