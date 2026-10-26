// The frame around the three scenes, as on igloo.inc: the wheel never scrolls the page, it feeds
// one number; the scenes are stacked by height and the number loops through them; each scene
// renders into its own target with its own bloom and grade; one full-screen pass cuts from one
// scene to the next along a cracked diagonal, or opens a project through frost.
import * as THREE from 'three';
import {
  gsap, reduced, clamp, fit, ease, lerpFPS, frictionFPS, scrollTexture, noiseTexture, cloudTexture, frostTexture,
  GL_FIT, GL_NOISE, GL_CA, Bloom, fullscreen, drawFS, FS_VERT,
} from './lib.js';
import { IglooScene } from './scene-igloo.js';
import { CubesScene, DetailScene } from './scene-cubes.js';
import { EntryScene } from './scene-entry.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';

const params = new URLSearchParams(location.search);
const NOSNAP = params.has('nosnap');
const CALM = params.has('static') || reduced;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const COLOR = /* glsl */`
  vec3 toSRGB(vec3 c) { return mix(pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
  vec3 toLinear(vec3 c) { return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, vec3(lessThanEqual(c, vec3(0.04045)))); }
  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
  }
  vec3 hsv2rgb(vec3 c) { vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return c.z * mix(vec3(1.0), rgb, c.y); }
`;

// ─── one scene's own chain: render, bloom, its grade (Igloo uses a 3D LUT per scene) ──────
const finishFrag = /* glsl */`
  uniform sampler2D tScene, tBloom, tNoise, tScroll;
  uniform float uBloom, uGradeAlpha, uRingProximity, uGlare, uTime, uGamma, uSat;
  uniform vec3 uSquare, uLift, uGain;
  uniform vec2 uResolution, uNoiseOffset;
  varying vec2 vUv;
  ${COLOR}
  float sineField(vec3 p) {
    return (sin(dot(p, vec3(1.3, 3.7, 1.1))) + sin(dot(p, vec3(3.3, -2.9, 3.9))) + sin(dot(p, vec3(0.5, 2.1, -1.7)))
          + sin(dot(p, vec3(-0.2, -3.1, -0.7))) + sin(dot(p, vec3(-3.7, -0.4, -1.3))) + sin(dot(p, vec3(2.2, -1.3, -2.6)))) / 6.0;
  }
  void main() {
    vec2 uv = vUv;
    vec3 noise = texture2D(tNoise, gl_FragCoord.xy / 64.0 + uNoiseOffset).rgb;
    float aspect = uResolution.x / uResolution.y;
    vec3 scene;
    if (uRingProximity > 0.0) {
      // Crossing a ring: smear round the centre, break into squares, push the colour.
      vec2 p = uv - 0.5; p.x *= aspect;
      float ang = atan(p.y, p.x) + 0.3 * (noise.r - 0.5) * uRingProximity;
      vec2 q = vec2(cos(ang), sin(ang)) * length(p); q.x /= aspect; q += 0.5;
      float sq = texture2D(tScroll, q * 1.5 + uSquare.xy).g * 2.0 - 1.0;
      q += sq * 0.01 * uSquare.z * uRingProximity;
      scene = texture2D(tScene, q).rgb;
      if (length(scene) < length(vec3(1.0))) {
        vec3 h = rgb2hsv(scene);
        h.y += 0.05 * uRingProximity; h.z += 0.075 * uRingProximity;
        scene = hsv2rgb(h);
      }
    } else {
      scene = texture2D(tScene, uv).rgb;
    }
    // A cold glare from the top right.
    scene += uGlare * pow(vUv.x * vUv.y, 2.0) * (sineField(vec3(vUv.x * aspect, vUv.y, uTime * 0.5)) * 0.4 + 0.4) * vec3(0.8, 0.9, 1.0) * noise.b * 2.0;
    vec3 color = scene + texture2D(tBloom, uv).rgb * uBloom;
    vec3 s = toSRGB(clamp(color, 0.0, 1.0));
    vec3 g = pow(max(s * uGain + uLift, 0.0), vec3(uGamma));
    g = mix(vec3(dot(g, vec3(0.2126, 0.7152, 0.0722))), g, uSat);
    gl_FragColor = vec4(toLinear(clamp(mix(s, g, uGradeAlpha), 0.0, 1.0)), 1.0);
  }
`;

// Each scene's grade, the job of its LUT: lift, gain, gamma and saturation in display space.
const GRADES = {
  igloo: { lift: [-0.01, -0.008, -0.004], gain: [0.9, 0.9, 0.9], gamma: 1.08, sat: 0.72 },
  cubes: { lift: [0, 0, -0.005], gain: [0.82, 0.83, 0.84], gamma: 1.1, sat: 0.85 },
  entry: { lift: [0, 0, 0], gain: [0.84, 0.85, 0.87], gamma: 1.12, sat: 0.85 },
  detail: { lift: [0, 0, 0], gain: [1, 1, 1], gamma: 1, sat: 1 },
};

class ScenePass {
  constructor(scene, ctx, opts) {
    this.scene = scene;
    this.ctx = ctx;
    this.rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: opts.samples });
    this.out = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.bloom = new Bloom(6);
    const g = GRADES[scene.name] || GRADES.detail;
    const post = scene.post || {};
    this.intensity = opts.intensity || { value: 1 };
    // The mip chain sums about four copies of the bright pass; this brings it back to a glow.
    this.bloomScale = scene.bloomScale ?? 0.11;
    this.finish = fullscreen(new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom: { value: null }, tNoise: { value: ctx.noiseTex }, tScroll: { value: ctx.scrollTex },
        uBloom: { value: 0.1 }, uGradeAlpha: opts.gradeAlpha || { value: 1 }, uTime: ctx.uniforms.uTime, uResolution: ctx.uniforms.uResolution,
        uNoiseOffset: { value: new THREE.Vector2() },
        uRingProximity: post.uRingProximity || { value: 0 }, uSquare: post.uSquare || { value: new THREE.Vector3() }, uGlare: post.uGlare || { value: 0 },
        uLift: { value: new THREE.Vector3(...g.lift) }, uGain: { value: new THREE.Vector3(...g.gain) }, uGamma: { value: g.gamma }, uSat: { value: g.sat },
      },
      vertexShader: FS_VERT, fragmentShader: finishFrag, depthTest: false, depthWrite: false,
    }));
  }
  setSize(w, h) {
    this.rt.setSize(w, h);
    this.out.setSize(w, h);
    this.bloom.setSize(w, h);
  }
  render(renderer) {
    this.scene.render(renderer, this.rt);
    const b = this.bloom.render(renderer, this.rt.texture, this.scene.bloomThreshold ?? 0.2, 0.85);
    const u = this.finish.material.uniforms;
    u.tScene.value = this.rt.texture;
    u.tBloom.value = b;
    u.uBloom.value = this.intensity.value * this.bloomScale;
    u.uNoiseOffset.value.set(Math.random(), Math.random());
    drawFS(renderer, this.finish, this.out);
    return this.out.texture;
  }
}

// ─── the cut between scenes, and the frost into a project (their f3) ──────────────────────
const compositeFrag = /* glsl */`
  uniform sampler2D tScene1, tScene2, tScroll, tBlue, tDetail, tCubes, tFrost;
  uniform vec2 uBlueOffset, uResolution;
  uniform float uProgress, uDetailProgress, uDetailProgress2, uIntro, uTime;
  uniform bool uInCubes;
  uniform vec3 uLoad;
  varying vec2 vUv;
  ${GL_FIT}
  ${GL_NOISE}
  ${GL_CA}
  ${COLOR}
  float quinticOut(float t) { return 1.0 - pow(1.0 - t, 5.0); }
  vec4 blueNoise() { return texture2D(tBlue, gl_FragCoord.xy / 64.0 + uBlueOffset); }
  void main() {
    float aspect = uResolution.x / uResolution.y;
    vec3 color;
    if (uProgress > 0.0) {
      vec2 uvTex = vUv - 0.5; uvTex.x *= aspect; uvTex += 0.5;
      vec3 st = texture2D(tScroll, uvTex).rgb;
      // A diagonal edge, wobbled, sweeping up the screen.
      float slopeDisp = (st.b * 2.0 - 1.0) * 0.4;
      float slope = abs(-0.2 * aspect);
      float d = vUv.y + (vUv.x + slopeDisp) * slope;
      float incP = fit(uProgress, 0.0, 1.0, 0.0, 1.0 + slope);
      float blur = falloff(d, 0.0, 1.0, 2.0, incP);
      float cutDisp = falloff(st.g, 0.0, 1.0, 1.0, falloff(d, 0.0, 1.0, 0.9, incP));
      // The ice: cracks give way first, then each shard.
      float cut = falloff(st.r, 0.0, 1.0, 2.0, falloff(d, 0.0, 1.0, 0.2, incP));
      vec4 nz = blueNoise();
      float mod = 12.0 * smoothstep(1.0, 0.7, abs(vUv.x * 2.0 - 1.0)) * smoothstep(1.0, 0.7, abs(vUv.y * 2.0 - 1.0));
      vec3 s1 = vec3(0.0), s2 = vec3(0.0);
      if (cut < 1.0) s1 = aberrate(tScene1, vUv - vec2(0.0, 0.4 * cubicIn(uProgress) + 0.025 * cutDisp), mod, blur * nz.r);
      if (cut > 0.0) s2 = aberrate(tScene2, vUv + vec2(0.0, 0.4 * cubicIn(1.0 - uProgress) + 0.025 * (1.0 - cutDisp)), mod, (1.0 - blur) * nz.g);
      color = clamp(mix(s1, s2, cut), 0.0, 1.0);
    } else if (uInCubes && uDetailProgress > 0.0) {
      if (uDetailProgress < 1.0 || uDetailProgress2 < 1.0) {
        vec2 uvTex = vUv - 0.5; uvTex.x *= aspect; uvTex += 0.5;
        float tr = fit(uDetailProgress, 0.4, 1.0, 0.0, 1.0);
        vec4 nz = blueNoise();
        float mod = 8.0 * smoothstep(1.0, 0.5, abs(vUv.x * 2.0 - 1.0)) * smoothstep(1.0, 0.5, abs(vUv.y * 2.0 - 1.0));
        float tech = texture2D(tScroll, (uvTex - 0.5) * 0.1).g * 2.0 - 1.0;
        vec2 dispTech = vec2(tech * 0.005, 0.0);
        float fr = texture2D(tFrost, (uvTex - 0.5) * 5.0 * (1.0 - uDetailProgress)).r * 2.0 - 1.0;
        vec2 disp = vec2(fr) * 0.1;
        vec3 sc = vec3(0.0), dt = vec3(0.0);
        if (tr < 1.0) sc = aberrate(tCubes, vUv + disp * quadIn(fit(uDetailProgress, 0.1, 0.9, 0.0, 1.0)) + dispTech * quinticOut(uDetailProgress), mod, cubicOut(uDetailProgress) * nz.r);
        if (tr > 0.0) dt = aberrate(tDetail, vUv + disp * fit(uDetailProgress, 0.1, 0.9, 1.0, 0.0) + dispTech * fit(uDetailProgress2, 0.7, 1.0, 1.0, 0.0), mod, cubicOut(1.0 - uDetailProgress2) * nz.r);
        color = mix(sc, dt, tr);
      } else {
        color = texture2D(tDetail, vUv).rgb;
      }
    } else {
      color = texture2D(tScene1, vUv).rgb;
    }
    // The loader's grey gives way to the first frame (their p3).
    color = mix(uLoad, color, uIntro);
    vec3 s = toSRGB(clamp(color, 0.0, 1.0));
    s += (hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5) / 255.0;
    gl_FragColor = vec4(s, 1.0);
  }
`;

// ─── the scroll (their jF) ────────────────────────────────────────────────────────────────
class Controller {
  constructor(scenes) {
    this.scenes = scenes;
    this.scroll = { total: 0, targetY1: 0, targetY2: 0, y: 0, velocity: 0 };
    this.auto = { needed: false, animating: false, lastTarget: 0, lastTime: 0 };
    this.mult = 0.00075;
    this.enabled = false;
    this.detailOpen = false;
    this.current = 0;
    this.next = null;
    this.progress = 0;
    this.time = 0;
  }

  add(delta) {
    if (!this.enabled) return;
    this.stopAutoCenter();
    this.scroll.targetY2 += delta;
  }

  update(dt, time) {
    this.time = time;
    const s = this.scroll, a = this.auto, m = this.mult;
    if (s.targetY2 !== a.lastTarget) { a.needed = true; a.lastTarget = s.targetY2; a.lastTime = time; }
    const before = s.y;
    if (!a.animating) {
      const n = lerpFPS(s.targetY1, s.targetY2, 0.075, dt), lim = 100 * m * dt * 60;
      s.targetY1 += clamp(n - s.targetY1, -lim, lim);
      s.y = lerpFPS(s.y, s.targetY1, 0.15, dt);
      s.targetY2 = clamp(s.targetY2, s.y - 750 * m, s.y + 750 * m);
      if (Math.abs(s.y - s.targetY2) < 0.1 * m) { s.y = s.targetY2; s.targetY1 = s.targetY2; }
    }
    s.velocity += Math.abs(s.y - before);
    s.velocity = clamp(s.velocity * frictionFPS(0.98, dt), 0, 1);
    if (s.velocity < 0.001) s.velocity = 0;

    s.total = 0;
    this.scenes.forEach((sc) => { sc.top = s.total; sc.bottom = sc.top + sc.height; s.total += sc.height; });
    const T = s.total, r2 = (x) => Math.round(x * 100) / 100;
    const mod = s.y % T, top = s.y >= 0 ? mod : T - Math.abs(mod), bottom = top + 1, wrapped = bottom % T;
    let o = null, l = null, c = 0;
    this.scenes.forEach((sc, i) => {
      const x = r2(top) >= sc.top && r2(top) < sc.bottom, v = r2(wrapped) > sc.top && r2(wrapped) <= sc.bottom;
      if (x || v) {
        sc.progress = ((x ? bottom : wrapped) - sc.top) / (sc.height + 1);
        if (x) o = i; else { l = i; c = wrapped - sc.top; }
        sc.isSceneVisible = true;
      } else sc.isSceneVisible = false;
    });
    this.current = o; this.next = l; this.progress = c;

    // 1.4 s after the last input, settle: onto a scene's edge if a cut is on screen, otherwise
    // wherever the scene itself wants to rest.
    if (this.enabled && !NOSNAP && a.needed && !a.animating && time - a.lastTime > 1.4) {
      a.needed = false;
      const p = s.targetY2 % T, A = s.targetY2 >= 0 ? p : T - Math.abs(p), mm = (A + 1) % T;
      if (c % 1 !== 0) {
        let best = Infinity, v = 0;
        [o, l].forEach((k) => {
          if (k === null) return;
          const sc = this.scenes[k], screenTop = A > mm ? A - T : A;
          [sc.top, sc.bottom].forEach((edge) => [screenTop, screenTop + 1].forEach((scr) => {
            const P = edge - scr;
            if (Math.abs(P) < best) { best = Math.abs(P); v = P; }
          }));
        });
        if (v !== 0) {
          let y = s.targetY2 + v, dur = 2;
          const w = v < 0 ? o : l, C = this.scenes[w];
          if (typeof C.initialScrollAutocenter === 'number' && typeof C.finalScrollAutocenter === 'number') {
            const M = 1 / (C.height + 1);
            const extra = ((w === o ? 1 - C.finalScrollAutocenter : C.initialScrollAutocenter) - M) * (C.height + 1);
            y += extra * Math.sign(v);
            dur += extra * 2;
          }
          this.centerScroll(y, dur);
        }
      } else if (o !== null && this.scenes[o].autoCenter) {
        this.scenes[o].autoCenter(this, A);
      }
    }
  }

  centerScroll(y, duration) {
    const target = Math.round(y * 100) / 100, s = this.scroll;
    this.auto.animating = true;
    gsap.to(s, {
      y: target, duration: CALM ? Math.min(duration, 0.8) : duration, ease: 'inOut3', overwrite: true,
      onUpdate: () => { s.targetY1 = s.y; s.targetY2 = s.y; this.auto.lastTarget = s.y; },
      onComplete: () => { this.auto.animating = false; },
    });
  }

  stopAutoCenter() {
    if (this.auto.animating) { gsap.killTweensOf(this.scroll); this.auto.animating = false; }
  }

  resize() {
    this.stopAutoCenter();
    this.scroll.targetY2 = this.scroll.targetY1 = this.scroll.y;
    this.auto.lastTarget = Infinity;
  }
}

// ─── boot ─────────────────────────────────────────────────────────────────────────────────
async function boot() {
  const data = window.PORTFOLIO;
  const profile = data.profile;
  const projects = data.projects.filter((p) => p.tier === 'flagship');
  const career = profile.career;
  const links = [
    { title: 'Email', url: `mailto:${profile.email}`, shape: 'at', scale: 1.15, note: profile.email },
    { title: 'GitHub', url: profile.github, shape: 'code', scale: 1.2, note: profile.github.replace('https://', '') },
    { title: 'StudyLog', url: '/blog/', shape: 'book', scale: 1.2, note: `${data.writing.total} notes` },
  ];
  const ui = new UI({ profile, projects, links, career, path: data.path, calm: CALM });

  const canvas = document.getElementById('gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true });
    if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 needed');
  } catch (err) {
    ui.noWebGL();
    return;
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 1);

  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 640;
  const quality = coarse || small ? 'low' : 'high';
  let dpr = Math.min(devicePixelRatio || 1, quality === 'low' ? 1.25 : 1.5);
  const samples = quality === 'high' && renderer.capabilities.maxSamples >= 4 ? 4 : 0;

  ui.progress(0.05);
  await Promise.race([
    Promise.all(['500 64px "IBM Plex Mono"', '600 64px "IBM Plex Mono"', '400 34px "IBM Plex Mono"'].map((f) => document.fonts.load(f))),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  await nextFrame();

  const ctx = {
    renderer,
    uniforms: { uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(1, 1) }, uPixel: { value: dpr } },
    bloomIntensity: { value: 1 },
    gradeAlpha: { value: 0 },
    noiseTex: noiseTexture(64),
    scrollTex: scrollTexture(512),
    cloudTex: cloudTexture(256),
    pixelRatio: () => dpr,
    onIntroUI: () => ui.intro(),
  };
  ui.progress(0.2);
  await nextFrame();
  const igloo = new IglooScene(ctx);
  ui.progress(0.45);
  await nextFrame();
  const cubes = new CubesScene(ctx, projects);
  const detail = new DetailScene(ctx, projects);
  ui.progress(0.65);
  await nextFrame();
  const entry = new EntryScene(ctx, { career, links, quality });
  ui.progress(0.9);
  await nextFrame();

  const scenes = [igloo, cubes, entry];
  const controller = new Controller(scenes);
  const passes = [
    new ScenePass(igloo, ctx, { samples, intensity: ctx.bloomIntensity, gradeAlpha: ctx.gradeAlpha }),
    new ScenePass(cubes, ctx, { samples }),
    new ScenePass(entry, ctx, { samples }),
  ];
  const detailPass = new ScenePass(detail, ctx, { samples: 0 });
  const U = {
    tScene1: { value: null }, tScene2: { value: null }, tScroll: { value: ctx.scrollTex }, tBlue: { value: ctx.noiseTex },
    tDetail: { value: null }, tCubes: { value: null }, tFrost: { value: frostTexture(256) },
    uBlueOffset: { value: new THREE.Vector2() }, uResolution: ctx.uniforms.uResolution, uTime: ctx.uniforms.uTime,
    uProgress: { value: 0 }, uDetailProgress: { value: 0 }, uDetailProgress2: { value: 0 }, uIntro: { value: 0 },
    uInCubes: { value: false }, uLoad: { value: new THREE.Color('#8b909d') },
  };
  const composite = fullscreen(new THREE.ShaderMaterial({ uniforms: U, vertexShader: FS_VERT, fragmentShader: compositeFrag, depthTest: false, depthWrite: false }));
  const sound = new Sound();

  // ── size ──
  let W = 1, H = 1;
  function resize() {
    W = innerWidth; H = innerHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    const pw = Math.max(2, Math.round(W * dpr)), ph = Math.max(2, Math.round(H * dpr));
    ctx.uniforms.uResolution.value.set(pw, ph);
    ctx.uniforms.uPixel.value = dpr;
    passes.forEach((p) => p.setSize(pw, ph));
    detailPass.setSize(pw, ph);
    scenes.forEach((s) => s.resize(W, H));
    detail.resize(W, H);
    controller.resize();
  }
  resize();
  addEventListener('resize', resize);

  // ── input ──
  const mouse = new THREE.Vector2();
  const pointerPx = { x: W / 2, y: H / 2, active: false };
  addEventListener('pointermove', (e) => {
    mouse.set((e.clientX / W) * 2 - 1, -(e.clientY / H) * 2 + 1);
    pointerPx.x = e.clientX; pointerPx.y = e.clientY; pointerPx.active = e.pointerType === 'mouse';
  }, { passive: true });
  addEventListener('wheel', (e) => {
    if (ui.wantsWheel(e)) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1;
    controller.add(e.deltaY * unit * controller.mult);
  }, { passive: false });
  let touch = null;
  canvas.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touch = { y: t.clientY, x: t.clientX, x0: t.clientX, y0: t.clientY, t0: performance.now() };
    mouse.set((t.clientX / W) * 2 - 1, -(t.clientY / H) * 2 + 1);
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (!touch) return;
    const t = e.changedTouches[0];
    controller.add(((t.clientY - touch.y) / H) * -2 * -1.25 * -1);
    touch.y = t.clientY; touch.x = t.clientX;
    mouse.set((t.clientX / W) * 2 - 1, -(t.clientY / H) * 2 + 1);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    if (!touch) return;
    const t = e.changedTouches[0], dx = t.clientX - touch.x0, dy = t.clientY - touch.y0, ms = performance.now() - touch.t0;
    // A quick sideways swipe in the room changes the shape, as on the original.
    if (entry.roomActive && Math.abs(dx) > 100 && Math.abs(dx) > Math.abs(dy) * 1.5 && ms < 500) entry.changeLink(dx < 0 ? 1 : -1);
    touch = null;
  }, { passive: true });

  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (controller.detailOpen) { if (e.key === 'Escape') closeDetail(); return; }
    const step = { ArrowDown: 150, ArrowUp: -150, PageDown: 600, PageUp: -600, ' ': e.shiftKey ? -600 : 600 }[e.key];
    if (step !== undefined && !e.target.closest('button, a')) { e.preventDefault(); controller.add(step * controller.mult); }
    if (entry.roomActive && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { entry.changeLink(e.key === 'ArrowRight' ? 1 : -1); sound.blip('long'); }
    if (e.key === 'Enter' && controller.current === 1 && !e.target.closest('button, a')) {
      const { idx, delta } = cubes.nearest();
      if (Math.abs(delta) < 0.05) openDetail(idx);
    }
  });

  canvas.addEventListener('click', (e) => {
    if (controller.detailOpen || !controller.enabled) return;
    if (controller.current === 1 && cubes.hover >= 0) { openDetail(cubes.hover); return; }
    if (entry.roomActive) { entry.changeLink(e.clientX < W / 2 ? -1 : 1); sound.blip('long'); }
  });

  // ── the project view (their navigateToSection) ──
  let detailIndex = 0;
  function centerDetailScene(animate = true) {
    if (!cubes.visible || !animate) {
      controller.scroll.y = igloo.height;
      controller.resize();
      cubes.progress = 1 / (cubes.height + 1);
    }
    const n = (cubes.cubes[detailIndex].centeredProgress - cubes.progress) * (cubes.height + 1);
    const dur = animate ? ease(fit(Math.abs(n), 0, 0.2, 0.05, 1), 'expo.out') * 1.5 : 0;
    controller.centerScroll(controller.scroll.y + n, dur);
    return dur;
  }
  function openDetail(i, { instant = false, push = true } = {}) {
    if (controller.detailOpen || (!instant && !cubes.visible)) return;
    controller.detailOpen = true;
    detailIndex = i;
    controller.enabled = false;
    const p = projects[i];
    if (push) history.pushState({ project: p.id }, '', `#${p.id}`);
    detail.show(i, p.color);
    if (instant) {
      centerDetailScene(false);
      gsap.set([U.uDetailProgress, U.uDetailProgress2], { value: 1, overwrite: true });
      cubes.detailIn(0);
      ui.showDetail(p, i, 0.2);
      return;
    }
    const a = centerDetailScene() * 0.5;
    gsap.to(U.uDetailProgress, { value: 1, ease: 'power3.in', delay: a, duration: 1.25, overwrite: true });
    gsap.to(U.uDetailProgress2, { value: 1, ease: 'sine.out', delay: a + 0.75, duration: 1.25, overwrite: true });
    cubes.detailIn(a);
    sound.blip('click');
    gsap.delayedCall(a, () => sound.whoosh());
    ui.showDetail(p, i, a + 1.2);
  }
  function closeDetail({ fromHistory = false } = {}) {
    if (!controller.detailOpen) return;
    if (!fromHistory) {
      if (history.state && history.state.project) { history.back(); return; }
      history.replaceState(null, '', location.pathname + location.search);
    }
    centerDetailScene(false);
    gsap.to(U.uDetailProgress, { value: 0, ease: 'power2.out', duration: 1.25, overwrite: true });
    gsap.to(U.uDetailProgress2, { value: 0, ease: 'power2.out', duration: 0.6, overwrite: true });
    cubes.detailOut();
    ui.hideDetail();
    sound.whoosh(true);
    gsap.delayedCall(1, () => { controller.detailOpen = false; controller.enabled = true; });
  }
  addEventListener('popstate', () => {
    const id = location.hash.slice(1);
    const i = projects.findIndex((p) => p.id === id);
    if (i >= 0 && !controller.detailOpen) openDetail(i, { push: false });
    else if (i < 0 && controller.detailOpen) closeDetail({ fromHistory: true });
  });

  ui.bind({
    onOpen: (i) => { if (!controller.detailOpen) { if (!cubes.visible) { controller.scroll.y = igloo.height; controller.resize(); } openDetail(i); } },
    onClose: () => closeDetail(),
    onSound: () => sound.toggle(),
    onLink: (dir) => { entry.changeLink(dir); sound.blip('long'); },
    onHover: () => sound.blip('tick'),
    onJump: (where) => {
      // Skip links for keyboards: straight to the work or the contact room.
      const T = igloo.height + cubes.height + entry.height;
      const base = Math.floor(controller.scroll.y / T) * T;
      const y = where === 'work' ? igloo.height : igloo.height + cubes.height + entry.finalScrollAutocenter * (entry.height + 1) - 1;
      controller.stopAutoCenter();
      controller.centerScroll(base + y, 1.6);
    },
    linkState: () => entry.currentLink,
  });

  // ── start: the grey loader gives way while the igloo builds itself ──
  ui.progress(1);
  await nextFrame();
  ui.done();
  const deep = projects.findIndex((p) => `#${p.id}` === location.hash);
  // Start the scroll where the igloo rests (their intro's first call).
  controller.scroll.y = controller.scroll.targetY1 = controller.scroll.targetY2 = (igloo.initialScrollAutocenter - 1 / (igloo.height + 1)) * (igloo.height + 1);
  controller.auto.lastTarget = controller.scroll.targetY2;
  if (deep >= 0) {
    igloo.playIntro(true);
    gsap.fromTo(U.uIntro, { value: 0 }, { value: 1, duration: 1, ease: 'power2.inOut' });
    controller.update(0, 0);
    openDetail(deep, { instant: true, push: false });
  } else {
    igloo.playIntro(CALM);
    gsap.fromTo(U.uIntro, { value: 0 }, { value: 1, duration: CALM ? 0.4 : 1, ease: 'inOut3' });
    gsap.delayedCall(CALM ? 0.3 : 4.5, () => { controller.enabled = true; });
  }

  // ── frame loop ──
  let last = performance.now(), time = 0, slow = 0, frames = 0, acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0, 0.1);
    last = now;
    time += dt;
    ctx.uniforms.uTime.value = time;
    controller.update(dt, time);
    scenes.forEach((s) => { if (s.visible) s.update(dt, time, mouse, controller); });
    if (U.uDetailProgress.value > 0) detail.update(dt, time, mouse);

    const o = controller.current, l = controller.next;
    if (U.uDetailProgress.value < 1) {
      if (o !== null) U.tScene1.value = passes[o].render(renderer);
      if (l !== null) U.tScene2.value = passes[l].render(renderer);
    }
    U.tCubes.value = passes[1].out.texture;
    U.uInCubes.value = o === 1;
    U.uProgress.value = controller.progress;
    if (U.uDetailProgress.value > 0) U.tDetail.value = detailPass.render(renderer);
    U.uBlueOffset.value.set(Math.random() * 10, Math.random() * 12.5);
    drawFS(renderer, composite, null);

    ui.update({
      scene: o === null ? null : scenes[o].name, next: l === null ? null : scenes[l].name, cut: controller.progress,
      iglooProgress: igloo.progress, iglooVisible: igloo.visible,
      cubes: { visible: cubes.visible && o === 1 && controller.progress === 0, hover: cubes.hover, nearest: cubes.nearest() },
      entry: { visible: entry.visible, step: entry.pathStep, room: entry.roomActive, link: entry.currentLink },
      detailOpen: controller.detailOpen, pointer: pointerPx, enabled: controller.enabled,
    });
    sound.update({
      wind: igloo.visible ? 1 - controller.progress * (l !== null && scenes[l] !== igloo ? 1 : 0) : 0,
      portals: entry.visible ? entry.portalsVolume : 0,
      particles: entry.visible ? entry.particlesVolume : 0,
      room: entry.visible ? fit(entry.progress, 0.5, 0.7, 0, 1) : 0,
      velocity: controller.scroll.velocity,
    });

    // Keep it smooth on slow machines: drop the resolution a step at a time.
    acc += dt; frames++;
    if (frames === 90) {
      if (acc / frames > 0.026 && dpr > 0.75) { slow++; if (slow >= 2) { dpr = Math.max(0.75, dpr - 0.25); resize(); slow = 0; } } else slow = 0;
      acc = 0; frames = 0;
    }
  }
  requestAnimationFrame(frame);
  window.__igloo = { controller, scenes, passes, U, openDetail, closeDetail, ui };
}

boot();
