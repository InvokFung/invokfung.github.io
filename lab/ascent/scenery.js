// The landscape, drawn on one WebGL canvas behind the page: skies, floors, ridges, the mountain,
// mist, clouds, light and the two big words. The page's own content (text, flags, panels and
// specimens) stays in the DOM, laid out in CSS 3D in front of this canvas, so both must agree on
// where everything is. They share one projection: the stage's CSS perspective. A point (X, Y, Z) in
// stage pixels, Z toward the viewer, lands on screen at o + (X - o) * P / (P - Z), where o is the
// perspective origin.
//
// Every sprite is a textured quad of one of three kinds:
//   0  paper: a flat box from the page's layout, standing at a depth, folding about its bottom edge
//   1  floor: a box lying on the ground plane (floors and pools of light)
//   2  screen: the whole canvas (a glow)
//   3  sky: the whole canvas, a gradient down to a horizon, the sun, and ground below
//   4  rim: the whole canvas, the lit edge of a window (below)
//
// A window (round 5): any sprite can be cut to a mountain-shaped window on the screen, a peak with
// a shoulder each side, which grows from a point until it fills the screen. The next scene is drawn
// whole through it, over the one you are leaving, instead of the two meeting inside a fog.
// One canvas costs one composited layer, however much is drawn on it, which is what makes this
// cheap: the round 4 page drew the same landscape as 60-odd 3D layers and spent its frames
// compositing them.
//
// The cover's sea of cloud is the exception: a surface ray-marched per pixel by its own program
// (deck.js), drawn in passes slotted between the paper as sprites with a deck.

import { createDeck } from '../unfold/deck.js';

const VS = `
precision highp float;
attribute vec2 aC;
uniform float uKind; // the same as uMode, which the fragment shader reads at its own precision
uniform vec2 uRes, uPO, uO;
uniform float uP;
uniform vec4 uBox, uSub, uL, uFl;
uniform float uTh;
uniform vec3 uOff;
varying vec2 vUv, vW;
void main() {
  vec2 c = mix(uSub.xy, uSub.zw, aC);
  vUv = c;
  vec3 X;
  if (uKind < 0.5) {
    // uL: s, z, the bottom edge as placed, lift
    float xf = uBox.x + c.x * uBox.z, yf = uBox.y + c.y * uBox.w;
    float x = uO.x + (xf - uO.x) / uL.x, y = uO.y + (yf - uO.y) / uL.x, d = y - uL.z;
    X = vec3(x, uL.z + d * cos(uTh) - uL.w, uL.y + d * sin(uTh));
    vW = c * uBox.zw; // the paper's own pixels, for its grain
  } else if (uKind < 1.5) {
    // uFl: near z, far z, the floor's height
    X = vec3(uBox.x + c.x * uBox.z, uFl.z, mix(uFl.x, uFl.y, c.y));
    vW = X.xz;
  } else {
    vW = c * uRes;
    gl_Position = vec4(c.x * 2.0 - 1.0, 1.0 - c.y * 2.0, 0.0, 1.0);
    return;
  }
  X += uOff;
  float w = (uP - X.z) / uP;
  gl_Position = vec4(2.0 * (uPO.x * w + X.x - uPO.x) / uRes.x - w, w - 2.0 * (uPO.y * w + X.y - uPO.y) / uRes.y, w - 0.4, w);
}`;

const FS = `
precision mediump float;
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define HP highp
#else
#define HP mediump
#endif
uniform float uMode, uAlpha;
// the window: where its foot sits on the screen (x, y), its size (screen pixels a unit), on; and the
// colour and strength of its lit edge. uPxH: screen pixels a canvas pixel, and the screen's height
uniform HP vec4 uWin;
uniform HP vec2 uPxH;
uniform vec4 uWinC;
uniform sampler2D uTex, uGrain;
uniform vec3 uTint;
uniform vec4 uCut, uFade;
uniform vec2 uShift;
uniform vec3 uSky[7];
uniform vec4 uSkyG, uSun, uSunGlow;
varying vec2 vUv, vW;
// how far inside the window's edge this pixel is, in screen pixels (negative: outside): x under its
// skyline, y above its foot. Its shape is a peak with a lower shoulder each side, rounded at the
// tops, with a ragged edge like the ridges, standing on a level foot
HP float sabs(HP float x) { return sqrt(x * x + 0.004); }
HP vec2 winEdge() {
  HP vec2 sp = vec2(gl_FragCoord.x * uPxH.x, uPxH.y - gl_FragCoord.y * uPxH.x);
  HP float u = (sp.x - uWin.x) / uWin.z, v = (uWin.y - sp.y) / uWin.z;
  HP float h = max(1.0 - 1.05 * sabs(u), max(0.62 - 1.3 * sabs(u + 0.6), 0.72 - 1.15 * sabs(u - 0.66)));
  h += 0.018 * sin(u * 29.0 + 0.4) + 0.009 * sin(u * 73.0 + 1.3);
  return vec2(h - v, v) * uWin.z;
}
void main() {
  float wk = 1.0;
  if (uWin.w > 0.5) {
    HP vec2 e = winEdge();
    if (e.x <= 0.0 || e.y <= 0.0) discard;
    if (uMode > 3.5) {
      // the window's lit skyline: a fine line, and a glow that falls off inward; none along its foot
      // (uFade.x: light filling the whole of it)
      float k = (1.0 - smoothstep(0.0, 2.0 * uPxH.x + 0.5, e.x)) * 0.85 + exp(-e.x / 22.0) * 0.5 + uFade.x;
      gl_FragColor = vec4(uWinC.rgb * k * uWinC.a * uAlpha * smoothstep(0.0, 24.0, e.y), 0.0);
      return;
    }
    wk = clamp(min(e.x, e.y) / 1.5, 0.0, 1.0);
  }
  if (uMode > 2.5) {
    // a sky over the whole screen, down to its horizon and ground below it. uSkyG: the horizon's
    // height, the gradient's span above it, the ground's span below it, and grain
    float y = vW.y;
    vec3 c;
    if (y < uSkyG.x) {
      float t = clamp(1.0 - (uSkyG.x - y) / uSkyG.y, 0.0, 1.0);
      c = t < 0.45 ? mix(uSky[0], uSky[1], t / 0.45) : t < 0.8 ? mix(uSky[1], uSky[2], (t - 0.45) / 0.35) : mix(uSky[2], uSky[3], (t - 0.8) / 0.2);
      // the sun's glow, and the sun (uSun: x, y, radius, glow radius)
      float d = length(vW - uSun.xy);
      float g = max(0.0, 1.0 - d / max(uSun.w, 1.0)) * uSunGlow.a;
      c = mix(c, uSunGlow.rgb, g);
      c = mix(c, uSky[6], 0.92 * (1.0 - smoothstep(uSun.z - 1.0, uSun.z + 1.0, d)) * step(0.5, uSun.z));
    } else {
      c = mix(uSky[4], uSky[5], clamp((y - uSkyG.x) / uSkyG.z, 0.0, 1.0));
    }
    c *= 1.0 + (texture2D(uGrain, gl_FragCoord.xy / 220.0).r - 0.5) * uSkyG.w;
    gl_FragColor = vec4(c, 1.0) * uAlpha * wk;
    return;
  }
  if (uMode > 1.5) {
    // a glow over the whole screen: uFade is its centre and radius, and how much it hides what is
    // under it (0 for light added on top, 1 for a haze)
    float d = length((vW - uFade.xy) / uFade.z), k = exp(-d * d * 1.6) * uAlpha;
    gl_FragColor = vec4(uTint * k, k * uFade.w) * wk;
    return;
  }
  // a piece of a torn sheet keeps only its side of a ragged line (down the sheet, or across it
  // when the frequency is negative)
  // (soft over uFade.z, for cloud parting rather than paper)
  float keep = 1.0;
  if (uCut.y != 0.0) {
    float a = uCut.w > 0.0 ? vUv.y : vUv.x, b = uCut.w > 0.0 ? vUv.x : vUv.y, f = abs(uCut.w);
    float e = uCut.x + uCut.z * (sin(a * f) * 0.6 + sin(a * f * 2.31 + 1.7) * 0.4 + sin(a * f * 5.7 + 0.3) * 0.18);
    float s = (b - e) * uCut.y;
    if (s < 0.0) discard;
    if (uFade.z > 0.0) keep = smoothstep(0.0, uFade.z, s);
  }
  vec4 c = texture2D(uTex, vUv + uShift) * keep;
  // the floor fades out at its far edge and its sides
  if (uFade.x < 1.0) c *= 1.0 - smoothstep(uFade.x, 1.0, vUv.y);
  if (uFade.y > 0.0) c *= smoothstep(0.0, uFade.y, vUv.x) * smoothstep(0.0, uFade.y, 1.0 - vUv.x);
  // paper grain, as dark flecks as light ones, so it never shifts the colour it sits on
  if (uFade.w > 0.0) c.rgb *= 1.0 + (texture2D(uGrain, vW / 220.0).r - 0.5) * uFade.w;
  if (c.a < 0.004) discard;
  c.rgb *= uTint;
  gl_FragColor = c * uAlpha * wk;
}`;

export function createScenery(canvas, { onRestore } = {}) {
  const opts = { alpha: false, antialias: false, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'default' };
  let gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  if (!gl) return null;
  let prog, U = {}, buf, grain;
  const textures = new Set();

  function init() {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'aC'); // the deck's program shares the quad
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    U = {};
    for (const n of ['uKind', 'uMode', 'uRes', 'uPO', 'uO', 'uP', 'uBox', 'uSub', 'uL', 'uFl', 'uTh', 'uOff', 'uAlpha', 'uTex', 'uGrain', 'uTint', 'uCut', 'uFade', 'uShift', 'uSky', 'uSkyG', 'uSun', 'uSunGlow', 'uWin', 'uPxH', 'uWinC']) U[n] = gl.getUniformLocation(prog, n);
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'aC');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(U.uTex, 0);
    gl.uniform1i(U.uGrain, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.clearColor(10 / 255, 11 / 255, 13 / 255, 1);
    gl.depthFunc(gl.LEQUAL);
    grain = makeGrain();
  }
  // the paper grain the floors share: noise, tiled, with mipmaps so it doesn't shimmer far off
  function makeGrain() {
    const n = 256, data = new Uint8Array(n * n * 4);
    let s = 7;
    for (let i = 0; i < n * n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; const v = (s >> 8) & 255; data.set([v, v, v, 255], i * 4); }
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.activeTexture(gl.TEXTURE0);
    return t;
  }
  try { init(); } catch (e) { console.warn('scenery: no WebGL landscape', e); return null; }
  let deck = null;
  try { deck = createDeck(gl); gl.useProgram(prog); } catch (e) { console.warn('scenery: no sea of cloud', e); gl.useProgram(prog); }

  // a texture from a canvas the art painted; repeat: it tiles across (its width is a power of two)
  function texture(src, { repeat = false } = {}) {
    const t = { gl: gl.createTexture(), src, repeat };
    upload(t);
    textures.add(t);
    return t;
  }
  function upload(t) {
    gl.bindTexture(gl.TEXTURE_2D, t.gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t.src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, t.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  function release(t) { if (t && textures.delete(t)) gl.deleteTexture(t.gl); }

  // A lost context (a driver reset, a laptop waking) comes back blank: build it again and re-upload
  // what was painted.
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    init();
    if (deck) { deck.restore(); gl.useProgram(prog); }
    for (const t of textures) { t.gl = gl.createTexture(); upload(t); }
    onRestore?.();
  });

  let cw = 0, ch = 0, px = 1;
  function size(W, H, res) {
    const w = Math.max(1, Math.round(W * res)), h = Math.max(1, Math.round(H * res));
    px = W / w;
    if (w !== cw || h !== ch) { canvas.width = cw = w; canvas.height = ch = h; }
  }

  const BLEND = { over: () => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA), add: () => gl.blendFunc(gl.ONE, gl.ONE) };
  // view: W, H, P, po (perspective origin), o (the eye the layout was placed from)
  // list: sprites in draw order. A sprite: { tex, mode, box, sub, L, th, off, fl, alpha, tint,
  // cut, fade, shift, blend: 'over' | 'add', depth: 'none' | 'test' | 'write', win, winC }, or
  // { clearDepth }. win: [x, y, size, 1] cuts the sprite to the window; winC: its edge's colour.
  function draw(view, list) {
    if (lost) return;
    view.px = px;
    gl.viewport(0, 0, cw, ch);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.uniform2f(U.uRes, view.W, view.H);
    gl.uniform2f(U.uPO, view.po[0], view.po[1]);
    gl.uniform2f(U.uO, view.o[0], view.o[1]);
    gl.uniform1f(U.uP, view.P);
    gl.uniform2f(U.uPxH, px, view.H);
    let blend = '', depth = '', tex = null;
    for (const s of list) {
      // between two whole scenes drawn one over the other
      if (s.clearDepth) { gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT); depth = ''; continue; }
      if (!(s.alpha > 0.002)) continue;
      if (s.deck) {
        if (!deck) continue;
        if (blend !== 'over') { BLEND.over(); blend = 'over'; }
        if (depth !== 'none') { gl.disable(gl.DEPTH_TEST); gl.depthMask(false); depth = 'none'; }
        deck.draw(view, s);
        gl.useProgram(prog);
        continue;
      }
      const b = s.blend || 'over';
      if (b !== blend) { BLEND[b](); blend = b; }
      const d = s.depth || 'none';
      if (d !== depth) {
        if (d === 'none') gl.disable(gl.DEPTH_TEST); else gl.enable(gl.DEPTH_TEST);
        gl.depthMask(d === 'write');
        depth = d;
      }
      if (s.tex && s.tex !== tex) { gl.bindTexture(gl.TEXTURE_2D, s.tex.gl); tex = s.tex; }
      gl.uniform1f(U.uMode, s.mode || 0);
      gl.uniform1f(U.uKind, s.mode || 0);
      const bx = s.box || ZERO4, sb = s.sub || UNIT, L = s.L || ONE4, fl = s.fl || ZERO4, off = s.off || ZERO3;
      gl.uniform4f(U.uBox, bx[0], bx[1], bx[2], bx[3]);
      gl.uniform4f(U.uSub, sb[0], sb[1], sb[2], sb[3]);
      gl.uniform4f(U.uL, L[0], L[1], L[2], L[3]);
      gl.uniform4f(U.uFl, fl[0], fl[1], fl[2], fl[3]);
      gl.uniform1f(U.uTh, s.th || 0);
      gl.uniform3f(U.uOff, off[0], off[1], off[2]);
      gl.uniform1f(U.uAlpha, s.alpha);
      const ti = s.tint || WHITE, c = s.cut || ZERO4, f = s.fade || NOFADE, sh = s.shift || ZERO2;
      gl.uniform3f(U.uTint, ti[0], ti[1], ti[2]);
      gl.uniform4f(U.uCut, c[0], c[1], c[2], c[3]);
      gl.uniform4f(U.uFade, f[0], f[1], f[2], f[3]);
      gl.uniform2f(U.uShift, sh[0], sh[1]);
      const wn = s.win || ZERO4, wc = s.winC || ZERO4;
      gl.uniform4f(U.uWin, wn[0], wn[1], wn[2], wn[3]);
      gl.uniform4f(U.uWinC, wc[0], wc[1], wc[2], wc[3]);
      if (s.sky) {
        // sky: { colours (7 rgb triples, flat), g: [horizon, span, ground span, grain], sun, glow }
        gl.uniform3fv(U.uSky, s.sky.colours);
        gl.uniform4fv(U.uSkyG, s.sky.g);
        gl.uniform4fv(U.uSun, s.sky.sun);
        gl.uniform4fv(U.uSunGlow, s.sky.glow);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
  // drawn by the processor, not a graphics chip (no GPU, or one the browser won't use)
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '');
  return { gl, texture, release, size, draw, software, deck: !!deck, get lost() { return lost; } };
}
const ZERO2 = [0, 0], ZERO3 = [0, 0, 0], ZERO4 = [0, 0, 0, 0], ONE4 = [1, 0, 0, 0], UNIT = [0, 0, 1, 1], WHITE = [1, 1, 1], NOFADE = [2, 0, 0, 0];
