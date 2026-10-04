# invokfung.github.io

Alan Fung's portfolio, served from GitHub Pages.

The landing page shows one big thing per screen:

1. **Hero**: my name as a landscape of sound, in WebGL2 (`terrain.js`). Each ridge is a pitch and the
   loud part spells the name. **Hear it** plays that landscape as one sine per ridge and the ridges
   follow the audio. **Sing to it** turns on the microphone and the note you sing becomes a ripple.
   Click or drag on it to make waves (a damped 2D wave equation on the height field).
2. **Work**: one flagship at a time on a stage. The footage is recorded from the project's own live
   page and loops; the stage moves on every few seconds unless you are looking. **Try it here** swaps
   the footage for a small model of the idea you can poke (`sims.js`), **How it works** opens the case
   study (`#work/<id>` links straight to one).
3. **About**: three numbers. **Path**: six steps from the first commit to Forward Deployed Engineer.
4. **Tools**: a marquee of what I build with. Pick one and the stage jumps to the project that uses it.
5. **Contact**.

Extras: three themes, and <kbd>`</kbd> opens a terminal (`help`, `show relay`, `try atlas`,
`skills c++`, `git log`, `name Ada`, `play`, `sing`, `theme paper`…). Nothing from the microphone
leaves the page, and nothing plays until the visitor asks.

- `index.html`: page shell
- `assets/portfolio/data.js`: **all content** (profile, about lines, section headings, path, skills, eras, projects, blog stats)
- `assets/portfolio/app.js`: the stage, reveals, case studies, marquee, terminal
- `assets/portfolio/terrain.js`: the hero (ridge curtains, MSAA, bloom, synth, microphone, a canvas fallback)
- `assets/portfolio/sims.js`: the "try it" models, one class per flagship
- `assets/portfolio/strings.js`: audio unlock and the pitch detector (no page code)
- `assets/portfolio/notes.js`: the note index the Atlas model searches; rebuild with `python3 assets/portfolio/notes.py`
- `assets/portfolio/media/<id>.{webm,mp4,webp}`: footage per flagship (VP9, H.264 fallback, poster)
- `assets/portfolio/style.css`: themes and layout

To add a project, push an object onto `projects` in `data.js` (`tier: "flagship"` or
`"experiment"`, `status: "live" | "source" | "wip"`, a `color`, a `question`, optional `metrics`). A
flagship also needs footage in `media/` under its id (16:10, about 8 s, seamless loop) and a model
in `sims.js` under its id. A project is linked to every skill named in its `stack` or `uses`. To add
a skill, put it in a `skills` group (with `proof` if no shipped project uses it yet). Blog numbers
in `writing` are a snapshot and need a manual refresh.

Other corners: `/relay/` (Relay), `/tracewise/` (Tracewise), `/onboard/` (Onboard), `/blog/` (StudyLog), `/atlas/` (StudyLog Atlas), `/studio/` (Intonation Studio), `/arena/` (TripleFind Arena), `/layerline/` (Layerline),
`/ptimer/` (ChillTimer), `/triplefind/` (TripleFind).
