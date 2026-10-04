/** A triangle soup in millimetres: 9 floats per triangle, counter-clockwise seen from outside. */
export interface Mesh {
  name: string;
  positions: Float32Array;
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export const BED = { x: 220, y: 220, z: 250 } as const;

export const triangleCount = (m: Mesh) => m.positions.length / 9;

export function bounds(p: Float32Array): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = p[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  return { min, max };
}

export const size = (b: Bounds) => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] as const;

/** Signed volume (mm^3) by the divergence theorem; negative means inside-out. */
export function signedVolume(p: Float32Array): number {
  let v = 0;
  for (let i = 0; i < p.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = p.subarray(i, i + 9);
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

/** Flips every triangle in place when the mesh as a whole is inside-out. */
export function orientOutward(p: Float32Array): Float32Array {
  if (signedVolume(p) >= 0) return p;
  for (let i = 0; i < p.length; i += 9)
    for (let k = 0; k < 3; k++) {
      const t = p[i + 3 + k];
      p[i + 3 + k] = p[i + 6 + k];
      p[i + 6 + k] = t;
    }
  return p;
}

/** Copy that sits on the bed (min z = 0) centred on the build plate. */
export function placeOnBed(m: Mesh): Mesh {
  const b = bounds(m.positions);
  const dx = BED.x / 2 - (b.min[0] + b.max[0]) / 2;
  const dy = BED.y / 2 - (b.min[1] + b.max[1]) / 2;
  const dz = -b.min[2];
  const out = new Float32Array(m.positions.length);
  for (let i = 0; i < out.length; i += 3) {
    out[i] = m.positions[i] + dx;
    out[i + 1] = m.positions[i + 1] + dy;
    out[i + 2] = m.positions[i + 2] + dz;
  }
  return { name: m.name, positions: out };
}
