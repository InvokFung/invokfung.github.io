// Eval-gated canary rollout.
//
// A candidate config takes a growing share of live traffic (5% → 25% → 100%).
// Before each step the eval suite runs against the simulator under the
// candidate; during the step, live outcomes of canary and stable requests in
// the same window are compared. Any failing gate rolls back at once.
//
// The live gates wait for evidence instead of reacting to raw ratios. The error
// gate fails when the Wilson 95% lower bound of the canary's error rate is above
// the stable rate plus a margin, so one unlucky request in a dozen does not roll
// a good change back, and a broken one is caught after a handful of requests.
// The latency gate fails when a distribution-free 95% lower bound on the
// canary's p95 is above the allowed multiple of stable's p95. Cache hits are
// left out of both: they do not exercise the config, and a new config starts
// with a cold cache, which would make it look slower and more reliable than it is.

import type { Clock } from "./clock";
import type { RequestSummary } from "./context";
import { hashString } from "./rng";
import { quantile, quantileLowerBound, wilson } from "./stats";

export interface EvalTaskResult {
  id: string;
  title: string;
  category: string;
  pass: boolean;
  detail: string;
}

export interface EvalReport {
  version: string;
  passed: number;
  total: number;
  passRate: number;
  tasks: EvalTaskResult[];
}

export interface CanaryStep {
  weight: number;
  /** Canary requests needed before the step can pass. */
  minSamples: number;
  minDwellMs: number;
  /** Not enough traffic by then rolls back: no evidence is not a pass. */
  maxDwellMs: number;
}

export interface CanaryGates {
  minEvalPassRate: number;
  /** Allowed rise in error rate, absolute (0.02 = two points). */
  maxErrorIncrease: number;
  /** The 95% lower bound of the canary's p95 latency may be at most this multiple of stable's p95. */
  maxP95Ratio: number;
  minLatencySamples: number;
}

export interface GateCheck {
  gate: "eval" | "errors" | "latency" | "traffic";
  ok: boolean;
  value: string;
  limit: string;
}

export interface StepResult {
  step: number;
  weight: number;
  ok: boolean;
  checks: GateCheck[];
  canaryN: number;
  stableN: number;
  at: number;
}

export type CanaryStatus = "idle" | "evaluating" | "observing" | "promoted" | "rolled-back";

export interface LiveWindow {
  canaryN: number;
  canaryErrors: number;
  stableN: number;
  stableErrors: number;
  canaryLatency: number[];
  stableLatency: number[];
}

export interface CanaryState {
  status: CanaryStatus;
  stable: string;
  candidate: string | null;
  step: number;
  weight: number;
  stepStartedAt: number;
  results: StepResult[];
  evals: EvalReport[];
  live: LiveWindow;
  reason: string | null;
}

export const DEFAULT_STEPS: CanaryStep[] = [
  { weight: 0.05, minSamples: 12, minDwellMs: 3000, maxDwellMs: 60000 },
  { weight: 0.25, minSamples: 20, minDwellMs: 3000, maxDwellMs: 60000 },
  { weight: 1, minSamples: 30, minDwellMs: 3000, maxDwellMs: 60000 },
];

export const DEFAULT_GATES: CanaryGates = { minEvalPassRate: 0.95, maxErrorIncrease: 0.02, maxP95Ratio: 1.5, minLatencySamples: 10 };

const emptyWindow = (): LiveWindow => ({ canaryN: 0, canaryErrors: 0, stableN: 0, stableErrors: 0, canaryLatency: [], stableLatency: [] });

/** A request the gateway, not the client, is to blame for: upstream failures, timeouts, streams cut by errors. */
export const isServerError = (s: Pick<RequestSummary, "status" | "outcome">) => s.status >= 500 || s.outcome === "error";

export class CanaryController {
  private s: CanaryState;
  private run = 0;

  constructor(
    private readonly opts: {
      clock: Clock;
      stable: string;
      runEvals: (version: string, step: number) => Promise<EvalReport>;
      steps?: CanaryStep[];
      gates?: CanaryGates;
      onChange?: (s: CanaryState) => void;
      /** Called when a candidate becomes stable. */
      onPromote?: (version: string) => void;
    },
  ) {
    this.s = { status: "idle", stable: opts.stable, candidate: null, step: -1, weight: 0, stepStartedAt: 0, results: [], evals: [], live: emptyWindow(), reason: null };
  }

  get steps(): CanaryStep[] {
    return this.opts.steps ?? DEFAULT_STEPS;
  }

  get gates(): CanaryGates {
    return this.opts.gates ?? DEFAULT_GATES;
  }

  get state(): CanaryState {
    return this.s;
  }

  get active(): boolean {
    return this.s.status === "evaluating" || this.s.status === "observing";
  }

  /** The config version for a request id: a stable hash, so a retry of the same id lands on the same side. */
  route(id: string): string {
    if (this.s.status !== "observing" || !this.s.candidate) return this.s.stable;
    return hashString(id, 0x2545f491) / 4294967296 < this.s.weight ? this.s.candidate : this.s.stable;
  }

  async begin(candidate: string): Promise<void> {
    if (this.active) throw new Error("a rollout is already running");
    const run = ++this.run;
    this.s = { ...this.s, status: "evaluating", candidate, step: 0, weight: 0, results: [], evals: [], live: emptyWindow(), reason: null };
    this.changed();
    await this.enterStep(0, run);
  }

  /** Forgets the last rollout and makes `stable` the stable version (aborting any rollout in progress). */
  reset(stable: string): void {
    this.run++;
    this.pendingEval = null;
    this.s = { status: "idle", stable, candidate: null, step: -1, weight: 0, stepStartedAt: 0, results: [], evals: [], live: emptyWindow(), reason: null };
    this.changed();
  }

  abort(reason = "stopped by operator"): void {
    if (!this.active) return;
    this.run++;
    this.rollback(reason);
  }

  observe(s: RequestSummary): void {
    if (this.s.status !== "observing") return;
    if (s.endedAt < this.s.stepStartedAt || s.startedAt < this.s.stepStartedAt) return;
    if (s.outcome === "rejected" || s.outcome === "cancelled") return;
    if (s.cache === "exact" || s.cache === "near") return;
    const w = this.s.live;
    const err = isServerError(s);
    if (s.configVersion === this.s.candidate) {
      w.canaryN++;
      if (err) w.canaryErrors++;
      else w.canaryLatency.push(s.latencyMs);
    } else if (s.configVersion === this.s.stable) {
      w.stableN++;
      if (err) w.stableErrors++;
      else w.stableLatency.push(s.latencyMs);
    }
    // Fast path: a clearly broken candidate is rolled back without waiting out the step.
    if (s.configVersion === this.s.candidate && w.canaryN >= 5) {
      const e = this.errorGate();
      if (!e.ok) this.finishStep([e], "error rate");
      else this.changed();
    } else this.changed();
  }

  /** Call periodically (the page and the server do every few hundred ms) to close steps on time. */
  tick(): void {
    if (this.s.status !== "observing") return;
    const step = this.steps[this.s.step];
    const elapsed = this.opts.clock.now() - this.s.stepStartedAt;
    const w = this.s.live;
    if (w.canaryN >= step.minSamples && elapsed >= step.minDwellMs) this.finishStep([this.errorGate(), this.latencyGate()]);
    else if (elapsed >= step.maxDwellMs) this.finishStep([{ gate: "traffic", ok: false, value: `${w.canaryN} canary requests`, limit: `≥ ${step.minSamples} within ${Math.round(step.maxDwellMs / 1000)} s` }], "not enough traffic");
  }

  private async enterStep(i: number, run: number): Promise<void> {
    this.s = { ...this.s, status: "evaluating", step: i, weight: i === 0 ? 0 : this.s.weight };
    this.changed();
    const report = await this.opts.runEvals(this.s.candidate!, i);
    if (run !== this.run) return;
    this.s.evals = [...this.s.evals, report];
    const g = this.gates;
    const evalCheck: GateCheck = { gate: "eval", ok: report.passRate >= g.minEvalPassRate, value: `${report.passed}/${report.total} passed`, limit: `≥ ${Math.round(g.minEvalPassRate * 100)}%` };
    if (!evalCheck.ok) {
      const failed = report.tasks.filter((t) => !t.pass).map((t) => t.category);
      this.s.results = [...this.s.results, { step: i, weight: this.steps[i].weight, ok: false, checks: [evalCheck], canaryN: 0, stableN: 0, at: this.opts.clock.now() }];
      this.rollback(`eval gate before ${Math.round(this.steps[i].weight * 100)}%: ${report.passed}/${report.total} passed (failing: ${[...new Set(failed)].join(", ")})`);
      return;
    }
    this.pendingEval = evalCheck;
    // The canary's window starts fresh each step; stable's carries over, since at
    // 100% there is no stable traffic left to compare against.
    const prev = this.s.live;
    const live = emptyWindow();
    if (i > 0) {
      live.stableN = prev.stableN;
      live.stableErrors = prev.stableErrors;
      live.stableLatency = prev.stableLatency.slice(-1000);
    }
    this.s = { ...this.s, status: "observing", weight: this.steps[i].weight, stepStartedAt: this.opts.clock.now(), live };
    this.changed();
  }

  private pendingEval: GateCheck | null = null;

  private errorGate(): GateCheck {
    const w = this.s.live;
    const stableRate = w.stableN ? w.stableErrors / w.stableN : 0;
    const lo = wilson(w.canaryErrors, w.canaryN).lo;
    const limit = stableRate + this.gates.maxErrorIncrease;
    return {
      gate: "errors",
      ok: lo <= limit,
      value: `${pct(w.canaryN ? w.canaryErrors / w.canaryN : 0)} canary (95% lower bound ${pct(lo)}) vs ${pct(stableRate)} stable`,
      limit: `lower bound ≤ ${pct(limit)}`,
    };
  }

  private latencyGate(): GateCheck {
    const w = this.s.live;
    const g = this.gates;
    if (w.canaryLatency.length < g.minLatencySamples || w.stableLatency.length < g.minLatencySamples)
      return { gate: "latency", ok: true, value: `${w.canaryLatency.length} samples`, limit: `needs ${g.minLatencySamples} on each side; not judged` };
    const c = quantile(w.canaryLatency, 0.95);
    const lo = quantileLowerBound(w.canaryLatency, 0.95) ?? 0;
    const s = quantile(w.stableLatency, 0.95);
    return {
      gate: "latency",
      ok: lo <= s * g.maxP95Ratio,
      value: `p95 ${Math.round(c)} ms (95% lower bound ${Math.round(lo)} ms) vs ${Math.round(s)} ms stable`,
      limit: `lower bound ≤ ${g.maxP95Ratio}× stable = ${Math.round(s * g.maxP95Ratio)} ms`,
    };
  }

  private finishStep(checks: GateCheck[], failure?: string): void {
    const i = this.s.step;
    const all = this.pendingEval ? [this.pendingEval, ...checks] : checks;
    const ok = all.every((c) => c.ok);
    const w = this.s.live;
    this.s.results = [...this.s.results, { step: i, weight: this.steps[i].weight, ok, checks: all, canaryN: w.canaryN, stableN: w.stableN, at: this.opts.clock.now() }];
    if (!ok) {
      const bad = all.find((c) => !c.ok)!;
      this.rollback(`${failure ?? bad.gate} gate at ${Math.round(this.steps[i].weight * 100)}%: ${bad.value} (limit ${bad.limit})`);
      return;
    }
    if (i + 1 >= this.steps.length) {
      const v = this.s.candidate!;
      this.s = { ...this.s, status: "promoted", stable: v, weight: 1, reason: null };
      this.opts.onPromote?.(v);
      this.changed();
      return;
    }
    void this.enterStep(i + 1, this.run);
  }

  private rollback(reason: string): void {
    this.run++;
    this.s = { ...this.s, status: "rolled-back", weight: 0, reason };
    this.changed();
  }

  private changed(): void {
    this.opts.onChange?.(this.s);
  }
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
