import { Engine, readIndex } from "./search/engine";
import { loadKernel } from "./search/kernel";
import type { EvalReport, Meta, PostText } from "./search/types";

const BASE = `${import.meta.env.BASE_URL}data/`;

async function fetchWithProgress(url: string, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}

export interface Atlas {
  meta: Meta;
  engine: Engine;
  evalReport: EvalReport | null;
}

/** Loads the metadata and binary index; reports progress as a 0..1 fraction of the expected bytes. */
export async function loadAtlas(onProgress: (f: number) => void): Promise<Atlas> {
  const expected = 3.5e6; // uncompressed size of meta.json + index.bin, for the progress bar only
  let got = 0;
  const tick = (n: number) => onProgress(Math.min(0.98, (got += n) / expected));
  const [metaBuf, bin, evalReport] = await Promise.all([
    fetchWithProgress(`${BASE}meta.json`, tick),
    fetchWithProgress(`${BASE}index.bin`, tick),
    fetch(`${BASE}eval.json`)
      .then((r) => (r.ok ? (r.json() as Promise<EvalReport>) : null))
      .catch(() => null),
  ]);
  const meta = JSON.parse(new TextDecoder().decode(metaBuf)) as Meta;
  const engine = new Engine(meta, readIndex(meta, bin));
  engine.useKernel(await loadKernel(engine.ix.C, meta.chunks.length, meta.lsa.k).catch(() => null));
  onProgress(1);
  return { meta, engine, evalReport };
}

const textCache = new Map<number, Promise<PostText>>();

export function postText(post: number): Promise<PostText> {
  let p = textCache.get(post);
  if (!p) {
    p = fetch(`${BASE}text/${post}.json`).then((r) => r.json() as Promise<PostText>);
    textCache.set(post, p);
  }
  return p;
}

export async function chunkText(meta: Meta, chunk: number): Promise<string> {
  const c = meta.chunks[chunk];
  const texts = await postText(c.p);
  return texts[chunk - meta.posts[c.p].first] ?? "";
}
