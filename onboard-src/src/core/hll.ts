// HyperLogLog (Flajolet, Fusy, Gandouet & Meunier 2007) with the standard
// small-range (linear counting) and large-range corrections, over a
// from-scratch 32-bit MurmurHash3. With p = 12 it keeps 4,096 one-byte
// registers per column, and its standard error is 1.04 / sqrt(4096) ≈ 1.6%.

/** MurmurHash3 x86_32 over a string's UTF-16 code units, two units per 32-bit block. */
export function murmur3(s: string, seed = 0): number {
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let h = seed >>> 0;
  const len = s.length;
  const blocks = len >> 1;
  for (let b = 0; b < blocks; b++) {
    let k = (s.charCodeAt(2 * b) & 0xffff) | ((s.charCodeAt(2 * b + 1) & 0xffff) << 16);
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  if (len & 1) {
    let k = s.charCodeAt(len - 1) & 0xffff;
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
  }
  h ^= len * 2;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class HyperLogLog {
  readonly p: number;
  readonly m: number;
  readonly registers: Uint8Array;

  constructor(p = 12) {
    if (p < 4 || p > 16) throw new Error("precision must be 4..16");
    this.p = p;
    this.m = 1 << p;
    this.registers = new Uint8Array(this.m);
  }

  add(value: string): void {
    this.addHash(murmur3(value));
  }

  addHash(h: number): void {
    const idx = h >>> (32 - this.p);
    // rank = position of the first 1-bit in the remaining 32 - p bits (1-based)
    const w = ((h << this.p) | (1 << (this.p - 1))) >>> 0;
    const rank = Math.clz32(w) + 1;
    if (rank > this.registers[idx]) this.registers[idx] = rank;
  }

  merge(other: HyperLogLog): void {
    if (other.p !== this.p) throw new Error("precision mismatch");
    for (let i = 0; i < this.m; i++) if (other.registers[i] > this.registers[i]) this.registers[i] = other.registers[i];
  }

  /** Relative standard error of the raw estimator. */
  get standardError(): number {
    return 1.04 / Math.sqrt(this.m);
  }

  count(): number {
    const m = this.m;
    const alpha = m === 16 ? 0.673 : m === 32 ? 0.697 : m === 64 ? 0.709 : 0.7213 / (1 + 1.079 / m);
    let sum = 0;
    let zeros = 0;
    for (let i = 0; i < m; i++) {
      const r = this.registers[i];
      sum += 1 / 2 ** r;
      if (r === 0) zeros++;
    }
    let e = (alpha * m * m) / sum;
    if (e <= 2.5 * m && zeros > 0) e = m * Math.log(m / zeros); // linear counting
    else if (e > 2 ** 32 / 30) e = -(2 ** 32) * Math.log(1 - e / 2 ** 32);
    return Math.round(e);
  }
}
