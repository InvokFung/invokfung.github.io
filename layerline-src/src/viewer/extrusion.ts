// Instanced extrusion rendering: one small prism per printed segment.
//
// The base mesh is a six-sided bead profile (flat top and bottom, rounded
// sides) swept from t = 0 to t = 1. The vertex shader places it between the
// segment's endpoints, so a 300k-segment print is one draw call with 32 bytes
// of instance data per segment. Visibility by layer is the instance count;
// visibility by feature, the highlight of the current layer and the
// partially-extruded segment under the nozzle are uniforms.
import {
  BufferAttribute,
  Color,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  ShaderMaterial,
  type IUniform,
} from "three";
import { SEG_FLOATS } from "./store";

// Profile in (side, up) units of (half width, half height), counter-clockwise
// seen from the front, with the smooth-shading normal of each vertex.
const PROFILE: [number, number, number, number][] = [
  [1, 0, 1, 0],
  [0.55, 1, 0.42, 0.91],
  [-0.55, 1, -0.42, 0.91],
  [-1, 0, -1, 0],
  [-0.55, -1, -0.42, -0.91],
  [0.55, -1, 0.42, -0.91],
];

function baseGeometry(geo: InstancedBufferGeometry) {
  const n = PROFILE.length;
  const pos = new Float32Array(n * 2 * 3),
    nrm = new Float32Array(n * 2 * 3);
  for (let e = 0; e < 2; e++)
    PROFILE.forEach(([x, y, nx, ny], i) => {
      const k = (e * n + i) * 3;
      pos.set([x, y, e], k);
      nrm.set([nx, ny, 0], k);
    });
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i, j, j + n, i, j + n, i + n);
  }
  for (let i = 1; i < n - 1; i++) {
    idx.push(0, i + 1, i); // back cap
    idx.push(n, n + i, n + i + 1); // front cap
  }
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("normal", new BufferAttribute(nrm, 3));
  geo.setIndex(idx);
}

/** A geometry whose instance buffer is `seg` itself (shared, not copied). */
export function extrusionGeometry(seg: Float32Array) {
  const geo = new InstancedBufferGeometry();
  baseGeometry(geo);
  const buf = new InstancedInterleavedBuffer(seg, SEG_FLOATS, 1);
  buf.setUsage(DynamicDrawUsage);
  geo.setAttribute("iStart", new InterleavedBufferAttribute(buf, 4, 0));
  geo.setAttribute("iEnd", new InterleavedBufferAttribute(buf, 4, 4));
  geo.instanceCount = 0;
  return { geo, buf };
}

const vertex = /* glsl */ `
attribute vec4 iStart; // x, y, z, kind + half height
attribute vec4 iEnd;   // x, y, z, layer
uniform float uWidth;
uniform float uLayer;
uniform float uCut;
uniform float uCutFrac;
uniform int uMask;
uniform float uDim;
uniform vec3 uColors[5];
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vColor;
varying float vHot;

void main() {
  float kind = floor(iStart.w);
  float hh = fract(iStart.w);
  int k = int(kind + 0.5);
  if (((uMask >> k) & 1) == 0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume
    return;
  }
  vec3 a = iStart.xyz;
  vec3 b = iEnd.xyz;
  if (float(gl_InstanceID) == uCut) b = mix(a, b, uCutFrac);
  vec3 d = b - a;
  float len = length(d);
  vec3 dir = len > 1e-5 ? d / len : vec3(1.0, 0.0, 0.0);
  vec3 up = vec3(0.0, 0.0, 1.0);
  vec3 side = vec3(-dir.y, dir.x, 0.0);
  // Reach half a line width past each end, so corners close like a real bead.
  float ext = 0.5 * uWidth;
  vec3 base = mix(a - dir * ext, b + dir * ext, position.z);
  vec3 p = base + side * (position.x * 0.5 * uWidth) + up * (position.y * hh);
  vec3 n = side * normal.x + up * normal.y;

  float layer = iEnd.w;
  float cur = 1.0 - step(0.5, abs(layer - uLayer));
  vec3 c = uColors[k];
  // Older layers recede; alternate layers differ slightly so layer lines read.
  float shade = mix(1.0, 0.5 + 0.08 * mod(layer, 2.0), uDim * (1.0 - cur));
  vColor = c * shade;
  vHot = cur;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = mv.xyz;
  vNormal = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vColor;
varying float vHot;

void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(-vView);
  vec3 key = normalize(vec3(0.35, 0.85, 0.4));
  vec3 fill = normalize(vec3(-0.7, 0.1, 0.5));
  float d1 = max(dot(n, key), 0.0);
  float d2 = max(dot(n, fill), 0.0);
  float spec = pow(max(dot(n, normalize(key + v)), 0.0), 40.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 col = vColor * (0.24 + 0.72 * d1 + 0.22 * d2) + vec3(0.22 * spec) + vColor * rim * (0.18 + 0.3 * vHot);
  col += vColor * 0.16 * vHot;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export interface ExtrusionUniforms {
  [name: string]: IUniform;
  uWidth: IUniform<number>;
  uLayer: IUniform<number>;
  uCut: IUniform<number>;
  uCutFrac: IUniform<number>;
  uMask: IUniform<number>;
  uDim: IUniform<number>;
  uColors: IUniform<Color[]>;
}

export function extrusionMaterial(colors: string[]) {
  const uniforms: ExtrusionUniforms = {
    uWidth: { value: 0.45 },
    uLayer: { value: 0 },
    uCut: { value: -1 },
    uCutFrac: { value: 1 },
    uMask: { value: 0x1f },
    uDim: { value: 1 },
    uColors: { value: colors.map((c) => new Color(c)) },
  };
  return new ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment });
}
