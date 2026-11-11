# ChillTimer v2 — Design Spec

**Date:** 2026-11-11
**Folder:** `chilltimer/`. It was built in `ptimer-v2/` next to v1 and moved here on 2026-11-11, when it replaced v1. `ptimer/` now only holds a page that sends old links to `/chilltimer/`; v1 itself is in the git history.
**Stack:** plain HTML + CSS + ES modules. No build step. No libraries.

## 1. Goal

A focus timer that feels like sitting inside a quiet scene. Few clicks, but the
user always feels in control. **Main focus of this build: immersive UI and
control.** Everything else supports that.

## 2. Control (less click, full control)

| Input | What it does |
|---|---|
| `Space` | Start / pause |
| `↑` `↓` or mouse wheel on the digits | ±1 min, also while running (`Shift` = ±5) |
| `←` `→` | Previous / next scene in the vibe |
| Click the digits | Type an exact time |
| Type anywhere | Opens the command line |
| `Esc` | Close what is open |

**Command line** — one input for everything. It shows what it understood before
you press Enter.

| You type | Result |
|---|---|
| `45` · `1h30` · `90s` | Focus for that long, starts now |
| `break 10` · `short` · `long` | Start a break |
| `14:30 standup` · `7pm` · `at 9:00 daily` | Alarm at a time (once / `daily` / `weekdays`) |
| `every 30m water` | Repeating alarm |
| `in 10m tea` | One-off alarm |
| `cozy` · `lofi` | Switch vibe |
| `next` `skip` `reset` `undo` `zen` `mini` `full` `mute` `vol 40` `auto` `story` | Actions |

**Undo:** reset, skip and jump show an "Undo" toast for 6 s.
**Reload safe:** the running timer is saved and continues after a reload.
**Plan strip:** the whole cycle is drawn under the digits
(Focus → Break → … → Long break). Click a block to jump to it.
**Auto-flow:** one switch; the chain then runs without clicks.
**Dock:** one glass bar at the bottom. Chips: vibe, sound, alarms, stats,
settings, mini window, fullscreen. A chip opens a small popover in place. No
full-screen modals.
**Quiet mode:** while running, the dock and buttons fade after 3 s without
input. Mouse move brings them back. `zen` also hides the digits and leaves a
thin progress line.
Tab title and favicon show the time left. Screen wake lock while running.

## 3. Vibes and story scenes

A vibe = scene set + colours + digit font + sound mix + chime.
Built first: **Cozy** (Window seat, Fireplace, Attic nook) and
**Lofi** (Night desk, Rooftop, Neon alley). Café and Midnight come after the
quality check.

- Scenes are painted live on a canvas. Rain, flames, clouds, trains and lights
  are generated every frame, so there is no clip that restarts and no loop seam.
- **Story:** two clocks drive each scene.
  - `session` (0–1): place in the whole cycle. Light and weather follow it
    (Cozy: rainy dusk → night → rain stops, stars; Lofi: dusk → neon night →
    first light of dawn).
  - `round` (0–1): place in the current round. One object per scene shows it
    (candle burns down, fire sinks to embers, moon crosses the window, string
    lights switch on one by one, neon sign fills up).
- **Scene change:** at each round change (and with `←` `→`). Two stacked
  canvases, 7 s dissolve with a slow camera push. No hard cut. A small chapter
  title shows for a few seconds.
- "Play story" in the vibe popover runs the whole story as a 20 s time-lapse.
- A scene entry may later carry a `video` URL instead of a `draw` function.

## 4. Mascot

Original chibi girl, inline SVG, sitting at her own small desk in the
bottom-left corner. API is two calls: `mascot.act(state)` and
`mascot.say(text)`, so the art can be swapped for Live2D or a pet later.

| Moment | State |
|---|---|
| Nothing running | `idle` — blinks, looks around |
| Focus running | `focus` — types |
| 1 minute left | `lastMinute` — looks at the timer |
| Focus done | `done` — cheers |
| Short break | `break` — stretches, sips tea |
| Long break | `nap` — sleeps |
| Paused | `paused` — tilts head |
| Alarm rings | `alarm` — rings a bell, shows the label |
| Clicked | `poke` — reacts, says a line |
| After 23:00 or long idle | `yawn` |

## 5. Alarms

Kinds: `at` a clock time (once / daily / weekdays), `every` N minutes, `in` N
minutes. Saved in localStorage. Checked from a Web Worker tick against the wall
clock, so a background tab is not late.
Ring = chime loop + banner (Snooze 5 min / Dismiss) + mascot + browser
notification + title flash. An alarm that is more than 5 min late (page was
closed) is reported as missed and not rung.
**Limit:** alarms only work while the tab is open.

## 6. Sound and sound wave

- Ambience is generated with Web Audio: rain, fire, vinyl crackle, wind. No
  audio files. One slider per layer, one master volume.
- Music is generated too: a soft lofi beat (Lofi) or slow piano (Cozy). It
  never loops on the same bar. A YouTube link can be used instead.
- **Sound wave:** thin canvas along the bottom edge, behind the dock, low
  opacity, vibe colour. It reads an `AnalyserNode` on the master output.
- **Limit:** the browser does not let a page read audio from a YouTube frame.
  With YouTube the wave only shows the ambience.

## 7. Mini window

Document Picture-in-Picture (Chrome / Edge). Shows the live scene, digits,
progress, mascot state, next alarm, and buttons: start/pause, skip, −1, +1.
The chip is hidden in browsers without the API.

## 8. Stats

Today's rounds and minutes, day streak, 7-day bars, daily goal. One popover.

## 9. Out of scope

Task list, break helpers, accounts or sync, mascot outfits, offline install.

## 10. Storage

`ct2_settings`, `ct2_timer`, `ct2_alarms`, `ct2_stats` in localStorage.

## 11. Changes made during the build (2026-11-11)

These came from the owner's feedback while building. Where they differ from the sections above, this section wins.

- **Controls (replaces the dock text chips in §2).** One glass material for every control. The dock is
  icons only; a label glides in on hover or keyboard focus. A soft drop follows the pointer along the
  dock. Popovers grow out of the icon that opened them. Sliders are pills that fill with light,
  switches and segmented choices slide. Start / pause is a glass orb with a light that breathes.
- **Right-click menu.** The browser menu is replaced (text boxes keep it, for paste). Entries depend on
  what was clicked: digits, a plan block, the mascot, a dock icon, the alarm banner, or the scene.
- **Scenes (adds to §3).** Three kinds, picked in the Vibe popover: *Drawn* (the painted scenes),
  *Real video* (clips listed in `js/scenes/video.js`; each clip fades into its own start, clips
  dissolve into each other), *YouTube* (the owner's own link as the background).
- **Music (replaces §6 music).** Four sources: Off, Live (generated Piano or Beat), Tracks (the six
  lofi tracks from v1, with previous / next), YouTube (the same link as the background, as sound).
  A YouTube link pasted anywhere on the page is used at once. Room sounds are now six: rain, fire,
  vinyl, wind, forest, ocean.
- **Mascot: removed (§4 no longer applies).** The SVG chibi and the Live2D sample models (girl, dog)
  were both tried and rejected by the owner, who then asked for no mascot at all. All mascot code,
  styles, lab pages and the Live2D / PIXI loading are deleted. Do not add a mascot back.
- **Small things carried over from v1.** Chime can be off. Stats show the best day and all rounds.
  A soft bloom of light marks a finished focus round.
- **Outside sources at run time.** Fonts (Google Fonts), video clips (Mixkit), tracks (archive.org),
  YouTube player. Nothing from these is stored in the repo.

## 12. Home screen without buttons (2026-11-11, later the same day)

The owner rejected three control layouts (dock + panels, short rows with a "…" second step, one
deck) and picked the ring. What is built now replaces §2 where they differ.

- **Rail.** On screens wider than 700 px the bar is a rail on the left edge; on phones it stays a
  bar at the bottom. It holds only: alarms, today, the type-to-do box, settings, mini window, full
  screen. Scene, sound and mood are no longer in it. Rows never carry a "more" button.
- **The ring (`js/ring.js`, `#dial`).** Seven curved sliders around the clock: volume and the six
  room sounds. Slide along an arc to set a level; tap its icon to switch it off or on. The name and
  level show in place of the mode line while it changes ("Rain · 55"). No wheel support, on purpose.
- **Music and scenes on the screen.** Five music icons under the ring (off, piano, beat, tracks,
  YouTube; with tracks on, one dot per track). Scene dots and the three scene kinds sit in a small
  glass pill. Any scene picked by hand (a dot, a swipe, the arrow keys, the right-click menu, a
  typed scene name) leaves the YouTube picture; a vibe word alone does not.
- **Where the scene pill sits.** Wide screens: top left. Phones held upright: centred just above
  the bar, with bigger dots (at the top it covered the scene name and, on short phones, the top
  of the ring); it steps aside while a row or a sheet is open, and toasts show above it. Short
  screens (under 520 px tall: a phone on its side, a low window): the pill runs down the right
  edge, the words inside the ring shrink with the ring, and where the bar is at the bottom the
  music icons run down the left edge so the ring can use the height. Checked with no overlap
  at 320×568, 360×640, 375×667, 390×844, 568×320, 667×375, 844×390, 932×430, 1280×500, 1280×760.
- **Taps instead of buttons.** One tap on the picture or on the time starts or pauses (a ripple
  shows where the tap landed; a small line under the plan says "Tap to start" / "Paused · tap to
  resume"). Two quick taps on the right half go to the next block, on the left half start the block
  again; a soft light from that side confirms it and the toast offers Undo. Holding the time opens
  the time row. Scrolling never changes the time. The old start / skip / reset buttons stay in the
  page for screen readers only.
- **While a round runs.** The ring fades out and the time grows; any move brings the ring back.
- **Panels never scroll.** Scrollbars are hidden. Settings is two columns on wide screens; on
  phones it is one tighter column that may use the full height, and on short phones (under 720 px
  tall) its contents are drawn at 88 % so it still fits (checked at 375×667).
- **Languages.** English, Simplified Chinese, Traditional Chinese, Japanese, Korean; picked from the
  browser, or set in Settings (`js/i18n.js`, `js/lang/*.js`). What people type is understood in each
  language. `?lang=xx` forces one.
- **The tour (`js/ring.js`, `css/tour.css`).** First visit: a welcome card with "Start the tour" and
  "Not now". Then six steps, each with "Skip tutorial", Back and Next: tap, two taps on a side, the
  ring, hold the time, scenes, typing. On each step a finger shows the move with the same ripple and
  side light a real tap gives, and a small label says what it did. The finger only draws: it never
  changes the timer, the sound or the scene. The "?" in the top right opens the steps again, and
  glows twice when the tour closes so people see where it lives. `ct2_tourSeen` remembers the visit.
- **"Just type" (was the command line).** The owner read the box as a terminal, so the name, the
  icon (a keyboard, not a `>_` prompt) and every word about "commands" changed, in all five
  languages (直接打字, かんたん入力, 바로 입력). Empty, the box shows six groups of example chips
  (Timer, Alarm, Sound, Music, Scene, Screen); a tap runs one. It never scrolls. Beyond times and
  alarms it now takes: a YouTube link (`youtube <link>`, `play <link>`, the link alone,
  `youtube off`), room sounds (`rain 60`, `fire off`, `wind`), music (`piano`, `beat`, `tracks`,
  `next track`, `track 3`, `music off`), the end-of-block sound (`chime bell`), screen settings
  (`zen on`, `wave off`, `notifications on`, `auto on`), the plan (`50/10`, `rounds 6`, `goal 2h`),
  the language (`日本語`, `language auto`) and the tour (`how to use`). Each has its own words in
  every language (`cmd` and `cmd.groups` in `js/lang/*.js`), a read-out line and a toast.
  `10m tea` (a one-off alarm) now works.
- **Plain sentences, no AI (`readSentence` in `js/command.js`).** The exact forms run first and
  win. Only when they find nothing is the sentence read: filler words are dropped, lengths and
  clock times written in words become numbers ("half an hour", 半小时, 午後3時, 오후 3시), and the
  pieces left (an intent word, a length, a time, "every", on / off, a name) are turned into one of
  the exact forms, which the normal parser then checks. So "help create 45mins alarm" sets an alarm
  in 45 minutes and "remind me to drink water every 30 minutes" a repeating one named "drink
  water". The line under the box says what was understood before Enter. Two equally likely
  readings are shown as choices and Enter does nothing until one is picked; a sentence with two or
  more unknown words is not guessed ("hello there", "what time is it"). Word lists live in the
  `like` table of each language's `cmd` section. Known limits: English number words ("twenty
  minutes") and relative words ("rain louder" reads as rain on / off) are not understood.
- **Cursor.** A soft dot in the vibe's colours, drawn by `drawCursor` in `js/app.js` into three CSS
  values: `--cur` (resting: thin ring, small dot), `--cur-on` (over anything you can use: wider, in
  the accent colour) and `--cur-down` (sliding along the ring). Plain CSS cursor images, so no lag
  and nothing on phones. Text boxes keep the text cursor. While a round runs and nothing moves,
  the cursor hides with the controls and comes back on the first move.
- **Sound wave (replaces the band maths in §6).** A line of water along the bottom. Four swells of
  different lengths travel across it, two one way and two the other. The height of each comes from
  one part of the sound (bass 60–160 Hz = the long swell, then 160–520 Hz, 520 Hz–2 kHz, and 2–9 kHz
  = the fine ripple). Each part is measured against its own average over the last second or two,
  so steady rain keeps the water low and a note or a beat lifts it. Because the swells keep
  moving, no bump stays in one place. The first version put the lows in the middle of a mirrored
  line; rain kept them full, so it showed one round hump that bounced in the centre, which the
  owner disliked. Flat and cleared when silent. With reduced motion the water rises and falls
  but does not travel. The analyser uses 2048 points.
- **Slide to pick (replaces the scene dots and the track dots).** The lists grew past what one dot
  each can show, and the owner chose a line to slide along. Scenes: one line holds every scene of
  every vibe (a small mark shows where one vibe ends), with a small arrow at each end to step by
  one; the three kinds of scene sit beside it. Tracks: the same line next to the music icons when
  Tracks is on, with the name under it. While sliding only the name changes ("Lofi 2 / 7 · Rooftop",
  "19 / 36 · Bookworm — Purrple Cat"); the pick is made on release, so a slide past twenty scenes
  does not load twenty. It is a real range input (`pickHTML` / `wirePick` in `js/ring.js`), so keys
  and touch work by themselves. On short screens the line stands up (written top to bottom).
- **Tracks.** 36, all Creative Commons (CC0, CC BY, CC BY-SA) from archive.org, each with `url`,
  `license` and `page` in `js/tracks.js`. The name under the line links to that page and its tip
  shows the licence, which is the credit those licences ask for. The six tracks carried over from
  v1 came from an archive.org item with no licence stated, so the owner had them replaced by six
  licensed lofi tracks; `test.mjs` now fails if a track has no licence or source page.
- **Live music variants.** The generated Beat and Piano each come in eight kinds (`BEATS` and
  `PIANOS` in `js/sound.js`; settings `beatKit`, `pianoKit`). Beats: Mellow (the first one), Boom
  bap, Sleepy, Jazzy, Bossa, Dusty tape, Sunny, Night drive. Pianos: Felt (the first one),
  Raindrops, Nocturne, Mist, Waltz, Music box, Slow chords, Blue hour. A kit is one line of
  settings (speed, swing, where the drums land, brightness, what the left hand does); the players
  are the same, so each still changes by itself every few bars. With Beat or Piano on, the same
  slide line as for tracks picks the kind ("3 / 8 · Sleepy"). Loudness was measured per kit and
  evened out. Nobody has listened to them yet: they were checked by measurement only.
- **Drawn scenes: 14 (7 per vibe).** Added in `js/scenes/cozy-extra.js`: Rainy greenhouse, Old
  bookshop, Snowed in, Tea at night. Added in `js/scenes/lofi-extra.js`: Night train, Corner shop,
  Bedroom studio, Harbour lights. Each uses the story clock (things change over a session and
  in a break) the way the first six do. Draw speed could not be measured on a real graphics
  card here; the script part is about 1 ms a frame. Rainy greenhouse, Corner shop and Harbour
  lights are the heaviest (large gradient fills); caching those as pre-drawn images is the next
  step if they stutter.
- **Reading the clock on busy pictures.** A soft dark disc sits inside the ring, and the small
  line under the plan is brighter with a darker edge, because city lights (Night train, Harbour
  lights) and real videos can be bright right behind the words.
- **Real video scenes: 31 (16 Cozy, 15 Lofi).** 25 added, all from Mixkit (free licence, no credit
  needed), 1280×720, 8 to 60 seconds, 3 to 19 MB, played from Mixkit's own server. The helper
  looked at about 130 clips and dropped about 105 (portrait, too short, text or logos, people as
  the subject, a bright or busy middle, duplicates). Real footage is toned down a little
  (`filter: brightness(.74)`) and the small controls have a dark edge, because pale clips (snow, a
  dusk sky) made the light controls hard to read. Not checked: how each clip looks at its loop
  point ("Foggy night road" at 60 s is the longest). "Warm tree lights" is a Christmas tree.
- **Published.** v2 replaced v1 on 2026-11-11 and lives at `/chilltimer/`. `/ptimer/` keeps one
  small page that sends old links and bookmarks to the new address.
