import { memo } from "react";
import report from "../generated/eval.json";
import { DEFAULT_SAMPLER } from "../core/sampler";
import { PAGE_RULES, budgetSpent } from "../core/slo";
import { SERVICES } from "../core/topology";
import { compact, fmt, pct } from "./format";

const STAGES = [
  {
    n: "Simulate",
    body: `${SERVICES.length} nodes: ${SERVICES.filter((s) => s.instrumented).length} instrumented services, a database, a cache and a card API. Worker pools, lognormal service times, timeouts, retries, a Kafka-style consumer and a daily traffic curve. Spans come out as they end, shaped like OpenTelemetry's.`,
    file: "core/sim.ts",
  },
  {
    n: "Assemble",
    body: "Spans arrive out of order. A trace is held until its root has ended plus a 5 s decision wait, then built into a tree once. Spans that turn up later become fragments that follow their trace's decision.",
    file: "core/pipeline.ts",
  },
  {
    n: "Measure",
    body: "Every trace, before sampling, feeds RED metrics per service and per call: counts, errors that start at each node, self time, and DDSketch percentiles, closed once a simulated minute.",
    file: "core/sketch.ts · core/tracetree.ts",
  },
  {
    n: "Sample",
    body: `Keep every trace with an error, every trace slower than its flow's rolling p99, and ${DEFAULT_SAMPLER.ratePerSec} ordinary traces per second through a token bucket.`,
    file: "core/sampler.ts",
  },
  {
    n: "Detect",
    body: "Per flow and minute: EWMA forecast, MAD-scaled z-score and CUSUM on log p95 and on the error ratio, plus SLO burn rates over two window pairs. Alerts open an incident.",
    file: "core/anomaly.ts · core/slo.ts",
  },
  {
    n: "Rank",
    body: "Score each node from its own anomaly, a blame walk over the call graph, and how much of the added critical-path time it accounts for, with the evidence kept for the card.",
    file: "core/rca.ts · core/pagerank.ts",
  },
];

export default memo(function Architecture() {
  const s = report.sampling.clean;
  const m = report.rca.methods as Record<string, { top1: number }>;
  const casc = report.rca.cascade as { n: number; methods: Record<string, { top1: number }> };
  const sk = report.sketch;
  const fast = PAGE_RULES[0];
  const slow = PAGE_RULES[1];

  const decisions = [
    {
      q: "Why sample at the tail?",
      a: "Head sampling decides when a request starts, before anyone knows how it ends, so keeping 5% of traces keeps about 5% of the failures. Deciding after the trace is complete costs a buffer of every span for the decision wait, and a rule for spans that arrive late, but it lets the sampler keep exactly the traces worth reading. Metrics are computed from every trace before the decision, so the dashboards stay exact while storage shrinks.",
      proof: `Fault-free runs: ${pct(s.retention)} of traces kept, ${pct(s.errorRetention, 0)} of error traces (${fmt(s.errorKept)} of ${fmt(s.errorTraces)}).`,
    },
    {
      q: "Why exclusive time?",
      a: "Inclusive latency rises in every caller of a slow service, so the slowest service on a dashboard is usually the gateway. Self time is a span's duration minus the union of its children's intervals. A client span's time is charged to the service it waits on, so a database, cache or third-party API that emits no spans still gets its own row.",
      proof: `Naming the service with the highest p99: ${pct(m.highestP99.top1)} top-1. Tracewise: ${pct(m.tracewise.top1)}.`,
    },
    {
      q: "Why a sketch?",
      a: "Exact percentiles need every value, per flow, per node, per minute. A DDSketch stores counts in logarithmic buckets whose width bounds the relative error, merges exactly, and supports the subtraction a rolling window needs. A minute's sketch is a few hundred counters, however much traffic went into it.",
      proof: `Against exact percentiles over ${fmt(sk.windows)} flow-minutes: mean error ${pct(sk.p99.mean)}, worst ${pct(Math.max(sk.p50.max, sk.p95.max, sk.p99.max))}, inside the ${pct(sk.alpha, 0)} bound.`,
    },
    {
      q: "Why walk the call graph?",
      a: "When a dependency slows down, its callers hold their workers longer, their queues grow, and they look anomalous too. The blame walk starts on anomalous nodes and moves from caller to callee along the calls that got slower or failed more, against the direction faults travel, so it settles on the deepest anomalous dependency. Edges are weighted by the call's own change, not the callee's, so a healthy service in the middle still passes blame through.",
      proof: `On the ${casc.n} cascades: ${pct(casc.methods.tracewise.top1, 0)} top-1, against ${pct(casc.methods.anomalyOnly.top1)} from anomaly scores alone and ${pct(casc.methods.p99Jump.top1)} from the biggest p99 jump.`,
    },
    {
      q: "Why these detectors?",
      a: `Per-minute latency is noisy and heavy-tailed. The median absolute deviation ignores the odd spike, CUSUM adds up a small shift that persists and dates where it began, and the baseline stops learning while an alarm is on, so a long fault does not become normal. The SLO alerts follow the SRE workbook: page when the burn rate is over ${fast.factor}× for both ${fast.longMin / 60} h and ${fast.shortMin} min (${pct(budgetSpent(fast.factor, fast.longMin), 0)} of a 30-day budget) or ${slow.factor}× for ${slow.longMin / 60} h and ${slow.shortMin} min (${pct(budgetSpent(slow.factor, slow.longMin), 0)}).`,
      proof: `${fmt(report.falseAlarms.alerts)} false alarms in ${fmt(report.falseAlarms.simHours)} fault-free simulated hours; median detection ${report.detection.latencyMin.median.toFixed(1)} min.`,
    },
    {
      q: "Why a simulator, and what it leaves out",
      a: "Scoring a root-cause method needs incidents whose cause is known, and production incidents rarely come labelled. The simulator is cleaner than production: one fault at a time, synchronised clocks, every service instrumented the same way. Real traces come in through the OTLP upload, where the map, metrics and waterfalls work but there is no ground truth to score against.",
    },
  ];

  return (
    <section className="section arch" id="architecture">
      <div className="section-head">
        <p className="eyebrow">Architecture</p>
        <h2>One pipeline, in a worker, from span to suspect</h2>
        <p className="lede">
          The simulator and the pipeline run in a Web Worker and post the page a snapshot ten times a second, a summary per simulated minute and incident updates. The page draws them with Canvas
          2D and SVG; React only lays out the panels. The evaluation runs the same modules under Node across worker threads: {compact(report.throughput.ingestSpansPerSec)} spans per second
          through assembly, metrics and sampling on one thread.
        </p>
      </div>
      <ol className="flow">
        {STAGES.map((st, i) => (
          <li key={st.n}>
            <div className="flow-n mono">{String(i + 1).padStart(2, "0")}</div>
            <div className="flow-name">{st.n}</div>
            <p>{st.body}</p>
            <code>{st.file}</code>
          </li>
        ))}
      </ol>
      <div className="decisions">
        {decisions.map((d) => (
          <div key={d.q} className="decision">
            <h3>{d.q}</h3>
            <p>{d.a}</p>
            {d.proof && <p className="proof mono">{d.proof}</p>}
          </div>
        ))}
      </div>
    </section>
  );
});
