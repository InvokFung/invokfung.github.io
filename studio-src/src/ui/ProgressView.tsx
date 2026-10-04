import { useMemo, useState } from "react";
import { formatCents, noteLabel } from "../dsp/notes";
import type { Instrument } from "../dsp/theory";
import { computeStreak, noteStats, summarise, type SessionRecord } from "../state/history";
import { app, clearHistory, navigate, startDemo } from "../state/app";
import { useStore } from "../state/store";
import { centsColor } from "./colors";
import { CentsLegend, Fingerboard, Keyboard } from "./instruments";
import { Card, Segmented } from "./practice";
import { useMediaQuery } from "./hooks";

type Filter = "mine" | "demo" | "all";

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function Trend({ sessions }: { sessions: SessionRecord[] }) {
  const last = sessions.slice(-24);
  const [hover, setHover] = useState<number | null>(null);
  if (last.length < 2) return <p className="muted card-note">The trend appears after two sessions.</p>;
  const W = 520;
  const H = 120;
  // Bars stay slim with only a few sessions.
  const bw = Math.min(36, (W - 30) / last.length);
  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Scores of the last ${last.length} sessions`}>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={26} x2={W} y1={H - (v / 100) * (H - 10)} y2={H - (v / 100) * (H - 10)} className="axis" />
          <text x={20} y={H - (v / 100) * (H - 10) + 3.5} textAnchor="end" className="axis-label">
            {v}
          </text>
        </g>
      ))}
      {last.map((s, i) => {
        const h = Math.max(2, (s.score / 100) * (H - 10));
        return (
          <g key={s.id} tabIndex={0} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={`${s.title}, score ${s.score}`}>
            <rect x={30 + i * bw} y={0} width={bw} height={H} fill="transparent" />
            <rect x={30 + i * bw + bw * 0.18} y={H - h} width={bw * 0.64} height={h} rx={3} className={`trend-bar ${s.source}`} opacity={hover === null || hover === i ? 1 : 0.5} />
          </g>
        );
      })}
      {hover !== null && (
        <text x={W} y={H + 15} textAnchor="end" className="axis-label strong">
          {last[hover].title} · {last[hover].score} · {when(last[hover].at)}
        </text>
      )}
    </svg>
  );
}

export default function ProgressView() {
  const sessions = useStore(app, (s) => s.sessions);
  const persistent = useStore(app, (s) => s.persistent);
  const settingsInstrument = useStore(app, (s) => s.settings.instrument);
  const narrow = useMediaQuery("(max-width: 600px)");
  const hasMine = sessions.some((s) => s.source === "mic");
  const [filter, setFilter] = useState<Filter>(hasMine ? "mine" : "all");
  const [instrument, setInstrument] = useState<Instrument>(settingsInstrument);

  const filtered = useMemo(
    () => sessions.filter((s) => (filter === "all" || (filter === "mine" ? s.source === "mic" : s.source === "demo")) && s.instrument === instrument),
    [sessions, filter, instrument],
  );
  const stats = useMemo(() => noteStats(filtered), [filtered]);
  const sum = useMemo(() => summarise(filtered), [filtered]);
  const streak = useMemo(() => computeStreak(sessions.filter((s) => s.source === "mic").map((s) => s.at), Date.now()), [sessions]);
  const ranked = useMemo(() => [...stats.values()].filter((s) => s.count >= 2).sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean)), [stats]);

  return (
    <main className="progress" id="main">
      <div className="progress-head">
        <div>
          <h1 className="drill-title">Progress</h1>
          <p className="muted">
            Kept in this browser only{persistent ? "" : " (storage is blocked here, so it lasts for this visit)"}. The streak counts days with microphone practice.
          </p>
        </div>
        <div className="progress-filters">
          <Segmented<Instrument>
            label="Instrument"
            value={instrument}
            onChange={setInstrument}
            options={[
              { v: "violin", label: "Violin" },
              { v: "piano", label: "Piano" },
            ]}
          />
          <Segmented<Filter>
            label="Sessions"
            value={filter}
            onChange={setFilter}
            options={[
              { v: "mine", label: "Microphone" },
              { v: "demo", label: "Demo" },
              { v: "all", label: "All" },
            ]}
          />
        </div>
      </div>

      <div className="tiles">
        <div className="tile glass">
          <span className="tile-v mono">{streak.current}</span>
          <span className="tile-k">day streak</span>
          <span className="tile-d">{streak.practisedToday ? "practised today" : streak.current ? "practise today to keep it" : `best ${streak.best}`}</span>
        </div>
        <div className="tile glass">
          <span className="tile-v mono">{sum.sessions}</span>
          <span className="tile-k">sessions</span>
          <span className="tile-d">{sum.minutes < 1 ? `${Math.round(sum.minutes * 60)} s` : `${sum.minutes.toFixed(0)} min`} of drills</span>
        </div>
        <div className="tile glass">
          <span className="tile-v mono">{sum.notes}</span>
          <span className="tile-k">notes scored</span>
          <span className="tile-d">{stats.size} different notes</span>
        </div>
        <div className="tile glass">
          <span className="tile-v mono">{sum.notes ? `${Math.round(sum.inTune * 100)}%` : "–"}</span>
          <span className="tile-k">within ±10¢</span>
          <span className="tile-d">{sum.notes ? `average miss ±${sum.meanAbs.toFixed(1)}¢` : "no notes yet"}</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card title="Nothing here yet" className="empty-card">
          <p className="muted">
            Finish a drill to start the history.{" "}
            {sessions.length ? "Try another filter above, or " : ""}
            The demo fills this page in about twenty seconds.
          </p>
          <div className="summary-actions">
            <button className="btn primary" onClick={() => void startDemo()}>
              Run a demo drill
            </button>
            <button className="btn ghost" onClick={() => navigate("drill")}>
              Go to drills
            </button>
          </div>
        </Card>
      ) : (
        <>
          <Card title={instrument === "violin" ? "Intonation on the fingerboard" : "Intonation by key"} className="heat-card" aside={<CentsLegend />}>
            {instrument === "violin" ? (
              <Fingerboard compact={narrow} stats={stats} ariaLabel="Heatmap of average intonation per note on the violin fingerboard" />
            ) : (
              <Keyboard stats={stats} ariaLabel="Heatmap of average intonation per key" />
            )}
            <p className="muted card-note">
              Colour is the average deviation for that note across sessions; size is how often it was played. Each note is placed where it is played in the
              lowest position. Hover or focus a note for details.
            </p>
          </Card>
          <div className="progress-grid">
            <Card title="Notes to work on">
              {ranked.length ? (
                <ul className="worklist">
                  {ranked.slice(0, 6).map((s) => (
                    <li key={s.midi}>
                      <b>{noteLabel(s.midi)}</b>
                      <span className="mono" style={{ color: centsColor(s.mean) }}>
                        {formatCents(s.mean, 1)}¢
                      </span>
                      <span className="muted">
                        {Math.abs(s.mean) <= 5 ? "in tune" : s.mean > 0 ? "tends sharp" : "tends flat"} · {s.count}×
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted card-note">Play notes at least twice to see tendencies.</p>
              )}
            </Card>
            <Card title="Scores">
              <Trend sessions={filtered} />
            </Card>
          </div>
          <Card title="Sessions" aside={<button className="ghost small danger" onClick={() => confirm("Delete all practice history in this browser?") && clearHistory()}>Clear history</button>}>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Drill</th>
                    <th>Score</th>
                    <th>Within ±10¢</th>
                    <th>Wrong</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {[...filtered]
                    .reverse()
                    .slice(0, 12)
                    .map((s) => (
                      <tr key={s.id}>
                        <td className="mono">{when(s.at)}</td>
                        <td>{s.title}</td>
                        <td className="mono">{s.score}</td>
                        <td className="mono">
                          {s.notes.filter((n) => Math.abs(n[1]) <= 10).length}/{s.notes.length}
                        </td>
                        <td className="mono">{s.wrong}</td>
                        <td>
                          <span className={`badge ${s.source}`}>{s.source === "mic" ? "mic" : "demo"}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </main>
  );
}
