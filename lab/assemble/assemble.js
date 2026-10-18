// Assemble: tens of thousands of particles that fly between scenes: a name set in type, a project
// still, a photo you drop on the page. Every particle has a place in the scene it left and the one
// it is going to; the GPU does the flight, so the CPU only samples each scene once.
// Lineage: Bruno Imbrizi's "Interactive Particles" on Codrops, and the image-to-particles demos it set off.

const VS = `
attribute vec2 aFrom, aTo;
attribute vec3 cFrom, cTo;
attribute vec4 aSeed;            // x random, y delay, z size in scene A, w size in scene B
uniform float uT, uTime, uDpr, uPoint, uMouseR, uSwirl;
uniform vec2 uRes, uMouse;
varying vec3 vCol;
varying float vA;
float ease(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }
void main() {
  float t = clamp((uT - aSeed.y) / 0.55, 0.0, 1.0);
  float e = ease(t);
  vec2 p = mix(aFrom, aTo, e);
  float k = sin(3.14159 * t);
  float a = aSeed.x * 6.2831 + uTime * 0.7 + p.y * 0.004;
  p += vec2(cos(a), sin(a)) * k * uSwirl * (0.35 + aSeed.x);
  p += vec2(sin(uTime * 1.3 + aSeed.x * 40.0), cos(uTime * 1.1 + aSeed.x * 31.0)) * 0.7;
  vec2 dm = p - uMouse;
  float d = length(dm);
  float f = smoothstep(uMouseR, 0.0, d);
  p += (dm / max(d, 0.001)) * f * uMouseR * 0.6;
  vCol = mix(cFrom, cTo, e) * (1.0 + f * 0.8);
  float s = mix(aSeed.z, aSeed.w, e);
  vA = step(0.01, s);
  gl_Position = vec4(p / (uRes * 0.5) * vec2(1.0, -1.0), 0.0, 1.0);
  gl_PointSize = max(1.0, uPoint * s * uDpr);
}`;

const FS = `
precision mediump float;
varying vec3 vCol;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.32, r) * vA;
  gl_FragColor = vec4(vCol * a, a);
}`;

export function mountAssemble(canvas, { count = 40000, onScene = () => {} } = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: true, alpha: false });
  if (!gl) throw new Error('WebGL is off in this browser');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const N = count;

  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(prog, s);
  }
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const U = {};
  for (const n of ['uT', 'uTime', 'uDpr', 'uPoint', 'uMouseR', 'uSwirl', 'uRes', 'uMouse']) U[n] = gl.getUniformLocation(prog, n);

  // one interleaved buffer per attribute keeps the swap cheap: B becomes A by re-pointing
  const buf = {};
  function attr(name, size, data) {
    const loc = gl.getAttribLocation(prog, name);
    if (!buf[name]) buf[name] = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf[name]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  let W = 0, H = 0;
  const rand = new Float32Array(N).map(() => Math.random());
  let cur = null;                 // the scene on screen, sampled for the current size
  let t = 1, dur = 2.2;
  const mouse = { x: 1e4, y: 1e4, tx: 1e4, ty: 1e4, r: 0, tr: 0 };

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // the box a scene is laid into: centred, clear of the bar and the captions
  function box(aspect) {
    const narrow = W < 700;
    const bw = W * (narrow ? 0.92 : 0.78), bh = H * (narrow ? 0.62 : 0.68);
    let w = bw, h = bw / aspect;
    if (h > bh) { h = bh; w = bh * aspect; }
    return { w, h, cy: narrow ? -H * 0.04 : -H * 0.02 };
  }

  // Sample a scene into N particles: positions (centred CSS px), colours, sizes.
  function sample(scene) {
    const pos = new Float32Array(N * 2), col = new Float32Array(N * 3), size = new Float32Array(N);
    const c = document.createElement('canvas');
    const x = c.getContext('2d', { willReadFrequently: true });
    let pts = [];
    if (scene.text) {
      const lines = scene.text.split('\n');
      x.font = scene.font(100);
      const wide = Math.max(...lines.map((l) => x.measureText(l).width));
      const aspect = wide / (100 * 1.05 * lines.length);
      const b = box(aspect);
      c.width = Math.ceil(b.w); c.height = Math.ceil(b.h);
      const px = 100 * b.w / wide;
      x.font = scene.font(px); x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'center';
      lines.forEach((l, i) => x.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * px * 1.05));
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let inside = 0;
      for (let i = 3; i < d.length; i += 16) if (d[i] > 128) inside++;
      const step = Math.max(1, Math.sqrt((inside * 4) / N) * 0.92);
      for (let yy = 0; yy < c.height; yy += step) {
        for (let xx = 0; xx < c.width; xx += step) {
          const jx = xx + (Math.random() - 0.5) * step, jy = yy + (Math.random() - 0.5) * step;
          const ix = Math.min(c.width - 1, Math.max(0, jx | 0)), iy = Math.min(c.height - 1, Math.max(0, jy | 0));
          if (d[(iy * c.width + ix) * 4 + 3] > 128) pts.push([jx - c.width / 2, jy - c.height / 2 + b.cy, ...scene.ink, 1]);
        }
      }
      scene.cell = step;
    } else {
      const img = scene.img;
      const aspect = img.width / img.height;
      const b = box(aspect);
      const cols = Math.round(Math.sqrt(N * aspect)), rows = Math.floor(N / cols);
      c.width = cols; c.height = rows;
      x.drawImage(img, 0, 0, cols, rows);
      const d = x.getImageData(0, 0, cols, rows).data;
      const cw = b.w / cols, ch = b.h / rows;
      for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
        const i = (r * cols + q) * 4;
        const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
        const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        // a halftone: brighter pixels are bigger dots, near-black ones almost vanish
        const s = lum < 0.04 ? 0.18 : 0.42 + 0.9 * Math.pow(lum, 0.7);
        const boost = 1.15;
        pts.push([(q + 0.5) * cw - b.w / 2, (r + 0.5) * ch - b.h / 2 + b.cy, Math.min(1, R * boost), Math.min(1, G * boost), Math.min(1, B * boost), s]);
      }
      scene.cell = Math.min(cw, ch);
    }
    // fit to exactly N: drop a random surplus, or hide the extra particles inside real ones
    for (let i = pts.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pts[i], pts[j]] = [pts[j], pts[i]]; }
    const real = Math.min(pts.length, N);
    for (let i = 0; i < N; i++) {
      const p = pts[i < real ? i : (Math.random() * real) | 0];
      pos[i * 2] = p[0]; pos[i * 2 + 1] = p[1];
      col.set([p[2], p[3], p[4]], i * 3);
      size[i] = i < real ? p[5] : 0;
    }
    return { pos, col, size, cell: scene.cell, scene };
  }

  function upload(from, to) {
    attr('aFrom', 2, from.pos); attr('aTo', 2, to.pos);
    attr('cFrom', 3, from.col); attr('cTo', 3, to.col);
    // the sweep: particles bound for the left of the scene leave first
    const seed = new Float32Array(N * 4);
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < N; i++) { const v = to.pos[i * 2]; if (v < minX) minX = v; if (v > maxX) maxX = v; }
    for (let i = 0; i < N; i++) {
      const u = (to.pos[i * 2] - minX) / (maxX - minX || 1);
      seed[i * 4] = rand[i];
      seed[i * 4 + 1] = u * 0.36 + rand[i] * 0.09;
      seed[i * 4 + 2] = from.size[i];
      seed[i * 4 + 3] = to.size[i];
    }
    attr('aSeed', 4, seed);
  }

  // a scattered start, so the first scene assembles out of dust
  function dust() {
    const pos = new Float32Array(N * 2), col = new Float32Array(N * 3).fill(0.5), size = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.max(W, H) * 0.7;
      pos[i * 2] = Math.cos(a) * r; pos[i * 2 + 1] = Math.sin(a) * r;
      size[i] = Math.random() < 0.35 ? 0.5 : 0;
    }
    return { pos, col, size, cell: 3 };
  }

  let pointSize = 3;
  function go(scene, instant = false) {
    const next = sample(scene);
    const from = cur || dust();
    upload(instant ? next : from, next);
    cur = next;
    pointSize = Math.max(1.6, next.cell * 1.18);
    t = instant ? 1 : 0;
    onScene(scene);
  }

  let last = performance.now(), t0 = last, raf = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    t = Math.min(1, t + dt / (reduced ? 0.6 : dur));
    mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 9);
    mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 9);
    mouse.r += (mouse.tr - mouse.r) * Math.min(1, dt * 6);
    gl.clearColor(10 / 255, 11 / 255, 13 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(U.uT, t);
    gl.uniform1f(U.uTime, (now - t0) / 1000);
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform1f(U.uPoint, pointSize);
    gl.uniform1f(U.uSwirl, reduced ? 0 : Math.min(W, H) * 0.16);
    gl.uniform2f(U.uRes, W, H);
    gl.uniform2f(U.uMouse, mouse.x, mouse.y);
    gl.uniform1f(U.uMouseR, mouse.r);
    if (cur) gl.drawArrays(gl.POINTS, 0, N);
    raf = requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.tx = e.clientX - r.left - W / 2; mouse.ty = e.clientY - r.top - H / 2;
    if (mouse.x > 5e3) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
    mouse.tr = Math.min(W, H) * (W < 700 ? 0.16 : 0.11);
  });
  canvas.addEventListener('pointerleave', () => { mouse.tr = 0; });
  canvas.addEventListener('pointerdown', () => { mouse.r *= 2.2; });

  let scene = null;
  resize();
  addEventListener('resize', () => { resize(); if (scene) go(scene, true); });
  raf = requestAnimationFrame(frame);
  return {
    show(s) { scene = s; go(s); },
    get busy() { return t < 1; },
    stop() { cancelAnimationFrame(raf); }
  };
}

export function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
