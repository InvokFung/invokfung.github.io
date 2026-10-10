/*
 * TripleFind Arena, small: three bots race on one board of eighteen cards (six symbols, three of
 * each). Bots only send intents; the server owns the board, accepts or rejects each flip, and
 * appends what happened to an event log. The board you see is a fold over that log, so dragging
 * the slider rewinds the match flip by flip. The deal is committed as a SHA-256 hash before the
 * first flip and checked when the match ends.
 */
(function (root) {
  "use strict";
  const { TAU, SANS, INK, RED, ink, rgba, rng, font, rrect, label, Fig } = root.FigKit;

  const CARDS = 18;
  const PLAYERS = [{ id: "p1", col: "#ff7ab6" }, { id: "p2", col: "#62b6ff" }, { id: "p3", col: "#c8ff4a" }];

  function fold(events, deck) {
    const st = { up: new Array(CARDS).fill(-1), gone: new Array(CARDS).fill(-1), hand: [[], [], []], score: [0, 0, 0] };
    for (const e of events) apply(st, e, deck);
    return st;
  }
  function apply(st, e, deck) {
    if (e.t === "flip") { st.up[e.c] = e.p; st.hand[e.p].push(e.c); }
    else if (e.t === "triple") { e.cards.forEach((c) => { st.gone[c] = e.p; st.up[c] = -1; }); st.hand[e.p] = []; st.score[e.p]++; }
    else if (e.t === "miss") { e.cards.forEach((c) => (st.up[c] = -1)); st.hand[e.p] = []; }
    void deck;
  }
  async function sha(text) {
    try {
      const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
    } catch (e) { return null; }
  }

  function glyph(ctx, g, x, y, r) {
    ctx.beginPath();
    if (g === 0) ctx.arc(x, y, r, 0, TAU);
    else if (g === 1) { ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.95, y + r * 0.75); ctx.lineTo(x - r * 0.95, y + r * 0.75); ctx.closePath(); }
    else if (g === 2) ctx.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
    else if (g === 3) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
    else if (g === 4) { ctx.moveTo(x - r * 0.8, y - r * 0.8); ctx.lineTo(x + r * 0.8, y + r * 0.8); ctx.moveTo(x + r * 0.8, y - r * 0.8); ctx.lineTo(x - r * 0.8, y + r * 0.8); }
    else { ctx.arc(x, y, r, 0, TAU); ctx.moveTo(x + r * 0.45, y); ctx.arc(x, y, r * 0.45, 0, TAU); }
  }
  const SYM = ["●", "▲", "■", "◆", "✕", "◎"];

  class Arena extends Fig {
    constructor(o) {
      super(o);
      this.rand = rng(23);
      this.match = 0;
      this.flipAnim = new Float32Array(CARDS);
      this.slider = { label: "Replay", min: 0, max: 1, step: 0.001, value: 1, fmt: (v) => (v >= 0.999 ? "live" : "event " + Math.round(v * this.events.length) + " of " + this.events.length) };
      this.deal();
    }
    deal() {
      const r = this.rand;
      const deck = [];
      for (let g = 0; g < 6; g++) for (let k = 0; k < 3; k++) deck.push(g);
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      this.deck = deck;
      this.salt = Math.floor(r() * 2 ** 32).toString(16).padStart(8, "0");
      this.events = [];
      this.live = true;
      this.view = null;
      this.st = fold([], deck);
      this.bots = PLAYERS.map(() => ({ wait: 0.5 + r() * 0.8, mem: new Map() }));
      this.pending = [];
      this.over = 0;
      this.match++;
      this.commit = "…";
      this.verified = null;
      const text = deck.join(",") + ":" + this.salt;
      sha(text).then((h) => { if (this.deck === deck) this.commit = h ? h.slice(0, 16) : "unavailable"; });
      this.slider.value = 1;
    }
    log(e) {
      e.n = this.events.length + 1;
      this.events.push(e);
      if (e.t !== "reject") apply(this.st, e, this.deck);
      if (e.t === "flip") { this.bots.forEach((b) => b.mem.set(e.c, this.deck[e.c])); this.flipAnim[e.c] = 1; this.fx("flip"); }
      if (e.t === "triple") { e.cards.forEach((c) => this.bots.forEach((b) => b.mem.delete(c))); this.fx("triple"); }
      if (e.t === "miss") e.cards.forEach((c) => (this.flipAnim[c] = 1));
      if (e.t === "reject") this.fx("reject");
    }
    // a bot's next intent: finish a set it remembers, or try a card it has not seen
    choose(p) {
      const st = this.st, b = this.bots[p], r = this.rand;
      const free = [];
      for (let c = 0; c < CARDS; c++) if (st.gone[c] < 0 && st.up[c] < 0) free.push(c);
      if (!free.length) return -1;
      const hand = st.hand[p];
      const known = (g) => free.filter((c) => b.mem.get(c) === g);
      if (hand.length) {
        const g = this.deck[hand[0]];
        const k = known(g);
        if (k.length && r() < 0.85) return k[Math.floor(r() * k.length)];
      } else {
        for (let g = 0; g < 6; g++) { const k = known(g); if (k.length >= 3 && r() < 0.9) return k[0]; }
        for (let g = 0; g < 6; g++) { const k = known(g); if (k.length >= 2 && r() < 0.5) return k[0]; }
      }
      const unseen = free.filter((c) => !b.mem.has(c));
      const pool = unseen.length ? unseen : free;
      return pool[Math.floor(r() * pool.length)];
    }
    step(dt) {
      super.step(dt);
      for (let i = 0; i < CARDS; i++) this.flipAnim[i] = Math.max(0, this.flipAnim[i] - dt * 6);
      if (!this.live) return;
      if (this.over) { this.over -= dt; if (this.over <= 0) this.deal(); return; }
      for (const pd of this.pending) pd.at -= dt;
      for (const pd of this.pending.filter((q) => q.at <= 0)) this.log({ t: "miss", p: pd.p, cards: pd.cards });
      this.pending = this.pending.filter((q) => q.at > 0);
      // every ready bot picks a card from the same view of the board, then the server takes the
      // intents in arrival order: two bots reaching for one card means the second is rejected
      const intents = [];
      for (let p = 0; p < 3; p++) {
        const b = this.bots[p];
        b.wait -= dt;
        if (b.wait > 0 || this.st.hand[p].length >= 3 || this.pending.some((q) => q.p === p)) continue;
        b.wait = 0.38 + this.rand() * 0.5;
        const c = this.choose(p);
        if (c >= 0) intents.push({ p, c });
        // nothing left to flip: let go of the hand so the others can finish
        else if (this.st.hand[p].length) this.pending.push({ p, cards: this.st.hand[p].slice(), at: 0.4 });
      }
      intents.sort(() => this.rand() - 0.5);
      for (const { p, c } of intents) {
        if (this.st.up[c] >= 0 || this.st.gone[c] >= 0) { this.log({ t: "reject", p, c }); continue; }
        this.log({ t: "flip", p, c });
        const hand = this.st.hand[p];
        if (hand.length === 3) {
          if (hand.every((x) => this.deck[x] === this.deck[hand[0]])) this.log({ t: "triple", p, cards: hand.slice(), g: this.deck[hand[0]] });
          else this.pending.push({ p, cards: hand.slice(), at: 0.75 });
        }
      }
      if (this.st.gone.every((g) => g >= 0)) {
        this.log({ t: "end" });
        this.over = 3;
        sha(this.deck.join(",") + ":" + this.salt).then((h) => { this.verified = h ? h.slice(0, 16) === this.commit : null; });
      }
    }
    set(v) {
      this.auto = false;
      this.slider.value = v;
      if (v >= 0.999) { this.live = true; this.view = null; return; }
      this.live = false;
      const k = Math.round(v * this.events.length);
      this.view = { k, st: fold(this.events.slice(0, k), this.deck) };
    }
    lay() {
      if (this.L) return this.L;
      const { w, h, s } = this, L = {};
      const cols = this.tall ? 3 : 6, rows = CARDS / cols;
      const B = this.tall ? { x: w * 0.06, y: h * 0.1, w: w * 0.88, h: h * 0.5 } : { x: w * 0.04, y: h * 0.16, w: w * 0.58, h: h * 0.7 };
      const gap = 10 * s, cw = Math.min((B.w - gap * (cols - 1)) / cols, ((B.h - gap * (rows - 1)) / rows) * 0.78), ch = cw / 0.78;
      const ox = B.x + (B.w - (cw * cols + gap * (cols - 1))) / 2, oy = B.y + (B.h - (ch * rows + gap * (rows - 1))) / 2;
      L.cards = [];
      for (let i = 0; i < CARDS; i++) L.cards.push({ x: ox + (i % cols) * (cw + gap), y: oy + Math.floor(i / cols) * (ch + gap), w: cw, h: ch });
      L.board = B;
      L.log = this.tall ? { x: w * 0.06, y: h * 0.66, w: w * 0.88, h: h * 0.3 } : { x: w * 0.67, y: h * 0.1, w: w * 0.3, h: h * 0.8 };
      this.L = L;
      return L;
    }
    draw(ctx) {
      const L = this.lay(), { w, h, s } = this;
      const st = this.view ? this.view.st : this.st;
      const shown = this.view ? this.events.slice(0, this.view.k) : this.events;
      ctx.textBaseline = "middle";
      // scores
      const sy = L.board.y - 22 * s;
      PLAYERS.forEach((p, k) => {
        const x = L.board.x + k * 92 * s;
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(x + 4 * s, sy, 4 * s, 0, TAU); ctx.fill();
        label(ctx, p.id, x + 14 * s, sy, 11 * s, ink(0.7), "left", 500);
        label(ctx, String(st.score[k]), x + 40 * s, sy, 13 * s, INK, "left", 600, SANS);
      });
      if (!this.live) label(ctx, "replaying · drag right to go live", L.board.x + L.board.w, sy, 10 * s, this.color, "right");
      // cards
      L.cards.forEach((r, i) => {
        const owner = st.up[i], gone = st.gone[i], a = this.flipAnim[i];
        const sx = this.view ? 1 : Math.abs(Math.cos(a * Math.PI));
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2, ww = r.w * Math.max(0.05, sx);
        rrect(ctx, cx - ww / 2, r.y, ww, r.h, 6 * s);
        if (gone >= 0) {
          ctx.strokeStyle = rgba(PLAYERS[gone].col, 0.22);
          ctx.setLineDash([3 * s, 3 * s]); ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = rgba(PLAYERS[gone].col, 0.3);
          ctx.lineWidth = 1.5 * s;
          glyph(ctx, this.deck[i], cx, cy, r.w * 0.2);
          ctx.stroke();
          ctx.lineWidth = 1;
          return;
        }
        if (owner >= 0) {
          ctx.fillStyle = rgba(PLAYERS[owner].col, 0.1); ctx.fill();
          ctx.strokeStyle = PLAYERS[owner].col; ctx.stroke();
          if (sx > 0.3) {
            ctx.strokeStyle = PLAYERS[owner].col; ctx.fillStyle = PLAYERS[owner].col;
            ctx.lineWidth = 2 * s;
            glyph(ctx, this.deck[i], cx, cy, r.w * 0.22 * sx);
            this.deck[i] === 4 || this.deck[i] === 5 ? ctx.stroke() : ctx.fill();
            ctx.lineWidth = 1;
          }
          return;
        }
        ctx.fillStyle = "rgba(255,255,255,0.035)"; ctx.fill();
        ctx.strokeStyle = ink(0.14); ctx.stroke();
        ctx.fillStyle = ink(0.16);
        ctx.beginPath(); ctx.arc(cx, cy, 1.6 * s, 0, TAU); ctx.fill();
      });
      // the log
      const G = L.log;
      label(ctx, "event log · match " + this.match, G.x, G.y, 10 * s, ink(0.45), "left", 500);
      label(ctx, "deal commit " + this.commit, G.x, G.y + 18 * s, 9.5 * s, ink(0.38));
      const ended = shown.length && shown[shown.length - 1].t === "end";
      if (ended && this.verified !== null) label(ctx, this.verified ? "revealed and checked ✓" : "check failed", G.x, G.y + 34 * s, 9.5 * s, this.verified ? this.color : RED);
      const rh = 17 * s, top = G.y + 52 * s, n = Math.max(1, Math.floor((G.y + G.h - top) / rh));
      const rows = shown.slice(-n);
      font(ctx, 10.5 * s, 400);
      rows.forEach((e, k) => {
        const y = top + k * rh, fade = 0.35 + 0.65 * ((k + 1) / rows.length);
        ctx.globalAlpha = fade;
        const id = "#" + String(e.n).padStart(3, "0");
        label(ctx, id, G.x, y, 10 * s, ink(0.35));
        if (e.t === "end") { label(ctx, "match over", G.x + 46 * s, y, 10.5 * s, INK, "left", 600); ctx.globalAlpha = 1; return; }
        const p = PLAYERS[e.p];
        label(ctx, p.id, G.x + 46 * s, y, 10.5 * s, p.col, "left", 500);
        const txt = e.t === "flip" ? "flip c" + e.c + " " + SYM[this.deck[e.c]] : e.t === "reject" ? "flip c" + e.c + "  rejected, taken" : e.t === "triple" ? "triple " + SYM[e.g] + "  +1" : "miss, flip back";
        label(ctx, txt, G.x + 72 * s, y, 10.5 * s, e.t === "reject" ? RED : e.t === "triple" ? INK : ink(0.7), "left", e.t === "triple" ? 600 : 400);
        ctx.globalAlpha = 1;
      });
      void w; void h;
    }
    stats() {
      const st = this.view ? this.view.st : this.st;
      return [[String(this.view ? this.view.k : this.events.length), "events in this match"], [st.gone.filter((g) => g >= 0).length / 3 + " / 6", "triples found"], [this.commit.slice(0, 8), "deal commitment"]];
    }
  }

  root.Figs.Arena = Arena;
})(window);
