#include "slicer.h"

namespace ll {

SliceParams default_params() {
  SliceParams p{};
  p.layer_height = 0.2f;
  p.first_layer_height = 0.2f;
  p.line_width = 0.45f;
  p.perimeters = 2;
  p.infill_density = 0.2f;
  p.infill_angle = 45.0f;
  p.top_layers = 4;
  p.bottom_layers = 3;
  p.skirt_distance = 4.0f;
  p.skirt_loops = 1;
  p.infill_overlap = 0.15f;
  p.resolution = 0.0125f;
  p.closing_radius = 0.2f;
  p.miter_limit = 2.0f;
  return p;
}

namespace {

inline i32 um(f32 mm) { return round_i32((f64)mm * 1000.0); }

SliceParams sanitize(SliceParams p) {
  p.layer_height = clamp(p.layer_height, 0.04f, 1.2f);
  p.first_layer_height = clamp(p.first_layer_height, 0.04f, 1.2f);
  p.line_width = clamp(p.line_width, 0.1f, 2.0f);
  p.perimeters = min(p.perimeters, 12u);
  p.infill_density = clamp(p.infill_density, 0.0f, 1.0f);
  // Top and bottom neighbours plus the layer itself share one 16-set clip.
  p.top_layers = min(p.top_layers, 8u);
  p.bottom_layers = min(p.bottom_layers, 7u);
  p.skirt_distance = clamp(p.skirt_distance, 0.0f, 50.0f);
  p.skirt_loops = min(p.skirt_loops, 10u);
  p.infill_overlap = clamp(p.infill_overlap, 0.0f, 0.5f);
  p.resolution = clamp(p.resolution, 0.0f, 0.5f);
  p.closing_radius = clamp(p.closing_radius, 0.0f, 5.0f);
  p.miter_limit = clamp(p.miter_limit, 1.0f, 20.0f);
  return p;
}

bool rule_all(u32 m, u32 all) { return m == all; }
bool rule_first_not_all(u32 m, u32 all) { return (m & 1) && m != all; }

bool similar_islands(const Vec<Island>& a, const Vec<Island>& b, i32 eps, Arena& scratch) {
  if (a.len != b.len) return false;
  ScratchScope scope(scratch);
  Paths pa, pb;
  for (const Island& isl : a) {
    pa.push(scratch, isl.outer);
    for (const Path& h : isl.holes) pa.push(scratch, h);
  }
  for (const Island& isl : b) {
    pb.push(scratch, isl.outer);
    for (const Path& h : isl.holes) pb.push(scratch, h);
  }
  return similar(pa, pb, eps, scratch);
}

/// Index of the vertex of `p` closest to `q`.
u32 nearest_vertex(const Path& p, IPoint q) {
  u32 best = 0;
  i64 bd = -1;
  for (u32 i = 0; i < p.len; i++) {
    i64 d = dist2(p[i], q);
    if (bd < 0 || d < bd) bd = d, best = i;
  }
  return best;
}

/// Copy of a loop rotated to start at vertex `s`.
Path rotated(const Path& p, u32 s, Arena& a) {
  Path r;
  r.resize(a, p.len);
  for (u32 i = 0; i < p.len; i++) r[i] = p[(s + i) % p.len];
  return r;
}

}  // namespace

u32 Slicer::begin(const Mesh& mesh, const SliceParams& params) {
  persist_.reset();
  batch_.reset();
  scratch_.reset();
  temp_.reset();
  f64 t0 = platform::now_ms();
  mesh_ = mesh;
  p_ = sanitize(params);
  w_ = um(p_.line_width);
  st_ = Stats{};
  st_.triangles = mesh.count;
  f64 zmax = 0;
  for (u32 i = 0; i < mesh.count * 9; i += 3) zmax = max(zmax, (f64)mesh.tris[i + 2] * 1000.0);
  plan_ = plan_layers(zmax, um(p_.first_layer_height), um(p_.layer_height), persist_);
  buckets_ = bucket_triangles(mesh_, plan_, persist_);
  u32 L = plan_.count;
  layers_ = persist_.alloc_array<LayerState>(L + 1);
  paths_ = persist_.alloc_array<Vec<OutPath>>(L + 1);
  fill_bytes(layers_, 0, sizeof(LayerState) * (L + 1));
  fill_bytes(paths_, 0, sizeof(Vec<OutPath>) * (L + 1));
  prepared_ = finished_ = 0;
  nozzle_ = {0, 0};
  st_.layers = L;
  st_.ms_setup = platform::now_ms() - t0;
  return L;
}

void Slicer::prepare_layer(u32 i) {
  LayerState& L = layers_[i];
  f64 t0 = platform::now_ms();
  i64 contour_min_area2 = (i64)w_ * w_ / 8;
  i64 wall_min_area2 = (i64)w_ * w_ / 2;
  {
    ScratchScope keep(temp_);
    Vec<Segment> segs;
    intersect_layer(mesh_, buckets_, i, plan_.plane[i], segs, temp_);
    st_.segments += segs.len;
    StitchStats ss;
    Paths loops = stitch(segs, true, um(p_.closing_radius), persist_, scratch_, ss);
    st_.open_chains += ss.open;
    st_.repaired += ss.repaired;
    st_.dropped += ss.dropped;
    i32 tol = um(p_.resolution);
    for (Path& loop : loops) simplify_closed(loop, tol, scratch_);
    st_.loops += loops.len;
    L.islands = build_islands(loops, contour_min_area2, persist_, scratch_);
  }
  st_.islands += L.islands.len;
  f64 t1 = platform::now_ms();
  st_.ms_contours += t1 - t0;

  // Vertical walls give the same outline on consecutive layers, except for
  // points sliding along triangle diagonals, which the simplifier may keep on
  // one layer and drop on the next. Two simplifications of one outline are
  // within twice the resolution of each other, so when every loop matches the
  // layer below that closely, its islands, walls and infill are reused.
  i32 same_eps = 2 * um(p_.resolution) + 2;
  if (i > 0 && layers_[i - 1].prepared && similar_islands(layers_[i - 1].islands, L.islands, same_eps, scratch_)) {
    const LayerState& prev = layers_[i - 1];
    L.islands = prev.islands;
    L.walls = prev.walls;
    L.island_infill = prev.island_infill;
    L.infill_area = prev.infill_area;
    for (const Island& isl : L.islands) st_.holes += isl.holes.len;
    st_.reused += 1;
    L.prepared = true;
    st_.ms_walls += platform::now_ms() - t1;
    return;
  }

  u32 P = p_.perimeters;
  L.walls.resize(persist_, L.islands.len * P);
  L.island_infill.resize(persist_, L.islands.len);
  f64 infill_inset = P > 0 ? P * (f64)w_ - p_.infill_overlap * (f64)w_ : 0.5 * w_;
  for (u32 k = 0; k < L.islands.len; k++) {
    Island& isl = L.islands[k];
    st_.holes += isl.holes.len;
    ScratchScope keep(temp_);
    Paths base;
    base.reserve(temp_, isl.holes.len + 1);
    base.push(temp_, isl.outer);
    for (const Path& h : isl.holes) base.push(temp_, h);
    bool collapsed = false;
    for (u32 j = 0; j < P; j++) {
      Paths& wj = L.walls[k * P + j];
      wj = Paths{};
      if (collapsed) continue;
      wj = inset(base, 0.5 * w_ + (f64)j * w_, p_.miter_limit, wall_min_area2, persist_, scratch_);
      collapsed = wj.empty();
    }
    Paths area = collapsed ? Paths{} : inset(base, infill_inset, p_.miter_limit, wall_min_area2, persist_, scratch_);
    // An infill region narrower than one line width everywhere cannot hold a
    // line worth printing (there is no gap fill), and on thin-walled parts its
    // slivers would dominate the skin boolean. Such regions are dropped.
    if (!area.empty() && inset(area, 0.5 * w_, p_.miter_limit, 0, temp_, scratch_).empty()) area = Paths{};
    L.island_infill[k] = area;
    for (const Path& a : area) L.infill_area.push(persist_, a);
  }
  L.prepared = true;
  st_.ms_walls += platform::now_ms() - t1;
}

void Slicer::add_path(u32 layer, u16 kind, u16 flags, const Path& pts) {
  if (pts.len < 2) return;
  paths_[layer].push(persist_, {kind, flags, pts});
  st_.paths += 1;
  st_.points += pts.len;
}

void Slicer::finish_layer(u32 i) {
  LayerState& L = layers_[i];
  u32 count = plan_.count;
  f64 t0 = platform::now_ms();
  ScratchScope keep(temp_);

  // ---- top and bottom skins
  // solid = I_i minus the intersection of its neighbours, sparse = I_i within
  // all of them; both come out of a single N-ary clip.
  Paths sparse, solid;
  u32 top = p_.top_layers, bottom = p_.bottom_layers;
  if (top + bottom == 0) {
    sparse = L.infill_area;
  } else if (i < bottom || i + top >= count) {
    solid = L.infill_area;
  } else {
    const Paths* sets[16];
    u32 n = 0;
    bool neighbour_empty = false;
    sets[n++] = &L.infill_area;
    for (u32 d = 1; d <= top; d++) sets[n++] = &layers_[i + d].infill_area;
    for (u32 d = 1; d <= bottom; d++) sets[n++] = &layers_[i - d].infill_area;
    bool all_same = true;
    for (u32 d = 1; d <= top; d++) all_same &= same_paths(layers_[i + d].infill_area, L.infill_area);
    for (u32 d = 1; d <= bottom; d++) all_same &= same_paths(layers_[i - d].infill_area, L.infill_area);
    for (u32 s = 1; s < n; s++) neighbour_empty |= sets[s]->empty();
    if (neighbour_empty || L.infill_area.empty()) {
      solid = L.infill_area;
    } else if (all_same) {
      sparse = L.infill_area;  // covered above and below by the same region
    } else {
      Paths raw_solid;
      ClipOut outs[2] = {{rule_all, &sparse}, {rule_first_not_all, &raw_solid}};
      clip(sets, n, outs, 2, temp_, scratch_);
      // Morphological opening by half a line width: drops skin slivers too
      // thin to hold a line (gently sloped walls), which would otherwise turn
      // into long, nearly tangent solid infill strokes.
      if (!raw_solid.empty()) {
        Paths eroded = inset(raw_solid, 0.5 * w_, p_.miter_limit, 0, temp_, scratch_);
        if (!eroded.empty()) solid = inset(eroded, -0.5 * w_, p_.miter_limit, (i64)w_ * w_, temp_, scratch_);
      }
    }
  }
  f64 t1 = platform::now_ms();
  st_.ms_skins += t1 - t0;

  // ---- infill lines, alternating +angle / -angle by layer
  f64 angle = (i % 2 == 0) ? p_.infill_angle : -p_.infill_angle;
  Vec<Line> sparse_lines, solid_lines;
  if (p_.infill_density > 0.001f && !sparse.empty()) {
    i32 spacing = p_.infill_density >= 0.999f ? w_ : round_i32(w_ / (f64)p_.infill_density);
    rectilinear(sparse, angle, spacing, w_, sparse_lines, temp_, scratch_);
  }
  if (!solid.empty()) rectilinear(solid, angle, w_, w_, solid_lines, temp_, scratch_);
  f64 t2 = platform::now_ms();
  st_.ms_infill += t2 - t1;

  // ---- ordering and output
  u32 nisl = L.islands.len;
  for (const Island& isl : L.islands) {
    add_path(i, kContour, kClosed, isl.outer);
    for (const Path& h : isl.holes) add_path(i, kContour, kClosed, h);
  }

  if (i == 0 && p_.skirt_loops > 0 && nisl > 0) {
    Paths outers;
    for (const Island& isl : L.islands) outers.push(temp_, isl.outer);
    for (u32 k = p_.skirt_loops; k-- > 0;) {
      f64 grow = um(p_.skirt_distance) + 0.5 * w_ + (f64)k * w_;
      Paths ring = inset(outers, -grow, p_.miter_limit, 0, temp_, scratch_);
      for (const Path& loop : ring) {
        if (area2(loop) <= 0) continue;  // only the outside boundary of the grown region
        Path r = rotated(loop, nearest_vertex(loop, nozzle_), persist_);
        add_path(i, kSkirt, kClosed, r);
        nozzle_ = r[0];
      }
    }
  }

  // Assign every infill line to the island that contains its midpoint.
  Vec<Line>* sparse_by = temp_.alloc_array<Vec<Line>>(nisl + 1);
  Vec<Line>* solid_by = temp_.alloc_array<Vec<Line>>(nisl + 1);
  fill_bytes(sparse_by, 0, sizeof(Vec<Line>) * (nisl + 1));
  fill_bytes(solid_by, 0, sizeof(Vec<Line>) * (nisl + 1));
  auto owner = [&](const Line& l) -> u32 {
    IPoint m{(i32)(((i64)l.a.x + l.b.x) / 2), (i32)(((i64)l.a.y + l.b.y) / 2)};
    for (u32 k = 0; k < nisl; k++) {
      const BBox& b = L.islands[k].box;
      if (m.x < b.x0 || m.x > b.x1 || m.y < b.y0 || m.y > b.y1) continue;
      if (winding(m, L.islands[k].outer) != 0) return k;
    }
    return nisl;  // stray: printed last
  };
  for (const Line& l : sparse_lines) sparse_by[owner(l)].push(temp_, l);
  for (const Line& l : solid_lines) solid_by[owner(l)].push(temp_, l);

  // Islands in greedy nearest-first order.
  u8* done = temp_.alloc_array<u8>(nisl + 1);
  fill_bytes(done, 0, nisl + 1);
  u32 P = p_.perimeters;
  for (u32 step = 0; step <= nisl; step++) {
    u32 k = nisl;
    if (step < nisl) {
      i64 bd = -1;
      for (u32 c = 0; c < nisl; c++) {
        if (done[c]) continue;
        const BBox& b = L.islands[c].box;
        IPoint centre{(i32)(((i64)b.x0 + b.x1) / 2), (i32)(((i64)b.y0 + b.y1) / 2)};
        i64 d = dist2(centre, nozzle_);
        if (bd < 0 || d < bd) bd = d, k = c;
      }
      done[k] = 1;
      // Walls from the inside out, so the visible outer wall is laid against
      // already printed material. Seams line up at the back of the island.
      const BBox& b = L.islands[k].box;
      IPoint seam{(i32)(((i64)b.x0 + b.x1) / 2), b.y1 + 1000000};
      for (u32 j = P; j-- > 0;) {
        Paths& loops = L.walls[k * P + j];
        u8* used = temp_.alloc_array<u8>(loops.len + 1);
        fill_bytes(used, 0, loops.len + 1);
        for (u32 n = 0; n < loops.len; n++) {
          u32 pick = 0;
          i64 bd2 = -1;
          for (u32 c = 0; c < loops.len; c++) {
            if (used[c]) continue;
            i64 d = dist2(loops[c][nearest_vertex(loops[c], seam)], nozzle_);
            if (bd2 < 0 || d < bd2) bd2 = d, pick = c;
          }
          used[pick] = 1;
          Path r = rotated(loops[pick], nearest_vertex(loops[pick], seam), persist_);
          add_path(i, j == 0 ? kOuterWall : kInnerWall, kClosed, r);
          nozzle_ = r[0];
        }
      }
    }
    auto emit_lines = [&](Vec<Line>& lines, u16 kind) {
      order_lines(lines, nozzle_, scratch_);
      for (const Line& l : lines) {
        Path seg;
        seg.resize(persist_, 2);
        seg[0] = l.a;
        seg[1] = l.b;
        add_path(i, kind, 0, seg);
      }
    };
    emit_lines(solid_by[k], kSolidInfill);
    emit_lines(sparse_by[k], kSparseInfill);
  }
  st_.ms_order += platform::now_ms() - t2;
}

const u8* Slicer::advance(u32 max_layers, u32* bytes) {
  *bytes = 0;
  u32 count = plan_.count;
  if (finished_ >= count) return nullptr;
  if (max_layers == 0) max_layers = 1;
  u32 from = finished_, to = min(count, finished_ + max_layers);
  u32 need = min(count, to + p_.top_layers);
  while (prepared_ < need) prepare_layer(prepared_++);
  for (u32 i = from; i < to; i++) finish_layer(i);
  finished_ = to;

  // Serialise [from, to).
  batch_.reset();
  u32 npaths = 0, npoints = 0;
  for (u32 i = from; i < to; i++) {
    npaths += paths_[i].len;
    for (const OutPath& p : paths_[i]) npoints += p.pts.len;
  }
  u32 nl = to - from;
  u32 size = 20 + nl * 16 + npaths * 12 + npoints * 8;
  u8* buf = batch_.alloc_array<u8>(size);
  u32* h = reinterpret_cast<u32*>(buf);
  h[0] = kBatchMagic;
  h[1] = from;
  h[2] = to;
  h[3] = npaths;
  h[4] = npoints;
  u8* lp = buf + 20;
  u8* pp = lp + nl * 16;
  i32* pts = reinterpret_cast<i32*>(pp + npaths * 12);
  u32 path_at = 0, point_at = 0;
  for (u32 i = from; i < to; i++) {
    f32 z = (f32)(plan_.top[i] / 1000.0), hh = (f32)(plan_.height[i] / 1000.0);
    u32 rec[4];
    copy_bytes(&rec[0], &z, 4);
    copy_bytes(&rec[1], &hh, 4);
    rec[2] = path_at;
    rec[3] = paths_[i].len;
    copy_bytes(lp + (i - from) * 16, rec, 16);
    for (const OutPath& p : paths_[i]) {
      u32 prec[3] = {point_at, p.pts.len, (u32)p.kind | ((u32)p.flags << 16)};
      copy_bytes(pp + path_at * 12, prec, 12);
      for (const IPoint& q : p.pts) {
        pts[point_at * 2] = q.x;
        pts[point_at * 2 + 1] = q.y;
        point_at++;
      }
      path_at++;
    }
  }
  *bytes = size;
  return buf;
}

const Stats& Slicer::stats() {
  st_.arena_bytes = (f64)(persist_.reserved() + batch_.reserved() + scratch_.reserved() + temp_.reserved());
  return st_;
}

ContourBench slice_contours(const Mesh& mesh, i32 layer_um, Arena& a, Arena& scratch) {
  ContourBench r{0, 0, 0, 0};
  f64 zmax = 0;
  for (u32 i = 0; i < mesh.count * 9; i += 3) zmax = max(zmax, (f64)mesh.tris[i + 2] * 1000.0);
  LayerPlan plan = plan_layers(zmax, layer_um, layer_um, a);
  TriBuckets b = bucket_triangles(mesh, plan, a);
  r.layers = plan.count;
  for (u32 i = 0; i < plan.count; i++) {
    ScratchScope keep(a);
    Vec<Segment> segs;
    intersect_layer(mesh, b, i, plan.plane[i], segs, a);
    StitchStats st;
    Paths loops = stitch(segs, false, 0, a, scratch, st);
    r.segments += segs.len;
    r.loops += loops.len;
    for (const Path& p : loops) r.points += p.len;
  }
  return r;
}

}  // namespace ll
