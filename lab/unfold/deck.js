// The sea of cloud under the cover, drawn by the graphics chip rather than painted: a surface of
// heaped cloud running from just below you out to the horizon, found pixel by pixel by following
// each ray from the eye until it meets a cloud top, then lit by the low sun ahead. It has its own
// camera, set so its horizon is the sky's and its far edge is where the peaks stand, and it is drawn
// in up to three passes that slot between the paper: past the peaks (behind them), from the peaks to
// you (in front of them), and nearer than the name (over the name's foot, so it stands in the cloud).
//
// The heaps are a texture of noise baked once: in R and B, domes of every height packed in cells
// (where two meet, the higher one shows, smoothly), in G and A smooth swells. Two layers of domes
// drift at different speeds and directions, so the heaps change shape as they go, like cloud seen
// in a time-lapse.

const VS = `
attribute vec2 aC;
uniform vec2 uRes;
uniform vec4 uRect;
varying vec2 vS;
void main() {
  vS = mix(uRect.xy, uRect.zw, aC);
  gl_Position = vec4(vS.x / uRes.x * 2.0 - 1.0, 1.0 - vS.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vS;
uniform sampler2D uN;
uniform vec2 uRes;
uniform vec4 uView;   // the horizon's height on screen, the focal length, how far this sea has slid
                      // across (with the pointer), and this half's slide (as the cover parts)
uniform vec4 uCam;    // the eye: across, its height over the cloud tops, along; how deep the heaps are
uniform vec4 uRange;  // the nearest and farthest distance this pass draws; how fast the haze comes on;
                      // how many steps a ray may take
uniform vec4 uW0, uW1; // where each layer of heaps has drifted to
uniform vec4 uSun;    // the direction to the sun (xyz), and how much of it there is yet
uniform vec4 uCut;    // which half (-1, 1, or 0 for all of it), its soft edge; the light so far (0 at
                      // night); and the alpha
uniform vec2 uThin;   // where this pass thins out to nothing, from and to (in distance)
uniform vec3 uAA;     // how many of the screen's pixels to one of the canvas's; how far off a ray must
                      // meet the cloud tops to be taken more than once; and how many times (1: never)
uniform vec4 uGlow;   // the sky's sun glow: x, y on screen, radius, strength, so the haze matches it
uniform vec3 cLit, cShade, cDeep, cGlow, cHaze;

// cov: how thick the sea runs here, and how much of the heaps' height shows (far off they settle into
// a smoother sea, so they don't crawl in stair-steps a pixel high)
float heaps(vec2 p, vec2 cov) {
  vec2 r = vec2(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8);
  float h = max(texture2D(uN, p * 0.03 + uW0.xy).r, texture2D(uN, r * 0.045 + uW0.zw).r * 0.85);
  return h * mix(0.55, 1.05, cov.x) * cov.y;
}
float cover(vec2 p) { return texture2D(uN, p * 0.006 + uW1.zw).g; }
float detailed(vec2 p, vec2 cov) { return clamp(heaps(p, cov) + texture2D(uN, p * 0.075 + uW1.xy).b * 0.2 * mix(0.55, 1.05, cov.x) * cov.y, 0.0, 1.0); }

// One ray, through the screen at s: the cloud it meets in this pass, lit and hazed, or nothing.
vec4 sea(vec2 s) {
  float A = uCam.w;
  float x = s.x - uView.z - uView.w;
  float dy = max((s.y - uView.x) / uView.y, 0.0005);
  vec3 d = normalize(vec3((x - uRes.x * 0.5) / uView.y, -dy, -1.0));
  vec3 o = uCam.xyz;
  float t1 = (o.y + A) / -d.y;
  // far off the heaps settle lower, so the ray need only be searched below the highest they reach
  float tTop = o.y / -d.y, settle = mix(1.0, 0.3, smoothstep(9.0, 60.0, tTop));
  float t0 = (o.y + A * (1.0 - min(1.0, settle * 1.1))) / -d.y;
  // the ray's way through the heaps lies wholly in front of this pass, or wholly past it
  if (t1 <= uRange.x || t0 >= uRange.y) return vec4(0.0);
  float ts = max(t0, uRange.x), te = min(t1, uRange.y);
  // march, the steps growing with the distance; cloud thickens slowly, so its cover is read once a
  // ray, where it meets the tops (the same for every pass, so they agree where each ray lands)
  vec2 cov = vec2(cover((o + d * tTop).xz), settle);
  float t = ts, tp = ts, hit = -1.0;
  float k = pow(max(te / ts, 1.0001), 1.0 / uRange.w);
  for (int i = 0; i <= 24; i++) {
    if (float(i) > uRange.w) break;
    vec3 q = o + d * t;
    if (q.y + A * (1.0 - heaps(q.xz, cov)) < 0.0) {
      // already inside cloud where this pass starts: a nearer pass drew it
      if (i == 0 && uRange.x > t0) return vec4(0.0);
      hit = t;
      break;
    }
    tp = t; t *= k;
  }
  // between the last step outside and the first inside, home in on the top (or a far ray's long
  // steps leave it in terraces)
  if (hit > ts) {
    float a = tp, b = hit;
    for (int j = 0; j < 5; j++) {
      float m = (a + b) * 0.5;
      vec3 q = o + d * m;
      if (q.y + A * (1.0 - heaps(q.xz, cov)) < 0.0) b = m; else a = m;
    }
    hit = (a + b) * 0.5;
  }
  if (hit < 0.0) {
    if (te < t1) return vec4(0.0); // past this pass's far edge without meeting cloud
    hit = t1;                      // down to the floor of the heaps
  }
  vec3 p = o + d * hit;
  float e = max(0.2, hit * 0.008);
  float h0 = detailed(p.xz, cov), hx = detailed(p.xz + vec2(e, 0.0), cov), hz = detailed(p.xz + vec2(0.0, e), cov);
  vec3 n = normalize(vec3(-A * (hx - h0) / e, 1.0, -A * (hz - h0) / e));
  vec3 sun = uSun.xyz;
  float sd = max(dot(d, sun), 0.0);
  // the light reaches the far cloud first, then comes on toward you
  float fog = 1.0 - exp(-hit * uRange.z);
  float lit = clamp(uCut.z * 1.5 - (1.0 - fog) * 0.5, 0.0, 1.0) * uSun.w;
  // backlit by the low sun: we see the fronts, in shade, and darker down between the heaps; the tops
  // take the dawn sky's light, the slopes toward the sun take the sun's, and the crests, seen against
  // it, glow
  float sunlit = max(dot(n, sun), 0.0);
  float ao = mix(0.22, 1.0, smoothstep(0.05, 0.85, h0));
  float crest = pow(1.0 - clamp(dot(n, -d), 0.0, 1.0), 3.0) * smoothstep(0.35, 0.85, h0);
  vec3 c = mix(cDeep, cShade, ao);
  c = mix(c, mix(cShade, cLit, 0.55), smoothstep(0.45, 0.95, h0) * 0.6 * lit);
  c = mix(c, cLit, clamp(sunlit * 1.5, 0.0, 1.0) * ao * lit);
  c += cGlow * (crest * (0.2 + 1.5 * pow(sd, 5.0)) * (1.0 - fog) + pow(sd, 12.0) * 0.45) * lit;
  c *= 0.3 + 0.7 * clamp(uCut.z * 1.2, 0.0, 1.0);
  // into the haze toward the horizon, the colour the sky is just above it
  float gl = max(0.0, 1.0 - length(vec2(s.x, uView.x) - uGlow.xy) / max(uGlow.z, 1.0)) * uGlow.w;
  c = mix(c, mix(cHaze, cGlow, gl), fog);
  return vec4(c, 1.0) * (1.0 - smoothstep(uThin.x, uThin.y, hit));
}

void main() {
  // which half: each keeps its side of a ragged line down the middle, softly
  float keep = 1.0;
  if (uCut.x != 0.0) {
    float x = vS.x - uView.z - uView.w, a = vS.y / uRes.y * 22.0;
    float e = uRes.x * (0.5 + 0.016 * (sin(a) * 0.6 + sin(a * 2.31 + 1.7) * 0.4 + sin(a * 5.7 + 0.3) * 0.18));
    // (opaque up to the line and fading past it, over the other half, so no seam shows at rest)
    keep = smoothstep(0.0, uCut.y * uRes.x, (x - e) * uCut.x + uCut.y * uRes.x);
    if (keep <= 0.0) discard;
  }
  // far off, a heap's edge is a near-level line a pixel high, so there take a few rays spread down
  // the pixel and meet them in between, or it stair-steps
  vec4 c = vec4(0.0);
  if (uAA.z > 1.0 && (vS.y - uView.x) / uView.y * uAA.y < uCam.y) {
    for (int j = 0; j < 4; j++) {
      if (float(j) >= uAA.z) break;
      c += sea(vS + vec2(0.0, uAA.x * ((float(j) + 0.5) / uAA.z - 0.5)));
    }
    c /= uAA.z;
  } else c = sea(vS);
  if (c.a <= 0.002) discard;
  gl_FragColor = c * keep * uCut.w;
}`;

// noise for the heaps, tileable, 256 square
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function bake(n = 256) {
  const out = new Uint8Array(n * n * 4);
  // in each of g x g cells a dome of its own height and size; where two meet the higher one shows,
  // with the crease between them softened
  const domes = (g, seed, ch) => {
    const r = rng(seed), pts = [];
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) pts.push([i + 0.1 + r() * 0.8, j + 0.1 + r() * 0.8, 0.35 + 0.65 * r() ** 1.5, 0.7 + r() * 0.3]);
    const c = n / g;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = x / c, fy = y / c, ci = Math.floor(fx), cj = Math.floor(fy);
      let v = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const I = ci + di, J = cj + dj, ii = (I + g) % g, jj = (J + g) % g, p = pts[jj * g + ii];
        const px = p[0] + I - ii, py = p[1] + J - jj, d = ((px - fx) ** 2 + (py - fy) ** 2) / (p[3] * p[3]);
        if (d < 1) { const u = p[2] * Math.sqrt(1 - d), q = Math.max(0.22 - Math.abs(u - v), 0) / 0.22; v = Math.max(u, v) + q * q * 0.055; }
      }
      out[(y * n + x) * 4 + ch] = Math.min(255, Math.round(v * 240));
    }
  };
  // smooth swells
  const swells = (g, seed, ch) => {
    const r = rng(seed), v = Array.from({ length: g * g }, r), c = n / g, q = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = x / c, fy = y / c, i = Math.floor(fx), j = Math.floor(fy), u = q(fx - i), w = q(fy - j);
      const a = v[j * g + i], b = v[j * g + (i + 1) % g], cc = v[((j + 1) % g) * g + i], d = v[((j + 1) % g) * g + (i + 1) % g];
      out[(y * n + x) * 4 + ch] = Math.round((a + (b - a) * u + (cc - a) * w + (a - b - cc + d) * u * w) * 255);
    }
  };
  domes(8, 3, 0); swells(8, 5, 1); domes(16, 9, 2); swells(32, 11, 3);
  return out;
}

export function createDeck(gl) {
  let prog, U, noise;
  const data = bake();
  function init() {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'aC');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    U = {};
    for (const n of ['uN', 'uRes', 'uRect', 'uView', 'uCam', 'uRange', 'uW0', 'uW1', 'uSun', 'uCut', 'uThin', 'uAA', 'uGlow', 'cLit', 'cShade', 'cDeep', 'cGlow', 'cHaze']) U[n] = gl.getUniformLocation(prog, n);
    gl.useProgram(prog);
    gl.uniform1i(U.uN, 2);
    noise = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, noise);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.activeTexture(gl.TEXTURE0);
  }
  init();
  // s.deck: { rect, view, cam, range, w0, w1, sun, cut, thin, aa, glow, colours: { lit, shade, deep, glow, haze } }
  function draw(view, s) {
    const k = s.deck, c = k.colours;
    gl.useProgram(prog);
    gl.uniform2f(U.uRes, view.W, view.H);
    gl.uniform4fv(U.uRect, k.rect);
    gl.uniform4fv(U.uView, k.view);
    gl.uniform4fv(U.uCam, k.cam);
    gl.uniform4fv(U.uRange, k.range);
    gl.uniform4fv(U.uW0, k.w0);
    gl.uniform4fv(U.uW1, k.w1);
    gl.uniform4fv(U.uSun, k.sun);
    gl.uniform4fv(U.uCut, k.cut);
    gl.uniform2fv(U.uThin, k.thin);
    gl.uniform3f(U.uAA, view.px || 1, k.aa ? k.aa[0] : 0, k.aa ? k.aa[1] : 1);
    gl.uniform4fv(U.uGlow, k.glow);
    gl.uniform3fv(U.cLit, c.lit); gl.uniform3fv(U.cShade, c.shade); gl.uniform3fv(U.cDeep, c.deep); gl.uniform3fv(U.cGlow, c.glow); gl.uniform3fv(U.cHaze, c.haze);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  return { draw, restore: init };
}
