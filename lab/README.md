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


### 2026-10-23 · Round 3: the portfolio as a pop-up book

Alan didn't want the effects stacked into one page. The asks: a first screen that is only something
to look at, with no project talk; the story told a little more on each step; all the projects
visible at a glance, so a visitor knows the range without scrolling through them; the six effects
grouped as skills, each with a small live preview that opens its own page (and no hanging cards);
less scrolling overall. Alan also remembered an award-winning portfolio built from layered
mountains, like a book: turn the page and the layers stand up solid, turn again and they fold.

`book/` is that idea, built without a library: `index.html`, `book.css`, `book.js` (the book) and
`specimens.js` (the six previews). Five pages, one per scroll turn, and a turn snaps to the next page
once you've scrolled a fifth of the way:

| Page | What is on it |
|---|---|
| Cover | Alan's name between ridges at first light. The title and "scroll to turn the page", nothing else. |
| How I got here | One mountain, with a flag for each year on the trail up it, from first commit in 2018 to Forward Deployed Engineer in 2026 (from `data.js` path). |
| Selected work | All seven projects at once, each running its live figure; FDE work in the front row. Each opens its case study. |
| Craft | The six effects as small live specimens (Reflow, Badge, Morph, Assemble, Pressure, Ink). Each opens its round 1 page. |
| Contact | Dusk ridges, "Say hello.", the email and the links. |

How the paper works: every layer is laid out flat in CSS, and `book.js` gives it a depth from where
its bottom edge sits (lower on screen is nearer) and a scale that keeps it exactly where CSS put it.
All layers stand on the page's floor, so each folds flat around its bottom edge. A turn folds this
page's layers front first, swings the page over a spine off to the left, and stands the next page's
layers up back first, with a little overshoot. It all follows the scroll position, so scrolling back
plays it in reverse. The pointer moves the eye a little, so the layers part.

Research (a helper searched award sites and case studies; Awwwards pages block fetching, so their
awards were read from search results):

- The site Alan remembered was not confirmed. Closest matches: Igloo Inc (igloo.inc, Awwwards Site of the Year per Igloo's own post: scroll turns a wireframe igloo on a mountain solid, then breaks it apart), Lusion's "My Little Storybook" (Awwwards SOTD, FWA, a Webby: a picture book you page through), and Iron0re's pop-up book portfolio (meilanunicorn.com: the exact mechanic, but no award found).
- Portfolios that shaped the layout: Stefan Vitasović (Awwwards SOTD 2025: a welcome screen, then one grid where every project plays live), Rogier de Boevé (CSSDA WOTD 2024: the whole index in one scene), Artem Shcherban (CSSDA WOTD 2026: a one-screen hub), Tomasz Szmajda (FWA: projects shown as objects in a world, not cards).

Changes to round 1 components: `pressure/pressure.js` measures a row by its layout width
(`offsetWidth`) instead of its on-screen box, so it sizes right inside a 3D-transformed page. The
round 1 page is unchanged by this, since nothing there is transformed.

Chrome quirks found, and what the book does about them:

- A 3D layer that hangs off the left of the screen is painted only to about a screen's width from its left edge. Ridges are drawn in two halves, two layers that share one transform.
- A plane stretched up with `scale()` lost whole regions; the floor is laid out at full size instead.
- Very deep, very large layers lost tiles, so the skies are flat backdrops behind the book, cross-faded on a turn.

Checked in headless Chromium (software WebGL) at 1440×900, 1920×1080, 1024×768 and 390×844, and
with reduced motion: no console errors, no horizontal overflow, every page turn filmed frame by
frame, every specimen and live figure fits its box.

Known limits, round 3:

- Not yet seen on a real phone or a real GPU; frame rates in headless say little.
- Root-relative links (`/explore/`, `/blog/`) only work on the real site.


### 2026-10-23 · Round 4: one smooth scroll

Alan's feedback on round 3: the book was only a way to describe the feel, not a request for a page
that flips. "I expect a smooth scroll content but a flip is breaking the experience." What they want
is the scene moving on to the next step with layers in motion, inside one continuous scroll. They
also asked whether the remembered site had actually been found and studied. It hadn't been.

Research, this time from the sites' own write-ups. This container can reach GitHub but not the
award sites themselves (igloo.inc, lusion.co, awwwards.com and tympanus.net are blocked at the
proxy), so nothing here was watched; it was read:

- Igloo Inc (Awwwards case study): one scrollable journey with no page cuts. The camera travels through a single scene, the intro "flows seamlessly into the rest of the experience", and scene changes blend chromatic aberration, displacement and frost instead of cutting.
- Firewatch: the classic layered landscape. Foreground, mountains and distant hills move at different speeds as you scroll.
- Lusion's My Little Storybook (Awwwards SOTD, FWA SOTD, Webby 2022): a WebGL picture book with hand-drawn layers over 3D, read by scrolling.
- Aimee's Papercraft World (WebGPU showcase, May 2026): a portfolio built from folded paper, where the scroll moves you along one path and the seasons change as you go, rather than paging.
- Joseph Santamaria '26 (Awwwards HM, March 2026): listed elements are scroll-driven UI transitions, an auto-scroll narrative and a 3D WebGL transition.
- What they share: the scroll moves a camera, not pages; scenes overlap as they change, so the screen is never empty; depth comes from layers moving at different speeds.

The site Alan remembered is still not confirmed.

`unfold/` is round 3 rebuilt on those rules: `index.html`, `unfold.css` and `unfold.js`, reusing
round 3's specimens (`book/specimens.js`). The same five scenes and copy, with no page turn:

- The scenes stand one behind the other, and the scroll moves the eye forward through them. The scene ahead starts a scene's depth away, with its layers lying on the floor. As you near it, they stand up back to front, a little past upright and back, while the whole scene comes toward you. The scene you are leaving keeps coming toward you, and its layers lie down front first.
- The two overlap, so there is always paper standing. Paper lying down is darker, and it is only drawn once it is off the floor.
- The eye slows near each scene, so it can be read, and moves fastest between two. There is no snapping. The page uses the browser's own scroll; what is drawn follows it a beat behind, so a flick of the wheel glides.
- Each sky is a flat backdrop, scaled about the eye as if it stood at the far edge of its scene's floor, so the horizon moves with its mountains.
- Each scene's floor sits a pixel below the one before it, so where two overlap mid-move, the scene you are leaving is the ground in front. Each floor's far edge fades into its sky.
- Words that sat on the front ridges (the role and the scroll cue, the email and links) are now their own sheets in front. That lets every ridge, including the front ones, be wider than the screen, since a scene seen from further away would otherwise show their ends.
- Reduced motion shows one scene at a time with everything standing.

Checked in headless Chromium at 1440×900, 1024×768 and 390×844, and with reduced motion. Every move
was filmed in tenths of a scene, with no console errors and no horizontal overflow. Each project
panel, each specimen and each contact link takes clicks at its scene. `goTo` lands on the scene it names.

Known limits, round 4:

- Not yet seen on a real phone or a real GPU. The brightness on paper that is lying down is a CSS filter, which may cost frames on a slow phone.
- Mid-move, the scene you are leaving can still show over the one arriving, which is as intended. The front sheet with the name looks large as it lies down.
- Root-relative links (`/explore/`, `/blog/`) only work on the real site.

### 2026-10-23 · Round 4, take 2: a day on the mountain

Alan's feedback on round 4: they almost like it, but the middle feels empty, and it needs richer
content without filler. Forward Deployed Engineer stood on the mountain top, which reads as the top
of their career: true for now, but they want to go higher. They asked whether it runs on a low-end PC
without lag, and for more in the background: something hidden behind the layers that the scroll
reveals, layers that tell a story, and more variety in how one scene hands over to the next.

Research, read rather than watched (the award sites themselves don't open from this container):

- Utsubo's guide to immersive storytelling sites. On IVRESS (*Spin a Tale*, Awwwards SOTD, FWA of the Month) each scene has to "become" the next, with continuous camera and material changes rather than hard edits. A linear story fits five scenes: hook, context, journey, climax, resolution. Serve quality by device, and set a performance budget from day one.
- Hon Tran's best award-winning websites of 2026. By-Kin's transitions "make the whole thing feel like a single continuous surface". Iventions (CSSDA Website of the Month) treats each project "like a spotlit installation", with the reveals paced like a guided walk-through.
- Orpetron's ten award-winning sites for animation on scroll only lists tags, so it added nothing.

What changed in `unfold/`:

- The landscape is one WebGL canvas (`scenery.js`), painted from the layout by `art.js`: skies, ground, ridges, the mountain, mist, cloud and the two big words. The page's own content stays in the DOM in CSS 3D, under the same projection, so the two line up. One canvas is one composited layer instead of round 4's sixty-odd.
- The story is a day on the mountain, first light to last. The year flags climb to a camp marked "2026 · so far". Past it the trail fades into cloud, toward a higher summit with an empty pennant marked "next". At contact the cloud has parted, the summit is clear and the trail goes up it.
- The middle has more in it. Each year's flag has one line on what changed, on hover or focus; the current one always shows its line. The front four work panels show two real numbers each from `data.js`, and every panel shows its live line on hover.
- Each handover is its own move, all on the plain scroll:
  - Hello to How I got here: the ridges tear at their lowest point and part like a curtain, nearer sheets further, on the mountain behind.
  - How I got here to Selected work: the camera flies to the camp and through the cloud beside it, lit by the camp. One scene becomes the next inside the cloud, and the work is there when it clears.
  - Selected work to Craft: the camera cranes along the camp. The panels lie down in a wave from the left and the specimens stand up behind them.
  - Craft to Contact: the camera climbs, cloud banks rise to fill the screen, and they part on the summit.
- Speed. The cost is almost all in pixels, so the canvas has four quality tiers. Below the top tier it draws coarser while the scroll moves and sharp again the moment it stops. It starts from what the device reports (software rendering starts at the lowest tier), steps down when frames run slow, and `?q=least|low|mid|high` pins one. On low tiers nothing drifts on its own or with the pointer.
- Reduced motion shows one scene at a time and crossfades whole scenes. Without WebGL the painted landscape lies flat in its boxes and the scenes crossfade; the Ink specimen says it needs WebGL.

Checked in headless Chromium at 1440×900, 1024×768 and 390×844, with reduced motion and with WebGL
switched off. Every move was filmed in steps of a tenth or less, with no console errors and no
horizontal overflow. Each project panel, each specimen and each contact link takes clicks at its scene.

Speed, measured the same way for both versions: a wheel scroll top to bottom in headless Chromium
with no GPU (SwiftShader), the worst case, since everything a graphics chip would draw is drawn by
the processor. A real GPU, even a laptop's built-in one, should be much faster; that is not measured
here.

| | round 4 | take 2 |
|---|---|---|
| 1440×900 | 11.2 fps (slowest 1%: 367 ms) | 22.3 fps (slowest 1%: 100 ms) |
| 1440×900, CPU slowed 4× | 8.8 fps | 13.2 fps |
| 390×844, CPU slowed 4× | 28.4 fps | 31.6 fps |

Known limits, take 2:

- Not yet seen on a real phone or a real GPU.
- On the lowest tier, the painted words ("Alan Fung", "Say hello.") are a little soft while the scroll moves.
- The fly passes through grey cloud for a moment, so for about a tenth of a scene's scroll there is nothing to read.

### 2026-10-23 · Shipped: take 2 is the homepage

Take 2 is the homepage. The root `index.html` loads `unfold/unfold.css` and `unfold/unfold.js` from
here, so this folder is now live code: change it on purpose, and start new experiments in a new
folder. The map that was the homepage moved to `/map/`, and Selected work links it ("running live,
here or on the map") next to the full portfolio ("not the whole shelf"). `book/specimens.js` now
builds its links from its own location, so the specimens open the right page from `/` and from
`/lab/unfold/`.

One fix on the way out: the first pixel of scroll from the cover drew the next scene's land at full
strength, so a blue band jumped into the dawn sky at the horizon. The land now fades in as the cover
tears (`floorIn` on the `part` move), and the dawn sky gives way to day earlier, as the tears open
rather than after. The other three moves were checked the same way, frame against frame after a
three-thousandths-of-a-scene scroll, and nothing else appears in one step.

A second fix once it was live: on a cold load every scene showed at once, flat and stacked, until
the fonts and scripts arrived and `unfold.js` posed them. The scenes and the folio now stay hidden
until the first frame has posed them (`html.posed`), so a cold load shows the dark stage and then
the opening. Filmed under a throttled network to check.

And on phones the cover's mist stopped in a hard vertical edge behind the name: the mist sprite
passed its tiling as `sub`, which also cuts the sheet's own width, so on screens under about 530px
wide the sheet ended short of the screen. It now spans its whole box with one width of mist across
it, which is how it already looked on wider screens.
