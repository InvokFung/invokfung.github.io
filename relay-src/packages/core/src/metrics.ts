// A small Prometheus registry: counters, gauges and histograms with labels,
// rendered in the text exposition format (version 0.0.4).

type Labels = Record<string, string>;

const key = (l: Labels) =>
  Object.keys(l)
    .sort()
    .map((k) => `${k}="${String(l[k]).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"')}"`)
    .join(",");

const fmt = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 1e9) / 1e9) : v > 0 ? "+Inf" : v < 0 ? "-Inf" : "NaN");

abstract class Metric {
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  abstract readonly type: string;
  abstract lines(): string[];
}

export class Counter extends Metric {
  readonly type = "counter";
  private values = new Map<string, number>();
  inc(labels: Labels = {}, by = 1): void {
    const k = key(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + by);
  }
  get(labels: Labels = {}): number {
    return this.values.get(key(labels)) ?? 0;
  }
  lines(): string[] {
    return [...this.values].map(([k, v]) => `${this.name}${k ? `{${k}}` : ""} ${fmt(v)}`);
  }
}

export class Gauge extends Metric {
  readonly type = "gauge";
  private values = new Map<string, number>();
  set(labels: Labels, v: number): void {
    this.values.set(key(labels), v);
  }
  get(labels: Labels = {}): number {
    return this.values.get(key(labels)) ?? 0;
  }
  lines(): string[] {
    return [...this.values].map(([k, v]) => `${this.name}${k ? `{${k}}` : ""} ${fmt(v)}`);
  }
}

export class Histogram extends Metric {
  readonly type = "histogram";
  private series = new Map<string, { counts: number[]; sum: number; n: number }>();
  constructor(
    name: string,
    help: string,
    readonly buckets: readonly number[],
  ) {
    super(name, help);
  }
  observe(labels: Labels, v: number): void {
    const k = key(labels);
    let s = this.series.get(k);
    if (!s) this.series.set(k, (s = { counts: new Array(this.buckets.length).fill(0), sum: 0, n: 0 }));
    for (let i = 0; i < this.buckets.length; i++) if (v <= this.buckets[i]) s.counts[i]++;
    s.sum += v;
    s.n++;
  }
  lines(): string[] {
    const out: string[] = [];
    for (const [k, s] of this.series) {
      const sep = k ? k + "," : "";
      this.buckets.forEach((b, i) => out.push(`${this.name}_bucket{${sep}le="${fmt(b)}"} ${s.counts[i]}`));
      out.push(`${this.name}_bucket{${sep}le="+Inf"} ${s.n}`);
      out.push(`${this.name}_sum${k ? `{${k}}` : ""} ${fmt(s.sum)}`);
      out.push(`${this.name}_count${k ? `{${k}}` : ""} ${s.n}`);
    }
    return out;
  }
}

export class Registry {
  private metrics: Metric[] = [];
  counter(name: string, help: string): Counter {
    return this.add(new Counter(name, help));
  }
  gauge(name: string, help: string): Gauge {
    return this.add(new Gauge(name, help));
  }
  histogram(name: string, help: string, buckets: readonly number[]): Histogram {
    return this.add(new Histogram(name, help, buckets));
  }
  private add<M extends Metric>(m: M): M {
    this.metrics.push(m);
    return m;
  }
  render(): string {
    return this.metrics.map((m) => [`# HELP ${m.name} ${m.help}`, `# TYPE ${m.name} ${m.type}`, ...m.lines()].join("\n")).join("\n") + "\n";
  }
}
