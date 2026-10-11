// Generates the city and the day shown on the page from their seeds, with the
// scripted disruptions, and writes a small manifest the page imports: counts,
// the events, and the SHA-256 of the canonical day. The page regenerates the
// same day in its worker and checks the hash against this manifest.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCity } from "../src/core/city";
import { DEMO_SEED, DEMO_SICK_AT } from "../src/core/config";
import { clock, generateDay, SKILLS } from "../src/core/day";
import { canonical } from "../src/core/fingerprint";
import { scriptedEvents } from "../src/core/scenario";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEN = join(ROOT, "src", "generated");
mkdirSync(GEN, { recursive: true });

const t0 = performance.now();
const city = generateCity();
const day = generateDay(city, DEMO_SEED);
const events = scriptedEvents(city, day, { sickAt: DEMO_SICK_AT });
const ms = performance.now() - t0;
const sha256 = createHash("sha256").update(canonical(city, day, events), "utf8").digest("hex");

const bridges = city.roads.filter((r) => r.cls === 2).length;
const manifest = {
  citySeed: city.seed,
  daySeed: day.seed,
  sha256,
  city: { nodes: city.xs.length, roads: city.roads.length, bridges, widthKm: Math.round(city.width * 10) / 10, heightKm: Math.round(city.height * 10) / 10 },
  techs: day.techs.length,
  jobs: day.jobs.length,
  windows: {
    slot: day.jobs.filter((j) => j.kind === "slot").length,
    half: day.jobs.filter((j) => j.kind === "half").length,
    day: day.jobs.filter((j) => j.kind === "day").length,
  },
  skills: SKILLS.map((s, i) => ({ skill: s, techs: day.techs.filter((t) => t.skills & (1 << i)).length, jobs: day.jobs.filter((j) => j.skill === i).length })),
  events,
  generateMs: Math.round(ms),
};
writeFileSync(join(GEN, "day.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`city "${city.seed}": ${city.xs.length} intersections, ${city.roads.length} roads, ${bridges} bridges`);
console.log(`day "${day.seed}": ${day.techs.length} technicians, ${day.jobs.length} jobs, sha256 ${sha256.slice(0, 16)}…`);
for (const e of events) console.log(`  ${e.at === undefined ? "  -  " : clock(e.at)} ${e.kind}`);
