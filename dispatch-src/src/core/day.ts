// A synthetic working day: 8 to 12 technicians with skills, shifts and a home
// depot, and 60 to 120 customer jobs with a location, a time window, a
// duration, a required skill and a priority. Generated from a seed; no real
// people, customers or addresses.

import { nearestNode, type City } from "./city";
import { Rng } from "./rng";

export const SKILLS = ["Electrical", "Gas", "Plumbing", "HVAC", "Appliances"] as const;
export const SKILL_SHORT = ["ELEC", "GAS", "PLMB", "HVAC", "APPL"] as const;
export type Skill = 0 | 1 | 2 | 3 | 4;

const TASKS: Record<Skill, readonly string[]> = {
  0: ["Fault finding", "Fuse board check", "EV charger install", "Socket replacement", "Lighting repair"],
  1: ["Boiler service", "Gas safety check", "Boiler repair", "Hob fitting"],
  2: ["Leak repair", "Blocked drain", "Tap replacement", "Water heater repair"],
  3: ["AC service", "Heat pump repair", "Ventilation check", "Thermostat fitting"],
  4: ["Washer repair", "Oven fault", "Fridge repair", "Dishwasher install"],
};
/** Typical minutes on site per skill; durations scatter around these. */
const MEAN_DURATION: Record<Skill, number> = { 0: 45, 1: 55, 2: 40, 3: 70, 4: 35 };

const NAMES = ["Noor", "Sam", "Priya", "Tomás", "Mei", "Kofi", "Lena", "Omar", "Ada", "Jonas", "Ravi", "Elif", "Hana", "Luca", "Zara", "Femi", "Ines", "Kai"];

/** Priority weights used in the objective and in the weighted-lateness figures. */
export const PRIO_WEIGHT = [0, 1, 2, 4] as const;
export const PRIO_LABEL = ["", "routine", "important", "urgent"] as const;

export interface Tech {
  id: number;
  name: string;
  /** Bitmask over SKILLS. */
  skills: number;
  depot: number;
  /** Shift, minutes since midnight. */
  start: number;
  end: number;
}

export type JobKind = "slot" | "half" | "day" | "urgent";

export interface Job {
  id: number;
  label: string;
  task: string;
  node: number;
  /** Window for the start of service, minutes since midnight. */
  e: number;
  l: number;
  dur: number;
  skill: Skill;
  prio: 1 | 2 | 3;
  kind: JobKind;
  /** When the dispatcher learns of the job (0 for jobs booked before the day). */
  release: number;
}

export interface Day {
  seed: string;
  techs: Tech[];
  jobs: Job[];
  /** Overtime allowed past the end of a shift, minutes. */
  otCap: number;
  /** Where work clusters (urgent jobs land in the same places). */
  hoods: Hood[];
}

export interface Hood {
  x: number;
  y: number;
  s: number;
  w: number;
}

export const OT_CAP = 60;
export const DAY_START = 7 * 60;
export const DAY_END = 20 * 60;

/** Places where work clusters: [x, y] as fractions of the city, and a spread in km. */
function neighbourhoods(rng: Rng, city: City): Hood[] {
  const out: Hood[] = [];
  const k = 6;
  for (let i = 0; i < k; i++) {
    out.push({ x: rng.uniform(0.15, 0.85) * city.width, y: rng.uniform(0.15, 0.85) * city.height, s: rng.uniform(0.9, 1.8), w: rng.uniform(0.6, 1.4) });
  }
  return out;
}

/** A job location: mostly in neighbourhoods, a quarter anywhere in the city. */
export function sampleNode(rng: Rng, city: City, hoods: readonly Hood[]): number {
  for (;;) {
    let x: number;
    let y: number;
    if (rng.chance(0.25)) {
      x = rng.uniform(0, city.width);
      y = rng.uniform(0, city.height);
    } else {
      const h = hoods[rng.weighted(hoods.map((q) => q.w))];
      x = h.x + rng.normal() * h.s;
      y = h.y + rng.normal() * h.s;
    }
    if (x < 0 || y < 0 || x > city.width || y > city.height) continue;
    const node = nearestNode(city, x, y);
    // reject points far from any street (outside the rounded city boundary)
    if (Math.hypot(city.xs[node] - x, city.ys[node] - y) > 0.7) continue;
    return node;
  }
}

export function sampleDuration(rng: Rng, skill: Skill): number {
  const d = MEAN_DURATION[skill] * Math.exp(rng.normal() * 0.3);
  return Math.max(20, Math.min(150, Math.round(d / 5) * 5));
}

export function generateDay(city: City, seed: string): Day {
  const rng = new Rng(`day:${seed}`);
  const nTech = rng.range(8, 12);

  // technicians: a primary skill each, round-robin so every skill is covered, plus one or two more
  const names = rng.shuffle([...NAMES]).slice(0, nTech);
  const starts = [450, 480, 480, 510, 540, 600];
  const techs: Tech[] = [];
  for (let i = 0; i < nTech; i++) {
    let skills = 1 << i % SKILLS.length;
    const extra = rng.chance(0.55) ? 2 : 1;
    while (popcount(skills) < 1 + extra) skills |= 1 << rng.int(SKILLS.length);
    const start = rng.pick(starts);
    techs.push({ id: i, name: names[i], skills, depot: city.depots[i % city.depots.length].node, start, end: start + 510 });
  }
  techs.sort((a, b) => a.start - b.start || a.id - b.id);
  techs.forEach((t, i) => (t.id = i));

  // jobs: skill mix follows the team, so the day is hard but not impossible
  const skillWeight = SKILLS.map((_, s) => techs.filter((t) => t.skills & (1 << s)).length);
  const hoods = neighbourhoodsFor(city, seed);
  const nJobs = Math.max(60, Math.min(120, Math.round(nTech * rng.uniform(6.6, 7.8))));
  const jobs: Job[] = [];
  const used = new Set<number>(city.depots.map((d) => d.node));
  for (let i = 0; i < nJobs; i++) {
    const skill = rng.weighted(skillWeight) as Skill;
    let node = sampleNode(rng, city, hoods);
    for (let tries = 0; used.has(node) && tries < 6; tries++) node = sampleNode(rng, city, hoods);
    used.add(node);
    const r = rng.next();
    let kind: JobKind;
    let e: number;
    let l: number;
    if (r < 0.32) {
      kind = "slot";
      e = rng.pick([480, 600, 720, 840]);
      l = e + 120;
    } else if (r < 0.57) {
      kind = "half";
      if (rng.chance(0.5)) {
        e = 480;
        l = 720;
      } else {
        e = 720;
        l = 990;
      }
    } else {
      kind = "day";
      e = 480;
      l = 1020;
    }
    const pr = rng.next();
    const prio: 1 | 2 | 3 = pr < 0.7 ? 1 : pr < 0.93 ? 2 : 3;
    jobs.push({ id: i, label: `J-${String(i + 1).padStart(3, "0")}`, task: rng.pick(TASKS[skill]), node, e, l, dur: sampleDuration(rng, skill), skill, prio, kind, release: 0 });
  }
  return { seed, techs, jobs, otCap: OT_CAP, hoods };
}

/** What an urgent call-out is for. */
export function urgentTask(rng: Rng, skill: Skill): string {
  return `Urgent: ${rng.pick(TASKS[skill]).toLowerCase()}`;
}

export function neighbourhoodsFor(city: City, seed: string): Hood[] {
  return neighbourhoods(new Rng(`hoods:${seed}`), city);
}

export function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

export const hasSkill = (t: Tech, s: Skill) => (t.skills & (1 << s)) !== 0;

export function clock(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
