/*
 * alan.fung: one big thing per screen.
 *
 *   hero    terrain.js: my name as a landscape of sound you can hear, sing to and ripple
 *   work    one project at a time on a stage: footage recorded from its live page, the question,
 *           the measured number, and a sketch of the idea you can poke (sims.js)
 *   about   three numbers · path: six steps · tools: a marquee that points back at the work
 *   extras  case studies, a terminal on `, three themes
 *
 * All content comes from data.js. No framework, no build.
 */
(function () {
  "use strict";

  const D = window.PORTFOLIO, P = D.profile;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const BASE = ((document.currentScript && document.currentScript.src) || "").replace(/[^/]*$/, "");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mq = (m) => window.matchMedia && matchMedia(m).matches;
  const root = document.documentElement;
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const sha = (s) => hash(s).toString(16).padStart(8, "0").slice(0, 7);
  const ext = (u) => (/^https?:/.test(u) ? ` target="_blank" rel="noopener"` : "");

  const PROJ = D.projects;
  const FLAG = PROJ.filter((p) => p.tier === "flagship");
  const EXP = PROJ.filter((p) => p.tier !== "flagship");
  const SK = D.skills.flatMap((g) => g.items.map(([name, since, proof]) => ({ name, since, proof, group: g.group })));
  const ERAS = D.eras || [];
  const byId = (id) => PROJ.find((p) => p.id === id || p.name.toLowerCase() === String(id).toLowerCase() || (p.links.live || "").replace(/\//g, "") === String(id).toLowerCase());
  const proves = (p, s) => (p.stack || []).includes(s.name) || (p.uses || []).includes(s.name);
  const usedBy = (s) => FLAG.filter((p) => proves(p, s));
  const NOTES = D.writing.total;
  const fill = (t) => String(t || "").replace(/\{notes\}/g, NOTES);
  const media = (p, kind) => `${BASE}media/${p.id}.${kind}`;
  // VP9 where the browser has it (smaller, and some builds have no H.264), H.264 everywhere else
  const VEXT = (() => { try { return document.createElement("video").canPlayType('video/webm; codecs="vp9"') ? "webm" : "mp4"; } catch (e) { return "mp4"; } })();
  const THEMES = ["midnight", "paper", "phosphor"];
  const STATUS = { live: "live", source: "source only", wip: "in progress" };

  const state = { theme: root.dataset.theme || "midnight", motion: !mq("(prefers-reduced-motion: reduce)") };
  const save = () => { try { localStorage.setItem("alan.fung/config", JSON.stringify({ theme: state.theme })); } catch (e) {} };
  if (mq("(hover: hover) and (pointer: fine)")) root.classList.add("fine");

  /* --------------------------------------------------------------- text */
  // headings rise word by word; <em> keeps its gradient
  function split(el, html) {
    if (html != null) el.innerHTML = html;
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((w) => {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
            const o = document.createElement("span"); o.className = "w";
            const s = document.createElement("span"); s.style.setProperty("--i", i++); s.textContent = w;
            o.appendChild(s); frag.appendChild(o);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
  }
  const sec = D.sections || {};
  $("#tagline").innerHTML = P.tagline;
  $("#role").textContent = P.role;
  if (sec.work) $("#work-h").innerHTML = sec.work;
  if (sec.path) $("#path-h").innerHTML = sec.path;
  if (sec.tools) $(".band-cap").textContent = sec.tools;
  $$(".split").forEach((el) => split(el));

  /* ---------------------------------------------------------- reveal */
  const io = "IntersectionObserver" in window ? new IntersectionObserver((en) => en.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    if (e.target._onIn) e.target._onIn();
    io.unobserve(e.target);
  }), { rootMargin: "0px 0px -12% 0px" }) : null;
  const reveal = (el) => { if (io) io.observe(el); else { el.classList.add("in"); if (el._onIn) el._onIn(); } };

  /* -------------------------------------------------------------- hero */
  const hearBtn = $("#hear"), singBtn = $("#sing"), cap = $("#hear-cap");
  const CAP = "That's my name, as sound.";
  let terrain = null;
  const setCap = (html) => { cap.innerHTML = html; };
  function heroState(st) {
    hearBtn.classList.toggle("on", st === "playing");
    singBtn.classList.toggle("on", st === "listening");
    $(".t", hearBtn).textContent = st === "playing" ? "Stop" : "Hear it";
    $(".t", singBtn).textContent = st === "listening" ? "Stop" : "Sing to it";
    if (st === "playing") setCap("Each ridge is a pitch. <b>Listen to it rise.</b>");
    else if (st === "listening") setCap("Listening. Hum a note.");
    else setCap(CAP);
  }
  if (window.Terrain) {
    terrain = new window.Terrain($("#terrain"), {
      name: P.name,
      onState: heroState,
      onRead: (label) => { if (terrain && terrain.state === "listening") setCap(label ? `You: <b>${esc(label)}</b>` : "Listening. Hum a note."); }
    });
    terrain.setMotion(state.motion);
  }
  hearBtn.addEventListener("click", async () => {
    if (!terrain) return;
    if (terrain.state === "playing") { terrain.stop(); return; }
    if (!(await terrain.hear())) setCap("This browser can't play it.");
  });
  async function singNow(on) {
    if (!terrain) return;
    if (!on || terrain.state === "listening") { terrain.stop(); return; }
    const r = await terrain.sing(true);
    if (r === "blocked") setCap("The microphone is blocked here.");
    else if (r === "missing" || r === "unsupported") setCap("No microphone found.");
  }
  singBtn.addEventListener("click", () => singNow(true));
  // with nobody touching it, a drop lands on the name now and then
  let lastPointer = 0;
  window.addEventListener("pointermove", () => { lastPointer = performance.now(); }, { passive: true });
  setInterval(() => {
    if (!state.motion || document.hidden || performance.now() - lastPointer < 4000) return;
    if (terrain && scrollY < innerHeight * 0.8) terrain.drop();
    else if (hello && hello.seen) hello.drop();
  }, 2300);
  $$(".hero .rv").forEach((el, i) => { el.style.setProperty("--d", 0.35 + i * 0.12 + "s"); });
  $$(".hero .split").forEach((el) => el.style.setProperty("--d", "0.2s"));
  requestAnimationFrame(() => requestAnimationFrame(() => $$(".hero .rv, .hero .split").forEach((el) => el.classList.add("in"))));

  /* -------------------------------------------------------- work: the stage */
  const stage = $("#stage"), list = $("#stage-list"), frame = $("#frame"), frameIn = $("#frame-in"), info = $("#stage-info"), lab = $("#lab"), fcap = $("#frame-cap");
  const vids = $$(".vid", frame);
  const DUR = 8; // seconds on each project before the stage moves on
  let cur = -1, vOn = vids[0], elapsed = 0, holdUntil = 0, trying = false, stageSeen = false, hovering = false;
  const col = (p) => p.color || "#ff5d8f";
  list.innerHTML = FLAG.map((p, i) => `<li role="presentation" style="--sc:${esc(col(p))}"><button type="button" class="sl" role="tab" aria-selected="false" data-i="${i}" id="sl-${p.id}">
      <span class="sl-n">${String(i + 1).padStart(2, "0")}</span><span class="sl-name">${esc(p.name)}</span><span class="sl-kind">${esc(p.kind)}</span><span class="sl-bar" aria-hidden="true"></span>
    </button></li>`).join("");
  const lis = $$("li", list);
  function infoHTML(p, i) {
    const m = p.metrics && p.metrics[0];
    return `<p class="si-q">${esc(p.question || p.pitch)}</p>
      ${m ? `<p class="si-m"><b>${esc(m[0])}</b><i>${esc(m[1])}</i></p>` : "<span></span>"}
      <div class="si-acts">
        ${p.links.live ? `<a class="btn sm" href="${esc(p.links.live)}"${ext(p.links.live)}>Open ${esc(p.name.split(" ").pop())} <span aria-hidden="true">↗</span></a>` : ""}
        ${window.Sims && window.Sims.has(p.id) ? `<button type="button" class="btn sm ghost" data-try aria-pressed="${trying}">${trying ? "Watch the footage" : "Try it here"}</button>` : ""}
        <button type="button" class="btn sm ghost" data-case="${p.id}">How it works</button>
        <span class="more">${String(i + 1).padStart(2, "0")} / ${String(FLAG.length).padStart(2, "0")} · ${esc(p.kind)}</span>
      </div>`;
  }
  function playIfSeen(v) {
    if (!v) return;
    if (stageSeen && state.motion && !trying && !document.hidden) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); }
    else v.pause();
  }
  function show(i, by) {
    i = (i + FLAG.length) % FLAG.length;
    if (i === cur) return;
    const first = cur < 0;
    cur = i; elapsed = 0;
    const p = FLAG[i];
    stage.style.setProperty("--c", col(p));
    lis.forEach((li, k) => { li.classList.toggle("on", k === i); li.firstElementChild.setAttribute("aria-selected", String(k === i)); li.style.setProperty("--p", 0); });
    if (by === "user") { const b = lis[i].firstElementChild; if (list.scrollWidth > list.clientWidth) list.scrollTo({ left: b.parentElement.offsetLeft - 20, behavior: state.motion ? "smooth" : "auto" }); }
    info.innerHTML = infoHTML(p, i);
    fcap.textContent = trying ? `A sketch of the idea · the real thing is at ${p.links.live || "the link below"}` : `Recorded from ${p.links.live || p.name}`;
    // the next clip wipes in over the last one
    const next = first ? vOn : vids.find((v) => v !== vOn);
    next.poster = media(p, "webp");
    next.preload = stageSeen ? "auto" : "none";
    next.src = media(p, VEXT);
    next.setAttribute("aria-label", `${p.name}, recorded from its live page`);
    if (!first) {
      const prev = vOn;
      vOn = next;
      next.classList.remove("on"); void next.offsetWidth; next.classList.add("enter");
      frame.classList.remove("swap"); void frame.offsetWidth; frame.classList.add("swap");
      const done = () => { prev.classList.remove("on", "enter"); prev.pause(); next.classList.remove("enter"); next.classList.add("on"); };
      if (state.motion) setTimeout(done, 1100); else done();
    }
    playIfSeen(next);
    if (trying) showLab(p);
    // fetch the one after this, so the next wipe has footage ready
    const n = FLAG[(i + 1) % FLAG.length];
    if (stageSeen && !document.querySelector(`link[data-pre="${n.id}"]`)) { const l = document.createElement("link"); l.rel = "prefetch"; l.href = media(n, VEXT); l.dataset.pre = n.id; document.head.appendChild(l); }
  }
  list.addEventListener("click", (e) => { const b = e.target.closest(".sl"); if (!b) return; holdUntil = performance.now() + 20000; show(+b.dataset.i, "user"); });
  list.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault(); holdUntil = performance.now() + 20000;
    show(cur + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1), "user");
    lis[cur].firstElementChild.focus();
  });
  stage.addEventListener("pointerenter", () => { hovering = true; });
  stage.addEventListener("pointerleave", () => { hovering = false; });
  // the frame leans towards the pointer
  frame.addEventListener("pointermove", (e) => {
    if (!state.motion || e.pointerType !== "mouse") return;
    const r = frame.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    frameIn.style.setProperty("--ry", (x * 5).toFixed(2) + "deg"); frameIn.style.setProperty("--rx", (-y * 4).toFixed(2) + "deg");
    frameIn.style.setProperty("--gx2", ((x + 0.5) * 100).toFixed(1) + "%"); frameIn.style.setProperty("--gy2", ((y + 0.5) * 100).toFixed(1) + "%");
  });
  frame.addEventListener("pointerleave", () => { frameIn.style.setProperty("--rx", "0deg"); frameIn.style.setProperty("--ry", "0deg"); });
  frameIn.addEventListener("click", (e) => {
    if (trying || e.target.closest(".lab")) return;
    if (!state.motion) { vOn.paused ? vOn.play().catch(() => {}) : vOn.pause(); return; }
    openCase(FLAG[cur].id, frame);
  });
  // the sketches: one pane per project, made the first time it is asked for
  const panes = {};
  function showLab(p) {
    let pane = panes[p.id];
    if (!pane) {
      pane = document.createElement("div");
      pane.className = "lab-pane"; pane.style.setProperty("--c", col(p));
      pane.innerHTML = `${p.id === "atlas" ? `<form class="atlas-q" role="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="ask my notes anything" aria-label="Search my notes" autocomplete="off" spellcheck="false" enterkeyhint="search" /></form><ol class="atlas-res" aria-live="polite"></ol>` : ""}
        <canvas class="sim" role="img" aria-label="${esc("A sketch of " + p.name + ": " + (p.question || ""))}"></canvas>
        <div class="lab-ctl"><div class="sim-ctl"></div><p class="sim-read" aria-live="polite"></p></div>`;
      lab.appendChild(pane);
      panes[p.id] = pane;
      $$(".lab-pane", lab).forEach((x) => x.classList.toggle("on", x === pane));
      window.Sims.mount(pane, p.id, { notes: BASE + "notes.js" });
    }
    $$(".lab-pane", lab).forEach((x) => x.classList.toggle("on", x === pane));
    requestAnimationFrame(() => window.Sims.resize());
  }
  function setTrying(on) {
    trying = on;
    frame.classList.toggle("trying", on);
    lab.hidden = !on;
    const p = FLAG[cur];
    if (on) { showLab(p); vids.forEach((v) => v.pause()); } else playIfSeen(vOn);
    $$("[data-try]", info).forEach((b) => { b.textContent = on ? "Watch the footage" : "Try it here"; b.setAttribute("aria-pressed", String(on)); });
    fcap.textContent = on ? `A sketch of the idea · the real thing is at ${p.links.live}` : `Recorded from ${p.links.live || p.name}`;
  }
  info.addEventListener("click", (e) => { if (e.target.closest("[data-try]")) { holdUntil = performance.now() + 20000; setTrying(!trying); } });
  // the stage moves on by itself unless someone is looking closely
  let lastT = 0;
  function stageLoop(t) {
    requestAnimationFrame(stageLoop);
    const dt = Math.min(0.1, lastT ? (t - lastT) / 1000 : 0); lastT = t;
    if (!stageSeen || cur < 0 || document.hidden) return;
    const held = !state.motion || trying || hovering || performance.now() < holdUntil || (caseId != null);
    if (!held) elapsed += dt;
    const p = clamp(elapsed / DUR, 0, 1);
    lis[cur].style.setProperty("--p", p.toFixed(4));
    if (elapsed >= DUR) show(cur + 1, "auto");
  }
  requestAnimationFrame(stageLoop);
  if ("IntersectionObserver" in window) new IntersectionObserver((en) => {
    stageSeen = en[0].isIntersecting;
    if (stageSeen) { vids.forEach((v) => { if (v.preload !== "auto") v.preload = "auto"; }); playIfSeen(vOn); } else vids.forEach((v) => v.pause());
  }, { threshold: 0.25 }).observe(frame);
  else stageSeen = true;
  document.addEventListener("visibilitychange", () => playIfSeen(vOn));
  show(0, "auto");

  /* ------------------------------------------------------ about: three numbers */
  const WHO = D.whoami;
  $("#stats").innerHTML = WHO.lines.map((l, i) => `<li class="stat rv" style="--d:${i * 0.12}s">
      <p class="k">${esc(l.k)}</p>
      <b class="n" data-n="${esc(l.n)}">${esc(l.n)}</b>
      <span class="u">${esc(l.unit)}</span>
      <p class="p">${esc(l.proof)} ${l.link ? `<a href="${esc(l.link)}" ${l.link.startsWith("#work/") ? `data-case="${esc(l.link.slice(6))}"` : ""}>${esc(l.linkText)} →</a>` : ""}</p>
    </li>`).join("");
  // numbers count up the first time they are seen; words decode letter by letter
  function countUp(el) {
    const target = el.dataset.n, m = target.match(/^([\d.,]+)(.*)$/);
    if (!state.motion) return;
    const t0 = performance.now(), T = 1500;
    if (m) {
      const v = parseFloat(m[1].replace(/,/g, "")), dec = (m[1].split(".")[1] || "").length;
      const tick = (t) => { const k = clamp((t - t0) / T, 0, 1), e = 1 - Math.pow(1 - k, 4); el.textContent = (v * e).toFixed(dec) + m[2]; if (k < 1) requestAnimationFrame(tick); else el.textContent = target; };
      requestAnimationFrame(tick);
    } else {
      const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const tick = (t) => { const k = clamp((t - t0) / (T * 0.7), 0, 1); el.textContent = [...target].map((c, j) => (j / target.length < k ? c : A[(Math.random() * 26) | 0])).join(""); if (k < 1) requestAnimationFrame(tick); else el.textContent = target; };
      requestAnimationFrame(tick);
    }
  }
  $$(".stat").forEach((li) => { li._onIn = () => countUp($(".n", li)); reveal(li); });
  $("#aside").innerHTML = WHO.aside.map((a) => `<span>${esc(a.icon)} ${esc(fill(a.text))} ${a.link === "#hero" ? `<button type="button" data-act="sing">${esc(a.linkText)}</button>` : `<a href="${esc(a.link)}">${esc(a.linkText)}</a>`}</span>`).join('<span class="sep" aria-hidden="true">/</span>');

  /* ------------------------------------------------------------- path */
  const steps = $("#steps"), PATH = D.path || [];
  steps.innerHTML = PATH.map((s, i) => {
    const k = PATH.length > 1 ? i / (PATH.length - 1) : 1;
    const c = k < 0.5 ? `color-mix(in oklab, var(--t1) ${Math.round((1 - k * 2) * 100)}%, var(--t2))` : `color-mix(in oklab, var(--t2) ${Math.round((1 - (k - 0.5) * 2) * 100)}%, var(--t3))`;
    return `<li class="step" style="--i:${i};--s:${10 + Math.round(k * 10)}px;--sc:${c}"><p class="y">${esc(s.y)}</p><p class="r">${esc(s.r)}</p><p class="d">${esc(s.d)}</p></li>`;
  }).join("");
  reveal(steps);

  /* ------------------------------------------------------ tools: the marquee */
  const order = SK.slice().sort((a, b) => usedBy(b).length - usedBy(a).length || a.name.localeCompare(b.name));
  const rows = [order.filter((_, i) => i % 2 === 0), order.filter((_, i) => i % 2 === 1)];
  $("#marquee").innerHTML = rows.map((r, ri) => {
    const items = r.map((s) => `<button type="button" class="${usedBy(s).length ? "hot" : ""}" data-skill="${esc(s.name)}">${esc(s.name)}</button>`).join("");
    return `<div class="mq-row${ri ? " rev" : ""}" style="--dur:${80 + ri * 14}s">${items}<span aria-hidden="true" style="display:contents">${items.replace(/<button /g, '<button tabindex="-1" ')}</span></div>`;
  }).join("");
  const toastEl = $("#toast");
  let toastT = 0;
  function toast(html, ms = 3800) { toastEl.innerHTML = html; toastEl.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("on"), ms); }
  let filterT = 0;
  function pickSkill(name) {
    const s = SK.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    if (!s) return false;
    const ps = usedBy(s);
    if (!ps.length) { toast(`<b>${esc(s.name)}</b> · ${esc(s.proof || "since " + s.since)}`, 5000); return true; }
    list.classList.add("filter");
    lis.forEach((li, i) => li.classList.toggle("match", ps.includes(FLAG[i])));
    clearTimeout(filterT); filterT = setTimeout(() => list.classList.remove("filter"), 9000);
    holdUntil = performance.now() + 20000;
    go("work");
    show(FLAG.indexOf(ps[0]), "user");
    toast(`<b>${esc(s.name)}</b> · ${ps.map((p) => esc(p.name)).join(", ")}`, 5000);
    return true;
  }
  $("#marquee").addEventListener("click", (e) => { const b = e.target.closest("[data-skill]"); if (b) pickSkill(b.dataset.skill); });

  /* ------------------------------------------------------------ contact */
  $("#mail").href = "mailto:" + P.email; $("#mail").textContent = P.email;
  $("#elsewhere").innerHTML = `<a class="btn" href="mailto:${esc(P.email)}">Email me</a>
    <a class="btn ghost" href="${esc(P.github)}" target="_blank" rel="noopener">GitHub ↗</a>
    <a class="btn ghost" href="/blog/">StudyLog · ${NOTES} notes</a>
    ${EXP.filter((p) => p.id !== "studylog").map((p) => `<a class="btn ghost" href="${esc(p.links.live || p.links.source)}"${ext(p.links.live || p.links.source)}>${esc(p.name)}</a>`).join("")}`;
  $("#foot-c").textContent = `© ${new Date().getFullYear()} ${P.name}`;
  // the page ends the way it starts: a landscape, this time saying hello back
  let hello = null;
  if (window.Terrain && $("#hello")) { hello = new window.Terrain($("#hello"), { name: "hello", margin: 0.3 }); hello.setMotion(state.motion); }

  $$(".sec .rv, .tools-band .rv").forEach((el) => reveal(el));
  $$(".sec .split").forEach((el) => reveal(el));

  /* --------------------------------------------------------- case studies */
  const cs = $("#case"), csScroll = $("#case-scroll");
  let caseId = null, csReturn = null;
  function caseHTML(p) {
    const i = FLAG.indexOf(p), prev = FLAG[(i - 1 + FLAG.length) % FLAG.length], next = FLAG[(i + 1) % FLAG.length];
    const done = p.milestones ? p.milestones.filter((m) => m[1]).length : 0;
    return `<div class="case-in" style="--c:${esc(col(p))}">
      <button type="button" class="pill case-x" id="case-x" aria-label="Close the case study">esc ✕</button>
      <div class="kick"><b>${String(i + 1).padStart(2, "0")}</b><span>${esc(p.kind)}</span><span>${p.year}</span><span>${STATUS[p.status]}</span></div>
      <h2 id="case-title">${esc(p.name)}</h2>
      ${p.question ? `<p class="q">${esc(p.question)}</p>` : ""}
      <div class="case-media"><video src="${media(p, VEXT)}" poster="${media(p, "webp")}" muted playsinline loop ${state.motion ? "autoplay" : "controls"} aria-label="${esc(p.name)}, recorded from its live page"></video></div>
      <p class="pitch">${esc(p.pitch)}</p>
      ${p.metrics ? `<div class="metrics">${p.metrics.map(([v, l]) => `<span><b>${esc(v)}</b><i>${esc(l)}</i></span>`).join("")}</div>` : ""}
      <div class="actions">
        ${p.links.live ? `<a class="btn" href="${esc(p.links.live)}"${ext(p.links.live)}>Open ${esc(p.name)} ↗</a>` : ""}
        ${p.links.source ? `<a class="btn ghost" href="${esc(p.links.source)}"${ext(p.links.source)}>Source ↗</a>` : ""}
        ${p.links.original ? `<a class="btn ghost" href="${esc(p.links.original)}">Play the 2023 original</a>` : ""}
      </div>
      <div class="case-grid">
        ${p.why ? `<h4>Why</h4><p>${esc(p.why)}</p>` : ""}
        ${p.how ? `<h4>How it works</h4><ol>${p.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>` : ""}
        ${p.milestones ? `<h4>Milestones · ${done}/${p.milestones.length}</h4><ul class="miles">${p.milestones.map(([t, ok]) => `<li class="${ok ? "done" : ""}">${esc(t)}</li>`).join("")}</ul>` : ""}
        <h4>Stack</h4><div class="tags">${p.stack.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      </div>
      <div class="case-nav">
        <button type="button" data-case="${prev.id}">← previous<b>${esc(prev.name)}</b></button>
        <button type="button" data-case="${next.id}">next →<b>${esc(next.name)}</b></button>
      </div>
    </div>`;
  }
  function openCase(id, from) {
    const p = byId(id);
    if (!p || p.tier !== "flagship") return false;
    const wasOpen = caseId != null;
    caseId = p.id;
    if (!wasOpen) csReturn = from && from.focus ? from : document.activeElement;
    csScroll.innerHTML = caseHTML(p);
    csScroll.scrollTop = 0;
    cs.hidden = false;
    root.style.overflow = "hidden";
    vids.forEach((v) => v.pause());
    void cs.offsetWidth; // let the closed clip-path apply first, so opening animates
    requestAnimationFrame(() => { cs.classList.add("open"); $("#case-x").focus({ preventScroll: true }); });
    try { history.replaceState(null, "", "#work/" + p.id); } catch (e) {}
    return true;
  }
  function closeCase() {
    if (caseId == null) return;
    caseId = null;
    cs.classList.remove("open");
    root.style.overflow = "";
    setTimeout(() => { if (caseId == null) { cs.hidden = true; csScroll.innerHTML = ""; } }, state.motion ? 900 : 0);
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    playIfSeen(vOn);
    if (csReturn && csReturn.focus) csReturn.focus({ preventScroll: true });
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-case]");
    if (t) { e.preventDefault(); openCase(t.dataset.case, t); return; }
    if (e.target.closest("#case-x")) { closeCase(); return; }
    if (e.target.closest('[data-act="sing"]')) { e.preventDefault(); go("top"); setTimeout(() => singNow(true), state.motion ? 700 : 0); }
  });

  /* ---------------------------------------------------------- nav + scroll */
  const nav = $("#nav"), hero = $("#hero"), heroCopy = $(".hero-copy"), heroAct = $(".hero-act"), cv = $("#terrain");
  function go(id) {
    const el = id === "top" ? document.body : document.getElementById(id);
    if (!el) return;
    if (id === "top") window.scrollTo({ top: 0, behavior: state.motion ? "smooth" : "auto" });
    else el.scrollIntoView({ behavior: state.motion ? "smooth" : "auto", block: "start" });
  }
  $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href").slice(1);
    if (!id || id.startsWith("work/") || a.dataset.case) return;
    e.preventDefault(); go(id);
  }));
  const navLinks = $$(".links a");
  if ("IntersectionObserver" in window) {
    const secObs = new IntersectionObserver((en) => en.forEach((e) => {
      if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle("on", a.dataset.sec === e.target.id));
    }), { rootMargin: "-45% 0px -50% 0px" });
    ["work", "about", "path", "contact"].forEach((id) => secObs.observe(document.getElementById(id)));
  }
  let ticking = false;
  function onScroll() {
    ticking = false;
    const y = scrollY, h = hero.offsetHeight;
    nav.classList.toggle("solid", y > 30);
    if (y < h * 1.1) {
      const k = clamp(y / h, 0, 1);
      if (state.motion) {
        cv.style.transform = `translateY(${(y * 0.35).toFixed(1)}px)`;
        heroCopy.style.transform = heroAct.style.transform = `translateY(${(-y * 0.12).toFixed(1)}px)`;
      }
      cv.style.opacity = (1 - k * 0.85).toFixed(3);
      heroCopy.style.opacity = heroAct.style.opacity = (1 - k * 1.6).toFixed(3);
    }
    // the stage tips up into view as it arrives
    const r = frame.getBoundingClientRect(), vh = innerHeight;
    const sp = state.motion ? clamp((vh - r.top) / (vh * 0.75), 0, 1) : 1;
    if (Math.abs(sp - spLast) > 0.001) { spLast = sp; frame.style.setProperty("--sp", (1 - Math.pow(1 - sp, 3)).toFixed(4)); }
  }
  let spLast = -1;
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ------------------------------------------------------------- theme */
  function setTheme(t) {
    state.theme = t; root.dataset.theme = t; save();
    const m = $('meta[name="theme-color"]'); if (m) m.content = getComputedStyle(root).getPropertyValue("--bg").trim();
    requestAnimationFrame(() => { if (terrain) terrain.theme(); if (hello) hello.theme(); if (window.Sims) window.Sims.theme(); });
  }
  $("#btn-theme").addEventListener("click", () => { const t = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length]; setTheme(t); toast(`theme = <b>${t}</b>`, 1600); });
  function setMotion(on) {
    state.motion = on;
    if (terrain) terrain.setMotion(on);
    if (hello) hello.setMotion(on);
    if (window.Sims) window.Sims.motion(on);
    playIfSeen(vOn);
  }

  /* ------------------------------------------------------------ cursor */
  if (root.classList.contains("fine")) {
    const cur$ = $(".cursor"), lab$ = $("span", cur$);
    let x = -100, y = -100, cx = -100, cy = -100, on = false;
    window.addEventListener("pointermove", (e) => {
      x = e.clientX; y = e.clientY;
      if (!on) { on = true; cx = x; cy = y; requestAnimationFrame(move); }
      const t = e.target;
      const overFrame = t.closest && t.closest(".frame-in") && !trying && !t.closest(".lab");
      cur$.classList.toggle("big", !!overFrame);
      cur$.classList.toggle("link", !overFrame && !!(t.closest && t.closest("a, button, input, .sl, [data-skill]")));
      cur$.classList.toggle("hide", !!(t.closest && t.closest(".terrain")));
      lab$.textContent = overFrame ? (state.motion ? "How it works" : "Play") : "";
    }, { passive: true });
    document.addEventListener("pointerleave", () => cur$.classList.add("hide"));
    function move() {
      cx += (x - cx) * 0.22; cy += (y - cy) * 0.22;
      cur$.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
      requestAnimationFrame(move);
    }
    // buttons lean towards the pointer
    $$(".hero .btn, .contact .btn").forEach((b) => {
      b.addEventListener("pointermove", (e) => { if (!state.motion) return; const r = b.getBoundingClientRect(); b.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1)}px, ${((e.clientY - r.top - r.height / 2) * 0.25).toFixed(1)}px)`; });
      b.addEventListener("pointerleave", () => { b.style.transform = ""; });
    });
  }

  /* ----------------------------------------------------------- terminal */
  const term = $("#term"), tout = $("#term-out"), tin = $("#term-input");
  const hist = [];
  let hi = 0, greeted = false;
  const print = (html, cls) => { const d = document.createElement("div"); if (cls) d.className = cls; d.innerHTML = html; tout.appendChild(d); tout.scrollTop = tout.scrollHeight; };
  function openTerm(open) {
    const show = open == null ? term.hidden : open;
    term.hidden = !show;
    if (show) {
      if (!greeted) { greeted = true; print(`Welcome to <span class="a">alan@fung</span>. Type <span class="a">help</span>. Try <span class="a">show relay</span> or <span class="a">name Ada</span>.`); }
      setTimeout(() => tin.focus(), 30);
    } else tin.blur();
  }
  $("#btn-term").addEventListener("click", () => openTerm());
  $("#term-x").addEventListener("click", () => openTerm(false));
  const goURL = (url) => { if (/^https?:/.test(url)) window.open(url, "_blank", "noopener"); else location.href = url; };
  const gitLog = () => ERAS.slice().reverse().flatMap((e) => e.events.slice().reverse().map(([d, t]) => `<span style="color:var(--acc)">*</span> <span style="color:var(--num)">${sha(d + t)}</span> ${esc(d.padEnd(7))} ${esc(t)}`)).join("\n");
  const CMDS = {
    help: () => esc([
      "whoami                 who is this",
      "ls                     list projects",
      "show <id>              open a case study (e.g. show relay)",
      "try <id>               poke a sketch of it on the stage",
      "open <id|blog|github>  run a project",
      "skills [name]          what I build with, and where (e.g. skills c++)",
      "git log                every commit of my history",
      "checkout <year>        one chapter (2018 … next)",
      "blog                   latest notes",
      "contact                get in touch",
      "play                   hear my name as sound",
      "sing                   sing to it (microphone)",
      "name <text>            rewrite the landscape",
      "",
      "theme <midnight|paper|phosphor> · motion <on|off>",
      "clear · exit"
    ].join("\n")),
    whoami: () => `${esc(P.name)} · ${esc(P.role)} · @${esc(P.handle)}\n${WHO.lines.map((l) => `${esc(l.k.padEnd(30))} ${esc(l.n)} ${esc(l.unit)}`).join("\n")}`,
    about: () => WHO.lines.map((l) => `${esc(l.k)}\n  ${esc(l.proof)}`).concat(WHO.aside.map((a) => esc(fill(a.text)))).join("\n\n"),
    ls: () => PROJ.map((p) => `${p.tier.padEnd(11)} ${STATUS[p.status].padEnd(12)} ${p.id.padEnd(12)} ${esc(p.name)}`).join("\n"),
    show: (a) => { const p = byId(a[0] || ""); if (!p || p.tier !== "flagship") return `<span class="e">show: no project "${esc(a[0] || "")}". try ls</span>`; openTerm(false); openCase(p.id); return `git show ${p.id}`; },
    try: (a) => {
      const p = byId(a[0] || "");
      if (!p || !FLAG.includes(p)) return `<span class="e">try: no project "${esc(a[0] || "")}". try ls</span>`;
      openTerm(false); go("work"); holdUntil = performance.now() + 20000; show(FLAG.indexOf(p), "user"); if (!trying) setTrying(true);
      return `trying ${p.id}`;
    },
    open: (a) => {
      const k = (a[0] || "").toLowerCase();
      if (k === "blog" || k === "studylog") { goURL("/blog/"); return "opening /blog/ …"; }
      if (k === "github") { goURL(P.github); return `opening ${esc(P.github)} …`; }
      const p = byId(k);
      if (!p) return `<span class="e">open: no project "${esc(k)}". try ls</span>`;
      const url = p.links.live || p.links.source;
      goURL(url);
      return `opening ${esc(p.name)} → ${esc(url)} …`;
    },
    checkout: (a) => {
      const e = ERAS.find((x) => x.label === a[0] || x.id === a[0]);
      if (!e) return `<span class="e">checkout: pick one of ${ERAS.map((x) => x.label).join(" ")}</span>`;
      return `HEAD is now at ${sha(e.id)} ${esc(e.title)} (${esc(e.role)})\n${esc(e.text)}`;
    },
    git: (a) => (a[0] === "log" ? gitLog() : a[0] === "checkout" ? CMDS.checkout(a.slice(1)) : "usage: git log | git checkout <year>"),
    skills: (a) => {
      const k = a.join(" ").toLowerCase();
      const found = k ? SK.filter((x) => x.name.toLowerCase().includes(k)) : SK;
      if (!found.length) return `<span class="e">skills: nothing matches "${esc(k)}"</span>`;
      if (k && found.length === 1) { openTerm(false); pickSkill(found[0].name); }
      const w = Math.max(...SK.map((s) => s.name.length)) + 2;
      return found.map((x) => { const ps = usedBy(x); return `${esc(x.name.padEnd(w))} since ${x.since}  ${ps.length ? ps.map((p) => esc(p.id)).join(", ") : `<span style="color:var(--mute)">${esc(x.proof || "")}</span>`}`; }).join("\n");
    },
    blog: () => D.writing.latest.map((p) => `${p.date}  <a href="${esc(p.url)}">${esc(p.title)}</a>`).join("\n") + `\n\n${NOTES} notes in total → <a href="/blog/">/blog/</a>`,
    contact: () => `email   <a href="mailto:${esc(P.email)}">${esc(P.email)}</a>\ngithub  <a href="${esc(P.github)}" target="_blank" rel="noopener">${esc(P.github)}</a>`,
    theme: (a) => {
      if (!a[0]) return `theme = "${state.theme}"  (${THEMES.join(" | ")})`;
      if (!THEMES.includes(a[0])) return `<span class="e">unknown theme. pick ${THEMES.join(" | ")}</span>`;
      setTheme(a[0]); return `<span class="a">✓</span> theme = "${a[0]}"`;
    },
    motion: (a) => { if (!a[0]) return `motion = ${state.motion}`; setMotion(/^(on|true|1|yes)$/i.test(a[0])); return `<span class="a">✓</span> motion = ${state.motion}`; },
    name: (a) => {
      if (!terrain) return `<span class="e">the landscape needs WebGL or a canvas</span>`;
      const n = a.join(" ").slice(0, 24) || P.name;
      terrain.setName(n); openTerm(false); go("top");
      return `<span class="a">✓</span> name = "${esc(n)}"  (play to hear it)`;
    },
    play: () => { openTerm(false); go("top"); setTimeout(() => { if (terrain && terrain.state !== "playing") hearBtn.click(); }, state.motion ? 600 : 0); return `hear("${esc(P.name)}") ▶`; },
    sing: () => { openTerm(false); go("top"); setTimeout(() => singNow(true), state.motion ? 600 : 0); return "listening…"; },
    clear: () => { tout.innerHTML = ""; return null; },
    exit: () => { openTerm(false); return null; },
    echo: (a) => esc(a.join(" ")),
    date: () => new Date().toString(),
    pwd: () => "/home/alan/portfolio",
    sudo: () => `<span class="e">alan is not in the sudoers file. This incident will be reported.</span>`,
    rm: () => `<span class="e">nice try. this page is immutable (mostly).</span>`,
    hi: () => `hi! 👋 type <span class="a">contact</span> for my email and GitHub.`
  };
  Object.assign(CMDS, { projects: CMDS.ls, hello: CMDS.hi, "?": CMDS.help, cd: CMDS.checkout, history: () => hist.join("\n"), stack: CMDS.skills, listen: CMDS.sing, hire: CMDS.contact });
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
        ? (["open", "show", "try"].includes(parts[0]) ? PROJ.map((p) => p.id).concat(parts[0] === "open" ? ["blog", "github"] : []) : parts[0] === "theme" ? THEMES : parts[0] === "checkout" ? ERAS.map((x) => x.label) : [])
        : Object.keys(CMDS);
      const hit = pool.filter((c) => c.startsWith(parts[parts.length - 1]));
      if (hit.length === 1) { parts[parts.length - 1] = hit[0]; tin.value = parts.join(" ") + " "; }
      else if (hit.length > 1) print(hit.join("  "));
    }
  });

  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest && e.target.closest("input, textarea, [contenteditable]");
    if (e.key === "Escape") { if (caseId != null) closeCase(); else if (!term.hidden) openTerm(false); else if (trying) setTrying(false); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "`" || e.key === "~") { e.preventDefault(); openTerm(); return; }
    if (caseId != null && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      const i = FLAG.findIndex((p) => p.id === caseId);
      openCase(FLAG[(i + (e.key === "ArrowRight" ? 1 : -1) + FLAG.length) % FLAG.length].id);
    }
  });

  /* ------------------------------------------------------------- resize */
  let rl;
  window.addEventListener("resize", () => {
    clearTimeout(rl);
    rl = setTimeout(() => { if (terrain) terrain.resize(); if (hello) hello.resize(); if (window.Sims) window.Sims.resize(); onScroll(); }, 80);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (terrain) { terrain.theme(); terrain.setName(terrain.name); } if (hello) { hello.theme(); hello.setName("hello"); } if (window.Sims) window.Sims.theme(); });
  const deep = location.hash.match(/^#work\/([\w-]+)/);
  if (deep) setTimeout(() => openCase(deep[1]), 300);
})();
