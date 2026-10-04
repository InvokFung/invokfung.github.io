// Procedural sample models. The same generators feed the app and the test
// fixtures (scripts/fixtures.ts), so the parity test slices exactly what a
// visitor sees.
import { ExtrudeGeometry, Path as ShapePath, Shape } from "three";
import { orientOutward, type Mesh } from "./mesh";

const TAU = Math.PI * 2;

class Builder {
  private out: number[] = [];
  tri(a: number[], b: number[], c: number[]) {
    this.out.push(...a, ...b, ...c);
  }
  quad(a: number[], b: number[], c: number[], d: number[]) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
  done(): Float32Array {
    return orientOutward(new Float32Array(this.out));
  }
}

/** The classic 20 mm calibration cube. */
export function cube(s = 20): Mesh {
  const v = (i: number) => [i & 1 ? s : 0, i & 2 ? s : 0, i & 4 ? s : 0];
  const faces = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ];
  const b = new Builder();
  for (const [a, c, d, e] of faces) b.quad(v(a), v(c), v(d), v(e));
  return { name: "Calibration cube", positions: b.done() };
}

export function cylinder(r = 10, h = 12, n = 128): Mesh {
  const b = new Builder();
  for (let i = 0; i < n; i++) {
    const a0 = (TAU * i) / n,
      a1 = (TAU * (i + 1)) / n;
    const p0 = [r * Math.cos(a0), r * Math.sin(a0)],
      p1 = [r * Math.cos(a1), r * Math.sin(a1)];
    b.quad([...p0, 0], [...p1, 0], [...p1, h], [...p0, h]);
    b.tri([0, 0, 0], [...p1, 0], [...p0, 0]);
    b.tri([0, 0, h], [...p0, h], [...p1, h]);
  }
  return { name: "Cylinder", positions: b.done() };
}

/** A torus lying flat: every layer is a ring, so every layer has a hole. */
export function torus(R = 18, r = 7, nu = 128, nv = 64): Mesh {
  const b = new Builder();
  const at = (i: number, j: number) => {
    const u = (TAU * i) / nu,
      v = (TAU * j) / nv;
    return [(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v) + r];
  };
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) b.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
  return { name: "Torus", positions: b.done() };
}

/**
 * A 20-tooth spur gear (module 2, 20 degree pressure angle) with true involute
 * flanks, a bore with a keyway and five lightening holes, extruded 8 mm.
 */
export function gear(teeth = 20, module = 2, height = 8): Mesh {
  const pa = (20 * Math.PI) / 180;
  const rp = (module * teeth) / 2;
  const rb = rp * Math.cos(pa);
  const ra = rp + module;
  const rf = rp - 1.25 * module;
  const inv = (a: number) => Math.tan(a) - a;
  const halfAt = (r: number) => Math.PI / (2 * teeth) + inv(pa) - inv(Math.acos(Math.min(1, rb / r)));
  const pts: [number, number][] = [];
  const polar = (r: number, a: number) => pts.push([r * Math.cos(a), r * Math.sin(a)]);
  const r0 = Math.max(rb, rf);
  const steps = 8;
  for (let k = 0; k < teeth; k++) {
    const c = (TAU * k) / teeth;
    if (rb > rf) polar(rf, c - halfAt(r0));
    for (let s = 0; s <= steps; s++) {
      const r = r0 + ((ra - r0) * s) / steps;
      polar(r, c - halfAt(r));
    }
    for (let s = 1; s < 4; s++) polar(ra, c - halfAt(ra) + (2 * halfAt(ra) * s) / 4);
    for (let s = steps; s >= 0; s--) {
      const r = r0 + ((ra - r0) * s) / steps;
      polar(r, c + halfAt(r));
    }
    if (rb > rf) polar(rf, c + halfAt(r0));
    // root arc to the next tooth
    const next = (TAU * (k + 1)) / teeth;
    const from = c + halfAt(r0),
      to = next - halfAt(r0);
    for (let s = 1; s < 4; s++) polar(rf, from + ((to - from) * s) / 4);
  }
  const shape = new Shape(pts.map(([x, y]) => ({ x, y }) as never));
  const circle = (cx: number, cy: number, r: number, n: number) => {
    const p = new ShapePath();
    for (let i = 0; i <= n; i++) {
      const a = (-TAU * i) / n;
      const x = cx + r * Math.cos(a),
        y = cy + r * Math.sin(a);
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    return p;
  };
  // Bore with a keyway: a circle with a rectangular notch at the top.
  const bore = new ShapePath();
  const br = 5,
    kw = 1.6,
    kd = 1.6;
  const ka = Math.asin(kw / br);
  bore.moveTo(br * Math.cos(Math.PI / 2 - ka), br * Math.sin(Math.PI / 2 - ka));
  const boreSteps = 48;
  for (let i = 1; i <= boreSteps; i++) {
    const a = Math.PI / 2 - ka - ((TAU - 2 * ka) * i) / boreSteps;
    bore.lineTo(br * Math.cos(a), br * Math.sin(a));
  }
  bore.lineTo(-kw, br + kd);
  bore.lineTo(kw, br + kd);
  shape.holes.push(bore);
  for (let i = 0; i < 5; i++) {
    const a = (TAU * i) / 5 + 0.7 * Math.PI; // keeps clear of the keyway at 90 degrees
    shape.holes.push(circle(10.5 * Math.cos(a), 10.5 * Math.sin(a), 3.2, 40));
  }
  return { name: "Spur gear", positions: extrude(shape, height) };
}

function extrude(shape: Shape, depth: number): Float32Array {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1, steps: 1 });
  const src = (g.index ? g.toNonIndexed() : g).getAttribute("position").array as Float32Array;
  g.dispose();
  return orientOutward(new Float32Array(src));
}

/**
 * A hollow vase whose five-lobed section swells, narrows and twists through
 * 72 degrees on the way up: 2 mm walls, a 2 mm floor and an open top.
 */
export function vase(height = 64, nu = 180, nv = 128): Mesh {
  const wall = 2,
    floor = 2;
  const outerR = (u: number, t: number) => {
    const base = 17 + 7 * Math.sin(Math.PI * (0.15 + 0.85 * t)) - 3 * t;
    return base * (1 + 0.11 * Math.cos(5 * (u + t * ((72 * Math.PI) / 180))));
  };
  const ring = (r: (u: number) => number, z: number) =>
    Array.from({ length: nu }, (_, i) => {
      const u = (TAU * i) / nu;
      const rr = r(u);
      return [rr * Math.cos(u), rr * Math.sin(u), z];
    });
  const b = new Builder();
  const outer: number[][][] = [];
  const inner: number[][][] = [];
  for (let j = 0; j <= nv; j++) {
    const t = j / nv;
    outer.push(ring((u) => outerR(u, t), height * t));
    const zi = floor + (height - floor) * t;
    const ti = zi / height;
    inner.push(ring((u) => outerR(u, ti) - wall, zi));
  }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const i1 = (i + 1) % nu;
      b.quad(outer[j][i], outer[j][i1], outer[j + 1][i1], outer[j + 1][i]); // outside, facing out
      b.quad(inner[j][i], inner[j + 1][i], inner[j + 1][i1], inner[j][i1]); // inside, facing the cavity
    }
  const top = outer[nv],
    itop = inner[nv],
    bot = outer[0],
    ibot = inner[0];
  for (let i = 0; i < nu; i++) {
    const i1 = (i + 1) % nu;
    b.quad(top[i], top[i1], itop[i1], itop[i]); // rim
    b.tri([0, 0, 0], bot[i1], bot[i]); // underside
    b.tri([0, 0, floor], ibot[i], ibot[i1]); // floor of the cavity
  }
  return { name: "Twisted vase", positions: b.done() };
}

export interface Sample {
  id: string;
  label: string;
  blurb: string;
  make: () => Mesh;
}

export const SAMPLES: Sample[] = [
  { id: "cube", label: "Cube", blurb: "20 mm calibration cube", make: () => cube() },
  { id: "gear", label: "Gear", blurb: "Involute spur gear, 6 holes", make: () => gear() },
  { id: "torus", label: "Torus", blurb: "Every layer is a ring", make: () => torus() },
  { id: "vase", label: "Vase", blurb: "Twisted, hollow, 2 mm walls", make: () => vase() },
];
