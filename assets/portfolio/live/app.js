/*
 * The home page is one map. Nine cells: my name and career in the middle, a live project in each
 * of the seven around it, and StudyLog below. You arrive zoomed in on Relay, already running.
 *
 * One canvas draws the map. Cells far away become dot-matrix sketches of their own figure and
 * decode when you point at them; close enough, the figure itself runs and takes your input.
 * Opening a project grows its cell into a page (View Transitions where the browser has them).
 * Every bit of feedback is the same thing: a request travelling along a trace.
 */
(function () {
  "use strict";
  const D = window.PORTFOLIO, F = window.Figs, K = window.FigKit;
  const { clamp, rgba, ink, INK, MONO, SERIF } = K;
  const $ = (s, el = document) => el.querySelector(s);
  const BG = "#0a0b0d";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ext = (u) => /^https?:/.test(u);

  const motionQ = matchMedia("(prefers-reduced-motion: reduce)");
  let calm = motionQ.matches;
  motionQ.addEventListener?.("change", (e) => (calm = e.matches));

  /* ------------------------------------------------------------------ the nodes */
  const PROJ = Object.fromEntries(D.projects.map((p) => [p.id, p]));
  const FIG = { relay: F.Relay, tracewise: F.Tracewise, onboard: F.Onboard, atlas: F.Atlas, intonation: F.Studio, arena: F.Arena, layerline: F.Layerline };
  const CELL = { intonation: [0, 0], atlas: [1, 0], onboard: [2, 0], arena: [0, 1], hub: [1, 1], relay: [2, 1], layerline: [0, 2], notes: [1, 2], tracewise: [2, 2] };
  const ORDER = ["relay", "tracewise", "onboard", "atlas", "intonation", "arena", "layerline"];
  const grew = Object.fromEntries((D.eras.find((e) => e.id === "now").grew || []).map(([y, from, id]) => [id, [y, from]]));
  grew.notes = ["2022", "Writing it all down"];

  const nodes = [];
  const byId = {};
  for (const [id, cell] of Object.entries(CELL)) {
    const n = { id, cell, p: PROJ[id] || null, live: D.live[id] || null, dec: 0, hov: 0, snapAt: -1e9, scr: 0 };
    const fx = (name, data) => onFx(n, name, data);
    if (id === "hub") { n.color = INK; n.fig = new F.Hub({ color: INK, profile: D.profile, path: D.path, fx }); n.name = D.profile.name; }
    else if (id === "notes") { const s = PROJ.studylog; n.color = s.color; n.fig = new F.Notes({ color: s.color, fx }); n.name = "StudyLog"; n.kind = "Notes"; n.year = "since " + s.year; n.href = "/blog/"; }
    else { n.color = n.p.color; n.fig = new FIG[id]({ color: n.p.color, fx }); n.name = n.p.name; n.kind = n.p.kind; n.year = String(n.p.year); }
    nodes.push(n);
    byId[id] = n;
  }
  const projects = ORDER.map((id) => byId[id]);

  // links between projects: the distinctive skills two of them share
  const COMMON = new Set(["TypeScript", "React", "Vite", "JavaScript"]);
  const skillsOf = (p) => new Set([...(p.stack || []), ...(p.uses || [])].filter((s) => !COMMON.has(s)));
  const links = [];
  for (let i = 0; i < ORDER.length; i++) for (let j = i + 1; j < ORDER.length; j++) {
    const a = skillsOf(PROJ[ORDER[i]]), b = skillsOf(PROJ[ORDER[j]]);
    const sh = [...a].filter((s) => b.has(s));
    if (sh.length) links.push({ a: byId[ORDER[i]], b: byId[ORDER[j]], skills: sh });
  }

  /* ------------------------------------------------------------------ canvas and camera */
  const cv = $("#map"), ctx = cv.getContext("2d");
  let W = 0, H = 0, DPR = 1, tall = false;
  let CW = 1200, CH = 800, NW = 1000, NH = 640;
  const cam = { x: 0, y: 0, z: 1 };
  let flight = null;
  const TOP = () => (W < 640 ? 64 : 76), BOT = () => (W < 640 ? 76 : 70);

  function layout() {
    tall = H > W * 1.1;
    if (tall) { CW = 760; CH = 1160; NW = 640; NH = 960; } else { CW = 1200; CH = 800; NW = 1000; NH = 640; }
    for (const n of nodes) {
      const [c, r] = n.cell;
      const cx = (c - 1) * CW, cy = (r - 1) * CH;
      n.r = { x: cx - NW / 2, y: cy - NH / 2, w: NW, h: NH };
      n.c = [cx, cy];
    }
  }
  const fitZ = () => Math.min((W - 40) / (3 * CW), (H - TOP() - BOT()) / (3 * CH));
  const focusZ = (n) => Math.min((W - (W < 640 ? 20 : 80)) / n.r.w, (H - TOP() - BOT() - (W < 640 ? 110 : 70)) / n.r.h);
  const camFor = (n) => ({ x: n.c[0], y: n.c[1] + (W < 640 ? 14 : -24) / focusZ(n), z: focusZ(n) });
  const midY = () => TOP() + (H - TOP() - BOT()) / 2;
  const sx = (x) => (x - cam.x) * cam.z + W / 2;
  const sy = (y) => (y - cam.y) * cam.z + midY();
  const wx = (x) => (x - W / 2) / cam.z + cam.x;
  const wy = (y) => (y - midY()) / cam.z + cam.y;
  const scr = (r) => ({ x: sx(r.x), y: sy(r.y), w: r.w * cam.z, h: r.h * cam.z });
  const clampCam = () => {
    cam.z = clamp(cam.z, fitZ() * 0.7, 2.2);
    cam.x = clamp(cam.x, -1.6 * CW, 1.6 * CW);
    cam.y = clamp(cam.y, -1.6 * CH, 1.6 * CH);
  };

  function resize() {
    const keep = W ? { x: cam.x, y: cam.y } : null;
    W = innerWidth;
    H = innerHeight;
    DPR = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    const wasTall = tall;
    layout();
    if (!keep || wasTall !== tall) Object.assign(cam, camFor(focusNode || byId.relay));
    clampCam();
    mini.size();
    wake();
  }

  // van Wijk and Nuij: zoom out a little on long flights so you never lose your place
  function zoomPath(p0, p1) {
    const rho = Math.SQRT2, r2 = 2, r4 = 4;
    const [ux0, uy0, w0] = p0, [ux1, uy1, w1] = p1, dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy;
    if (d2 < 1e-9) {
      const S = Math.log(w1 / w0) / rho;
      const f = (t) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)];
      f.S = Math.abs(S);
      return f;
    }
    const d1 = Math.sqrt(d2), b0 = (w1 * w1 - w0 * w0 + r4 * d2) / (2 * w0 * r2 * d1), b1 = (w1 * w1 - w0 * w0 - r4 * d2) / (2 * w1 * r2 * d1);
    const q0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), q1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1), S = (q1 - q0) / rho;
    const f = (t) => { const s = t * S, c0 = Math.cosh(q0), u = (w0 / (r2 * d1)) * (c0 * Math.tanh(rho * s + q0) - Math.sinh(q0)); return [ux0 + u * dx, uy0 + u * dy, (w0 * c0) / Math.cosh(rho * s + q0)]; };
    f.S = S;
    return f;
  }
  function fly(to, ms) {
    to = { x: to.x, y: to.y, z: clamp(to.z, fitZ() * 0.7, 2.2) };
    if (calm) { Object.assign(cam, to); flight = null; wake(); return; }
    const path = zoomPath([cam.x, cam.y, W / cam.z], [to.x, to.y, W / to.z]);
    flight = { path, t0: performance.now(), ms: ms || clamp(path.S * 520, 480, 1300) };
    wake();
  }
  function flyTo(n) { focusNode = n; fly(camFor(n)); }
  function flyAll() { focusNode = null; fly({ x: 0, y: 0, z: fitZ() }); }

  /* ------------------------------------------------------------------ the loop */
  let raf = 0, last = performance.now(), now = 0, focusNode = byId.relay, hoverNode = null, hovered = false;
  function wake() { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; Sound.hush(); } else wake(); });

  function frame(t) {
    raf = 0;
    now = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (flight) {
      const k = clamp((t - flight.t0) / flight.ms, 0, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const [x, y, w] = flight.path(e);
      cam.x = x; cam.y = y; cam.z = W / w;
      if (k >= 1) flight = null;
    }
    const speed = calm ? 0.5 : 1;
    if (page) {
      page.fig.step(dt * speed);
      drawPage();
    } else {
      for (const n of nodes) if (n.vis || n === byId.relay) n.fig.step(dt * speed);
      draw(dt);
    }
    raf = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ drawing the map */
  let gridTile = null;
  function grid() {
    const g = 40 * cam.z;
    const step = g < 9 ? 160 : 40, gs = step * cam.z;
    if (!gridTile) {
      gridTile = document.createElement("canvas");
      gridTile.width = gridTile.height = 64;
      const c = gridTile.getContext("2d");
      c.fillStyle = "rgba(236,235,230,0.09)";
      c.fillRect(0, 0, 2, 2);
    }
    const pat = ctx.createPattern(gridTile, "repeat");
    const m = new DOMMatrix().translateSelf(sx(0) % gs, sy(0) % gs).scaleSelf(gs / 64, gs / 64);
    pat.setTransform(m);
    ctx.fillStyle = pat;
    ctx.globalAlpha = clamp((gs - 6) / 14, 0, 1);
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // spokes from the hub to each cell, carrying the years each project grew from
  const spokePk = nodes.filter((n) => n.id !== "hub").map((n) => ({ n, pk: [], acc: Math.random() * 2 }));
  function edgePoint(r, from, to) {
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const tx = dx ? (dx > 0 ? r.x + r.w - from[0] : r.x - from[0]) / dx : Infinity;
    const ty = dy ? (dy > 0 ? r.y + r.h - from[1] : r.y - from[1]) / dy : Infinity;
    const t = Math.min(tx, ty);
    return [from[0] + dx * t, from[1] + dy * t];
  }
  function spokes(dt) {
    const hub = byId.hub;
    ctx.lineWidth = 1;
    for (const sp of spokePk) {
      const n = sp.n;
      const a = edgePoint(hub.r, hub.c, n.c), b = edgePoint(n.r, n.c, hub.c);
      const A = [sx(a[0]), sy(a[1])], B = [sx(b[0]), sy(b[1])];
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const hot = hoverNode === n || (yearPick && grew[n.id] && grew[n.id][0] === yearPick);
      ctx.strokeStyle = hot ? rgba(n.color, 0.6) : ink(0.1);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      // terminals
      ctx.fillStyle = hot ? n.color : ink(0.3);
      ctx.fillRect(A[0] - 2, A[1] - 2, 4, 4);
      ctx.fillRect(B[0] - 2, B[1] - 2, 4, 4);
      if (!calm) {
        sp.acc -= dt * (hot ? 4 : 0.55);
        if (sp.acc <= 0) { sp.acc = 1 + Math.random(); sp.pk.push(0); }
        sp.pk = sp.pk.map((u) => u + (dt * 380) / Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]))).filter((u) => u < 1);
        ctx.fillStyle = n.color;
        for (const u of sp.pk) {
          for (let k = 3; k >= 0; k--) {
            const v = Math.max(0, u - k * 0.012);
            ctx.globalAlpha = k ? 0.14 * (4 - k) : 1;
            ctx.beginPath();
            ctx.arc(A[0] + (B[0] - A[0]) * v, A[1] + (B[1] - A[1]) * v, k ? 1.6 : 2.4, 0, 7);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
      const g = grew[n.id];
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
      // labels fade out under the HUD bands so they never sit behind the name or the nav
      const clear = Math.min(1, Math.max(0, (Math.min(my - 96, H - 96 - my, mx - 40, W - 40 - mx)) / 40));
      if (g && len > 150 && clear > 0) {
        ctx.save();
        ctx.globalAlpha = clear;
        ctx.translate(mx, my);
        let ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
        if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
        ctx.rotate(ang);
        K.label(ctx, g[0] + " · " + g[1].toLowerCase(), 0, -8, 10, hot ? n.color : ink(0.36), "center", 400, MONO);
        ctx.restore();
      }
    }
  }

  function skillLinks() {
    const n = hoverNode;
    if (!n || !n.p || n.tier !== "dots") return;
    ctx.setLineDash([4, 5]);
    for (const l of links) {
      if (l.a !== n && l.b !== n) continue;
      const o = l.a === n ? l.b : l.a;
      const A = [sx(n.c[0]), sy(n.c[1])], B = [sx(o.c[0]), sy(o.c[1])];
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, dx = B[0] - A[0], dy = B[1] - A[1];
      const bend = 0.18, cx = mx - dy * bend, cy = my + dx * bend;
      ctx.strokeStyle = rgba(n.color, 0.55);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.quadraticCurveTo(cx, cy, B[0], B[1]); ctx.stroke();
      const lx = 0.25 * A[0] + 0.5 * cx + 0.25 * B[0], ly = 0.25 * A[1] + 0.5 * cy + 0.25 * B[1];
      K.font(ctx, 11, 500, MONO);
      const txt = l.skills.slice(0, 2).join(" · ");
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = "rgba(10,11,13,0.9)";
      ctx.fillRect(lx - tw / 2 - 6, ly - 10, tw + 12, 20);
      K.label(ctx, txt, lx, ly + 1, 11, n.color, "center", 500, MONO);
    }
    ctx.setLineDash([]);
  }

  // dot-matrix: render the figure small, sample it, and draw one dot per cell
  const sampler = document.createElement("canvas"), sctx = sampler.getContext("2d", { willReadFrequently: true });
  function snap(n, every) {
    if (now - n.snapAt < every) return;
    n.snapAt = now;
    // small on purpose: at this size a 1px line still covers a fair share of each sample
    const rw = tall ? 300 : 480, rh = tall ? 450 : 307;
    if (!n.off) { n.off = document.createElement("canvas"); n.octx = n.off.getContext("2d"); }
    if (n.off.width !== rw) { n.off.width = rw; n.off.height = rh; }
    const c = n.octx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = BG;
    c.fillRect(0, 0, rw, rh);
    n.fig.size(rw, rh);
    n.fig.draw(c);
    const cols = tall ? 50 : 80, rows = tall ? 75 : 51;
    sampler.width = cols;
    sampler.height = rows;
    sctx.drawImage(n.off, 0, 0, cols, rows);
    const px = sctx.getImageData(0, 0, cols, rows).data, lum = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) lum[i] = Math.pow(Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) / 255, 0.55);
    n.dots = { cols, rows, lum };
  }
  function matrix(n, R) {
    const d = n.dots;
    if (!d) return;
    const cw = R.w / d.cols, ch = R.h / d.rows, m = Math.min(cw, ch);
    ctx.globalAlpha = 1 - n.dec;
    // every cell has a dot, like an unlit LED panel; the figure lights some of them
    for (const [lo, hi, k, a] of [[0, 0.2, 0.22, 0.13], [0.2, 0.42, 0.36, 0.55], [0.42, 0.7, 0.56, 0.85], [0.7, 2, 0.78, 1]]) {
      ctx.fillStyle = rgba(n.color === INK ? "#ecebe6" : n.color, a);
      ctx.beginPath();
      for (let j = 0; j < d.rows; j++) for (let i = 0; i < d.cols; i++) {
        const v = d.lum[j * d.cols + i];
        if (v < lo || v >= hi) continue;
        const sz = m * k;
        ctx.rect(R.x + i * cw + (cw - sz) / 2, R.y + j * ch + (ch - sz) / 2, sz, sz);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const GLYPH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/";
  function scramble(str, t) {
    const k = Math.floor(clamp(t / 0.4, 0, 1) * str.length);
    let out = str.slice(0, k);
    for (let i = k; i < str.length; i++) out += str[i] === " " ? " " : GLYPH[(Math.random() * GLYPH.length) | 0];
    return out;
  }

  function header(n, R, liveTier) {
    if (n.id === "hub") return;
    const gap = ((CH - NH) / 2) * cam.z;
    const big = gap > 34;
    const ny = R.y - (big ? Math.min(18, gap * 0.25) : 8);
    const npx = clamp(cam.z * 30, 13, 30);
    const name = n.scr > 0 && n.scr < 0.45 ? scramble(n.name, n.scr) : n.name;
    K.label(ctx, name, R.x, ny, npx, INK, "left", 400, SERIF);
    if (!big) return;
    K.font(ctx, npx, 400, SERIF);
    const nw = ctx.measureText(n.name).width;
    K.label(ctx, (n.kind + " · " + n.year).toUpperCase(), R.x + nw + 12, ny - 2, 10, ink(0.45), "left", 500, MONO);
    if (liveTier && n.live) {
      K.font(ctx, 13, 400, K.SANS);
      const lw = ctx.measureText(n.live.line).width;
      K.font(ctx, 10, 500, MONO);
      const room = R.w - nw - 12 - ctx.measureText((n.kind + " · " + n.year).toUpperCase()).width - 28;
      if (lw <= room) K.label(ctx, n.live.line, R.x + R.w, ny - 2, 13, rgba(n.color, 0.95), "right", 400, K.SANS);
      else if (R.y + R.h / 2 > 0 && R.y + R.h / 2 < H) wrap(n.live.line, R.x, R.y + R.h + 22, R.w, 18, 13, rgba(n.color, 0.95));
    } else if (n.live && R.w > 240) {
      K.label(ctx, n.live.tag[1], R.x + R.w, ny - 1, 10, ink(0.45), "right", 400, MONO);
      K.font(ctx, 10, 400, MONO);
      K.label(ctx, n.live.tag[0], R.x + R.w - ctx.measureText(n.live.tag[1]).width - 8, ny - 1, 12, n.color, "right", 600, MONO);
    }
  }

  function wrap(text, x, y, max, lh, px, color) {
    K.font(ctx, px, 400, K.SANS);
    const words = text.split(" "), lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    lines.slice(0, 3).forEach((l, i) => K.label(ctx, l, x, y + i * lh, px, color, "left", 400, K.SANS));
  }

  function frameBox(n, R, hot) {
    ctx.strokeStyle = hot ? rgba(n.color, 0.5) : ink(0.06);
    ctx.lineWidth = 1;
    ctx.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
    const t = Math.min(16, R.w * 0.05);
    ctx.strokeStyle = rgba(n.color, hot ? 1 : 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [x, y, ax, ay] of [[R.x, R.y, 1, 1], [R.x + R.w, R.y, -1, 1], [R.x, R.y + R.h, 1, -1], [R.x + R.w, R.y + R.h, -1, -1]]) {
      ctx.moveTo(x + ax * t, y); ctx.lineTo(x, y); ctx.lineTo(x, y + ay * t);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  const LIVE_W = () => (W < 640 ? 300 : 600);
  function draw(dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    if (intro.on) return drawIntro(dt);
    grid();
    spokes(dt);
    for (const n of nodes) {
      const R = scr(n.r);
      n.R = R;
      n.vis = R.x < W && R.x + R.w > 0 && R.y < H && R.y + R.h > 0;
      if (!n.vis) continue;
      const liveTier = R.w >= LIVE_W();
      n.tier = liveTier ? "live" : "dots";
      const hot = hoverNode === n;
      n.dec = clamp(n.dec + (hot ? dt : -dt) / 0.3, 0, 1);
      if (hot) n.scr += dt; else n.scr = 0;
      if (liveTier) {
        n.fig.size(R.w, R.h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(R.x, R.y, R.w, R.h);
        ctx.clip();
        ctx.translate(R.x, R.y);
        n.fig.draw(ctx);
        ctx.restore();
      } else {
        snap(n, n.dec > 0 ? 60 : 220);
        if (n.dec < 1) matrix(n, R);
        if (n.dec > 0 && n.off) {
          ctx.globalAlpha = n.dec;
          ctx.drawImage(n.off, R.x, R.y, R.w, R.h);
          ctx.globalAlpha = 1;
        }
      }
      frameBox(n, R, hot);
      header(n, R, liveTier);
    }
    skillLinks();
    if (introReveal < 1) revealMask(dt);
    placeHits();
    mini.draw();
  }

  /* ------------------------------------------------------------------ opening
   * Your visit is the first request. A trace runs in from the left edge while fonts and data
   * load, the reply comes back with the real time it took, and the map opens around it.
   */
  let seen = false;
  try { seen = sessionStorage.getItem("af.seen") === "1"; } catch (e) {}
  const intro = { on: !calm && !seen, t: 0, ready: false, ms: 0 };
  let introReveal = intro.on ? 0 : 1, revealAt = [0, 0];
  function introTarget() {
    const n = byId.relay, R = scr(n.r);
    n.fig.size(R.w, R.h);
    const L = n.fig.lay();
    return [R.x + L.C[0], R.y + L.C[1]];
  }
  function drawIntro(dt) {
    intro.t += dt;
    const [tx, ty] = introTarget();
    const p = intro.ready ? clamp(intro.t / 0.75, 0, 1) : Math.min(0.85, intro.t / 0.9);
    const x = tx * p;
    ctx.strokeStyle = ink(0.35);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(x, ty); ctx.stroke();
    ctx.fillStyle = byId.relay.color;
    ctx.beginPath(); ctx.arc(x, ty, 3, 0, 7); ctx.fill();
    K.label(ctx, "GET /", 16, ty - 16, 11, ink(0.6), "left", 500, MONO);
    if (intro.ready && p >= 1) {
      K.label(ctx, "200 · " + intro.ms + " ms", 16, ty + 18, 11, byId.relay.color, "left", 500, MONO);
      if (intro.t > 0.95) { intro.on = false; revealAt = [tx, ty]; try { sessionStorage.setItem("af.seen", "1"); } catch (e) {} document.body.classList.add("ready"); }
    }
  }
  function revealMask(dt) {
    introReveal = Math.min(1, introReveal + dt / 0.6);
    const e = 1 - Math.pow(1 - introReveal, 3), r = e * Math.hypot(W, H);
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(revealAt[0], revealAt[1], Math.max(1, r), 0, 7);
    ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    if (introReveal < 1) {
      ctx.strokeStyle = rgba(byId.relay.color, 0.6 * (1 - introReveal));
      ctx.beginPath(); ctx.arc(revealAt[0], revealAt[1], r, 0, 7); ctx.stroke();
    }
  }
  function skipIntro() {
    if (!intro.on) return;
    intro.on = false;
    introReveal = 1;
    document.body.classList.add("ready");
    try { sessionStorage.setItem("af.seen", "1"); } catch (e) {}
  }
  const loaded = Promise.race([Promise.all([document.fonts ? document.fonts.ready : 0, new Promise((r) => (document.readyState === "complete" ? r() : addEventListener("load", r)))]), new Promise((r) => setTimeout(r, 1400))]);
  loaded.then(() => {
    intro.ready = true;
    intro.ms = Math.round(performance.now());
    intro.t = Math.min(intro.t, 0.3);
    status.set(navigator.onLine !== false);
  });
  if (!intro.on) document.body.classList.add("ready");

  /* ------------------------------------------------------------------ pointer and keys */
  const pts = new Map();
  let drag = null, pinch = null, moved = 0, downNode = null, consumed = false;
  function nodeAt(x, y) {
    for (const n of nodes) { const R = n.R; if (n.vis && R && x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h) return n; }
    return null;
  }
  function setHover(n) {
    if (hoverNode === n) return;
    if (hoverNode && hoverNode.tier === "live") hoverNode.fig.leave();
    hoverNode = n;
  }
  cv.addEventListener("pointerdown", (e) => {
    skipIntro();
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    moved = 0;
    consumed = false;
    flight = null;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: cam.z, c: [wx((a[0] + b[0]) / 2), wy((a[1] + b[1]) / 2)] };
      drag = null;
      return;
    }
    drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
    const n = nodeAt(e.clientX, e.clientY);
    downNode = n;
    if (n && n.tier === "live" && n.fig.down(e.clientX - n.R.x, e.clientY - n.R.y)) { consumed = true; drag = null; }
  });
  cv.addEventListener("pointermove", (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      cam.z = clamp(pinch.z * (d / pinch.d), fitZ() * 0.7, 2.2);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      cam.x = pinch.c[0] - (mx - W / 2) / cam.z;
      cam.y = pinch.c[1] - (my - midY()) / cam.z;
      clampCam();
      moved = 99;
      touched();
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      moved = Math.max(moved, Math.hypot(dx, dy));
      if (moved > 5) {
        cam.x = drag.cx - dx / cam.z;
        cam.y = drag.cy - dy / cam.z;
        clampCam();
        cv.style.cursor = "grabbing";
        touched();
        return;
      }
    }
    const n = nodeAt(e.clientX, e.clientY);
    setHover(n);
    let cur = n ? "pointer" : "grab";
    if (n && n.tier === "live") cur = n.fig.move(e.clientX - n.R.x, e.clientY - n.R.y) || (n.id === "hub" ? "grab" : "pointer");
    cv.style.cursor = cur;
  });
  const end = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!drag && !consumed) return;
    const wasDrag = moved > 5;
    drag = null;
    cv.style.cursor = "grab";
    if (wasDrag || consumed || e.type === "pointercancel") return;
    const n = nodeAt(e.clientX, e.clientY);
    if (!n || n !== downNode) return;
    if (n.id === "hub") return;
    if (n.id === "notes") { if (n.tier !== "live") flyTo(n); return; }
    location.hash = "#/" + n.id;
  };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
  cv.addEventListener("pointerleave", () => { setHover(null); });
  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    skipIntro();
    flight = null;
    // a mouse wheel zooms; a trackpad's two-finger scroll pans and its pinch zooms
    const pad = !e.ctrlKey && (Math.abs(e.deltaX) > 0.5 || (e.deltaMode === 0 && Math.abs(e.deltaY) < 50 && !Number.isInteger(e.deltaY)));
    if (pad) { cam.x += e.deltaX / cam.z; cam.y += e.deltaY / cam.z; }
    else {
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      const bx = wx(e.clientX), by = wy(e.clientY);
      cam.z = clamp(cam.z * k, fitZ() * 0.7, 2.2);
      cam.x = bx - (e.clientX - W / 2) / cam.z;
      cam.y = by - (e.clientY - midY()) / cam.z;
    }
    clampCam();
    touched();
  }, { passive: false });

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (intro.on) skipIntro();
    if (e.key === "Escape") { if (listOpen()) return closeList(); if (contactOpen()) return closeContact(); if (page) return (location.hash = "#/"); }
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if (page) {
      if (e.key === "ArrowRight" && !e.target.closest("input")) step(1);
      if (e.key === "ArrowLeft" && !e.target.closest("input")) step(-1);
      return;
    }
    const k = e.key.toLowerCase(), pan = 140 / cam.z;
    if (k === "l") { listOpen() ? closeList() : openList(); return; }
    if (listOpen()) return;
    if (e.key === "ArrowLeft") cam.x -= pan; else if (e.key === "ArrowRight") cam.x += pan;
    else if (e.key === "ArrowUp") cam.y -= pan; else if (e.key === "ArrowDown") cam.y += pan;
    else if (k === "+" || k === "=") fly({ x: cam.x, y: cam.y, z: cam.z * 1.4 }, 320);
    else if (k === "-" || k === "_") fly({ x: cam.x, y: cam.y, z: cam.z / 1.4 }, 320);
    else if (k === "0") flyAll();
    else return;
    e.preventDefault();
    clampCam();
    touched();
  });

  // the first time someone moves the map themselves, the nudge has done its job
  let nudged = false;
  function touched() {
    focusNode = null;
    if (!nudged && cam.z < focusZ(byId.relay) * 0.8) { nudged = true; $("#nudge").classList.add("gone"); }
  }

  /* ------------------------------------------------------------------ keyboard targets
   * Invisible links sit over each cell, so Tab walks the map and Enter opens a project. */
  const hits = $("#hits");
  for (const n of [...projects, byId.notes]) {
    const a = document.createElement("a");
    a.className = "hit";
    a.href = n.href || "#/" + n.id;
    a.innerHTML = `<span class="sr">${esc(n.name)}, ${esc(n.kind)}. ${esc(n.live ? n.live.line : "")}</span>`;
    a.addEventListener("focus", () => { if (!page) flyTo(n); });
    hits.appendChild(a);
    n.hit = a;
  }
  function placeHits() {
    for (const n of [...projects, byId.notes]) {
      const R = n.R;
      if (!R) continue;
      n.hit.style.transform = `translate(${R.x}px, ${R.y}px)`;
      n.hit.style.width = R.w + "px";
      n.hit.style.height = R.h + "px";
    }
  }

  /* ------------------------------------------------------------------ minimap */
  const mini = (() => {
    const c = $("#mini"), m = c.getContext("2d");
    let w = 0, h = 0, sc = 1;
    const api = {
      size() {
        w = c.clientWidth; h = c.clientHeight;
        c.width = w * DPR; c.height = h * DPR;
        sc = Math.min(w / (3 * CW), h / (3 * CH));
      },
      draw() {
        if (!w) return;
        m.setTransform(DPR, 0, 0, DPR, 0, 0);
        m.clearRect(0, 0, w, h);
        const ox = w / 2, oy = h / 2;
        for (const n of nodes) {
          const col = n.color === INK ? "#ecebe6" : n.color;
          m.fillStyle = rgba(col, hoverNode === n ? 0.5 : 0.14);
          m.fillRect(ox + n.r.x * sc, oy + n.r.y * sc, n.r.w * sc, n.r.h * sc);
          m.strokeStyle = rgba(col, 0.6);
          m.strokeRect(ox + n.r.x * sc + 0.5, oy + n.r.y * sc + 0.5, n.r.w * sc - 1, n.r.h * sc - 1);
        }
        const vx = wx(0), vy = wy(0), vw = W / cam.z, vh = H / cam.z;
        m.strokeStyle = "rgba(236,235,230,0.9)";
        m.lineWidth = 1;
        m.strokeRect(ox + vx * sc + 0.5, oy + vy * sc + 0.5, vw * sc, vh * sc);
      },
    };
    const go = (e) => {
      const b = c.getBoundingClientRect();
      cam.x = (e.clientX - b.left - w / 2) / sc;
      cam.y = (e.clientY - b.top - h / 2) / sc;
      flight = null;
      clampCam();
      touched();
    };
    let on = false;
    c.addEventListener("pointerdown", (e) => { on = true; c.setPointerCapture(e.pointerId); go(e); });
    c.addEventListener("pointermove", (e) => on && go(e));
    c.addEventListener("pointerup", () => (on = false));
    return api;
  })();

  $("#z-in").onclick = () => fly({ x: cam.x, y: cam.y, z: cam.z * 1.5 }, 360);
  $("#z-out").onclick = () => { fly({ x: cam.x, y: cam.y, z: cam.z / 1.5 }, 360); nudged = true; $("#nudge").classList.add("gone"); };
  $("#z-fit").onclick = () => { flyAll(); nudged = true; $("#nudge").classList.add("gone"); };
  $("#nudge").onclick = () => { flyAll(); nudged = true; $("#nudge").classList.add("gone"); };
  $("#brand").onclick = (e) => { e.preventDefault(); if (page) location.hash = "#/"; flyTo(byId.hub); };

  /* ------------------------------------------------------------------ the HUD trace
   * map · list · contact are stops on one line; a packet rides to whichever is active. */
  const trace = $("#trace");
  function traceTo(v) {
    trace.querySelectorAll("button").forEach((b) => b.setAttribute("aria-current", b.dataset.v === v ? "true" : "false"));
    const b = trace.querySelector(`[data-v="${v}"]`);
    if (b) trace.style.setProperty("--pk", b.offsetLeft + b.offsetWidth / 2 + "px");
  }
  trace.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const v = b.dataset.v;
    if (v === "map") { closeList(); closeContact(); if (page) location.hash = "#/"; else flyAll(); }
    if (v === "list") { closeContact(); listOpen() ? closeList() : openList(); }
    if (v === "contact") { closeList(); contactOpen() ? closeContact() : openContact(); }
  });

  /* ------------------------------------------------------------------ list (the plain way in) */
  const list = $("#list");
  function buildList() {
    const P = D.profile;
    $("#list-projects").innerHTML = projects.map((n) => `
      <li><a href="#/${n.id}" style="--c:${n.color}">
        <span class="li-name">${esc(n.name)}</span>
        <span class="li-kind">${esc(n.kind)}</span>
        <span class="li-q">${esc(n.p.question)}</span>
        <span class="li-tag"><b>${esc(n.live.tag[0])}</b> ${esc(n.live.tag[1])}</span>
      </a></li>`).join("");
    $("#list-path").innerHTML = D.path.map((s) => `<li><b>${esc(s.y)}</b> <span>${esc(s.r)}</span> <i>${esc(s.d)}</i></li>`).join("");
    $("#list-more").innerHTML = `<a href="/blog/">StudyLog · ${D.writing.total} notes</a><a href="mailto:${esc(P.email)}">${esc(P.email)}</a><a href="${esc(P.github)}" target="_blank" rel="noopener">GitHub ↗</a>`;
  }
  buildList();
  const listOpen = () => !list.hidden;
  let listFrom = null;
  function openList() { listFrom = document.activeElement; list.hidden = false; traceTo("list"); requestAnimationFrame(() => list.querySelector("a").focus()); }
  function closeList() { if (list.hidden) return; list.hidden = true; traceTo(page ? "" : "map"); listFrom && listFrom.focus && listFrom.focus(); }
  $("#list-x").onclick = closeList;
  list.addEventListener("click", (e) => { if (e.target.closest("a[href^='#/']")) list.hidden = true; });

  /* ------------------------------------------------------------------ contact */
  const contact = $("#contact");
  contact.querySelector(".c-mail").textContent = D.profile.email;
  contact.querySelector(".c-mail").href = "mailto:" + D.profile.email;
  contact.querySelector(".c-gh").href = D.profile.github;
  const contactOpen = () => !contact.hidden;
  function openContact() { contact.hidden = false; traceTo("contact"); contact.querySelector("a").focus(); }
  function closeContact() { if (contact.hidden) return; contact.hidden = true; traceTo(page ? "" : "map"); }
  $("#c-copy").onclick = async () => {
    try { await navigator.clipboard.writeText(D.profile.email); toast("Copied " + D.profile.email); } catch (e) { toast(D.profile.email); }
  };
  document.addEventListener("pointerdown", (e) => { if (!contact.hidden && !e.target.closest("#contact, #trace")) closeContact(); });

  /* ------------------------------------------------------------------ status, toast, offline */
  const status = {
    el: $("#status"),
    set(online) {
      this.el.classList.toggle("off", !online);
      this.el.querySelector("span").textContent = online ? `online · ${intro.ms || Math.round(performance.now())} ms` : "offline · from cache";
      this.el.title = online ? "How long this page took to load on your connection" : "No connection. The page is running from its cache.";
    },
  };
  let toastT = 0;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("on"), 4200);
  }
  addEventListener("offline", () => { status.set(false); byId.relay.fig.setOffline(true); toast("You're offline. The page keeps running from cache, and Relay just lost its deployments with your connection."); });
  addEventListener("online", () => { status.set(true); byId.relay.fig.setOffline(false); toast("Back online. Relay's deployments are back too."); });
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }

  /* ------------------------------------------------------------------ sound: off until asked */
  const Sound = {
    on: false, ac: null, out: null, last: 0, voice: null,
    init() {
      if (this.ac) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ac = new AC();
      this.out = this.ac.createGain();
      this.out.gain.value = 0.6;
      this.out.connect(this.ac.destination);
      return true;
    },
    set(on) {
      this.on = on && this.init();
      if (this.on) { this.ac.resume(); this.tick(660, 0.05, 0.08); setTimeout(() => this.tick(990, 0.05, 0.1), 90); }
      else this.hush();
    },
    tick(f, g = 0.04, d = 0.06, type = "sine", gap = 0.04) {
      if (!this.on) return;
      const t = this.ac.currentTime;
      if (t - this.last < gap) return;
      this.last = t;
      const o = this.ac.createOscillator(), v = this.ac.createGain();
      o.type = type;
      o.frequency.value = f;
      v.gain.setValueAtTime(0, t);
      v.gain.linearRampToValueAtTime(g, t + 0.004);
      v.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(v).connect(this.out);
      o.start(t);
      o.stop(t + d + 0.02);
    },
    thunk() {
      if (!this.on) return;
      const t = this.ac.currentTime, n = this.ac.createBufferSource(), b = this.ac.createBuffer(1, 4410, 44100), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      n.buffer = b;
      const f = this.ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 420;
      const v = this.ac.createGain();
      v.gain.value = 0.5;
      n.connect(f).connect(v).connect(this.out);
      n.start(t);
    },
    tone(freq) {
      if (!this.on) return;
      const t = this.ac.currentTime;
      if (!this.voice) {
        const g = this.ac.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.25);
        g.connect(this.out);
        const osc = [1, 0.62, 0.45, 0.33, 0.22, 0.18].map((a, k) => {
          const o = this.ac.createOscillator(), v = this.ac.createGain();
          v.gain.value = a / 2.8;
          o.frequency.value = freq * (k + 1);
          o.connect(v).connect(g);
          o.start(t);
          return o;
        });
        this.voice = { g, osc };
      }
      this.voice.osc.forEach((o, k) => o.frequency.setTargetAtTime(freq * (k + 1), t, 0.03));
    },
    hush() {
      if (!this.voice) return;
      const v = this.voice, t = this.ac.currentTime;
      v.g.gain.setTargetAtTime(0, t, 0.08);
      setTimeout(() => v.osc.forEach((o) => o.stop()), 600);
      this.voice = null;
    },
  };
  const sbtn = $("#sound");
  sbtn.onclick = () => {
    Sound.set(!Sound.on);
    sbtn.setAttribute("aria-pressed", String(Sound.on));
    sbtn.querySelector("span").textContent = Sound.on ? "sound on" : "sound off";
    if (Sound.on && page && page.id === "intonation") Sound.tone(page.fig.freq());
  };

  /* ------------------------------------------------------------------ events from the figures */
  let yearPick = null;
  function onFx(n, name, data) {
    if (name === "open") { if (ext(data)) open(data, "_blank", "noopener"); else location.href = data; return; }
    if (name === "slider") { if (page === n) syncSlider(); return; }
    if (name === "year") { yearPick = yearPick === data ? null : data; return; }
    // sounds only come from what you are looking at
    const audible = page ? page === n : n.tier === "live" && n.vis;
    if (!audible || !Sound.on) return;
    if (n.id === "relay") {
      if (name === "served") Sound.tick(620 + 90 * (data || 0), 0.018, 0.05, "sine", 0.06);
      else if (name === "failed") Sound.tick(170, 0.05, 0.14, "triangle", 0.02);
      else if (name === "trip") Sound.thunk();
      else if (name === "toggle") Sound.tick(data.up ? 880 : 300, 0.06, 0.09, "triangle", 0);
    } else if (n.id === "tracewise") {
      if (name === "alert") { Sound.tick(523, 0.05, 0.12, "triangle", 0); setTimeout(() => Sound.tick(392, 0.05, 0.16, "triangle", 0), 130); }
      if (name === "pick") Sound.tick(740, 0.04, 0.06, "sine", 0);
    } else if (n.id === "arena") {
      if (name === "flip") Sound.tick(1320, 0.015, 0.03, "sine", 0.03);
      if (name === "reject") Sound.tick(210, 0.04, 0.08, "square", 0.02);
      if (name === "triple") [784, 988, 1175].forEach((f, i) => setTimeout(() => Sound.tick(f, 0.04, 0.12, "sine", 0), i * 70));
    } else if (n.id === "layerline" && name === "layer") Sound.tick(330, 0.015, 0.05);
    else if (n.id === "intonation" && name === "pitch" && page === n) Sound.tone(data);
  }

  /* ------------------------------------------------------------------ project pages */
  let page = null;
  const pg = $("#page"), pcv = $("#pg-cv"), pctx = pcv.getContext("2d"), pfig = $("#pg-fig");
  let pw = 0, ph = 0, statT = 0;
  function sizePage() {
    const b = pfig.getBoundingClientRect();
    pw = Math.max(10, b.width);
    ph = Math.max(10, b.height);
    pcv.width = Math.round(pw * DPR);
    pcv.height = Math.round(ph * DPR);
  }
  new ResizeObserver(() => { if (page) sizePage(); }).observe(pfig);
  function drawPage() {
    pctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    pctx.fillStyle = BG;
    pctx.fillRect(0, 0, pw, ph);
    page.fig.size(pw, ph);
    page.fig.draw(pctx);
    if (now - statT > 250) { statT = now; stats(); }
  }
  function stats() {
    $("#pg-live").innerHTML = page.fig.stats().map(([v, l]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join("");
    syncSlider();
  }
  function syncSlider() {
    const s = page.fig.slider, inp = $("#pg-range");
    if (document.activeElement !== inp) inp.value = s.value;
    $("#pg-out").textContent = s.fmt(Number(s.value));
  }
  // on its page the visitor drives; figures that were demoing themselves stop and wait
  const HANDS_OFF = new Set(["tracewise", "onboard", "intonation", "atlas"]);
  function fillPage(n) {
    const p = n.p, s = n.fig.slider;
    if (HANDS_OFF.has(n.id)) n.fig.auto = false;
    pg.style.setProperty("--c", n.color);
    $("#pg-kind").textContent = `${p.kind} · ${p.year}`;
    $("#pg-name").textContent = p.name;
    $("#pg-q").textContent = p.question;
    $("#pg-line").textContent = n.live.line;
    $("#pg-proof").textContent = n.live.proof;
    $("#pg-crumb").textContent = n.id;
    const inp = $("#pg-range");
    inp.min = s.min; inp.max = s.max; inp.step = s.step; inp.value = s.value;
    $("#pg-label").textContent = s.label;
    syncSlider();
    const q = $("#pg-query");
    q.hidden = n.id !== "atlas";
    if (n.id === "atlas") {
      n.fig.external = true;
      n.fig.L = null;
      if (n.fig.q.length < 4) n.fig.query("make docker images smaller");
      q.value = n.fig.q;
    }
    const L = p.links, out = [];
    if (L.live) out.push(`<a class="btn" href="${esc(L.live)}">Open ${esc(p.name)} <span aria-hidden="true">↗</span></a>`);
    if (L.source) out.push(`<a class="btn ghost" href="${esc(L.source)}" target="_blank" rel="noopener">Source</a>`);
    if (L.original) out.push(`<a class="btn ghost" href="${esc(L.original)}">The 2023 original</a>`);
    $("#pg-links").innerHTML = out.join("");
    $("#pg-how").innerHTML = (p.how || []).map((h) => `<li>${esc(h)}</li>`).join("");
    const sh = links.filter((l) => l.a === n || l.b === n).map((l) => ({ o: l.a === n ? l.b : l.a, s: l.skills }));
    $("#pg-share").innerHTML = sh.length ? `<span>Shares</span>` + sh.map(({ o, s }) => `<a href="#/${o.id}" style="--c:${o.color}">${esc(s[0])} <i>with</i> ${esc(o.name)}</a>`).join("") : "";
    const i = ORDER.indexOf(n.id);
    $("#pg-prev").href = "#/" + ORDER[(i + ORDER.length - 1) % ORDER.length];
    $("#pg-next").href = "#/" + ORDER[(i + 1) % ORDER.length];
    $("#pg-count").textContent = `${i + 1} / ${ORDER.length}`;
    document.title = `${p.name} · Alan Fung`;
  }
  $("#pg-range").addEventListener("input", (e) => { page.fig.set(Number(e.target.value)); syncSlider(); });
  $("#pg-query").addEventListener("input", (e) => page && page.fig.query(e.target.value));
  pcv.addEventListener("pointermove", (e) => { if (!page) return; const b = pcv.getBoundingClientRect(); pcv.style.cursor = page.fig.move(e.clientX - b.left, e.clientY - b.top) || "default"; });
  pcv.addEventListener("pointerleave", () => page && page.fig.leave());
  pcv.addEventListener("pointerdown", (e) => { if (!page) return; const b = pcv.getBoundingClientRect(); if (page.fig.down(e.clientX - b.left, e.clientY - b.top)) { page.fig.auto = false; syncSlider(); } });

  function ghostAt(R, src, sxr) {
    const g = document.createElement("canvas");
    g.className = "vt-ghost";
    g.width = Math.max(1, Math.round(R.w * DPR));
    g.height = Math.max(1, Math.round(R.h * DPR));
    Object.assign(g.style, { left: R.x + "px", top: R.y + "px", width: R.w + "px", height: R.h + "px" });
    try { g.getContext("2d").drawImage(src, sxr.x * DPR, sxr.y * DPR, sxr.w * DPR, sxr.h * DPR, 0, 0, g.width, g.height); } catch (e) {}
    return g;
  }
  const canVT = () => !!document.startViewTransition && !calm;
  function showPage(n) {
    page = n;
    fillPage(n);
    pg.hidden = false;
    document.body.classList.add("paged");
    sizePage();
    drawPage();
    stats();
    traceTo("");
    if (n.id === "intonation" && Sound.on) Sound.tone(n.fig.freq());
  }
  function hidePage() {
    if (page && page.id === "atlas") { page.fig.external = false; page.fig.L = null; }
    Sound.hush();
    pg.hidden = true;
    document.body.classList.remove("paged");
    page = null;
    document.title = "Alan Fung · Forward Deployed Engineer";
    traceTo("map");
  }
  function openPage(n, how) {
    closeList();
    closeContact();
    if (page === n) return;
    const from = page;
    const R = !from && n.R && n.vis ? n.R : null;
    if (canVT() && how !== "instant") {
      let ghost = null;
      if (R) { draw(0); ghost = ghostAt(R, cv, R); ghost.style.viewTransitionName = "fig"; document.body.appendChild(ghost); }
      else if (from) pfig.style.viewTransitionName = "fig";
      const vt = document.startViewTransition(() => {
        if (ghost) ghost.remove();
        if (from) hidePage();
        showPage(n);
        pfig.style.viewTransitionName = "fig";
      });
      vt.finished.finally(() => (pfig.style.viewTransitionName = ""));
    } else {
      if (from) hidePage();
      showPage(n);
      if (R && !calm) {
        const b = pfig.getBoundingClientRect();
        pfig.animate([{ transform: `translate(${R.x - b.left}px, ${R.y - b.top}px) scale(${R.w / b.width}, ${R.h / b.height})`, opacity: 0.6 }, { transform: "none", opacity: 1 }], { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    }
    $("#pg-back").focus({ preventScroll: true });
  }
  function closePage() {
    if (!page) return;
    const n = page;
    Object.assign(cam, camFor(n));
    focusNode = n;
    clampCam();
    if (canVT()) {
      pfig.style.viewTransitionName = "fig";
      let ghost = null;
      const vt = document.startViewTransition(() => {
        pfig.style.viewTransitionName = "";
        hidePage();
        draw(0);
        const R = scr(n.r);
        ghost = ghostAt(R, cv, R);
        ghost.style.viewTransitionName = "fig";
        document.body.appendChild(ghost);
      });
      vt.finished.finally(() => ghost && ghost.remove());
    } else hidePage();
    if (n.hit) n.hit.focus({ preventScroll: true });
  }
  function step(d) {
    const i = ORDER.indexOf(page.id);
    location.hash = "#/" + ORDER[(i + d + ORDER.length) % ORDER.length];
  }
  $("#pg-back").onclick = () => (location.hash = "#/");

  /* ------------------------------------------------------------------ routing */
  function route(first) {
    const id = location.hash.replace(/^#\/?/, "");
    if (byId[id] && byId[id].p) { if (first) { Object.assign(cam, camFor(byId[id])); skipIntro(); } openPage(byId[id], first ? "instant" : ""); }
    else if (id === "list") { closePage(); openList(); }
    else closePage();
  }
  addEventListener("hashchange", () => route(false));

  /* ------------------------------------------------------------------ go */
  addEventListener("resize", resize);
  resize();
  traceTo("map");
  route(true);
  wake();
  window.__map = { cam, nodes, byId, fly, flyTo, flyAll, skipIntro, Sound, get page() { return page; } };
})();
