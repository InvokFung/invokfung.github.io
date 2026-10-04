// Writes the "Measured, not guessed" tables into README.md, between the
// bench:start and bench:end markers, from the same result object as bench.json.
// Run as part of `npm run bench`, so the README never drifts from the numbers.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Result = Record<string, any>;

const us = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(2)} ms` : `${x} µs`);
const row = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
const table = (head: string[], rows: (string | number)[][]) => [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");

export function readmeTables(r: Result): string {
  const o = r.overhead;
  const out: string[] = [];
  out.push(
    `**Gateway overhead** (CPU the gateway adds, zero-latency simulated upstream, ${o.requests.toLocaleString("en-US")} requests after ${o.warmup.toLocaleString("en-US")} warm-up, ${r.env.cpu}, Node ${r.env.node}). Self time per stage on the ${o.miss.n.toLocaleString("en-US")} upstream-served requests; the ${o.hit.n.toLocaleString("en-US")} cache hits skip route, meter and resilience.`,
    "",
    table(
      ["Stage", "p50", "p99"],
      [
        ...["audit", "auth", "limit", "redact", "screen", "cache", "route", "meter", "resilience"].map((s) => [s, us(o.miss.stages[s].p50), us(o.miss.stages[s].p99)]),
        ["**whole chain, upstream-served**", `**${us(o.miss.p50)}**`, `**${us(o.miss.p99)}**`],
        ["whole chain, cache hit", us(o.hit.p50), us(o.hit.p99)],
      ],
    ),
    "",
  );
  for (const sc of r.resilience) {
    out.push(
      `**${sc.label}.** ${sc.detail}`,
      "",
      table(
        ["Policy", "Success", "p50", "p99", "Attempts / request", "Failed mid-stream"],
        sc.configs.map((c: any) => [c.label, `${c.success}%`, `${c.p50Ms} ms`, `${c.p99Ms} ms`, c.attemptsPerRequest, c.failures["failed mid-stream"] ?? 0]),
      ),
      "",
    );
  }
  const h = r.hedging;
  out.push(
    `**Hedging** against a heavy tail (${h.requests.toLocaleString("en-US")} requests). ${h.detail}`,
    "",
    table(
      ["", "TTFT p50", "TTFT p90", "TTFT p99", "Total p99", "Upstream calls"],
      [
        ["No hedging", `${h.without.ttfbP50} ms`, `${h.without.ttfbP90} ms`, `${h.without.ttfbP99} ms`, `${h.without.latencyP99} ms`, h.without.upstreamCalls],
        ["Hedge at p95", `${h.with.ttfbP50} ms`, `${h.with.ttfbP90} ms`, `${h.with.ttfbP99} ms`, `${h.with.latencyP99} ms`, h.with.upstreamCalls],
      ],
    ),
    "",
    `${h.hedgedShare}% of requests hedged, +${h.extraCalls}% upstream calls; the hedge won ${h.hedgeWinShare}% of its races.`,
    "",
  );
  const c = r.cache;
  const shipped = c.variants.find((v: any) => v.id === "minhash");
  out.push(
    `**Cache** on a replayed workload of ${c.requests.toLocaleString("en-US")} requests (ceiling ${c.ceiling}%: requests whose intent was asked before; verbatim repeats ${c.verbatimShare}%). A false hit is an answer served to a different intent.`,
    "",
    table(
      ["Matcher", "Hit rate", "Exact", "Near", "False hits", "Lookup p50"],
      c.variants.map((v: any) => [v.id === "minhash" ? `**${v.label}**` : v.label, `${v.hitRate}%`, `${v.exactRate}%`, `${v.nearRate}%`, `${v.falseHitRate}%`, `${v.lookupUsP50} µs`]),
    ),
    "",
    `On requests in new words for an intent already asked, the shipped matcher answers ${shipped.byKind.light}% of light rewordings (${c.workload.novel.light}), ${shipped.byKind.tail}% of long-tail re-asks (${c.workload.novel.tail}) and ${shipped.byKind.paraphrase}% of true paraphrases (${c.workload.novel.paraphrase}).`,
    "",
  );
  const d = r.redaction;
  const dh = r.redactionHeldout;
  out.push(
    `**PII redaction** on ${d.samples} labelled messages (${d.negatives} with look-alikes and no PII) and ${dh.samples} held-out messages written before the last rule changes.`,
    "",
    table(
      ["Type", "Precision", "Recall", "Held-out precision", "Held-out recall"],
      [...d.perType, d.overall].map((t: any) => {
        const ht = t.type === "all" ? dh.overall : dh.perType.find((x: any) => x.type === t.type);
        return [t.type === "all" ? "**all**" : t.type.toLowerCase(), `${t.precision}%`, `${t.recall}%`, ht ? `${ht.precision}%` : "–", ht ? `${ht.recall}%` : "–"];
      }),
    ),
    "",
  );
  const i = r.injection;
  const ih = r.injectionHeldout;
  const caught = (cat: string) => {
    const x = i.byCategory.find((y: any) => y.category === cat);
    return x ? `${x.flagged}/${x.n}` : "–";
  };
  out.push(
    `**Prompt-injection screen** (heuristic) on ${i.benign} benign and ${i.attacks} attack prompts, plus ${ih.benign} + ${ih.attacks} held out.`,
    "",
    table(
      ["Threshold", "Precision", "Recall", "False positives", "Held-out precision", "Held-out recall", "Held-out false positives"],
      [
        [`flag ≥ ${i.flag.threshold}`, `${i.flag.precision}%`, `${i.flag.recall}%`, `${i.flag.falsePositiveRate}%`, `${ih.flag.precision}%`, `${ih.flag.recall}%`, `${ih.flag.falsePositiveRate}%`],
        [`block ≥ ${i.block.threshold}`, `${i.block.precision}%`, `${i.block.recall}%`, `${i.block.falsePositiveRate}%`, `${ih.block.precision}%`, `${ih.block.recall}%`, `${ih.block.falsePositiveRate}%`],
      ],
    ),
    "",
    `Paraphrased attacks caught: ${caught("paraphrased")}; non-English: ${caught("non-English")}. It is a pattern screen, and these rows are where it stops.`,
    "",
  );
  out.push(
    "**Canary rollouts** in virtual time against simulated traffic:",
    "",
    table(
      ["Candidate", "Evals", "Outcome", "Decided after", "Canary requests"],
      r.canary.map((x: any) => [x.label, x.evalPassed.join(", "), x.status + (x.reason ? `: ${x.reason}` : ""), `${x.decidedAfterS} s`, x.canaryRequests]),
    ),
  );
  return out.join("\n");
}

export function updateReadme(path: string, r: Result): boolean {
  if (!existsSync(path)) return false;
  const text = readFileSync(path, "utf8");
  const start = "<!-- bench:start -->";
  const end = "<!-- bench:end -->";
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < a) return false;
  writeFileSync(path, `${text.slice(0, a + start.length)}\n${readmeTables(r)}\n${text.slice(b)}`);
  return true;
}
