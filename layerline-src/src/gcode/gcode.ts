// G-code for a Marlin-flavoured printer, plus a print-time estimate from the
// same walk over the toolpaths.
//
// Extrusion uses the Slic3r flow model: a deposited line is a rectangle with
// semicircular ends, so its cross-section is (w - h) * h + pi * (h / 2)^2,
// and E per millimetre of travel is that area over the filament's section.
//
// Time uses a lookahead planner in the spirit of Marlin's: junction speeds
// from junction deviation, then a backward and a forward pass so every move
// can reach its entry and exit speed with the configured acceleration, then a
// trapezoidal (or triangular) profile per move.
import { PathKind, type SliceParams } from "../core/abi";
import type { Toolpaths } from "../core/toolpaths";

export interface PrinterProfile {
  name: string;
  bed: { x: number; y: number };
  filamentDiameter: number; // mm
  filamentDensity: number; // g/cm^3
  nozzleTemp: number;
  bedTemp: number;
  /** mm/s */
  speeds: { outerWall: number; innerWall: number; infill: number; solid: number; skirt: number; firstLayer: number; travel: number };
  acceleration: number; // mm/s^2
  junctionDeviation: number; // mm
  retractLength: number; // mm of filament
  retractSpeed: number; // mm/s
  retractMinTravel: number; // mm
}

export const DEFAULT_PROFILE: PrinterProfile = {
  name: "Generic Marlin, 220 x 220 bed, 0.4 mm nozzle, PLA",
  bed: { x: 220, y: 220 },
  filamentDiameter: 1.75,
  filamentDensity: 1.24,
  nozzleTemp: 210,
  bedTemp: 60,
  speeds: { outerWall: 30, innerWall: 50, infill: 70, solid: 45, skirt: 30, firstLayer: 20, travel: 150 },
  acceleration: 1000,
  junctionDeviation: 0.013,
  retractLength: 0.8,
  retractSpeed: 35,
  retractMinTravel: 1.5,
};

export const KIND_LABEL: Record<number, string> = {
  [PathKind.OuterWall]: "Outer wall",
  [PathKind.InnerWall]: "Inner wall",
  [PathKind.SparseInfill]: "Sparse infill",
  [PathKind.SolidInfill]: "Solid infill",
  [PathKind.Skirt]: "Skirt",
};
const KIND_TAG: Record<number, string> = {
  [PathKind.OuterWall]: "WALL-OUTER",
  [PathKind.InnerWall]: "WALL-INNER",
  [PathKind.SparseInfill]: "FILL",
  [PathKind.SolidInfill]: "SKIN",
  [PathKind.Skirt]: "SKIRT",
};

export interface Estimate {
  seconds: number;
  filamentMm: number;
  filamentGrams: number;
  layerSeconds: Float32Array;
  /** extruded length (mm) and time (s) by path kind; index 5 is travel */
  byKind: { length: number; seconds: number }[];
  moves: number;
  retractions: number;
}

/** Cross-section of a deposited line (mm^2), Slic3r's rounded-rectangle model. */
export function lineArea(width: number, height: number) {
  return width >= height ? (width - height) * height + Math.PI * (height / 2) ** 2 : Math.PI * (width / 2) ** 2;
}

/** Feed rate (mm/s) for a path kind; the first layer is printed slowly. */
export const speedFor = (p: PrinterProfile, kind: number, layer: number): number => {
  if (layer === 0) return p.speeds.firstLayer;
  switch (kind) {
    case PathKind.OuterWall:
      return p.speeds.outerWall;
    case PathKind.InnerWall:
      return p.speeds.innerWall;
    case PathKind.SparseInfill:
      return p.speeds.infill;
    case PathKind.SolidInfill:
      return p.speeds.solid;
    default:
      return p.speeds.skirt;
  }
};

/** Time for a run of moves (lengths, cruise speeds) starting and ending at rest. */
export function plannerTime(len: number[], vmax: number[], cosTurn: number[], accel: number, jd: number): number {
  const n = len.length;
  if (!n) return 0;
  // Max speed through the junction before move i (between i-1 and i).
  const vj = new Float64Array(n + 1);
  for (let i = 1; i < n; i++) {
    // cosTurn is the dot product of the two unit directions (1 = straight on).
    // Marlin's junction deviation: the corner is taken as an arc that stays
    // within jd of it; theta is the angle between the reversed incoming and
    // the outgoing direction, so sin(theta / 2) = sqrt((1 + cosTurn) / 2).
    const c = Math.max(-1, Math.min(1, cosTurn[i]));
    const sinHalf = Math.sqrt(0.5 * (1 + c));
    const v = sinHalf > 0.999 ? Infinity : Math.sqrt((accel * jd * sinHalf) / (1 - sinHalf));
    vj[i] = Math.min(v, vmax[i - 1], vmax[i]);
  }
  // Backward then forward pass: reachable under constant acceleration.
  for (let i = n - 1; i >= 1; i--) vj[i] = Math.min(vj[i], Math.sqrt(vj[i + 1] ** 2 + 2 * accel * len[i]));
  for (let i = 1; i < n; i++) vj[i] = Math.min(vj[i], Math.sqrt(vj[i - 1] ** 2 + 2 * accel * len[i - 1]));
  let t = 0;
  for (let i = 0; i < n; i++) {
    const v0 = vj[i],
      v1 = vj[i + 1],
      v = vmax[i],
      L = len[i];
    const da = (v * v - v0 * v0) / (2 * accel),
      dd = (v * v - v1 * v1) / (2 * accel);
    if (da + dd <= L) t += (v - v0) / accel + (v - v1) / accel + (L - da - dd) / v;
    else {
      const vp = Math.sqrt((2 * accel * L + v0 * v0 + v1 * v1) / 2);
      t += (vp - v0) / accel + (vp - v1) / accel;
    }
  }
  return t;
}

export interface GcodeResult {
  text: string | null;
  estimate: Estimate;
}

const f3 = (v: number) => (Math.round(v * 1000) / 1000).toString();
const f5 = (v: number) => (Math.round(v * 100000) / 100000).toString();

export function formatDuration(s: number) {
  const h = Math.floor(s / 3600),
    m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${Math.max(1, m)} min`;
}

/**
 * Walks every layer once. With `emit` the G-code text is produced as well;
 * without it only the estimate is computed (cheap enough to run per slice).
 */
export function generateGcode(tp: Toolpaths, params: SliceParams, profile: PrinterProfile, opts: { emit: boolean; modelName?: string; triangles?: number }): GcodeResult {
  const out: string[] = [];
  const line = opts.emit ? (s: string) => void out.push(s) : () => {};
  const filArea = Math.PI * (profile.filamentDiameter / 2) ** 2;
  const a = profile.acceleration,
    jd = profile.junctionDeviation;
  const byKind = Array.from({ length: 6 }, () => ({ length: 0, seconds: 0 }));
  const layerSeconds = new Float32Array(tp.layerCount);
  let total = 0,
    filament = 0,
    moves = 0,
    retractions = 0;
  let x = 0,
    y = 0,
    retracted = false;
  const travelF = profile.speeds.travel * 60;

  // ---- start
  const zTop = tp.layerCount ? tp.layerZ[tp.layerCount - 1] : 0;
  line(`; generated by Layerline, a WebAssembly slicer: https://invokfung.github.io/layerline/`);
  line(`; printer: ${profile.name}`);
  if (opts.modelName) line(`; model: ${opts.modelName}${opts.triangles ? `, ${opts.triangles} triangles` : ""}`);
  line(`; layer height ${params.layerHeight} mm (first ${params.firstLayerHeight} mm), line width ${params.lineWidth} mm`);
  line(`; ${params.perimeters} perimeters, ${Math.round(params.infillDensity * 100)}% rectilinear infill, ${params.topLayers} top / ${params.bottomLayers} bottom solid layers`);
  line(`; ESTIMATE_PLACEHOLDER`);
  line(`M140 S${profile.bedTemp} ; bed`);
  line(`M104 S${profile.nozzleTemp} ; nozzle`);
  line(`G28 ; home all axes`);
  line(`G90 ; absolute coordinates`);
  line(`M83 ; relative extrusion`);
  line(`M190 S${profile.bedTemp} ; wait for bed`);
  line(`M109 S${profile.nozzleTemp} ; wait for nozzle`);
  line(`G92 E0`);
  // Purge line along the left edge of the bed.
  const purgeW = 0.6,
    purgeH = 0.3;
  const ePurge = (lineArea(purgeW, purgeH) * 140) / filArea;
  line(`G1 Z2 F600`);
  line(`G1 X3 Y20 F${travelF}`);
  line(`G1 Z${purgeH} F600`);
  line(`G1 X3 Y160 E${f5(ePurge)} F1200 ; purge`);
  line(`G1 X3.6 Y160 F${travelF}`);
  line(`G1 X3.6 Y20 E${f5(ePurge)} F1200`);
  line(`G1 E-${profile.retractLength} F${profile.retractSpeed * 60}`);
  retracted = true;
  line(`G1 Z2 F600`);
  x = 3.6;
  y = 20;
  total += 280 / 20; // the purge line; heating is not counted

  // ---- layers
  const pts = tp.points;
  for (let L = 0; L < tp.layerCount; L++) {
    const z = tp.layerZ[L],
      h = tp.layerHeight[L];
    const ePerMm = lineArea(params.lineWidth, h) / filArea;
    let tLayer = 0;
    line(`;LAYER:${L}`);
    line(`;Z:${f3(z)}`);
    if (L === 1) line(`M106 S255 ; fan on from the second layer`);
    line(`G1 Z${f3(z)} F600`);
    tLayer += (L === 0 ? 2 : h) / 10;
    let lastTag = "";
    const p0 = tp.layerPathStart[L],
      pn = p0 + tp.layerPathCount[L];
    for (let p = p0; p < pn; p++) {
      const kind = tp.pathKind[p];
      if (kind === PathKind.Contour) continue;
      const q0 = tp.pathPointStart[p],
        qn = tp.pathPointCount[p];
      const closed = tp.pathClosed[p] === 1;
      const sx = pts[q0 * 2] / 1000,
        sy = pts[q0 * 2 + 1] / 1000;
      // Travel to the start, retracting when the hop is long.
      const hop = Math.hypot(sx - x, sy - y);
      if (hop > 1e-6) {
        const needRetract = hop > profile.retractMinTravel;
        if (needRetract && !retracted) {
          line(`G1 E-${profile.retractLength} F${profile.retractSpeed * 60}`);
          retracted = true;
          retractions++;
          tLayer += profile.retractLength / profile.retractSpeed;
        }
        line(`G0 X${f3(sx)} Y${f3(sy)} F${travelF}`);
        const tt = plannerTime([hop], [profile.speeds.travel], [1], a * 1.5, jd);
        tLayer += tt;
        byKind[5].length += hop;
        byKind[5].seconds += tt;
        moves++;
      }
      if (retracted) {
        line(`G1 E${profile.retractLength} F${profile.retractSpeed * 60}`);
        retracted = false;
        tLayer += profile.retractLength / profile.retractSpeed;
      }
      const tag = KIND_TAG[kind];
      if (tag !== lastTag) line(`;TYPE:${tag}`), (lastTag = tag);
      const v = speedFor(profile, kind, L);
      const f = v * 60;
      const lens: number[] = [],
        vmax: number[] = [],
        cos: number[] = [];
      let px = sx,
        py = sy,
        pdx = 0,
        pdy = 0;
      const count = closed ? qn + 1 : qn;
      for (let k = 1; k < count; k++) {
        const q = q0 + (k % qn);
        const nx = pts[q * 2] / 1000,
          ny = pts[q * 2 + 1] / 1000;
        const dx = nx - px,
          dy = ny - py;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        const e = len * ePerMm;
        line(`G1 X${f3(nx)} Y${f3(ny)} E${f5(e)}${k === 1 ? ` F${f}` : ""}`);
        cos.push(lens.length ? (dx * pdx + dy * pdy) / (len * Math.hypot(pdx, pdy)) : 1);
        lens.push(len);
        vmax.push(v);
        filament += e;
        byKind[kind].length += len;
        px = nx;
        py = ny;
        pdx = dx;
        pdy = dy;
        moves++;
      }
      const tp_ = plannerTime(lens, vmax, cos, a, jd);
      tLayer += tp_;
      byKind[kind].seconds += tp_;
      x = px;
      y = py;
    }
    layerSeconds[L] = tLayer;
    total += tLayer;
  }

  // ---- end
  line(`;END`);
  line(`G1 E-2 F${profile.retractSpeed * 60} ; retract`);
  line(`G1 Z${f3(Math.min(zTop + 10, 250))} F600 ; lift`);
  line(`G1 X0 Y${profile.bed.y - 20} F${travelF} ; present the print`);
  line(`M106 S0 ; fan off`);
  line(`M104 S0 ; nozzle off`);
  line(`M140 S0 ; bed off`);
  line(`M84 ; motors off`);

  const estimate: Estimate = {
    seconds: total,
    filamentMm: filament,
    filamentGrams: (filament * filArea * profile.filamentDensity) / 1000,
    layerSeconds,
    byKind,
    moves,
    retractions,
  };
  let text: string | null = null;
  if (opts.emit) {
    const i = out.indexOf("; ESTIMATE_PLACEHOLDER");
    out[i] = `; estimated print time ${formatDuration(total)}, filament ${(filament / 1000).toFixed(2)} m (${estimate.filamentGrams.toFixed(1)} g)`;
    text = out.join("\n") + "\n";
  }
  return { text, estimate };
}
