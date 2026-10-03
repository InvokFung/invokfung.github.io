import { useCallback } from "react";
import { noteLabel } from "../dsp/notes";
import { app, demoBow, playReference, setTunerLock } from "../state/app";
import { useStore } from "../state/store";
import { Gauge, LevelMeter, Strobe } from "./meters";
import { A4Control, Card, EngineFacts, InstrumentSwitch, LiveInstrument, PracticeStage, StartOverlay } from "./practice";

const PRESETS = {
  violin: [55, 62, 69, 76], // G3 D4 A4 E5
  piano: [36, 48, 60, 69, 72, 84], // C2 C3 C4 A4 C5 C6
};

export default function TunerView() {
  const source = useStore(app, (s) => s.source);
  const instrument = useStore(app, (s) => s.settings.instrument);
  const lock = useStore(app, (s) => s.tunerLock);
  const reference = useCallback(() => app.get().tunerLock, []);

  const choose = (midi: number | null) => {
    setTunerLock(midi);
    if (midi !== null) {
      if (source === "demo") demoBow(midi);
      else playReference(midi);
    }
  };

  return (
    <main className="practice" id="main">
      <section className="stage-col glass" aria-label="Tuner">
        <div className="tuner-top">
          <Gauge reference={reference} />
          <Strobe reference={reference} />
        </div>
        <div className="stage-wrap">
          <PracticeStage />
          <StartOverlay />
        </div>
      </section>
      <aside className="side">
        <Card title={instrument === "violin" ? "Tune a string" : "Reference notes"}>
          <p className="muted card-note">
            {lock === null ? "Auto: measuring against the nearest note." : `Locked to ${noteLabel(lock)}: the gauge measures against it even when far off.`}
            {source === "demo" ? " In the demo, picking a string makes the synthesized violin bow it, starting flat." : source ? " Picking a note plays it." : ""}
          </p>
          <div className="chips" role="radiogroup" aria-label="Target note">
            <button role="radio" aria-checked={lock === null} className={`chip-btn${lock === null ? " on" : ""}`} onClick={() => choose(null)}>
              Auto
            </button>
            {PRESETS[instrument].map((m) => (
              <button key={m} role="radio" aria-checked={lock === m} className={`chip-btn big${lock === m ? " on" : ""}`} onClick={() => choose(m)}>
                {noteLabel(m)}
              </button>
            ))}
          </div>
        </Card>
        <Card title="On the instrument" aside={<InstrumentSwitch />}>
          <LiveInstrument reference={reference} target={lock} />
          <p className="muted card-note">The dot sits where the note is played and slides with your intonation: sharp is further up the string.</p>
        </Card>
        <Card title="Reference pitch">
          <A4Control />
        </Card>
        <Card title="Input">
          <LevelMeter />
          <EngineFacts />
        </Card>
      </aside>
    </main>
  );
}
