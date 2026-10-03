// Disjoint-set forest with union by size and path halving.

export class UnionFind {
  readonly parent: Int32Array;
  readonly size: Int32Array;
  sets: number;

  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.size = new Int32Array(n).fill(1);
    for (let i = 0; i < n; i++) this.parent[i] = i;
    this.sets = n;
  }

  find(x: number): number {
    const p = this.parent;
    while (p[x] !== x) {
      p[x] = p[p[x]];
      x = p[x];
    }
    return x;
  }

  /** Joins the sets of a and b; false when they were already one set. */
  union(a: number, b: number): boolean {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;
    if (this.size[ra] < this.size[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    this.size[ra] += this.size[rb];
    this.sets--;
    return true;
  }

  same(a: number, b: number): boolean {
    return this.find(a) === this.find(b);
  }

  /** Dense cluster id per element, numbered by first appearance. */
  labels(): Int32Array {
    const n = this.parent.length;
    const out = new Int32Array(n);
    const id = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const r = this.find(i);
      let c = id.get(r);
      if (c === undefined) id.set(r, (c = id.size));
      out[i] = c;
    }
    return out;
  }
}
