import type { Segment } from "../core/pii";
import { PII_LABEL } from "../core/pii";

/** Text with its PII spans replaced under the current policy, each replacement marked. */
export function Segments({ segs }: { segs: Segment[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.type ? (
          <mark key={i} className={`pii pii-${s.type}`} title={`${PII_LABEL[s.type]} (${s.text === s.original ? "kept" : "redacted"})`}>
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}
