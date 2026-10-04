import { useState } from "react";
import type { BotLevel } from "@arena/engine";
import { ROOM_CODE } from "@arena/protocol";
import { useArena, useClient, go } from "./context";
import { DemoBoard } from "./DemoBoard";
import { Engineering, SOURCE_URL } from "./Engineering";
import { BOT_LABEL, ago, seatColor } from "./format";

const LEVELS: BotLevel[] = ["rookie", "adept", "ace"];

export function Lobby({ onConnect }: { onConnect: () => void }) {
  const client = useClient();
  const { me, mode, queue, replays, ladder, live, link } = useArena();
  const [level, setLevel] = useState<BotLevel>("adept");
  const [code, setCode] = useState("");
  const [name, setName] = useState(me?.name ?? "");
  const ready = link === "open" && me !== null;
  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);

  return (
    <div className="page lobby">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow mono">Real-time multiplayer · authoritative server · event-sourced</div>
          <h1>
            TripleFind <span className="grad">Arena</span>
          </h1>
          <p className="pitch">
            A memory race on one shared board, played over a server that deals and checks every flip, logs each match as events and rebuilds replays and the ladder from that log. On this page the same server runs in a Web Worker, so you can play it right now.
          </p>

          <div className="play glass">
            <label className="field">
              <span className="muted">Your name</span>
              <input
                value={name}
                maxLength={18}
                placeholder={me?.name ?? "Player"}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && name.trim() !== me?.name && client.setName(name.trim())}
              />
            </label>
            {queue.searching ? (
              <div className="searching" aria-live="polite">
                <span className="spinner" aria-hidden="true" />
                <div>
                  <b>Finding a table…</b>
                  <div className="muted small">{mode === "local" ? "Bots are pulling up chairs." : `${queue.waiting} waiting · bots fill in if nobody comes`}</div>
                </div>
                <button className="btn ghost small" onClick={() => client.send({ type: "queue_leave" })}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="quick">
                  <button className="btn primary big" disabled={!ready} onClick={() => client.quickMatch(level)}>
                    Quick match
                  </button>
                  <div className="seg" role="radiogroup" aria-label="Bot difficulty">
                    {LEVELS.map((l) => (
                      <button key={l} role="radio" aria-checked={level === l} className={level === l ? "on" : ""} onClick={() => setLevel(l)}>
                        {BOT_LABEL[l]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="or muted">
                  <span>or</span>
                </div>
                <div className="room-actions">
                  <button className="btn" disabled={!ready} onClick={() => client.createRoom()}>
                    Create a room
                  </button>
                  <form
                    className="join"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (ROOM_CODE.test(cleanCode)) client.joinRoom(cleanCode);
                    }}
                  >
                    <input aria-label="Room code" placeholder="CODE" value={cleanCode} onChange={(e) => setCode(e.target.value)} className="mono" />
                    <button className="btn" disabled={!ready || !ROOM_CODE.test(cleanCode)}>
                      Join
                    </button>
                  </form>
                </div>
              </>
            )}
            <p className="mode-note muted small">
              {mode === "local" ? (
                <>
                  <b>Local Arena:</b> the server, the bots and an IndexedDB event store run in a worker in this tab.{" "}
                  <button className="link" onClick={onConnect}>
                    Connect to a real server
                  </button>
                </>
              ) : (
                <>
                  Connected to <span className="mono">{client.getState().serverLabel}</span>. Room codes work across devices.{" "}
                  <button className="link" onClick={onConnect}>
                    Change
                  </button>
                </>
              )}
            </p>
          </div>
          <p className="origin muted small">
            Rules from my 2023 single-player <a href="/triplefind/">TripleFind</a>: find every triple, faster finds score more (up to 1000, or a flat 500 below half time), and a miss that re-flips a seen card costs 200.
          </p>
        </div>
        <DemoBoard />
      </section>

      <section className="boards">
        <div className="glass panel">
          <div className="panel-head">
            <h2>Recent replays</h2>
            <span className="muted small">rebuilt from the event log</span>
          </div>
          {replays.length === 0 ? (
            <p className="muted small">Finished matches appear here. Play one!</p>
          ) : (
            <ul className="list">
              {replays.slice(0, 6).map((r) => (
                <li key={r.matchId}>
                  <button className="row" onClick={() => go(`#/replay/${r.matchId}`)}>
                    <span className="row-main">
                      {r.standings.map((s) => (
                        <span key={s.playerId} className="dot" style={{ background: seatColor(s.seat) }} title={s.name} />
                      ))}
                      <b>{r.standings[0]?.name}</b> <span className="muted">won with {r.standings[0]?.score}</span>
                    </span>
                    <span className="muted small mono">{r.reason === "abandoned" ? "abandoned" : `${r.cardCount} cards · ${ago(r.finishedAt)}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="glass panel">
          <div className="panel-head">
            <h2>Ladder</h2>
            <button className="link small" onClick={() => go("#/ladder")}>
              Full table →
            </button>
          </div>
          {ladder.length === 0 ? (
            <p className="muted small">Win a rated match (two or more players, bots count) to get on the board.</p>
          ) : (
            <ol className="list ladder-mini">
              {ladder.slice(0, 5).map((e, i) => (
                <li key={e.playerId} className={e.playerId === me?.playerId ? "me" : ""}>
                  <span className="mono rank">{i + 1}</span>
                  <span className="row-main">{e.name}</span>
                  <span className="mono">{e.rating}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="glass panel">
          <div className="panel-head">
            <h2>Live now</h2>
            <button className="link small" onClick={() => client.send({ type: "list_live" })}>
              Refresh
            </button>
          </div>
          {live.length === 0 ? (
            <p className="muted small">{mode === "local" ? "Spectating needs a shared server: connect one and open a second browser." : "No matches running right now."}</p>
          ) : (
            <ul className="list">
              {live.map((m) => (
                <li key={m.matchId}>
                  <button className="row" onClick={() => client.send({ type: "spectate", matchId: m.matchId })}>
                    <span className="row-main">
                      {m.players.map((p, i) => (
                        <span key={i} className="dot" style={{ background: seatColor(p.seat) }} title={p.name} />
                      ))}
                      {m.players.map((p) => p.name).join(" vs ")}
                    </span>
                    <span className="muted small mono">watch · {m.triplesLeft} left</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Engineering />

      <footer className="foot muted small">
        <a href="/">Afung</a> · <a href={SOURCE_URL} target="_blank" rel="noreferrer">source</a> · <a href="/triplefind/">the 2023 original</a>
      </footer>
    </div>
  );
}
