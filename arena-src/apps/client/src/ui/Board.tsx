import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { CardState, PlayerState } from "@arena/engine";
import type { Presence } from "../state/client";
import { Glyph, TripleMark, valueName } from "./CardArt";
import { fitGrid, initials, seatColor } from "./format";

export interface BoardProps {
  readonly cards: readonly CardState[];
  readonly players: readonly PlayerState[];
  readonly you?: string | null;
  readonly presence?: Readonly<Record<string, Presence>>;
  readonly interactive?: boolean;
  /** Replay: show face-down values as a faint x-ray. */
  readonly xray?: readonly (number | null)[] | null;
  readonly maxCard?: number;
  readonly onFlip?: (card: number) => void;
  readonly onAttention?: (card: number | null) => void;
  readonly label?: string;
}

const GAP = 8;

export function Board({ cards, players, you = null, presence, interactive = false, xray = null, maxCard = 136, onFlip, onAttention, label = "Game board" }: BoardProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState({ columns: 6, card: 64 });
  const [cursor, setCursor] = useState(0);
  const n = cards.length;
  // Stable callbacks so memoised cards only re-render when their own card changes.
  const handlers = useRef({ onFlip, onAttention });
  useLayoutEffect(() => {
    handlers.current = { onFlip, onAttention };
  });
  const flip = useCallback((i: number) => handlers.current.onFlip?.(i), []);
  const focusCard = useCallback((i: number) => {
    setCursor(i);
    handlers.current.onAttention?.(i);
  }, []);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setGrid(fitGrid(n, el.clientWidth, el.clientHeight, GAP, maxCard));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n, maxCard]);

  const byId = new Map(players.map((p) => [p.id, p]));
  const resolving = new Set(players.filter((p) => p.resolvingUntil !== null).flatMap((p) => p.selection));
  const watchers = new Map<number, PlayerState[]>();
  if (presence) {
    for (const p of players) {
      const f = presence[p.id]?.focus;
      if (p.id !== you && f !== null && f !== undefined) watchers.set(f, [...(watchers.get(f) ?? []), p]);
    }
  }

  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const cols = grid.columns;
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -n, End: n };
    const d = step[e.key];
    if (d === undefined) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(n - 1, cursor + d));
    setCursor(next);
    wrap.current?.querySelector<HTMLButtonElement>(`[data-card="${next}"]`)?.focus();
  };

  return (
    <div className="board-wrap" ref={wrap}>
      <div
        className="board"
        role="grid"
        aria-label={label}
        onKeyDown={interactive ? move : undefined}
        onPointerLeave={() => onAttention?.(null)}
        style={{ gridTemplateColumns: `repeat(${grid.columns}, ${grid.card}px)`, "--card": `${grid.card}px` } as CSSProperties}
      >
        {cards.map((c, i) => (
          <Card
            key={i}
            index={i}
            card={c}
            holder={c.holder ? (byId.get(c.holder) ?? null) : null}
            you={you}
            miss={resolving.has(i)}
            watchers={watchers.get(i) ?? null}
            xray={xray ? (xray[i] ?? null) : null}
            interactive={interactive}
            tabIndex={interactive ? (i === cursor ? 0 : -1) : -1}
            onFlip={flip}
            onFocusCard={focusCard}
          />
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  readonly index: number;
  readonly card: CardState;
  readonly holder: PlayerState | null;
  readonly you: string | null;
  readonly miss: boolean;
  readonly watchers: readonly PlayerState[] | null;
  readonly xray: number | null;
  readonly interactive: boolean;
  readonly tabIndex: number;
  readonly onFlip: (card: number) => void;
  readonly onFocusCard: (card: number) => void;
}

const Card = memo(function Card({ index, card, holder, you, miss, watchers, xray, interactive, tabIndex, onFlip, onFocusCard }: CardProps) {
  // Keep the face drawn while it rotates away, then forget it: the DOM should not
  // become a memory aid for cards that are face down again.
  const [lingering, setLingering] = useState<number | null>(null);
  const prev = useRef(card);
  useEffect(() => {
    const was = prev.current;
    prev.current = card;
    if (was.status !== "down" && card.status === "down" && was.value !== null) {
      setLingering(was.value);
      const t = window.setTimeout(() => setLingering(null), 650);
      return () => clearTimeout(t);
    }
    if (card.status !== "down") setLingering(null);
    return undefined;
  }, [card]);

  const face = card.status === "down" ? lingering : card.value;
  const color = holder ? seatColor(holder.seat) : undefined;
  const mine = holder?.id === you && you !== null;
  const canFlip = interactive && card.status === "down";
  const state = card.status === "down" ? "face down" : card.status === "up" ? `${valueName(card.value ?? 0)}, held by ${mine ? "you" : (holder?.name ?? "?")}` : `${valueName(card.value ?? 0)}, claimed by ${mine ? "you" : (holder?.name ?? "?")}`;

  return (
    <button
      type="button"
      role="gridcell"
      data-card={index}
      className={`card ${card.status}${miss ? " miss" : ""}${mine ? " mine" : ""}${card.seen && card.status === "down" ? " seen" : ""}`}
      style={color ? ({ "--seat": color } as CSSProperties) : undefined}
      tabIndex={tabIndex}
      aria-disabled={!canFlip}
      aria-label={`Card ${index + 1}, ${state}${card.seen && card.status === "down" ? ", seen before" : ""}`}
      onClick={() => canFlip && onFlip(index)}
      onPointerEnter={() => interactive && onFocusCard(index)}
      onFocus={() => interactive && onFocusCard(index)}
    >
      <span className="card-inner">
        <span className="card-back">
          <TripleMark size={18} className="back-mark" />
          {xray !== null && card.status === "down" && (
            <span className="xray">
              <Glyph value={xray} size={22} />
            </span>
          )}
        </span>
        <span className="card-face">
          {face !== null && (
            <>
              <Glyph value={face} />
              <span className="pip mono">{face + 1}</span>
            </>
          )}
        </span>
      </span>
      {holder && card.status !== "down" && (
        <span className="holder" aria-hidden="true">
          {mine ? "you" : initials(holder.name)}
        </span>
      )}
      {watchers && (
        <span className="watchers" aria-hidden="true">
          {watchers.map((w) => (
            <span key={w.id} className="watcher" style={{ background: seatColor(w.seat) }} title={`${w.name} is looking here`} />
          ))}
        </span>
      )}
    </button>
  );
});
