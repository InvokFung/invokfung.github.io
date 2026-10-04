// 2D integer geometry. All slice-plane geometry lives on a 1 micrometre grid
// in 32-bit integers, so equality is exact and orientation tests are exact in
// 64-bit arithmetic. Coordinates are limited to +-2^30 um (about 1 km), which
// keeps every cross product of differences below 2^62.
#pragma once
#include "base.h"

namespace ll {

struct IPoint {
  i32 x, y;
  bool operator==(const IPoint& o) const { return x == o.x && y == o.y; }
  bool operator!=(const IPoint& o) const { return !(*this == o); }
};

using Path = Vec<IPoint>;
using Paths = Vec<Path>;

struct BBox {
  i32 x0 = 0x7fffffff, y0 = 0x7fffffff, x1 = -0x7fffffff, y1 = -0x7fffffff;
  void add(IPoint p) {
    x0 = min(x0, p.x);
    y0 = min(y0, p.y);
    x1 = max(x1, p.x);
    y1 = max(y1, p.y);
  }
  bool contains(const BBox& o) const { return o.x0 >= x0 && o.x1 <= x1 && o.y0 >= y0 && o.y1 <= y1; }
  bool overlaps(const BBox& o) const { return o.x0 <= x1 && o.x1 >= x0 && o.y0 <= y1 && o.y1 >= y0; }
  bool empty() const { return x0 > x1; }
};

/// Twice the signed area of triangle (o, a, b): > 0 when o->a->b turns left.
inline i64 cross(IPoint o, IPoint a, IPoint b) {
  return (i64)(a.x - o.x) * (i64)(b.y - o.y) - (i64)(a.y - o.y) * (i64)(b.x - o.x);
}
inline i64 dot(IPoint o, IPoint a, IPoint b) {
  return (i64)(a.x - o.x) * (i64)(b.x - o.x) + (i64)(a.y - o.y) * (i64)(b.y - o.y);
}
inline f64 dist(IPoint a, IPoint b) {
  f64 dx = (f64)a.x - b.x, dy = (f64)a.y - b.y;
  return sqrt(dx * dx + dy * dy);
}
inline i64 dist2(IPoint a, IPoint b) {
  i64 dx = (i64)a.x - b.x, dy = (i64)a.y - b.y;
  return dx * dx + dy * dy;
}

/// A monotone stand-in for atan2(y, x) in [0, 4): cheap, exact in ordering.
inline f64 pseudo_angle(f64 x, f64 y) {
  f64 s = fabs(x) + fabs(y);
  if (s == 0) return 0;
  f64 p = y / s;  // [-1, 1]
  return x < 0 ? 2 - p : (y < 0 ? 4 + p : p);
}

/// Pseudo-angle of the turn from direction `in` to direction `out`, in
/// [-2, 2): positive is a left turn and a full U-turn counts as the hardest
/// right turn, so walkers that prefer the leftmost exit never double back.
inline f64 turn_angle(IPoint in0, IPoint in1, IPoint out0, IPoint out1) {
  f64 ax = (f64)in1.x - in0.x, ay = (f64)in1.y - in0.y;
  f64 bx = (f64)out1.x - out0.x, by = (f64)out1.y - out0.y;
  f64 d = ax * bx + ay * by, c = ax * by - ay * bx;
  f64 a = pseudo_angle(d, c);  // [0, 4)
  return a >= 2 ? a - 4 : a;
}

/// Twice the signed area (shoelace); positive for counter-clockwise.
i64 area2(const Path& p);
BBox bbox(const Path& p);
f64 length(const Path& p, bool closed);
void reverse(Path& p);
/// Winding number of `p` with respect to a closed path (non-zero = inside).
i32 winding(IPoint p, const Path& path);
/// Ramer-Douglas-Peucker on a closed loop, then drops collinear vertices.
void simplify_closed(Path& p, f64 tolerance, Arena& scratch);
/// Removes consecutive duplicates and exactly collinear vertices of a loop.
void remove_collinear(Path& p);

inline bool same_path(const Path& a, const Path& b) {
  if (a.len != b.len) return false;
  for (u32 i = 0; i < a.len; i++)
    if (a[i] != b[i]) return false;
  return true;
}
inline bool same_paths(const Paths& a, const Paths& b) {
  if (a.len != b.len) return false;
  for (u32 i = 0; i < a.len; i++)
    if (!same_path(a[i], b[i])) return false;
  return true;
}

/// A loop and the holes directly inside it. Outer is counter-clockwise, holes
/// are clockwise, so the material is always on the left of every edge.
struct Island {
  Path outer;
  Paths holes;
  BBox box;
};

}  // namespace ll
