import { useEffect, useState } from "react";
import { Engine, timed } from "../search/engine";
import type { EvalReport, Meta } from "../search/types";
import { fmt, mb, ms, pct } from "./format";

/** Times the semantic stage with the WebAssembly kernel and with the plain JavaScript loop, on this device. */
function useKernelRace(meta: Meta, engine: Engine) {
  const [race, setRace] = useState<{ simd: number; js: number } | null>(null);
  useEffect(() => {
    if (engine.kernelName === "JavaScript") return;
    const id = setTimeout(() => {
      const plain = new Engine(meta, engine.ix);
      const q = "publish an event only if the write commits";
      for (let i = 0; i < 30; i++) engine.lsa(q), plain.lsa(q);
      setRace({ simd: timed(() => engine.lsa(q), 60).ms, js: timed(() => plain.lsa(q), 60).ms });
    }, 1200);
    return () => clearTimeout(id);
  }, [meta, engine]);
  return race;
}

const BYTES = { u8: 1, i8: 1, u16: 2, u32: 4, f32: 4 } as const;

const GROUPS: { label: string; sections: string[]; cls: string; note: string }[] = [
  { label: "Postings", sections: ["offsets", "docs", "tfs", "lens"], cls: "g-kw", note: "inverted index for BM25" },
  { label: "Passage vectors", sections: ["C"], cls: "g-sem", note: "one int8 vector per passage" },
  { label: "Term vectors", sections: ["V", "vScale"], cls: "g-sem2", note: "fold-in matrix for queries" },
];

export default function Architecture({ meta, engine, report }: { meta: Meta; engine: Engine; report: EvalReport | null }) {
  const s = meta.stats;
  const race = useKernelRace(meta, engine);
  const bytes = (name: string) => {
    const sec = meta.sections.find((x) => x.name === name);
    return sec ? sec.length * BYTES[sec.type] : 0;
  };
  const groups = GROUPS.map((g) => ({ ...g, bytes: g.sections.reduce((a, n) => a + bytes(n), 0) }));
  const total = groups.reduce((a, g) => a + g.bytes, 0);
  const sum = report?.summary;

  const steps = [
    {
      n: "Parse",
      t: s.parseSeconds,
      body: `${meta.posts.length} rendered HTML posts become plain text. KaTeX is reduced to its MathML text, tables to one line per row, and code keeps its line breaks.`,
    },
    {
      n: "Chunk",
      body: `Posts split at their headings, then into ${fmt(s.window)}-character windows with ${s.overlap} of overlap: ${fmt(meta.chunks.length)} passages. Each is indexed with its post title and heading path, so a deep section still matches its subject.`,
    },
    {
      n: "Index",
      t: s.indexSeconds,
      body: `A BM25 inverted index (k1 ${meta.bm25.k1}, b ${meta.bm25.b}) over ${fmt(s.vocabulary)} terms and ${fmt(s.postings)} postings, laid out as flat typed arrays.`,
    },
    {
      n: "Embed",
      t: s.svdSeconds,
      body: `A ${fmt(meta.chunks.length)} × ${fmt(s.lsaVocabulary)} TF-IDF matrix reduced to ${meta.lsa.k} dimensions by a randomized truncated SVD I wrote from scratch (Halko et al., with a Jacobi eigensolver). It keeps ${pct(s.variance)} of the variance.`,
    },
    {
      n: "Pack",
      body: `Vectors are quantized to int8 with a per-row scale and everything goes into one ${mb(s.indexBytes)} binary. The browser reads it through typed-array views, with no parsing step.`,
    },
  ];

  const decisions = [
    {
      q: "Why not a neural embedding model?",
      a: "The index had to build anywhere in plain TypeScript and run with no server. A from-scratch SVD needs no model download, and its vectors cost well under a megabyte, where even a small transformer would add tens of megabytes to the page.",
    },
    {
      q: "Why fuse ranks instead of scores?",
      a: "BM25 scores are unbounded while cosines sit between −1 and 1, so a weighted sum would need tuning for this corpus. Reciprocal rank fusion only looks at ranks and needs no tuning.",
      proof: sum && `Top-1 accuracy: fused ${pct(sum.hybrid.hit1)}, keyword ${pct(sum.bm25.hit1)}, meaning ${pct(sum.lsa.hit1)}.`,
    },
    {
      q: "Why int8 vectors and a WebAssembly kernel?",
      a: `int8 is a quarter of the size of float32, and the semantic stage becomes ${fmt(meta.chunks.length * meta.lsa.k)} integer multiply-adds per query. A 20-line C kernel compiled to WebAssembly does them 16 at a time with SIMD. The query is quantized to int16 and the sums are exact, so the kernel and the JavaScript fallback rank bit for bit the same.`,
      proof: race && `Semantic stage on this device: JavaScript ${ms(race.js)}, WebAssembly SIMD ${ms(race.simd)} (${(race.js / race.simd).toFixed(1)}× faster).`,
    },
    {
      q: "How do I know a change helps?",
      a: "Every build reruns the 60-question benchmark and writes the report this page shows, so a tokenizer or chunking change shows up as a number rather than a hunch. Tests check the heap-based top-k against a full sort and the kernel against the JavaScript loop.",
    },
  ];

  return (
    <section className="section arch" id="architecture">
      <div className="section-head">
        <p className="eyebrow">Architecture</p>
        <h2>Built once at deploy, queried entirely client-side</h2>
        <p className="lede">The build is plain TypeScript whose only library is an HTML parser; the linear algebra is my own. In the browser, the engine is a few hundred lines of TypeScript plus a WebAssembly kernel under 1 KB, and React draws the page.</p>
      </div>

      <ol className="build">
        {steps.map((st, i) => (
          <li key={st.n}>
            <div className="build-n mono">{String(i + 1).padStart(2, "0")}</div>
            <div className="build-name">
              {st.n}
              {st.t !== undefined && <span className="mono muted"> {st.t < 1 ? `${Math.round(st.t * 1000)} ms` : `${st.t.toFixed(1)} s`}</span>}
            </div>
            <p>{st.body}</p>
          </li>
        ))}
      </ol>

      <div className="composition">
        <div className="comp-head">
          <span>What is in the {mb(s.indexBytes)} index</span>
          <span className="muted">passage text is not in it; it loads per post when you open a result</span>
        </div>
        <div className="comp-bar">
          {groups.map((g) => (
            <span key={g.label} className={g.cls} style={{ width: `${(g.bytes / total) * 100}%` }} title={`${g.label}: ${mb(g.bytes)}`} />
          ))}
        </div>
        <ul className="comp-legend">
          {groups.map((g) => (
            <li key={g.label}>
              <i className={g.cls} />
              <b>{g.label}</b> <span className="mono">{mb(g.bytes)}</span> <span className="muted">{g.note}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="decisions">
        {decisions.map((d) => (
          <div key={d.q} className="decision">
            <h3>{d.q}</h3>
            <p>{d.a}</p>
            {d.proof && <p className="decision-proof mono">{d.proof}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
