import { useEffect, useRef, useState } from "react";
import { layout, pointAt, samplePath, type Point, type Polyline } from "../core/layout";
import { SERVICES, serviceDef, staticEdges } from "../core/topology";
import type { NodeSnap, Snapshot } from "../worker/protocol";
import { ms, pct } from "./format";
import { C, HEALTH, HEALTH_NAME } from "./theme";
import type { SnapshotListener } from "./useEngine";

interface Props {
  subscribe: (fn: SnapshotListener) => () => void;
  snap: Snapshot | null;
}

interface EdgeGeom {
  key: string;
  from: string;
  to: string;
  async: boolean;
  path: Polyline;
  rate: number;
  errRate: number;
}

interface Particle {
  edge: number;
  t0: number;
  dur: number;
  err: boolean;
}

/** Dots per real second for each call per simulated second, so density tracks traffic at any speed. */
const DOTS_PER_CALL = 0.8;
/** Failed calls are drawn this many times as often, so a 2% error rate still shows. */
const ERR_BOOST = 3;
const MAX_PARTICLES = 900;

const LABEL: Record<string, string> = { "payment-provider": "card provider" };
export const label = (id: string) => LABEL[id] ?? id;

export default function ServiceMap({ subscribe, snap }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const tipRef = useRef(tip);
  tipRef.current = tip;

  useEffect(() => {
    const el = canvas.current!;
    const box = wrap.current!;
    const ctx = el.getContext("2d")!;
    const edgesIn = staticEdges();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const st = {
      w: 0,
      h: 0,
      dpr: 1,
      vertical: false,
      pos: new Map<string, Point>(),
      edges: [] as EdgeGeom[],
      index: new Map<string, number>(),
      particles: [] as Particle[],
      acc: [] as { ok: number; err: number }[],
      radius: new Map<string, number>(SERVICES.map((s) => [s.id, 16])),
      latest: null as Snapshot | null,
      onScreen: true,
      reduced: motion.matches,
      frame: 0,
      dirty: true,
    };

    const relayout = () => {
      const w = box.clientWidth;
      const vertical = w < 640;
      const h = vertical ? 620 : Math.round(Math.min(560, Math.max(400, w * 0.56)));
      st.w = w;
      st.h = h;
      st.vertical = vertical;
      st.dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(w * st.dpr);
      el.height = Math.round(h * st.dpr);
      el.style.height = `${h}px`;
      const L = layout(
        { nodes: SERVICES.map((s) => s.id), edges: edgesIn },
        vertical ? { width: w, height: h, vertical, pad: 52 } : { width: w, height: h, vertical, pad: 64 },
      );
      st.pos = new Map([...L.nodes].map(([id, n]) => [id, { x: n.x, y: n.y }]));
      const prev = new Map(st.edges.map((e) => [e.key, e]));
      st.edges = L.edges.map((e) => {
        const key = `${e.from}>${e.to}`;
        const old = prev.get(key);
        return { key, from: e.from, to: e.to, async: edgesIn.find((x) => x.from === e.from && x.to === e.to)?.async ?? false, path: samplePath(e.points, vertical), rate: old?.rate ?? 0, errRate: old?.errRate ?? 0 };
      });
      st.index = new Map(st.edges.map((e, i) => [e.key, i]));
      st.acc = st.edges.map(() => ({ ok: 0, err: 0 }));
      st.particles = [];
      st.dirty = true;
    };

    const onSnap = (s: Snapshot) => {
      st.latest = s;
      st.dirty = true;
      const now = performance.now();
      const dt = Math.max(1, s.dtMs);
      const a = 1 - Math.exp(-dt / 15_000);
      for (const e of st.edges) {
        const c = s.edges[e.key];
        const n = c?.n ?? 0;
        const err = c?.err ?? 0;
        e.rate = e.rate * (1 - a) + (n / (dt / 1000)) * a;
        e.errRate = e.errRate * (1 - a) + (err / (dt / 1000)) * a;
      }
      if (st.reduced || !st.onScreen || s.speed <= 0) return;
      const realMs = dt / s.speed;
      for (const [k, c] of Object.entries(s.edges)) {
        const i = st.index.get(k);
        if (i === undefined) continue;
        const acc = st.acc[i];
        acc.ok += ((c.n - c.err) * DOTS_PER_CALL) / s.speed;
        acc.err += (c.err * DOTS_PER_CALL * ERR_BOOST) / s.speed;
        const len = st.edges[i].path.total;
        const dur = Math.min(1700, Math.max(650, len * 3.2));
        for (const err of [false, true]) {
          const key = err ? "err" : "ok";
          while (acc[key] >= 1) {
            acc[key] -= 1;
            if (st.particles.length >= MAX_PARTICLES) continue;
            st.particles.push({ edge: i, t0: now + Math.random() * realMs, dur: dur * (0.9 + Math.random() * 0.2), err });
          }
        }
      }
    };

    const nodeAt = (x: number, y: number) => {
      for (const [id, p] of st.pos) {
        const r = (st.radius.get(id) ?? 16) + 8;
        if ((x - p.x) ** 2 + (y - p.y) ** 2 <= r * r) return id;
      }
      return null;
    };

    const tmp = { x: 0, y: 0 };
    const draw = () => {
      const now = performance.now();
      const s = st.latest;
      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      ctx.clearRect(0, 0, st.w, st.h);
      const nodes = s?.nodes ?? {};
      const maxRps = Math.max(1, ...Object.values(nodes).map((n) => n.rps));

      // Edges: width by traffic, tinted by failures.
      const maxEdge = Math.max(1, ...st.edges.map((e) => e.rate));
      for (const e of st.edges) {
        const { xs, ys } = e.path;
        const share = e.rate > 0 ? e.errRate / e.rate : 0;
        ctx.beginPath();
        ctx.moveTo(xs[0], ys[0]);
        for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], ys[i]);
        ctx.setLineDash(e.async ? [4, 5] : []);
        ctx.lineWidth = st.reduced ? 1 + 4 * Math.sqrt(e.rate / maxEdge) : 1 + 1.6 * Math.sqrt(e.rate / maxEdge);
        ctx.strokeStyle = share > 0.02 ? `rgba(255,107,87,${Math.min(0.85, 0.3 + share * 3)})` : e.rate > 0 ? "rgba(150,170,160,0.26)" : "rgba(150,170,160,0.12)";
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Requests in flight.
      if (!st.reduced) {
        let w = 0;
        for (const p of st.particles) {
          const t = (now - p.t0) / p.dur;
          if (t >= 1) continue;
          st.particles[w++] = p;
          if (t < 0) continue;
          const path = st.edges[p.edge]?.path;
          if (!path) continue;
          // Ease in and out so dots leave and arrive gently.
          const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          pointAt(path, e * path.total, tmp);
          if (p.err) {
            ctx.fillStyle = "rgba(255,107,87,0.22)";
            ctx.beginPath();
            ctx.arc(tmp.x, tmp.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = C.bad;
            ctx.beginPath();
            ctx.arc(tmp.x, tmp.y, 2.6, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = "rgba(197,244,103,0.85)";
            ctx.beginPath();
            ctx.arc(tmp.x, tmp.y, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        st.particles.length = w;
      }

      // Nodes.
      const suspects = s?.suspects ?? [];
      for (const def of SERVICES) {
        const p = st.pos.get(def.id);
        if (!p) continue;
        const n: NodeSnap | undefined = nodes[def.id];
        const base = st.vertical ? 12 : 15;
        const target = base + (st.vertical ? 10 : 15) * Math.sqrt((n?.rps ?? 0) / maxRps);
        const r0 = st.radius.get(def.id)!;
        const r = r0 + (target - r0) * 0.08;
        st.radius.set(def.id, r);
        const health = n?.health ?? 0;

        const rank = suspects.indexOf(def.id);
        if (rank === 0) {
          ctx.save();
          ctx.strokeStyle = C.accent;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.lineDashOffset = st.reduced ? 0 : -now / 60;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        if (health > 0) {
          const g = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r + 18);
          g.addColorStop(0, health === 2 ? "rgba(255,107,87,0.32)" : "rgba(244,180,74,0.22)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 18, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = C.panel2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = health ? 2.2 : 1.5;
        ctx.strokeStyle = health ? HEALTH[health] : "#3d4a50";
        if (!def.instrumented) ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Worker pool in use, from the simulator.
        if (n && n.workers > 0) {
          const use = Math.min(1, n.busy / n.workers);
          if (use > 0) {
            ctx.strokeStyle = n.queue > 0 ? C.warn : "rgba(197,244,103,0.75)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r - 4.5, -Math.PI / 2, -Math.PI / 2 + use * Math.PI * 2);
            ctx.stroke();
          }
        }
        // Kind glyph.
        ctx.fillStyle = health ? HEALTH[health] : C.soft;
        ctx.font = `600 ${st.vertical ? 9 : 10}px "IBM Plex Mono", ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(GLYPH[def.kind] ?? "", p.x, p.y + 0.5);

        if (rank >= 0) {
          ctx.fillStyle = rank === 0 ? C.accent : "rgba(197,244,103,0.55)";
          ctx.font = `600 10px "IBM Plex Mono", ui-monospace, monospace`;
          ctx.fillText(`#${rank + 1}`, p.x + r + 10, p.y - r - 2);
        }

        // Labels, with a halo so dots passing behind do not cut through them.
        ctx.textBaseline = "top";
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        ctx.strokeStyle = C.panel;
        ctx.fillStyle = C.text;
        ctx.font = `500 ${st.vertical ? 11 : 12.5}px "IBM Plex Sans", system-ui, sans-serif`;
        const ly = p.y + r + (rank === 0 ? 13 : 7);
        ctx.strokeText(label(def.id), p.x, ly);
        ctx.fillText(label(def.id), p.x, ly);
        if (n) {
          ctx.fillStyle = n.err >= 0.01 ? (n.err >= 0.05 ? C.bad : C.warn) : C.muted;
          ctx.font = `400 ${st.vertical ? 9.5 : 10.5}px "IBM Plex Mono", ui-monospace, monospace`;
          const errTxt = n.err >= 0.001 ? ` · ${pct(n.err, n.err >= 0.1 ? 0 : 1)}` : "";
          ctx.strokeText(`${n.rps >= 10 ? Math.round(n.rps) : n.rps.toFixed(1)}/s${errTxt}`, p.x, ly + (st.vertical ? 14 : 16));
          ctx.fillText(`${n.rps >= 10 ? Math.round(n.rps) : n.rps.toFixed(1)}/s${errTxt}`, p.x, ly + (st.vertical ? 14 : 16));
        }
      }
      st.dirty = false;
    };

    const loop = () => {
      st.frame = requestAnimationFrame(loop);
      if (!st.onScreen || document.hidden) return;
      if (st.reduced && !st.dirty) return;
      draw();
    };

    const ro = new ResizeObserver(() => {
      relayout();
      draw();
    });
    ro.observe(box);
    const io = new IntersectionObserver(([e]) => (st.onScreen = e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    const onMotion = () => {
      st.reduced = motion.matches;
      st.particles = [];
    };
    motion.addEventListener("change", onMotion);
    const unsub = subscribe(onSnap);
    relayout();
    st.frame = requestAnimationFrame(loop);

    const onMove = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const id = nodeAt(x, y);
      if (id) {
        const p = st.pos.get(id)!;
        if (tipRef.current?.id !== id) setTip({ id, x: p.x, y: p.y + (st.radius.get(id) ?? 16) });
      } else if (tipRef.current && ev.pointerType === "mouse") setTip(null);
      el.style.cursor = id ? "pointer" : "default";
    };
    const onLeave = () => setTip(null);
    const onDown = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const id = nodeAt(ev.clientX - rect.left, ev.clientY - rect.top);
      if (!id) setTip(null);
      else onMove(ev);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    return () => {
      cancelAnimationFrame(st.frame);
      ro.disconnect();
      io.disconnect();
      motion.removeEventListener("change", onMotion);
      unsub();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
    };
  }, [subscribe]);

  const n = tip && snap ? snap.nodes[tip.id] : undefined;
  const def = tip ? serviceDef(tip.id) : undefined;
  const nodes = snap?.nodes ?? {};

  return (
    <div className="map" ref={wrap}>
      <canvas ref={canvas} role="img" aria-label="Live service map. Each circle is a service, database, cache or external API; lines are calls between them; moving dots are requests, red when they fail. A table of the same data follows." />
      {tip && def && (
        <div className="tip" style={{ left: Math.min(Math.max(tip.x, 130), (wrap.current?.clientWidth ?? 400) - 130), top: tip.y + 34 }} role="status">
          <div className="tip-head">
            <strong>{label(def.id)}</strong>
            <span className={`pill h${n?.health ?? 0}`}>{HEALTH_NAME[n?.health ?? 0]}</span>
          </div>
          <p className="muted">{def.role}</p>
          {n && (
            <dl>
              <dt>traffic</dt>
              <dd>{n.rps.toFixed(1)} req/s</dd>
              <dt>failing</dt>
              <dd>{pct(n.err, 2)}</dd>
              <dt>self time</dt>
              <dd>
                {ms(n.selfMs)} <span className="muted">(usual {ms(n.baseMs)})</span>
              </dd>
              <dt>workers</dt>
              <dd>
                {n.busy}/{n.workers} busy{n.queue ? `, ${n.queue} queued` : ""}
              </dd>
              {n.version && (
                <>
                  <dt>version</dt>
                  <dd>{n.version}</dd>
                </>
              )}
            </dl>
          )}
          {!def.instrumented && <p className="tip-note">Emits no spans. Seen only through its callers' client spans.</p>}
        </div>
      )}
      <div className="sr-only">
      <table>
        <caption>Services right now</caption>
        <thead>
          <tr>
            <th>Service</th>
            <th>Health</th>
            <th>Requests per second</th>
            <th>Failing</th>
            <th>Self time</th>
          </tr>
        </thead>
        <tbody>
          {SERVICES.map((s) => (
            <tr key={s.id}>
              <td>{label(s.id)}</td>
              <td>{HEALTH_NAME[nodes[s.id]?.health ?? 0]}</td>
              <td>{(nodes[s.id]?.rps ?? 0).toFixed(1)}</td>
              <td>{pct(nodes[s.id]?.err ?? 0)}</td>
              <td>{ms(nodes[s.id]?.selfMs ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

const GLYPH: Record<string, string> = {
  gateway: "GW",
  service: "",
  consumer: "Q",
  database: "DB",
  cache: "KV",
  external: "API",
};
