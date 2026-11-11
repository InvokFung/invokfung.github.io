// Timer state machine. Time is always read from the wall clock (endAt), never counted in ticks,
// so a throttled tab cannot drift.

import { bus, store, settings } from './bus.js';

const MIN = 60000;
const MAX_MS = 180 * MIN;

// 90061000 → "1:30:01", 1500000 → "25:00". Rounds up, so 00:00 only shows at the very end.
export function clockText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const two = n => String(n).padStart(2, '0');
  return (h ? h + ':' + two(m) : two(m)) + ':' + two(s % 60);
}

// One cycle: focus, short, focus, short, … focus, long.
export function buildPlan(rounds) {
  const plan = [];
  for (let i = 0; i < rounds; i++) plan.push('focus', i === rounds - 1 ? 'long' : 'short');
  return plan;
}

const s = { mode: 'focus', status: 'idle', totalMs: 0, remainingMs: 0, endAt: 0, planIndex: 0 };
let warned = false;      // 'timer:lastMinute' sent for this block
let undoSnap = null;
let flowTimer = 0;

const plan = () => buildPlan(settings.rounds);
const save = () => store.set('timer', s);
const changed = () => { save(); bus.emit('timer', s); };

function load(index, ms) {
  const p = plan();
  s.planIndex = ((index % p.length) + p.length) % p.length;
  s.mode = p[s.planIndex];
  s.totalMs = s.remainingMs = ms || settings[s.mode] * MIN;
  s.status = 'idle';
  s.endAt = 0;
  warned = false;
  clearTimeout(flowTimer);
}

function snapshot(what) {
  if (s.status === 'running') s.remainingMs = s.endAt - Date.now();
  undoSnap = { ...s };
  bus.emit('timer:undoable', { what });
}

function complete() {
  const done = { mode: s.mode, minutes: Math.round(s.totalMs / MIN) };
  load(s.planIndex + 1);
  bus.emit('timer:complete', done);
  bus.emit('timer:block', { mode: s.mode, planIndex: s.planIndex });
  changed();
  if (settings.autoFlow) {
    const at = s.planIndex;
    flowTimer = setTimeout(() => { if (s.status === 'idle' && s.planIndex === at) timer.start(); }, 4000);
  }
}

export const timer = {
  state: s,
  plan,
  progress: () => (s.totalMs ? 1 - Math.max(0, s.remainingMs) / s.totalMs : 0),

  start() {
    if (s.status === 'running') return;
    clearTimeout(flowTimer);
    if (s.remainingMs <= 0) s.remainingMs = s.totalMs;
    s.status = 'running';
    s.endAt = Date.now() + s.remainingMs;
    bus.emit('timer:start', s);
    changed();
  },
  pause() {
    if (s.status !== 'running') return;
    s.remainingMs = Math.max(0, s.endAt - Date.now());
    s.status = 'paused';
    bus.emit('timer:pause', s);
    changed();
  },
  toggle() { s.status === 'running' ? timer.pause() : timer.start(); },

  reset() { snapshot('Reset'); load(s.planIndex); changed(); },
  skip() { snapshot('Skipped'); timer.jump(s.planIndex + 1, true); },
  jump(index, quiet) {
    if (!quiet) snapshot('Jumped');
    load(index);
    bus.emit('timer:block', { mode: s.mode, planIndex: s.planIndex });
    changed();
  },

  // Add or remove time, also while running. Refuses to drop under 10 s.
  adjust(deltaMs) {
    const now = Date.now();
    const left = s.status === 'running' ? s.endAt - now : s.remainingMs;
    const next = Math.min(MAX_MS, left + deltaMs);
    if (next < 10000) return false;
    s.remainingMs = next;
    s.totalMs = Math.max(next, Math.min(MAX_MS, s.totalMs + deltaMs));
    if (s.status === 'running') s.endAt = now + next;
    if (next > MIN) warned = false;
    changed();
    return true;
  },
  setDuration(ms) {
    ms = Math.max(1000, Math.min(MAX_MS, ms));
    s.totalMs = s.remainingMs = ms;
    if (s.status === 'running') s.endAt = Date.now() + ms;
    warned = false;
    changed();
  },

  // "45" or "break 10": move to the nearest block of that mode and start it.
  startMode(mode, ms) {
    snapshot('Started ' + mode);
    const p = plan();
    let i = s.planIndex;
    for (let n = 0; n < p.length && p[i] !== mode; n++) i = (i + 1) % p.length;
    const moved = i !== s.planIndex;
    load(i, ms);
    if (moved) bus.emit('timer:block', { mode: s.mode, planIndex: s.planIndex });
    timer.start();
  },

  undo() {
    if (!undoSnap) return false;
    clearTimeout(flowTimer);
    const prev = s.planIndex;
    Object.assign(s, undoSnap);
    undoSnap = null;
    if (s.status === 'running') s.endAt = Date.now() + s.remainingMs;
    if (prev !== s.planIndex) bus.emit('timer:block', { mode: s.mode, planIndex: s.planIndex });
    changed();
    return true;
  },

  tick(now = Date.now()) {
    if (s.status !== 'running') return;
    s.remainingMs = s.endAt - now;
    if (s.remainingMs <= 0) return complete();
    if (!warned && s.remainingMs <= MIN && s.totalMs >= 2 * MIN) {
      warned = true;
      bus.emit('timer:lastMinute', s);
    }
    bus.emit('timer:tick', s);
  },

  // Called once at boot: continue a saved round, or start fresh.
  restore() {
    const saved = store.get('timer', null);
    const p = plan();
    if (saved && p[saved.planIndex] === saved.mode && saved.totalMs > 0) {
      Object.assign(s, saved);
      if (s.status === 'running') s.remainingMs = s.endAt - Date.now();
    } else load(0);
    bus.emit('timer', s);
  },

  // Settings changed: an untouched idle block takes the new length.
  refresh() {
    const p = plan();
    if (s.planIndex >= p.length || p[s.planIndex] !== s.mode) load(0);
    else if (s.status === 'idle' && s.remainingMs === s.totalMs) load(s.planIndex);
    changed();
  }
};
