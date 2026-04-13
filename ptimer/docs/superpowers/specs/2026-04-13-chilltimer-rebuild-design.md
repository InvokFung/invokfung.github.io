# ChillTimer - Full Rebuild Design Spec

**Date**: 2026-04-13
**Status**: Draft
**Approach**: Full rebuild, vanilla HTML/CSS/JS, GitHub Pages deploy

---

## 1. Product Overview

**What**: Production-ready Pomodoro focus timer with dark immersive aesthetic, YouTube music integration, ambient sound mixing, video backgrounds, and stats/streak tracking.

**Inspiration**: Nesto.cc (music-first dark immersive), Flocus (aesthetic multi-mode), Focus Flow (fullscreen zen), Pomofocus (mode color-shift UX).

**Target user**: Students, remote workers, anyone wanting a beautiful focus environment in the browser.

**Key differentiators**:
- Looping video backgrounds (rain, fireplace, city night) that shift per mode
- YouTube playlist integration (free, no API key for playback)
- 4-channel ambient sound mixer layered on top of music
- Streak/stats system with daily goals for retention
- Auto-hiding UI for maximum immersion during focus

---

## 2. Architecture

### 2.1 Stack

- Pure HTML5 + CSS3 + ES6 JavaScript (no framework, no build step)
- YouTube IFrame API for music playback
- localStorage for all persistence
- GitHub Pages hosting (static files only)

### 2.2 File Structure

```
ptimer/
  index.html                 Single page app shell
  css/
    variables.css            Design tokens (colors, spacing, typography, z-index)
    base.css                 Reset, global styles, font loading
    timer.css                Timer display, mode selector, progress ring, controls
    player.css               Bottom music bar, ambient mixer, YouTube panel
    panels.css               Stats overlay, settings modal, scene picker
    responsive.css           Mobile-first breakpoints (375, 768, 1024, 1440)
  js/
    app.js                   Entry point, module orchestrator, event bus
    timer.js                 Timer state machine (idle/running/paused), mode switching
    player.js                YouTube IFrame API wrapper, ambient audio channels
    stats.js                 Session tracking, streaks, daily goals, history
    settings.js              Preferences read/write, settings modal logic
    ui.js                    Auto-hide nav, panel slide animations, toast system
    videos.js                Background video preload, scene switching, overlay
  assets/
    icons/                   SVG icons (Lucide inline or sprite)
```

### 2.3 Module Communication

Lightweight event bus pattern. Modules communicate via custom events on `document`:

- `timer:start`, `timer:pause`, `timer:reset`, `timer:complete`, `timer:tick`
- `timer:modeChange` (payload: mode name)
- `player:trackChange`, `player:play`, `player:pause`
- `stats:sessionComplete` (payload: mode, duration)
- `settings:change` (payload: key, value)
- `ui:panelOpen`, `ui:panelClose` (payload: panel name)

No module imports another directly. All cross-module interaction through events.

---

## 3. Design System

### 3.1 Color Tokens

```css
:root {
  /* Base */
  --bg-primary: #0a0a0f;
  --bg-surface: rgba(15, 15, 25, 0.70);
  --bg-surface-hover: rgba(25, 25, 40, 0.80);
  --bg-surface-active: rgba(35, 35, 55, 0.85);
  --bg-overlay: rgba(0, 0, 0, 0.40);

  /* Text */
  --text-primary: #f0f0f5;
  --text-secondary: #9ca3af;
  --text-tertiary: #6b7280;

  /* Mode Accents */
  --accent-focus: #f97316;      /* Warm amber for focus */
  --accent-short: #06b6d4;      /* Cool cyan for short break */
  --accent-long: #8b5cf6;       /* Calm purple for long break */

  /* Current mode (set dynamically via JS) */
  --accent: var(--accent-focus);
  --accent-glow: rgba(249, 115, 22, 0.30);

  /* Glass */
  --glass-blur: blur(20px);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-border-hover: rgba(255, 255, 255, 0.15);

  /* Semantic */
  --success: #10b981;
  --error: #ef4444;
  --warning: #f59e0b;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-full: 9999px;

  /* Spacing (4px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* Z-index scale */
  --z-video: 0;
  --z-overlay: 1;
  --z-content: 10;
  --z-bottom-bar: 20;
  --z-top-nav: 30;
  --z-panel: 40;
  --z-modal: 100;
  --z-toast: 1000;

  /* Animation */
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 400ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.55, 0, 1, 0.45);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### 3.2 Typography

| Role | Font | Weight | Size | Use |
|------|------|--------|------|-----|
| Timer digits | JetBrains Mono | 700 | clamp(4rem, 12vw, 8rem) | Main countdown |
| Heading | Inter | 600-700 | 1.25-1.5rem | Panel titles, nav brand |
| Body | Inter | 400-500 | 0.875-1rem | Labels, descriptions |
| Caption | Inter | 400 | 0.75rem | Helper text, timestamps |

**Font loading**: `font-display: swap` on both. Preload Inter 400/600, JetBrains Mono 700.

### 3.3 Icons

Lucide Icons, inline SVG. 24px base, 1.5px stroke. Consistent across all UI.

Icon buttons: 44px minimum touch target (icon centered in transparent hit area).

---

## 4. Layout

### 4.1 Desktop (>=1024px)

```
┌─────────────────────────────────────────────────────┐
│ VIDEO BACKGROUND (position:fixed, inset:0, z:0)     │
│ + DARK OVERLAY (rgba(0,0,0,0.4), z:1)               │
│                                                      │
│  ┌─ TOP NAV (auto-hide, z:30) ─────────────────┐    │
│  │ ChillTimer          [Stats][Scene][Settings] │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│              ┌────────────────────┐                   │
│              │    ◯ progress ring │                   │
│              │      25:00        │                   │
│              │   ●●●○ sessions   │                   │
│              │                    │                   │
│              │ Focus  Short  Long │                   │
│              │                    │                   │
│              │  [ Start Focus ]   │                   │
│              │    ↺ reset   ⏭ skip│                   │
│              └────────────────────┘                   │
│                                                      │
│  ┌─ BOTTOM BAR (fixed, z:20) ──────────────────┐    │
│  │ ▶ Track Title        ◄ ❚❚ ►  vol━━━         │    │
│  │ 🌧️━━ 🔥━━ 🍃━━ 🌊━━          [🎵 Browse]    │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 4.2 Mobile (<=768px)

- Timer: centered, font-size shrinks via clamp()
- Top nav: hamburger-free, just icon buttons (smaller)
- Bottom bar: stacks to 2 rows (player row + ambient row)
- Panels: slide up full-screen from bottom
- Session dots: max 4 visible, overflow indicator

### 4.3 Auto-Hide Navigation

- Top nav: opacity 1 on load, fades to 0 after 3s of no mouse/touch activity
- `mousemove` or `touchstart` anywhere resets 3s timer, nav fades back in
- Transition: `opacity var(--duration-base) var(--ease-out)`
- Bottom bar: always visible (music controls needed constantly)
- During settings/stats panel open: nav stays visible

---

## 5. Timer Component

### 5.1 State Machine

```
IDLE ──(start)──> RUNNING ──(pause)──> PAUSED
 ^                   │                    │
 │                   │(complete)          │(start)
 │                   v                    │
 │               COMPLETED ──────────>────┘
 │                   │
 │                   │(auto-advance to next mode)
 └───────────────────┘
```

**Auto-advance**: After focus complete, switch to short break (or long break every N sessions). After break complete, switch to focus. User can override.

### 5.2 Display

- Timer: `JetBrains Mono` monospace digits, tabular figures (`font-variant-numeric: tabular-nums`)
- Gentle pulse animation on text-shadow when running (mode-colored glow, 2s cycle)
- Progress ring: SVG circle, `stroke-dasharray/dashoffset` animated, thin (3px stroke), mode-colored
- Session dots: small circles below timer, filled = completed, outlined = remaining, max display = sessions per long break

### 5.3 Controls

| Control | Element | Touch Target | Keyboard |
|---------|---------|-------------|----------|
| Start/Pause | Primary pill button | 48x56px | Space |
| Reset | Icon button (rotate-cw) | 44x44px | R |
| Skip | Icon button (skip-forward) | 44x44px | S |
| Mode switch | 3 pill tabs | 44px height each | 1, 2, 3 |

**Mode switch behavior**: Clicking a mode tab resets timer to that mode's duration. Current accent color transitions smoothly (300ms crossfade on `--accent` via class swap).

### 5.4 Completion

On timer complete:
1. Alarm sound plays (configurable, default: gentle chime)
2. Confetti burst (canvas-confetti, 2s duration)
3. Glass panel glow flash (box-shadow pulse, accent color, 1 cycle)
4. Browser notification (if permitted)
5. Stats updated (session count, minutes)
6. Auto-advance to next mode after 3s (or user clicks)
7. Title bar shows "Break time!" or "Focus time!" accordingly

---

## 6. Music Player

### 6.1 YouTube Integration

**API**: YouTube IFrame API (free, no API key required for embed playback).

**Implementation**:
- Hidden `<div id="yt-player">` off-screen
- `YT.Player` instance with `playerVars: { autoplay: 0, controls: 0 }`
- Playlist mode: `listType: 'playlist', list: PLAYLIST_ID`
- Expose: play, pause, next, prev, setVolume, getCurrentTitle

**Preset playlists** (hardcoded YouTube playlist IDs):
- Lofi Hip Hop Radio (e.g., popular lofi playlists)
- Jazz & Bossa Nova
- Classical Piano
- Chill Synthwave
- Nature & Ambient

**Custom URL**: Text input in browse panel. User pastes YouTube video/playlist URL. Parse video ID with regex, load into player.

### 6.2 Bottom Music Bar

Fixed at viewport bottom, glass backdrop.

**Row 1 — Player controls**:
- Play/Pause toggle (44px)
- Previous / Next track (44px each)
- Current track title (truncate with ellipsis, max-width 40%)
- Volume slider (range input, styled)

**Row 2 — Ambient mixer**:
- 4 channels: Rain, Fire, Forest, Ocean
- Each: icon toggle (on/off) + horizontal mini volume slider
- Audio elements: `<audio>` tags with loop, royalty-free sources
- Independent volume from YouTube music

### 6.3 Browse Panel

Slide-up overlay (from bottom bar, 60vh height on desktop, full-screen on mobile).

**Content**:
- Preset playlist grid (thumbnail + title, 2 columns)
- "Paste YouTube URL" input field at top
- Currently playing indicator
- Close button (X) or swipe-down to dismiss

---

## 7. Video Backgrounds

### 7.1 Implementation

```html
<video id="bg-video" autoplay muted loop playsinline
       style="position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:var(--z-video)">
  <source src="..." type="video/mp4">
</video>
<div class="bg-overlay" style="position:fixed;inset:0;background:var(--bg-overlay);z-index:var(--z-overlay)"></div>
```

### 7.2 Preset Scenes

| Scene | Mode Default | Source |
|-------|-------------|--------|
| Rain on Window | Focus | Pexels/Pixabay (free video) |
| Fireplace Closeup | Short Break | Pexels/Pixabay |
| Night City Timelapse | Long Break | Pexels/Pixabay |
| Cozy Room + Rain | Alt Focus | Pexels/Pixabay |
| Forest Stream | Alt Break | Pexels/Pixabay |
| Ocean Waves Night | Alt Break | Pexels/Pixabay |

### 7.3 Scene Switching

- Default: auto-switch scene when mode changes (configurable in settings)
- Manual: scene picker grid in settings (video thumbnails)
- Transition: crossfade between videos (opacity transition on two stacked video elements, 500ms)
- Preloading: preload next mode's video when timer is at 80% progress

### 7.4 Performance

- Videos: 720p max, H.264 MP4, aim for <5MB per loop clip (10-30s loops)
- `preload="metadata"` on non-active videos
- `prefers-reduced-motion`: replace video with static dark gradient (`linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)`)
- Mobile: offer option to disable video backgrounds (battery saver)

---

## 8. Stats & Streaks

### 8.1 Data Model (localStorage)

```javascript
{
  "ct_stats": {
    "today": { "sessions": 4, "minutes": 100, "date": "2026-04-13" },
    "streak": { "count": 7, "lastDate": "2026-04-13" },
    "history": [
      { "date": "2026-04-13", "sessions": 4, "minutes": 100 },
      { "date": "2026-04-12", "sessions": 6, "minutes": 150 },
      ...  // last 90 days
    ],
    "bestDay": { "date": "2026-04-10", "minutes": 240 },
    "totalSessions": 142,
    "totalMinutes": 3550
  }
}
```

### 8.2 Stats Panel UI

Slide-up overlay (from nav stats icon). Glass panel, 60vh desktop / full-screen mobile.

**Sections**:
1. **Today card**: Sessions count, minutes, circular progress toward daily goal
2. **Streak card**: Fire icon + consecutive days count, "Personal best: X days" subtitle
3. **This week**: 7-day bar chart (CSS-only, no library). Each bar = day's minutes. Today highlighted with accent.
4. **All time**: Total sessions, total hours, best day badge

### 8.3 Retention Hooks

- Streak fire icon animates (flame flicker CSS) when streak >= 3
- Daily goal completion: confetti + toast "Daily goal reached!"
- New personal best: special toast with star icon
- Streak broken: sympathetic message "Start a new streak today"

---

## 9. Settings

### 9.1 Settings Modal

Full-screen overlay, glass backdrop, scrollable content.

**Sections**:

**Timer**:
- Focus duration: number input (1-60 min, default 25)
- Short break: number input (1-30 min, default 5)
- Long break: number input (1-60 min, default 15)
- Sessions per long break: number input (2-10, default 4)
- Daily goal: number input (30-480 min, default 120)
- Auto-start breaks: toggle (default off)
- Auto-start focus: toggle (default off)

**Scenes**:
- Grid of video thumbnails (3 columns)
- Active scene highlighted with accent border
- "Auto-switch per mode" toggle (default on)
- Per-mode scene assignment dropdowns (shown when auto-switch on)

**Audio**:
- Music volume: slider (0-100, default 70)
- Ambient volume: slider (0-100, default 50)
- Auto-play music on start: toggle (default on)
- Alarm sound: dropdown (Gentle Chime, Digital Beep, Bell, None)
- Alarm volume: slider (0-100, default 80)

**Data**:
- Export data (JSON download)
- Clear all data (confirmation dialog with "type DELETE to confirm")

### 9.2 Persistence

All settings saved to `localStorage` key `ct_settings`. Read on app init, write on change (auto-save, no explicit save button).

---

## 10. Accessibility

Per UI-UX-Pro-Max priorities 1-2 (CRITICAL):

| Requirement | Implementation |
|-------------|---------------|
| Contrast 4.5:1 | All text tokens verified against `--bg-surface`. Primary text #f0f0f5 on rgba(15,15,25,0.7) = ~14:1 |
| Focus rings | 2px outline, accent-colored, offset 2px. Never removed. |
| aria-labels | All icon-only buttons: `aria-label="Play music"`, etc. |
| Keyboard nav | Tab order: nav buttons > timer controls > mode tabs > bottom bar. Space/Enter activates. |
| Skip link | Hidden "Skip to timer" link, visible on focus, jumps to timer display. |
| Timer announcements | `aria-live="polite"` region updates every minute + on complete. |
| Reduced motion | `@media (prefers-reduced-motion: reduce)`: no video bg (static gradient), no pulse/glow, no confetti, transitions instant. |
| Touch targets | All interactive elements >= 44px. Verified per component in section 5.3. |
| Heading hierarchy | h1: brand/timer, h2: panel titles, h3: section titles. No skips. |
| Color not only | Mode indicated by label text + color. Stats use text labels + color bars. |

---

## 11. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Start / Pause timer |
| R | Reset timer |
| S | Skip to next mode |
| M | Mute / unmute music |
| F | Toggle fullscreen |
| 1 | Switch to Focus mode |
| 2 | Switch to Short Break |
| 3 | Switch to Long Break |
| Escape | Close active panel/modal |

Shortcuts disabled when a text input is focused.

---

## 12. Browser Notifications & Title

- Request notification permission on first timer start (not on page load)
- On timer complete: `new Notification("Focus complete!", { body: "Time for a break." })`
- Document title updates: "25:00 - Focus | ChillTimer" while running, "ChillTimer" when idle

---

## 13. PiP (Picture-in-Picture)

- Use Document Picture-in-Picture API (Chrome 116+)
- PiP window shows: timer digits + play/pause button + mode indicator
- Fallback for unsupported browsers: tooltip "PiP not supported in this browser"

---

## 14. Mobile Considerations

| Breakpoint | Layout Changes |
|-----------|----------------|
| <=480px | Timer font: 4rem. Bottom bar: full-width stacked. Panels: full-screen slide-up. |
| 481-768px | Timer font: 5rem. Bottom bar: 2-row. Panels: 80vh slide-up. |
| 769-1024px | Timer font: 6rem. Bottom bar: single row. Panels: 60vh slide-up. |
| >=1025px | Timer font: 8rem. Full layout as designed. |

**Touch**: `touch-action: manipulation` on all interactive elements. No 300ms delay.

**Viewport**: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`. Never disable zoom.

**dvh**: Use `min-height: 100dvh` for full-viewport layouts (handles mobile address bar).

---

## 15. Performance Budget

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.5s |
| Largest Contentful Paint | < 2.5s (excluding video load) |
| Total JS bundle | < 50KB (unminified, no framework) |
| Total CSS | < 20KB |
| CLS | < 0.1 |
| Video files | < 5MB each, 720p H.264 |

**Strategies**:
- Inline critical CSS (variables + base + timer)
- Defer non-critical CSS (panels, responsive)
- YouTube IFrame API loaded on first music interaction (not on page load)
- Videos: preload="metadata", load full on demand
- Font preload: Inter 400/600, JetBrains Mono 700 only

---

## 16. Out of Scope

- User accounts / cloud sync
- Spotify integration (requires paid API / premium account)
- Task list with pomodoro estimation (could be v2)
- Multiple theme modes (dark-only for immersive commitment)
- Service worker / offline support (could be v2)
- Backend / database

---

## 17. Video Sources (Royalty-Free)

All background videos sourced from Pexels or Pixabay (free commercial license, no attribution required). Specific URLs to be determined during implementation — search for:
- "rain window loop" (Pexels)
- "fireplace loop" (Pexels)  
- "city night timelapse" (Pixabay)
- "cozy room rain" (Pexels)
- "forest stream" (Pixabay)
- "ocean waves night" (Pexels)

Videos will be hosted as direct MP4 links or downloaded to repo if small enough.

---

## 18. Migration from Current ETimer

- No code carried over (full rebuild)
- Current localStorage keys (`ptimer_*`) not compatible — fresh start
- Current external dependencies removed: Vanta.js, Three.js, Typed.js, canvas-confetti
- New dependencies: YouTube IFrame API (loaded dynamically), canvas-confetti (kept, CDN)
- Font Awesome replaced with Lucide inline SVGs
