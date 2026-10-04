#include "infill.h"

namespace ll {

void rectilinear(const Paths& region, f64 angle_deg, i32 spacing, i32 min_length, Vec<Line>& out, Arena& out_arena, Arena& scratch) {
  if (spacing <= 0) return;
  ScratchScope scope(scratch);
  f64 s, c;
  sincos_deg(angle_deg, &s, &c);
  struct Crossing {
    i64 k;
    f64 x;
  };
  Vec<Crossing> xs;
  f64 sp = spacing;
  for (const Path& p : region) {
    for (u32 i = 0, j = p.len - 1; i < p.len; j = i++) {
      // Rotate by -angle: the infill direction becomes the x axis.
      f64 x0 = p[j].x * c + p[j].y * s, y0 = -p[j].x * s + p[j].y * c;
      f64 x1 = p[i].x * c + p[i].y * s, y1 = -p[i].x * s + p[i].y * c;
      if (y0 == y1) continue;
      f64 lo = min(y0, y1), hi = max(y0, y1);
      // Scanline k sits at y = (k + 0.5) * spacing; take those in [lo, hi).
      i64 k0 = (i64)ceil(lo / sp - 0.5), k1 = (i64)ceil(hi / sp - 0.5) - 1;
      for (i64 k = k0; k <= k1; k++) {
        f64 y = ((f64)k + 0.5) * sp;
        xs.push(scratch, {k, x0 + (y - y0) * (x1 - x0) / (y1 - y0)});
      }
    }
  }
  sort(xs.data, xs.len, [](const Crossing& a, const Crossing& b) { return a.k != b.k ? a.k < b.k : a.x < b.x; });
  for (u32 i = 0; i + 1 < xs.len;) {
    if (xs[i].k != xs[i + 1].k) {  // odd crossing count on a scanline: skip the stray
      i++;
      continue;
    }
    f64 y = ((f64)xs[i].k + 0.5) * sp;
    f64 xa = xs[i].x, xb = xs[i + 1].x;
    i += 2;
    if (xb - xa < min_length) continue;
    // Rotate back by +angle.
    IPoint a{round_i32(xa * c - y * s), round_i32(xa * s + y * c)};
    IPoint b{round_i32(xb * c - y * s), round_i32(xb * s + y * c)};
    out.push(out_arena, {a, b});
  }
}

void order_lines(Vec<Line>& lines, IPoint& pos, Arena& scratch) {
  u32 n = lines.len;
  if (!n) return;
  ScratchScope scope(scratch);
  Line* src = scratch.alloc_array<Line>(n);
  copy_bytes(src, lines.data, sizeof(Line) * n);
  u8* used = scratch.alloc_array<u8>(n);
  fill_bytes(used, 0, n);

  BBox box;
  for (u32 i = 0; i < n; i++) box.add(src[i].a), box.add(src[i].b);
  i64 w = (i64)box.x1 - box.x0 + 1, h = (i64)box.y1 - box.y0 + 1;
  i64 cell = (i64)sqrt((f64)w * (f64)h / (f64)n) + 1;
  u32 nx = (u32)(w / cell + 1), ny = (u32)(h / cell + 1);
  u32* start = scratch.alloc_array<u32>(nx * ny + 1);
  fill_bytes(start, 0, sizeof(u32) * (nx * ny + 1));
  auto cell_of = [&](IPoint p) { return (u32)((p.y - box.y0) / cell) * nx + (u32)((p.x - box.x0) / cell); };
  for (u32 i = 0; i < n; i++) start[cell_of(src[i].a) + 1]++, start[cell_of(src[i].b) + 1]++;
  for (u32 k = 0; k < nx * ny; k++) start[k + 1] += start[k];
  u32* items = scratch.alloc_array<u32>(2 * n);
  u32* cur = scratch.alloc_array<u32>(nx * ny);
  copy_bytes(cur, start, sizeof(u32) * nx * ny);
  for (u32 i = 0; i < n; i++) items[cur[cell_of(src[i].a)]++] = i * 2, items[cur[cell_of(src[i].b)]++] = i * 2 + 1;

  for (u32 out = 0; out < n; out++) {
    i64 px = clamp<i64>((pos.x - (i64)box.x0) / cell, 0, nx - 1), py = clamp<i64>((pos.y - (i64)box.y0) / cell, 0, ny - 1);
    i64 best = -1;
    u32 pick = 0;
    i64 rmax = max(nx, ny);
    for (i64 r = 0; r <= rmax; r++) {
      for (i64 gy = py - r; gy <= py + r; gy++) {
        if (gy < 0 || gy >= ny) continue;
        bool edge_row = gy == py - r || gy == py + r;
        for (i64 gx = px - r; gx <= px + r; gx += (edge_row || r == 0) ? 1 : 2 * r) {
          if (gx < 0 || gx >= nx) continue;
          u32 c = (u32)(gy * nx + gx);
          for (u32 k = start[c]; k < start[c + 1]; k++) {
            u32 e = items[k];
            if (used[e >> 1]) continue;
            IPoint q = (e & 1) ? src[e >> 1].b : src[e >> 1].a;
            i64 d = dist2(pos, q);
            if (best < 0 || d < best) best = d, pick = e;
          }
        }
      }
      // Anything in ring r + 1 is at least r whole cells away.
      if (best >= 0 && (f64)best <= (f64)(r * cell) * (f64)(r * cell)) break;
    }
    used[pick >> 1] = 1;
    Line l = src[pick >> 1];
    if (pick & 1) swap(l.a, l.b);
    lines[out] = l;
    pos = l.b;
  }
}

}  // namespace ll
