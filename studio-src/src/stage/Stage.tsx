import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Trace } from "../state/live";
import { isBlackKey, midiToFreq, noteLabel } from "../dsp/notes";
import { setText } from "../ui/hooks";

/**
 * The pitch stage: time runs right to left, pitch bottom to top, one line per
 * semitone. The sound itself draws the picture:
 *
 * - The ribbon is the detected pitch over the last few seconds. Its width is
 *   loudness, its colour is how far the note's centre sits from the target
 *   (cyan flat, amber sharp, pale when in tune; the centre is averaged over
 *   about one vibrato cycle, as a listener hears it), and vibrato shows as its wave.
 * - The target note's line is a string. While you play near it, it vibrates
 *   with your loudness, and its amplitude beats at the real beat frequency
 *   |f_played − f_target|: a slow pulse when slightly off, still when in tune.
 *
 * Everything per-frame happens in useFrame/shaders and reads from refs, so the
 * React tree does not re-render at frame rate.
 */

export interface StageFocus {
  /** Fractional MIDI note the view is centred on. */
  center: number;
  /** The note being aimed at; null colours against the nearest note. */
  target: number | null;
  /** Spelling for the target's label, e.g. "F♯4". */
  targetLabel?: string;
  /** Audio-clock time at the right edge of the ribbon. */
  now: number;
  /** Smoothed fractional MIDI of what is sounding now (NaN if nothing). */
  sounding: number;
  /** 0..1 loudness now. */
  level: number;
  a4: number;
}

interface Props {
  trace: Trace;
  focus: () => StageFocus;
  /** False renders on demand only (a still picture). */
  animate?: boolean;
  ariaLabel: string;
}

const SEMI = 0.5; // world units per semitone
const ROWS = 7; // semitones shown either side of the centre
const SPEED = 2.1; // world units per second of history
const POINTS = 720; // ribbon resolution (≈ 7.7 s at 94 frames/s)
const BG = "#080b14";

const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Width of the time axis in world units for the current canvas shape. */
function useSpan() {
  const { size } = useThree();
  const aspect = size.width / Math.max(1, size.height);
  const visibleH = (2 * ROWS + 2.2) * SEMI;
  return Math.min(15, Math.max(3.2, visibleH * aspect - 2.3));
}

// ---------------------------------------------------------------- staff lines

const linesVertex = /* glsl */ `
  attribute float aOffset;
  attribute float aEdge;
  attribute float aU;
  uniform float uCenter;
  uniform float uSemi;
  uniform float uL;
  uniform float uTarget;
  varying float vKind;
  varying float vFade;
  varying float vU;
  void main() {
    float n = floor(uCenter + 0.5) + aOffset;
    float pc = mod(n, 12.0);
    float black = (abs(pc - 1.0) < 0.1 || abs(pc - 3.0) < 0.1 || abs(pc - 6.0) < 0.1 || abs(pc - 8.0) < 0.1 || abs(pc - 10.0) < 0.1) ? 1.0 : 0.0;
    float isC = abs(pc) < 0.1 ? 1.0 : 0.0;
    float hidden = abs(n - uTarget) < 0.1 ? 1.0 : 0.0; // the target is drawn as a string
    vKind = black > 0.5 ? 0.0 : (isC > 0.5 ? 2.0 : 1.0);
    float w = (black > 0.5 ? 0.007 : 0.012) * (1.0 - hidden);
    vFade = 1.0 - smoothstep(float(${ROWS}) - 0.5, float(${ROWS}) + 1.2, abs(n - uCenter));
    vU = aU;
    vec3 p = vec3(mix(-uL, 0.32, aU), (n - uCenter) * uSemi + aEdge * w, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const linesFragment = /* glsl */ `
  varying float vKind;
  varying float vFade;
  varying float vU;
  void main() {
    vec3 c = vKind < 0.5 ? vec3(0.32, 0.37, 0.48) : (vKind < 1.5 ? vec3(0.55, 0.6, 0.72) : vec3(0.62, 0.64, 0.95));
    float a = (vKind < 0.5 ? 0.22 : 0.38) * vFade * smoothstep(0.0, 0.3, vU);
    gl_FragColor = vec4(c, a);
  }
`;

function StaffLines({ span, shared }: Part) {
  const geom = useMemo(() => {
    const rows = 2 * (ROWS + 2) + 1;
    const g = new THREE.BufferGeometry();
    const off: number[] = [];
    const edge: number[] = [];
    const u: number[] = [];
    const idx: number[] = [];
    for (let r = 0; r < rows; r++) {
      const k = r - (ROWS + 2);
      const base = off.length;
      for (const [uu, e] of [
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 1],
      ]) {
        off.push(k);
        edge.push(e);
        u.push(uu);
      }
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(off.length * 3), 3));
    g.setAttribute("aOffset", new THREE.Float32BufferAttribute(off, 1));
    g.setAttribute("aEdge", new THREE.Float32BufferAttribute(edge, 1));
    g.setAttribute("aU", new THREE.Float32BufferAttribute(u, 1));
    g.setIndex(idx);
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: linesVertex,
        fragmentShader: linesFragment,
        uniforms: { uCenter: { value: 69 }, uSemi: { value: SEMI }, uL: { value: span }, uTarget: { value: -100 } },
        transparent: true,
        depthWrite: false,
        // Strips are built without regard to winding (a ribbon folds over itself), so draw both faces.
        side: THREE.DoubleSide,
      }),
    [],
  );
  useFrame(() => {
    const f = shared.focus;
    mat.uniforms.uCenter.value = shared.center;
    mat.uniforms.uL.value = span;
    mat.uniforms.uTarget.value = f.target ?? (Number.isFinite(f.sounding) ? Math.round(f.sounding) : -100);
  });
  return <mesh geometry={geom} material={mat} frustumCulled={false} />;
}

// ---------------------------------------------------------------- target string

const stringVertex = /* glsl */ `
  attribute float aU;
  attribute float aEdge;
  uniform float uL;
  uniform float uY;
  uniform float uAmp;
  uniform float uTime;
  uniform float uBeat;
  uniform float uWidth;
  varying float vEdge;
  varying float vU;
  varying float vMotion;
  void main() {
    // A standing wave with three antinodes, pinned at both ends.
    float shape = sin(3.14159265 * aU * 3.0);
    // Beating: the envelope |cos(π·Δf·t)| pulses once per beat period.
    float env = abs(cos(3.14159265 * uBeat * uTime));
    float disp = uAmp * shape * sin(6.2831853 * 6.0 * uTime) * env;
    vMotion = abs(disp) / max(uAmp, 1e-3);
    vEdge = aEdge;
    vU = aU;
    vec3 p = vec3(mix(-uL, 0.32, aU), uY + disp + aEdge * uWidth, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const stringFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGlow;
  varying float vEdge;
  varying float vU;
  void main() {
    float d = abs(vEdge);
    float core = 1.0 - smoothstep(0.0, 0.35, d);
    float halo = exp(-d * d * 5.0) * uGlow;
    float a = (core * 0.95 + halo * 0.5) * smoothstep(0.0, 0.25, vU);
    gl_FragColor = vec4(uColor * (0.7 + 0.6 * core), a);
  }
`;

function TargetString({ span, shared }: Part) {
  const geom = useMemo(() => {
    const seg = 220;
    const u = new Float32Array((seg + 1) * 2);
    const e = new Float32Array((seg + 1) * 2);
    const idx: number[] = [];
    for (let i = 0; i <= seg; i++) {
      u[i * 2] = u[i * 2 + 1] = i / seg;
      e[i * 2] = -1;
      e[i * 2 + 1] = 1;
      if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(u.length * 3), 3));
    g.setAttribute("aU", new THREE.BufferAttribute(u, 1));
    g.setAttribute("aEdge", new THREE.BufferAttribute(e, 1));
    g.setIndex(idx);
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: stringVertex,
        fragmentShader: stringFragment,
        uniforms: {
          uL: { value: span },
          uY: { value: 0 },
          uAmp: { value: 0 },
          uTime: { value: 0 },
          uBeat: { value: 0 },
          uWidth: { value: 0.05 },
          uColor: { value: new THREE.Color("#818cf8") },
          uGlow: { value: 0.3 },
        },
        transparent: true,
        depthWrite: false,
        // Strips are built without regard to winding (a ribbon folds over itself), so draw both faces.
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const amp = useRef(0);
  const color = useMemo(() => ({ idle: new THREE.Color("#818cf8"), good: new THREE.Color("#6ee7b7"), cur: new THREE.Color("#818cf8") }), []);
  useFrame(({ clock }, dt) => {
    const f = shared.focus;
    const u = mat.uniforms;
    const target = f.target ?? (Number.isFinite(f.sounding) ? Math.round(f.sounding) : NaN);
    u.uL.value = span;
    if (!Number.isFinite(target)) {
      u.uY.value = 1e3; // off screen
      return;
    }
    u.uY.value = (target - shared.center) * SEMI;
    const off = Number.isFinite(f.sounding) ? (f.sounding - target) * 100 : Infinity;
    const near = Math.abs(off) < 60;
    const goal = near && !reducedMotion ? 0.05 + 0.2 * f.level : 0;
    amp.current += (goal - amp.current) * Math.min(1, dt * 10);
    u.uAmp.value = amp.current;
    u.uTime.value = clock.elapsedTime;
    // Real beat frequency between what is played and the target, capped so it stays visible.
    u.uBeat.value = near ? Math.min(6, Math.abs(midiToFreq(f.sounding, f.a4) - midiToFreq(target, f.a4))) : 0;
    const inTune = near && Math.abs(off) <= 5;
    color.cur.lerp(inTune ? color.good : color.idle, Math.min(1, dt * 6));
    u.uColor.value.copy(color.cur);
    u.uGlow.value += ((inTune ? 1 : near ? 0.55 : 0.25) - u.uGlow.value) * Math.min(1, dt * 6);
    u.uWidth.value = 0.032 + 0.03 * u.uGlow.value;
  });
  return <mesh geometry={geom} material={mat} frustumCulled={false} renderOrder={2} />;
}

// ---------------------------------------------------------------- ribbon

const ribbonVertex = /* glsl */ `
  attribute float aTime;
  attribute float aMidi;
  attribute float aCentre;
  attribute float aLevel;
  attribute float aSide;
  uniform float uNow;
  uniform float uSpeed;
  uniform float uCenter;
  uniform float uSemi;
  uniform float uL;
  uniform float uTarget;
  varying float vSide;
  varying float vAlpha;
  varying vec3 vColor;
  const vec3 FLAT = vec3(0.133, 0.827, 0.933);
  const vec3 SHARP = vec3(0.961, 0.620, 0.043);
  const vec3 MID = vec3(0.86, 0.93, 0.95);
  void main() {
    float x = min((aTime - uNow) * uSpeed, 0.0);
    float pitched = step(0.0, aLevel);
    float lvl = max(aLevel, 0.0);
    // Against the target while near it; earlier notes keep their own nearest note.
    float ref = (uTarget > 0.0 && abs(aCentre - uTarget) < 0.5) ? uTarget : floor(aCentre + 0.5);
    float dev = (aCentre - ref) * 100.0;
    float t = clamp((abs(dev) - 3.0) / 27.0, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vColor = mix(MID, dev < 0.0 ? FLAT : SHARP, t);
    float halfWidth = 0.025 + 0.16 * lvl;
    float y = (aMidi - uCenter) * uSemi + aSide * halfWidth;
    float age = smoothstep(-uL, -uL * 0.5, x);
    float inView = 1.0 - smoothstep(float(${ROWS}) + 0.5, float(${ROWS}) + 2.0, abs(aMidi - uCenter));
    vAlpha = pitched * age * inView * (0.35 + 0.65 * smoothstep(0.0, 0.3, lvl));
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, 0.02 + lvl * 0.3, 1.0);
  }
`;
const ribbonFragment = /* glsl */ `
  varying float vSide;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = abs(vSide);
    float core = 1.0 - smoothstep(0.1, 0.9, d);
    float glow = exp(-d * d * 3.0);
    gl_FragColor = vec4(vColor * (0.55 + 0.75 * core), vAlpha * (0.6 * core + 0.4 * glow));
  }
`;

function Ribbon({ trace, span, shared }: Part & { trace: Trace }) {
  const { geom, attrs } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const time = new Float32Array(POINTS * 2);
    const midi = new Float32Array(POINTS * 2);
    const centre = new Float32Array(POINTS * 2);
    const level = new Float32Array(POINTS * 2).fill(-1);
    const side = new Float32Array(POINTS * 2);
    const idx: number[] = [];
    for (let i = 0; i < POINTS; i++) {
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
      if (i < POINTS - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const mk = (a: Float32Array) => new THREE.BufferAttribute(a, 1).setUsage(THREE.DynamicDrawUsage);
    const attrs = { aTime: mk(time), aMidi: mk(midi), aCentre: mk(centre), aLevel: mk(level) };
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(POINTS * 6), 3));
    g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    for (const [k, v] of Object.entries(attrs)) g.setAttribute(k, v);
    g.setIndex(idx);
    return { geom: g, attrs };
  }, []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ribbonVertex,
        fragmentShader: ribbonFragment,
        uniforms: { uNow: { value: 0 }, uSpeed: { value: SPEED }, uCenter: { value: 69 }, uSemi: { value: SEMI }, uL: { value: span }, uTarget: { value: -1 } },
        transparent: true,
        depthWrite: false,
        // Strips are built without regard to winding (a ribbon folds over itself), so draw both faces.
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const seen = useRef({ head: -1, size: -1 });

  useFrame(() => {
    const f = shared.focus;
    const u = mat.uniforms;
    u.uCenter.value = shared.center;
    u.uL.value = span;
    u.uTarget.value = f.target ?? -1;
    if (seen.current.head !== trace.head || seen.current.size !== trace.size) {
      seen.current = { head: trace.head, size: trace.size };
      upload(f.now);
    }
    // Between uploads the ribbon scrolls by moving "now" against the stored times.
    u.uNow.value = f.now - shared.timeBase;
  });

  /**
   * Copies the newest POINTS frames, oldest first, with times relative to
   * `base`. Unpitched frames keep the previous pitch (so gaps never draw
   * streaks) and are hidden with aLevel = −1.
   */
  function upload(base: number) {
    const T = attrs.aTime.array as Float32Array;
    const M = attrs.aMidi.array as Float32Array;
    const Lv = attrs.aLevel.array as Float32Array;
    const n = Math.min(POINTS, trace.size);
    const start = trace.size - n;
    let lastMidi = NaN;
    for (let j = 0; j < n && !Number.isFinite(lastMidi); j++) lastMidi = trace.midi[trace.at(start + j)];
    for (let i = 0; i < POINTS; i++) {
      const o = i * 2;
      if (i < POINTS - n) {
        T[o] = T[o + 1] = -1e3;
        M[o] = M[o + 1] = Number.isFinite(lastMidi) ? lastMidi : 0;
        Lv[o] = Lv[o + 1] = -1;
        continue;
      }
      const k = trace.at(start + i - (POINTS - n));
      const m = trace.midi[k];
      const pitched = Number.isFinite(m);
      if (pitched) lastMidi = m;
      T[o] = T[o + 1] = trace.t[k] - base;
      M[o] = M[o + 1] = Number.isFinite(lastMidi) ? lastMidi : 0;
      Lv[o] = Lv[o + 1] = pitched ? trace.level[k] : -1;
    }
    // Colour follows the note's centre: the mean of nearby frames of the same note (±9 frames ≈ ±95 ms).
    const C = attrs.aCentre.array as Float32Array;
    for (let i = POINTS - n; i < POINTS; i++) {
      const o = i * 2;
      let sum = 0;
      let cnt = 0;
      if (Lv[o] >= 0) {
        for (let j = Math.max(POINTS - n, i - 9); j <= Math.min(POINTS - 1, i + 9); j++) {
          const q = j * 2;
          if (Lv[q] >= 0 && Math.abs(M[q] - M[o]) < 0.5) {
            sum += M[q];
            cnt++;
          }
        }
      }
      C[o] = C[o + 1] = cnt ? sum / cnt : M[o];
    }
    shared.timeBase = base;
    attrs.aTime.needsUpdate = attrs.aMidi.needsUpdate = attrs.aCentre.needsUpdate = attrs.aLevel.needsUpdate = true;
  }
  return <mesh geometry={geom} material={mat} frustumCulled={false} renderOrder={3} />;
}

/** Frame-rate values several scene parts share, kept out of React state. */
interface Shared {
  focus: StageFocus;
  /** The eased view centre (fractional MIDI). */
  center: number;
  /** Audio time the ribbon's stored times are relative to (keeps float32 precise). */
  timeBase: number;
  started: boolean;
}

type Part = { shared: Shared; span: number };

function CenterFollower({ shared }: { shared: Shared }) {
  useFrame((_, dt) => {
    const c = shared.focus.center;
    if (!Number.isFinite(c)) return;
    if (!shared.started) {
      shared.center = c;
      shared.started = true;
      return;
    }
    shared.center += (c - shared.center) * Math.min(1, dt * 3.5);
  });
  return null;
}

// ---------------------------------------------------------------- head + labels

const headFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = (exp(-d * d * 6.0) + 0.6 * (1.0 - smoothstep(0.18, 0.24, d))) * uAlpha;
    gl_FragColor = vec4(uColor, a);
  }
`;

function Head({ shared }: { shared: Shared }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: headFragment,
        uniforms: { uColor: { value: new THREE.Color("#ffffff") }, uAlpha: { value: 0 } },
        transparent: true,
        depthWrite: false,
        // Strips are built without regard to winding (a ribbon folds over itself), so draw both faces.
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const pal = useMemo(() => ({ flat: new THREE.Color("#22d3ee"), sharp: new THREE.Color("#f59e0b"), mid: new THREE.Color("#e2f3f6") }), []);
  useFrame((_, dt) => {
    const f = shared.focus;
    const m = ref.current;
    if (!m) return;
    const on = Number.isFinite(f.sounding);
    mat.uniforms.uAlpha.value += ((on ? 1 : 0) - mat.uniforms.uAlpha.value) * Math.min(1, dt * 12);
    if (!on) return;
    m.position.y = (f.sounding - shared.center) * SEMI;
    m.scale.setScalar(0.5 + 0.7 * f.level);
    const ref2 = f.target ?? Math.round(f.sounding);
    const dev = (f.sounding - ref2) * 100;
    const t = Math.min(1, Math.max(0, (Math.abs(dev) - 3) / 27));
    mat.uniforms.uColor.value.copy(dev < 0 ? pal.flat : pal.sharp).lerp(pal.mid, 1 - t);
  });
  return (
    <mesh ref={ref} position={[0, 0, 0.35]} material={mat} renderOrder={4}>
      <planeGeometry args={[0.9, 0.9]} />
    </mesh>
  );
}

/**
 * Note names beside each line. They are plain DOM spans in an overlay next to
 * the canvas (crisp text, no font loading in WebGL); each frame their anchor
 * points are projected to screen space and the spans are moved there.
 */
function Labels({ shared, els }: { shared: Shared; els: React.RefObject<(HTMLSpanElement | null)[]> }) {
  const anchor = useRef<THREE.Group>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  const { camera, size } = useThree();
  useFrame(() => {
    const g = anchor.current;
    if (!g) return;
    g.updateWorldMatrix(true, false);
    const base = Math.round(shared.center);
    const f = shared.focus;
    for (let i = 0; i <= 2 * ROWS; i++) {
      const el = els.current?.[i];
      if (!el) continue;
      const k = i - ROWS;
      const midi = base + k;
      v.set(0.62, (midi - shared.center) * SEMI, 0).applyMatrix4(g.matrixWorld).project(camera);
      el.style.transform = `translate(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px) translate(-50%, -50%)`;
      const isTarget = midi === f.target;
      setText(el, isTarget && f.targetLabel ? f.targetLabel : noteLabel(midi));
      const cls = `staff-label${isBlackKey(midi) ? " black" : ""}${isTarget ? " target" : ""}${Math.abs(k) >= ROWS ? " edge" : ""}`;
      if (el.className !== cls) el.className = cls;
    }
  });
  return <group ref={anchor} />;
}

// ---------------------------------------------------------------- scene

function Scene({ trace, focus, labels }: Pick<Props, "trace" | "focus"> & { labels: React.RefObject<(HTMLSpanElement | null)[]> }) {
  const span = useSpan();
  // The focus callback may change identity between renders; the shared state must not reset.
  const focusFn = useRef(focus);
  focusFn.current = focus;
  const shared = useMemo<Shared>(() => ({ focus: focusFn.current(), center: 69, timeBase: 0, started: false }), []);
  // Read the focus once per frame, before the parts that use it (priority −1 runs first).
  useFrame(() => {
    shared.focus = focusFn.current();
  }, -1);
  return (
    <group rotation={[0.04, -0.3, 0]}>
      <group position={[span / 2 - 0.5, 0, 0]}>
        <CenterFollower shared={shared} />
        <StaffLines span={span} shared={shared} />
        <TargetString span={span} shared={shared} />
        <Ribbon trace={trace} span={span} shared={shared} />
        <Head shared={shared} />
        <Labels shared={shared} els={labels} />
        <mesh position={[0.02, 0, -0.01]}>
          <planeGeometry args={[0.012, (2 * ROWS + 1) * SEMI]} />
          <meshBasicMaterial color="#64748b" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

function Camera() {
  const { camera } = useThree();
  useEffect(() => {
    const visibleH = (2 * ROWS + 2.2) * SEMI;
    const cam = camera as THREE.PerspectiveCamera;
    const d = visibleH / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    cam.position.set(0, 0.25, d);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [camera]);
  return null;
}

export default function Stage({ trace, focus, animate = true, ariaLabel }: Props) {
  // Stop rendering while the stage is scrolled out of view.
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    const el = wrap.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className="stage" ref={wrap} role="img" aria-label={ariaLabel}>
      <Canvas
        frameloop={animate && visible ? "always" : "demand"}
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.1, far: 100, position: [0, 0, 16] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={[BG]} />
        <Camera />
        <Scene trace={trace} focus={focus} labels={labels} />
      </Canvas>
      <div className="stage-labels" aria-hidden="true">
        {Array.from({ length: 2 * ROWS + 1 }, (_, i) => (
          <span key={i} className="staff-label" ref={(el) => void (labels.current[i] = el)} />
        ))}
      </div>
    </div>
  );
}
