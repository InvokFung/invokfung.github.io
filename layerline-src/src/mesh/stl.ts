// STL reading and writing. Binary is recognised by its exact size
// (84 + 50 bytes per triangle), so binary files whose 80-byte header happens
// to start with "solid" are still read as binary.
import type { Mesh } from "./mesh";

export class StlError extends Error {}

export function parseStl(buf: ArrayBuffer, name = "model"): Mesh {
  if (buf.byteLength >= 84) {
    const n = new DataView(buf).getUint32(80, true);
    if (84 + n * 50 === buf.byteLength) return { name, positions: parseBinary(buf, n) };
  }
  const text = new TextDecoder().decode(buf);
  if (/^\s*solid/i.test(text) && /facet/i.test(text)) return { name, positions: parseAscii(text) };
  throw new StlError("Not an STL file: neither a binary STL of consistent size nor ASCII with facets.");
}

function parseBinary(buf: ArrayBuffer, n: number): Float32Array {
  const dv = new DataView(buf);
  const out = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12; // skip the stored normal; winding is what counts
    for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(o + k * 4, true);
  }
  return out;
}

function parseAscii(text: string): Float32Array {
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
  const vals: number[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) vals.push(Number(m[1]), Number(m[2]), Number(m[3]));
  if (vals.length === 0 || vals.length % 9 !== 0 || vals.some((v) => !Number.isFinite(v)))
    throw new StlError("ASCII STL with a vertex count that is not a multiple of three, or unreadable numbers.");
  return new Float32Array(vals);
}

export function writeBinaryStl(m: Mesh): ArrayBuffer {
  const n = m.positions.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const head = `Layerline ${m.name}`.slice(0, 80);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  const p = m.positions;
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50;
    const t = i * 9;
    const ux = p[t + 3] - p[t],
      uy = p[t + 4] - p[t + 1],
      uz = p[t + 5] - p[t + 2];
    const vx = p[t + 6] - p[t],
      vy = p[t + 7] - p[t + 1],
      vz = p[t + 8] - p[t + 2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    dv.setFloat32(o, nx, true);
    dv.setFloat32(o + 4, ny, true);
    dv.setFloat32(o + 8, nz, true);
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, p[t + k], true);
  }
  return buf;
}
