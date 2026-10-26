/*
 * Round 6: the page as the product. Everything that moves is GSAP 3.15 (ScrollTrigger, SplitText,
 * Flip, Draggable, CustomEase) on Lenis 1.3, set up the way the reference sites set them up (see
 * lab/README.md). The scroll is the browser's own, smoothed by Lenis and never snapped.
 */
(function () {
  "use strict";

  var html = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var P = window.PORTFOLIO || {};

  gsap.registerPlugin(ScrollTrigger, SplitText, Flip, Draggable, InertiaPlugin, CustomEase, ScrambleTextPlugin);
  // ERA Residence's eases, read from their code: Out for arrivals, InOut for moves, In for exits
  CustomEase.create("Out", "0.25,1,0.5,1");
  CustomEase.create("InOut", "0.75,0,0.25,1");
  CustomEase.create("In", "0.5,0,0.75,0");
  ScrollTrigger.config({ ignoreMobileResize: true });

  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (fine) html.classList.add("fine");
  var q = new URLSearchParams(location.search);
  var store = {};
  try { store = JSON.parse(localStorage.getItem("af.product") || "{}"); } catch (e) {}
  function save(k, v) { store[k] = v; try { localStorage.setItem("af.product", JSON.stringify(store)); } catch (e) {} }

  // a slow device gets the same page with less going on: no drift on the name, no marquee speed-ups,
  // no scaling as the cards stack (set here, or later by the frame watcher under "the work")
  var lite = q.has("lite") || (navigator.hardwareConcurrency || 8) <= 2 || (navigator.connection && navigator.connection.saveData);
  if (lite) html.classList.add("lite");
  var calm = function () { return html.classList.contains("calm"); };

  /* ------------------------------------------------------------ smooth scroll */

  var lenis = null;
  function startLenis() {
    if (lenis || calm()) return;
    // ERA's settings: 1.2 s glide on an exponential ease-out; touch keeps the native scroll
    lenis = new Lenis({ duration: 1.2, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
  }
  function stopLenis() { if (lenis) { lenis.destroy(); lenis = null; } }
  gsap.ticker.add(function (t) { if (lenis) lenis.raf(t * 1000); });
  gsap.ticker.lagSmoothing(0);
  startLenis();

  function scrollToEl(target, instant) {
    var el = typeof target === "string" ? $(target) : target;
    if (!el) return;
    var y = el.getBoundingClientRect().top + window.scrollY;
    if (lenis && !instant) lenis.scrollTo(y, { duration: 1.6, easing: gsap.parseEase("InOut") });
    else window.scrollTo({ top: y, behavior: calm() || instant ? "auto" : "smooth" });
  }

  /* ------------------------------------------------------------ header, bar, folio */

  // The tone under the header and the folio number are read from ranges, not toggle callbacks, so a
  // jump (an anchor link, the palette, Back to top) can't leave them on a section it flew past. The
  // ranges refresh after the pins (refreshPriority -1), so they include the pinned sections' spacing.
  var tones = $$("[data-tone]").map(function (sec) {
    return { v: sec.dataset.tone, st: ScrollTrigger.create({ trigger: sec, start: "top top+=32", end: "bottom top+=32", refreshPriority: -1 }) };
  });
  var numbered = $$("[data-n]").map(function (sec, i) {
    return { v: String(i + 1).padStart(2, "0"), st: ScrollTrigger.create({ trigger: sec, start: "top center", end: "bottom center", refreshPriority: -1 }) };
  });
  var folio = $("#folio");
  folio.lastChild.textContent = "/ " + String(numbered.length).padStart(2, "0");
  function pick(list, y, fallback) {
    for (var i = list.length - 1; i >= 0; i--) if (y >= list[i].st.start) return y < list[i].st.end ? list[i].v : fallback;
    return list.length ? list[0].v : fallback;
  }

  var lastY = 0;
  ScrollTrigger.create({
    start: 0, end: "max", refreshPriority: -2,
    onUpdate: function (self) {
      var y = self.scroll();
      html.classList.toggle("scrolled", y > 8);
      // hide the header going down past the first screen, bring it back on the way up
      if (!html.classList.contains("palette-open")) html.classList.toggle("hide-top", y > innerHeight * 0.9 && y > lastY + 2 ? true : y < lastY - 2 ? false : html.classList.contains("hide-top"));
      lastY = y;
      gsap.set("#bar", { scaleX: self.progress });
      var u = pick(tones, y, html.dataset.under);
      if (u !== html.dataset.under) html.dataset.under = u;
      var n = pick(numbered, y, folio.firstChild.textContent);
      if (n !== folio.firstChild.textContent) folio.firstChild.textContent = n;
    }
  });
  html.dataset.under = "light";

  /* ------------------------------------------------------------ hero: the name in a frame */

  var name = $("#hero-h");
  var hero = $("#hero");
  var split = new SplitText(name.querySelectorAll(".nw"), { type: "chars", charsClass: "ch-l" });
  var chars = split.chars;

  function fitName() {
    // ERA's fitText: size the name so it spans the content width exactly
    if (innerWidth < 900) { name.style.fontSize = ""; return; }
    name.style.fontSize = "100px";
    var ws = name.querySelectorAll(".nw"), w = ws[ws.length - 1].getBoundingClientRect().right - ws[0].getBoundingClientRect().left;
    var avail = hero.clientWidth - 2 * parseFloat(getComputedStyle(hero).paddingLeft);
    name.style.fontSize = Math.min(100 * avail / w, innerHeight * 0.46) + "px";
  }
  fitName();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { fitName(); ScrollTrigger.refresh(); });
  addEventListener("resize", function () { fitName(); });

  function intro() {
    var seen = html.classList.contains("seen");
    try { sessionStorage.setItem("af.seen", "1"); } catch (e) {}
    var meta = $$(".hero-meta p, .hero-foot > *");
    if (calm()) return;
    var tl = gsap.timeline({ defaults: { ease: "Out" } });
    if (!seen) {
      // a selection frame is drawn around where the name will be, its size counting up like a design tool
      var frame = $("#frame"), size = $("#frame-size");
      var hr = hero.getBoundingClientRect(), nr = name.getBoundingClientRect();
      var box = { w: 0, h: 0 };
      gsap.set(frame, { left: nr.left - hr.left + nr.width / 2, top: nr.top - hr.top + nr.height / 2, width: 0, height: 0, opacity: 1 });
      tl.to(box, {
        w: nr.width, h: nr.height, duration: 0.9, ease: "InOut",
        onUpdate: function () {
          gsap.set(frame, { width: box.w, height: box.h, left: nr.left - hr.left + (nr.width - box.w) / 2, top: nr.top - hr.top + (nr.height - box.h) / 2 });
          size.textContent = Math.round(box.w) + " × " + Math.round(box.h);
        }
      });
      tl.from(chars, { yPercent: 70, opacity: 0, rotate: function () { return gsap.utils.random(-10, 10); }, duration: 0.9, stagger: 0.035 }, "-=0.25");
      tl.to(frame, { opacity: 0, duration: 0.4, ease: "In" }, "-=0.2");
      tl.from(meta, { y: 18, opacity: 0, duration: 0.8, stagger: 0.06 }, "-=0.7");
    } else {
      tl.from(chars, { yPercent: 50, opacity: 0, duration: 0.7, stagger: 0.02 });
      tl.from(meta, { y: 12, opacity: 0, duration: 0.6, stagger: 0.04 }, "-=0.5");
    }
  }

  // grab a letter; it springs home when let go
  if (fine) {
    Draggable.create(chars, {
      type: "x,y", zIndexBoost: true,
      onPress: function () { gsap.killTweensOf(this.target); this.target.classList.add("grab"); },
      onRelease: function () {
        this.target.classList.remove("grab");
        gsap.to(this.target, { x: 0, y: 0, rotation: 0, duration: 1.3, ease: "elastic.out(1, 0.32)" });
      },
      onDrag: function () { gsap.set(this.target, { rotation: gsap.utils.clamp(-14, 14, this.deltaX * 0.8) }); }
    });
  }

  // leaving the hero: the two words drift apart and the page behind recedes as the window rises
  if (!lite) {
    gsap.to(".hero .nw", {
      yPercent: function (i) { return i ? -26 : -12; }, xPercent: function (i) { return i ? 6 : -4; }, ease: "none",
      scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true }
    });
  }
  gsap.to(".hero", { scale: 0.94, opacity: 0.35, transformOrigin: "50% 30%", ease: "none", scrollTrigger: { trigger: ".statement", start: "top bottom", end: "top top", scrub: true } });

  /* ------------------------------------------------------------ statement: the window opens */

  var st = $("#statement");
  gsap.fromTo(st, { "--wx": "18%", "--wr": "36px" }, { "--wx": "0%", "--wr": "0px", ease: "none", scrollTrigger: { trigger: st, start: "top bottom", end: "top 8%", scrub: true } });
  var words = new SplitText("#big", { type: "words", wordsClass: "w" }).words;
  if (!calm()) {
    gsap.to(words, {
      opacity: 1, stagger: 0.12, ease: "none",
      scrollTrigger: { trigger: ".st-pin", start: "top top", end: "+=120%", pin: true, scrub: 0.6 }
    });
  }

  /* ------------------------------------------------------------ odometers */

  function odometer(el) {
    // Nick Ho's odometer: each digit is a masked column of 0-9 rolled into place
    var text = el.textContent.trim();
    el.setAttribute("aria-label", text);
    el.innerHTML = "";
    var cols = [];
    text.split("").forEach(function (c, i) {
      if (/\d/.test(c)) {
        var d = document.createElement("span"); d.className = "dg"; d.setAttribute("aria-hidden", "true");
        var inner = document.createElement("span");
        var turns = 1 + (i % 2);
        for (var k = 0; k <= 10 * turns + +c; k++) { var s = document.createElement("span"); s.textContent = k % 10; inner.appendChild(s); }
        d.appendChild(inner); el.appendChild(d);
        cols.push({ inner: inner, n: 10 * turns + +c });
      } else {
        var t = document.createElement("span"); t.textContent = c; t.setAttribute("aria-hidden", "true"); el.appendChild(t);
      }
    });
    if (calm()) { cols.forEach(function (c) { gsap.set(c.inner, { yPercent: -100 * c.n / (c.n + 1) }); }); return; }
    ScrollTrigger.create({
      trigger: el, start: "top 92%", once: true,
      onEnter: function () {
        cols.forEach(function (c, i) {
          gsap.fromTo(c.inner, { yPercent: 0 }, { yPercent: -100 * c.n / (c.n + 1), duration: 1.6 + i * 0.12, ease: "InOut" });
        });
      }
    });
  }
  $$(".odo").forEach(odometer);

  /* ------------------------------------------------------------ headings and reveals */

  $$("[data-split]").forEach(function (h) {
    if (calm()) return;
    SplitText.create(h, {
      type: "lines", mask: "lines", autoSplit: true,
      onSplit: function (self) {
        return gsap.from(self.lines, { yPercent: 105, duration: 1.1, stagger: 0.09, ease: "Out", scrollTrigger: { trigger: h, start: "top 85%", once: true } });
      }
    });
  });
  if (!calm()) {
    $$(".ch").forEach(function (ch) {
      var bits = $$(".ch-n, h3, .ch-p, .fits, .proof", ch);
      gsap.from(bits, { y: 28, opacity: 0, duration: 1, stagger: 0.07, ease: "Out", scrollTrigger: { trigger: ch, start: "top 70%", once: true } });
      gsap.from($(".app", ch), { y: 40, opacity: 0, duration: 1.1, ease: "Out", scrollTrigger: { trigger: ch, start: "top 65%", once: true } });
    });
    $$(".tile").forEach(function (t, i) {
      gsap.from(t, { y: 40, opacity: 0, duration: 1, delay: (i % 3) * 0.08, ease: "Out", scrollTrigger: { trigger: t, start: "top 90%", once: true } });
    });
  }

  /* ------------------------------------------------------------ the work: cards stack */

  var mm = gsap.matchMedia(), stacks = [];
  mm.add("(min-width: 900px) and (min-height: 620px)", function () {
    var chs = $$(".ch");
    // a card the next one has fully covered is hidden, so the stack never draws seven screens at once
    chs.forEach(function (ch, i) {
      var next = chs[i + 1];
      if (next) ScrollTrigger.create({ trigger: next, start: "top top", onEnter: function () { ch.style.visibility = "hidden"; }, onLeaveBack: function () { ch.style.visibility = ""; } });
    });
    if (lite || calm()) return function () { chs.forEach(function (ch) { ch.style.visibility = ""; }); };
    chs.forEach(function (ch, i) {
      var next = chs[i + 1];
      if (!next) return;
      // scale and shade only: both stay on the compositor, so a stacked card is never repainted
      var card = $(".card", ch), dim = $(".card-dim", card) || card.appendChild(document.createElement("i"));
      dim.className = "card-dim";
      stacks.push(gsap.timeline({ scrollTrigger: { trigger: next, start: "top bottom", end: "top top", scrub: true } })
        .to(card, { scale: 0.9, ease: "none" }, 0)
        .to(dim, { opacity: 0.55, ease: "none" }, 0));
    });
    return function () { chs.forEach(function (ch) { ch.style.visibility = ""; }); };
  });

  // If scrolling runs slow on this device (median frame over 30 ms across two seconds of scrolling),
  // drop to the lite page: the cards stop scaling as they stack and the shadows flatten. Checked once.
  var slow = [];
  gsap.ticker.add(function watch(t, dt) {
    if (lite) return gsap.ticker.remove(watch);
    if (!lenis || !lenis.isScrolling) return;
    slow.push(dt);
    if (slow.length < 120) return;
    slow.sort(function (a, b) { return a - b; });
    var med = slow[60];
    slow = [];
    if (med <= 30) return;
    lite = true;
    html.classList.add("lite");
    flatten();
  });
  function flatten() { stacks.forEach(function (tl) { tl.scrollTrigger.kill(); tl.progress(0).kill(); }); stacks = []; }

  // demos start when they come near the screen, and pause when they leave it
  var demos = window.DEMOS || {};
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var el = e.target, d = demos[el.dataset.demo];
      if (!d) return;
      if (e.isIntersecting && !el._demo) { el._demo = d.init(el, { calm: calm, lenis: function () { return lenis; } }) || {}; }
      if (el._demo && el._demo.visible) el._demo.visible(e.isIntersecting);
    });
  }, { rootMargin: "300px 0px" });
  $$("[data-demo]").forEach(function (el) { io.observe(el); });

  /* ------------------------------------------------------------ where it fits: the marquee */

  var mqs = $$(".marquee").map(function (m) {
    var track = $(".mq-track", m);
    track.innerHTML += track.innerHTML + track.innerHTML;
    return { track: track, dir: +m.dataset.dir, x: 0, w: 0 };
  });
  function measureMq() { mqs.forEach(function (m) { m.w = m.track.scrollWidth / 3; }); }
  measureMq();
  addEventListener("resize", measureMq);
  var mqOn = false, vel = 0, lastS = scrollY, flip = 1;
  ScrollTrigger.create({ trigger: ".fit", start: "top bottom", end: "bottom top", onToggle: function (s) { mqOn = s.isActive; } });
  gsap.ticker.add(function (t, dt) {
    var s = scrollY, d = s - lastS; lastS = s;
    if (!mqOn) return;
    // Nick Ho's marquee: it keeps rolling, the scroll pushes it, and scrolling up turns it round
    if (Math.abs(d) > 0.5) flip = d > 0 ? 1 : -1;
    vel += ((calm() || lite ? 0 : Math.min(Math.abs(d), 60) * 0.12) - vel) * 0.1;
    var step = calm() ? 0 : (0.6 + vel) * flip * Math.min(dt, 50) / 16.7;
    mqs.forEach(function (m) {
      m.x = gsap.utils.wrap(-m.w, 0, m.x + step * m.dir);
      m.track.style.transform = "translate3d(" + m.x + "px,0,0)";
    });
  });

  /* ------------------------------------------------------------ how I got here: sideways */

  var years = $("#years");
  (P.path || []).forEach(function (s, i, all) {
    var li = document.createElement("li");
    li.className = "yr" + (i === all.length - 1 ? " now" : "");
    li.innerHTML = '<span class="y">' + s.y + "</span><h3>" + s.r + "</h3><p>" + s.d + "</p>" + (i === all.length - 1 ? '<span class="so">So far. Still climbing.</span>' : "");
    years.appendChild(li);
  });
  mm.add("(min-height: 520px)", function () {
    var last = years.lastElementChild;
    var dist = function () { return Math.max(0, last.offsetLeft + last.offsetWidth - innerWidth + 2 * parseFloat(getComputedStyle(years).paddingLeft)); };
    var tl = gsap.timeline({ scrollTrigger: { trigger: ".path-pin", start: "top top", end: function () { return "+=" + dist(); }, pin: true, scrub: 0.8, invalidateOnRefresh: true } });
    tl.to(years, { x: function () { return -dist(); }, ease: "none" }, 0);
    tl.to("#path-fill", { scaleX: 1, ease: "none" }, 0);
    $$(".yr .y").forEach(function (y) { tl.fromTo(y, { xPercent: 18 }, { xPercent: -18, ease: "none" }, 0); });
  });

  /* ------------------------------------------------------------ contact */

  if (!calm()) {
    SplitText.create(".huge", {
      type: "chars", mask: "chars",
      onSplit: function (self) { return gsap.from(self.chars, { yPercent: 110, duration: 1.1, stagger: 0.04, ease: "Out", scrollTrigger: { trigger: ".huge", start: "top 85%", once: true } }); }
    });
  }
  $("#copy").addEventListener("click", function () {
    var b = this, s = b.firstChild;
    var done = function () { gsap.to(s, { duration: 0.6, scrambleText: { text: "Copied ✓", chars: "abcdefghij", speed: 0.6 } }); setTimeout(function () { gsap.to(s, { duration: 0.6, scrambleText: { text: "Copy email", chars: "abcdefghij" } }); }, 2200); };
    if (navigator.clipboard) navigator.clipboard.writeText(P.profile ? P.profile.email : "aflung10@gmail.com").then(done, done); else done();
  });
  $("#totop").addEventListener("click", function () { scrollToEl("#hero"); $(".mark").focus({ preventScroll: true }); });

  // ERA's magnetic pills: they lean toward the pointer and spring back
  if (fine) $$("[data-magnetic]").forEach(function (el) {
    el.addEventListener("mousemove", function (e) {
      var r = el.getBoundingClientRect();
      gsap.to(el, { x: ((e.clientX - r.left) / r.width - 0.5) * 18, y: ((e.clientY - r.top) / r.height - 0.5) * 14, duration: 1.2, ease: "power4.out" });
    });
    el.addEventListener("mouseleave", function () { gsap.to(el, { x: 0, y: 0, duration: 1.4, ease: "elastic.out(1, 0.3)" }); });
  });

  /* ------------------------------------------------------------ the labelled cursor */

  if (fine) {
    var cur = $("#cursor"), lab = $("span", cur);
    var cx = gsap.quickTo(cur, "x", { duration: 0.35, ease: "power3" }), cy = gsap.quickTo(cur, "y", { duration: 0.35, ease: "power3" });
    var shown = "";
    addEventListener("pointermove", function (e) { cx(e.clientX); cy(e.clientY); }, { passive: true });
    document.addEventListener("pointerover", function (e) {
      var t = e.target.closest && e.target.closest("[data-cursor], .app a, input[type=range], textarea, .hit a");
      var label = t ? (t.dataset.cursor || (t.matches("textarea") ? "Type" : t.matches("input[type=range]") ? "Slide" : "Open")) : "";
      if (label === shown) return;
      shown = label;
      cur.classList.toggle("on", !!label);
      if (label) lab.textContent = label;
    });
    document.addEventListener("pointerleave", function () { cur.classList.remove("on"); shown = ""; });
  }

  /* ------------------------------------------------------------ switches: theme, design view, calm */

  var swTheme = [$("#sw-theme"), $("#big-theme")], swGrid = [$("#sw-grid"), $("#big-grid")], swCalm = [$("#big-calm")];
  function press(btns, on) { btns.forEach(function (b) { b.setAttribute("aria-pressed", on ? "true" : "false"); }); }

  function applyTheme(dark) {
    if (dark) html.dataset.theme = "dark"; else delete html.dataset.theme;
    press(swTheme, dark);
    $("meta[name=theme-color]").setAttribute("content", dark ? "#161512" : "#f2efe8");
    save("theme", dark ? "dark" : "light");
    refreshTokens();
    document.dispatchEvent(new CustomEvent("af:theme"));
  }
  function setTheme(dark, from) {
    if (!document.startViewTransition || calm()) return applyTheme(dark);
    // the new theme grows out of the switch that was pressed, as a circle
    var r = from ? from.getBoundingClientRect() : { left: innerWidth / 2, top: 0, width: 0, height: 0 };
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    var vt = document.startViewTransition(function () { applyTheme(dark); });
    vt.ready.then(function () {
      html.animate({ clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + R + "px at " + x + "px " + y + "px)"] }, { duration: 750, easing: "cubic-bezier(0.75, 0, 0.25, 1)", pseudoElement: "::view-transition-new(root)" });
    }).catch(function () {});
  }
  swTheme.forEach(function (b) { b.addEventListener("click", function () { setTheme(html.dataset.theme !== "dark", b); }); });
  press(swTheme, html.dataset.theme === "dark");

  var specRaf = 0;
  function setGrid(on) {
    html.classList.toggle("inspect", on);
    press(swGrid, on);
    drawSpecs();
  }
  swGrid.forEach(function (b) { b.addEventListener("click", function () { setGrid(!html.classList.contains("inspect")); }); });
  var cols = $(".grid-overlay .cols");
  for (var c = 1; c <= 12; c++) { var gi = document.createElement("i"); gi.dataset.n = c; cols.appendChild(gi); }

  function drawSpecs() {
    cancelAnimationFrame(specRaf);
    var layer = $("#specs");
    if (!html.classList.contains("inspect")) { layer.innerHTML = ""; return; }
    specRaf = requestAnimationFrame(function () {
      var out = "";
      var n = 0;
      $$("[data-spec]").forEach(function (el) {
        if (n > 16) return;
        var r = el.getBoundingClientRect();
        if (r.bottom < 70 || r.top > innerHeight - 20 || r.width < 2) return;
        var cs = getComputedStyle(el);
        var fam = cs.fontFamily.split(",")[0].replace(/"/g, "");
        var role = el.dataset.spec || el.tagName.toLowerCase();
        var wd = (cs.fontVariationSettings.match(/"wdth" ([\d.]+)/) || [])[1];
        var tag = el.classList.contains("tile")
          ? role + " · " + Math.round(r.width) + "×" + Math.round(r.height) + " · r " + cs.borderTopLeftRadius
          : role + " · " + fam + " " + cs.fontWeight + (wd ? " w" + Math.round(wd) : "") + " · " + Math.round(parseFloat(cs.fontSize)) + "/" + (parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) || 1.2).toFixed(2);
        out += '<div class="spec-box" style="left:' + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + 'px"><span class="spec-tag">' + tag + "</span></div>";
        n++;
      });
      layer.innerHTML = out;
    });
  }
  addEventListener("scroll", function () { if (html.classList.contains("inspect")) drawSpecs(); }, { passive: true });
  addEventListener("resize", drawSpecs);

  function setCalm(on) {
    html.classList.toggle("calm", on);
    press(swCalm, on);
    save("calm", on);
    if (on) { stopLenis(); gsap.set(words, { opacity: 1 }); flatten(); } else startLenis();
  }
  swCalm.forEach(function (b) { b.addEventListener("click", function () { setCalm(!calm()); }); });
  press(swCalm, calm());

  /* ------------------------------------------------------------ craft tiles */

  function rgb(str) { var m = str.match(/[\d.]+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; }
  function lum(c) { return c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (a, v, i) { return a + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function hex(c) { return "#" + c.map(function (v) { return Math.round(v).toString(16).padStart(2, "0"); }).join(""); }
  var probe = document.createElement("i"); probe.style.display = "none"; document.body.appendChild(probe);
  function token(name) { probe.style.color = "var(" + name + ")"; return rgb(getComputedStyle(probe).color); }

  function refreshTokens() {
    var tk = [["--paper", "paper"], ["--ink", "ink"], ["--accent", "accent"], ["--mute", "mute"]];
    $("#tokens").innerHTML = tk.map(function (t) { var c = token(t[0]); return '<li><i style="background:' + hex(c) + '"></i>' + t[1] + "<br>" + hex(c) + "</li>"; }).join("");
    var pairs = [["--ink", "--paper", "Body text"], ["--mute", "--paper", "Labels"], ["--accent-text", "--paper", "Accent words"], ["--on-accent", "--accent", "Contact"]];
    $("#pairs").innerHTML = pairs.map(function (p) {
      var f = token(p[0]), b = token(p[1]), r = ratio(f, b);
      var lv = r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA large" : "fail";
      return '<li><span class="sw2" style="color:' + hex(f) + ";background:" + hex(b) + '">Aa</span><span>' + p[2] + '</span><span><span class="r">' + r.toFixed(1) + ':1</span> <span class="lv' + (r < 4.5 ? " lg" : "") + '">' + lv + "</span></span></li>";
    }).join("");
  }
  refreshTokens();

  var aa = $("#aa"), wd = $("#wdth"), wg = $("#wght");
  function setAxes() {
    aa.style.fontVariationSettings = '"wdth" ' + wd.value;
    aa.style.fontWeight = wg.value;
    $("#wdth-v").textContent = wd.value; $("#wght-v").textContent = wg.value;
  }
  wd.addEventListener("input", setAxes); wg.addEventListener("input", setAxes); setAxes();

  // the Out curve, drawn, with a dot riding it
  (function () {
    var ease = gsap.parseEase("Out"), d = "M10 110";
    for (var i = 1; i <= 40; i++) { var t = i / 40; d += " L" + (10 + 180 * t).toFixed(1) + " " + (110 - 100 * ease(t)).toFixed(1); }
    $("#curve").setAttribute("d", d);
    var dot = $("#curve-dot"), p = { t: 0 };
    var tw = gsap.to(p, { t: 1, duration: 1.4, repeat: -1, repeatDelay: 0.6, ease: "none", paused: true, onUpdate: function () { dot.setAttribute("cx", 10 + 180 * p.t); dot.setAttribute("cy", 110 - 100 * ease(p.t)); } });
    ScrollTrigger.create({ trigger: ".t-motion", start: "top bottom", end: "bottom top", onToggle: function (s) { s.isActive && !calm() ? tw.play() : tw.pause(); } });
    dot.setAttribute("cx", 10); dot.setAttribute("cy", 110);
  })();

  // a live frame meter: what this page costs on the device reading it
  (function () {
    var cv = $("#fps"), g = cv.getContext("2d"), hist = [], on = false, frames = 0, t0 = performance.now(), longs = 0;
    try { new PerformanceObserver(function (l) { longs += l.getEntries().length; $("#pf-long").textContent = longs; }).observe({ type: "longtask", buffered: true }); } catch (e) { $("#pf-long").textContent = "n/a"; }
    function kb() {
      var sum = 0;
      performance.getEntriesByType("resource").concat(performance.getEntriesByType("navigation")).forEach(function (e) { sum += e.transferSize || 0; });
      $("#pf-kb").textContent = sum ? Math.round(sum / 1024) + " KB" : "cached";
    }
    ScrollTrigger.create({ trigger: ".t-perf", start: "top bottom", end: "bottom top", onToggle: function (s) { on = s.isActive; if (on) kb(); } });
    gsap.ticker.add(function () {
      if (!on) return;
      frames++;
      var now = performance.now();
      if (now - t0 < 500) return;
      var fps = frames * 1000 / (now - t0); frames = 0; t0 = now;
      hist.push(fps); if (hist.length > 40) hist.shift();
      $("#pf-fps").textContent = Math.round(fps) + " fps";
      var W = cv.width, H = cv.height, ink = hex(token("--ink")), acc = hex(token("--accent"));
      g.clearRect(0, 0, W, H);
      g.strokeStyle = ink; g.globalAlpha = 0.15; g.beginPath(); g.moveTo(0, H - 60 / 70 * H); g.lineTo(W, H - 60 / 70 * H); g.stroke(); g.globalAlpha = 1;
      g.strokeStyle = acc; g.lineWidth = 2.5; g.beginPath();
      hist.forEach(function (v, i) { var x = W - (hist.length - 1 - i) * (W / 39), y = H - Math.min(v, 70) / 70 * (H - 6) - 3; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    });
  })();

  /* ------------------------------------------------------------ the search palette */

  var pal = $("#palette"), palQ = $("#pal-q"), palList = $("#pal-list"), palT = $("#pal-t");
  var pageDocs = [
    { kind: "Section", title: "What I do", target: "#statement", body: "statement about work beside users" },
    { kind: "Section", title: "Selected work", target: "#work", body: "projects seven builds" },
    { kind: "Section", title: "Where this work fits", target: "#fit", body: "support desks on-call onboarding field service" },
    { kind: "Section", title: "Interface craft", target: "#craft", body: "theme grid type contrast motion speed design" },
    { kind: "Section", title: "How I got here", target: "#path", body: "career history titles years" },
    { kind: "Section", title: "Contact", target: "#contact", body: "email get in touch github" }
  ];
  $$(".ch").forEach(function (ch) {
    pageDocs.push({ kind: "Project", title: $(".ch-n a", ch).textContent + ": " + $("h3", ch).textContent, target: "#" + ch.id, body: $(".ch-p", ch).textContent + " " + $(".fits", ch).textContent });
  });
  var actions = [
    { kind: "Action", title: "Switch light or dark theme", run: function () { setTheme(html.dataset.theme !== "dark", $("#sw-theme")); }, body: "theme dark light mode colour" },
    { kind: "Action", title: "Turn design view on or off", run: function () { setGrid(!html.classList.contains("inspect")); }, body: "grid layout inspect spec columns design" },
    { kind: "Action", title: "Calm motion on or off", run: function () { setCalm(!calm()); }, body: "reduce motion calm accessibility smooth scroll" },
    { kind: "Action", title: "Copy my email address", run: function () { $("#copy").click(); }, body: "email contact copy mail" }
  ];
  var pageIdx = new AFSearch.Index(pageDocs.concat(actions));
  var items = [], sel = 0, opener = null;

  function renderPal() {
    var v = palQ.value.trim(), res;
    if (!v) { items = pageDocs.slice(0, 6).concat(actions); palT.textContent = ""; }
    else {
      var a = pageIdx.search(v, 5), b = AFSearch.notes.search(v, 7);
      items = a.hits.concat(b.hits);
      palT.textContent = items.length + (items.length === 1 ? " result · " : " results · ") + (a.ms + b.ms).toFixed(2) + " ms";
      res = b.raw;
    }
    sel = 0;
    palList.innerHTML = items.length ? items.map(function (it, i) {
      return '<li role="option" id="po' + i + '" aria-selected="' + (i === sel) + '" data-i="' + i + '"><span class="k">' + (it.kind === "Note" ? "Note" : it.kind) + '</span><span class="t">' + (res ? AFSearch.mark(it.title, res) : AFSearch.esc(it.title)) + '</span><span class="go">' + (it.url ? "open" : it.run ? "run" : "jump") + "</span></li>";
    }).join("") : '<li class="empty">Nothing yet. Try "postgres", "shader" or "relay".</li>';
    palQ.setAttribute("aria-activedescendant", items.length ? "po0" : "");
  }
  function move(d) {
    if (!items.length) return;
    sel = (sel + d + items.length) % items.length;
    $$("li[role=option]", palList).forEach(function (li, i) { li.setAttribute("aria-selected", i === sel); });
    var li = $("#po" + sel); li.scrollIntoView({ block: "nearest" });
    palQ.setAttribute("aria-activedescendant", "po" + sel);
  }
  function choose(i) {
    var it = items[i]; if (!it) return;
    closePal();
    if (it.url) location.href = it.url;
    else if (it.run) it.run();
    else scrollToEl(it.target);
  }
  function openPal() {
    if (!pal.hidden) return;
    opener = document.activeElement;
    pal.hidden = false; html.classList.add("palette-open");
    if (lenis) lenis.stop();
    palQ.value = ""; renderPal(); palQ.focus();
    if (!calm()) gsap.from(".pal-box", { y: -14, scale: 0.98, opacity: 0, duration: 0.45, ease: "Out" });
  }
  function closePal() {
    if (pal.hidden) return;
    pal.hidden = true; html.classList.remove("palette-open");
    if (lenis) lenis.start();
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }
  window.AFPalette = { open: openPal };
  $("#find").addEventListener("click", openPal);
  palQ.addEventListener("input", renderPal);
  palList.addEventListener("click", function (e) { var li = e.target.closest("li[data-i]"); if (li) choose(+li.dataset.i); });
  pal.addEventListener("mousedown", function (e) { if (e.target === pal) closePal(); });
  pal.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); choose(sel); }
    else if (e.key === "Escape") { e.preventDefault(); closePal(); }
    else if (e.key === "Tab") { e.preventDefault(); palQ.focus(); }
  });
  document.addEventListener("keydown", function (e) {
    var typing = /input|textarea|select/i.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); openPal(); }
  });

  // in-page links glide instead of jumping
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute("href").length < 2) return;
    var t = $(a.getAttribute("href"));
    if (!t) return;
    e.preventDefault(); scrollToEl(t);
  });

  /* ------------------------------------------------------------ go */

  if (store.calm) press(swCalm, true);
  intro();
  window.__product = { lenis: function () { return lenis; }, refresh: function () { ScrollTrigger.refresh(); }, setTheme: applyTheme, setGrid: setGrid, setCalm: setCalm, openPalette: openPal };
})();
