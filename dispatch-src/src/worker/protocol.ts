// Messages between the page and the dispatch worker. Every snapshot is plain
// JSON built in the worker; the page only draws it.

import type { Skill } from "../core/day";
import type { Outcome } from "../core/metrics";
import type { DayEvent } from "../core/sim";

export type UserEvent =
  | { kind: "sick"; tech: number }
  | { kind: "urgent"; node: number; skill: Skill }
  | { kind: "overrun"; tech: number; extra: number }
  | { kind: "traffic"; factor: number };

export type Request =
  | { type: "init" }
  | { type: "reset"; scripted: boolean }
  | { type: "advance"; to: number }
  | { type: "event"; at: number; event: UserEvent };

export interface CityView {
  width: number;
  height: number;
  xs: number[];
  ys: number[];
  roads: [number, number, number][];
  river: [number, number][];
  riverWidth: number;
  depots: { node: number; name: string }[];
}

export interface JobView {
  id: number;
  label: string;
  task: string;
  node: number;
  e: number;
  l: number;
  dur: number;
  skill: Skill;
  prio: 1 | 2 | 3;
  kind: string;
  release: number;
}

export interface TechView {
  id: number;
  name: string;
  skills: number;
  depot: number;
  start: number;
  end: number;
  hardEnd: number;
  gone: number | null;
}

export interface VisitView {
  job: number;
  tech: number;
  arrive: number;
  start: number;
  end: number;
  late: number;
  abandoned?: boolean;
  frozen: boolean;
}

export interface LegView {
  tech: number;
  job: number;
  depart: number;
  arrive: number;
  cut?: number;
  path: number[];
}

export interface LogView {
  at: number;
  kind: DayEvent["kind"];
  text: string;
  ms: number;
  iterations: number;
  hitDeadline: boolean;
  jobsInPlay: number;
  moved: { job: number; from: number; to: number }[];
  user: boolean;
}

export interface Snapshot {
  now: number;
  jobs: JobView[];
  techs: TechView[];
  visits: VisitView[];
  legs: LegView[];
  pool: number[];
  skipped: number[];
  log: LogView[];
  compare: { dispatch: Outcome; keep: Outcome; greedy: Outcome };
  nextAuto: number | null;
  factor: number;
  scripted: boolean;
  userUrgent: number;
}

export interface InitData {
  city: CityView;
  seed: string;
  verify: { sha256: string; expected: string; ok: boolean };
  /** The morning plan as solved in this browser; outcome is the day played with no disruptions. */
  morning: { ms: number; iterations: number; jobs: number; techs: number; outcome: Outcome };
  scriptedEvents: DayEvent[];
  snap: Snapshot;
}

export type Response = { id: number; ok: true; data: unknown } | { id: number; ok: false; error: string };
