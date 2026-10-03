// The C ABI exported from the wasm module. Pointers are offsets into linear
// memory; src/core/layerline.ts is the typed TypeScript side of this file.
#include "slicer.h"

#define LL_EXPORT(name) extern "C" __attribute__((export_name(#name)))

namespace {
// Everything below is constant-initialised (the build passes
// -Wglobal-constructors -Werror), so the module needs no start function.
ll::Slicer g_slicer;
ll::SliceParams g_params;
ll::Arena g_input, g_bench, g_bench_scratch;
ll::u32 g_batch_bytes;
ll::u32 g_bench_result[4];
}  // namespace

using namespace ll;

/// Bump when the ABI changes; the TypeScript wrapper checks it.
LL_EXPORT(ll_abi_version) u32 ll_abi_version() { return 1; }

/// The parameter block the next ll_begin reads (layout: SliceParams).
LL_EXPORT(ll_params) SliceParams* ll_params() { return &g_params; }
LL_EXPORT(ll_params_size) u32 ll_params_size() { return sizeof(SliceParams); }
LL_EXPORT(ll_params_reset) void ll_params_reset() { g_params = default_params(); }

/// Room for `triangles` triangles (9 floats each). Invalidates earlier input.
LL_EXPORT(ll_input) f32* ll_input(u32 triangles) {
  g_input.reset();
  return g_input.alloc_array<f32>((usize)triangles * 9 + 1);
}

/// Starts a slice of the input mesh. Returns the number of layers.
LL_EXPORT(ll_begin) u32 ll_begin(const f32* tris, u32 triangles) { return g_slicer.begin({tris, triangles}, g_params); }

/// Finishes up to `max_layers` more layers and returns their batch (layout in
/// slicer.h), or 0 when all layers have been emitted.
LL_EXPORT(ll_advance) const u8* ll_advance(u32 max_layers) { return g_slicer.advance(max_layers, &g_batch_bytes); }
LL_EXPORT(ll_batch_size) u32 ll_batch_size() { return g_batch_bytes; }

LL_EXPORT(ll_stats) const f64* ll_stats() { return &g_slicer.stats().triangles; }
LL_EXPORT(ll_stats_count) u32 ll_stats_count() { return sizeof(Stats) / sizeof(f64); }

/// Intersection + stitching only, for the WASM vs TypeScript benchmark.
/// Returns a pointer to {layers, segments, loops, points}.
LL_EXPORT(ll_bench_contours) const u32* ll_bench_contours(const f32* tris, u32 triangles, f32 layer_mm) {
  g_bench.reset();
  g_bench_scratch.reset();
  ContourBench r = slice_contours({tris, triangles}, round_i32((f64)layer_mm * 1000.0), g_bench, g_bench_scratch);
  g_bench_result[0] = r.layers;
  g_bench_result[1] = r.segments;
  g_bench_result[2] = r.loops;
  g_bench_result[3] = r.points;
  return g_bench_result;
}
