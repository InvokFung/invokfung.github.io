/**
 * After `vite build`: measures the output (raw and gzipped) and writes
 * ../studio/build-info.json, which the landing page reads to show its own size.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "studio");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

const sum = (list: string[]) =>
  list.reduce(
    (acc, f) => {
      const buf = readFileSync(f);
      return { raw: acc.raw + buf.length, gzip: acc.gzip + gzipSync(buf, { level: 9 }).length };
    },
    { raw: 0, gzip: 0 },
  );

const all = files(OUT);
const worklets = all.filter((f) => /processor.*\.js$/.test(f));
const js = all.filter((f) => f.endsWith(".js") && !worklets.includes(f));
const css = all.filter((f) => f.endsWith(".css"));
// The entry chunk is what the page needs before it can paint; the WebGL stage (three.js) is split off and loads after.
const entry = js.filter((f) => /[\\/]index-[^\\/]*\.js$/.test(f));
const info = { js: sum(js), entry: sum(entry), css: sum(css), worklets: sum(worklets), builtAt: new Date().toISOString() };
writeFileSync(join(OUT, "build-info.json"), JSON.stringify(info, null, 2) + "\n");
const kb = (n: number) => `${(n / 1000).toFixed(1)} kB`;
console.log(`JS ${kb(info.js.raw)} (${kb(info.js.gzip)} gzip; entry ${kb(info.entry.gzip)} gzip) · CSS ${kb(info.css.raw)} (${kb(info.css.gzip)} gzip) · worklets ${kb(info.worklets.raw)} (${kb(info.worklets.gzip)} gzip)`);
