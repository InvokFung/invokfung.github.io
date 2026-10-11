// The routing problem the solver sees. It is generic: the field-service day
// and the Solomon benchmark both turn into a Problem. Locations index a dense
// matrix of free-flow minutes; a Traffic object turns free-flow minutes into
// clock time for a given departure.

import type { Traffic } from "./traffic";

export interface Weights {
  /** Per priority-weighted minute late. */
  late: number;
  /** Per minute of driving. */
  drive: number;
  /** Per minute past the end of a shift. */
  ot: number;
  /** Per minute past the overtime cap; large enough that the cap behaves as hard. */
  over: number;
  /** Per job given to a different technician than in the current plan, so a re-plan does not reshuffle the day for a few minutes of driving. */
  move: number;
}

/**
 * Missed jobs first, then lateness weighted by priority, then drive time, then
 * overtime. A missed job costs more than the worst lateness a day allows
 * (4 × 600 min × 20 < 30,000), so the solver serves a job late rather than drop it.
 * In a re-plan, moving a job to another technician costs as much as five
 * minutes of driving: worth it to save lateness, not to shave a minute.
 */
export const WEIGHTS: Weights = { late: 20, drive: 1, ot: 0.75, over: 5000, move: 5 };

export const missCost = (prioWeight: number) => 20_000 + 10_000 * prioWeight;

export interface PJob {
  /** Id of the job outside the solver (day job id, or customer number). */
  ref: number;
  loc: number;
  /** Window for the start of service. */
  e: number;
  l: number;
  dur: number;
  /** Required skills as a bitmask (0: anyone). */
  mask: number;
  /** Priority weight. */
  w: number;
  demand: number;
  /** Cost of leaving the job unassigned. */
  miss: number;
  /** Technician (vehicle ref) the job is planned on before this solve, if any. */
  home?: number;
}

export interface PVehicle {
  /** Technician id outside the solver. */
  ref: number;
  startLoc: number;
  startTime: number;
  endLoc: number;
  shiftEnd: number;
  /** Must be back by then (shift end plus the overtime cap). */
  hardEnd: number;
  skills: number;
  capacity: number;
}

export interface Problem {
  nLoc: number;
  /** ff[a * nLoc + b]: free-flow minutes from a to b. */
  ff: Float64Array;
  traffic: Traffic;
  jobs: PJob[];
  vehicles: PVehicle[];
  W: Weights;
}

export const canServe = (v: PVehicle, j: PJob) => (v.skills & j.mask) === j.mask;
