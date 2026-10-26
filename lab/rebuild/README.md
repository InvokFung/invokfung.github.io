# Rebuilds: Resn's about page and Igloo Inc

Two award-winning pages, taken apart from the code they ship and built again here with Alan's
work in them. Nothing is linked from the live site and both pages carry `noindex`.

| Page | Folder | Original |
|---|---|---|
| About, as a glass drop | `resn/` | [resn.co.nz/#!/about](https://resn.co.nz/#!/about) (Resn, 2015-era app) |
| The whole portfolio, as an igloo | `igloo/` | [igloo.inc](https://www.igloo.inc) (built by Abeto; Awwwards Site of the Year 2024) |

To open locally: `python3 -m http.server 8765` from the repo root, then
`http://localhost:8765/lab/rebuild/resn/` and `http://localhost:8765/lab/rebuild/igloo/`.

## How they were taken apart

REA (the `rea-agents` reverse-engineering tool) was refused by the container's install check, so its
method was run by hand:

1. Headless Chromium over the DevTools protocol saved every response each page loads (scripts,
   shaders, models, textures, audio).
2. `WebGLRenderingContext` was hooked so every GLSL program the page compiles was recorded.
3. Frames were shot while scrolling, as a reference for colour and layout.
4. The bundles were formatted and read: the scroll engines, scene graphs, timelines, shaders and
   UI layout below come from that reading, with the numbers they ship.

The full teardown (with every number) is in the project files under
`reference-reels/rebuild-resn-igloo/teardown.md`, with the capture scripts in `tools/`.

**None of their files are used.** No model, texture, sound, font or line of their code is copied.
Every mesh, texture and volume here is generated in code at load time, every shader is written
fresh against the same maths, and the copy is Alan's. The only outside code is three.js (MIT) and
GSAP with CustomEase (free licence), both vendored in `lab/vendor/` with their licences.

## resn/ (about page)

How the original works, and what the rebuild does with it:

| Original | Rebuild |
|---|---|
| A faceted teardrop gem (`drop_gem5.obj`, 1,562 vertices) filling the screen behind the copy | The drop is generated: a teardrop curve on a lathe, every other ring offset half a step, each vertex nudged, flat normals |
| The gem refracts a tiled texture of the word "Resn" over dark gems, per channel at `ior`, `ior*(1-ca)`, `ior*(1-2ca)` | Same optics in our shaders; the texture is drawn on a canvas: dark cut gems and "FDE" |
| Post chain: brightness/contrast, colour offset with red zoomed 3x (the red and cyan split), colour correction, film noise | Same chain, same numbers |
| About mode: camera orbit 200 to 40 units, `ior` 0.7 to 1.2, red scale 0.99 to 2.97 over 2 s on `Expo.easeOut`, 4 s fade up | Same tweens |
| Text cut by three or five huge spinning triangles on an ellipse (radius 2.2x to 0.8x over 2.5 s) | Same mask, drawn on a canvas over the heading and skills line |
| Page is a fixed layer eased 10% a frame toward the native scroll | Same |
| Root font size from window width (10px at 1536 wide, 6 to 12px), everything in rem | Same; Outfit stands in for Fort, which is commercial |
| Menu: the drop pulls back to a whole gem and boils on hold; Howler sound | Same pull-back and boil; sound is a WebAudio drone, off until asked for |

Content: "Alan Fung · Forward Deployed Engineer", the seven flagships with one number each, the
path from the degree to 2026, and "Get in touch." with email and GitHub.

## igloo/ (the whole portfolio)

Igloo's page is one canvas: three scenes stacked by height, a wheel that feeds one number instead
of scrolling, and a full-screen pass that cuts from scene to scene along a cracked diagonal.

### The frame (`main.js`)

- **Scroll engine**, their `jF`, ported line for line: `targetY2 += deltaY * 0.00075`; `targetY1`
  eases toward it at 0.075 (speed limited), `y` eases toward that at 0.15; `targetY2` is held
  within 750 steps of `y`, so a flick can't skip a scene; velocity with 0.98 friction. Arrow keys
  ±150, touch x1.25. It loops: past the room you come back to the igloo.
- **Auto-centre** 1.4 s after the last input: if a cut is on screen, glide to the nearest scene
  edge on `inOut3`; otherwise the scene decides (the igloo rests at 0.495, the blocks at the nearest
  one, the room at 0.76).
- **Per scene**: render into a multisampled half-float target, bloom (six levels, radius 0.85,
  threshold 0.2, 0 in the shaft), then a finish pass with their glare and the ring-crossing smear
  (their `DF`: a 0.3 radial jitter, square glitches, a saturation push).
- **The cut** (their `f3`): a diagonal at slope 0.2 x aspect, wobbled by the crack texture's blue
  channel; cracks give way first, then each shard; a five-tap spectral aberration along the edge,
  blue-noise jittered; 0.4 parallax between the two scenes.
- **The project view**: the block's camera pushes in 3.5 units, then an ice-frost displacement and
  aberration wipe opens the detail scene (1.25 s `power3.in`, then 1.25 s `sine.out` 0.75 s later),
  as theirs.

### The three scenes

| Scene | Original | Here |
|---|---|---|
| 1, igloo (`scene-igloo.js`) | A fractured igloo, every block an instance with a centroid; blocks breathe, lift from the mouse and blow out on scroll, glowing blue from inside. Plexus lines with tiny numbers, wind on baked terrain, smoke, snow. A 7 s intro: cage, blocks materialise through triangles, a blue shockwave lays the ground | The same, all generated: the igloo is built from bent blocks, the ground and mountains from noise. Same camera (FOV 30, from (-14, 4, 14)), same intro beats and eases |
| 2, blocks (`scene-cubes.js`) | One ice block per company, 5.75 units apart; each spins hard as it arrives. Chromatic refraction, three samples per channel; the mouse wipes the frost. A label on a leader line, blurred text behind | One block per flagship (Relay, Tracewise, Onboard, Dispatch, Atlas, Intonation Studio, Layerline), each holding its own emblem. Same spin, same refraction. Label: `PROJECT_01`, name, year and kind, the headline number |
| 3, entry (`scene-entry.js`) | Down a shaft through three segmented stone rings, each lighting into a force field with a plasma core; roll 180° into a round room; a GPGPU particle sculpture from a volume texture, one per social link | The three rings are 2023, 2024 and 2025, each year written round its ring; the degree is above the shaft, the room is 2026, so far. The sculptures are the ways to reach Alan: `@` (email), `</>` (GitHub), a book (StudyLog). Same camera timeline (9.2 s, scrubbed), same ring and room parts |

### Words over the scenes (`ui.js`, `igloo.css`)

Igloo draws its interface as MSDF glyphs in WebGL. Here it is DOM text in the same font (IBM Plex
Mono) on their grid (margins 125/90, 50/45 under 1600×800, 25/25 under 640), so it can be read
aloud, selected and reached by keyboard. Lines arrive as theirs do: the box flickers on, then each
glyph runs through its neighbours and settles. **The name is never animated**: the outlined
wordmark and the line with the name are set once and only shown or hidden.

- Top left: the name, then "// Forward Deployed Engineer" (their copyright block).
- Top right, one thing at a time: the manifesto in the igloo (shown between 25% and 80% of the
  scene, as theirs), the year and title for each ring in the shaft, then "Get in touch." in the room.
- Bottom left: "Scroll down to discover." until you do, and Sound: OFF.
- Blocks: "Click to explore" under the centred one. The project view: the summary, the measured
  numbers, and links to try it live and read the source; Close top right, Esc, or Back.
- Room: arrows either side of the sculpture, the links on a strip with Visit in the middle.
- Skip links for keyboards: to the work, to each project, to contact.

### What is simpler than the original, and why

- **Their fluid sim on the particles and the frost** is a velocity splat that decays (`Wake` in the
  entry, `Frost` on the blocks): the same push and wipe, a fraction of the cost.
- **Their curl-of-bitangent noise** moving the particles is an ABC flow field: smooth swirling with
  no extra textures.
- **Their per-scene 3D LUTs** are a lift, gain, gamma and saturation grade per scene, tuned against
  frames shot from the original.
- **The sculpture sways** (±0.6 rad) instead of spinning all the way round, so `@` and `</>` stay
  readable.
- **Their recorded music and room tones** are synthesised in WebAudio: wind, a hum through each ring,
  particle hiss, a room chord, interface blips. Off until you turn it on.
- **Their baked lightmaps and Draco models** are lit and built in code.

### Switches

- `?nosnap`: no auto-centre; the scroll stays where you leave it.
- `?static`, or the system's reduced-motion setting: the intro skips to the end, text appears
  without the scramble, glides are short.
- `#relay` (any project id): opens that project straight away; Back closes it.
- No WebGL2: the page shows its content as plain text.

### Known limits

- Tested in headless Chromium with a software renderer (about 8 fps at 1440×900). The page drops its
  resolution a step at a time when frames run slow (down to 0.75x), but it has not been timed on a
  real phone GPU.
- Crossing a ring is deliberately smeared (their effect); a screenshot taken right on a ring looks
  blurry.

## Log

### 2026-10-26 · Both rebuilt

Afung asked how Resn's about page and Igloo Inc are built, whether we had reverse-engineered them,
and for the same thing rebuilt in full with his content: real reverse engineering, not a small
imitation. Both were taken apart from their shipped code (above) and rebuilt at full scale:
`resn/` (3 files) and `igloo/` (8 files, about 4,000 lines). Checked at 1440×900 and 390×844 in
headless Chromium: every scene, the cuts, the project view, the room and its links. Not deployed.

### 2026-10-26 · Previews that load

Both preview links hung on their loaders: the host didn't run the multi-file build (an import map
pointing `three` at published module files). The previews are now one file each: CSS, GSAP and the
data inline, and the modules bundled with three.js into one classic script. Both boots also fall
back now (the igloo to its text page, Resn to the page without the drop) instead of hanging if
anything throws while starting, and the project view still works where history is refused.
