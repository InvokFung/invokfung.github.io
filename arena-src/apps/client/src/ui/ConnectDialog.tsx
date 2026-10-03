import { useEffect, useRef, useState } from "react";
import { configuredServer, saveServer } from "../state/client";

export function ConnectDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(configuredServer() ?? "ws://localhost:8782/ws");
  const ref = useRef<HTMLDialogElement>(null);
  const valid = /^wss?:\/\/[^\s]+$/.test(url.trim());

  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  const apply = (next: string | null) => {
    saveServer(next);
    const u = new URL(location.href);
    u.searchParams.delete("server");
    u.hash = "#/";
    history.replaceState(null, "", u.toString());
    location.reload();
  };

  return (
    <dialog ref={ref} className="dialog glass" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="connect-title">
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) apply(url.trim());
        }}
      >
        <h2 id="connect-title">Connect to a server</h2>
        <p className="muted small">
          Without a server this page runs <b>Local Arena</b>: the same server code in a Web Worker, with bots. To play people, run the Node server and point the page at it:
        </p>
        <pre className="code-block mono">cd arena-src && npm install && npm run dev:server</pre>
        <label className="field">
          <span className="muted">WebSocket URL</span>
          <input className="mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="wss://arena.example.com/ws" autoFocus />
        </label>
        <p className="muted small">
          A page served over https can only open <span className="mono">wss://</span> sockets (plain <span className="mono">ws://localhost</span> works from a local copy). You can also pass <span className="mono">?server=wss://…</span> in the URL.
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={() => apply(null)}>
            Use Local Arena
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            Connect
          </button>
        </div>
      </form>
    </dialog>
  );
}
