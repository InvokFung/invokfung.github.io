// End-of-day figures, computed the same way for Dispatch and both baselines.

import { PRIO_WEIGHT, type Day, type Job } from "./day";
import type { Leg, Visit } from "./sim";

export interface Outcome {
  jobs: number;
  /** Visits completed. */
  served: number;
  missed: number;
  /** Started inside the window. */
  onTime: number;
  /** onTime / jobs: a missed job counts as not on time. */
  onTimeRate: number;
  lateJobs: number;
  lateMin: number;
  /** Σ priority weight × minutes late (weights 1, 2, 4). */
  weightedLate: number;
  driveMin: number;
  overtimeMin: number;
  urgent: number;
  urgentOnTime: number;
}

export function outcome(day: Day, jobs: readonly Job[], visits: readonly Visit[], legs: readonly Leg[], ret: readonly number[], gone: readonly (number | null)[]): Outcome {
  const servedBy = new Map<number, Visit>();
  for (const v of visits) if (!v.abandoned) servedBy.set(v.job, v);
  let onTime = 0;
  let lateJobs = 0;
  let lateMin = 0;
  let weightedLate = 0;
  let urgent = 0;
  let urgentOnTime = 0;
  for (const j of jobs) {
    const v = servedBy.get(j.id);
    if (j.kind === "urgent") urgent++;
    if (!v) continue;
    const late = v.start - j.l;
    if (late > 1e-6) {
      lateJobs++;
      lateMin += late;
      weightedLate += PRIO_WEIGHT[j.prio] * late;
    } else {
      onTime++;
      if (j.kind === "urgent") urgentOnTime++;
    }
  }
  let driveMin = 0;
  for (const l of legs) driveMin += Math.max(0, (l.cut ?? l.arrive) - l.depart);
  let overtimeMin = 0;
  day.techs.forEach((t, k) => {
    if (gone[k] !== null) return;
    overtimeMin += Math.max(0, ret[k] - t.end);
  });
  return {
    jobs: jobs.length,
    served: servedBy.size,
    missed: jobs.length - servedBy.size,
    onTime,
    onTimeRate: jobs.length ? onTime / jobs.length : 1,
    lateJobs,
    lateMin,
    weightedLate,
    driveMin,
    overtimeMin,
    urgent,
    urgentOnTime,
  };
}
