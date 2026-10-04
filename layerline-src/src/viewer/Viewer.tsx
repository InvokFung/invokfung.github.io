// The 3D preview: build plate, model, streamed toolpaths, the section plane
// and the nozzle. Model space is the printer's (millimetres, Z up, origin at
// the front-left corner of the bed); one group maps it into three.js space.
import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Component, memo, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  EdgesGeometry,
  FrontSide,
  Group,
  Mesh as ThreeMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Plane,
  ShaderMaterial,
  Vector3,
  type InstancedBufferGeometry,
  type InstancedInterleavedBuffer,
  type PerspectiveCamera,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { DEFAULT_PROFILE } from "../gcode/gcode";
import { BED, size, type Bounds, type Mesh } from "../mesh/mesh";
import { KIND_COLORS, SECTION_COLOR, TRAVEL_COLOR } from "../ui/theme";
import { extrusionGeometry, extrusionMaterial, type ExtrusionUniforms } from "./extrusion";
import { buildTimeline, sampleTimeline, type PlaybackSample, type Timeline } from "./playback";
import type { PreviewStore } from "./store";

/** Shared, mutable playback state: the dock writes it, the render loop reads it. */
export interface Playback {
  playing: boolean;
  /** simulated seconds per real second */
  speed: number;
  /** seconds into the current layer; Infinity = layer complete */
  t: number;
  layer: number;
  lastProp: number;
  tl: Timeline | null;
}

export const newPlayback = (): Playback => ({ playing: false, speed: 25, t: Infinity, layer: 0, lastProp: 0, tl: null });

export interface ViewerProps {
  mesh: Mesh | null;
  box: Bounds | null;
  /** changes when the camera should re-frame the model */
  fitKey: string;
  store: PreviewStore | null;
  /** layers received so far (re-renders when it grows) */
  received: number;
  streaming: boolean;
  layer: number;
  mode: "preview" | "model";
  /** printed kinds 0..4, then travel */
  visible: boolean[];
  ghost: boolean;
  lineWidth: number;
  playback: Playback;
  /** seconds before each layer, from the estimate (prefix sums), for the print clock */
  clockBase: Float64Array | null;
  clockRef: RefObject<HTMLSpanElement | null>;
  onLayer(layer: number, source: "drag" | "play"): void;
  onPlayEnd(): void;
}

const toWorld = (x: number, y: number, z: number) => new Vector3(x - BED.x / 2, z, BED.y / 2 - y);

/** Keeps the page usable when WebGL cannot start: slicing and export do not need it. */
class GLBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (this.state.error)
      return (
        <div className="gl-error" role="status">
          <b>The 3D preview could not start</b>
          <span>WebGL is unavailable here ({this.state.error}). Slicing, the estimate and G-code export still work.</span>
        </div>
      );
    return this.props.children;
  }
}

export default function Viewer(props: ViewerProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const label = useRef<HTMLDivElement>(null);
  const { store, received, box } = props;
  const L = store && received > 0 ? Math.max(0, Math.min(props.layer, received - 1)) : 0;
  return (
    <div ref={wrap} className="viewer">
      <GLBoundary>
        <Canvas
          flat
          dpr={[1, 2]}
          frameloop={onScreen ? "always" : "never"}
          camera={{ fov: 35, near: 0.5, far: 5000, position: [140, 120, 200] }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.localClippingEnabled = true;
          }}
          aria-label="3D preview of the model and its toolpaths"
        >
          <Scene {...props} label={label} />
        </Canvas>
      </GLBoundary>
      {store && received > 0 && box && (
        <div ref={label} className="zlabel" aria-hidden>
          <b>z {store.tp.layerZ[L].toFixed(2)}</b>
          <span>
            L{L + 1}/{store.totalLayers}
          </span>
          {props.streaming && L === received - 1 && <span className="live">slicing</span>}
        </div>
      )}
    </div>
  );
}

type Label = RefObject<HTMLDivElement | null>;

function Scene(p: ViewerProps & { label: Label }) {
  const { store, received, box, mode } = p;
  const sliced = !!store && received > 0;
  const L = sliced ? Math.max(0, Math.min(p.layer, received - 1)) : 0;
  const z = sliced ? store!.tp.layerZ[L] : p.streaming ? 0 : box ? box.max[2] + 1 : 0;
  const showPaths = mode === "preview" && sliced;

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[120, 220, 160]} intensity={1.7} />
      <directionalLight position={[-160, 90, -120]} intensity={0.6} color="#818cf8" />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={8} maxDistance={1200} maxPolarAngle={Math.PI / 2 - 0.03} />
      <CameraRig box={box} fitKey={p.fitKey} />
      <group rotation-x={-Math.PI / 2} position={[-BED.x / 2, 0, BED.y / 2]}>
        <Bed />
        {p.mesh && <Model mesh={p.mesh} z={z} solid={!showPaths} clipBelow={sliced || p.streaming} ghost={p.ghost || !showPaths} />}
        <Extrusions {...p} show={showPaths} />
        {sliced && <SectionContour store={store!} layer={L} received={received} z={z} />}
        {showPaths && p.visible[5] && <Travel store={store!} layer={L} received={received} z={z} />}
        {sliced && box && <SectionHandle box={box} z={z} layer={L} store={store!} received={received} onLayer={p.onLayer} label={p.label} />}
      </group>
    </>
  );
}

/* ------------------------------------------------------------------ camera */

function CameraRig({ box, fitKey }: { box: Bounds | null; fitKey: string }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const viewport = useThree((s) => s.size);
  useEffect(() => {
    if (!box || !controls) return;
    const [sx, sy, sz] = size(box);
    const c = toWorld((box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, sz * 0.42);
    const r = Math.max(6, Math.hypot(sx, sy, sz) / 2);
    const half = (camera.fov * Math.PI) / 360;
    // Fit a sphere around the model into the clear middle of the viewport
    // (the side panels cover the edges on wide screens).
    const aspect = Math.min(viewport.width / Math.max(1, viewport.height), 1.15);
    const halfW = Math.atan(Math.tan(half) * aspect);
    const d = (r / Math.sin(Math.min(half, halfW))) * 1.0;
    const dir = new Vector3(0.6, 0.62, 1).normalize();
    camera.position.copy(c).addScaledVector(dir, d);
    controls.target.copy(c);
    controls.update();
    // The layout can still be settling on the first frame; refit once it has.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, controls, viewport.width > viewport.height]);
  return null;
}

/* ------------------------------------------------------------------ bed */

const bedVertex = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const bedFragment = /* glsl */ `
varying vec2 vP;
uniform vec2 uSize;
float grid(vec2 p, float step, float width) {
  vec2 g = abs(fract(p / step - 0.5) - 0.5) * step / fwidth(p);
  return 1.0 - min(min(g.x, g.y) / width, 1.0);
}
void main() {
  vec2 p = vP + uSize * 0.5; // mm from the front-left corner
  float minor = grid(p, 10.0, 1.0);
  float major = grid(p, 50.0, 1.2);
  vec2 e = min(p, uSize - p);
  float edge = 1.0 - smoothstep(0.0, 1.6 * length(fwidth(p)), min(e.x, e.y));
  vec2 c = abs(p - uSize * 0.5);
  float cross = (1.0 - smoothstep(0.0, 1.2 * fwidth(p).x, min(c.x, c.y))) * step(max(c.x, c.y), 6.0);
  float r = length(p - uSize * 0.5) / (uSize.x * 0.72);
  // Designed in sRGB, converted to linear for the output encoder.
  vec3 base = mix(vec3(0.058, 0.08, 0.14), vec3(0.036, 0.05, 0.09), clamp(r, 0.0, 1.0));
  vec3 srgb = base + vec3(0.6, 0.68, 0.85) * (0.045 * minor + 0.075 * major + 0.3 * edge + 0.16 * cross);
  gl_FragColor = vec4(pow(srgb, vec3(2.2)), 1.0);
  #include <colorspace_fragment>
}
`;

const Bed = memo(function Bed() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uSize: { value: [BED.x, BED.y] } },
        vertexShader: bedVertex,
        fragmentShader: bedFragment,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    [],
  );
  return (
    <mesh position={[BED.x / 2, BED.y / 2, -0.02]} material={mat} renderOrder={-1}>
      <planeGeometry args={[BED.x, BED.y]} />
    </mesh>
  );
});

/* ------------------------------------------------------------------ model */

const below = new Plane(new Vector3(0, -1, 0), 0); // keeps y <= constant
const above = new Plane(new Vector3(0, 1, 0), 0); // keeps y >= -constant

function Model({ mesh, z, solid, clipBelow, ghost }: { mesh: Mesh; z: number; solid: boolean; clipBelow: boolean; ghost: boolean }) {
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(mesh.positions, 3));
    g.computeVertexNormals();
    return g;
  }, [mesh]);
  const edges = useMemo(() => (mesh.positions.length / 9 <= 60000 ? new EdgesGeometry(geo, 28) : null), [geo, mesh]);
  useEffect(() => () => (geo.dispose(), edges?.dispose()), [geo, edges]);

  const mats = useMemo(
    () => ({
      solid: new MeshStandardMaterial({ color: "#a3acbd", roughness: 0.55, metalness: 0.08, clippingPlanes: [below], side: FrontSide }),
      cut: new MeshBasicMaterial({ color: "#3730a3", clippingPlanes: [below], side: BackSide }),
      ghost: new MeshStandardMaterial({
        color: "#94a3b8",
        roughness: 0.6,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        clippingPlanes: [above],
      }),
      edges: new MeshBasicMaterial({ color: "#a5b4fc", transparent: true, opacity: 0.32, depthWrite: false, clippingPlanes: [above] }),
    }),
    [],
  );
  // Clipping planes live in world space, where the model's z is y.
  below.constant = clipBelow ? z : 1e6;
  above.constant = -z;

  return (
    <>
      {solid && (
        <>
          <mesh geometry={geo} material={mats.solid} />
          <mesh geometry={geo} material={mats.cut} />
        </>
      )}
      {ghost && (
        <>
          <mesh geometry={geo} material={mats.ghost} renderOrder={2} />
          {edges && (
            <lineSegments geometry={edges} renderOrder={2}>
              <primitive object={mats.edges} attach="material" />
            </lineSegments>
          )}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ toolpaths + nozzle */

function Extrusions(p: ViewerProps & { show: boolean }) {
  const mesh = useRef<ThreeMesh>(null);
  const nozzle = useRef<Group>(null);
  const glow = useRef<ThreeMesh>(null);
  const mat = useMemo(() => extrusionMaterial(KIND_COLORS), []);
  const gpu = useRef<{ store: PreviewStore; seg: Float32Array; geo: InstancedBufferGeometry; buf: InstancedInterleavedBuffer; uploaded: number } | null>(null);
  const sample = useRef<PlaybackSample>({ x: 0, y: 0, count: 0, cut: -1, frac: 1, extruding: false });
  const props = useRef(p);
  props.current = p;
  const lastClock = useRef("");

  useEffect(() => () => gpu.current?.geo.dispose(), []);

  const u = mat.uniforms as ExtrusionUniforms;
  u.uWidth.value = p.lineWidth;
  u.uMask.value = p.visible.slice(0, 5).reduce((m, v, i) => m | (v ? 1 << i : 0), 0);

  useFrame((_, delta) => {
    const { store, received, playback: pb, show } = props.current;
    const m = mesh.current,
      nz = nozzle.current;
    if (!m || !nz) return;
    if (!store || received === 0 || !show) {
      m.visible = false;
      nz.visible = false;
      return;
    }

    // Upload what arrived since the last frame (the store's array is the GPU buffer's source).
    let g = gpu.current;
    if (!g || g.store !== store || g.seg !== store.seg) {
      g?.geo.dispose();
      const { geo, buf } = extrusionGeometry(store.seg);
      g = gpu.current = { store, seg: store.seg, geo, buf, uploaded: store.segCount };
      m.geometry = geo;
    } else if (store.segCount > g.uploaded) {
      g.buf.addUpdateRange(g.uploaded * 8, (store.segCount - g.uploaded) * 8);
      g.buf.needsUpdate = true;
      g.uploaded = store.segCount;
    }

    // Layer changes from outside (scrubber, keys, streaming) restart or complete the layer.
    if (props.current.layer !== pb.lastProp) {
      pb.lastProp = props.current.layer;
      if (pb.lastProp !== pb.layer) {
        pb.layer = pb.lastProp;
        pb.t = pb.playing ? 0 : Infinity;
        pb.tl = null;
      }
    }
    const L = Math.max(0, Math.min(pb.layer, received - 1));
    if (pb.playing) {
      if (!pb.tl || pb.tl.layer !== L) pb.tl = buildTimeline(store, L, DEFAULT_PROFILE);
      if (!Number.isFinite(pb.t)) pb.t = 0;
      pb.t += Math.min(delta, 0.1) * pb.speed;
      if (pb.t >= pb.tl.duration) {
        if (L + 1 < received) {
          pb.layer = L + 1;
          pb.t = 0;
          pb.tl = buildTimeline(store, L + 1, DEFAULT_PROFILE);
          props.current.onLayer(L + 1, "play");
        } else if (!props.current.streaming) {
          pb.playing = false;
          pb.t = Infinity;
          props.current.onPlayEnd();
        } else pb.t = pb.tl.duration; // wait for the next layer to arrive
      }
    }
    const layer = Math.max(0, Math.min(pb.layer, received - 1));
    const s = sample.current;
    let z = store.tp.layerZ[layer];
    if (pb.tl && pb.tl.layer === layer && Number.isFinite(pb.t)) {
      sampleTimeline(pb.tl, pb.t, s);
    } else {
      s.count = store.layerSegEnd[layer];
      s.cut = -1;
      s.extruding = false;
      const ends = store.layerEnds(layer);
      if (ends) [s.x, s.y] = ends.last;
      else z = -1000;
    }
    m.visible = true;
    (m.geometry as InstancedBufferGeometry).instanceCount = s.count;
    u.uLayer.value = layer;
    u.uCut.value = s.cut;
    u.uCutFrac.value = s.frac;

    // The nozzle shows while it prints (or is paused mid-layer), not over a finished layer.
    nz.visible = z > -1000 && !!pb.tl && pb.tl.layer === layer && Number.isFinite(pb.t) && pb.t < pb.tl.duration;
    nz.position.set(s.x, s.y, z + (s.extruding ? 0 : 0.15));
    if (glow.current) (glow.current.material as MeshBasicMaterial).opacity = s.extruding ? 0.9 : 0.25;

    // Print clock: estimated time at the nozzle's position.
    const el = props.current.clockRef.current,
      base = props.current.clockBase;
    if (el && base && layer < base.length - 1) {
      const lt = base[layer + 1] - base[layer];
      const f = pb.tl && pb.tl.layer === layer && Number.isFinite(pb.t) ? Math.min(1, pb.t / Math.max(1e-6, pb.tl.duration)) : 1;
      const text = clock(base[layer] + f * lt);
      if (text !== lastClock.current) el.textContent = lastClock.current = text;
    }
  });

  return (
    <>
      <mesh ref={mesh} material={mat} frustumCulled={false} visible={false} />
      <group ref={nozzle} visible={false}>
        <NozzleModel glow={glow} />
      </group>
    </>
  );
}

function clock(s: number) {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const NozzleModel = memo(function NozzleModel({ glow }: { glow: RefObject<ThreeMesh | null> }) {
  const mats = useMemo(
    () => ({
      brass: new MeshStandardMaterial({ color: "#d1a24f", metalness: 0.85, roughness: 0.32 }),
      block: new MeshStandardMaterial({ color: "#8a94a6", metalness: 0.65, roughness: 0.42 }),
      sink: new MeshStandardMaterial({ color: "#3b4456", metalness: 0.5, roughness: 0.5 }),
      glow: new MeshBasicMaterial({ color: "#fbbf24", transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false }),
    }),
    [],
  );
  return (
    <group>
      <mesh position={[0, 0, 1]} rotation-x={-Math.PI / 2} material={mats.brass}>
        <coneGeometry args={[1.05, 2, 24]} />
      </mesh>
      <mesh position={[0, 0, 3.1]} rotation-x={Math.PI / 2} material={mats.brass}>
        <cylinderGeometry args={[2.4, 2.4, 2.2, 6]} />
      </mesh>
      <mesh position={[2.6, 0, 7.6]} material={mats.block}>
        <boxGeometry args={[11, 8, 7]} />
      </mesh>
      <mesh position={[0, 0, 14]} rotation-x={Math.PI / 2} material={mats.sink}>
        <cylinderGeometry args={[1.3, 1.3, 6, 16]} />
      </mesh>
      {[17, 18.8, 20.6, 22.4].map((h) => (
        <mesh key={h} position={[0, 0, h]} rotation-x={Math.PI / 2} material={mats.sink}>
          <cylinderGeometry args={[5, 5, 0.8, 28]} />
        </mesh>
      ))}
      <mesh ref={glow} position={[0, 0, 0.25]} material={mats.glow}>
        <sphereGeometry args={[0.9, 16, 12]} />
      </mesh>
    </group>
  );
});

/* ------------------------------------------------------------------ section */

function SectionContour({ store, layer, received, z }: { store: PreviewStore; layer: number; received: number; z: number }) {
  const pts = useMemo(() => {
    const seg = store.contourSegments(layer);
    const out: [number, number, number][] = [];
    for (let i = 0; i < seg.length; i += 2) out.push([seg[i], seg[i + 1], z + 0.04]);
    return out;
    // `received` re-reads the store once the layer has arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, layer, received >= layer + 1, z]);
  if (pts.length < 2) return null;
  return (
    <>
      <Line points={pts} segments color={SECTION_COLOR} lineWidth={5} transparent opacity={0.18} depthWrite={false} toneMapped={false} />
      <Line points={pts} segments color={SECTION_COLOR} lineWidth={1.6} transparent opacity={0.95} depthWrite={false} toneMapped={false} />
    </>
  );
}

function Travel({ store, layer, received, z }: { store: PreviewStore; layer: number; received: number; z: number }) {
  const pts = useMemo(() => {
    const seg = store.travelSegments(layer);
    const out: [number, number, number][] = [];
    for (let i = 0; i < seg.length; i += 2) out.push([seg[i], seg[i + 1], z + 0.35]);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, layer, received >= layer + 1, z]);
  if (pts.length < 2) return null;
  return <Line points={pts} segments color={TRAVEL_COLOR} lineWidth={1} dashed dashSize={1.2} gapSize={0.9} transparent opacity={0.85} toneMapped={false} />;
}

/** The plane at the current layer, a height rail with ticks and a handle that drags it. */
function SectionHandle({
  box,
  z,
  layer,
  store,
  received,
  onLayer,
  label,
}: {
  box: Bounds;
  z: number;
  layer: number;
  store: PreviewStore;
  received: number;
  onLayer: ViewerProps["onLayer"];
  label: Label;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const [hover, setHover] = useState(false);
  const [drag, setDrag] = useState(false);
  const [sx, sy, sz] = size(box);
  const m = Math.max(3, Math.max(sx, sy) * 0.1);
  const x0 = box.min[0] - m,
    y0 = box.min[1] - m,
    x1 = box.max[0] + m,
    y1 = box.max[1] + m;
  const s = Math.min(2.4, Math.max(0.7, Math.max(sx, sy, sz) * 0.03));

  const rect = useMemo(
    () =>
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ].map(([x, y]) => [x, y, 0] as [number, number, number]),
    [x0, y0, x1, y1],
  );
  const ticks = useMemo(() => {
    const zmax = box.max[2];
    const step = zmax > 120 ? 5 : zmax > 40 ? 2 : 1;
    const out: [number, number, number][] = [
      [x1, y0, 0],
      [x1, y0, zmax],
    ];
    for (let h = 0; h <= zmax + 1e-6; h += step) {
      const major = Math.round(h) % (step * 5) === 0;
      out.push([x1, y0, h], [x1 + (major ? 2.2 : 1.1) * s, y0, h]);
    }
    return out;
  }, [box, x1, y0, s]);

  const plane = useMemo(() => new Plane(), []);
  const hit = useMemo(() => new Vector3(), []);
  const dir = useMemo(() => new Vector3(), []);

  const layerAt = (h: number) => {
    const zs = store.tp.layerZ;
    let lo = 0,
      hi = received - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (zs[mid] < h) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(zs[lo - 1] - h) < Math.abs(zs[lo] - h)) lo--;
    return lo;
  };

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    setDrag(true);
    if (controls) controls.enabled = false;
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!drag) return;
    e.stopPropagation();
    camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    plane.setFromNormalAndCoplanarPoint(dir, toWorld(x1, y0, 0));
    if (e.ray.intersectPlane(plane, hit)) {
      const L = layerAt(hit.y);
      if (L !== layer) onLayer(L, "drag");
    }
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    (e.target as unknown as Element).releasePointerCapture?.(e.pointerId);
    setDrag(false);
    if (controls) controls.enabled = true;
  };
  useEffect(() => {
    document.body.style.cursor = hover || drag ? "ns-resize" : "";
  }, [hover, drag]);
  useEffect(() => () => void (document.body.style.cursor = ""), []);

  const active = hover || drag;
  useEffect(() => {
    label.current?.classList.toggle("on", active);
  }, [active, label]);

  // The z label is plain DOM next to the canvas, moved to the handle's screen position.
  const at = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size: px }) => {
    const el = label.current;
    if (!el) return;
    at.copy(toWorld(x1, y0, z)).project(camera);
    const x = Math.min((at.x * 0.5 + 0.5) * px.width + 14 + s * 6, px.width - el.offsetWidth - 6),
      y = (-at.y * 0.5 + 0.5) * px.height;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translateY(-50%)`;
    el.style.visibility = at.z < 1 ? "visible" : "hidden";
  });
  return (
    <>
      <Line points={ticks} segments color="#64748b" lineWidth={1} transparent opacity={0.7} />
      <group position={[0, 0, z + 0.02]}>
        <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, 0]} renderOrder={3}>
          <planeGeometry args={[x1 - x0, y1 - y0]} />
          <meshBasicMaterial color="#a5b4fc" transparent opacity={0.045} depthWrite={false} side={DoubleSide} />
        </mesh>
        <Line points={rect} color="#a5b4fc" lineWidth={1} transparent opacity={0.45} />
        <group position={[x1, y0, 0]}>
          <mesh scale={[s, s, s * 0.6]} rotation-z={Math.PI / 4}>
            <octahedronGeometry args={[1.1]} />
            <meshBasicMaterial color={active ? "#fbbf24" : "#f8fafc"} toneMapped={false} />
          </mesh>
          <mesh onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
            <sphereGeometry args={[s * 3.2, 12, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      </group>
    </>
  );
}
