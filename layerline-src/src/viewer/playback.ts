// The nozzle animation: a layer's moves in print order, each with its own
// duration at the feed rate the G-code would use, so walls visibly slow down
// and travels snap across.
import { PathKind } from "../core/abi";
import { speedFor, type PrinterProfile } from "../gcode/gcode";
import type { PreviewStore } from "./store";

export interface Timeline {
  layer: number;
  z: number;
  /** cumulative end time (s) of each move */
  end: Float64Array;
  /** x0, y0, x1, y1 per move (mm) */
  xy: Float32Array;
  /** absolute instance of an extrusion move, -1 for a travel */
  inst: Int32Array;
  /** instances fully drawn when each move starts */
  before: Uint32Array;
  duration: number;
}

export function buildTimeline(store: PreviewStore, L: number, profile: PrinterProfile): Timeline {
  const tp = store.tp,
    q = tp.points;
  const [a, b] = store.layerPaths(L);
  const end: number[] = [],
    xy: number[] = [],
    inst: number[] = [],
    before: number[] = [];
  let drawn = store.layerSegStart(L);
  let pos = L > 0 ? (store.layerEnds(L - 1)?.last ?? null) : null;
  let t = 0;
  const move = (x0: number, y0: number, x1: number, y1: number, v: number, i: number) => {
    t += Math.hypot(x1 - x0, y1 - y0) / v;
    end.push(t);
    xy.push(x0, y0, x1, y1);
    inst.push(i);
    before.push(drawn);
    if (i >= 0) drawn = i + 1;
  };
  for (let p = a; p < b; p++) {
    const kind = tp.pathKind[p];
    if (kind === PathKind.Contour) continue;
    const s = tp.pathPointStart[p],
      n = tp.pathPointCount[p];
    const m = tp.pathClosed[p] ? n : n - 1;
    const sx = q[s * 2] / 1000,
      sy = q[s * 2 + 1] / 1000;
    if (pos && Math.hypot(sx - pos[0], sy - pos[1]) > 0.01) move(pos[0], pos[1], sx, sy, profile.speeds.travel, -1);
    const v = speedFor(profile, kind, L);
    const i0 = store.pathSeg[p];
    for (let i = 0; i < m; i++) {
      const u = (s + i) * 2,
        w = (s + ((i + 1) % n)) * 2;
      move(q[u] / 1000, q[u + 1] / 1000, q[w] / 1000, q[w + 1] / 1000, v, i0 + i);
    }
    const e = tp.pathClosed[p] ? s : s + n - 1;
    pos = [q[e * 2] / 1000, q[e * 2 + 1] / 1000];
  }
  return {
    layer: L,
    z: tp.layerZ[L],
    end: Float64Array.from(end),
    xy: Float32Array.from(xy),
    inst: Int32Array.from(inst),
    before: Uint32Array.from(before),
    duration: t,
  };
}

export interface PlaybackSample {
  x: number;
  y: number;
  /** instances to draw */
  count: number;
  /** instance being extruded right now (drawn up to `frac`), or -1 */
  cut: number;
  frac: number;
  extruding: boolean;
}

/** The state of the layer `t` seconds into its timeline. */
export function sampleTimeline(tl: Timeline, t: number, out: PlaybackSample): PlaybackSample {
  const n = tl.end.length;
  if (n === 0) {
    out.cut = -1;
    out.extruding = false;
    return out;
  }
  if (t >= tl.duration) {
    out.x = tl.xy[(n - 1) * 4 + 2];
    out.y = tl.xy[(n - 1) * 4 + 3];
    const last = tl.inst[n - 1];
    out.count = last >= 0 ? last + 1 : tl.before[n - 1];
    out.cut = -1;
    out.frac = 1;
    out.extruding = false;
    return out;
  }
  let lo = 0,
    hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tl.end[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  const t0 = lo > 0 ? tl.end[lo - 1] : 0;
  const f = Math.min(1, Math.max(0, (t - t0) / Math.max(1e-9, tl.end[lo] - t0)));
  const k = lo * 4;
  out.x = tl.xy[k] + (tl.xy[k + 2] - tl.xy[k]) * f;
  out.y = tl.xy[k + 1] + (tl.xy[k + 3] - tl.xy[k + 1]) * f;
  out.frac = f;
  if (tl.inst[lo] >= 0) {
    out.cut = tl.inst[lo];
    out.count = tl.inst[lo] + 1;
    out.extruding = true;
  } else {
    out.cut = -1;
    out.count = tl.before[lo];
    out.extruding = false;
  }
  return out;
}
