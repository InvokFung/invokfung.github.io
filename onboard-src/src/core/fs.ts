// Fellegi-Sunter record linkage. A pair's comparison vector γ has one
// discrete level per field; m = P(level | match), u = P(level | non-match).
// Both are learned without labels by expectation-maximisation over the
// candidate pairs, grouped first into distinct patterns so each iteration
// touches a few thousand rows rather than every pair.

export interface FsParams {
  /** Prior share of matches among the pairs EM saw. */
  lambda: number;
  /** m[k][level] */
  m: number[][];
  /** u[k][level] */
  u: number[][];
}

export interface Patterns {
  K: number;
  /** Distinct comparison vectors, row-major (P × K). */
  gammas: Int8Array;
  counts: Float64Array;
  /** Pattern index of each input pair. */
  ofPair: Int32Array;
}

/** Groups identical comparison vectors. `gammas` is pairs × K. */
export function toPatterns(gammas: Int8Array, K: number): Patterns {
  const P = gammas.length / K;
  const index = new Map<number, number>();
  const uniq: number[] = [];
  const counts: number[] = [];
  const ofPair = new Int32Array(P);
  for (let p = 0; p < P; p++) {
    let key = 0;
    for (let k = 0; k < K; k++) key = key * 8 + (gammas[p * K + k] + 1);
    let id = index.get(key);
    if (id === undefined) {
      id = counts.length;
      index.set(key, id);
      counts.push(0);
      for (let k = 0; k < K; k++) uniq.push(gammas[p * K + k]);
    }
    counts[id]++;
    ofPair[p] = id;
  }
  return { K, gammas: Int8Array.from(uniq), counts: Float64Array.from(counts), ofPair };
}

const FLOOR = 1e-6;

function normalise(row: number[]): number[] {
  const s = row.reduce((a, b) => a + b, 0);
  return row.map((x) => Math.max(FLOOR, x / (s || 1)));
}

/** Starting m: most mass on the strongest agreement level. */
export function initialM(levels: number[]): number[][] {
  return levels.map((L) => normalise(Array.from({ length: L }, (_, l) => (l === L - 1 ? 0.05 : (L - l) ** 3))));
}

/** u from pairs drawn at random, which are almost all non-matches. */
export function estimateU(gammas: Int8Array, K: number, levels: number[]): number[][] {
  const counts = levels.map((L) => new Array<number>(L).fill(0.5)); // add-half smoothing
  const P = gammas.length / K;
  for (let p = 0; p < P; p++)
    for (let k = 0; k < K; k++) {
      const g = gammas[p * K + k];
      if (g >= 0) counts[k][g]++;
    }
  return counts.map(normalise);
}

export interface EmResult {
  params: FsParams;
  iterations: number;
  logLik: number[];
  converged: boolean;
}

export function em(pat: Patterns, init: FsParams, opts: { maxIter?: number; tol?: number; fixU?: boolean } = {}): EmResult {
  const { K, gammas, counts } = pat;
  const P = counts.length;
  const maxIter = opts.maxIter ?? 200;
  const tol = opts.tol ?? 1e-7;
  let { lambda } = init;
  let m = init.m.map((r) => [...r]);
  let u = init.u.map((r) => [...r]);
  const g = new Float64Array(P);
  const logLik: number[] = [];
  let converged = false;
  let it = 0;
  let total = 0;
  for (let p = 0; p < P; p++) total += counts[p];

  for (; it < maxIter; it++) {
    // E-step, in log space
    let ll = 0;
    const lm = m.map((r) => r.map(Math.log));
    const lu = u.map((r) => r.map(Math.log));
    const ll1 = Math.log(lambda);
    const ll0 = Math.log(1 - lambda);
    for (let p = 0; p < P; p++) {
      let a = ll1;
      let b = ll0;
      for (let k = 0; k < K; k++) {
        const lv = gammas[p * K + k];
        if (lv < 0) continue;
        a += lm[k][lv];
        b += lu[k][lv];
      }
      const mx = Math.max(a, b);
      const ea = Math.exp(a - mx);
      const eb = Math.exp(b - mx);
      g[p] = ea / (ea + eb);
      ll += counts[p] * (mx + Math.log(ea + eb));
    }
    logLik.push(ll);

    // M-step
    let sg = 0;
    for (let p = 0; p < P; p++) sg += counts[p] * g[p];
    lambda = Math.min(1 - 1e-9, Math.max(1e-9, sg / total));
    const mNum = m.map((r) => new Array<number>(r.length).fill(0));
    const uNum = u.map((r) => new Array<number>(r.length).fill(0));
    for (let p = 0; p < P; p++) {
      const c = counts[p];
      for (let k = 0; k < K; k++) {
        const lv = gammas[p * K + k];
        if (lv < 0) continue;
        mNum[k][lv] += c * g[p];
        uNum[k][lv] += c * (1 - g[p]);
      }
    }
    m = mNum.map(normalise);
    if (!opts.fixU) u = uNum.map(normalise);

    if (it > 0 && Math.abs(ll - logLik[it - 1]) < tol * Math.abs(ll)) {
      converged = true;
      it++;
      break;
    }
  }
  return { params: { lambda, m, u }, iterations: it, logLik, converged };
}

/** log2 Bayes factor of each level: positive is evidence for a match. m is floored at 0.001 so a level EM never saw among matches costs at most about 10 bits, not 20. */
export function levelWeights(params: FsParams): number[][] {
  return params.m.map((row, k) => row.map((mv, l) => Math.log2(Math.max(mv, 1e-3) / Math.max(params.u[k][l], 1e-6))));
}

/** Match weight of a comparison vector: prior log-odds plus the level weights of the fields present. */
export function matchWeight(weights: number[][], prior: number, gammas: Int8Array, offset: number, K: number): number {
  let w = prior;
  for (let k = 0; k < K; k++) {
    const lv = gammas[offset + k];
    if (lv >= 0) w += weights[k][lv];
  }
  return w;
}

export const probability = (weight: number) => 1 / (1 + 2 ** -weight);
