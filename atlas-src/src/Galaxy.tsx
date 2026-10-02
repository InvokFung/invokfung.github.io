import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, Html, Line, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { Meta } from "./search/types";
import { categoryColor } from "./palette";

export interface Focus {
  /** Chunk -> highlight strength 0..1. Empty map = nothing highlighted. */
  weights: Map<number, number>;
  /** Chunks the camera should frame, or empty to keep the current view. */
  frame: number[];
}

interface Props {
  meta: Meta;
  layout: Float32Array;
  focus: Focus;
  hiddenCategories: Set<number>;
  selected: number | null;
  /** Whether the side panel (or bottom sheet on phones) covers part of the canvas. */
  panelOpen: boolean;
  onHover: (chunk: number | null, x: number, y: number) => void;
  onSelect: (chunk: number) => void;
}

const vertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aFocus;
  attribute float aSeed;
  attribute float aVisible;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uDim;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float twinkle = 0.82 + 0.18 * sin(uTime * 1.3 + aSeed * 6.2831);
    float size = (1.0 + aFocus * 2.6) * twinkle * aVisible;
    gl_PointSize = clamp(size * uPixelRatio * (420.0 / -mv.z), 1.5 * uPixelRatio, 56.0 * uPixelRatio);
    gl_Position = projectionMatrix * mv;
    vColor = mix(aColor, vec3(1.0), aFocus * 0.45);
    vAlpha = mix(0.9, 0.1 + aFocus * 0.9, uDim) * aVisible;
  }
`;

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float halo = smoothstep(0.5, 0.0, d);
    float core = pow(halo, 4.0);
    gl_FragColor = vec4(vColor * (0.35 * halo + 1.4 * core), vAlpha * halo);
  }
`;

function Stars3D({ meta, layout, focus, hiddenCategories, onHover, onSelect }: Omit<Props, "selected" | "panelOpen">) {
  const n = meta.chunks.length;
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(layout, 3));
    const colors = new Float32Array(n * 3);
    const seeds = new Float32Array(n);
    const c = new THREE.Color();
    meta.chunks.forEach((ch, i) => {
      c.set(categoryColor(meta.posts[ch.p].category));
      colors.set([c.r, c.g, c.b], i * 3);
      seeds[i] = Math.random();
    });
    g.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    g.setAttribute("aFocus", new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute("aVisible", new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    g.computeBoundingSphere();
    return g;
  }, [meta, layout, n]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uDim: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  // Highlight strengths ease toward their targets rather than snapping.
  const target = useMemo(() => new Float32Array(n), [n]);
  useEffect(() => {
    target.fill(0);
    for (const [i, w] of focus.weights) target[i] = w;
  }, [focus, target]);

  useEffect(() => {
    const vis = geom.getAttribute("aVisible") as THREE.BufferAttribute;
    meta.chunks.forEach((ch, i) => vis.setX(i, hiddenCategories.has(meta.posts[ch.p].category) ? 0 : 1));
    vis.needsUpdate = true;
  }, [hiddenCategories, geom, meta]);

  const { gl } = useThree();
  useFrame(({ clock }, dt) => {
    const u = material.uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uPixelRatio.value = gl.getPixelRatio();
    const dimTarget = focus.weights.size ? 1 : 0;
    u.uDim.value += (dimTarget - u.uDim.value) * Math.min(1, dt * 4);
    const attr = geom.getAttribute("aFocus") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    let moving = false;
    const k = Math.min(1, dt * 5);
    for (let i = 0; i < n; i++) {
      const d = target[i] - arr[i];
      if (Math.abs(d) > 1e-3) {
        arr[i] += d * k;
        moving = true;
      }
    }
    if (moving) attr.needsUpdate = true;
  });

  const visible = (i: number) => !hiddenCategories.has(meta.posts[meta.chunks[i].p].category);
  return (
    <points
      geometry={geom}
      material={material}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        const hit = e.intersections.find((x) => x.index !== undefined && visible(x.index));
        if (!hit) return;
        e.stopPropagation();
        onHover(hit.index!, e.nativeEvent.clientX, e.nativeEvent.clientY);
      }}
      onPointerOut={() => onHover(null, 0, 0)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        const hit = e.intersections.find((x) => x.index !== undefined && visible(x.index));
        if (!hit) return;
        e.stopPropagation();
        onSelect(hit.index!);
      }}
    />
  );
}

function CategoryLabels({ meta, layout, hiddenCategories, dimmed }: Pick<Props, "meta" | "layout" | "hiddenCategories"> & { dimmed: boolean }) {
  const anchors = useMemo(() => {
    // Each label sits on its category's medoid (estimated from a sample):
    // a real passage inside the densest part of the cluster, where a mean
    // or median could land in empty space between two clusters.
    const members: number[][] = meta.categories.map(() => []);
    meta.chunks.forEach((ch, i) => members[meta.posts[ch.p].category].push(i));
    const dist = (a: number, b: number) =>
      Math.hypot(layout[a * 3] - layout[b * 3], layout[a * 3 + 1] - layout[b * 3 + 1], layout[a * 3 + 2] - layout[b * 3 + 2]);
    return members.map((ids) => {
      const step = Math.max(1, Math.floor(ids.length / 250));
      const sample = ids.filter((_, j) => j % step === 0);
      let best = sample[0];
      let bestSum = Infinity;
      for (const a of sample) {
        let sum = 0;
        for (const b of sample) sum += Math.min(dist(a, b), 30);
        if (sum < bestSum) {
          bestSum = sum;
          best = a;
        }
      }
      return [layout[best * 3], layout[best * 3 + 1], layout[best * 3 + 2]] as [number, number, number];
    });
  }, [meta, layout]);
  return (
    <>
      {meta.categories.map((name, i) =>
        hiddenCategories.has(i) ? null : (
          <Html key={name} position={anchors[i]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
            <div className={`cat-label${dimmed ? " dim" : ""}`} style={{ color: categoryColor(i) }}>
              {name}
            </div>
          </Html>
        ),
      )}
    </>
  );
}

function Constellation({ meta, layout, selected }: Pick<Props, "meta" | "layout" | "selected">) {
  const data = useMemo(() => {
    if (selected === null) return null;
    const post = meta.posts[meta.chunks[selected].p];
    // Reading order as segments; long jumps to passages UMAP placed in
    // another cluster are left out so the shape stays legible.
    const at3 = (i: number): [number, number, number] => [layout[i * 3], layout[i * 3 + 1], layout[i * 3 + 2]];
    const pts: [number, number, number][] = [];
    for (let i = post.first; i < post.first + post.count - 1; i++) {
      const a = at3(i);
      const b = at3(i + 1);
      if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 12) pts.push(a, b);
    }
    const at: [number, number, number] = [layout[selected * 3], layout[selected * 3 + 1], layout[selected * 3 + 2]];
    return { pts, at, color: categoryColor(post.category) };
  }, [meta, layout, selected]);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock, camera }) => {
    if (!ring.current) return;
    ring.current.quaternion.copy(camera.quaternion);
    const s = 1 + 0.15 * Math.sin(clock.elapsedTime * 3);
    ring.current.scale.setScalar(s);
  });
  if (!data) return null;
  return (
    <>
      {data.pts.length > 1 && <Line points={data.pts} segments color={data.color} lineWidth={1} transparent opacity={0.45} />}
      <mesh ref={ring} position={data.at}>
        <ringGeometry args={[0.55, 0.68, 48]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </>
  );
}

/**
 * Shifts the projection centre away from the open panel with a view offset,
 * so whatever the camera frames lands in the part of the canvas you can see.
 */
function ViewOffset({ panelOpen }: { panelOpen: boolean }) {
  const { camera, size } = useThree();
  const cur = useRef({ x: 0, y: 0 });
  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const phone = size.width <= 760;
    const tx = panelOpen && !phone ? Math.min(436, size.width - 32) / 2 : 0;
    const ty = panelOpen && phone ? Math.min(size.height * 0.58, size.height) / 2 : 0;
    const k = Math.min(1, dt * 4);
    cur.current.x += (tx - cur.current.x) * k;
    cur.current.y += (ty - cur.current.y) * k;
    if (Math.abs(cur.current.x) < 0.5 && Math.abs(cur.current.y) < 0.5 && !tx && !ty) {
      if (cam.view?.enabled) cam.clearViewOffset();
      return;
    }
    cam.setViewOffset(size.width, size.height, cur.current.x, cur.current.y, size.width, size.height);
  });
  return null;
}

function CameraRig({ meta, layout, focus }: Pick<Props, "meta" | "layout" | "focus">) {
  const ref = useRef<CameraControls>(null);
  const idle = useRef(0);

  useEffect(() => {
    const ctl = ref.current;
    if (!ctl || !focus.frame.length) return;
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const i of focus.frame.slice(0, 4)) box.expandByPoint(v.set(layout[i * 3], layout[i * 3 + 1], layout[i * 3 + 2]));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    sphere.radius = Math.max(sphere.radius, 8);
    void ctl.fitToSphere(sphere, true);
  }, [focus, layout, meta]);

  useFrame((_, dt) => {
    const ctl = ref.current;
    if (!ctl) return;
    idle.current += dt;
    if (idle.current > 6 && !focus.weights.size) ctl.azimuthAngle += dt * 0.04;
  });

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={4}
      maxDistance={260}
      smoothTime={0.6}
      onStart={() => (idle.current = 0)}
    />
  );
}

export default function Galaxy(props: Props) {
  return (
    <Canvas
      camera={{ position: [0, 24, 125], fov: 50, near: 0.1, far: 2000 }}
      dpr={[1, 2]}
      raycaster={{ params: { Points: { threshold: 0.7 } } as THREE.RaycasterParameters }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      onPointerMissed={() => props.onHover(null, 0, 0)}
    >
      <color attach="background" args={["#05070d"]} />
      <fog attach="fog" args={["#05070d", 160, 420]} />
      <Stars radius={300} depth={120} count={2500} factor={3} saturation={0} fade speed={0.3} />
      <Stars3D {...props} />
      <CategoryLabels meta={props.meta} layout={props.layout} hiddenCategories={props.hiddenCategories} dimmed={props.focus.weights.size > 0} />
      <Constellation meta={props.meta} layout={props.layout} selected={props.selected} />
      <CameraRig meta={props.meta} layout={props.layout} focus={props.focus} />
      <ViewOffset panelOpen={props.panelOpen} />
    </Canvas>
  );
}
