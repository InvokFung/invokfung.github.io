import wasm from "./kernel-wasm";

/** Integer dot products of an int16 query against every int8 passage vector. */
export interface Kernel {
  name: string;
  /** The returned view is reused by the next call. */
  dots(query: Int16Array): Int32Array;
}

/** The WebAssembly SIMD kernel, or null where SIMD is unavailable (callers fall back to JavaScript). */
export async function loadKernel(vectors: Int8Array, n: number, k: number): Promise<Kernel | null> {
  if (typeof WebAssembly === "undefined" || k % 16) return null;
  const bytes = Uint8Array.from(atob(wasm), (c) => c.charCodeAt(0));
  if (!WebAssembly.validate(bytes)) return null;
  const { instance } = await WebAssembly.instantiate(bytes);
  const { memory, dot_all, __heap_base } = instance.exports as unknown as {
    memory: WebAssembly.Memory;
    dot_all: (vectors: number, query: number, out: number, n: number, k: number) => void;
    __heap_base: WebAssembly.Global;
  };
  const align = (x: number) => (x + 15) & ~15;
  const vOff = align(__heap_base.value as number);
  const qOff = align(vOff + n * k);
  const oOff = align(qOff + k * 2);
  const end = oOff + n * 4;
  if (end > memory.buffer.byteLength) memory.grow(Math.ceil((end - memory.buffer.byteLength) / 65536));
  new Int8Array(memory.buffer, vOff, n * k).set(vectors);
  const q = new Int16Array(memory.buffer, qOff, k);
  const out = new Int32Array(memory.buffer, oOff, n);
  return {
    name: "WebAssembly SIMD",
    dots(query) {
      q.set(query);
      dot_all(vOff, qOff, oOff, n, k);
      return out;
    },
  };
}
