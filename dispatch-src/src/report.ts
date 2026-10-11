// The evaluation report written by `npm run eval`, with a type so the page
// still compiles when an optional part (the Solomon run) was skipped.

import raw from "./generated/eval.json";

export interface MethodRow {
  key: "dispatch" | "repair" | "keep" | "greedy";
  label: string;
  jobs: number;
  served: number;
  missed: number;
  completedRate: number;
  onTime: number;
  onTimeRate: number;
  lateJobs: number;
  weightedLatePerDay: number;
  lateMinPerDay: number;
  driveMinPerDay: number;
  overtimeMinPerDay: number;
  urgent: number;
  urgentOnTime: number;
  daysAllOnTime: number;
  daysAllServed: number;
}

export interface DayOutcome {
  jobs: number;
  served: number;
  missed: number;
  onTime: number;
  onTimeRate: number;
  lateJobs: number;
  lateMin: number;
  weightedLate: number;
  driveMin: number;
  overtimeMin: number;
  urgent: number;
  urgentOnTime: number;
}

export interface SolomonRow {
  name: string;
  distance: number;
  bks: number;
  gap: number;
  vehicles: number;
  bksVehicles: number;
  late: number;
  unassigned: number;
  ms: number;
}

export interface EvalReport {
  generatedAt: string;
  node: string;
  citySeed: string;
  days: number;
  techsRange: number[];
  jobsRange: number[];
  budgets: { morningIterations: number; replanIterations: number; replanDeadlineMs: number; qMax: number; qFrac: number };
  scenario: string;
  /** Days whose booked jobs sat at the generator's floor of 60. */
  daysAtJobFloor: number;
  methods: MethodRow[];
  wins: { vsKeep: number; tiesKeep: number; vsGreedy: number; tiesGreedy: number };
  latency: { count: number; p50: number; p95: number; max: number; sickP50: number; sickP95: number; hitDeadline: number; iterationsP50: number; movedP50: number; jobsInPlayP50: number; repairP50: number; repairP95: number; repairMax: number };
  undisrupted: { construct: MethodRow; alns: MethodRow; morningMsP50: number; morningMsMax: number; driveCut: number };
  demo: {
    seed: string;
    techs: number;
    jobs: number;
    disrupted: Record<"dispatch" | "repair" | "keep" | "greedy", DayOutcome>;
    undisrupted: { construct: DayOutcome; alns: DayOutcome };
    log: { at: number; kind: string; ms: number; moved: number }[];
    morningMs: number;
  };
  solomon: SolomonRow[];
  solomonSummary: { instances: number; meanGap: number; maxGap: number; atBks: number; allFeasible: boolean; iterations: number } | null;
}

export const report = raw as unknown as EvalReport;

export const method = (key: MethodRow["key"]) => report.methods.find((m) => m.key === key)!;
