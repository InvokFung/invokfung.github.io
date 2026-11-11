# ChillTimer v2 Implementation Plan

**Goal:** Build ChillTimer v2 in `ptimer-v2/` (moved to `chilltimer/` once done): an immersive focus timer with
story scenes, a mascot, alarms, generated sound and a type-to-command line.

**Architecture:** Plain ES modules, no build. Modules never import each other's
internals; they talk through `bus` events. Pure logic (command parser, alarm
schedule, plan builder) has no DOM access and is checked by `node test.mjs`.

**Tech stack:** HTML, CSS, ES modules, Canvas 2D, Web Audio, Document PiP.

**Spec:** `../specs/2026-11-11-chilltimer-v2-design.md`

**Note:** this plan locks file boundaries, interfaces and order. The code lives
in the files, not in this document. Built inline in one session, no commits
until the owner asks.

**Priority:** immersive UI and control come first and get the most polish.

---

## File map

| File | Job |
|---|---|
| `index.html` | Page shell: canvases, timer, plan strip, dock, popovers |
| `css/app.css` | All styles. Vibe colours come in as CSS variables |
| `js/bus.js` | `bus.on/emit`, `store.get/set`, `settings`, `saveSettings` |
| `js/timer.js` | Timer state machine, plan, undo, reload restore |
| `js/command.js` | Pure: `parseDuration`, `parseClock`, `parseCommand`, `describe`, `suggest` |
| `js/alarms.js` | Pure `nextFire`; alarm list, ring, snooze, missed |
| `js/scenes/kit.js` | Shared painters: sky, stars, skyline, rain, flame, glow… |
| `js/scenes/engine.js` | Two canvases, render loop, dissolve, story clocks, thumbnails |
| `js/scenes/cozy.js`, `lofi.js` | Vibe definition + 3 scenes each |
| `js/mascot.js` | SVG mascot, `act(state)`, `say(text)` |
| `js/sound.js` | Web Audio ambience, generated music, chimes, analyser |
| `js/mini.js` | Picture-in-Picture mini window |
| `js/stats.js` | Rounds, minutes, streak, week |
| `js/ui.js` | Digits, plan strip, dock, popovers, command line, keys, toasts, wave |
| `js/app.js` | Boot. Wires timer/alarm events to mascot, scenes, sound |
| `test.mjs` | Self-check for the pure logic |

## Interfaces (names are fixed)

```js
// bus.js
bus.on(evt, fn); bus.emit(evt, data);
store.get(key, fallback); store.set(key, value);       // prefix ct2_
settings; saveSettings(patch);                          // emits 'settings'

// timer.js
buildPlan(rounds) -> ['focus','short',…,'focus','long']
timer.state -> { mode, status:'idle'|'running'|'paused', totalMs, remainingMs, endAt, planIndex }
timer.plan(); timer.progress();
timer.start(); pause(); toggle(); reset(); skip(); jump(i); adjust(ms);
timer.setDuration(ms); startMode(mode, ms?); undo(); tick(now); restore();
// events: 'timer' (any change), 'timer:start', 'timer:pause', 'timer:complete' {mode, minutes},
//         'timer:block' {mode, planIndex}, 'timer:lastMinute', 'timer:undoable' {what}

// command.js
parseCommand(text, vibeIds) -> { type, … } | null
// types: focus{ms} break{mode,ms} alarmAt{h,m,repeat,label} alarmEvery{ms,label}
//        alarmIn{ms,label} vibe{id} volume{v} action{name}
describe(cmd, now) -> string;  suggest(text, vibeIds) -> [{ text, hint }]

// alarms.js
nextFire(alarm, now) -> timestamp
alarms.all(); add(cmd); remove(id); toggle(id); upcoming(); check(now);
alarms.ringing(); dismiss(); snooze(min);
// events: 'alarm:ring' alarm, 'alarm:stop', 'alarm:missed' alarm, 'alarm:change'

// scenes/engine.js
stage.init(canvasA, canvasB); setVibe(id); nextScene(dir); setStory({session, round, mode, running});
stage.info() -> { vibe, scene, index, count }; thumb(vibeId, i, w, h) -> canvas;
stage.preview(seconds); stage.canvas() -> active canvas; VIBES
// events: 'scene:change' info

// mascot.js
mascot.mount(el); act(state); say(text, ms); state()

// sound.js
sound.unlock(); setMaster(v); setLayer(name, v); setMix(mix); mute(bool);
sound.music.toggle(); music.setStyle(id); chime(kind); ringStart(); ringStop(); analyser()
```

## Tasks

- [ ] **1. Core logic.** `bus.js`, `timer.js`, `command.js`, `alarms.js`,
  `test.mjs`. Check: `node ptimer-v2/test.mjs` prints `all checks passed`.
- [ ] **2. Scene engine + first scene.** `kit.js`, `engine.js`, Cozy "Window
  seat", bare `index.html`. Check: scene renders in the browser, no console
  errors; look at a screenshot and fix what looks weak.
- [ ] **3. Shell and control.** `index.html`, `app.css`, `ui.js`: digits,
  buttons, plan strip, dock, popovers, command line, keys, wheel, undo toast,
  quiet mode, zen, title + favicon. Check each row of spec §2 by hand in the
  browser.
- [ ] **4. Remaining scenes.** Cozy Fireplace + Attic, Lofi ×3. Dissolve,
  chapter title, story preview, thumbnails. Check: `←` `→` dissolve without a
  cut; "Play story" moves light and weather.
- [ ] **5. Mascot.** SVG + states + speech bubble; wire moments in `app.js`.
  Check: force each state from the console, then run a 6 s round end to end.
- [ ] **6. Sound + wave.** Ambience layers, generated music, chimes, analyser,
  wave canvas. Check: wave moves when sound plays, flat when muted.
- [ ] **7. Alarms UI.** Banner, snooze, dismiss, notification, missed toast,
  alarms popover. Check: `in 5s test` rings; snooze re-rings.
- [ ] **8. Mini window + stats.** Check: mini window buttons drive the main
  timer; a finished focus round adds to today's stats.
- [ ] **9. Full pass.** Phone width (375 px), reduced motion, reload during a
  running round, console clean.
