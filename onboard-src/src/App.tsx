import { lazy, Suspense, useEffect } from "react";
import dataset from "./generated/dataset.json";
import report from "./generated/eval.json";
import { client, useClient } from "./client";
import { int, pct } from "./format";
import FlowBoard, { TimingStrip } from "./ui/FlowBoard";
import Spotlight from "./ui/Spotlight";
import BeforeAfter from "./ui/BeforeAfter";
import DropZone from "./ui/DropZone";
import Numbers from "./ui/Numbers";
import Architecture from "./ui/Architecture";

const Inspector = lazy(() => import("./ui/Inspector"));

const SOURCE = "https://github.com/InvokFung/invokfung.github.io/tree/main/onboard-src";

function Status() {
  const st = useClient();
  const o = st.overview;
  if (st.phase === "error") return <p className="status bad">The pipeline stopped: {st.detail}</p>;
  if (o?.mode === "files")
    return (
      <p className="status">
        <span className="pill">your files</span> {o.sources.map((s) => s.name).join(", ")}: processed in this tab, never uploaded.
      </p>
    );
  const verified = o?.verified;
  return (
    <p className="status">
      <span className="pill">synthetic data</span> {int(dataset.customers)} fictional customers, {int(dataset.records)} records in three files, generated in your browser from the seed <code>&ldquo;{dataset.seed}&rdquo;</code>.{" "}
      {verified ? (
        verified.every((v) => v.ok) ? (
          <span className="ok" title={verified.map((v) => `${v.name} ${v.sha256}`).join("\n")}>
            SHA-256 of all three files matches the build manifest.
          </span>
        ) : (
          <span className="warn">The regenerated files differ from the build manifest.</span>
        )
      ) : (
        <span className="muted">{st.phase === "generating" ? "Generating…" : st.phase === "verifying" ? "Checking hashes…" : st.phase === "running" ? "Running the pipeline…" : "Starting…"}</span>
      )}
    </p>
  );
}

export default function App() {
  const st = useClient();
  useEffect(() => {
    if (client.state.phase === "idle") void client.runDemo();
  }, []);
  const onboard = report.er.methods.find((m) => m.key === "onboard")!;
  const baseline = report.er.methods.find((m) => m.key === "email-raw")!;
  return (
    <>
      <a className="skip" href="#demo">
        Skip to the demo
      </a>
      <header className="top">
        <a className="brand" href="#demo" aria-label="Onboard, back to the top">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M3 6h6M3 12h6M3 18h6M9 6c5 0 5 6 9 6M9 18c5 0 5-6 9-6M9 12h12" fill="none" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Onboard
        </a>
        <nav aria-label="Sections">
          <a href="#customer">One customer</a>
          <a href="#inspect">Stages</a>
          <a href="#numbers">Numbers</a>
          <a href="#how">How it works</a>
          <a href={SOURCE}>Source</a>
        </nav>
        <span className={`run-state is-${st.phase}`} aria-live="polite">
          <i />
          {st.phase === "ready" ? (st.busy ? "re-running…" : "ready") : st.phase === "error" ? "stopped" : "running"}
        </span>
      </header>

      <main>
        <section className="hero" id="demo" aria-labelledby="pitch">
          <div className="hero-text">
            <h1 id="pitch">Messy customer exports in, one trustworthy customer table out, in your browser.</h1>
            <p className="lede">
              A CRM, a billing system and a help desk export the same customers with different columns, formats and spellings. Onboard parses, profiles, scans for personal data, maps, cleans, checks, matches and merges them in a Web Worker in this tab, and shows its work at every step.
            </p>
            <Status />
          </div>
          <FlowBoard />
          <TimingStrip st={st} nodeMedian={report.throughput.medianMs} nodeStages={report.throughput.stages} />
          <DropZone />
        </section>

        <section className="section" id="customer" aria-labelledby="h-customer">
          <div className="section-head">
            <h2 id="h-customer">Follow one customer</h2>
            <p>The records one person left in three systems, the match graph that joined them, and the golden record built from them. Pick another customer, move the threshold, or change a survivorship rule.</p>
          </div>
          <Spotlight />
        </section>

        <section className="section" id="before-after" aria-labelledby="h-ba">
          <div className="section-head">
            <h2 id="h-ba">Before and after</h2>
            <p>The same customers as the three systems exported them, and as one row each in the golden table. Hover a row to find its counterparts.</p>
          </div>
          <BeforeAfter />
        </section>

        <section className="section" id="inspect" aria-labelledby="h-inspect">
          <div className="section-head">
            <h2 id="h-inspect">Inside each stage</h2>
            <p>Each stage&rsquo;s own output, live from the worker. Decisions you make here, such as a mapping override or a review answer, re-run the stages after it.</p>
          </div>
          <Suspense fallback={<div className="spot-skeleton">Loading…</div>}>
            <Inspector />
          </Suspense>
        </section>

        <section className="section" id="demonstrates" aria-labelledby="h-demo">
          <div className="section-head">
            <h2 id="h-demo">What this demonstrates</h2>
          </div>
          <ul className="demonstrates">
            <li>
              <b>The first week with a new customer&rsquo;s data.</b> Three exports that disagree on columns, date formats, phone formats, currencies and spellings become one table with a known schema, in about a second.
            </li>
            <li>
              <b>Matching you can explain to the customer.</b> Every merge shows the evidence per field, guard rules keep households and colleagues apart, and uncertain pairs wait for a person instead of being guessed.
            </li>
            <li>
              <b>Personal data handled first.</b> PII is found and checked (Luhn, IBAN checksums, context) before anything else sees it, then masked or replaced with keyed tokens. Nothing leaves the browser.
            </li>
            <li>
              <b>Contracts and lineage.</b> Rules with pass and fail counts, a quarantine for records that are nobody or a test, and every golden value traced to its file, row and column.
            </li>
            <li>
              <b>Measured, with a baseline.</b> Scored against ground truth the pipeline never sees: pairwise F1 {onboard.pairwise.f1.toFixed(3)} against {baseline.pairwise.f1.toFixed(3)} for matching on email alone, across {report.seeds.length} seeds, with mapping and PII accuracy alongside ({pct(report.mapping.accuracy)} and {pct(report.pii.validated.overall.precision)} precision).
            </li>
          </ul>
        </section>

        <section className="section" id="numbers" aria-labelledby="h-numbers">
          <div className="section-head">
            <h2 id="h-numbers">Measured, not guessed</h2>
            <p>
              <code>npm run eval</code> regenerates the data, runs the pipeline and scores every stage against the generator&rsquo;s truth. These figures are imported from its output, <code>eval.json</code>, at build time.
            </p>
          </div>
          <Numbers />
        </section>

        <section className="section" id="how" aria-labelledby="h-how">
          <div className="section-head">
            <h2 id="h-how">How it works</h2>
            <p>Eight stages, each a typed module with its own tests, shared by the page and by the evaluation script, so both measure the same code.</p>
          </div>
          <Architecture />
        </section>

        <section className="section" id="stack" aria-labelledby="h-stack">
          <div className="section-head">
            <h2 id="h-stack">Stack</h2>
          </div>
          <div className="stack">
            <div>
              <h3 className="label">Runs on</h3>
              <p>TypeScript, React 19 and Vite. The pipeline runs in one Web Worker; SHA-256 and HMAC-SHA256 come from WebCrypto. Charts and graphs are plain SVG and CSS.</p>
            </div>
            <div>
              <h3 className="label">Written for this project</h3>
              <p>CSV parser, JSON flattening, HyperLogLog and MurmurHash3, Luhn and IBAN checks, Jaro-Winkler, Soundex, the Hungarian algorithm, EM for Fellegi-Sunter, constrained union-find, survivorship, the SQL engine and the seeded data generator. React is the only runtime dependency.</p>
            </div>
            <div>
              <h3 className="label">Checked by</h3>
              <p>
                <code>npm test</code> (node:test): CSV edge cases and a round-trip fuzz, Luhn and IBAN, HyperLogLog bounds, Jaro-Winkler reference values, EM convergence, union-find and constrained clustering, survivorship and lineage, the SQL engine. <code>npm run all</code> runs data, eval, tests and build.
              </p>
            </div>
          </div>
          <p className="source-link">
            <a href={SOURCE} className="btn">
              Read the source on GitHub
            </a>
          </p>
        </section>
      </main>

      <footer className="foot">
        <p>
          Built by Alan Fung. <a href={SOURCE}>Source</a> · <a href="/">More projects</a>
        </p>
        <p className="muted small">All names, companies, emails, phone numbers, cards and IBANs on this page are synthetic.</p>
      </footer>
    </>
  );
}
