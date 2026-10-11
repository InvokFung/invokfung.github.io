// The scripted disruptions every evaluated day gets: one technician lost
// mid-morning, two or three urgent jobs, one job that overruns, and a traffic
// spike in the evening rush. Seeded, so every method faces the same day.

import type { City } from "./city";
import { sampleDuration, sampleNode, SKILLS, urgentTask, type Day, type Skill } from "./day";
import { Rng } from "./rng";
import type { DayEvent } from "./sim";

export interface ScenarioOptions {
  /** Pin the sick call to this minute (the page uses 09:00). */
  sickAt?: number;
}

export function scriptedEvents(city: City, day: Day, opts: ScenarioOptions = {}): DayEvent[] {
  const rng = new Rng(`events:${day.seed}`);
  const sickAt = opts.sickAt ?? rng.range(540, 660);
  const onShift = day.techs.filter((t) => t.start <= sickAt);
  const sick = rng.pick(onShift.length ? onShift : day.techs).id;
  if (opts.sickAt !== undefined) rng.range(540, 660); // keep the rest of the stream identical

  const skillWeight = SKILLS.map((_, s) => day.techs.filter((t) => t.id !== sick && t.skills & (1 << s)).length);
  const nUrgent = rng.range(2, 3);
  const urgentAt = Array.from({ length: nUrgent }, () => rng.range(600, 930)).sort((a, b) => a - b);
  const urgent: DayEvent[] = urgentAt.map((at) => {
    const skill = rng.weighted(skillWeight) as Skill;
    return { kind: "urgent", at, node: sampleNode(rng, city, day.hoods), skill, dur: sampleDuration(rng, skill), task: urgentTask(rng, skill) };
  });

  const candidates = day.jobs.filter((j) => j.dur >= 30 && j.e >= 600 && j.e <= 780);
  const pool = candidates.length ? candidates : day.jobs;
  const overJob = rng.pick(pool).id;
  const extra = rng.range(8, 15) * 5;

  const spikeAt = rng.range(900, 960);
  const factor = Math.round(rng.uniform(1.4, 1.8) * 10) / 10;
  const clearAt = spikeAt + rng.range(60, 90);

  const timed: DayEvent[] = [{ kind: "sick", at: sickAt, tech: sick }, ...urgent, { kind: "traffic", at: spikeAt, factor }, { kind: "traffic", at: clearAt, factor: 1 }];
  timed.sort((a, b) => a.at! - b.at!);
  // the overrun has no clock time: it is reported halfway through that job, whenever each method serves it
  return [{ kind: "overrun", job: overJob, extra }, ...timed];
}
