// A canonical text form of a generated city, day and its scripted events. The
// build records its SHA-256; the page regenerates the same day from the same
// seeds and checks the hash, so what you see is the day that was measured.
// Coordinates are rounded so the last bit of a sine never decides the hash.

import type { City } from "./city";
import type { Day } from "./day";
import type { DayEvent } from "./sim";

export function canonical(city: City, day: Day, events: readonly DayEvent[]): string {
  const r = (x: number) => x.toFixed(4);
  const lines: string[] = [];
  lines.push(`city ${city.seed} ${city.xs.length} ${city.roads.length}`);
  for (let i = 0; i < city.xs.length; i++) lines.push(`n ${r(city.xs[i])} ${r(city.ys[i])}`);
  for (const rd of city.roads) lines.push(`r ${rd.a} ${rd.b} ${rd.cls}`);
  lines.push(`day ${day.seed} ${day.otCap}`);
  for (const t of day.techs) lines.push(`t ${t.id} ${t.name} ${t.skills} ${t.depot} ${t.start} ${t.end}`);
  for (const j of day.jobs) lines.push(`j ${j.id} ${j.node} ${j.e} ${j.l} ${j.dur} ${j.skill} ${j.prio} ${j.kind}`);
  for (const e of events) lines.push(`e ${JSON.stringify(e)}`);
  return lines.join("\n");
}
