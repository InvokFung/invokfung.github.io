import { useEffect } from "react";
import { useArena, useClient } from "./context";
import { ago, pct } from "./format";

const ANCHORS = [
  { name: "Ace bot", rating: 1400 },
  { name: "Adept bot", rating: 1200 },
  { name: "Rookie bot", rating: 1000 },
];

export function LadderScreen() {
  const client = useClient();
  const { ladder, me } = useArena();
  useEffect(() => client.send({ type: "get_ladder", limit: 100 }), [client]);

  const rows = [...ladder.map((e) => ({ ...e, anchor: false })), ...ANCHORS.map((a) => ({ playerId: a.name, name: a.name, rating: a.rating, games: 0, wins: 0, lastPlayedAt: 0, anchor: true }))].sort(
    (a, b) => b.rating - a.rating,
  );
  let rank = 0;

  return (
    <div className="page narrow">
      <h1>Ladder</h1>
      <p className="muted">
        Elo (K = 32) over every finished, non-abandoned match with two or more players. A free-for-all counts as one game against each opponent, each worth K/(n−1). Bots are fixed anchors: they move your rating but never move themselves. The table is a projection: on startup it is rebuilt from the event store, and applying a match is idempotent.
      </p>
      <div className="glass panel">
        <table className="standings ladder">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th className="num">Rating</th>
              <th className="num">Games</th>
              <th className="num hide-sm">Win rate</th>
              <th className="num hide-sm">Last played</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.playerId} className={r.anchor ? "anchor" : r.playerId === me?.playerId ? "me" : ""}>
                <td className="mono">{r.anchor ? "" : ++rank}</td>
                <td>
                  {r.name}
                  {r.anchor && <span className="tag">anchor</span>}
                  {r.playerId === me?.playerId && <span className="tag you">you</span>}
                </td>
                <td className="num mono">{r.rating}</td>
                <td className="num mono">{r.anchor ? "—" : r.games}</td>
                <td className="num mono hide-sm">{r.anchor || r.games === 0 ? "—" : pct(r.wins / r.games)}</td>
                <td className="num hide-sm muted">{r.anchor ? "" : ago(r.lastPlayedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ladder.length === 0 && <p className="muted small">No rated matches yet.</p>}
      </div>
    </div>
  );
}
