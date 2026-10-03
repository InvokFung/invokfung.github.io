# Builds the freestanding C++ slicing core two ways from the same sources:
#   make wasm   -> src/wasm/layerline.wasm (clang, wasm32, no libc, no STL)
#   make test   -> build/test_core (g++, native, sanitizers) and runs it
# `npm test` runs `make test` and then checks the wasm against the native build.

CORE := core/src/base.cpp core/src/geometry.cpp core/src/contours.cpp \
        core/src/polyops.cpp core/src/infill.cpp core/src/slicer.cpp
HEADERS := $(wildcard core/src/*.h)

COMMON := -std=c++17 -Wall -Wextra -Werror -fno-exceptions -fno-rtti \
          -fno-math-errno -ffp-contract=off

WASM := src/wasm/layerline.wasm
WASM_FLAGS := --target=wasm32 -O3 -flto -nostdlib -mbulk-memory \
              -Wglobal-constructors -fvisibility=hidden \
              -Wl,--no-entry -Wl,--strip-all -Wl,-z,stack-size=1048576 -Wl,--lto-O3

NATIVE_FLAGS := -O1 -g -fsanitize=address,undefined -fno-sanitize-recover=all

.PHONY: wasm test clean

wasm: $(WASM)

$(WASM): $(CORE) core/src/api.cpp core/src/platform_wasm.cpp $(HEADERS)
	@mkdir -p $(dir $@)
	clang++ $(COMMON) $(WASM_FLAGS) -o $@ $(CORE) core/src/api.cpp core/src/platform_wasm.cpp
	@echo "wasm: $$(wc -c < $@) bytes"

build/test_core: $(CORE) core/src/platform_native.cpp core/tests/test_core.cpp $(HEADERS)
	@mkdir -p build
	g++ $(COMMON) $(NATIVE_FLAGS) -Icore/src -o $@ $(CORE) core/src/platform_native.cpp core/tests/test_core.cpp

# Unit tests, then a summary of every fixture for the wasm parity test.
# Arenas never hand memory back by design, so leak checking is off.
test: build/test_core
	ASAN_OPTIONS=detect_leaks=0 ./build/test_core
	ASAN_OPTIONS=detect_leaks=0 ./build/test_core --summary tests/fixtures > build/native-summary.json

clean:
	rm -rf build
