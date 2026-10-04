// The TypeScript mirror of the C ABI in core/src/api.cpp and slicer.h.
// Field order matters: it is the memory layout of the C structs.

export interface SliceParams {
  /** mm */
  layerHeight: number;
  /** mm */
  firstLayerHeight: number;
  /** mm */
  lineWidth: number;
  perimeters: number;
  /** 0..1 */
  infillDensity: number;
  /** degrees; odd layers use the negated angle */
  infillAngle: number;
  topLayers: number;
  bottomLayers: number;
  /** mm */
  skirtDistance: number;
  skirtLoops: number;
  /** fraction of the line width */
  infillOverlap: number;
  /** mm */
  resolution: number;
  /** mm */
  closingRadius: number;
  miterLimit: number;
}

/** struct SliceParams, 16 four-byte fields (the last two reserved). */
export const PARAM_LAYOUT: readonly [keyof SliceParams, "f32" | "u32"][] = [
  ["layerHeight", "f32"],
  ["firstLayerHeight", "f32"],
  ["lineWidth", "f32"],
  ["perimeters", "u32"],
  ["infillDensity", "f32"],
  ["infillAngle", "f32"],
  ["topLayers", "u32"],
  ["bottomLayers", "u32"],
  ["skirtDistance", "f32"],
  ["skirtLoops", "u32"],
  ["infillOverlap", "f32"],
  ["resolution", "f32"],
  ["closingRadius", "f32"],
  ["miterLimit", "f32"],
];
export const PARAMS_BYTES = 64;

/** Same values as default_params() in slicer.cpp (checked by tests/wasm.test.ts). */
export const DEFAULT_PARAMS: SliceParams = {
  layerHeight: 0.2,
  firstLayerHeight: 0.2,
  lineWidth: 0.45,
  perimeters: 2,
  infillDensity: 0.2,
  infillAngle: 45,
  topLayers: 4,
  bottomLayers: 3,
  skirtDistance: 4,
  skirtLoops: 1,
  infillOverlap: 0.15,
  resolution: 0.0125,
  closingRadius: 0.2,
  miterLimit: 2,
};

/** struct Stats, all doubles, in this order. */
export const STAT_NAMES = [
  "triangles",
  "layers",
  "segments",
  "loops",
  "islands",
  "holes",
  "openChains",
  "repaired",
  "dropped",
  "reused",
  "paths",
  "points",
  "msSetup",
  "msContours",
  "msWalls",
  "msSkins",
  "msInfill",
  "msOrder",
  "arenaBytes",
] as const;
export type Stats = Record<(typeof STAT_NAMES)[number], number>;

export const PathKind = {
  OuterWall: 0,
  InnerWall: 1,
  SparseInfill: 2,
  SolidInfill: 3,
  Skirt: 4,
  Contour: 5,
} as const;
export type PathKind = (typeof PathKind)[keyof typeof PathKind];
export const PRINTED_KINDS: readonly PathKind[] = [0, 1, 2, 3, 4];

export const BATCH_MAGIC = 0x31424c4c; // "LLB1"

/** One batch of finished layers, decoded into flat typed arrays (transferable). */
export interface Batch {
  layerFrom: number;
  layerTo: number;
  layerZ: Float32Array;
  layerHeight: Float32Array;
  /** first path of each layer, relative to this batch */
  layerPathStart: Uint32Array;
  layerPathCount: Uint32Array;
  /** first point of each path, relative to this batch */
  pathPointStart: Uint32Array;
  pathPointCount: Uint32Array;
  pathKind: Uint8Array;
  pathClosed: Uint8Array;
  /** x, y pairs in micrometres */
  points: Int32Array;
}

/** Decodes a batch laid out as described in slicer.h. `bytes` must be a copy (not a view of wasm memory). */
export function decodeBatch(bytes: ArrayBuffer): Batch {
  const dv = new DataView(bytes);
  const u32 = (o: number) => dv.getUint32(o, true);
  if (u32(0) !== BATCH_MAGIC) throw new Error("layerline: bad batch magic");
  const layerFrom = u32(4),
    layerTo = u32(8),
    np = u32(12),
    nq = u32(16);
  const nl = layerTo - layerFrom;
  const b: Batch = {
    layerFrom,
    layerTo,
    layerZ: new Float32Array(nl),
    layerHeight: new Float32Array(nl),
    layerPathStart: new Uint32Array(nl),
    layerPathCount: new Uint32Array(nl),
    pathPointStart: new Uint32Array(np),
    pathPointCount: new Uint32Array(np),
    pathKind: new Uint8Array(np),
    pathClosed: new Uint8Array(np),
    points: new Int32Array(nq * 2),
  };
  let o = 20;
  for (let i = 0; i < nl; i++, o += 16) {
    b.layerZ[i] = dv.getFloat32(o, true);
    b.layerHeight[i] = dv.getFloat32(o + 4, true);
    b.layerPathStart[i] = u32(o + 8);
    b.layerPathCount[i] = u32(o + 12);
  }
  for (let i = 0; i < np; i++, o += 12) {
    b.pathPointStart[i] = u32(o);
    b.pathPointCount[i] = u32(o + 4);
    b.pathKind[i] = dv.getUint16(o + 8, true);
    b.pathClosed[i] = dv.getUint16(o + 10, true) & 1;
  }
  b.points.set(new Int32Array(bytes, o, nq * 2));
  return b;
}

export const batchTransferables = (b: Batch): ArrayBuffer[] =>
  [b.layerZ, b.layerHeight, b.layerPathStart, b.layerPathCount, b.pathPointStart, b.pathPointCount, b.pathKind, b.pathClosed, b.points].map(
    (a) => a.buffer as ArrayBuffer,
  );
