/*
 * alan.fung runtime.
 * Left pane: the page's "source", generated from data.js. Right pane: its output.
 * Scrolling steps an execution pointer through the source; the dotted values in the
 * source are live and recompile the page when edited. A terminal (`) drives the same state.
 */
(() => {
  "use strict";

  const D = window.PORTFOLIO;
  const P = D.profile;
  const root = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const q = (s) => JSON.stringify(s);
  const mq = (m) => window.matchMedia && window.matchMedia(m).matches;
  const isMobile = () => mq("(max-width: 900px)");

  const hash = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  };
  const sha = (s) => hash(s).toString(16).padStart(8, "0").slice(0, 7);
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /* ------------------------------------------------------------------ state */

  const THEMES = ["midnight", "paper", "phosphor"];
  const ACCENTS = ["#ffb547", "#6ee7ff", "#ff7aa8", "#b4ff6b", "#a78bfa"];
  const KEY = "alan.fung/config";
  const DEFAULTS = {
    theme: mq("(prefers-color-scheme: light)") ? "paper" : "midnight",
    accent: ACCENTS[0],
    motion: !mq("(prefers-reduced-motion: reduce)"),
    coffee: 3,
    name: P.name
  };
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} },
    clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  };
  const state = Object.assign({}, DEFAULTS, store.get());
  if (!THEMES.includes(state.theme)) state.theme = DEFAULTS.theme;
  if (!/^#[0-9a-f]{3,8}$/i.test(state.accent)) state.accent = DEFAULTS.accent;
  state.coffee = clamp(parseInt(state.coffee, 10) || 0, 0, 9);
  state.motion = state.motion !== false;
  state.name = typeof state.name === "string" ? state.name.slice(0, 40) : P.name;

  /* ----------------------------------------------------------------- source */

  const LIVE = (k) => `\u0001${k}\u0001`;
  const wrap = (text, width) => {
    const out = [];
    let line = "";
    text.split(/\s+/).forEach((w) => {
      if ((line + " " + w).trim().length > width) { out.push(line.trim()); line = w; } else line += " " + w;
    });
    if (line.trim()) out.push(line.trim());
    return out;
  };

  function buildSource() {
    const blocks = [];
    const block = (id, lines) => blocks.push({ id, lines: lines.map((l) => (typeof l === "string" ? { s: l } : l)) });

    block("hero", [
      "// alan.fung: this page is a program.",
      "// scroll to step through it. dotted values are live:",
      "// click or type on them and the page recompiles.",
      "",
      'import { curiosity, caffeine } from "life";',
      "",
      "const config = {",
      `  theme:  ${LIVE("theme")},`,
      `  accent: ${LIVE("accent")},`,
      `  motion: ${LIVE("motion")},`,
      "};",
      "",
      "const alan = new Engineer({",
      `  name:   ${LIVE("name")},`,
      `  handle: ${q("@" + P.handle)},`,
      `  role:   ${q(P.role)},`,
      `  since:  ${P.firstCommit},`,
      `  coffee: ${LIVE("coffee")}, // cups a day`,
      "});",
      "",
      "render(alan, config);"
    ]);

    block("about", [
      "",
      "alan.about(`",
      ...P.about.flatMap((p, i) => [...wrap(p, 46).map((s) => ({ s: "  " + s, str: true, ref: "a:" + i })), ...(i < P.about.length - 1 ? [{ s: "", str: true }] : [])]),
      "`);"
    ]);

    const w = Math.max(...D.stack.map((g) => g.group.length));
    block("stack", [
      "",
      "const stack = {",
      ...D.stack.map((g) => ({ s: `  ${(g.group + ":").padEnd(w + 1)} [${g.items.map((i) => q(i[0])).join(", ")}],`, ref: "s:" + g.group })),
      "} satisfies Stack;"
    ]);

    block("projects", [
      "",
      "const projects: Project[] = [",
      ...D.projects.map((p) => ({ s: `  { id: ${q(p.id)}, year: ${p.year}, status: ${q(p.status)} },`, ref: "p:" + p.id })),
      "];",
      "",
      `projects.map(ship); // → ${D.projects.length} cards`
    ]);

    block("history", [
      "",
      "const log = await git.log({",
      "  author: alan,",
      "  graph: true,",
      "});",
      ...D.history.map((c, i) => ({ s: `// * ${sha(c.date + c.title)} ${c.date} ${c.title}`, ref: "c:" + i }))
    ]);

    block("writing", [
      "",
      'const notes = await fetch("/blog").then(toJSON);',
      `notes.length;  // ${D.writing.total} since ${D.writing.since}`,
      `notes.byYear;  // ${D.writing.byYear.map((y) => y.join(":")).join("  ")}`,
      "notes.latest.map(read);",
      ...D.writing.latest.map((p, i) => ({ s: `//  → ${p.date} ${p.title}`, ref: "w:" + i })),
      "alan.keepLearning(); // forever"
    ]);

    block("contact", [
      "",
      "try {",
      "  await hire(alan);",
      "} catch {",
      "  // there is no catch. say hi.",
      "}",
      "",
      "export default alan;"
    ]);

    return blocks;
  }

  const KW = new Set("import from const let new await try catch export default async return true false interface satisfies type".split(" "));
  const TOK = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([\s\S])/g;

  function highlight(s) {
    let out = "";
    let m;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(s))) {
      const [all, com, str, num, word, ws] = m;
      if (com) out += `<span class="t-com">${esc(com)}</span>`;
      else if (str) out += `<span class="t-str">${esc(str)}</span>`;
      else if (num) out += `<span class="t-num">${num}</span>`;
      else if (word) {
        const next = s.slice(TOK.lastIndex).match(/^\s*(.)/);
        const n = next && next[1];
        const cls = KW.has(word) ? "t-kw" : n === "(" ? "t-fn" : n === ":" ? "t-prop" : /^[A-Z]/.test(word) ? "t-type" : "";
        out += cls ? `<span class="${cls}">${word}</span>` : word;
      } else if (ws) out += ws;
      else out += `<span class="t-p">${esc(all)}</span>`;
    }
    return out;
  }

  function widget(k) {
    const btn = (cls, title, inner) => `<span class="live ${cls}" data-live="${k}" role="button" tabindex="0" title="${title}">${inner}</span>`;
    switch (k) {
      case "theme": return btn("", "click to cycle themes", esc(q(state.theme)));
      case "accent": return btn("", "click to cycle colours", `<span class="swatch"></span>${esc(q(state.accent))}`);
      case "motion": return btn("bool", "click to toggle", String(state.motion));
      case "coffee": return btn("num", "click +1 · shift-click −1", String(state.coffee));
      case "name": return `<span class="t-str">"</span><span class="live" data-live="name" contenteditable="true" spellcheck="false" role="textbox" aria-label="Edit name" title="type to rename">${esc(state.name)}</span><span class="t-str">"</span>`;
    }
    return "";
  }

  function renderLine(l) {
    if (l.str) return `<span class="t-str">${esc(l.s)}</span>`;
    return l.s.split("\u0001").map((part, i) => (i % 2 ? widget(part) : highlight(part))).join("");
  }

  const code = $("#code");
  const blocks = buildSource();
  const range = {};
  const refLine = {};
  const lineEls = [];
  {
    let i = 0;
    const html = [];
    blocks.forEach((b) => {
      range[b.id] = { start: i, end: i + b.lines.length - 1 };
      b.lines.forEach((l) => {
        if (l.ref && refLine[l.ref] == null) refLine[l.ref] = i;
        html.push(`<div class="ln" data-i="${i}" data-b="${b.id}"${l.ref ? ` data-ref="${l.ref}"` : ""} style="--n:${Math.max(1, l.s.length)}"><span class="no">${i + 1}</span><span class="src">${renderLine(l) || " "}</span></div>`);
        i++;
      });
    });
    code.innerHTML = html.join("");
    lineEls.push(...$$(".ln", code));
  }
  const LIVE_COUNT = $$("[data-live]", code).length;

  /* ----------------------------------------------------------------- output */

  const out = $("#out");
  const head = (call, title, lede) => `
    <header class="sec-head rv">
      <div class="call"><b>${call}</b></div>
      <h2 class="title">${title}</h2>
      ${lede ? `<p class="lede">${lede}</p>` : ""}
    </header>`;

  const years = new Date().getFullYear() - P.firstCommit;

  const lanes = ["main", "study", "play", "work"].filter((b) => D.history.some((c) => c.branch === b));
  const laneX = (b) => 24 + lanes.indexOf(b) * 18;
  const span = {};
  D.history.forEach((c, i) => { const s = span[c.branch] || (span[c.branch] = [i, i]); s[1] = i; });
  span.main = [0, D.history.length - 1];
  const branchLabelAt = {};
  lanes.forEach((b) => { if (b !== "main") branchLabelAt[span[b][0]] = b; });

  function commitRow(c, i) {
    const segs = lanes.map((b) => {
      const [a, z] = span[b];
      if (i < a || i > z) return "";
      return `<i style="left:${laneX(b)}px;background:var(--lane-${b});top:${i === a ? "50%" : "0"};bottom:${i === z ? "50%" : "0"}"></i>`;
    }).join("");
    const refs = [
      c.tag === "HEAD" ? `<span class="ref" style="color:var(--lane-main)">HEAD → main</span>` : "",
      c.tag && c.tag !== "HEAD" ? `<span class="ref" style="color:var(--lane-${c.branch})">${esc(c.tag)}</span>` : "",
      branchLabelAt[i] === c.branch ? `<span class="ref b" style="color:var(--lane-${c.branch})">${c.branch}</span>` : ""
    ].join("");
    return `<div class="commit${c.tag === "HEAD" ? " head" : ""}" data-ref="c:${i}">
      <div class="lanes">${segs}<b style="left:${laneX(c.branch)}px;color:var(--lane-${c.branch})"></b></div>
      <span class="c-hash">${sha(c.date + c.title)}</span>
      <span class="c-date">${c.date}</span>
      <span class="c-msg">${refs}${esc(c.title)}</span>
    </div>`;
  }

  function card(p) {
    const st = { live: "live", source: "on github", wip: "in progress" }[p.status] || p.status;
    const ext = (u) => /^https?:/.test(u) ? ` target="_blank" rel="noopener"` : "";
    return `<article class="card rv${p.featured ? " wide" : ""}" data-ref="p:${p.id}">
      <canvas class="cover" data-seed="${hash(p.id)}" aria-hidden="true"></canvas>
      <div class="card-body">
        <div class="card-top"><span class="st ${p.status}">${st}</span><span>${p.year} · ${esc(p.kind)}</span></div>
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.summary)}</p>
        ${p.highlights && p.highlights.length ? `<ul>${p.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
        <div class="tags">${p.stack.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        <div class="actions">
          ${p.links.live ? `<a class="btn" href="${esc(p.links.live)}"${ext(p.links.live)}>▶ run</a>` : ""}
          ${p.links.source ? `<a class="btn ${p.links.live ? "ghost" : ""}" href="${esc(p.links.source)}"${ext(p.links.source)}>&lt;/&gt; source</a>` : ""}
        </div>
      </div>
    </article>`;
  }

  const maxYear = Math.max(...D.writing.byYear.map((y) => y[1]));

  out.insertAdjacentHTML("beforeend", `
    <section class="sec hero" id="hero" data-block="hero" aria-label="Intro">
      <div class="hero-meta rv"><span class="pulse" aria-hidden="true"></span><span>online</span><span>render(alan, config)</span><span class="ok">→ 200 OK</span></div>
      <h1 class="hero-name rv" id="hero-name"></h1>
      <p class="err" id="hero-err" hidden>TypeError: alan.name is undefined. Type a name in the source.</p>
      <p class="hero-role rv"><span>${esc(P.role)}</span><span class="handle">@${esc(P.handle)}</span></p>
      <p class="hero-tag rv">${esc(P.tagline)}</p>
      <div class="stats rv">
        <div class="stat"><div class="k">shipping since</div><div class="v">${P.firstCommit}<small>${years}y</small></div></div>
        <div class="stat"><div class="k">notes published</div><div class="v">${D.writing.total}</div></div>
        <div class="stat"><div class="k">projects.length</div><div class="v">${D.projects.length}</div></div>
        <div class="stat"><div class="k">coffee / day</div><div class="v" id="stat-coffee"></div></div>
      </div>
      <div class="scroll-hint rv"><span class="key" aria-hidden="true"></span><span id="hint">scroll to step through the program · edit the dotted values to recompile</span></div>
    </section>

    <section class="sec" id="about" data-block="about" aria-label="About">
      ${head("alan.about()", "Who's <em>running</em> this")}
      <div class="about-body">
        ${P.about.map((t, i) => `<p class="rv" data-ref="a:${i}">${i === 0 ? esc(t).replace(/(charm, stunning visual effects and user experience)/, '<span class="hl">$1</span>') : esc(t)}</p>`).join("")}
      </div>
      <div class="about-aside rv">${P.loves.map((l) => `<span class="pill">♥ ${esc(l)}</span>`).join("")}<span class="pill">♪ violin</span><span class="pill">♪ piano (learning)</span></div>
    </section>

    <section class="sec" id="stack" data-block="stack" aria-label="Stack">
      ${head("stack satisfies Stack", "What I <em>build</em> with", "A type, not a tag cloud. The small numbers are how many notes I've written about each one on StudyLog.")}
      <div class="types rv">
        ${D.stack.map((g) => `<div class="trow" data-ref="s:${g.group}"><div class="tk">${g.group}</div><div class="chips">${g.items.map(([n, c]) => `<span class="chip">${esc(n)}${c ? `<span class="n">${c}</span>` : ""}</span>`).join("")}</div></div>`).join("")}
      </div>
    </section>

    <section class="sec" id="projects" data-block="projects" aria-label="Projects">
      ${head("projects.map(ship)", "Things I've <em>shipped</em>", "Every card is a return value. Hover one to find the line that produced it.")}
      <div class="cards">${D.projects.map(card).join("")}</div>
      <p class="more rv">More experiments live on <a href="${esc(P.github)}" target="_blank" rel="noopener">github.com/${esc(P.handle)}</a>.</p>
    </section>

    <section class="sec" id="history" data-block="history" aria-label="History">
      ${head("git log --graph", "How I got <em>here</em>", `${D.history.length} commits since ${P.firstCommit}, across ${lanes.length} branches.`)}
      <div class="graph rv" style="--lanes-w:${24 + lanes.length * 18 + 10}px">
        <div class="g-legend">${lanes.map((b) => `<span><i style="background:var(--lane-${b})"></i>${b}</span>`).join("")}</div>
        ${D.history.map(commitRow).join("")}
      </div>
    </section>

    <section class="sec" id="writing" data-block="writing" aria-label="Writing">
      ${head("alan.keepLearning()", "Learning, <em>in public</em>", "Everything I study ends up as a long-form note on StudyLog, from database internals to circuit design to piano theory.")}
      <div class="write-grid">
        <div class="panel rv">
          <h4>notes.length</h4>
          <div class="big" id="count" data-to="${D.writing.total}">${D.writing.total}</div>
          <div class="big-sub">posts since ${D.writing.since}</div>
          <div class="bars">${D.writing.byYear.map(([y, n]) => `<div class="row"><span>${y}</span><span class="track"><span class="fill" data-w="${(n / maxYear) * 100}"></span></span><span>${n}</span></div>`).join("")}</div>
          <div class="topics">${D.writing.topics.map(([t, n]) => `<span class="tag">${esc(t)} · ${n}</span>`).join("")}</div>
        </div>
        <div class="panel rv">
          <h4>notes.latest</h4>
          <ul class="posts">${D.writing.latest.map((p, i) => `<li data-ref="w:${i}"><a href="${esc(p.url)}"><span class="d">${p.date}</span><span class="t">${esc(p.title)}</span></a></li>`).join("")}</ul>
          <div class="actions" style="margin-top:18px"><a class="btn" href="/blog/">open StudyLog →</a></div>
        </div>
      </div>
    </section>

    <section class="sec contact" id="contact" data-block="contact" aria-label="Contact">
      ${head("await hire(alan)", "Let's build <em>something</em>", "Collaboration, a role, or a strange idea that needs an engineer. Run the line below.")}
      <button type="button" class="hire rv" id="hire"><span><span class="kw">await</span> <span class="fn">hire</span><span class="p">(</span>alan<span class="p">)</span></span><span class="caret" aria-hidden="true"></span></button>
      <div class="promise" id="promise" hidden></div>
      <footer class="foot">
        <span>© ${new Date().getFullYear()} ${esc(P.name)} · hand-written, no framework, served from GitHub Pages</span>
        <span><a href="/blog/">blog</a> · <a href="${esc(P.github)}" target="_blank" rel="noopener">github</a> · press <b>\`</b> for a terminal</span>
      </footer>
    </section>
  `);

  /* ----------------------------------------------------------- hero / name */

  const nameEl = $("#hero-name");
  function renderName() {
    const n = state.name.trim();
    nameEl.className = "hero-name rv in";
    $("#hero-err").hidden = !!n;
    if (!n) {
      nameEl.classList.add("undef");
      nameEl.textContent = "undefined";
      nameEl.removeAttribute("aria-label");
      return;
    }
    nameEl.setAttribute("aria-label", n);
    nameEl.innerHTML = n.split(/\s+/).map((w) => `<span class="word" aria-hidden="true">${Array.from(w).map((c) => `<span class="ch" data-c="${esc(c)}">${esc(c)}</span>`).join("")}</span>`).join("");
    if (state.coffee === 0) nameEl.classList.add("fumes");
    if (state.coffee >= 7 && state.motion) nameEl.classList.add("jitter");
  }

  // A letter "decompiles" into its char code, then recompiles.
  function decompile(ch) {
    if (!ch || ch.classList.contains("hex")) return;
    const c = ch.dataset.c;
    ch.dataset.hex = "0x" + c.codePointAt(0).toString(16).toUpperCase();
    ch.classList.add("hex");
    setTimeout(() => ch.classList.remove("hex"), 750);
  }
  nameEl.addEventListener("pointerover", (e) => decompile(e.target.closest(".ch")));
  (function idle() {
    const cups = state.coffee;
    if (state.motion && cups > 0 && !document.hidden) {
      const chs = $$(".ch:not(.hex)", nameEl);
      if (chs.length) decompile(chs[Math.floor(Math.random() * chs.length)]);
    }
    setTimeout(idle, cups > 0 ? 5200 / cups + 400 : 3000);
  })();

  function renderCoffee() {
    const c = state.coffee;
    $("#stat-coffee").innerHTML = c === 0 ? `0<small>running on fumes</small>` : `${c}<small>${c >= 7 ? "send help" : "cups"}</small>`;
  }

  /* ---------------------------------------------------------------- covers */

  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;color:var(--acc-ink)";
  document.body.appendChild(probe);
  const accentInk = () => getComputedStyle(probe).color;

  function drawCover(cv, t) {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const r = rng(+cv.dataset.seed);
    const a = 0.02 + r() * 0.05, b = 0.02 + r() * 0.05, c = 0.01 + r() * 0.04, d = 0.02 + r() * 0.06;
    const ph = r() * 6.28, cx = w * (0.2 + r() * 0.6), cy = h * (0.2 + r() * 0.6);
    const step = 11;
    g.fillStyle = cv._ink || (cv._ink = accentInk());
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const dist = Math.hypot(x - cx, y - cy);
        let v = Math.sin(x * a + y * b + t) + Math.sin(x * c - y * d + ph - t * 0.7) + Math.sin(dist * 0.045 - t * 1.3);
        v = (v + 3) / 6;
        v = v * v * v;
        g.globalAlpha = 0.12 + v * 0.88;
        g.beginPath();
        g.arc(x, y, 0.6 + v * 3.6, 0, 6.2832);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }
  const covers = $$(".cover");
  function redrawCovers() { covers.forEach((cv) => { cv._ink = null; drawCover(cv, 0); }); }
  covers.forEach((cv) => {
    const cardEl = cv.closest(".card");
    let raf = 0, t0 = 0;
    const loop = (now) => { drawCover(cv, (now - t0) / 900); raf = requestAnimationFrame(loop); };
    cardEl.addEventListener("pointerenter", () => { if (!state.motion) return; t0 = performance.now(); raf = requestAnimationFrame(loop); });
    cardEl.addEventListener("pointerleave", () => { cancelAnimationFrame(raf); });
  });
  let rsz;
  window.addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(() => { redrawCovers(); onScroll(); }, 150); });

  /* ------------------------------------------------------------ recompile */

  const statusEl = $("#status");
  const tab = $("#tab");
  let lastMs = 0;
  let curLine = 0;

  function renderStatus() {
    statusEl.innerHTML = `<span>Ln ${curLine + 1}, Col 1</span><span class="ok">compiled in ${lastMs.toFixed(1)}ms</span><span>${LIVE_COUNT} live values</span><span class="sp">fung · UTF-8</span>`;
  }

  function syncWidgets() {
    $$("[data-live]", code).forEach((el) => {
      const k = el.dataset.live;
      if (el === document.activeElement) return;
      if (k === "name") el.textContent = state.name;
      else el.innerHTML = widget(k).replace(/^<span[^>]*>|<\/span>$/g, "");
    });
  }

  let toastT;
  function toast(html) {
    const t = $("#toast");
    t.innerHTML = html;
    t.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("on"), 1600);
  }

  function apply(key) {
    const t0 = performance.now();
    root.dataset.theme = state.theme;
    root.style.setProperty("--acc", state.accent);
    root.classList.toggle("no-motion", !state.motion);
    if (!key || key === "name" || key === "coffee" || key === "motion") renderName();
    if (!key || key === "coffee") renderCoffee();
    syncWidgets();
    lastMs = performance.now() - t0;
    renderStatus();
    if (!key || key === "theme" || key === "accent") requestAnimationFrame(redrawCovers);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.body).backgroundColor;

    const dirty = Object.keys(DEFAULTS).some((k) => state[k] !== DEFAULTS[k]);
    tab.classList.toggle("is-dirty", dirty);
    if (key) {
      store.set(state);
      const w = $(`[data-live="${key}"]`, code);
      if (w && w !== document.activeElement) { w.classList.remove("bump"); void w.offsetWidth; w.classList.add("bump"); }
      if (key === "theme" || key === "accent") { out.classList.remove("flash"); void out.offsetWidth; out.classList.add("flash"); }
      const val = key === "name" ? q(state.name) : key === "theme" || key === "accent" ? q(state[key]) : String(state[key]);
      toast(`recompiled · ${key} = <b>${esc(val)}</b> · ${lastMs.toFixed(1)}ms`);
    }
  }

  function set(key, value) {
    state[key] = value;
    apply(key);
  }
  const cycle = (list, v, dir = 1) => list[(list.indexOf(v) + dir + list.length) % list.length];

  function act(el, shift) {
    const k = el.dataset.live;
    if (k === "theme") set("theme", cycle(THEMES, state.theme, shift ? -1 : 1));
    else if (k === "accent") set("accent", cycle(ACCENTS, state.accent, shift ? -1 : 1));
    else if (k === "motion") set("motion", !state.motion);
    else if (k === "coffee") set("coffee", (state.coffee + (shift ? 9 : 1)) % 10);
  }

  code.addEventListener("click", (e) => {
    const live = e.target.closest("[data-live]");
    if (live) { if (live.dataset.live !== "name") act(live, e.shiftKey); return; }
    const ln = e.target.closest(".ln");
    if (ln) jumpTo(+ln.dataset.i);
  });
  code.addEventListener("keydown", (e) => {
    const live = e.target.closest("[data-live]");
    if (!live) return;
    if (live.dataset.live === "name") {
      if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); live.blur(); }
      return;
    }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(live, e.shiftKey); }
  });
  code.addEventListener("input", (e) => {
    const live = e.target.closest('[data-live="name"]');
    if (!live) return;
    let v = live.textContent.replace(/[\r\n]+/g, " ");
    if (v.length > 40) { v = v.slice(0, 40); live.textContent = v; }
    set("name", v);
  });
  code.addEventListener("paste", (e) => {
    if (!e.target.closest('[data-live="name"]')) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text").replace(/\s+/g, " ").slice(0, 40);
    document.execCommand("insertText", false, text);
  });
  code.addEventListener("focusout", (e) => { if (e.target.closest('[data-live="name"]')) syncWidgets(); });

  $("#btn-reset").addEventListener("click", () => {
    store.clear();
    Object.assign(state, DEFAULTS);
    apply();
    toast("reset to defaults");
  });

  /* ------------------------------------------------------- scroll engine */

  const sections = $$(".sec[data-block]");
  let activeBlock = null;
  let litEl = null;
  let edTarget = 0, edRaf = 0, edHold = false;

  function edLoop() {
    const d = edTarget - code.scrollTop;
    if (Math.abs(d) < 1 || !state.motion) { code.scrollTop = edTarget; edRaf = 0; return; }
    code.scrollTop += d * 0.16;
    edRaf = requestAnimationFrame(edLoop);
  }
  function edScrollTo(i) {
    const el = lineEls[i];
    if (!el) return;
    edTarget = clamp(el.offsetTop - code.clientHeight * 0.38, 0, code.scrollHeight - code.clientHeight);
    if (!edRaf) edRaf = requestAnimationFrame(edLoop);
  }
  code.addEventListener("pointerenter", () => { edHold = true; });
  code.addEventListener("pointerleave", () => { edHold = false; edScrollTo(curLine); });

  const stripAt = $("#strip-at"), stripLine = $("#strip-line");

  function setActive(block, line) {
    if (block !== activeBlock) {
      if (activeBlock) { const r = range[activeBlock]; for (let i = r.start; i <= r.end; i++) lineEls[i].classList.remove("on"); }
      const r = range[block];
      for (let i = r.start; i <= r.end; i++) lineEls[i].classList.add("on");
      code.classList.add("has-active");
      activeBlock = block;
    }
    if (line !== curLine || !lineEls[line].classList.contains("cur")) {
      lineEls[curLine] && lineEls[curLine].classList.remove("cur");
      lineEls[line].classList.add("cur");
      curLine = line;
      stripAt.textContent = `▶ ${line + 1}`;
      stripLine.textContent = lineEls[line].textContent.slice(String(line + 1).length).trim() || "…";
      renderStatus();
      if (!edHold) edScrollTo(line);
      const ref = lineEls[line].dataset.ref;
      const el = ref ? $(`[data-ref="${ref}"]`, out) : null;
      if (litEl !== el) { litEl && litEl.classList.remove("lit"); el && el.classList.add("lit"); litEl = el; }
    }
  }

  let ticking = false;
  const watch = $("#watch");
  const started = Date.now();
  function renderWatch(pct) {
    const s = Math.floor((Date.now() - started) / 1000);
    watch.innerHTML = `<span>watch</span><span>scroll <span class="bar"><i style="width:${pct}%"></i></span> <b>${pct}%</b></span><span>block <b>${activeBlock}</b></span><span>uptime <b>${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}</b></span>`;
  }
  let lastPct = 0;
  setInterval(() => renderWatch(lastPct), 1000);

  function onScroll() {
    ticking = false;
    const vh = window.innerHeight;
    const center = vh * 0.45;
    let act = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= center) act = s;
    const id = act.dataset.block;
    const rect = act.getBoundingClientRect();
    const p = clamp((center - rect.top) / rect.height, 0, 0.999);
    const r = range[id];
    let line = r.start + Math.floor(p * (r.end - r.start + 1));

    let best = null, bd = Infinity;
    $$("[data-ref]", act).forEach((el) => {
      const rr = el.getBoundingClientRect();
      if (rr.bottom < 0 || rr.top > vh) return;
      const dd = rr.top <= center && rr.bottom >= center ? 0 : Math.min(Math.abs(rr.top - center), Math.abs(rr.bottom - center));
      if (dd < bd) { bd = dd; best = el; }
    });
    if (best && bd < 60 && refLine[best.dataset.ref] != null) line = refLine[best.dataset.ref];

    setActive(id, line);
    const max = document.documentElement.scrollHeight - vh;
    lastPct = max > 0 ? Math.round((window.scrollY / max) * 100) : 0;
    renderWatch(lastPct);
  }
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

  // Click a line in the source → scroll the output to what it produced.
  function jumpTo(i) {
    const ln = lineEls[i];
    const ref = ln.dataset.ref;
    const target = ref && $(`[data-ref="${ref}"]`, out);
    const behavior = state.motion ? "smooth" : "auto";
    if (target) {
      const r = target.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.45 + r.height / 2, behavior });
    } else {
      const sec = $(`.sec[data-block="${ln.dataset.b}"]`);
      const rg = range[ln.dataset.b];
      const f = (i - rg.start) / (rg.end - rg.start + 1);
      const r = sec.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.top + f * r.height - window.innerHeight * 0.45 + 2, behavior });
    }
    ln.classList.remove("ping"); void ln.offsetWidth; ln.classList.add("ping");
    if (isMobile()) toggleSheet(false);
  }

  // Hover an output element → flash the line that produced it.
  out.addEventListener("pointerover", (e) => {
    const el = e.target.closest("[data-ref]");
    if (!el || el._hov) return;
    el._hov = true;
    const i = refLine[el.dataset.ref];
    if (i == null) return;
    const ln = lineEls[i];
    ln.classList.remove("ping"); void ln.offsetWidth; ln.classList.add("ping");
    if (!edHold) edScrollTo(i);
  });
  out.addEventListener("pointerout", (e) => {
    const el = e.target.closest("[data-ref]");
    if (el && !el.contains(e.relatedTarget)) { el._hov = false; if (!edHold) edScrollTo(curLine); }
  });

  /* --------------------------------------------------------------- reveal */

  const counter = $("#count");
  function countUp() {
    const to = +counter.dataset.to;
    if (!state.motion) { counter.textContent = to; return; }
    const t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / 1400, 0, 1);
      counter.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add("in");
      if (en.target.contains(counter)) countUp();
      $$(".fill", en.target).forEach((f) => { f.style.width = f.dataset.w + "%"; });
      io.unobserve(en.target);
    });
  }, { rootMargin: "0px 0px -8% 0px" }) : null;
  $$(".rv").forEach((el, i) => {
    if (el.closest("#hero")) { el.style.transitionDelay = `${0.1 + i * 0.08}s`; return; }
    if (io) io.observe(el); else el.classList.add("in");
  });
  if (!io) $$(".fill").forEach((f) => { f.style.width = f.dataset.w + "%"; });

  /* ----------------------------------------------------------------- boot */

  function boot() {
    let first = true;
    try { first = !sessionStorage.getItem("alan.fung/booted"); sessionStorage.setItem("alan.fung/booted", "1"); } catch (e) {}
    const heroIn = () => $$("#hero .rv").forEach((el) => el.classList.add("in"));
    if (!first || !state.motion) { heroIn(); return; }
    const r = range.hero;
    for (let i = r.start; i <= r.end; i++) {
      const n = +lineEls[i].style.getPropertyValue("--n");
      lineEls[i].style.setProperty("--t", `${(i - r.start) * 0.06}s`);
      lineEls[i].style.setProperty("--d", `${Math.min(0.45, n * 0.012)}s`);
    }
    root.classList.add("booting");
    const total = (r.end - r.start) * 60 + 500;
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      root.classList.remove("booting");
      ["keydown", "pointerdown", "wheel", "touchstart"].forEach((ev) => window.removeEventListener(ev, end));
    };
    ["keydown", "pointerdown", "wheel", "touchstart"].forEach((ev) => window.addEventListener(ev, end, { passive: true }));
    setTimeout(heroIn, 500);
    setTimeout(end, total);
  }

  /* ----------------------------------------------------------- hire(alan) */

  const hire = $("#hire"), promise = $("#promise");
  hire.addEventListener("click", () => {
    if (!promise.hidden && promise.dataset.done) return;
    promise.hidden = false;
    const frames = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
    let f = 0;
    promise.innerHTML = `Promise { <span class="state">&lt;pending&gt;</span> } <span class="spin">${frames[0]}</span>`;
    const spin = setInterval(() => { const s = $(".spin", promise); if (s) s.textContent = frames[++f % frames.length]; }, 80);
    setTimeout(() => {
      clearInterval(spin);
      promise.dataset.done = "1";
      promise.innerHTML = `Promise { <span class="state">&lt;fulfilled&gt;</span>: {<br>
        &nbsp;&nbsp;email: <a href="mailto:${esc(P.email)}">"${esc(P.email)}"</a>,<br>
        &nbsp;&nbsp;github: <a href="${esc(P.github)}" target="_blank" rel="noopener">"${esc(P.github.replace("https://", ""))}"</a>,<br>} }`;
    }, state.motion ? 900 : 0);
  });

  /* ------------------------------------------------------------- terminal */

  const term = $("#term"), tout = $("#term-out"), tin = $("#term-input");
  const hist = [];
  let hi = 0, greeted = false;
  const print = (html, cls) => { const d = document.createElement("div"); if (cls) d.className = cls; d.innerHTML = html; tout.appendChild(d); tout.scrollTop = tout.scrollHeight; };

  function openTerm(open) {
    const show = open == null ? term.hidden : open;
    term.hidden = !show;
    if (show) {
      if (!greeted) {
        greeted = true;
        print(`Welcome to <span class="a">alan@fung</span>. This shell edits the same program you see in the source pane.\nType <span class="a">help</span> to see what it can do.`);
      }
      setTimeout(() => tin.focus(), 30);
    } else tin.blur();
  }
  $("#btn-term").addEventListener("click", () => openTerm());
  $("#strip-term").addEventListener("click", () => openTerm());
  $("#term-x").addEventListener("click", () => openTerm(false));

  const proj = (id) => D.projects.find((p) => p.id === id || p.name.toLowerCase() === String(id).toLowerCase());
  const go = (url) => { if (/^https?:/.test(url)) window.open(url, "_blank", "noopener"); else location.href = url; };

  const CMDS = {
    help: () => [
      "whoami                 who is this",
      "about                  cat about.txt",
      "ls                     list projects",
      "open <id|blog|github>  run a project",
      "stack                  what I build with",
      "git log                how I got here",
      "blog                   latest notes",
      "hire                   get in touch",
      "",
      "theme <midnight|paper|phosphor>",
      "accent <#hex>          e.g. accent #6ee7ff",
      "coffee <0-9>",
      "motion <on|off>",
      "name <text>            rename the engineer",
      "reset · clear · exit"
    ].join("\n"),
    whoami: () => `${esc(state.name || "undefined")} · ${esc(P.role)} · @${esc(P.handle)}\n${esc(P.tagline)}`,
    about: () => P.about.map(esc).join("\n\n"),
    cat: (a) => (/about/.test(a[0] || "") ? CMDS.about() : `cat: ${esc(a[0] || "")}: No such file. try <span class="a">cat about.txt</span>`),
    ls: () => D.projects.map((p) => `${p.status.padEnd(7)} ${p.id.padEnd(16)} ${esc(p.name)}`).join("\n"),
    projects: () => CMDS.ls(),
    open: (a) => {
      const k = (a[0] || "").toLowerCase();
      if (k === "blog" || k === "studylog") { go("/blog/"); return "opening /blog/ …"; }
      if (k === "github") { go(P.github); return `opening ${esc(P.github)} …`; }
      const p = proj(k);
      if (!p) return `<span class="e">open: no project "${esc(k)}". try ls</span>`;
      const url = p.links.live || p.links.source;
      go(url);
      return `opening ${esc(p.name)} → ${esc(url)} …`;
    },
    stack: () => D.stack.map((g) => `${g.group.padEnd(10)} ${g.items.map((i) => i[0]).join(", ")}`).join("\n"),
    git: (a) => (a[0] === "log" ? D.history.map((c) => `<span style="color:var(--lane-${c.branch})">*</span> <span style="color:var(--num)">${sha(c.date + c.title)}</span> ${c.date} ${esc(c.title)}`).join("\n") : "usage: git log"),
    blog: () => D.writing.latest.map((p) => `${p.date}  <a href="${esc(p.url)}">${esc(p.title)}</a>`).join("\n") + `\n\n${D.writing.total} notes in total → <a href="/blog/">/blog/</a>`,
    hire: () => `Promise { &lt;fulfilled&gt; }\nemail   <a href="mailto:${esc(P.email)}">${esc(P.email)}</a>\ngithub  <a href="${esc(P.github)}" target="_blank" rel="noopener">${esc(P.github)}</a>`,
    contact: () => CMDS.hire(),
    theme: (a) => {
      if (!a[0]) return `theme = "${state.theme}"  (${THEMES.join(" | ")})`;
      if (!THEMES.includes(a[0])) return `<span class="e">unknown theme. pick ${THEMES.join(" | ")}</span>`;
      set("theme", a[0]); return `<span class="a">✓</span> theme = "${a[0]}"`;
    },
    accent: (a) => {
      if (!a[0]) return `accent = "${state.accent}"`;
      if (!/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(a[0])) return `<span class="e">accent wants a hex colour, like #6ee7ff</span>`;
      const v = a[0][0] === "#" ? a[0] : "#" + a[0];
      set("accent", v); return `<span class="a">✓</span> accent = "${esc(v)}"`;
    },
    coffee: (a) => {
      if (a[0] == null) return `coffee = ${state.coffee}`;
      const n = parseInt(a[0], 10);
      if (isNaN(n) || n < 0 || n > 9) return `<span class="e">coffee takes 0-9. be reasonable.</span>`;
      set("coffee", n); return `<span class="a">✓</span> coffee = ${n}${n >= 7 ? "  (are you ok?)" : n === 0 ? "  (running on fumes)" : ""}`;
    },
    motion: (a) => {
      if (!a[0]) return `motion = ${state.motion}`;
      set("motion", /^(on|true|1|yes)$/i.test(a[0])); return `<span class="a">✓</span> motion = ${state.motion}`;
    },
    name: (a) => {
      if (!a.length) return `name = "${esc(state.name)}"`;
      set("name", a.join(" ").slice(0, 40)); return `<span class="a">✓</span> name = "${esc(state.name)}"`;
    },
    reset: () => { $("#btn-reset").click(); return "reset to defaults"; },
    clear: () => { tout.innerHTML = ""; return null; },
    exit: () => { openTerm(false); return null; },
    echo: (a) => esc(a.join(" ")),
    date: () => new Date().toString(),
    pwd: () => "/home/alan/portfolio",
    sudo: () => `<span class="e">alan is not in the sudoers file. This incident will be reported.</span>`,
    rm: () => `<span class="e">nice try. this page is immutable (mostly).</span>`,
    vim: () => "you're already in an editor. look left.",
    hi: () => `hi! 👋 type <span class="a">hire</span> if you want to talk.`
  };
  CMDS.hello = CMDS.hi; CMDS.emacs = CMDS.vim; CMDS.nano = CMDS.vim; CMDS["?"] = CMDS.help; CMDS.history = () => hist.join("\n");

  function run(line) {
    print(esc(line), "c");
    const [cmd, ...args] = line.trim().split(/\s+/);
    if (!cmd) return;
    const fn = CMDS[cmd.toLowerCase()];
    const res = fn ? fn(args) : `<span class="e">zsh: command not found: ${esc(cmd)}</span>. try <span class="a">help</span>`;
    if (res != null) print(res);
  }
  $("#term-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = tin.value;
    tin.value = "";
    if (v.trim()) { hist.push(v); hi = hist.length; }
    run(v);
  });
  tin.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(0, hi - 1); tin.value = hist[hi] || ""; }
    else if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.min(hist.length, hi + 1); tin.value = hist[hi] || ""; }
    else if (e.key === "Tab") {
      e.preventDefault();
      const v = tin.value;
      const parts = v.split(/\s+/);
      const pool = parts.length > 1
        ? (parts[0] === "open" ? D.projects.map((p) => p.id).concat(["blog", "github"]) : parts[0] === "theme" ? THEMES : [])
        : Object.keys(CMDS);
      const hit = pool.filter((c) => c.startsWith(parts[parts.length - 1]));
      if (hit.length === 1) { parts[parts.length - 1] = hit[0]; tin.value = parts.join(" ") + " "; }
      else if (hit.length > 1) print(hit.join("  "));
    }
  });

  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest && e.target.closest("input, textarea, [contenteditable]");
    if (e.key === "Escape") { openTerm(false); toggleSheet(false); return; }
    if (typing) return;
    if (e.key === "`" || e.key === "~") { e.preventDefault(); openTerm(); }
  });

  /* ------------------------------------------------------- mobile sheet */

  const editor = $("#editor"), srcBtn = $("#strip-src");
  function toggleSheet(open) {
    const show = open == null ? !editor.classList.contains("open") : open;
    editor.classList.toggle("open", show);
    srcBtn.setAttribute("aria-expanded", String(show));
    srcBtn.textContent = show ? "✕ close" : "{ } source";
    if (show) edScrollTo(curLine);
  }
  srcBtn.addEventListener("click", () => toggleSheet());
  $("#btn-close").addEventListener("click", () => toggleSheet(false));
  out.addEventListener("click", () => { if (isMobile() && editor.classList.contains("open")) toggleSheet(false); });

  /* --------------------------------------------------- pointer spotlight */

  const field = $(".field");
  let pm = false;
  window.addEventListener("pointermove", (e) => {
    if (pm) return;
    pm = true;
    requestAnimationFrame(() => { field.style.setProperty("--mx", e.clientX + "px"); field.style.setProperty("--my", e.clientY + "px"); pm = false; });
  }, { passive: true });

  /* ----------------------------------------------------------------- go */

  apply();
  boot();
  onScroll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { redrawCovers(); onScroll(); });
})();
