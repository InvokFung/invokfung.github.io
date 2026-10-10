/*
 * The live figures. Each one is a small, working version of a project's core idea, drawn on a
 * 2D canvas at whatever size it is handed. The map and the project pages share one instance per
 * project, so whatever you break on the map is still broken when you open the page.
 *
 *   size(w, h)      lay out for a box of w × h CSS pixels
 *   step(dt)        advance the simulation by dt seconds
 *   draw(ctx)       paint at the origin, in CSS pixels
 *   move/down/leave pointer input in local coordinates; move returns a cursor, down returns true if used
 *   set(v)          the page slider; `slider` describes it
 *   stats()         live numbers for the page, [[value, label], …]
 *   fx(name, data)  events out to the page (sounds, opening links, syncing the slider)
 */
(function (root) {
  "use strict";

  const TAU = Math.PI * 2;
  const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
  const SERIF = '"Instrument Serif", Georgia, serif';
  const INK = "#ecebe6";
  const RED = "#ff5d5d";
  const AMBER = "#ffb547";

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ink = (a) => `rgba(236,235,230,${a})`;
  const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
  const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  // mulberry32: small, fast, seedable
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function font(ctx, px, weight, fam) {
    ctx.font = `${weight || 400} ${Math.max(6, px).toFixed(1)}px ${fam || MONO}`;
  }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function bez(p, t) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]];
  }
  function bezPath(ctx, p) {
    ctx.moveTo(p[0][0], p[0][1]);
    ctx.bezierCurveTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]);
  }
  // cut a string to fit a width, with an ellipsis
  function fit(ctx, str, max) {
    if (ctx.measureText(str).width <= max) return str;
    let lo = 0, hi = str.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(str.slice(0, mid) + "…").width <= max) lo = mid; else hi = mid - 1;
    }
    return str.slice(0, lo).trimEnd() + "…";
  }
  function inside(x, y, r, pad = 0) {
    return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
  }
  function label(ctx, str, x, y, px, color, align, weight, fam) {
    font(ctx, px, weight, fam);
    ctx.fillStyle = color;
    ctx.textAlign = align || "left";
    ctx.fillText(str, x, y);
  }

  class Fig {
    constructor(o) {
      this.color = o.color;
      this.fx = o.fx || (() => {});
      this.auto = true; // demo itself until someone touches it
      this.t = 0;
      this.hx = this.hy = -1;
      this.size(960, 600);
    }
    size(w, h) {
      if (w === this.w && h === this.h) return;
      this.w = w;
      this.h = h;
      this.s = clamp(Math.min(w / 960, h / 600), 0.4, 1.45);
      this.tall = h > w * 1.05;
      this.L = null;
    }
    step(dt) { this.t += dt; }
    draw() {}
    move(x, y) { this.hx = x; this.hy = y; return ""; }
    down() { return false; }
    leave() { this.hx = this.hy = -1; }
    set(v) { this.slider.value = v; }
    stats() { return []; }
  }

  root.FigKit = { TAU, MONO, SANS, SERIF, INK, RED, AMBER, clamp, lerp, ink, rgba, rng, font, rrect, bez, bezPath, fit, inside, label, fmtInt, pct, Fig };
  root.Figs = {};
})(typeof window !== "undefined" ? window : globalThis);
