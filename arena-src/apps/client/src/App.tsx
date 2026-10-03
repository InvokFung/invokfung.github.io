import { useEffect, useMemo, useRef, useState } from "react";
import { ROOM_CODE } from "@arena/protocol";
import { ArenaClient, configuredServer } from "./state/client";
import { ClientContext, useArena, useClient, useHash, go } from "./ui/context";
import { TripleMark } from "./ui/CardArt";
import { Lobby } from "./ui/Lobby";
import { MatchScreen } from "./ui/Match";
import { RoomScreen } from "./ui/Room";
import { ReplayScreen } from "./ui/Replay";
import { LadderScreen } from "./ui/Ladder";
import { ConnectDialog } from "./ui/ConnectDialog";
import { SOURCE_URL } from "./ui/Engineering";

export default function App() {
  const client = useMemo(() => new ArenaClient(configuredServer()), []);
  useEffect(() => () => client.destroy(), [client]);
  return (
    <ClientContext.Provider value={client}>
      <Shell />
    </ClientContext.Provider>
  );
}

function Shell() {
  const client = useClient();
  const { match, room, me, toasts, mode } = useArena();
  const hash = useHash();
  const [connectOpen, setConnectOpen] = useState(false);
  const joined = useRef<string | null>(null);

  // Invite links: #/room/CODE joins once we are welcomed.
  const linkCode = /^#\/room\/([A-Z0-9]{5})$/.exec(hash)?.[1] ?? null;
  useEffect(() => {
    if (linkCode && ROOM_CODE.test(linkCode) && me && !room && joined.current !== linkCode) {
      joined.current = linkCode;
      client.joinRoom(linkCode);
    }
  }, [client, linkCode, me, room]);

  // Keep the address bar meaningful.
  useEffect(() => {
    if (room && !match && !hash.startsWith("#/room/")) history.replaceState(null, "", `#/room/${room.code}`);
    if (!room && hash.startsWith("#/room/") && joined.current && joined.current === linkCode) history.replaceState(null, "", "#/");
  }, [room, match, hash, linkCode]);

  const replayId = /^#\/replay\/([a-z]_[a-z0-9]+)$/.exec(hash)?.[1] ?? null;
  let screen: "match" | "replay" | "room" | "ladder" | "lobby" = "lobby";
  if (match) screen = "match";
  else if (replayId) screen = "replay";
  else if (room) screen = "room";
  else if (hash === "#/ladder") screen = "ladder";

  useEffect(() => {
    document.body.dataset.screen = screen;
    if (screen !== "match") window.scrollTo({ top: 0 });
  }, [screen]);

  return (
    <div className={`app screen-${screen}`}>
      <Header onConnect={() => setConnectOpen(true)} compact={screen === "match"} />
      <main id="main">
        {screen === "match" && <MatchScreen />}
        {screen === "replay" && replayId && <ReplayScreen matchId={replayId} />}
        {screen === "room" && room && <RoomScreen room={room} />}
        {screen === "ladder" && <LadderScreen />}
        {screen === "lobby" && <Lobby onConnect={() => setConnectOpen(true)} />}
      </main>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <button key={t.id} className="toast glass" onClick={() => client.dismissToast(t.id)}>
            {t.message}
          </button>
        ))}
      </div>
      {connectOpen && <ConnectDialog onClose={() => setConnectOpen(false)} />}
      <span hidden data-mode={mode} />
    </div>
  );
}

function Header({ onConnect, compact }: { onConnect: () => void; compact: boolean }) {
  const { link, mode, serverLabel, me, rttMs } = useArena();
  const client = useClient();
  const dot = link === "open" ? "ok" : link === "closed" ? "bad" : "warn";
  return (
    <header className={`top${compact ? " compact" : ""}`}>
      <a className="brand" href="/" title="Back to the portfolio">
        <TripleMark size={20} />
        <span>
          TripleFind <span className="grad">Arena</span>
        </span>
      </a>
      <nav className="nav" aria-label="Arena">
        <button
          className="link"
          onClick={() => {
            if (client.getState().match?.status === "finished") client.clearMatch();
            go("#/");
          }}
        >
          Play
        </button>
        <button className="link" onClick={() => go("#/ladder")}>
          Ladder
        </button>
        <button
          className="link hide-sm"
          onClick={() => {
            go("#/");
            requestAnimationFrame(() => document.getElementById("engineering")?.scrollIntoView({ behavior: "smooth" }));
          }}
        >
          Engineering
        </button>
        <a className="link hide-sm" href={SOURCE_URL} target="_blank" rel="noreferrer">
          Source ↗
        </a>
      </nav>
      <div className="top-right">
        <button className={`conn ${dot}`} onClick={onConnect} title="Server connection">
          <span className="conn-dot" />
          <span className="conn-label">{mode === "local" ? "Local Arena" : serverLabel}</span>
          {rttMs !== null && link === "open" && <span className="mono muted conn-rtt">{rttMs < 1 ? "<1" : Math.round(rttMs)} ms</span>}
        </button>
        {me && (
          <span className="me-chip mono" title="Your rating">
            {me.rating}
          </span>
        )}
      </div>
    </header>
  );
}
