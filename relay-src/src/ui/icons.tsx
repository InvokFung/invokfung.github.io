import type { Stage } from "@relay/core";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** One small line icon per stage, plus the client. */
export function StageIcon({ stage }: { stage: Stage | "client" }) {
  switch (stage) {
    case "client":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="11.5" rx="2" {...P} />
          <path d="M9 20h6M12 16.5V20M7.5 9.5l2 1.5-2 1.5M11.5 12.5h4" {...P} />
        </svg>
      );
    case "audit":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="9" width="6" height="6" rx="1.5" {...P} />
          <rect x="15" y="9" width="6" height="6" rx="1.5" {...P} />
          <path d="M9 12h6" {...P} />
          <path d="M5 9V6.5M19 15v2.5" {...P} />
        </svg>
      );
    case "auth":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="8" cy="12" r="3.6" {...P} />
          <path d="M11.6 12H20.5M17.5 12v3M20.5 12v2.4" {...P} />
        </svg>
      );
    case "limit":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 16.5a7.5 7.5 0 0 1 15 0" {...P} />
          <path d="M12 16.5l3.6-4.6" {...P} />
          <path d="M4.5 19.5h15" {...P} />
        </svg>
      );
    case "redact":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 17h9" {...P} />
          <rect x="4" y="10.2" width="9.5" height="3.6" rx="1" fill="currentColor" stroke="none" />
          <path d="M16 12h4" {...P} />
        </svg>
      );
    case "screen":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5l7 2.6v5.4c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6.1z" {...P} />
          <path d="M9 12l2.2 2.2L15.2 10" {...P} />
        </svg>
      );
    case "cache":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <ellipse cx="12" cy="6.5" rx="7" ry="2.8" {...P} />
          <path d="M5 6.5v11c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-11M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" {...P} />
        </svg>
      );
    case "route":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12h5c2.5 0 3.5-5 6-5h5M9 12c2.5 0 3.5 5 6 5h5" {...P} />
          <path d="M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5" {...P} />
        </svg>
      );
    case "meter":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" {...P} />
          <path d="M14.6 9.2c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2.1 2.7.9 2.7 2.1-1.2 2.1-2.7 2.1c-1.2 0-2.2-.5-2.7-1.5M12 6.3v1.5M12 16.2v1.5" {...P} />
        </svg>
      );
    case "resilience":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 12a7 7 0 0 1-12.2 4.7M5 12a7 7 0 0 1 12.2-4.7" {...P} />
          <path d="M17.6 3.8v3.7h-3.7M6.4 20.2v-3.7h3.7" {...P} />
        </svg>
      );
  }
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 34 34" aria-hidden="true">
      <rect width="34" height="34" rx="9" fill="#141a17" stroke="#2e3833" />
      <path d="M6 11.5h6.5l4.3 5.5-4.3 5.5H6M18.5 11.5h4.3l4.3 5.5-4.3 5.5h-4.3" fill="none" stroke="#c6f36a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
