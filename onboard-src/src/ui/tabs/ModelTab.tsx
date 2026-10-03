import { useClient, useView } from "../../client";
import { int, pct } from "../../format";
import type { ModelView } from "../../worker/protocol";
import { logit } from "../MatchGraph";

function Histogram({ h, match, review }: { h: ModelView["histogram"]; match: number; review: number }) {
  const W = 760;
  const H = 190;
  const pad = { l: 40, r: 10, t: 12, b: 30 };
  const n = h.bins.length;
  const max = Math.max(...h.bins);
  const x = (w: number) => pad.l + ((w - h.from) / (n * h.width)) * (W - pad.l - pad.r);
  const y = (c: number) => H - pad.b - (Math.sqrt(c) / Math.sqrt(max || 1)) * (H - pad.t - pad.b);
  const bw = (W - pad.l - pad.r) / n;
  const ticks: number[] = [];
  for (let t = Math.ceil(h.from / 10) * 10; t <= h.from + n * h.width; t += 10) ticks.push(t);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hist" role="img" aria-label="Distribution of match weights over all candidate pairs">
      {h.bins.map((c, i) => (
        <rect key={i} x={pad.l + i * bw + 0.5} width={Math.max(1, bw - 1)} y={y(c)} height={H - pad.b - y(c)} className="hb" />
      ))}
      {h.truthMatch?.map((c, i) => (c ? <rect key={`t${i}`} x={pad.l + i * bw + 0.5} width={Math.max(1, bw - 1)} y={y(c)} height={H - pad.b - y(c)} className="hb-true" /> : null))}
      {[
        { w: logit(review), label: `review ${review}`, anchor: "end" as const, dx: -4 },
        { w: logit(match), label: `match ${match}`, anchor: "start" as const, dx: 4 },
      ].map((t) => (
        <g key={t.label} transform={`translate(${x(t.w)},0)`}>
          <line y1={pad.t} y2={H - pad.b} className="th-line" />
          <text y={pad.t + 8} x={t.dx} textAnchor={t.anchor} className="th-text">
            {t.label}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={H - 10} textAnchor="middle" className="axis-text">
          {t > 0 ? `+${t}` : t}
        </text>
      ))}
      <text x={pad.l - 6} y={pad.t + 6} textAnchor="end" className="axis-text">
        {int(max)}
      </text>
    </svg>
  );
}

export default function ModelTab() {
  const st = useClient();
  const v = useView<ModelView>({ type: "model" });
  if (!v.data) return <div className="spot-skeleton">Loading the model…</div>;
  const d = v.data;
  const th = st.overview?.thresholds ?? { match: 0.95, review: 0.6 };
  // the probability thresholds as match weights (bits); the prior is already inside each pair's weight
  // distance from each iteration's log-likelihood to the final one, on a log scale: a straight fall means steady convergence
  const ll = d.em.logLik;
  const final = ll[ll.length - 1];
  const gap = ll.map((v2) => Math.log10(Math.max(final - v2, 1e-3)));
  const gMin = Math.min(...gap);
  const gMax = Math.max(...gap);
  return (
    <div className="tab-body">
      <p className="tab-intro">
        Fellegi-Sunter: each comparator puts a pair at one agreement level, and each level carries a weight log₂(m/u), where m is how often true matches land there and u how often random pairs do. Nobody labelled anything: m comes from expectation-maximisation over the {int(d.blocking.candidates)} candidate pairs ({d.em.iterations} iterations, {d.em.converged ? "converged" : "not converged"}, {int(d.em.patterns)} distinct comparison patterns), u from {int(d.em.uSample)} random pairs.
      </p>
      <div className="model-grid">
        <div className="card wide">
          <h4 className="label">Match weight of every candidate pair</h4>
          <Histogram h={d.histogram} match={th.match} review={th.review} />
          <p className="muted small">
            Bars use a square-root scale. {d.histogram.truthMatch ? "The brighter part of each bar is pairs the generator made the same customer. " : ""}Lines mark the thresholds; pairs between them go to review. {int(d.vetoed)} pairs are held by a guard rule and {int(d.tfAdjusted)} had a weight lowered for agreeing on a common value.
          </p>
        </div>
        <div className="card">
          <h4 className="label">EM convergence</h4>
          <svg viewBox="0 0 300 100" className="spark" role="img" aria-label="Distance to the final log-likelihood by EM iteration, log scale">
            <polyline points={gap.map((g, i) => `${10 + (i / Math.max(1, gap.length - 1)) * 280},${10 + (1 - (g - gMin) / Math.max(1e-9, gMax - gMin)) * 80}`).join(" ")} />
            <text x={10} y={98} className="axis-text">
              iteration 1
            </text>
            <text x={290} y={98} textAnchor="end" className="axis-text">
              {ll.length}
            </text>
          </svg>
          <p className="muted small">
            Distance from each iteration&rsquo;s log-likelihood to the final one, log scale; the likelihood rises every iteration, as EM guarantees. EM calls {pct(d.em.blockedLambda)} of the candidates matches; the prior over all pairs is one in {int(1 / d.em.lambda)}.
          </p>
        </div>
      </div>
      <h4 className="label">Comparators, levels and weights</h4>
      <div className="scroll-x" tabIndex={0} role="region" aria-label="Comparator weights">
        <table className="data weights-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Level</th>
              <th className="num">m</th>
              <th className="num">u</th>
              <th className="num">weight (bits)</th>
            </tr>
          </thead>
          <tbody>
            {d.comparators.flatMap((c) =>
              c.levels.map((l, i) => (
                <tr key={`${c.key}:${i}`} className={i === 0 ? "first" : ""}>
                  <td className="strong">{i === 0 ? c.label : ""}</td>
                  <td>{l}</td>
                  <td className="num mono">{c.m[i].toFixed(3)}</td>
                  <td className="num mono">{c.u[i] < 0.001 ? c.u[i].toExponential(1) : c.u[i].toFixed(3)}</td>
                  <td className={`num mono ${c.weights[i] >= 0 ? "pos" : "neg"}`}>{(c.weights[i] >= 0 ? "+" : "") + c.weights[i].toFixed(1)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <h4 className="label">Blocking</h4>
      <p className="muted small">
        {int(d.blocking.totalPairs)} possible pairs; {int(d.blocking.candidates)} share at least one key, so {pct(d.blocking.reductionRatio, 2)} are never compared. Blocks over {d.blocking.maxBlock} records are skipped and counted.
      </p>
      <div className="scroll-x" tabIndex={0} role="region" aria-label="Blocking rules">
        <table className="data">
          <thead>
            <tr>
              <th>Key</th>
              <th>What it groups</th>
              <th className="num">Blocks</th>
              <th className="num">Largest</th>
              <th className="num">Pairs</th>
              <th className="num">New pairs</th>
              <th className="num">Skipped</th>
            </tr>
          </thead>
          <tbody>
            {d.blocking.rules.map((r) => (
              <tr key={r.name}>
                <td className="strong">{r.name}</td>
                <td className="muted">{r.describe}</td>
                <td className="num mono">{int(r.blocks)}</td>
                <td className="num mono">{int(r.largest)}</td>
                <td className="num mono">{int(r.pairs)}</td>
                <td className="num mono">{int(r.added)}</td>
                <td className="num mono">{int(r.skippedBlocks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
