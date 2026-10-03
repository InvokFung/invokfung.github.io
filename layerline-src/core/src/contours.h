// Stage 1 of the pipeline: mesh -> closed contour loops per layer.
#pragma once
#include "geometry.h"

namespace ll {

/// Triangle soup as it comes out of an STL: 9 floats per triangle, millimetres,
/// counter-clockwise when seen from outside.
struct Mesh {
  const f32* tris;
  u32 count;
};

/// Layer heights on the micrometre grid. Each layer is sliced at the middle of
/// its height, never at a boundary, so flat tops and bottoms of the model don't
/// sit exactly on a slicing plane.
struct LayerPlan {
  u32 count = 0;
  i32* top = nullptr;     // top of layer i (um above the bed)
  i32* height = nullptr;  // thickness of layer i (um)
  f64* plane = nullptr;   // z of the slicing plane (um)
};
LayerPlan plan_layers(f64 zmax_um, i32 first_layer_um, i32 layer_um, Arena& a);

/// Triangles bucketed by the layers they cross, in CSR form: layer i owns
/// tris[start[i] .. start[i + 1]). Built in O(triangles + crossings) so a layer
/// never scans triangles that cannot reach it.
struct TriBuckets {
  u32* start = nullptr;
  u32* tris = nullptr;
};
TriBuckets bucket_triangles(const Mesh& m, const LayerPlan& plan, Arena& a);

/// A directed cut segment: the solid is on its left (it runs counter-clockwise
/// around outer contours when the mesh normals point outwards).
struct Segment {
  IPoint a, b;
};

/// Intersects every triangle of `layer` with its plane. A vertex counts as
/// above the plane when z >= plane, so each triangle yields one segment or none,
/// and every crossing edge is interpolated from its lower to its upper vertex,
/// which makes the point bit-identical in the two triangles that share the edge.
void intersect_layer(const Mesh& m, const TriBuckets& b, u32 layer, f64 plane, Vec<Segment>& out, Arena& a);

struct StitchStats {
  u32 closed = 0;    // loops closed directly
  u32 open = 0;      // chains that did not close by themselves
  u32 repaired = 0;  // open chains salvaged into closed loops
  u32 dropped = 0;   // open chains discarded
};

/// Chains directed segments into closed loops through a hash of their
/// endpoints (exact match first, then the 8 neighbouring grid cells). At a
/// junction with several exits the leftmost turn wins. With `repair`, open
/// chains are joined end to start when the gap is within `closing_radius`.
Paths stitch(const Vec<Segment>& segs, bool repair, i32 closing_radius, Arena& out, Arena& scratch, StitchStats& st);

/// Sorts loops into islands: a loop inside an even number of other loops is an
/// outer boundary (made counter-clockwise), inside an odd number it is a hole
/// (made clockwise) and joins the island of its smallest container.
Vec<Island> build_islands(Paths& loops, i64 min_area2, Arena& out, Arena& scratch);

}  // namespace ll
