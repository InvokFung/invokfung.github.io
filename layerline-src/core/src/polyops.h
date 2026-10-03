// Polygon offsetting and boolean operations on oriented loops.
//
// Every region in the core is a set of loops with the material on the left
// (outer boundaries counter-clockwise, holes clockwise), so a point is inside
// a region when its winding number is >= 1 (the "positive" fill rule).
#pragma once
#include "geometry.h"

namespace ll {

/// Moves every edge `delta` to its left (into the material when delta > 0)
/// and joins neighbours at the intersection of the moved edges (a miter).
/// Where a miter would stick out more than `miter_limit * |delta|` on the
/// outside of a turn it is squared off. The result can self-intersect; pass it
/// through `resolve` to get clean loops.
Paths offset_raw(const Paths& in, f64 delta, f64 miter_limit, Arena& out);

/// Decides whether a point is in an output region, given a bit mask with bit
/// s set when the point is inside input set s (winding >= 1).
using Rule = bool (*)(u32 inside_mask, u32 all_mask);

struct ClipOut {
  Rule rule;
  Paths* result;
};

/// N-ary boolean on up to 16 sets of loops, evaluated in one pass:
///   1. collect every edge, split edges at all mutual crossings and touch
///      points (pairs found through a uniform grid);
///   2. group identical sub-edges; for each group take a test point just
///      right of its midpoint and get every set's winding number there from a
///      sweep in y over an active edge list; the left side follows by adding
///      the group members' own +-1 crossings;
///   3. keep the sub-edge when the rule differs on its two sides, oriented so
///      the output region is on its left, and stitch the kept edges into loops.
/// Several rules can share steps 1-2, e.g. "sparse" and "solid" infill.
void clip(const Paths* const* sets, u32 nsets, const ClipOut* outs, u32 nouts, Arena& out, Arena& scratch);

/// Union of a set under the positive fill rule: removes self-intersections,
/// inverted parts and overlaps.
Paths resolve(const Paths& p, Arena& out, Arena& scratch);
Paths intersection(const Paths& a, const Paths& b, Arena& out, Arena& scratch);
Paths difference(const Paths& a, const Paths& b, Arena& out, Arena& scratch);

/// Offset + resolve + cleanup: the region shrunk by `delta` (grown when < 0).
/// Loops smaller than `min_area2` (twice the area, um^2) are dropped.
Paths inset(const Paths& loops, f64 delta, f64 miter_limit, i64 min_area2, Arena& out, Arena& scratch);

/// Same number of loops, and every vertex of each set lies within `eps` of an
/// edge of the other (a symmetric, vertex-sampled Hausdorff test). Used to
/// detect layers whose outlines differ by rounding only.
bool similar(const Paths& a, const Paths& b, i32 eps, Arena& scratch);

Paths copy_paths(const Paths& p, Arena& out);
/// Sum of signed areas (um^2) of a set of loops.
f64 region_area(const Paths& p);

}  // namespace ll
