# invokfung.github.io

Alan Fung's portfolio, served from GitHub Pages.

The landing page is one map. Seven projects and a hub sit on a 3×3 grid, and every cell is the
project itself running live in the browser: Relay routes requests round a deployment you take down,
Tracewise blames the service you slow, Onboard matches messy records as you slide the threshold, Atlas
searches my notes on your device, the Studio detector hears a detuned violin note, Arena bots race on
one board, Layerline slices a gear. Zoomed out, each cell is a dot-matrix print of its own live
frame; zoom in and it takes input. Click a cell (or press Enter on it) and it opens as a page with a
slider, live numbers and the result from the real project.

- Drag to move, scroll or pinch to zoom, <kbd>L</kbd> for a plain list, arrows to step, <kbd>Esc</kbd> to back out.
- Sound is off until the visitor turns it on. Reduced motion skips the opening and halves the speed.
- A service worker keeps the page working offline, and Relay loses its deployments with the connection.

Files:

- `index.html`: page shell, the list, the contact card and the project page
- `assets/portfolio/data.js`: **all content** (profile, path, skills, projects, and the `live` copy per figure)
- `assets/portfolio/live/kit.js`: shared drawing helpers and the `Fig` base class
- `assets/portfolio/live/{relay,tracewise,onboard,atlas,studio,arena,layerline,hub}.js`: one live figure each
- `assets/portfolio/live/app.js`: the map (camera, zoom, dot matrix, spokes), input, pages, sound, offline
- `assets/portfolio/live/live.css`: the HUD, list, page and transitions
- `assets/portfolio/notes.js`: the note index Atlas searches; rebuild with `python3 assets/portfolio/notes.py`
- `assets/portfolio/media/<id>.webp`: a still per flagship, used for link previews
- `sw.js`: network-first cache for the home page

A figure implements `size`, `step`, `draw`, pointer handlers, `set(v)` with a `slider`, and `stats()`.
To add one, write it in `live/`, give it a cell in `CELL` in `live/app.js` and a `live` entry in
`data.js`. Blog numbers in `writing` are a snapshot and need a manual refresh.

Other corners: `/relay/` (Relay), `/tracewise/` (Tracewise), `/onboard/` (Onboard), `/blog/` (StudyLog), `/atlas/` (StudyLog Atlas), `/studio/` (Intonation Studio), `/arena/` (TripleFind Arena), `/layerline/` (Layerline),
`/ptimer/` (ChillTimer), `/triplefind/` (TripleFind).
