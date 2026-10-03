#include "polyops.h"
#include "contours.h"

// Opt-in phase timers for clip(): build with -DLL_PROFILE and read
// ll::g_clip_ms (edges, splits, sub-edges, grouping, queries, stitching).
#ifdef LL_PROFILE
namespace ll {
f64 g_clip_ms[6];
f64 g_clip_n[6];  // edges, splits, sub-edges, queries, active edges scanned, calls
}
#define LL_PHASE_START f64 phase_t0_ = platform::now_ms()
#define LL_PHASE(i)                     \
  do {                                  \
    f64 now_ = platform::now_ms();      \
    g_clip_ms[i] += now_ - phase_t0_;   \
    phase_t0_ = now_;                   \
  } while (0)
#else
#define LL_PHASE_START ((void)0)
#define LL_PHASE(i) ((void)0)
#endif

namespace ll {

// ---------------------------------------------------------------- offset

Paths offset_raw(const Paths& in, f64 delta, f64 miter_limit, Arena& out) {
  Paths res;
  if (miter_limit < 1) miter_limit = 1;
  f64 limit2 = miter_limit * miter_limit;
  f64 ad = fabs(delta);
  for (const Path& src : in) {
    u32 n = src.len;
    if (n < 3) continue;
    Path dst;
    dst.reserve(out, n + n / 4 + 4);
    for (u32 i = 0; i < n; i++) {
      IPoint p = src[i], a = src[i == 0 ? n - 1 : i - 1], b = src[i + 1 == n ? 0 : i + 1];
      f64 d1x = (f64)p.x - a.x, d1y = (f64)p.y - a.y;
      f64 d2x = (f64)b.x - p.x, d2y = (f64)b.y - p.y;
      f64 l1 = sqrt(d1x * d1x + d1y * d1y), l2 = sqrt(d2x * d2x + d2y * d2y);
      if (l1 == 0 || l2 == 0) continue;  // duplicate vertex
      d1x /= l1, d1y /= l1, d2x /= l2, d2y /= l2;
      f64 n1x = -d1y, n1y = d1x, n2x = -d2y, n2y = d2x;  // left normals
      f64 turn = d1x * d2y - d1y * d2x;                  // > 0: left turn
      f64 k = 1 + n1x * n2x + n1y * n2y;                 // 1 + cos(angle between normals)
      bool outside = turn * delta < 0;
      f64 px = p.x, py = p.y;
      if (k > 1e-12) {
        f64 ratio2 = 2 / k;  // (miter length / delta)^2
        if ((outside && ratio2 <= limit2) || (!outside && ratio2 <= 2500)) {
          dst.push(out, {round_i32(px + delta * (n1x + n2x) / k), round_i32(py + delta * (n1y + n2y) / k)});
          continue;
        }
      }
      if (!outside) {
        // Inside a near-reversal: a bevel; resolve removes the overlap later.
        dst.push(out, {round_i32(px + delta * n1x), round_i32(py + delta * n1y)});
        dst.push(out, {round_i32(px + delta * n2x), round_i32(py + delta * n2y)});
        continue;
      }
      // Square join: cut the miter with a line |delta| away from the corner,
      // perpendicular to the bisector m (which points to the offset side).
      f64 mx = delta * (n1x + n2x), my = delta * (n1y + n2y);
      f64 ml = sqrt(mx * mx + my * my);
      if (ml < 1e-9) {
        mx = d1x, my = d1y;  // U-turn: cap straight ahead
      } else {
        mx /= ml, my /= ml;
      }
      f64 c1 = d1x * mx + d1y * my, c2 = d2x * mx + d2y * my;
      if (fabs(c1) < 1e-9 || fabs(c2) < 1e-9) {
        dst.push(out, {round_i32(px + delta * n1x), round_i32(py + delta * n1y)});
        dst.push(out, {round_i32(px + delta * n2x), round_i32(py + delta * n2y)});
        continue;
      }
      f64 t = (ad - delta * (n1x * mx + n1y * my)) / c1;
      f64 s = (ad - delta * (n2x * mx + n2y * my)) / c2;
      dst.push(out, {round_i32(px + delta * n1x + t * d1x), round_i32(py + delta * n1y + t * d1y)});
      dst.push(out, {round_i32(px + delta * n2x + s * d2x), round_i32(py + delta * n2y + s * d2y)});
    }
    if (dst.len >= 3) res.push(out, dst);
  }
  return res;
}

// ---------------------------------------------------------------- clip

namespace {

struct Edge {
  IPoint a, b;
  u32 set;
};

struct Split {
  u32 edge;
  f64 t;  // position along the edge (projection, unnormalised)
  IPoint p;
};

/// A uniform grid of cells, each listing the edges that pass through it.
struct EdgeGrid {
  i64 ox, oy, cell;
  u32 nx, ny;
  u32* start;  // CSR over cells
  u32* items;

  u32 cx(f64 x) const { return (u32)clamp<i64>((i64)floor((x - ox) / cell), 0, nx - 1); }
  u32 cy(f64 y) const { return (u32)clamp<i64>((i64)floor((y - oy) / cell), 0, ny - 1); }

  /// Calls f(cell index) for every cell holding a point within `margin` of
  /// the edge: row by row, the x range the edge covers over the row's y range
  /// (widened by the margin), widened by the margin again in x.
  template <class F> void cover(const Edge& e, f64 margin, F&& f) const {
    f64 x0 = e.a.x, y0 = e.a.y, x1 = e.b.x, y1 = e.b.y;
    f64 ylo = min(y0, y1), yhi = max(y0, y1);
    u32 r0 = cy(ylo - margin), r1 = cy(yhi + margin);
    f64 dy = y1 - y0;
    for (u32 r = r0; r <= r1; r++) {
      f64 lo = max(ylo, (f64)(oy + (i64)r * cell) - margin), hi = min(yhi, (f64)(oy + (i64)(r + 1) * cell) + margin);
      f64 xa, xb;
      if (dy == 0) {
        xa = min(x0, x1), xb = max(x0, x1);
      } else {
        f64 ta = clamp((lo - y0) / dy, 0.0, 1.0), tb = clamp((hi - y0) / dy, 0.0, 1.0);
        xa = x0 + ta * (x1 - x0), xb = x0 + tb * (x1 - x0);
        if (xa > xb) swap(xa, xb);
      }
      u32 c0 = cx(xa - margin), c1 = cx(xb + margin);
      for (u32 c = c0; c <= c1; c++) f(r * nx + c);
    }
  }

  void build(const Vec<Edge>& edges, const BBox& box, f64 margin, Arena& a) {
    u32 n = edges.len;
    i64 w = (i64)box.x1 - box.x0 + 1, h = (i64)box.y1 - box.y0 + 1;
    f64 area = (f64)w * (f64)h;
    cell = (i64)sqrt(area / (f64)(n ? n : 1) * 2.0);
    if (cell < 64) cell = 64;
    while ((w / cell + 1) * (h / cell + 1) > 4 * (i64)n + 64) cell *= 2;
    ox = box.x0 - 1, oy = box.y0 - 1;
    nx = (u32)(w / cell + 1), ny = (u32)(h / cell + 1);
    u32 cells = nx * ny;
    start = a.alloc_array<u32>(cells + 1);
    fill_bytes(start, 0, sizeof(u32) * (cells + 1));
    for (u32 i = 0; i < n; i++) cover(edges[i], margin, [&](u32 c) { start[c + 1]++; });
    for (u32 c = 0; c < cells; c++) start[c + 1] += start[c];
    items = a.alloc_array<u32>(start[cells] + 1);
    u32* cur = a.alloc_array<u32>(cells);
    copy_bytes(cur, start, sizeof(u32) * cells);
    for (u32 i = 0; i < n; i++) cover(edges[i], margin, [&](u32 c) { items[cur[c]++] = i; });
  }
};

inline bool strictly_inside(IPoint p, IPoint a, IPoint b) {
  // p is known to be collinear with ab.
  return dot(a, p, b) > 0 && dot(b, p, a) > 0;
}

}  // namespace

void clip(const Paths* const* sets, u32 nsets, const ClipOut* outs, u32 nouts, Arena& out, Arena& scratch) {
  for (u32 o = 0; o < nouts; o++) outs[o].result->clear();
  if (nsets == 0 || nsets > 16) return;
  ScratchScope scope(scratch);
  LL_PHASE_START;

  // 1. Edges of every set.
  Vec<Edge> edges;
  BBox box;
  u32 total = 0;
  for (u32 s = 0; s < nsets; s++)
    for (const Path& p : *sets[s]) total += p.len;
  edges.reserve(scratch, total + 1);
  for (u32 s = 0; s < nsets; s++)
    for (const Path& p : *sets[s]) {
      if (p.len < 3) continue;
      for (u32 i = 0, j = p.len - 1; i < p.len; j = i++) {
        if (p[j] == p[i]) continue;
        edges.push(scratch, {p[j], p[i], s});
        box.add(p[i]);
      }
    }
  if (!edges.len) return;

  LL_PHASE(0);
  // 2. Split points from every pair of edges that cross or touch. A pair is
  // handled only in the grid cell that contains the event point, so it is
  // never processed twice even though both edges sit in several cells.
  EdgeGrid grid;
  grid.build(edges, box, 1.0, scratch);
  Vec<Split> splits;
  auto split_at = [&](u32 e, IPoint p) {
    const Edge& E = edges[e];
    if (p == E.a || p == E.b) return;
    f64 t = (f64)dot(E.a, p, E.b);
    splits.push(scratch, {e, t, p});
  };
  u32 cells = grid.nx * grid.ny;
  for (u32 c = 0; c < cells; c++) {
    u32 from = grid.start[c], to = grid.start[c + 1];
    for (u32 u = from; u < to; u++) {
      u32 i = grid.items[u];
      const Edge& A = edges[i];
      i32 ax0 = min(A.a.x, A.b.x), ax1 = max(A.a.x, A.b.x), ay0 = min(A.a.y, A.b.y), ay1 = max(A.a.y, A.b.y);
      for (u32 v = u + 1; v < to; v++) {
        u32 j = grid.items[v];
        const Edge& B = edges[j];
        if (max(B.a.x, B.b.x) < ax0 || min(B.a.x, B.b.x) > ax1 || max(B.a.y, B.b.y) < ay0 || min(B.a.y, B.b.y) > ay1) continue;
        i64 d1 = cross(A.a, A.b, B.a), d2 = cross(A.a, A.b, B.b);
        if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0)) continue;  // B strictly on one side of A
        i64 d3 = cross(B.a, B.b, A.a), d4 = cross(B.a, B.b, A.b);
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
          f64 t = (f64)d3 / ((f64)d3 - (f64)d4);
          f64 x = A.a.x + t * ((f64)A.b.x - A.a.x), y = A.a.y + t * ((f64)A.b.y - A.a.y);
          if (grid.cy(y) * grid.nx + grid.cx(x) != c) continue;
          IPoint p{round_i32(x), round_i32(y)};
          split_at(i, p);
          split_at(j, p);
          continue;
        }
        auto touch = [&](IPoint p, u32 e, IPoint a, IPoint b) {
          if (strictly_inside(p, a, b) && grid.cy(p.y) * grid.nx + grid.cx(p.x) == c) split_at(e, p);
        };
        if (d1 == 0) touch(B.a, i, A.a, A.b);
        if (d2 == 0) touch(B.b, i, A.a, A.b);
        if (d3 == 0) touch(A.a, j, B.a, B.b);
        if (d4 == 0) touch(A.b, j, B.a, B.b);
      }
    }
  }

  LL_PHASE(1);
  // 3. Sub-edges: each edge cut at its sorted split points.
  sort(splits.data, splits.len, [](const Split& x, const Split& y) { return x.edge != y.edge ? x.edge < y.edge : x.t < y.t; });
  Vec<Edge> subs;
  subs.reserve(scratch, edges.len + splits.len + 1);
  for (u32 e = 0, k = 0; e < edges.len; e++) {
    IPoint from = edges[e].a;
    for (; k < splits.len && splits[k].edge == e; k++) {
      if (splits[k].p == from) continue;
      subs.push(scratch, {from, splits[k].p, edges[e].set});
      from = splits[k].p;
    }
    if (from != edges[e].b) subs.push(scratch, {from, edges[e].b, edges[e].set});
  }

  LL_PHASE(2);
  // 4. Winding numbers. Geometrically identical sub-edges (from different
  // sets, or from both sides of a shared boundary) are grouped and share one
  // query: a ray from just right of the segment gives every set's winding
  // there, and crossing the segment to its left adds +1 for each member that
  // runs in the group's direction and -1 for each that runs against it.
  auto before = [](IPoint p, IPoint q) { return p.x != q.x ? p.x < q.x : p.y < q.y; };
  struct Canon {
    IPoint a, b;  // a before b
    i32 sign;     // +1 if the sub-edge runs a -> b
    u32 set;
  };
  Vec<Canon> canon;
  canon.resize(scratch, subs.len);
  for (u32 i = 0; i < subs.len; i++) {
    const Edge& e = subs[i];
    bool fwd = before(e.a, e.b);
    canon[i] = {fwd ? e.a : e.b, fwd ? e.b : e.a, fwd ? 1 : -1, e.set};
  }
  sort(canon.data, canon.len, [&](const Canon& x, const Canon& y) {
    if (x.a != y.a) return before(x.a, y.a);
    if (x.b != y.b) return before(x.b, y.b);
    return x.set < y.set;
  });
  // One query point per group, just right of the segment's midpoint. The
  // queries are answered by a sweep in y: edges enter an active list when the
  // sweep reaches their lower end and leave once it passes their upper end, so
  // a query scans only the edges that actually cross its scanline.
  struct Query {
    f64 x, y;
    u32 g0, g1;  // the group's range in `canon`
  };
  Vec<Query> qs;
  const f64 eps = 0.25;
  for (u32 g = 0; g < canon.len;) {
    u32 h = g;
    while (h < canon.len && canon[h].a == canon[g].a && canon[h].b == canon[g].b) h++;
    IPoint A = canon[g].a, B = canon[g].b;
    f64 dx = (f64)B.x - A.x, dy = (f64)B.y - A.y;
    f64 l = sqrt(dx * dx + dy * dy);
    qs.push(scratch, {0.5 * ((f64)A.x + B.x) + dy / l * eps, 0.5 * ((f64)A.y + B.y) - dx / l * eps, g, h});
    g = h;
  }
  sort(qs.data, qs.len, [](const Query& p, const Query& q) { return p.y != q.y ? p.y < q.y : p.g0 < q.g0; });
  // Sweep records: endpoints ordered by y, the inverse slope, and +1 / -1 for
  // an edge running up / down. Horizontal edges never cross a scanline.
  struct SweepEdge {
    f64 ylo, yhi, xlo, dxdy;
    i32 dir;
    u32 set;
  };
  Vec<SweepEdge> sweep;
  sweep.reserve(scratch, subs.len);
  for (const Edge& e : subs) {
    if (e.a.y == e.b.y) continue;
    bool up = e.a.y < e.b.y;
    IPoint lo = up ? e.a : e.b, hi = up ? e.b : e.a;
    sweep.push(scratch, {(f64)lo.y, (f64)hi.y, (f64)lo.x, ((f64)hi.x - lo.x) / ((f64)hi.y - lo.y), up ? 1 : -1, e.set});
  }
  sort(sweep.data, sweep.len, [](const SweepEdge& p, const SweepEdge& q) { return p.ylo < q.ylo; });
  Vec<SweepEdge> active;
  active.reserve(scratch, 64);
  u32 next = 0;
  u32 all = (1u << nsets) - 1;
  i32 wr[16];
  Vec<Segment>* kept = scratch.alloc_array<Vec<Segment>>(nouts);
  for (u32 o = 0; o < nouts; o++) kept[o] = Vec<Segment>{};
  LL_PHASE(3);
#ifdef LL_PROFILE
  g_clip_n[0] += edges.len, g_clip_n[1] += splits.len, g_clip_n[2] += subs.len, g_clip_n[3] += qs.len, g_clip_n[5] += 1;
#endif
  for (const Query& q : qs) {
    while (next < sweep.len && sweep[next].ylo <= q.y) active.push(scratch, sweep[next++]);
    for (u32 s = 0; s < nsets; s++) wr[s] = 0;
#ifdef LL_PROFILE
    g_clip_n[4] += active.len;
#endif
    // Winding number with half-open edges (ylo <= y < yhi): an edge counts
    // when it crosses the ray from the query point towards +x.
    for (u32 k = 0; k < active.len;) {
      const SweepEdge& e = active[k];
      if (e.yhi <= q.y) {  // finished: queries only move up
        active[k] = active.back();
        active.pop();
        continue;
      }
      f64 x = e.xlo + (q.y - e.ylo) * e.dxdy;
      wr[e.set] += x > q.x ? e.dir : 0;
      k++;
    }
    u32 right = 0, left = 0;
    for (u32 s = 0; s < nsets; s++)
      if (wr[s] >= 1) right |= 1u << s;
    for (u32 k = q.g0; k < q.g1; k++) wr[canon[k].set] += canon[k].sign;
    for (u32 s = 0; s < nsets; s++)
      if (wr[s] >= 1) left |= 1u << s;
    if (left == right) continue;
    IPoint A = canon[q.g0].a, B = canon[q.g0].b;
    for (u32 o = 0; o < nouts; o++) {
      bool fl = outs[o].rule(left, all), fr = outs[o].rule(right, all);
      if (fl && !fr) kept[o].push(scratch, {A, B});
      else if (!fl && fr) kept[o].push(scratch, {B, A});
    }
  }

  LL_PHASE(4);
  // 5. Stitch the kept edges (one per group, so no duplicates) into loops.
  for (u32 o = 0; o < nouts; o++) {
    Vec<Segment>& k = kept[o];
    StitchStats st;
    Paths loops = stitch(k, false, 0, out, scratch, st);
    Paths& dst = *outs[o].result;
    for (Path& p : loops) {
      remove_collinear(p);
      if (p.len >= 3) dst.push(out, p);
    }
  }
  LL_PHASE(5);
}

namespace {
bool rule_any(u32 m, u32) { return m != 0; }
bool rule_all(u32 m, u32 all) { return m == all; }
bool rule_first_only(u32 m, u32) { return m == 1; }
}  // namespace

Paths resolve(const Paths& p, Arena& out, Arena& scratch) {
  Paths r;
  const Paths* sets[1] = {&p};
  ClipOut o{rule_any, &r};
  clip(sets, 1, &o, 1, out, scratch);
  return r;
}

Paths intersection(const Paths& a, const Paths& b, Arena& out, Arena& scratch) {
  Paths r;
  const Paths* sets[2] = {&a, &b};
  ClipOut o{rule_all, &r};
  clip(sets, 2, &o, 1, out, scratch);
  return r;
}

Paths difference(const Paths& a, const Paths& b, Arena& out, Arena& scratch) {
  Paths r;
  const Paths* sets[2] = {&a, &b};
  ClipOut o{rule_first_only, &r};
  clip(sets, 2, &o, 1, out, scratch);
  return r;
}

Paths inset(const Paths& loops, f64 delta, f64 miter_limit, i64 min_area2, Arena& out, Arena& scratch) {
  Paths res;
  {
    ScratchScope scope(scratch);
    Paths raw = offset_raw(loops, delta, miter_limit, scratch);
    // The resolved loops must outlive the scratch scope, so they go to `out`.
    res = resolve(raw, out, scratch);
  }
  u32 w = 0;
  for (u32 i = 0; i < res.len; i++) {
    i64 a = area2(res[i]);
    if (a < 0) a = -a;
    if (a >= min_area2) res[w++] = res[i];
  }
  res.len = w;
  return res;
}

namespace {
/// Every vertex of `a` lies within `eps` of some edge of `b`.
bool vertices_near(const Paths& a, const Paths& b, i32 eps, Arena& scratch) {
  ScratchScope scope(scratch);
  Vec<Edge> edges;
  BBox box;
  for (const Path& p : b)
    for (u32 i = 0, j = p.len - 1; i < p.len; j = i++) {
      edges.push(scratch, {p[j], p[i], 0});
      box.add(p[i]);
    }
  if (!edges.len) return false;
  EdgeGrid grid;
  grid.build(edges, box, eps + 1.0, scratch);
  f64 e2 = (f64)eps * eps;
  for (const Path& p : a)
    for (const IPoint& q : p) {
      if (q.x < box.x0 - eps || q.x > box.x1 + eps || q.y < box.y0 - eps || q.y > box.y1 + eps) return false;
      u32 c = grid.cy(q.y) * grid.nx + grid.cx(q.x);
      bool hit = false;
      for (u32 k = grid.start[c]; k < grid.start[c + 1] && !hit; k++) {
        const Edge& e = edges[grid.items[k]];
        f64 vx = (f64)e.b.x - e.a.x, vy = (f64)e.b.y - e.a.y, wx = (f64)q.x - e.a.x, wy = (f64)q.y - e.a.y;
        f64 l2 = vx * vx + vy * vy;
        f64 t = l2 > 0 ? clamp((wx * vx + wy * vy) / l2, 0.0, 1.0) : 0;
        f64 dx = wx - t * vx, dy = wy - t * vy;
        hit = dx * dx + dy * dy <= e2;
      }
      if (!hit) return false;
    }
  return true;
}
}  // namespace

bool similar(const Paths& a, const Paths& b, i32 eps, Arena& scratch) {
  if (a.len != b.len) return false;
  if (same_paths(a, b)) return true;
  return vertices_near(a, b, eps, scratch) && vertices_near(b, a, eps, scratch);
}

Paths copy_paths(const Paths& p, Arena& out) {
  Paths r;
  r.reserve(out, p.len);
  for (const Path& src : p) {
    Path d;
    d.resize(out, src.len);
    copy_bytes(d.data, src.data, sizeof(IPoint) * src.len);
    r.push(out, d);
  }
  return r;
}

f64 region_area(const Paths& p) {
  f64 a = 0;
  for (const Path& q : p) a += (f64)area2(q) * 0.5;
  return a;
}

}  // namespace ll
