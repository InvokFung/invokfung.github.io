#include "geometry.h"

namespace ll {

i64 area2(const Path& p) {
  i64 a = 0;
  for (u32 i = 0, j = p.len - 1; i < p.len; j = i++) a += (i64)p[j].x * p[i].y - (i64)p[i].x * p[j].y;
  return a;
}

BBox bbox(const Path& p) {
  BBox b;
  for (const IPoint& q : p) b.add(q);
  return b;
}

f64 length(const Path& p, bool closed) {
  f64 l = 0;
  for (u32 i = 1; i < p.len; i++) l += dist(p[i - 1], p[i]);
  if (closed && p.len > 1) l += dist(p.back(), p[0]);
  return l;
}

void reverse(Path& p) {
  for (u32 i = 0, j = p.len - 1; i < j; i++, j--) swap(p[i], p[j]);
}

i32 winding(IPoint p, const Path& path) {
  // Sunday's crossing rule with half-open edges, so a vertex shared by two
  // edges is counted exactly once.
  i32 w = 0;
  for (u32 i = 0, j = path.len - 1; i < path.len; j = i++) {
    IPoint a = path[j], b = path[i];
    if (a.y <= p.y) {
      if (b.y > p.y && cross(a, b, p) > 0) w++;
    } else if (b.y <= p.y && cross(a, b, p) < 0) {
      w--;
    }
  }
  return w;
}

namespace {
/// Squared distance from p to segment ab, in double.
f64 seg_dist2(IPoint p, IPoint a, IPoint b) {
  f64 vx = (f64)b.x - a.x, vy = (f64)b.y - a.y;
  f64 wx = (f64)p.x - a.x, wy = (f64)p.y - a.y;
  f64 l2 = vx * vx + vy * vy;
  f64 t = l2 > 0 ? (wx * vx + wy * vy) / l2 : 0;
  t = clamp(t, 0.0, 1.0);
  f64 dx = wx - t * vx, dy = wy - t * vy;
  return dx * dx + dy * dy;
}
}  // namespace

void remove_collinear(Path& p) {
  if (p.len < 3) return;
  // Repeat until stable: removing one vertex can make its neighbour collinear.
  for (bool changed = true; changed && p.len >= 3;) {
    changed = false;
    u32 out = 0;
    for (u32 i = 0; i < p.len; i++) {
      IPoint prev = out ? p[out - 1] : p[p.len - 1];
      IPoint cur = p[i];
      IPoint next = p[(i + 1) % p.len];
      // Collinear covers both a straight pass-through and a zero-width spike.
      if (cur == prev || cross(prev, cur, next) == 0) {
        changed = true;
        continue;
      }
      p[out++] = cur;
    }
    p.len = out;
  }
}

void simplify_closed(Path& p, f64 tolerance, Arena& scratch) {
  if (p.len < 4 || tolerance <= 0) return remove_collinear(p);
  ScratchScope scope(scratch);
  u32 n = p.len;
  // Start the loop at its lowest-then-leftmost vertex: a corner of the convex
  // hull, never a collinear midpoint, so the anchor (and the result) does not
  // depend on where the stitcher happened to start. Prismatic layers then
  // simplify to bit-identical loops.
  u32 anchor = 0;
  for (u32 i = 1; i < n; i++)
    if (p[i].y < p[anchor].y || (p[i].y == p[anchor].y && p[i].x < p[anchor].x)) anchor = i;
  if (anchor) {
    IPoint* tmp = scratch.alloc_array<IPoint>(n);
    for (u32 i = 0; i < n; i++) tmp[i] = p[(anchor + i) % n];
    copy_bytes(p.data, tmp, sizeof(IPoint) * n);
  }
  u8* keep = scratch.alloc_array<u8>(n);
  fill_bytes(keep, 0, n);
  // Split the loop at vertex 0 and the vertex farthest from it.
  u32 far = 0;
  i64 best = -1;
  for (u32 i = 1; i < n; i++) {
    i64 d = dist2(p[0], p[i]);
    if (d > best) best = d, far = i;
  }
  keep[0] = keep[far] = 1;
  struct Span {
    u32 a, b;  // indices into the loop, b may equal n (meaning vertex 0)
  };
  Span* stack = scratch.alloc_array<Span>(n + 2);
  u32 sp = 0;
  stack[sp++] = {0, far};
  stack[sp++] = {far, n};
  f64 tol2 = tolerance * tolerance;
  while (sp) {
    Span s = stack[--sp];
    IPoint a = p[s.a], b = p[s.b % n];
    f64 worst = -1;
    u32 at = 0;
    for (u32 i = s.a + 1; i < s.b; i++) {
      f64 d = seg_dist2(p[i], a, b);
      if (d > worst) worst = d, at = i;
    }
    if (worst > tol2) {
      keep[at] = 1;
      stack[sp++] = {s.a, at};
      stack[sp++] = {at, s.b};
    }
  }
  u32 out = 0;
  for (u32 i = 0; i < n; i++)
    if (keep[i]) p[out++] = p[i];
  p.len = out;
  remove_collinear(p);
}

}  // namespace ll
