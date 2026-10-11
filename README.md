# invokfung.github.io

Alan Fung's portfolio, served from GitHub Pages.

The landing page is one map you travel by scrolling. Seven projects, StudyLog and a hub sit on a
3×3 grid, and every cell is the project itself running live in the browser. The words run down the
left like any page (below the map on a phone), and the camera follows them: as you scroll, it flies
from cell to cell, and the cell you are reading about develops from a dot-matrix print into the
running project, with its slider, live numbers and the real project's result beside it.

It opens on the whole map next to my name and closes with the career route, then the map folds into
`contact()`. There is no menu: the page scroll is the only way to move, and a thread on the edge
shows where you are. Click a cell you can see to scroll to it; `#/relay` and the like link straight
to a section.

- Stop scrolling between two sections and the page glides to the nearer one.
- Sound is off until the visitor turns it on. Reduced motion skips the opening and the glides.
- A service worker keeps the page working offline, and Relay loses its deployments with the connection.

Files:

- `index.html`: page shell (canvas, HUD, the thread, an empty `main` the sections are written into)
- `assets/portfolio/data.js`: **all content** (profile, home copy, path, projects, and the `live` copy per figure)
- `assets/portfolio/live/kit.js`: shared drawing helpers and the `Fig` base class
- `assets/portfolio/live/{relay,tracewise,onboard,dispatch,atlas,studio,layerline,hub}.js`: one live figure each
- `assets/portfolio/live/app.js`: the sections, scroll-to-camera mapping, dot matrix, the finale, input, sound, offline
- `assets/portfolio/live/live.css`: the HUD, the thread, the sections
- `assets/portfolio/notes.js`: the note index Atlas searches; rebuild with `python3 assets/portfolio/notes.py`
- `assets/portfolio/media/<id>.webp`: a still per flagship, used for link previews
- `sw.js`: network-first cache for the home page

A figure implements `size`, `step`, `draw`, pointer handlers, `set(v)` with a `slider`, and `stats()`.
To add one, write it in `live/`, give it a cell in `CELL` and a place in `ORDER` in `live/app.js`,
and a `live` entry in `data.js`. `live/arena.js` is the TripleFind Arena figure, kept but no longer
on the map. Blog numbers in `writing` are a snapshot and need a manual refresh.

Other corners: `/relay/` (Relay), `/tracewise/` (Tracewise), `/onboard/` (Onboard), `/dispatch/` (Dispatch), `/blog/` (StudyLog), `/atlas/` (StudyLog Atlas), `/studio/` (Intonation Studio), `/layerline/` (Layerline),
`/arena/` (TripleFind Arena), `/ptimer/` (ChillTimer), `/triplefind/` (TripleFind).
