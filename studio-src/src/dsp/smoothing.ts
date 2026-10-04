/**
 * One Euro filter (Casiez, Roussel & Vogel, CHI 2012): a low-pass whose cutoff
 * rises with the signal's speed. While a note is held the cutoff stays low and
 * the needle is steady; when the pitch moves, the cutoff opens and the display
 * follows with almost no lag. A fixed moving average can only trade one for the other.
 */
export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private t = 0;

  constructor(
    /** Cutoff (Hz) when the signal is still. Lower = steadier. */
    public minCutoff = 1.2,
    /** How fast the cutoff opens with speed. Higher = less lag. */
    public beta = 0.04,
    public dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, time: number): number {
    if (this.x === null) {
      this.x = value;
      this.dx = 0;
      this.t = time;
      return value;
    }
    const dt = Math.max(1e-4, time - this.t);
    this.t = time;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuroFilter.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuroFilter.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset() {
    this.x = null;
  }
}

/**
 * Display smoothing for a pitch track in MIDI units. Snaps (resets) on a jump of
 * more than `snap` semitones, so a new note is shown at once instead of gliding.
 */
export class PitchSmoother {
  private readonly f: OneEuroFilter;
  private last = NaN;

  constructor(minCutoff = 1.6, beta = 0.6, private snap = 0.6) {
    this.f = new OneEuroFilter(minCutoff, beta);
  }

  push(midi: number, time: number): number {
    if (!Number.isFinite(midi)) return this.last;
    if (!Number.isFinite(this.last) || Math.abs(midi - this.last) > this.snap) this.f.reset();
    this.last = this.f.filter(midi, time);
    return this.last;
  }

  reset() {
    this.f.reset();
    this.last = NaN;
  }
}
