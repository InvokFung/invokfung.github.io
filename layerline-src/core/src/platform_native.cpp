// Native platform layer for the unit tests: the same core, backed by malloc.
#include <chrono>
#include <cstdlib>

#include "base.h"

namespace ll::platform {

void* acquire(usize bytes) { return std::malloc(bytes); }

f64 now_ms() {
  using namespace std::chrono;
  return duration<double, std::milli>(steady_clock::now().time_since_epoch()).count();
}

}  // namespace ll::platform
