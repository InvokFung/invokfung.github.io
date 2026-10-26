// Scene 1, the igloo. Igloo's version is baked Blender meshes and lightmaps; this one is built
// from code: the dome is cut into real blocks, the ground and mountains are noise, and the intro
// timeline, the block physics and the camera path follow the original's numbers.
import * as THREE from 'three';
import { gsap, Rig, GL_FIT, GL_NOISE, fit, ease, smoothstep, lerpFPS, lerpK, frictionFPS, clamp, mix, rng, textTexture, bentBlock, mergeBlocks } from './lib.js';

const BLUE = new THREE.Color(0.5, 0.7, 1.0);
const SUN = new THREE.Vector3(0.75, 0.8, 0.15).normalize();

const Y0 = -0.35; // dome centre, so the crown sits near y 3.95 as in the original
function iglooBlocks() {
  const rand = rng(1234);
  const blocks = [];
  const R = 4.25, T = 0.72, rows = 6;
  const doorTheta = Math.atan2(0.6, 1);
  const top = (82 * Math.PI) / 180;
  for (let k = 0; k < rows; k++) {
    const ph0 = (k / rows) * top + 0.012, ph1 = ((k + 1) / rows) * top - 0.012;
    const phm = (ph0 + ph1) / 2;
    const n = Math.max(6, Math.round((Math.PI * 2 * R * Math.cos(phm)) / 1.35));
    const off = (k % 2) * 0.5 + rand() * 0.2;
    for (let j = 0; j < n; j++) {
      const gap = 0.05 / (R * Math.cos(phm));
      const th0 = ((j + off) / n) * Math.PI * 2 + gap, th1 = ((j + 1 + off) / n) * Math.PI * 2 - gap;
      const thm = (th0 + th1) / 2;
      let dd = Math.abs(((thm - doorTheta + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (k < 2 && dd < 1.25 / (R * Math.cos(phm)) + 0.12) continue; // the doorway
      const rIn = R - T + (rand() - 0.5) * 0.06, rOut = R + (rand() - 0.5) * 0.08;
      const place = (a, b, c) => {
        const th = mix(th0, th1, a), ph = mix(ph0, ph1, b), r = mix(rIn, rOut, c);
        return new THREE.Vector3(Math.cos(th) * Math.cos(ph) * r, Math.sin(ph) * r + Y0, Math.sin(th) * Math.cos(ph) * r);
      };
      const half = [((th1 - th0) / 2) * R * Math.cos(phm), ((ph1 - ph0) / 2) * R, T / 2];
      blocks.push({ geo: bentBlock(place, half, 0.13), centroid: place(0.5, 0.5, 0.5) });
    }
  }
  // Crown.
  {
    const ph0 = top + 0.012;
    const cap = new THREE.CylinderGeometry(R * Math.cos(ph0) - 0.05, R * Math.cos(ph0) + 0.02, T * 0.9, 20, 1);
    cap.deleteAttribute('uv');
    cap.translate(0, Math.sin(ph0) * R + Y0 + 0.12, 0);
    const em = new Float32Array(cap.attributes.position.count);
    for (let i = 0; i < em.length; i++) em[i] = cap.attributes.position.getY(i) < Math.sin(ph0) * R + Y0 ? 1 : 0;
    cap.setAttribute('aEmission', new THREE.BufferAttribute(em, 1));
    blocks.push({ geo: cap, centroid: new THREE.Vector3(0, Math.sin(ph0) * R + Y0 + 0.12, 0) });
  }
  // Entrance tunnel: three arches of blocks running out towards the right of the camera.
  const D = new THREE.Vector3(Math.cos(doorTheta), 0, Math.sin(doorTheta));
  const P = new THREE.Vector3(-D.z, 0, D.x);
  const tr = 1.45, tt = 0.55, segs = 5;
  for (let s = 0; s < 3; s++) {
    const s0 = R - 0.9 + s * 0.95 + 0.03, s1 = s0 + 0.95 - 0.06;
    const shift = (s % 2) * 0.5;
    for (let j = 0; j < segs; j++) {
      const a0 = ((j + shift) / (segs + shift)) * Math.PI + 0.03, a1 = ((j + 1 + shift) / (segs + shift)) * Math.PI - 0.03;
      const place = (a, b, c) => {
        const al = mix(a0, a1, a), x = mix(s0, s1, b), r = mix(tr - tt, tr, c);
        return new THREE.Vector3().addScaledVector(D, x).addScaledVector(P, Math.cos(al) * r).add(new THREE.Vector3(0, Math.sin(al) * r + Y0 + 0.05, 0));
      };
      const half = [((a1 - a0) / 2) * tr, (s1 - s0) / 2, tt / 2];
      blocks.push({ geo: bentBlock(place, half, 0.11, [6, 6, 3]), centroid: place(0.5, 0.5, 0.5) });
    }
  }
  return blocks;
}

// Height of the snow around the igloo: a flat pad for the igloo, a ridge behind, a fall
// away towards the camera.
function groundHeight(x, z, n2) {
  const r = Math.hypot(x, z);
  let h = -0.45;
  h -= smoothstep(4.5, 11, r) * 0.9 * Math.max(0, (x * -0.7 + z * 0.7) / (r + 1e-3)); // falls away towards the camera
  h += smoothstep(4.5, 12, r) * (n2(x * 0.18, z * 0.18) * 2.4 - 0.6);
  h += n2(x * 0.9 + 3, z * 0.9) * 0.18 * smoothstep(4.6, 6.5, r);
  h += smoothstep(4.4, 4.9, r) * 0.0;
  return h;
}

function makeNoise2(seed) {
  const rand = rng(seed);
  const N = 64, grid = Array.from({ length: N * N }, () => rand());
  const g = (i, j) => grid[(((j % N) + N) % N) * N + (((i % N) + N) % N)];
  const n = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (g(i, j) * (1 - sx) + g(i + 1, j) * sx) * (1 - sy) + (g(i, j + 1) * (1 - sx) + g(i + 1, j + 1) * sx) * sy;
  };
  return (x, y) => n(x, y) * 0.55 + n(x * 2.1 + 7, y * 2.1) * 0.28 + n(x * 4.3, y * 4.3 + 3) * 0.17;
}

// ─── shaders ──────────────────────────────────────────────────────────────────────────────
const iglooVert = /* glsl */`
  attribute vec3 aCentroid, aRand;
  attribute float aBlock, aEmission;
  uniform sampler2D tState;
  varying vec3 vPos, vNormal;
  varying float vDisp, vBounce, vEmission;
  vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
  void main() {
    int b = int(aBlock) * 3;
    vec4 s0 = texelFetch(tState, ivec2(b, 0), 0);
    vec4 s1 = texelFetch(tState, ivec2(b + 1, 0), 0);
    vec4 s2 = texelFetch(tState, ivec2(b + 2, 0), 0);
    vec3 local = qrot(s1, position - aCentroid);
    vec3 pos = s0.xyz + local;
    vPos = pos;
    vNormal = qrot(s1, normal);
    vDisp = s0.w;
    vBounce = s2.x;
    vEmission = aEmission;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;
const iglooFrag = /* glsl */`
  uniform float uTime, uIntro, uProgress;
  uniform vec3 uSun, uBlue, uLit, uShade;
  varying vec3 vPos, vNormal;
  varying float vDisp, vBounce, vEmission;
  ${GL_FIT}
  ${GL_NOISE}
  void main() {
    vec3 n = normalize(vNormal);
    float sun = max(dot(n, uSun), 0.0);
    float sky = n.y * 0.5 + 0.5;
    float grain = vnoise(vPos.xy * 9.0 + vPos.z * 7.0) * 0.5 + vnoise(vPos.zy * 23.0) * 0.5;
    vec3 color = mix(uShade, uLit, sun * 0.7 + sky * 0.3) * (0.86 + grain * 0.22);
    color *= mix(0.55, 1.0, smoothstep(-0.6, 1.4, vPos.y));
    vec3 exploded = color * 0.55 + 0.05;
    color = mix(color, exploded, clamp(5.0 * vDisp, 0.0, 1.0));

    // Blocks arrive top first, through a lattice of glowing triangles.
    if (uIntro < 1.0) {
      float e = 1.0 - falloffsmooth(vPos.y, 3.95, -0.4, 1.5, uIntro);
      if (e > 0.9999) discard;
      float tri = triangles(vPos.xz * 1.6 + vPos.y * 0.8);
      e += clamp(e * tri * 13.0, 0.0, 1.0);
      color += e * uBlue;
    }
    color += pow(vEmission, 2.0) * clamp(vDisp, 0.0, 1.0) * uBlue;
    vec3 powE = pow(vEmission, 8.0) * uBlue * 0.5;
    color += powE * (sin(vPos.x - uTime + 3.2) * 0.5 + 0.5);
    color += max(0.0, smoothstep(0.0, 2.0, vPos.x * 0.5 - vPos.z * 0.5)) * powE;
    color += (vPos.x * 0.1 + 0.4) * 0.3 * min(vPos.y + 0.5, 1.0) * 0.5 * vec3(0.9, 0.93, 1.0);
    color = clamp(color, 0.0, 1.0);
    color += (1.0 - smoothstep(-1.5, 1.0, vPos.y)) * vBounce * vec3(0.8, 0.9, 1.0) * 0.25;
    color *= uProgress;
    gl_FragColor = vec4(color, 1.0);
  }
`;

// The snow. Ground and mountains share one shader: shading, drifting wind, the blue shockwave
// of triangles that lays the world down in the intro, and the fog into the sky.
const groundVert = /* glsl */`
  varying vec3 vWorld, vNormal; varying vec2 vLocal;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz; vLocal = position.xz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const groundFrag = /* glsl */`
  uniform float uTime, uAlpha, uProgress, uProgress2, uFadeRadius, uFog, uGlow;
  uniform vec3 uSun, uLit, uShade, uSky1, uSky2, uMouse;
  uniform vec2 uResolution;
  varying vec3 vWorld, vNormal; varying vec2 vLocal;
  ${GL_FIT}
  ${GL_NOISE}
  void main() {
    vec3 n = normalize(vNormal);
    float sun = max(dot(n, uSun), 0.0);
    float tex = fbm(vWorld.xz * 0.9) * 0.6 + fbm(vWorld.xz * 4.0) * 0.4;
    vec3 color = mix(uShade, uLit, clamp(sun * 0.85 + 0.15 + (tex - 0.5) * 0.35, 0.0, 1.0));
    float r = length(vWorld.xz);
    // Light from the igloo and from the mouse spills on the snow.
    float glowStrength = sin(vWorld.x - uTime + 3.2) * 0.5 + 0.5;
    color += uGlow * vec3(0.5, 0.7, 1.0) * smoothstep(6.5, 4.0, r) * (0.25 + 0.25 * glowStrength) * color.r;
    vec3 mg = (1.0 - clamp(distance(uMouse.xz, vWorld.xz), 0.0, 5.0) / 5.0) * vec3(0.5, 0.7, 1.0) * smoothstep(-0.5, 2.0, uMouse.y);
    mg *= (1.0 - clamp(r, 0.0, 9.0) / 9.0) * 2.0 * uGlow;
    color += mg * color.r;
    // Wind: streaks of snow sliding over the ground.
    float t = uTime * 0.15;
    float w = wind(vWorld.xz * 0.25 + vec2(-t, -t)) * wind(vWorld.xz * 0.31 + vec2(-t * 1.1, -t * 0.9) + 4.0);
    color = mix(color, uLit * 1.45, clamp(w * 4.0, 0.0, 0.6) * clamp(1.0 - n.y * 0.2, 0.0, 1.0));

    float alpha = 1.0;
    if (uProgress2 < 1.0) {
      alpha = 0.0;
      float noise = vnoise(vWorld.xz * 0.5);
      float tri = triangles(vWorld.xz * 0.9);
      vec3 blue = vec3(0.3, 0.45, 1.0);
      float g = r + noise * 3.5;
      float tf = 1.0 - falloffsmooth(g, 0.0, 32.0, 8.0, uProgress2);
      float tf2 = 1.0 - falloffsmooth(g, 0.0, 32.0, 3.0, uProgress2);
      vec3 shock = tf * tri * blue * 3.0 + tf2 * blue;
      float shockA = falloff(g, -0.1, 31.9, 0.1, uProgress2);
      float triF = 1.0 - falloffsmooth(g, 0.0, 32.0, 10.0, uProgress);
      float triA = falloff(g, 1.0, 33.0, 0.1, uProgress) * triF * tri;
      color += shock;
      alpha += shockA;
      color += blue * (1.0 - shockA);
      alpha += triA * (1.0 - shockA);
    }
    // Fog into the sky gradient, by height and distance.
    vec2 suv = gl_FragCoord.xy / uResolution;
    float grad = pow((suv.x + suv.y) * 0.5, 2.0);
    vec3 fogColor = mix(uSky2, uSky1, grad);
    float fog = clamp(1.0 - vWorld.y * 0.05 - 0.5, 0.0, 1.0) * 0.35 + smoothstep(8.0, 80.0, r) * 0.75;
    color = mix(color, fogColor * 1.05 + smoothstep(0.5, 1.0, color.r) * 0.08, clamp(fog * uFog, 0.0, 1.0));
    alpha *= 1.0 - smoothstep(0.8, 1.0, length(vLocal) / uFadeRadius);
    alpha = clamp(alpha, 0.0, 1.0) * uAlpha;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
  }
`;

// ─── the scene ────────────────────────────────────────────────────────────────────────────
export class IglooScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.name = 'igloo';
    this.height = 2.35;
    this.progress = 0;
    this.visible = false;
    this.initialScrollAutocenter = 0.495;
    this.finalScrollAutocenter = 0.495;
    this.bloomThreshold = 0.2;
    this.bloomScale = 0.06;
    this.scene = new THREE.Scene();
    const rig = (this.rig = new Rig(30));
    rig.basePosition.set(-14, 4, 14);
    rig.baseTarget.set(0, 1, 0);
    rig.displacement.position.set(0.07, 0.025);
    rig.shake.setScalar(0.01);
    rig.shakeSpeed.setScalar(0.5);
    this.introPosition = new THREE.Vector3(-14, 21, 14);
    this.introTarget = new THREE.Vector3(0, 0.5, 0);
    this.introWeight = { value: 0 };
    this.timelinePosition = new THREE.Vector3();
    this.timelineTarget = new THREE.Vector3();
    this.mousePosition = new THREE.Vector3(0, 1, 0);
    this.mouseGround = new THREE.Vector3();
    this.mouseVelocity = 0;
    this.displacementModulator = { value: 0 };
    this.needsReset = false;
    this.u = {
      uTime: ctx.uniforms.uTime,
      uResolution: ctx.uniforms.uResolution,
      uSun: { value: SUN },
      uSky1: { value: new THREE.Color('#d1d6e3') },
      uSky2: { value: new THREE.Color('#afb6c7') },
    };
    this.build();
    this.createTimeline();
    this.createIntro();
  }

  build() {
    this.buildSky();
    this.buildGround();
    this.buildMountains();
    this.buildIgloo();
    this.buildLines();
    this.buildSmoke();
    this.buildSnow();
    this.buildIntroParticles();
    this.buildPlexus();
  }

  buildSky() {
    this.skyU = { uProgress: { value: 0 }, uIntroColor: { value: new THREE.Color('#b3bac9') } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.u, ...this.skyU },
      vertexShader: /* glsl */`void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSky1, uSky2, uIntroColor; uniform float uProgress; uniform vec2 uResolution;
        void main() {
          vec2 s = gl_FragCoord.xy / uResolution;
          float g = pow((s.x + s.y) * 0.5, 2.0);
          gl_FragColor = vec4(mix(uIntroColor, mix(uSky2, uSky1, g), uProgress), 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 12, 12), mat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.scene.add(sky);
  }

  groundMaterial(extra) {
    return new THREE.ShaderMaterial({
      uniforms: {
        ...this.u,
        uAlpha: { value: 0 }, uProgress: { value: 0 }, uProgress2: { value: 0 },
        uLit: { value: new THREE.Color('#8c93a4') }, uShade: { value: new THREE.Color('#565c6e') },
        uMouse: { value: this.mouseGround }, uFadeRadius: { value: 9.2 }, uFog: { value: 1 }, uGlow: { value: 1 },
        ...extra,
      },
      vertexShader: groundVert, fragmentShader: groundFrag, transparent: true,
    });
  }

  buildGround() {
    const n2 = makeNoise2(31);
    const g = new THREE.PlaneGeometry(24, 24, 180, 180);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, groundHeight(p.getX(i), p.getZ(i), n2));
    g.computeVertexNormals();
    this.groundMat = this.groundMaterial({ uFadeRadius: { value: 11.5 } });
    const mesh = new THREE.Mesh(g, this.groundMat);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    // A few rocky mounds near the igloo, like the original's terrain patches.
    const rocks = [[-8.5, -1.6, 4.5, 2.8, 1.3], [7.5, -1.4, -6.5, 3.4, 1.6], [-3.5, -1.2, -8.5, 2.6, 1.1]];
    this.rockMat = this.groundMaterial({ uFadeRadius: { value: 1e4 }, uLit: { value: new THREE.Color('#7f8697') }, uShade: { value: new THREE.Color('#41475a') } });
    rocks.forEach(([x, y, z, s, h], i) => {
      const geo = new THREE.IcosahedronGeometry(1, 4);
      const pp = geo.attributes.position, nn = makeNoise2(90 + i);
      for (let k = 0; k < pp.count; k++) {
        const v = new THREE.Vector3(pp.getX(k), pp.getY(k), pp.getZ(k));
        const d = 0.75 + nn(v.x * 2 + 5, v.z * 2 + v.y) * 0.5;
        v.multiplyScalar(d);
        pp.setXYZ(k, v.x * s, Math.max(v.y, -0.2) * h, v.z * s);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this.rockMat);
      m.position.set(x, y, z);
      m.renderOrder = 1;
      this.scene.add(m);
    });
  }

  buildMountains() {
    const n2 = makeNoise2(57);
    const g = new THREE.PlaneGeometry(420, 420, 220, 220);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
      const ridge = 1 - Math.abs(n2(x * 0.018, z * 0.018) * 2 - 1);
      const h = smoothstep(24, 70, r) * (ridge * ridge * 46 + n2(x * 0.06, z * 0.06) * 10) - 4 + smoothstep(120, 200, r) * 20;
      p.setY(i, h);
    }
    g.computeVertexNormals();
    this.mountainMat = this.groundMaterial({ uFadeRadius: { value: 1e4 }, uLit: { value: new THREE.Color('#aab0be') }, uShade: { value: new THREE.Color('#686e80') }, uGlow: { value: 0 } });
    const m = new THREE.Mesh(g, this.mountainMat);
    m.renderOrder = 1;
    this.scene.add(m);
  }

  buildIgloo() {
    const blocks = iglooBlocks();
    this.blocks = blocks.map((b) => ({
      centroid: b.centroid.clone(), rand: null,
      targetBounce1: 0, targetBounce2: 0, bounce: 0,
      targetDisp1: 0, targetDisp2: 0, disp: 0, scroll1: 0, scroll2: 0,
      pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
    }));
    const geo = mergeBlocks(blocks);
    blocks.forEach((b, i) => { this.blocks[i].rand = b.rand; });
    this.blockGeometry = geo;
    this.state = new Float32Array(blocks.length * 3 * 4);
    this.stateTex = new THREE.DataTexture(this.state, blocks.length * 3, 1, THREE.RGBAFormat, THREE.FloatType);
    this.stateTex.needsUpdate = true;
    this.iglooU = { uIntro: { value: 0 }, uProgress: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.u, ...this.iglooU, tState: { value: this.stateTex },
        uBlue: { value: BLUE }, uLit: { value: new THREE.Color('#bfc4d0') }, uShade: { value: new THREE.Color('#4d5363') },
      },
      vertexShader: iglooVert, fragmentShader: iglooFrag,
    });
    this.igloo = new THREE.Mesh(geo, mat);
    this.igloo.frustumCulled = false;
    this.igloo.visible = false;
    this.scene.add(this.igloo);
    // The light inside, seen through the joints.
    const inner = new THREE.Mesh(new THREE.SphereGeometry(3.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.75, 2.0), side: THREE.DoubleSide }));
    inner.position.y = Y0;
    this.innerLight = inner;
    inner.visible = false;
    this.scene.add(inner);
    // Floor of the igloo, so the light doesn't fall through.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.3, 1.5) }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = Y0 + 0.02;
    floor.visible = false;
    this.innerFloor = floor;
    this.scene.add(floor);
  }

  // The wire cage the igloo is drawn inside, and the outline that stays as a ghost when the
  // blocks blow apart on the way in.
  buildLines() {
    const lineMat = (frag, extra) => new THREE.ShaderMaterial({
      uniforms: { ...this.u, uAlpha: { value: 0 }, uProgress: { value: 0 }, uScrollAlpha: { value: 0 }, uMat: { value: 0 }, uColor: { value: new THREE.Color('#a7b2d6') }, ...extra },
      vertexShader: /* glsl */`varying vec3 vWorld; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uAlpha, uProgress, uScrollAlpha, uMat; uniform vec3 uColor; varying vec3 vWorld;
        ${GL_FIT}
        void main() { ${frag} }`,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const cageGeo = new THREE.EdgesGeometry(new THREE.SphereGeometry(4.9, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), 1);
    cageGeo.translate(0, Y0, 0);
    this.cage = new THREE.LineSegments(cageGeo, lineMat(`
      float a = uAlpha * falloff(length(vWorld), 0.0, 20.0, 5.0, uProgress);
      a *= sin(dot(vWorld, vec3(13.0)) + uTime * 6.0) * 0.5 + 0.5;
      gl_FragColor = vec4(uColor * a, 1.0);`));
    this.cage.renderOrder = 999;
    this.cage.frustumCulled = false;
    this.scene.add(this.cage);
    const outGeo = new THREE.EdgesGeometry(this.blockGeometry, 32);
    this.outline = new THREE.LineSegments(outGeo, lineMat(`
      float a = mix(uAlpha, 1.0, uScrollAlpha);
      float idle = (sin(vWorld.y * 6.0 + uTime * 5.0) * 0.5 + 0.5) * (cos(vWorld.z * 6.0 + uTime * 5.0) * 0.5 + 0.5) * (sin(vWorld.x * 6.0 + uTime * 5.0) * 0.5 + 0.5);
      a *= idle * 0.8 + 0.2;
      a *= falloffsmooth(vWorld.y, 3.5, 0.1, 2.0, uMat);
      gl_FragColor = vec4(uColor * a * 0.6, 1.0);`, { uAlpha: { value: 1 } }));
    this.outline.renderOrder = 999;
    this.outline.frustumCulled = false;
    this.scene.add(this.outline);
  }

  buildSmoke() {
    this.smokeU = { uAlpha: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.u, ...this.smokeU, uShift: { value: 0 } },
      vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vWorld; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uAlpha; varying vec2 vUv; varying vec3 vWorld;
        ${GL_NOISE}
        void main() {
          vec2 uv = vUv; uv.x *= 2.0;
          float t = uTime * 0.15 + (vWorld.x > 6.0 ? 0.914 : 0.0);
          float w = fbm(uv * vec2(3.0, 2.0) + vec2(-t, t * 0.4)) * fbm(uv * 3.7 + vec2(-t, 0.75)) * fbm(uv * 1.5 + vec2(-t, -t * 0.35));
          float a = clamp((w - 0.06) * 9.0, 0.0, 1.0) * 0.4;
          a *= (1.0 - vUv.y) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.8, vUv.x) * uAlpha;
          gl_FragColor = vec4(vec3(1.0), a);
        }`,
      transparent: true, depthWrite: false,
    });
    const g = new THREE.PlaneGeometry(20, 5);
    const a = new THREE.Mesh(g, mat); a.position.set(-5, 1.25, -10); a.renderOrder = 2;
    const b = new THREE.Mesh(g, mat); b.position.set(13.45, 3, -4); b.rotation.y = (-10 * Math.PI) / 180; b.renderOrder = 2;
    this.scene.add(a, b);
  }

  buildSnow() {
    const N = 1800, rand = rng(3);
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([rand() * 44 - 26, rand() * 16 - 2, rand() * 44 - 22], i * 3); seed[i] = rand(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.snowU = { uAlpha: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.u, ...this.snowU, uPixel: this.ctx.uniforms.uPixel },
      vertexShader: /* glsl */`
        attribute float aSeed; uniform float uTime, uPixel; varying float vA;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * (0.35 + aSeed * 0.5) + 2.0, 16.0) - 2.0;
          p.x += sin(uTime * 0.7 + aSeed * 40.0) * 0.4 + uTime * 0.6;
          p.x = mod(p.x + 26.0, 44.0) - 26.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.05 + aSeed * 0.06) * uPixel * 600.0 / -mv.z;
          vA = smoothstep(60.0, 8.0, -mv.z) * (0.4 + aSeed * 0.6);
        }`,
      fragmentShader: /* glsl */`
        uniform float uAlpha; varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.1, d) * vA * uAlpha); }`,
      transparent: true, depthWrite: false,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    this.scene.add(pts);
  }

  buildIntroParticles() {
    const N = 900, rand = rng(8);
    const pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = rand() * Math.PI * 2, r = 3.2 + rand() * 6;
      pos.set([Math.cos(a) * r, -0.4, Math.sin(a) * r], i * 3);
      seed.set([rand(), rand(), rand()], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    this.introPU = { uProgress: { value: 0 }, uAlpha: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.u, ...this.introPU, uPixel: this.ctx.uniforms.uPixel },
      vertexShader: /* glsl */`
        attribute vec3 aSeed; uniform float uProgress, uTime, uPixel; varying float vA;
        void main() {
          vec3 p = position;
          float t = clamp(uProgress * (0.6 + aSeed.x * 0.8) - aSeed.y * 0.2, 0.0, 1.0);
          float a = atan(p.z, p.x) + t * (1.5 + aSeed.z) ;
          float r = length(p.xz) * mix(1.0, 0.45, t);
          p = vec3(cos(a) * r, -0.4 + t * (2.0 + aSeed.x * 5.0), sin(a) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.06 + aSeed.z * 0.08) * uPixel * 600.0 / -mv.z;
          vA = sin(t * 3.14159);
        }`,
      fragmentShader: /* glsl */`
        uniform float uAlpha; varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.5, 0.7, 1.0) * 2.0, smoothstep(0.5, 0.0, d) * vA * uAlpha); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.introParticles = new THREE.Points(g, mat);
    this.introParticles.frustumCulled = false;
    this.introParticles.visible = false;
    this.scene.add(this.introParticles);
  }

  // Lines joining a handful of blocks, each with a tiny code, as on the original.
  buildPlexus() {
    const picks = [];
    const rand = rng(21);
    const cands = this.blocks.map((b, i) => i).filter((i) => this.blocks[i].centroid.y > 0.8 && this.blocks[i].centroid.x - this.blocks[i].centroid.z < 2.5);
    while (picks.length < 6 && cands.length) picks.push(cands.splice(Math.floor(rand() * cands.length), 1)[0]);
    this.plexusPicks = picks;
    const pairs = [[0, 1], [1, 2], [0, 3], [3, 4], [4, 5], [2, 5], [1, 4]];
    this.plexusPairs = pairs;
    const lp = new Float32Array(pairs.length * 6);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    this.plexusU = { uAlpha: { value: 0 } };
    this.plexusLines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({
      uniforms: this.plexusU,
      vertexShader: /* glsl */`void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`uniform float uAlpha; void main() { gl_FragColor = vec4(vec3(1.0), 0.75 * uAlpha); }`,
      transparent: true, depthTest: false, depthWrite: false,
    }));
    this.plexusLines.frustumCulled = false;
    this.plexusLines.renderOrder = 1000;
    this.scene.add(this.plexusLines);
    const codes = ['A3', 'B7', 'C1', 'D4', 'E2', 'F9'];
    this.plexusTags = picks.map((_, i) => {
      const tex = textTexture([{ text: codes[i] }], { font: '500 44px "IBM Plex Mono", monospace', width: 160, height: 72, pad: 10 });
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0 }));
      s.scale.set(0.55, 0.25, 1);
      s.center.set(-0.1, -0.1);
      s.renderOrder = 1001;
      this.scene.add(s);
      const dot = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, depthTest: false, opacity: 0 }));
      dot.scale.setScalar(0.07);
      dot.renderOrder = 1001;
      this.scene.add(dot);
      return { s, dot };
    });
  }

  createTimeline() {
    this.timelinePosition.set(-13.25, 2.5, 13.25);
    this.timelineTarget.set(0, 1, 0);
    const e = this.timelinePosition.toArray(), t = this.timelineTarget.toArray();
    const tl = (this.timeline = gsap.timeline({ paused: true }));
    tl.fromTo(this.timelinePosition, { y: e[1] + 9 }, { y: e[1], duration: 14, ease: 'power2.out' }, 0);
    tl.fromTo(this.timelineTarget, { y: t[1] + 14 }, { y: t[1], duration: 14, ease: 'power2.out' }, 0);
    tl.fromTo(this.timelinePosition, { x: e[0], z: e[2] }, { x: e[0] - 2, z: e[2] + 10, duration: 14, ease: 'power1.inOut', immediateRender: false }, 7);
    tl.progress(1).progress(0);
  }

  // Igloo's intro, beat for beat: cage, blocks top-down through triangles, the blue shockwave
  // that lays the ground, then sky, smoke, snow and the UI.
  createIntro() {
    const g = this.groundMat.uniforms, m = this.mountainMat.uniforms, r = this.rockMat.uniforms;
    const tl = (this.introTL = gsap.timeline({ paused: true }));
    const cageU = this.cage.material.uniforms, outU = this.outline.material.uniforms;
    tl.fromTo(outU.uMat, { value: 0 }, { value: 1, duration: 2.5, ease: 'power3.inOut' }, 0);
    tl.fromTo(outU.uAlpha, { value: 1 }, { value: 0, duration: 3, ease: 'inOut4' }, 2);
    tl.fromTo(cageU.uProgress, { value: 0 }, { value: 1, duration: 4, ease: 'sine.inOut' }, 0);
    tl.fromTo(cageU.uAlpha, { value: 0 }, { value: 0.4, duration: 0.1, ease: 'power2.inOut' }, 0);
    tl.fromTo(cageU.uAlpha, { value: 0.4 }, { value: 0, duration: 3, ease: 'power2.inOut', immediateRender: false }, 2.1);
    tl.set(this.cage, { visible: true }, 0);
    tl.set(this.cage, { visible: false }, 5.1);
    tl.set([this.igloo, this.innerLight, this.innerFloor], { visible: false }, 0);
    tl.set([this.igloo, this.innerLight, this.innerFloor], { visible: true }, 1.1);
    tl.fromTo(this.iglooU.uIntro, { value: 0 }, { value: 1, duration: 2.25, ease: 'igloo_ease_1' }, 1.1);
    tl.fromTo(this.displacementModulator, { value: 0 }, { value: 1, duration: 2, ease: 'none' }, 2);
    [g, r].forEach((u) => { tl.set(u.uAlpha, { value: 0 }, 0); tl.set(u.uAlpha, { value: 1 }, 2.1); });
    tl.fromTo(m.uAlpha, { value: 0 }, { value: 1, duration: 3, ease: 'none' }, 0.7);
    [g, m, r].forEach((u) => {
      tl.fromTo(u.uProgress, { value: 0 }, { value: 1, duration: 7.5, ease: 'inOut1' }, 0.7);
      tl.fromTo(u.uProgress2, { value: 0 }, { value: 1, duration: 7.5, ease: 'inOut3' }, 0.7);
    });
    tl.fromTo(this.introPU.uProgress, { value: 0 }, { value: 1, duration: 4, ease: 'sine.out' }, 0.5);
    tl.fromTo(this.introPU.uAlpha, { value: 1 }, { value: 0, duration: 2, ease: 'none', immediateRender: false }, 1.75);
    tl.set(this.introParticles, { visible: true }, 0);
    tl.set(this.introParticles, { visible: false }, 3.75);
    tl.fromTo(this.smokeU.uAlpha, { value: 0 }, { value: 1, duration: 3, ease: 'power2.inOut' }, 2);
    tl.fromTo(this.snowU.uAlpha, { value: 0 }, { value: 1, duration: 4, ease: 'power2.inOut' }, 2);
    tl.fromTo(this.skyU.uProgress, { value: 0 }, { value: 1, duration: 3, ease: 'power2.inOut' }, 1.5);
    tl.fromTo(this.iglooU.uProgress, { value: 0 }, { value: 1, duration: 1, ease: 'power2.inOut' }, 1);
    tl.fromTo(this.ctx.bloomIntensity, { value: 1.5 }, { value: 1, duration: 2, ease: 'sine.inOut' }, 2.5);
    tl.fromTo(this.ctx.gradeAlpha, { value: 0 }, { value: 1, duration: 4, ease: 'sine.inOut' }, 1);
    tl.call(() => this.ctx.onIntroUI && this.ctx.onIntroUI(), null, 4.5);
    tl.fromTo(this.introWeight, { value: 0 }, { value: 1, duration: 5.5, ease: 'inOut1' }, 2);
  }

  playIntro(skip) {
    if (skip) { this.introTL.progress(1); this.ctx.onIntroUI && this.ctx.onIntroUI(); return; }
    this.introTL.play(0);
  }

  set isSceneVisible(v) {
    if (v && !this.visible) this.needsReset = true;
    this.visible = v;
  }

  resize(w, h) {
    this.rig.camera.aspect = w / h;
    this.rig.camera.zoom = Math.min(1, (w / h) * 1.25);
    this.rig.camera.updateProjectionMatrix();
  }

  // Igloo's block physics (their U3.update), per block on the CPU, written to a float texture.
  updateBlocks(dt, time, mouseNdc) {
    const cam = this.rig.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const planePoint = cam.position.clone().addScaledVector(fwd, 19.25);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(mouseNdc.x, mouseNdc.y), cam);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(fwd.clone().negate(), planePoint);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) hit.copy(planePoint);
    const before = this.mousePosition.clone();
    this.mousePosition.lerp(hit, lerpK(0.05, dt));
    this.mouseGround.lerp(hit, lerpK(0.03, dt));
    this.mouseVelocity += hit.sub(before).length() * 0.01;
    this.mouseVelocity = clamp(this.mouseVelocity * frictionFPS(0.98, dt), 0, 1);

    const tIn = fit(this.progress, 0, this.initialScrollAutocenter, 0, 1);
    const s = ease(fit(this.progress, 0, 0.4, 1, 0), 'sine.in');
    const n = this.needsReset ? 1 : 0.075;
    const mod = this.displacementModulator.value;
    const q = new THREE.Quaternion(), axis = new THREE.Vector3(), tmp = new THREE.Vector3();
    const S = this.state;
    this.blocks.forEach((b, i) => {
      let l = 0.4;
      l *= Math.sin(-time * 2 + b.centroid.x) * 0.5 + 0.5;
      l *= Math.cos(-time) * 0.5 + 0.5;
      l *= mix(0.5, 2, b.rand.z);
      l *= 0.5 * mod;
      const c = Math.sin(time + b.rand.x * 12.342) * b.rand.y;
      const h = fit(smoothstep(1, 3, tmp.copy(b.centroid).sub(this.mousePosition).length()), 0, 1, 0.5 + 0.3 * c, 0);
      l = Math.max(l, h * tIn * mod);
      b.targetBounce1 = l;
      b.targetBounce2 = lerpFPS(b.targetBounce2, b.targetBounce1, 0.05, dt);
      b.bounce = lerpFPS(b.bounce, b.targetBounce2, 0.05, dt);
      l *= smoothstep(0.45, 0.7, b.centroid.y);
      l = Math.max(0, l);
      b.targetDisp1 = l;
      b.targetDisp2 = lerpFPS(b.targetDisp2, b.targetDisp1, 0.06, dt);
      b.disp = lerpFPS(b.disp, b.targetDisp2, 0.06, dt);
      b.pos.copy(b.centroid).addScaledVector(b.centroid, b.disp);
      const u = smoothstep(0.3, 1, b.centroid.y), f = fit(b.rand.x, 0.4, 1, 0, 1) * 2;
      const p = s * u * f;
      b.scroll1 = mix(b.scroll1, p, n);
      b.scroll2 = n === 1 ? b.scroll1 : lerpFPS(b.scroll2, b.scroll1, n, dt);
      b.pos.addScaledVector(b.centroid, b.scroll2);
      const A = b.scroll2 * b.rand.x * -1.5, B = b.scroll2 * b.rand.y * -1.5, C = b.scroll2 * b.rand.z * -1.5;
      b.quat.identity();
      b.quat.multiply(q.setFromAxisAngle(axis.set(0, 1, 0), Math.cos(b.disp * 2 + b.rand.z * 30) * b.disp * 0.5 + A));
      b.quat.multiply(q.setFromAxisAngle(axis.set(0, 0, 1), Math.cos(b.disp * 2 + b.rand.x * 30) * b.disp * 0.5 + B));
      b.quat.multiply(q.setFromAxisAngle(axis.set(1, 0, 0), Math.cos(b.disp * 2 + b.rand.y * 30) * b.disp * 0.5 + C));
      const o = i * 12;
      S[o] = b.pos.x; S[o + 1] = b.pos.y; S[o + 2] = b.pos.z; S[o + 3] = b.disp;
      S[o + 4] = b.quat.x; S[o + 5] = b.quat.y; S[o + 6] = b.quat.z; S[o + 7] = b.quat.w;
      S[o + 8] = b.bounce;
    });
    this.stateTex.needsUpdate = true;
  }

  updatePlexus() {
    const on = this.displacementModulator.value >= 1 ? 1 : 0;
    this.plexusU.uAlpha.value = lerpFPS(this.plexusU.uAlpha.value, on * fit(this.progress, 0.2, 0.45, 0, 1) * fit(this.progress, 0.6, 0.8, 1, 0), 0.08, 1 / 60);
    const pts = this.plexusPicks.map((i) => this.blocks[i].pos);
    const arr = this.plexusLines.geometry.attributes.position.array;
    this.plexusPairs.forEach(([a, b], k) => { arr.set([pts[a].x, pts[a].y, pts[a].z, pts[b].x, pts[b].y, pts[b].z], k * 6); });
    this.plexusLines.geometry.attributes.position.needsUpdate = true;
    this.plexusTags.forEach((t, i) => {
      t.s.position.copy(pts[i]); t.dot.position.copy(pts[i]);
      t.s.material.opacity = t.dot.material.opacity = this.plexusU.uAlpha.value;
    });
  }

  update(dt, time, mouse) {
    this.timeline.progress(this.progress);
    this.rig.basePosition.lerpVectors(this.introPosition, this.timelinePosition, this.introWeight.value);
    this.rig.baseTarget.lerpVectors(this.introTarget, this.timelineTarget, this.introWeight.value);
    this.rig.update(dt, time, mouse);
    this.outline.material.uniforms.uScrollAlpha.value = ease(fit(this.progress, 0, 0.35, 1, 0), 'sine.in') * 2;
    this.updateBlocks(dt, time, mouse);
    this.updatePlexus();
    this.needsReset = false;
  }

  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.rig.camera);
  }
}
