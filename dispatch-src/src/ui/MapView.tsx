// The city map on a Canvas 2D: streets, the river and its bridges drawn once
// per size, then every frame the routes still to drive, the jobs coloured by
// state, and the technicians moving along their streets. Clicking a
// technician selects them; clicking anywhere else drops an urgent job there.

import { useEffect, useRef, useState } from "react";
import { clock, client, DAY_TO, useClient } from "../client";
import { hhmm } from "../format";
import { C, techColor } from "../palette";
import type { CityView, Snapshot } from "../worker/protocol";
import { jobStatus, scene, techAt } from "./scene";
import { SKILLS } from "../core/day";

const PAD = 14;
const MAX_USER_URGENT = 8;

interface Xf {
  s: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

function transform(city: CityView, w: number, h: number): Xf {
  const s = Math.min((w - 2 * PAD) / city.width, (h - 2 * PAD) / city.height);
  return { s, ox: (w - city.width * s) / 2, oy: (h - city.height * s) / 2, w, h };
}

function drawStatic(ctx: CanvasRenderingContext2D, city: CityView, xf: Xf, dpr: number) {
  const X = (x: number) => xf.ox + x * xf.s;
  const Y = (y: number) => xf.oy + y * xf.s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, xf.w, xf.h);
  // river
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  city.river.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  ctx.strokeStyle = C.riverEdge;
  ctx.lineWidth = city.riverWidth * xf.s + 3;
  ctx.stroke();
  ctx.strokeStyle = C.river;
  ctx.lineWidth = city.riverWidth * xf.s;
  ctx.stroke();
  // roads, streets first
  for (const cls of [0, 1, 2]) {
    ctx.beginPath();
    for (const [a, b, c] of city.roads) {
      if (c !== cls) continue;
      ctx.moveTo(X(city.xs[a]), Y(city.ys[a]));
      ctx.lineTo(X(city.xs[b]), Y(city.ys[b]));
    }
    ctx.strokeStyle = cls === 0 ? C.street : cls === 1 ? C.arterial : C.bridge;
    ctx.lineWidth = cls === 0 ? 1 : cls === 1 ? 2.2 : 3.2;
    ctx.stroke();
  }
  // depots
  const k = markerScale(xf);
  ctx.font = `600 ${Math.round(10.5 * Math.max(0.85, k))}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  for (const d of city.depots) {
    const x = X(city.xs[d.node]);
    const y = Y(city.ys[d.node]);
    ctx.fillStyle = C.bg;
    ctx.strokeStyle = C.soft;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(x - 6, y - 6, 12, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.soft;
    ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    ctx.fillStyle = C.muted;
    ctx.textAlign = "left";
    ctx.fillText(d.name.toUpperCase(), x + 10, y);
  }
}

/** Markers shrink on a small map (a phone), so the city stays readable. */
const markerScale = (xf: Xf) => Math.max(0.62, Math.min(1, xf.s / 45));

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
}

export default function MapView() {
  const st = useClient();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stat = useRef<HTMLCanvasElement | null>(null);
  const xfRef = useRef<Xf | null>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string[] } | null>(null);
  const city = st.init?.city ?? null;

  // size and static layer
  useEffect(() => {
    if (!city || !wrap.current || !canvas.current) return;
    const el = wrap.current;
    const cv = canvas.current;
    const resize = () => {
      const w = el.clientWidth;
      const h = Math.round(Math.max(240, Math.min(w * ((city.height + 1.2) / (city.width + 0.6)), window.innerHeight * 0.75)));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.height = `${h}px`;
      const xf = transform(city, w, h);
      xfRef.current = xf;
      const off = document.createElement("canvas");
      off.width = cv.width;
      off.height = cv.height;
      drawStatic(off.getContext("2d")!, city, xf, dpr);
      stat.current = off;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [city]);

  // frame loop
  useEffect(() => {
    if (!city || !canvas.current) return;
    const cv = canvas.current;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const xf = xfRef.current;
      const s = client.state;
      const snap = s.snap;
      if (!xf || !snap || !stat.current) return;
      const dpr = cv.width / xf.w;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(stat.current, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, city, xf, snap, clock.t, s.selectedTech, s.selectedJob, s.lit === null ? null : snap.log[s.lit], s.litAt);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [city]);

  const pick = (px: number, py: number): { tech?: number; job?: number } => {
    const xf = xfRef.current;
    const snap = client.state.snap;
    if (!xf || !snap || !city) return {};
    const sc = scene(snap);
    const t = clock.t;
    let best: { tech?: number; job?: number } = {};
    let bd = 13 * 13;
    snap.techs.forEach((_, k) => {
      const p = techAt(sc, city, k, t);
      if (p.state === "gone") return;
      const d = (xf.ox + p.x * xf.s - px) ** 2 + (xf.oy + p.y * xf.s - py) ** 2;
      if (d < bd) {
        bd = d;
        best = { tech: k };
      }
    });
    if (best.tech !== undefined) return best;
    bd = 8 * 8;
    for (const j of snap.jobs) {
      if (jobStatus(sc, j.id, t) === "hidden") continue;
      const d = (xf.ox + city.xs[j.node] * xf.s - px) ** 2 + (xf.oy + city.ys[j.node] * xf.s - py) ** 2;
      if (d < bd) {
        bd = d;
        best = { job: j.id };
      }
    }
    return best;
  };

  const local = (e: React.PointerEvent | React.MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onClick = (e: React.MouseEvent) => {
    if (!city || st.phase !== "ready") return;
    const { x, y } = local(e);
    const hit = pick(x, y);
    if (hit.tech !== undefined) {
      client.set({ selectedTech: hit.tech === client.state.selectedTech ? null : hit.tech, selectedJob: null });
      return;
    }
    if (hit.job !== undefined) {
      client.set({ selectedJob: hit.job === client.state.selectedJob ? null : hit.job });
      return;
    }
    const snap = client.state.snap;
    if (!snap || clock.t >= DAY_TO - 60) {
      client.set({ notice: "The day is nearly over; reset to start again." });
      return;
    }
    if (snap.userUrgent >= MAX_USER_URGENT) {
      client.set({ notice: `That is ${MAX_USER_URGENT} urgent jobs already; reset to start again.` });
      return;
    }
    const xf = xfRef.current!;
    const kx = (x - xf.ox) / xf.s;
    const ky = (y - xf.oy) / xf.s;
    let node = 0;
    let bd = Infinity;
    for (let i = 0; i < city.xs.length; i++) {
      const d = (city.xs[i] - kx) ** 2 + (city.ys[i] - ky) ** 2;
      if (d < bd) {
        bd = d;
        node = i;
      }
    }
    if (Math.sqrt(bd) > 1.2) return; // outside the city
    void client.event({ kind: "urgent", node, skill: client.state.urgentSkill });
  };

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const p = local(e);
    hover.current = p;
    const hit = pick(p.x, p.y);
    const snap = client.state.snap;
    canvas.current!.style.cursor = hit.tech !== undefined || hit.job !== undefined ? "pointer" : "crosshair";
    if (!snap || !city) return;
    if (hit.job !== undefined) {
      const j = snap.jobs[hit.job];
      const sc = scene(snap);
      const v = sc.visitOf.get(j.id);
      const who = v ? snap.techs[v.tech].name : "unassigned";
      setTip({ x: p.x, y: p.y, text: [`${j.label} · ${j.task}`, `${SKILLS[j.skill]} · window ${hhmm(j.e)}–${hhmm(j.l)} · ${j.dur} min`, v ? `${who}, starts ${hhmm(v.start)}${v.late > 0.5 ? `, ${Math.round(v.late)} min late` : ""}` : who] });
    } else if (hit.tech !== undefined) {
      const t = snap.techs[hit.tech];
      setTip({ x: p.x, y: p.y, text: [t.name, `${SKILLS.filter((_, i) => t.skills & (1 << i)).join(", ")}`, `shift ${hhmm(t.start)}–${hhmm(t.end)} · click to select`] });
    } else setTip(null);
  };

  return (
    <div className="map-wrap" ref={wrap}>
      <canvas ref={canvas} className="map-canvas" onClick={onClick} onPointerMove={onMove} onPointerLeave={() => setTip(null)} role="img" aria-label="Map of the synthetic city with technicians, routes and jobs. Click a technician to select them, click elsewhere to drop an urgent job." />
      {tip && (
        <div className="map-tip" style={{ left: Math.min(tip.x + 14, (xfRef.current?.w ?? 0) - 240), top: tip.y + 14 }}>
          {tip.text.map((l, i) => (
            <div key={i} className={i ? "muted" : "strong"}>
              {l}
            </div>
          ))}
        </div>
      )}
      {st.phase === "loading" && <div className="map-loading">Building the city and planning the morning…</div>}
    </div>
  );
}

function draw(ctx: CanvasRenderingContext2D, city: CityView, xf: Xf, snap: Snapshot, t: number, picked: number | null, selJob: number | null, lit: Snapshot["log"][number] | null, litAt: number) {
  // a technician who has gone home has no route left to focus on
  const selTech = picked !== null && snap.techs[picked].gone === null ? picked : null;
  const X = (x: number) => xf.ox + x * xf.s;
  const Y = (y: number) => xf.oy + y * xf.s;
  const sc = scene(snap);
  const k = markerScale(xf);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // routes still to drive
  snap.techs.forEach((tech, q) => {
    if (tech.gone !== null && t >= tech.gone) return;
    const sel = selTech === q;
    ctx.strokeStyle = techColor(q);
    ctx.globalAlpha = selTech === null ? 0.55 : sel ? 0.95 : 0.14;
    ctx.lineWidth = (sel ? 3 : 1.6) * Math.max(0.8, k);
    ctx.beginPath();
    for (const l of sc.legs[q]) {
      const stop = l.cut ?? l.arrive;
      if (stop <= t) continue;
      const pts = l.path;
      // skip the part already driven
      let from = 0;
      if (l.depart < t && l.arrive > l.depart) from = Math.floor(((t - l.depart) / (l.arrive - l.depart)) * (pts.length - 1));
      for (let i = from; i < pts.length; i++) {
        const x = X(city.xs[pts[i]]);
        const y = Y(city.ys[pts[i]]);
        if (i === from) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  // jobs
  const litJobs = new Map<number, number>();
  const litAge = (performance.now() - litAt) / 1000;
  if (lit && litAge < 12) for (const m of lit.moved) litJobs.set(m.job, m.to);
  for (const j of snap.jobs) {
    const status = jobStatus(sc, j.id, t);
    if (status === "hidden") continue;
    const x = X(city.xs[j.node]);
    const y = Y(city.ys[j.node]);
    const v = sc.visitOf.get(j.id);
    const col = v ? techColor(v.tech) : C.warn;
    const dimmed = selTech !== null && (!v || v.tech !== selTech) && status !== "unassigned";
    ctx.globalAlpha = dimmed ? 0.3 : 1;
    const urgent = j.kind === "urgent";
    const r = (urgent ? 5.5 : 4.2) * k;
    if (status === "unassigned") {
      diamond(ctx, x, y, r + 1.5 * k);
      ctx.fillStyle = C.warn;
      ctx.fill();
    } else if (status === "done" || status === "doneLate") {
      ctx.beginPath();
      ctx.arc(x, y, 2.6 * k, 0, Math.PI * 2);
      ctx.fillStyle = status === "doneLate" ? "#8a3b3b" : C.done;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = status === "onsite" ? col : C.bg;
      ctx.fill();
      ctx.lineWidth = (status === "enroute" ? 2.6 : 1.7) * Math.max(0.8, k);
      ctx.strokeStyle = status === "late" ? C.bad : col;
      ctx.stroke();
      if (status === "late") {
        ctx.beginPath();
        ctx.arc(x, y, 1.6 * k, 0, Math.PI * 2);
        ctx.fillStyle = C.bad;
        ctx.fill();
      }
    }
    if (urgent && status !== "done" && status !== "doneLate") {
      ctx.beginPath();
      ctx.arc(x, y, r + 3.2 * k, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.text;
      ctx.stroke();
    }
    if (litJobs.has(j.id) && status !== "done") {
      const pulse = (7 + 3 * Math.sin(performance.now() / 180)) * k;
      ctx.globalAlpha = Math.max(0.15, 1 - litAge / 12);
      ctx.beginPath();
      ctx.arc(x, y, pulse, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.gold;
      ctx.stroke();
    }
    if (selJob === j.id) {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, 10 * k, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = C.text;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // technicians
  const tk = Math.max(0.75, k);
  ctx.font = "700 9.5px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  snap.techs.forEach((tech, q) => {
    const p = techAt(sc, city, q, t);
    if (p.state === "gone") return;
    const x = X(p.x);
    const y = Y(p.y);
    const sel = selTech === q;
    ctx.globalAlpha = p.state === "off" ? 0.35 : selTech === null || sel ? 1 : 0.45;
    ctx.beginPath();
    ctx.arc(x, y, (sel ? 9 : 7.5) * tk, 0, Math.PI * 2);
    ctx.fillStyle = techColor(q);
    ctx.fill();
    ctx.lineWidth = sel ? 2.5 : 1.5;
    ctx.strokeStyle = sel ? C.text : C.bg;
    ctx.stroke();
    if (tk > 0.9) {
      ctx.fillStyle = C.bg;
      ctx.fillText(tech.name[0], x, y + 0.5);
    }
  });
  ctx.globalAlpha = 1;
}
