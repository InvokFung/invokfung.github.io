// Handover: the figure on screen breaks into points, and the points rebuild as the next figure.
// Each figure is sampled once, from its own canvas. A point lands on a pixel with a chance that
// grows with the pixel's brightness, so the points trace what the figure draws and skip its
// background. The flight runs on the GPU (one draw call); the CPU only works out where a point
// is when a new handover starts mid-flight, so it can turn around from there.
// It grew out of lab/assemble, which flies points between a name, stills and a photo.

const VS = `
attribute vec2 aFrom, aTo;
attribute vec3 cFrom, cTo;
attribute vec2 aSeed;             // x random, y delay
uniform float uT, uTime, uDpr, uPoint, uSwirl, uFade;
uniform vec2 uRes;
varying vec3 vCol;
varying float vA;
float ease(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }
void main() {
  float t = clamp((uT - aSeed.y) / 0.6, 0.0, 1.0);
  float e = ease(t);
  vec2 p = mix(aFrom, aTo, e);
  float k = sin(3.14159 * t);
  float a = aSeed.x * 6.2831 + uTime * 0.8;
  p += vec2(cos(a), sin(a)) * k * uSwirl * (0.3 + aSeed.x);
  vCol = mix(cFrom, cTo, e);
  vA = uFade;
  gl_Position = vec4((p / uRes * 2.0 - 1.0) * vec2(1.0, -1.0), 0.0, 1.0);
  gl_PointSize = uPoint * uDpr * (1.0 + k * 0.7);
}`;

const FS = `
precision mediump float;
varying vec3 vCol;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.28, r) * vA;
  gl_FragColor = vec4(vCol * a, a);
}`;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function mountHandover(canvas, { count = 14000, bg = [10, 11, 13] } = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: true, alpha: true });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // no WebGL, or no motion wanted: hand over at once
  if (!gl || reduced) {
    return { go(target, { onStart, onDone } = {}) { onStart?.(); onDone?.(); }, get busy() { return false; }, resize() {} };
  }
  const N = count;
  const dpr = Math.min(devicePixelRatio || 1, 2);

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
  for (const n of ['uT', 'uTime', 'uDpr', 'uPoint', 'uSwirl', 'uFade', 'uRes']) U[n] = gl.getUniformLocation(prog, n);
  const buf = {};
  function attr(name, size, data) {
    const loc = gl.getAttribLocation(prog, name);
    if (!buf[name]) buf[name] = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf[name]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  let W = 0, H = 0;
  const rand = new Float32Array(N).map(() => Math.random());
  const seed = new Float32Array(N * 2);
  let A = null, B = null;          // where the points are coming from and going to
  let T = 1, dur = 1.25, fade = 0, done = null, start = null, raf = 0;
  const small = document.createElement('canvas');
  const sx = small.getContext('2d', { willReadFrequently: true });

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // N points on the bright pixels of a canvas laid over the same box as this one, in CSS px
  function sample(src) {
    const k = 2;                    // one sample per 2×2 CSS px
    const cw = Math.max(1, Math.round(W / k)), ch = Math.max(1, Math.round(H / k));
    small.width = cw; small.height = ch;
    sx.drawImage(src, 0, 0, cw, ch);
    const d = sx.getImageData(0, 0, cw, ch).data;
    const cum = new Float32Array(cw * ch);
    let total = 0;
    for (let i = 0, j = 0; j < cum.length; i += 4, j++) {
      const m = Math.max(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]) / 255;
      const w = m > 0.06 ? Math.pow(m, 1.3) : 0;
      total += w; cum[j] = total;
    }
    if (total < 1) return dust();
    const pos = new Float32Array(N * 2), col = new Float32Array(N * 3);
    for (let n = 0; n < N; n++) {
      const r = Math.random() * total;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
      const x = lo % cw, y = (lo / cw) | 0, i = lo * 4;
      pos[n * 2] = (x + Math.random()) * k; pos[n * 2 + 1] = (y + Math.random()) * k;
      // the pixel's colour, lifted so dim strokes still read as dots
      const mx = Math.max(d[i], d[i + 1], d[i + 2], 1), lift = Math.min(2.2, Math.max(1, 200 / mx));
      col[n * 3] = Math.min(1, d[i] * lift / 255); col[n * 3 + 1] = Math.min(1, d[i + 1] * lift / 255); col[n * 3 + 2] = Math.min(1, d[i + 2] * lift / 255);
    }
    return { pos, col };
  }

  // a scattered start, for the first figure
  function dust() {
    const pos = new Float32Array(N * 2), col = new Float32Array(N * 3);
    for (let n = 0; n < N; n++) {
      pos[n * 2] = Math.random() * W; pos[n * 2 + 1] = Math.random() * H;
      col.set([0.42, 0.42, 0.4], n * 3);
    }
    return { pos, col };
  }

  // where every point is right now, so a new handover can start from mid-flight
  function now() {
    const pos = new Float32Array(N * 2), col = new Float32Array(N * 3);
    for (let n = 0; n < N; n++) {
      const e = ease(Math.min(1, Math.max(0, (T - seed[n * 2 + 1]) / 0.6)));
      pos[n * 2] = A.pos[n * 2] + (B.pos[n * 2] - A.pos[n * 2]) * e;
      pos[n * 2 + 1] = A.pos[n * 2 + 1] + (B.pos[n * 2 + 1] - A.pos[n * 2 + 1]) * e;
      for (let c = 0; c < 3; c++) col[n * 3 + c] = A.col[n * 3 + c] + (B.col[n * 3 + c] - A.col[n * 3 + c]) * e;
    }
    return { pos, col };
  }

  function go(target, { from = null, onStart, onDone } = {}) {
    resize();
    const flying = T < 1 && A && B;
    const a = flying ? now() : from ? sample(from) : dust();
    const b = sample(target);
    // the sweep: points bound for the left of the figure leave first
    for (let n = 0; n < N; n++) { seed[n * 2] = rand[n]; seed[n * 2 + 1] = (b.pos[n * 2] / (W || 1)) * 0.3 + rand[n] * 0.1; }
    A = a; B = b;
    attr('aFrom', 2, A.pos); attr('aTo', 2, B.pos);
    attr('cFrom', 3, A.col); attr('cTo', 3, B.col);
    attr('aSeed', 2, seed);
    T = 0; fade = 1; done = onDone; start = onStart;
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  let last = 0;
  const t0 = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (T < 1) T = Math.min(1, T + dt / dur);
    else if (done) { const f = done; done = null; f(); }
    else fade = Math.max(0, fade - dt / 0.35);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (fade > 0) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(U.uT, T);
      gl.uniform1f(U.uTime, (t - t0) / 1000);
      gl.uniform1f(U.uDpr, dpr);
      gl.uniform1f(U.uPoint, W < 600 ? 1.7 : 2.1);
      gl.uniform1f(U.uSwirl, Math.min(W, H) * 0.12);
      gl.uniform1f(U.uFade, fade);
      gl.uniform2f(U.uRes, W, H);
      gl.drawArrays(gl.POINTS, 0, N);
    }
    // the first frame the points are drawn is the frame the figure underneath can disappear
    if (start) { const f = start; start = null; f(); }
    raf = fade > 0 || T < 1 ? requestAnimationFrame(frame) : 0;
  }

  resize();
  return {
    go,
    get busy() { return T < 1 || !!done; },
    resize
  };
}
