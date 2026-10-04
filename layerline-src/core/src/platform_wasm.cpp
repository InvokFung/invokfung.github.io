// wasm32 platform layer: memory comes from memory.grow, time from the host.
#include "base.h"

extern "C" __attribute__((import_module("env"), import_name("now_ms"))) double ll_host_now_ms();

namespace ll::platform {

void* acquire(usize bytes) {
  usize pages = (bytes + 0xffff) >> 16;
  usize old = __builtin_wasm_memory_grow(0, pages);
  if (old == (usize)-1) return nullptr;  // out of linear memory
  return reinterpret_cast<void*>(old << 16);
}

f64 now_ms() { return ll_host_now_ms(); }

}  // namespace ll::platform
