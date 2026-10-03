/**
 * Writes apps/client/src/facts.json, the numbers the page shows under "Measured".
 * Every value is produced here, not typed in:
 *   - tests: runs `npm test` and reads the TAP summary,
 *   - load: reads tools/loadtest/results/clients-<N>.json from `npm run loadtest`,
 *   - bundle: gzips the built JS in ../arena/assets.
 *
 *   npm run facts -- --load 1000
 * Then rebuild the client (`npm run build:client`) so the page picks the numbers up.
 */
import { spawnSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

interface LoadResult {
  clients: number;
  flipsPerSecond: number;
  matchesPerSecond: number;
  flipRttMs: { p50: number; p99: number };
  serverCpuPercentOfOneCore: number | null;
  serverRssMiB: number | null;
  machine: { vcpus: number; model: string; node: string };
}

function runTests(): { passed: number; total: number; skipped: number } {
  const r = spawnSync("npm", ["test", "--silent"], { cwd: root, encoding: "utf8", env: process.env, maxBuffer: 64 * 2 ** 20 });
  const out = `${r.stdout}\n${r.stderr}`;
  const num = (key: string) => Number(new RegExp(`^# ${key} (\\d+)$`, "m").exec(out)?.[1] ?? NaN);
  const res = { passed: num("pass"), total: num("tests"), skipped: num("skipped") };
  if (r.status !== 0 || num("fail") > 0 || !Number.isFinite(res.total)) {
    console.error(out.slice(-4000));
    throw new Error("tests failed; not writing facts");
  }
  return res;
}

async function gzipKB(dir: string, match: RegExp): Promise<number> {
  const names = (await readdir(dir)).filter((n) => match.test(n));
  if (names.length !== 1) throw new Error(`expected one file matching ${match} in ${dir}, found ${names.join(", ") || "none"}`);
  const raw = await readFile(join(dir, names[0]!));
  return Math.round((gzipSync(raw, { level: 9 }).length / 1024) * 10) / 10;
}

async function main() {
  const loadClients = arg("load") ?? "1000";
  const load = JSON.parse(await readFile(join(root, `tools/loadtest/results/clients-${loadClients}.json`), "utf8")) as LoadResult;
  const assets = join(root, "../arena/assets");
  const tests = runTests();
  const facts = {
    generatedAt: new Date().toISOString(),
    machine: `${load.machine.vcpus} vCPU ${load.machine.model.replace(/\(R\)|Processor|CPU/g, "").replace(/\s+/g, " ").trim()}, Node ${load.machine.node.replace(/^v/, "").split(".")[0]}`,
    tests: { passed: tests.passed, total: tests.total, skipped: tests.skipped },
    loadtest: {
      clients: load.clients,
      flipsPerSecond: Math.round(load.flipsPerSecond),
      matchesPerSecond: load.matchesPerSecond,
      flipRttP50: load.flipRttMs.p50,
      flipRttP99: load.flipRttMs.p99,
      serverCpu: load.serverCpuPercentOfOneCore === null ? 0 : Math.round(load.serverCpuPercentOfOneCore),
      serverRssMiB: load.serverRssMiB ?? 0,
    },
    bundle: {
      appGzipKB: await gzipKB(assets, /^index-.*\.js$/),
      workerGzipKB: await gzipKB(assets, /^arena\.worker-.*\.js$/),
    },
  };
  await writeFile(join(root, "apps/client/src/facts.json"), JSON.stringify(facts, null, 2) + "\n");
  console.log(JSON.stringify(facts, null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
