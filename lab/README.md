# Motion lab

Standalone experiments for invokfung.github.io. Each one is a page you can open on its own, built
from a component you could lift into the site. Nothing here is linked from the live pages, and
every page carries `noindex`.

Open `lab/index.html` for the ranked overview with screenshots. On any experiment page, press
**N** for its notes.

## Rules for this folder

- One folder per experiment: `index.html` (the demo page), one `*.js` component, and any media it needs.
- Shared frame: `lab.css` and `lab.js` (the top bar, the notes drawer, a frame meter). Tokens match `assets/portfolio/live/live.css`.
- Third-party code goes in `vendor/`, unmodified, with its license next to it.
- Every new experiment gets an entry below **before** it ships anywhere: date, source, license, files, verdict.
- Screenshots for the overview live in `shots/` (960×600 JPEG, taken with Playwright on the day).
- To try one locally: `python3 -m http.server 8765` from the repo root, then open `http://localhost:8765/lab/`.

## Log

### 2026-10-18 · Round 1: six viral effects

Research behind the picks: the most-starred and most-shared motion repos of 2024 to 2026 (React
Bits, Pretext, GSAP's free plugins, Pavel Dobryakov's fluid, Paper shaders, liquid glass) and the
personal sites that went viral or won awards in the same years (Mitch Ivin, Bruno Simon, Henry
Heffernan, ryOS, Lynn Fisher, Josh Comeau, Bartosz Ciechanowski, Igloo Inc). Star counts were read
on each GitHub repo page on 2026-10-18.

| # | Experiment | Folder | Went viral as | License of the source | Ours uses | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Reflow**: project copy flowing around giant initials you can drag | `reflow/` | [chenglou/pretext](https://github.com/chenglou/pretext), Mar 2026, 49.6k stars | MIT | Pretext 1.0.0, vendored | Ship as the intro's first screen |
| 2 | **Badge**: ID card on a lanyard, flips to contact | `badge/` | [React Bits Lanyard](https://reactbits.dev/components/lanyard); foil after [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) | MIT + Commons Clause (React Bits) | nothing; own verlet chain and CSS 3D | Ship as the contact finale |
| 3 | **Morph**: job titles turning into each other, year rolling | `morph/` | Split and scramble text ([React Bits](https://github.com/DavidHDev/react-bits), GSAP SplitText), Magic UI Morphing Text, [NumberFlow](https://github.com/barvian/number-flow) | various | nothing; own LCS letter matching | Ship glide for the career line |
| 4 | **Assemble**: 42k particles forming the name, project stills, a dropped photo | `assemble/` | [Interactive Particles](https://tympanus.net/codrops/2019/01/17/interactive-particles-with-three-js/) (Bruno Imbrizi, Codrops); Igloo Inc, Awwwards SOTY 2024 | custom free-use (Imbrizi) | nothing; plain WebGL | Needs a real photo: save `assemble/portrait.jpg` |
| 5 | **Pressure**: the name in a variable font that swells toward the cursor | `pressure/` | [React Bits TextPressure](https://reactbits.dev/text-animations/text-pressure) | MIT + Commons Clause | Roboto Flex from Google Fonts | Keep in reserve |
| 6 | **Ink**: the name in characters on a fluid you stir; it heals | `ink/` | [PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation), 16.6k stars; the 2026 ASCII renderers | MIT | nothing; own stable fluids and glyph shader | A 404 page or footer, not the hero |

No source code was copied from React Bits, Magic UI, pokemon-cards-css or Interactive Particles;
those are credited as the ideas each experiment follows. Pretext is the only library used.

Looked at and not built, with the reason:

- **Desktop OS portfolio** (Mitch Ivin's Windows XP site, 1,032 HN points in 2025; ryOS; Henry Heffernan): a whole-site concept, cloned many times.
- **Liquid glass** (rdev/liquid-glass-react, 6.4k stars): the refraction only renders in Chromium.
- **Shader gradient and aurora backgrounds**: everywhere, and they say nothing about the work.
- **Live state shared between visitors** (Josh Comeau, Bruno Simon): needs a server; GitHub Pages has none.
- **Dithering shaders**: too close to the intro's existing dot-matrix figures.
- **A drivable 3D world** (Bruno Simon, Awwwards Site of the Month Jan 2026): ruled out earlier along with the walkable city.

Known limits, round 1:

- Reflow's reading order runs across the gap when a line is split by a letter. Fine for a short wall of copy; not for long reading.
- Assemble falls back to nothing without WebGL. Its default tour has no portrait until one is added.
- Ink's fluid runs on the main thread: 4 to 10 ms per step in the headless software renderer used for testing. A real laptop is likely faster; that is not measured yet.
- Pressure needs Roboto Flex from Google Fonts; without it the letters do not change width.
- Frame rates were measured in a headless software renderer, not on a real GPU.

### 2026-10-23 · Round 2: the whole site in one flow

Alan liked the six enough to show them, and asked for everything (the projects included, in the
right priority) as one page with proper flow, where each effect has a reason to be where it is,
rather than a gallery of cards. Alan liked the badge best and wanted content and a backdrop behind it.

`flow/` is that page: `index.html`, `flow.css`, `flow.js` (wires the sections) and `handover.js`
(new). It reads its content from `assets/portfolio/data.js` and runs the live figures from
`assets/portfolio/live/`, the same files the live site uses. Nothing on the live site links to it.

| Section | Effect | Its job |
|---|---|---|
| Hello | Badge + Reflow | Who I am first. The badge hangs near the right edge in front of the copy, which re-flows around the strap and card every frame; drag the card in and the text parts. Project names in the copy jump to the project. |
| Work | live figures + handover (from Assemble) | Seven projects on one sticky stage, FDE work first (Relay, Tracewise, Onboard, Dispatch, then Atlas, Intonation Studio, Layerline). Between projects the outgoing figure is sampled into up to 16,000 points and they rebuild as the next figure, then the live canvas takes over. |
| How I got here | Morph (glide) + roller | Scroll-driven, 2023 to 2026. Letters the titles share light up as they carry over. |
| Craft | Pressure | "Hand-built, down to the type." over a paragraph naming each effect, linking to its lab page. |
| Contact | Badge | The same badge: it is re-hung from the top of contact while off screen and turned to its contact side. |
| Sign-off | Ink | The name as a fluid; "Stir it. It comes back." |

Changes to round 1 components, all optional and off by default, so the round 1 pages behave as before:

- `badge/badge.js`: `anchor`, `strap`, `visible`, `onFrame` options; `hang(still)`, `kick()`, `flipped`. A moving anchor tugs the strap up to 24 px a frame, and a bigger jump carries the whole badge along. Height-only resizes (a phone toolbar) no longer re-hang it.
- `reflow/reflow.js`: `obstacles` (paint any shape into the mask), `margins`, `maxSize`, `minSpan`, `pointerHole`, `isLive`; a highlight can carry `go`.
- `morph/morph.js`: shared letters get a `kept` class while they move.
- `pressure/pressure.js`, `ink/ink.js`: `isLive`, so they stop work while off screen.

Checked in headless Chromium (software WebGL) at 1440×900, 1024×768 and 390×844: no console
errors, no horizontal overflow, the card drags into the copy and the copy parts, names in the copy
land on their project, every handover completes in order, the badge turns up at contact on its
contact side and flips back on a tap, and reduced motion swaps figures with no particles.

Known limits, round 2:

- Headless software rendering throttles animation frames, so frame rates there say little; not yet measured on a real phone.
- The Work stage on a phone takes the top half of the screen; figures that expect a drag (Atlas's map) are tap-only there so the page still scrolls.
- Root-relative links (`/explore/`, `/relay/`) only work on the real site, not in a preview copy.

