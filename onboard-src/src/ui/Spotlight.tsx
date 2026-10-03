// One customer, end to end: the source records as delivered, the match
// graph that joined them, and the golden record with every value traced back
// to the cell it came from. Hover a golden field to light up its source cells.

import { useEffect, useMemo, useState } from "react";
import { client, useClient, useView } from "../client";
import type { GoldenKey, SurvivorRule } from "../core/golden";
import { FIELD } from "../core/schema";
import { bits, int, prob as fmtProb } from "../format";
import { sourceColor, sourceShort } from "../palette";
import type { ClusterView, EdgeView, FeaturedCluster, GoldenFieldView, RecordView } from "../worker/protocol";
import MatchGraph, { edgeStatusLabel } from "./MatchGraph";
import { Segments } from "./Segments";

const RULE_TEXT: Record<SurvivorRule, string> = {
  most_frequent: "most frequent",
  most_recent: "most recent",
  most_complete: "most complete record",
  source_priority: "source priority",
  earliest: "earliest",
};

function RecordCard({ r, order, lit, outside, quarantined }: { r: RecordView; order: string[]; lit: Set<string>; outside: boolean; quarantined: boolean }) {
  const [more, setMore] = useState(false);
  const mapped = r.cells.filter((c) => c.field && c.raw.trim());
  const hidden = r.cells.filter((c) => !c.field && c.raw.trim());
  const any = mapped.some((c) => lit.has(`${r.i}:${c.column}`));
  return (
    <article className={`rec ${outside ? "is-outside" : ""} ${any ? "is-lit" : ""}`} style={{ color: sourceColor(r.source, order) }}>
      <header>
        <span className="src-chip">{sourceShort(r.source)}</span>
        <span className="rec-where mono">
          {r.source === "billing" ? "line" : "row"} {int(r.line)}
        </span>
        {outside && <span className="rec-note">another customer</span>}
        {quarantined && <span className="rec-note bad">quarantined</span>}
      </header>
      <dl>
        {mapped.map((c) => (
          <div key={c.index} className={`cell ${lit.has(`${r.i}:${c.column}`) ? "is-lit" : ""}`} title={c.field ? `mapped to ${FIELD[c.field].label}` : undefined}>
            <dt>{c.column}</dt>
            <dd className="mono">{c.segments ? <Segments segs={c.segments} /> : c.raw}</dd>
          </div>
        ))}
        {more &&
          hidden.map((c) => (
            <div key={c.index} className="cell is-unmapped">
              <dt>{c.column}</dt>
              <dd className="mono">{c.segments ? <Segments segs={c.segments} /> : c.raw}</dd>
            </div>
          ))}
      </dl>
      {hidden.length > 0 && (
        <button className="linkish" onClick={() => setMore(!more)}>
          {more ? "hide unmapped columns" : `+${hidden.length} unmapped column${hidden.length > 1 ? "s" : ""}`}
        </button>
      )}
    </article>
  );
}

function GoldenCard({ view, order, onHover, onRule }: { view: ClusterView; order: string[]; onHover: (f: GoldenFieldView | null) => void; onRule: (k: GoldenKey, r: SurvivorRule) => void }) {
  return (
    <div className="golden-card">
      <header>
        <span className="label">Golden record</span>
        <span className="mono gc-id">{view.golden.id}</span>
        <span className="gc-src">
          {view.golden.sources.map((s) => (
            <i key={s} style={{ background: sourceColor(s, order) }} title={sourceShort(s)} />
          ))}
          {view.golden.members.length} records
        </span>
      </header>
      <ul>
        {view.golden.fields.map((f) => {
          const src = f.lineage[0]?.source;
          return (
            <li key={f.key} tabIndex={0} onMouseEnter={() => onHover(f)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(f)} onBlur={() => onHover(null)} className={f.value ? "" : "is-empty"}>
              <span className="gf-label">{f.label}</span>
              <span className="gf-value mono">
                {src && <i className="dot" style={{ background: sourceColor(src, order) }} />}
                {f.value ?? "—"}
              </span>
              <span className="gf-meta">
                <select aria-label={`Survivorship rule for ${f.label}`} value={f.rule} onChange={(e) => onRule(f.key, e.target.value as SurvivorRule)}>
                  {f.rules.map((r) => (
                    <option key={r} value={r}>
                      {RULE_TEXT[r]}
                    </option>
                  ))}
                </select>
                {f.candidates > 0 && (
                  <span className={f.agree === f.candidates ? "agree" : "disagree"}>
                    {f.agree} of {f.candidates} agree
                  </span>
                )}
              </span>
              {f.alternatives.length > 0 && <span className="gf-alt">also seen: {f.alternatives.slice(0, 2).join(" · ")}</span>}
            </li>
          );
        })}
      </ul>
      <p className="muted small">Hover or focus a field to see the source cells it came from. Changing a rule re-runs survivorship for all customers.</p>
    </div>
  );
}

export function EdgeExplain({ e, a, b, prior, order }: { e: EdgeView; a: RecordView; b: RecordView; prior: number; order: string[] }) {
  const max = Math.max(8, ...e.levels.map((l) => Math.abs(l.weight)));
  return (
    <div className="explain">
      <header>
        <span className="pair">
          <b style={{ color: sourceColor(a.source, order) }}>{sourceShort(a.source)}</b> {a.name || "(no name)"} <span className="muted">and</span> <b style={{ color: sourceColor(b.source, order) }}>{sourceShort(b.source)}</b> {b.name || "(no name)"}
        </span>
        <span className={`status st-${e.status}`}>{edgeStatusLabel(e)}</span>
      </header>
      <table className="weights">
        <tbody>
          {e.levels.map((l) => (
            <tr key={l.key} className={l.level < 0 ? "is-missing" : ""}>
              <th>{l.label}</th>
              <td className="lvl">{l.levelLabel}</td>
              <td className="bar">
                <span className="axis" />
                {l.level >= 0 && <span className={`fill ${l.weight >= 0 ? "pos" : "neg"}`} style={{ width: `${(Math.abs(l.weight) / max) * 50}%`, [l.weight >= 0 ? "left" : "right"]: "50%" }} />}
              </td>
              <td className="num mono">{l.level < 0 ? "" : bits(l.weight)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={3}>prior odds (one pair in {int(2 ** -prior)} is a match)</th>
            <td className="num mono">{bits(prior)}</td>
          </tr>
          <tr className="total">
            <th colSpan={3}>match weight → probability {fmtProb(e.prob)}</th>
            <td className="num mono">{bits(e.weight)}</td>
          </tr>
        </tfoot>
      </table>
      {e.veto.length > 0 && <p className="guard">Guard rule: {e.veto.join(" and ")}. This pair never merges on its own score; a reviewer can still accept it.</p>}
    </div>
  );
}

export default function Spotlight() {
  const st = useClient();
  const order = st.overview?.sources.map((s) => s.id) ?? [];
  const featured = useView<FeaturedCluster[]>({ type: "featured" }, [st.run]);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const results = useView<FeaturedCluster[]>(query.trim().length >= 2 ? { type: "search", query } : null);
  const list = featured.data ?? [];
  useEffect(() => {
    setAnchor(null);
  }, [st.run]);
  const current = anchor ?? list[0]?.anchor ?? null;
  const cluster = useView<ClusterView>(current !== null ? { type: "cluster", record: current } : null);
  const view = cluster.data;
  const [threshold, setThreshold] = useState(0.95);
  useEffect(() => {
    if (st.overview) setThreshold(st.overview.thresholds.match);
  }, [st.overview?.thresholds.match]); // eslint-disable-line react-hooks/exhaustive-deps
  const [hoverField, setHoverField] = useState<GoldenFieldView | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [showTruth, setShowTruth] = useState(false);

  const lit = useMemo(() => new Set((hoverField?.lineage ?? []).map((l) => `${l.rec}:${l.column}`)), [hoverField]);
  const litRecs = useMemo(() => new Set((hoverField?.lineage ?? []).map((l) => l.rec)), [hoverField]);

  // default edge: the most instructive one (a guard, then the weakest merge)
  const edge = useMemo(() => {
    if (!view) return null;
    const byPair = view.edges.find((e) => e.pair === selected);
    if (byPair) return byPair;
    const inside = new Set(view.golden.members);
    const internal = view.edges.filter((e) => inside.has(e.a) && inside.has(e.b));
    return internal.find((e) => e.status === "guarded") ?? [...internal].sort((x, y) => x.prob - y.prob)[0] ?? view.edges[0] ?? null;
  }, [view, selected]);

  const recById = useMemo(() => new Map((view?.records ?? []).map((r) => [r.i, r])), [view]);
  const members = view ? view.records.filter((r) => view.golden.members.includes(r.i)) : [];
  const outside = view ? view.records.filter((r) => !view.golden.members.includes(r.i)) : [];
  const prior = st.overview && view ? (edge ? edge.weight - edge.levels.reduce((a, l) => a + l.weight, 0) : 0) : 0;
  const globalTh = st.overview?.thresholds.match ?? 0.95;

  const pick = (a: number) => {
    setAnchor(a);
    setSelected(null);
    setHoverField(null);
  };

  return (
    <div className="spotlight">
      <div className="spot-pick">
        <div className="chips" role="list" aria-label="Customers to inspect">
          {list.map((f) => (
            <button key={f.anchor} role="listitem" className={`chip ${current === f.anchor ? "is-on" : ""}`} onClick={() => pick(f.anchor)} title={f.why}>
              <b>{f.name}</b>
              <span>{f.why.split(" · ")[0]}</span>
            </button>
          ))}
        </div>
        <div className="search">
          <input type="search" placeholder="Find a customer by name, email or phone" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a customer" />
          {results.data && query.trim().length >= 2 && (
            <ul className="search-results">
              {results.data.length === 0 && <li className="muted">No golden record matches.</li>}
              {results.data.map((r) => (
                <li key={r.anchor}>
                  <button
                    onClick={() => {
                      pick(r.anchor);
                      setQuery("");
                    }}
                  >
                    <b>{r.name}</b> <span className="muted mono">{r.id}</span> <span className="muted">{r.why}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!view ? (
        <div className="spot-skeleton" aria-busy="true">
          {st.phase === "ready" ? "Loading the customer…" : "Waiting for the pipeline…"}
        </div>
      ) : (
        <>
          <div className="spot-grid">
            <section className="spot-records" aria-label="Source records">
              <h3 className="label">
                {members.length} source records <span className="muted">as delivered, mapped columns only</span>
              </h3>
              <div className="rec-list">
                {members.map((r) => (
                  <RecordCard key={r.i} r={r} order={order} lit={lit} outside={false} quarantined={!!r.quarantined} />
                ))}
              </div>
              {outside.length > 0 && (
                <>
                  <h3 className="label sub">Nearby records that were not merged</h3>
                  <div className="rec-list">
                    {outside.map((r) => (
                      <RecordCard key={r.i} r={r} order={order} lit={lit} outside quarantined={!!r.quarantined} />
                    ))}
                  </div>
                </>
              )}
            </section>
            <section className="spot-golden" aria-label="Golden record">
              <GoldenCard
                view={view}
                order={order}
                onHover={setHoverField}
                onRule={(k, r) => {
                  void client.mutate({ type: "survivorship", field: k, rule: r });
                }}
              />
            </section>
          </div>

          <div className="spot-grid graph-row">
            <section aria-label="Match graph">
              <div className="graph-head">
                <h3 className="label">Match graph</h3>
                {view.truth && (
                  <label className="toggle">
                    <input type="checkbox" checked={showTruth} onChange={(e) => setShowTruth(e.target.checked)} /> show the generator&rsquo;s truth
                  </label>
                )}
              </div>
              <MatchGraph view={view} order={order} threshold={threshold} onThreshold={setThreshold} selected={edge?.pair ?? null} onSelect={setSelected} highlight={litRecs} showTruth={showTruth} />
              <div className="apply">
                <button className="btn" disabled={Math.abs(threshold - globalTh) < 1e-9 || st.busy} onClick={() => void client.mutate({ type: "thresholds", thresholds: { match: threshold, review: Math.min(st.overview?.thresholds.review ?? 0.6, threshold) } })}>
                  Apply {fmtProb(threshold)} to all {int(st.overview?.totals.records ?? 0)} records
                </button>
                {Math.abs(globalTh - 0.95) > 1e-9 && (
                  <button className="btn ghost" disabled={st.busy} onClick={() => void client.mutate({ type: "thresholds", thresholds: { match: 0.95, review: 0.6 } })}>
                    Reset to 0.95
                  </button>
                )}
                {st.overview?.score && (
                  <span className="muted small">
                    Live pairwise F1 for the whole table: <b className="mono">{st.overview.score.pairwise.f1.toFixed(3)}</b>
                  </span>
                )}
              </div>
            </section>
            <section aria-label="Why this pair scored as it did">
              <h3 className="label">Why two records match</h3>
              {edge && recById.get(edge.a) && recById.get(edge.b) ? (
                <EdgeExplain e={edge} a={recById.get(edge.a)!} b={recById.get(edge.b)!} prior={prior} order={order} />
              ) : (
                <p className="muted">This customer has a single record.</p>
              )}
              <div className="edge-list" role="list" aria-label="Candidate pairs">
                {view.edges.map((e) => (
                  <button role="listitem" key={e.pair} className={`edge-btn st-${e.status} ${edge?.pair === e.pair ? "is-on" : ""}`} onClick={() => setSelected(e.pair)}>
                    <span>
                      {sourceShort(recById.get(e.a)?.source ?? "")} ↔ {sourceShort(recById.get(e.b)?.source ?? "")}
                    </span>
                    <span className="mono">{e.prob >= 0.9995 ? "1.000" : e.prob.toFixed(3)}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
