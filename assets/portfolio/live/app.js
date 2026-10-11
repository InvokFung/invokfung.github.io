/*
 * The home page is one map you travel by scrolling. Nine cells: my name and career in the middle,
 * a live project in each of the seven around it, and StudyLog. The words run down the left (below
 * the map on a phone) like any page, and the camera follows them, flying from cell to cell. The
 * cell you are reading about develops from a dot print into the running project and takes your
 * input. At the end the whole map folds into contact().
 */
(function () {
  "use strict";
  const D = window.PORTFOLIO, F = window.Figs, K = window.FigKit;
  const { clamp, rgba, ink, INK, MONO, SERIF } = K;
  const $ = (s, el = document) => el.querySelector(s);
  const BG = "#0a0b0d";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ext = (u) => /^https?:/.test(u);
  const smooth = (t) => t * t * (3 - 2 * t);

  const motionQ = matchMedia("(prefers-reduced-motion: reduce)");
  let calm = motionQ.matches;
  motionQ.addEventListener?.("change", (e) => (calm = e.matches));

  /* ------------------------------------------------------------------ the nodes */
  const PROJ = Object.fromEntries(D.projects.map((p) => [p.id, p]));
  const FIG = { relay: F.Relay, tracewise: F.Tracewise, onboard: F.Onboard, dispatch: F.Dispatch, atlas: F.Atlas, intonation: F.Studio, layerline: F.Layerline };
  // a ring around the hub in reading order, so every step down the page is a step to the next cell
  const CELL = { relay: [2, 1], tracewise: [2, 2], onboard: [1, 2], dispatch: [0, 2], atlas: [0, 1], intonation: [0, 0], layerline: [1, 0], notes: [2, 0], hub: [1, 1] };
  const ORDER = ["relay", "tracewise", "onboard", "dispatch", "atlas", "intonation", "layerline"];
  const grew = Object.fromEntries((D.eras.find((e) => e.id === "now").grew || []).map(([y, from, id]) => [id, [y, from]]));
  grew.notes = ["2022", "Writing it all down"];

  const nodes = [];
  const byId = {};
  for (const [id, cell] of Object.entries(CELL)) {
    const n = { id, cell, p: PROJ[id] || null, live: D.live[id] || null, dec: 0, dev: 1, alpha: 1, scr: 0, snapAt: -1e9 };
    const fx = (name, data) => onFx(n, name, data);
    if (id === "hub") { n.color = INK; n.fig = new F.Hub({ color: INK, profile: D.profile, path: D.path, fx }); n.name = D.profile.name; }
    else if (id === "notes") { const s = PROJ.studylog; n.color = s.color; n.fig = new F.Notes({ color: s.color, fx }); n.name = "StudyLog"; n.kind = "Notes"; n.year = "since " + s.year; }
    else { n.color = n.p.color; n.fig = new FIG[id]({ color: n.p.color, fx }); n.name = n.p.name; n.kind = n.p.kind; n.year = String(n.p.year); }
    nodes.push(n);
    byId[id] = n;
  }
  byId.atlas.fig.external = true; // its query box lives in the text
  const ring = ORDER.map((id) => byId[id]).concat(byId.notes);

  // links between projects: the distinctive skills two of them share
  const COMMON = new Set(["TypeScript", "React", "Vite", "JavaScript"]);
  const skillsOf = (p) => new Set([...(p.stack || []), ...(p.uses || [])].filter((s) => !COMMON.has(s)));
  const links = [];
  for (let i = 0; i < ORDER.length; i++) for (let j = i + 1; j < ORDER.length; j++) {
    const a = skillsOf(PROJ[ORDER[i]]), b = skillsOf(PROJ[ORDER[j]]);
    const sh = [...a].filter((s) => b.has(s));
    if (sh.length) links.push({ a: byId[ORDER[i]], b: byId[ORDER[j]], skills: sh });
  }

  /* ------------------------------------------------------------------ the stops, in page order */
  const STOPS = [
    { id: "start" },
    ...ORDER.map((id) => ({ id, n: byId[id] })),
    { id: "notes", n: byId.notes },
    { id: "about", n: byId.hub },
    { id: "contact" },
  ];
  const LAST = STOPS.length - 1, ABOUT = LAST - 1;
  const stopOf = (n) => STOPS.findIndex((s) => s.n === n);
  let cur = 0;

  /* ------------------------------------------------------------------ canvas, viewport, camera */
  const cv = $("#map"), ctx = cv.getContext("2d");
  const root = document.documentElement.style;
  let W = 0, H = 0, VH = 0, DPR = 1, tall = false, stacked = false, TOP = 76, VB = 0;
  let CW = 1200, CH = 800, NW = 1000, NH = 640;
  const VR = { x: 0, y: 0, w: 1, h: 1 };
  const cam = { x: 0, y: 0, z: 1 };

  function layout() {
    TOP = W < 640 ? 60 : 76;
    stacked = W < 960 || VH > W;
    if (stacked) {
      VR.x = 8; VR.y = TOP; VR.w = W - 16; VR.h = Math.round((VH - TOP) * (W < 640 ? 0.5 : 0.56));
      VB = VR.y + VR.h + 10;
    } else {
      const pw = Math.round(clamp(W * 0.34, 380, 500));
      root.setProperty("--pw", pw + "px");
      VR.x = pw + 8; VR.y = TOP; VR.w = W - VR.x - 40; VR.h = VH - TOP - 32;
      VB = 0;
    }
    H = stacked ? VB : VH;
    root.setProperty("--top", TOP + "px");
    root.setProperty("--vh", VH + "px");
    root.setProperty("--vb", VB + "px");
    document.body.classList.toggle("stacked", stacked);
    tall = VR.h > VR.w * 0.9;
    if (tall) { CW = 760; CH = 1010; NW = 640; NH = 820; } else { CW = 1200; CH = 800; NW = 1000; NH = 640; }
    for (const n of nodes) {
      const [c, r] = n.cell;
      const cx = (c - 1) * CW, cy = (r - 1) * CH;
      n.r = { x: cx - NW / 2, y: cy - NH / 2, w: NW, h: NH };
      n.c = [cx, cy];
    }
  }
  const zFocus = () => Math.min(VR.w / NW, VR.h / NH) * 0.98;
  const zAll = () => Math.min(VR.w / (2 * CW + NW), VR.h / (2 * CH + NH + 70)) * 0.96;
  const camAt = (i) => { const n = STOPS[i].n; return n ? { x: n.c[0], y: n.c[1], z: zFocus() } : { x: 0, y: -12 / zAll(), z: zAll() }; };
  const vcx = () => VR.x + VR.w / 2, vcy = () => VR.y + VR.h / 2;
  const sx = (x) => (x - cam.x) * cam.z + vcx();
  const sy = (y) => (y - cam.y) * cam.z + vcy();
  const scr = (r) => ({ x: sx(r.x), y: sy(r.y), w: r.w * cam.z, h: r.h * cam.z });

  // van Wijk and Nuij: zoom out a little on the way between two cells so you never lose your place
  function zoomPath(p0, p1) {
    const rho = Math.SQRT2, r2 = 2, r4 = 4;
    const [ux0, uy0, w0] = p0, [ux1, uy1, w1] = p1, dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy;
    if (d2 < 1e-9) {
      const S = Math.log(w1 / w0) / rho;
      return (t) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)];
    }
    const d1 = Math.sqrt(d2), b0 = (w1 * w1 - w0 * w0 + r4 * d2) / (2 * w0 * r2 * d1), b1 = (w1 * w1 - w0 * w0 - r4 * d2) / (2 * w1 * r2 * d1);
    const q0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), q1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1), S = (q1 - q0) / rho;
    return (t) => { const s = t * S, c0 = Math.cosh(q0), u = (w0 / (r2 * d1)) * (c0 * Math.tanh(rho * s + q0) - Math.sinh(q0)); return [ux0 + u * dx, uy0 + u * dy, (w0 * c0) / Math.cosh(rho * s + q0)]; };
  }
  let segs = [];
  function buildSegs() {
    segs = [];
    for (let i = 0; i < LAST; i++) {
      const a = camAt(i), b = camAt(i + 1);
      segs.push(zoomPath([a.x, a.y, VR.w / a.z], [b.x, b.y, VR.w / b.z]));
    }
  }
  function placeCam(s) {
    const i = clamp(Math.floor(s), 0, LAST), f = s - i;
    if (i >= LAST || f < 1e-4) return Object.assign(cam, camAt(i));
    const [x, y, w] = segs[i](f);
    cam.x = x; cam.y = y; cam.z = VR.w / w;
  }

  /* ------------------------------------------------------------------ the words: one section per stop */
  const P = D.profile;
  const flow = $("#flow");
  const linkBtns = (p) => {
    const L = p.links, out = [];
    if (L.live) out.push(`<a class="btn" href="${esc(L.live)}">Open ${esc(p.name)} <span aria-hidden="true">↗</span></a>`);
    if (L.source) out.push(`<a class="btn ghost" href="${esc(L.source)}" target="_blank" rel="noopener">Source</a>`);
    return out.join("");
  };
  const tryLine = (t) => `<p class="pn-try"><i aria-hidden="true"></i><span>${esc(t)}</span></p>`;
  const ctl = (id, s) => (s ? `<div class="pn-ctl"><label for="rg-${id}">${esc(s.label)}</label><output id="out-${id}" for="rg-${id}"></output><input type="range" id="rg-${id}" data-id="${id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}" /></div>` : "");
  const [tagA, tagB] = (() => { const m = P.tagline.match(/^(.*?)<em>(.*?)<\/em>/); return m ? [m[1], m[2]] : [P.tagline, ""]; })();

  function startHTML() {
    return `
      <p class="pn-kind pn-role"><i class="dot" aria-hidden="true"></i>${esc(P.role)}</p>
      <h2 class="pn-hello" data-decode>${esc(P.name)}</h2>
      <p class="pn-tag">${esc(tagA)}<em>${esc(tagB)}</em></p>
      <p class="pn-lede">${esc(D.home.lede)}</p>
      <p class="pn-contact"><a href="mailto:${esc(P.email)}">${esc(P.email)}</a><a href="${esc(P.github)}" target="_blank" rel="noopener">GitHub</a><a href="/blog/">StudyLog</a></p>
      <span class="cue" aria-hidden="true"><i></i></span>`;
  }
  function projectHTML(n) {
    const p = n.p;
    return `
      <p class="pn-kind"><b>${esc(p.kind)}</b> · ${p.year}</p>
      <h2 class="pn-name" data-decode>${esc(p.name)}</h2>
      <p class="pn-q">${esc(p.question)}</p>
      ${tryLine(n.live.line)}
      ${n.id === "atlas" ? `<input class="pn-query" id="pn-query" type="search" placeholder="Ask my notes something" aria-label="Search my notes" value="${esc(n.fig.q)}" />` : ""}
      ${ctl(n.id, n.fig.slider)}
      <dl class="pn-live" id="live-${n.id}"></dl>
      <p class="pn-proof">${esc(n.live.proof)}</p>
      <div class="pn-links">${linkBtns(p)}</div>`;
  }
  function notesHTML(n) {
    const s = PROJ.studylog;
    return `
      <p class="pn-kind"><b>Notes</b> · since ${s.year}</p>
      <h2 class="pn-name" data-decode>StudyLog</h2>
      <p class="pn-q">Where every deep dive ends up.</p>
      ${tryLine(n.live.line)}
      <dl class="pn-live" id="live-notes"></dl>
      <div class="pn-links">${linkBtns(s)}</div>`;
  }
  function aboutHTML() {
    const first = D.path[0], lastStep = D.path[D.path.length - 1];
    return `
      <p class="pn-kind"><b>Path</b> · ${esc(first.y)} to ${esc(lastStep.y)}</p>
      <h2 class="pn-name pn-name-s">${D.sections.path}</h2>
      ${tryLine("Click a year on the route to see what it added.")}
      <p class="pn-lede">${esc(P.education)}, then a new title every year since 2023, each one closer to the people using the software.</p>`;
  }
  function contactHTML() {
    return `
      <p class="pn-kind"><b>contact()</b></p>
      <h2 class="pn-name" data-decode>Say hello.</h2>
      <p class="pn-lede">${esc(D.home.contact)}</p>
      <a class="pn-mail" href="mailto:${esc(P.email)}">${esc(P.email)}</a>
      <div class="pn-links"><button type="button" class="btn" id="pn-copy">Copy email</button><a class="btn ghost" href="${esc(P.github)}" target="_blank" rel="noopener">GitHub ↗</a><a class="btn ghost" href="/blog/">StudyLog</a></div>
      <p class="pn-foot">© ${new Date().getFullYear()} ${esc(P.name)}. Every cell on this page is running in your browser.</p>`;
  }
  flow.innerHTML = STOPS.map((s) => {
    const n = s.n;
    const html = s.id === "start" ? startHTML() : s.id === "about" ? aboutHTML() : s.id === "notes" ? notesHTML(n) : s.id === "contact" ? contactHTML() : projectHTML(n);
    const c = n && n.color !== INK ? n.color : "#ecebe6";
    return `<section class="sec sec-${s.id}" id="s-${s.id}" data-stop="${s.id}" style="--c:${c}"><div class="pn-in">${html}</div></section>`;
  }).join("");
  const secs = [...flow.querySelectorAll(".sec")];
  flow.addEventListener("input", (e) => {
    const r = e.target.closest("input[type=range]");
    if (r) { byId[r.dataset.id].fig.set(Number(r.value)); syncSlider(byId[r.dataset.id]); return; }
    if (e.target.id === "pn-query") byId.atlas.fig.query(e.target.value);
  });
  $("#pn-copy").onclick = copyEmail;
  // each section's words rise in the first time it comes into view
  const seenIO = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("seen"); seenIO.unobserve(e.target); } }), { threshold: 0.18 });
  secs.forEach((s) => seenIO.observe(s));

  /* ------------------------------------------------------------------ scroll drives the camera
   * Each section has a resting band of scroll positions where the camera sits on its cell and the
   * cell runs live. Between two bands the camera flies, so the scrollbar is the flight. */
  let bands = [], spT = 0, sp = 0, resting = true;
  function measure() {
    const top = stacked ? VB : 0, readH = VH - top;
    const max = Math.max(0, document.documentElement.scrollHeight - VH);
    bands = secs.map((el) => {
      const r = el.getBoundingClientRect(), y0 = r.top + scrollY, h = r.height;
      const c = y0 + h / 2 - (top + readH / 2);
      const d = Math.max(0, (h - readH) / 2) + readH * 0.14;
      return [clamp(c - d, 0, max), clamp(c + d, 0, max)];
    });
    bands[0][0] = 0;
    bands[LAST][1] = max;
    spT = progressAt(scrollY);
  }
  function progressAt(y) {
    for (let i = 0; i < bands.length; i++) {
      const [a, b] = bands[i];
      if (y > b) continue;
      if (y >= a || i === 0) return i;
      const pb = bands[i - 1][1];
      return i - 1 + smooth(clamp((y - pb) / Math.max(1, a - pb), 0, 1));
    }
    return LAST;
  }
  const centerOf = (i) => (bands[i] ? (bands[i][0] + bands[i][1]) / 2 : 0);
  // stop scrolling between two sections and the page glides on to the nearer one
  let settleT = 0;
  function settle() {
    if (calm) return;
    const y = scrollY;
    for (let i = 0; i < LAST; i++) {
      const a = bands[i][1], b = bands[i + 1][0];
      if (y > a + 2 && y < b - 2) return scrollTo({ top: y - a < b - y ? a : b, behavior: "smooth" });
    }
  }
  addEventListener("scroll", () => {
    spT = progressAt(scrollY);
    clearTimeout(settleT);
    settleT = setTimeout(settle, 220);
    wake();
  }, { passive: true });

  function setCur(i) {
    if (i === cur) return;
    const prev = STOPS[cur].n;
    cur = i;
    const n = STOPS[i].n;
    if (n) n.dev = 0;
    if (prev && prev !== n) prev.fig.leave();
    const hub = byId.hub.fig, ro = i === ABOUT;
    if (hub.routeOnly !== ro) { hub.routeOnly = ro; hub.L = null; }
    document.body.classList.toggle("at-start", i === 0);
    secs.forEach((s, k) => s.classList.toggle("on", k === i));
    decode(secs[i]);
    panelStats();
    Sound.hush();
    document.title = n && n.p ? `${n.p.name} · Alan Fung` : i === LAST ? "Contact · Alan Fung" : "Alan Fung · Forward Deployed Engineer";
    const h = i ? "#/" + STOPS[i].id : location.pathname + location.search;
    if ((location.hash || location.pathname + location.search) !== h) history.replaceState(null, "", h);
  }
  const focus = () => (resting ? STOPS[cur].n || null : null);

  /* ------------------------------------------------------------------ the loop */
  let raf = 0, last = performance.now(), now = 0, hoverNode = null, statT = 0;
  function wake() { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; Sound.hush(); } else wake(); });

  function frame(t) {
    raf = 0;
    now = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    // the camera eases after the scroll position; a long jump only animates its last leg
    if (calm) sp = spT;
    else {
      if (Math.abs(spT - sp) > 1.2) sp = spT - Math.sign(spT - sp) * 1.0;
      sp += (spT - sp) * (1 - Math.exp(-dt * 10));
      if (Math.abs(spT - sp) < 0.0008) sp = spT;
    }
    setCur(clamp(Math.round(spT), 0, LAST));
    resting = Math.abs(sp - cur) < 0.004;
    placeCam(sp);
    thread.style.setProperty("--p", (sp / LAST).toFixed(4));
    const speed = calm ? 0.5 : 1, f = focus();
    for (const n of nodes) if (n.vis || n === f) n.fig.step(dt * speed);
    draw(dt);
    if (now - statT > 250) { statT = now; panelStats(); }
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
  function spokes(dt, spokeA) {
    if (spokeA < 0.02) return;
    const hub = byId.hub;
    ctx.lineWidth = 1;
    for (const sp of spokePk) {
      const n = sp.n;
      const a = edgePoint(hub.r, hub.c, n.c), b = edgePoint(n.r, n.c, hub.c);
      const A = [sx(a[0]), sy(a[1])], B = [sx(b[0]), sy(b[1])];
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const hot = hoverNode === n || (yearPick && grew[n.id] && grew[n.id][0] === yearPick);
      ctx.globalAlpha = spokeA;
      ctx.strokeStyle = hot ? rgba(n.color, 0.6) : ink(0.1);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      ctx.fillStyle = hot ? n.color : ink(0.3);
      ctx.fillRect(A[0] - 2, A[1] - 2, 4, 4);
      ctx.fillRect(B[0] - 2, B[1] - 2, 4, 4);
      if (!calm) {
        sp.acc -= dt * (hot ? 4 : 0.55);
        if (sp.acc <= 0) { sp.acc = 1 + Math.random(); sp.pk.push(0); }
        sp.pk = sp.pk.map((u) => u + (dt * 380) / Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]))).filter((u) => u < 1);
        ctx.fillStyle = n.color;
        const base = ctx.globalAlpha;
        for (const u of sp.pk) {
          for (let k = 3; k >= 0; k--) {
            const v = Math.max(0, u - k * 0.012);
            ctx.globalAlpha = base * (k ? 0.14 * (4 - k) : 1);
            ctx.beginPath();
            ctx.arc(A[0] + (B[0] - A[0]) * v, A[1] + (B[1] - A[1]) * v, k ? 1.6 : 2.4, 0, 7);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
      const g = grew[n.id];
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
      // labels only inside the viewport, so they never sit behind the words
      const clear = clamp(Math.min(my - VR.y - 20, VR.y + VR.h - 20 - my, mx - VR.x - 20, VR.x + VR.w - 20 - mx) / 40, 0, 1);
      if (g && len > 150 && clear > 0) {
        ctx.save();
        ctx.globalAlpha = clear * spokeA;
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
    if (!n || !n.p || cur !== 0 || !resting) return;
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
    const rw = tall ? 300 : 480, rh = tall ? 384 : 307;
    if (!n.off) { n.off = document.createElement("canvas"); n.octx = n.off.getContext("2d"); }
    if (n.off.width !== rw || n.off.height !== rh) { n.off.width = rw; n.off.height = rh; }
    const c = n.octx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = BG;
    c.fillRect(0, 0, rw, rh);
    n.fig.size(rw, rh);
    n.fig.draw(c);
    const cols = tall ? 50 : 80, rows = tall ? 64 : 51;
    sampler.width = cols;
    sampler.height = rows;
    sctx.drawImage(n.off, 0, 0, cols, rows);
    const px = sctx.getImageData(0, 0, cols, rows).data, lum = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) lum[i] = Math.pow(Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) / 255, 0.55);
    n.dots = { cols, rows, lum };
  }
  function matrix(n, R, a) {
    const d = n.dots;
    if (!d || a <= 0) return;
    const cw = R.w / d.cols, ch = R.h / d.rows, m = Math.min(cw, ch);
    // every cell has a dot, like an unlit LED panel; the figure lights some of them
    for (const [lo, hi, k, al] of [[0, 0.2, 0.22, 0.13], [0.2, 0.42, 0.36, 0.55], [0.42, 0.7, 0.56, 0.85], [0.7, 2, 0.78, 1]]) {
      ctx.globalAlpha = a * al;
      ctx.fillStyle = n.color === INK ? "#ecebe6" : n.color;
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

  // the name above a cell; the cell you are reading about is named in the words instead
  function header(n, R) {
    if (n.id === "hub") return;
    const npx = clamp(cam.z * 30, 12, 26);
    const ny = R.y - (R.h > 200 ? 14 : 9);
    const name = n.scr > 0 && n.scr < 0.45 ? scramble(n.name, n.scr) : n.name;
    K.label(ctx, name, R.x, ny, npx, INK, "left", 400, SERIF);
    if (n.live && R.w > 230 && cur === 0) {
      K.label(ctx, n.live.tag[1], R.x + R.w, ny, 10, ink(0.45), "right", 400, MONO);
      K.font(ctx, 10, 400, MONO);
      K.label(ctx, n.live.tag[0], R.x + R.w - ctx.measureText(n.live.tag[1]).width - 8, ny, 12, n.color, "right", 600, MONO);
    }
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

  // the finale: the cells fold into a ring around contact()
  const ringAt = (j, fold) => {
    const rr = Math.min(VR.w, VR.h) * (stacked ? 0.36 : 0.32), a = -Math.PI / 2 + (j * Math.PI * 2) / ring.length + now / 9000;
    return [vcx() + Math.cos(a) * rr, vcy() + Math.sin(a) * rr * (stacked ? 0.92 : 1)];
  };
  function foldRect(n, R, fold) {
    const j = ring.indexOf(n);
    if (j < 0 || fold <= 0) return R;
    const [tx, ty] = ringAt(j, fold), e = smooth(fold), s = 1 + (Math.min(16 / R.w, 1) - 1) * e;
    const cx = R.x + R.w / 2 + (tx - R.x - R.w / 2) * e, cy = R.y + R.h / 2 + (ty - R.y - R.h / 2) * e;
    return { x: cx - (R.w * s) / 2, y: cy - (R.h * s) / 2, w: R.w * s, h: R.h * s };
  }
  function finale(fold) {
    const k = smooth(clamp((fold - 0.55) / 0.45, 0, 1));
    if (k <= 0) return;
    const cx = vcx(), cy = vcy(), big = clamp(Math.min(VR.w, VR.h) * 0.1, 30, 78);
    K.font(ctx, big, 500, MONO);
    const hw = ctx.measureText("contact()").width / 2 + big * 0.4, hh = big * 1.1;
    // packets run in from every project to the middle
    ring.forEach((n, j) => {
      const [x, y] = ringAt(j, 1);
      ctx.globalAlpha = k * 0.35;
      ctx.strokeStyle = rgba(n.color, 0.5);
      // they stop short of the words in the middle
      const dx = x - cx, dy = y - cy, f = clamp(Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6)), 0.3, 0.86);
      const ex = cx + dx * f, ey = cy + dy * f;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
      if (!calm) for (let q = 0; q < 2; q++) {
        const u = ((now / 1600 + j / ring.length + q / 2) % 1);
        ctx.globalAlpha = k * Math.sin(u * Math.PI);
        ctx.fillStyle = n.color;
        ctx.beginPath(); ctx.arc(x + (ex - x) * u, y + (ey - y) * u, 2.4, 0, 7); ctx.fill();
      }
    });
    ctx.globalAlpha = k;
    K.label(ctx, "contact()", cx, cy - big * 0.15, big, INK, "center", 500, MONO);
    K.font(ctx, big, 500, MONO);
    const tw = ctx.measureText("contact()").width;
    if (calm || Math.floor(now / 530) % 2) { ctx.fillStyle = byId.relay.color; ctx.fillRect(cx + tw / 2 + big * 0.12, cy - big * 0.62, big * 0.09, big * 0.9); }
    K.label(ctx, P.email, cx, cy + big * 0.72, big * 0.36, ink(0.62), "center", 400, SERIF);
    ctx.globalAlpha = 1;
  }
  const finaleHit = (x, y) => fold() > 0.95 && Math.hypot(x - vcx(), y - vcy()) < Math.min(VR.w, VR.h) * 0.22;
  const fold = () => clamp(sp - ABOUT, 0, 1);

  function draw(dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    if (intro.on) return drawIntro(dt);
    grid();
    const f = focus(), fo = fold(), overview = clamp(1 - sp, 0, 1);
    spokes(dt, overview);
    for (const n of nodes) {
      let R = scr(n.r);
      if (fo > 0) R = foldRect(n, R, fo);
      n.R = R;
      // one thing to look at: the cell you are reading about; the rest sink back
      const k = stopOf(n), near = clamp(1 - Math.abs(sp - k), 0, 1);
      n.alpha = Math.max(overview, 0.14 + 0.86 * near) * (n.id === "hub" ? 1 - smooth(fo) : 1);
      if (fo > 0 && n.id !== "hub") n.alpha = Math.max(n.alpha, smooth(fo));
      n.vis = R.x < W && R.x + R.w > 0 && R.y < H && R.y + R.h > 0;
      if (!n.vis || n.alpha < 0.01) continue;
      const live = n === f;
      n.tier = live ? "live" : "dots";
      const hot = hoverNode === n && !live;
      n.dec = clamp(n.dec + (hot ? dt : -dt) / 0.3, 0, 1);
      if (hot) n.scr += dt; else n.scr = 0;
      const a = n.alpha;
      if (R.w < 40) {
        // folded down to a dot
        ctx.globalAlpha = a;
        ctx.fillStyle = n.color;
        ctx.shadowColor = n.color;
        ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(R.x + R.w / 2, R.y + R.h / 2, Math.max(3, R.w / 2.6), 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        continue;
      }
      if (live) {
        // the cell develops from its dot print into the running figure
        n.dev = calm ? 1 : Math.min(1, n.dev + dt / 0.5);
        const e = 1 - Math.pow(1 - n.dev, 2);
        n.fig.size(R.w, R.h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(R.x, R.y, R.w, R.h);
        ctx.clip();
        ctx.translate(R.x, R.y);
        ctx.globalAlpha = e;
        n.fig.draw(ctx);
        ctx.restore();
        ctx.globalAlpha = 1;
        if (n.dev < 1) matrix(n, R, 1 - e);
      } else {
        snap(n, n.dec > 0 ? 60 : 220);
        if (n.dec < 1) matrix(n, R, a * (1 - n.dec));
        if (n.dec > 0 && n.off) {
          ctx.globalAlpha = a * n.dec;
          ctx.drawImage(n.off, R.x, R.y, R.w, R.h);
          ctx.globalAlpha = 1;
        }
      }
      ctx.globalAlpha = a * (1 - fo);
      frameBox(n, R, hot || live);
      if (!live) header(n, R);
      ctx.globalAlpha = 1;
    }
    skillLinks();
    finale(fo);
    if (introReveal < 1) revealMask(dt);
  }

  /* ------------------------------------------------------------------ opening
   * Your visit is the first request. A trace runs in from the left edge while fonts and data
   * load, the reply comes back with the real time it took, and the map opens around it.
   */
  let seen = false;
  try { seen = sessionStorage.getItem("af.seen") === "1"; } catch (e) {}
  const intro = { on: !calm && !seen, t: 0, ready: false, ms: 0 };
  let introReveal = intro.on ? 0 : 1, revealAt = [0, 0];
  function drawIntro(dt) {
    intro.t += dt;
    const tx = vcx(), ty = vcy();
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
    measure();
  });
  if (!intro.on) document.body.classList.add("ready");
  for (const ev of ["wheel", "touchstart", "keydown"]) addEventListener(ev, skipIntro, { passive: true });

  /* ------------------------------------------------------------------ pointer */
  function nodeAt(x, y) {
    for (const n of nodes) { const R = n.R; if (n.vis && n.alpha > 0.1 && R && x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h) return n; }
    return null;
  }
  function setHover(n) {
    if (hoverNode === n) return;
    if (hoverNode && hoverNode.tier === "live") hoverNode.fig.leave();
    hoverNode = n;
  }
  const scrollToStop = (i) => scrollTo({ top: centerOf(i), behavior: calm ? "auto" : "smooth" });
  let press = null;
  cv.addEventListener("pointerdown", (e) => {
    skipIntro();
    const n = fold() > 0.5 ? null : nodeAt(e.clientX, e.clientY);
    press = { x: e.clientX, y: e.clientY, n, used: false };
    if (n && n.tier === "live" && n.fig.down(e.clientX - n.R.x, e.clientY - n.R.y)) { press.used = true; n.fig.auto = false; syncSlider(n); }
  });
  cv.addEventListener("pointermove", (e) => {
    if (fold() > 0.5) { setHover(null); cv.style.cursor = finaleHit(e.clientX, e.clientY) ? "pointer" : "default"; return; }
    const n = nodeAt(e.clientX, e.clientY);
    setHover(n);
    let c = "default";
    if (n && n.tier === "live") c = n.fig.move(e.clientX - n.R.x, e.clientY - n.R.y) || "default";
    else if (n) c = "pointer";
    cv.style.cursor = c;
  });
  cv.addEventListener("pointerup", (e) => {
    const p = press;
    press = null;
    if (!p || p.used || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) return;
    if (finaleHit(e.clientX, e.clientY)) { location.href = "mailto:" + P.email; return; }
    const n = nodeAt(e.clientX, e.clientY);
    // a cell you can see but aren't reading about: scroll the page to it
    if (n && n === p.n && n !== focus()) scrollToStop(stopOf(n));
  });
  cv.addEventListener("pointercancel", () => (press = null));
  cv.addEventListener("pointerleave", () => setHover(null));

  /* ------------------------------------------------------------------ the words beside the cell */
  function panelStats() {
    const n = STOPS[cur].n, el = n && $("#live-" + n.id);
    if (!el) return;
    el.innerHTML = n.fig.stats().map(([v, l]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join("");
    syncSlider(n);
    const q = $("#pn-query");
    if (n.id === "atlas" && q && document.activeElement !== q && q.value !== n.fig.q) q.value = n.fig.q;
  }
  function syncSlider(n) {
    const inp = n && $("#rg-" + n.id);
    if (!inp || !n.fig.slider) return;
    const s = n.fig.slider;
    if (document.activeElement !== inp) inp.value = s.value;
    $("#out-" + n.id).textContent = s.fmt(Number(s.value));
  }
  // a title decodes in, the same way a cell's name does when you point at it
  let decodeRaf = 0;
  function decode(sec) {
    const el = sec && sec.querySelector("[data-decode]");
    cancelAnimationFrame(decodeRaf);
    if (!el || calm) return;
    const word = el.dataset.word || (el.dataset.word = el.textContent), t0 = performance.now();
    const tick = (t) => {
      const k = (t - t0) / 1000;
      el.textContent = k >= 0.45 ? word : scramble(word, k);
      if (k < 0.45) decodeRaf = requestAnimationFrame(tick);
    };
    decodeRaf = requestAnimationFrame(tick);
  }

  // the thread: a line with a stop per section and a packet riding to where you are
  const thread = $("#thread");
  thread.innerHTML = STOPS.map((s, i) => `<b style="--k:${i / LAST};--c:${s.n && s.n.color !== INK ? s.n.color : "#ecebe6"}"></b>`).join("") + `<i class="pk"></i>`;

  $("#brand").onclick = (e) => { e.preventDefault(); scrollToStop(0); };

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
  async function copyEmail() {
    try { await navigator.clipboard.writeText(P.email); toast("Copied " + P.email); } catch (e) { toast(P.email); }
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
    const n = focus();
    if (Sound.on && n && n.id === "intonation") Sound.tone(n.fig.freq());
  };

  /* ------------------------------------------------------------------ events from the figures */
  let yearPick = null;
  function onFx(n, name, data) {
    if (name === "open") { if (ext(data)) open(data, "_blank", "noopener"); else location.href = data; return; }
    if (name === "slider") { if (STOPS[cur].n === n) syncSlider(n); return; }
    if (name === "year") { yearPick = yearPick === data ? null : data; return; }
    // sounds only come from the cell you are reading about
    if (focus() !== n || !Sound.on) return;
    if (n.id === "relay") {
      if (name === "served") Sound.tick(620 + 90 * (data || 0), 0.018, 0.05, "sine", 0.06);
      else if (name === "failed") Sound.tick(170, 0.05, 0.14, "triangle", 0.02);
      else if (name === "trip") Sound.thunk();
      else if (name === "toggle") Sound.tick(data.up ? 880 : 300, 0.06, 0.09, "triangle", 0);
    } else if (n.id === "tracewise") {
      if (name === "alert") { Sound.tick(523, 0.05, 0.12, "triangle", 0); setTimeout(() => Sound.tick(392, 0.05, 0.16, "triangle", 0), 130); }
      if (name === "pick") Sound.tick(740, 0.04, 0.06, "sine", 0);
    } else if (n.id === "dispatch") {
      if (name === "replan") [660, 880].forEach((f, i) => setTimeout(() => Sound.tick(f, 0.035, 0.08, "sine", 0), i * 60));
      if (name === "home") Sound.tick(240, 0.05, 0.12, "triangle", 0);
      if (name === "done") Sound.tick(1180, 0.012, 0.03, "sine", 0.05);
    } else if (n.id === "layerline" && name === "layer") Sound.tick(330, 0.015, 0.05);
    else if (n.id === "intonation" && name === "pitch") Sound.tone(data);
  }

  /* ------------------------------------------------------------------ routing: #/relay is a place on the page */
  const stopFromHash = () => { const id = location.hash.replace(/^#\/?/, ""); return STOPS.findIndex((s) => s.id === id); };
  addEventListener("hashchange", () => { const i = stopFromHash(); if (i >= 0) scrollToStop(i); });
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  /* ------------------------------------------------------------------ go */
  function resize() {
    W = innerWidth;
    VH = innerHeight;
    DPR = Math.min(2, devicePixelRatio || 1);
    layout();
    cv.style.height = H + "px";
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    buildSegs();
    measure();
    sp = spT;
    placeCam(sp);
    wake();
  }
  addEventListener("resize", resize);
  new ResizeObserver(() => measure()).observe(flow);
  resize();
  const first = stopFromHash();
  if (first > 0) { skipIntro(); scrollTo(0, centerOf(first)); spT = sp = progressAt(scrollY); }
  setCur(clamp(Math.round(spT), 0, LAST));
  cur === 0 && document.body.classList.add("at-start");
  secs[cur].classList.add("on");
  wake();
  window.__map = { cam, nodes, byId, STOPS, skipIntro, Sound, scrollToStop, centerOf, get stop() { return STOPS[cur].id; }, get resting() { return resting; }, get sp() { return sp; } };
})();
