import { REGIONS } from "@relay/core";
import type { Knobs, LiveEngine } from "../live/engine";
import { fmtUsd } from "../data";

const PRESETS: { id: string; label: string; knobs: Partial<Knobs> }[] = [
  { id: "steady", label: "Steady", knobs: { rps: 12, failRate: 0.04, bothRegions: false, tail: 0.25, running: true } },
  { id: "outage", label: `${REGIONS[0]} outage`, knobs: { failRate: 1, bothRegions: false, running: true } },
  { id: "both", label: "Both regions failing", knobs: { failRate: 0.3, bothRegions: true, running: true } },
  { id: "tail", label: "Slow tail", knobs: { failRate: 0.02, bothRegions: false, tail: 1, running: true } },
  { id: "spike", label: "Load spike", knobs: { rps: 40, running: true } },
];

function same(k: Knobs, p: Partial<Knobs>): boolean {
  return Object.entries(p).every(([key, v]) => k[key as keyof Knobs] === v);
}

export function Controls({ engine }: { engine: LiveEngine }) {
  const k = engine.knobs;
  return (
    <div className="panel controls">
      <h2 className="panel-title">
        Traffic generator <span className="hint">3 tenants</span>
      </h2>
      <div className="slider">
        <label htmlFor="k-rps">Load</label>
        <output htmlFor="k-rps">{k.rps} req/s</output>
        <input id="k-rps" type="range" min={0} max={40} step={1} value={k.rps} onChange={(e) => engine.setKnobs({ rps: Number(e.target.value) })} />
      </div>
      <div className="slider">
        <label htmlFor="k-fail">Injected failures on {REGIONS[0]}</label>
        <output htmlFor="k-fail">{Math.round(k.failRate * 100)}%</output>
        <input id="k-fail" type="range" min={0} max={100} step={1} value={Math.round(k.failRate * 100)} onChange={(e) => engine.setKnobs({ failRate: Number(e.target.value) / 100 })} />
        <small>500s, 429s with retry-after, 529s, stalls after accept, and streams dropped mid-answer</small>
      </div>
      <label className="check">
        <input type="checkbox" checked={k.bothRegions} onChange={(e) => engine.setKnobs({ bothRegions: e.target.checked })} />
        Inject them into {REGIONS[1]} too
      </label>
      <div className="slider">
        <label htmlFor="k-tail">Latency tail</label>
        <output htmlFor="k-tail">{Math.round(k.tail * 100)}%</output>
        <input id="k-tail" type="range" min={0} max={100} step={5} value={Math.round(k.tail * 100)} onChange={(e) => engine.setKnobs({ tail: Number(e.target.value) / 100 })} />
        <small>how often and how far slow first tokens reach (Pareto); hedging answers this</small>
      </div>
      <div className="presets" role="group" aria-label="Scenarios">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className="btn small" aria-pressed={same(k, p.knobs)} onClick={() => engine.setKnobs(p.knobs)}>
            {p.label}
          </button>
        ))}
        <button type="button" className="btn small" onClick={() => engine.setKnobs({ running: !k.running })}>
          {k.running ? "Pause" : "Resume"}
        </button>
      </div>
    </div>
  );
}

export function Totals({ engine }: { engine: LiveEngine }) {
  const t = engine.totals;
  const served = t.ok + t.errors + t.cut;
  const rows: [string, string][] = [
    ["Requests", t.requests.toLocaleString("en-US")],
    ["Served OK", served ? `${((t.ok / served) * 100).toFixed(1)}%` : "–"],
    ["Cache hits", t.cacheHits.toLocaleString("en-US")],
    ["Retries + fallbacks", t.retries.toLocaleString("en-US")],
    ["Hedged", t.hedges.toLocaleString("en-US")],
    ["Blocked by screen", t.blocked.toLocaleString("en-US")],
    ["PII redacted", t.redactions.toLocaleString("en-US")],
    ["Turned away", t.rejected.toLocaleString("en-US")],
    ["Spend", fmtUsd(t.costUsd)],
    ["Saved by cache", fmtUsd(t.savedUsd)],
  ];
  return (
    <div className="panel controls">
      <h2 className="panel-title">
        Since page load <span className="hint">this tab</span>
      </h2>
      <dl className="totals">
        {rows.map(([a, b]) => (
          <div key={a}>
            <dt>{a}</dt>
            <dd>{b}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
