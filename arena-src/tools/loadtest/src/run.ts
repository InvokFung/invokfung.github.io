/**
 * Load test: N bot clients over real WebSockets against a real server process.
 * Each client says hello, joins the quick-match queue, plays full matches with the
 * same BotClient the arena uses for its own bots, and re-queues when a match ends.
 *
 *   npm run loadtest -- --clients 400 --duration 60
 *   npm run loadtest -- --url ws://host:8782/ws --clients 100   (against a running server)
 *
 * Without --url it starts apps/server/dist/server.mjs (run `npm run build:server` first)
 * as a child process, so server and load generator are separate processes and the
 * server's CPU can be measured on its own.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import WebSocket from "ws";
import { BotClient, systemScheduler } from "@arena/core";
import type { BotProfile } from "@arena/engine";
import type { ClientMessage, ServerMessage } from "@arena/protocol";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

interface Options {
  clients: number;
  durationS: number;
  url: string | null;
  port: number;
  rampPerSecond: number;
  label: string;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    clients: Number(get("clients") ?? 200),
    durationS: Number(get("duration") ?? 45),
    url: get("url") ?? null,
    port: Number(get("port") ?? 8790),
    rampPerSecond: Number(get("ramp") ?? 200),
    label: get("label") ?? "",
  };
}

/** Faster than a person (~1 flip/s) on purpose: each client flips 3-5 times a second. */
const LOAD_PROFILE: BotProfile = { level: "ace", label: "Load", thinkMs: [150, 300], memorySlots: 24, halfLifeMs: 60_000, slipChance: 0.02, cautious: true };

const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]! : 0);
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

async function startServer(port: number): Promise<ChildProcess> {
  const bundle = join(root, "apps/server/dist/server.mjs");
  if (!existsSync(bundle)) throw new Error("build the server first: npm run build:server");
  const stale = await fetch(`http://127.0.0.1:${port}/healthz`).then(
    () => true,
    () => false,
  );
  if (stale) throw new Error(`port ${port} is already serving; stop that process or pass --port`);
  const child = spawn(process.execPath, [bundle], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", ARENA_BOT_FILL_MS: "off", ARENA_FILL_MS: "1000", LOG_LEVEL: "warn", ARENA_SESSION_SECRET: "loadtest" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  // Never leave the server behind, however this process ends.
  process.once("exit", () => child.kill("SIGKILL"));
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => process.exit(130));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/readyz`)).ok) return child;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error("server did not become ready");
}

/** utime+stime of a process in seconds, from /proc (Linux). */
async function cpuSeconds(pid: number): Promise<number | null> {
  try {
    const stat = (await readFile(`/proc/${pid}/stat`, "utf8")).split(") ")[1]!.split(" ");
    return (Number(stat[11]) + Number(stat[12])) / 100; // clock ticks; USER_HZ is 100 on Linux
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const server = opts.url ? null : await startServer(opts.port);
  const url = opts.url ?? `ws://127.0.0.1:${opts.port}/ws`;
  const httpBase = url.replace(/^ws/, "http").replace(/\/ws$/, "");
  const scheduler = systemScheduler({ setTimeout, clearTimeout, performance });

  const rtts: number[] = [];
  const connectMs: number[] = [];
  const matchSeconds: number[] = [];
  const finishedIds = new Set<string>();
  let measuring = false;
  let matchesFinished = 0;
  let framesIn = 0;
  let framesOut = 0;
  let errors = 0;
  const errorCodes = new Map<string, number>();
  const sockets: WebSocket[] = [];
  const bots: BotClient[] = [];

  const openClient = (i: number) =>
    new Promise<void>((resolve, reject) => {
      const t0 = performance.now();
      const ws = new WebSocket(url);
      const send = (msg: ClientMessage) => {
        if (ws.readyState !== ws.OPEN) return;
        if (measuring) framesOut++;
        ws.send(JSON.stringify(msg));
      };
      const bot = new BotClient({
        profile: LOAD_PROFILE,
        seed: `load-${i}`,
        scheduler,
        send,
        requeue: { delayMs: 100 },
        showFocus: true,
        onFlipRtt: (ms) => measuring && rtts.push(ms),
        onMatchFinished: (s) => {
          if (!measuring || finishedIds.has(s.matchId)) return;
          finishedIds.add(s.matchId);
          matchesFinished++;
          matchSeconds.push(((s.finishedAt ?? 0) - (s.startedAt ?? 0)) / 1000);
        },
      });
      ws.on("message", (data) => {
        if (measuring) framesIn++;
        const msg = JSON.parse(data.toString()) as ServerMessage;
        if (msg.type === "error") {
          errors++;
          errorCodes.set(msg.code, (errorCodes.get(msg.code) ?? 0) + 1);
        }
        if (msg.type === "welcome") {
          connectMs.push(performance.now() - t0);
          send({ type: "queue_join" });
          resolve();
        }
        bot.receive(msg);
      });
      ws.once("open", () => send({ type: "hello", protocol: 1, name: `load${i}` }));
      ws.once("error", reject);
      sockets.push(ws);
      bots.push(bot);
    });

  console.log(`load test: ${opts.clients} clients -> ${url} for ${opts.durationS}s (${cpus().length} vCPU, ${Math.round(totalmem() / 2 ** 30)} GiB)`);
  const batch = Math.max(1, Math.round(opts.rampPerSecond / 10));
  for (let i = 0; i < opts.clients; i += batch) {
    await Promise.all(Array.from({ length: Math.min(batch, opts.clients - i) }, (_, k) => openClient(i + k)));
    await new Promise((r) => setTimeout(r, 100));
  }
  // Let every client get into a match before measuring.
  await new Promise((r) => setTimeout(r, 6000));

  const cpu0 = server?.pid ? await cpuSeconds(server.pid) : null;
  const t0 = performance.now();
  measuring = true;
  await new Promise((r) => setTimeout(r, opts.durationS * 1000));
  measuring = false;
  const elapsed = (performance.now() - t0) / 1000;

  const cpu1 = server?.pid ? await cpuSeconds(server.pid) : null;

  const metricsText = await (await fetch(`${httpBase}/metrics`)).text();
  const metric = (name: string) => Number(new RegExp(`^${name} ([0-9.e+-]+)$`, "m").exec(metricsText)?.[1] ?? NaN);
  const handleBuckets = [...metricsText.matchAll(/^arena_flip_handle_ms_bucket\{le="([^"]+)"\} (\d+)$/gm)].map((m) => [m[1]!, Number(m[2])] as const);
  const handleCount = metric("arena_flip_handle_ms_count");
  const handleP = (q: number) => handleBuckets.find(([, c]) => c >= q * handleCount)?.[0] ?? "n/a";

  for (const b of bots) b.stop();
  for (const ws of sockets) ws.close();
  server?.kill("SIGTERM");

  rtts.sort((a, b) => a - b);
  connectMs.sort((a, b) => a - b);
  const result = {
    label: opts.label || `${opts.clients} clients`,
    date: new Date().toISOString(),
    machine: { vcpus: cpus().length, model: cpus()[0]?.model ?? "unknown", memGiB: Math.round(totalmem() / 2 ** 30), node: process.version, note: "load generator and server on the same machine" },
    clients: opts.clients,
    durationS: round(elapsed, 1),
    matchesFinished,
    matchesPerSecond: round(matchesFinished / elapsed),
    matchSeconds: { p50: round(percentile(matchSeconds.sort((a, b) => a - b), 50), 1), p90: round(percentile(matchSeconds, 90), 1) },
    flips: rtts.length,
    flipsPerSecond: round(rtts.length / elapsed, 1),
    clientFramesOutPerSecond: round(framesOut / elapsed, 0),
    serverFramesOutPerSecond: round(framesIn / elapsed, 0),
    flipRttMs: { p50: round(percentile(rtts, 50)), p90: round(percentile(rtts, 90)), p99: round(percentile(rtts, 99)), max: round(rtts.at(-1) ?? 0) },
    connectMs: { p50: round(percentile(connectMs, 50)), p99: round(percentile(connectMs, 99)) },
    serverFlipHandleMs: { p50Bucket: handleP(0.5), p99Bucket: handleP(0.99) },
    serverCpuPercentOfOneCore: cpu0 !== null && cpu1 !== null ? round(((cpu1 - cpu0) / elapsed) * 100, 1) : null,
    serverRssMiB: round(metric("process_resident_memory_bytes") / 2 ** 20, 0),
    errors,
    errorCodes: Object.fromEntries(errorCodes),
  };
  console.log(JSON.stringify(result, null, 2));
  await mkdir(join(here, "../results"), { recursive: true });
  await writeFile(join(here, `../results/clients-${opts.clients}.json`), JSON.stringify(result, null, 2) + "\n");
  setTimeout(() => process.exit(0), 300);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
