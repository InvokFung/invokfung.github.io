// Rectilinear infill and line ordering.
#pragma once
#include "geometry.h"

namespace ll {

struct Line {
  IPoint a, b;
};

/// Parallel lines at `angle_deg`, `spacing` apart, clipped to `region`.
/// The region is rotated so the lines become horizontal scanlines; every edge
/// reports where it crosses each scanline it spans (half-open in y, so shared
/// vertices count once), the crossings are sorted per scanline and paired up
/// under the even-odd rule. Scanlines sit on a global grid, so sparse infill
/// stacks into continuous walls from one layer to the next.
void rectilinear(const Paths& region, f64 angle_deg, i32 spacing, i32 min_length, Vec<Line>& out, Arena& out_arena, Arena& scratch);

/// Greedy nearest-neighbour ordering, flipping lines so each one starts at the
/// end closer to the nozzle. Endpoints sit in a uniform grid searched in
/// growing rings, so a layer costs about O(n) rather than O(n^2).
void order_lines(Vec<Line>& lines, IPoint& pos, Arena& scratch);

}  // namespace ll
