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
