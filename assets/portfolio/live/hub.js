/*
 * The two cells that are not projects. The hub is the middle of the map: the name, the line, and
 * the career as a route with a stop per year. StudyLog is every note I have published, one square
 * each, stacked by the month it went up.
 */
(function (root) {
  "use strict";
  const { TAU, SANS, SERIF, INK, ink, rgba, font, fit, label, Fig } = root.FigKit;

  class Hub extends Fig {
    constructor(o) {
      super(o);
      this.p = o.profile;
      this.stops = o.path;
      this.hit = -1;
      this.links = [];
    }
    lay() {
      if (this.L) return this.L;
      const { w, h } = this, L = {};
      const x0 = w * 0.07, x1 = w * 0.93;
      L.line = this.tall ? { x0: w * 0.12, x1: w * 0.12, y0: h * 0.42, y1: h * 0.9 } : { x0, x1, y0: h * 0.7, y1: h * 0.7 };
      L.stops = this.stops.map((st, i) => {
        const k = i / (this.stops.length - 1);
        return this.tall ? [L.line.x0, L.line.y0 + k * (L.line.y1 - L.line.y0)] : [x0 + k * (x1 - x0), L.line.y0];
      });
      this.L = L;
      return L;
    }
    move(x, y) {
      super.move(x, y);
      const L = this.lay();
      this.hit = L.stops.findIndex(([sx, sy]) => Math.hypot(x - sx, y - sy) < 22 * this.s);
      const ln = this.links.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y - r.h / 2 && y <= r.y + r.h / 2);
      this.hitLink = ln || null;
      return this.hit >= 0 || ln ? "pointer" : "";
    }
    leave() { super.leave(); this.hit = -1; this.hitLink = null; }
    down(x, y) {
      this.move(x, y);
      if (this.hitLink) { this.fx("open", this.hitLink.href); return true; }
      if (this.hit >= 0) { this.pinned = this.pinned === this.hit ? -1 : this.hit; this.fx("year", this.stops[this.hit].y); return true; }
      return false;
    }
    draw(ctx) {
      const L = this.lay(), { w, h, s } = this, c = this.color, p = this.p;
      ctx.textBaseline = "alphabetic";
      const nx = w * 0.07;
      const big = this.tall ? Math.min(w * 0.17, 96 * s) : 108 * s;
      const ny = this.tall ? h * 0.2 : h * 0.4;
      // live dot and role
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
      ctx.fillStyle = rgba(c, 0.25 + pulse * 0.5);
      ctx.beginPath(); ctx.arc(nx + 4 * s, ny - big * 0.95, 4 * s, 0, TAU); ctx.fill();
      font(ctx, 11.5 * s, 500);
      ctx.fillStyle = ink(0.62);
      ctx.textAlign = "left";
      ctx.fillText(p.role.toUpperCase(), nx + 16 * s, ny - big * 0.95 + 4 * s);
      font(ctx, big, 400, SERIF);
      ctx.fillStyle = INK;
      ctx.fillText(p.name, nx - 3 * s, ny);
      font(ctx, big * 0.3, 400, SERIF);
      ctx.fillStyle = ink(0.72);
      const tag = "I go where the software ";
      ctx.fillText(tag, nx, ny + big * 0.5);
      ctx.font = `italic 400 ${(big * 0.3).toFixed(1)}px ${SERIF}`;
      ctx.fillStyle = c;
      ctx.fillText("breaks.", nx + (font(ctx, big * 0.3, 400, SERIF), ctx.measureText(tag).width), ny + big * 0.5);

      // contact, as plain links
      ctx.textBaseline = "middle";
      this.links = [];
      const ly = this.tall ? h * 0.33 : h * 0.86;
      let lx = nx;
      [["contact()", "mailto:" + p.email], [p.email, "mailto:" + p.email], ["github", p.github], ["studylog", "/blog/"]].forEach(([t, href], i) => {
        font(ctx, (i ? 11 : 12) * s, i ? 400 : 600);
        const tw = ctx.measureText(t).width;
        const hov = this.hitLink && this.hitLink.href === href && this.hitLink.t === t;
        ctx.fillStyle = i === 0 ? c : hov ? INK : ink(0.55);
        ctx.textAlign = "left";
        ctx.fillText(t, lx, ly);
        if (hov) ctx.fillRect(lx, ly + 8 * s, tw, 1);
        this.links.push({ x: lx, y: ly, w: tw, h: 20 * s, href, t });
        lx += tw + 22 * s;
      });

      // the route
      const Ln = L.line;
      ctx.strokeStyle = ink(0.22);
      ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(Ln.x0, Ln.y0); ctx.lineTo(Ln.x1, Ln.y1); ctx.stroke();
      ctx.lineWidth = 1;
      const sel = this.hit >= 0 ? this.hit : this.pinned >= 0 ? this.pinned : -1;
      L.stops.forEach(([sx, sy], i) => {
        const st = this.stops[i], last = i === this.stops.length - 1, on = sel === i;
        ctx.beginPath();
        ctx.arc(sx, sy, (last ? 7 : 5) * s, 0, TAU);
        ctx.fillStyle = last ? c : "#0a0b0d";
        ctx.fill();
        ctx.strokeStyle = last || on ? c : ink(0.5);
        ctx.lineWidth = 1.5 * s;
        ctx.stroke();
        ctx.lineWidth = 1;
        if (last) {
          const k = (this.t * 0.6) % 1;
          ctx.strokeStyle = rgba(c, 0.5 * (1 - k));
          ctx.beginPath(); ctx.arc(sx, sy, (7 + k * 16) * s, 0, TAU); ctx.stroke();
        }
        if (this.tall) {
          label(ctx, st.y, sx + 18 * s, sy - 7 * s, 11 * s, on || last ? c : ink(0.7), "left", 600);
          label(ctx, st.r, sx + 18 * s, sy + 9 * s, 10.5 * s, on ? INK : ink(0.5));
        } else {
          label(ctx, st.y, sx, sy - 20 * s, 11 * s, on || last ? c : ink(0.7), "center", 600);
          font(ctx, 9.5 * s, 400);
          const words = st.r.split(" ");
          const lines = words.length > 2 ? [words.slice(0, 2).join(" "), words.slice(2).join(" ")] : [st.r];
          lines.forEach((t, j) => label(ctx, t, sx, sy + (18 + j * 13) * s, 9.5 * s, on ? INK : ink(0.5), "center"));
        }
      });
      if (sel >= 0) {
        const st = this.stops[sel];
        const ty = this.tall ? h * 0.96 : Ln.y0 - 46 * s;
        label(ctx, st.d, this.tall ? Ln.x0 : w / 2, ty, 12 * s, ink(0.8), this.tall ? "left" : "center", 400, SANS);
      }
    }
  }

  class Notes extends Fig {
    constructor(o) {
      super(o);
      const rows = root.PORTFOLIO_NOTES || [];
      this.notes = rows.map(([title, url]) => {
        const m = url.match(/\/blog\/(\d{4})\/(\d{2})\//);
        const parts = title.split(" · ");
        return { title: (parts.length > 1 ? parts.slice(1).join(" · ") : title).split(" — ")[0].trim(), series: parts.length > 1 ? parts[0].split(" — ")[0].trim() : "", url, y: m ? +m[1] : 2022, m: m ? +m[2] : 1 };
      });
      this.notes.sort((a, b) => a.y - b.y || a.m - b.m);
      this.first = this.notes.length ? this.notes[0].y * 12 + this.notes[0].m - 1 : 0;
      const last = this.notes.length ? this.notes[this.notes.length - 1] : { y: 2026, m: 1 };
      this.months = last.y * 12 + last.m - this.first;
      this.hit = -1;
    }
    lay() {
      if (this.L) return this.L;
      const { w, h, s } = this, L = { sq: [] };
      const area = { x: w * 0.05, y: h * 0.12, w: w * 0.9, h: h * 0.7 };
      const per = {};
      this.notes.forEach((n) => { const k = n.y * 12 + n.m - 1 - this.first; per[k] = (per[k] || 0) + 1; });
      const tallest = Math.max(1, ...Object.values(per));
      const cw = area.w / this.months, size = Math.min(cw * 0.86, (area.h / tallest) * 0.86);
      const count = {};
      this.notes.forEach((n, i) => {
        const k = n.y * 12 + n.m - 1 - this.first, j = (count[k] = (count[k] || 0) + 1) - 1;
        L.sq[i] = { x: area.x + k * cw + (cw - size) / 2, y: area.y + area.h - (j + 1) * (size / 0.86), w: size, h: size };
      });
      L.area = area;
      L.cw = cw;
      void s;
      this.L = L;
      return L;
    }
    move(x, y) {
      super.move(x, y);
      const L = this.lay();
      this.hit = L.sq.findIndex((r) => x >= r.x - 1 && x <= r.x + r.w + 1 && y >= r.y - 1 && y <= r.y + r.h + 1);
      return this.hit >= 0 ? "pointer" : "";
    }
    leave() { super.leave(); this.hit = -1; }
    down(x, y) {
      this.move(x, y);
      if (this.hit < 0) return false;
      this.fx("open", this.notes[this.hit].url);
      return true;
    }
    draw(ctx) {
      const L = this.lay(), { w, h, s } = this, c = this.color;
      ctx.textBaseline = "middle";
      const yrs = [...new Set(this.notes.map((n) => n.y))];
      const lit = this.lit || null;
      this.notes.forEach((n, i) => {
        const r = L.sq[i], on = this.hit === i || (lit && lit.has(n.url));
        const age = (n.y - 2022) / 4;
        ctx.fillStyle = on ? INK : rgba(c, 0.25 + 0.6 * age);
        ctx.fillRect(r.x, r.y, r.w, r.h);
      });
      // a year mark under each January (and the first month)
      for (let y = Math.floor(this.first / 12); y <= Math.floor((this.first + this.months) / 12); y++) {
        const k = Math.max(0, y * 12 - this.first);
        const x = L.area.x + k * L.cw;
        ctx.fillStyle = ink(0.2);
        ctx.fillRect(x, L.area.y + L.area.h + 6 * s, 1, 6 * s);
        label(ctx, String(y), x + 4 * s, L.area.y + L.area.h + 20 * s, 10 * s, yrs.includes(y) ? ink(0.6) : ink(0.3));
      }
      label(ctx, this.notes.length + " notes since " + yrs[0], L.area.x, h * 0.06, 12 * s, INK, "left", 500, SANS);
      if (this.hit >= 0) {
        const n = this.notes[this.hit], r = L.sq[this.hit];
        font(ctx, 12 * s, 500, SANS);
        const t = fit(ctx, n.title, w * 0.6);
        const tw = ctx.measureText(t).width;
        const tx = Math.min(w - tw - 20 * s, Math.max(10 * s, r.x - tw / 2)), ty = Math.max(h * 0.12, r.y - 24 * s);
        ctx.fillStyle = "rgba(10,11,13,0.92)";
        ctx.fillRect(tx - 8 * s, ty - 14 * s, tw + 16 * s, 40 * s);
        label(ctx, t, tx, ty - 1 * s, 12 * s, INK, "left", 500, SANS);
        label(ctx, (n.series ? n.series + " · " : "") + n.y + "-" + String(n.m).padStart(2, "0"), tx, ty + 15 * s, 9.5 * s, ink(0.5));
      } else {
        label(ctx, "Hover a square for its title. Click to read it.", L.area.x + L.area.w, h * 0.06, 10.5 * s, ink(0.42), "right");
      }
    }
  }

  root.Figs.Hub = Hub;
  root.Figs.Notes = Notes;
})(window);
