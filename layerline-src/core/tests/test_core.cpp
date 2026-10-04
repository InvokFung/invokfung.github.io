// Native unit tests for the slicing core, built with g++ and sanitizers from
// the same sources as the wasm module.
//
//   ./build/test_core                      run the unit tests
//   ./build/test_core --summary <dir>      slice every .stl in <dir> with the
//                                          default parameters and print a JSON
//                                          summary (the wasm parity test
//                                          compares against it)
#include <dirent.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "slicer.h"

using namespace ll;

// ---------------------------------------------------------------- harness

namespace {
int g_checks = 0, g_failed = 0;
struct TestCase {
  const char* name;
  void (*fn)();
};
std::vector<TestCase>& registry() {
  static std::vector<TestCase> r;
  return r;
}
struct Registrar {
  Registrar(const char* n, void (*f)()) { registry().push_back({n, f}); }
};
}  // namespace

#define TEST(name)                                \
  static void name();                             \
  static Registrar registrar_##name(#name, name); \
  static void name()

#define CHECK(cond)                                                          \
  do {                                                                       \
    g_checks++;                                                              \
    if (!(cond)) {                                                           \
      g_failed++;                                                            \
      std::fprintf(stderr, "  %s:%d: CHECK(%s)\n", __FILE__, __LINE__, #cond); \
    }                                                                        \
  } while (0)

#define CHECK_NEAR(a, b, tol)                                                                              \
  do {                                                                                                     \
    g_checks++;                                                                                            \
    double va_ = (a), vb_ = (b);                                                                           \
    if (!(std::fabs(va_ - vb_) <= (tol))) {                                                                \
      g_failed++;                                                                                          \
      std::fprintf(stderr, "  %s:%d: %s = %.6f, expected %.6f +- %g\n", __FILE__, __LINE__, #a, va_, vb_, \
                   (double)(tol));                                                                         \
    }                                                                                                      \
  } while (0)

// ---------------------------------------------------------------- shapes

namespace {

using Tris = std::vector<float>;

void tri(Tris& t, const double* a, const double* b, const double* c) {
  for (const double* p : {a, b, c})
    for (int k = 0; k < 3; k++) t.push_back((float)p[k]);
}

/// Signed volume; flips every triangle when the mesh came out inside-out.
void orient_outward(Tris& t) {
  double v = 0;
  for (size_t i = 0; i < t.size(); i += 9) {
    const float* p = &t[i];
    v += p[0] * (p[4] * p[8] - p[5] * p[7]) - p[1] * (p[3] * p[8] - p[5] * p[6]) + p[2] * (p[3] * p[7] - p[4] * p[6]);
  }
  if (v < 0)
    for (size_t i = 0; i < t.size(); i += 9)
      for (int k = 0; k < 3; k++) std::swap(t[i + 3 + k], t[i + 6 + k]);
}

Tris box(double x0, double y0, double z0, double x1, double y1, double z1) {
  double v[8][3];
  for (int i = 0; i < 8; i++) {
    v[i][0] = (i & 1) ? x1 : x0;
    v[i][1] = (i & 2) ? y1 : y0;
    v[i][2] = (i & 4) ? z1 : z0;
  }
  static const int f[12][3] = {{0, 2, 1}, {1, 2, 3}, {4, 5, 6}, {5, 7, 6}, {0, 1, 4}, {1, 5, 4},
                               {2, 6, 3}, {3, 6, 7}, {0, 4, 2}, {2, 4, 6}, {1, 3, 5}, {3, 7, 5}};
  Tris t;
  for (auto& q : f) tri(t, v[q[0]], v[q[1]], v[q[2]]);
  orient_outward(t);
  return t;
}

/// Surface of revolution grid helper: quads between rings i and i+1.
Tris grid_surface(int nu, int nv, bool wrap_v, void (*at)(int, int, double*, const double*), const double* prm) {
  Tris t;
  for (int i = 0; i < nu; i++)
    for (int j = 0; j < (wrap_v ? nv : nv - 1); j++) {
      double a[3], b[3], c[3], d[3];
      at(i, j, a, prm);
      at((i + 1) % nu, j, b, prm);
      at((i + 1) % nu, (j + 1) % nv, c, prm);
      at(i, (j + 1) % nv, d, prm);
      tri(t, a, b, c);
      tri(t, a, c, d);
    }
  return t;
}

Tris cylinder(double r, double h, int n) {
  Tris t;
  double top[3] = {0, 0, h}, bot[3] = {0, 0, 0};
  for (int i = 0; i < n; i++) {
    double a0 = 2 * M_PI * i / n, a1 = 2 * M_PI * (i + 1) / n;
    double p0[3] = {r * std::cos(a0), r * std::sin(a0), 0}, p1[3] = {r * std::cos(a1), r * std::sin(a1), 0};
    double q0[3] = {p0[0], p0[1], h}, q1[3] = {p1[0], p1[1], h};
    tri(t, p0, p1, q1);
    tri(t, p0, q1, q0);
    tri(t, bot, p1, p0);
    tri(t, top, q0, q1);
  }
  orient_outward(t);
  return t;
}

void torus_at(int i, int j, double* p, const double* prm) {
  double R = prm[0], r = prm[1], nu = prm[2], nv = prm[3];
  double u = 2 * M_PI * i / nu, v = 2 * M_PI * j / nv;
  p[0] = (R + r * std::cos(v)) * std::cos(u);
  p[1] = (R + r * std::cos(v)) * std::sin(u);
  p[2] = r * std::sin(v) + r;
}

Tris torus(double R, double r, int nu, int nv) {
  double prm[4] = {R, r, (double)nu, (double)nv};
  Tris t = grid_surface(nu, nv, true, torus_at, prm);
  orient_outward(t);
  return t;
}

void translate(Tris& t, double dx, double dy, double dz) {
  for (size_t i = 0; i < t.size(); i += 3) t[i] += (float)dx, t[i + 1] += (float)dy, t[i + 2] += (float)dz;
}

Path square(Arena& a, i32 x0, i32 y0, i32 x1, i32 y1) {
  Path p;
  p.push(a, {x0, y0});
  p.push(a, {x1, y0});
  p.push(a, {x1, y1});
  p.push(a, {x0, y1});
  return p;
}

Path circle(Arena& a, double cx, double cy, double r, int n, bool ccw = true) {
  Path p;
  for (int i = 0; i < n; i++) {
    double t = 2 * M_PI * i / n * (ccw ? 1 : -1);
    p.push(a, {round_i32(cx + r * std::cos(t)), round_i32(cy + r * std::sin(t))});
  }
  return p;
}

Paths one(Arena& a, const Path& p) {
  Paths r;
  r.push(a, p);
  return r;
}

double mm2(const Paths& p) { return region_area(p) / 1e6; }

/// Slices a whole mesh and returns the slicer for inspection.
Slicer& slice(const Tris& t, SliceParams p = default_params()) {
  static Slicer s;
  s.begin({t.data(), (u32)(t.size() / 9)}, p);
  u32 bytes;
  while (s.advance(16, &bytes)) {
  }
  return s;
}

u32 count_kind(const Slicer& s, u32 layer, u16 kind) {
  u32 n = 0;
  for (const OutPath& p : s.layer_paths(layer)) n += p.kind == kind;
  return n;
}

double kind_length(const Slicer& s, u32 layer, u16 kind) {
  double l = 0;
  for (const OutPath& p : s.layer_paths(layer))
    if (p.kind == kind) l += length(p.pts, p.flags & kClosed);
  return l / 1000.0;
}

}  // namespace

// ---------------------------------------------------------------- foundations

TEST(sincos_matches_libm) {
  for (double d = -720; d <= 720; d += 7.5) {
    double s, c;
    sincos_deg(d, &s, &c);
    CHECK_NEAR(s, std::sin(d * M_PI / 180), 1e-14);
    CHECK_NEAR(c, std::cos(d * M_PI / 180), 1e-14);
  }
}

TEST(sort_orders_and_handles_duplicates) {
  Arena a;
  std::vector<int> ref;
  Vec<int> v;
  unsigned x = 12345;
  for (int i = 0; i < 5000; i++) {
    x = x * 1103515245u + 12345u;
    int k = (int)((x >> 8) % 300);  // many duplicates
    v.push(a, k);
    ref.push_back(k);
  }
  sort(v.data, v.len, [](int p, int q) { return p < q; });
  std::sort(ref.begin(), ref.end());
  bool same = true;
  for (u32 i = 0; i < v.len; i++) same &= v[i] == ref[i];
  CHECK(same);
}

TEST(arena_reuses_memory_after_release) {
  Arena a;
  auto m = a.mark();
  void* p1 = a.alloc(1000);
  a.alloc(10 << 20);  // forces a second chunk
  usize reserved = a.reserved();
  a.release(m);
  void* p2 = a.alloc(1000);
  CHECK(p1 == p2);
  a.alloc(10 << 20);
  CHECK(a.reserved() == reserved);  // no new chunk needed the second time
  a.reset();
  CHECK(a.alloc(16) == p1);
}

TEST(point_map_insert_find_clear) {
  Arena a;
  PointMap m;
  m.prepare(a, 1000);
  for (i32 i = 0; i < 1000; i++) m.upsert(pack_point(i * 7, -i)) = (u32)i;
  bool ok = true;
  for (i32 i = 0; i < 1000; i++) ok &= m.find(pack_point(i * 7, -i)) == (u32)i;
  CHECK(ok);
  CHECK(m.find(pack_point(1, 1)) == PointMap::kNone);
  m.prepare(a, 1000);
  CHECK(m.find(pack_point(7, -1)) == PointMap::kNone);
}

// ---------------------------------------------------------------- contours

TEST(cube_slices_into_one_square_per_layer) {
  Tris t = box(0, 0, 0, 20, 20, 20);
  Arena a, s;
  ContourBench b = slice_contours({t.data(), (u32)(t.size() / 9)}, 200, a, s);
  CHECK(b.layers == 100);
  CHECK(b.loops == 100);
  Slicer& sl = slice(t);
  CHECK(sl.layer_count() == 100);
  bool ok = true;
  for (u32 i = 0; i < 100; i++) {
    const LayerState& L = sl.layer(i);
    ok &= L.islands.len == 1 && L.islands[0].holes.len == 0 && L.islands[0].outer.len == 4;
    ok &= std::fabs((double)area2(L.islands[0].outer) / 2e6 - 400.0) < 1e-9;
  }
  CHECK(ok);
  CHECK(area2(sl.layer(0).islands[0].outer) > 0);  // outer boundary is counter-clockwise
}

TEST(layer_plan_honours_first_layer_height) {
  Tris t = box(0, 0, 0, 10, 10, 10);
  SliceParams p = default_params();
  p.first_layer_height = 0.3f;
  p.layer_height = 0.15f;
  Slicer& s = slice(t, p);
  // planes at 0.15, then 0.375, 0.525, ... below 10: 1 + 65 layers
  CHECK(s.layer_count() == 66);
  CHECK(s.plan().top[0] == 300 && s.plan().top[1] == 450 && s.plan().height[1] == 150);
}

TEST(cylinder_area_matches_polygon) {
  const int n = 128;
  Tris t = cylinder(10, 12, n);
  SliceParams p = default_params();
  p.resolution = 0;  // exact intersection polygons
  Slicer& s = slice(t, p);
  double expect = 0.5 * n * 100 * std::sin(2 * M_PI / n);
  bool ok = true;
  for (u32 i = 0; i < s.layer_count(); i++) {
    const LayerState& L = s.layer(i);
    // Each side quad is two triangles, so every facet yields two segments
    // whose shared point is rounded to the 1 um grid.
    ok &= L.islands.len == 1 && L.islands[0].holes.len == 0 && L.islands[0].outer.len == 2u * n;
    ok &= std::fabs(area2(L.islands[0].outer) / 2e6 - expect) < 0.01;  // rounding only
  }
  CHECK(ok);
  CHECK(s.layer_count() == 60);
  // Default 12.5 um simplification thins the 128-gon but moves no point more
  // than the tolerance, so the area changes by under perimeter * tolerance.
  Slicer& d = slice(t);
  const Path& outer = d.layer(30).islands[0].outer;
  CHECK(outer.len < (u32)n);
  CHECK(std::fabs(area2(outer) / 2e6 - expect) < 2 * M_PI * 10 * 0.0125);
}

TEST(torus_layers_have_one_hole) {
  const double R = 15, r = 5;
  Tris t = torus(R, r, 144, 72);
  Slicer& s = slice(t);
  CHECK(s.layer_count() == 50);
  u32 with_hole = 0;
  double worst = 0;
  for (u32 i = 0; i < s.layer_count(); i++) {
    const LayerState& L = s.layer(i);
    if (L.islands.len == 1 && L.islands[0].holes.len == 1) with_hole++;
    if (L.islands.len != 1) continue;
    double dz = s.plan().plane[i] / 1000.0 - r;
    double a = std::sqrt(r * r - dz * dz);
    double expect = M_PI * ((R + a) * (R + a) - (R - a) * (R - a));
    Paths rings;
    Arena tmp;
    rings.push(tmp, L.islands[0].outer);
    for (const Path& h : L.islands[0].holes) rings.push(tmp, h);
    worst = std::max(worst, std::fabs(mm2(rings) - expect) / expect);
    CHECK(area2(L.islands[0].holes[0]) < 0);  // holes run clockwise
  }
  CHECK(with_hole == s.layer_count());
  CHECK(worst < 0.03);  // faceting of a 144 x 72 mesh near the top and bottom
}

TEST(nested_islands_alternate_outer_and_hole) {
  // A hollow box with a solid pillar inside: outer, hole, then an island inside the hole.
  Tris t = box(0, 0, 0, 30, 30, 10);
  Tris inner = box(5, 5, 0, 25, 25, 10);  // becomes the hole once flipped
  for (size_t i = 0; i < inner.size(); i += 9)
    for (int k = 0; k < 3; k++) std::swap(inner[i + 3 + k], inner[i + 6 + k]);
  Tris pillar = box(12, 12, 0, 18, 18, 10);
  t.insert(t.end(), inner.begin(), inner.end());
  t.insert(t.end(), pillar.begin(), pillar.end());
  Slicer& s = slice(t);
  const LayerState& L = s.layer(10);
  CHECK(L.islands.len == 2);
  u32 holes = 0;
  for (const Island& isl : L.islands) holes += isl.holes.len;
  CHECK(holes == 1);
}

TEST(stitching_repairs_flipped_triangle_and_small_gap) {
  Tris t = box(0, 0, 0, 20, 20, 5);
  for (int k = 0; k < 3; k++) std::swap(t[9 * 4 + 3 + k], t[9 * 4 + 6 + k]);  // flip one side triangle
  Slicer& s = slice(t);
  bool ok = true;
  for (u32 i = 0; i < s.layer_count(); i++) {
    const LayerState& L = s.layer(i);
    ok &= L.islands.len == 1 && std::fabs(area2(L.islands[0].outer) / 2e6 - 400) < 1e-6;
  }
  CHECK(ok);
  CHECK(s.stats().repaired > 0);
  CHECK(s.stats().dropped == 0);

  // A square from shuffled segments with a 60 um gap.
  Arena a, sc;
  Vec<Segment> segs;
  segs.push(a, {{1000, 0}, {1000, 1000}});
  segs.push(a, {{0, 0}, {1000, 0}});
  segs.push(a, {{0, 1000}, {0, 60}});
  segs.push(a, {{1000, 1000}, {0, 1000}});
  StitchStats st;
  Paths loops = stitch(segs, true, 100, a, sc, st);
  CHECK(loops.len == 1 && st.open == 2 && st.repaired == 2);
  CHECK(loops.len == 1 && area2(loops[0]) > 0);
}

// ---------------------------------------------------------------- polygon ops

TEST(inset_square_and_square_with_hole) {
  Arena a, s;
  Paths sq = one(a, square(a, 0, 0, 10000, 10000));
  Paths in = inset(sq, 1000, 2, 0, a, s);
  CHECK(in.len == 1);
  CHECK_NEAR(mm2(in), 64.0, 1e-9);
  Paths ring = sq;
  Path hole = square(a, 4000, 4000, 6000, 6000);
  reverse(hole);
  ring.push(a, hole);
  Paths r = inset(ring, 1000, 2, 0, a, s);
  CHECK(r.len == 2);
  CHECK_NEAR(mm2(r), 64.0 - 16.0, 1e-9);  // outer shrinks to 8x8, hole grows to 4x4
  Paths grown = inset(sq, -1000, 2, 0, a, s);
  // Miter limit 2 > sqrt(2), so square corners stay sharp: a 12 x 12 square.
  CHECK_NEAR(mm2(grown), 144.0, 1e-9);
}

TEST(inset_concave_l_shape) {
  Arena a, s;
  Path l;
  for (IPoint p : {IPoint{0, 0}, IPoint{20000, 0}, IPoint{20000, 8000}, IPoint{8000, 8000}, IPoint{8000, 20000}, IPoint{0, 20000}})
    l.push(a, p);
  Paths r = inset(one(a, l), 1000, 2, 0, a, s);
  CHECK(r.len == 1 && r[0].len == 6);
  // L of arm width 6 inside: 18 x 6 + 6 x 12
  CHECK_NEAR(mm2(r), 18 * 6 + 6 * 12, 1e-9);
}

TEST(inset_removes_collapsed_thin_parts) {
  Arena a, s;
  // A 1 mm strip vanishes under a 0.6 mm inset.
  CHECK(inset(one(a, square(a, 0, 0, 10000, 1000)), 600, 2, 0, a, s).len == 0);
  // A dumbbell: the 1 mm bridge disappears and the inset splits in two.
  Path d;
  for (IPoint p : {IPoint{0, 0}, IPoint{10000, 0}, IPoint{10000, 4500}, IPoint{20000, 4500}, IPoint{20000, 0}, IPoint{30000, 0},
                   IPoint{30000, 10000}, IPoint{20000, 10000}, IPoint{20000, 5500}, IPoint{10000, 5500}, IPoint{10000, 10000}, IPoint{0, 10000}})
    d.push(a, p);
  Paths r = inset(one(a, d), 1000, 2, 0, a, s);
  CHECK(r.len == 2);
  CHECK_NEAR(mm2(r), 2 * 64.0, 1e-9);
  // A ring whose wall is thinner than twice the inset: outer and hole cross.
  Paths ring = one(a, circle(a, 0, 0, 10000, 180));
  ring.push(a, circle(a, 0, 0, 9500, 180, false));
  CHECK(inset(ring, 300, 2, 0, a, s).len == 0);
  Paths ok = inset(ring, 200, 2, 0, a, s);
  CHECK(ok.len == 2);
}

TEST(sharp_spike_is_squared_off) {
  Arena a, s;
  // A 10 degree spike pointing right; growing it with miter limit 2 must not
  // shoot a point far beyond the tip.
  Path p;
  p.push(a, {0, -1000});
  p.push(a, {20000, 0});
  p.push(a, {0, 1000});
  Paths g = inset(one(a, p), -500, 2, 0, a, s);
  CHECK(g.len == 1);
  BBox b = bbox(g[0]);
  CHECK(b.x1 <= 20000 + 2 * 500 + 2);
}

TEST(booleans_union_intersection_difference) {
  Arena a, s;
  Paths A = one(a, square(a, 0, 0, 10000, 10000));
  Paths B = one(a, square(a, 5000, 5000, 15000, 15000));
  Paths both = A;
  both.push(a, B[0]);
  CHECK_NEAR(mm2(resolve(both, a, s)), 175.0, 1e-9);
  CHECK_NEAR(mm2(intersection(A, B, a, s)), 25.0, 1e-9);
  CHECK_NEAR(mm2(difference(A, B, a, s)), 75.0, 1e-9);
  // Identical inputs: union keeps one copy, difference is empty.
  CHECK_NEAR(mm2(intersection(A, A, a, s)), 100.0, 1e-9);
  CHECK(difference(A, A, a, s).len == 0);
  // Squares touching at one corner stay two loops.
  Paths C = A;
  C.push(a, square(a, 10000, 10000, 20000, 20000));
  Paths u = resolve(C, a, s);
  CHECK(u.len == 2);
  CHECK_NEAR(mm2(u), 200.0, 1e-9);
  // Sharing an edge: merged into one rectangle.
  Paths D = A;
  D.push(a, square(a, 10000, 0, 20000, 10000));
  Paths m = resolve(D, a, s);
  CHECK(m.len == 1 && m[0].len == 4);
}

TEST(resolve_figure_eight) {
  Arena a, s;
  // A self-intersecting bow tie: one lobe counter-clockwise, one clockwise.
  Path p;
  p.push(a, {0, 0});
  p.push(a, {10000, 10000});
  p.push(a, {10000, 0});
  p.push(a, {0, 10000});
  Paths r = resolve(one(a, p), a, s);
  CHECK(r.len == 1);
  CHECK_NEAR(mm2(r), 25.0, 1e-9);  // only the positively wound lobe survives
}

// ---------------------------------------------------------------- infill

TEST(rectilinear_fills_square_and_skips_hole) {
  Arena a, s;
  Paths sq = one(a, square(a, 0, 0, 20000, 20000));
  Vec<Line> lines;
  rectilinear(sq, 0, 2000, 0, lines, a, s);
  CHECK(lines.len == 10);
  double total = 0;
  for (const Line& l : lines) total += dist(l.a, l.b);
  CHECK_NEAR(total / 1000, 200.0, 1e-6);
  lines.clear();
  rectilinear(sq, 45, 2000, 0, lines, a, s);
  total = 0;
  for (const Line& l : lines) total += dist(l.a, l.b);
  CHECK_NEAR(total / 1000, 400.0 / 2.0, 6.0);  // area / spacing, minus edge effects
  Path hole = square(a, 5000, 5000, 15000, 15000);
  reverse(hole);
  sq.push(a, hole);
  lines.clear();
  rectilinear(sq, 0, 2000, 0, lines, a, s);
  CHECK(lines.len == 10 + 5);  // the 5 scanlines through the hole split in two
  total = 0;
  for (const Line& l : lines) total += dist(l.a, l.b);
  CHECK_NEAR(total / 1000, 200.0 - 50.0, 1e-6);
}

TEST(order_lines_is_a_permutation_and_short) {
  Arena a, s;
  Vec<Line> lines;
  rectilinear(one(a, square(a, 0, 0, 30000, 30000)), 0, 1000, 0, lines, a, s);
  u32 n = lines.len;
  IPoint pos{0, 0};
  order_lines(lines, pos, s);
  CHECK(lines.len == n);
  double travel = 0;
  IPoint at{0, 0};
  for (const Line& l : lines) travel += dist(at, l.a), at = l.b;
  CHECK(travel / 1000 < 2.0 * n);  // zig-zag: about one spacing per line
}

// ---------------------------------------------------------------- pipeline

TEST(cube_toolpaths_have_walls_skins_and_infill) {
  Tris t = box(0, 0, 0, 20, 20, 20);
  translate(t, 100, 100, 0);
  SliceParams p = default_params();
  Slicer& s = slice(t, p);
  u32 L = s.layer_count();
  CHECK(count_kind(s, 0, kSkirt) == 1);
  CHECK(count_kind(s, 1, kSkirt) == 0);
  bool walls = true;
  for (u32 i = 0; i < L; i++) walls &= count_kind(s, i, kOuterWall) == 1 && count_kind(s, i, kInnerWall) == 1;
  CHECK(walls);
  // Outer wall centreline sits half a line width inside: 4 * (20 - 0.45).
  CHECK_NEAR(kind_length(s, 50, kOuterWall), 4 * (20 - 0.45), 1e-3);
  CHECK_NEAR(kind_length(s, 50, kInnerWall), 4 * (20 - 3 * 0.45), 1e-3);
  // Bottom 3 and top 4 layers solid, the rest sparse.
  for (u32 i : {0u, 2u, L - 4, L - 1}) {
    CHECK(count_kind(s, i, kSolidInfill) > 0);
    CHECK(count_kind(s, i, kSparseInfill) == 0);
  }
  for (u32 i : {3u, 50u, L - 5}) {
    CHECK(count_kind(s, i, kSolidInfill) == 0);
    CHECK(count_kind(s, i, kSparseInfill) > 0);
  }
  // Solid lines are one line width apart: length ~ area / width.
  double inner = 20 - 4 * 0.45 + 2 * 0.15 * 0.45;
  CHECK_NEAR(kind_length(s, 1, kSolidInfill), inner * inner / 0.45, inner * 2);
  // 20 % sparse: spacing 2.25 mm.
  CHECK_NEAR(kind_length(s, 50, kSparseInfill), inner * inner / 2.25, inner * 2);
}

TEST(overhang_step_gets_top_skin_only_where_exposed) {
  // A 30 x 30 x 4 slab with a 10 x 10 tower on it: the slab's top layers are
  // solid around the tower but sparse under it.
  Tris t = box(0, 0, 0, 30, 30, 4);
  Tris tower = box(10, 10, 4, 20, 20, 10);
  t.insert(t.end(), tower.begin(), tower.end());
  Slicer& s = slice(t);
  u32 slab_top = 19;  // the layer at 3.8 - 4.0 mm
  CHECK(count_kind(s, slab_top, kSolidInfill) > 0);
  // Under the tower the slab's top layers stay sparse.
  bool sparse_under = false;
  for (const OutPath& p : s.layer_paths(slab_top))
    if (p.kind == kSparseInfill) {
      IPoint m{(p.pts[0].x + p.pts[1].x) / 2, (p.pts[0].y + p.pts[1].y) / 2};
      sparse_under |= m.x > 11000 && m.x < 19000 && m.y > 11000 && m.y < 19000;
    }
  CHECK(sparse_under);
}

TEST(batches_cover_every_layer_once) {
  Tris t = torus(15, 5, 64, 32);
  Slicer s;
  s.begin({t.data(), (u32)(t.size() / 9)}, default_params());
  u32 bytes, next = 0;
  bool ok = true;
  while (const u8* b = s.advance(7, &bytes)) {
    const u32* h = reinterpret_cast<const u32*>(b);
    ok &= h[0] == kBatchMagic && h[1] == next && h[2] > h[1];
    ok &= bytes == 20 + (h[2] - h[1]) * 16 + h[3] * 12 + h[4] * 8;
    next = h[2];
  }
  CHECK(ok);
  CHECK(next == s.layer_count());
}

// ---------------------------------------------------------------- summary mode

namespace {

std::vector<float> read_stl(const std::string& path) {
  std::vector<float> t;
  FILE* f = std::fopen(path.c_str(), "rb");
  if (!f) return t;
  unsigned char head[84];
  if (std::fread(head, 1, 84, f) != 84) return std::fclose(f), t;
  uint32_t n;
  std::memcpy(&n, head + 80, 4);
  t.resize((size_t)n * 9);
  unsigned char rec[50];
  for (uint32_t i = 0; i < n; i++) {
    if (std::fread(rec, 1, 50, f) != 50) break;
    std::memcpy(&t[(size_t)i * 9], rec + 12, 36);
  }
  std::fclose(f);
  return t;
}

uint32_t fnv1a(uint32_t h, const unsigned char* p, size_t n) {
  for (size_t i = 0; i < n; i++) h = (h ^ p[i]) * 16777619u;
  return h;
}

int summary(const char* dir) {
  std::vector<std::string> files;
  if (DIR* d = opendir(dir)) {
    while (dirent* e = readdir(d)) {
      std::string n = e->d_name;
      if (n.size() > 4 && n.substr(n.size() - 4) == ".stl") files.push_back(n);
    }
    closedir(d);
  }
  std::sort(files.begin(), files.end());
  std::printf("{\n");
  for (size_t f = 0; f < files.size(); f++) {
    std::vector<float> t = read_stl(std::string(dir) + "/" + files[f]);
    Mesh m{t.data(), (u32)(t.size() / 9)};
    static Slicer s;
    s.begin(m, default_params());
    uint32_t hash = 2166136261u, bytes;
    while (const u8* b = s.advance(16, &bytes)) hash = fnv1a(hash, b, bytes);
    const Stats& st = s.stats();
    Arena a, sc;
    ContourBench cb = slice_contours(m, 200, a, sc);
    std::printf("  \"%s\": {\"triangles\": %u, \"layers\": %u, \"segments\": %.0f, \"loops\": %.0f, \"islands\": %.0f, \"holes\": %.0f, "
                "\"paths\": %.0f, \"points\": %.0f, \"repaired\": %.0f, \"dropped\": %.0f, \"hash\": %u, "
                "\"contours\": {\"layers\": %u, \"segments\": %u, \"loops\": %u, \"points\": %u}}%s\n",
                files[f].c_str(), m.count, s.layer_count(), st.segments, st.loops, st.islands, st.holes, st.paths, st.points, st.repaired,
                st.dropped, hash, cb.layers, cb.segments, cb.loops, cb.points, f + 1 < files.size() ? "," : "");
  }
  std::printf("}\n");
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc == 3 && std::strcmp(argv[1], "--summary") == 0) return summary(argv[2]);
  int failed_tests = 0;
  for (const TestCase& t : registry()) {
    int before = g_failed;
    t.fn();
    bool ok = g_failed == before;
    failed_tests += !ok;
    std::printf("%s %s\n", ok ? "  ok  " : "  FAIL", t.name);
  }
  std::printf("\n%zu tests, %d checks, %d failed\n", registry().size(), g_checks, g_failed);
  return g_failed ? 1 : 0;
}
