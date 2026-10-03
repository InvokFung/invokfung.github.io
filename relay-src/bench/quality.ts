// Accuracy benchmarks on labelled data: the response cache on a replayed
// workload, PII redaction, and the prompt-injection screen.

import { detect, ibanValid, luhn, redact, ResponseCache, restore, screen, seeded, Vault, type NearIndex, type NearOptions, type PiiType, PII_TYPES } from "@relay/core";
import { CACHE_INTENTS, HARD_NEGATIVES } from "./data/cache";
import { INJECTION_SAMPLES, type InjectionSample } from "./data/injection";
import { parseSample, PII_SAMPLES } from "./data/pii";
import { pct, q, round } from "./util";

// ------------------------------------------------------------------ cache

export interface CacheVariant {
  id: string;
  label: string;
  hitRate: number;
  exactRate: number;
  nearRate: number;
  /** Hits that returned another intent's answer, as a share of all hits. */
  falseHitRate: number;
  falseHits: number;
  lookupUsP50: number;
  /**
   * Correct hits among requests in new words for an intent asked before (what only
   * near matching can catch), by how the request was worded.
   */
  byKind: { light: number; paraphrase: number; tail: number };
}

export interface CacheResult {
  requests: number;
  intents: number;
  hardNegativePairs: number;
  /** Share of requests whose intent had been asked before: what a perfect semantic cache could hit. */
  ceiling: number;
  /** Share of requests that repeat an earlier request word for word. */
  verbatimShare: number;
  /** How the replayed workload is made (percentages), and how many requests are new wordings of a known intent, by kind. */
  workload: { popularShare: number; paraphraseShare: number; tailIntents: number; novel: { light: number; paraphrase: number; tail: number } };
  variants: CacheVariant[];
}

const TAIL_SHARE = 0.45;
const PARAPHRASE_SHARE = 0.2;

/** A light rewording, the way people re-ask: case, punctuation, filler, at most one typo. */
function perturb(text: string, rng: () => number): string {
  let t = text;
  if (rng() < 0.3) t = t.toLowerCase();
  if (rng() < 0.3) t = t.replace(/[.?!]+$/, "");
  if (rng() < 0.2) t = ["Hi, ", "Hello, ", "Quick question: ", "Hey - "][Math.floor(rng() * 4)] + t[0].toLowerCase() + t.slice(1);
  if (rng() < 0.15) t = t + [" Thanks!", " thanks", " Please help."][Math.floor(rng() * 3)];
  if (rng() < 0.15) {
    const words = t.split(" ");
    const long = words.map((w, i) => [w, i] as const).filter(([w]) => /^[a-z]{6,}$/i.test(w));
    if (long.length) {
      const [w, i] = long[Math.floor(rng() * long.length)];
      const k = 1 + Math.floor(rng() * (w.length - 2));
      words[i] = rng() < 0.5 ? w.slice(0, k) + w.slice(k + 1) : w.slice(0, k) + w[k + 1] + w[k] + w.slice(k + 2);
    }
    t = words.join(" ");
  }
  return t;
}

const VERBS = ["export", "import", "archive", "share", "rename", "duplicate", "lock", "restore"];
const OBJECTS = ["project", "report", "dashboard", "invoice", "workspace", "template", "folder", "webhook"];
const SURFACES = ["web app", "mobile app", "API", "command line"];
const FRAMES = ["How do I {v} a {o} in the {s}?", "Can I {v} a {o} from the {s}?", "Is there a way to {v} a {o} using the {s}?"];

/**
 * The replayed workload: 55% popular questions (Zipf-like over the labelled
 * intents, 20% of them paraphrased, the rest lightly reworded) and 45% long-tail
 * questions from a 256-intent space where intents differ by a single word.
 */
function replay(n: number, seed: number) {
  const r = seeded(seed);
  const rng = () => r.next();
  const weights = CACHE_INTENTS.map((_, i) => 1 / (i + 1) ** 0.9);
  const total = weights.reduce((a, b) => a + b, 0);
  const out: { intent: string; text: string; kind: "light" | "paraphrase" | "tail" }[] = [];
  for (let i = 0; i < n; i++) {
    if (rng() < TAIL_SHARE) {
      const v = VERBS[Math.floor(rng() * VERBS.length)];
      const o = OBJECTS[Math.floor(rng() * OBJECTS.length)];
      const sf = SURFACES[Math.floor(rng() * SURFACES.length)];
      const frame = FRAMES[Math.floor(rng() * FRAMES.length)];
      out.push({ intent: `tail:${v}|${o}|${sf}`, text: perturb(frame.replace("{v}", v).replace("{o}", o).replace("{s}", sf), rng), kind: "tail" });
      continue;
    }
    let x = rng() * total;
    let k = 0;
    while ((x -= weights[k]) > 0) k++;
    const it = CACHE_INTENTS[k];
    if (it.paraphrase.length > 0 && rng() < PARAPHRASE_SHARE) out.push({ intent: it.id, text: it.paraphrase[Math.floor(rng() * it.paraphrase.length)], kind: "paraphrase" });
    else out.push({ intent: it.id, text: perturb(it.light[Math.floor(rng() * it.light.length)], rng), kind: "light" });
  }
  return out;
}

export function benchCache(): CacheResult {
  const reqs = replay(3000, 5);
  const variants: { id: string; label: string; index: NearIndex; near: NearOptions | null }[] = [
    { id: "exact", label: "Exact match only", index: "minhash", near: null },
    { id: "minhash", label: "Exact + MinHash near match, with guard (shipped)", index: "minhash", near: { threshold: 0.6 } },
    { id: "minhash-noguard", label: "Exact + MinHash, no guard", index: "minhash", near: { threshold: 0.6, guard: false } },
    { id: "simhash", label: "Exact + SimHash (≤ 8 of 64 bits), with guard", index: "simhash", near: { threshold: 0, maxHamming: 8 } },
    { id: "simhash-noguard", label: "Exact + SimHash, no guard", index: "simhash", near: { threshold: 0, maxHamming: 8, guard: false } },
  ];
  const seen = new Set<string>();
  const seenText = new Set<string>();
  let ceiling = 0;
  let verbatim = 0;
  const hittable: boolean[] = [];
  const kinds = ["light", "paraphrase", "tail"] as const;
  const novelN = { light: 0, paraphrase: 0, tail: 0 };
  for (const r of reqs) {
    const norm = r.text.trim().replace(/\s+/g, " ");
    hittable.push(seen.has(r.intent) && !seenText.has(norm));
    if (hittable[hittable.length - 1]) novelN[r.kind]++;
    if (seen.has(r.intent)) ceiling++;
    if (seenText.has(norm)) verbatim++;
    seen.add(r.intent);
    seenText.add(norm);
  }
  const out: CacheVariant[] = [];
  for (const v of variants) {
    const c = new ResponseCache(10_000, v.index);
    let exact = 0;
    let near = 0;
    let falseHits = 0;
    const us: number[] = [];
    const kindHits = { light: 0, paraphrase: 0, tail: 0 };
    for (let i = 0; i < reqs.length; i++) {
      const r = reqs[i];
      const key = r.text.trim().replace(/\s+/g, " ");
      const t0 = performance.now();
      const res = c.lookup("tenant", key, r.text, 0, v.near);
      us.push((performance.now() - t0) * 1000);
      if (res.kind === "miss") {
        // The cached "answer" is the intent id, so a hit can be checked against the truth.
        c.store("tenant", key, r.text, { text: r.intent, model: "m", inputTokens: 0, outputTokens: 0, costUsd: 0 }, 0, 1e12, res.probe);
        continue;
      }
      if (res.kind === "exact") exact++;
      else near++;
      if (res.response!.text !== r.intent) falseHits++;
      else if (hittable[i]) kindHits[r.kind]++;
    }
    const hits = exact + near;
    out.push({
      id: v.id,
      label: v.label,
      hitRate: pct(hits / reqs.length),
      exactRate: pct(exact / reqs.length),
      nearRate: pct(near / reqs.length),
      falseHitRate: pct(hits ? falseHits / hits : 0, 2),
      falseHits,
      lookupUsP50: round(q(us, 0.5), 1),
      byKind: Object.fromEntries(kinds.map((k) => [k, pct(novelN[k] ? kindHits[k] / novelN[k] : 0)])) as CacheVariant["byKind"],
    });
  }
  return {
    requests: reqs.length,
    intents: CACHE_INTENTS.length + VERBS.length * OBJECTS.length * SURFACES.length,
    hardNegativePairs: HARD_NEGATIVES.length,
    ceiling: pct(ceiling / reqs.length),
    verbatimShare: pct(verbatim / reqs.length),
    workload: { popularShare: pct(1 - TAIL_SHARE), paraphraseShare: pct(PARAPHRASE_SHARE), tailIntents: VERBS.length * OBJECTS.length * SURFACES.length, novel: novelN },
    variants: out,
  };
}

// ------------------------------------------------------------------ redaction

export interface PrfRow {
  type: string;
  gold: number;
  predicted: number;
  precision: number;
  recall: number;
}

export interface RedactionResult {
  samples: number;
  negatives: number;
  perType: PrfRow[];
  overall: PrfRow;
  exactBoundaries: number;
  roundTrip: number;
  misses: string[];
  falsePositives: string[];
}

export function benchRedaction(samples: string[] = PII_SAMPLES): RedactionResult {
  const per = new Map<string, { gold: number; pred: number; tpGold: number; tpPred: number }>();
  for (const t of PII_TYPES) per.set(t, { gold: 0, pred: 0, tpGold: 0, tpPred: 0 });
  let exactB = 0;
  let matched = 0;
  let roundTrip = 0;
  let negatives = 0;
  const misses: string[] = [];
  const fps: string[] = [];
  const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
  for (const s of samples) {
    const { text, gold } = parseSample(s);
    // The labels themselves must be right: test card numbers pass Luhn, example IBANs their checksum.
    for (const g of gold) {
      const v = text.slice(g.start, g.end).replace(/[ -]/g, "");
      if ((g.type === "CARD" && !luhn(v)) || (g.type === "IBAN" && !ibanValid(v.toUpperCase()))) throw new Error(`bad label: ${g.type} ${v}`);
    }
    if (!gold.length) negatives++;
    const found = detect(text);
    for (const g of gold) {
      const row = per.get(g.type)!;
      row.gold++;
      const m = found.find((f) => f.type === g.type && overlap(f, g));
      if (m) {
        row.tpGold++;
        matched++;
        if (m.start === g.start && m.end === g.end) exactB++;
      } else misses.push(`${g.type}: ${text.slice(g.start, g.end)}`);
    }
    for (const f of found) {
      const row = per.get(f.type)!;
      row.pred++;
      if (gold.some((g) => g.type === f.type && overlap(f, g))) row.tpPred++;
      else fps.push(`${f.type}: ${f.value}`);
    }
    const v = new Vault();
    if (restore(redact(text, v).text, v) === text) roundTrip++;
  }
  const row = (type: string, r: { gold: number; pred: number; tpGold: number; tpPred: number }): PrfRow => ({
    type,
    gold: r.gold,
    predicted: r.pred,
    precision: pct(r.pred ? r.tpPred / r.pred : 1),
    recall: pct(r.gold ? r.tpGold / r.gold : 1),
  });
  const tot = { gold: 0, pred: 0, tpGold: 0, tpPred: 0 };
  for (const r of per.values()) ((tot.gold += r.gold), (tot.pred += r.pred), (tot.tpGold += r.tpGold), (tot.tpPred += r.tpPred));
  return {
    samples: samples.length,
    negatives,
    perType: [...per.entries()].map(([t, r]) => row(t as PiiType, r)),
    overall: row("all", tot),
    exactBoundaries: pct(matched ? exactB / matched : 0),
    roundTrip: pct(roundTrip / samples.length),
    misses,
    falsePositives: fps,
  };
}

// ------------------------------------------------------------------ injection screen

export interface ScreenThreshold {
  threshold: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
}

export interface InjectionResult {
  benign: number;
  attacks: number;
  flag: ScreenThreshold;
  block: ScreenThreshold;
  byCategory: { category: string; attack: boolean; n: number; flagged: number; blocked: number }[];
  missedExamples: string[];
  falsePositiveExamples: string[];
}

export function benchInjection(samples: InjectionSample[] = INJECTION_SAMPLES): InjectionResult {
  const thresholds = { flag: 0.4, block: 0.7 };
  const scored = samples.map((s) => ({ ...s, score: screen(s.text, thresholds).score }));
  const at = (t: number): ScreenThreshold => {
    const tp = scored.filter((s) => s.attack && s.score >= t).length;
    const fp = scored.filter((s) => !s.attack && s.score >= t).length;
    const pos = scored.filter((s) => s.attack).length;
    const neg = scored.length - pos;
    return { threshold: t, precision: pct(tp + fp ? tp / (tp + fp) : 1), recall: pct(tp / pos), falsePositiveRate: pct(fp / neg) };
  };
  const cats = [...new Set(scored.map((s) => `${s.attack ? 1 : 0}|${s.category}`))];
  const clip = (t: string) => (t.length > 90 ? t.slice(0, 87) + "…" : t).replace(/[​‌\u{e0000}-\u{e007f}]/gu, "");
  return {
    benign: scored.filter((s) => !s.attack).length,
    attacks: scored.filter((s) => s.attack).length,
    flag: at(thresholds.flag),
    block: at(thresholds.block),
    byCategory: cats.map((c) => {
      const [a, category] = c.split("|");
      const xs = scored.filter((s) => s.category === category && s.attack === (a === "1"));
      return { category, attack: a === "1", n: xs.length, flagged: xs.filter((s) => s.score >= thresholds.flag).length, blocked: xs.filter((s) => s.score >= thresholds.block).length };
    }),
    missedExamples: scored.filter((s) => s.attack && s.score < thresholds.flag).map((s) => `${s.category}: ${clip(s.text)}`),
    falsePositiveExamples: scored.filter((s) => !s.attack && s.score >= thresholds.flag).map((s) => `${s.category} (${s.score.toFixed(2)}): ${clip(s.text)}`),
  };
}
