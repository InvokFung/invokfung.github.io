# invokfung.github.io

Alan Fung's portfolio, served from GitHub Pages.

The landing page is a guided tour of one map. Seven projects, StudyLog and a hub sit on a 3×3 grid,
and every cell is the project itself running live in the browser. The left column (a bottom sheet on
a phone) always says what you are looking at and what to try; the rest of the screen is one viewport.

You start on the whole map, every cell a dot-matrix print of its own live frame, next to my name and
one button. Each step of the tour flies the camera round the ring to the next cell, which develops
from dots into the running project with its slider, live numbers and the real project's result
beside it. The last stop is the career route and contact.

- Scroll, the arrow keys, a swipe, the rail or Next move the tour. Click any cell to jump there.
- <kbd>L</kbd> opens a plain list, <kbd>Esc</kbd> goes back to the whole map.
- Sound is off until the visitor turns it on. Reduced motion skips the opening and the flights.
- A service worker keeps the page working offline, and Relay loses its deployments with the connection.

Files:

- `index.html`: page shell, the panel, the list and the contact card
- `assets/portfolio/data.js`: **all content** (profile, path, skills, projects, and the `live` copy per figure)
- `assets/portfolio/live/kit.js`: shared drawing helpers and the `Fig` base class
- `assets/portfolio/live/{relay,tracewise,onboard,atlas,studio,arena,layerline,hub}.js`: one live figure each
- `assets/portfolio/live/app.js`: the tour (stops, camera flights, dot matrix, the panel), input, sound, offline
- `assets/portfolio/live/live.css`: the HUD, the panel, the list
- `assets/portfolio/notes.js`: the note index Atlas searches; rebuild with `python3 assets/portfolio/notes.py`
- `assets/portfolio/media/<id>.webp`: a still per flagship, used for link previews
- `sw.js`: network-first cache for the home page

A figure implements `size`, `step`, `draw`, pointer handlers, `set(v)` with a `slider`, and `stats()`.
To add one, write it in `live/`, give it a cell in `CELL` and a place in `ORDER` in `live/app.js`,
and a `live` entry in `data.js`. Blog numbers in `writing` are a snapshot and need a manual refresh.

Other corners: `/relay/` (Relay), `/tracewise/` (Tracewise), `/onboard/` (Onboard), `/blog/` (StudyLog), `/atlas/` (StudyLog Atlas), `/studio/` (Intonation Studio), `/arena/` (TripleFind Arena), `/layerline/` (Layerline),
`/ptimer/` (ChillTimer), `/triplefind/` (TripleFind).
