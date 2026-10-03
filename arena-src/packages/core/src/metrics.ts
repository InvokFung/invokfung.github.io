/**
 * Minimal Prometheus-style registry (counters, gauges, histograms), rendered in the
 * text exposition format on /metrics. Shared by the Node server and the worker, which
 * shows the same numbers in the UI.
 */

type Labels = Readonly<Record<string, string>>;

const labelKey = (labels?: Labels) =>
  labels && Object.keys(labels).length
    ? "{" +
      Object.keys(labels)
        .sort()
        .map((k) => `${k}="${String(labels[k]).replace(/["\\\n]/g, "_")}"`)
        .join(",") +
      "}"
    : "";

export class Counter {
  readonly values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  inc(labels?: Labels, by = 1): void {
    const k = labelKey(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + by);
  }
  total(): number {
    let t = 0;
    for (const v of this.values.values()) t += v;
    return t;
  }
}

export class Gauge {
  constructor(
    readonly name: string,
    readonly help: string,
    readonly read: () => number,
  ) {}
}

export class Histogram {
  readonly counts: number[];
  sum = 0;
  count = 0;
  constructor(
    readonly name: string,
    readonly help: string,
    readonly buckets: readonly number[],
  ) {
    this.counts = new Array<number>(buckets.length).fill(0);
  }
  observe(value: number): void {
    this.sum += value;
    this.count += 1;
    for (let i = 0; i < this.buckets.length; i++) if (value <= (this.buckets[i] as number)) this.counts[i] = (this.counts[i] as number) + 1;
  }
  /** Bucket-interpolated quantile (what Prometheus' histogram_quantile computes). */
  quantile(q: number): number {
    if (this.count === 0) return 0;
    const rank = q * this.count;
    let prevCount = 0;
    let prevBound = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      const c = this.counts[i] as number;
      const bound = this.buckets[i] as number;
      if (c >= rank) return prevBound + ((bound - prevBound) * (rank - prevCount)) / Math.max(1, c - prevCount);
      prevCount = c;
      prevBound = bound;
    }
    return prevBound;
  }
}

export const LATENCY_BUCKETS_MS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 1000];

export class MetricsRegistry {
  private readonly items: (Counter | Gauge | Histogram)[] = [];

  counter(name: string, help: string): Counter {
    return this.add(new Counter(name, help));
  }
  gauge(name: string, help: string, read: () => number): Gauge {
    return this.add(new Gauge(name, help, read));
  }
  histogram(name: string, help: string, buckets: readonly number[] = LATENCY_BUCKETS_MS): Histogram {
    return this.add(new Histogram(name, help, buckets));
  }

  private add<T extends Counter | Gauge | Histogram>(item: T): T {
    this.items.push(item);
    return item;
  }

  render(): string {
    const lines: string[] = [];
    for (const m of this.items) {
      lines.push(`# HELP ${m.name} ${m.help}`);
      if (m instanceof Counter) {
        lines.push(`# TYPE ${m.name} counter`);
        if (m.values.size === 0) lines.push(`${m.name} 0`);
        for (const [k, v] of m.values) lines.push(`${m.name}${k} ${v}`);
      } else if (m instanceof Gauge) {
        lines.push(`# TYPE ${m.name} gauge`, `${m.name} ${m.read()}`);
      } else {
        lines.push(`# TYPE ${m.name} histogram`);
        m.buckets.forEach((b, i) => lines.push(`${m.name}_bucket{le="${b}"} ${m.counts[i]}`));
        lines.push(`${m.name}_bucket{le="+Inf"} ${m.count}`, `${m.name}_sum ${m.sum}`, `${m.name}_count ${m.count}`);
      }
    }
    return lines.join("\n") + "\n";
  }
}
