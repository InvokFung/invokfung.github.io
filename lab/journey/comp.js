// The film's compositor: every scene is drawn into a render target, and one full-screen pass puts
// the frame together. Between two scenes it takes both and hands over with one of twelve moves, each
// rebuilt from a site that does it well (README, rounds 8 and 9):
//   0 fade     a plain cross-fade (reduced motion)
//   1 window   a window cut in the paper, tilted in 3D, that turns to face you and grows to fill the
//              screen (Zentry's projected quad: four corners through a focal length, here as a
//              homography so the window can be any shape; ours is the mountain)
//   2 tear     the next scene rises from below a torn edge, its paper core showing, with colour
//              fringes along the cut and the two scenes sliding apart (Igloo's ice cut, in paper)
//   3 mosaic   the frame breaks into paper tiles that flip over one by one (Fiddle)
//   4 contour  contour lines sweep the screen like a rising tide on a map (Lando Norris)
//   5 type     the next scene shows through the letters of its name, then the camera dives into
//              one letter (K72, Adcker)
//   6 dye      ink blooms from three drops and the next scene is under it (Noth.in's fluid reveal)
//   7 slats    the screen splits into slats that slide up, each a beat after the last (Exo Ape)
//   8 ring     a ring of ink grows from a corner (Ashfall), or from the middle as an iris
//   9 mist     cloud rolls in over the scene, then thins from one point onto the next (the sea of
//              cloud the whole page lives in)
//  10 fold     the scene is a sheet of paper and folds up from the bottom along a slanting crease,
//              its back showing the print through, the next scene under it (Lusion's page turn, flat)
//  11 shards   the sheet breaks into cut pieces that shrink and turn away (the Voronoi cut of
//              Active Theory's transitions, in paper)
// Over all of them: grain, a vignette, and colour fringes when the scroll moves fast.
import * as THREE from 'three';

export const MODE = { fade: 0, window: 1, tear: 2, mosaic: 3, contour: 4, type: 5, dye: 6, slats: 7, ring: 8, mist: 9, fold: 10, shards: 11 };

const VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const NOISE = /* glsl */ `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tA, tB, tType;
uniform int uMode;
uniform float uP, uTime, uVel, uGrain;
uniform vec2 uRes;
uniform mat3 uHinv;
uniform vec4 uWin;     // corner radius, skyline, window aspect, rim
uniform vec3 uInk;     // the incoming scene's colour, for edges and ink
uniform vec3 uPaper;   // the paper's core, on torn edges
uniform vec4 uType;    // zoom centre (type uv), zoom, type aspect
uniform vec4 uType2;   // type width at zoom 1 (in screen heights), letters in, dim
uniform vec2 uCorner;
uniform float uSlats;
uniform vec3 uMist;    // the mist's colour
in vec2 vUv;
out highp vec4 fragColor;
${NOISE}
float asp;
// a sample with its colours pulled apart along y by the scroll's speed: a faint edge, at most a
// couple of pixels, so a fast flick feels fast without reading as a glitch
vec3 samp(sampler2D t, vec2 uv) {
  float k = clamp(uVel, -2.0, 2.0) * 0.0011;
  if (abs(k) < 0.0003) return texture(t, uv).rgb;
  return vec3(texture(t, uv + vec2(0.0, k)).r, texture(t, uv).g, texture(t, uv - vec2(0.0, k)).b);
}
vec3 sampCA(sampler2D t, vec2 uv, vec2 dir) {
  return vec3(texture(t, uv + dir).r, texture(t, uv).g, texture(t, uv - dir).b);
}
float ease(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }
vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

// the mountain on the window's top edge: how far down from the top the window starts at x
float skyline(float x) {
  float s = 0.0;
  s = max(s, 1.0 - abs(x - 0.5) * 3.1);          // the summit
  s = max(s, 0.62 - abs(x - 0.22) * 2.6);        // a shoulder
  s = max(s, 0.7 - abs(x - 0.8) * 2.4);          // and another
  s += (noise(vec2(x * 38.0, 2.0)) - 0.5) * 0.05;
  return (1.0 - clamp(s, 0.0, 1.0)) * 0.42;
}

vec3 doWindow(vec3 a, vec2 px) {
  vec3 h = uHinv * vec3(px, 1.0);
  vec2 q = h.xy / h.z;
  vec2 hs = vec2(uWin.z, 1.0) * 0.5;
  vec2 d = (q - 0.5) * vec2(uWin.z, 1.0);
  float r = uWin.x;
  // rounded below, the mountain above
  vec2 e = abs(d) - hs + r;
  float sd = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - r;
  float top = (skyline(q.x) * uWin.y - q.y);
  sd = max(sd, top);
  if (h.z <= 0.0) sd = 1.0;
  float aa = max(fwidth(sd), 1e-4);
  float m = 1.0 - smoothstep(-aa, aa, sd);
  // the paper round the window throws a soft shadow into it, and its cut edge catches the light
  float inner = smoothstep(0.0, 0.06, -sd);
  vec3 b = samp(tB, vUv + (q - 0.5) * 0.015);
  b *= mix(0.62, 1.0, inner);
  float sh = (1.0 - smoothstep(0.0, 0.2, sd)) * (1.0 - m) * uWin.w;
  vec3 c = mix(a * (1.0 - 0.5 * sh), b, m);
  float rim = (1.0 - smoothstep(aa, aa * 2.0 + 0.006, abs(sd))) * uWin.w;
  return mix(c, uPaper, rim * 0.9);
}

vec3 doTear() {
  float p = uP;
  vec2 s = vUv;
  float slope = -0.2;
  float coord = s.y + slope * (s.x - 0.5);
  float along = s.x * asp - slope * s.y;
  float edge = mix(-0.32, 1.32, ease(p));
  float jag = (fbm(vec2(along * 3.5, 3.0)) - 0.5) * 0.12 + (noise(vec2(along * 46.0, 7.0)) - 0.5) * 0.016;
  float d = coord - (edge + jag);
  float aa = max(fwidth(d), 1e-4);
  float mB = 1.0 - smoothstep(-aa, aa, d);
  // the two scenes slide apart: the old one up and away, the new one up from below
  vec2 ua = s - vec2(0.0, 0.3 * p * p);
  vec2 ub = s + vec2(0.0, 0.3 * (1.0 - p) * (1.0 - p));
  float near = exp(-abs(d) * 26.0);
  vec2 ca = vec2(0.0, 0.014 * near * sin(3.14159 * p));
  vec3 a = sampCA(tA, ua, ca), b = sampCA(tB, ub, ca);
  // under the torn sheet, its shadow
  b *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.06, -d)) * mB;
  vec3 c = mix(a, b, mB);
  // the paper's core along the tear: fibrous, a little uneven
  float fib = noise(vec2(along * 140.0, s.y * 40.0));
  float w = 0.006 + 0.012 * noise(vec2(along * 18.0, 1.0)) + 0.004 * fib;
  float rim = smoothstep(-aa, aa, d) * (1.0 - smoothstep(w - aa, w + aa, d));
  return mix(c, uPaper * (0.82 + 0.18 * fib), rim);
}

vec3 doMosaic() {
  float p = uP;
  float k = sin(3.14159 * p);
  float rows = mix(160.0, 11.0, pow(k, 0.6));
  vec2 grid = vec2(rows * asp, rows);
  vec2 cell = floor(vUv * grid);
  vec2 cuv = (cell + 0.5) / grid;
  float r = hash(cell + 3.0);
  float sw = smoothstep(0.0, 1.0, clamp((p - 0.2 - r * 0.45) / 0.15, 0.0, 1.0));
  vec2 suv = mix(vUv, cuv, smoothstep(0.08, 0.5, k));
  vec3 a = samp(tA, suv), b = samp(tB, suv);
  vec3 c = mix(a, b, sw);
  // each tile shrinks as it turns over, and a gap opens round it when the tiles are big
  vec2 f = abs(fract(vUv * grid) - 0.5);
  float s = 0.5 * (1.0 - 0.75 * sin(3.14159 * sw)) - 0.06 * smoothstep(0.3, 0.9, k);
  float aa = fwidth(vUv.x * grid.x) * 1.5;
  float tile = 1.0 - smoothstep(s - aa, s + aa, max(f.x, f.y));
  vec3 under = mix(uInk * 0.12, vec3(0.02), 0.5);
  // a face turning over is darker edge-on
  c *= 1.0 - 0.35 * sin(3.14159 * sw);
  return mix(under, c, mix(1.0, tile, smoothstep(0.05, 0.3, k)));
}

vec3 doContour() {
  float p = uP;
  vec2 s = vUv * vec2(asp, 1.0);
  float n = fbm(s * 1.7 + 3.1) * 0.75 + 0.25 * (1.0 - vUv.y);
  float level = mix(-0.08, 1.1, ease(p));
  float d = n - level;
  float aa = max(fwidth(d), 1e-4);
  float mB = 1.0 - smoothstep(-aa, aa, d);
  vec3 a = samp(tA, vUv + vec2(0.0, 0.03 * p)), b = samp(tB, vUv - vec2(0.0, 0.03 * (1.0 - p)));
  vec3 c = mix(a, b, mB);
  // contour lines ahead of the tide, on the old scene, and fading behind it on the new
  float z = n * 22.0;
  float lw = fwidth(z);
  float line = 1.0 - smoothstep(lw * 0.5, lw * 1.5, abs(fract(z + 0.5) - 0.5));
  float ahead = (1.0 - smoothstep(0.0, 0.22, d)) * step(0.0, d);
  float behind = (1.0 - smoothstep(0.0, 0.1, -d)) * step(d, 0.0);
  c = mix(c, uInk, line * (ahead * 0.85 + behind * 0.35));
  float front = 1.0 - smoothstep(0.0, aa * 3.0, abs(d));
  return mix(c, uInk, front);
}

vec3 doType() {
  float p = uP;
  vec2 s = (vUv - 0.5) * vec2(asp, 1.0);
  // the word fills most of the screen's width at zoom 1, then the camera dives into one letter
  float dive = smoothstep(0.32, 1.0, p);
  float z = exp(mix(0.0, log(uType.z), pow(dive, 2.2)));
  vec2 size = vec2(uType2.x, uType2.x / uType.w) * z;
  vec2 c = uType.xy;
  vec2 pos = -(c - 0.5) * size * smoothstep(0.0, 0.6, dive);
  vec2 t = (s - pos) / size + 0.5;
  float m = 0.0;
  if (t.x > 0.0 && t.x < 1.0 && t.y > 0.0 && t.y < 1.0) m = texture(tType, t).a;
  // the letters come up first, then the dive
  float letters = smoothstep(0.0, 0.25, p);
  float aa = max(fwidth(m), 1e-3);
  float mB = smoothstep(0.5 - aa, 0.5 + aa, m) * letters;
  if (p > 0.97) mB = mix(mB, 1.0, (p - 0.97) / 0.03);
  vec3 a = samp(tA, vUv) * (1.0 - uType2.z * smoothstep(0.0, 0.3, p));
  vec3 b = samp(tB, vUv + s * 0.04 * (1.0 - dive));
  float edge = (1.0 - smoothstep(0.0, aa * 3.0, abs(m - 0.5))) * letters * (1.0 - dive);
  return mix(mix(a, b, mB), uInk, edge * 0.8);
}

vec3 doDye() {
  float p = uP;
  vec2 s = vUv * vec2(asp, 1.0);
  vec2 w = vec2(fbm(s * 2.2 + uTime * 0.04), fbm(s * 2.2 + 7.3 - uTime * 0.04)) - 0.5;
  vec2 sw = s + w * 0.42;
  float big = sqrt(asp * asp + 1.0);
  float d = 1e3;
  vec3 seeds[3];
  seeds[0] = vec3(0.28 * asp, 0.68, 0.0);
  seeds[1] = vec3(0.74 * asp, 0.32, 0.12);
  seeds[2] = vec3(0.56 * asp, 0.9, 0.24);
  for (int i = 0; i < 3; i++) {
    float r = max(0.0, (p - seeds[i].z) / (1.0 - seeds[i].z));
    r = pow(r, 1.4) * big * 1.05;
    d = min(d, length(sw - seeds[i].xy) - r);
  }
  float aa = max(fwidth(d), 1e-4);
  float mB = 1.0 - smoothstep(-aa, aa, d);
  float near = exp(-abs(d) * 18.0);
  vec2 push = w * 0.05 * near;
  vec3 a = samp(tA, vUv + push), b = samp(tB, vUv - push * 0.5);
  vec3 c = mix(a, b, mB);
  // a fringe of the ink itself, thick where it is spreading
  float fr = exp(-max(d, 0.0) * 55.0) * (1.0 - mB) + exp(min(d, 0.0) * 30.0) * mB * 0.4;
  return mix(c, uInk, clamp(fr, 0.0, 1.0) * 0.85 * (1.0 - smoothstep(0.85, 1.0, p)));
}

vec3 doSlats() {
  float p = uP;
  float n = uSlats;
  float i = floor(vUv.x * n), lx = fract(vUv.x * n);
  float pi = clamp(p * 1.45 - i / n * 0.45, 0.0, 1.0);
  pi = ease(pi);
  // each slat's edge leans, like a sheet pulled up at a slant
  float edge = pi * 1.2 - 0.1 + (lx - 0.5) * 0.12 * sin(3.14159 * pi);
  float d = vUv.y - edge;
  float aa = max(fwidth(d), 1e-4);
  float mB = 1.0 - smoothstep(-aa, aa, d);
  vec3 a = samp(tA, vUv + vec2(0.0, -0.22 * pi));
  vec3 b = samp(tB, vUv + vec2(0.0, 0.3 * (1.0 - pi)));
  b *= 1.0 - 0.4 * exp(-abs(d) * 30.0) * mB;
  a *= 1.0 - 0.25 * smoothstep(0.0, 1.0, pi);
  vec3 c = mix(a, b, mB);
  // the slats' own edges, fine paper lines
  float seam = 1.0 - smoothstep(0.0, fwidth(vUv.x * n) * 1.5, min(lx, 1.0 - lx));
  return mix(c, uPaper * 0.6, seam * 0.35 * sin(3.14159 * p));
}

vec3 doRing() {
  float p = uP;
  vec2 s = (vUv - uCorner) * vec2(asp, 1.0);
  float ang = atan(s.y, s.x);
  float big = sqrt(asp * asp + 1.0);
  float R = big * 1.08 * smoothstep(0.0, 1.0, p);
  float n = fbm(vec2(ang * 2.6 + 1.0, uTime * 0.08 + p * 2.0));
  float rr = R * (1.0 + (n - 0.5) * 0.3);
  float d = length(s) - rr;
  float aa = max(fwidth(d), 1e-4);
  float mB = 1.0 - smoothstep(-aa, aa, d);
  vec3 a = samp(tA, vUv), b = samp(tB, vUv);
  vec3 c = mix(a, b, mB);
  // the stroke: ink, uneven, thickest mid-way
  float w = 0.006 + 0.03 * sin(3.14159 * p);
  float smoke = fbm(vec2(ang * 9.0, length(s) * 12.0 - uTime * 0.2));
  float st = 1.0 - smoothstep(w * (0.5 + smoke), w * (0.5 + smoke) + aa * 2.0, abs(d));
  return mix(c, uInk, st * 0.95);
}

vec3 doMist() {
  float p = uP;
  vec2 s = vUv * vec2(asp, 1.0);
  float n = fbm(s * 2.2 + vec2(uTime * 0.025, p * 0.8));
  float n2 = fbm(s * 4.4 - vec2(uTime * 0.02, p * 0.5) + 9.0);
  float gather = smoothstep(0.0, 0.5, p), clear = smoothstep(0.5, 1.0, p);
  // it rolls in as clumps, then thins from uCorner outward
  float cover = smoothstep(0.0, 0.22, n + gather * 1.15 - 0.78);
  float big = sqrt(asp * asp + 1.0);
  float r = length((vUv - uCorner) * vec2(asp, 1.0)) / big;
  float open = smoothstep(-0.08, 0.08, clear * 1.35 - r - (n2 - 0.5) * 0.4);
  float m = cover * (1.0 - open);
  vec3 a = samp(tA, vUv + (n - 0.5) * 0.025 * gather);
  vec3 b = samp(tB, (vUv - uCorner) * (1.0 + 0.06 * (1.0 - clear)) + uCorner + (n2 - 0.5) * 0.03 * (1.0 - clear));
  vec3 base = mix(a, b, smoothstep(0.42, 0.58, p));
  // the mist itself: lit from above, darker in its folds
  vec3 mc = uMist * mix(0.86, 1.04, vUv.y) * mix(0.9, 1.05, n2);
  return mix(base, mc, m);
}

vec3 doFold() {
  float p = ease(uP);
  float slope = 0.16;
  // the crease climbs from below the screen to past its top, leaning
  float line = mix(-0.12, 1.08, p) + slope * (vUv.x - 0.5);
  float d = vUv.y - line;
  vec3 c;
  if (d < 0.0) {
    // the next scene, in the shadow the curl throws on it
    c = samp(tB, vUv) * (1.0 - 0.55 * exp(d / 0.05));
  } else if (vUv.y < 2.0 * line) {
    // the flap: the back of the sheet, the print showing faintly through it, mirrored
    vec2 src = vec2(vUv.x, line - d);
    vec3 through = samp(tA, src);
    float lum = dot(through, vec3(0.3, 0.55, 0.15));
    float curl = smoothstep(0.0, 0.07, d);          // dark in the bend, lighter as it lies flat
    vec3 back = uPaper * (0.62 + 0.38 * curl) * mix(1.0, 0.9 + 0.2 * lum, 0.5);
    // the flap's own edge, a cut line
    float e = 2.0 * line - vUv.y;
    float aa = max(fwidth(e), 1e-4);
    back *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, aa * 2.0, e));
    c = back;
  } else {
    // the sheet still lying flat, with the flap's shadow just above its edge
    float e = vUv.y - 2.0 * line;
    c = samp(tA, vUv) * (1.0 - 0.4 * exp(-e / 0.03) * step(0.0, line));
  }
  return c;
}

vec3 doShards() {
  float p = uP;
  float rows = 4.5;
  vec2 s = vUv * vec2(asp, 1.0) * rows;
  vec2 i = floor(s), f = fract(s);
  float md = 8.0; vec2 mr = vec2(0.0), mc = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(hash(i + g), hash(i + g + 17.3)) * 0.85 + 0.075;
    vec2 r = g + o - f; float dd = dot(r, r);
    if (dd < md) { md = dd; mr = r; mc = i + g; }
  }
  float ed;
  // edge distance: to the nearest bisector between this seed and its neighbours
  ed = 8.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(hash(i + g), hash(i + g + 17.3)) * 0.85 + 0.075;
    vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 1e-5) ed = min(ed, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  float rnd = hash(mc + 5.1);
  vec2 seed = (mc + vec2(hash(mc), hash(mc + 17.3)) * 0.85 + 0.075) / rows / vec2(asp, 1.0);
  // the lower pieces go first, a little at random
  float t = clamp(p * 1.9 - (seed.y) * 0.75 - rnd * 0.25, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  float sc = 1.0 - t;
  float ang = (rnd - 0.5) * 1.6 * t;
  vec2 rel = (vUv - seed) * vec2(asp, 1.0);
  rel = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * rel / max(sc, 0.001);
  vec2 src = seed + rel / vec2(asp, 1.0) + vec2(0.0, 0.25 * t * t);
  float gap = (1.0 - sc) * 0.62;
  float aa = max(fwidth(ed), 1e-4);
  float inside = smoothstep(gap - aa, gap + aa, ed) * step(0.001, sc);
  vec3 a = samp(tA, src) * (1.0 - 0.45 * t);
  vec3 b = samp(tB, vUv) * (0.75 + 0.25 * p);
  vec3 c = mix(b, a, inside);
  // each piece's cut edge catches the light
  float rim = inside * (1.0 - smoothstep(gap + aa, gap + aa * 3.0 + 0.02 * t, ed)) * step(0.01, t);
  return mix(c, uPaper, rim * 0.8);
}

void main() {
  asp = uRes.x / uRes.y;
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec3 c;
  if (uMode == 0) c = mix(samp(tA, vUv), samp(tB, vUv), smoothstep(0.0, 1.0, uP));
  else if (uMode == 1) c = doWindow(samp(tA, vUv), px);
  else if (uMode == 2) c = doTear();
  else if (uMode == 3) c = doMosaic();
  else if (uMode == 4) c = doContour();
  else if (uMode == 5) c = doType();
  else if (uMode == 6) c = doDye();
  else if (uMode == 7) c = doSlats();
  else if (uMode == 8) c = doRing();
  else if (uMode == 9) c = doMist();
  else if (uMode == 10) c = doFold();
  else c = doShards();
  // vignette and grain
  float v = length((vUv - 0.5) * vec2(asp, 1.0) * vec2(0.85, 1.0));
  c *= mix(1.0, smoothstep(1.15, 0.25, v), 0.35);
  vec3 g = vec3(hash(px + fract(uTime) * 61.0) - 0.5);
  fragColor = vec4(toSRGB(c) + g * uGrain, 1.0);
}
`;

export function createCompositor(renderer) {
  const uniforms = {
    tA: { value: null }, tB: { value: null }, tType: { value: null },
    uMode: { value: 0 }, uP: { value: 0 }, uTime: { value: 0 }, uVel: { value: 0 }, uGrain: { value: 0.035 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uHinv: { value: new THREE.Matrix3() },
    uWin: { value: new THREE.Vector4(0.08, 1, 1.4, 1) },
    uInk: { value: new THREE.Color() }, uPaper: { value: new THREE.Color('#efe9dc') },
    uType: { value: new THREE.Vector4(0.5, 0.5, 40, 3) }, uType2: { value: new THREE.Vector4(1.2, 0, 0.45, 0) },
    uCorner: { value: new THREE.Vector2(0, 0) }, uSlats: { value: 7 }, uMist: { value: new THREE.Color('#efe7e0') }
  };
  const mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false });
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  return {
    u: uniforms,
    draw() { renderer.setRenderTarget(null); renderer.render(scene, cam); }
  };
}

/* ------------------------------------------------------------------ the window, as a homography */
// Zentry's clip mask: the four corners of a quad, scaled, turned (x, then y, then z) and moved, are
// projected through a focal length onto the screen. Here the same corners give a homography from the
// window's own square to the screen, and its inverse goes to the shader, which can then cut any shape
// in the window's own coordinates.
export function windowHomography(o, W, H, out) {
  const fl = o.fl ?? 800, rx = (o.rx || 0) * Math.PI / 180, ry = (o.ry || 0) * Math.PI / 180, rz = (o.rz || 0) * Math.PI / 180;
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const pts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([u, v]) => {
    let x = u * o.w, y = v * o.h, z = 0;
    // x
    let y1 = y * cx - z * sx, z1 = y * sx + z * cx; y = y1; z = z1;
    // y
    let x1 = x * cy + z * sy; z1 = -x * sy + z * cy; x = x1; z = z1;
    // z
    x1 = x * cz - y * sz; y1 = x * sz + y * cz; x = x1; y = y1;
    x += o.x || 0; y += o.y || 0; z += o.z || 0;
    const t = fl / (fl + z);
    return [W / 2 + x * t, H / 2 + y * t];
  });
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = pts;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let a, b, c, d, e, f, g, h;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0; g = 0; h = 0; }
  else {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0;
    d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
  }
  out.set(a, b, c, d, e, f, g, h, 1).invert();
  return pts;
}

/* ------------------------------------------------------------------ small textures */
export function grainTexture(size = 256, seed = 7) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), img = x.createImageData(size, size);
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < size * size; i++) { const v = 236 + r() * 19; img.data[i * 4] = v; img.data[i * 4 + 1] = v - 2; img.data[i * 4 + 2] = v - 6; img.data[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  // fibres
  x.globalAlpha = 0.07; x.strokeStyle = '#7a6a55'; x.lineWidth = 0.6;
  for (let i = 0; i < 160; i++) { const a = r() * size, b = r() * size, an = r() * Math.PI, l = 4 + r() * 14; x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo(a + Math.cos(an) * l * 0.5 + r() * 3, b + Math.sin(an) * l * 0.5, a + Math.cos(an) * l, b + Math.sin(an) * l); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// a line or two of text on a transparent canvas, for labels in a scene
export function textTexture(lines, { w = 512, h = 128, font = '500 44px "JetBrains Mono", monospace', color = '#ece7dc', align = 'center', bg = null, pad = 0, lh = 1.2 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  x.font = font; x.fillStyle = color; x.textAlign = align; x.textBaseline = 'middle';
  const L = [].concat(lines), size = parseFloat(font.match(/(\d+(\.\d+)?)px/)[1]);
  L.forEach((s, i) => x.fillText(s, align === 'center' ? w / 2 : align === 'left' ? pad : w - pad, h / 2 + (i - (L.length - 1) / 2) * size * lh));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// The word the camera dives into, and the point inside it to dive at: the one deepest in a letter
// (the largest distance to an edge, by a two-pass chamfer over a coarse copy).
export function typeMask(word, fontCss) {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  x.font = fontCss;
  const m = x.measureText(word), size = parseFloat(fontCss.match(/(\d+)px/)[1]);
  const w = Math.ceil(m.width + size * 0.2), h = Math.ceil(size * 1.15);
  c.width = w; c.height = h;
  x.font = fontCss; x.fillStyle = '#fff'; x.textBaseline = 'alphabetic'; x.textAlign = 'center';
  x.fillText(word, w / 2, h * 0.8);
  // the distance inside the letters, on a quarter-size copy kept in memory (reading the big one back
  // off the GPU can stall the page for a long moment)
  const g = 4, gw = Math.ceil(w / g), gh = Math.ceil(h / g);
  const sc = document.createElement('canvas'); sc.width = gw; sc.height = gh;
  const sx = sc.getContext('2d', { willReadFrequently: true });
  sx.font = fontCss.replace(/(\d+)px/, (_, n) => n / g + 'px'); sx.fillStyle = '#fff'; sx.textBaseline = 'alphabetic'; sx.textAlign = 'center';
  sx.fillText(word, w / 2 / g, h * 0.8 / g);
  const a = sx.getImageData(0, 0, gw, gh).data;
  const D = new Float32Array(gw * gh);
  for (let k = 0; k < D.length; k++) D[k] = a[k * 4 + 3] > 127 ? 1e6 : 0;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const k = j * gw + i; if (!D[k]) continue; D[k] = Math.min(D[k], i ? D[k - 1] + 1 : 1, j ? D[k - gw] + 1 : 1, i && j ? D[k - gw - 1] + 1.414 : 1, j && i < gw - 1 ? D[k - gw + 1] + 1.414 : 1); }
  for (let j = gh - 1; j >= 0; j--) for (let i = gw - 1; i >= 0; i--) { const k = j * gw + i; if (!D[k]) continue; D[k] = Math.min(D[k], i < gw - 1 ? D[k + 1] + 1 : 1, j < gh - 1 ? D[k + gw] + 1 : 1, i < gw - 1 && j < gh - 1 ? D[k + gw + 1] + 1.414 : 1, j < gh - 1 && i ? D[k + gw - 1] + 1.414 : 1); }
  let best = 0, bi = 0;
  // (prefer a point near the middle of the word, so the dive goes in, not off to one side)
  for (let k = 0; k < D.length; k++) { const i = k % gw, j = (k / gw) | 0, wgt = D[k] * (1 - 0.6 * Math.abs(i / gw - 0.5)); if (wgt > best) { best = wgt; bi = k; } }
  const ci = bi % gw, cj = (bi / gw) | 0;
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return { tex: t, aspect: w / h, centre: [(ci + 0.5) * g / w, (cj + 0.5) * g / h], depth: D[bi] * g / w };
}
