// The middleware chain, drawn live. Nodes are DOM (so captions are real text);
// packets are drawn on a canvas laid over them, one per request, moving at a
// fixed speed through the stages each request actually reached, waiting at the
// deployment that is serving it, and returning along the upper lane when the
// response ends. Everything comes from the gateway's own events.

import { useEffect, useRef, useState } from "react";
import { CATALOG, REGIONS, type BreakerState, type Gateway, type Stage } from "@relay/core";
import { STAGE_LABEL, type LiveEngine, type Packet } from "../live/engine";
import { StageIcon } from "./icons";

/** Execution order: audit wraps everything, meter wraps resilience. */
export const FLOW: Stage[] = ["audit", "auth", "limit", "redact", "screen", "cache", "route", "meter", "resilience"];
const UPSTREAM = FLOW.length + 1;

interface Pt {
  x: number;
  y: number;
}
interface Box extends Pt {
  w: number;
  h: number;
}
interface Geo {
  dots: Box[];
  deps: Map<string, Box>;
  horizontal: boolean;
  lane: number;
  speed: number;
}
interface Vis extends Pt {
  k: number;
  mode: "fwd" | "back" | "drop" | "gone";
  wps: Pt[];
  alpha: number;
  vy: number;
  px: number;
  py: number;
}

const COLORS = { ice: "#cfe0d7", lime: "#c6f36a", mint: "#5fe0a4", peach: "#ffa26b", coral: "#ff5d6c", faint: "#66746d", line: "#2e3833" };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function reached(p: Packet): number {
  if (p.attempts.length) return UPSTREAM;
  let r = 1;
  for (const s of p.stages) r = Math.max(r, FLOW.indexOf(s) + 1);
  return r;
}

function serving(p: Packet): string | null {
  if (!p.attempts.length) return null;
  for (let i = p.attempts.length - 1; i >= 0; i--) if (!p.attempts[i].failed) return p.attempts[i].upstream;
  return p.attempts[p.attempts.length - 1].upstream;
}

function moveToward(v: Vis, t: Pt, max: number): boolean {
  const dx = t.x - v.x;
  const dy = t.y - v.y;
  const d = Math.hypot(dx, dy);
  if (d <= max || d < 0.01) {
    v.x = t.x;
    v.y = t.y;
    return true;
  }
  v.x += (dx / d) * max;
  v.y += (dy / d) * max;
  return false;
}

export function ChainFlow({ engine, external }: { engine: LiveEngine; external: Gateway | null }) {
  const chainRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setTick] = useState(0);
  const [reduced, setReduced] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Captions and breaker lights refresh four times a second.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 250);
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => {
      clearInterval(t);
      mq.removeEventListener("change", on);
    };
  }, []);

  useEffect(() => {
    const chain = chainRef.current;
    const canvas = canvasRef.current;
    if (!chain || !canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    if (reduced) {
      g.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    let geo: Geo | null = null;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();
    let onScreen = true;
    const vis = new Map<string, Vis>();

    const measure = () => {
      const r = chain.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      const box = (el: Element): Box => {
        const b = el.getBoundingClientRect();
        return { x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height };
      };
      const dots = [...chain.querySelectorAll(".node-dot")].map(box);
      const deps = new Map<string, Box>();
      chain.querySelectorAll<HTMLElement>(".dep").forEach((el) => deps.set(el.dataset.id ?? "", box(el)));
      if (dots.length < 3) return;
      const a = dots[0];
      const z = dots[dots.length - 1];
      const horizontal = Math.abs(z.x - a.x) > Math.abs(z.y - a.y);
      const c = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
      const hop = Math.hypot(c(dots[2]).x - c(dots[1]).x, c(dots[2]).y - c(dots[1]).y);
      geo = { dots, deps, horizontal, lane: horizontal ? a.y - 9 : a.x + a.w + 6, speed: Math.max(0.5, hop / 85) };
    };

    const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const dock = (p: Packet, G: Geo): Pt => {
      const id = serving(p);
      const b = (id && (G.deps.get(id) ?? (id.startsWith("anthropic/") ? G.deps.get("external") : undefined))) ?? null;
      if (!b) return center(G.dots[G.dots.length - 1]);
      const h = hash(p.id);
      return G.horizontal ? { x: b.x + 3, y: b.y + 6 + (h % Math.max(1, Math.floor(b.h - 12))) } : { x: b.x + 6 + (h % Math.max(1, Math.floor(b.w - 12))), y: b.y + 3 };
    };
    const toLane = (pt: Pt, G: Geo): Pt => (G.horizontal ? { x: pt.x, y: G.lane } : { x: G.lane, y: pt.y });

    const drawLanes = (G: Geo) => {
      g.lineWidth = 1;
      g.strokeStyle = COLORS.line;
      g.setLineDash([]);
      g.beginPath();
      for (let i = 0; i + 1 < G.dots.length; i++) {
        const a = G.dots[i];
        const b = G.dots[i + 1];
        if (G.horizontal) {
          g.moveTo(a.x + a.w + 2, a.y + a.h / 2);
          g.lineTo(b.x - 2, b.y + b.h / 2);
        } else {
          g.moveTo(a.x + a.w / 2, a.y + a.h + 2);
          g.lineTo(b.x + b.w / 2, b.y - 2);
        }
      }
      g.stroke();
      const first = G.dots[0];
      const lastDot = G.dots[G.dots.length - 1];
      g.strokeStyle = "rgba(95, 224, 164, 0.22)";
      g.setLineDash([3, 5]);
      g.beginPath();
      if (G.horizontal) {
        g.moveTo(first.x + first.w / 2, G.lane);
        g.lineTo(lastDot.x + lastDot.w + 22, G.lane);
      } else {
        g.moveTo(G.lane, first.y + first.h / 2);
        g.lineTo(G.lane, lastDot.y + lastDot.h + 18);
      }
      g.stroke();
      g.setLineDash([]);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(50, now - last);
      last = now;
      if (!onScreen || document.hidden) return;
      if (!geo) measure();
      const G = geo;
      if (!G) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      drawLanes(G);
      const live = new Set<string>();
      const step = G.speed * dt;
      for (const p of engine.packets) {
        live.add(p.id);
        let v = vis.get(p.id);
        if (!v) {
          const c0 = center(G.dots[0]);
          v = { x: c0.x, y: c0.y, px: c0.x, py: c0.y, k: 1, mode: "fwd", wps: [], alpha: 1, vy: 0 };
          vis.set(p.id, v);
        }
        if (v.mode === "gone") continue;
        v.px = v.x;
        v.py = v.y;
        if (v.mode === "fwd") {
          const r = reached(p);
          const target = v.k < UPSTREAM ? center(G.dots[v.k]) : dock(p, G);
          if (moveToward(v, target, v.k < UPSTREAM ? step : step * 1.6)) {
            if (v.k < r) v.k++;
            else if (p.done !== null && p.done <= now) {
              if (p.outcome === "rejected") v.mode = "drop";
              else {
                v.mode = "back";
                v.wps = [toLane(v, G), toLane(center(G.dots[0]), G), center(G.dots[0])];
              }
            }
          }
        } else if (v.mode === "back") {
          let budget = step * 1.5;
          while (budget > 0 && v.wps.length) {
            const before = { x: v.x, y: v.y };
            if (moveToward(v, v.wps[0], budget)) v.wps.shift();
            budget -= Math.hypot(v.x - before.x, v.y - before.y);
            if (budget <= 0.01) break;
          }
          if (!v.wps.length) {
            v.alpha -= dt / 220;
            if (v.alpha <= 0) v.mode = "gone";
          }
        } else if (v.mode === "drop") {
          v.vy += 0.0009 * dt;
          v.y += v.vy * dt;
          v.alpha -= dt / 600;
          if (v.alpha <= 0) v.mode = "gone";
        }
        if (v.mode === "gone") continue;

        let color = COLORS.ice;
        if (v.mode === "back") color = p.cache ? COLORS.lime : p.outcome === "ok" ? COLORS.mint : p.outcome === "cut" ? COLORS.peach : p.outcome === "cancelled" ? COLORS.faint : COLORS.coral;
        else if (v.mode === "drop") color = COLORS.coral;
        else if (p.cache) color = COLORS.lime;
        else if (p.tone === "bad") color = COLORS.coral;
        else if (p.tone === "warn") color = COLORS.peach;
        const rad = p.mine ? 5.5 : 3;
        g.globalAlpha = Math.max(0, v.alpha);
        const moved = Math.hypot(v.x - v.px, v.y - v.py);
        if (moved > 0.5) {
          g.strokeStyle = color;
          g.globalAlpha = Math.max(0, v.alpha) * 0.35;
          g.lineWidth = rad * 1.3;
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(v.x - ((v.x - v.px) / moved) * Math.min(26, moved * 2.2), v.y - ((v.y - v.py) / moved) * Math.min(26, moved * 2.2));
          g.lineTo(v.x, v.y);
          g.stroke();
          g.globalAlpha = Math.max(0, v.alpha);
        }
        g.fillStyle = color;
        g.beginPath();
        g.arc(v.x, v.y, rad, 0, Math.PI * 2);
        g.fill();
        if (p.mine) {
          g.strokeStyle = COLORS.lime;
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(v.x, v.y, rad + 3.5, 0, Math.PI * 2);
          g.stroke();
          g.font = "600 10px Geist Mono, ui-monospace, monospace";
          g.fillStyle = COLORS.lime;
          g.fillText("you", v.x + 9, v.y - 8);
        }
      }
      g.globalAlpha = 1;
      for (const id of vis.keys()) if (!live.has(id)) vis.delete(id);
    };

    measure();
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => measure());
    ro.observe(chain);
    const io = new IntersectionObserver((es) => (onScreen = es.some((e) => e.isIntersecting)));
    io.observe(chain);
    // Captions can change a node's height; re-measure now and then.
    const remeasure = setInterval(measure, 1500);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      clearInterval(remeasure);
    };
  }, [engine, reduced, external]);

  const now = performance.now();
  const breakers = new Map(engine.breakerStates().map((b) => [b.upstream, b]));
  const extState: BreakerState | null = external
    ? external.breakerStates().reduce<BreakerState>((w, b) => (b.state === "open" || w === "open" ? "open" : b.state === "half-open" || w === "half-open" ? "half-open" : "closed"), "closed")
    : null;
  const rps = engine.knobs.running ? engine.knobs.rps : 0;

  return (
    <div className="panel chain-wrap" aria-label="The gateway's middleware chain, live">
      <ul className="chain-legend">
        <li>
          <i style={{ background: COLORS.ice }} /> request
        </li>
        <li>
          <i style={{ background: COLORS.mint }} /> response
        </li>
        <li>
          <i style={{ background: COLORS.lime }} /> cache hit
        </li>
        <li>
          <i style={{ background: COLORS.peach }} /> retried, hedged or cut
        </li>
        <li>
          <i style={{ background: COLORS.coral }} /> rejected or failed
        </li>
      </ul>
      <div className="chain" ref={chainRef}>
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="node client">
          <div className="node-dot">
            <StageIcon stage="client" />
          </div>
          <div className="node-name">Client</div>
          <div className="node-note" data-tone="info">
            <span className="lbl">{rps} req/s</span>
            <span className="det">3 tenants{external ? " + your key" : ""}</span>
          </div>
        </div>
        {FLOW.map((s) => {
          const n = engine.notes.get(s);
          const fresh = n && now - n.at < 2500;
          return (
            <div className="node" key={s} data-tone={fresh ? n.decision.tone : undefined}>
              <div className="node-dot">
                <StageIcon stage={s} />
              </div>
              <div className="node-name">{STAGE_LABEL[s]}</div>
              <div className="node-note" data-tone={n?.decision.tone}>
                {n ? (
                  <>
                    <span className="lbl">{n.decision.label}</span>
                    {n.decision.detail ? <span className="det">{n.decision.detail}</span> : null}
                  </>
                ) : (
                  <span className="det">waiting</span>
                )}
              </div>
            </div>
          );
        })}
        <div className="upstreams" aria-label="Upstream deployments and their circuit breakers">
          <div className="upstreams-title">
            <span>{REGIONS[0]}</span>
            <span>{REGIONS[1]}</span>
          </div>
          {CATALOG.flatMap((m) =>
            REGIONS.map((r) => {
              const id = `${r}/${m.id}`;
              const b = breakers.get(id);
              const state = b?.state ?? "closed";
              const flash = now - (engine.flashes.get(id) ?? -1e9) < 350;
              const inflight = engine.active.get(id) ?? 0;
              return (
                <div className={`dep${flash ? " flash" : ""}`} key={id} data-id={id} data-state={state} title={`${id}: circuit ${state}`}>
                  <span className="light" aria-hidden="true" />
                  <b>{m.id.replace("claude-", "")}</b>
                  <span className="row">{inflight} in flight</span>
                  <span className="state">
                    {state}
                    {b && b.failureRate > 0 ? ` · ${Math.round(b.failureRate * 100)}% fail` : ""}
                  </span>
                </div>
              );
            }),
          )}
          {external ? (
            <div className="dep ext" data-id="external" data-state={extState ?? "closed"}>
              <span className="light" aria-hidden="true" />
              <b>api.anthropic.com</b>
              <span className="row">your key</span>
              <span className="state">{extState}</span>
            </div>
          ) : null}
          <div className="sim-note">Simulated deployments. Failures and latency follow the sliders below.</div>
        </div>
      </div>
    </div>
  );
}
