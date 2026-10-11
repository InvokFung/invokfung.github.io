import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dimacs, parseSolutionCost, parseVrplib, solomonProblem } from "../src/core/solomon";
import { Route } from "../src/core/route";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "bench", "solomon");

test("Solomon: the parser reads C101, and the best-known routes cost what the file says under our distance convention", { skip: !existsSync(join(DIR, "C101.vrp")) }, () => {
  const inst = parseVrplib(readFileSync(join(DIR, "C101.vrp"), "utf8"));
  assert.equal(inst.xs.length, 101);
  assert.equal(inst.capacity, 200);
  assert.equal(inst.service[5], 90);
  const solText = readFileSync(join(DIR, "C101.sol"), "utf8");
  const bks = parseSolutionCost(solText);
  const P = solomonProblem(inst);
  let total = 0;
  for (const line of solText.split("\n").filter((l) => l.startsWith("Route"))) {
    const seq = line.split(":")[1].trim().split(/\s+/).map((x) => Number(x) - 1);
    const r = new Route(P.vehicles[0], seq);
    r.evaluate(P);
    assert.ok(r.lateW < 1e-9, "the best-known routes are on time under our timing");
    assert.ok(r.load <= inst.capacity);
    total += r.drive;
  }
  assert.ok(Math.abs(total - bks.cost) < 0.05, `${total} vs ${bks.cost}`);
  assert.equal(dimacs(Math.hypot(3, 4.04)), 5.0);
});
