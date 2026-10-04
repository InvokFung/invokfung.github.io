import type { Logger } from "@arena/core";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

/** One JSON object per line on stdout: what a log shipper in a cluster expects. */
export function jsonLogger(level: keyof typeof LEVELS, base: Record<string, unknown> = {}, write: (line: string) => void = (l) => process.stdout.write(l + "\n")): Logger {
  const min = LEVELS[level];
  const emit = (lvl: keyof typeof LEVELS) => (msg: string, fields?: Record<string, unknown>) => {
    if (LEVELS[lvl] >= min) write(JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...base, ...fields }));
  };
  return { info: emit("info"), warn: emit("warn"), error: emit("error") };
}
