/*
 * alan.fung runtime.
 * The page is drawn as the control flow of a program: one thread runs from main() to contact(),
 * history is a horizontal for-loop over the years, and work() forks into the projects.
 * "</> source" slides in the page's own source; its dotted values are live and recompile the page.
 * Everything is generated from data.js.
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
  const shipped = PROJ.filter((p) => p.status !== "wip");
  const WIP = FLAG.filter((p) => p.status === "wip");
  // section headings live in data.js; {placeholders} are filled here
  const SEC = D.sections || {};
  const fine = () => root.classList.contains("fine");
  const FILL = {
    skills: () => SK.length,
    Flagships: () => cap(spell(FLAG.length)),
    chapters: () => cap(spell(ERAS.length)),
    questions: () => FLAG.map((p) => p.question).filter(Boolean).join(" "),
    answers: () => (WIP.length ? `${cap(spell(FLAG.length - WIP.length))} answers are live, ${spell(WIP.length)} still in progress.` : "Every answer is live, with the numbers to back it."),
    Hover: () => (fine() ? "Hover" : "Tap"),
    hover: () => (fine() ? "hover" : "tap"),
    strum: () => (fine() ? " The wires are strings too: strum them." : "")
  };
  const fill = (t) => String(t || "").replace(/\{(\w+)\}/g, (m, k) => (FILL[k] ? FILL[k]() : m));
  const secTitle = (k, dflt) => split(fill((SEC[k] && SEC[k].title) || dflt));
  const secLede = (k, dflt) => esc(fill((SEC[k] && SEC[k].lede) || dflt));
  const XH = SEC.experiments || ["Experiments", "smaller builds"];
  const STATUS = { live: "live", source: "on github", wip: "in progress" };
  const spell = (n) => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] || String(n);
  const cap = (w) => String(w).charAt(0).toUpperCase() + String(w).slice(1);
  const SK = D.skills.flatMap((g) => g.items.map(([name, since, proof]) => ({ name, since, proof, group: g.group })));
  const proves = (p, s) => (p.stack || []).includes(s.name) || (p.uses || []).includes(s.name);
  const usedBy = (s) => PROJ.filter((p) => proves(p, s));
  const skillsOf = (p) => SK.filter((s) => proves(p, s));
  const ext = (u) => (/^https?:/.test(u) ? ` target="_blank" rel="noopener"` : "");

  /* ----------------------------------------------------------------- output */

  const out = $("#out");
  let wi = 0;
  const words = (s, em) => s.split(/(\s+)/).map((w) => (/^\s+$/.test(w) || !w ? w : `<span class="w"><span style="--i:${wi++}">${em ? `<em>${esc(w)}</em>` : esc(w)}</span></span>`)).join("");
  const split = (s) => { wi = 0; return s.split(/(<em>[^<]*<\/em>)/).map((part) => (part.startsWith("<em>") ? words(part.slice(4, -5), true) : words(part))).join(""); };
  const node = (fn, ix, id) => `<div class="node" data-node="${id}"><span class="ix">${ix}</span><b>${esc(fn)}</b></div>`;

  function statementHTML() {
    wi = 0;
    let t = 0;
    const parts = D.statement.split(/\{([^}]+)\}/), PUNCT = /^[,.;:!?]+/;
    return parts.map((part, i) => {
      if (i % 2 === 0) return words(i ? part.replace(PUNCT, "") : part);
      const idx = t++;
      const punct = (parts[i + 1].match(PUNCT) || [""])[0];
      const ws = part.trim().split(/\s+/), last = ws.pop();
      // a span, not a <button>: buttons lay out as inline-blocks, so a token that wraps would turn into a box.
      // The last word, its footnote number and the punctuation after the token never wrap apart.
      return `<span class="tokw"><span class="tok" role="button" tabindex="0" data-t="${idx}" data-ref="t:${idx}" aria-describedby="ev">${ws.length ? words(ws.join(" ") + " ") : ""}<span class="nw">${words(last)}<sup>0${idx + 1}</sup></span></span>${punct ? words(punct) : ""}</span>`;
    }).join("");
  }

  function chap(e, i) {
    const last = i === ERAS.length - 1;
    return `<article class="chap" data-ref="e:${e.id}" data-i="${i}">
      <div class="yr-node">${esc(e.label)}</div>
      <div class="big" aria-hidden="true">${esc(e.label)}</div>
      <div class="role">${esc(e.role)}</div>
      <h3>${esc(e.title)}</h3>
      <p class="t">${esc(e.text)}</p>
      ${e.picked.length ? `<div class="picked">${e.picked.map((p) => `<span>+ ${esc(p)}</span>`).join("")}</div>` : ""}
      <ul class="events">${e.events.map(([d, t]) => `<li><b>${esc(d)}</b> ${esc(t)}</li>`).join("")}</ul>
      ${e.projects ? `<div class="ships">${e.projects.map((id) => byId(id)).filter(Boolean).map((p) => `<button type="button" class="btn sm ghost" data-case="${p.id}">${esc(p.name)} <span class="arr">↗</span></button>`).join("")}</div>` : ""}
      ${last ? `<div class="close-brace" aria-hidden="true">}</div>` : ""}
    </article>`;
  }

  function progress(p) {
    if (!p.milestones) return "";
    const done = p.milestones.filter((m) => m[1]).length;
    return `<div class="prog"><span>${done}/${p.milestones.length} milestones</span><span class="bar"><i data-w="${(done / p.milestones.length) * 100}"></i></span></div>`;
  }

  const ORDER_ALL = () => [...FLAG, ...EXP];
  const metrics = (p, cls) => (p.metrics ? `<span class="${cls}">${p.metrics.map(([v, l]) => `<span><b>${esc(v)}</b><i>${esc(l)}</i></span>`).join("")}</span>` : "");

  // a featured flagship takes the full row, cover beside the text
  function fcard(p) {
    return `<button type="button" class="fcard rv${p.featured ? " wide" : ""}" data-case="${p.id}" data-ref="p:${p.id}" aria-label="Open the ${esc(p.name)} case study">
      <canvas class="cover" data-seed="${hash(p.id)}" data-motif="${p.motif || "dots"}" aria-hidden="true"></canvas>
      <span class="fbody">
        <span class="ctop"><span class="st is-${p.status}">${STATUS[p.status]}</span><span>${p.year} · ${esc(p.kind)}</span></span>
        <h3>${esc(p.name)}</h3>
        ${p.question ? `<span class="q">${esc(p.question)}</span>` : ""}
        <p>${esc(p.pitch)}</p>
        ${metrics(p, "metrics")}
        ${progress(p)}
        <span class="tags">${p.stack.slice(0, 5).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</span>
        <span class="go-case">open case study <span class="arr">↗</span></span>
      </span>
    </button>`;
  }

  function xcard(p) {
    return `<button type="button" class="xcard rv" data-case="${p.id}" data-ref="p:${p.id}" aria-label="Open ${esc(p.name)}">
      <canvas class="strip cover" data-seed="${hash(p.id)}" data-motif="${p.motif || "dots"}" aria-hidden="true"></canvas>
      <span class="ctop"><span class="st is-${p.status}">${STATUS[p.status]}</span><span>${p.year} · ${esc(p.kind)}</span></span>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.pitch)}</p>
      <span class="tags">${p.stack.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</span>
    </button>`;
  }

  out.insertAdjacentHTML("beforeend", `
    <section class="sec hero" id="hero" data-block="main" aria-label="Intro">
      <svg class="strings" id="strings" aria-hidden="true"></svg>
      <div class="str-labs" id="str-labs"></div>
      <div class="eyebrow rv"><span class="avail"><span class="dot" aria-hidden="true"></span>${esc(P.role)}</span><span>shipping software since ${P.career ? P.career[0][1] : P.firstCommit}</span><span>@${esc(P.handle)}</span></div>
      <h1 class="hero-name" id="hero-name"></h1>
      <p class="err" id="hero-err" hidden>TypeError: alan.name is undefined. Type a name in the source.</p>
      <div class="hero-row">
        <div class="rv"><div class="hero-role">// ${P.focus.map(esc).join(" · ")}</div><p class="hero-tag">${esc(P.tagline)}</p></div>
        <div class="play rv" id="play">
          <p class="play-hint">This page is strung like a violin. ${fine() ? "<b>Drag your cursor across the strings</b> to play them" : "<b>Swipe across the strings</b> to play them"}, and ${fine() ? "click" : "tap"} a string's name to go there.</p>
          <div class="play-ctl">
            <button type="button" id="snd" data-sound aria-pressed="false"><span class="ic" aria-hidden="true">♪</span><span class="t">sound off</span></button>
            <button type="button" id="mic" aria-pressed="false"><span class="ic dot" aria-hidden="true"></span><span class="t">listen</span></button>
          </div>
          <p class="tuner" id="tuner" aria-live="polite"></p>
        </div>
      </div>
      <div class="hero-stats rv">
        <div><b>${esc(P.metric[0])}</b><span>${esc(P.metric[1])}</span></div>
        <div><b>${FLAG.length - WIP.length}</b><span>flagships, live and measured</span></div>
        <div><b>${SK.length}</b><span>skills, each with a receipt</span></div>
        <div><b>${P.firstCommit}</b><span>first commit</span></div>
      </div>
    </section>

    <section class="sec whoami" id="whoami" data-block="whoami" aria-label="Who I am">
      ${node("whoami()", "01", "whoami")}
      <p class="statement split" id="statement">${statementHTML()}</p>
      <div class="ev" id="ev" role="tooltip"></div>
      <div class="who-grid">
        <div class="rv">${P.about.map((t) => `<p>${esc(t)}</p>`).join("")}</div>
        <div class="imports rv"><span class="kw">export const</span> alan = {
          <div class="kv"><span>role:</span> <span class="s">"${esc(P.role)}"</span>,</div>
          <div class="kv"><span>since:</span> <span class="n">${P.career ? P.career[0][1] : P.firstCommit}</span>,</div>
          <div class="kv"><span>focus:</span> [${P.focus.map((f) => `<span class="s">"${esc(f)}"</span>`).join(", ")}],</div>
          <div class="kv"><span>${WIP.length ? "building" : "shipped"}:</span> [${(WIP.length ? WIP : FLAG).map((p) => `<button type="button" class="s lnk" data-case="${p.id}">"${esc(p.name)}"</button>`).join(", ")}],</div>
          <div class="kv"><span>email:</span> <a class="s" href="mailto:${esc(P.email)}">"${esc(P.email)}"</a>,</div>
        };</div>
      </div>
    </section>

    <section class="sec skills" id="skills" data-block="skills" aria-label="Skills">
      ${node("skills()", "02", "skills")}
      <h2 class="title split">${secTitle("skills", "What I can do, <em>wired</em> to the proof")}</h2>
      <p class="lede rv">${secLede("skills", "{skills} skills, each traced to the projects that use it.")}${PROJ.some((p) => p.status === "wip") ? " Solid wires are shipped work, dashed ones are in progress." : ""}</p>
      <div class="graph rv" id="graph">
        <svg class="wires" id="wires" aria-hidden="true"></svg>
        <div class="g-skills">${D.skills.map((g) => `<div class="g-group"><div class="g-h">// ${esc(g.group.toLowerCase())}</div>${g.items.map(([n]) => { const i = SK.findIndex((x) => x.name === n); const sk = SK[i]; const live = usedBy(sk).filter((p) => p.status !== "wip").length; return `<button type="button" class="g-skill" data-s="${i}" data-ref="s:${i}"><span class="nm">${esc(n)}</span><span class="since">${sk.since}</span><span class="cnt${live ? "" : " none"}">${usedBy(sk).length || "·"}</span></button>`; }).join("")}</div>`).join("")}</div>
        <div class="g-side">
          <div class="g-proof" id="g-proof" aria-live="polite"></div>
          <div class="g-projs">${ORDER_ALL().map((p) => `<button type="button" class="g-proj" data-p="${p.id}"><span class="st is-${p.status}"></span><span class="nm">${esc(p.name)}</span><span class="k">${esc(p.kind)}</span></button>`).join("")}</div>
        </div>
      </div>
    </section>

    <section class="sec work" id="work" data-block="work" aria-label="Work">
      <div class="fork" id="fork">
        <svg class="lanes" id="lanes" aria-hidden="true"></svg>
        ${node("fork(projects)", "03", "work")}
        <h2 class="title split">${secTitle("work", "{Flagships} <em>flagships</em>, and the experiments that led here")}</h2>
        <p class="lede rv">${secLede("work", "{answers} Open any card for the case study.")}</p>
        <div class="flagships" id="flagships">${FLAG.map(fcard).join("")}</div>
      </div>
      <div class="subhead rv"><b>${esc(XH[0])}</b><span>${esc(XH[1])} · <a href="${esc(P.github)}?tab=repositories" target="_blank" rel="noopener">older experiments on GitHub ↗</a></span></div>
      <div class="experiments">${EXP.map(xcard).join("")}</div>
    </section>

    <section class="sec history" id="history" data-block="history" aria-label="History">
      <div class="intro" id="intro">
        ${node("for (const year of alan.life)", "04", "history")}
        <h2 class="title split">${secTitle("history", "How I got <em>here</em>")}</h2>
        <p class="lede rv">${secLede("history", "{chapters} chapters, from my first commit to what's next.")}</p>
      </div>
      <div class="pin" id="pin"><div class="stage" id="stage">
        <div class="stage-top"><span><span class="kw">for</span> (const year <span class="kw">of</span> alan.life) { <b id="loop-year"></b></span><span class="counters">skills <b id="c-skills">0</b> shipped <b id="c-ship">0</b> years <b id="c-years">0</b></span></div>
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

  /* ----------------------------------------------------------- hero / name */

  const nameEl = $("#hero-name");
  let nameIn = false;
  function renderName() {
    const n = state.name.trim();
    nameEl.className = "hero-name" + (nameIn ? " in" : "");
    $("#hero-err").hidden = !!n;
    if (!n) {
      nameEl.classList.add("undef");
      nameEl.innerHTML = `undefined<span class="caret-end" data-node="main"></span>`;
      nameEl.removeAttribute("aria-label");
      return;
    }
    nameEl.setAttribute("aria-label", n);
    let i = 0;
    const ws = n.split(/\s+/);
    nameEl.innerHTML = ws.map((w, wIx) => `<span class="word" aria-hidden="true">${Array.from(w).map((c) => `<span class="ch" style="--i:${i++}" data-c="${esc(c)}">${esc(c)}</span>`).join("")}${wIx === ws.length - 1 ? `<span class="caret-end" data-node="main"></span>` : ""}</span>`).join("");
    if (state.coffee === 0) nameEl.classList.add("fumes");
    if (state.coffee >= 7 && state.motion) nameEl.classList.add("jitter");
  }
  function decompile(ch) {
    if (!ch || ch.classList.contains("hex")) return;
    ch.dataset.hex = ch.dataset.c.codePointAt(0).toString(16).toUpperCase();
    ch.classList.add("hex");
    setTimeout(() => ch.classList.remove("hex"), 750);
  }
  nameEl.addEventListener("pointerover", (e) => decompile(e.target.closest(".ch")));
  (function idle() {
    const cups = state.coffee;
    if (state.motion && cups > 0 && !document.hidden && nameIn) {
      const chs = $$(".ch:not(.hex)", nameEl);
      if (chs.length) decompile(chs[Math.floor(Math.random() * chs.length)]);
    }
    setTimeout(idle, cups > 0 ? 5200 / cups + 400 : 3000);
  })();

  /* --------------------------------------------------------------- whoami */

  const ev = $("#ev");
  const statement = $("#statement");
  let evOn = -1;
  function showEv(tok) {
    const i = +tok.dataset.t;
    const t = D.traits[i];
    if (!t) return;
    $$(".tok", statement).forEach((x) => x.classList.toggle("on", x === tok));
    ev.innerHTML = `<div><span class="n">${esc(t.n)}</span><span class="u">${esc(t.unit)}</span></div><p>${esc(t.text)}</p>${t.link ? `<a href="${esc(t.link)}"${t.link[0] === "#" ? ` data-go="${esc(t.link.slice(1))}"` : ""}>${esc(t.linkText || "open →")}</a>` : ""}`;
    if (!isMobile()) {
      const sr = statement.getBoundingClientRect();
      const host = $("#whoami").getBoundingClientRect();
      // under the line where the token ends (a token can wrap over two lines)
      const rs = tok.getClientRects(), r = rs[rs.length - 1] || tok.getBoundingClientRect();
      const w = Math.min(360, sr.width);
      ev.style.left = clamp(r.left - host.left, 0, host.width - w) + "px";
      ev.style.top = r.bottom - host.top + 12 + "px";
    } else {
      statement.after(ev);
    }
    ev.classList.add("on");
    evOn = i;
  }
  function hideEv() { ev.classList.remove("on"); $$(".tok.on", statement).forEach((x) => x.classList.remove("on")); evOn = -1; }
  // a short grace period lets the pointer cross the gap into the card (it can hold a link)
  let evT = 0;
  const hideSoon = () => { clearTimeout(evT); evT = setTimeout(hideEv, 180); };
  statement.addEventListener("pointerover", (e) => { const t = e.target.closest(".tok"); if (t && !isMobile()) { clearTimeout(evT); showEv(t); } });
  statement.addEventListener("pointerout", (e) => { const t = e.target.closest(".tok"); if (t && !t.contains(e.relatedTarget) && !isMobile()) hideSoon(); });
  ev.addEventListener("pointerenter", () => clearTimeout(evT));
  ev.addEventListener("pointerleave", () => { if (!isMobile()) hideSoon(); });
  statement.addEventListener("click", (e) => { const t = e.target.closest(".tok"); if (!t) return; if (evOn === +t.dataset.t && isMobile()) hideEv(); else showEv(t); });
  // keyboard focus only: a tap focuses too, and the click that follows would toggle it shut again
  statement.addEventListener("keydown", (e) => { const t = e.target.closest(".tok"); if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); showEv(t); } });
  statement.addEventListener("focusin", (e) => { const t = e.target.closest(".tok"); if (t && t.matches(":focus-visible")) showEv(t); });
  statement.addEventListener("focusout", () => { if (!isMobile()) hideEv(); });

  /* ---------------------------------------------------------------- covers */

  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;color:var(--acc-ink)";
  document.body.appendChild(probe);
  const accentInk = () => getComputedStyle(probe).color;

  // Each project gets a procedural cover that hints at what it is. `motif` in data.js picks one.
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
    // concentric timer arcs
    rings(g, w, h, r, t) {
      const cx = w * (0.3 + r() * 0.4), cy = h * 0.5, R = Math.max(w, h);
      g.lineCap = "round";
      for (let i = 1, rad = 10; rad < R; i++, rad += h < 80 ? 9 : 16) {
        const p = (r() + t * 0.05 * (i % 3 + 1)) % 1;
        g.globalAlpha = 0.15 + 0.85 * Math.max(0, 1 - rad / (R * 0.7)) ** 2;
        g.lineWidth = h < 80 ? 2 : 3;
        g.beginPath(); g.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + p * TAU); g.stroke();
      }
    },
    // a wireframe mesh
    mesh(g, w, h, r, t) {
      const nx = h < 80 ? 26 : 22, ny = h < 80 ? 4 : 12, cw = w / (nx - 1), ch = h / (ny - 1);
      const P = (i, j) => [i * cw, j * ch + Math.sin(i * 0.5 + t) * ch * 0.35 * Math.cos(j * 0.4 - t * 0.6)];
      g.lineWidth = 1;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const a = P(i, j);
        g.globalAlpha = 0.18 + 0.5 * ((Math.sin(i * 0.3 + j * 0.5 + t) + 1) / 2);
        g.beginPath();
        if (i < nx - 1) { const b = P(i + 1, j); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
        if (j < ny - 1) { const c = P(i, j + 1); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); }
        if (i < nx - 1 && j < ny - 1 && (i + j) % 2) { const d = P(i + 1, j + 1); g.moveTo(a[0], a[1]); g.lineTo(d[0], d[1]); }
        g.stroke();
      }
    },
    // polygons and their vertices
    geo(g, w, h, r, t) {
      const n = h < 80 ? 6 : 9;
      g.lineWidth = 1.2;
      for (let i = 0; i < n; i++) {
        const cx = w * (i + 0.5) / n + (r() - 0.5) * 30, cy = h * (0.3 + r() * 0.4), s = (h < 80 ? 14 : 34) * (0.6 + r() * 0.6), sides = 3 + Math.floor(r() * 4), rot = r() * TAU + t * (i % 2 ? 0.4 : -0.3);
        g.globalAlpha = 0.25 + r() * 0.6;
        g.beginPath();
        for (let k = 0; k <= sides; k++) { const a = rot + (k / sides) * TAU; k ? g.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s) : g.moveTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s); }
        g.stroke();
        for (let k = 0; k < sides; k++) { const a = rot + (k / sides) * TAU; g.beginPath(); g.arc(cx + Math.cos(a) * s, cy + Math.sin(a) * s, 2.2, 0, TAU); g.fill(); }
      }
    },
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
  function animateCover(host) {
    const cv = $("canvas.cover", host);
    if (!cv) return;
    let raf = 0, t0 = 0;
    const loop = (now) => { drawCover(cv, (now - t0) / 900); raf = requestAnimationFrame(loop); };
    host.addEventListener("pointerenter", () => { if (!state.motion) return; t0 = performance.now(); raf = requestAnimationFrame(loop); });
    host.addEventListener("pointerleave", () => cancelAnimationFrame(raf));
  }
  $$(".fcard, .xcard").forEach(animateCover);

  // gentle 3D tilt
  $$(".fcard, .xcard").forEach((c) => {
    c.addEventListener("pointermove", (e) => {
      if (!state.motion || !root.classList.contains("fine")) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty("--ry", ((e.clientX - r.left) / r.width - 0.5) * 6 + "deg");
      c.style.setProperty("--rx", -((e.clientY - r.top) / r.height - 0.5) * 6 + "deg");
    });
    c.addEventListener("pointerleave", () => { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); });
  });

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
  const gutter = () => parseFloat(getComputedStyle(out).paddingLeft) - parseFloat(getComputedStyle(out).getPropertyValue("--gap") || 0) || 40;

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
    const gx = parseFloat(getComputedStyle(out).getPropertyValue("--gx")) || 40;
    const gap = parseFloat(getComputedStyle(out).getPropertyValue("--gap")) || 40;
    const gxAbs = parseFloat(getComputedStyle(out).paddingLeft) - gap;
    const amp = Math.min(gap * 0.55, 30);
    const dotY = (sel) => { const el = $(sel); if (!el) return null; const r = relTo(el, out); return r.y + r.h / 2; };

    const caret = $(".caret-end", nameEl);
    const c = caret ? relTo(caret, out) : { x: gxAbs, y: 200, w: 0, h: 0 };
    // on phones the name fills the width, so the thread starts in the gutter instead of crossing the text
    const start = isMobile() ? { x: gxAbs, y: c.y + c.h / 2 } : { x: c.x + c.w / 2, y: c.y + c.h + 6 };
    const yWho = dotY('[data-node="whoami"]');
    const ySki = dotY('[data-node="skills"]');
    const yHis = dotY('[data-node="history"]');
    const secR = relTo($("#history"), out);
    const pinR = relTo($("#pin"), out);
    const yWork = dotY('[data-node="work"]');
    const yCon = dotY('[data-node="contact"]');
    const hire = relTo($("#hire"), out);

    let d = `M ${start.x} ${start.y}`;
    d += sway(start.x, start.y, gxAbs, yWho, -amp);
    d += sway(gxAbs, yWho, gxAbs, ySki, amp);
    d += sway(gxAbs, ySki, gxAbs, yWork, -amp);
    d += sway(gxAbs, yWork, gxAbs, yHis, amp);
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
    const show = s && Math.abs(s[2] - y) < 80;
    [tPulse, tRing].forEach((c) => { c.style.opacity = show ? 1 : 0; if (s) { c.setAttribute("cx", s[1]); c.setAttribute("cy", s[2]); } });
  }

  /* ------------------------------------------------------- history loop */

  const sec = $("#history"), pin = $("#pin"), stage = $("#stage"), track = $("#track");
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
    // horizontal thread through the year nodes
    const nodeEl = $(".yr-node", chaps[0]);
    const ny = nodeEl.offsetTop;
    const nodeX = (i) => chapLeft[i] + $(".yr-node", chaps[i]).offsetLeft;
    const gap = parseFloat(getComputedStyle(out).getPropertyValue("--gap")) || 40;
    const x0 = nodeX(0) - gap;
    loopSvg.setAttribute("width", trackW);
    loopSvg.setAttribute("height", stage.clientHeight);
    loopSvg.style.width = trackW + "px";
    let d = `M ${x0} 0 C ${x0} ${ny * 0.6}, ${x0} ${ny}, ${nodeX(0)} ${ny}`;
    for (let i = 1; i < chaps.length; i++) {
      const a = nodeX(i - 1), b = nodeX(i), m = (a + b) / 2, amp = i % 2 ? 26 : -26;
      d += ` C ${a + (b - a) * 0.25} ${ny}, ${m - (b - a) * 0.2} ${ny + amp}, ${m} ${ny + amp} S ${b - (b - a) * 0.25} ${ny}, ${b} ${ny}`;
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
      setNum($("#c-ship"), shipped.filter((p) => p.year <= eraYear(e)).length);
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

  /* ------------------------------------------------------------ fork lanes */

  const fork = $("#fork"), lanes = $("#lanes");
  let laneEls = [];
  function layoutLanes() {
    lanes.innerHTML = "";
    dropStr("lane:");
    laneEls = [];
    const fr = fork.getBoundingClientRect();
    lanes.setAttribute("width", fr.width); lanes.setAttribute("height", fr.height);
    const gap = parseFloat(getComputedStyle(out).getPropertyValue("--gap")) || 40;
    const n = $('[data-node="work"]', fork).getBoundingClientRect();
    const ox = n.left - fr.left - gap, oy = n.top - fr.top + n.height / 2;
    const cards = $$(".fcard", fork).map((c) => { const r = c.getBoundingClientRect(); return { x: r.left - fr.left, y: r.top - fr.top, w: r.width, h: r.height }; });
    cards.forEach((c, i) => {
      const cx = c.x + c.w / 2;
      const above = cards.slice(0, i).reverse().find((o) => o.x - 8 < cx && cx < o.x + o.w + 8 && o.y < c.y);
      let d;
      if (above) d = `M ${cx} ${above.y + above.h} L ${cx} ${c.y}`;
      else {
        const ty = c.y - 46;
        d = `M ${ox} ${oy} C ${ox} ${ty}, ${ox + 20} ${ty}, ${Math.min(ox + 60, cx)} ${ty} L ${cx - 30} ${ty} Q ${cx} ${ty} ${cx} ${ty + 30} L ${cx} ${c.y}`;
      }
      const base = mk("path", { class: "base", d }, lanes);
      const lit = mk("path", { class: "lit", d }, lanes);
      const L = lit.getTotalLength();
      lit.style.strokeDasharray = `${L} ${L}`;
      lit.style.strokeDashoffset = L;
      laneEls.push([lit, L, above ? 1 : 0]);
      strLane(base, lit, i);
    });
  }
  function updateLanes() {
    const r = fork.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = clamp((vh * 0.8 - r.top) / (r.height * 0.75), 0, 1);
    laneEls.forEach(([lit, L, stage2]) => {
      const lp = stage2 ? clamp((p - 0.5) * 2, 0, 1) : clamp(p * 2, 0, 1);
      lit.style.strokeDashoffset = String(L * (1 - lp));
    });
  }

  /* --------------------------------------------------------- skills graph */

  const graph = $("#graph"), wires = $("#wires"), gProof = $("#g-proof");
  const gSkills = $$(".g-skill", graph), gProjs = $$(".g-proj", graph);
  gProjs.forEach((b) => { b.dataset.case = b.dataset.p; });
  let wireEls = [], gPin = -1, gCur = null, gIdle = 0, gIdleI = 0, gSeen = false, gTouched = false;
  const EDGES = SK.flatMap((sk, i) => usedBy(sk).map((p) => ({ i, p })));

  function layoutGraph() {
    wires.innerHTML = "";
    dropStr("wire:");
    wireEls = [];
    graph.classList.toggle("narrow", !isMobile() && graph.clientWidth < 1040);
    if (isMobile()) return;
    const gr = graph.getBoundingClientRect();
    wires.setAttribute("width", gr.width); wires.setAttribute("height", gr.height);
    const pos = {};
    gProjs.forEach((b) => { const r = b.getBoundingClientRect(); pos[b.dataset.p] = [r.left - gr.left, r.top - gr.top + r.height / 2]; });
    EDGES.forEach(({ i, p }) => {
      const r = gSkills[i].getBoundingClientRect();
      const x1 = r.right - gr.left, y1 = r.top - gr.top + r.height / 2, [x2, y2] = pos[p.id], dx = (x2 - x1) * 0.5;
      const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      const cls = p.status === "wip" ? " wip" : "";
      const base = mk("path", { class: "wire" + cls, d }, wires);
      const flow = mk("path", { class: "wflow" + cls, d }, wires);
      wireEls.push({ i, p: p.id, base, flow });
      strWire(wireEls[wireEls.length - 1], wireEls.length);
    });
    if (gCur) light(gCur);
  }

  const chipsFor = (ps) => ps.map((p) => `<button type="button" class="pchip" data-case="${p.id}"><span class="st is-${p.status}"></span>${esc(p.name)}</button>`).join("");
  function proofHTML(sel) {
    if (!sel) {
      return `<div class="pk">skills()</div><p class="big">${SK.length} skills · ${PROJ.length} projects · ${EDGES.length} wires</p>
        <p>Every skill on the left is wired to the work that uses it. Point at one to trace it, or pick a project to see its stack.</p>
        <p class="hint">${isMobile() ? "tap a skill" : "hover a skill or a project · click a skill to pin it"}</p>`;
    }
    if (sel.s != null) {
      const sk = SK[sel.s], ps = usedBy(sk), live = ps.filter((p) => p.status !== "wip");
      return `<div class="pk">${esc(sk.group.toLowerCase())}</div><h3>${esc(sk.name)}</h3>
        <p class="meta">${[`since ${sk.since}`, live.length ? `${live.length} shipped` : "", ps.length > live.length ? `${ps.length - live.length} in progress` : ""].filter(Boolean).join(" · ")}</p>
        ${ps.length ? `<div class="pchips">${chipsFor(ps)}</div>` : ""}
        ${sk.proof && !live.length ? `<p class="proof"><b>evidence</b> ${esc(sk.proof)}</p>` : ""}`;
    }
    const p = byId(sel.p), ss = skillsOf(p);
    return `<div class="pk">${esc(p.kind.toLowerCase())} · ${STATUS[p.status]}</div><h3>${esc(p.name)}</h3>
      <p>${esc(p.pitch)}</p>
      ${metrics(p, "metrics sm")}
      <p class="meta">built with ${ss.map((x) => esc(x.name)).join(", ") || esc(p.stack.join(", "))}</p>
      <button type="button" class="btn sm" data-case="${p.id}">open case study <span class="arr">↗</span></button>`;
  }
  function light(sel) {
    gCur = sel;
    graph.classList.toggle("focus", !!sel);
    const skOn = new Set(), pOn = new Set();
    if (sel && sel.s != null) { skOn.add(sel.s); usedBy(SK[sel.s]).forEach((p) => pOn.add(p.id)); }
    if (sel && sel.p) { pOn.add(sel.p); skillsOf(byId(sel.p)).forEach((x) => skOn.add(SK.indexOf(x))); }
    gSkills.forEach((b, i) => { b.classList.toggle("on", skOn.has(i)); b.classList.toggle("pin", i === gPin); });
    gProjs.forEach((b) => b.classList.toggle("on", pOn.has(b.dataset.p)));
    wireEls.forEach((w) => {
      const on = !!sel && (sel.s != null ? w.i === sel.s : w.p === sel.p);
      w.base.classList.toggle("on", on); w.flow.classList.toggle("on", on);
      if (on) wires.appendChild(w.base), wires.appendChild(w.flow); // draw lit wires on top
    });
    gProof.innerHTML = proofHTML(sel);
  }
  function pickSkill(i, pin) {
    gTouched = true; stopIdle();
    if (pin) gPin = gPin === i ? -1 : i;
    light(gPin >= 0 ? { s: gPin } : pin ? null : { s: i });
  }
  graph.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const sb = e.target.closest(".g-skill"), pb = e.target.closest(".g-proj");
    if (sb) { gTouched = true; stopIdle(); light({ s: +sb.dataset.s }); }
    else if (pb) { gTouched = true; stopIdle(); light({ p: pb.dataset.p }); }
  });
  graph.addEventListener("pointerleave", () => { light(gPin >= 0 ? { s: gPin } : null); startIdle(); });
  graph.addEventListener("click", (e) => { const sb = e.target.closest(".g-skill"); if (sb) pickSkill(+sb.dataset.s, true); });
  graph.addEventListener("focusin", (e) => {
    const sb = e.target.closest(".g-skill"), pb = e.target.closest(".g-proj");
    if (sb && sb.matches(":focus-visible")) light({ s: +sb.dataset.s });
    else if (pb && pb.matches(":focus-visible")) light({ p: pb.dataset.p });
  });

  // until someone touches it, the graph traces one skill after another so it reads as alive
  const demo = SK.map((x, i) => i).filter((i) => usedBy(SK[i]).length > 1);
  function stopIdle() { clearInterval(gIdle); gIdle = 0; }
  function startIdle() {
    stopIdle();
    if (gTouched || !gSeen || !state.motion || gPin >= 0 || !demo.length) return;
    gIdle = setInterval(() => { light({ s: demo[gIdleI++ % demo.length] }); }, 2200);
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((en) => { gSeen = en[0].isIntersecting; gSeen ? startIdle() : stopIdle(); }, { threshold: 0.35 }).observe(graph);
  }
  light(null);

  /* -------------------------------------------------------------- strings */
  // Every line on the page is a string. Moving the pointer across one plucks it: the wave
  // equation in strings.js moves it, and with sound on, Karplus-Strong makes it ring at a pitch
  // of its own. The four open strings of a violin, across the hero, are the way into the page.

  const S = window.Strings;
  const strs = new Map(); // name → string
  const PENTA = [0, 2, 4, 7, 9]; // D major pentatonic: any run of these notes sounds like music
  const penta = (n) => 146.83 * Math.pow(2, (12 * Math.floor(n / 5) + PENTA[((n % 5) + 5) % 5]) / 12);
  const OPEN = [
    { n: "G", f: 196.0, pc: 7, go: "whoami", lab: "whoami()", w: 3.1, wound: true },
    { n: "D", f: 293.66, pc: 2, go: "skills", lab: "skills()", w: 2.4, wound: true },
    { n: "A", f: 440.0, pc: 9, go: "work", lab: "work()", w: 1.8 },
    { n: "E", f: 659.26, pc: 4, go: "contact", lab: "contact()", w: 1.3 }
  ];
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
    const s = Object.assign({ name, host, paths, segs, d0: paths.map((p) => p.getAttribute("d")), last: 0, e: 0, busy: false, drive: 0, driveTo: 0, min: 3, max: 14 }, o);
    strs.set(name, s);
    return s;
  }
  const dropStr = (prefix) => { [...strs.keys()].forEach((k) => { if (k.startsWith(prefix)) strs.delete(k); }); };

  function strPath(s, t) {
    let d = "";
    const dr = s.drive * (s.driveAmp || 0), ph = dr ? Math.sin(t * (s.driveHz || 0.05)) : 0;
    for (const g of s.segs) {
      const { n, pts, nrm } = g, u = g.w.u;
      for (let i = 0; i < n; i++) {
        const k = u[i] + (dr ? dr * ph * Math.sin((Math.PI * i) / (n - 1)) : 0);
        d += (i ? "L" : "M") + (pts[2 * i] + nrm[2 * i] * k).toFixed(1) + " " + (pts[2 * i + 1] + nrm[2 * i + 1] * k).toFixed(1);
      }
    }
    return d;
  }

  function tickStrings(t) {
    sRaf = 0;
    let again = false;
    strs.forEach((s) => {
      let e = 0, moving = false;
      for (const g of s.segs) {
        if (g.w.held) { moving = true; e = Math.max(e, Math.abs(g.w.held.d)); if (t - g.w.held.t0 > 650) release(s, g); }
        else if (g.w.awake) { e = Math.max(e, g.w.step()); moving = true; }
      }
      s.drive += (s.driveTo - s.drive) * 0.14;
      if (s.drive < 0.01 && !s.driveTo) s.drive = 0;
      if (s.drive) moving = true;
      if (moving || s.busy) {
        const d = moving ? strPath(s, t) : null;
        s.paths.forEach((p, i) => p.setAttribute("d", d || s.d0[i]));
      }
      // with reduced motion a pluck only glows
      let glow = Math.max(e, s.drive * 12);
      if (s.flash) { const f = 1 - (t - s.flash) / 700; if (f > 0) { glow = Math.max(glow, f * 12); moving = true; } else s.flash = 0; }
      if (s.glow) s.glow.style.opacity = Math.min(0.6, glow / 20).toFixed(3);
      s.busy = moving;
      if (moving) again = true;
    });
    if (again || mic) wake();
  }

  function hitStr(s, ax, ay, bx, by, speed, cx, now) {
    if (now - s.last < (s.cool || 70)) return;
    const m0 = Math.min(ax, bx) - 30, m1 = Math.max(ax, bx) + 30, n0 = Math.min(ay, by) - 30, n1 = Math.max(ay, by) + 30;
    const ex = bx - ax, ey = by - ay;
    for (const g of s.segs) {
      if (g.w.held || g.bb[2] < m0 || g.bb[0] > m1 || g.bb[3] < n0 || g.bb[1] > n1) continue;
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

  const sing = (s, g, k, vel, cx) => { if (s.note) S.Sound.pluck(s.note(g, k), vel, (cx / window.innerWidth) * 2 - 1, { gain: s.vol, ring: s.ring }); };
  function pluck(s, g, k, side, speed, cx, now) {
    s.last = now;
    const a = clamp(speed * (s.gainK || 8), s.min, s.max) * side, vel = clamp(Math.abs(a) / s.max, 0.15, 1);
    if (!state.motion) { s.flash = now; sing(s, g, k, vel, cx); }
    else if (s.grab) g.w.held = { k, side, t0: now, d: 0, cx }; // the string follows the pointer until it slips off
    else { if (s.local) g.w.bump(k, a, s.local); else g.w.tri(k, a); sing(s, g, k, vel, cx); }
    if (!s.grab || !state.motion) s.onPluck && s.onPluck(s, vel);
    wake();
  }
  function drag(s, g, lx, ly) {
    const h = g.w.held, k = h.k;
    h.d = (lx - g.pts[2 * k]) * g.nrm[2 * k] + (ly - g.pts[2 * k + 1]) * g.nrm[2 * k + 1];
    if (h.d * h.side < 0 || Math.abs(h.d) > s.max) release(s, g);
    else g.w.tri(k, h.d);
  }
  function release(s, g) {
    const h = g.w.held;
    if (!h) return;
    g.w.held = null;
    const a = clamp(Math.abs(h.d), s.min, s.max) * h.side, vel = clamp(Math.abs(a) / s.max, 0.2, 1);
    g.w.tri(h.k, a);
    sing(s, g, h.k, vel, h.cx);
    s.onPluck && s.onPluck(s, vel);
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
        const held = s.segs.find((g) => g.w.held);
        if (held) { drag(s, held, x - r.left, y - r.top); return; }
        if (Math.max(x, px) < r.left - 30 || Math.min(x, px) > r.right + 30 || Math.max(y, py) < r.top - 30 || Math.min(y, py) > r.bottom + 30) return;
        hitStr(s, px - r.left, py - r.top, x - r.left, y - r.top, speed, x, now);
      });
    }
    px = x; py = y; pt = now;
  }
  window.addEventListener("pointermove", (e) => { strMove(e.clientX, e.clientY); sheenAt(e.clientX, e.clientY); }, { passive: true });
  window.addEventListener("pointerdown", (e) => { px = e.clientX; py = e.clientY; pt = performance.now(); sheenAt(px, py); if (S.Sound.on) S.Sound.unlock(); }, { passive: true });
  ["pointerup", "pointercancel"].forEach((n) => window.addEventListener(n, (e) => { if (e.pointerType !== "mouse") px = null; }, { passive: true }));
  window.addEventListener("keydown", () => { if (S.Sound.on) S.Sound.unlock(); });

  /* the open strings */
  const hero = $("#hero"), strSvg = $("#strings"), strLabs = $("#str-labs");
  strSvg.innerHTML = `<defs><radialGradient id="sheen" gradientUnits="userSpaceOnUse" cx="-999" cy="-999" r="340"><stop offset="0" class="s0"/><stop offset=".45" class="s1"/><stop offset="1" class="s2"/></radialGradient></defs>`;
  const sheen = $("#sheen", strSvg);
  strLabs.innerHTML = OPEN.map((o, i) => `<button type="button" class="str-lab" data-go="${o.go}" data-i="${i}" aria-label="${o.n} string, ${o.lab}"><i>${o.n}</i><span>${o.lab}</span></button>`).join("");
  const labEls = $$(".str-lab", strLabs);
  function sheenAt(x, y) {
    const r = strSvg.getBoundingClientRect();
    if (y < r.top - 200 || y > r.bottom + 200) return;
    sheen.setAttribute("cx", (x - r.left).toFixed(0)); sheen.setAttribute("cy", (y - r.top).toFixed(0));
  }
  const ringLab = (i) => { const l = labEls[i]; l.classList.remove("ring"); void l.offsetWidth; l.classList.add("ring"); clearTimeout(l._t); l._t = setTimeout(() => l.classList.remove("ring"), 600); };

  function layoutHero() {
    dropStr("open:");
    $$("g.str", strSvg).forEach((g) => g.remove());
    const upright = isMobile() || hero.clientWidth < hero.clientHeight * 0.9;
    hero.classList.toggle("upright", upright);
    const or = out.getBoundingClientRect(), hr = hero.getBoundingClientRect();
    const W = Math.round(or.width), H = hero.offsetHeight, ox = or.left - hr.left;
    Object.assign(strSvg.style, { left: ox + "px", width: W + "px", height: H + "px" });
    strSvg.setAttribute("width", W); strSvg.setAttribute("height", H);
    const rel = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - or.left, y: r.top - hr.top, w: r.width, h: r.height }; };
    const nm = rel(nameEl), row = rel($(".hero-row", hero)), st = rel($(".hero-stats", hero));
    const pr = parseFloat(getComputedStyle(out).paddingRight) || 40;
    OPEN.forEach((o, i) => {
      let A, B, lab; // A: the nut, where the strings meet; B: the bridge, where they spread and carry their names
      if (!upright) {
        // they run through the name and fan out to the right, clear of the smaller text below it
        const top = nm.y - 4, bot = nm.y + nm.h * 0.96;
        A = [-W * 0.12, nm.y + nm.h * 0.6 + i * 7];
        B = [W + 20, top + ((bot - top) * i) / 3];
        const lx = W - pr;
        lab = [lx + ox, A[1] + ((B[1] - A[1]) * (lx - A[0])) / (B[0] - A[0]) - 3];
      } else {
        A = [W * 0.5 + (i - 1.5) * 5, Math.max(8, nm.y - 30)];
        B = [W * (0.17 + 0.22 * i), st.y - 100];
        lab = [B[0] + ox, B[1]];
      }
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(40, Math.round(len / 12));
      const g = mk("g", { class: `str${o.wound ? " wound" : ""}` }, strSvg);
      const d0 = `M ${A[0].toFixed(1)} ${A[1].toFixed(1)} L ${B[0].toFixed(1)} ${B[1].toFixed(1)}`;
      const glow = mk("path", { class: "s-glow", d: d0, "stroke-width": (o.w * 3 + 2).toFixed(1) }, g);
      const paths = [glow, mk("path", { class: "s-core", d: d0, "stroke-width": o.w }, g)];
      if (o.wound) paths.push(mk("path", { class: "s-wind", d: d0, "stroke-width": o.w }, g));
      const pts = Array.from({ length: n }, (_, j) => [A[0] + ((B[0] - A[0]) * j) / (n - 1), A[1] + ((B[1] - A[1]) * j) / (n - 1)]);
      addStr("open:" + i, strSvg, paths, pts, {
        grab: true, min: 5, max: upright ? 22 : 28, gainK: 10, cool: 90, glow, ring: true,
        wave: { c2: 0.45, damp: 0.986, sub: 3 }, driveAmp: upright ? 7 : 10, driveHz: 0.045 + i * 0.011,
        note: () => o.f, onPluck: () => ringLab(i)
      });
      Object.assign(labEls[i].style, { left: lab[0].toFixed(1) + "px", top: lab[1].toFixed(1) + "px" });
    });
  }
  function bow(i, amp = 20) {
    const s = strs.get("open:" + i);
    if (!s) return;
    const g = s.segs[0], o = OPEN[i];
    if (state.motion) g.w.tri(Math.round(g.n * (0.55 + 0.1 * i)), amp * (i % 2 ? -1 : 1)); else s.flash = performance.now();
    S.Sound.pluck(o.f, 0.85, 0.3, { ring: true });
    ringLab(i); wake();
  }
  const strum = () => OPEN.forEach((o, i) => setTimeout(() => bow(i, 12 - i * 1.5), i * 110));
  strLabs.addEventListener("click", (e) => { const b = e.target.closest(".str-lab"); if (b) bow(+b.dataset.i); });

  /* sound: off until the visitor asks for it */
  const SND = "alan.fung/sound";
  function setSound(on, byHand) {
    S.Sound.on = on;
    try { localStorage.setItem(SND, on ? "1" : "0"); } catch (e) {}
    $$("[data-sound]").forEach((b) => { b.setAttribute("aria-pressed", String(on)); b.title = on ? "Sound on" : "Sound off"; const t = $(".t", b); if (t) t.textContent = on ? "sound on" : "sound off"; });
    if (!on || !byHand) return;
    // ready() unlocks the output inside this click; strum only once it is actually running, and say so if it never does
    S.Sound.ready().then((ok) => {
      if (!S.Sound.on) return;
      if (ok) { strum(); toast(`sound on · ${fine() ? "run your cursor across" : "swipe"} any line to play it`); }
      else { setSound(false); toast("this browser kept the audio switched off here"); }
    });
  }
  let sndSaved = false;
  try { sndSaved = localStorage.getItem(SND) === "1"; } catch (e) {}
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-sound]"); if (b) setSound(!S.Sound.on, true); });

  /* listen: sing or play near an open string and it rings along; hold the note to open its section */
  const micBtn = $("#mic"), tuner = $("#tuner");
  const TUNER_IDLE = "Got an instrument? Turn on listen and play or hum a G, D, A or E. The matching string answers.";
  tuner.textContent = TUNER_IDLE;
  let mic = null;
  const pcDist = (midi, pc) => { let d = (((midi - pc) % 12) + 12) % 12; if (d > 6) d -= 12; return d * 100; };
  function micUI(on, msg) {
    micBtn.setAttribute("aria-pressed", String(on));
    $(".t", micBtn).textContent = on ? "listening" : "listen";
    hero.classList.toggle("listening", on);
    if (msg != null) tuner.textContent = msg;
  }
  async function listen(on) {
    if (!on) {
      if (mic) mic.stream.getTracks().forEach((t) => t.stop());
      mic = null;
      OPEN.forEach((o, i) => { const s = strs.get("open:" + i); if (s) s.driveTo = 0; labEls[i].style.setProperty("--hold", 0); });
      micUI(false, TUNER_IDLE);
      return;
    }
    const ctx = S.Sound.unlock();
    if (!ctx || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { micUI(false, "This browser can't listen here, but the strings still play by hand."); return; }
    micUI(true, "Asking for the microphone…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(an);
      mic = { stream, an, buf: new Float32Array(an.fftSize), hold: -1, t0: 0, seen: 0, f: 0 };
      micUI(true, "Listening. Sing or play a G, D, A or E, and hold it to open that section.");
      wake();
      micLoop();
    } catch (err) {
      micUI(false, err && err.name === "NotAllowedError" ? "The microphone is blocked, but the strings still play by hand." : "No microphone was found, but the strings still play by hand.");
    }
  }
  function micLoop() {
    if (!mic) return;
    requestAnimationFrame(micLoop);
    if (mic.f++ % 2) return;
    mic.an.getFloatTimeDomainData(mic.buf);
    const r = S.pitch(mic.buf, S.Sound.ctx.sampleRate), now = performance.now();
    if (!r) {
      if (now - mic.seen > 260) {
        OPEN.forEach((o, i) => { strs.get("open:" + i).driveTo = 0; labEls[i].style.setProperty("--hold", 0); });
        mic.hold = -1;
      }
      return;
    }
    mic.seen = now;
    const nt = S.note(r.f);
    let hit = -1;
    OPEN.forEach((o, i) => {
      const dc = Math.abs(pcDist(nt.midi, o.pc));
      strs.get("open:" + i).driveTo = clamp(1 - dc / 90, 0, 1) * clamp(r.rms * 30, 0.4, 1);
      if (dc < 35) hit = i;
    });
    if (hit !== mic.hold) { mic.hold = hit; mic.t0 = now; }
    const held = hit >= 0 ? clamp((now - mic.t0) / 1000, 0, 1) : 0;
    labEls.forEach((l, i) => l.style.setProperty("--hold", i === hit ? held.toFixed(2) : 0));
    const c = Math.round(nt.cents);
    tuner.innerHTML = `<b>${nt.name}<sub>${nt.octave}</sub></b><span class="cents">${c > 0 ? "+" : c < 0 ? "−" : "±"}${Math.abs(c)}¢</span><span class="needle" style="--c:${clamp(c / 50, -1, 1).toFixed(2)}"><i></i></span><span class="hint">${hit >= 0 ? `hold it for ${OPEN[hit].lab}` : "hold a G, D, A or E"}</span>`;
    if (held >= 1) {
      const o = OPEN[hit];
      listen(false);
      toast(`heard ${nt.name}${nt.octave} → <b>${o.lab}</b>`);
      bow(hit);
      go(o.go);
    }
  }
  micBtn.addEventListener("click", () => listen(!mic));

  /* the rest of the page */
  function strThread() {
    dropStr("thread");
    const H = Math.max(1, out.scrollHeight);
    addStr("thread", thread, [tBase, tLit, tFlow], tSamples.map((p) => [p[1], p[2]]), {
      step: 6, local: 4, min: 3, max: 14, gainK: 6, cool: 90, vol: 0.45,
      wave: { c2: 0.5, damp: 0.994, sub: 3 },
      note: (g, k) => penta(12 - Math.round((g.pts[2 * k + 1] / H) * 9))
    });
  }
  // scrolling bows the thread a little where the pulse is
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
    [gSkills[i], gProjs.find((b) => b.dataset.p === pid)].forEach((el) => {
      if (!el) return;
      el.classList.remove("twang"); void el.offsetWidth; el.classList.add("twang");
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("twang"), 520);
    });
  }
  function strWire(w, n) {
    const L = w.base.getTotalLength(), pts = [];
    for (let l = 0; l <= L; l += 8) { const q = w.base.getPointAtLength(l); pts.push([q.x, q.y]); }
    addStr("wire:" + n, wires, [w.base, w.flow], pts, {
      min: 3, max: 12, gainK: 7, cool: 120, vol: 0.5, wave: { c2: 0.45, damp: 0.984, sub: 3 },
      note: () => skillNote(w.i),
      onPluck: () => {
        gTouched = true; stopIdle();
        twang(w.i, w.p);
        [w.base, w.flow].forEach((el) => { el.classList.add("ring"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("ring"), 700); });
      }
    });
  }
  function strLane(base, lit, i) {
    const L = base.getTotalLength(), pts = [];
    for (let l = 0; l <= L; l += 8) { const q = base.getPointAtLength(l); pts.push([q.x, q.y]); }
    addStr("lane:" + i, lanes, [base, lit], pts, { min: 3, max: 12, gainK: 7, cool: 120, vol: 0.5, wave: { c2: 0.45, damp: 0.985, sub: 3 }, note: () => penta(6 + i * 2) });
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
    const node = $(".yr-node", chaps[i]);
    const x = chapLeft[i] + node.offsetLeft;
    for (const g of s.segs) { let k = 1; while (k < g.n - 2 && g.pts[2 * k] < x) k++; g.w.bump(k, 7, 4); }
    wake();
  }

  // after the name lands, the strings settle with a quiet strum so they read as strings
  function introStrum() {
    if (!state.motion) return;
    OPEN.forEach((o, i) => setTimeout(() => {
      const st = strs.get("open:" + i);
      if (!st) return;
      const g = st.segs[0];
      g.w.tri(Math.round(g.n * (0.58 + 0.08 * i)), (i % 2 ? -1 : 1) * (10 - i * 1.5));
      wake();
    }, 1250 + i * 120));
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
    return `<div class="case-in">
      <button type="button" class="pill-btn case-x" id="case-x" aria-label="Close case study">esc ✕</button>
      <div class="kick"><span>git show <b>${sha(p.id + p.name)}</b></span><span class="st is-${p.status}">${STATUS[p.status]}</span><span>${p.year}</span><span>${esc(p.kind)}</span></div>
      <h2 id="case-title">${esc(p.name)}</h2>
      ${p.question ? `<p class="q">${esc(p.question)}</p>` : ""}
      <p class="pitch">${esc(p.pitch)}</p>
      ${metrics(p, "metrics")}
      <canvas class="cover" data-seed="${hash(p.id)}" data-motif="${p.motif || "dots"}" aria-hidden="true"></canvas>
      <div class="case-grid">
        ${p.why ? `<h4>why</h4><p>${esc(p.why)}</p>` : ""}
        ${p.how ? `<h4>${p.tier === "flagship" ? "how it works" : "highlights"}</h4><ol>${p.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>` : ""}
        ${p.milestones ? `<h4>milestones · ${done}/${p.milestones.length}</h4><ul class="miles">${p.milestones.map(([t, ok]) => `<li class="${ok ? "done" : ""}">${esc(t)}</li>`).join("")}</ul>` : ""}
        <h4>stack</h4><div class="tags">${p.stack.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        ${skillsOf(p).length ? `<h4>skills it proves</h4><div class="tags">${skillsOf(p).map((x) => `<button type="button" class="tag lnk" data-skill="${SK.indexOf(x)}">${esc(x.name)}</button>`).join("")}</div>` : ""}
        <h4>links</h4><div class="actions">${links}</div>
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
      // grow from the card that was clicked, or from the middle when it is off screen
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
    if (t) { e.preventDefault(); openCase(t.dataset.case, t); return; }
    if (e.target.closest("#case-x")) closeCase();
    const sk = e.target.closest("[data-skill]");
    if (sk) { closeCase(); go("skills"); gPin = -1; pickSkill(+sk.dataset.skill, true); }
  });

  /* ------------------------------------------------------------ nav + map */

  const sections = $$(".sec[data-block]");
  const MAP = [["hero", "main()"], ["whoami", "whoami()"], ["skills", "skills()"], ["work", "fork()"], ["history", "history()"], ["contact", "contact()"]];
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

  const cursor = $(".cursor"), cLabel = $(".cursor span");
  let cx = -100, cy = -100, rx = -100, ry = -100;
  if (root.classList.contains("fine")) {
    window.addEventListener("pointermove", (e) => {
      cx = e.clientX; cy = e.clientY;
      const t = e.target;
      const card = t.closest && t.closest(".fcard, .xcard, .chap .ships button");
      const txt = t.closest && t.closest("input, [contenteditable]");
      const hot = t.closest && t.closest("a, button, .tok, .live, .ln");
      cursor.classList.toggle("label", !!card);
      cursor.classList.toggle("text", !card && !!txt);
      cursor.classList.toggle("hot", !card && !txt && !!hot);
      if (card) cLabel.textContent = "open";
    }, { passive: true });
    document.addEventListener("pointerleave", () => { cx = cy = -100; });
    (function loop() {
      rx += (cx - rx) * 0.2; ry += (cy - ry) * 0.2;
      $("i", cursor).style.transform = `translate(${cx}px,${cy}px)`;
      $("b", cursor).style.transform = `translate(${rx}px,${ry}px)`;
      cLabel.style.transform = `translate(${rx}px,${ry}px)`;
      requestAnimationFrame(loop);
    })();
  }
  // magnetic buttons
  $$("[data-magnetic]").forEach((b) => {
    b.addEventListener("pointermove", (e) => {
      if (!state.motion || !root.classList.contains("fine")) return;
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.28}px)`;
    });
    b.addEventListener("pointerleave", () => { b.style.transform = ""; });
  });

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
      `  coffee: ${LIVE("coffee")}, // cups a day`,
      "});",
      "",
      "// the open strings of a violin; each one opens a section",
      `const strings = { ${OPEN.map((o) => `${o.n}${Math.floor(Math.log2(o.f / 440) * 12 + 69) / 12 - 1 | 0}: ${o.lab.replace("()", "")}`).join(", ")} };`,
      "",
      "main(alan, config, strings);"
    ]);
    block("whoami", [
      "",
      "function whoami() {",
      ...D.traits.map((t, i) => ({ s: `  // ${String(i + 1).padStart(2, "0")} ${t.k}: ${t.n} ${t.unit}`, ref: "t:" + i })),
      `  return { role: ${q(P.role)}, since: ${P.career ? P.career[0][1] : P.firstCommit} };`,
      "}"
    ]);
    block("skills", [
      "",
      "skills({",
      ...D.skills.flatMap((g) => [
        `  // ${g.group.toLowerCase()}`,
        ...g.items.map(([n]) => { const i = SK.findIndex((x) => x.name === n); const ps = usedBy(SK[i]).map((p) => p.id); return { s: `  ${q(n)}: [${ps.map(q).join(", ")}],${ps.length ? "" : " // proof: notes"}`, ref: "s:" + i }; })
      ]),
      "});"
    ]);
    block("work", [
      "",
      "fork([",
      ...FLAG.map((p) => ({ s: `  ${q(p.id)}, // ${STATUS[p.status]}`, ref: "p:" + p.id })),
      "]);",
      "experiments([",
      ...EXP.map((p) => ({ s: `  ${q(p.id)}, // ${p.year}`, ref: "p:" + p.id })),
      "]);"
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
    if (!key || key === "name" || key === "coffee" || key === "motion") { renderName(); if (key) relayout(); }
    syncWidgets();
    lastMs = performance.now() - t0;
    renderStatus();
    if (!key || key === "theme" || key === "accent") requestAnimationFrame(redrawCovers);
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
      $$(".prog .bar i", en.target).forEach((b) => { b.style.width = b.dataset.w + "%"; });
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
    nameEl.classList.add("in");
    $$("#hero .rv").forEach((el, i) => { el.style.transitionDelay = `${0.35 + i * 0.1}s`; el.classList.add("in"); });
    introStrum();
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
      `linking ${PROJ.length} projects as proof`,
      `parsing ${ERAS.length} chapters, ${P.firstCommit} → next`,
      `forking ${FLAG.length} flagships`,
      `running main()`
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
      if (!greeted) { greeted = true; print(`Welcome to <span class="a">alan@fung</span>. Type <span class="a">help</span>. Try <span class="a">checkout 2023</span> or <span class="a">show atlas</span>.`); }
      setTimeout(() => tin.focus(), 30);
    } else tin.blur();
  }
  $("#btn-term").addEventListener("click", () => openTerm());
  $("#term-x").addEventListener("click", () => openTerm(false));
  const goURL = (url) => { if (/^https?:/.test(url)) window.open(url, "_blank", "noopener"); else location.href = url; };
  const gitLog = () => ERAS.slice().reverse().flatMap((e) => e.events.slice().reverse().map(([d, t]) => `<span style="color:var(--acc-ink)">*</span> <span style="color:var(--num)">${sha(d + t)}</span> ${esc(d.padEnd(7))} ${esc(t)}`)).join("\n");
  const CMDS = {
    help: () => [
      "whoami                 who is this",
      "ls                     list projects",
      "show <id>              open a case study (e.g. show atlas)",
      "open <id|blog|github>  run a project",
      "checkout <year>        jump to a chapter (2018 … next)",
      "git log                every commit of my history",
      "skills [name]          what I build with, and where (e.g. skills c++)",
      "blog                   latest notes",
      "contact                get in touch",
      "source                 toggle the live source pane",
      "strum · sound <on|off>  play the strings (sound is off until you turn it on)",
      "listen                 sing a G, D, A or E and its string rings along",
      "",
      "theme <midnight|paper|phosphor> · accent <#hex>",
      "coffee <0-9> · motion <on|off> · name <text>",
      "reset · clear · exit"
    ].join("\n"),
    whoami: () => `${esc(state.name || "undefined")} · ${esc(P.role)} · @${esc(P.handle)}\n${esc(D.statement.replace(/[{}]/g, ""))}`,
    about: () => P.about.map(esc).join("\n\n"),
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
      if (k && list.length === 1) { openTerm(false); go("skills"); gPin = -1; pickSkill(SK.indexOf(list[0]), true); }
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
  CMDS.strum = () => { strum(); return S.Sound.on ? "G3 D4 A4 E5" : "G3 D4 A4 E5 (silent: type sound on)"; };
  CMDS.sound = (a) => { const on = a[0] ? a[0] === "on" : !S.Sound.on; setSound(on, on); return `sound ${on ? "on" : "off"}`; };
  CMDS.listen = () => { openTerm(false); go("hero"); listen(true); return "listening…"; };
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
    if (e.key === "Escape") { if (csId) closeCase(); else if (!term.hidden) openTerm(false); else hideEv(); return; }
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
    updateLanes();
    updateNav();
    syncEditor();
    bowThread();
  }
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
  let rl;
  function relayout() {
    clearTimeout(rl);
    rl = setTimeout(() => {
      layoutHero();
      layoutLoop();
      layoutThread();
      layoutLanes();
      layoutGraph();
      frame();
    }, 60);
  }
  window.addEventListener("resize", () => { relayout(); clearTimeout(window._rc); window._rc = setTimeout(redrawCovers, 200); });
  if ("ResizeObserver" in window) new ResizeObserver(relayout).observe(out);

  apply();
  observe();
  boot(heroIn);
  setSound(sndSaved);
  layoutHero(); layoutLoop(); layoutThread(); layoutLanes(); layoutGraph(); frame();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { redrawCovers(); relayout(); });
  const m = location.hash.match(/^#work\/([\w-]+)/);
  if (m) setTimeout(() => openCase(m[1]), 300);
})();
