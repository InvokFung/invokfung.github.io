# invokfung.github.io

Alan Fung's portfolio, served from GitHub Pages. It has three pages that link to each other:

- `/` is the homepage: a day on a paper mountain you scroll through, in five scenes from the name
  to `contact()`.
- `/map/` is the same work on one live map you travel by scrolling, also ending in `contact()`.
- `/explore/` is the full portfolio: a tile you can break for every flagship, each with its case
  study, the skills patch bay, the history loop, a terminal and the page's own live source.

They are linked through the design rather than a menu:

- On the homepage, Selected work opens with "Selected work, not the whole shelf" (`/explore/`) and
  "running live, here or on the map" (`/map/`). Each project panel opens its case study
  (`/explore/#work/<id>`), and each Craft specimen opens its page in the motion lab (`/lab/`).
- On the map, a project's name is the door to its case study (`/explore/#work/<id>`), and so is
  the "How it works" after its measured result. Followed from the cell you are reading, the map
  dives into that cell first, and where the browser has cross-document view transitions the name
  carries over into the case study's title.
- Each case study's cover leads back up to the project running live on the map (`/map/#/<id>`),
  and the map surfaces out of that cell. The back button surfaces the same way.
- The copy links the rest: "the whole shelf" in the map's opening line, "a new title every year" on
  the path (`/explore/#history`), "one level down" at the very end, and "on one map" on `/explore/`.
  Copy in `data.js` can carry `[words](/link/)`. The name in the corner of `/explore/` goes to `/`.

All three read the same `data.js`.

## The homepage

`index.html` is round 4, take 2 of the motion lab, made the homepage on 23 Oct 2026. Its code stays
where it was built, in `lab/unfold/` (`unfold.js`, `scenery.js`, `art.js`, `unfold.css`), and the
Craft specimens come from `lab/book/specimens.js`; `lab/README.md` logs how it was made. The
landscape is one WebGL canvas and the words, panels and links are ordinary DOM in front of it. It
uses the browser's own scroll with no snap, drops its quality on slow machines, and works with
reduced motion and without WebGL. `/lab/unfold/` serves the same page inside the lab. Old links
into the map from when it was the homepage (`/#/relay`) are sent on to `/map/#/relay`.

Each page has its own share card, `assets/portfolio/media/card-{home,map,explore}.jpg`: a 1200×630
screenshot of the page at rest, named in its `og:image`. Retake it when the page's look changes.
`sitemap.xml` and `robots.txt` list the main pages.

## The map

`/map/` was the homepage from 11 to 23 Oct 2026. It is one map you travel by scrolling. Seven
projects, StudyLog and a hub sit on a 3×3 grid, and every cell is the project itself running live
in the browser. The words run down the left like any page (below the map on a phone), and the camera follows them: as you scroll, it flies
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

- `map/index.html`: page shell (canvas, HUD, the thread, an empty `main` the sections are written into)
- `assets/portfolio/data.js`: **all content** (profile, home copy, path, projects, and the `live` copy per figure)
- `assets/portfolio/live/kit.js`: shared drawing helpers and the `Fig` base class
- `assets/portfolio/live/{relay,tracewise,onboard,dispatch,atlas,studio,layerline,hub}.js`: one live figure each
- `assets/portfolio/live/app.js`: the sections, scroll-to-camera mapping, dot matrix, the finale, input, sound, offline
- `assets/portfolio/live/live.css`: the HUD, the thread, the sections
- `assets/portfolio/notes.js`: the note index Atlas searches; rebuild with `python3 assets/portfolio/notes.py`
- `assets/portfolio/media/<id>.webp`: a still per flagship, used for link previews
- `sw.js`: network-first cache for `/map/` and `/explore/`

A figure implements `size`, `step`, `draw`, pointer handlers, `set(v)` with a `slider`, and `stats()`.
To add one, write it in `live/`, give it a cell in `CELL` and a place in `ORDER` in `live/app.js`,
and a `live` entry in `data.js`. `live/arena.js` is the TripleFind Arena figure, kept but no longer
on the map. Blog numbers in `writing` are a snapshot and need a manual refresh.

## The full portfolio

- `explore/index.html`: page shell (nav, source editor, terminal, case study dialog)
- `assets/portfolio/explore/app.js`: the sections, tiles, patch bay, history loop, case studies, terminal and live source
- `assets/portfolio/explore/sims.js`: the live sketch on each tile; a new flagship needs one in `KINDS`
- `assets/portfolio/explore/spectro.js`, `strings.js`: the hero, my name drawn as sound
- `assets/portfolio/explore/style.css`: the three themes and everything else

Its headings are `explore` in `data.js`, and each project's case study cover is its `motif`. It opens
dark like the map; the theme is a live value in the source panel. TripleFind Arena is listed under
the tiles as an experiment rather than as a tile.

Other corners: `/relay/` (Relay), `/tracewise/` (Tracewise), `/onboard/` (Onboard), `/dispatch/` (Dispatch), `/blog/` (StudyLog), `/atlas/` (StudyLog Atlas), `/studio/` (Intonation Studio), `/layerline/` (Layerline),
`/arena/` (TripleFind Arena), `/ptimer/` (ChillTimer), `/triplefind/` (TripleFind).
