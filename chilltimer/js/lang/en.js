// English. The source of truth: it holds every key the app uses.
//
// FOR TRANSLATORS — read this first.
// - Copy the keys you translate into your own file (zh-Hans.js, zh-Hant.js, ja.js, ko.js) and change only
//   the values. A key you leave out shows in English, so the app always works.
// - A value is a string, or a function `v => '...'` when the wording needs logic (plurals in English,
//   counters in Japanese and so on). In your language a plain string is often enough even where English
//   uses a function: you may replace a function with a string that uses the same {slots}, or the other way round.
// - {slot} marks a value the app fills in. Keep every slot, spelled exactly the same. You may move a slot
//   to wherever your word order needs it. Each group comment says what its slots hold.
// - Room: most texts sit in small capsules and buttons. Keep them as short as the English or shorter.
//   Group comments give the room when it is tight.
// - Do not translate: the brand "ChillTimer", "YouTube", track titles and artists, font names, and key
//   names such as Space, Esc, Shift, ↵, ↑ ↓ ← →.
// - "·" (a middle dot with spaces) separates parts of a line in this app. Keep it where the English has it,
//   unless your language has a better separator.
// - Use your language's normal punctuation (for example 。、！ in Chinese and Japanese).
// - Times such as 14:30 are always 24-hour digits; minutes and hours go through the span.* keys.

export default {
  // ---------- page ----------
  // The page description for search engines and link previews. One sentence or two.
  'meta.description': 'ChillTimer — a focus timer inside a quiet, living scene. Vibes, alarms, and a box where you just type what you want.',
  // The browser tab title while a timer runs. {time} = time left such as 24:13, {mode} = one of the mode.* names.
  // "⏸ " is put in front by the app when paused. Keep "ChillTimer" as it is.
  'title.running': '{time} · {mode} — ChillTimer',

  // ---------- the mode line above the big digits ----------
  // Small capital letters with wide spacing. Keep it short: about 25 characters.
  'mode.focus': 'Focus',
  'mode.short': 'Short break',
  'mode.long': 'Long break',
  // While focusing. {n} = this round's number, {of} = rounds in one cycle. "Focus · round 2 of 4".
  'mode.focusRound': 'Focus · round {n} of {of}',

  // ---------- the start button (also its hover label and screen-reader name) ----------
  // One or two words. Also used as the first item of the right-click menu and in the mini window.
  'toggle.pause': 'Pause',
  'toggle.resume': 'Resume',
  'toggle.startFocus': 'Start focus',
  'toggle.startBreak': 'Start break',

  // ---------- first-run hint, one line under the timer ----------
  // Shown on the first visit only. One line, small text. {space} becomes the Space key drawn as a key cap.
  // Split the parts with " · " (space, middle dot, space): the app draws each dot softer.
  'hint.line': '{space} or tap anywhere to start · double-tap the right side for the next block, the left to restart · hold the time to change it · or just type',
  // The small line under the plan while nothing runs, and while paused.
  'state.idle': 'Tap to start',
  'state.paused': 'Paused · tap to resume',
  // Toast: YouTube was chosen but no link is set yet.
  'ring.pasteYt': 'Paste a YouTube link anywhere on this page',
  // The first-visit tour. tour.open is the label of the "?" button. One or two short sentences per step.
  'tour.open': 'How to use',
  'tour.skip': 'Skip tutorial',
  'tour.next': 'Next',
  'tour.done': 'Got it',
  // The welcome card before the tour, and its two buttons. tour.back is the step-back button.
  'tour.hello.title': 'Welcome to ChillTimer',
  'tour.hello.body': 'A short tour shows the few moves that run everything. It takes about a minute.',
  'tour.hello.again': 'You can open it any time from the ? in the corner.',
  'tour.start': 'Start the tour',
  'tour.later': 'Not now',
  'tour.back': 'Back',
  // Small labels next to the moving finger in the tour: what the move just did. Two to four words.
  'tour.did.start': 'Timer starts',
  'tour.did.pause': 'Timer pauses',
  'tour.did.next': 'Next block',
  'tour.did.again': 'Block starts again',
  'tour.did.time': 'Time row opens',
  'tour.did.scene': 'Next scene',
  'tour.tap': 'Tap anywhere on the picture, or on the time, to start. Tap again to pause.',
  'tour.sides': 'Tap twice on the right side to go to the next block. Tap twice on the left side to start this block again.',
  'tour.ring': 'This ring is your sound. Slide along an arc to set rain, fire and the rest. Tap an icon to switch it off.',
  'tour.time': 'Hold the time to change how long this block is.',
  'tour.scenes': 'Swipe the picture sideways, or slide along this line, to change the scene.',
  'tour.type': 'You can also just type: 45, 14:30 standup, or a scene name.',

  // ---------- screen-reader texts (not seen, heard) ----------
  // The big digits button.
  'aria.digits': 'Time left. Click to type a time.',
  // The box that opens over the digits to type an exact time.
  'aria.digitsEdit': 'Set time, for example 25 or 12:30',
  // The row of small blocks under the digits (the session plan).
  'aria.plan': 'Session plan',
  // One block of the plan. {mode} = a mode.* name, {min} = its length in minutes (a number, or "<1").
  'aria.planBlock': '{mode}, {min} min',
  'aria.planBlock.now': '{mode}, {min} min, current block',
  // Said once a minute while the timer runs. {n} = minutes left (a number).
  'aria.minutesLeft': '{n} minutes left',
  // The icon rail.
  'aria.dock': 'Controls',
  // The "…" button at the end of a row; it opens the full panel.
  'aria.more': 'More options',
  // The speaker button that mutes and unmutes.
  'aria.mute': 'Mute or unmute',
  // The − and + buttons beside a number in Settings.
  'aria.less': 'Less',
  'aria.moreStep': 'More',
  // A volume slider. {name} = what it sets (the main volume, or a room sound such as Rain).
  'aria.volumeOf': '{name} volume',
  // A scene picture in the Vibe panel. {vibe} = a vibe name, {scene} = a scene name.
  'aria.thumb': '{vibe}: {scene}',

  // ---------- top bar ----------
  // Hover label of the small capsule that shows the next alarm, top right.
  'top.nextAlarm': 'Next alarm',
  // Vibe and scene together, for the small label top left, the scene icon's hover label and the right-click
  // menu title. {vibe} = vibe name, {scene} = scene name. Shown in small capitals.
  vibeScene: '{vibe} · {scene}',

  // ---------- icon rail ----------
  // The rail on the left (wide screens) or the bar at the bottom (phones).
  // rail.<x>: the name under the icon. ONE short word, about 6 characters. It shows on the first visit
  //   and in the narrow bottom bar, where there is very little room.
  // rail.<x>.label: what screen readers say for the icon. May be longer.
  'rail.vibe': 'Scene',
  'rail.vibe.label': 'Scene',
  'rail.sound': 'Sound',
  'rail.sound.label': 'Sound',
  'rail.mood': 'Room',
  'rail.mood.label': 'Room sounds',
  'rail.alarms': 'Alarm',
  'rail.alarms.label': 'Alarm',
  'rail.stats': 'Today',
  'rail.stats.label': 'Today',
  'rail.cmd': 'Just type',
  'rail.cmd.label': 'Just type what you want',
  // Hover label of the "Just type" icon. One short line.
  'rail.cmd.tip': 'Type what you want, and it happens',
  'rail.settings': 'Settings',
  'rail.settings.label': 'Settings',
  'rail.mini': 'Mini',
  'rail.mini.label': 'Floating mini window',
  'rail.full': 'Full',
  'rail.full.label': 'Fullscreen',

  // ---------- hover labels ----------
  // A glass capsule that follows the pointer over the icons. One short line each.
  'tip.digits': 'Tap to start or pause · hold to change the time',
  // Scene icon before a scene has loaded.
  'tip.vibe': 'Vibe',
  // {n} = volume in percent (a number). {track} = a track title (never translated).
  'tip.sound': 'Sound · {n}%',
  'tip.sound.track': 'Sound · {n}% · {track}',
  'tip.sound.muted': 'Sound · muted',
  // {name} = a room mood name such as "Soft rain".
  'tip.mood': 'Room · {name}',
  // The room sounds were mixed by hand and match no named mood.
  'tip.mood.own': 'Room · your own mix',
  'tip.alarms': 'Alarms',
  // {time} = the next alarm's clock time such as 14:30.
  'tip.alarms.next': 'Alarms · next {time}',
  // {min} = focus minutes today, {goal} = daily goal in minutes.
  'tip.stats': 'Today · {min} of {goal} min',

  // ---------- rows that unfold from an icon ----------
  // A tap on an icon opens one small row beside it. strip.<x> is the row's title, in italics, at the start of
  // the row. ONE or two short words: the row has little room.
  'strip.vibe': 'Scene',
  'strip.sound': 'Sound',
  'strip.mood': 'Room',
  // Followed by buttons "5 min", "15 min", "30 min", "60 min" (from span.m).
  'strip.alarms': 'Ring in',
  'strip.stats': 'Today',
  // The Today row. {min} = focus minutes today, {goal} = daily goal in minutes, {rounds} = rounds done today,
  // {streak} = days in a row with focus. A function in English because of "round" / "rounds". One line.
  'strip.stats.line': v => `${v.min} of ${v.goal} min · ${v.rounds} round${v.rounds === 1 ? '' : 's'} · ${v.streak}-day streak`,
  // The row that opens from the big digits. Next to −5 −1 +1 +5 buttons.
  'strip.time': 'Time',
  // Button that opens a box to type an exact time. Short, about 8 characters.
  'strip.time.type': 'Type it',

  // ---------- lengths of time ----------
  // Used everywhere a length is shown: buttons ("5 min"), alarms ("in 10 min"), Settings ("25 min").
  // {s} seconds, {m} minutes, {h} hours (numbers). Keep them short: they sit in small buttons.
  'span.s': '{s} s',
  'span.m': '{m} min',
  'span.h': '{h} h',
  'span.hm': '{h} h {m} min',

  // ---------- alarms ----------
  // An alarm's short name in the alarm list, the alarm banner and toasts.
  // {time} = a clock time such as 14:30. {span} = a length from span.*.
  'alarm.at': '{time}',
  'alarm.at.daily': '{time} daily',
  'alarm.at.weekdays': '{time} weekdays',
  'alarm.every': 'every {span}',
  'alarm.in': 'in {span}',
  // The name of a snoozed alarm. {label} = the alarm's own name (typed by the user, never translated).
  'alarm.snoozed': '{label} (snoozed)',
  // Small line under each alarm in the list. {time} = when it rings next, {span} = how long until then.
  'alarm.next': '{time} · in {span}',
  // Same line when the alarm is switched off.
  'alarm.off': 'off',

  // ---------- alarm banner (when an alarm rings) ----------
  // The big title when the alarm has no name of its own. Also flashes in the tab title.
  'ring.alarm': 'Alarm',
  // Two wide buttons. A key cap (S or ↵) is drawn after each, so keep them short: about 14 characters.
  // Also used in the right-click menu over the banner.
  'ring.snooze': 'Snooze 5 min',
  'ring.dismiss': 'Dismiss',

  // ---------- YouTube box (in the Vibe and Sound panels) ----------
  // Status line under the link box.
  'yt.empty': 'Paste a link, or pick one below',
  // Shown after "▶" when the video has no title.
  'yt.playing': 'Playing',
  'yt.loading': 'Loading…',
  // Placeholder inside the link box, and its screen-reader name.
  'yt.placeholder': 'Paste a YouTube link, then Enter',
  'yt.aria': 'YouTube link',
  // Small button that stops the link.
  'yt.stop': 'Stop',
  // The typed text is not a YouTube link.
  'yt.bad': 'That does not look like a YouTube link',
  // Quick-pick playlists: small buttons, music genre names. One word each.
  'yt.pick.lofi': 'Lofi',
  'yt.pick.jazz': 'Jazz',
  'yt.pick.piano': 'Piano',
  'yt.pick.synthwave': 'Synthwave',
  'yt.pick.nature': 'Nature',

  // ---------- track list (Sound panel, and the right-click menu) ----------
  'tracks.prev': 'Previous track',
  'tracks.next': 'Next track',
  // Tip on a track's name: the licence, then these words. The name links to the track's own page.
  'tracks.source': 'Where this track comes from',
  // The small arrows at the ends of a pick line (beats, pianos).
  'pick.prev': 'Previous',
  'pick.next': 'Next',
  // The live beats to choose from. One or two words: the feel of the beat.
  'kit.beat.mellow': 'Mellow',
  'kit.beat.boombap': 'Boom bap',
  'kit.beat.sleepy': 'Sleepy',
  'kit.beat.jazzy': 'Jazzy',
  'kit.beat.bossa': 'Bossa',
  'kit.beat.dusty': 'Dusty tape',
  'kit.beat.sunny': 'Sunny',
  'kit.beat.drive': 'Night drive',
  // The live pianos to choose from. One or two words: the feel of the piece.
  'kit.piano.felt': 'Felt',
  'kit.piano.rain': 'Raindrops',
  'kit.piano.nocturne': 'Nocturne',
  'kit.piano.mist': 'Mist',
  'kit.piano.waltz': 'Waltz',
  'kit.piano.musicbox': 'Music box',
  'kit.piano.hymn': 'Slow chords',
  'kit.piano.blue': 'Blue hour',

  // ---------- Vibe panel ----------
  // Panel title, large italic.
  'pop.vibe': 'Vibe',
  // Three choices in one slider switch, together with "YouTube". About 10 characters each.
  'pop.vibe.drawn': 'Drawn',
  'pop.vibe.video': 'Real video',
  // One small paragraph under the switch, for the choice in use.
  'pop.vibe.aboutDrawn': 'Painted live. Light and weather follow your session.',
  'pop.vibe.aboutVideo': 'Real footage. Each clip fades into its own start, so it never cuts.',
  'pop.vibe.aboutYoutube': 'Your own link plays behind everything. The vibe still sets colours and sound.',
  // A switch row: name, and a small note under it. Also a right-click menu item.
  'pop.vibe.autoScene': 'New scene each round',
  'pop.vibe.autoScene.note': 'Slow dissolve when a block ends',
  // A wide button at the bottom.
  'pop.vibe.story': 'Play the story as a 20 s time-lapse',

  // ---------- Sound panel ----------
  'pop.sound': 'Sound',
  // Label inside the main volume slider.
  'pop.sound.volume': 'Volume',
  // Section headings: small capitals with wide spacing.
  'pop.sound.music': 'Music',
  'pop.sound.room': 'Room',
  'pop.sound.endOfRound': 'End of round',
  // Choices in a slider switch, together with "YouTube". About 8 characters each.
  'pop.sound.off': 'Off',
  'pop.sound.live': 'Live',
  'pop.sound.tracks': 'Tracks',
  // A row: name and a small note under it. Music made by the browser itself, never the same twice.
  'pop.sound.madeLive': 'Made live',
  'pop.sound.madeLive.note': 'In your browser. Never loops.',
  // Two music styles in a small switch.
  'pop.sound.piano': 'Piano',
  'pop.sound.beat': 'Beat',
  // The sound at the end of a round. Row name, then choices in a small switch (with "Off" from pop.sound.off).
  'pop.sound.chime': 'Chime',
  'pop.sound.chime.soft': 'Soft',
  'pop.sound.chime.bell': 'Bell',
  'pop.sound.chime.digital': 'Digital',

  // ---------- Alarms panel ----------
  'pop.alarms': 'Alarms',
  // Placeholder of the box where you type a new alarm. Use forms that work in YOUR language
  // (see cmd below). Keep it about this long.
  'pop.alarms.placeholder': '14:30 standup · every 30m water · 10m tea',
  'pop.alarms.aria': 'New alarm',
  // Shown under the box when the typed text is not an alarm yet.
  'pop.alarms.help': 'Try 14:30, 7pm, every 30m, or 10m',
  // Small quick buttons (next to "+5 min", "+1 h", which come from span.*).
  'pop.alarms.every30': 'every 30 min',
  'pop.alarms.everyHour': 'every hour',
  // Screen-reader names of the on/off switch and the delete button of each alarm.
  'pop.alarms.switch': 'Alarm on',
  'pop.alarms.delete': 'Delete alarm',
  // When there are no alarms. One or two short sentences.
  'pop.alarms.empty': 'No alarms yet. They ring only while this tab stays open.',

  // ---------- Today panel (stats) ----------
  'pop.stats': 'Today',
  // After a big number of minutes: "48 min of 120". {goal} = daily goal in minutes.
  'pop.stats.minOf': 'min of {goal}',
  // Three small captions under three big numbers. Two or three short words each.
  'pop.stats.rounds': 'rounds today',
  'pop.stats.streak': 'day streak',
  'pop.stats.allTime': 'all time',
  // The big "all time" number: {n} hours, or {n} minutes. Very short unit.
  'pop.stats.hours': '{n} h',
  'pop.stats.mins': '{n} m',
  // Section heading over a small bar chart of the last week.
  'pop.stats.week': 'Last 7 days',
  // One letter (or one character) for each day under the bars: EXACTLY 7 characters, Sunday first.
  'pop.stats.days': 'SMTWTFS',
  // {best} = most focus minutes in one day, {rounds} = all rounds ever.
  'pop.stats.best': 'Best day {best} min · {rounds} rounds in all',
  // Row with − and + buttons.
  'pop.stats.goal': 'Daily goal',

  // ---------- Settings panel ----------
  'pop.settings': 'Settings',
  // Row names. A row has a name on the left and a control on the right, so keep names short.
  'pop.settings.preset': 'Preset',
  'pop.settings.focus': 'Focus',
  'pop.settings.short': 'Short break',
  'pop.settings.long': 'Long break',
  'pop.settings.rounds': 'Rounds per cycle',
  // Name and small note under it.
  'pop.settings.autoFlow': 'Auto-flow',
  'pop.settings.autoFlow.note': 'The next block starts by itself',
  // Section heading, small capitals.
  'pop.settings.screen': 'Screen',
  // Zen hides everything but the scene. Also a right-click menu item.
  'pop.settings.zen': 'Zen',
  'pop.settings.zen.note': 'Hide the digits too while a round runs',
  'pop.settings.wave': 'Sound wave',
  'pop.settings.notify': 'Notifications',
  'pop.settings.notify.note': 'When this tab is in the background',
  // Section heading over the language buttons. The buttons show each language's own name, plus this "Auto"
  // (follow the browser's language). Keep "Auto" to one short word.
  'pop.settings.language': 'Language',
  'pop.settings.langAuto': 'Auto',
  // Section heading and one line of text.
  'pop.settings.data': 'Data',
  'pop.settings.data.note': 'Everything is saved in this browser only.',
  // Two buttons side by side. About 12 characters each.
  'pop.settings.export': 'Export',
  'pop.settings.clear': 'Clear all',
  // The clear button after the first click: asks for a second click.
  'pop.settings.clear.again': 'Click again to clear',

  // ---------- Keys and commands panel ----------
  'pop.help': 'Keys and typing',
  // A two-column list. help.<x>.keys = what to press or type (left, in a code box);
  // help.<x> = what it does (right). Write the typed commands the way they work in YOUR language
  // (see cmd below): a reader will copy them. Key names (Space, Shift, ↑ ↓) stay as they are.
  'help.toggle': 'start / pause',                 // left side is the key "Space"
  'help.adjust.keys': '↑ ↓ · scroll',
  'help.adjust': '±1 min (Shift: ±5)',
  'help.arrows': 'previous / next scene',         // left side is "← →"
  'help.tapTime.keys': 'tap the time',
  'help.tapTime': 'add or take minutes, or type it',
  'help.tapIcon.keys': 'tap an icon',
  'help.tapIcon': 'it unfolds into one small row; … opens the rest',
  'help.scrollIcon.keys': 'scroll on an icon',
  'help.scrollIcon': 'turns it like a dial: sound, room, scene',
  'help.swipe.keys': 'swipe the picture',
  'help.swipe': 'previous / next scene',
  'help.rightClick.keys': 'right-click',
  'help.rightClick': 'actions for what you clicked',
  // Room mood names (see mood.* below), in your language.
  'help.room.keys': 'storm · fireside · vinyl',
  'help.room': 'room sound by name',
  'help.focus.keys': '45 · 1h30 · 90s',
  'help.focus': 'focus for that long',
  'help.break.keys': 'break 10 · long',
  'help.break': 'start a break',
  'help.alarmAt.keys': '14:30 standup',
  'help.alarmAt': 'alarm at a time (add daily or weekdays)',
  'help.every.keys': 'every 30m water',
  'help.every': 'repeating alarm',
  'help.in.keys': 'in 10m tea',
  'help.in': 'one-off alarm',
  'help.vibe': 'switch vibe',                     // left side is the vibe names
  'help.plan.keys': 'skip · reset · undo',
  'help.plan': 'move through the plan',
  'help.scenes.keys': 'next · prev · story',
  'help.scenes': 'scenes',
  'help.screen.keys': 'zen · mini · full',
  'help.screen': 'screen',
  'help.sound.keys': 'mute · vol 40 · music',
  'help.sound': 'sound',
  'help.auto.keys': 'auto',
  'help.auto': 'auto-flow on / off',
  // Small line at the bottom.
  'pop.help.foot': 'Just start typing anywhere. Enter runs it, Esc closes.',

  // ---------- right-click menu ----------
  // A small glass menu. Items are one line, about 24 characters at most. "…" means it opens a panel.
  // Menu titles: small capitals at the top of the menu.
  'menu.title.ring': 'Alarm',
  'menu.title.time': 'Time',
  // A block of the plan. {mode} = a mode.* name, {min} = its minutes.
  'menu.title.block': '{mode} · {min} min',
  'menu.title.sound': 'Sound',
  'menu.title.alarms': 'Alarms',
  'menu.title.stats': 'Today',
  'menu.title.settings': 'Settings',
  'menu.title.scene': 'Scene',
  'menu.snooze15': 'Snooze 15 min',
  'menu.typeTime': 'Type a time…',
  'menu.add1': 'Add 1 min',
  'menu.take1': 'Take 1 min off',
  'menu.add5': 'Add 5 min',
  // Over a block of the plan.
  'menu.jump': 'Jump here',
  'menu.jumpStart': 'Jump here and start',
  'menu.lengths': 'Change lengths…',
  'menu.mute': 'Mute',
  'menu.unmute': 'Unmute',
  // Actions (turn music on / off), not states.
  'menu.musicOn': 'Music on',
  'menu.musicOff': 'Music off',
  'menu.waveShow': 'Show the sound wave',
  'menu.waveHide': 'Hide the sound wave',
  'menu.mixer': 'Open the mixer…',
  // {min} = 5, 15 or 30.
  'menu.ringIn': 'Ring in {min} min',
  'menu.ringIn1h': 'Ring in 1 hour',
  // {time} = the next alarm's clock time.
  'menu.deleteNext': 'Delete the next one · {time}',
  'menu.allAlarms': 'All alarms…',
  'menu.openStats': 'Open stats…',
  'menu.openSettings': 'Open settings…',
  // {name} = a vibe name.
  'menu.switchTo': 'Switch to {name}',
  'menu.ytStop': 'Stop the YouTube background',
  'menu.ytChange': 'Change the link…',
  'menu.ytUse': 'Use a YouTube link…',
  'menu.story': 'Play the story · 20 s',
  'menu.full': 'Fullscreen',
  'menu.fullLeave': 'Leave fullscreen',
  'menu.mini': 'Mini window',
  'menu.cmd': 'Just type…',

  // ---------- command line ----------
  // A box that opens when you type anywhere.
  'cmd.aria': 'Type what you want',
  // Placeholder: examples that work in YOUR language (see cmd below). Keep it about this long.
  // "lofi" is a vibe name: use the vibe name in your language.
  'cmd.placeholder': '45 · 14:30 standup · every 30m water · lofi',
  // The line under the box that says what Enter will do. The app puts "↵  " in front of the first three.
  'cmd.read.youtube': 'Play this YouTube link as the background and the music',
  // {name} = a room mood name.
  'cmd.read.mood': 'Room sound: {name}',
  // {name} = a scene name.
  'cmd.read.scene': 'Scene: {name}',
  'cmd.read.empty': 'Type what you want, or tap an example',
  'cmd.read.partial': 'Keep going, or pick one below',
  'cmd.read.which': 'Which one did you mean? Pick one below.',
  // Nothing matches. Give examples that work in YOUR language.
  'cmd.read.unknown': 'Not sure what that means. Try 45, 14:30 call, or every 30m water.',
  // Hint on the right of a suggested vibe name. Lower case in English.
  'cmd.hint.vibe': 'switch vibe',
  // Titles of the example groups shown when the box is empty (the examples are cmd.groups below). One word.
  'cmd.group.timer': 'Timer',
  'cmd.group.alarm': 'Alarm',
  'cmd.group.sound': 'Sound',
  'cmd.group.music': 'Music',
  'cmd.group.scene': 'Scene',
  'cmd.group.screen': 'Screen',

  // What Enter will do: the line under the command box, and a toast after an alarm is set.
  // {span} = a length from span.*, {time} = a clock time, {label} = the alarm's name as typed (never translated),
  // {name} = a vibe name, {n} = a number. One line.
  'do.focus': 'Start a focus round',
  'do.focusFor': 'Focus for {span}, starts now',
  'do.short': 'Short break, starts now',
  'do.shortFor': 'Short break for {span}, starts now',
  'do.long': 'Long break, starts now',
  'do.longFor': 'Long break for {span}, starts now',
  // An alarm at a clock time. The last {span} is how long until it rings.
  // ".daily" rings every day, ".weekdays" Monday to Friday. ".label" when the alarm has a name.
  'do.alarmAt': 'Alarm at {time} (in {span})',
  'do.alarmAt.label': 'Alarm at {time} — {label} (in {span})',
  'do.alarmAt.daily': 'Alarm at {time}, daily (in {span})',
  'do.alarmAt.daily.label': 'Alarm at {time}, daily — {label} (in {span})',
  'do.alarmAt.weekdays': 'Alarm at {time}, weekdays (in {span})',
  'do.alarmAt.weekdays.label': 'Alarm at {time}, weekdays — {label} (in {span})',
  'do.alarmEvery': 'Alarm every {span}',
  'do.alarmEvery.label': 'Alarm every {span} — {label}',
  'do.alarmIn': 'Alarm in {span}',
  'do.alarmIn.label': 'Alarm in {span} — {label}',
  'do.vibe': 'Switch vibe to {name}',
  'do.volume': 'Volume {n}%',
  'do.on': '{name}: on',
  'do.off': '{name}: off',
  'do.layer': '{name} at {n}%',
  'do.layerToggle': '{name} on / off',
  'do.youtubeOff': 'Stop the YouTube link',
  'do.track': 'Play track {n}',
  'do.chime': 'End-of-block sound: {name}',
  'do.chimeOff': 'No sound at the end of a block',
  'do.plan': 'Focus {focus} min, break {short} min',
  'do.plan.long': 'Focus {focus} min, break {short} min, long break {long} min',
  'do.rounds': 'A long break after every {n} focus rounds',
  'do.goal': 'Daily goal: {span}',
  'do.lang': 'Switch the language to {name}',
  'do.langAuto': 'Use the language of your browser',

  // What each command word does. Shown under the command box, and (in lower case) as the hint beside a
  // suggestion. Some are also right-click menu items and hover labels. One short line.
  'action.start': 'Start the timer',
  'action.pause': 'Pause the timer',
  'action.reset': 'Reset this block',
  'action.skip': 'Skip to the next block',
  'action.undo': 'Undo the last jump',
  'action.next': 'Next scene',
  'action.prev': 'Previous scene',
  'action.story': 'Play the scene story as a time-lapse',
  'action.video': 'Use real video scenes',
  'action.drawn': 'Use drawn scenes',
  'action.zen': 'Hide everything but the scene',
  'action.mini': 'Open the floating mini window',
  'action.full': 'Toggle fullscreen',
  'action.tracks': 'Play the track list',
  'action.mute': 'Mute all sound',
  'action.unmute': 'Sound back on',
  'action.music': 'Music on / off',
  'action.auto': 'Auto-flow on / off',
  'action.alarms': 'Show alarms',
  'action.sound': 'Show sound mixer',
  'action.stats': 'Show stats',
  'action.settings': 'Show settings',
  'action.help': 'Show what you can type',
  'action.piano': 'Play live piano',
  'action.beat': 'Play live beats',
  'action.wave': 'Sound wave on / off',
  'action.notify': 'Notifications on / off',
  'action.tour': 'Show how to use the app',

  // ---------- toasts ----------
  // Small glass notes at the bottom that fade after a few seconds. One line each, short.
  // After reset / skip / jump, with an "Undo" button (toast.undo) beside it.
  'toast.reset': 'Reset',
  'toast.skipped': 'Skipped',
  'toast.jumped': 'Jumped',
  // The button in a toast. One short word.
  'toast.undo': 'Undo',
  'toast.under10s': 'Cannot go under 10 seconds',
  // A typed time was not understood.
  'toast.timeHelp': 'Try 25, 12:30 or 1h30',
  'toast.miniUnsupported': 'Mini window needs Chrome or Edge',
  'toast.miniFail': 'Could not open the mini window',
  // {min} = 5, 15, 30 or 60.
  'toast.ringIn': 'Alarm in {min} min',
  'toast.story': 'Playing the story · 20 s',
  'toast.storyDrawnOnly': 'The story time-lapse is for drawn scenes',
  'toast.nothingToUndo': 'Nothing to undo',
  'toast.zenOn': 'Zen on · digits hide while a round runs',
  'toast.zenOff': 'Zen off',
  // States, after the change.
  'toast.muted': 'Muted',
  'toast.soundOn': 'Sound on',
  'toast.musicOn': 'Music on',
  'toast.musicOff': 'Music off',
  // {title} = a track title (never translated).
  'toast.playingTrack': 'Playing {title}',
  'toast.autoOn': 'Auto-flow on · blocks start by themselves',
  'toast.autoOff': 'Auto-flow off',
  'toast.youtubeSet': 'YouTube link set as background and music',
  // {name} = a room mood name.
  'toast.mood': 'Room: {name}',
  'toast.snoozed': 'Snoozed 5 min',
  // {name} = a video clip name (see clip.* below).
  'toast.videoFail': 'Video "{name}" did not load. Back to drawn scenes.',
  // A round ended. {min} = its minutes. ".flow" when the next block starts by itself in 4 seconds.
  'toast.focusDone': 'Focus done · {min} min',
  'toast.focusDone.flow': 'Focus done · {min} min · next starts in 4 s',
  'toast.breakOver': 'Break over',
  'toast.breakOver.flow': 'Break over · next starts in 4 s',
  // An alarm's time passed while the page was closed. {title} = the alarm's short name (alarm.*),
  // {label} = its own name as typed.
  'toast.missed': 'Missed alarm {title}',
  'toast.missed.label': 'Missed alarm {title} · {label}',
  // A YouTube link could not play.
  'toast.yt.load': 'YouTube did not load. Try another link.',
  'toast.yt.link': 'That link looks wrong. Try another link.',
  'toast.yt.removed': 'That video was removed or is private. Try another link.',
  'toast.yt.owner': 'Its owner does not allow playing it on other sites. Try another link.',
  'toast.yt.other': 'That video cannot be played here. Try another link.',
  'toast.tracksFail': 'The tracks did not load. Are you offline?',

  // ---------- browser notifications ----------
  // Shown by the system when this tab is in the background. Title, then body.
  'notify.focusDone': 'Focus round done',
  // {min} = the round's minutes.
  'notify.focusDone.body': '{min} min. Time for a break.',
  'notify.breakOver': 'Break is over',
  'notify.breakOver.body': 'Ready for the next round?',
  // Alarm title. {label} = the alarm's own name as typed. The body is the alarm's short name (alarm.*).
  'notify.alarm': 'Alarm',
  'notify.alarm.label': 'Alarm: {label}',

  // ---------- mini window ----------
  // A tiny window (380 × 190) that floats over other apps. Buttons are tiny: keep to about 6 characters.
  // The pause and resume texts come from toggle.*.
  'mini.start': 'Start',
  'mini.skip': 'Skip',
  // Screen-reader names of the −1 and +1 buttons.
  'mini.minus': 'One minute less',
  'mini.plus': 'One minute more',

  // ---------- names of things ----------
  // Vibes: a set of scenes, colours and sounds. The name is one word; the tagline a short phrase.
  // Vibe names can also be typed as commands. Shown as large italic titles and in buttons.
  'vibe.cozy': 'Cozy',
  'vibe.cozy.tagline': 'A rainy evening in',
  'vibe.lofi': 'Lofi',
  'vibe.lofi.tagline': 'Night shift',
  // Drawn scenes. Shown as a large italic title when the scene changes, and on small pictures.
  // Two or three words. A scene name can also be typed as a command.
  'scene.window': 'Window seat',
  'scene.fireplace': 'Fireplace',
  'scene.attic': 'Attic nook',
  'scene.desk': 'Night desk',
  'scene.rooftop': 'Rooftop',
  'scene.alley': 'Neon alley',
  'scene.greenhouse': 'Rainy greenhouse',
  'scene.bookshop': 'Old bookshop',
  'scene.snowbound': 'Snowed in',
  'scene.teatime': 'Tea at night',
  'scene.train': 'Night train',
  'scene.corner': 'Corner shop',
  'scene.studio': 'Bedroom studio',
  'scene.harbour': 'Harbour lights',
  // Real video clips (used instead of drawn scenes when "Real video" is on). Same use as scene names.
  'clip.rain-window': 'Rain on the window',
  'clip.fireplace': 'Fireplace',
  'clip.forest': 'Sunlit forest',
  'clip.night-city': 'Night city',
  'clip.city-above': 'City from above',
  'clip.waterfall': 'Waterfall',
  'clip.candle': 'Candle in the dark',
  'clip.steaming-mug': 'Steaming mug',
  'clip.sleeping-cat': 'Sleeping cat',
  'clip.snow-woods': 'Snow in the woods',
  'clip.forest-mist': 'Mist over the forest',
  'clip.misty-lake': 'Misty lake',
  'clip.beach-sunset': 'Beach at sunset',
  'clip.campfire': 'Campfire at dusk',
  'clip.roof-rain': 'Rain off the roof',
  'clip.creek': 'Creek at dawn',
  'clip.tree-lights': 'Warm tree lights',
  'clip.snowy-moon': 'Moon over snowy hills',
  'clip.oil-lamp': 'Cafe oil lamp',
  'clip.tokyo-dusk': 'Tokyo at dusk',
  'clip.record-player': 'Record player',
  'clip.cassette': 'Cassette tape',
  'clip.foggy-road': 'Foggy night road',
  'clip.star-trails': 'Star trails',
  'clip.milky-way': 'Milky Way',
  'clip.night-lake': 'Night lake',
  'clip.car-rain': 'Rainy car window',
  'clip.night-window': 'Night window',
  'clip.tokyo-bay': 'Tokyo bay at night',
  'clip.bokeh-street': 'Blurred streetlights',
  'clip.coast-road': 'Coast road at night',
  // Room moods: named mixes of room sounds. Small buttons, so one or two short words.
  // A mood name can also be typed as a command.
  'mood.quiet': 'Quiet',
  'mood.soft-rain': 'Soft rain',
  'mood.rain-fire': 'Rain and fire',
  'mood.fireside': 'Fireside',
  'mood.storm': 'Storm',
  'mood.forest': 'Forest',
  'mood.shore': 'Shore',
  'mood.vinyl': 'Vinyl',
  'mood.night-rain': 'Night rain',
  'mood.rooftop-wind': 'Rooftop wind',
  'mood.downpour': 'Downpour',
  // Room sound layers: the name inside each slider of the Sound panel. One word.
  'layer.rain': 'Rain',
  'layer.fire': 'Fire',
  'layer.vinyl': 'Vinyl',
  'layer.wind': 'Wind',
  'layer.forest': 'Forest',
  'layer.ocean': 'Ocean',

  // ---------- commands typed in your language ----------
  // People type in the "Just type" box and in the alarm box. The app understands an English grammar.
  // This `cmd` object turns what people type in YOUR language into that English grammar first.
  // English needs nothing here except the examples. Numbers and clock times (45, 1h30, 14:30, 7pm) always
  // work as they are, and the English words always work too, in every language.
  //
  // THE ENGLISH GRAMMAR (what your words turn into):
  //   45 · 1h30 · 90s                 focus for that long, starts now
  //   focus 45 · work 45              the same
  //   break 10 · short · long 20      start a short or long break (the number is optional)
  //   14:30 standup · 7pm             alarm at a time; the words after it are its name
  //   at 9:00 gym daily               add "daily", "weekdays" or "once" at the very end
  //   every 30m water                 repeating alarm with the name "water"
  //   in 10m tea                      one-off alarm with the name "tea"
  //   vol 40                          volume 40%
  //   rain 60 · fire off · wind       a room sound: rain fire vinyl wind forest ocean (alone: on / off)
  //   zen on · wave off               on / off for zen, wave, notifications, auto, music
  //   chime bell                      end-of-block sound: soft, bell, digital or off
  //   next track · previous track · track 3
  //   25/5 · 50/10 · 90/20            focus / break presets; rounds 6 · goal 120 (or goal 2h)
  //   youtube <link> · youtube off    a YouTube link alone works too
  //   English · 日本語 · language auto  switch the language
  //   start pause reset skip undo next prev story video drawn zen mini full tracks mute unmute
  //   music auto alarms sound stats settings help piano beat wave notify tour     (actions)
  // Vibe, room mood, room sound and scene names work when typed in your language: they come from vibe.*,
  // mood.*, layer.*, scene.* and clip.* above, so they need nothing here.
  //
  // THE SHAPE (fill in each part for your language):
  //   units: words that mean hours / minutes / seconds right after a number. Longest words are tried first.
  //          { h: ['小时', '小時'], m: ['分钟', '分'], s: ['秒'] }       → "30分钟" becomes "30m"
  //   every: patterns for a repeating alarm. {d} stands for the length of time. Put text before and/or after
  //          {d}, in your word order. A space in the pattern means "a space or none", and spaces next to {d}
  //          are optional too. What follows the pattern is the alarm's name.
  //          Chinese  ['每{d}', '每隔{d}']      每30分钟 喝水   → every 30m 喝水
  //          Japanese ['{d}ごと', '{d}おきに']  30分ごと 水     → every 30m 水
  //          Korean   ['{d}마다']               30분마다 물     → every 30m 물
  //   in:    patterns for a one-off alarm, the same way.
  //          Chinese  ['{d}后', '{d}之后']      30分钟后 泡茶   → in 30m 泡茶
  //          Japanese ['{d}後']                 10分後 お茶     → in 10m お茶
  //          Korean   ['{d} 후', '{d} 뒤']      10분 후 차      → in 10m 차
  //   track: patterns for "track 3", the same way: Chinese ['第{d}首'], Japanese ['{d}曲目'].
  //   words: your words for the English words of the grammar above, as lists (the first word of each list is
  //          the one the app suggests). Any action, plus focus, work, break, short, long, vol, vibe, at, alarm,
  //          daily, weekdays, once, chime, rounds, goal, language, and the value words on, off, soft, bell,
  //          digital. A key may be two English words: { 'next track': ['下一首'] } (works when typed alone).
  //          { skip: ['跳过'], mute: ['静音'], break: ['休息'], long: ['长休息'], daily: ['每天'] }
  //          A word works alone ("跳过"), as the first word ("闹钟 14:30 开会"), and with a number on EITHER
  //          side, with or without a space: "休息 10", "休息10分钟", "10分 休憩" all become "break 10m".
  //          daily / weekdays / once also work as the last word: "14:30 开会 每天" → "14:30 开会 daily".
  //          on / off / soft / bell / digital / auto work after a setting, with or without a space, on
  //          either side: "音乐 关", "关音乐", "音楽をオフ" all become "music off".
  //   examples: [typed text, hint] pairs shown as suggestions when the command line is empty.
  //          Six pairs. Each typed text must really work. The hint is lower case and short.
  //   groups: the examples shown when the box is empty, two to four per group (titles: cmd.group.*). Each one
  //          must really work, except one that ends in " …": tapping it only puts the text in the box.
  //   like:  words for reading everyday sentences, tried only when the exact forms find nothing:
  //          "set an alarm for 45 minutes", "帮我定个45分钟的闹钟", "雨を消して". English always works too.
  //          Each key is what the words mean, as lists:
  //            fill        words to skip (please, can you, 帮我, して, 좀 …)
  //            alarm focus break every in on off start stop again track tour   what the sentence asks for
  //            lang:<id>   names of a language (日语 → Japanese)
  //          Any English word of the grammar can be a key too (rain: ['비']). Two more parts:
  //            nums:  { written words → a length }: { 半小时: '30m', 每小时: '每 1h' }
  //            clock: words of a clock time: { am: ['上午'], pm: ['下午'], h: ['点'], m: ['分'], half: ['半'] }
  //                   so 下午3点半 reads as 15:30.
  //          One-letter Chinese or Japanese words (关, を) only count when they stand apart, so names stay whole.
  // Full-width digits and letters (３０分) are read as normal ones, so you do not need to list them.
  cmd: {
    units: {},
    every: [],
    in: [],
    words: {},
    like: {
      fill: ['help', 'please', 'pls', 'can you', 'could you', 'would you', 'will you', 'i want to', 'i\'d like to', 'i would like to', 'i want', 'want', 'need', 'let me', 'let\'s', 'i', 'me', 'a', 'an', 'the', 'some', 'to', 'for', 'this', 'that', 'my', 'it', 'one', 'of', 'and', 'with', 'now', 'just', 'create', 'make', 'set', 'add', 'new', 'up', 'mode', 'turn', 'switch', 'change', 'put', 'open', 'go', 'take', 'have', 'o\'clock', 'ok', 'okay', 'thanks', 'hey'],
      alarm: ['alarm', 'remind', 'reminder', 'wake', 'ring', 'alert'],
      focus: ['timer', 'focus', 'work', 'study', 'pomodoro', 'session', 'concentrate'],
      break: ['break', 'rest', 'breather'],
      every: ['every', 'each'],
      in: ['in', 'after', 'from now'],
      daily: ['daily', 'every day', 'each day', 'every morning'],
      weekdays: ['weekdays', 'on weekdays', 'every weekday'],
      on: ['on', 'show', 'enable'],
      off: ['off', 'hide', 'disable'],
      start: ['start', 'begin', 'play', 'resume', 'run', 'continue'],
      stop: ['stop', 'end', 'quit', 'cancel'],
      again: ['again', 'restart', 'over', 'from the top'],
      prev: ['previous', 'prev', 'last', 'back'],
      track: ['track', 'song', 'tune'],
      tracks: ['playlist', 'track list', 'tracks', 'songs'],
      vol: ['volume', 'vol'],
      wave: ['sound wave', 'wave', 'waveform', 'visualizer'],
      tour: ['tour', 'tutorial', 'how to use', 'how do i use', 'how does this work', 'guide', 'walkthrough'],
      language: ['language', 'lang'],
      'lang:en': ['english'],
      'lang:ja': ['japanese'],
      'lang:ko': ['korean'],
      'lang:zh-Hans': ['chinese', 'simplified chinese'],
      'lang:zh-Hant': ['traditional chinese'],
      nums: { 'half an hour': '30m', 'half hour': '30m', 'an hour and a half': '90m', 'quarter of an hour': '15m', 'quarter hour': '15m', 'an hour': '1h', 'one hour': '1h', 'a minute': '1m', hourly: 'every 1h', 'every hour': 'every 1h' }
    },
    groups: {
      timer: ['45', 'break 10', '50/10', 'goal 2h'],
      alarm: ['14:30 standup', 'every 30m water', 'in 10m tea'],
      sound: ['rain 60', 'fire', 'vol 40', 'chime bell'],
      music: ['piano', 'tracks', 'next track', 'youtube …'],
      scene: ['lofi', 'next', 'story', 'video'],
      screen: ['zen', 'mini', 'full', 'wave off']
    },
    examples: [
      ['45', 'focus 45 min'], ['break 10', 'break for 10 min'], ['14:30 standup', 'alarm at a time'],
      ['every 30m water', 'repeating alarm'], ['in 10m tea', 'one-off alarm'], ['long', 'long break']
    ]
  }
};
