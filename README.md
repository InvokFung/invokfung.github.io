# invokfung.github.io

Alan Fung's portfolio, served from GitHub Pages.

The landing page is drawn as the control flow of a program. One thread runs from `main()` to
`contact()` and lights up as you scroll:

1. **main()**: my name, written as sound. The hero is a spectrogram (time across, pitch up,
   loudness as colour) whose energy spells the name. **Hear it** synthesizes that sound and redraws
   the picture from the audio itself, so what you see is what you hear. **Sing to it** scrolls the
   microphone in from the right and names the note you sing. Hovering reads out the pitch and time
   under the cursor.
2. **whoami()**: three short lines, each with its number. Point at one (or tap it) and the proof
   opens underneath.
3. **work()**: the seven flagships as live tiles. Each one is a small model of the project you can
   poke: take a region down in front of Relay, break a service for Tracewise, flip Onboard to
   email-only matching, search my notes in the Atlas tile, play a note into Studio's pitch detector,
   drop players from Arena, scrub Layerline's layers. Left alone, a tile demos itself. The number
   on each tile is the project's own measured benchmark. Every tile opens a case study
   (`#work/<id>` links straight to one).
4. **skills()**: a patch bay. Every skill has a jack, every project has a jack, and a cable runs
   between them for each project that uses the skill. Point at either end to trace it.
5. **history()**: a `for (const year of alan.life)` loop. The section pins and scrolls sideways
   through the years, with a rail, live counters and `HEAD → <year>` in the nav. ← → also work.
6. **contact()**: run `await alan.contact()` to resolve the promise to my email and GitHub.

Extras: `</> source` opens the page's own generated source next to it (the dotted values are live:
theme, accent, motion, name, coffee), and <kbd>`</kbd> opens a terminal (`help`, `checkout 2023`,
`show relay`, `skills kubernetes`, `git log`, `theme paper`, `play`, `sing`, `sound on`…).

The thread, the cables and the history loop are also strings: sweep the pointer across one and a
damped wave equation moves it. With sound on (off until the visitor turns it on) they ring as
plucked strings (Karplus-Strong). Nothing from the microphone leaves the page.

- `index.html`: page shell
- `assets/portfolio/data.js`: **all content** (profile, whoami lines, section headings, skills, eras, projects, blog stats)
- `assets/portfolio/app.js`: renderer, thread, patch bay, history loop, case studies, source view, terminal
- `assets/portfolio/spectro.js`: the hero spectrogram (render, additive synthesis, analyser redraw, microphone)
- `assets/portfolio/sims.js`: the live tile sketches, one class per flagship, sharing one animation loop
- `assets/portfolio/strings.js`: the wave equation, the plucked-string synth and the pitch detector (no page code)
- `assets/portfolio/notes.js`: the note index the Atlas tile searches; rebuild with `python3 assets/portfolio/notes.py`
- `assets/portfolio/style.css`: themes and layout

To add a project, push an object onto `projects` in `data.js` (`tier: "flagship"` or
`"experiment"`, `status: "live" | "source" | "wip"`, a `color`, optional `metrics` and `motif` for its
case-study cover). Its case study, its cables in the patch bay and its line of source are generated
from that entry; a flagship also needs a sketch in `sims.js` under its id. A project is wired to every
skill named in its `stack` or `uses`. To add a skill, put it in a `skills` group (with `proof` if no
shipped project uses it yet). To add a chapter, push onto `eras` and list the project ids it shipped.
Blog numbers in `writing` are a snapshot and need a manual refresh.

Other corners: `/relay/` (Relay), `/tracewise/` (Tracewise), `/onboard/` (Onboard), `/blog/` (StudyLog), `/atlas/` (StudyLog Atlas), `/studio/` (Intonation Studio), `/arena/` (TripleFind Arena), `/layerline/` (Layerline),
`/ptimer/` (ChillTimer), `/triplefind/` (TripleFind).
