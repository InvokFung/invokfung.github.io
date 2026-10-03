import { useState, type CSSProperties } from "react";
import type { BotLevel } from "@arena/engine";
import type { RoomView } from "@arena/protocol";
import { useArena, useClient, go } from "./context";
import { BOT_LABEL, initials, screenCardLimit, seatColor } from "./format";

const LEVELS: BotLevel[] = ["rookie", "adept", "ace"];

export function RoomScreen({ room }: { room: RoomView }) {
  const client = useClient();
  const { me, mode } = useArena();
  const [copied, setCopied] = useState(false);
  const host = room.hostId === me?.playerId;
  const st = room.settings;
  const humans = room.members.filter((m) => m.kind === "human").length;
  const limit = Math.max(6, screenCardLimit(window.innerWidth, window.innerHeight));
  const update = (patch: Partial<typeof st>) => client.send({ type: "update_room", ...patch });
  const link = `${location.origin}${location.pathname}${location.search}#/room/${room.code}`;
  const seats = Array.from({ length: st.maxPlayers }, (_, i) => room.members[i] ?? null);

  return (
    <div className="page narrow room">
      <div className="room-head">
        <div>
          <div className="eyebrow mono">Room</div>
          <div className="code mono">{room.code}</div>
        </div>
        {mode === "remote" ? (
          <button
            className="btn"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "Link copied" : "Copy invite link"}
          </button>
        ) : (
          <span className="muted small room-local">Local Arena rooms live in this tab. Connect a server to invite people.</span>
        )}
      </div>

      <div className="seats">
        {seats.map((m, i) => (
          <div key={i} className={`seat glass${m ? "" : " empty"}`} style={{ "--seat": seatColor(i) } as CSSProperties}>
            {m ? (
              <>
                <span className="avatar">{initials(m.name)}</span>
                <div>
                  <div className="seat-name">
                    {m.name}
                    {m.id === room.hostId && <span className="tag">host</span>}
                    {m.id === me?.playerId && <span className="tag you">you</span>}
                    {m.kind === "bot" && <span className="tag">joins at start</span>}
                  </div>
                  <div className="muted small mono">
                    {m.rating ?? "—"} {m.kind === "bot" ? "anchor" : "rating"}
                    {!m.connected && " · reconnecting"}
                  </div>
                </div>
              </>
            ) : (
              <span className="muted">Open seat</span>
            )}
          </div>
        ))}
      </div>

      <div className="glass panel settings">
        <div className="setting">
          <label htmlFor="cards">Cards</label>
          <input
            id="cards"
            type="range"
            min={6}
            max={limit}
            step={3}
            value={Math.min(st.cardCount, limit)}
            disabled={!host}
            onChange={(e) => update({ cardCount: Number(e.target.value) })}
          />
          <span className="mono val">{st.cardCount}</span>
          <span className="muted small hint">this screen fits up to {limit}</span>
        </div>
        <div className="setting">
          <span className="label">Seats</span>
          <div className="seg">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} disabled={!host || n < humans + st.bots} className={st.maxPlayers === n ? "on" : ""} onClick={() => update({ maxPlayers: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <span className="label">Bots</span>
          <div className="seg">
            {[0, 1, 2, 3].map((n) => (
              <button key={n} disabled={!host || humans + n > st.maxPlayers} className={st.bots === n ? "on" : ""} onClick={() => update({ bots: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <span className="label">Bot level</span>
          <div className="seg">
            {LEVELS.map((l) => (
              <button key={l} disabled={!host} className={st.botLevel === l ? "on" : ""} onClick={() => update({ botLevel: l })}>
                {BOT_LABEL[l]}
              </button>
            ))}
          </div>
        </div>
        <p className="muted small">
          {humans + st.bots === 1 ? "Solo: the original single-player game, timer and scoring unchanged." : `${humans + st.bots} players race on one board. Time limit ${Math.floor((6 * (st.cardCount / 3) ** 2) / 1.85) + 13}s.`}
        </p>
      </div>

      <div className="room-actions-bar">
        {host ? (
          <button className="btn primary big" disabled={room.status !== "lobby"} onClick={() => client.send({ type: "start_match" })}>
            {room.status === "playing" ? "Match running…" : "Start match"}
          </button>
        ) : (
          <span className="muted">Waiting for the host to start…</span>
        )}
        {room.status === "playing" && room.matchId && (
          <button className="btn" onClick={() => client.send({ type: "spectate", matchId: room.matchId! })}>
            Watch
          </button>
        )}
        <button
          className="btn ghost"
          onClick={() => {
            client.send({ type: "leave_room" });
            go("#/");
          }}
        >
          Leave room
        </button>
      </div>
    </div>
  );
}
