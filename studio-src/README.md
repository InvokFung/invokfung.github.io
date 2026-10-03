# Intonation Studio

A practice room in the browser that listens to a violin or a piano and tells you, note by note and to the cent, how in tune a scale was. Live at **[invokfung.github.io/studio](https://invokfung.github.io/studio/)**.

Press **Watch the demo** and a synthesized violinist plays a drill into the same detector a microphone would feed, so the whole thing can be judged without an instrument. Nothing is uploaded; all audio is analysed on the device.

- **Tuner.** A cents gauge, a strobe, note, octave and Hz, with A4 adjustable from 415 to 445 Hz. Presets for the violin's G3 D4 A4 E5 and for piano reference notes. In the demo, picking a string makes the violin bow it starting flat and settle.
- **Drills.** Scales (major, harmonic and melodic minor) and arpeggios, 1–3 octaves, in eight grades for violin and for piano. In call-and-response mode the app plays each target note with a Web Audio synth and you answer it. Each note you play is segmented and scored on its median deviation and its steadiness, with vibrato removed first. There is a summary at the end.
- **Progress.** Session history in `localStorage`, a day streak, and a heatmap of each note's average deviation on a violin fingerboard (placed where it is played in the lowest position) or a piano keyboard.
- **Live stage.** A React Three Fiber scene with custom GLSL. The pitch trace is a ribbon flowing past one line per semitone: its width is loudness and its colour is the deviation of the vibrato-free centre. The target note's line is drawn as a string that beats at the real difference frequency |f − f₀|, so it goes still when you are in tune.

## How it works

```
mic / demo violin ──► AudioWorklet: ring buffer → McLeod pitch method every 512 samples
                          │  { t, Hz, clarity, RMS } via postMessage (~90 per second)
                          ▼
                     live bus: Hz → MIDI against A4, One Euro display smoothing, trace ring buffer
                          │
          ┌───────────────┼──────────────────────────┐
          ▼               ▼                          ▼
   segmenter → scorer   gauge / strobe / meters   WebGL stage
   → drill reducer      (SVG and canvas, rAF)     (R3F, GLSL ribbon)
   → history
```

| Layer | What | Where |
| --- | --- | --- |
| DSP | FFT, real-input autocorrelation, MPM and YIN detectors, note maths, One Euro filter, biquads, the synthesized violin, scale theory, segmenter, scorer. Pure TypeScript with no DOM, so Node tests it directly | `src/dsp/` |
| Audio thread | `pitch-detector` and `demo-violin` AudioWorklet processors, bundled as self-contained modules | `src/audio/*-processor.ts` |
| Audio graph | `AudioEngine`: microphone (echo cancellation, noise suppression and AGC off) or demo source → detector node; guide tones; input muted briefly after each guide tone | `src/audio/engine.ts` |
| State | A minimal external store (`useSyncExternalStore`). The drill is a pure reducer, timed by a runner. History, streak and storage sit behind `try/catch` with an in-memory fallback | `src/state/` |
| UI | React 19. The gauge, strobe, fingerboard and keyboard are hand-written SVG and canvas, updated on `requestAnimationFrame` through refs, not re-renders | `src/ui/` |
| Stage | React Three Fiber with four `ShaderMaterial`s (ribbon, staff, target string, head glow), loaded as a separate chunk | `src/stage/` |

Pitch frames never pass through React state. The worklet posts small messages, the live bus keeps them in a ring buffer, and each view reads that buffer on its own animation frame. This keeps rendering from interfering with audio timing.

## The detector

**McLeod Pitch Method** (McLeod & Wyvill, 2005), implemented from scratch with no pitch-detection library. For a window of W samples it computes the normalised square difference function

  n′(τ) = 2·r′(τ) / m′(τ),  r′(τ) = Σⱼ xⱼ·xⱼ₊τ,  m′(τ) = Σⱼ (xⱼ² + xⱼ₊τ²)

over the overlapping part of the window. n′ is 1 for a perfect repeat at lag τ, whatever the loudness.

- **r′ for every lag at once.** By Wiener–Khinchin, the autocorrelation is the inverse FFT of the power spectrum of the zero-padded window. Because the input is real, one half-size complex FFT is enough: even and odd samples are packed as real and imaginary parts and the spectrum is split afterwards. m′ is a running sum. Cost is O(W log W) per frame (`src/dsp/autocorr.ts`).
- **Peak picking.** n′ is scanned for its key maxima, one per positive lobe. The first peak within 93% of the highest is taken, not the tallest. This choice is what prevents octave-down errors. Clarity is the height of that peak.
- **Sub-sample lag.** A cosine is fitted through the three samples around the peak, which is exact for a sinusoid. Parabolic interpolation, the usual choice, was biased by up to 0.95¢. Short periods are then re-measured at the peak near k·τ (as many cycles as fit in half the window) and divided by k, which shrinks the interpolation error by the same factor.
- **Profiles.** Violin: 170–3600 Hz, 1024-sample window (21 ms at 48 kHz). Piano: 46–4400 Hz, 2048 samples. Hop is 512 samples (10.7 ms). Each frame is stamped at the centre of its window.

**YIN** (de Cheveigné & Kawahara, 2002; cumulative mean normalised difference, threshold 0.12) is implemented alongside for comparison only.

**From frames to notes.** The display uses a One Euro filter that snaps on jumps of more than 0.6 semitone, so a new note appears at once and a held one stays steady. The segmenter uses hysteresis on clarity (0.9 to start, 0.8 to hold) and level (−48 / −56 dBFS), with onset, release and note-change debouncing. A note's intonation is the median deviation after trimming the attack. Vibrato is intended, so before judging steadiness the contour is smoothed with a moving average exactly one vibrato cycle long (a boxcar has a spectral null at 1/length). Vibrato rate comes from the contour's autocorrelation. Drift is the robust spread (1.4826 × MAD) of what remains. When vibrato is present, intonation is taken from that vibrato-free centre too: a raw median over a partial vibrato cycle is biased by a few cents. The note score is 75% pitch (full marks within ±3¢, none beyond ±40¢) and 25% steadiness.

**Demo violin** (`src/dsp/violin.ts`): two slightly detuned sawtooths with PolyBLEP anti-aliasing, body resonances from biquad filters, bow noise, delayed vibrato, slow drift and an initial bend. The demo player has a per-note tendency (some notes sharp, some flat) plus random error and an occasional slip, so its scores differ from run to run.

## Measured, not claimed

`npm run metrics` runs the unit tests and the accuracy sweeps, prints the tables below and writes `src/generated/metrics.json`. The landing page imports that file, so the numbers on the site are the ones measured. The bundle sizes come from `build-info.json`, which `npm run build` writes.

**47/47 unit tests pass** (`node:test` via tsx). They cover the FFT and autocorrelation against naive versions, the detectors, the segmenter, the scorer, scale spelling, the drill reducer, streaks, storage failure modes, and a full pipeline run.

**Accuracy sweep.** One frame every quarter-semitone across each range, at both 44.1 and 48 kHz, with varied starting phases. Error is in cents from the true pitch. "Octave errors" counts frames off by more than half an octave plus frames with no pitch. MPM is the detector the app uses; YIN runs on the same frames.

| Signal | Frames | MPM median / p95 / max | MPM octave errors | YIN median / p95 / max | YIN octave errors |
| --- | --- | --- | --- | --- | --- |
| Pure sine, G3–E7 (violin window) | 362 | 0.002 / 0.006 / 0.007 | 0 | 0.149 / 1.689 / 2.779 | 0 |
| Pure sine, G1–C8 (piano window) | 618 | 0 / 0.001 / 0.002 | 0 | 0.053 / 3.195 / 6.907 | 0 |
| Sawtooth, 24 harmonics, violin range | 182 | 0.056 / 0.161 / 0.17 | 0 | 0.362 / 4.324 / 7.298 | 0 |
| Sawtooth, 24 harmonics, piano range | 310 | 0.007 / 0.063 / 0.092 | 0 | 0.118 / 6.439 / 11.938 | 1 |
| Fundamental 20 dB below 2nd harmonic | 182 | 0.003 / 0.023 / 0.037 | 0 | 0.112 / 1.832 / 4.418 | 0 |
| Missing fundamental (harmonics 2–8) | 142 | 0.004 / 0.019 / 0.033 | 0 | 0.058 / 0.691 / 1.115 | 0 |
| Odd harmonics only | 162 | 0.009 / 0.073 / 0.123 | 0 | 0.082 / 1.65 / 5.175 | 0 |
| Piano bass, weak fundamental, G1–G3 | 98 | 0.001 / 0.002 / 0.002 | 0 | 0.002 / 0.011 / 0.016 | 0 |
| Sawtooth + white noise, SNR 20 dB | 182 | 0.088 / 0.285 / 0.67 | 0 | 0.377 / 4.351 / 7.323 | 0 |
| Sawtooth + white noise, SNR 10 dB | 182 | 0.192 / 1.829 / 3.412 | 0 | 1.347 / 5.872 / 8.259 | 13 |
| Sawtooth + white noise, SNR 5 dB | 182 | 0.409 / 4.01 / 13.69 | 0 | 5.829 / 13.486 / 13.996 | 161 |
| Sawtooth + white noise, SNR 0 dB | 182 | 1.169 / 20.508 / 31.43 | 51 | – | 182 |

Other measurements:

- **Vibrato.** A4 with ±20¢ vibrato at 5.5 Hz. Frame error against the true pitch at each window's centre: median 0.195¢, p95 0.343¢, max 0.433¢ (186 frames).
- **White noise.** 1 of 400 frames was called pitched.
- **End to end.** The synthesized violin plays D major over 2 octaves (29 notes, each programmed −25 to +25¢ off, with vibrato). Rendering, detection, segmentation and scoring recover all 29 notes. |measured − programmed| has a median of 0.45¢ and a max of 0.72¢.
- **Cost per frame** in Node v22, on an Intel Xeon at 2.10 GHz. Each figure is the median of 21 batches of 200 calls, with the fastest batch in brackets. The budget is one hop, about 10,700 µs.

  | Window | MPM | YIN |
  | --- | --- | --- |
  | violin, 1024 | 71.9 µs (66.1) | 71.5 µs (65.0) |
  | piano, 2048 | 166.7 µs (146.2) | 147.5 µs (138.7) |

  The "How it works" dialog in the app reruns this benchmark on the visitor's device.
- **Bundle** (gzip). The app needs 98.9 kB of JavaScript to first paint. The three.js stage is a separate chunk, for 341.8 kB in total (1.24 MB raw). The two worklets are 4.2 kB and the CSS 5.8 kB.

**Browser checks.** `npm run e2e` drives the built app in headless Chromium and passes all 13 checks:

- The demo drill runs to a summary and lands in the progress history.
- In the demo tuner, the bowed A4 settles within ±5¢.
- There is no horizontal scroll at 1440 or 390 px.
- With Chromium's fake microphone playing a rendered WAV of the violin, the tuner reads all eight notes of G major. A G major drill then scores 13 of 15 notes within ±10¢; the WAV is deliberately played up to 12¢ off, and two of its notes are more than 10¢ out.
- A denied microphone gives a readable error that points to the demo.
- No console errors appear.

## Run and build

```bash
cd studio-src
npm install
npm run dev          # local dev server
npm test             # unit tests
npm run metrics      # tests + accuracy sweeps + timing → src/generated/metrics.json
npm run build        # typecheck, build into ../studio, write build-info.json
npm run all          # metrics, then build

# browser checks against the built app (Playwright is not a dependency):
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium npm run e2e
npm run wav -- out.wav   # the fake-microphone WAV on its own
```

Stack: TypeScript (strict), React 19, Vite, three.js with React Three Fiber, GLSL, the Web Audio API with AudioWorklet, and node:test with tsx. There are no other runtime dependencies.

## Limitations

- **Monophonic only.** Double stops and chords are not analysed.
- **Piano tuning.** A piano's tuning is fixed and stretched, so the cents describe the instrument rather than the player. Piano drills mainly check the right notes. Notes below G1 (49 Hz) are out of range, and laptop microphones are weak in the bass anyway.
- **Speakers.** With speakers instead of headphones, a guide tone can leak into the microphone. Input is muted for 0.18 s after each tone, which helps but is not echo cancellation.
- **Scoring is judged in equal temperament** against the chosen A4. Expressive intonation (high leading notes, Pythagorean thirds) counts as error.
- **The grade lists** are my approximation of a typical exam progression, not a copy of any board's syllabus.
- **Testing coverage.** Accuracy is measured on synthetic signals, including a synthesized violin, not on recordings of real players. The browser checks ran in headless Chromium with software WebGL (SwiftShader); Safari and Firefox were not tested.
- **History stays in one browser.** It is stored in `localStorage`, so it is lost if site data is cleared and is not synced. The page says so when storage is blocked.
