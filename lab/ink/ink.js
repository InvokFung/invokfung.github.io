// Ink: a fluid you stir with the cursor, drawn as a screen of monospace characters.
// The ink is my name. Stir it into smoke and it slowly settles back into the letters.
//
// The fluid is Jos Stam's stable fluids on the CPU, one cell per character. The characters are
// drawn by one fragment shader from a glyph atlas: denser ink picks a heavier glyph.
// Lineage: Pavel Dobryakov's WebGL Fluid Simulation (the "splash cursor"), and ASCII renderers
// such as Pretext's fluid smoke demo and ertdfgcvb's play.core.

const RAMP = ' .\'`,:;-~=+*ox%#@';

const VS = `attribute vec2 p; varying vec2 vUv; void main() { vUv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `precision mediump float;
uniform sampler2D uData, uAtlas;
uniform vec2 uGrid;
uniform float uGlyphs;
uniform vec3 uBg, uInk, uHot;
varying vec2 vUv;
void main() {
  vec2 g = vUv * uGrid;
  vec2 cell = floor(g);
  vec4 d = texture2D(uData, (cell + 0.5) / uGrid);
  float idx = floor(clamp(d.r, 0.0, 0.999) * uGlyphs);
  float a = texture2D(uAtlas, vec2((idx + fract(g.x)) / uGlyphs, fract(g.y))).a;
  vec3 col = mix(uInk, uHot, smoothstep(0.08, 0.55, d.g));
  a *= 0.3 + 0.7 * smoothstep(0.0, 0.45, d.r);
  gl_FragColor = vec4(mix(uBg, col, a), 1.0);
}`;

export function mountInk(canvas, { name = ['Alan Fung'], cellFont = '500 13px "JetBrains Mono"', nameFont = (px) => `400 ${px}px "Instrument Serif"`, onFrame = () => {}, isLive = () => true } = {}) {
  const gl = canvas.getContext('webgl', { antialias: false });
  if (!gl) throw new Error('WebGL is off in this browser');
  const dpr = Math.min(devicePixelRatio || 1, 2);

  // measure one character cell
  const m = document.createElement('canvas').getContext('2d');
  m.font = cellFont;
  const cw = Math.ceil(m.measureText('M').width * 10) / 10, ch = Math.round(parseFloat(cellFont.match(/(\d+)px/)[1]) * 1.18);

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog); gl.useProgram(prog);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);

  function texture(unit) {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  const dataTex = texture(0), atlasTex = texture(1);

  // the glyph atlas: one cell per ramp character, drawn at device resolution
  function atlas() {
    const c = document.createElement('canvas');
    c.width = Math.round(cw * dpr) * RAMP.length; c.height = Math.round(ch * dpr);
    const x = c.getContext('2d');
    x.font = cellFont.replace(/(\d+(\.\d+)?)px/, (_, n) => n * dpr + 'px');
    x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'center';
    const w = Math.round(cw * dpr);
    [...RAMP].forEach((g, i) => x.fillText(g, i * w + w / 2, c.height / 2 + dpr));
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  }

  // ---- the fluid, one cell per character
  let C = 0, R = 0, S = 0;
  let u, v, u0, v0, d, d0, p, div, target, curl, bytes;
  const IX = (i, j) => i + j * C;

  function alloc() {
    S = C * R;
    [u, v, u0, v0, d, d0, p, div, target, curl] = Array.from({ length: 10 }, () => new Float32Array(S));
    bytes = new Uint8Array(S * 4);
  }

  // my name, rasterised at the size of the grid: coverage per cell is the ink it settles back to
  function paintTarget() {
    const Wp = C * cw, Hp = R * ch;
    const c = document.createElement('canvas');
    c.width = Math.ceil(Wp); c.height = Math.ceil(Hp);
    const x = c.getContext('2d');
    const lines = Wp < 700 ? name.join(' ').split(' ') : name;
    x.font = nameFont(100);
    const wide = Math.max(...lines.map((l) => x.measureText(l).width));
    const px = Math.min((Wp * 0.86) / wide * 100, (Hp * 0.62) / lines.length / 0.95);
    x.font = nameFont(px); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((l, k) => x.fillText(l, Wp / 2, Hp * 0.47 + (k - (lines.length - 1) / 2) * px * 0.95));
    const img = x.getImageData(0, 0, c.width, c.height).data;
    for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) {
      let s = 0, n = 0;
      for (let yy = Math.floor(j * ch); yy < Math.floor((j + 1) * ch); yy += 2) for (let xx = Math.floor(i * cw); xx < Math.floor((i + 1) * cw); xx += 2) { s += img[(yy * c.width + xx) * 4 + 3]; n++; }
      target[IX(i, j)] = n ? Math.min(1, (s / n / 255) * 1.25) : 0;
    }
  }

  function bnd(b, x) {
    for (let i = 1; i < C - 1; i++) { x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)]; x[IX(i, R - 1)] = b === 2 ? -x[IX(i, R - 2)] : x[IX(i, R - 2)]; }
    for (let j = 1; j < R - 1; j++) { x[IX(0, j)] = b === 1 ? -x[IX(1, j)] : x[IX(1, j)]; x[IX(C - 1, j)] = b === 1 ? -x[IX(C - 2, j)] : x[IX(C - 2, j)]; }
  }

  function advect(b, out, src, uu, vv, dt) {
    for (let j = 1; j < R - 1; j++) for (let i = 1; i < C - 1; i++) {
      const k = IX(i, j);
      let x = i - dt * uu[k], y = j - dt * vv[k];
      x = Math.max(0.5, Math.min(C - 1.5, x)); y = Math.max(0.5, Math.min(R - 1.5, y));
      const i0 = x | 0, j0 = y | 0, s1 = x - i0, t1 = y - j0;
      out[k] = (1 - s1) * ((1 - t1) * src[IX(i0, j0)] + t1 * src[IX(i0, j0 + 1)]) + s1 * ((1 - t1) * src[IX(i0 + 1, j0)] + t1 * src[IX(i0 + 1, j0 + 1)]);
    }
    bnd(b, out);
  }

  function project() {
    for (let j = 1; j < R - 1; j++) for (let i = 1; i < C - 1; i++) {
      const k = IX(i, j);
      div[k] = -0.5 * (u[k + 1] - u[k - 1] + v[k + C] - v[k - C]);
      p[k] = 0;
    }
    bnd(0, div); bnd(0, p);
    for (let it = 0; it < 16; it++) {
      for (let j = 1; j < R - 1; j++) for (let i = 1; i < C - 1; i++) {
        const k = IX(i, j);
        p[k] = (div[k] + p[k - 1] + p[k + 1] + p[k - C] + p[k + C]) / 4;
      }
      bnd(0, p);
    }
    for (let j = 1; j < R - 1; j++) for (let i = 1; i < C - 1; i++) {
      const k = IX(i, j);
      u[k] -= 0.5 * (p[k + 1] - p[k - 1]);
      v[k] -= 0.5 * (p[k + C] - p[k - C]);
    }
    bnd(1, u); bnd(2, v);
  }

  // vorticity confinement keeps the small swirls alive, which is most of what makes smoke look like smoke
  function vorticity(dt, eps) {
    for (let j = 1; j < R - 1; j++) for (let i = 1; i < C - 1; i++) {
      const k = IX(i, j);
      curl[k] = 0.5 * ((v[k + 1] - v[k - 1]) - (u[k + C] - u[k - C]));
    }
    for (let j = 2; j < R - 2; j++) for (let i = 2; i < C - 2; i++) {
      const k = IX(i, j);
      let nx = 0.5 * (Math.abs(curl[k + 1]) - Math.abs(curl[k - 1]));
      let ny = 0.5 * (Math.abs(curl[k + C]) - Math.abs(curl[k - C]));
      const l = Math.hypot(nx, ny) + 1e-5;
      nx /= l; ny /= l;
      u[k] += eps * dt * ny * curl[k];
      v[k] -= eps * dt * nx * curl[k];
    }
  }

  // pointer impulses, queued between frames
  const splats = [];
  function splat(x, y, dx, dy) { splats.push([x / cw, y / ch, dx / cw, dy / ch]); }

  // How fast the ink settles back into the name, per second. While you stir it barely pulls;
  // once you stop, the pull grows over a second or two, so the name comes back on its own.
  let quiet = 0;
  function step(dt) {
    for (const [x, y, dx, dy] of splats) {
      const r = Math.max(3, C * 0.035), r2 = r * r;
      const i0 = Math.max(1, (x - r * 2) | 0), i1 = Math.min(C - 2, (x + r * 2) | 0);
      const j0 = Math.max(1, (y - r * 2) | 0), j1 = Math.min(R - 2, (y + r * 2) | 0);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const w = Math.exp(-((i - x) ** 2 + ((j - y) * (ch / cw)) ** 2) / r2);
        const k = IX(i, j);
        u[k] += dx * w * 6; v[k] += dy * w * 6;
        d[k] = Math.min(1.2, d[k] + w * 0.03 * Math.min(1, Math.hypot(dx, dy) * 0.5));
      }
    }
    quiet = splats.length ? 0 : quiet + dt;
    splats.length = 0;
    const calm = Math.min(1, Math.max(0, (quiet - 0.4) / 1.6));
    vorticity(dt, 6 * (1 - calm));
    project();
    u0.set(u); v0.set(v);
    advect(1, u, u0, u0, v0, dt * 60);
    advect(2, v, v0, u0, v0, dt * 60);
    project();
    d0.set(d);
    advect(0, d, d0, u, v, dt * 60);
    const heal = 1 - Math.exp(-(0.35 + 3.2 * calm) * dt), clear = 1 - Math.exp(-(0.8 + 2 * calm) * dt), damp = Math.exp(-(1.2 + 3 * calm) * dt);
    for (let k = 0; k < S; k++) {
      const gap = target[k] - d[k];
      d[k] += gap * (gap < 0 ? heal + clear : heal);
      u[k] *= damp; v[k] *= damp;
    }
  }

  function upload() {
    for (let k = 0; k < S; k++) {
      bytes[k * 4] = Math.max(0, Math.min(255, d[k] * 255));
      bytes[k * 4 + 1] = Math.min(255, Math.hypot(u[k], v[k]) * 420);
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dataTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, C, R, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }

  function resize() {
    const W = canvas.parentElement.clientWidth, H = canvas.parentElement.clientHeight;
    C = Math.floor(W / cw); R = Math.floor(H / ch);
    const w = C * cw, h = R * ch;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.style.left = ((W - w) / 2) + 'px'; canvas.style.top = ((H - h) / 2) + 'px';
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    alloc(); paintTarget(); d.set(target);
    atlas();
    gl.uniform1i(U('uData'), 0); gl.uniform1i(U('uAtlas'), 1);
    gl.uniform2f(U('uGrid'), C, R);
    gl.uniform1f(U('uGlyphs'), RAMP.length);
    gl.uniform3f(U('uBg'), 10 / 255, 11 / 255, 13 / 255);
    gl.uniform3f(U('uInk'), 0.84, 0.83, 0.8);
    gl.uniform3f(U('uHot'), 1, 0.71, 0.28);
  }

  // pointer: the drag between two events becomes an impulse along that drag
  let last = null;
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (last) splat(x, y, x - last.x, y - last.y);
    last = { x, y };
    idle = 0;
  });
  canvas.addEventListener('pointerleave', () => { last = null; });

  // a ghost hand stirs once on arrival, and again after a while left alone, so the page never just sits there
  let idle = 0, ghost = 0, greeted = false;
  function ghostHand(dt) {
    idle += dt;
    if (ghost === 0) {
      if (!greeted && performance.now() - t0 > 600) greeted = true;
      else if (idle < 10) return;
      ghost = 1e-4;
    }
    const T = 2.2;
    const k0 = ghost / T, k1 = (ghost + dt) / T;
    ghost += dt;
    if (k1 >= 1) { ghost = 0; idle = 0; return; }
    const W = C * cw, H = R * ch;
    const at = (k) => [W * (0.12 + 0.76 * k), H * (0.47 + 0.1 * Math.sin(k * Math.PI * 3))];
    const [x0, y0] = at(k0), [x1, y1] = at(k1);
    splat(x1, y1, (x1 - x0) * 0.6, (y1 - y0) * 0.6);
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let prev = performance.now(), t0 = prev, raf = 0;
  function frame(now) {
    const dt = Math.min(1 / 30, (now - prev) / 1000); prev = now;
    if (!isLive()) { raf = requestAnimationFrame(frame); return; } // off screen: the fluid waits
    if (!reduced) ghostHand(dt);
    const a = performance.now();
    step(dt);
    const cost = performance.now() - a;
    upload();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    onFrame({ cost, cells: S });
    raf = requestAnimationFrame(frame);
  }

  resize();
  addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);
  return { stop() { cancelAnimationFrame(raf); } };
}
