// The pipeline as it runs: three source lanes pass through the eight stages
// and merge into the golden table. Every count on the board comes from the
// worker's stage events; the moving dots are records, coloured by source,
// and after Resolve only the share that survives as golden records goes on.

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useClient, type ClientState } from "../client";
import { STAGES, type StageKey } from "../core/pipeline";
import { bytes, int, ms, pct } from "../format";
import { sourceColor, sourceShort } from "../palette";
import { useMedia, useOnScreen, useReducedMotion, useTicker } from "./hooks";

type Pt = [number, number];

interface Lane {
  color: string;
  pts: Pt[];
  /** Cumulative length at each point. */
  len: number[];
  count: number;
}

function polyline(pts: Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return out;
}

function at(l: Lane, d: number): Pt {
  const { pts, len } = l;
  if (d <= 0) return pts[0];
  const total = len[len.length - 1];
  if (d >= total) return pts[pts.length - 1];
  let lo = 0;
  let hi = len.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (len[mid] <= d) lo = mid;
    else hi = mid;
  }
  const k = (d - len[lo]) / (len[hi] - len[lo] || 1);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * k, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * k];
}

/** A lane that runs straight along the main axis, then bends into the shared lane before `mergeAt`. */
function buildLane(horizontal: boolean, cross: number, center: number, start: number, bendFrom: number, bendTo: number, end: number): Pt[] {
  const P = (main: number, c: number): Pt => (horizontal ? [main, c] : [c, main]);
  const pts: Pt[] = [];
  for (let m = start; m < bendFrom; m += 6) pts.push(P(m, cross));
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    // cubic Bézier with flat tangents at both ends
    const mt = 1 - t;
    const main = mt ** 3 * bendFrom + 3 * mt * mt * t * (bendFrom + (bendTo - bendFrom) / 2) + 3 * mt * t * t * (bendFrom + (bendTo - bendFrom) / 2) + t ** 3 * bendTo;
    const c = mt ** 3 * cross + 3 * mt * mt * t * cross + 3 * mt * t * t * center + t ** 3 * center;
    pts.push(P(main, c));
  }
  for (let m = bendTo + 6; m <= end; m += 6) pts.push(P(m, center));
  return pts;
}

interface Particle {
  lane: number;
  d: number;
  v: number;
  survive: boolean;
  phase: number;
}

/**
 * Moves the dots. `gates` are main-axis positions of the stages; dots wait
 * before the first stage that has not finished. After `mergeAt` the dots that
 * do not survive fade out; the rest turn the golden colour.
 */
function useParticles(
  groupRef: React.RefObject<SVGGElement | null>,
  lanes: Lane[],
  gates: number[],
  done: number,
  survive: number,
  mergeAt: number,
  horizontal: boolean,
  running: boolean,
) {
  const state = useRef<{ ps: Particle[]; key: string } | null>(null);
  const live = useRef({ done, survive, running });
  live.current = { done, survive, running };

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    const key = lanes.map((l) => `${l.count}:${l.len[l.len.length - 1]}`).join("|");
    if (!state.current || state.current.key !== key) {
      const ps: Particle[] = [];
      lanes.forEach((l, li) => {
        const total = l.len[l.len.length - 1];
        for (let i = 0; i < l.count; i++) ps.push({ lane: li, d: -((i / l.count) * total * 0.9) - Math.random() * 40, v: 0.55 + Math.random() * 0.5, survive: Math.random() < survive, phase: Math.random() });
      });
      state.current = { ps, key };
      while (g.firstChild) g.removeChild(g.firstChild);
      for (const p of ps) {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("r", "2.6");
        c.setAttribute("fill", lanes[p.lane].color);
        c.setAttribute("opacity", "0");
        g.appendChild(c);
      }
    }
    const circles = Array.from(g.children) as SVGCircleElement[];
    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const { done: dn, survive: sv, running: run } = live.current;
      const ps = state.current!.ps;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const lane = lanes[p.lane];
        const total = lane.len[lane.len.length - 1];
        // how far this lane may go: up to the next unfinished stage
        const limitMain = dn >= gates.length ? Infinity : gates[Math.max(0, dn)] - 10 - (i % 9) * 4;
        p.d += p.v * 110 * dt * (run ? 1 : 0);
        let [x, y] = at(lane, p.d);
        const main = horizontal ? x : y;
        if (main > limitMain) {
          // hold at the gate: step back along the lane
          p.d -= p.v * 110 * dt;
          [x, y] = at(lane, p.d);
        }
        if (p.d > total) {
          p.d = -Math.random() * 60;
          p.survive = Math.random() < sv;
          p.v = 0.55 + Math.random() * 0.5;
        }
        const c = circles[i];
        if (!c) continue;
        const m2 = horizontal ? x : y;
        let op = p.d < 0 ? 0 : 0.9;
        let fill = lane.color;
        if (m2 > mergeAt) {
          if (p.survive) fill = "var(--gold)";
          else op = Math.max(0, 0.9 - (m2 - mergeAt) / 26);
        }
        if (p.d > total - 18) op *= Math.max(0, (total - p.d) / 18);
        c.setAttribute("cx", x.toFixed(1));
        c.setAttribute("cy", y.toFixed(1));
        c.setAttribute("opacity", op.toFixed(2));
        if (c.getAttribute("fill") !== fill) c.setAttribute("fill", fill);
      }
      raf = requestAnimationFrame(frame);
    };
    if (running) raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [groupRef, lanes, gates, mergeAt, horizontal, running]);
}

interface StageLine {
  big: number | null;
  unit: string;
  sub: string;
  fmt?: (n: number) => string;
}

function stageLine(key: StageKey, stats: Record<string, number> | undefined): StageLine {
  const s = stats ?? {};
  const has = !!stats;
  switch (key) {
    case "ingest":
      return { big: has ? s.records : null, unit: "rows parsed", sub: has ? `${s.files} files · ${bytes(s.bytes)}` : "" };
    case "profile":
      return { big: has ? s.columns : null, unit: "columns profiled", sub: has ? `HLL error ${pct(s.hllMeanError)}` : "" };
    case "pii":
      return { big: has ? s.spans : null, unit: "PII values found", sub: has ? `in ${s.columns} columns` : "" };
    case "map":
      return { big: has ? s.mapped : null, unit: `columns mapped`, sub: has ? `of ${s.columns}` : "" };
    case "normalize":
      return { big: has ? s.phones : null, unit: "phones → E.164", sub: has ? `${int(s.ambiguous)} dates flagged` : "" };
    case "contracts":
      return { big: has ? s.quarantined : null, unit: "quarantined", sub: has ? `${int(s.failures)} warnings` : "" };
    case "resolve":
      return { big: has ? s.candidates : null, unit: "pairs scored", sub: has ? `${pct(s.reduction, 2)} skipped` : "" };
    case "golden":
      return { big: has ? s.golden : null, unit: "customers", sub: has ? `${int(s.multiSource)} multi-source` : "" };
  }
}

function useDone(st: ClientState): number {
  let n = 0;
  for (const s of STAGES) {
    if (!st.stages[s.key]) break;
    n++;
  }
  return n;
}

function TickText({ value, active, x, y, className, fmt = int }: { value: number | null; active: boolean; x: number; y: number; className: string; fmt?: (n: number) => string }) {
  const v = useTicker(value, active);
  return (
    <text x={x} y={y} className={className}>
      {v === null ? "—" : fmt(v)}
    </text>
  );
}

// ------------------------------------------------------------------ desktop board (SVG, fixed coordinates)

const W = 1180;
const H = 404;
const STAGE_X = [242, 344, 446, 548, 650, 752, 854, 956];
const LANE_Y = [168, 248, 328];
const CENTER = 248;
const MERGE_FROM = 776;
const MERGE_TO = 834;

function WideBoard({ st, done, onScreen }: { st: ClientState; done: number; onScreen: boolean }) {
  const reduced = useReducedMotion();
  const g = useRef<SVGGElement>(null);
  const o = st.overview;
  const sources = o?.sources ?? [
    { id: "crm", label: "CRM export", name: "crm_contacts_export.csv", rows: 0, format: "csv" },
    { id: "billing", label: "Billing system", name: "billing_accounts.ndjson", rows: 0, format: "ndjson" },
    { id: "support", label: "Support desk", name: "helpdesk_requesters.csv", rows: 0, format: "csv" },
  ];
  const shown = sources.slice(0, 3);
  const laneY = shown.length === 1 ? [CENTER] : shown.length === 2 ? [198, 298] : LANE_Y;
  const order = shown.map((s) => s.id);
  const totalRows = shown.reduce((a, s) => a + (s.rows || 1), 0);
  const lanes = useMemo<Lane[]>(
    () =>
      shown.map((s, i) => {
        const pts = buildLane(true, laneY[i], CENTER, 182, MERGE_FROM, MERGE_TO, 1000);
        return { color: sourceColor(s.id, order), pts, len: polyline(pts), count: Math.max(10, Math.round((40 * (s.rows || 1)) / (totalRows / shown.length))) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order.join(), laneY.join(), totalRows],
  );
  const records = st.stages.ingest?.stats.records ?? 0;
  const golden = st.stages.golden?.stats.golden ?? 0;
  const survive = records ? golden / records : 0.4;
  useParticles(g, lanes, STAGE_X, done, survive, 860, true, onScreen && !reduced && st.phase !== "error" && st.phase !== "idle");

  const ingest = st.stages.ingest;
  const gold = st.stages.golden;
  const contracts = st.stages.contracts;

  return (
    <svg className="board-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pipeline: three source files pass through eight stages into one golden customer table">
      <defs>
        <linearGradient id="lane-fade" x1="0" x2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.5" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* gate lines */}
      {STAGES.map((s, k) => (
        <g key={s.key} className={`gate ${k < done ? "is-done" : k === done && st.phase === "running" ? "is-active" : ""}`}>
          <line x1={STAGE_X[k]} x2={STAGE_X[k]} y1={112} y2={372} />
          {(k < 6 ? laneY : [CENTER]).map((y) => (
            <circle key={y} cx={STAGE_X[k]} cy={y} r={4.5} />
          ))}
        </g>
      ))}

      {/* lanes */}
      {lanes.map((l, i) => (
        <path key={i} className={`lane ${done > 0 ? "is-live" : ""}`} style={{ color: l.color }} d={"M" + l.pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")} />
      ))}
      <path className={`lane lane-gold ${done >= 8 ? "is-live" : ""}`} d={`M${MERGE_TO},${CENTER}L1000,${CENTER}`} />

      <g ref={g} className="particles" aria-hidden="true" />

      <g className="legend" transform="translate(0,10)">
        <text y={10} className="sc-label">
          SOURCES → STAGES → TABLE
        </text>
        <text y={32}>Each dot is a slice of records,</text>
        <text y={46}>coloured by source. Past Resolve,</text>
        <text y={60}>only the share that becomes</text>
        <text y={74}>golden records goes on.</text>
        {reduced && (
          <text y={96} className="legend-note">
            Motion is off (reduced motion).
          </text>
        )}
      </g>

      {/* stage cards */}
      {STAGES.map((s, k) => {
        const ev = st.stages[s.key];
        const line = stageLine(s.key, ev?.stats);
        const x = STAGE_X[k] - 48;
        const state = ev ? "done" : k === done && (st.phase === "running" || st.phase === "verifying") ? "active" : "wait";
        return (
          <g key={s.key} className={`stage-card is-${state}`} transform={`translate(${x},6)`}>
            <rect width={96} height={100} rx={9} />
            <text x={10} y={20} className="sc-label">
              {s.label.toUpperCase()}
            </text>
            <TickText value={line.big} active={!!ev} x={10} y={47} className="sc-big" />
            <FitText x={10} y={62} max={78} className="sc-unit">
              {line.unit}
            </FitText>
            <FitText x={10} y={76} max={78} className="sc-sub">
              {line.sub}
            </FitText>
            <text x={10} y={92} className="sc-ms">
              {ev ? ms(ev.ms) : state === "active" ? "running…" : ""}
            </text>
          </g>
        );
      })}

      {/* sources */}
      {shown.map((s, i) => (
        <g key={s.id} className="src-card" transform={`translate(0,${laneY[i] - 33})`} style={{ color: sourceColor(s.id, order) }}>
          <rect width={180} height={66} rx={10} />
          <rect width={4} height={42} x={0} y={12} rx={2} className="src-bar" />
          <text x={16} y={22} className="src-label">
            {s.label}
          </text>
          <text x={16} y={38} className="src-file">
            {s.name.length > 25 ? s.name.slice(0, 24) + "…" : s.name}
          </text>
          <TickText value={ingest ? s.rows : null} active={!!ingest} x={16} y={57} className="src-rows" />
          <text x={170} y={57} className="src-fmt" textAnchor="end">
            {s.format.toUpperCase()}
          </text>
        </g>
      ))}

      {/* golden table */}
      <g className={`gold-card ${gold ? "is-done" : ""}`} transform="translate(1000,136)">
        <rect width={180} height={224} rx={12} />
        <text x={16} y={26} className="gc-label">
          GOLDEN TABLE
        </text>
        <TickText value={gold ? gold.stats.golden : null} active={!!gold} x={16} y={64} className="gc-big" />
        <text x={16} y={82} className="gc-unit">
          customers
        </text>
        <text x={16} y={112} className="gc-row">
          from {ingest ? int(ingest.stats.records) : "—"} records
        </text>
        <text x={16} y={132} className="gc-row">
          {gold ? int(gold.stats.multiSource) : "—"} seen in 2+ sources
        </text>
        <text x={16} y={152} className="gc-row">
          {st.overview ? int(st.overview.totals.review) : "—"} pairs for review
        </text>
        <text x={16} y={172} className="gc-row">
          {st.overview ? int(st.overview.totals.tokens) : "—"} values tokenized
        </text>
        <text x={16} y={206} className="gc-ms">
          {st.phase === "ready" ? `${ms(STAGES.reduce((a, s2) => a + (st.stages[s2.key]?.ms ?? 0), 0))} end to end` : ""}
        </text>
      </g>

      {/* quarantine */}
      <g className={`quarantine ${contracts ? "is-done" : ""}`} transform={`translate(${STAGE_X[5] - 48},380)`}>
        <rect width={96} height={22} rx={6} />
        <text x={48} y={15} textAnchor="middle">
          {contracts ? `${int(contracts.stats.quarantined)} held back` : "quarantine"}
        </text>
      </g>
    </svg>
  );
}

// ------------------------------------------------------------------ narrow board (phones and tablets)

// stages map onto the narrow lanes: everything before Resolve happens on the straight part
const NARROW_GATES = [110, 122, 134, 146, 158, 170, 250, 290];

function NarrowBoard({ st, done, onScreen }: { st: ClientState; done: number; onScreen: boolean }) {
  const reduced = useReducedMotion();
  const g = useRef<SVGGElement>(null);
  const o = st.overview;
  const sources = (o?.sources ?? [
    { id: "crm", label: "CRM export", rows: 0 },
    { id: "billing", label: "Billing system", rows: 0 },
    { id: "support", label: "Support desk", rows: 0 },
  ]).slice(0, 3);
  const order = sources.map((s) => s.id);
  const ys = sources.length === 1 ? [60] : sources.length === 2 ? [40, 80] : [24, 60, 96];
  const lanes = useMemo<Lane[]>(
    () =>
      sources.map((s, i) => {
        const pts = buildLane(true, ys[i], 60, 96, 190, 250, 300);
        return { color: sourceColor(s.id, order), pts, len: polyline(pts), count: 14 };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order.join()],
  );
  const records = st.stages.ingest?.stats.records ?? 0;
  const golden = st.stages.golden?.stats.golden ?? 0;
  useParticles(g, lanes, NARROW_GATES, done, records ? golden / records : 0.4, 256, true, onScreen && !reduced && st.phase !== "error" && st.phase !== "idle");
  const ingest = st.stages.ingest;
  const gold = st.stages.golden;
  return (
    <div className="narrow-board">
      <svg viewBox="0 0 360 120" className="board-svg narrow" role="img" aria-label="Three source files merge into one golden customer table">
        {lanes.map((l, i) => (
          <path key={i} className={`lane ${done > 0 ? "is-live" : ""}`} style={{ color: l.color }} d={"M" + l.pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")} />
        ))}
        <g ref={g} className="particles" aria-hidden="true" />
        {sources.map((s, i) => (
          <g key={s.id} style={{ color: sourceColor(s.id, order) }} className="src-mini">
            <circle cx={6} cy={ys[i]} r={4} />
            <text x={16} y={ys[i] - 2}>{sourceShort(s.id, s.label)}</text>
            <TickText value={ingest ? s.rows : null} active={!!ingest} x={16} y={ys[i] + 11} className="src-mini-rows" />
          </g>
        ))}
        <g className={`gold-mini ${gold ? "is-done" : ""}`}>
          <rect x={300} y={34} width={58} height={52} rx={8} />
          <TickText value={gold ? gold.stats.golden : null} active={!!gold} x={329} y={60} className="gm-big" />
          <text x={329} y={76} textAnchor="middle" className="gm-unit">
            customers
          </text>
        </g>
      </svg>
      <ol className="stage-list">
        {STAGES.map((s, k) => {
          const ev = st.stages[s.key];
          const line = stageLine(s.key, ev?.stats);
          const state = ev ? "done" : k === done && st.phase === "running" ? "active" : "wait";
          return (
            <li key={s.key} className={`stage-row is-${state}`}>
              <span className="sr-label">{s.label}</span>
              <span className="sr-big">{line.big === null ? "—" : int(line.big)}</span>
              <span className="sr-unit">{line.unit}</span>
              <span className="sr-ms">{ev ? ms(ev.ms) : ""}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------ timing strip

/** SVG text that is squeezed to `max` user units when the font in use renders it wider. */
function FitText({ x, y, max, className, children }: { x: number; y: number; max: number; className: string; children: string }) {
  const ref = useRef<SVGTextElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.removeAttribute("textLength");
    el.removeAttribute("lengthAdjust");
    if (children && el.getComputedTextLength() > max) {
      el.setAttribute("textLength", String(max));
      el.setAttribute("lengthAdjust", "spacingAndGlyphs");
    }
  }, [children, max]);
  return (
    <text ref={ref} x={x} y={y} className={className}>
      {children}
    </text>
  );
}

export function TimingStrip({ st, nodeMedian, nodeStages }: { st: ClientState; nodeMedian: number; nodeStages: Record<string, number> }) {
  const total = STAGES.reduce((a, s) => a + (st.stages[s.key]?.ms ?? 0), 0);
  const ready = st.phase === "ready";
  const records = st.stages.ingest?.stats.records ?? 0;
  return (
    <div className="timing" aria-live="polite">
      <div className="timing-head">
        <span className="label">Stage timings in this browser</span>
        <span className="timing-total">
          {ready ? (
            <>
              <b>{ms(total)}</b> for {int(records)} records · {int((records / total) * 1000)} records/s
              {st.overview?.generateMs != null && <span className="muted"> · data generated from the seed in {ms(st.overview.generateMs)}</span>}
            </>
          ) : (
            <span className="muted">{st.phase === "generating" ? "generating the synthetic exports from the seed…" : st.phase === "verifying" ? "checking SHA-256 against the build manifest…" : st.phase === "running" ? "running…" : st.phase === "error" ? st.detail : "starting…"}</span>
          )}
        </span>
      </div>
      <div className="timing-bar">
        {STAGES.map((s, k) => {
          const ev = st.stages[s.key];
          const w = ev && total ? (ev.ms / total) * 100 : 100 / STAGES.length;
          // A stage too short to hold its name keeps room for its time; the name is in the tooltip.
          const tiny = ready && w < 7.5;
          return (
            <div key={s.key} className={`tb-seg seg-${k} ${ev ? "is-done" : ""} ${tiny ? "is-tiny" : ""}`} style={{ flexGrow: ready ? w : 1, minWidth: tiny ? 46 : undefined }} title={ev ? `${s.label}: ${ms(ev.ms)} (Node median ${ms(nodeStages[s.key] ?? 0)})` : s.label}>
              {!tiny && <span>{s.label}</span>}
              <b>{ev ? ms(ev.ms) : ""}</b>
            </div>
          );
        })}
      </div>
      <p className="timing-note muted">
        For comparison, <code>npm run eval</code> measured a median of {ms(nodeMedian)} in Node over five runs of the same data.
      </p>
    </div>
  );
}

export default function FlowBoard() {
  const st = useClient();
  const narrow = useMedia("(max-width: 900px)");
  const ref = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(ref);
  const done = useDone(st);
  return (
    <div className="board" ref={ref}>
      {narrow ? <NarrowBoard st={st} done={done} onScreen={onScreen} /> : <WideBoard st={st} done={done} onScreen={onScreen} />}
    </div>
  );
}
