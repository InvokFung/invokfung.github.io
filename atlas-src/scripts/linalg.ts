// Just enough dense/sparse linear algebra for a randomized truncated SVD
// (Halko, Martinsson & Tropp 2011). Matrices are row-major Float64Arrays.

export function rng(seed: number): () => number {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number): () => number {
  return () => {
    const u = 1 - rand();
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

export interface CSR {
  rows: number;
  cols: number;
  ptr: Uint32Array;
  idx: Uint32Array;
  val: Float64Array;
}

/** X (rows x cols, sparse) times M (cols x l) -> rows x l. */
export function mul(X: CSR, M: Float64Array, l: number): Float64Array {
  const out = new Float64Array(X.rows * l);
  for (let i = 0; i < X.rows; i++) {
    const o = i * l;
    for (let p = X.ptr[i]; p < X.ptr[i + 1]; p++) {
      const v = X.val[p];
      const m = X.idx[p] * l;
      for (let d = 0; d < l; d++) out[o + d] += v * M[m + d];
    }
  }
  return out;
}

/** Xᵀ (cols x rows) times M (rows x l) -> cols x l. */
export function mulT(X: CSR, M: Float64Array, l: number): Float64Array {
  const out = new Float64Array(X.cols * l);
  for (let i = 0; i < X.rows; i++) {
    const m = i * l;
    for (let p = X.ptr[i]; p < X.ptr[i + 1]; p++) {
      const v = X.val[p];
      const o = X.idx[p] * l;
      for (let d = 0; d < l; d++) out[o + d] += v * M[m + d];
    }
  }
  return out;
}

/** Orthonormalises the l columns of A (n x l) in place, modified Gram-Schmidt run twice. */
export function orthonormalize(A: Float64Array, n: number, l: number): Float64Array {
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < l; j++) {
      for (let i = 0; i < j; i++) {
        let dot = 0;
        for (let r = 0; r < n; r++) dot += A[r * l + i] * A[r * l + j];
        for (let r = 0; r < n; r++) A[r * l + j] -= dot * A[r * l + i];
      }
      let norm = 0;
      for (let r = 0; r < n; r++) norm += A[r * l + j] ** 2;
      norm = Math.sqrt(norm) || 1;
      for (let r = 0; r < n; r++) A[r * l + j] /= norm;
    }
  }
  return A;
}

/** Cyclic Jacobi eigendecomposition of a symmetric l x l matrix. Returns pairs sorted by eigenvalue, descending. */
export function symmetricEigen(S: Float64Array, l: number): { values: Float64Array; vectors: Float64Array } {
  const A = Float64Array.from(S);
  const E = new Float64Array(l * l);
  for (let i = 0; i < l; i++) E[i * l + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < l; p++) for (let q = p + 1; q < l; q++) off += A[p * l + q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < l; p++) {
      for (let q = p + 1; q < l; q++) {
        const apq = A[p * l + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (A[q * l + q] - A[p * l + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < l; k++) {
          const akp = A[k * l + p];
          const akq = A[k * l + q];
          A[k * l + p] = c * akp - s * akq;
          A[k * l + q] = s * akp + c * akq;
        }
        for (let k = 0; k < l; k++) {
          const apk = A[p * l + k];
          const aqk = A[q * l + k];
          A[p * l + k] = c * apk - s * aqk;
          A[q * l + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < l; k++) {
          const ekp = E[k * l + p];
          const ekq = E[k * l + q];
          E[k * l + p] = c * ekp - s * ekq;
          E[k * l + q] = s * ekp + c * ekq;
        }
      }
    }
  }
  const order = [...Array(l).keys()].sort((i, j) => A[j * l + j] - A[i * l + i]);
  const values = new Float64Array(l);
  const vectors = new Float64Array(l * l); // column j = eigenvector j
  order.forEach((src, j) => {
    values[j] = A[src * l + src];
    for (let r = 0; r < l; r++) vectors[r * l + j] = E[r * l + src];
  });
  return { values, vectors };
}

/**
 * Rank-k truncated SVD of a sparse matrix X ≈ U Σ Vᵀ.
 * Returns V (cols x k), the singular values, and XV = UΣ (rows x k).
 */
export function randomizedSVD(X: CSR, k: number, opts: { oversample?: number; powerIters?: number; seed?: number } = {}) {
  const l = k + (opts.oversample ?? 20);
  const g = gaussian(rng(opts.seed ?? 42));
  const omega = new Float64Array(X.cols * l).map(() => g());
  let Q = orthonormalize(mul(X, omega, l), X.rows, l);
  for (let it = 0; it < (opts.powerIters ?? 4); it++) {
    const Z = orthonormalize(mulT(X, Q, l), X.cols, l);
    Q = orthonormalize(mul(X, Z, l), X.rows, l);
  }
  // Bᵀ = XᵀQ (cols x l); BBᵀ = (Bᵀ)ᵀ Bᵀ is small (l x l).
  const Bt = mulT(X, Q, l);
  const S = new Float64Array(l * l);
  for (let r = 0; r < X.cols; r++) {
    const o = r * l;
    for (let i = 0; i < l; i++) {
      const v = Bt[o + i];
      if (v === 0) continue;
      for (let j = i; j < l; j++) S[i * l + j] += v * Bt[o + j];
    }
  }
  for (let i = 0; i < l; i++) for (let j = 0; j < i; j++) S[i * l + j] = S[j * l + i];
  const { values, vectors } = symmetricEigen(S, l);
  const sigma = new Float64Array(k);
  const V = new Float64Array(X.cols * k);
  for (let j = 0; j < k; j++) {
    sigma[j] = Math.sqrt(Math.max(values[j], 0));
    const inv = sigma[j] > 0 ? 1 / sigma[j] : 0;
    // v_j = Bᵀ u_j / σ_j
    for (let r = 0; r < X.cols; r++) {
      let s = 0;
      const o = r * l;
      for (let i = 0; i < l; i++) s += Bt[o + i] * vectors[i * l + j];
      V[r * k + j] = s * inv;
    }
  }
  return { V, sigma, XV: mul(X, V, k) };
}
