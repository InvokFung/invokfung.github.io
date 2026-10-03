// Bring your own exports: files are read with the File API and handed to the
// worker in this tab. There is no server to send them to.

import { useRef, useState } from "react";
import { client, useClient } from "../client";
import type { SourceFile } from "../core/types";
import { bytes } from "../format";

const OK = /\.(csv|tsv|txt|json|ndjson|jsonl)$/i;
const MAX = 40 * 1024 * 1024;

export default function DropZone() {
  const st = useClient();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const take = async (list: FileList | File[]) => {
    const files = Array.from(list);
    const bad = files.filter((f) => !OK.test(f.name));
    if (bad.length) return setMsg(`Only CSV, TSV and JSON/NDJSON files: ${bad.map((f) => f.name).join(", ")}`);
    const total = files.reduce((a, f) => a + f.size, 0);
    if (!files.length) return;
    if (total > MAX) return setMsg(`That is ${bytes(total)}; this page handles up to ${bytes(MAX)} at once.`);
    setMsg(null);
    const sources: SourceFile[] = await Promise.all(
      files.slice(0, 6).map(async (f, i) => ({ id: `file-${i + 1}`, label: f.name.replace(/\.[^.]+$/, ""), name: f.name, text: await f.text() })),
    );
    void client.runFiles(sources);
    document.getElementById("demo")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const isFiles = st.overview?.mode === "files";
  return (
    <div
      className={`drop ${over ? "is-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void take(e.dataTransfer.files);
      }}
    >
      <div className="drop-text">
        <b>Try it on your own export.</b> Drop up to six CSV or JSON files here, or{" "}
        <button className="linkish" onClick={() => input.current?.click()}>
          choose files
        </button>
        . They are read and processed inside this browser tab; nothing is uploaded, and closing the tab discards them.
        {msg && <span className="warn"> {msg}</span>}
      </div>
      {isFiles && (
        <button className="btn ghost small" onClick={() => void client.runDemo()}>
          Back to the synthetic data
        </button>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept=".csv,.tsv,.txt,.json,.ndjson,.jsonl"
        hidden
        onChange={(e) => {
          if (e.target.files) void take(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
