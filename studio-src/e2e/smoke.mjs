/**
 * End-to-end smoke test of the built app in headless Chromium.
 *
 *   npm run build
 *   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs \
 *   CHROMIUM_PATH=/path/to/chromium npm run e2e
 *
 * Playwright is not a dependency of this project (the browser download is large);
 * point PLAYWRIGHT_MODULE at any installed copy, or install it next to this file.
 * The script serves ../studio itself on a free port, renders a WAV of the
 * synthesized violin for Chromium's fake microphone, and checks:
 *   1. landing renders with no horizontal scroll at 1440x900 and 390x844
 *   2. demo: a drill runs to its summary and the progress page shows the session
 *   3. demo tuner: the bowed A4 settles to within ±5 cents
 *   4. microphone (fake capture): the tuner reads the scale; a drill scores it
 *   5. microphone denied: a readable error, and the demo still offered
 *   6. no console errors or page errors throughout
 */
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");
const ROOT = resolve(SRC, "..");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

// ------------------------------------------------------------------ static server for /studio/
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  let file = normalize(join(ROOT, path));
  if (!file.startsWith(join(ROOT, "studio"))) return res.writeHead(404).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/studio/`;

// ------------------------------------------------------------------ fake microphone input
const TMP = mkdtempSync(join(process.env.E2E_TMPDIR ?? tmpdir(), "intonation-e2e-"));
const WAV = join(TMP, "violin-gmajor.wav");
const made = spawnSync("npx", ["tsx", "scripts/make-wav.ts", WAV], { cwd: SRC, encoding: "utf8" });
if (made.status !== 0) throw new Error(`make-wav failed: ${made.stderr}`);

const BASE_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"];
const launch = (extra = []) => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: [...BASE_ARGS, ...extra] });

const results = [];
const problems = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function watch(page, label) {
  // Expected noise: web fonts blocked in sandboxes, and a deprecation warning inside three.js.
  const ignore = /ERR_CERT|fonts\.g|THREE\.Clock|Failed to load resource/;
  page.on("console", (m) => m.type() === "error" && !ignore.test(m.text()) && problems.push(`${label}: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`${label}: ${e.message}`));
  page.on("response", (r) => r.status() >= 400 && r.url().startsWith(BASE) && problems.push(`${label}: HTTP ${r.status()} ${r.url()}`));
}
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const text = async (page, sel) => ((await page.textContent(sel)) ?? "").trim();

try {
  // 1–3: demo path, desktop and phone
  {
    const browser = await launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    watch(page, "demo");
    await page.goto(BASE);
    await page.waitForSelector("text=Watch the demo");
    check("landing: no horizontal scroll at 1440", await noHorizontalScroll(page));
    await page.click("text=Watch the demo");
    await page.waitForSelector(".lane");
    await page.waitForSelector(".summary", { timeout: 90_000 });
    const head = await text(page, ".summary-head");
    const score = Number(head.match(/^\d+/)?.[0] ?? NaN);
    check("demo: drill completes with a score", score >= 50 && score <= 100, head);
    await page.click("text=See progress");
    await page.waitForSelector(".tiles");
    const sessions = await page.$$eval("table.data tbody tr", (r) => r.length);
    check("progress: the demo session is listed", sessions === 1, `${sessions} row(s)`);
    check("progress: fingerboard heatmap drawn", (await page.$$(".progress svg circle")).length > 0);

    await page.evaluate(() => (location.hash = "#/tuner"));
    await page.click(".chips button:has-text('A4')");
    await page.waitForTimeout(2600);
    const cents = parseFloat((await text(page, ".g-cents")).replace("−", "-"));
    check("demo tuner: bowed A4 settles within ±5¢", Math.abs(cents) <= 5, `${cents}¢, ${await text(page, ".g-hz")}`);

    await page.setViewportSize({ width: 390, height: 844 });
    for (const view of ["", "#/tuner", "#/drill", "#/progress"]) {
      await page.evaluate((h) => (location.hash = h), view);
      await page.waitForTimeout(500);
      check(`phone 390: no horizontal scroll on ${view || "#/"}`, await noHorizontalScroll(page));
    }
    await browser.close();
  }

  // 4: microphone path through Chromium's fake capture device
  {
    const browser = await launch(["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${WAV}`]);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    watch(page, "mic");
    await page.goto(`${BASE}#/tuner`);
    await page.click("text=Use my microphone");
    const notes = new Set();
    for (let i = 0; i < 60 && notes.size < 8; i++) {
      await page.waitForTimeout(250);
      if (/Hz/.test(await text(page, ".g-hz"))) notes.add(await text(page, ".g-note"));
    }
    check("mic tuner: reads the notes of the scale", notes.size >= 6, [...notes].join(" "));

    await page.evaluate(() => (location.hash = "#/drill"));
    await page.click(".grades button:has-text('1')");
    await page.click(".keys button:has-text('G maj')");
    if (await page.locator(".switch input").isChecked()) await page.click(".switch");
    await page.click("button.btn.primary.wide");
    await page.waitForSelector(".summary", { timeout: 70_000 });
    const head = await text(page, ".summary-head");
    const within = Number(head.match(/(\d+) of 15 notes within/)?.[1] ?? NaN);
    // The WAV is played up to 12 cents off on purpose; 13 of its 15 notes are within ±10.
    check("mic drill: G major scored from the microphone", within >= 12, head);
    await browser.close();
  }

  // 5: microphone denied
  {
    const browser = await launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    watch(page, "denied");
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    });
    await page.goto(`${BASE}#/tuner`);
    await page.click("text=Use my microphone");
    await page.waitForSelector(".alert", { timeout: 5000 });
    const alert = await text(page, ".alert");
    check("mic denied: explains and points to the demo", /blocked/i.test(alert) && /demo/i.test(alert), alert);
    await browser.close();
  }

  check("no console errors or page errors", problems.length === 0, problems.join(" | "));
} finally {
  server.close();
  rmSync(TMP, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
