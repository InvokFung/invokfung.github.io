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

### 2026-10-23 · The opening, a sea of cloud

Afung found the cover flat: an empty dark ground, mist smears, and ridges that only stood up after
the page had been dark for a moment. Two openings were built and compared side by side:

- **A, first light.** The ridges are there from the start, dark, and the dawn lights them from the
  back ridge to the front one while the sun comes up behind them.
- **B, sea of cloud.** Two ranges of peaks and the sun rise out of a sea of cloud at dawn, the name
  just above it with billows round its feet, and a dark rock in front. The same first light plays
  over it.

B came closer, but Afung saw what was wrong with it: nothing layered over the peaks or just above
the name, a dim line where the far sheet of cloud met the near one, so it read as two pieces, and
not much life in the motion. So the cover's sea is no longer painted. It is drawn live by the
graphics chip (`deck.js`): one surface of heaped cloud from your feet to the horizon, found pixel by
pixel by following each ray from the eye until it meets a cloud top, then lit by the low sun ahead
(shaded fronts, sunlit slopes, glowing crests, haze toward the horizon in the sky's own colour).
It has its own camera, set so its horizon is the sky's and the peaks stand at its far edge, and it
is drawn in up to three passes slotted between the paper by depth: behind the peaks, in front of
them (thinning to nothing over their feet, so they stand in mist), and over the name's foot, so the
name stands in it. All three read a ray the same way, so they meet without a seam.

The heaps come from a 256-square noise texture baked once at load (about 20 ms): two layers of
domes of every height, packed in cells with the creases between them softened, and two of smooth
swells for where the sea runs thick or thin. The layers drift at different speeds and directions,
so the heaps change shape as they go, like cloud in a time-lapse. Far off the heaps settle lower
and those rays are taken three times down the pixel (on the fastest tier), or their edges
stair-step. Thin bands of wisp (`paintWisp`) drift across the peaks and just above the name. At
first light the light reaches the far cloud first and comes on toward you while the eye rises a
little out of the tops. As the cover parts, the sea parts down the middle with it.

Where WebGL is missing the cover falls back to the painted sea (`paintSea` in `art.js`, the two
sheets now overlapping so no gap shows between them).

On the way, two other spots got the same treatment:

- The cloud banks between craft and contact were round bubbles. They are painted with `paintSea`
  now, lit from the low sun on the left, and part with the same soft edge. They are big, so they
  are painted once the first screen is showing, not before it.
- In the pan from work to craft the incoming ridges showed hard vertical ends and a straight foot.
  Every paper sheet now fades out at its ends and foot, beyond where it shows at rest.

Speed, timed to the first posed frame at 4× CPU slowdown (SwiftShader, 1440×900, mid tier): the live
site 3.4 s, A 3.1 s, B 3.4 s. Without the deferred banks it was 4.4 s and 5.5 s. Canvas 2D drawing is
rasterised lazily in Chrome, so a painter can only be timed by reading a pixel back at the end.
With the live sea the first posed frame comes as soon as before (2.5 to 3.0 s on the same test, high
tier, against 2.9 to 3.2 s for the live site). Its cost moved into each frame instead: on a slow
graphics chip the opening's frames run slow, and that steps the page down a tier (fewer steps a ray,
no extra far rays, a coarser canvas) as it already did for the scroll.

### 2026-10-23 · Live: the sea of cloud, then its foot and a thread for the scroll bar

The live sea of cloud went out (PR #7). Two things came back from Afung straight after:

- **A gap at the very bottom.** The rock in front stopped at the bottom of the screen, and every
  paper sheet fades out at its foot, so a strip of the sea showed through under it (the painted sea
  used to stop short of the bottom, so this never showed before). The rock now runs on past the
  bottom of the screen (`.cover .r3`), so its faded foot is always out of sight.
- **The browser's grey scroll bar** broke the scene. A first try styled it as the day (its track the
  sky of each scene, its thumb that scene's sun), but a bar that sharp still ended the world at the
  screen's edge. So the bar is gone. The page scrolls exactly as before; where you are shows on a
  faint thread at the right edge (`#thread`, the thread section of `unfold.js`): a dot for each of
  the five scenes and a light in the colour of that scene's sun, which comes up while you scroll and
  fades a second after you stop, so the trip reads as five camps with an end. With a mouse it also
  shows on pointing and drags like a thumb; on touch screens it only shows, so a swipe at the edge
  still scrolls.

On the way, the cloud's edges near the name stair-stepped on Afung's screen. Rays are now taken
twice, down the pixel, over most of the sea (from a little way out; three times was too slow to
spread that far), the crests' glow is a little broader so it doesn't alias as a thin line, and the
name goes down into the cloud through a short fade instead of being cut along a line.

### 2026-10-26 · Round 6: the portfolio as the product

Afung passed on a friend's feedback and agreed with three points:

- "Say hello" reads as rude and too casual for a contact section.
- The UI/UX shown on the page is still simple and rough.
- A list of projects a recruiter can't place ("I built A, B and C") doesn't land. The page itself
  should be the proof of the UI/UX skill, and the projects that aren't UI work should show what they
  do for a product and where they get used, felt on the page rather than behind a click. Study the
  reference reels with REA, use libraries rather than hand-building, and make sure it all works.

Research. REA (Reverse Engineer Anything, `github.com/morluto/rea`, MIT) is an agent toolkit, and
its companion skill `rea-websites` is a 16-part checklist for taking a website apart. REA's own
installer needs Node 24 and a package from npm, and installing it was blocked in this container, so
the same checklist was run by hand with Playwright over the Chrome DevTools Protocol on three sites
from the reels (ERA, Nick Ho, Sweet Tape): scripts loaded, globals, every ScrollTrigger with its
tweens, and screenshots through the scroll.

- All three run GSAP 3.15 with ScrollTrigger, SplitText and CustomEase on Lenis smooth scroll.
- ERA: Lenis at `duration 1.2` with an exponential ease, driven from `gsap.ticker`, and
  `lagSmoothing(0)`; an arch that opens through a CSS mask whose size GSAP tweens as CSS variables;
  three custom eases (Out `0.25,1,0.5,1`, InOut `0.75,0,0.25,1`, In `0.5,0,0.75,0`); magnetic
  buttons; the header changing colour per section. It also snaps, which this site never does.
- Nick Ho: a video that grows from 70% of the screen to full bleed on a scrub, sections overlapping
  by 30vh, odometer numbers, a cursor with a label, and a marquee that turns round when you scroll up.
- Sweet Tape: pinned scrubs, `clip-path: inset()` reveals, Matter.js and Three.js.

What's in `product/`. It breaks the one-component rule on purpose: the page is meant to become the
homepage, so it is five files (`index.html`, `product.css`, `product.js`, `demos.js` and
`search.js`) and doesn't use the lab frame. Libraries are vendored unmodified: `vendor/gsap/` (GSAP
3.15.0 and its plugins, free under GSAP's standard license) and `vendor/lenis.min.js` (1.3.26, MIT).

- **Hero.** The name inside a selection frame that grows around it with a live size readout, the
  letters rising from a mask (SplitText). With a mouse, each letter can be dragged and springs back.
- **Statement.** A window that opens to full bleed as you scroll (ERA's mask, as `clip-path`), then
  one sentence that lights up word by word on a pinned scrub, and three odometer counts.
- **The work.** Seven cards that stack as you scroll (sticky, the one beneath scaling back and
  dimming). Each says what the project does for a product in one line, where it fits, one measured
  number from `assets/portfolio/data.js`, and runs a working demo beside it that plays once on its own:
  - Relay: a support chat. Personal data is swapped for placeholders before the prompt leaves, and
    with us-east switched off it retries, opens the breaker and answers from eu-west.
  - Tracewise: a service map. Click any service to add 600 ms; the dashboard's guess and the trace's
    answer disagree, and the trace is right.
  - Onboard: three exports of the same customers. Match scores them (Fellegi-Sunter weights,
    Jaro-Winkler names, union-find), Flip moves the rows into one table, and the threshold slider
    shows wrong merges and split people with a live F1.
  - Dispatch: a day of visits for three technicians. Send one home or click the map for an urgent
    job and the day re-plans by cheapest insertion with time windows.
  - Atlas: BM25 search over my 174 notes, as you type, offline.
  - Intonation Studio: a tuner reading a synthetic violin string with the McLeod pitch method. Sound
    and the microphone are both opt-in.
  - Layerline: a gear sliced layer by layer, with walls, infill and a nozzle riding the path.
- **Where this work fits.** Two marquees of the places it gets used, Nick Ho's: they speed up with
  the scroll and turn round when you scroll up.
- **Interface craft.** "The page you're scrolling is the UI work": tiles that switch the whole page
  to dark (a circle that grows from the switch, View Transitions), show the 12-column grid with live
  type specs on every element (design view), set the variable font's width and weight, check every
  colour pair against WCAG, draw the motion curve, turn on calm mode, and measure this page's frame
  rate on the visitor's device.
- **How I got here.** The years, pinned and moving sideways, ending at 2026 with "So far. Still
  climbing."
- **Contact.** "Get in touch." A short line, the email with a copy button, and the links.
- Everywhere: a search palette on `/` or Ctrl/Cmd+K over the page and the notes, a labelled
  cursor and magnetic links on a mouse, a progress bar, a page counter, a header that hides going
  down and changes tone with the section under it.

"Say hello" is now "Get in touch." on every page that had it: `/`, `/map/`, `/explore/`, and the
book and flow experiments.

Checked in headless Chromium at 1440×900, 1024×768 and 390×844, in dark theme, design view, calm
mode and with reduced motion: no console errors and no horizontal overflow. Every demo control was
clicked through with a script (drag a letter, send a chat, slow a service, move each slider, send a
technician home, add an urgent job, search, pick a string, copy the email), and jumping from the
palette lands on the right card with the header in the right tone.

Speed, measured as in round 4 (a wheel scroll top to bottom, headless Chromium with no GPU, so the
worst case). The first build was slower than it needed to be: every stacked card stayed drawn under
the next one, and the slicer redrew its whole layer every frame.

| | first build | now |
|---|---|---|
| 1440×900 | 49.9 fps (slowest 5%: 33 ms) | 58.6 fps (slowest 5%: 17 ms) |
| 1440×900, CPU slowed 4× | 40.1 fps | 48.6 fps |
| 1440×900, CPU slowed 6× | 28.2 fps | 37.6 fps |
| 390×844, CPU slowed 4× | | 52.5 fps |

What changed for speed: a card the next one has covered is hidden; stacking only moves transform
and opacity; the slicer paints a layer once and moves the nozzle on its own small canvas; the pitch
detector only searches the lags a violin can play. Slow devices (two cores or fewer, Save-Data, or
`?lite`) get a lite page with no scaling cards, no drift on the name and flat shadows, and a frame
watcher switches to it if scrolling runs below about 33 fps.

Known limits, round 6:

- Not yet seen on a real phone or a real GPU.
- The demos run the real methods on small sample data in the page; Relay's providers are simulated
  and say so. The measured numbers on each card come from the real projects.
- The fonts come from Google Fonts; offline, the page falls back to system fonts.
- Round 5 (`ascent/`, PR #10) is on its own branch. This round answers the same reels more fully,
  so it supersedes it.

### 2026-10-26 · Round 7: the scroll is the show

Afung's answer to round 6: not amazed. "There's not much scroll effect, none like the particle of
forming myself, nor scrolling magic where crazy content transition on scroll; that plain card
scrolling or text highlighting bores me." Recruiters aren't designers and won't click, so
everything has to play from the scroll alone, with "more and more transition". And no copy that
explains the craft to the reader: "we are showcasing but not teaching ... we let them experience
instead".

Research. 61 portfolio and studio sites known from Instagram and Awwwards reels were opened in
headless Chromium and scrolled with the wheel like a visitor, recording the libraries on the page,
every ScrollTrigger, WebGL contexts and shader keywords, with ten frames down each page
(`scan.js`, kept outside the repo). The list with links and each site's special moment is in the
project files (`reference-reels/round-7-sites.md`). What the best ones share:

- One thing carried through the whole scroll: Oryzo's cork coaster, Igloo's igloo built from
  wireframe to particles to ice, Lando Norris's helmet. The page is a film with one actor.
- Windows that open onto the next scene: Zentry's polygon, Adcker's image growing out of a
  bracket in the headline, K72's video inside a gap in the giant type.
- Type as a set piece: Wodniack's wall of W O R K, Noth.in's morphing logo letter, counters on
  every loader (Lusion, Refokus, Gianluca Gradogna, Mathis Biabiany).
- A colour change per chapter (Duo Studio, Dogstudio), and a dark scene that slides up over a
  light one (Ochi, Cuberto, Dennis Snellenberg's curved edge).
- Nearly all run GSAP with ScrollTrigger on Lenis, and Three.js for anything 3D.

What's in `reel/`. Five files: `index.html`, `reel.css`, `reel.js` (the film), `shapes.js` (the
shapes the dust can take). It adds Three.js 0.184.0 to `vendor/three/` (MIT, unmodified) beside the
GSAP and Lenis already there.

The whole page is one pinned stage and one timeline; the scroll is the playhead, counted in screen
heights. 32,768 points of dust (16,384 on a phone) on a WebGL canvas behind the text carry every
scene: each shape is sampled once into a float texture, and the vertex shader moves each point
from one texture to the next with its own delay, a swirl in flight and a swing through depth. The
same canvas paints the background, so the window and the wipes cost one draw.

- **Name.** The dust gathers into ALAN FUNG. The first scroll throws the line under it apart word
  by word and pours the name into a rippling floor.
- **What I do.** Three lines turn up out of the floor letter by letter; three numbers count up.
- **The window.** The floor draws into a ring, a dark window opens inside it, tilts, and grows to
  the whole screen while the ring grows with it (Zentry's polygon).
- **The work.** Seven chapters, each with its own tint. The ring bursts into what the project is
  (a reply that still arrives, a service map with the slow one ringed, three tables that merge into
  one, a day's route that bends, a lit paragraph under a lens, a violin, a vase printed in layers
  that spins and pulls apart), then that shape breaks up into the number it moved (99.98%, 98.9%,
  0.977, 97.0%, 85%, 0.17¢, 21 ms). The name and headline rise in 3D; the copy leans with scroll
  speed.
- **How I got here.** A circle of paper wipes up from the bottom; the dust rebuilds the year from
  2018 to 2026 while the title rolls over with it.
- **Contact.** The camera flies into the 0 of 2026, the hole opens into orange, and the dust
  bursts out of it into a signature beside "Get in touch."
- A photo can replace the signature: name it in `<body data-face="me.jpg">` and the dust draws the
  face as a halftone (contrast stretched, edges faded to an oval). None is in the repo yet.

The header takes the colour of whatever is behind it, including halfway through a wipe. With a
mouse, the cursor parts the dust.

Checked in headless Chromium at 1440×900, 1280×800 and 390×844, with reduced motion (no swirl, no
fly-through, fades instead of 3D) and without WebGL (`?nogl`: the name, numbers and years as text,
the colours on the stage): no console errors, and the bundled preview loads Three.js from jsDelivr
with none either.

Speed. The page's own work is small: 0.5 ms of script a frame (1.1 ms with the CPU slowed 4×), and
without WebGL the scroll holds 60 fps. The container has no GPU, so WebGL is drawn on the CPU
(SwiftShader) at about 14 fps, which says nothing about a real graphics chip but does show the
safety net working: the frame watcher drops to the lite page (half the dust, one pixel per CSS
pixel, smaller points) when frames run slow. Shapes are built in idle time after the name has
gathered, 9 to 47 ms each.

Known limits, round 7:

- Not yet seen on a real phone or a real GPU.
- No photo yet, so the dust ends on a signature rather than a face.
- The projects' live demos from round 6 aren't on this page; each chapter links to its project.

### 2026-10-26 · Round 8: the climb, with every trick on the way

Afung on round 7: "why now everything is particle, nothing you built from the research reel ... and
why our earlier motion and design all gave up and gone? i said show every cool shit together into
one place with seamless experience". Also: stop animating the name ("awkward and cringe"), take
the reference sites apart for how they work and combine their features instead of picking one,
look wider (award-winning portfolios, not only Instagram), and find our own thing among them.
Igloo Inc and Resn were examples of the level, not the target.

So round 8 starts from the live homepage, not a blank page. `lab/climb/` is a fork of
`lab/unfold/` (the day on the mountain): the cover, the climb, the shelf of live work, the craft
and contact all keep their motion, their paper and their cloud deck. The cover no longer says the
name; it says what the job is ("From the customer's desk to production."), and the name sits
still in the header.

**The film in the cloud.** On the flight from the climb to the camp, where the world is deep in
fog, the scroll holds the world still for 23 screens and plays a film over it, then lets the
world go on. It is native scroll, eased, never snapped; every frame is a function of the scroll
position, so scrolling back plays it backwards and the browser's own scrollbar and keys work.

- **What I do.** Three lines and three counts (7 projects, 174 notes, 4 titles) in dark ink on
  the fog, over giant outlined rows of the kinds of team I work with, crawling both ways.
- **Selected work.** A window cut in the paper, its top edge the mountain's skyline, opens on the
  first project, tilts toward you and grows to fill the screen.
- **Seven chapters**, each a paper diorama in Three.js built from the project's real data, with
  its words on the left: Relay (a request through nine arches; us-east folds flat, the breaker
  flashes, chips reroute), Tracewise (the real service map; the slow one heats up and a ring of ink
  closes round card-api), Onboard (28 people's records fly in from three piles and merge into one
  table), Dispatch (the real planner re-plans the day when Sam goes home sick), Atlas (174 real
  note titles on a leaning wall; a scan finds the paragraph and the card flies to you), Intonation
  Studio (the A string rings and the needle settles in cents), Layerline (a gear printed layer by
  layer, then pulled apart).
- **Between chapters, a different move every time**, all in one compositor pass:
  tear (Igloo Inc's diagonal cut, in paper), mosaic (Fiddle.Digital), contour lines (Lando Norris),
  the next name as a window you dive into (K72, Adcker), ink blooms (Noth.in), slats (Exo Ape),
  and a ring of paper out of the film (Ashfall).
- **Type.** Each project's name arrives its own way: Zentry's 3D letters (Relay), scrambled
  (Tracewise), from three sides (Onboard), a block wipe (Dispatch), a highlighter (Atlas), an
  elastic wave (Studio), printed line by line under a nozzle (Layerline). Numbers roll on odometer
  digits or count up. Each chapter leaves the way Zentry's titles do, turning away in depth.
- Over everything: paper grain, a vignette, and colour fringes that follow scroll speed.

How each trick was taken apart, with what their code does and where it lands here:
`reference-reels/round-8-teardown.md` in the project files.

Files: `index.html` and `climb.css` (the markup and the film's words), `world.js` (unfold's
engine with the hold), `film.js` (the clock and the DOM timeline, GSAP paused and driven by the
scroll), `film-gl.js` (the compositor and its nine moves), `film-scenes.js` (the seven scenes and
the cloud). Three.js 0.184.0 from `vendor/three/`; GSAP 3.15 with SplitText and ScrambleText from
`vendor/gsap/`. It reuses `../unfold/scenery.js`, `art.js` and `deck.js` unchanged.

Speed. Scenes are built in idle time before they're needed, then compiled. The heaviest chapter
is 169 draws (Dispatch) and the most triangles 53,000 (Layerline). The tier watcher from unfold
also steps the film down: shadows and multisampling on the top tier, no multisampling on mid, no
shadows below.

Checked in headless Chromium at 1280×800, 960×600 and 390×844 (touch), with reduced motion (every
move becomes a cross-fade and nothing moves on its own) and without WebGL (the film's words on a
dark ground, the landscape painted flat): no console errors.

Known limits, round 8:

- Not yet seen on a real GPU or a real phone; the container draws WebGL on the CPU.
- On phones the window opens onto mostly floor before Relay is framed.
- The old round 7 dust is not in this page; it stays in `lab/reel/`.

### 2026-10-26 · Round 9: one journey, one world

Afung on round 8: "i see a huge improvement but the key is now the original part became super
plain compare to the new part ... the two part clearly look like 2 separate design mixed". Also:
where did the particles go; the shelf of live work and the craft section repeat what the film
already shows; more content; more GSAP and scroll effects across the whole page, not only between
projects; more to play with (pointer, drag); "bring super elegant uiux modern design to max".

So round 9 is not a fork. `lab/journey/` puts the whole page on one canvas: every part is a small
3D scene in the same paper, and every part hands over to the next with its own move. There is no
film inside a page any more; the page is the film. The browser's own scroll drives it, eased,
never held or snapped, and scrolling back plays it in reverse.

The seven parts, in order:

- **Hello.** First light over the homepage's sea of cloud, now in the same renderer as the rest,
  with paper ridges standing in it. "From the customer's desk to production." and the role, then
  the dive into the cloud: three lines about the job, two rows of the kinds of team I work with
  running both ways (they lean and speed up with the scroll), and three counts that roll.
- **How I got here.** The mountain as a paper relief model, a sheet of card for every contour,
  with the trail in orange, a flag a year and the tent where 2026 stands, so far. The camera walks
  the trail; a year stamp rolls on odometer digits and a card for each year comes in beside it.
  Drag to turn the mountain.
- **Selected work.** Into the cloud by the camp, then round 8's seven project scenes and their
  type, each handing over with a different move.
- **How I work.** One long sheet with three set pieces the camera trucks along (a city with a pin
  dropped on one desk, the whole stack built as four slabs, a chart of what naming the culprit
  first is worth), and a belt of words that slides with it: FDE scrambles, 7 rolls, 98.9% counts.
- **Toolbox.** All 33 tools on paper tags in a globe you can spin; as you scroll it sorts itself
  into shelves by kind. Point at a tag to see since when and where I used it.
- **What's next.** Back on the mountain, the camera looks past the camp up the trail still to
  climb, with the one milestone each flagship has left.
- **Contact.** The sea of cloud at last light, embers in it, "Get in touch." and the email with a
  Copy button.

**Dust is back,** refined: a few thousand motes over everything, drawn after the frame, and their
light changes with the place. Motes in the low sun on the cover, a graphite line that draws the
mountain's outline as the cover turns into the climb, specks rushing past in the cloud, a sparse
haze in the chapters, fireflies round the toolbox, embers at dusk. They part round the pointer
with a swirl and ring out from a click. They're kept to a band and few in number on the light
scenes so they never read as stars.

**Moves between parts,** all in one compositor pass, on top of round 8's nine: mist (cloud rolls
in and thins onto the next place; the sea of cloud the page lives in), fold (the page folds up
along a slanting crease, its back showing the print through: Lusion's page turn, flat) and shards
(the sheet breaks into cut pieces that turn away: the Voronoi cut in Active Theory's work, in
paper). Far jumps from the rail or the header cut under a paper veil instead of scrolling through
everything in between.

**Words.** One paused GSAP timeline whose time is the scroll, with SplitText for lines, words and
characters and ScrambleText for labels. Headings rise by character with Zentry's 3D turn and
leave the same way; ledes come in by line; numbers roll on odometer digits or count; the cover
words scatter as you leave.

**To play with.** A cursor ring that grows over links and turns into "drag" over what can be
dragged; magnetic buttons; drag to orbit the mountain and the how sheet and to spin the toolbox;
a rail on the right with a tick per part (hover for its name, click to go, drag to scrub); a
header that scrambles to the part you're in; the dust around the pointer.

Removed, as asked: the "Seven of them, all running" shelf and the "I build the motion, too"
section. The work is shown once, in the film. The name is in the header and never animates.

Files: `index.html` and `journey.css`; `journey.js` (the engine: the clock, the sequence of
shots, tiers, the pointer, rail and header); `story.js` (the words' timeline); `fill.js` (fills
the lists from `assets/portfolio/data.js`); `comp.js` (the compositor and its twelve moves);
`dust.js`; `sky.js` (dawn and dusk); `places.js` (the mountain, the how sheet, the toolbox);
`works.js` (the cloud and the seven project scenes, from round 8). It reuses `../unfold/art.js`.
Three.js 0.184.0 from `vendor/three/`; GSAP 3.15 with SplitText and ScrambleText from
`vendor/gsap/`.

Speed. One renderer and two render targets for the whole page; each scene is built when it's
next and compiled in idle time. Four tiers: shadows, multisampling and 2,400 motes on the top;
800 motes and no shadows on low; no dust at all on the lowest, which is also where a software
renderer lands. It steps down on slow frames, draws coarser while the page is moving, and on the
lower tiers draws every other frame when nothing moves. Debug: `?q=high|mid|low|least` pins a
tier, `?t=` jumps to a point in screens.

Checked in headless Chromium at 1280×800 and 390×844 (touch), with reduced motion (moves become
cross-fades, the dust holds still) and without WebGL (the words on flat grounds in each part's
colour): no console errors.

Known limits, round 9:

- Not yet seen on a real GPU or a real phone; the container draws WebGL on the CPU.
- About 45 screens long. Every part earns its screens, but it is a long walk; the rail is the
  shortcut.

Round 9, later the same day. Afung: "why the trail seems not moving, and please check performance
smooth or not, and phone view, especially thin width".

- **The trail moves.** The camera keeps the walker in frame, so the thread's growth hardly showed.
  Now a bead of light stands at its tip with a ring rippling out from it, light runs up the walked
  part to where you are, and the dashes still to walk creep uphill.
- **A stall at the start of every part, gone.** Scenes were compiled ahead of time for the screen,
  but drawn into a render target, which needs different shaders, so each part's first frame
  compiled them again: 160 to 740 ms in headless Chromium. Each scene is now drawn once, small and
  out of sight, as it's built (shaders compile in the background where the browser can, and the
  first draw waits for a pause in the scroll, up to 3 s). Over a steady 40-second scroll, no
  frame's script took more than about 12 ms, where each part used to start with 160 to 740 ms.
- The type mask for the Atlas dive read a large canvas back from the GPU (3 s in headless
  Chromium); it now measures a quarter-size copy kept in memory.
- The frame no longer changes size while you scroll (that was a hitch of its own on phones), and
  split words and letters no longer each ask for their own layer.
- Script time per frame is about 1 ms; no part draws more than 170 times or 64,000 triangles a
  frame. A meter in the corner shows how a real phone copes: `?fps`, F, or a tap on the last line
  of the page turns it on.
- **Thin phones** (checked at 320, 360 and 390 wide): the dawn ridges keep their shape instead of
  squeezing into spikes; the words of how I work and what's next sit on a sheet of paper at the
  foot of the screen; what's next stacks each item under its name; the toolbox drops its group
  counts, which sat on top of the shelves (the shelves name their groups themselves); and a
  number's digits each take their own width, so 2018 no longer reads as "201 8".

Then, an hour later. Afung, with screenshots: "why a gap at bottom again, and its floating, also i
still don't see the right side trait moving", and of the colour split on a fast scroll, "specially
made or a glitch?"

- **The near hill stands on the bottom edge again.** It was drawn into the sea of cloud, and the
  ray-marched cloud in front of it won the depth test, so a pink strip showed under it. The hill
  now always draws over the cloud (its own depth still writes, so what's in front of it holds).
  Checked at dawn and dusk, desktop and phone.
- **The progress line on the right moves.** Forty-four screens on a 350-pixel line is 8 pixels a
  screen, which reads as still. The line now magnifies where you are, like a dock: one fine tick
  per screen, spread out around the knob and bunched up far from it, so the ticks stream past as
  you scroll. The walked part fills in ember, the knob stretches with speed, and while you scroll
  the part's name rides beside it. Dragging it still scrubs; the lens holds still while you drag.
- **The colour split was on purpose**, a little chromatic edge that grows with scroll speed, but
  at full strength it read as a glitch. It's now capped at a faint edge of a pixel or two.

The same afternoon, before it went live. Afung, with a screenshot of the year's tags on the mountain
piled on one another: "label overlapped, please fix, and better on phone not stacked too, haven't
you check?" I hadn't, not frame by frame. Now every screen has been, on desktop, tablet and phone.

- **The year's tags sit in rows by their flag.** They were hung round the flag in the world, so
  from most angles they stacked up and covered the year. Now they're set out on the screen: rows
  above the flag, or beside or below it where the room is, clear of each other, the year on the
  flag and the caption and big year on the page. Each chip is as wide as its word.
- **The scene falls away behind the words.** In the projects, how I work, the toolbox and what's
  next, the side of the screen with the words fades into the part's own colour, so the Atlas wall,
  the city or a tag never runs through a line of copy. The toolbox's fall clears once its shelves
  sort; on a phone only the projects need it.
- The toolbox names are whole (long ones set a little smaller instead of cut short with "…"), and
  the far side of its globe falls back so the tags facing you read clear.
- The opening words drift apart from the middle of their line as you scroll, where before two of
  them ran into each other on the way out.
- On a phone, Atlas's note comes to the middle at a size that fits, and the part's name by the
  progress line stays hidden (it ran across the picture).

Then Afung said deploy: round 9 is the homepage from 26 Oct. `/index.html` loads it from
`lab/journey/`, which is live code from here on, as is `lab/unfold/art.js` (its ridges).
`/lab/unfold/` keeps the mountain it replaced.

Live the same afternoon, Afung found three things on the contact page: pressing and dragging on a
button like GitHub made the row of links vanish; a drag across the page painted blue selection
over everything, slabs and all; and the buttons moved too much with the pointer.

- **Why the links vanished.** A press with the mouse focuses a link, and a helper meant for the
  keyboard (bring a focused link's part on screen) then scrolled back to where contact starts,
  before its links fade in. Only keyboard focus moves the page now, and the header's "Get in
  touch" and the rail land where every word of a part has arrived.
- **No stray selection.** The page's words can't be selected or dragged off as a ghost; the email
  still can, to copy it.
- **Calmer buttons.** They lean a few pixels at most, the big address not at all; at dusk the
  landscape answers the pointer a little more instead.

The same evening Afung sent a screenshot of the camp's year with its 2 cut off ("have you uat"),
so the whole page went through a proper test: every screen at 1440, 1280, 1024, 390, 360 and 320
wide, and every control pressed, dragged, held, hovered and tabbed to. What it found, all fixed:

- **Years on the mountain are whole or gone.** They were drawn into the scene, so a sheet of card
  in front could cut one in half. Now every year is drawn over the scene and fades out while the
  mountain stands between it and you, or while it would sit on the page's words. The camp's chips
  keep clear of its year too, and a label too long for its canvas is set smaller, never cut.
- **Resizing no longer blanks the page.** Turning a phone or resizing the window rebuilt the words'
  timeline from the page as it stood, when every heading still to come was blank, so they stayed
  blank. The words are read once and kept.
- **Scrambles always finish.** A scrambled word played with the scroll, so stopping halfway left it
  garbled ("scratmu"); now it plays on the clock once you pass its moment.
- **What's next and the climb keep their words clear.** The fall of colour reaches the foot of the
  list in what's next, past years step aside there, and a soft pool of grey sits behind the big
  year on the climb so flags and trail don't run through it.
- **The toolbox's tag stays on screen,** flipping to the other side of the pointer near an edge.
- **The big year comes back on the way up.** Scrolling back up to the climb from further down left
  its year hidden: the part was shown with GSAP's autoAlpha, and stepping back past its end put back
  the faded opacity and, with it, `visibility: hidden`. Parts are now shown by visibility alone.
- **Relay's window opens after the words leave.** It used to open in the middle of the screen while
  "Seven questions I couldn't leave alone" was still there, a dark shape through the heading.
- **The toolbox fits its room.** On a tablet the globe and the shelves ran over the words and off
  the right edge under the rail (at 1440 the last shelf touched the edge). The page now says where
  its words end, and the globe turns right of them while the shelves sit right of them or, on a
  squarer screen, under them, whichever gives the bigger tags.
- **No selection while dragging.** A drag across the page no longer paints the words blue; the
  email can still be selected to copy.
- **The cursor takes the part's colour** instead of a blend mode, which also spares the browser a
  pass over the whole film every frame.
