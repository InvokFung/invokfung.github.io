// How it is built: the stages, the decisions behind them, and what they cost.
// Figures in the prose come from eval.json, not from memory.

import report from "../generated/eval.json";
import { f3, int, pct } from "../format";

const er = report.er;
const m = Object.fromEntries(er.methods.map((x) => [x.key, x]));
const SRC = "https://github.com/InvokFung/invokfung.github.io/tree/main/onboard-src";
const file = (path: string) => `${SRC}/${path}`;

const STAGE_ROWS: { stage: string; what: string; decision: string; files: string[] }[] = [
  {
    stage: "Ingest",
    what: "CSV with a byte-order mark, CRLF, quoted line breaks and an unannounced delimiter; JSON and NDJSON with nested objects flattened to dotted paths.",
    decision: "A parser written for this, scanning char codes and slicing, so a field is copied once. Row and line numbers are kept, because lineage needs them later.",
    files: ["src/core/csv.ts", "src/core/json.ts", "src/core/ingest.ts"],
  },
  {
    stage: "Profile",
    what: "Per column: inferred type, filled share, null tokens, format masks, top values, and the distinct count both exactly and by HyperLogLog.",
    decision: `At ten thousand rows HyperLogLog is not needed; it is there so profiling a multi-million-row export stays at 4 KB per column. Showing the exact count next to it keeps it honest: ${pct(report.hll.meanAbsError)} mean error here.`,
    files: ["src/core/profile.ts", "src/core/hll.ts"],
  },
  {
    stage: "PII",
    what: "Emails, phones, card numbers, IBANs and birth dates, inside free text as well as in their own columns. A policy per type: mask, keep, or replace with an HMAC-SHA256 token.",
    decision: `Checks before trust: Luhn and a network prefix for cards, mod-97 and the country's length for IBANs, a keyword for birth dates. Precision ${pct(report.pii.validated.overall.precision)} against ${pct(report.pii.regexOnly.overall.precision)} for the same patterns without checks. Tokens are keyed, so the same email joins across sources without being readable.`,
    files: ["src/core/pii.ts", "src/core/checks.ts"],
  },
  {
    stage: "Map",
    what: "Every column scored against 17 canonical fields on its header words and its values, then a one-to-one assignment by the Hungarian algorithm, with an explicit “unmapped” choice.",
    decision: "Values can carry a vague header (“Region” full of country names maps to country), and a header loses when its values contradict it. Overrides re-run every later stage. Exports as YAML and as SQL CREATE VIEW statements.",
    files: ["src/core/mapping.ts", "src/core/schema.ts"],
  },
  {
    stage: "Normalize",
    what: "Phones to E.164, dates to ISO 8601, money to EUR, emails lowercased with +tags removed, names recased, company suffixes and street abbreviations folded for comparison.",
    decision: `Day-first or month-first is decided per column from its unambiguous values; ${int(report.normalize.dates.ambiguous)} dates that could be read both ways are flagged, not silently guessed. Currency uses a fixed, labelled demo rate table, not live rates.`,
    files: ["src/core/normalize.ts", "src/core/records.ts"],
  },
  {
    stage: "Contracts",
    what: `${report.contracts.rules.length} declarative rules: not null, regex, range, allowed values, uniqueness, and agreement across sources. Two of them quarantine; the rest warn.`,
    decision: `A record that is nobody (no surname, email or phone) or a test row stays out of matching and out of the table, where a reviewer can see it. Here that caught ${report.contracts.junkCaught} of the ${report.contracts.junkTotal} planted test and spam rows.`,
    files: ["src/core/contracts.ts"],
  },
  {
    stage: "Resolve",
    what: "Seven blocking keys, seven field comparators, Fellegi-Sunter weights with m learned by EM, term-frequency adjustment, two guard rules, and union-find that respects cannot-link constraints. Pairs between two thresholds go to a review queue.",
    decision: "Every merge can be explained field by field, and the uncertain middle goes to a person instead of being guessed. The cost is a few points of F1 that a trained classifier with labelled pairs might add.",
    files: ["src/core/blocking.ts", "src/core/compare.ts", "src/core/fs.ts", "src/core/er.ts"],
  },
  {
    stage: "Golden",
    what: "One row per customer. Survivorship per field (most frequent, most recent, most complete, source priority, earliest), with the source file, row and column of every value.",
    decision: "Name and address survive as units, so a golden record never pairs one system’s street with another’s postcode. Rules can be changed per field and re-run instantly.",
    files: ["src/core/golden.ts"],
  },
];

export default function Architecture() {
  return (
    <>
      <div className="scroll-x" tabIndex={0} role="region" aria-label="Pipeline stages">
        <table className="arch">
          <thead>
            <tr>
              <th>Stage</th>
              <th>What it does</th>
              <th>Decision and trade-off</th>
              <th>Code</th>
            </tr>
          </thead>
          <tbody>
            {STAGE_ROWS.map((r) => (
              <tr key={r.stage}>
                <th>{r.stage}</th>
                <td data-label="What it does">{r.what}</td>
                <td data-label="Decision and trade-off">{r.decision}</td>
                <td className="files" data-label="Code">
                  {r.files.map((f) => (
                    <a key={f} href={file(f)} className="mono">
                      {f.replace("src/core/", "")}
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="why-grid">
        <article className="card">
          <h3>Why Fellegi-Sunter, with EM</h3>
          <p>
            A new customer&rsquo;s exports come without labels. Fellegi-Sunter needs none: for each field it compares how often true matches agree (m) with how often random pairs agree (u), and turns the ratio into a weight. Expectation-maximisation estimates m from the {int(er.blocking.candidates)} unlabelled candidate pairs in {er.em.iterations} iterations; u comes from {int(er.em.uSample)} random pairs.
          </p>
          <p>
            The weights add up, so the explanation of a match is the same sum the model used to decide it. That matters when the customer asks why two of their records were merged. A classifier trained on labelled pairs might add a few points, but it would need labels this customer does not have yet.
          </p>
          <p className="muted small">
            Why u does not come from EM: the non-matches that survive blocking already share a name sound or a mailbox, so agreement among them is common, and EM&rsquo;s u would make agreement look weaker than it is across the whole table.
          </p>
        </article>
        <article className="card">
          <h3>Why blocking</h3>
          <p>
            Comparing every pair of {int(report.records)} records means {int(er.blocking.totalPairs)} comparisons. Seven cheap keys (same email, same phone, name sound, surname and postcode, mailbox name, nickname root and surname, birth date and initial) leave {int(er.blocking.candidates)} candidate pairs: {pct(er.blocking.reductionRatio, 2)} are never compared, and {pct(er.blocking.pairsCompleteness)} of the true matching pairs are still among the candidates.
          </p>
          <p>Each key catches what the others miss. A changed email breaks the email key but not the phone key; a nickname breaks the name key but not the mailbox key. Blocks over 120 records are skipped and reported, so one shared switchboard number cannot turn into thousands of pairs.</p>
        </article>
        <article className="card">
          <h3>Why guard rules</h3>
          <p>
            Households and colleagues share an address, a surname, sometimes a phone. Weights add up, so two people at one address can score past the threshold. Two guards, first names that differ (not a nickname, typo or swap) and birth dates that differ, stop a pair from merging on its own and act as cannot-link constraints in union-find, so a chain of strong pairs cannot join two people through a third record.
          </p>
          <p>
            Effect on the numbers: pairwise precision {pct(m["fs-tf"].pairwise.precision)} → {pct(m.onboard.pairwise.precision)}, recall {pct(m["fs-tf"].pairwise.recall)} → {pct(m.onboard.pairwise.recall)}, F1 {f3(m["fs-tf"].pairwise.f1)} → {f3(m.onboard.pairwise.f1)}. Guarded pairs above the review threshold wait in the review queue.
          </p>
        </article>
      </div>

      <div className="limits card">
        <h3>Limits, plainly</h3>
        <ul>
          <li>The demo data is synthetic, generated from the seed &ldquo;{report.seed}&rdquo;. It was built to be messy in the ways real exports are, but real data will find cases it does not have.</li>
          <li>Currency conversion uses a fixed table of demo rates, labelled as such. A real deployment would take dated rates from the finance system.</li>
          <li>The PII checks were tuned while reading this generator&rsquo;s notes, so the near-perfect detection figures will not hold on real free text, which carries patterns the generator never wrote. Across the {report.seeds.length} seeds PII F1 is {report.seedSummary.piiF1.min.toFixed(4)}–{report.seedSummary.piiF1.max.toFixed(4)} on data from the same generator.</li>
          <li>The review-queue figure assumes every queued pair is answered correctly; real reviewers make mistakes.</li>
          <li>Everything runs in one Web Worker. Around a few hundred thousand records the browser is the wrong place; the same stages would move to a batch job.</li>
          <li>The nickname list, phone plans and country names cover the eight countries in the demo, not the world.</li>
        </ul>
      </div>
    </>
  );
}
