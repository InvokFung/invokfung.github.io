#include "base.h"

namespace ll {

// ---------------------------------------------------------------- math

void sincos_deg(f64 deg, f64* s, f64* c) {
  // Reduce to [-45, 45] plus a quadrant, then evaluate both series.
  f64 turns = deg / 90.0;
  f64 q = floor(turns + 0.5);
  f64 x = (deg - q * 90.0) * (3.14159265358979323846 / 180.0);
  f64 x2 = x * x;
  // Horner form of the Taylor series through x^17 / x^18 (|x| <= pi/4).
  f64 sn = x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156 * (1 - x2 / 210 * (1 - x2 / 272))))))));
  f64 cs = 1 - x2 / 2 * (1 - x2 / 12 * (1 - x2 / 30 * (1 - x2 / 56 * (1 - x2 / 90 * (1 - x2 / 132 * (1 - x2 / 182 * (1 - x2 / 240)))))));
  i64 quadrant = (i64)q;
  quadrant = ((quadrant % 4) + 4) % 4;
  switch (quadrant) {
    case 0: *s = sn; *c = cs; break;
    case 1: *s = cs; *c = -sn; break;
    case 2: *s = -sn; *c = -cs; break;
    default: *s = -cs; *c = sn; break;
  }
}

// ---------------------------------------------------------------- arena

namespace {
constexpr usize kMinChunk = usize(4) << 20;  // 4 MiB
inline u8* align_up(u8* p, usize align) {
  usize v = reinterpret_cast<usize>(p);
  return reinterpret_cast<u8*>((v + align - 1) & ~(align - 1));
}
}  // namespace

void* Arena::alloc(usize bytes, usize align) {
  u8* p = align_up(top_, align);
  if (top_ && p + bytes <= end_) {
    top_ = p + bytes;
    return p;
  }
  // Walk forward through chunks kept from earlier rounds before growing.
  Chunk* prev = cur_;
  for (Chunk* c = cur_ ? cur_->next : first_; c; prev = c, c = c->next) {
    u8* q = align_up(c->begin(), align);
    if (q + bytes <= c->begin() + c->size) {
      cur_ = c;
      top_ = q + bytes;
      end_ = c->begin() + c->size;
      return q;
    }
  }
  (void)prev;
  usize want = bytes + align + sizeof(Chunk);
  usize last = cur_ ? cur_->size : 0;
  usize size = max(max(want, kMinChunk), last);
  Chunk* c = static_cast<Chunk*>(platform::acquire(size));
  if (!c) panic();
  c->size = size - sizeof(Chunk);
  reserved_ += size;
  // Link right after the current chunk so mark/release order stays linear.
  if (cur_) {
    c->next = cur_->next;
    cur_->next = c;
  } else {
    c->next = first_;
    first_ = c;
  }
  cur_ = c;
  u8* q = align_up(c->begin(), align);
  top_ = q + bytes;
  end_ = c->begin() + c->size;
  return q;
}

void Arena::release(Mark m) {
  cur_ = static_cast<Chunk*>(m.chunk);
  if (!cur_) {
    top_ = end_ = nullptr;
    return;
  }
  top_ = m.top;
  end_ = cur_->begin() + cur_->size;
}

void Arena::reset() {
  cur_ = nullptr;
  top_ = end_ = nullptr;
}

// ---------------------------------------------------------------- PointMap

void PointMap::prepare(Arena& a, u32 n) {
  u32 want = 16;
  while (want < n * 2) want <<= 1;
  if (want > mask_ + 1 || !keys_) {
    keys_ = a.alloc_array<u64>(want);
    vals_ = a.alloc_array<u32>(want);
    gens_ = a.alloc_array<u32>(want);
    fill_bytes(gens_, 0, sizeof(u32) * want);
    mask_ = want - 1;
    gen_ = 0;
    u32 bits = 0;
    while ((1u << bits) < want) bits++;
    shift_ = 64 - bits;
  }
  if (++gen_ == 0) {  // generation counter wrapped: clear for real
    fill_bytes(gens_, 0, sizeof(u32) * (mask_ + 1));
    gen_ = 1;
  }
}

u32& PointMap::upsert(u64 key) {
  u32 i = slot(key);
  for (;;) {
    if (gens_[i] != gen_) {
      gens_[i] = gen_;
      keys_[i] = key;
      vals_[i] = kNone;
      return vals_[i];
    }
    if (keys_[i] == key) return vals_[i];
    i = (i + 1) & mask_;
  }
}

u32 PointMap::find(u64 key) const {
  u32 i = slot(key);
  for (;;) {
    if (gens_[i] != gen_) return kNone;
    if (keys_[i] == key) return vals_[i];
    i = (i + 1) & mask_;
  }
}

}  // namespace ll
