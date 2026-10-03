// "Measured": every figure here is read from src/data/bench.json, which
// `npm run bench` writes. Nothing is typed in by hand.

import { DEFAULT_STEPS, STANDARD_RESILIENCE, type Stage } from "@relay/core";
import { bench, fmtUs, pct } from "../data";
import { STAGE_LABEL } from "../live/engine";
import { FLOW } from "./ChainFlow";

const POLICY_COLOR: Record<string, string> = { none: "#ff5d6c", retries: "#ffa26b", full: "#5fe0a4" };

function Overhead() {
  const o = bench.overhead;
  const max = Math.max(...FLOW.map((s) => o.miss.stages[s as Stage].p99));
  return (
    <div className="panel card">
      <h3>Gateway overhead</h3>
      <p>CPU time the gateway itself adds to a request, measured against a simulator that answers instantly, so nothing else is in the number.</p>
      <div className="headline">
        <div>
          <strong>{fmtUs(o.miss.p50)}</strong>
          <span>median, full chain to the upstream</span>
        </div>
        <div>
          <strong>{fmtUs(o.miss.p99)}</strong>
          <span>p99, full chain</span>
        </div>
        <div>
          <strong>{fmtUs(o.hit.p50)}</strong>
          <span>median, cache hit</span>
        </div>
      </div>
      <div className="bars" role="table" aria-label="Self time per stage, upstream-served requests">
        {FLOW.map((s) => {
          const d = o.miss.stages[s as Stage];
          return (
            <div className="bar-row" role="row" key={s}>
              <span className="n" role="cell">
                {STAGE_LABEL[s]}
              </span>
              <span className="bar-track" role="cell" aria-label={`p50 ${d.p50} µs, p99 ${d.p99} µs`}>
                <span className="p99" style={{ width: `${(d.p99 / max) * 100}%` }} />
                <span className="p50" style={{ width: `${(d.p50 / max) * 100}%` }} />
              </span>
              <span className="v" role="cell">
                {fmtUs(d.p50)} <small>/ {fmtUs(d.p99)}</small>
              </span>
            </div>
          );
        })}
      </div>
      <p className="note">
        Self time per stage (p50 solid, p99 light), request and stream phases, waits excluded: {o.miss.n.toLocaleString("en-US")} upstream-served and {o.hit.n.toLocaleString("en-US")} cache-hit requests out of{" "}
        {o.requests.toLocaleString("en-US")}, after {o.warmup.toLocaleString("en-US")} warm-up. Simulator CPU (p50 {fmtUs(o.simulator.p50)}) is not counted. {o.throughputPerSec.toLocaleString("en-US")} requests/s end to end on one core.{" "}
        {bench.env.cpu}, Node {bench.env.node}.
      </p>
    </div>
  );
}

function Resilience() {
  return (
    <div className="panel card wide">
      <h3>Success under injected failure</h3>
      <p>
        {bench.resilience[0].configs.length} policies, {bench.resilience.length} failure patterns, the same seeded simulator for each. A request succeeds if the client gets a complete answer.
      </p>
      <div className="split2">
        {bench.resilience.map((sc) => (
          <div key={sc.id}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{sc.label}</div>
            <div className="compare">
              {sc.configs.map((c) => (
                <div className="compare-row" key={c.id}>
                  <span>{c.label.replace(/ \(.*\)$/, "")}</span>
                  <span className="bar-track">
                    <span className="fill" style={{ width: `${c.success}%`, background: POLICY_COLOR[c.id] ?? "#cfe0d7" }} />
                  </span>
                  <span className="v">{pct(c.success)}</span>
                </div>
              ))}
            </div>
            <div className="tbl-wrap" style={{ marginTop: 6 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Policy</th>
                    <th>p50</th>
                    <th>p99</th>
                    <th>attempts/req</th>
                    <th>failed mid-stream</th>
                  </tr>
                </thead>
                <tbody>
                  {sc.configs.map((c) => (
                    <tr key={c.id} className={c.id === "full" ? "hl" : undefined}>
                      <td>{c.label}</td>
                      <td>{c.p50Ms} ms</td>
                      <td>{c.p99Ms} ms</td>
                      <td>{c.attemptsPerRequest}</td>
                      <td>{(c.failures as Record<string, number>)["failed mid-stream"] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">{sc.detail}</p>
          </div>
        ))}
      </div>
      <p className="note">
        Retries only help before the first token. After it, the client already has part of an answer, so a stream that drops mid-way is reported as an error rather than silently restarted; that is most of what the retry policies still lose
        under random failure. Under independent failures, fallback and the breaker have nothing to route around, so the two retry policies tie within noise; they separate when failures are correlated, as in the outage. The retry p99 is long
        because a stalled call is only abandoned at the {STANDARD_RESILIENCE.firstTokenTimeoutMs / 1000} s first-token timeout.
      </p>
    </div>
  );
}

function Hedging() {
  const h = bench.hedging;
  return (
    <div className="panel card">
      <h3>Hedged requests against a heavy tail</h3>
      <p>When the first token is later than the upstream's recent p95, a second request goes to the next deployment; the first to produce a token wins and the other is cancelled.</p>
      <div className="headline">
        <div>
          <strong>
            {h.without.ttfbP99} → {h.with.ttfbP99} ms
          </strong>
          <span>first-token p99</span>
        </div>
        <div>
          <strong>{h.hedgedShare}%</strong>
          <span>of requests hedged</span>
        </div>
        <div>
          <strong>+{h.extraCalls}%</strong>
          <span>upstream calls</span>
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>{h.requests.toLocaleString("en-US")} requests</th>
              <th>TTFT p50</th>
              <th>p90</th>
              <th>p99</th>
              <th>total p99</th>
              <th>calls</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>No hedging</td>
              <td>{h.without.ttfbP50} ms</td>
              <td>{h.without.ttfbP90} ms</td>
              <td>{h.without.ttfbP99} ms</td>
              <td>{h.without.latencyP99} ms</td>
              <td>{h.without.upstreamCalls.toLocaleString("en-US")}</td>
            </tr>
            <tr className="hl">
              <td>Hedge at p95</td>
              <td>{h.with.ttfbP50} ms</td>
              <td>{h.with.ttfbP90} ms</td>
              <td>{h.with.ttfbP99} ms</td>
              <td>{h.with.latencyP99} ms</td>
              <td>{h.with.upstreamCalls.toLocaleString("en-US")}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        {h.detail} The hedge won {h.hedgeWinShare}% of the races it started. Spend on cancelled attempts was {h.wastedCostShare}% here, because the simulator sends nothing before its first token; against the real API a cancelled loser's
        input tokens are still billed, which is why hedges are rationed and the real-API config turns them off.
      </p>
    </div>
  );
}

function Cache() {
  const c = bench.cache;
  const shipped = c.variants.find((v) => v.id === "minhash");
  return (
    <div className="panel card">
      <h3>Cache on a replayed workload</h3>
      <p>
        {c.requests.toLocaleString("en-US")} requests: {pct(c.workload.popularShare)} popular support questions ({pct(c.workload.paraphraseShare)} of them paraphrased, the rest re-asked with changed case, punctuation, filler or a typo) and
        the rest long-tail questions from a {c.workload.tailIntents}-intent space where intents differ by one word. A false hit is a cached answer served to a different intent.
      </p>
      <div className="tbl-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Matcher</th>
              <th>hit rate</th>
              <th>exact</th>
              <th>near</th>
              <th>false hits</th>
              <th>lookup p50</th>
            </tr>
          </thead>
          <tbody>
            {c.variants.map((v) => (
              <tr key={v.id} className={v.id === "minhash" ? "hl" : undefined}>
                <td>{v.label}</td>
                <td>{pct(v.hitRate)}</td>
                <td>{pct(v.exactRate)}</td>
                <td>{pct(v.nearRate)}</td>
                <td>{pct(v.falseHitRate)}</td>
                <td>{fmtUs(v.lookupUsP50)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        The ceiling, every request whose intent was asked before, is {pct(c.ceiling)}; verbatim repeats alone are {pct(c.verbatimShare)}. The guard refuses a near match whose numbers, placeholders or negations differ, or whose content words
        differ; that is what removes the false hits, including on the {c.hardNegativePairs} pairs of intents written to look alike (reset password and reset username, the March and May invoice).
      </p>
      {shipped ? (
        <p className="note">
          Requests in new words for an intent already asked, which only near matching can catch: the shipped matcher answers {pct(shipped.byKind.light)} of light rewordings ({c.workload.novel.light}), {pct(shipped.byKind.tail)} of long-tail
          re-asks ({c.workload.novel.tail}) and {pct(shipped.byKind.paraphrase)} of true paraphrases ({c.workload.novel.paraphrase}). Paraphrases need a model of meaning; a lexical matcher with a strict guard leaves them to the upstream.
        </p>
      ) : null}
    </div>
  );
}

function Redaction() {
  const r = bench.redaction;
  const h = bench.redactionHeldout;
  return (
    <div className="panel card">
      <h3>PII redaction</h3>
      <p>
        Precision and recall on {r.samples} labelled messages ({r.negatives} of them with no PII but look-alikes: phone-shaped order numbers, dates, version strings, a card number that fails Luhn, an IBAN with a bad checksum, "I'm Sorry"),
        and on {h.samples} held-out messages written before the last round of rule changes and never tuned on.
      </p>
      <div className="tbl-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Type</th>
              <th>precision</th>
              <th>recall</th>
              <th>held-out P</th>
              <th>held-out R</th>
            </tr>
          </thead>
          <tbody>
            {r.perType.map((t) => {
              const ht = h.perType.find((x) => x.type === t.type);
              return (
                <tr key={t.type}>
                  <td>{t.type.toLowerCase()}</td>
                  <td>{pct(t.precision)}</td>
                  <td>{pct(t.recall)}</td>
                  <td>{ht && ht.gold + ht.predicted > 0 ? pct(ht.precision) : "–"}</td>
                  <td>{ht && ht.gold > 0 ? pct(ht.recall) : "–"}</td>
                </tr>
              );
            })}
            <tr className="hl">
              <td>all</td>
              <td>{pct(r.overall.precision)}</td>
              <td>{pct(r.overall.recall)}</td>
              <td>{pct(h.overall.precision)}</td>
              <td>{pct(h.overall.recall)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        Exact span boundaries on {pct(r.exactBoundaries)} of hits; redact-then-restore gives back the original text in {pct(r.roundTrip)} of messages. Cards need a valid Luhn checksum and IBANs a valid mod-97, which is why their precision
        holds. Names are the weak spot: the detector needs a cue ("my name is", "I'm", an honorific) or a known first name followed by capitalised words, so lowercase or unfamiliar names without a cue get through.
      </p>
      <details className="more">
        <summary>What it missed</summary>
        <ul className="miss-list">
          {[...r.misses, ...h.misses].map((m, i) => (
            <li key={i}>{m}</li>
          ))}
          {h.falsePositives.map((m, i) => (
            <li key={`f${i}`}>false positive: {m}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Injection() {
  const d = bench.injection;
  const h = bench.injectionHeldout;
  const rows = [
    { label: `Flag (score ≥ ${d.flag.threshold})`, dev: d.flag, held: h.flag },
    { label: `Block (score ≥ ${d.block.threshold})`, dev: d.block, held: h.block },
  ];
  return (
    <div className="panel card wide">
      <h3>Prompt-injection screen</h3>
      <p>
        A dozen families of weighted patterns over normalised text (NFKC, hidden characters removed, leetspeak folded, spaced-out letters joined), with base64 and Unicode-tag payloads decoded and screened again; signals combine as a
        noisy-OR. Flagged prompts go upstream with a guard note in the system prompt; blocked prompts never leave the gateway. {d.benign} benign and {d.attacks} attack prompts, plus {h.benign} + {h.attacks} held out.
      </p>
      <div className="split2">
        <div>
          <div className="tbl-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Threshold</th>
                  <th>precision</th>
                  <th>recall</th>
                  <th>false pos.</th>
                  <th>held-out P</th>
                  <th>held-out R</th>
                  <th>held-out FP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{pct(r.dev.precision)}</td>
                    <td>{pct(r.dev.recall)}</td>
                    <td>{pct(r.dev.falsePositiveRate)}</td>
                    <td>{pct(r.held.precision)}</td>
                    <td>{pct(r.held.recall)}</td>
                    <td>{pct(r.held.falsePositiveRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            It is a heuristic and the table says where it stops: it catches the phrasings it has patterns for and misses attacks reworded in plain language or written in another language. The rules were tuned on the development set, so its
            numbers are optimistic; the held-out columns are the fairer estimate. It is one layer, not a defence on its own.
          </p>
        </div>
        <div className="tbl-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Category</th>
                <th>n</th>
                <th>flagged</th>
                <th>blocked</th>
              </tr>
            </thead>
            <tbody>
              {d.byCategory.map((c) => (
                <tr key={c.category}>
                  <td>
                    {c.attack ? "attack · " : "benign · "}
                    {c.category}
                  </td>
                  <td>{c.n}</td>
                  <td className={c.attack ? (c.flagged === c.n ? "tone-ok" : c.flagged === 0 ? "tone-bad" : undefined) : c.flagged ? "tone-warn" : undefined}>{c.flagged}</td>
                  <td>{c.blocked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CanaryRuns() {
  return (
    <div className="panel card wide">
      <h3>Canary rollouts, simulated</h3>
      <p>Each candidate rolled out against simulated traffic in virtual time, with the gates above and the server's step sizes ({DEFAULT_STEPS.map((st) => `≥ ${st.minSamples} at ${Math.round(st.weight * 100)}%`).join(", ")}).</p>
      <div className="tbl-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>evals</th>
              <th>outcome</th>
              <th>decided after</th>
              <th>canary requests</th>
            </tr>
          </thead>
          <tbody>
            {bench.canary.map((c) => (
              <tr key={c.version}>
                <td>
                  {c.label}
                  {c.reason ? (
                    <>
                      <br />
                      <span className="muted" style={{ fontSize: 12 }}>
                        {c.reason}
                      </span>
                    </>
                  ) : null}
                </td>
                <td>{c.evalPassed.join(", ")}</td>
                <td className={c.status === "promoted" ? "tone-ok" : "tone-bad"}>{c.status}</td>
                <td>{c.decidedAfterS} s</td>
                <td>{c.canaryRequests}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Numbers() {
  return (
    <section className="sec" id="numbers">
      <p className="eyebrow">Measured</p>
      <h2>The numbers, from npm run bench</h2>
      <p className="sub">
        Written by the scripts in <code>bench/</code> on {bench.generatedAt.slice(0, 10)}, driving the same gateway package this page runs. The failure, hedging and canary runs use seeded simulators in virtual time, so their counts repeat
        exactly; the timings move with the machine.
      </p>
      <div className="cards2">
        <Overhead />
        <Hedging />
        <Resilience />
        <Cache />
        <Redaction />
        <Injection />
        <CanaryRuns />
      </div>
    </section>
  );
}
