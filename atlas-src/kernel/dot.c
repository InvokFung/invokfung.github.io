// Integer dot products of one query against every passage vector, 16 dims
// per step with WebAssembly SIMD. Passage vectors are int8, the query is
// int16, and sums are exact in int32 (96 * 32767 * 127 < 2^31), so the
// result is bit-identical to the JavaScript fallback in engine.ts.
//
// Build: npm run kernel (clang 15+ with the wasm32 target).

#include <stdint.h>
#include <wasm_simd128.h>

__attribute__((export_name("dot_all")))
void dot_all(const int8_t *vectors, const int16_t *query, int32_t *out, int n, int k) {
  for (int i = 0; i < n; i++) {
    const int8_t *row = vectors + (long)i * k;
    v128_t acc = wasm_i32x4_splat(0);
    for (int d = 0; d < k; d += 16) {
      v128_t v = wasm_v128_load(row + d);
      acc = wasm_i32x4_add(acc, wasm_i32x4_dot_i16x8(wasm_i16x8_extend_low_i8x16(v), wasm_v128_load(query + d)));
      acc = wasm_i32x4_add(acc, wasm_i32x4_dot_i16x8(wasm_i16x8_extend_high_i8x16(v), wasm_v128_load(query + d + 8)));
    }
    out[i] = wasm_i32x4_extract_lane(acc, 0) + wasm_i32x4_extract_lane(acc, 1) + wasm_i32x4_extract_lane(acc, 2) +
             wasm_i32x4_extract_lane(acc, 3);
  }
}
