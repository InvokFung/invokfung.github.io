// A binary min-heap of timed events. Ties break on insertion order, which keeps
// the discrete-event simulation deterministic.

export interface Timed {
  t: number;
  seq: number;
}

export class EventHeap<T extends Timed> {
  private a: T[] = [];

  get size(): number {
    return this.a.length;
  }

  peek(): T | undefined {
    return this.a[0];
  }

  push(x: T): void {
    const a = this.a;
    let i = a.length;
    a.push(x);
    while (i > 0) {
      const p = (i - 1) >> 1;
      const y = a[p];
      if (y.t < x.t || (y.t === x.t && y.seq < x.seq)) break;
      a[i] = y;
      i = p;
    }
    a[i] = x;
  }

  pop(): T | undefined {
    const a = this.a;
    const n = a.length;
    if (!n) return undefined;
    const top = a[0];
    const x = a.pop()!;
    if (n > 1) {
      const m = n - 1;
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= m) break;
        const r = c + 1;
        if (r < m && (a[r].t < a[c].t || (a[r].t === a[c].t && a[r].seq < a[c].seq))) c = r;
        const y = a[c];
        if (x.t < y.t || (x.t === y.t && x.seq < y.seq)) break;
        a[i] = y;
        i = c;
      }
      a[i] = x;
    }
    return top;
  }
}
