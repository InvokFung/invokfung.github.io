// Freestanding foundations for the slicing core.
//
// The core is compiled twice from the same sources: to wasm32 with no libc and
// no C++ standard library, and natively with g++ for unit tests. Everything it
// needs (integer types, a few math builtins, an arena allocator, a growable
// array, a sort and a point hash) is defined here so neither build depends on
// anything the other lacks. Floating point is plain IEEE double in both builds
// with no fast-math and no FMA contraction, which is why the native and wasm
// outputs can be compared bit for bit.
#pragma once

namespace ll {

using u8 = unsigned char;
using u16 = unsigned short;
using u32 = unsigned int;
using u64 = unsigned long long;
using i32 = int;
using i64 = long long;
using f32 = float;
using f64 = double;
using usize = decltype(sizeof(0));

static_assert(sizeof(u32) == 4 && sizeof(u64) == 8 && sizeof(i64) == 8, "unexpected integer widths");

// ---------------------------------------------------------------- math

inline f64 sqrt(f64 x) { return __builtin_sqrt(x); }
inline f64 floor(f64 x) { return __builtin_floor(x); }
inline f64 ceil(f64 x) { return __builtin_ceil(x); }
inline f64 fabs(f64 x) { return __builtin_fabs(x); }
template <class T> inline T min(T a, T b) { return b < a ? b : a; }
template <class T> inline T max(T a, T b) { return a < b ? b : a; }
template <class T> inline T clamp(T v, T lo, T hi) { return v < lo ? lo : (hi < v ? hi : v); }
template <class T> inline void swap(T& a, T& b) {
  T t = a;
  a = b;
  b = t;
}
/// Round half up to the nearest integer. Used for every double -> grid conversion.
inline i32 round_i32(f64 x) { return (i32)floor(x + 0.5); }

/// sin and cos of an angle in degrees. Only used for infill rotation, so a
/// range-reduced Taylor series is plenty (error below 1e-15 on [-45, 45]).
void sincos_deg(f64 deg, f64* s, f64* c);

[[noreturn]] inline void panic() { __builtin_trap(); }

inline void copy_bytes(void* dst, const void* src, usize n) { __builtin_memcpy(dst, src, n); }
inline void fill_bytes(void* dst, u8 v, usize n) { __builtin_memset(dst, v, n); }

// ---------------------------------------------------------------- platform

namespace platform {
/// Fresh memory that is never returned. wasm: memory.grow; native: malloc.
void* acquire(usize bytes);
/// Milliseconds from a monotonic clock (performance.now() in the browser).
f64 now_ms();
}  // namespace platform

// ---------------------------------------------------------------- arena

/// Bump allocator over a chain of chunks. Allocation is a pointer increment;
/// `reset` and `release` rewind without returning memory to the platform, so
/// a second slice reuses the pages the first one grew. wasm linear memory can
/// only grow, which makes this the natural shape for it.
class Arena {
 public:
  struct Mark {
    void* chunk;
    u8* top;
  };

  void* alloc(usize bytes, usize align = 8);
  template <class T> T* alloc_array(usize n) { return static_cast<T*>(alloc(n * sizeof(T), alignof(T) < 8 ? 8 : alignof(T))); }

  Mark mark() const { return {cur_, top_}; }
  void release(Mark m);
  void reset();
  /// Bytes obtained from the platform so far (high-water mark of the arena).
  usize reserved() const { return reserved_; }

 private:
  struct Chunk {
    Chunk* next;
    usize size;  // usable bytes after the header
    u8* begin() { return reinterpret_cast<u8*>(this) + sizeof(Chunk); }
  };
  Chunk* first_ = nullptr;
  Chunk* cur_ = nullptr;
  u8* top_ = nullptr;
  u8* end_ = nullptr;
  usize reserved_ = 0;
};

/// Scoped rewind of an arena: everything allocated after construction is
/// released when the guard goes out of scope.
class ScratchScope {
 public:
  explicit ScratchScope(Arena& a) : arena_(a), mark_(a.mark()) {}
  ~ScratchScope() { arena_.release(mark_); }
  ScratchScope(const ScratchScope&) = delete;
  ScratchScope& operator=(const ScratchScope&) = delete;

 private:
  Arena& arena_;
  Arena::Mark mark_;
};

// ---------------------------------------------------------------- Vec

/// Growable array of trivially copyable values whose storage comes from an
/// explicit arena. Growth abandons the old block inside the arena, which is
/// reclaimed wholesale when the arena rewinds.
template <class T> struct Vec {
  T* data = nullptr;
  u32 len = 0;
  u32 cap = 0;

  void reserve(Arena& a, u32 n) {
    if (n <= cap) return;
    T* fresh = a.alloc_array<T>(n);
    if (len) copy_bytes(fresh, data, sizeof(T) * len);
    data = fresh;
    cap = n;
  }
  void push(Arena& a, const T& v) {
    if (len == cap) reserve(a, cap < 8 ? 8 : cap * 2);
    data[len++] = v;
  }
  void resize(Arena& a, u32 n) {
    reserve(a, n);
    len = n;
  }
  T& operator[](u32 i) { return data[i]; }
  const T& operator[](u32 i) const { return data[i]; }
  T& back() { return data[len - 1]; }
  const T& back() const { return data[len - 1]; }
  void pop() { --len; }
  void clear() { len = 0; }
  bool empty() const { return len == 0; }
  T* begin() { return data; }
  T* end() { return data + len; }
  const T* begin() const { return data; }
  const T* end() const { return data + len; }
};

// ---------------------------------------------------------------- sort

namespace detail {
template <class T, class Less> void insertion_sort(T* a, i64 n, Less& less) {
  for (i64 i = 1; i < n; i++) {
    T v = a[i];
    i64 j = i - 1;
    while (j >= 0 && less(v, a[j])) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = v;
  }
}
template <class T, class Less> void sift_down(T* a, i64 root, i64 n, Less& less) {
  for (;;) {
    i64 child = 2 * root + 1;
    if (child >= n) return;
    if (child + 1 < n && less(a[child], a[child + 1])) child++;
    if (!less(a[root], a[child])) return;
    swap(a[root], a[child]);
    root = child;
  }
}
template <class T, class Less> void heap_sort(T* a, i64 n, Less& less) {
  for (i64 i = n / 2 - 1; i >= 0; i--) sift_down(a, i, n, less);
  for (i64 i = n - 1; i > 0; i--) {
    swap(a[0], a[i]);
    sift_down(a, 0, i, less);
  }
}
template <class T, class Less> void intro_sort(T* a, i64 n, i32 depth, Less& less) {
  while (n > 24) {
    if (depth-- == 0) return heap_sort(a, n, less);
    // Median of three moved to a[0] as the pivot.
    i64 m = n / 2;
    if (less(a[m], a[0])) swap(a[m], a[0]);
    if (less(a[n - 1], a[0])) swap(a[n - 1], a[0]);
    if (less(a[n - 1], a[m])) swap(a[n - 1], a[m]);
    swap(a[0], a[m]);
    T pivot = a[0];
    i64 i = 0, j = n;
    for (;;) {
      do i++; while (i < n && less(a[i], pivot));
      do j--; while (less(pivot, a[j]));
      if (i >= j) break;
      swap(a[i], a[j]);
    }
    swap(a[0], a[j]);
    // Recurse into the smaller half, loop on the larger one.
    if (j < n - j - 1) {
      intro_sort(a, j, depth, less);
      a += j + 1;
      n -= j + 1;
    } else {
      intro_sort(a + j + 1, n - j - 1, depth, less);
      n = j;
    }
  }
  insertion_sort(a, n, less);
}
}  // namespace detail

/// Introsort (quicksort, heapsort fallback, insertion sort for short runs).
/// Deterministic, so both builds order ties identically.
template <class T, class Less> void sort(T* a, u32 n, Less less) {
  if (n < 2) return;
  i32 depth = 0;
  for (u32 k = n; k; k >>= 1) depth += 2;
  detail::intro_sort(a, (i64)n, depth, less);
}

// ---------------------------------------------------------------- hashing

inline u64 pack_point(i32 x, i32 y) { return ((u64)(u32)x << 32) | (u64)(u32)y; }

/// Open-addressing map from a packed 2D integer point to a u32 value.
/// `clear` is O(1): every slot carries the generation it was written in.
class PointMap {
 public:
  static constexpr u32 kNone = 0xffffffffu;

  /// Make room for `n` keys at load factor <= 0.5 and clear the map.
  void prepare(Arena& a, u32 n);
  /// Returns the value slot for `key`, inserting `kNone` when absent.
  u32& upsert(u64 key);
  u32 find(u64 key) const;

 private:
  u64* keys_ = nullptr;
  u32* vals_ = nullptr;
  u32* gens_ = nullptr;
  u32 mask_ = 0;
  u32 gen_ = 0;
  u32 shift_ = 64;
  u32 slot(u64 key) const { return (u32)((key * 0x9E3779B97F4A7C15ull) >> shift_); }
};

}  // namespace ll
