// Accumulates streamed batches into one set of growable flat arrays, with
// absolute indices. Used by the worker (for G-code) and by the viewer.
import type { Batch } from "./abi";

function grow<T extends Float32Array | Uint32Array | Uint8Array | Int32Array>(a: T, need: number): T {
  if (need <= a.length) return a;
  const next = new (a.constructor as new (n: number) => T)(Math.max(need, a.length * 2, 64));
  next.set(a);
  return next;
}

export class Toolpaths {
  layerCount = 0;
  pathCount = 0;
  pointCount = 0;
  layerZ = new Float32Array(0);
  layerHeight = new Float32Array(0);
  layerPathStart = new Uint32Array(0);
  layerPathCount = new Uint32Array(0);
  pathPointStart = new Uint32Array(0);
  pathPointCount = new Uint32Array(0);
  pathKind = new Uint8Array(0);
  pathClosed = new Uint8Array(0);
  /** x, y pairs in micrometres */
  points = new Int32Array(0);

  constructor(readonly totalLayers: number) {}

  append(b: Batch) {
    if (b.layerFrom !== this.layerCount) throw new Error(`toolpaths: expected layer ${this.layerCount}, got ${b.layerFrom}`);
    const nl = b.layerTo - b.layerFrom,
      np = b.pathKind.length,
      nq = b.points.length / 2;
    const L = this.layerCount,
      P = this.pathCount,
      Q = this.pointCount;
    this.layerZ = grow(this.layerZ, L + nl);
    this.layerHeight = grow(this.layerHeight, L + nl);
    this.layerPathStart = grow(this.layerPathStart, L + nl);
    this.layerPathCount = grow(this.layerPathCount, L + nl);
    this.pathPointStart = grow(this.pathPointStart, P + np);
    this.pathPointCount = grow(this.pathPointCount, P + np);
    this.pathKind = grow(this.pathKind, P + np);
    this.pathClosed = grow(this.pathClosed, P + np);
    this.points = grow(this.points, (Q + nq) * 2);
    this.layerZ.set(b.layerZ, L);
    this.layerHeight.set(b.layerHeight, L);
    this.layerPathCount.set(b.layerPathCount, L);
    for (let i = 0; i < nl; i++) this.layerPathStart[L + i] = P + b.layerPathStart[i];
    this.pathPointCount.set(b.pathPointCount, P);
    this.pathKind.set(b.pathKind, P);
    this.pathClosed.set(b.pathClosed, P);
    for (let i = 0; i < np; i++) this.pathPointStart[P + i] = Q + b.pathPointStart[i];
    this.points.set(b.points, Q * 2);
    this.layerCount += nl;
    this.pathCount += np;
    this.pointCount += nq;
  }

  get complete() {
    return this.layerCount === this.totalLayers;
  }
}
