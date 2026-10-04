import { AudioEngine, type EngineInfo, type SourceKind } from "../audio/engine";
import { PROFILES } from "../dsp/pitch";
import { A4_MAX, A4_MIN, DEFAULT_A4, midiToFreq } from "../dsp/notes";
import type { DrillSpec, Instrument } from "../dsp/theory";
import { summariseDrill, type DrillState } from "./drill";
import { clearSessions, loadSessions, saveSessions, type SessionRecord } from "./history";
import { LiveBus } from "./live";
import { DrillRunner } from "./runner";
import { storage } from "./storage";
import { createStore } from "./store";

/**
 * The application layer: one audio engine, one live pitch bus, one drill
 * runner, and a small store the UI renders from. UI components call the
 * actions below and never touch Web Audio directly.
 */

export type View = "home" | "tuner" | "drill" | "progress";

export interface Settings {
  a4: number;
  instrument: Instrument;
  /** Play each target note before the player answers. */
  guide: boolean;
  grade: number;
}

export interface AppState {
  view: View;
  source: SourceKind | null;
  status: "idle" | "starting" | "running";
  error: string | null;
  settings: Settings;
  drill: DrillState | null;
  sessions: SessionRecord[];
  persistent: boolean;
  /** Tuner: compare against this note (a string preset) instead of the nearest note. */
  tunerLock: number | null;
  engine: EngineInfo | null;
  aboutOpen: boolean;
}

const SETTINGS_KEY = "intonation-studio:v1:settings";
const DEFAULT_SETTINGS: Settings = { a4: DEFAULT_A4, instrument: "violin", guide: true, grade: 3 };

function loadSettings(): Settings {
  const s = { ...DEFAULT_SETTINGS, ...storage.read<Partial<Settings>>(SETTINGS_KEY, {}) };
  s.a4 = Math.min(A4_MAX, Math.max(A4_MIN, Number(s.a4) || DEFAULT_A4));
  if (s.instrument !== "violin" && s.instrument !== "piano") s.instrument = "violin";
  s.grade = Math.min(8, Math.max(1, Math.round(Number(s.grade) || 3)));
  return s;
}

const viewFromHash = (): View => {
  const h = location.hash.replace(/^#\/?/, "");
  return h === "tuner" || h === "drill" || h === "progress" ? h : "home";
};

export const engine = new AudioEngine();
export const live = new LiveBus();

const initialSettings = loadSettings();
live.a4 = initialSettings.a4;

export const app = createStore<AppState>({
  view: viewFromHash(),
  source: null,
  status: "idle",
  error: null,
  settings: initialSettings,
  drill: null,
  sessions: loadSessions(storage),
  persistent: storage.persistent,
  tunerLock: null,
  engine: null,
  aboutOpen: false,
});

engine.onFrame = (f) => live.push(f);
engine.onInfo = (info) => app.set({ engine: info });

const runner = new DrillRunner({
  engine,
  live,
  get: () => app.get().drill,
  set: (drill) => app.set({ drill }),
  guide: () => app.get().settings.guide,
  a4: () => app.get().settings.a4,
  onFinish: (s) => recordSession(s),
});

/** The drill the demo plays first: short, musical and centred in the violin's range. */
export const DEMO_DRILLS: DrillSpec[] = [
  { instrument: "violin", tonic: "A", mode: "major", form: "arpeggio", octaves: 2 },
  { instrument: "violin", tonic: "D", mode: "major", form: "scale", octaves: 1 },
  { instrument: "violin", tonic: "G", mode: "minor", form: "arpeggio", octaves: 2 },
  { instrument: "violin", tonic: "E", mode: "minor", form: "melodic", octaves: 1 },
];
let demoIndex = 0;

// ---------------------------------------------------------------- navigation

export function navigate(view: View) {
  const hash = view === "home" ? "" : `#/${view}`;
  if (location.hash !== hash) history.pushState(null, "", hash || location.pathname);
  app.set({ view });
  window.scrollTo({ top: 0 });
}

window.addEventListener("popstate", () => app.set({ view: viewFromHash() }));

// ---------------------------------------------------------------- settings

export function updateSettings(patch: Partial<Settings>) {
  const settings = { ...app.get().settings, ...patch };
  app.set({ settings });
  storage.write(SETTINGS_KEY, settings);
  if (patch.a4 !== undefined) {
    live.a4 = settings.a4;
    live.reset();
  }
  if (patch.instrument !== undefined) {
    engine.setProfile(PROFILES[settings.instrument]);
    app.set({ tunerLock: null });
  }
}

// ---------------------------------------------------------------- audio source

export async function startSource(kind: SourceKind): Promise<boolean> {
  if (app.get().status === "starting") return false;
  stopDrill();
  app.set({ status: "starting", error: null });
  try {
    await engine.start(kind, PROFILES[app.get().settings.instrument]);
    live.reset();
    app.set({ source: kind, status: "running" });
    return true;
  } catch (err) {
    app.set({ status: "idle", source: engine.kind, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

export async function stopSource() {
  stopDrill();
  await engine.stop();
  live.reset();
  app.set({ source: null, status: "idle" });
}

/** "Watch the demo": synthesized violin, straight into a drill. */
export async function startDemo() {
  if (app.get().settings.instrument !== "violin") updateSettings({ instrument: "violin" });
  if (!(await startSource("demo"))) return;
  navigate("drill");
  beginDrill(DEMO_DRILLS[demoIndex++ % DEMO_DRILLS.length]);
}

export async function startMic(view: View = "tuner") {
  if (await startSource("mic")) navigate(view);
}

export const dismissError = () => app.set({ error: null });

// ---------------------------------------------------------------- drills

export function beginDrill(spec: DrillSpec) {
  const source = app.get().source;
  if (!source) return;
  runner.start(spec, source);
}

/** The next demo drill in the rotation. */
export function nextDemoDrill() {
  beginDrill(DEMO_DRILLS[demoIndex++ % DEMO_DRILLS.length]);
}

export function stopDrill() {
  runner.stop();
  const d = app.get().drill;
  if (d && d.phase !== "done") app.set({ drill: null });
}

export const closeDrill = () => {
  runner.stop();
  app.set({ drill: null });
};

// Leaving the drill page abandons a drill in progress (nothing is recorded), so the
// demo violinist and guide tones never play under the tuner or the progress page.
let lastView = app.get().view;
app.subscribe(() => {
  const { view, drill } = app.get();
  if (view === lastView) return;
  lastView = view;
  if (view !== "drill" && drill && drill.phase !== "done") stopDrill();
});

export const skipNote = () => runner.skip();
export const replayGuide = () => runner.replayGuide();

function recordSession(s: DrillState) {
  if (!s.results.length) return;
  const sum = summariseDrill(s);
  const rec: SessionRecord = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    source: s.source,
    instrument: s.spec.instrument,
    drillId: s.id,
    title: s.title,
    a4: app.get().settings.a4,
    notes: s.results.map((r) => [r.midi, round1(r.cents), round1(r.drift), r.score]),
    wrong: s.wrong,
    score: sum.score,
    seconds: Math.max(0, (s.endedAt ?? s.startedAt) - s.startedAt),
  };
  const sessions = [...app.get().sessions, rec];
  app.set({ sessions, persistent: saveSessions(storage, sessions) || false });
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function clearHistory() {
  clearSessions(storage);
  app.set({ sessions: [] });
}

// ---------------------------------------------------------------- tuner

export const setTunerLock = (midi: number | null) => app.set({ tunerLock: midi });

export function playReference(midi: number, seconds = 1.6) {
  if (!engine.running) return;
  engine.playGuide(midi, app.get().settings.a4, undefined, seconds, 0.18);
}

export const setAbout = (open: boolean) => app.set({ aboutOpen: open });

/** Demo, tuner view: the synthesized violinist bows a string starting flat and settles into tune. */
export function demoBow(midi: number) {
  if (engine.kind !== "demo") return;
  setTunerLock(midi);
  engine.violinPlay({ freq: midiToFreq(midi, app.get().settings.a4), duration: 3.4, bend: -38, bendTime: 0.9, vibratoDepth: 0, velocity: 0.8 }, engine.now + 0.05);
}
