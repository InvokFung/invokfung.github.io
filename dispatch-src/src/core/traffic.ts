// Time-of-day congestion. A congestion factor c(t) ≥ 1 says how much slower
// than free flow the roads are at time t; it is piecewise constant (a rush-hour
// profile, multiplied by whatever traffic event is in force). Travel follows
// the Ichoua-Gendreau-Potvin model: a trip with free-flow time f "uses up"
// free-flow minutes at a rate 1/c(t) per real minute, so a trip that crosses
// into rush hour slows down part-way. That model is FIFO: leaving later never
// means arriving earlier, which is what makes the latest-start bookkeeping in
// route.ts exact.
//
// Implementation: the cumulative free-flow function F(t) = ∫ 1/c is piecewise
// linear and increasing, so arrive(f, t) = F⁻¹(F(t) + f) and
// latestDepart(f, t) = F⁻¹(F(t) - f), each a lookup and a little arithmetic.

/** Minutes covered by the lookup tables (two days; later times fall back to a short scan). */
const TABLE = 2880;

export interface TrafficEvent {
  at: number;
  /** Multiplier on the rush-hour profile from `at` on, until the next event. */
  factor: number;
}

/** Rush-hour profile for the synthetic city: [from minute, factor]. Minutes since midnight. */
export const DAY_PROFILE: readonly (readonly [number, number])[] = [
  [0, 1.0],
  [390, 1.1], // 06:30
  [420, 1.3], // 07:00
  [450, 1.45], // 07:30
  [540, 1.25], // 09:00
  [570, 1.1], // 09:30
  [720, 1.2], // 12:00
  [810, 1.1], // 13:30
  [930, 1.25], // 15:30
  [960, 1.5], // 16:00
  [1080, 1.25], // 18:00
  [1110, 1.05], // 18:30
];

export class Traffic {
  /** Breakpoints T[0] < T[1] < …; factor c[i] holds on [T[i], T[i+1]). The last piece runs to +∞, the first back to -∞. */
  readonly T: Float64Array;
  readonly c: Float64Array;
  /** F(T[i]). */
  readonly F: Float64Array;
  readonly cMin: number;
  readonly cMax: number;
  private readonly flat: boolean;
  private readonly byT: Int32Array;
  private readonly byF: Int32Array;

  constructor(pieces: readonly (readonly [number, number])[]) {
    const m = pieces.length;
    this.T = new Float64Array(m);
    this.c = new Float64Array(m);
    this.F = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      this.T[i] = pieces[i][0];
      this.c[i] = pieces[i][1];
      if (i > 0) {
        if (!(this.T[i] > this.T[i - 1])) throw new Error("traffic breakpoints must increase");
        this.F[i] = this.F[i - 1] + (this.T[i] - this.T[i - 1]) / this.c[i - 1];
      }
    }
    this.cMin = Math.min(...this.c);
    this.cMax = Math.max(...this.c);
    this.flat = m === 1;
    // per-minute lookup of the piece index, on the clock and on the free-flow scale, so each call is O(1)
    this.byT = new Int32Array(TABLE);
    this.byF = new Int32Array(TABLE);
    let i = 0;
    let k = 0;
    for (let x = 0; x < TABLE; x++) {
      while (i + 1 < m && this.T[i + 1] <= x) i++;
      while (k + 1 < m && this.F[k + 1] <= x) k++;
      this.byT[x] = i;
      this.byF[x] = k;
    }
  }

  static flat(factor = 1): Traffic {
    return new Traffic([[0, factor]]);
  }

  /** Rush-hour profile times the multiplier of the latest event at or before each moment. */
  static day(events: readonly TrafficEvent[] = [], profile: readonly (readonly [number, number])[] = DAY_PROFILE): Traffic {
    const evs = [...events].sort((a, b) => a.at - b.at);
    const cuts = new Set<number>(profile.map((p) => p[0]));
    for (const e of evs) cuts.add(e.at);
    const times = [...cuts].sort((a, b) => a - b);
    const prof = (t: number) => {
      let f = profile[0][1];
      for (const [at, c] of profile) if (at <= t) f = c;
      return f;
    };
    const mult = (t: number) => {
      let f = 1;
      for (const e of evs) if (e.at <= t) f = e.factor;
      return f;
    };
    const pieces: [number, number][] = [];
    for (const t of times) {
      const c = prof(t) * mult(t);
      if (pieces.length && Math.abs(pieces[pieces.length - 1][1] - c) < 1e-12) continue;
      pieces.push([t, c]);
    }
    return new Traffic(pieces);
  }

  /** Index of the piece containing t. */
  private piece(t: number): number {
    const T = this.T;
    const last = T.length - 1;
    let i: number;
    if (t >= 0 && t < TABLE) i = this.byT[t | 0];
    else if (t < 0) return 0;
    else i = this.byT[TABLE - 1];
    while (i < last && T[i + 1] <= t) i++;
    return i;
  }

  private pieceF(f: number): number {
    const F = this.F;
    const last = F.length - 1;
    let i: number;
    if (f >= 0 && f < TABLE) i = this.byF[f | 0];
    else if (f < 0) return 0;
    else i = this.byF[TABLE - 1];
    while (i < last && F[i + 1] <= f) i++;
    return i;
  }

  /** Cumulative free-flow minutes at time t. */
  cum(t: number): number {
    const i = this.piece(t);
    return this.F[i] + (t - this.T[i]) / this.c[i];
  }

  /** Time at which the cumulative free-flow function reaches f. */
  inv(f: number): number {
    const i = this.pieceF(f);
    return this.T[i] + (f - this.F[i]) * this.c[i];
  }

  /** Arrival time of a trip with free-flow time `ff` that leaves at `t`. */
  arrive(ff: number, t: number): number {
    if (ff === 0) return t;
    if (this.flat) return t + ff * this.c[0];
    return this.inv(this.cum(t) + ff);
  }

  /** Latest departure that still arrives by `t` (the inverse of arrive). */
  latestDepart(ff: number, t: number): number {
    if (ff === 0) return t;
    if (this.flat) return t - ff * this.c[0];
    return this.inv(this.cum(t) - ff);
  }

  /** Lowest and highest congestion factor over [t0, t1]. */
  range(t0: number, t1: number): [number, number] {
    if (this.flat) return [this.c[0], this.c[0]];
    let i = this.piece(t0);
    let lo = this.c[i];
    let hi = lo;
    while (i + 1 < this.T.length && this.T[i + 1] <= t1) {
      i++;
      if (this.c[i] < lo) lo = this.c[i];
      if (this.c[i] > hi) hi = this.c[i];
    }
    return [lo, hi];
  }

  /** Congestion factor at time t. */
  factor(t: number): number {
    return this.c[this.piece(t)];
  }

  /** JSON-safe form for the page. */
  pieces(): [number, number][] {
    return Array.from(this.T, (t, i) => [t, this.c[i]]);
  }
}
