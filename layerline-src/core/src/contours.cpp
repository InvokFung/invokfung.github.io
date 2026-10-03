#include "contours.h"

namespace ll {

LayerPlan plan_layers(f64 zmax_um, i32 first_layer_um, i32 layer_um, Arena& a) {
  LayerPlan p;
  if (zmax_um <= 0 || first_layer_um <= 0 || layer_um <= 0) return p;
  // Count planes strictly below the top of the model.
  u32 n = 0;
  if ((f64)first_layer_um * 0.5 < zmax_um) {
    n = 1;
    f64 rest = zmax_um - first_layer_um;
    if (rest > -0.5 * layer_um) n += (u32)floor(rest / layer_um + 0.5);
    while (n > 1 && first_layer_um + (f64)(n - 1) * layer_um - 0.5 * layer_um >= zmax_um) n--;
  }
  p.count = n;
  p.top = a.alloc_array<i32>(n + 1);
  p.height = a.alloc_array<i32>(n + 1);
  p.plane = a.alloc_array<f64>(n + 1);
  for (u32 i = 0; i < n; i++) {
    p.height[i] = i == 0 ? first_layer_um : layer_um;
    p.top[i] = first_layer_um + (i32)i * layer_um;
    p.plane[i] = (f64)p.top[i] - 0.5 * p.height[i];
  }
  return p;
}

namespace {

/// Index of the first plane strictly above z (count when none is).
u32 first_plane_above(const LayerPlan& p, f64 z) {
  if (p.count == 0) return 0;
  f64 h = (f64)p.height[p.count > 1 ? 1 : 0];
  f64 est = (z - p.top[0]) / h + 1.5;
  i64 i = est < 0 ? 0 : (est > p.count ? p.count : (i64)est);
  while (i > 0 && p.plane[i - 1] > z) i--;
  while (i < (i64)p.count && p.plane[i] <= z) i++;
  return (u32)i;
}

inline void tri_z_range(const f32* t, f64* lo, f64* hi) {
  f64 a = (f64)t[2] * 1000.0, b = (f64)t[5] * 1000.0, c = (f64)t[8] * 1000.0;
  *lo = min(a, min(b, c));
  *hi = max(a, max(b, c));
}

}  // namespace

TriBuckets bucket_triangles(const Mesh& m, const LayerPlan& plan, Arena& a) {
  TriBuckets b;
  u32 L = plan.count;
  // Pass 1: a difference array of how many triangles reach each layer.
  i64* diff = a.alloc_array<i64>(L + 1);
  fill_bytes(diff, 0, sizeof(i64) * (L + 1));
  for (u32 t = 0; t < m.count; t++) {
    f64 lo, hi;
    tri_z_range(m.tris + t * 9, &lo, &hi);
    u32 first = first_plane_above(plan, lo);  // planes in (lo, hi] are crossed
    u32 last = first_plane_above(plan, hi);
    if (first >= last) continue;
    diff[first]++;
    diff[last]--;
  }
  b.start = a.alloc_array<u32>(L + 1);
  u32* cursor = a.alloc_array<u32>(L + 1);
  b.start[0] = 0;
  i64 run = 0;
  for (u32 i = 0; i < L; i++) {
    run += diff[i];
    b.start[i + 1] = b.start[i] + (u32)run;
    cursor[i] = b.start[i];
  }
  // Pass 2: drop each triangle into every layer it crosses.
  b.tris = a.alloc_array<u32>(b.start[L] + 1);
  for (u32 t = 0; t < m.count; t++) {
    f64 lo, hi;
    tri_z_range(m.tris + t * 9, &lo, &hi);
    u32 first = first_plane_above(plan, lo);
    u32 last = first_plane_above(plan, hi);
    for (u32 i = first; i < last; i++) b.tris[cursor[i]++] = t;
  }
  return b;
}

void intersect_layer(const Mesh& m, const TriBuckets& b, u32 layer, f64 plane, Vec<Segment>& out, Arena& a) {
  u32 from = b.start[layer], to = b.start[layer + 1];
  out.clear();
  out.reserve(a, to - from);
  for (u32 k = from; k < to; k++) {
    const f32* t = m.tris + b.tris[k] * 9;
    f64 x[3], y[3], z[3];
    bool below[3];
    for (int v = 0; v < 3; v++) {
      x[v] = (f64)t[v * 3] * 1000.0;
      y[v] = (f64)t[v * 3 + 1] * 1000.0;
      z[v] = (f64)t[v * 3 + 2] * 1000.0;
      below[v] = z[v] < plane;
    }
    // Walking the edges in winding order: the edge that goes from above to
    // below starts the segment, the one going from below to above ends it.
    IPoint start{0, 0}, end{0, 0};
    int found = 0;
    for (int e = 0; e < 3; e++) {
      int i = e, j = e == 2 ? 0 : e + 1;
      if (below[i] == below[j]) continue;
      int lo = below[i] ? i : j, hi = below[i] ? j : i;
      f64 s = (plane - z[lo]) / (z[hi] - z[lo]);
      IPoint p{round_i32(x[lo] + s * (x[hi] - x[lo])), round_i32(y[lo] + s * (y[hi] - y[lo]))};
      if (below[i]) {
        end = p;
      } else {
        start = p;
      }
      found++;
    }
    if (found == 2 && start != end) out.push(a, {start, end});
  }
}

// ---------------------------------------------------------------- stitching

namespace {

struct Chain {
  Path pts;  // starts of each segment, plus the final end point
  bool alive;
};

}  // namespace

Paths stitch(const Vec<Segment>& segs, bool repair, i32 closing_radius, Arena& out, Arena& scratch, StitchStats& st) {
  Paths loops;
  u32 n = segs.len;
  if (!n) return loops;
  ScratchScope scope(scratch);
  u32* next = scratch.alloc_array<u32>(n);
  u8* used = scratch.alloc_array<u8>(n);
  fill_bytes(used, 0, n);
  PointMap map;
  map.prepare(scratch, n);
  // Each map slot holds the head of a linked list of segments starting there.
  for (u32 i = 0; i < n; i++) {
    u32& head = map.upsert(pack_point(segs[i].a.x, segs[i].a.y));
    next[i] = head;
    head = i;
  }

  auto pick = [&](IPoint p, u32 cur, bool near) -> u32 {
    u32 best = PointMap::kNone;
    f64 best_turn = -10;
    for (i32 dx = near ? -1 : 0; dx <= (near ? 1 : 0); dx++)
      for (i32 dy = near ? -1 : 0; dy <= (near ? 1 : 0); dy++) {
        if (near && dx == 0 && dy == 0) continue;
        for (u32 c = map.find(pack_point(p.x + dx, p.y + dy)); c != PointMap::kNone; c = next[c]) {
          if (used[c]) continue;
          f64 t = turn_angle(segs[cur].a, segs[cur].b, segs[c].a, segs[c].b);
          if (t > best_turn) best_turn = t, best = c;
        }
      }
    return best;
  };

  Vec<Chain> open;
  for (u32 s = 0; s < n; s++) {
    if (used[s]) continue;
    used[s] = 1;
    Path path;
    path.reserve(out, 16);
    path.push(out, segs[s].a);
    IPoint first = segs[s].a;
    u32 cur = s;
    bool closed = false;
    for (;;) {
      IPoint p = segs[cur].b;
      // Close on an exact hit; prefer an exact continuation over closing
      // within one grid unit, so micro-segments where the plane grazes a
      // vertex are consumed rather than left behind.
      if (path.len >= 2 && p == first) {
        closed = true;
        break;
      }
      u32 c = pick(p, cur, false);
      i32 gx = p.x - first.x, gy = p.y - first.y;
      if (c == PointMap::kNone && path.len >= 2 && gx >= -1 && gx <= 1 && gy >= -1 && gy <= 1) {
        closed = true;
        break;
      }
      if (c == PointMap::kNone) c = pick(p, cur, true);
      if (c == PointMap::kNone) {
        path.push(out, p);
        break;
      }
      used[c] = 1;
      path.push(out, segs[c].a);
      cur = c;
    }
    if (closed) {
      if (path.len >= 3) {
        loops.push(out, path);
        st.closed++;
      }
    } else {
      st.open++;
      open.push(scratch, {path, true});
    }
  }

  if (!open.len) return loops;
  if (!repair || open.len > 4096) {
    st.dropped += open.len;
    return loops;
  }
  // Greedy gap closing: keep extending a chain with the chain whose start (or
  // end, taken reversed) is nearest to its end, until it closes on itself or
  // nothing is within the radius. Accepting reversed chains also mends meshes
  // with a few flipped triangles; build_islands fixes orientation afterwards.
  i64 r2 = (i64)closing_radius * closing_radius;
  for (u32 i = 0; i < open.len; i++) {
    if (!open[i].alive) continue;
    Chain& c = open[i];
    c.alive = false;
    u32 merged = 1;
    for (;;) {
      IPoint e = c.pts.back();
      i64 best = r2 + 1;
      u32 at = PointMap::kNone;
      bool flip = false;
      if (c.pts.len >= 3 && dist2(e, c.pts[0]) <= r2) best = dist2(e, c.pts[0]), at = i;
      for (u32 j = 0; j < open.len; j++) {
        if (!open[j].alive) continue;
        i64 d = dist2(e, open[j].pts[0]);
        if (d < best) best = d, at = j, flip = false;
        d = dist2(e, open[j].pts.back());
        if (d < best) best = d, at = j, flip = true;
      }
      if (at == PointMap::kNone) {
        st.dropped += merged;
        break;
      }
      if (at == i) {
        if (e == c.pts[0]) c.pts.pop();  // drop the duplicated closing vertex
        if (c.pts.len >= 3) {
          loops.push(out, c.pts);
          st.repaired += merged;
        } else {
          st.dropped += merged;
        }
        break;
      }
      Chain& d = open[at];
      d.alive = false;
      merged++;
      if (flip) reverse(d.pts);
      if (d.pts[0] == e) c.pts.pop();
      for (const IPoint& q : d.pts) c.pts.push(out, q);
    }
  }
  return loops;
}

// ---------------------------------------------------------------- islands

Vec<Island> build_islands(Paths& loops, i64 min_area2, Arena& out, Arena& scratch) {
  Vec<Island> islands;
  ScratchScope scope(scratch);
  struct Info {
    u32 loop;
    i64 area;  // |2A|
    BBox box;
    i32 island;  // island index if this loop is an outer boundary
    u32 depth;
  };
  Vec<Info> info;
  info.reserve(scratch, loops.len);
  for (u32 i = 0; i < loops.len; i++) {
    i64 a = area2(loops[i]);
    if (a < 0) a = -a;
    if (a < min_area2 || loops[i].len < 3) continue;
    info.push(scratch, {i, a, bbox(loops[i]), -1, 0});
  }
  // Largest first, so every container is visited before what it contains.
  sort(info.data, info.len, [](const Info& x, const Info& y) { return x.area > y.area; });
  for (u32 i = 0; i < info.len; i++) {
    Info& me = info[i];
    Path& path = loops[me.loop];
    IPoint probe = path[0];
    i32 parent = -1;
    u32 depth = 0;
    for (u32 j = 0; j < i; j++) {
      if (!info[j].box.contains(me.box)) continue;
      if (winding(probe, loops[info[j].loop]) != 0) {
        depth++;
        parent = (i32)j;  // later = smaller, so the last hit is the tightest container
      }
    }
    me.depth = depth;
    i64 signed_area = area2(path);
    if (depth % 2 == 0) {
      if (signed_area < 0) reverse(path);
      me.island = (i32)islands.len;
      Island isl;
      isl.outer = path;
      isl.box = me.box;
      islands.push(out, isl);
    } else {
      if (signed_area > 0) reverse(path);
      // The tightest container has depth - 1, which is even: an outer loop.
      i32 owner = parent >= 0 ? info[parent].island : -1;
      if (owner >= 0) islands[owner].holes.push(out, path);
    }
  }
  return islands;
}

}  // namespace ll
