import { memo } from "react";
import report from "../generated/eval.json";
import { FAULT_KINDS } from "../core/sim";
import { SERVICES } from "../core/topology";
import { compact, fmt, pct } from "./format";
import { label } from "./ServiceMap";
import { C } from "./theme";
import { useWidth } from "./Timeline";

type Methods = Record<string, { top1: number; top3: number }>;
const R = report as typeof report & { rca: { methods: Methods; cascade: { n: number; methods: Methods } } };

const METHOD_ROWS: { key: string; name: string; note: string; group: "ours" | "baseline" | "ablation" }[] = [
  { key: "tracewise", name: "Tracewise", note: "self-time and own-error anomaly, blame walk, critical-path diff", group: "ours" },
  { key: "p99Jump", name: "Biggest p99 jump", note: "the service whose p99 rose most", group: "baseline" },
  { key: "alerting", name: "Service that alerted", note: "nearest the alert first, then its callees", group: "baseline" },
  { key: "highestP99", name: "Highest p99", note: "the slowest service on the dashboard", group: "baseline" },
  { key: "anomalyOnly", name: "Anomaly only", note: "no graph walk, no critical path", group: "ablation" },
  { key: "selfOnlyWalk", name: "Walk on node anomaly", note: "edges weighted by the callee, not the call", group: "ablation" },
  { key: "noCriticalPath", name: "No critical path", note: "anomaly and walk only", group: "ablation" },
  { key: "pagerankOnly", name: "Walk only", note: "stationary blame alone", group: "ablation" },
];

const KIND_NAME: Record<string, string> = { latency: "Added latency", errors: "Error rate", capacity: "Lost capacity", timeout: "Dependency timeout", deploy: "Bad deploy" };

export default memo(function Numbers() {
  const d = R.detection;
  const m = R.rca.methods;
  const fa = R.falseAlarms;
  const s = R.sampling.clean;
  const sk = R.sketch;
  const worstSketch = Math.max(sk.p50.max, sk.p95.max, sk.p99.max);
  const n = R.rca.n;

  const cards = [
    { v: pct(m.tracewise.top1), k: "root cause ranked first", sub: `over ${n} detected faults on a held-out seed` },
    { v: pct(m.tracewise.top3, 0), k: "in the top three", sub: `and ${pct(R.rca.cascade.methods.tracewise.top1, 0)} first on the ${R.rca.cascade.n} cascading faults` },
    { v: `${d.latencyMin.median.toFixed(1)} min`, k: "median time to detect", sub: `p90 ${d.latencyMin.p90.toFixed(1)} min, in simulated time` },
    { v: `${d.visibleDetected}/${d.visible}`, k: "user-visible faults detected", sub: `${d.detected}/${d.faults} of all faults, small ones included` },
    { v: fmt(fa.alerts), k: "false alarms", sub: `in ${fmt(fa.simHours)} fault-free hours, and ${fmt(fa.preInjection.alerts)} in ${fmt(fa.preInjection.simHours)} h before injections` },
    { v: pct(s.retention), k: "of traces kept", sub: `with ${pct(s.errorRetention, 0)} of error traces (${fmt(s.errorKept)}/${fmt(s.errorTraces)})` },
    { v: `≤ ${pct(worstSketch)}`, k: "sketch error at p50, p95, p99", sub: `mean ${pct(sk.p95.mean)} over ${fmt(sk.windows)} flow-minutes` },
    { v: `${compact(R.throughput.ingestSpansPerSec)}/s`, k: "spans ingested, one thread", sub: `assembly, RED metrics and sampling; Node ${R.machine.node}` },
  ];

  return (
    <section className="section numbers" id="numbers">
      <div className="section-head">
        <p className="eyebrow">Measured, not guessed</p>
        <h2>Every number here comes from the evaluation script</h2>
        <p className="lede">
          <code>npm run eval</code> runs {fmt(R.config.faultScenarios)} seeded fault scenarios and {R.config.cleanRuns} fault-free runs of {R.config.cleanHours} simulated hours through the same pipeline
          this page runs, {compact(R.config.spansSimulated)} spans in all. Each scenario picks a service, a fault type, a size and a time of day at random, warms up for an hour, injects
          the fault and watches for {R.config.windowMin} minutes. The method was developed on seed 1; these results are from seed {R.config.seed}, which was held out.
        </p>
      </div>

      <dl className="big-numbers">
        {cards.map((c) => (
          <div key={c.k}>
            <dt>{c.v}</dt>
            <dd>
              {c.k}
              <span>{c.sub}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="num-grid">
        <div className="card">
          <div className="card-head">
            <h3>Root cause, against the obvious alternatives</h3>
          </div>
          <div className="table-scroll">
          <table className="methods">
            <thead>
              <tr>
                <th>Method</th>
                <th className="r">Top 1</th>
                <th className="r">Top 3</th>
                <th className="r" title={`${R.rca.cascade.n} faults where other services also looked anomalous`}>
                  Cascades
                </th>
              </tr>
            </thead>
            <tbody>
              {METHOD_ROWS.map((row, i) => {
                const mm = m[row.key];
                const c = R.rca.cascade.methods[row.key];
                const groupStart = i === 0 || METHOD_ROWS[i - 1].group !== row.group;
                return (
                  <tr key={row.key} className={`${row.group} ${groupStart && i ? "group-start" : ""}`}>
                    <td>
                      <b>{row.name}</b>
                      <span>{row.note}</span>
                    </td>
                    <td className="r mono">
                      <Bar v={mm.top1} ours={row.group === "ours"} />
                    </td>
                    <td className="r mono">{pct(mm.top3, 0)}</td>
                    <td className="r mono">{pct(c.top1, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <p className="small muted">
            Top 1 and top 3: the injected service's position in each ranking at the first alert. Cascades: the {R.rca.cascade.n} faults where at least one other service also looked
            anomalous, which is where dashboards mislead. The dashboard heuristics rank the same nodes from the same minute summaries.
          </p>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>By fault type</h3>
          </div>
          <div className="table-scroll">
          <table className="kinds">
            <thead>
              <tr>
                <th>Fault</th>
                <th className="r">Runs</th>
                <th className="r">Visible, caught</th>
                <th className="r">Median</th>
                <th className="r">Top 1</th>
              </tr>
            </thead>
            <tbody>
              {FAULT_KINDS.map((k) => {
                const b = (R.rca.byKind as Record<string, { n: number; detected: number; visible: number; visibleDetected: number; latencyMedianMin: number; rca: Methods }>)[k];
                return (
                  <tr key={k}>
                    <td>{KIND_NAME[k]}</td>
                    <td className="r mono">{b.n}</td>
                    <td className="r mono">
                      {b.visibleDetected}/{b.visible}
                    </td>
                    <td className="r mono">{b.latencyMedianMin.toFixed(1)} min</td>
                    <td className="r mono">{pct(b.rca.tracewise.top1, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <p className="small muted">
            A fault is user-visible if, in its first five minutes, some flow's p95 rose by 25% or its error rate by half a point: the same bars the alerts use.{" "}
            {missedNote()}
          </p>
          <Strip />
        </div>
      </div>
    </section>
  );
});

function missedNote(): string {
  const d = R.detection;
  const rows = R.scenarios as (number | null)[][];
  const missed = rows.filter((r) => r[3] === null);
  if (!missed.length) return "Every fault was caught.";
  const byKind = new Map<number, number>();
  for (const r of missed) byKind.set(r[0] as number, (byKind.get(r[0] as number) ?? 0) + 1);
  const [k, c] = [...byKind].sort((a, b) => b[1] - a[1])[0];
  const below = d.visible === d.visibleDetected ? "all below that bar" : `${d.visible - d.visibleDetected} of them visible`;
  const why: Record<string, string> = { capacity: " on services with workers to spare", latency: " of a few milliseconds" };
  return `The ${missed.length} faults never caught were ${below}; ${c} of them were ${KIND_NAME[FAULT_KINDS[k]].toLowerCase()}${why[FAULT_KINDS[k]] ?? ""}.`;
}

function Bar({ v, ours }: { v: number; ours: boolean }) {
  return (
    <span className="mbar">
      <span className="mbar-track" aria-hidden>
        <span style={{ width: `${v * 100}%`, background: ours ? C.accent : C.line2 }} />
      </span>
      {pct(v, 1)}
    </span>
  );
}

/** Every scenario: time to detect by fault type, coloured by where Tracewise ranked the injected service. */
function Strip() {
  const [ref, width] = useWidth<HTMLDivElement>();
  const rows = R.scenarios as [number, number, number, number | null, number | null, number | null, number][];
  const W = Math.max(260, width);
  const padL = 92;
  const maxMin = 8;
  const missW = 54;
  const plotR = W - missW - 14;
  const rowH = 24;
  const H = FAULT_KINDS.length * rowH + 30;
  const x = (mn: number) => padL + (Math.min(mn, maxMin) / maxMin) * (plotR - padL);
  const missSeen = new Map<number, number>();
  return (
    <div className="strip" ref={ref}>
      <div className="small muted strip-title">
        Each dot is one scenario: time to first alert.{" "}
        <span className="lgi">
          <i className="dot r1" /> ranked first
        </span>{" "}
        <span className="lgi">
          <i className="dot r3" /> ranked 2nd or 3rd
        </span>{" "}
        <span className="lgi">
          <i className="dot miss" /> not detected
        </span>
      </div>
      {width > 0 && (
        <svg width={W} height={H} role="img" aria-label={`Detection time of each of the ${rows.length} scenarios by fault type.`}>
          {FAULT_KINDS.map((k, i) => (
            <g key={k}>
              <text x={0} y={i * rowH + 15} className="tl-axis">
                {KIND_NAME[k]}
              </text>
              <line x1={padL} x2={plotR} y1={i * rowH + 11} y2={i * rowH + 11} stroke={C.line} />
            </g>
          ))}
          <line x1={W - missW} x2={W - missW} y1={0} y2={H - 18} stroke={C.line} />
          {rows.map((r, j) => {
            const [kind, svc, mag, det, rank, , vis] = r;
            const name = `${label(SERVICES[svc]?.id ?? "?")} ${FAULT_KINDS[kind]} ${mag}`;
            if (det === null) {
              const k = missSeen.get(kind) ?? 0;
              missSeen.set(kind, k + 1);
              const cx = W - missW + 8 + (k % 8) * 5.6;
              const cy = kind * rowH + 7 + Math.floor(k / 8) * 5;
              return (
                <circle key={j} cx={cx} cy={cy} r={2.2} fill="none" stroke={vis ? C.bad : C.muted} strokeWidth={1}>
                  <title>{`${name}: not detected${vis ? "" : " (below the visibility bar)"}`}</title>
                </circle>
              );
            }
            const jitter = (((j * 7919) % 13) / 13 - 0.5) * 9;
            const y = kind * rowH + 11 + jitter;
            return (
              <circle key={j} cx={x(det)} cy={y} r={2.8} fill={rank === 1 ? C.accent : C.warn} opacity={0.85}>
                <title>{`${name}: detected after ${det} min, ranked #${rank}`}</title>
              </circle>
            );
          })}
          {[0, 2, 4, 6, 8].map((t) => (
            <text key={t} x={x(t)} y={H - 4} textAnchor="middle" className="tl-axis">
              {t === maxMin ? "8+ min" : `${t}`}
            </text>
          ))}
          <text x={W - missW / 2} y={H - 4} textAnchor="middle" className="tl-axis">
            missed
          </text>
        </svg>
      )}
    </div>
  );
}
