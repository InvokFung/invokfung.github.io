import { useEffect, useMemo, useState } from "react";
import {
  BOT_PROFILES,
  BotMind,
  applyEvent,
  createMatch,
  decideClear,
  decideFlip,
  decideStalemate,
  decideStart,
  decideTimeout,
  isStalemate,
  rngFromSeed,
  sha256Hex,
  type MatchEvent,
  type MatchPlayerInfo,
  type MatchState,
} from "@arena/engine";
import { Board } from "./Board";
import { initials, seatColor } from "./format";
import type { Presence } from "../state/client";

interface Simulated {
  readonly events: readonly MatchEvent[];
  readonly focus: readonly { at: number; playerId: string; card: number | null }[];
}

const PLAYERS: MatchPlayerInfo[] = [
  { id: "p_demoana01", name: "Ana", kind: "bot", seat: 0, botLevel: "ace" },
  { id: "p_demoecho1", name: "Echo", kind: "bot", seat: 1, botLevel: "adept" },
  { id: "p_demokai01", name: "Kai", kind: "bot", seat: 2, botLevel: "adept" },
];

/**
 * Plays a whole match with the real engine and real bot minds on a virtual clock and
 * returns its event log. The lobby then plays that log back: same reducer, same board.
 */
function simulate(round: number): Simulated {
  const seed = sha256Hex(`lobby-demo-${round}`).slice(0, 32);
  const created = createMatch({ matchId: "m_demo000000", mode: "room", seed, cardCount: 12, players: PLAYERS, now: 0 });
  let state: MatchState = applyEvent(null, created);
  const events: MatchEvent[] = [created];
  const focus: { at: number; playerId: string; card: number | null }[] = [];
  const commit = (es: MatchEvent[]) => {
    for (const e of es) {
      state = applyEvent(state, e);
      events.push(e);
      if (e.type === "card_flipped") for (const m of minds.values()) m.observe(e.card, e.value, e.at);
      if (e.type === "triple_claimed") for (const m of minds.values()) e.cards.forEach((c) => m.forget(c));
    }
  };
  const minds = new Map(PLAYERS.map((p, i) => [p.id, new BotMind({ ...BOT_PROFILES[p.botLevel ?? "adept"], thinkMs: [700, 1300] }, rngFromSeed(`${seed}:${i}`))]));
  const start = decideStart(state, state.startsAt);
  if (start.ok) commit(start.events);
  const next = new Map(PLAYERS.map((p) => [p.id, (state.startedAt ?? 0) + 400 + (minds.get(p.id)?.thinkDelay() ?? 900)]));
  let stalemateAt: number | null = null;

  for (let guard = 0; guard < 3000 && state.status === "active"; guard++) {
    const clearing = state.players.filter((p) => p.resolvingUntil !== null).map((p) => ({ id: p.id, at: p.resolvingUntil as number }));
    const candidates = [...clearing.map((c) => ({ kind: "clear" as const, ...c })), ...[...next].map(([id, at]) => ({ kind: "bot" as const, id, at }))];
    if (stalemateAt !== null) candidates.push({ kind: "clear", id: "*", at: stalemateAt });
    candidates.sort((a, b) => a.at - b.at);
    const c = candidates[0];
    if (!c) break;
    const t = c.at;
    if (t >= (state.endsAt ?? Infinity)) {
      const d = decideTimeout(state, t);
      if (d.ok) commit(d.events);
      break;
    }
    if (c.kind === "clear") {
      const d = c.id === "*" ? decideStalemate(state, t) : decideClear(state, c.id, "mismatch", t);
      if (c.id === "*") stalemateAt = null;
      if (d.ok) commit(d.events);
      continue;
    }
    const mind = minds.get(c.id)!;
    const self = state.players.find((p) => p.id === c.id)!;
    if (self.resolvingUntil !== null) {
      next.set(c.id, self.resolvingUntil + mind.thinkDelay() * 0.5);
      continue;
    }
    const card = mind.chooseCard(state, c.id, t);
    if (card === null) {
      next.set(c.id, t + 300);
      continue;
    }
    focus.push({ at: t - 420, playerId: c.id, card });
    const d = decideFlip(state, c.id, card, t);
    if (d.ok) commit(d.events);
    next.set(c.id, t + mind.thinkDelay());
    if (isStalemate(state) && stalemateAt === null) stalemateAt = t + state.rules.timing.stalemateReleaseMs;
  }
  return { events, focus };
}

export function DemoBoard() {
  const [round, setRound] = useState(0);
  const sim = useMemo(() => simulate(round), [round]);
  const [cursor, setCursor] = useState<{ state: MatchState; presence: Record<string, Presence> } | null>(null);

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = sim.events.find((e) => e.type === "match_started")?.at ?? 0;
    const last = sim.events[sim.events.length - 1]?.at ?? started;
    const t0 = performance.now();
    let raf = 0;
    let shown = -1;
    let focusShown = -1;
    let state: MatchState | null = null;
    const presence: Record<string, Presence> = {};
    const tick = () => {
      const t = reduced ? last : started + (performance.now() - t0);
      let i = shown;
      while (i + 1 < sim.events.length && (sim.events[i + 1] as MatchEvent).at <= t) state = applyEvent(state, sim.events[++i] as MatchEvent);
      let f = focusShown;
      while (f + 1 < sim.focus.length && sim.focus[f + 1]!.at <= t) {
        const x = sim.focus[++f]!;
        presence[x.playerId] = { focus: x.card, connected: true };
      }
      if (i !== shown || f !== focusShown) {
        shown = i;
        focusShown = f;
        if (state) setCursor({ state, presence: { ...presence } });
      }
      if (t < last + 2600) raf = requestAnimationFrame(tick);
      else if (!reduced) setRound((r) => r + 1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sim]);

  const state = cursor?.state;
  return (
    <figure className="demo glass" aria-label="A simulated match between three bots, replayed from its event log">
      <div className="demo-players">
        {(state?.players ?? []).map((p) => (
          <div key={p.id} className="demo-player" style={{ color: seatColor(p.seat) }}>
            <span className="avatar sm" style={{ background: seatColor(p.seat) }}>
              {initials(p.name)}
            </span>
            <span className="demo-name">{p.name}</span>
            <span className="mono demo-score">{p.score}</span>
          </div>
        ))}
      </div>
      <div className="demo-board">{state && <Board cards={state.cards} players={state.players} presence={cursor.presence} maxCard={84} label="Demo board" />}</div>
      <figcaption className="muted">
        <span className="live-dot" /> Three bots with imperfect memory, played by the real engine and replayed from its event log. Dots show where each one is looking.
      </figcaption>
    </figure>
  );
}
