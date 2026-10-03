// A straightforward TypeScript implementation of stage 1 (triangle-plane
// intersection + segment stitching), written the way one would by default in
// TypeScript: arrays of arrays, small objects and a Map keyed by strings.
//
// It runs the same algorithm as core/src/contours.cpp (same bucketing, same
// interpolation order, same rounding, same leftmost-turn rule), so it must
// produce identical loop and point counts. That makes the benchmark a
// comparison of runtime and data layout, not of algorithms.

export interface ContourCounts {
  layers: number;
  segments: number;
  loops: number;
  points: number;
}

interface Pt {
  x: number;
  y: number;
}
interface Seg {
  a: Pt;
  b: Pt;
}

const roundI = (v: number) => Math.floor(v + 0.5);

function pseudoAngle(x: number, y: number) {
  const s = Math.abs(x) + Math.abs(y);
  if (s === 0) return 0;
  const p = y / s;
  return x < 0 ? 2 - p : y < 0 ? 4 + p : p;
}

function turn(s: Seg, t: Seg) {
  const ax = s.b.x - s.a.x,
    ay = s.b.y - s.a.y;
  const bx = t.b.x - t.a.x,
    by = t.b.y - t.a.y;
  const a = pseudoAngle(ax * bx + ay * by, ax * by - ay * bx);
  return a >= 2 ? a - 4 : a;
}

export function sliceContoursTS(positions: Float32Array, layerHeightMm: number): ContourCounts {
  const layerUm = roundI(layerHeightMm * 1000);
  const tris = positions.length / 9;
  let zmax = 0;
  for (let i = 2; i < positions.length; i += 3) zmax = Math.max(zmax, positions[i] * 1000);

  // Layer plan: same count rule as plan_layers().
  let count = 0;
  if (layerUm * 0.5 < zmax) {
    count = 1;
    const rest = zmax - layerUm;
    if (rest > -0.5 * layerUm) count += Math.floor(rest / layerUm + 0.5);
    while (count > 1 && layerUm + (count - 1) * layerUm - 0.5 * layerUm >= zmax) count--;
  }
  const planes: number[] = [];
  for (let i = 0; i < count; i++) planes.push(layerUm + i * layerUm - 0.5 * layerUm);
  const firstAbove = (z: number) => {
    let i = Math.min(count, Math.max(0, Math.trunc((z - layerUm) / layerUm + 1.5)));
    while (i > 0 && planes[i - 1] > z) i--;
    while (i < count && planes[i] <= z) i++;
    return i;
  };

  const buckets: number[][] = planes.map(() => []);
  for (let t = 0; t < tris; t++) {
    const o = t * 9;
    const za = positions[o + 2] * 1000,
      zb = positions[o + 5] * 1000,
      zc = positions[o + 8] * 1000;
    const first = firstAbove(Math.min(za, zb, zc));
    const last = firstAbove(Math.max(za, zb, zc));
    for (let i = first; i < last; i++) buckets[i].push(t);
  }

  const out: ContourCounts = { layers: count, segments: 0, loops: 0, points: 0 };
  for (let layer = 0; layer < count; layer++) {
    const plane = planes[layer];
    const segs: Seg[] = [];
    for (const t of buckets[layer]) {
      const o = t * 9;
      const v = [0, 1, 2].map((k) => ({ x: positions[o + k * 3] * 1000, y: positions[o + k * 3 + 1] * 1000, z: positions[o + k * 3 + 2] * 1000 }));
      const below = v.map((p) => p.z < plane);
      let start: Pt | null = null,
        end: Pt | null = null;
      for (let e = 0; e < 3; e++) {
        const i = e,
          j = (e + 1) % 3;
        if (below[i] === below[j]) continue;
        const lo = below[i] ? v[i] : v[j],
          hi = below[i] ? v[j] : v[i];
        const s = (plane - lo.z) / (hi.z - lo.z);
        const p = { x: roundI(lo.x + s * (hi.x - lo.x)), y: roundI(lo.y + s * (hi.y - lo.y)) };
        if (below[i]) end = p;
        else start = p;
      }
      if (start && end && (start.x !== end.x || start.y !== end.y)) segs.push({ a: start, b: end });
    }
    out.segments += segs.length;

    // Stitch: segments by start point, then walk end -> start.
    const byStart = new Map<string, number[]>();
    segs.forEach((s, i) => {
      const k = `${s.a.x},${s.a.y}`;
      const list = byStart.get(k);
      if (list) list.push(i);
      else byStart.set(k, [i]);
    });
    const used = new Array<boolean>(segs.length).fill(false);
    const pick = (p: Pt, cur: number, near: boolean) => {
      let best = -1,
        bestTurn = -10;
      for (let dx = near ? -1 : 0; dx <= (near ? 1 : 0); dx++)
        for (let dy = near ? -1 : 0; dy <= (near ? 1 : 0); dy++) {
          if (near && dx === 0 && dy === 0) continue;
          const list = byStart.get(`${p.x + dx},${p.y + dy}`) ?? [];
          // Newest first, like the linked lists in the C++ hash.
          for (let k = list.length - 1; k >= 0; k--) {
            const c = list[k];
            if (used[c]) continue;
            const t = turn(segs[cur], segs[c]);
            if (t > bestTurn) {
              bestTurn = t;
              best = c;
            }
          }
        }
      return best;
    };
    for (let s = 0; s < segs.length; s++) {
      if (used[s]) continue;
      used[s] = true;
      const path: Pt[] = [segs[s].a];
      const first = segs[s].a;
      let cur = s;
      let closed = false;
      for (;;) {
        const p = segs[cur].b;
        if (path.length >= 2 && p.x === first.x && p.y === first.y) {
          closed = true;
          break;
        }
        let c = pick(p, cur, false);
        if (c < 0 && path.length >= 2 && Math.abs(p.x - first.x) <= 1 && Math.abs(p.y - first.y) <= 1) {
          closed = true;
          break;
        }
        if (c < 0) c = pick(p, cur, true);
        if (c < 0) break;
        used[c] = true;
        path.push(segs[c].a);
        cur = c;
      }
      if (closed && path.length >= 3) {
        out.loops++;
        out.points += path.length;
      }
    }
  }
  return out;
}
