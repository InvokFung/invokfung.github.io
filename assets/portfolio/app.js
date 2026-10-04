/*
 * alan.fung runtime.
 * The page is drawn as the control flow of a program: one thread runs from main() to contact(),
 * work() is a wall of live sketches, skills() a patch bay and history a horizontal for-loop.
 * The hero is my name written as sound (spectro.js); the tiles run on sims.js.
 * "</> source" slides in the page's own source; its dotted values are live and recompile the page.
 * Everything is generated from data.js.
 */
(() => {
  "use strict";

  const D = window.PORTFOLIO;
  const P = D.profile;
  const root = document.documentElement;
  const BASE = ((document.currentScript && document.currentScript.src) || "").replace(/[^/]*$/, "");
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
  if (mq("(pointer: fine)")) root.classList.add("fine");

  /* ------------------------------------------------------------------ state */

  const THEMES = ["midnight", "paper", "phosphor"];
  const ACCENTS = ["#c8ff4a", "#ffb547", "#6ee7ff", "#ff7aa8", "#a78bfa"];
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

  const ERAS = D.eras;
  const PROJ = D.projects;
  const FLAG = PROJ.filter((p) => p.tier === "flagship");
  const EXP = PROJ.filter((p) => p.tier !== "flagship");
  const byId = (id) => PROJ.find((p) => p.id === id || p.name.toLowerCase() === String(id).toLowerCase());
  const NOW = new Date().getFullYear();
  const eraYear = (e) => parseInt(e.id, 10) || NOW + 1;
  const WHO = D.whoami;
  // section headings live in data.js; {placeholders} are filled here
  const SEC = D.sections || {};
  const fine = () => root.classList.contains("fine");
  const FILL = {
    skills: () => SK.length,
    Flagships: () => cap(spell(FLAG.length)),
    chapters: () => cap(spell(ERAS.length)),
    notes: () => D.writing.total,
    Hover: () => (fine() ? "Hover" : "Tap"),
    hover: () => (fine() ? "hover" : "tap")
  };
  const fill = (t) => String(t || "").replace(/\{(\w+)\}/g, (m, k) => (FILL[k] ? FILL[k]() : m));
  const secTitle = (k, dflt) => split(fill((SEC[k] && SEC[k].title) || dflt));
  const secLede = (k, dflt) => esc(fill((SEC[k] && SEC[k].lede) || dflt));
  const STATUS = { live: "live", source: "on github", wip: "in progress" };
  const spell = (n) => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] || String(n);
  const cap = (w) => String(w).charAt(0).toUpperCase() + String(w).slice(1);
  const SK = D.skills.flatMap((g) => g.items.map(([name, since, proof]) => ({ name, since, proof, group: g.group })));
  const proves = (p, s) => (p.stack || []).includes(s.name) || (p.uses || []).includes(s.name);
  const usedBy = (s) => PROJ.filter((p) => proves(p, s));
  const skillsOf = (p) => SK.filter((s) => proves(p, s));
  const ext = (u) => (/^https?:/.test(u) ? ` target="_blank" rel="noopener"` : "");
  // a link from data.js: #section scrolls there, #work/<id> goes to that tile
  const hrefAttrs = (link) => {
    const m = link.match(/^#work\/([\w-]+)$/);
    if (m) return `href="${esc(link)}" data-tile="${esc(m[1])}"`;
    if (link[0] === "#") return `href="${esc(link)}" data-go="${esc(link.slice(1))}"`;
    return `href="${esc(link)}"${ext(link)}`;
  };

  /* ----------------------------------------------------------------- output */

  const out = $("#out");
  let wi = 0;
  const words = (s, em) => s.split(/(\s+)/).map((w) => (/^\s+$/.test(w) || !w ? w : `<span class="w"><span style="--i:${wi++}">${em ? `<em>${esc(w)}</em>` : esc(w)}</span></span>`)).join("");
  const split = (s) => { wi = 0; return s.split(/(<em>[^<]*<\/em>)/).map((part) => (part.startsWith("<em>") ? words(part.slice(4, -5), true) : words(part))).join(""); };
  const node = (fn, ix, id) => `<div class="node" data-node="${id}"><span class="ix">${ix}</span><b>${esc(fn)}</b></div>`;

  function chap(e, i) {
    const last = i === ERAS.length - 1;
    return `<article class="chap" data-ref="e:${e.id}" data-i="${i}">
      <div class="yr-node">${esc(e.label)}</div>
      <div class="big" aria-hidden="true">${esc(e.label)}</div>
      <div class="role">${esc(e.role)}</div>
      <h3>${esc(e.title)}</h3>
      <p class="t">${esc(e.text)}</p>
      ${e.picked.length ? `<div class="picked">${e.picked.map((p) => `<span>+ ${esc(p)}</span>`).join("")}</div>` : ""}
      ${e.grew
        ? `<ul class="events grew">${e.grew.map(([y, from, id]) => byId(id) && `<li><button type="button" class="yr" data-goto="${esc(y)}">${esc(y)}</button><span>${esc(from)} <span class="to">→</span> <button type="button" class="lnk" data-case="${id}">${esc(byId(id).name)}</button></span></li>`).filter(Boolean).join("")}</ul>`
        : last ? `<ul class="events">${e.events.map(([d, t]) => `<li><b>${esc(d)}</b> ${esc(t)}</li>`).join("")}</ul>` : ""}
      ${shipsHTML(e)}
      ${last ? `<div class="close-brace" aria-hidden="true">}</div>` : ""}
    </article>`;
  }

  // the chapter's pills: its projects (unless `grew` already links them) and the smaller things it shipped
  function shipsHTML(e) {
    const traced = new Set((e.grew || []).map((g) => g[2]));
    const projs = (e.projects || []).map((id) => byId(id)).filter((p) => p && !traced.has(p.id))
      .map((p) => `<button type="button" class="btn sm ghost" data-case="${p.id}">${esc(p.name)} <span class="arr">↗</span></button>`);
    const built = (e.built || []).map(([n, href]) => href
      ? `<a class="btn sm ghost" href="${esc(href)}"${ext(href)}>${esc(n)} <span class="arr">↗</span></a>`
      : `<span class="btn sm ghost unfinished" title="never shipped">${esc(n)} · unfinished</span>`);
    return projs.length + built.length ? `<div class="ships">${projs.concat(built).join("")}</div>` : "";
  }
  // things shipped up to and including chapter i: its live projects plus the built items that have a link
  const shippedBy = (i) => ERAS.slice(0, i + 1).reduce((n, e) => n + (e.projects || []).filter((id) => byId(id) && byId(id).status !== "wip").length + (e.built || []).filter((b) => b[1]).length, 0);
  const notesBy = (y) => Object.entries(D.writing.byYear || {}).reduce((n, [k, v]) => n + (+k <= y ? v : 0), 0);
  const metrics = (p, cls) => (p.metrics ? `<span class="${cls}">${p.metrics.map(([v, l]) => `<span><b>${esc(v)}</b><i>${esc(l)}</i></span>`).join("")}</span>` : "");

  // what each sketch shows, for screen readers
  const SIM_LABEL = {
    relay: "Requests flowing through Relay to three regions. Take us-east down, or switch Relay off.",
    tracewise: "A checkout system with traffic flowing through it. Click a service to break it and see which one Tracewise blames.",
    onboard: "Fourteen customer records from three exports, merged into customer rows.",
    atlas: "Where in time the matching notes were written.",
    intonation: "A pitch trace in cents around the nearest note.",
    arena: "A thousand players on one server, flashing as their flips come back. Click one to drop it.",
    layerline: "One layer of a sliced gear being printed. Drag up or down to pick a layer."
  };
  // a tile: the question, a live sketch you can poke, and the measured number
  function tile(p, i) {
    const m = p.metrics && p.metrics[0];
    return `<article class="tile t-${p.id}${p.featured ? " big" : ""} rv" data-sim="${p.id}" data-ref="p:${p.id}" style="--c-raw:${esc(p.color || "#c8ff4a")}">
      <header class="t-top">
        <span class="t-ix">${String(i + 1).padStart(2, "0")}</span>
        <button type="button" class="t-name" data-case="${p.id}" aria-label="${esc(p.name)}: open the case study">${esc(p.name)}</button>
        <span class="t-kind">${esc(p.kind)}</span>
      </header>
      <p class="t-q">${esc(p.question)}</p>
      <div class="t-stage">
        ${p.id === "atlas" ? `<form class="atlas-q" role="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="ask my notes anything" aria-label="Search my notes" autocomplete="off" spellcheck="false" enterkeyhint="search" /></form><ol class="atlas-res" aria-live="polite"></ol>` : ""}
        <canvas class="sim" role="img" aria-label="${esc(SIM_LABEL[p.id] || p.pitch)}"></canvas>
      </div>
      <div class="t-ctl"><div class="sim-ctl"></div><p class="sim-read" aria-live="polite"></p></div>
      <footer class="t-foot">
        ${m ? `<span class="t-m"><b>${esc(m[0])}</b><i>${esc(m[1])}</i></span>` : ""}
        <span class="t-links">${p.links.live ? `<a href="${esc(p.links.live)}"${ext(p.links.live)}>open it ↗</a>` : ""}<button type="button" data-case="${p.id}">case study</button></span>
      </footer>
    </article>`;
  }

  out.insertAdjacentHTML("beforeend", `
    <section class="sec hero" id="hero" data-block="main" aria-label="Intro">
      <div class="eyebrow rv"><span class="avail"><span class="dot" aria-hidden="true"></span>${esc(P.role)}</span><span>${esc(P.education || "")}</span><span>@${esc(P.handle)}</span></div>
      <h1 class="sr" id="hero-name">${esc(state.name || P.name)}</h1>
      <div class="spec rv" id="spec-wrap"><canvas id="spec" aria-hidden="true"></canvas></div>
      <p class="err" id="hero-err" hidden>TypeError: alan.name is undefined. Type a name in the source.</p>
      <div class="hero-row">
        <p class="hero-tag rv">${esc(P.tagline)}</p>
        <div class="hear rv">
          <p class="hear-cap" id="hear-cap" aria-live="polite"></p>
          <div class="hear-btns">
            <button type="button" class="btn" id="hear"><span class="ic" aria-hidden="true">▶</span> <span class="t">hear it</span></button>
            <button type="button" class="btn ghost" id="sing"><span class="ic dot" aria-hidden="true"></span> <span class="t">sing to it</span></button>
          </div>
        </div>
      </div>
    </section>

    <section class="sec whoami" id="whoami" data-block="whoami" aria-label="Who I am">
      ${node("whoami()", "01", "whoami")}
      <ol class="who-lines">
        ${WHO.lines.map((l, i) => `<li class="wl rv" data-ref="t:${i}">
          <button type="button" class="wl-head" aria-expanded="false" aria-controls="wl-${i}">
            <span class="wl-k">${esc(l.k)}</span>
            <span class="wl-n"><b>${esc(l.n)}</b><i>${esc(l.unit)}</i></span>
            <span class="wl-plus" aria-hidden="true"></span>
          </button>
          <div class="wl-proof" id="wl-${i}"><div><p>${esc(l.proof)}</p>${l.link ? `<a ${hrefAttrs(l.link)}>${esc(l.linkText || "more")} →</a>` : ""}</div></div>
        </li>`).join("")}
      </ol>
      <div class="who-aside rv">${WHO.aside.map((a) => `<p><span class="ic" aria-hidden="true">${esc(a.icon)}</span><span>${esc(fill(a.text))} ${a.link ? `<a ${a.link === "#hero" ? `href="#hero" data-act="sing"` : hrefAttrs(a.link)}>${esc(a.linkText)} →</a>` : ""}</span></p>`).join("")}</div>
    </section>

    <section class="sec work" id="work" data-block="work" aria-label="Work">
      ${node("work()", "02", "work")}
      <h2 class="title split">${secTitle("work", "{Flagships} <em>flagships</em>")}</h2>
      <p class="lede rv">${secLede("work", "Every tile is running.")}</p>
      <div class="tiles" id="tiles">${FLAG.map(tile).join("")}</div>
      <p class="also rv">${esc(fill(SEC.experiments || ""))} ${EXP.map((p) => `<a href="${esc(p.links.live || p.links.source)}"${ext(p.links.live || p.links.source)}>${esc(p.name)} ↗</a>`).join(" ")} <a href="${esc(P.github)}?tab=repositories" target="_blank" rel="noopener">older experiments on GitHub ↗</a></p>
    </section>

    <section class="sec skills" id="skills" data-block="skills" aria-label="Skills">
      ${node("skills()", "03", "skills")}
      <h2 class="title split">${secTitle("skills", "What I can do, <em>wired</em> to the proof")}</h2>
      <p class="lede rv">${secLede("skills", "{skills} skills, each plugged into the work that proves it.")}</p>
      <div class="bay rv" id="bay">
        <svg class="cables" id="cables" aria-hidden="true"></svg>
        <div class="bay-groups">${D.skills.map((g, gi) => `<div class="bg" data-g="${gi}"><div class="bg-h">${esc(g.group)}</div>${g.items.map(([n]) => { const i = SK.findIndex((x) => x.name === n); const sk = SK[i]; return `<button type="button" class="sk${usedBy(sk).length ? "" : " none"}" data-s="${i}" data-ref="s:${i}"><i class="jack" aria-hidden="true"></i><span class="nm">${esc(n)}</span><span class="since">${sk.since}</span></button>`; }).join("")}</div>`).join("")}</div>
        <div class="bay-jacks">${PROJ.map((p) => `<button type="button" class="pj" data-p="${p.id}" style="--c-raw:${esc(p.color || "#c8ff4a")}"><i class="jack" aria-hidden="true"></i><span class="nm">${esc(p.name)}</span><span class="k">${esc(p.kind)}</span></button>`).join("")}</div>
        <p class="bay-read" id="bay-read" aria-live="polite"></p>
      </div>
    </section>

    <section class="sec history" id="history" data-block="history" aria-label="History">
      <div class="intro" id="intro">
        ${node("for (const year of alan.life)", "04", "history")}
        <h2 class="title split">${secTitle("history", "How I got <em>here</em>")}</h2>
        <p class="lede rv">${secLede("history", "{chapters} chapters, from my first commit to what's next.")}</p>
      </div>
      <div class="pin" id="pin"><div class="stage" id="stage">
        <div class="stage-top"><span><span class="kw">for</span> (const year <span class="kw">of</span> alan.life) { <b id="loop-year"></b></span><span class="counters">skills <b id="c-skills">0</b> shipped <b id="c-ship">0</b> notes <b id="c-notes">0</b> years <b id="c-years">0</b></span></div>
        <div class="track" id="track"><svg class="loop-thread" id="loop-thread" aria-hidden="true"></svg>${ERAS.map(chap).join("")}</div>
        <div class="rail" id="rail" role="tablist" aria-label="Jump to a year"><span class="fill" id="rail-fill"></span>${ERAS.map((e, i) => `<button type="button" role="tab" data-i="${i}"><span>${esc(e.label)}</span></button>`).join("")}</div>
      </div></div>
    </section>

    <section class="sec contact" id="contact" data-block="contact" aria-label="Contact">
      ${node("contact()", "05", "contact")}
      <h2 class="title split">${secTitle("contact", "Say <em>hello</em>")}</h2>
      <p class="lede rv">${secLede("contact", "Run the line below.")}</p>
      <button type="button" class="hire rv" id="hire" data-node-end><span><span class="kw">await</span> alan<span class="p">.</span><span class="fn">contact</span><span class="p">()</span></span><span class="caret" aria-hidden="true"></span></button>
      <div class="promise" id="promise" hidden></div>
      <footer class="foot">
        <span>© ${NOW} ${esc(P.name)} · hand-written, no framework, served from GitHub Pages</span>
        <span class="latest">latest note: <a href="${esc(D.writing.latest[0].url)}">${esc(D.writing.latest[0].title)}</a></span>
        <span><a href="/blog/">blog</a> · <a href="${esc(P.github)}" target="_blank" rel="noopener">github</a> · press <b>\`</b> for a terminal</span>
      </footer>
    </section>
  `);

  /* ------------------------------------------------- hero: the name as sound */

  const S = window.Strings;
  const nameEl = $("#hero-name"), hearBtn = $("#hear"), singBtn = $("#sing"), hearCap = $("#hear-cap");
  const CAP = { idle: "That's my name, written as sound.", playing: "Drawn live from the audio you're hearing.", listening: "Listening. Sing or play a note and it scrolls in." };
  let nameIn = false;
  function heroState(st) {
    hearBtn.classList.toggle("on", st === "playing");
    singBtn.classList.toggle("on", st === "listening");
    $(".ic", hearBtn).textContent = st === "playing" ? "■" : "▶";
    $(".t", hearBtn).textContent = st === "playing" ? "stop" : "hear it";
    $(".t", singBtn).textContent = st === "listening" ? "stop listening" : "sing to it";
    root.classList.toggle("singing", st === "listening");
    hearCap.textContent = CAP[st] || CAP.idle;
  }
  const spec = window.Spectro ? new window.Spectro($("#spec"), {
    name: state.name.trim() || "undefined",
    onState: heroState,
    onRead: (s) => { if (spec.state === "listening") hearCap.innerHTML = s ? `you: <b>${esc(s)}</b>` : CAP.listening; }
  }) : null;
  heroState("idle");
  hearBtn.addEventListener("click", async () => {
    if (!spec) return;
    if (spec.state === "playing") { spec.stop(); return; }
    hearCap.textContent = "rendering…";
    if (!(await spec.hear())) { heroState("idle"); toast("this browser can't play sound here"); }
  });
  async function singNow(on) {
    if (!spec) return;
    if (!on) { spec.stop(); return; }
    hearCap.textContent = "asking for the microphone…";
    const ok = await spec.sing(true);
    if (ok !== true) { heroState("idle"); hearCap.textContent = ok === "blocked" ? "The microphone is blocked. Hold the picture instead." : "No microphone here. Hover the picture instead."; }
  }
  singBtn.addEventListener("click", () => singNow(spec && spec.state !== "listening"));

  function renderName() {
    const n = state.name.trim();
    $("#hero-err").hidden = !!n;
    nameEl.textContent = n || "undefined";
    if (spec) spec.setName(n || "undefined", nameIn);
  }

  /* --------------------------------------------------------------- whoami */

  const wls = $$(".wl");
  const openWl = (li, on) => { li.classList.toggle("open", on); $(".wl-head", li).setAttribute("aria-expanded", String(on)); };
  wls.forEach((li) => {
    // a click toggles, except straight after pointing opened the line: then it means "yes, this one"
    $(".wl-head", li).addEventListener("click", () => { const on = !li.classList.contains("open") || performance.now() - (li._hov || 0) < 900; wls.forEach((x) => openWl(x, x === li && on)); });
    // with a mouse, pointing at a line opens it; it stays open until another one is pointed at
    li.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && !li.classList.contains("open")) { li._hov = performance.now(); wls.forEach((x) => openWl(x, x === li)); } });
  });

  /* ---------------------------------------------------------------- covers */
  // the case study's header image: a procedural cover per project (`motif` in data.js)

  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;color:var(--acc-ink)";
  document.body.appendChild(probe);
  const accentInk = () => getComputedStyle(probe).color;

  const TAU = Math.PI * 2;
  const MOTIFS = {
    // halftone interference: the default
    dots(g, w, h, r, t) {
      const a = 0.02 + r() * 0.05, b = 0.02 + r() * 0.05, c = 0.01 + r() * 0.04, d = 0.02 + r() * 0.06;
      const ph = r() * 6.28, cx = w * (0.2 + r() * 0.6), cy = h * (0.2 + r() * 0.6);
      const step = h < 80 ? 8 : 12;
      for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) {
        let v = Math.sin(x * a + y * b + t) + Math.sin(x * c - y * d + ph - t * 0.7) + Math.sin(Math.hypot(x - cx, y - cy) * 0.045 - t * 1.3);
        v = ((v + 3) / 6) ** 3;
        g.globalAlpha = 0.1 + v * 0.9;
        g.beginPath(); g.arc(x, y, 0.5 + v * (step * 0.32), 0, TAU); g.fill();
      }
    },
    // passages as lines of text in clusters; the ones near the query light up
    passages(g, w, h, r, t) {
      const k = 5 + Math.floor(r() * 3), C = [];
      for (let i = 0; i < k; i++) C.push([w * (0.1 + r() * 0.8), h * (0.15 + r() * 0.7), 40 + r() * 60]);
      const qx = w * (0.5 + 0.32 * Math.sin(t * 0.6 + 1)), qy = h * (0.5 + 0.28 * Math.cos(t * 0.45));
      for (let i = 0; i < 260; i++) {
        const c = C[i % k], ang = r() * TAU, rad = c[2] * Math.sqrt(r());
        const x = c[0] + Math.cos(ang) * rad * 1.6, y = c[1] + Math.sin(ang) * rad * 0.8, len = 8 + r() * 22;
        const near = Math.max(0, 1 - Math.hypot(x - qx, y - qy) / 90);
        g.globalAlpha = 0.14 + near * 0.86;
        g.fillRect(x, y, len * (0.6 + near * 0.4), near > 0.35 ? 3 : 2);
      }
      g.globalAlpha = 0.9; g.lineWidth = 1.2;
      g.beginPath(); g.arc(qx, qy, 90, 0, TAU); g.stroke();
      g.globalAlpha = 0.25; g.beginPath(); g.arc(qx, qy, 60, 0, TAU); g.stroke();
    },
    // a stave and a pitch trace wandering around the target note
    pitch(g, w, h, r, t) {
      const mid = h * 0.52, gap = Math.min(16, h / 9);
      g.globalAlpha = 0.18; g.lineWidth = 1;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(0, mid + i * gap); g.lineTo(w, mid + i * gap); g.stroke(); }
      g.globalAlpha = 0.1; g.fillRect(0, mid - gap * 0.35, w, gap * 0.7);
      const f1 = 0.012 + r() * 0.01, f2 = 0.05 + r() * 0.04;
      g.globalAlpha = 1; g.lineWidth = 2.4; g.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const settle = Math.min(1, x / (w * 0.6));
        const y = mid + (1 - settle) * gap * 2.4 * Math.sin(x * f1 + t) + gap * 0.25 * Math.sin(x * f2 + t * 3);
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      for (let x = w * 0.62; x < w; x += 22) { g.globalAlpha = 0.5 + 0.5 * Math.sin(x * 0.1 + t * 2); g.beginPath(); g.arc(x, mid + gap * 0.25 * Math.sin(x * f2 + t * 3), 2.4, 0, TAU); g.fill(); }
    },
    // a grid of cards; one triple is matched
    cards(g, w, h, r, t) {
      const small = h < 80, cw = small ? 22 : 46, ch = small ? 30 : 62, gx = small ? 8 : 14;
      const cols = Math.ceil(w / (cw + gx)) + 1, rows = Math.ceil(h / (ch + gx)) + 1;
      const n = cols * rows, pick = Math.floor(t * 0.8) * 3;
      const lit = new Set([pick % n, (pick * 7 + 5) % n, (pick * 13 + 11) % n]);
      g.lineWidth = 1.2;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const id = j * cols + i, x = i * (cw + gx) + (j % 2 ? gx : 0) - 6, y = j * (ch + gx) - 6, on = lit.has(id);
        g.globalAlpha = on ? 1 : 0.2;
        g.beginPath(); g.roundRect(x, y, cw, ch, 6); on ? g.fill() : g.stroke();
        const sym = (id * 2654435761 >>> 0) % 3, cx = x + cw / 2, cy = y + ch / 2, s = cw * 0.2;
        g.save(); if (on) g.globalCompositeOperation = "destination-out"; g.globalAlpha = on ? 1 : 0.35;
        g.beginPath();
        if (sym === 0) g.arc(cx, cy, s, 0, TAU);
        else if (sym === 1) { g.moveTo(cx, cy - s); g.lineTo(cx + s, cy + s * 0.8); g.lineTo(cx - s, cy + s * 0.8); g.closePath(); }
        else g.rect(cx - s * 0.8, cy - s * 0.8, s * 1.6, s * 1.6);
        on ? g.fill() : g.stroke(); g.restore();
      }
    },
    // stacked slices of a blob, like layers in a print
    layers(g, w, h, r, t) {
      const L = h < 80 ? 7 : 16, cx = w * (0.35 + r() * 0.3), base = h * 0.82, k = [r() * 6, r() * 6, r() * 6];
      const cur = Math.floor((t * 2.2) % L);
      for (let l = 0; l < L; l++) {
        const y0 = base - l * (h * 0.6 / L), sc = 1 - Math.abs(l / L - 0.45) * 0.9;
        g.globalAlpha = l === cur ? 1 : 0.12 + 0.4 * (l / L);
        g.lineWidth = l === cur ? 2.2 : 1;
        g.beginPath();
        for (let a = 0; a <= TAU + 0.01; a += 0.12) {
          const rr = (w * 0.22) * sc * (1 + 0.18 * Math.sin(3 * a + k[0] + l * 0.25) + 0.1 * Math.sin(5 * a + k[1]));
          const x = cx + Math.cos(a) * rr, y = y0 + Math.sin(a) * rr * 0.28;
          a ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
    },
    // rows from three exports, resolved into one row per customer
    merge(g, w, h, r, t) {
      const small = h < 80, n = small ? 4 : 7, gap = h / (n + 1), rw = small ? 12 : 22, rh = small ? 3 : 5;
      const gx = w * 0.7, gw = Math.min(w * 0.24, 150), lit = Math.floor(t * 1.2) % n;
      const gold = Array.from({ length: n }, (_, k) => gap * (k + 1));
      g.lineWidth = 1;
      for (let s = 0; s < 3; s++) {
        const x = w * (0.05 + s * 0.12), m = small ? 4 : 9;
        for (let j = 0; j < m; j++) {
          const y = h * (0.1 + 0.8 * r()), k = Math.floor(r() * n), on = k === lit;
          g.globalAlpha = on ? 0.95 : 0.14;
          g.beginPath(); g.moveTo(x + rw, y); g.bezierCurveTo(gx - w * 0.2, y, gx - w * 0.16, gold[k], gx, gold[k]); g.stroke();
          g.globalAlpha = on ? 1 : 0.35;
          g.beginPath(); g.roundRect(x, y - rh / 2, rw, rh, rh / 2); g.fill();
        }
      }
      gold.forEach((y, k) => {
        g.globalAlpha = k === lit ? 1 : 0.4;
        g.beginPath(); g.roundRect(gx, y - rh, gw, rh * 2, rh); k === lit ? g.fill() : g.stroke();
      });
    },
    // a trace waterfall: spans nest under their callers, and one of them is the culprit
    spans(g, w, h, r, t) {
      const small = h < 80, n = small ? 5 : 11, gap = (h - 20) / n, rh = small ? 4 : Math.max(8, gap * 0.34);
      const sp = [[w * 0.05, w * 0.9]], bad = 3 + Math.floor(r() * (n - 4)), scan = w * ((0.62 + t * 0.18) % 1);
      g.globalAlpha = 0.07; g.lineWidth = 1;
      for (let k = 1; k < 8; k++) { g.beginPath(); g.moveTo(w * k / 8, 0); g.lineTo(w * k / 8, h); g.stroke(); }
      for (let i = 1; i < n; i++) {
        const [px, pw] = sp[Math.floor(r() * i)], x = px + pw * (0.04 + r() * 0.4);
        sp.push([x, Math.max(12, (px + pw - x) * (0.25 + r() * 0.65))]);
      }
      g.lineWidth = 1.2;
      sp.forEach(([x, len], i) => {
        const y = 10 + gap * (i + 0.5), on = i === bad;
        g.globalAlpha = on ? 0.75 + 0.25 * Math.sin(t * 4) : x < scan && scan < x + len ? 0.7 : 0.3;
        g.beginPath(); g.roundRect(x, y - rh / 2, len, rh, rh / 2); on ? g.fill() : g.stroke();
      });
      g.globalAlpha = 0.25; g.setLineDash([3, 5]);
      g.beginPath(); g.moveTo(scan, 0); g.lineTo(scan, h); g.stroke(); g.setLineDash([]);
    },
    // requests through a chain of stages; the primary upstream is down, so they take the fallback
    route(g, w, h, r, t) {
      const small = h < 80, my = h * 0.5, split = w * 0.66, up = h * 0.26, fb = h * 0.74, stages = small ? 6 : 9;
      const ys = (u) => { // the path's y at x = u * w, bending to the fallback lane after the split
        const x = u * w; if (x <= split) return my;
        const k = Math.min(1, (x - split) / (w * 0.16)); return my + (fb - my) * k * k * (3 - 2 * k);
      };
      g.lineWidth = 1;
      const lit = Math.floor(t * 2.5) % stages;
      for (let i = 0; i < stages; i++) {
        const x = w * (0.08 + 0.52 * i / (stages - 1)), bh = h * (0.3 + 0.16 * ((i * 5) % 3) / 2);
        g.globalAlpha = i === lit ? 0.55 : 0.16; g.beginPath(); g.roundRect(x - 2, my - bh / 2, 4, bh, 2); g.fill();
      }
      g.globalAlpha = 0.5; g.lineWidth = 1.5; g.beginPath();
      for (let u = 0; u <= 1.001; u += 0.01) u ? g.lineTo(u * w, ys(u)) : g.moveTo(0, my);
      g.stroke();
      // the dead primary: dashed, ends in a cross
      const ex = w * 0.86;
      g.globalAlpha = 0.28; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(split, my);
      g.bezierCurveTo(split + w * 0.08, my, split + w * 0.08, up, split + w * 0.16, up); g.lineTo(ex, up); g.stroke(); g.setLineDash([]);
      const c = small ? 4 : 7; g.globalAlpha = 0.6; g.lineWidth = 2;
      g.beginPath(); g.moveTo(ex - c, up - c); g.lineTo(ex + c, up + c); g.moveTo(ex + c, up - c); g.lineTo(ex - c, up + c); g.stroke();
      // requests in flight
      const n = small ? 9 : 16, rad = small ? 2 : 3.2;
      for (let i = 0; i < n; i++) {
        const u = (i / n + t * 0.12 + (r() - 0.5) * 0.035 + 1) % 1;
        g.globalAlpha = 0.45 + 0.55 * u; g.beginPath(); g.arc(u * w, ys(u), rad, 0, TAU); g.fill();
      }
    }
  };

  function drawCover(cv, t) {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = g.strokeStyle = cv._ink || (cv._ink = accentInk());
    (MOTIFS[cv.dataset.motif] || MOTIFS.dots)(g, w, h, rng(+cv.dataset.seed), t);
    g.globalAlpha = 1;
  }
  function redrawCovers() { $$("canvas.cover").forEach((cv) => { cv._ink = null; drawCover(cv, 0); }); }

  /* ----------------------------------------------------------------- tiles */

  const tiles = $$(".tile");
  if (window.Sims) tiles.forEach((t) => window.Sims.mount(t, t.dataset.sim, { notes: BASE + "notes.js" }));
  // a link to one tile scrolls to it and makes it blink
  function focusTile(id) {
    const t = $(`.tile[data-sim="${id}"]`);
    if (!t) return;
    const r = t.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top - Math.max(80, (window.innerHeight - r.height) / 2), behavior: state.motion ? "smooth" : "auto" });
    t.classList.remove("ping"); void t.offsetWidth; t.classList.add("ping");
  }

  /* --------------------------------------------------------- the thread */

  const SVGNS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs, parent) => { const el = document.createElementNS(SVGNS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); if (parent) parent.appendChild(el); return el; };
  const thread = $("#thread");
  const tBase = mk("path", { class: "base" }, thread);
  const tLit = mk("path", { class: "lit" }, thread);
  const tFlow = mk("path", { class: "flow" }, thread);
  const tRing = mk("circle", { class: "pulse-ring", r: 11 }, thread);
  const tPulse = mk("circle", { class: "pulse", r: 4.5 }, thread);
  let tLen = 0, tSamples = [];

  const relTo = (el, host) => { const a = el.getBoundingClientRect(), b = host.getBoundingClientRect(); return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }; };

  function sway(x0, y0, x1, y1, amp) {
    const dy = y1 - y0;
    const mx = (x0 + x1) / 2 + amp, my = (y0 + y1) / 2;
    return ` C ${x0} ${y0 + dy * 0.25}, ${mx} ${my - dy * 0.22}, ${mx} ${my} S ${x1} ${y1 - dy * 0.25}, ${x1} ${y1}`;
  }

  function layoutThread() {
    const H = out.scrollHeight;
    thread.setAttribute("height", H);
    thread.setAttribute("viewBox", `0 0 ${out.clientWidth} ${H}`);
    thread.style.height = H + "px";
    const gap = parseFloat(getComputedStyle(out).getPropertyValue("--gap")) || 40;
    const gxAbs = parseFloat(getComputedStyle(out).paddingLeft) - gap;
    const amp = Math.min(gap * 0.55, 30);
    const dotY = (sel) => { const el = $(sel); if (!el) return null; const r = relTo(el, out); return r.y + r.h / 2; };

    // the thread leaves the spectrogram from its time axis, where the sound ends
    const sp = relTo($("#spec"), out);
    const start = { x: gxAbs, y: sp.y + sp.h - 9 };
    const yWho = dotY('[data-node="whoami"]');
    const yWork = dotY('[data-node="work"]');
    const ySki = dotY('[data-node="skills"]');
    const yHis = dotY('[data-node="history"]');
    const secR = relTo($("#history"), out);
    const pinR = relTo($("#pin"), out);
    const yCon = dotY('[data-node="contact"]');
    const hire = relTo($("#hire"), out);

    let d = `M ${sp.x + 30} ${start.y} C ${sp.x} ${start.y}, ${gxAbs} ${start.y}, ${gxAbs} ${start.y + 30}`;
    d += sway(gxAbs, start.y + 30, gxAbs, yWho, -amp);
    d += sway(gxAbs, yWho, gxAbs, yWork, amp);
    d += sway(gxAbs, yWork, gxAbs, ySki, -amp);
    d += sway(gxAbs, ySki, gxAbs, yHis, amp);
    d += ` L ${gxAbs} ${pinR.y}`; // hands over to the loop thread at the top of the stage
    // the loop runs sideways inside the pinned stage; the main thread resumes below it
    const resume = secR.y + secR.h;
    d += ` M ${gxAbs} ${resume - 40}`;
    d += sway(gxAbs, resume - 40, gxAbs, yCon, -amp);
    const hy = hire.y + hire.h / 2;
    d += ` C ${gxAbs} ${yCon + (hy - yCon) * 0.6}, ${gxAbs} ${hy}, ${hire.x} ${hy}`;

    [tBase, tLit, tFlow].forEach((p) => p.setAttribute("d", d));
    tLen = tLit.getTotalLength();
    tLit.style.strokeDasharray = `${tLen} ${tLen}`;
    tSamples = [];
    for (let l = 0; l <= tLen; l += 6) { const p = tLit.getPointAtLength(l); tSamples.push([l, p.x, p.y]); }
    strThread();
  }

  function lenAtY(y) {
    let lo = 0, hi = tSamples.length - 1;
    if (!tSamples.length) return [0, null];
    if (y <= tSamples[0][2]) return [0, tSamples[0]];
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tSamples[m][2] <= y) lo = m; else hi = m - 1; }
    return [tSamples[lo][0], tSamples[lo]];
  }

  function updateThread() {
    const or = out.getBoundingClientRect();
    const y = window.innerHeight * 0.62 - or.top;
    const [l, s] = lenAtY(y);
    tLit.style.strokeDashoffset = String(tLen - l);
    const show = s && Math.abs(s[2] - y) < 80 && l > 60; // not while it is still leaving the hero, where it would sit on the text
    [tPulse, tRing].forEach((c) => { c.style.opacity = show ? 1 : 0; if (s) { c.setAttribute("cx", s[1]); c.setAttribute("cy", s[2]); } });
  }

  /* ------------------------------------------------------- history loop */

  const pin = $("#pin"), stage = $("#stage"), track = $("#track");
  const chaps = $$(".chap", track);
  const railBtns = $$("#rail button");
  const loopSvg = $("#loop-thread");
  const lBase = mk("path", { class: "base" }, loopSvg);
  const lLit = mk("path", { class: "lit" }, loopSvg);
  const lPulse = mk("circle", { class: "pulse", r: 5 }, loopSvg);
  let dist = 0, chapLeft = [], lLen = 0, lSamples = [], loopP = 0, active = -1, inLoop = false;

  // a busy chapter sheds detail until it clears the year rail: less space on top, then the log, then the chips
  function fitChaps() {
    const st = stage.getBoundingClientRect().top, limit = $("#rail").getBoundingClientRect().top - st - 14;
    chaps.forEach((c) => {
      c.classList.remove("fit1", "fit2", "fit3", "fit4");
      const top = c.getBoundingClientRect().top - st;
      const bottom = () => top + Math.max(...[...c.children].filter((el) => getComputedStyle(el).position !== "absolute").map((el) => el.offsetTop + el.offsetHeight));
      for (let k = 1; k <= 4 && bottom() > limit; k++) c.classList.add("fit" + k);
    });
  }

  function layoutLoop() {
    fitChaps();
    const stageW = stage.clientWidth;
    const trackW = chaps.reduce((s, c) => s + c.offsetWidth, 0);
    track.style.width = trackW + "px";
    dist = Math.max(0, trackW - stageW);
    // sticky only works inside the parent's content box, so the pin is as tall as the scroll it absorbs
    pin.style.height = stage.offsetHeight + dist + "px";
    chapLeft = chaps.map((c) => c.offsetLeft);
    // the loop thread is a wave through the year nodes that grows with every chapter: its height at
    // each year is how many of today's skills I had by then
    const ny = $(".yr-node", chaps[0]).offsetTop;
    const nodeX = (i) => chapLeft[i] + $(".yr-node", chaps[i]).offsetLeft;
    const gap = parseFloat(getComputedStyle(out).getPropertyValue("--gap")) || 40;
    const x0 = nodeX(0) - gap;
    const amps = ERAS.map((e) => 4 + 40 * (SK.filter((x) => x.since <= eraYear(e)).length / SK.length));
    loopSvg.setAttribute("width", trackW);
    loopSvg.setAttribute("height", stage.clientHeight);
    loopSvg.style.width = trackW + "px";
    let d = `M ${x0} 0 C ${x0} ${ny * 0.6}, ${x0} ${ny}, ${nodeX(0)} ${ny}`;
    for (let i = 1; i < chaps.length; i++) {
      const a = nodeX(i - 1), b = nodeX(i), A = (amps[i - 1] + amps[i]) / 2;
      for (let x = a + 6; x < b; x += 6) { const u = (x - a) / (b - a); d += ` L ${x.toFixed(1)} ${(ny - A * Math.sin(u * TAU) * Math.sin(u * Math.PI)).toFixed(1)}`; }
      d += ` L ${b} ${ny}`;
    }
    d += ` L ${trackW} ${ny}`;
    lBase.setAttribute("d", d); lLit.setAttribute("d", d);
    lLen = lLit.getTotalLength();
    lLit.style.strokeDasharray = `${lLen} ${lLen}`;
    lSamples = [];
    for (let l = 0; l <= lLen; l += 8) { const p = lLit.getPointAtLength(l); lSamples.push([l, p.x, p.y]); }
    strLoop();
  }

  const setNum = (el, v) => { if (el.textContent !== String(v)) el.textContent = v; };
  function updateLoop() {
    const startY = pin.getBoundingClientRect().top;
    loopP = dist ? clamp(-startY / dist, 0, 1) : 0;
    inLoop = startY <= 1 && startY > -dist - window.innerHeight * 0.5;
    root.classList.toggle("in-loop", inLoop);
    const x = loopP * dist;
    track.style.transform = `translate3d(${-x}px,0,0)`;
    const stageW = stage.clientWidth;
    const play = x + stageW * 0.45;
    let a = 0;
    for (let i = 0; i < chapLeft.length; i++) if (chapLeft[i] - x <= stageW * 0.45) a = i;
    if (a !== active) {
      active = a;
      chaps.forEach((c, i) => c.classList.toggle("on", i === a));
      railBtns.forEach((b, i) => { b.classList.toggle("on", i === a); b.classList.toggle("past", i < a); b.setAttribute("aria-selected", String(i === a)); });
      const e = ERAS[a];
      setNum($("#c-skills"), SK.filter((x) => x.since <= eraYear(e)).length);
      setNum($("#c-ship"), shippedBy(a));
      setNum($("#c-notes"), notesBy(eraYear(e)));
      setNum($("#c-years"), Math.min(eraYear(e), NOW) - P.firstCommit);
      $("#loop-year").textContent = `// ${e.label}: ${e.title}`;
      plinkYear(a);
      if (inLoop) S.Sound.pluck(penta(4 + a), 0.35, 0, { gain: 0.5 });
    }
    $("#rail-fill").style.width = ((a + 0.5) / railBtns.length) * 100 + "%";
    // lit up to the playhead
    let l = 0, s = lSamples[0];
    for (let i = 0; i < lSamples.length; i++) { if (lSamples[i][1] <= play) { l = lSamples[i][0]; s = lSamples[i]; } else break; }
    lLit.style.strokeDashoffset = String(lLen - l);
    if (s) { lPulse.setAttribute("cx", s[1]); lPulse.setAttribute("cy", s[2]); }
    updateHead();
  }

  function goChapter(i) {
    i = clamp(i, 0, chaps.length - 1);
    const docStart = window.scrollY + pin.getBoundingClientRect().top;
    const p = dist ? clamp(chapLeft[i] / dist, 0, 1) : 0;
    window.scrollTo({ top: docStart + p * dist + 2, behavior: state.motion ? "smooth" : "auto" });
  }
  railBtns.forEach((b) => b.addEventListener("click", () => goChapter(+b.dataset.i)));
  $$("[data-goto]", track).forEach((b) => b.addEventListener("click", () => goChapter(ERAS.findIndex((e) => e.id === b.dataset.goto))));

  /* ------------------------------------------------- skills: the patch bay */
  // every skill has a jack, every project has a jack, and a cable runs between them for each
  // project that uses the skill. The cables are strings too: sweep across them.

  const bay = $("#bay"), cables = $("#cables"), bayRead = $("#bay-read");
  const sks = $$(".sk", bay), pjs = $$(".pj", bay);
  let cableEls = [], bPin = -1, bCur = null, bIdle = 0, bIdleI = 0, bSeen = false, bTouched = false;
  const EDGES = SK.flatMap((sk, i) => usedBy(sk).map((p) => ({ i, p })));

  function layoutBay() {
    cables.innerHTML = "";
    dropStr("wire:");
    cableEls = [];
    if (isMobile()) { if (bCur) light(bCur); return; }
    const br = bay.getBoundingClientRect();
    cables.setAttribute("width", br.width); cables.setAttribute("height", br.height);
    const groupsBottom = $(".bay-groups", bay).getBoundingClientRect().bottom - br.top;
    const colX = $$(".bg", bay).map((g) => g.getBoundingClientRect().left - br.left);
    const jackAt = {};
    pjs.forEach((b) => { const j = $(".jack", b).getBoundingClientRect(); jackAt[b.dataset.p] = [j.left + j.width / 2 - br.left, j.top + 1 - br.top]; });
    const lane = {};
    EDGES.forEach(({ i, p }) => {
      const sb = sks[i], j = $(".jack", sb).getBoundingClientRect(), gi = +sb.closest(".bg").dataset.g;
      const x1 = j.left + j.width / 2 - br.left, y1 = j.top + j.height / 2 - br.top;
      // cables from one column run down the gutter beside it, side by side, then fan out to their projects
      const k = (lane[gi] = (lane[gi] || 0) + 1) - 1;
      const gx = colX[gi] - 7 - (k % 7) * 2.2, yb = groupsBottom + 8 + (k % 7) * 3;
      const [x2, y2] = jackAt[p.id], dy = y2 - yb;
      const d = `M ${x1} ${y1} C ${x1 - 9} ${y1}, ${gx} ${y1}, ${gx} ${y1 + 12} L ${gx} ${yb} C ${gx} ${yb + dy * 0.6}, ${x2} ${y2 - dy * 0.6}, ${x2} ${y2}`;
      const style = `--c-raw:${p.color || "#c8ff4a"}`;
      const base = mk("path", { class: "cable", d, style }, cables);
      const flow = mk("path", { class: "cflow", d, style }, cables);
      cableEls.push({ i, p: p.id, base, flow });
      strWire(cableEls[cableEls.length - 1], cableEls.length);
    });
    if (bCur) light(bCur);
  }

  const chipsFor = (ps) => ps.map((p) => `<button type="button" class="pchip" data-case="${p.id}" style="--c-raw:${esc(p.color || "#c8ff4a")}"><i></i>${esc(p.name)}</button>`).join("");
  function readHTML(sel) {
    if (!sel) return `<span class="lab">${SK.length} skills · ${PROJ.length} projects · ${EDGES.length} cables</span> ${fine() ? "Point at a skill or a project." : "Tap a skill."}`;
    if (sel.s != null) {
      const sk = SK[sel.s], ps = usedBy(sk);
      return `<b>${esc(sk.name)}</b> <span class="lab">since ${sk.since}</span> ${ps.length ? `<span class="arrow">→</span> ${chipsFor(ps)}` : `<span class="lab">evidence:</span> ${esc(sk.proof || "notes on StudyLog")}`}`;
    }
    const p = byId(sel.p), ss = skillsOf(p);
    return `<b>${esc(p.name)}</b> <span class="lab">${esc(p.kind.toLowerCase())}</span> <span class="arrow">→</span> ${ss.map((x) => esc(x.name)).join(", ")} <button type="button" class="lnk" data-case="${p.id}">case study ↗</button>`;
  }
  function light(sel) {
    bCur = sel;
    bay.classList.toggle("focus", !!sel);
    const skOn = new Set(), pOn = new Set();
    if (sel && sel.s != null) { skOn.add(sel.s); usedBy(SK[sel.s]).forEach((p) => pOn.add(p.id)); }
    if (sel && sel.p) { pOn.add(sel.p); skillsOf(byId(sel.p)).forEach((x) => skOn.add(SK.indexOf(x))); }
    sks.forEach((b, i) => { b.classList.toggle("on", skOn.has(i)); b.classList.toggle("pin", i === bPin); });
    pjs.forEach((b) => b.classList.toggle("on", pOn.has(b.dataset.p)));
    cableEls.forEach((w) => {
      const on = !!sel && (sel.s != null ? w.i === sel.s : w.p === sel.p);
      w.base.classList.toggle("on", on); w.flow.classList.toggle("on", on);
      if (on) cables.appendChild(w.base), cables.appendChild(w.flow); // lit cables on top
    });
    bayRead.innerHTML = readHTML(sel);
  }
  function pickSkill(i, pinIt) {
    bTouched = true; stopIdle();
    if (pinIt) bPin = bPin === i ? -1 : i;
    light(bPin >= 0 ? { s: bPin } : pinIt ? null : { s: i });
  }
  bay.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const sb = e.target.closest(".sk"), pb = e.target.closest(".pj");
    if (sb) { bTouched = true; stopIdle(); light({ s: +sb.dataset.s }); }
    else if (pb) { bTouched = true; stopIdle(); light({ p: pb.dataset.p }); }
  });
  bay.addEventListener("pointerleave", () => { light(bPin >= 0 ? { s: bPin } : null); startIdle(); });
  bay.addEventListener("click", (e) => {
    const sb = e.target.closest(".sk"), pb = e.target.closest(".pj");
    if (sb) pickSkill(+sb.dataset.s, true);
    else if (pb) { if (isMobile() && bCur && bCur.p !== pb.dataset.p) { bTouched = true; stopIdle(); bPin = -1; light({ p: pb.dataset.p }); } else openCase(pb.dataset.p, pb); }
  });
  bay.addEventListener("focusin", (e) => {
    const sb = e.target.closest(".sk"), pb = e.target.closest(".pj");
    if (sb && sb.matches(":focus-visible")) light({ s: +sb.dataset.s });
    else if (pb && pb.matches(":focus-visible")) light({ p: pb.dataset.p });
  });

  // until someone touches it, the bay traces one skill after another so it reads as alive
  const demo = SK.map((x, i) => i).filter((i) => usedBy(SK[i]).length > 1);
  function stopIdle() { clearInterval(bIdle); bIdle = 0; }
  function startIdle() {
    stopIdle();
    if (bTouched || !bSeen || !state.motion || bPin >= 0 || !demo.length) return;
    bIdle = setInterval(() => { light({ s: demo[bIdleI++ % demo.length] }); }, 2200);
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((en) => { bSeen = en[0].isIntersecting; bSeen ? startIdle() : stopIdle(); }, { threshold: 0.35 }).observe(bay);
  }
  light(null);

  /* -------------------------------------------------------------- strings */
  // The lines on the page are strings: moving the pointer across one plucks it, the wave equation
  // in strings.js moves it, and with sound on it rings (Karplus-Strong) at a pitch of its own.

  const strs = new Map(); // name → string
  const PENTA = [0, 2, 4, 7, 9]; // D major pentatonic: any run of these notes sounds like music
  const penta = (n) => 146.83 * Math.pow(2, (12 * Math.floor(n / 5) + PENTA[((n % 5) + 5) % 5]) / 12);
  let sRaf = 0;
  const wake = () => { if (!sRaf) sRaf = requestAnimationFrame(tickStrings); };

  // points: [[x, y], …] along the line in the host's coordinates; a jump starts a new segment
  function addStr(name, host, paths, points, o) {
    const runs = [[]], step = o.step || 8;
    points.forEach((p, i) => {
      const q = points[i - 1];
      if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) > step * 3) runs.push([]);
      runs[runs.length - 1].push(p);
    });
    const segs = runs.filter((r) => r.length > 3).map((r) => {
      const n = r.length, pts = new Float32Array(n * 2), nrm = new Float32Array(n * 2), bb = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++) {
        const [x, y] = r[i], a = r[Math.max(0, i - 1)], b = r[Math.min(n - 1, i + 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        pts[2 * i] = x; pts[2 * i + 1] = y; nrm[2 * i] = -dy / l; nrm[2 * i + 1] = dx / l;
        bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y);
      }
      return { n, pts, nrm, bb, w: new S.Wave(n, o.wave) };
    });
    const s = Object.assign({ name, host, paths, segs, d0: paths.map((p) => p.getAttribute("d")), last: 0, busy: false, min: 3, max: 14 }, o);
    strs.set(name, s);
    return s;
  }
  const dropStr = (prefix) => { [...strs.keys()].forEach((k) => { if (k.startsWith(prefix)) strs.delete(k); }); };

  function strPath(s) {
    let d = "";
    for (const g of s.segs) {
      const { n, pts, nrm } = g, u = g.w.u;
      for (let i = 0; i < n; i++) d += (i ? "L" : "M") + (pts[2 * i] + nrm[2 * i] * u[i]).toFixed(1) + " " + (pts[2 * i + 1] + nrm[2 * i + 1] * u[i]).toFixed(1);
    }
    return d;
  }

  function tickStrings(t) {
    sRaf = 0;
    let again = false;
    strs.forEach((s) => {
      let moving = false;
      for (const g of s.segs) if (g.w.awake) { g.w.step(); moving = true; }
      if (moving || s.busy) {
        const d = moving ? strPath(s) : null;
        s.paths.forEach((p, i) => p.setAttribute("d", d || s.d0[i]));
      }
      // with reduced motion a pluck only glows
      if (s.flash) { if (t - s.flash < 700) moving = true; else s.flash = 0; }
      s.busy = moving;
      if (moving) again = true;
    });
    if (again) wake();
  }

  function hitStr(s, ax, ay, bx, by, speed, cx, now) {
    if (now - s.last < (s.cool || 70)) return;
    const m0 = Math.min(ax, bx) - 30, m1 = Math.max(ax, bx) + 30, n0 = Math.min(ay, by) - 30, n1 = Math.max(ay, by) + 30;
    const ex = bx - ax, ey = by - ay;
    for (const g of s.segs) {
      if (g.bb[2] < m0 || g.bb[0] > m1 || g.bb[3] < n0 || g.bb[1] > n1) continue;
      const { n, pts, nrm } = g, u = g.w.u;
      for (let i = 0; i < n - 1; i++) {
        const x1 = pts[2 * i] + nrm[2 * i] * u[i], y1 = pts[2 * i + 1] + nrm[2 * i + 1] * u[i];
        const x2 = pts[2 * i + 2] + nrm[2 * i + 2] * u[i + 1], y2 = pts[2 * i + 3] + nrm[2 * i + 3] * u[i + 1];
        if (Math.max(x1, x2) < m0 || Math.min(x1, x2) > m1 || Math.max(y1, y2) < n0 || Math.min(y1, y2) > n1) continue;
        const fx = x2 - x1, fy = y2 - y1, den = ex * fy - ey * fx;
        if (!den) continue;
        const tA = ((x1 - ax) * fy - (y1 - ay) * fx) / den, tB = ((x1 - ax) * ey - (y1 - ay) * ex) / den;
        if (tA < 0 || tA > 1 || tB < 0 || tB > 1) continue;
        const k = tB < 0.5 ? i : i + 1;
        pluck(s, g, k, Math.sign(ex * nrm[2 * k] + ey * nrm[2 * k + 1]) || 1, speed, cx, now);
        return;
      }
    }
  }

  function pluck(s, g, k, side, speed, cx, now) {
    s.last = now;
    const a = clamp(speed * (s.gainK || 8), s.min, s.max) * side, vel = clamp(Math.abs(a) / s.max, 0.15, 1);
    if (!state.motion) s.flash = now;
    else if (s.local) g.w.bump(k, a, s.local); else g.w.tri(k, a);
    if (s.note) S.Sound.pluck(s.note(g, k), vel, (cx / window.innerWidth) * 2 - 1, { gain: s.vol });
    if (s.onPluck) s.onPluck(s, vel);
    wake();
  }

  // the pointer: one segment per move, tested against every string it could have crossed
  let px = null, py = null, pt = 0;
  const caseEl = $("#case"), termEl = $("#term");
  function strMove(x, y) {
    const now = performance.now();
    if (px != null && now - pt < 160 && caseEl.hidden && termEl.hidden) {
      const speed = Math.hypot(x - px, y - py) / Math.max(8, now - pt);
      const rects = new Map();
      strs.forEach((s) => {
        let r = rects.get(s.host);
        if (!r) { r = s.host.getBoundingClientRect(); rects.set(s.host, r); }
        if (Math.max(x, px) < r.left - 30 || Math.min(x, px) > r.right + 30 || Math.max(y, py) < r.top - 30 || Math.min(y, py) > r.bottom + 30) return;
        hitStr(s, px - r.left, py - r.top, x - r.left, y - r.top, speed, x, now);
      });
    }
    px = x; py = y; pt = now;
  }
  window.addEventListener("pointermove", (e) => strMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener("pointerdown", (e) => { px = e.clientX; py = e.clientY; pt = performance.now(); if (S.Sound.on) S.Sound.unlock(); }, { passive: true });
  ["pointerup", "pointercancel"].forEach((n) => window.addEventListener(n, (e) => { if (e.pointerType !== "mouse") px = null; }, { passive: true }));
  window.addEventListener("keydown", () => { if (S.Sound.on) S.Sound.unlock(); });

  /* sound: off until the visitor asks for it */
  const SND = "alan.fung/sound";
  const chime = () => [0, 2, 4, 7].forEach((n, i) => setTimeout(() => S.Sound.pluck(penta(5 + n), 0.6, -0.4 + i * 0.25), i * 90));
  function setSound(on, byHand) {
    S.Sound.on = on;
    try { localStorage.setItem(SND, on ? "1" : "0"); } catch (e) {}
    $$("[data-sound]").forEach((b) => { b.setAttribute("aria-pressed", String(on)); b.title = on ? "Sound on" : "Sound off"; });
    if (!on || !byHand) return;
    // ready() unlocks the output inside this click; chime only once it is actually running, and say so if it never does
    S.Sound.ready().then((ok) => {
      if (!S.Sound.on) return;
      if (ok) { chime(); toast(`sound on · ${fine() ? "sweep the cursor across" : "swipe across"} any line to play it`); }
      else { setSound(false); toast("this browser kept the audio switched off here"); }
    });
  }
  let sndSaved = false;
  try { sndSaved = localStorage.getItem(SND) === "1"; } catch (e) {}
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-sound]"); if (b) setSound(!S.Sound.on, true); });

  /* the lines */
  function strThread() {
    dropStr("thread");
    const H = Math.max(1, out.scrollHeight);
    addStr("thread", thread, [tBase, tLit, tFlow], tSamples.map((p) => [p[1], p[2]]), {
      step: 6, local: 4, min: 3, max: 14, gainK: 6, cool: 90, vol: 0.45,
      wave: { c2: 0.5, damp: 0.994, sub: 3 },
      note: (g, k) => penta(12 - Math.round((g.pts[2 * k + 1] / H) * 9))
    });
  }
  // scrolling nudges the thread a little where the pulse is
  let lastSY = window.scrollY, lastBow = 0;
  function bowThread() {
    const dy = window.scrollY - lastSY, now = performance.now();
    lastSY = window.scrollY;
    const s = strs.get("thread");
    if (!s || !state.motion || Math.abs(dy) < 24 || now - lastBow < 90) return;
    lastBow = now;
    const y = window.innerHeight * 0.62 - out.getBoundingClientRect().top;
    for (const g of s.segs) {
      if (y < g.bb[1] || y > g.bb[3]) continue;
      let k = 1;
      while (k < g.n - 2 && g.pts[2 * k + 1] < y) k++;
      g.w.bump(k, clamp(dy * 0.05, -5, 5), 3);
      wake();
      break;
    }
  }
  const skillNote = (i) => penta(15 - Math.round((i * 15) / Math.max(1, SK.length - 1)));
  function twang(i, pid) {
    [sks[i], pjs.find((b) => b.dataset.p === pid)].forEach((el) => {
      if (!el) return;
      el.classList.remove("twang"); void el.offsetWidth; el.classList.add("twang");
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("twang"), 520);
    });
  }
  function strWire(w, n) {
    const L = w.base.getTotalLength(), pts = [];
    for (let l = 0; l <= L; l += 8) { const p = w.base.getPointAtLength(l); pts.push([p.x, p.y]); }
    addStr("wire:" + n, cables, [w.base, w.flow], pts, {
      min: 3, max: 10, gainK: 7, cool: 120, vol: 0.5, wave: { c2: 0.45, damp: 0.984, sub: 3 },
      note: () => skillNote(w.i),
      onPluck: () => {
        bTouched = true; stopIdle();
        twang(w.i, w.p);
        [w.base, w.flow].forEach((el) => { el.classList.add("ring"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("ring"), 700); });
      }
    });
  }
  function strLoop() {
    dropStr("loop");
    addStr("loop", loopSvg, [lBase, lLit], lSamples.map((p) => [p[1], p[2]]), {
      step: 8, local: 5, min: 3, max: 12, gainK: 6, cool: 100, vol: 0.45, wave: { c2: 0.5, damp: 0.992, sub: 3 },
      note: (g, k) => penta(4 + Math.round((k / g.n) * 8))
    });
  }
  // turning the page to a new year plucks the loop at that year
  function plinkYear(i) {
    const s = strs.get("loop");
    if (!s || !state.motion) return;
    const x = chapLeft[i] + $(".yr-node", chaps[i]).offsetLeft;
    for (const g of s.segs) { let k = 1; while (k < g.n - 2 && g.pts[2 * k] < x) k++; g.w.bump(k, 7, 4); }
    wake();
  }

  /* -------------------------------------------------------- case studies */

  const cs = $("#case"), csScroll = $("#case-scroll");
  let csId = null, csReturn = null;
  const ORDER = [...FLAG, ...EXP];
  function caseHTML(p) {
    const i = ORDER.indexOf(p);
    const prev = ORDER[(i - 1 + ORDER.length) % ORDER.length], next = ORDER[(i + 1) % ORDER.length];
    const links = [
      p.links.live ? `<a class="btn" href="${esc(p.links.live)}"${ext(p.links.live)}>▶ open ${esc(p.name)}</a>` : "",
      p.links.source ? `<a class="btn ghost" href="${esc(p.links.source)}"${ext(p.links.source)}>&lt;/&gt; source</a>` : "",
      p.links.original ? `<a class="btn ghost" href="${esc(p.links.original)}">play the original</a>` : "",
      !p.links.live && !p.links.source ? `<span class="btn ghost" aria-disabled="true">in progress, demo coming</span>` : ""
    ].join("");
    const done = p.milestones ? p.milestones.filter((m) => m[1]).length : 0;
    return `<div class="case-in" style="--c-raw:${esc(p.color || "#c8ff4a")}">
      <button type="button" class="pill-btn case-x" id="case-x" aria-label="Close case study">esc ✕</button>
      <div class="kick"><span>git show <b>${sha(p.id + p.name)}</b></span><span class="st is-${p.status}">${STATUS[p.status]}</span><span>${p.year}</span><span>${esc(p.kind)}</span></div>
      <h2 id="case-title">${esc(p.name)}</h2>
      ${p.question ? `<p class="q">${esc(p.question)}</p>` : ""}
      <p class="pitch">${esc(p.pitch)}</p>
      ${metrics(p, "metrics")}
      <div class="actions top">${links}</div>
      <canvas class="cover" data-seed="${hash(p.id)}" data-motif="${p.motif || "dots"}" aria-hidden="true"></canvas>
      <div class="case-grid">
        ${p.why ? `<h4>why</h4><p>${esc(p.why)}</p>` : ""}
        ${p.how ? `<h4>${p.tier === "flagship" ? "how it works" : "highlights"}</h4><ol>${p.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>` : ""}
        ${p.milestones ? `<h4>milestones · ${done}/${p.milestones.length}</h4><ul class="miles">${p.milestones.map(([t, ok]) => `<li class="${ok ? "done" : ""}">${esc(t)}</li>`).join("")}</ul>` : ""}
        <h4>stack</h4><div class="tags">${p.stack.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        ${skillsOf(p).length ? `<h4>skills it proves</h4><div class="tags">${skillsOf(p).map((x) => `<button type="button" class="tag lnk" data-skill="${SK.indexOf(x)}">${esc(x.name)}</button>`).join("")}</div>` : ""}
      </div>
      <div class="case-nav">
        <button type="button" data-case="${prev.id}">← previous<b>${esc(prev.name)}</b></button>
        <button type="button" data-case="${next.id}">next →<b>${esc(next.name)}</b></button>
      </div>
    </div>`;
  }
  function openCase(id, from) {
    const p = byId(id);
    if (!p) return false;
    const wasOpen = !!csId;
    csId = p.id;
    if (!wasOpen) csReturn = document.activeElement;
    if (!wasOpen) {
      // grow from whatever was clicked, or from the middle when it is off screen
      const r = from && from.getBoundingClientRect ? from.getBoundingClientRect() : null;
      const seen = r && r.bottom > 0 && r.top < window.innerHeight;
      cs.style.setProperty("--cx", seen ? r.left + r.width / 2 + "px" : "50%");
      cs.style.setProperty("--cy", seen ? r.top + r.height / 2 + "px" : "50%");
    }
    csScroll.innerHTML = caseHTML(p);
    csScroll.scrollTop = 0;
    cs.hidden = false;
    root.style.overflow = "hidden";
    requestAnimationFrame(() => {
      cs.classList.add("open");
      drawCover($("canvas.cover", csScroll), 0);
      $("#case-x").focus({ preventScroll: true });
    });
    try { history.replaceState(null, "", "#work/" + p.id); } catch (e) {}
    return true;
  }
  function closeCase() {
    if (!csId) return;
    csId = null;
    cs.classList.remove("open");
    root.style.overflow = "";
    setTimeout(() => { if (!csId) cs.hidden = true; }, state.motion ? 900 : 0);
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    if (csReturn && csReturn.focus) csReturn.focus({ preventScroll: true });
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-case]");
    if (t && !t.closest("#bay .pj")) { e.preventDefault(); openCase(t.dataset.case, t); return; }
    if (e.target.closest("#case-x")) closeCase();
    const sk = e.target.closest("[data-skill]");
    if (sk) { closeCase(); go("skills"); bPin = -1; pickSkill(+sk.dataset.skill, true); }
    const tl = e.target.closest("[data-tile]");
    if (tl) { e.preventDefault(); focusTile(tl.dataset.tile); }
    const act = e.target.closest('[data-act="sing"]');
    if (act) { e.preventDefault(); go("hero"); setTimeout(() => singNow(true), state.motion ? 700 : 0); }
  });

  /* ------------------------------------------------------------ nav + map */

  const sections = $$(".sec[data-block]");
  const MAP = [["hero", "main()"], ["whoami", "whoami()"], ["work", "work()"], ["skills", "skills()"], ["history", "history()"], ["contact", "contact()"]];
  $("#minimap").innerHTML = MAP.map(([id, l]) => `<button type="button" data-go="${id}" aria-label="Go to ${l}"><span>${l}</span><i></i></button>`).join("");
  const headEl = $("#head");
  let curSec = null;
  function updateHead() {
    const e = ERAS[active];
    const detached = inLoop && e;
    headEl.classList.toggle("detached", !!detached);
    headEl.innerHTML = detached ? `HEAD → <b>${esc(e.label)}</b>` : `HEAD → <b>main</b>`;
  }
  function updateNav() {
    const mid = window.innerHeight * 0.45;
    let curEl = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= mid) curEl = s;
    if (curEl.id !== curSec) {
      curSec = curEl.id;
      $$(".links a").forEach((a) => a.classList.toggle("on", a.dataset.sec === curSec));
      $$("#minimap button").forEach((b) => b.classList.toggle("on", b.dataset.go === curSec));
    }
    $$(".node").forEach((n) => { const r = n.getBoundingClientRect(); n.classList.toggle("on", r.top < window.innerHeight * 0.66); });
  }
  function go(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const top = id === "hero" ? 0 : window.scrollY + el.getBoundingClientRect().top - (id === "history" ? 0 : 20);
    window.scrollTo({ top, behavior: state.motion ? "smooth" : "auto" });
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-go], .links a, .brand");
    if (!a) return;
    const id = a.dataset.go || a.dataset.sec || "hero";
    e.preventDefault();
    go(id);
  });

  /* --------------------------------------------------------------- cursor */

  const cursor = $(".cursor");
  let cx = -100, cy = -100, rx = -100, ry = -100;
  if (root.classList.contains("fine")) {
    window.addEventListener("pointermove", (e) => {
      cx = e.clientX; cy = e.clientY;
      const t = e.target;
      const txt = t.closest && t.closest("input, [contenteditable]");
      const hot = t.closest && t.closest("a, button, .live, .ln");
      const scope = t.closest && t.closest("canvas.sim, #spec");
      cursor.classList.toggle("text", !!txt);
      cursor.classList.toggle("hot", !txt && !!hot);
      cursor.classList.toggle("scope", !txt && !hot && !!scope);
    }, { passive: true });
    document.addEventListener("pointerleave", () => { cx = cy = -100; });
    (function loop() {
      rx += (cx - rx) * 0.2; ry += (cy - ry) * 0.2;
      $("i", cursor).style.transform = `translate(${cx}px,${cy}px)`;
      $("b", cursor).style.transform = `translate(${rx}px,${ry}px)`;
      requestAnimationFrame(loop);
    })();
  }

  /* ---------------------------------------------------------------- source */

  const LIVE = (k) => `\u0001${k}\u0001`;
  function buildSource() {
    const blocks = [];
    const block = (id, lines) => blocks.push({ id, lines: lines.map((l) => (typeof l === "string" ? { s: l } : l)) });
    block("main", [
      "// alan.fung: this page is a program.",
      "// dotted values are live: click or type to recompile.",
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
      `  coffee: ${LIVE("coffee")}, // cups a day; 0 and the name fades`,
      "});",
      "",
      "// the hero: alan.name as a spectrogram, 60 Hz to 8 kHz over 3.6 s",
      "spectrogram(alan.name, { from: 60, to: 8000, seconds: 3.6 });",
      "main(alan, config);"
    ]);
    block("whoami", [
      "",
      "function whoami() {",
      ...WHO.lines.map((l, i) => ({ s: `  // ${String(i + 1).padStart(2, "0")} ${l.k} ${l.n} ${l.unit}`, ref: "t:" + i })),
      `  return { role: ${q(P.role)}, studied: ${q(P.education || "")} };`,
      "}"
    ]);
    block("work", [
      "",
      "work([ // every tile is a live sketch",
      ...FLAG.map((p) => ({ s: `  ${q(p.id)}, // ${p.metrics ? p.metrics[0][0] + " " + p.metrics[0][1] : STATUS[p.status]}`, ref: "p:" + p.id })),
      "]);"
    ]);
    block("skills", [
      "",
      "patch({",
      ...D.skills.flatMap((g) => [
        `  // ${g.group.toLowerCase()}`,
        ...g.items.map(([n]) => { const i = SK.findIndex((x) => x.name === n); const ps = usedBy(SK[i]).map((p) => p.id); return { s: `  ${q(n)}: [${ps.map(q).join(", ")}],${ps.length ? "" : " // proof: notes"}`, ref: "s:" + i }; })
      ]),
      "});"
    ]);
    block("history", [
      "",
      "for (const year of alan.life) {",
      ...ERAS.map((e) => ({ s: `  chapter(${q(e.label)}, ${q(e.title)});`, ref: "e:" + e.id })),
      "}"
    ]);
    block("contact", [
      "",
      "try {",
      "  await alan.contact();",
      "} catch {",
      "  // there is no catch. say hi.",
      "}"
    ]);
    return blocks;
  }

  const KW = new Set("import from const let new await try catch export default async return true false function for of".split(" "));
  const TOK = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([\s\S])/g;
  function highlight(s) {
    let o = "", m;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(s))) {
      const [all, com, str, num, word, ws] = m;
      if (com) o += `<span class="t-com">${esc(com)}</span>`;
      else if (str) o += `<span class="t-str">${esc(str)}</span>`;
      else if (num) o += `<span class="t-num">${num}</span>`;
      else if (word) {
        const nx = s.slice(TOK.lastIndex).match(/^\s*(.)/);
        const n = nx && nx[1];
        const cls = KW.has(word) ? "t-kw" : n === "(" ? "t-fn" : n === ":" ? "t-prop" : /^[A-Z]/.test(word) ? "t-type" : "";
        o += cls ? `<span class="${cls}">${word}</span>` : word;
      } else if (ws) o += ws;
      else o += `<span class="t-p">${esc(all)}</span>`;
    }
    return o;
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
  const renderLine = (l) => l.s.split("\u0001").map((part, i) => (i % 2 ? widget(part) : highlight(part))).join("");

  const code = $("#code");
  const blocks = buildSource();
  const range = {}, refLine = {}, lineEls = [];
  {
    let i = 0;
    const html = [];
    blocks.forEach((b) => {
      range[b.id] = { start: i, end: i + b.lines.length - 1 };
      b.lines.forEach((l) => {
        if (l.ref && refLine[l.ref] == null) refLine[l.ref] = i;
        html.push(`<div class="ln" data-i="${i}" data-b="${b.id}"${l.ref ? ` data-ref="${l.ref}"` : ""}><span class="no">${i + 1}</span><span class="src">${renderLine(l) || " "}</span></div>`);
        i++;
      });
    });
    code.innerHTML = html.join("");
    lineEls.push(...$$(".ln", code));
  }
  const LIVE_COUNT = $$("[data-live]", code).length;

  /* ------------------------------------------------------------ recompile */

  const statusEl = $("#status"), tab = $("#tab");
  let lastMs = 0, curLine = 0;
  const renderStatus = () => { statusEl.innerHTML = `<span>Ln ${curLine + 1}</span><span class="ok">compiled in ${lastMs.toFixed(1)}ms</span><span>${LIVE_COUNT} live values</span><span class="sp">fung · UTF-8</span>`; };
  function syncWidgets() {
    $$("[data-live]", code).forEach((el) => {
      if (el === document.activeElement) return;
      const k = el.dataset.live;
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
    if (!key || key === "motion") { if (spec) spec.setMotion(state.motion); if (window.Sims) window.Sims.motion(state.motion); }
    if (!key || key === "coffee") { if (spec) spec.setCoffee(state.coffee); }
    if (!key || key === "name") { renderName(); if (key) relayout(); }
    if (!key || key === "theme" || key === "accent") requestAnimationFrame(() => { redrawCovers(); if (spec) spec.theme(); if (window.Sims) window.Sims.theme(); });
    syncWidgets();
    lastMs = performance.now() - t0;
    renderStatus();
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
    tab.classList.toggle("is-dirty", Object.keys(DEFAULTS).some((k) => state[k] !== DEFAULTS[k]));
    if (key) {
      store.set(state);
      const w = $(`[data-live="${key}"]`, code);
      if (w && w !== document.activeElement) { w.classList.remove("bump"); void w.offsetWidth; w.classList.add("bump"); }
      const val = key === "name" || key === "theme" || key === "accent" ? q(state[key]) : String(state[key]);
      toast(`recompiled · ${key} = <b>${esc(val)}</b> · ${lastMs.toFixed(1)}ms`);
    }
  }
  const set = (k, v) => { state[k] = v; apply(k); };
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
    if (live.dataset.live === "name") { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); live.blur(); } return; }
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
    document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text").replace(/\s+/g, " ").slice(0, 40));
  });
  code.addEventListener("focusout", (e) => { if (e.target.closest('[data-live="name"]')) syncWidgets(); });
  $("#btn-reset").addEventListener("click", () => { store.clear(); Object.assign(state, DEFAULTS); apply(); relayout(); toast("reset to defaults"); });

  // source mode
  const srcBtn = $("#btn-src");
  function setSource(on) {
    root.classList.toggle("source", on);
    srcBtn.setAttribute("aria-pressed", String(on));
    if (on) { syncEditor(true); toast("source mode · the dotted values are live"); }
  }
  srcBtn.addEventListener("click", () => setSource(!root.classList.contains("source")));
  $("#btn-close").addEventListener("click", () => setSource(false));

  // editor follows the page
  let activeBlock = null, edTarget = 0, edRaf = 0, edHold = false, litOut = null;
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
  function syncEditor(force) {
    if (!root.classList.contains("source")) return;
    const id = sections.find((s) => s.id === curSec) ? sections.find((s) => s.id === curSec).dataset.block : "main";
    const r = range[id];
    if (!r) return;
    let line = r.start;
    if (id === "history" && active >= 0) line = refLine["e:" + ERAS[active].id];
    else {
      const vh = window.innerHeight, c = vh * 0.5;
      let best = null, bd = Infinity;
      $$("[data-ref]", $(`.sec[data-block="${id}"]`)).forEach((el) => {
        const rr = el.getBoundingClientRect();
        if (rr.bottom < 0 || rr.top > vh || rr.right < 0 || rr.left > window.innerWidth) return;
        const dd = rr.top <= c && rr.bottom >= c ? 0 : Math.min(Math.abs(rr.top - c), Math.abs(rr.bottom - c));
        if (dd < bd) { bd = dd; best = el; }
      });
      if (best && bd < 120 && refLine[best.dataset.ref] != null) line = refLine[best.dataset.ref];
      else {
        const sr = $(`.sec[data-block="${id}"]`).getBoundingClientRect();
        line = r.start + Math.floor(clamp((c - sr.top) / sr.height, 0, 0.999) * (r.end - r.start + 1));
      }
    }
    if (id !== activeBlock) {
      if (activeBlock) { const o = range[activeBlock]; for (let i = o.start; i <= o.end; i++) lineEls[i].classList.remove("on"); }
      for (let i = r.start; i <= r.end; i++) lineEls[i].classList.add("on");
      code.classList.add("has-active");
      activeBlock = id;
    }
    if (line !== curLine || force) {
      lineEls[curLine] && lineEls[curLine].classList.remove("cur");
      lineEls[line].classList.add("cur");
      curLine = line;
      renderStatus();
      if (!edHold) edScrollTo(line);
      const ref = lineEls[line].dataset.ref;
      const el = ref ? $(`[data-ref="${ref}"]`, out) : null;
      if (litOut !== el) { litOut && litOut.classList.remove("lit"); el && el.classList.add("lit"); litOut = el; }
    }
  }
  function jumpTo(i) {
    const ln = lineEls[i];
    const ref = ln.dataset.ref;
    if (ref && ref.startsWith("e:")) { goChapter(ERAS.findIndex((e) => "e:" + e.id === ref)); return; }
    const target = ref && $(`[data-ref="${ref}"]`, out);
    const el = target || $(`.sec[data-block="${ln.dataset.b}"]`);
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.35, behavior: state.motion ? "smooth" : "auto" });
    ln.classList.remove("ping"); void ln.offsetWidth; ln.classList.add("ping");
  }
  out.addEventListener("pointerover", (e) => {
    if (!root.classList.contains("source")) return;
    const el = e.target.closest("[data-ref]");
    if (!el || el._hov) return;
    el._hov = true;
    const i = refLine[el.dataset.ref];
    if (i == null) return;
    const ln = lineEls[i];
    ln.classList.remove("ping"); void ln.offsetWidth; ln.classList.add("ping");
    if (!edHold) edScrollTo(i);
  });
  out.addEventListener("pointerout", (e) => { const el = e.target.closest("[data-ref]"); if (el && !el.contains(e.relatedTarget)) el._hov = false; });

  /* -------------------------------------------------------------- reveal */

  const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add("in");
      io.unobserve(en.target);
    });
  }, { rootMargin: "0px 0px -10% 0px" }) : null;
  function observe() {
    $$(".rv, .split").forEach((el) => {
      if (el.closest("#hero")) return;
      if (io) io.observe(el); else el.classList.add("in");
    });
  }
  const heroIn = () => {
    nameIn = true;
    $$("#hero .rv").forEach((el, i) => { el.style.transitionDelay = `${0.1 + i * 0.1}s`; el.classList.add("in"); });
    if (spec) setTimeout(() => spec.setName(state.name.trim() || "undefined", true), state.motion ? 250 : 0);
  };

  /* ---------------------------------------------------------------- boot */

  function boot(done) {
    let first = true;
    try { first = !sessionStorage.getItem("alan.fung/booted"); sessionStorage.setItem("alan.fung/booted", "1"); } catch (e) {}
    if (!first || !state.motion) { done(); return; }
    root.classList.add("booting");
    const log = $("#boot-log"), bar = $("#boot-bar"), el = $("#boot");
    const steps = [
      `compile alan.fung`,
      `resolving ${SK.length} skills`,
      `patching ${EDGES.length} cables to ${PROJ.length} projects`,
      `parsing ${ERAS.length} chapters, ${P.firstCommit} → next`,
      `starting ${FLAG.length} live sketches`,
      `rendering alan.name as sound`
    ];
    let i = 0, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      el.classList.add("done");
      done();
      setTimeout(() => root.classList.remove("booting"), 1000);
      ["keydown", "pointerdown", "wheel", "touchstart"].forEach((evn) => window.removeEventListener(evn, finish));
    };
    ["keydown", "pointerdown", "wheel", "touchstart"].forEach((evn) => window.addEventListener(evn, finish, { passive: true }));
    const tick = () => {
      if (finished) return;
      if (i < steps.length) {
        const d = document.createElement("div");
        d.textContent = steps[i];
        if (i === steps.length - 1) d.className = "ok";
        log.appendChild(d);
        bar.style.width = ((i + 1) / steps.length) * 100 + "%";
        i++;
        setTimeout(tick, i === steps.length ? 380 : 190);
      } else finish();
    };
    setTimeout(tick, 150);
  }

  /* -------------------------------------------------------- alan.contact() */

  const hireBtn = $("#hire"), promise = $("#promise");
  hireBtn.addEventListener("click", () => {
    if (promise.dataset.done) return;
    promise.hidden = false;
    const frames = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
    let f = 0;
    promise.innerHTML = `Promise { <span class="state">&lt;pending&gt;</span> } <span class="spin">${frames[0]}</span>`;
    const spin = setInterval(() => { const s = $(".spin", promise); if (s) s.textContent = frames[++f % frames.length]; }, 80);
    setTimeout(() => {
      clearInterval(spin);
      promise.dataset.done = "1";
      promise.innerHTML = `Promise { <span class="state">&lt;fulfilled&gt;</span>: {<br>&nbsp;&nbsp;email: <a href="mailto:${esc(P.email)}">"${esc(P.email)}"</a>,<br>&nbsp;&nbsp;github: <a href="${esc(P.github)}" target="_blank" rel="noopener">"${esc(P.github.replace("https://", ""))}"</a>,<br>} }`;
      relayout();
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
      if (!greeted) { greeted = true; print(`Welcome to <span class="a">alan@fung</span>. Type <span class="a">help</span>. Try <span class="a">checkout 2023</span> or <span class="a">show relay</span>.`); }
      setTimeout(() => tin.focus(), 30);
    } else tin.blur();
  }
  $("#btn-term").addEventListener("click", () => openTerm());
  $("#term-x").addEventListener("click", () => openTerm(false));
  const goURL = (url) => { if (/^https?:/.test(url)) window.open(url, "_blank", "noopener"); else location.href = url; };
  const gitLog = () => ERAS.slice().reverse().flatMap((e) => e.events.slice().reverse().map(([d, t]) => `<span style="color:var(--acc-ink)">*</span> <span style="color:var(--num)">${sha(d + t)}</span> ${esc(d.padEnd(7))} ${esc(t)}`)).join("\n");
  const CMDS = {
    help: () => esc([
      "whoami                 who is this",
      "ls                     list projects",
      "show <id>              open a case study (e.g. show relay)",
      "open <id|blog|github>  run a project",
      "checkout <year>        jump to a chapter (2018 … next)",
      "git log                every commit of my history",
      "skills [name]          what I build with, and where (e.g. skills c++)",
      "blog                   latest notes",
      "contact                get in touch",
      "source                 toggle the live source pane",
      "play                   hear my name as sound",
      "sing                   sing to the spectrogram (microphone)",
      "sound <on|off>         plucked lines (off until you turn it on)",
      "",
      "theme <midnight|paper|phosphor> · accent <#hex>",
      "coffee <0-9> · motion <on|off> · name <text>",
      "reset · clear · exit"
    ].join("\n")),
    whoami: () => `${esc(state.name || "undefined")} · ${esc(P.role)} · @${esc(P.handle)}\n${WHO.lines.map((l) => `${esc(l.k.padEnd(30))} ${esc(l.n)} ${esc(l.unit)}`).join("\n")}`,
    about: () => WHO.lines.map((l) => `${esc(l.k)}\n  ${esc(l.proof)}`).concat(WHO.aside.map((a) => esc(fill(a.text)))).join("\n\n"),
    ls: () => PROJ.map((p) => `${p.tier.padEnd(11)} ${STATUS[p.status].padEnd(12)} ${p.id.padEnd(15)} ${esc(p.name)}`).join("\n"),
    projects: () => CMDS.ls(),
    show: (a) => { const p = byId(a[0] || ""); if (!p) return `<span class="e">show: no project "${esc(a[0] || "")}". try ls</span>`; openTerm(false); openCase(p.id, hireBtn); return `git show ${p.id}`; },
    open: (a) => {
      const k = (a[0] || "").toLowerCase();
      if (k === "blog" || k === "studylog") { goURL("/blog/"); return "opening /blog/ …"; }
      if (k === "github") { goURL(P.github); return `opening ${esc(P.github)} …`; }
      const p = byId(k);
      if (!p) return `<span class="e">open: no project "${esc(k)}". try ls</span>`;
      const url = p.links.live || p.links.source;
      if (!url) return `${esc(p.name)} is in progress. try <span class="a">show ${p.id}</span>`;
      goURL(url);
      return `opening ${esc(p.name)} → ${esc(url)} …`;
    },
    checkout: (a) => {
      const i = ERAS.findIndex((e) => e.label === a[0] || e.id === a[0]);
      if (i < 0) return `<span class="e">checkout: pick one of ${ERAS.map((e) => e.label).join(" ")}</span>`;
      openTerm(false);
      goChapter(i);
      return `HEAD is now at ${sha(ERAS[i].id)} ${esc(ERAS[i].title)}`;
    },
    git: (a) => (a[0] === "log" ? gitLog() : a[0] === "checkout" ? CMDS.checkout(a.slice(1)) : "usage: git log | git checkout <year>"),
    skills: (a) => {
      const k = a.join(" ").toLowerCase();
      const list = k ? SK.filter((x) => x.name.toLowerCase().includes(k)) : SK;
      if (!list.length) return `<span class="e">skills: nothing matches "${esc(k)}"</span>`;
      if (k && list.length === 1) { openTerm(false); go("skills"); bPin = -1; pickSkill(SK.indexOf(list[0]), true); }
      return list.map((x) => { const ps = usedBy(x); return `${esc(x.name.padEnd(Math.max(...SK.map((s) => s.name.length)) + 2))} since ${x.since}  ${ps.length ? ps.map((p) => esc(p.id) + (p.status === "wip" ? "*" : "")).join(", ") : `<span style="color:var(--mute)">${esc(x.proof || "")}</span>`}`; }).join("\n") + (k || !PROJ.some((p) => p.status === "wip") ? "" : "\n\n* in progress");
    },
    blog: () => D.writing.latest.map((p) => `${p.date}  <a href="${esc(p.url)}">${esc(p.title)}</a>`).join("\n") + `\n\n${D.writing.total} notes in total → <a href="/blog/">/blog/</a>`,
    contact: () => `Promise { &lt;fulfilled&gt; }\nemail   <a href="mailto:${esc(P.email)}">${esc(P.email)}</a>\ngithub  <a href="${esc(P.github)}" target="_blank" rel="noopener">${esc(P.github)}</a>`,
    hire: () => CMDS.contact(),
    source: () => { setSource(!root.classList.contains("source")); return `source mode ${root.classList.contains("source") ? "on" : "off"}`; },
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
    motion: (a) => { if (!a[0]) return `motion = ${state.motion}`; set("motion", /^(on|true|1|yes)$/i.test(a[0])); return `<span class="a">✓</span> motion = ${state.motion}`; },
    name: (a) => { if (!a.length) return `name = "${esc(state.name)}"`; set("name", a.join(" ").slice(0, 40)); return `<span class="a">✓</span> name = "${esc(state.name)}"`; },
    reset: () => { $("#btn-reset").click(); return "reset to defaults"; },
    clear: () => { tout.innerHTML = ""; return null; },
    exit: () => { openTerm(false); return null; },
    echo: (a) => esc(a.join(" ")),
    date: () => new Date().toString(),
    pwd: () => "/home/alan/portfolio",
    sudo: () => `<span class="e">alan is not in the sudoers file. This incident will be reported.</span>`,
    rm: () => `<span class="e">nice try. this page is immutable (mostly).</span>`,
    vim: () => "you're already in an editor. try <span class=\"a\">source</span>.",
    hi: () => `hi! 👋 type <span class="a">contact</span> for my email and GitHub.`
  };
  CMDS.play = () => { openTerm(false); go("hero"); setTimeout(() => { if (spec && spec.state !== "playing") hearBtn.click(); }, state.motion ? 600 : 0); return `spectrogram("${esc(state.name)}") ▶`; };
  CMDS.sing = () => { openTerm(false); go("hero"); setTimeout(() => singNow(true), state.motion ? 600 : 0); return "listening…"; };
  CMDS.sound = (a) => { const on = a[0] ? a[0] === "on" : !S.Sound.on; setSound(on, on); return `sound ${on ? "on" : "off"}`; };
  CMDS.listen = CMDS.sing; CMDS.strum = CMDS.play;
  CMDS.hello = CMDS.hi; CMDS.emacs = CMDS.vim; CMDS.nano = CMDS.vim; CMDS["?"] = CMDS.help; CMDS.cd = CMDS.checkout; CMDS.history = () => hist.join("\n"); CMDS.stack = CMDS.skills;
  function run(line) {
    print(esc(line), "c");
    const [cmd, ...args] = line.trim().split(/\s+/);
    if (!cmd) return;
    const fn = CMDS[cmd.toLowerCase()];
    const res = fn ? fn(args) : `<span class="e">zsh: command not found: ${esc(cmd)}</span>. try <span class="a">help</span>`;
    if (res != null) print(res);
  }
  $("#term-form").addEventListener("submit", (e) => { e.preventDefault(); const v = tin.value; tin.value = ""; if (v.trim()) { hist.push(v); hi = hist.length; } run(v); });
  tin.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(0, hi - 1); tin.value = hist[hi] || ""; }
    else if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.min(hist.length, hi + 1); tin.value = hist[hi] || ""; }
    else if (e.key === "Tab") {
      e.preventDefault();
      const parts = tin.value.split(/\s+/);
      const pool = parts.length > 1
        ? (["open", "show"].includes(parts[0]) ? PROJ.map((p) => p.id).concat(parts[0] === "open" ? ["blog", "github"] : []) : parts[0] === "theme" ? THEMES : parts[0] === "checkout" ? ERAS.map((x) => x.label) : [])
        : Object.keys(CMDS);
      const hit = pool.filter((c) => c.startsWith(parts[parts.length - 1]));
      if (hit.length === 1) { parts[parts.length - 1] = hit[0]; tin.value = parts.join(" ") + " "; }
      else if (hit.length > 1) print(hit.join("  "));
    }
  });

  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest && e.target.closest("input, textarea, [contenteditable]");
    if (e.key === "Escape") { if (csId) closeCase(); else if (!term.hidden) openTerm(false); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "`" || e.key === "~") { e.preventDefault(); openTerm(); return; }
    if (csId) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const i = ORDER.findIndex((p) => p.id === csId); openCase(ORDER[(i + (e.key === "ArrowRight" ? 1 : -1) + ORDER.length) % ORDER.length].id); }
      return;
    }
    if (inLoop && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); goChapter(active + (e.key === "ArrowRight" ? 1 : -1)); }
  });

  /* --------------------------------------------------------------- engine */

  let ticking = false;
  function frame() {
    ticking = false;
    updateLoop();
    updateThread();
    updateNav();
    syncEditor();
    bowThread();
  }
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
  let rl;
  function relayout() {
    clearTimeout(rl);
    rl = setTimeout(() => {
      if (spec) spec.resize();
      if (window.Sims) window.Sims.resize();
      layoutLoop();
      layoutThread();
      layoutBay();
      frame();
    }, 60);
  }
  window.addEventListener("resize", () => { relayout(); clearTimeout(window._rc); window._rc = setTimeout(redrawCovers, 200); });
  if ("ResizeObserver" in window) new ResizeObserver(relayout).observe(out);

  apply();
  observe();
  boot(heroIn);
  setSound(sndSaved);
  layoutLoop(); layoutThread(); layoutBay(); frame();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (spec) { spec.theme(); spec.setName(state.name.trim() || "undefined", false); } if (window.Sims) window.Sims.theme(); relayout(); });
  const m = location.hash.match(/^#work\/([\w-]+)/);
  if (m) setTimeout(() => openCase(m[1]), 300);
})();
