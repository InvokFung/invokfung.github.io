// Solomon VRPTW instances in VRPLIB format (as kept by the PyVRP instances
// repository) and their best-known solutions, turned into a Problem for the
// same solver. Distances and travel times follow the DIMACS convention the
// best-known costs use: Euclidean, truncated to one decimal. Time windows are
// hard here, so lateness gets a prohibitive weight, and there is no overtime.

import { type PJob, type Problem, type PVehicle } from "./model";
import { Traffic } from "./traffic";

export interface SolomonInstance {
  name: string;
  vehicles: number;
  capacity: number;
  xs: number[];
  ys: number[];
  demand: number[];
  e: number[];
  l: number[];
  service: number[];
}

export function parseVrplib(text: string): SolomonInstance {
  const lines = text.split(/\r?\n/);
  const head: Record<string, string> = {};
  let section = "";
  const xs: number[] = [];
  const ys: number[] = [];
  const demand: number[] = [];
  const e: number[] = [];
  const l: number[] = [];
  const service: number[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === "EOF") continue;
    if (line.endsWith("_SECTION")) {
      section = line;
      continue;
    }
    const kv = line.match(/^([A-Z_]+)\s*:\s*(.*)$/);
    if (kv && !section) {
      head[kv[1]] = kv[2].trim();
      continue;
    }
    const parts = line.split(/\s+/).map(Number);
    const i = parts[0] - 1;
    if (section === "NODE_COORD_SECTION") {
      xs[i] = parts[1];
      ys[i] = parts[2];
    } else if (section === "DEMAND_SECTION") demand[i] = parts[1];
    else if (section === "TIME_WINDOW_SECTION") {
      e[i] = parts[1];
      l[i] = parts[2];
    } else if (section === "SERVICE_TIME_SECTION") service[i] = parts[1];
  }
  const n = xs.length;
  const st = Number(head.SERVICE_TIME ?? 0);
  for (let i = 0; i < n; i++) if (service[i] === undefined) service[i] = i === 0 ? 0 : st;
  return { name: head.NAME ?? "?", vehicles: Number(head.VEHICLES ?? n), capacity: Number(head.CAPACITY ?? Infinity), xs, ys, demand, e, l, service };
}

export function parseSolutionCost(text: string): { cost: number; routes: number } {
  const m = text.match(/Cost\s+([\d.]+)/);
  return { cost: m ? Number(m[1]) : NaN, routes: (text.match(/^Route/gm) ?? []).length };
}

/** DIMACS convention: Euclidean distance truncated to one decimal. */
export const dimacs = (d: number) => Math.floor(d * 10) / 10;

export function solomonProblem(inst: SolomonInstance): Problem {
  const n = inst.xs.length;
  const ff = new Float64Array(n * n);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) ff[a * n + b] = dimacs(Math.hypot(inst.xs[a] - inst.xs[b], inst.ys[a] - inst.ys[b]));
  const jobs: PJob[] = [];
  for (let i = 1; i < n; i++) jobs.push({ ref: i, loc: i, e: inst.e[i], l: inst.l[i], dur: inst.service[i], mask: 0, w: 1, demand: inst.demand[i], miss: 1e7 });
  const vehicles: PVehicle[] = Array.from({ length: inst.vehicles }, (_, k) => ({ ref: k, startLoc: 0, startTime: inst.e[0], endLoc: 0, shiftEnd: inst.l[0], hardEnd: inst.l[0], skills: 0, capacity: inst.capacity }));
  return { nLoc: n, ff, traffic: Traffic.flat(), jobs, vehicles, W: { late: 1e5, drive: 1, ot: 0, over: 1e5, move: 0 } };
}
