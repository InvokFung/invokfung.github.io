import { app, navigate, setAbout, startDemo, startMic, stopSource, type View } from "../state/app";
import { useStore } from "../state/store";

export const SOURCE_URL = "https://github.com/InvokFung/invokfung.github.io/tree/main/studio-src";

const TABS: { id: View; label: string }[] = [
  { id: "home", label: "Overview" },
  { id: "tuner", label: "Tuner" },
  { id: "drill", label: "Drills" },
  { id: "progress", label: "Progress" },
];

export function Logo() {
  // A tuning-fork-like mark: two tines and a wave.
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="0.55" stopColor="#06b6d4" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#0d111c" stroke="rgba(148,163,184,.25)" />
      <path d="M5 18 C 9 9, 12 9, 16 16 S 23 23, 27 14" fill="none" stroke="url(#logo-g)" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="5" y1="16" x2="27" y2="16" stroke="rgba(203,213,225,.35)" strokeWidth="1" />
    </svg>
  );
}

export function SourcePill() {
  const source = useStore(app, (s) => s.source);
  const status = useStore(app, (s) => s.status);
  if (status === "starting") return <span className="pill">Starting…</span>;
  if (!source)
    return (
      <span className="pill off" aria-live="polite">
        <span className="dot-off" /> Not listening
      </span>
    );
  return (
    <span className={`pill on ${source}`} aria-live="polite">
      <span className="dot-live" />
      {source === "mic" ? "Microphone" : "Demo violin"}
      <button className="pill-btn" onClick={() => void stopSource()} aria-label="Stop listening">
        Stop
      </button>
    </span>
  );
}

export function StartButtons({ compact = false }: { compact?: boolean }) {
  const status = useStore(app, (s) => s.status);
  return (
    <div className={`start-buttons${compact ? " compact" : ""}`}>
      <button className="btn primary" disabled={status === "starting"} onClick={() => void startDemo()}>
        <PlayIcon /> Watch the demo
      </button>
      <button className="btn ghost" disabled={status === "starting"} onClick={() => void startMic(app.get().view === "home" ? "tuner" : app.get().view)}>
        <MicIcon /> Use my microphone
      </button>
    </div>
  );
}

export const PlayIcon = () => (
  <svg viewBox="0 0 16 16" className="icon" aria-hidden="true">
    <path d="M4 2.8v10.4a.6.6 0 0 0 .9.5l8.4-5.2a.6.6 0 0 0 0-1L4.9 2.3a.6.6 0 0 0-.9.5Z" fill="currentColor" />
  </svg>
);

export const MicIcon = () => (
  <svg viewBox="0 0 16 16" className="icon" aria-hidden="true">
    <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M3 8a5 5 0 0 0 10 0M8 13v2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export function Header() {
  const view = useStore(app, (s) => s.view);
  const a4 = useStore(app, (s) => s.settings.a4);
  return (
    <header className="topbar">
      <a className="brand" href="/" title="Back to Afung's portfolio">
        <Logo />
        <span className="brand-owner">Afung</span>
        <span className="brand-sep">/</span>
        <span className="brand-name">Intonation Studio</span>
      </a>
      <nav className="tabs" aria-label="Views">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={t.id === "home" ? "#" : `#/${t.id}`}
            className={view === t.id ? "on" : ""}
            aria-current={view === t.id ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(t.id);
            }}
          >
            {t.label}
          </a>
        ))}
      </nav>
      <div className="top-right">
        <SourcePill />
        <span className="pill a4 mono" title="Reference pitch for A4 (change it in the Tuner)">
          A4 = {a4} Hz
        </span>
        <button className="ghost small" onClick={() => setAbout(true)}>
          How it works
        </button>
      </div>
    </header>
  );
}
