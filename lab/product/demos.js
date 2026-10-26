/*
 * The seven demos. Each is a small working version of the real project, built as product UI:
 * it runs on its own when it first comes into view, so a visitor sees what it does without a
 * click, then hands over to whoever wants to play. Every number a demo shows is computed here,
 * in this tab; the measured numbers from the real projects are in the copy beside it.
 *
 * DEMOS.<name>.init(root, ctx) builds into root and returns { visible(on) }.
 */
(function () {
  "use strict";

  var calmNow = function () { return document.documentElement.classList.contains("calm"); };
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  var SVG = "http://www.w3.org/2000/svg";
  function s(tag, attrs, parent) { var e = document.createElementNS(SVG, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, calmNow() ? Math.min(ms, 60) : ms); }); }
  function fitCanvas(cv) {
    // layout size, not the on-screen rect: a card that is scaled while it stacks must not resize its canvas
    var dpr = Math.min(devicePixelRatio || 1, 2), r = { width: cv.clientWidth, height: cv.clientHeight };
    var w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
    return { w: r.width, h: r.height, dpr: dpr };
  }
  // run once when the demo is mostly on screen, the first time
  function onFirstLook(root, fn) {
    var done = false;
    var io = new IntersectionObserver(function (es) {
      if (done || !es[0].isIntersecting) return;
      done = true; io.disconnect(); fn();
    }, { threshold: 0.55 });
    io.observe(root);
    return function () { done = true; io.disconnect(); };
  }

  var DEMOS = {};

  /* ================================================================ Relay: the support chat */

  DEMOS.relay = {
    init: function (root) {
      root.innerHTML =
        '<div class="app-bar"><div class="app-title"><i>R</i>Support assistant</div>' +
        '<div class="provs"><span class="pillz" data-p="us"><i></i>us-east</span> <span class="pillz" data-p="eu"><i></i>eu-west</span></div></div>' +
        '<div class="app-body"><div class="chat" aria-live="polite"><p class="msg sys">Messages go through Relay before any model sees them.</p></div>' +
        '<div class="compose"><textarea aria-label="Message to the assistant" spellcheck="false">Hi, I\'m Dana Lee (dana.lee@acme.co). My card 4242 4242 4242 4242 was charged twice for order 1182.</textarea>' +
        '<p class="leaves"><b>Leaves your servers as:</b> <span class="red"></span></p>' +
        '<div class="row"><button class="tog" type="button" aria-pressed="false" data-cursor="Break it"><i aria-hidden="true"></i>Take us-east down</button><button class="btn primary send" type="button">Send</button></div></div></div>' +
        '<div class="app-foot"><span>Simulated providers. The real gateway is at <a href="/relay/">/relay/</a></span><span class="meta"></span></div>';
      var ta = root.querySelector("textarea"), red = root.querySelector(".red"), chat = root.querySelector(".chat");
      var tog = root.querySelector(".tog"), send = root.querySelector(".send"), meta = root.querySelector(".meta");
      var pUS = root.querySelector('[data-p="us"]');
      var busy = false, touched = false;

      function luhn(d) { var s = 0, alt = false; for (var i = d.length - 1; i >= 0; i--) { var n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; }
      // the same four kinds the real redaction stage swaps out, with the card checked, not trusted
      function redact(text) {
        var map = [], n = { EMAIL: 0, CARD: 0, PHONE: 0, NAME: 0 };
        function ph(type, value, shown) { n[type]++; var key = "[" + type + "_" + n[type] + "]"; map.push({ key: key, type: type, value: value, shown: shown || value }); return key; }
        var out = text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, function (m) { return ph("EMAIL", m); });
        out = out.replace(/\b\d(?:[ -]?\d){12,18}\b/g, function (m) { var d = m.replace(/\D/g, ""); return luhn(d) ? ph("CARD", m, "•••• " + d.slice(-4)) : m; });
        out = out.replace(/\+?\d[\d ()-]{7,}\d/g, function (m) { var d = m.replace(/\D/g, ""); return d.length >= 8 && d.length <= 15 ? ph("PHONE", m) : m; });
        out = out.replace(/\b(I'm|I am|my name is|this is)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/gi, function (m, lead, who) { return lead + " " + ph("NAME", who); });
        return { text: out, map: map };
      }
      function showRed() {
        var r = redact(ta.value);
        red.innerHTML = esc(r.text).replace(/\[(EMAIL|CARD|PHONE|NAME)_\d+\]/g, '<span class="ph">$&</span>');
      }
      ta.addEventListener("input", function () { touched = true; showRed(); });
      showRed();

      function setDown(on) {
        tog.setAttribute("aria-pressed", on ? "true" : "false");
        pUS.classList.toggle("down", on);
        pUS.lastChild.textContent = on ? "us-east · down" : "us-east";
      }
      tog.addEventListener("click", function () { setDown(tog.getAttribute("aria-pressed") !== "true"); });

      function line(box, cls, text, right) {
        var p = h("p", "", '<span class="' + cls + '">' + (cls === "ok" ? "✓" : cls === "no" ? "✕" : "·") + "</span><span>" + text + '</span><span class="mu">' + (right || "") + "</span>");
        box.appendChild(p); chat.scrollTop = chat.scrollHeight;
        requestAnimationFrame(function () { p.classList.add("in"); });
      }

      async function run() {
        if (busy || !ta.value.trim()) return;
        busy = true; send.disabled = true;
        var text = ta.value.trim(), r = redact(text), down = tog.getAttribute("aria-pressed") === "true";
        chat.appendChild(h("div", "msg me", esc(text)));
        var box = h("div", "trace"); chat.appendChild(box); chat.scrollTop = chat.scrollHeight;
        var t = 0;
        await wait(250);
        line(box, "ok", "redact · " + (r.map.length ? r.map.length + " field" + (r.map.length > 1 ? "s" : "") + " swapped for placeholders" : "nothing personal found"), "0.2 ms");
        await wait(350);
        var inj = /ignore (all |any )?(previous|prior|above) (instructions|rules)|system prompt/i.test(text);
        if (inj) {
          line(box, "no", "injection screen · this reads like a prompt injection", "blocked");
          await wait(300);
          chat.appendChild(h("div", "msg bot", "I can't help with that one. A person from the team will take a look."));
          meta.textContent = "blocked before any model call";
          busy = false; send.disabled = false; chat.scrollTop = chat.scrollHeight; return;
        }
        line(box, "ok", "injection screen · clean", "0.1 ms");
        await wait(400);
        if (down) {
          line(box, "no", "us-east · no first token in 2.0 s, retrying", "2.0 s"); t += 2000;
          await wait(700);
          line(box, "no", "us-east · failed again, breaker opens for 30 s", "2.0 s"); t += 2000;
          await wait(600);
          line(box, "ok", "eu-west · first token", "0.4 s"); t += 400;
        } else {
          line(box, "ok", "us-east · first token", "0.3 s"); t += 300;
        }
        await wait(300);
        // the model only ever sees placeholders; Relay puts the real values back as the answer streams
        var who = r.map.find(function (m) { return m.type === "NAME"; }), card = r.map.find(function (m) { return m.type === "CARD"; }), mail = r.map.find(function (m) { return m.type === "EMAIL"; });
        var ans = "Thanks" + (who ? " " + who.key : "") + ". " + (card ? "I can see two charges on the card " + card.key + ". I've flagged the duplicate for a refund" : "I've passed this to the billing team") + (mail ? ", and we'll confirm at " + mail.key + "." : ".");
        var bot = h("div", "msg bot"); chat.appendChild(bot);
        var parts = ans.split(/(\[[A-Z]+_\d+\])|(\s+)/).filter(Boolean);
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i], m = r.map.find(function (x) { return x.key === p; });
          if (m) {
            var sp = h("span", "ph", esc(p)); bot.appendChild(sp);
            (function (sp, m) {
              setTimeout(function () {
                if (calmNow()) { sp.textContent = m.shown; sp.className = ""; return; }
                gsap.to(sp, { duration: 0.5, scrambleText: { text: m.shown, chars: "x#*·", speed: 0.6 }, onComplete: function () { sp.className = ""; } });
              }, 260);
            })(sp, m);
          } else bot.appendChild(document.createTextNode(p));
          chat.scrollTop = chat.scrollHeight;
          await wait(/\s/.test(p) ? 0 : 38);
        }
        await wait(500);
        line(box, "ok", "restore · placeholders put back in the answer", r.map.length + " restored");
        meta.textContent = "answered via " + (down ? "eu-west after 2 retries" : "us-east") + " · " + (t / 1000).toFixed(1) + " s to first token";
        busy = false; send.disabled = false;
      }
      send.addEventListener("click", run);
      ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } });

      // first look: the outage happens on its own, and the answer still lands
      onFirstLook(root, async function () {
        if (touched) return;
        await wait(500); setDown(true);
        await wait(500); run();
      });
      return { visible: function () {} };
    }
  };

  /* ================================================================ Tracewise: the service map */

  DEMOS.trace = {
    init: function (root) {
      root.innerHTML =
        '<div class="app-bar"><div class="app-title"><i>T</i>checkout · service map</div><button class="btn reset" type="button">Reset</button></div>' +
        '<div class="app-body"><div class="svc"><div class="alarm" role="status"></div></div>' +
        '<svg class="spark" viewBox="0 0 300 36" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke-width="2" /></svg>' +
        '<div class="verdict"><div class="nope"><small>Dashboard guess</small><b>Waiting for an alert</b></div><div class="yes"><small>Tracewise</small><b>Click a service to slow it down</b></div></div></div>' +
        '<div class="app-foot"><span>Click any service to add 600 ms to it.</span><span class="meta">p99, simulated</span></div>';
      var box = root.querySelector(".svc"), alarm = root.querySelector(".alarm"), pl = root.querySelector(".spark polyline");
      var vNo = root.querySelector(".nope b"), vYes = root.querySelector(".yes b");
      // a small checkout system as a call tree, with each service's own time in ms
      var S = {
        gateway: { x: 70, y: 175, own: 12, kids: ["auth", "orders", "catalog"] },
        auth: { x: 215, y: 60, own: 18, kids: [] },
        orders: { x: 215, y: 175, own: 25, kids: ["payments", "inventory", "db"] },
        catalog: { x: 215, y: 290, own: 30, kids: [] },
        payments: { x: 360, y: 95, own: 20, kids: ["card-api"] },
        inventory: { x: 360, y: 190, own: 15, kids: ["cache"] },
        db: { x: 360, y: 285, own: 22, kids: [] },
        "card-api": { x: 500, y: 95, own: 90, kids: [] },
        cache: { x: 500, y: 190, own: 3, kids: [] }
      };
      var parent = {};
      Object.keys(S).forEach(function (k) { S[k].kids.forEach(function (c) { parent[c] = k; }); });
      var svg = s("svg", { viewBox: "0 0 570 350", role: "img", "aria-label": "Service map of a checkout system" }, box);
      var edges = {}, nodes = {};
      Object.keys(S).forEach(function (k) {
        S[k].kids.forEach(function (c) {
          var a = S[k], b = S[c];
          edges[c] = s("path", { class: "edge", d: "M" + (a.x + 52) + " " + a.y + " C" + (a.x + 95) + " " + a.y + " " + (b.x - 95) + " " + b.y + " " + (b.x - 52) + " " + b.y }, svg);
        });
      });
      Object.keys(S).forEach(function (k) {
        var n = S[k], g = s("g", { class: "node", tabindex: k === "gateway" ? -1 : 0, role: "button", "aria-label": "Slow down " + k, "data-cursor": k === "gateway" ? "" : "Break it" }, svg);
        s("rect", { x: n.x - 52, y: n.y - 21, width: 104, height: 42, rx: 11 }, g);
        var t = s("text", { x: n.x - 40, y: n.y - 3 }, g); t.textContent = k;
        var ms = s("text", { class: "ms", x: n.x - 40, y: n.y + 13 }, g);
        nodes[k] = { g: g, ms: ms };
        if (k !== "gateway") {
          g.addEventListener("click", function () { breakIt(k); });
          g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); breakIt(k); } });
        }
      });
      var extra = {}, SLO = 400, hist = [];
      function incl(k) { var n = S[k]; return n.own + (extra[k] || 0) + n.kids.reduce(function (a, c) { return a + incl(c); }, 0); }
      var base = {};
      Object.keys(S).forEach(function (k) { base[k] = incl(k); });
      function paint() {
        Object.keys(S).forEach(function (k) {
          var v = incl(k);
          nodes[k].ms.textContent = "p99 " + v + " ms";
          nodes[k].g.classList.toggle("slow", v - base[k] > 100);
        });
      }
      function clearMarks() {
        Object.keys(nodes).forEach(function (k) { nodes[k].g.classList.remove("culprit", "guess"); });
        Object.keys(edges).forEach(function (k) { edges[k].classList.remove("hot"); });
      }
      var timer = null;
      async function breakIt(k) {
        extra = {}; extra[k] = 600; clearMarks(); paint();
        alarm.classList.remove("on");
        vNo.textContent = "…"; vYes.textContent = "Reading traces…";
        var total = incl("gateway");
        await wait(600);
        alarm.innerHTML = "<b>Alert</b> checkout p99 is " + total + " ms, over its " + SLO + " ms target";
        alarm.classList.add("on");
        await wait(700);
        // the dashboard's guess: the slowest service right under the alert
        var guess = S.gateway.kids.slice().sort(function (a, b) { return incl(b) - incl(a); })[0];
        // Tracewise: follow the slow spans down to the service whose own time grew
        var best = Object.keys(S).sort(function (a, b) { return (extra[b] || 0) - (extra[a] || 0); })[0];
        nodes[guess].g.classList.add("guess");
        vNo.innerHTML = (guess === best ? "✓ " : "✕ ") + guess + '<span style="font-weight:400;font-size:12px;color:var(--mute)"> slowest at the alert</span>';
        var c = best; while (c && c !== "gateway") { (function (c, d) { setTimeout(function () { edges[c].classList.add("hot"); }, calmNow() ? 0 : d); })(c, 0); c = parent[c]; }
        await wait(500);
        nodes[best].g.classList.add("culprit");
        vYes.innerHTML = "✓ " + best + '<span style="font-weight:400;font-size:12px;color:var(--mute)"> +600 ms of its own time</span>';
      }
      root.querySelector(".reset").addEventListener("click", function () { extra = {}; clearMarks(); paint(); alarm.classList.remove("on"); vNo.textContent = "Waiting for an alert"; vYes.textContent = "Click a service to slow it down"; });
      paint();
      // the p99 line under the map ticks along while the demo is on screen
      function tick() {
        hist.push(incl("gateway") * (0.92 + Math.random() * 0.16)); if (hist.length > 40) hist.shift();
        var mx = Math.max(900, Math.max.apply(null, hist));
        pl.setAttribute("points", hist.map(function (v, i) { return (i * 300 / 39).toFixed(1) + "," + (34 - v / mx * 32).toFixed(1); }).join(" "));
        pl.setAttribute("stroke", incl("gateway") > SLO ? css("--bad") : css("--accent"));
      }
      onFirstLook(root, function () { wait(400).then(function () { breakIt("card-api"); }); });
      return { visible: function (on) { clearInterval(timer); if (on) { tick(); timer = setInterval(tick, 300); } } };
    }
  };

  /* ================================================================ Onboard: who is who */

  DEMOS.onboard = {
    init: function (root) {
      var R = [
        { id: "c1", src: "crm", who: "A", name: "Jonathan Smith", email: "jon.smith@acme.com", phone: "+852 9123 4567" },
        { id: "c2", src: "crm", who: "B", name: "Mei Ling Chan", email: "meiling.chan@chanco.hk", phone: "6789 0123" },
        { id: "c3", src: "crm", who: "C", name: "Priya Raman", email: "priya@globex.io", phone: "5511 2233" },
        { id: "b1", src: "bil", who: "A", name: "SMITH, JONATHAN", email: "JON.SMITH@ACME.COM", phone: "91234567" },
        { id: "b2", src: "bil", who: "B", name: "Chan Mei-ling", email: "billing@chanco.hk", phone: "67890123" },
        { id: "b3", src: "bil", who: "D", name: "Jon Smyth", email: "jon.smyth@acme.com", phone: "9876 5432" },
        { id: "h1", src: "hd", who: "A", name: "Jon Smith", email: "jonsmith@gmail.com", phone: "(852) 9123-4567" },
        { id: "h2", src: "hd", who: "C", name: "Priya R.", email: "priya@globex.io", phone: "" },
        { id: "h3", src: "hd", who: "B", name: "M. L. Chan", email: "meiling.chan@chanco.hk", phone: "6789-0123" }
      ];
      var SRC = { crm: "CRM", bil: "Billing", hd: "Help desk" };
      root.innerHTML =
        '<div class="app-bar"><div class="app-title"><i>O</i>New customer · 3 exports</div><button class="btn primary go" type="button" data-cursor="Match">Match</button></div>' +
        '<div class="app-body"><div class="ob"><div class="ob-src"></div><div class="ob-out" aria-live="polite"></div></div>' +
        '<div class="ob-ctl"><label>Match threshold <input type="range" min="0.05" max="0.99" step="0.01" value="0.6" aria-label="Match threshold" /><output>0.60</output></label><span class="pillz f1"><i></i>F1 —</span></div></div>' +
        '<div class="app-foot"><span>Sample data. Scores use Fellegi-Sunter weights, like the real pipeline.</span><span class="meta"></span></div>';
      var srcBox = root.querySelector(".ob-src"), out = root.querySelector(".ob-out"), go = root.querySelector(".go"), rng = root.querySelector("input"), outv = root.querySelector("output");
      var f1 = root.querySelector(".f1"), meta = root.querySelector(".meta");
      var cols = {};
      Object.keys(SRC).forEach(function (k) { var c = h("div", "ob-col", "<h4><span>" + SRC[k] + "</span><span>" + R.filter(function (r) { return r.src === k; }).length + " rows</span></h4>"); cols[k] = c; srcBox.appendChild(c); });
      var els = {};
      R.forEach(function (r) {
        var e = h("div", "rec", "<b>" + esc(r.name) + "</b><span>" + esc(r.email) + "</span><span>" + esc(r.phone || "no phone") + "</span>");
        e.dataset.src = r.src; e.dataset.id = r.id; els[r.id] = e; cols[r.src].appendChild(e);
      });

      // ---- the scoring: normalised names, emails and phones, weighted as log-likelihood ratios
      function jw(a, b) {
        if (a === b) return 1;
        var md = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1), am = [], bm = [], m = 0;
        for (var i = 0; i < a.length; i++) for (var j = Math.max(0, i - md); j < Math.min(b.length, i + md + 1); j++) if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; m++; break; }
        if (!m) return 0;
        var t = 0, k = 0;
        for (i = 0; i < a.length; i++) if (am[i]) { while (!bm[k]) k++; if (a[i] !== b[k]) t++; k++; }
        var jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3, p = 0;
        while (p < 4 && a[p] && a[p] === b[p]) p++;
        return jaro + p * 0.1 * (1 - jaro);
      }
      function toks(n) { return n.toLowerCase().replace(/[.,-]/g, " ").split(/\s+/).filter(Boolean); }
      function nameSim(x, y) {
        var A = toks(x), B = toks(y);
        if (A.length > B.length) { var t = A; A = B; B = t; }
        var sum = 0;
        A.forEach(function (a) {
          var best = 0;
          B.forEach(function (b) { var v = a.length === 1 || b.length === 1 ? (a[0] === b[0] ? 0.9 : 0) : jw(a, b); if (v > best) best = v; });
          sum += best;
        });
        return sum / A.length;
      }
      var FREE = /@(gmail|yahoo|hotmail|outlook)\./;
      function weight(a, b) {
        var w = 0, ns = nameSim(a.name, b.name);
        w += ns >= 0.95 ? 4 : ns >= 0.88 ? 2.5 : ns >= 0.8 ? 1 : -3;
        var ea = a.email.toLowerCase(), eb = b.email.toLowerCase();
        if (ea === eb) w += 7;
        else if (ea.split("@")[1] === eb.split("@")[1] && !FREE.test(ea)) w += 1;
        else w -= 1.5;
        var pa = a.phone.replace(/\D/g, "").slice(-8), pb = b.phone.replace(/\D/g, "").slice(-8);
        if (pa && pb) w += pa === pb ? 6 : -1.25;
        return w;
      }
      var pairs = [];
      for (var i = 0; i < R.length; i++) for (var j = i + 1; j < R.length; j++) if (R[i].src !== R[j].src || true) {
        var w = weight(R[i], R[j]);
        pairs.push({ a: R[i], b: R[j], p: 1 / (1 + Math.pow(2, -(w - 2))) });
      }

      function cluster(thr) {
        var par = {};
        R.forEach(function (r) { par[r.id] = r.id; });
        function f(x) { while (par[x] !== x) x = par[x] = par[par[x]]; return x; }
        pairs.forEach(function (q) { if (q.p >= thr) par[f(q.a.id)] = f(q.b.id); });
        var groups = {};
        R.forEach(function (r) { (groups[f(r.id)] = groups[f(r.id)] || []).push(r); });
        var list = Object.keys(groups).map(function (k) { return groups[k]; });
        list.sort(function (x, y) { return R.indexOf(x[0]) - R.indexOf(y[0]); });
        var review = pairs.filter(function (q) { return q.p < thr && q.p >= thr - 0.12 && f(q.a.id) !== f(q.b.id); }).sort(function (x, y) { return y.p - x.p; }).slice(0, 2);
        // pairwise F1 against the truth this sample was written with
        var tp = 0, fp = 0, fn = 0;
        pairs.forEach(function (q) { var same = f(q.a.id) === f(q.b.id), truth = q.a.who === q.b.who; if (same && truth) tp++; else if (same) fp++; else if (truth) fn++; });
        var F = tp ? 2 * tp / (2 * tp + fp + fn) : 0;
        return { list: list, review: review, f1: F, f: f };
      }

      var matched = false;
      function render(animate) {
        var thr = +rng.value, t0 = performance.now(), c = cluster(thr), ms = performance.now() - t0;
        outv.textContent = thr.toFixed(2);
        f1.lastChild.textContent = "F1 " + c.f1.toFixed(2);
        f1.className = "pillz f1" + (c.f1 < 0.99 ? " warn" : "");
        meta.textContent = R.length + " rows → " + c.list.length + " customers · " + ms.toFixed(2) + " ms";
        if (!matched) return;
        var state = Flip.getState(root.querySelectorAll(".rec"));
        out.innerHTML = "<h4><span>Customers</span><span>score</span></h4>";
        c.list.forEach(function (g) {
          var whos = g.map(function (r) { return r.who; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
          var bad = whos.length > 1;
          var split = !bad && c.list.some(function (o) { return o !== g && o[0].who === g[0].who; });
          var best = 1;
          if (g.length > 1) g.forEach(function (a) { g.forEach(function (b) { if (a !== b) { var q = pairs.find(function (q) { return (q.a === a && q.b === b) || (q.a === b && q.b === a); }); if (q && q.p >= thr) best = Math.min(best, q.p); } }); });
          var card = h("div", "gold" + (bad ? " bad" : split ? " split" : ""), '<div class="recs"></div><span class="sc">' + (g.length > 1 ? best.toFixed(2) : "1 row") + "</span>" + (bad ? '<p class="note">Wrong merge: two different people.</p>' : split ? '<p class="note">Same person, still split in two.</p>' : ""));
          g.forEach(function (r) { card.firstChild.appendChild(els[r.id]); });
          out.appendChild(card);
        });
        c.review.forEach(function (q) {
          out.appendChild(h("div", "gold review", '<div class="recs"><span class="note" style="grid-column:auto">Review: is <b>' + esc(q.a.name) + "</b> the same as <b>" + esc(q.b.name) + '</b>?</span></div><span class="sc">' + q.p.toFixed(2) + "</span>"));
        });
        if (animate && !calmNow()) Flip.from(state, { duration: 0.9, ease: "InOut", stagger: 0.025, absolute: true, nested: true, prune: true });
      }
      function match() {
        if (matched) {
          // back to the three exports
          var st = Flip.getState(root.querySelectorAll(".rec"));
          matched = false; go.textContent = "Match";
          R.forEach(function (r) { cols[r.src].appendChild(els[r.id]); });
          out.innerHTML = ""; srcBox.style.display = "";
          if (!calmNow()) Flip.from(st, { duration: 0.8, ease: "InOut", stagger: 0.02, absolute: true });
          return;
        }
        matched = true; go.textContent = "Show exports";
        var state = Flip.getState(root.querySelectorAll(".rec"));
        srcBox.style.display = "none";
        out.style.display = "";
        render(false);
        if (!calmNow()) Flip.from(state, { duration: 1, ease: "InOut", stagger: 0.04, absolute: true });
      }
      go.addEventListener("click", match);
      rng.addEventListener("input", function () { if (!matched) match(); else render(true); });
      render(false);
      onFirstLook(root, function () { wait(700).then(function () { if (!matched) match(); }); });
      return { visible: function () {} };
    }
  };

  /* ================================================================ Dispatch: the day re-plans */

  DEMOS.dispatch = {
    init: function (root) {
      root.innerHTML =
        '<div class="app-bar"><div class="app-title"><i>D</i>Today · 3 technicians · 12 visits</div><button class="btn reset" type="button">Reset day</button></div>' +
        '<div class="app-body"><div class="map" data-cursor="Add urgent job"></div><div class="toast" role="status"></div><div class="techs"></div></div>' +
        '<div class="app-foot"><span>Click the map for an urgent job. Send someone home.</span><span class="meta"></span></div>';
      var mapBox = root.querySelector(".map"), techsBox = root.querySelector(".techs"), toast = root.querySelector(".toast"), meta = root.querySelector(".meta");
      var W = 600, H = 360, DEPOT = { x: 300, y: 180 };
      var TECH = [{ id: "ana", name: "Ana", c: "#7c3aed" }, { id: "ben", name: "Ben", c: "#0891b2" }, { id: "cleo", name: "Cleo", c: "#d97706" }];
      // twelve visits, each with a window it must start in (minutes after 8:00) and 30 minutes on site
      var JOBS0 = [
        [90, 70, 0, 150], [170, 120, 60, 240], [80, 250, 0, 180], [150, 310, 120, 300], [250, 60, 30, 210], [400, 50, 0, 180],
        [520, 90, 90, 300], [470, 170, 60, 270], [540, 280, 120, 360], [420, 320, 0, 240], [330, 290, 180, 420], [230, 210, 240, 480]
      ];
      var jobs, routes, home, svg, gRoutes, gJobs, nextId;
      function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
      function travel(a, b) { return dist(a, b) / 4 + 4; }
      function evalRoute(rt) {
        // arrival at each stop: wait if early, late if past the window
        var t = 0, at = DEPOT, late = 0, km = 0;
        rt.forEach(function (j) { t += travel(at, j); km += dist(at, j); if (t < j.a) t = j.a; j.arr = t; if (t > j.b) late++; t += 30; at = j; });
        km += dist(at, DEPOT);
        return { late: late, len: km, end: t };
      }
      function insertCost(rt, j, k) {
        var a = k ? rt[k - 1] : DEPOT, b = rt[k] || DEPOT;
        return dist(a, j) + dist(j, b) - dist(a, b);
      }
      function bestInsert(j, avail) {
        var best = null;
        avail.forEach(function (tid) {
          var rt = routes[tid];
          for (var k = 0; k <= rt.length; k++) {
            var trial = rt.slice(0, k).concat([j], rt.slice(k));
            var e = evalRoute(trial), base = evalRoute(rt);
            var cost = insertCost(rt, j, k) + (e.late - base.late) * 400 + Math.max(0, e.end - 600) * 2;
            if (!best || cost < best.cost) best = { tid: tid, k: k, cost: cost };
          }
        });
        routes[best.tid].splice(best.k, 0, j);
        j.tech = best.tid;
      }
      function plan() {
        routes = { ana: [], ben: [], cleo: [] };
        // regret-style order: the jobs with the tightest windows go in first
        jobs.slice().sort(function (x, y) { return (x.b - x.a) - (y.b - y.a) || x.a - y.a; }).forEach(function (j) { bestInsert(j, TECH.map(function (t) { return t.id; })); });
      }
      function reset() {
        nextId = 13; home = {};
        jobs = JOBS0.map(function (q, i) { return { id: i + 1, x: q[0], y: q[1], a: q[2], b: q[3], tech: null }; });
        plan();
        draw(false); techs(); meta.textContent = stats();
        toast.classList.remove("on");
      }
      function stats() {
        var late = 0, len = 0;
        TECH.forEach(function (t) { if (!home[t.id]) { var e = evalRoute(routes[t.id]); late += e.late; len += e.len; } });
        return jobs.length + " visits · " + late + " late · " + Math.round(len / 4 * 0.3) + " km driving";
      }
      function build() {
        mapBox.innerHTML = "";
        svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Map of today's visits and routes" }, mapBox);
        // a made-up city: blocks, and a river with bridges
        for (var bx = 20; bx < W; bx += 58) for (var by = 18; by < H; by += 52) s("rect", { class: "block", x: bx, y: by, width: 46, height: 38, rx: 5 }, svg);
        s("path", { class: "river", d: "M-20 200 C 120 150, 200 260, 330 225 S 520 120, 640 170" }, svg);
        [[118, 190], [262, 235], [430, 178], [560, 152]].forEach(function (b) { s("line", { class: "bridge", x1: b[0] - 9, y1: b[1] - 22, x2: b[0] + 9, y2: b[1] + 22 }, svg); });
        gRoutes = s("g", {}, svg); gJobs = s("g", {}, svg);
        var d = s("g", { class: "depot" }, svg);
        s("rect", { x: DEPOT.x - 16, y: DEPOT.y - 11, width: 32, height: 22, rx: 6 }, d);
        var t = s("text", { x: DEPOT.x, y: DEPOT.y }, d); t.textContent = "HQ";
      }
      function color(tid) { return TECH.find(function (t) { return t.id === tid; }).c; }
      function draw(animate, moved) {
        gRoutes.innerHTML = ""; gJobs.innerHTML = "";
        TECH.forEach(function (t) {
          if (home[t.id]) return;
          var pts = [DEPOT].concat(routes[t.id], [DEPOT]);
          var p = s("path", { class: "route", stroke: t.c, d: "M" + pts.map(function (q) { return q.x + " " + q.y; }).join(" L") }, gRoutes);
          if (animate && !calmNow()) {
            var L = p.getTotalLength();
            gsap.fromTo(p, { strokeDasharray: L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: 1.1, ease: "InOut" });
          }
        });
        jobs.forEach(function (j) {
          var g = s("g", { class: "job" + (moved && moved.indexOf(j) >= 0 ? " moved" : "") + (j.arr > j.b ? " late" : "") }, gJobs);
          var title = s("title", {}, g);
          title.textContent = "Visit " + j.id + ", window " + clock(j.a) + " to " + clock(j.b) + ", " + (TECH.find(function (t) { return t.id === j.tech; }) || {}).name;
          var c = s("circle", { cx: j.x, cy: j.y, r: 10.5, fill: color(j.tech) }, g);
          var tx = s("text", { x: j.x, y: j.y + 0.5 }, g); tx.textContent = j.id;
          if (animate && moved && moved.indexOf(j) >= 0 && !calmNow()) gsap.from(c, { attr: { r: 20 }, duration: 0.9, ease: "elastic.out(1, 0.4)" });
        });
      }
      function clock(m) { var t = 480 + m; return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
      function techs() {
        techsBox.innerHTML = "";
        TECH.forEach(function (t) {
          var el = h("div", "tech" + (home[t.id] ? " home" : ""), '<i style="background:' + t.c + '"></i>' + t.name + " <small>" + (home[t.id] ? "home" : routes[t.id].length + " visits") + '</small><button type="button" data-cursor="Send home">' + (home[t.id] ? "Off sick" : "Send home") + "</button>");
          el.querySelector("button").addEventListener("click", function () { sendHome(t.id); });
          techsBox.appendChild(el);
        });
      }
      function say(text) { toast.textContent = text; toast.classList.add("on"); clearTimeout(say.t); say.t = setTimeout(function () { toast.classList.remove("on"); }, 3200); }
      function replan(fn) {
        var before = {};
        jobs.forEach(function (j) { before[j.id] = j.tech; });
        var t0 = performance.now();
        fn();
        var ms = performance.now() - t0;
        var moved = jobs.filter(function (j) { return before[j.id] && before[j.id] !== j.tech; });
        TECH.forEach(function (t) { if (!home[t.id]) evalRoute(routes[t.id]); });
        var late = jobs.filter(function (j) { return j.arr > j.b; }).length;
        draw(true, moved); techs(); meta.textContent = stats();
        return { ms: ms, moved: moved.length, late: late };
      }
      function sendHome(tid) {
        if (home[tid] || Object.keys(home).length >= 2) return;
        var r = replan(function () {
          home[tid] = true;
          var orphans = routes[tid]; routes[tid] = [];
          var avail = TECH.map(function (t) { return t.id; }).filter(function (id) { return !home[id]; });
          // only the sick technician's visits move; everyone else's day stays as it was
          orphans.sort(function (x, y) { return (x.b - x.a) - (y.b - y.a); }).forEach(function (j) { bestInsert(j, avail); });
        });
        say("Re-planned in " + r.ms.toFixed(2) + " ms · " + r.moved + " visits moved · " + r.late + " late");
      }
      mapBox.addEventListener("click", function (e) {
        var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        var p = pt.matrixTransform(svg.getScreenCTM().inverse());
        var j = { id: nextId++, x: Math.round(p.x), y: Math.round(p.y), a: 60, b: 180, tech: null };
        var r = replan(function () {
          jobs.push(j);
          bestInsert(j, TECH.map(function (t) { return t.id; }).filter(function (id) { return !home[id]; }));
        });
        say("Urgent visit " + j.id + " → " + TECH.find(function (t) { return t.id === j.tech; }).name + " · " + r.ms.toFixed(2) + " ms · " + r.late + " late");
      });
      root.querySelector(".reset").addEventListener("click", reset);
      build(); reset();
      onFirstLook(root, function () { wait(900).then(function () { if (!Object.keys(home).length) sendHome("ben"); }); });
      return { visible: function () {} };
    }
  };

  /* ================================================================ Atlas: search my notes */

  DEMOS.atlas = {
    init: function (root) {
      root.innerHTML =
        '<div class="app-bar"><div class="app-title"><i>A</i>Ask my notes</div><span class="pillz"><i></i>offline · no server</span></div>' +
        '<div class="app-body"><div class="srch"><label class="srch-in"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="sr">Search my notes</span><input type="search" placeholder="Try “postgres replication”" autocomplete="off" spellcheck="false" /></label>' +
        '<div class="sugg"><button type="button">mvcc</button><button type="button">shader noise</button><button type="button">rate limiting</button><button type="button">kafka</button></div></div>' +
        '<ul class="hits" aria-live="polite"></ul></div>' +
        '<div class="app-foot"><span class="meta">BM25 over ' + AFSearch.count + ' note titles, in this tab</span><span>Press <kbd>/</kbd> to search the whole page</span></div>';
      var inp = root.querySelector("input"), list = root.querySelector(".hits"), meta = root.querySelector(".meta");
      var typed = false;
      function go() {
        var v = inp.value.trim();
        if (!v) { list.innerHTML = '<li class="empty">Type a question. It searches as you type.</li>'; meta.textContent = "BM25 over " + AFSearch.count + " note titles, in this tab"; return; }
        var r = AFSearch.notes.search(v, 6);
        meta.textContent = r.hits.length + " of " + AFSearch.count + " notes · " + r.ms.toFixed(2) + " ms";
        list.innerHTML = r.hits.length ? r.hits.map(function (x) {
          return '<li class="hit"><a href="' + x.url + '"><span class="t">' + AFSearch.mark(x.title, r.raw) + '</span><span class="u">' + esc(x.label) + '</span><span class="s"><i style="width:' + Math.round(x.rel * 100) + '%"></i></span></a></li>';
        }).join("") : '<li class="empty">No note on that yet.</li>';
      }
      inp.addEventListener("input", function () { typed = true; go(); });
      root.querySelectorAll(".sugg button").forEach(function (b) { b.addEventListener("click", function () { typed = true; inp.value = b.textContent; go(); inp.focus(); }); });
      go();
      onFirstLook(root, async function () {
        var q = "postgres replication";
        await wait(500);
        for (var i = 1; i <= q.length; i++) { if (typed) return; inp.value = q.slice(0, i); go(); await wait(55); }
      });
      return { visible: function () {} };
    }
  };

  /* ================================================================ Studio: the tuner */

  DEMOS.studio = {
    init: function (root) {
      var STR = [["G3", 196.0], ["D4", 293.66], ["A4", 440.0], ["E5", 659.26]];
      root.innerHTML =
        '<div class="app-bar"><div class="app-title"><i>S</i>Tuner · violin</div><span class="pillz src"><i></i>synth string</span></div>' +
        '<div class="app-body"><div class="tuner"><svg class="gauge" viewBox="0 0 300 170" aria-hidden="true"></svg><div class="note-big" aria-live="polite"><b>A4</b><span>in tune</span></div></div>' +
        '<div class="st-ctl"><div class="strings" role="group" aria-label="String">' + STR.map(function (x, i) { return '<button type="button" aria-pressed="' + (i === 2) + '">' + x[0][0] + "</button>"; }).join("") + "</div>" +
        '<label>Detune <input type="range" min="-50" max="50" step="0.5" value="0" aria-label="Detune in cents" /><output>0.0¢</output></label>' +
        '<div class="row"><button class="btn hear" type="button" data-cursor="Sound on">Hear it</button><button class="btn mic" type="button" data-cursor="Listen">Use my microphone</button></div></div></div>' +
        '<div class="app-foot"><span class="meta">McLeod pitch method, 2,048 samples, in this tab</span><span class="err"></span></div>';
      var g = root.querySelector(".gauge"), big = root.querySelector(".note-big b"), sub = root.querySelector(".note-big span");
      var rng = root.querySelector("input"), outv = root.querySelector("output"), meta = root.querySelector(".meta"), err = root.querySelector(".err"), src = root.querySelector(".src");
      var str = 2, SR = 44100, N = 2048, mic = null;
      // the dial: -50 to +50 cents over a half circle
      for (var c = -50; c <= 50; c += 5) {
        var a = (c / 50) * (Math.PI / 2 * 0.92), big5 = c % 25 === 0;
        var r1 = big5 ? 112 : 118, r2 = 128;
        s("line", { class: "tick" + (big5 ? " big" : ""), x1: 150 + r1 * Math.sin(a), y1: 150 - r1 * Math.cos(a), x2: 150 + r2 * Math.sin(a), y2: 150 - r2 * Math.cos(a) }, g);
        if (big5) { var t = s("text", { x: 150 + 98 * Math.sin(a), y: 154 - 98 * Math.cos(a) }, g); t.textContent = (c > 0 ? "+" : "") + c; }
      }
      var za = 5 / 50 * (Math.PI / 2 * 0.92);
      s("path", { class: "zone", d: "M" + (150 - 136 * Math.sin(za)) + " " + (150 - 136 * Math.cos(za)) + " A136 136 0 0 1 " + (150 + 136 * Math.sin(za)) + " " + (150 - 136 * Math.cos(za)) }, g);
      var needle = s("line", { class: "needle", x1: 150, y1: 150, x2: 150, y2: 30 }, g);
      s("circle", { class: "hub", cx: 150, cy: 150, r: 7 }, g);
      var ang = { v: 0 };
      function setNeedle(cents) {
        var deg = Math.max(-50, Math.min(50, cents)) / 50 * 90 * 0.92;
        gsap.to(ang, { v: deg, duration: calmNow() ? 0 : 0.5, ease: "power3.out", overwrite: true, onUpdate: function () { needle.setAttribute("transform", "rotate(" + ang.v + " 150 150)"); } });
      }
      // a bowed-string stand-in: falling harmonics plus a little noise
      function signal(f) {
        var x = new Float32Array(N), ph = [0, 0.7, 1.9, 0.4, 2.8, 1.1];
        for (var i = 0; i < N; i++) { var v = 0; for (var k = 1; k <= 6; k++) v += Math.sin(2 * Math.PI * f * k * i / SR + ph[k - 1]) / k; x[i] = v + (Math.random() - 0.5) * 0.04; }
        return x;
      }
      // McLeod's normalised square difference, first peak over 0.9 of the highest, parabolic refinement
      function mpm(x, sr) {
        // lags only down to 150 Hz, below a violin's open G, so the work is a third of the full window
        var n = x.length, W = Math.min(n >> 1, Math.ceil(sr / 150) + 2), nsdf = new Float32Array(W);
        for (var tau = 0; tau < W; tau++) {
          var acf = 0, m = 0;
          for (var i = 0; i < n - tau; i++) { acf += x[i] * x[i + tau]; m += x[i] * x[i] + x[i + tau] * x[i + tau]; }
          nsdf[tau] = m ? 2 * acf / m : 0;
        }
        var peaks = [], pos = false, cur = -1;
        for (var t2 = 1; t2 < W - 1; t2++) {
          if (nsdf[t2 - 1] < 0 && nsdf[t2] >= 0) { pos = true; cur = t2; }
          else if (pos && nsdf[t2] < 0 && nsdf[t2 - 1] >= 0) { pos = false; peaks.push(cur); }
          if (pos && nsdf[t2] > nsdf[cur]) cur = t2;
        }
        if (!peaks.length) return 0;
        var top = Math.max.apply(null, peaks.map(function (p) { return nsdf[p]; }));
        if (top < 0.5) return 0;
        var p = peaks.find(function (q) { return nsdf[q] >= 0.9 * top; });
        var a = nsdf[p - 1], b = nsdf[p], c2 = nsdf[p + 1], d = (a - c2) / (2 * (a - 2 * b + c2));
        return sr / (p + (isFinite(d) ? d : 0));
      }
      function noteOf(f) {
        var midi = 69 + 12 * Math.log2(f / 440), n = Math.round(midi);
        var names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
        return { name: names[(n % 12 + 12) % 12] + (Math.floor(n / 12) - 1), cents: (midi - n) * 100 };
      }
      function show(f, truth) {
        if (!f) { sub.textContent = "listening…"; sub.className = ""; return; }
        var nn = noteOf(f);
        big.textContent = nn.name;
        sub.textContent = Math.abs(nn.cents) < 5 ? "in tune · " + (nn.cents >= 0 ? "+" : "") + nn.cents.toFixed(1) + "¢" : (nn.cents > 0 ? "sharp +" : "flat ") + nn.cents.toFixed(1) + "¢";
        sub.className = Math.abs(nn.cents) < 5 ? "in" : "";
        setNeedle(nn.cents);
        if (truth != null) err.textContent = "off by " + Math.abs(nn.cents - truth).toFixed(2) + "¢";
      }
      function measure() {
        var cents = +rng.value, f = STR[str][1] * Math.pow(2, cents / 1200);
        outv.textContent = (cents > 0 ? "+" : "") + cents.toFixed(1) + "¢";
        var t0 = performance.now(), got = mpm(signal(f), SR), ms = performance.now() - t0;
        meta.textContent = "McLeod pitch method · " + ms.toFixed(1) + " ms a frame, in this tab";
        show(got, cents);
      }
      var swept = false;
      rng.addEventListener("input", function () { swept = true; stopMic(); measure(); });
      root.querySelectorAll(".strings button").forEach(function (b, i) {
        b.addEventListener("click", function () { str = i; swept = true; stopMic(); root.querySelectorAll(".strings button").forEach(function (x, k) { x.setAttribute("aria-pressed", k === i); }); measure(); });
      });
      // sound only when asked for: a short bowed tone at the dialled pitch
      var ac = null;
      root.querySelector(".hear").addEventListener("click", function () {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        var f = STR[str][1] * Math.pow(2, +rng.value / 1200), o = ac.createOscillator(), lp = ac.createBiquadFilter(), gn = ac.createGain(), now = ac.currentTime;
        o.type = "sawtooth"; o.frequency.value = f; lp.type = "lowpass"; lp.frequency.value = f * 5;
        gn.gain.setValueAtTime(0, now); gn.gain.linearRampToValueAtTime(0.12, now + 0.08); gn.gain.setValueAtTime(0.12, now + 0.9); gn.gain.linearRampToValueAtTime(0, now + 1.3);
        o.connect(lp); lp.connect(gn); gn.connect(ac.destination); o.start(now); o.stop(now + 1.35);
      });
      function stopMic() {
        if (!mic) return;
        mic.stream.getTracks().forEach(function (t) { t.stop(); }); cancelAnimationFrame(mic.raf); mic = null;
        src.lastChild.textContent = "synth string"; root.querySelector(".mic").textContent = "Use my microphone";
      }
      root.querySelector(".mic").addEventListener("click", function () {
        if (mic) { stopMic(); measure(); return; }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { err.textContent = "no microphone here"; return; }
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } }).then(function (stream) {
          ac = ac || new (window.AudioContext || window.webkitAudioContext)();
          var an = ac.createAnalyser(); an.fftSize = N; ac.createMediaStreamSource(stream).connect(an);
          var buf = new Float32Array(N), k = 0;
          mic = { stream: stream };
          src.lastChild.textContent = "your microphone"; root.querySelector(".mic").textContent = "Stop listening"; err.textContent = "";
          (function loop() {
            mic.raf = requestAnimationFrame(loop);
            if (k++ % 3) return;
            an.getFloatTimeDomainData(buf);
            var rms = 0; for (var i = 0; i < N; i++) rms += buf[i] * buf[i];
            if (Math.sqrt(rms / N) < 0.01) { sub.textContent = "play a note"; sub.className = ""; return; }
            show(mpm(buf, ac.sampleRate), null);
          })();
        }, function () { err.textContent = "microphone not allowed"; });
      });
      measure();
      onFirstLook(root, async function () {
        // a slow sweep from flat into tune, the detector reading every step
        var steps = [-38, -26, -15, -8, -3, 0];
        for (var i = 0; i < steps.length; i++) { if (swept) return; rng.value = steps[i]; measure(); await wait(420); }
      });
      return { visible: function (on) { if (!on) stopMic(); } };
    }
  };

  /* ================================================================ Layerline: slice a gear */

  DEMOS.layer = {
    init: function (root) {
      root.innerHTML =
        '<div class="app-bar"><div class="app-title"><i>L</i>gear.stl · 40 layers</div><div class="legend"><span><i style="background:var(--ink)"></i>walls</span><span><i style="background:var(--accent)"></i>infill</span></div></div>' +
        '<div class="app-body"><div class="slice"><div><span class="lab">Part</span><canvas class="cv3"></canvas></div><div><span class="lab">Layer path</span><canvas class="cv2"></canvas><canvas class="cvn"></canvas></div></div>' +
        '<div class="ll-ctl"><input type="range" min="1" max="40" value="1" aria-label="Layer" data-cursor="Scrub" /><output>1 / 40</output></div></div>' +
        '<div class="app-foot"><span class="meta"></span><span class="st"></span></div>';
      var cv3 = root.querySelector(".cv3"), cv2 = root.querySelector(".cv2"), cvn = root.querySelector(".cvn"), rng = root.querySelector("input"), outv = root.querySelector("output");
      var meta = root.querySelector(".meta"), stEl = root.querySelector(".st");
      var L = 40, layer = 1, nozzle = 0, on = false, raf = 0, user = false;
      // the part: a 14-tooth gear, 40 mm across, 30 layers of gear and 10 of hub on top, a hole through it
      function gear(rOut, rIn, teeth) {
        var pts = [], n = teeth * 4;
        for (var i = 0; i < n; i++) {
          var a = i / n * Math.PI * 2, k = i % 4, r = k === 1 || k === 2 ? rOut : rIn;
          var off = (k === 1 ? 0.18 : k === 2 ? -0.18 : 0) * (Math.PI * 2 / n);
          for (var s2 = 0; s2 < 3; s2++) { var aa = a + off + s2 / 3 * (Math.PI * 2 / n) * (k === 1 ? 0.64 : k === 3 ? 1 : 0.18); pts.push([r * Math.cos(aa), r * Math.sin(aa)]); }
        }
        return pts;
      }
      function circle(r, n) { var p = []; for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; p.push([r * Math.cos(a), r * Math.sin(a)]); } return p; }
      function shrink(poly, d) { return poly.map(function (p) { var r = Math.hypot(p[0], p[1]); return [p[0] * (r - d) / r, p[1] * (r - d) / r]; }); }
      var GEAR = gear(1, 0.82, 14), HUB = circle(0.46, 64), HOLE = 0.2, W = 0.022;
      function outline(i) { return i < 30 ? GEAR : HUB; }
      // scanline infill: lines at an angle, clipped to the inner wall and outside the hole (even-odd)
      function infill(i) {
        var solid = i < 3 || (i >= 27 && i < 30) || i >= 37;
        var gap = solid ? 0.045 : 0.13, ang = (i % 2 ? 1 : -1) * Math.PI / 4;
        var polys = [shrink(outline(i), W * 2.2), circle(HOLE + W * 2.2, 40)];
        var ca = Math.cos(-ang), sa = Math.sin(-ang);
        var rot = polys.map(function (P) { return P.map(function (p) { return [p[0] * ca - p[1] * sa, p[0] * sa + p[1] * ca]; }); });
        var segs = [], flip = false;
        for (var y = -1; y <= 1; y += gap) {
          var xs = [];
          rot.forEach(function (P) {
            for (var k = 0; k < P.length; k++) {
              var a = P[k], b = P[(k + 1) % P.length];
              if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
            }
          });
          xs.sort(function (p, q) { return p - q; });
          var row = [];
          for (var m = 0; m + 1 < xs.length; m += 2) row.push([xs[m], xs[m + 1]]);
          if (flip) row.reverse();
          row.forEach(function (sg) {
            var x0 = flip ? sg[1] : sg[0], x1 = flip ? sg[0] : sg[1];
            // back to the part's frame
            segs.push([[x0 * ca + y * sa, -x0 * sa + y * ca], [x1 * ca + y * sa, -x1 * sa + y * ca]]);
          });
          flip = !flip;
        }
        return { segs: segs, solid: solid };
      }
      var cache = {};
      function sliceLayer(i) {
        if (cache[i]) return cache[i];
        var t0 = performance.now();
        var o = outline(i), walls = [o, shrink(o, W), circle(HOLE, 40), circle(HOLE + W, 40)], inf = infill(i);
        // the nozzle's path: each wall loop, then the infill lines in order
        var path = [];
        walls.forEach(function (P) { P.concat([P[0]]).forEach(function (p) { path.push(p); }); });
        inf.segs.forEach(function (sg) { path.push(sg[0], sg[1]); });
        var len = 0; for (var k = 1; k < path.length; k++) len += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
        return (cache[i] = { walls: walls, inf: inf, path: path, len: len * 20, ms: performance.now() - t0 });
      }
      var col = {};
      function colors() { col = { ink: css("--ink"), mute: css("--mute"), acc: css("--accent"), card: css("--card"), line: css("--line-2"), paper2: css("--paper-2") }; }
      document.addEventListener("af:theme", function () { colors(); draw(); });
      colors();
      function draw3() {
        var d = fitCanvas(cv3), c = cv3.getContext("2d");
        c.setTransform(d.dpr, 0, 0, d.dpr, 0, 0); c.clearRect(0, 0, d.w, d.h);
        var lh = Math.min(3.2, d.h * 0.3 / L), R = Math.min(d.w * 0.38, (d.h * 0.62 - L * lh) / 0.84), cx = d.w / 2, cy = d.h * 0.56 + L * lh / 2;
        for (var i = 0; i < L; i++) {
          var P = outline(i), y0 = cy - i * lh, done = i < layer;
          c.beginPath();
          P.forEach(function (p, k) { var x = cx + p[0] * R, y = y0 + p[1] * R * 0.42; k ? c.lineTo(x, y) : c.moveTo(x, y); });
          c.closePath();
          if (done) {
            c.fillStyle = i === layer - 1 ? col.acc : col.paper2; c.fill();
            c.strokeStyle = i === layer - 1 ? col.acc : col.line; c.lineWidth = 1; c.stroke();
          } else { c.strokeStyle = col.line; c.globalAlpha = 0.35; c.lineWidth = 0.75; c.stroke(); c.globalAlpha = 1; }
        }
        // the hole, seen from above
        c.beginPath(); c.ellipse(cx, cy - (layer - 1) * lh, HOLE * R, HOLE * R * 0.42, 0, 0, Math.PI * 2);
        c.fillStyle = col.card; c.fill(); c.strokeStyle = col.line; c.stroke();
      }
      // the layer's walls and infill are painted once; each frame only moves the nozzle on a canvas above it
      var v2 = null, last = null;
      function paint2() {
        var d = fitCanvas(cv2), c = cv2.getContext("2d"), S = sliceLayer(layer - 1);
        fitCanvas(cvn); last = null;
        c.setTransform(d.dpr, 0, 0, d.dpr, 0, 0); c.clearRect(0, 0, d.w, d.h);
        var R = Math.min(d.w, d.h) * 0.42, cx = d.w / 2, cy = d.h / 2 + 8;
        function X(p) { return cx + p[0] * R; } function Y(p) { return cy + p[1] * R; }
        c.lineJoin = "round"; c.lineCap = "round";
        c.strokeStyle = col.acc; c.lineWidth = Math.max(1, R * 0.012); c.globalAlpha = 0.85; c.beginPath();
        S.inf.segs.forEach(function (sg) { c.moveTo(X(sg[0]), Y(sg[0])); c.lineTo(X(sg[1]), Y(sg[1])); });
        c.stroke(); c.globalAlpha = 1;
        c.strokeStyle = col.ink; c.lineWidth = Math.max(1.2, R * 0.016);
        S.walls.forEach(function (P) { c.beginPath(); P.forEach(function (p, k) { k ? c.lineTo(X(p), Y(p)) : c.moveTo(X(p), Y(p)); }); c.closePath(); c.stroke(); });
        v2 = { d: d, X: X, Y: Y, path: S.path };
        cvn.getContext("2d").clearRect(0, 0, cvn.width, cvn.height);
        meta.textContent = "Layer " + layer + " · 0.2 mm · " + (S.inf.solid ? "solid skin" : "20% infill") + " · " + Math.round(S.len).toLocaleString() + " mm of path";
        stEl.textContent = "sliced in " + S.ms.toFixed(2) + " ms, this tab";
      }
      function draw2() {
        if (!v2) paint2();
        var c = cvn.getContext("2d"), d = v2.d, X = v2.X, Y = v2.Y, path = v2.path;
        c.setTransform(d.dpr, 0, 0, d.dpr, 0, 0);
        if (last) c.clearRect(last[0] - 7, last[1] - 7, 14, 14);
        // the nozzle, riding the path
        var idx = Math.floor(nozzle) % path.length, fr = nozzle % 1, a = path[idx], b = path[(idx + 1) % path.length];
        var nx = X(a) + (X(b) - X(a)) * fr, ny = Y(a) + (Y(b) - Y(a)) * fr;
        c.fillStyle = col.ink; c.beginPath(); c.arc(nx, ny, 5, 0, Math.PI * 2); c.fill();
        c.fillStyle = col.acc; c.beginPath(); c.arc(nx, ny, 2.2, 0, Math.PI * 2); c.fill();
        last = [nx, ny];
      }
      function draw() { draw3(); paint2(); draw2(); }
      function setLayer(i) { layer = Math.max(1, Math.min(L, i)); rng.value = layer; outv.textContent = layer + " / " + L; nozzle = 0; draw(); }
      rng.addEventListener("input", function () { user = true; setLayer(+rng.value); });
      function loop() {
        raf = requestAnimationFrame(loop);
        if (calmNow()) return;
        nozzle += 0.9; draw2();
      }
      addEventListener("resize", function () { if (on) draw(); });
      setLayer(1);
      onFirstLook(root, function () {
        if (calmNow()) { setLayer(24); return; }
        var p = { v: 1 };
        gsap.to(p, { v: 40, duration: 5, ease: "power1.inOut", onUpdate: function () { if (!user && Math.round(p.v) !== layer) setLayer(Math.round(p.v)); }, onComplete: function () { if (!user) setLayer(18); } });
      });
      return { visible: function (v) { on = v; cancelAnimationFrame(raf); if (v) { draw(); loop(); } } };
    }
  };

  window.DEMOS = DEMOS;
})();
