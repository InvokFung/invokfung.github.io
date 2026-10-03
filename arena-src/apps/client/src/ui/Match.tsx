import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { accuracy, checkLog, scoreTimeline, triplePoints, verifyDeal, type MatchState, type MatchSummary, type PlayerState, type PublicMatchEvent, type StoredEvent } from "@arena/engine";
import type { RatingChange, RoomView } from "@arena/protocol";
import type { ArenaClient } from "../state/client";
import { useArena, useClient, useFrame, go } from "./context";
import { Board } from "./Board";
import { Momentum } from "./Momentum";
import { BOT_LABEL, clock, initials, ordinal, pct, seatColor } from "./format";
import { valueName } from "./CardArt";

interface Status {
  readonly text: string;
  readonly tone: "good" | "bad" | "info";
  readonly at: number;
}

function useAnimatedNumber(target: number, ms = 650): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(a + (target - a) * eased);
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, ms]);
  return shown;
}

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Claimed cards physically travel to the claimant's score: the board state drives the motion. */
function flyToScore(root: HTMLElement, cards: readonly number[], playerId: string, label: string, tone: "good" | "bad"): void {
  const target = root.querySelector<HTMLElement>(`[data-score-for="${playerId}"]`);
  const els = cards.map((c) => root.querySelector<HTMLElement>(`[data-card="${c}"]`)).filter((x): x is HTMLElement => !!x);
  if (els.length === 0) return;
  const rects = els.map((e) => e.getBoundingClientRect());
  const cx = rects.reduce((s, r) => s + r.left + r.width / 2, 0) / rects.length;
  const cy = rects.reduce((s, r) => s + r.top + r.height / 2, 0) / rects.length;

  const tag = document.createElement("div");
  tag.className = `float-points ${tone}`;
  tag.textContent = label;
  tag.style.left = `${cx}px`;
  tag.style.top = `${cy}px`;
  document.body.appendChild(tag);
  tag.animate(
    [
      { transform: "translate(-50%, -50%) scale(.8)", opacity: 0 },
      { transform: "translate(-50%, -110%) scale(1.08)", opacity: 1, offset: 0.25 },
      { transform: "translate(-50%, -190%) scale(1)", opacity: 0 },
    ],
    { duration: 1100, easing: "cubic-bezier(.2,.8,.2,1)" },
  ).onfinish = () => tag.remove();

  if (tone !== "good" || !target || reduceMotion()) return;
  const to = target.getBoundingClientRect();
  els.forEach((el, i) => {
    const from = rects[i]!;
    const face = el.querySelector(".card-face");
    if (!face) return;
    const ghost = document.createElement("div");
    ghost.className = "fly";
    ghost.appendChild(face.cloneNode(true));
    Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.appendChild(ghost);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const lift = Math.min(-40, dy / 2 - 70);
    ghost.animate(
      [
        { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx * 0.45}px, ${lift}px) scale(.72) rotate(${(i - 1) * 8}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(.18) rotate(${(i - 1) * 16}deg)`, opacity: 0.15 },
      ],
      { duration: 820, delay: i * 70, easing: "cubic-bezier(.45,0,.2,1)", fill: "backwards" },
    ).onfinish = () => {
      ghost.remove();
      if (i === els.length - 1) target.animate([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 380, easing: "ease-out" });
    };
  });
}

export function MatchScreen() {
  const client = useClient();
  const { match, you, presence, events, summary, replay, room, me } = useArena();
  const rootRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [go_, setGo] = useState(false);

  // Event-driven effects: flights, floating points, per-player status lines.
  useEffect(
    () =>
      client.onEvent((e, state) => {
        const root = rootRef.current;
        void state;
        const put = (id: string, text: string, tone: Status["tone"]) => setStatus((s) => ({ ...s, [id]: { text, tone, at: performance.now() } }));
        if (e.type === "triple_claimed") {
          put(e.playerId, `+${e.points} · ${valueName(e.value)}`, "good");
          if (root) flyToScore(root, e.cards, e.playerId, `+${e.points}`, "good");
        } else if (e.type === "triple_failed") {
          put(e.playerId, e.penalty > 0 ? `−${e.penalty} reflip` : "missed", "bad");
          if (root && e.penalty > 0) flyToScore(root, e.cards, e.playerId, `−${e.penalty}`, "bad");
        } else if (e.type === "selection_cleared" && e.reason !== "mismatch") {
          put(e.playerId, e.reason === "idle" ? "cards timed out" : "stalemate: cards return", "info");
        } else if (e.type === "match_started") {
          setGo(true);
          window.setTimeout(() => setGo(false), 700);
        }
      }),
    [client],
  );

  // Once it is over, fetch the full log: the results chart is a projection of it.
  useEffect(() => {
    if (match?.status === "finished" && summary && replay?.matchId !== match.matchId) client.send({ type: "get_replay", matchId: match.matchId });
  }, [client, match?.status, match?.matchId, summary, replay?.matchId]);

  const live = match !== null && match.status !== "finished";
  useFrame(live);
  if (!match) return null;

  const now = client.now();
  const remaining = match.endsAt !== null ? Math.max(0, match.endsAt - now) : match.timeLimitMs;
  const frac = remaining / match.timeLimitMs;
  const nextValue = triplePoints(remaining, match.timeLimitMs, match.rules);
  const countdown = match.status === "countdown" ? Math.max(0, Math.ceil((match.startsAt - now) / 1000)) : null;
  const self = match.players.find((p) => p.id === you) ?? null;
  const canPlay = !!self && match.status === "active" && self.resolvingUntil === null && self.selection.length < 3;
  const totalTriples = match.cardCount / 3;
  const spectating = you === null;

  return (
    <div className="match" ref={rootRef}>
      <div className="match-top">
        <div className="match-title">
          <span className="chip mono">{match.mode === "quick" ? "Quick match" : `Room ${room?.code ?? ""}`}</span>
          <span className="muted mono">
            {match.cardCount} cards · {match.players.length} {match.players.length === 1 ? "player" : "players"}
            {spectating ? " · spectating" : ""}
          </span>
        </div>
        <div className="river" aria-label={`Time left ${clock(remaining)}`}>
          <div className={`river-fill${frac < 0.5 ? " low" : ""}`} style={{ transform: `scaleX(${frac})` }} />
          <div className="river-half" title="Below half time every triple is worth 500" />
        </div>
        <div className="match-clock">
          <span className="mono big">{clock(remaining)}</span>
          {match.status === "active" && (
            <span className="next mono" title="Points for a triple found right now">
              next triple <b>+{nextValue}</b>
            </span>
          )}
        </div>
        <button className="btn ghost small" onClick={() => client.leaveMatch()}>
          {match.status === "finished" ? "Close" : spectating ? "Stop watching" : "Leave"}
        </button>
      </div>

      <div className="match-body">
        <aside className="rail" aria-label="Players">
          {match.players.map((p) => (
            <PlayerCard key={p.id} p={p} you={you} totalTriples={totalTriples} status={status[p.id]} connected={presence[p.id]?.connected ?? true} />
          ))}
        </aside>

        <section className="table">
          <Board
            cards={match.cards}
            players={match.players}
            you={you}
            presence={presence}
            interactive={!!self && match.status === "active"}
            onFlip={(c) => canPlay && client.flip(c)}
            onAttention={(c) => client.focus(c)}
            label={spectating ? "Board (spectating)" : "Your board: find all triples"}
          />
          {countdown !== null && (
            <div className="overlay countdown" aria-live="assertive">
              <div className="count mono">{countdown || "…"}</div>
              <div className="muted">Same board for everyone. First to finish a triple takes it.</div>
            </div>
          )}
          {go_ && <div className="overlay go">Go</div>}
          {match.status === "finished" && <Results client={client} match={match} events={events} you={you} room={room} summary={summary} replay={replay} />}
        </section>

        <aside className="feed" aria-label="Match feed">
          <h3>Play by play</h3>
          <Feed events={events} match={match} you={you} />
          <p className="hint muted">
            {spectating
              ? "You are watching. This browser gets exactly what the players get: values of face-down cards never leave the server."
              : "Click or use arrow keys + Enter. A miss that re-flips a card someone has already seen costs 200. Your cursor is visible to opponents."}
          </p>
        </aside>
      </div>
      {me && !spectating && match.status === "active" && self?.resolvingUntil !== null && <div className="sr-only" aria-live="polite">Miss. Cards flip back.</div>}
    </div>
  );
}

interface ResultsProps {
readonly client: ArenaClient;
readonly match: MatchState;
readonly events: readonly PublicMatchEvent[];
readonly you: string | null;
readonly room: RoomView | null;
readonly summary: { readonly summary: MatchSummary; readonly ratings: readonly RatingChange[] } | null;
readonly replay: { readonly matchId: string; readonly events: readonly StoredEvent[] } | null;
}

function Results({ client, match, events, you, room, summary, replay }: ResultsProps) {
  const standings = match.standings ?? [];
  const ratings = new Map((summary?.ratings ?? []).map((r) => [r.playerId, r]));
  const mine = standings.find((s) => s.playerId === you);
  // Prefer the full stored log (a spectator may have joined after the first flips).
  const log = replay?.matchId === match.matchId ? replay.events.map((s) => s.event) : events;
  const reveals = log.flatMap((e) => (e.type === "card_flipped" ? [[e.card, e.value] as const] : []));
  const verdict = match.seed ? verifyDeal({ commitment: match.commitment, seed: match.seed, cardCount: match.cardCount, reveals }) : null;
  const timeline = useMemo(() => (replay?.matchId === match.matchId ? scoreTimeline(checkLog(replay.events)) : null), [replay, match.matchId]);
  const title = match.finishReason === "abandoned" ? "Match abandoned" : mine ? (mine.rank === 1 ? "You win" : `${ordinal(mine.rank)} place`) : `${standings[0]?.name ?? "?"} wins`;
  return (
    <div className="overlay results" role="dialog" aria-label="Match results">
      <div className="results-card glass">
        <div className="results-head">
          <div>
            <div className="eyebrow mono">{match.finishReason === "cleared" ? "Board cleared" : match.finishReason === "timeout" ? "Time" : "Unrated"}</div>
            <h2 className={mine?.rank === 1 ? "grad" : ""}>{title}</h2>
          </div>
          {verdict && (
            <div className={`verify ${verdict.ok ? "ok" : "bad"}`} title="The server committed to sha256(seed) before the first flip and revealed the seed at the end">
              <span>{verdict.ok ? "✓ Fair deal verified" : "✗ Deal mismatch"}</span>
              <span className="mono muted">
                sha256(seed) = commitment · {verdict.checkedReveals} reveals match
              </span>
            </div>
          )}
        </div>
        <table className="standings">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th className="num">Score</th>
              <th className="num">Triples</th>
              <th className="num hide-sm">Accuracy</th>
              <th className="num hide-sm">Penalties</th>
              <th className="num">Rating</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => {
              const r = ratings.get(s.playerId);
              const d = r ? r.after - r.before : null;
              return (
                <tr key={s.playerId} className={s.playerId === you ? "me" : ""}>
                  <td className="mono">{s.rank}</td>
                  <td>
                    <span className="dot" style={{ background: seatColor(s.seat) }} /> {s.name}
                    {s.kind === "bot" && <span className="tag hide-sm">{BOT_LABEL[s.botLevel ?? "adept"]} bot</span>}
                  </td>
                  <td className="num mono">{s.score}</td>
                  <td className="num mono">{s.triples}</td>
                  <td className="num mono hide-sm">{pct(accuracy(s))}</td>
                  <td className="num mono hide-sm">{s.penalties}</td>
                  <td className={`num mono ${d === null ? "muted" : d >= 0 ? "up" : "down"}`}>{d === null ? "—" : `${r!.after} (${d >= 0 ? "+" : ""}${d})`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="results-chart">
          <div className="eyebrow mono">Score over time · projected from the event log</div>
          {timeline && match.startedAt !== null && match.finishedAt !== null ? (
            <Momentum timeline={timeline} players={match.players} start={match.startedAt} end={match.finishedAt} />
          ) : (
            <div className="shimmer" style={{ height: 120 }} />
          )}
        </div>
        <div className="results-actions">
          {room ? (
            <button className="btn primary" onClick={() => client.clearMatch()}>
              Back to room
            </button>
          ) : (
            <button className="btn primary" onClick={() => client.quickMatch(match.players.find((p) => p.kind === "bot")?.botLevel ?? "adept")}>
              Play again
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              client.clearMatch();
              go(`#/replay/${match.matchId}`);
            }}
          >
            Watch replay
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              if (room) client.send({ type: "leave_room" });
              client.clearMatch();
              go("#/");
            }}
          >
            Lobby
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ p, you, totalTriples, status, connected }: { p: PlayerState; you: string | null; totalTriples: number; status: Status | undefined; connected: boolean }) {
  const score = useAnimatedNumber(p.score);
  const color = seatColor(p.seat);
  const fresh = status && performance.now() - status.at < 2200;
  return (
    <div className={`player${p.id === you ? " me" : ""}${connected ? "" : " away"}`} style={{ "--seat": color } as CSSProperties}>
      <div className="avatar" aria-hidden="true">
        {initials(p.name)}
      </div>
      <div className="player-main">
        <div className="player-name">
          <span className="name">{p.name}</span>
          {p.id === you && <span className="tag you">you</span>}
          {p.kind === "bot" && <span className="tag">{BOT_LABEL[p.botLevel ?? "adept"]}</span>}
        </div>
        <div className="pips" aria-label={`${p.triples} triples`}>
          {Array.from({ length: totalTriples }, (_, i) => (
            <span key={i} className={i < p.triples ? "on" : ""} />
          ))}
        </div>
        <div className={`player-status ${fresh ? status.tone : "idle"}`}>{!connected ? "disconnected" : fresh ? status.text : p.resolvingUntil !== null ? "missed" : p.selection.length > 0 ? `holding ${p.selection.length}` : " "}</div>
      </div>
      <div className="score mono" data-score-for={p.id}>
        {score}
      </div>
    </div>
  );
}

function Feed({ events, match, you }: { events: readonly PublicMatchEvent[]; match: MatchState; you: string | null }) {
  const byId = new Map(match.players.map((p) => [p.id, p]));
  const items = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.type === "triple_claimed" || (e.type === "triple_failed" && e.penalty > 0) || e.type === "match_started" || e.type === "match_finished" || (e.type === "selection_cleared" && e.reason === "stalemate"))
    // One stalemate clears every holder at the same instant: show it once.
    .filter(({ e, i }) => !(e.type === "selection_cleared" && i > 0 && events[i - 1]?.type === "selection_cleared" && events[i - 1]?.at === e.at))
    .slice(-9)
    .reverse();
  const who = (id: string) => {
    const p = byId.get(id);
    return p ? (
      <b style={{ color: seatColor(p.seat) }}>{p.id === you ? "You" : p.name}</b>
    ) : (
      <b>?</b>
    );
  };
  return (
    <ol className="feed-list" aria-live="polite">
      {items.length === 0 && <li className="muted">Waiting for the first triple…</li>}
      {items.map(({ e, i }) => (
        <li key={i}>
          {e.type === "triple_claimed" ? (
            <>
              {who(e.playerId)} took {valueName(e.value)} <span className="mono up">+{e.points}</span>
            </>
          ) : e.type === "triple_failed" ? (
            <>
              {who(e.playerId)} re-flipped and missed <span className="mono down">−{e.penalty}</span>
            </>
          ) : e.type === "match_started" ? (
            <span className="muted">Go — {match.cardCount / 3} triples on the board</span>
          ) : e.type === "selection_cleared" ? (
            <span className="muted">Stalemate: every open card was held, so they flip back</span>
          ) : e.type === "match_finished" ? (
            <span className="muted">Final whistle</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
