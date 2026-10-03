import { memo, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_PARAMS, type SliceParams } from "../core/abi";
import { BED, signedVolume, size, type Bounds, type Mesh } from "../mesh/mesh";
import { SAMPLES } from "../mesh/samples";
import { fmt } from "./format";

interface Setting {
  key: keyof SliceParams;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  show?: (v: number) => string;
  hint?: string;
}

const MAIN: Setting[] = [
  { key: "layerHeight", label: "Layer height", min: 0.08, max: 0.4, step: 0.02, unit: "mm", show: (v) => v.toFixed(2) },
  { key: "lineWidth", label: "Line width", min: 0.3, max: 0.8, step: 0.01, unit: "mm", show: (v) => v.toFixed(2) },
  { key: "perimeters", label: "Walls", min: 1, max: 6, step: 1 },
  { key: "infillDensity", label: "Infill density", min: 0, max: 1, step: 0.05, unit: "%", show: (v) => String(Math.round(v * 100)) },
  { key: "infillAngle", label: "Infill angle", min: 0, max: 90, step: 5, unit: "°" },
  { key: "topLayers", label: "Top solid layers", min: 0, max: 8, step: 1 },
  { key: "bottomLayers", label: "Bottom solid layers", min: 0, max: 7, step: 1 },
];

const ADVANCED: Setting[] = [
  { key: "firstLayerHeight", label: "First layer height", min: 0.1, max: 0.4, step: 0.02, unit: "mm", show: (v) => v.toFixed(2) },
  { key: "skirtLoops", label: "Skirt loops", min: 0, max: 4, step: 1 },
  { key: "skirtDistance", label: "Skirt distance", min: 1, max: 12, step: 0.5, unit: "mm", show: (v) => v.toFixed(1) },
  { key: "infillOverlap", label: "Infill overlap", min: 0, max: 0.5, step: 0.05, unit: "%", show: (v) => String(Math.round(v * 100)) },
  { key: "resolution", label: "Contour tolerance", min: 0, max: 0.05, step: 0.0025, unit: "mm", show: (v) => v.toFixed(4) },
];

const ICONS: Record<string, ReactNode> = {
  cube: <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Zm0 0v0M4 7.5l8 4.5 8-4.5M12 12v9" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
      <circle cx="12" cy="12" r="6.5" />
    </>
  ),
  torus: (
    <>
      <ellipse cx="12" cy="12" rx="9" ry="5.5" />
      <ellipse cx="12" cy="11.4" rx="3.6" ry="1.8" />
    </>
  ),
  vase: <path d="M9 3h6M9.5 3c0 3-4 4.5-4 9.5 0 4.5 2.5 8.5 6.5 8.5s6.5-4 6.5-8.5c0-5-4-6.5-4-9.5" />,
};

function Slider({ s, value, onChange }: { s: Setting; value: number; onChange(v: number): void }) {
  const id = `set-${s.key}`;
  const pct = ((value - s.min) / (s.max - s.min)) * 100;
  return (
    <div className="field">
      <label htmlFor={id}>
        <span>{s.label}</span>
        <output htmlFor={id} className="mono">
          {s.show ? s.show(value) : value}
          {s.unit && <small>{s.unit}</small>}
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={s.min}
        max={s.max}
        step={s.step}
        value={value}
        style={{ ["--p" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export interface ModelPanelProps {
  mesh: Mesh | null;
  box: Bounds | null;
  sampleId: string | null;
  params: SliceParams;
  loadError: string | null;
  onSample(id: string): void;
  onFile(file: File): void;
  onParams(p: SliceParams): void;
}

export default memo(function ModelPanel({ mesh, box, sampleId, params, loadError, onSample, onFile, onParams }: ModelPanelProps) {
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const dims = box ? size(box) : null;
  const volume = useMemo(() => (mesh ? Math.abs(signedVolume(mesh.positions)) / 1000 : 0), [mesh]);
  const fits = dims ? dims[0] <= BED.x && dims[1] <= BED.y && dims[2] <= BED.z : true;
  const set = (k: keyof SliceParams, v: number) => onParams({ ...params, [k]: v });
  const changed = (Object.keys(DEFAULT_PARAMS) as (keyof SliceParams)[]).some((k) => Math.abs(params[k] - DEFAULT_PARAMS[k]) > 1e-9);

  return (
    <aside className="panel left" aria-label="Model and slicing settings">
      <section>
        <h2 className="label">Model</h2>
        <div className="samples" role="group" aria-label="Sample models">
          {SAMPLES.map((s) => (
            <button key={s.id} className={s.id === sampleId ? "on" : ""} aria-pressed={s.id === sampleId} onClick={() => onSample(s.id)} title={s.blurb}>
              <svg viewBox="0 0 24 24" aria-hidden>
                {ICONS[s.id]}
              </svg>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div
          className={`drop${over ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 15V4m0 0-4 4m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
          </svg>
          <span>
            Drop an STL here or{" "}
            <button className="link" onClick={() => file.current?.click()}>
              browse
            </button>
          </span>
          <input
            ref={file}
            type="file"
            accept=".stl,model/stl,application/sla"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {loadError && (
          <p className="error" role="alert">
            {loadError}
          </p>
        )}
        {mesh && dims && (
          <dl className="facts">
            <div className="wide">
              <dt>Name</dt>
              <dd title={mesh.name}>{mesh.name}</dd>
            </div>
            <div>
              <dt>Triangles</dt>
              <dd className="mono">{fmt(mesh.positions.length / 9)}</dd>
            </div>
            <div>
              <dt>Volume</dt>
              <dd className="mono">{volume.toFixed(2)} cm³</dd>
            </div>
            <div className="wide">
              <dt>Size, placed on the bed</dt>
              <dd className="mono">
                {dims[0].toFixed(1)} × {dims[1].toFixed(1)} × {dims[2].toFixed(1)} mm
              </dd>
            </div>
          </dl>
        )}
        {!fits && <p className="warn">Larger than the 220 × 220 × 250 mm build volume; it is sliced anyway.</p>}
      </section>

      <section>
        <div className="row-head">
          <h2 className="label">Slicing</h2>
          {changed && (
            <button className="link small" onClick={() => onParams(DEFAULT_PARAMS)}>
              Reset
            </button>
          )}
        </div>
        {MAIN.map((s) => (
          <Slider key={s.key} s={s} value={params[s.key]} onChange={(v) => set(s.key, v)} />
        ))}
        <details className="advanced">
          <summary>Advanced</summary>
          {ADVANCED.map((s) => (
            <Slider key={s.key} s={s} value={params[s.key]} onChange={(v) => set(s.key, v)} />
          ))}
        </details>
      </section>
    </aside>
  );
});
