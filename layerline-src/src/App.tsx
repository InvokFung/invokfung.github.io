import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PARAMS, type SliceParams } from "./core/abi";
import { bounds, placeOnBed, type Mesh } from "./mesh/mesh";
import { SAMPLES } from "./mesh/samples";
import { parseStl } from "./mesh/stl";
import Dock from "./ui/Dock";
import { duration, kb, ms } from "./ui/format";
import ModelPanel from "./ui/ModelPanel";
import PrintPanel from "./ui/PrintPanel";
import { Architecture, HowItWorks, Measured, SOURCE, TESTS } from "./ui/Sections";
import { useSlicer } from "./useSlicer";
import Viewer, { newPlayback } from "./viewer/Viewer";

const FIRST = "gear";
const loadSample = (id: string) => placeOnBed(SAMPLES.find((s) => s.id === id)!.make());

export default function App() {
  const [sampleId, setSampleId] = useState<string | null>(FIRST);
  const [mesh, setMesh] = useState<Mesh>(() => loadSample(FIRST));
  const [modelSeq, setModelSeq] = useState(0);
  const [params, setParams] = useState<SliceParams>(DEFAULT_PARAMS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [layer, setLayer] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [mode, setMode] = useState<"preview" | "model">("preview");
  const [visible, setVisible] = useState([true, true, true, true, true, true]);
  const [ghost, setGhost] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(25);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const playback = useRef(newPlayback()).current;
  const clockRef = useRef<HTMLSpanElement>(null);
  const box = useMemo(() => bounds(mesh.positions), [mesh]);

  // A new model sweeps up from the first layer as layers stream in; a new
  // setting on the same model keeps the section at the same height.
  const fresh = useRef(true);
  const keepZ = useRef(0);
  const revealPos = useRef(0);
  const onStart = useCallback(
    (total: number) => {
      playback.playing = false;
      setPlaying(false);
      if (fresh.current) {
        fresh.current = false;
        revealPos.current = 0;
        setLayer(0);
        setReveal(true);
      } else {
        const first = params.firstLayerHeight,
          h = params.layerHeight;
        setLayer(Math.max(0, Math.min(total - 1, Math.round((keepZ.current - first) / h))));
      }
    },
    [params, playback],
  );
  const { state, slice, gcode, bench } = useSlicer(onStart);
  const { store, received, total } = state;
  const shown = received > 0 ? Math.max(0, Math.min(layer, received - 1)) : 0;
  const z = store && received > 0 ? store.tp.layerZ[shown] : 0;
  if (received > 0) keepZ.current = z;

  // Slice on every change: right away for a new model, debounced while a slider moves.
  useEffect(() => {
    const t = setTimeout(() => slice(mesh, params), fresh.current ? 0 : 200);
    return () => clearTimeout(t);
  }, [mesh, params, slice]);

  // The reveal: the section rises through the model as fast as layers arrive
  // (at most the whole model in about 1.6 s), then stays on the top layer.
  const live = useRef({ received, total, streaming: state.streaming, failed: !!state.error });
  live.current = { received, total, streaming: state.streaming, failed: !!state.error };
  useEffect(() => {
    if (!reveal) return;
    let raf = 0,
      last = performance.now();
    const tick = (now: number) => {
      const { received, total, streaming, failed } = live.current;
      const rate = Math.max(24, total / 1.6);
      // rAF timestamps can precede the performance.now() taken when the effect ran.
      const dt = Math.max(0, now - last) / 1000;
      revealPos.current = Math.max(0, Math.min(revealPos.current + dt * rate, received - 1));
      last = now;
      setLayer(Math.floor(revealPos.current));
      if (failed || (!streaming && total > 0 && received === total && revealPos.current >= total - 1)) {
        setReveal(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reveal]);

  const scrub = useCallback((l: number) => {
    setReveal(false);
    setTouched(true);
    setLayer(l);
  }, []);

  const pickSample = useCallback((id: string) => {
    fresh.current = true;
    setSampleId(id);
    setLoadError(null);
    setMesh(loadSample(id));
    setModelSeq((n) => n + 1);
    setExported(null);
  }, []);

  const pickFile = useCallback(async (file: File) => {
    try {
      if (file.size > 256 * 1024 * 1024) throw new Error("That file is over 256 MB.");
      const m = placeOnBed(parseStl(await file.arrayBuffer(), file.name.replace(/\.stl$/i, "")));
      if (m.positions.length === 0) throw new Error("The file has no triangles.");
      fresh.current = true;
      setSampleId(null);
      setLoadError(null);
      setMesh(m);
      setModelSeq((n) => n + 1);
      setExported(null);
    } catch (e) {
      setLoadError(`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!store || received === 0) return;
    setReveal(false);
    setTouched(true);
    if (playback.playing) {
      playback.playing = false;
      setPlaying(false);
      return;
    }
    if (!Number.isFinite(playback.t) && shown >= received - 1 && !state.streaming) {
      // At the top and complete: print again from the first layer.
      playback.layer = 0;
      playback.lastProp = 0;
      setLayer(0);
    }
    if (!Number.isFinite(playback.t)) playback.t = 0;
    playback.playing = true;
    setMode("preview");
    setPlaying(true);
  }, [store, received, shown, state.streaming, playback]);

  const onLayer = useCallback(
    (l: number, source: "drag" | "play") => {
      if (source === "drag") scrub(l);
      else setLayer(l);
    },
    [scrub],
  );
  const onPlayEnd = useCallback(() => setPlaying(false), []);

  useEffect(() => {
    playback.speed = speed;
  }, [speed, playback]);

  // Keyboard: arrows / Page keys / Home / End move the section, Space plays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, select, textarea, [contenteditable]")) return;
      if (received === 0) return;
      const step: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
      if (e.key in step) scrub(Math.max(0, Math.min(received - 1, shown + step[e.key])));
      else if (e.key === "Home") scrub(0);
      else if (e.key === "End") scrub(received - 1);
      else if (e.key === " " && !t.closest("button, a, summary")) togglePlay();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [received, shown, scrub, togglePlay]);

  const exportGcode = useCallback(async () => {
    setExporting(true);
    try {
      const bytes = await gcode();
      const url = URL.createObjectURL(new Blob([bytes], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${mesh.name.replace(/[^\w.-]+/g, "-").toLowerCase() || "model"}.gcode`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExported(bytes.byteLength);
    } finally {
      setExporting(false);
    }
  }, [gcode, mesh]);

  const clockBase = useMemo(() => {
    const e = state.estimate;
    if (!e) return null;
    const out = new Float64Array(e.layerSeconds.length + 1);
    let sum = 0;
    for (const s of e.layerSeconds) sum += s;
    out[0] = Math.max(0, e.seconds - sum); // purge line before the first layer
    for (let i = 0; i < e.layerSeconds.length; i++) out[i + 1] = out[i] + e.layerSeconds[i];
    return out;
  }, [state.estimate]);

  const toggleKind = useCallback((k: number) => setVisible((v) => v.map((x, i) => (i === k ? !x : x))), []);
  const runBench = useCallback(() => bench(mesh, 0.2, 5), [bench, mesh]);
  const modelLabel = sampleId ? SAMPLES.find((s) => s.id === sampleId)!.label : "Your model";
  const wasmBytes = state.wasmBytes;

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" title="Back to the portfolio">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 18h16M6 14h12M8 10h8M10 6h4" />
          </svg>
          <span>InvokFung</span>
        </a>
        <span className="crumb" aria-hidden>
          /
        </span>
        <span className="product">Layerline</span>
        <nav aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#numbers">Benchmarks</a>
          <a href="#architecture">Architecture</a>
          <a href={SOURCE} target="_blank" rel="noopener" className="source">
            Source <span aria-hidden>↗</span>
          </a>
        </nav>
      </header>

      <main>
        <div className="first">
          <section className="intro" aria-labelledby="pitch">
            <div className="pitch">
              <p className="eyebrow">Layerline · a 3D-printing slicer in the browser</p>
              <h1 id="pitch">
                STL in, <span className="grad">printer-ready G-code</span> out.
              </h1>
              <p className="lede">
                A freestanding C++ geometry core, compiled to WebAssembly, slices the mesh in a Web Worker and streams toolpaths into this preview layer by layer.
              </p>
            </div>
            <ul className="demonstrates" aria-label="What this demonstrates">
              <li>
                <b>C++ → WebAssembly</b>
                <span>freestanding core, {wasmBytes ? kb(wasmBytes) : "66 KB"}, no Emscripten</span>
              </li>
              <li>
                <b>Computational geometry</b>
                <span>mesh slicing, offsets, N-ary booleans</span>
              </li>
              <li>
                <b>Worker streaming</b>
                <span>layers arrive as they finish, zero-copy</span>
              </li>
              <li>
                <b>Tested</b>
                <span>
                  {TESTS.native + TESTS.node} tests; native and WASM agree bit for bit
                </span>
              </li>
            </ul>
          </section>

          <section className="bench-wrap" id="demo" aria-label="Interactive slicer">
            <Viewer
              mesh={mesh}
              box={box}
              fitKey={String(modelSeq)}
              store={store}
              received={received}
              streaming={state.streaming}
              layer={shown}
              mode={mode}
              visible={visible}
              ghost={ghost}
              lineWidth={state.params?.lineWidth ?? params.lineWidth}
              playback={playback}
              clockBase={clockBase}
              clockRef={clockRef}
              onLayer={onLayer}
              onPlayEnd={onPlayEnd}
            />
            <div className="hud" aria-live="polite">
              {state.error ? (
                <span className="pill error">{state.error}</span>
              ) : !state.ready ? (
                <span className="pill">
                  <i className="dot pulse" /> Compiling the WebAssembly core…
                </span>
              ) : state.streaming ? (
                <span className="pill">
                  <i className="dot pulse" /> Slicing in a worker <b className="mono">{received}</b>
                  <span className="mono muted">/{total || "…"}</span>
                  <span className="meter">
                    <i style={{ width: `${total ? (received / total) * 100 : 0}%` }} />
                  </span>
                </span>
              ) : (
                store && (
                  <span className="pill">
                    <i className="dot" /> Sliced in <b className="mono">{ms(state.ms)}</b>
                    <span className="muted">
                      {" "}
                      · {total} layers · WASM {kb(wasmBytes)}
                    </span>
                  </span>
                )
              )}
              {!touched && store && !state.streaming && <span className="hint">Drag the ◆ handle, use ↑ ↓, or press Space to print</span>}
            </div>
            <ModelPanel
              mesh={mesh}
              box={box}
              sampleId={sampleId}
              params={params}
              loadError={loadError}
              onSample={pickSample}
              onFile={pickFile}
              onParams={setParams}
            />
            <PrintPanel
              ready={state.ready}
              streaming={state.streaming}
              received={received}
              total={total}
              stats={state.stats}
              estimate={state.estimate}
              sliceMs={state.ms}
              firstLayerMs={state.firstLayerMs}
              layerHeight={params.layerHeight}
              visible={visible}
              exporting={exporting}
              exported={exported}
              onToggle={toggleKind}
              onExport={exportGcode}
            />
            <Dock
              layer={shown}
              received={received}
              total={total}
              z={z}
              playing={playing}
              speed={speed}
              mode={mode}
              ghost={ghost}
              hint={!touched && !!state.estimate}
              clockRef={clockRef}
              totalTime={state.estimate && !state.streaming ? duration(state.estimate.seconds) : null}
              onLayer={scrub}
              onPlay={togglePlay}
              onSpeed={setSpeed}
              onMode={setMode}
              onGhost={() => setGhost((g) => !g)}
            />
          </section>
        </div>

        <HowItWorks stats={state.streaming ? null : state.stats} model={modelLabel} sliceMs={state.ms} firstLayerMs={state.firstLayerMs} />
        <Measured wasmBytes={wasmBytes} mesh={mesh} modelLabel={modelLabel} runBench={runBench} />
        <Architecture wasmBytes={wasmBytes} />
      </main>

      <footer className="foot">
        <span>
          Built by <a href="/">Afung (InvokFung)</a>.
        </span>
        <a href={SOURCE} target="_blank" rel="noopener">
          Source on GitHub
        </a>
      </footer>
    </>
  );
}
