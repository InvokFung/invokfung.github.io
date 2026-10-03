// Multi-window, multi-burn-rate SLO alerts, as in chapter 5 of the Google SRE
// workbook. Burn rate is the error ratio divided by the error budget
// (1 - target): burning at 1x spends exactly the budget over the SLO period.
// An alert fires only when both a long and a short window burn faster than
// the threshold: the long window proves the burn is significant, the short
// one that it is still happening, so the alert also resets quickly.

export interface BurnRule {
  name: string;
  /** Windows in minutes of simulated time. */
  longMin: number;
  shortMin: number;
  /** Burn-rate threshold. */
  factor: number;
  severity: "page" | "ticket";
}

/** The workbook's two paging rules for a 30-day SLO. */
export const PAGE_RULES: BurnRule[] = [
  { name: "fast burn", longMin: 60, shortMin: 5, factor: 14.4, severity: "page" },
  { name: "slow burn", longMin: 360, shortMin: 30, factor: 6, severity: "page" },
];

export const burnRate = (bad: number, total: number, target: number) => (total > 0 ? bad / total / (1 - target) : 0);

/** Fraction of a period's error budget spent by burning at `rate` for `minutes`. */
export const budgetSpent = (rate: number, minutes: number, periodDays = 30) => (rate * minutes) / (periodDays * 24 * 60);

export interface RuleState {
  rule: BurnRule;
  long: number;
  short: number;
  firing: boolean;
}

/** Per-minute good/total counts in a ring buffer with O(1) window sums. */
export class SloTracker {
  private bad: Float64Array;
  private total: Float64Array;
  private n = 0;
  readonly maxWindow: number;

  constructor(
    readonly target: number,
    readonly rules: BurnRule[] = PAGE_RULES,
  ) {
    if (!(target > 0 && target < 1)) throw new Error("target must be in (0, 1)");
    this.maxWindow = Math.max(...rules.map((r) => r.longMin));
    this.bad = new Float64Array(this.maxWindow);
    this.total = new Float64Array(this.maxWindow);
  }

  /** Record one minute. */
  push(good: number, total: number): void {
    const i = this.n % this.maxWindow;
    this.bad[i] = total - good;
    this.total[i] = total;
    this.n++;
  }

  /** Error ratio over the last `minutes` (or as many as have been recorded). */
  ratio(minutes: number): number {
    const m = Math.min(minutes, this.n, this.maxWindow);
    let b = 0;
    let t = 0;
    for (let j = 1; j <= m; j++) {
      const i = (this.n - j) % this.maxWindow;
      b += this.bad[i];
      t += this.total[i];
    }
    return t > 0 ? b / t : 0;
  }

  burn(minutes: number): number {
    return this.ratio(minutes) / (1 - this.target);
  }

  evaluate(): RuleState[] {
    return this.rules.map((rule) => {
      const long = this.burn(rule.longMin);
      const short = this.burn(rule.shortMin);
      return { rule, long, short, firing: long > rule.factor && short > rule.factor };
    });
  }
}
