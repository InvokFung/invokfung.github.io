import { memo } from "react";
import type { Stats } from "../core/abi";
import { KIND_LABEL, type Estimate } from "../gcode/gcode";
import { duration, fmt, metres, ms } from "./format";
import { KIND_COLORS, TRAVEL_COLOR } from "./theme";

export interface PrintPanelProps {
  ready: boolean;
  streaming: boolean;
  received: number;
  total: number;
  stats: Stats | null;
  estimate: Estimate | null;
  sliceMs: number;
  firstLayerMs: number;
  layerHeight: number;
  visible: boolean[];
  exporting: boolean;
  exported: number | null;
  onToggle(kind: number): void;
  onExport(): void;
}

const STAGES: { key: keyof Stats; label: string }[] = [
  { key: "msSetup", label: "Buckets" },
  { key: "msContours", label: "Contours" },
  { key: "msWalls", label: "Walls" },
  { key: "msSkins", label: "Skins" },
  { key: "msInfill", label: "Infill" },
  { key: "msOrder", label: "Order" },
];

export default memo(function PrintPanel(p: PrintPanelProps) {
  const e = p.estimate,
    st = p.stats;
  const busy = p.streaming || !e;
  const stageTotal = st ? STAGES.reduce((a, s) => a + st[s.key], 0) : 0;

  return (
    <aside className="panel right" aria-label="Print estimate and toolpaths">
      <section>
        <h2 className="label">Print</h2>
        <div className={`estimate${busy ? " busy" : ""}`} aria-live="polite">
          <div className="big mono">{e ? duration(e.seconds) : "—"}</div>
          <div className="sub">
            <span className="mono">{e ? `${(e.filamentMm / 1000).toFixed(2)} m` : "–"}</span>
            <span className="muted"> · </span>
            <span className="mono">{e ? `${e.filamentGrams.toFixed(1)} g` : "–"}</span>
            <span className="muted"> PLA</span>
          </div>
          <div className="sub muted">
            <span className="mono">{p.total || "–"}</span> layers at <span className="mono">{p.layerHeight.toFixed(2)}</span> mm
          </div>
        </div>
      </section>

      <section>
        <h2 className="label">Features</h2>
        <ul className="legend">
          {[0, 1, 2, 3, 4, 5].map((k) => {
            const len = e ? e.byKind[k].length : 0;
            return (
              <li key={k}>
                <button aria-pressed={p.visible[k]} className={p.visible[k] ? "" : "off"} onClick={() => p.onToggle(k)}>
                  <i
                    className={k === 5 ? "swatch dash" : "swatch"}
                    style={{ ["--c" as string]: k === 5 ? TRAVEL_COLOR : KIND_COLORS[k] }}
                    aria-hidden
                  />
                  <span>{k === 5 ? "Travel" : KIND_LABEL[k]}</span>
                  <span className="mono muted">{e ? (k === 5 ? `${fmt(e.retractions)} retr.` : metres(len)) : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <button className="primary" disabled={busy || p.exporting} onClick={p.onExport}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
          </svg>
          {p.exporting ? "Writing G-code…" : "Export G-code"}
        </button>
        <p className="note muted">
          Marlin flavour, relative E, 1.75 mm PLA.
          {p.exported !== null && <span className="mono"> Last file {fmt(p.exported / 1024, 0)} KB.</span>}
        </p>
      </section>

      <section>
        <div className="row-head">
          <h2 className="label">Slice on this device</h2>
          <span className="mono hl">{st && !p.streaming ? ms(p.sliceMs) : p.streaming ? `${p.received}/${p.total}` : "–"}</span>
        </div>
        <div className="stages" aria-label="Time per stage">
          {STAGES.map((s) => {
            const v = st ? st[s.key] : 0;
            return (
              <div key={s.key} className="stage">
                <span>{s.label}</span>
                <span className="bar">
                  <i style={{ width: `${stageTotal ? Math.max(1.5, (v / stageTotal) * 100) : 0}%` }} />
                </span>
                <span className="mono">{st ? ms(v) : "–"}</span>
              </div>
            );
          })}
        </div>
        {st && (
          <p className="note muted">
            First layer on screen after <span className="mono">{ms(p.firstLayerMs)}</span>. <span className="mono">{fmt(st.loops)}</span> loops,{" "}
            <span className="mono">{fmt(st.holes)}</span> holes, <span className="mono">{fmt(st.reused)}</span> layers reused,{" "}
            <span className="mono">{fmt(st.repaired + st.dropped)}</span> broken chains.
          </p>
        )}
      </section>
    </aside>
  );
});
