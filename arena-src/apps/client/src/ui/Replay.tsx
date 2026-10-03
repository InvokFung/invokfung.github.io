import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { checkLog, replayStates, scoreTimeline, verifyDeal, type DealVerification, type MatchCreated, type MatchEvent, type MatchFinished, type MatchState, type ScorePoint } from "@arena/engine";
import { useArena, useClient, go } from "./context";
import { Board } from "./Board";
import { Momentum } from "./Momentum";
import { valueName } from "./CardArt";
import { BOT_LABEL, clock, seatColor } from "./format";

const SPEEDS = [1, 2, 4, 8] as const;

interface ReplayData {
  readonly events: readonly MatchEvent[];
  readonly states: readonly MatchState[];
  readonly created: MatchCreated;
  readonly finished: MatchFinished;
  readonly t0: number;
  readonly t1: number;
  /** The full deal (known once the seed is revealed), for the x-ray view. */
  readonly deck: readonly (number | null)[];
  readonly timeline: ReadonlyMap<string, readonly ScorePoint[]>;
  readonly verdict: DealVerification;
}

/** Index of the last event at or before `t` (binary search; events are time-ordered). */
function indexAt(events: readonly MatchEvent[], t: number): number {
  let lo = 0;
  let hi = events.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((events[mid] as MatchEvent).at <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function ReplayScreen({ matchId }: { matchId: string }) {
  const client = useClient();
  const { replay, toasts } = useArena();

  useEffect(() => {
    client.send({ type: "get_replay", matchId });
  }, [client, matchId]);

  const data = useMemo((): ReplayData | null => {
    if (!replay || replay.matchId !== matchId) return null;
    const events = checkLog(replay.events);
    const created = events[0] as MatchCreated;
    const finished = events[events.length - 1] as MatchFinished;
    const started = events.find((e) => e.type === "match_started");
    const states = replayStates(events);
    const reveals = events.flatMap((e) => (e.type === "card_flipped" ? [[e.card, e.value] as const] : []));
    return {
      events,
      states,
      created,
      finished,
      t0: started?.at ?? created.at,
      t1: Math.max(finished.at, (started?.at ?? created.at) + 1),
      deck: (states[0]?.cards ?? []).map((c) => c.value),
      timeline: scoreTimeline(events),
      verdict: verifyDeal({ commitment: created.commitment, seed: finished.seed, cardCount: created.cardCount, reveals }),
    };
  }, [replay, matchId]);

  if (!data) {
    const missing = toasts.some((t) => t.code === "not_found" || t.code === "match_not_finished");
    return (
      <div className="page narrow">
        <div className="glass panel center">
          {missing ? (
            <>
              <h2>Replay not available</h2>
              <p className="muted">It may be from another server, or the match is still running.</p>
              <button className="btn" onClick={() => go("#/")}>
                Back to lobby
              </button>
            </>
          ) : (
            <div className="shimmer" style={{ height: 240 }} />
          )}
        </div>
      </div>
    );
  }
  return <ReplayView key={matchId} data={data} />;
}


function ReplayView({ data }: { data: ReplayData }) {
  const { events, states, created, finished, t0, t1, deck, timeline, verdict } = data;
  const [t, setT] = useState(t0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [xray, setXray] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setT((cur) => {
        const next = cur + dt * speed;
        if (next >= t1) {
          setPlaying(false);
          return t1;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, t1]);

  const index = indexAt(events, t);
  const state = states[index]!;
  const span = t1 - t0;
  const xOf = (at: number) => `${(((Math.min(t1, Math.max(t0, at)) - t0) / span) * 100).toFixed(3)}%`;
  const seek = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    setT(t0 + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * span);
  };
  const stepEvent = (dir: 1 | -1) => {
    const i = Math.max(0, Math.min(events.length - 1, index + dir));
    setPlaying(false);
    setT(Math.max(t0, (events[i] as MatchEvent).at));
  };
  const togglePlay = () => {
    if (t >= t1) {
      setT(t0);
      setPlaying(true);
    } else setPlaying((p) => !p);
  };
  const onKey = (e: KeyboardEvent) => {
    const map: Record<string, () => void> = {
      ArrowRight: () => (e.shiftKey ? setT((x) => Math.min(t1, x + 5000)) : stepEvent(1)),
      ArrowLeft: () => (e.shiftKey ? setT((x) => Math.max(t0, x - 5000)) : stepEvent(-1)),
      " ": togglePlay,
      Home: () => setT(t0),
      End: () => setT(t1),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const byId = new Map(created.players.map((p) => [p.id, p]));
  const lanes = created.players;
  const current = events[index] as MatchEvent;

  return (
    <div className="replay page wide" onKeyDown={onKey}>
      <div className="replay-head">
        <div>
          <div className="eyebrow mono">
            Replay · {created.mode === "quick" ? "quick match" : "room"} · {created.cardCount} cards · {new Date(finished.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          </div>
          <h1>
            {finished.standings[0]?.name} wins <span className="muted">with {finished.standings[0]?.score}</span>
          </h1>
        </div>
        <div className={`verify ${verdict.ok ? "ok" : "bad"}`} title={`commitment ${created.commitment.slice(0, 16)}…  seed ${finished.seed.slice(0, 8)}…`}>
          <span>{verdict.ok ? "✓ Fair deal verified" : "✗ Deal mismatch"}</span>
          <span className="mono muted">rebuilt from {events.length} events · seq 0–{events.length - 1}</span>
        </div>
      </div>

      <div className="replay-body">
        <section className="table replay-table">
          <Board cards={state.cards} players={state.players} xray={xray ? deck : null} maxCard={96} label="Replay board" />
        </section>
        <aside className="replay-side">
          <div className="glass panel">
            <div className="eyebrow mono">Standings at {clock(Math.max(0, t - t0))}</div>
            <ol className="mini-standings">
              {ranked.map((p) => (
                <li key={p.id}>
                  <span className="dot" style={{ background: seatColor(p.seat) }} />
                  <span className="name">{p.name}</span>
                  {p.kind === "bot" && <span className="tag">{BOT_LABEL[p.botLevel ?? "adept"]}</span>}
                  <span className="mono score-sm">{p.score}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="glass panel log">
            <div className="eyebrow mono">Event log</div>
            <ol className="event-log mono" aria-live="off">
              {events.slice(Math.max(0, index - 5), index + 1).map((e, k, arr) => {
                const seq = Math.max(0, index - 5) + k;
                return (
                  <li key={seq} className={k === arr.length - 1 ? "now" : ""}>
                    <span className="seq">{String(seq).padStart(3, "0")}</span> {describe(e, byId)}
                  </li>
                );
              })}
            </ol>
            <details>
              <summary className="muted">current event JSON</summary>
              <pre className="json">{JSON.stringify(current.type === "match_created" ? { ...current, seed: "…", rules: "…" } : current, null, 1)}</pre>
            </details>
          </div>
        </aside>
      </div>

      <div className="scrubber glass">
        <div className="scrub-controls">
          <button className="btn small icon" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <div className="seg" role="radiogroup" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button key={s} role="radio" aria-checked={speed === s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <label className="toggle">
            <input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} /> X-ray deal
          </label>
          <span className="mono muted clock">
            {clock(t - t0)} / {clock(span)}
          </span>
        </div>
        <div
          className="track"
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label="Replay position"
          aria-valuemin={0}
          aria-valuemax={Math.round(span / 1000)}
          aria-valuenow={Math.round((t - t0) / 1000)}
          aria-valuetext={`${clock(t - t0)}, event ${index}`}
          onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setPlaying(false);
            seek(e.clientX);
          }}
          onPointerMove={(e) => dragging.current && seek(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
        >
          {lanes.map((p, lane) => (
            <div key={p.id} className="lane" style={{ top: `${8 + lane * (56 / lanes.length)}px`, height: `${Math.max(8, 56 / lanes.length - 3)}px` }}>
              {events.map((e, i) =>
                "playerId" in e && e.playerId === p.id && (e.type === "triple_claimed" || e.type === "triple_failed" || e.type === "card_flipped") ? (
                  <span
                    key={i}
                    className={`tick ${e.type === "triple_claimed" ? "claim" : e.type === "triple_failed" ? (e.penalty > 0 ? "penalty" : "fail") : "flip"}`}
                    style={{ left: xOf(e.at), background: e.type === "triple_claimed" ? seatColor(p.seat) : undefined }}
                  />
                ) : null,
              )}
            </div>
          ))}
          <div className="half-mark" style={{ left: xOf(t0 + created.timeLimitMs / 2) }} />
          <div className="playhead" style={{ left: xOf(t) }} />
        </div>
        <Momentum timeline={timeline} players={created.players} start={t0} end={t1} cursor={t} height={90} />
        <div className="scrub-hint muted">Drag the track · ←/→ step one event · Shift+←/→ jump 5 s · Space play/pause</div>
      </div>
    </div>
  );
}

function describe(e: MatchEvent, byId: Map<string, { name: string; seat: number }>): ReactNode {
  const who = (id: string) => {
    const p = byId.get(id);
    return <b style={{ color: p ? seatColor(p.seat) : undefined }}>{p?.name ?? "?"}</b>;
  };
  switch (e.type) {
    case "match_created":
      return <>match_created · deal committed</>;
    case "match_started":
      return <>match_started · clock running</>;
    case "card_flipped":
      return (
        <>
          {who(e.playerId)} flips #{e.card + 1} → {valueName(e.value)}
          {e.reflip ? " (seen)" : ""}
        </>
      );
    case "triple_claimed":
      return (
        <>
          {who(e.playerId)} claims {valueName(e.value)} <span className="up">+{e.points}</span>
        </>
      );
    case "triple_failed":
      return (
        <>
          {who(e.playerId)} misses {e.penalty > 0 ? <span className="down">−{e.penalty}</span> : ""}
        </>
      );
    case "selection_cleared":
      return (
        <>
          {who(e.playerId)} cards flip back ({e.reason})
        </>
      );
    case "match_finished":
      return <>match_finished · seed revealed</>;
  }
}
