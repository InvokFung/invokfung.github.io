// The slicing pipeline: mesh in, toolpaths out, streamed in batches of layers.
#pragma once
#include "contours.h"
#include "infill.h"
#include "polyops.h"

namespace ll {

/// Parameters as laid out in memory for the C ABI: 16 four-byte fields.
/// src/core/abi.ts mirrors this layout; ll_params_size() guards it at runtime.
struct SliceParams {
  f32 layer_height;        // mm
  f32 first_layer_height;  // mm
  f32 line_width;          // mm
  u32 perimeters;
  f32 infill_density;    // 0..1
  f32 infill_angle;      // degrees; odd layers use the negated angle
  u32 top_layers;        // solid layers under a top surface
  u32 bottom_layers;     // solid layers over a bottom surface
  f32 skirt_distance;    // mm from the first layer outline
  u32 skirt_loops;
  f32 infill_overlap;    // fraction of a line width infill reaches into the walls
  f32 resolution;        // mm, contour simplification tolerance
  f32 closing_radius;    // mm, largest gap bridged in a broken contour
  f32 miter_limit;       // in multiples of the offset distance
  u32 reserved0;
  u32 reserved1;
};
static_assert(sizeof(SliceParams) == 64, "SliceParams is part of the ABI");

SliceParams default_params();

enum PathKind : u16 {
  kOuterWall = 0,
  kInnerWall = 1,
  kSparseInfill = 2,
  kSolidInfill = 3,
  kSkirt = 4,
  kContour = 5,  // the raw slice outline; preview only, never printed
};
enum PathFlags : u16 { kClosed = 1 };

/// Counters and timings; exported as an array of doubles (see kStatNames in
/// src/core/abi.ts, same order).
struct Stats {
  f64 triangles, layers, segments, loops, islands, holes;
  f64 open_chains, repaired, dropped;
  f64 reused;  // layers whose walls were reused from the layer below
  f64 paths, points;
  f64 ms_setup, ms_contours, ms_walls, ms_skins, ms_infill, ms_order;
  f64 arena_bytes;
};

struct OutPath {
  u16 kind, flags;
  Path pts;
};

/// Per-layer state kept between the two passes.
struct LayerState {
  Vec<Island> islands;
  Vec<Paths> walls;  // walls[island * perimeters + k]: loops of wall k (0 = outermost)
  Paths infill_area;
  Vec<Paths> island_infill;  // infill area per island (for assigning lines)
  bool prepared;
};

/// Batch layout (little-endian, every field 4-byte aligned):
///   header  u32 magic 'LLB1', layer_from, layer_to, path_count, point_count
///   layers  f32 z_top_mm, f32 height_mm, u32 first_path, u32 path_count
///   paths   u32 first_point, u32 point_count, u16 kind, u16 flags
///   points  i32 x_um, i32 y_um
constexpr u32 kBatchMagic = 0x3142'4c4c;  // "LLB1"

class Slicer {
 public:
  /// Prepares the layer plan and triangle buckets. Returns the layer count.
  u32 begin(const Mesh& mesh, const SliceParams& params);
  /// Finishes up to `max_layers` more layers and serialises them into a batch.
  /// Returns nullptr once every layer has been emitted.
  const u8* advance(u32 max_layers, u32* bytes);
  bool done() const { return finished_ >= plan_.count; }
  const Stats& stats();
  u32 layer_count() const { return plan_.count; }
  const LayerPlan& plan() const { return plan_; }
  /// Exposed for tests.
  const LayerState& layer(u32 i) const { return layers_[i]; }
  const Vec<OutPath>& layer_paths(u32 i) const { return paths_[i]; }

 private:
  void prepare_layer(u32 i);
  void finish_layer(u32 i);
  void add_path(u32 layer, u16 kind, u16 flags, const Path& pts);

  Mesh mesh_{};
  SliceParams p_{};
  LayerPlan plan_{};
  TriBuckets buckets_{};
  LayerState* layers_ = nullptr;
  Vec<OutPath>* paths_ = nullptr;
  u32 prepared_ = 0, finished_ = 0;
  IPoint nozzle_{0, 0};
  i32 w_ = 0;  // line width, um
  Stats st_{};
  Arena persist_, batch_, scratch_, temp_;
};

/// Intersection + stitching only, the stage benchmarked against TypeScript.
struct ContourBench {
  u32 layers, segments, loops, points;
};
ContourBench slice_contours(const Mesh& mesh, i32 layer_um, Arena& a, Arena& scratch);

}  // namespace ll
