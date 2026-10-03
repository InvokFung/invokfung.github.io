// What the viewer draws, built incrementally as batches stream in.
//
// Every printed segment becomes one instance of a small extrusion mesh. The
// instances are appended in print order, layer by layer, so "layers 0..L" is
// always a prefix of the instance buffer and scrubbing only changes
// instanceCount: nothing is re-uploaded.
import { PathKind, type Batch } from "../core/abi";
import { Toolpaths } from "../core/toolpaths";

/**
 * Floats per segment instance:
 *   start x, y, z (mm, bead centre), kind + height / 2  (kind is the integer part)
 *   end   x, y, z,                    layer index
 */
export const SEG_FLOATS = 8;

export class PreviewStore {
  readonly tp: Toolpaths;
  seg = new Float32Array(SEG_FLOATS * 4096);
  segCount = 0;
  /** first instance of each path (a contour path has none: it points at the next one) */
  pathSeg = new Uint32Array(1024);
  /** number of instances in layers 0..i */
  readonly layerSegEnd: Uint32Array;
  /** extruded length per kind, mm */
  readonly lengthByKind = new Float64Array(6);
  /** bumped on every append; the viewer uploads the new tail */
  version = 0;

  constructor(readonly totalLayers: number) {
    this.tp = new Toolpaths(totalLayers);
    this.layerSegEnd = new Uint32Array(totalLayers);
  }

  get layers() {
    return this.tp.layerCount;
  }

  /** Instances before layer `i`. */
  layerSegStart(i: number) {
    return i > 0 ? this.layerSegEnd[i - 1] : 0;
  }

  append(b: Batch) {
    const tp = this.tp;
    const p0 = tp.pathCount,
      l0 = tp.layerCount;
    tp.append(b);

    let add = 0;
    for (let p = p0; p < tp.pathCount; p++) {
      if (tp.pathKind[p] === PathKind.Contour) continue;
      const n = tp.pathPointCount[p];
      add += tp.pathClosed[p] ? n : Math.max(0, n - 1);
    }
    if ((this.segCount + add) * SEG_FLOATS > this.seg.length) {
      const next = new Float32Array(Math.max((this.segCount + add) * SEG_FLOATS, this.seg.length * 2));
      next.set(this.seg.subarray(0, this.segCount * SEG_FLOATS));
      this.seg = next;
    }
    if (tp.pathCount > this.pathSeg.length) {
      const next = new Uint32Array(Math.max(tp.pathCount, this.pathSeg.length * 2));
      next.set(this.pathSeg);
      this.pathSeg = next;
    }

    const s = this.seg,
      q = tp.points;
    let k = this.segCount * SEG_FLOATS;
    for (let L = l0; L < tp.layerCount; L++) {
      const h = tp.layerHeight[L],
        zc = tp.layerZ[L] - h / 2;
      const pFrom = tp.layerPathStart[L],
        pTo = pFrom + tp.layerPathCount[L];
      for (let p = pFrom; p < pTo; p++) {
        this.pathSeg[p] = k / SEG_FLOATS;
        const kind = tp.pathKind[p];
        if (kind === PathKind.Contour) continue;
        const n = tp.pathPointCount[p],
          first = tp.pathPointStart[p];
        const m = tp.pathClosed[p] ? n : n - 1;
        const tag = kind + h / 2;
        let len = 0;
        for (let i = 0; i < m; i++) {
          const a = (first + i) * 2,
            c = (first + ((i + 1) % n)) * 2;
          const ax = q[a] / 1000,
            ay = q[a + 1] / 1000,
            bx = q[c] / 1000,
            by = q[c + 1] / 1000;
          s[k] = ax;
          s[k + 1] = ay;
          s[k + 2] = zc;
          s[k + 3] = tag;
          s[k + 4] = bx;
          s[k + 5] = by;
          s[k + 6] = zc;
          s[k + 7] = L;
          k += SEG_FLOATS;
          len += Math.hypot(bx - ax, by - ay);
        }
        this.lengthByKind[kind] += len;
      }
      this.layerSegEnd[L] = k / SEG_FLOATS;
    }
    this.segCount = k / SEG_FLOATS;
    this.version++;
  }

  /** Paths of a layer, as [first, end) indices into the toolpaths. */
  layerPaths(L: number): [number, number] {
    const tp = this.tp;
    if (L < 0 || L >= tp.layerCount) return [0, 0];
    const a = tp.layerPathStart[L];
    return [a, a + tp.layerPathCount[L]];
  }

  /** Line segments (x, y pairs, mm, as consecutive point pairs) of the raw slice outline of a layer. */
  contourSegments(L: number): Float32Array {
    const tp = this.tp,
      q = tp.points;
    const [a, b] = this.layerPaths(L);
    let n = 0;
    for (let p = a; p < b; p++) if (tp.pathKind[p] === PathKind.Contour) n += tp.pathPointCount[p];
    const out = new Float32Array(n * 4);
    let k = 0;
    for (let p = a; p < b; p++) {
      if (tp.pathKind[p] !== PathKind.Contour) continue;
      const first = tp.pathPointStart[p],
        c = tp.pathPointCount[p];
      for (let i = 0; i < c; i++) {
        const u = (first + i) * 2,
          v = (first + ((i + 1) % c)) * 2;
        out[k++] = q[u] / 1000;
        out[k++] = q[u + 1] / 1000;
        out[k++] = q[v] / 1000;
        out[k++] = q[v + 1] / 1000;
      }
    }
    return out;
  }

  /** First and last printed point of a layer (mm), for travel moves and the parked nozzle. */
  layerEnds(L: number): { first: [number, number]; last: [number, number] } | null {
    const tp = this.tp,
      q = tp.points;
    const [a, b] = this.layerPaths(L);
    let first: [number, number] | null = null,
      last: [number, number] | null = null;
    for (let p = a; p < b; p++) {
      if (tp.pathKind[p] === PathKind.Contour) continue;
      const s = tp.pathPointStart[p],
        n = tp.pathPointCount[p];
      if (!first) first = [q[s * 2] / 1000, q[s * 2 + 1] / 1000];
      const e = tp.pathClosed[p] ? s : s + n - 1;
      last = [q[e * 2] / 1000, q[e * 2 + 1] / 1000];
    }
    return first && last ? { first, last } : null;
  }

  /** Travel moves within a layer and from the previous layer's last point: x, y pairs per segment. */
  travelSegments(L: number): Float32Array {
    const tp = this.tp,
      q = tp.points;
    const [a, b] = this.layerPaths(L);
    const out: number[] = [];
    let pos = L > 0 ? this.layerEnds(L - 1)?.last ?? null : null;
    for (let p = a; p < b; p++) {
      if (tp.pathKind[p] === PathKind.Contour) continue;
      const s = tp.pathPointStart[p],
        n = tp.pathPointCount[p];
      const sx = q[s * 2] / 1000,
        sy = q[s * 2 + 1] / 1000;
      if (pos && Math.hypot(sx - pos[0], sy - pos[1]) > 0.05) out.push(pos[0], pos[1], sx, sy);
      const e = tp.pathClosed[p] ? s : s + n - 1;
      pos = [q[e * 2] / 1000, q[e * 2 + 1] / 1000];
    }
    return new Float32Array(out);
  }
}
