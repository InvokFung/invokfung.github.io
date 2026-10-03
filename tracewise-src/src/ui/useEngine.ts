import { useCallback, useEffect, useRef, useState } from "react";
import type { Waterfall } from "../core/analyze";
import type { FromWorker, IncidentView, MinutePoint, Snapshot, ToWorker, TraceSummary, UploadResult } from "../worker/protocol";

export type SnapshotListener = (s: Snapshot) => void;

export interface Engine {
  send: (m: ToWorker) => void;
  /** For drawing code that wants every snapshot without a React render. */
  subscribe: (fn: SnapshotListener) => () => void;
  startHour: number;
  warm: { done: number; total: number } | null;
  snap: Snapshot | null;
  points: MinutePoint[];
  incidents: IncidentView[];
  traces: TraceSummary[];
  waterfall: { traceId: string; waterfall: Waterfall | null } | null;
  upload: { busy: boolean; result?: UploadResult; error?: string; waterfall?: Waterfall | null };
  sample: { text: string; spans: number; traces: number } | null;
  failed: string | null;
}

const KEEP_POINTS = 150;

export function useEngine(): Engine {
  const worker = useRef<Worker | null>(null);
  const listeners = useRef(new Set<SnapshotListener>());
  const [startHour, setStartHour] = useState(9.4);
  const [warm, setWarm] = useState<Engine["warm"]>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [points, setPoints] = useState<MinutePoint[]>([]);
  const [incidents, setIncidents] = useState<IncidentView[]>([]);
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [waterfall, setWaterfall] = useState<Engine["waterfall"]>(null);
  const [upload, setUpload] = useState<Engine["upload"]>({ busy: false });
  const [sample, setSample] = useState<Engine["sample"]>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let w: Worker;
    try {
      w = new Worker(new URL("../worker/engine.worker.ts", import.meta.url), { type: "module" });
    } catch (e) {
      setFailed((e as Error).message);
      return;
    }
    worker.current = w;
    w.onerror = (e) => setFailed(e.message || "the engine stopped");
    w.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data;
      switch (m.type) {
        case "ready":
          setStartHour(m.startHour);
          break;
        case "warmup":
          setWarm({ done: m.done, total: m.total });
          break;
        case "snapshot":
          setSnap(m.snap);
          for (const fn of listeners.current) fn(m.snap);
          break;
        case "minute":
          setPoints((p) => {
            const next = p.length >= KEEP_POINTS ? p.slice(p.length - KEEP_POINTS + 1) : p.slice();
            next.push(m.point);
            return next;
          });
          break;
        case "incident":
          setIncidents((list) => {
            const i = list.findIndex((x) => x.id === m.incident.id);
            if (i < 0) return [...list, m.incident].slice(-20);
            const next = list.slice();
            next[i] = m.incident;
            return next;
          });
          break;
        case "traces":
          setTraces(m.traces);
          break;
        case "waterfall":
          if (m.source === "live") setWaterfall({ traceId: m.traceId, waterfall: m.waterfall });
          else setUpload((u) => ({ ...u, waterfall: m.waterfall }));
          break;
        case "upload":
          setUpload({ busy: false, result: m.result, error: m.error, waterfall: m.result?.first ?? null });
          break;
        case "sample":
          setSample({ text: m.text, spans: m.spans, traces: m.traces });
          break;
      }
    };
    const onVis = () => w.postMessage({ type: "visible", visible: document.visibilityState === "visible" } satisfies ToWorker);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      w.terminate();
      worker.current = null;
    };
  }, []);

  const send = useCallback((m: ToWorker) => {
    if (m.type === "upload" || (m.type === "sample" && m.analyse)) setUpload((u) => ({ ...u, busy: true, error: undefined }));
    worker.current?.postMessage(m);
  }, []);

  const subscribe = useCallback((fn: SnapshotListener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  return { send, subscribe, startHour, warm, snap, points, incidents, traces, waterfall, upload, sample, failed };
}
