// Alarms: at a clock time, every N minutes, or in N minutes.
// Only works while the page is open. Fire times are wall-clock timestamps.

import { bus, store } from './bus.js';
import { t } from './i18n.js';

const LATE_MS = 5 * 60000;   // later than this (page was closed) = missed, not rung

// Pure. When does this alarm fire next, counted from `now`?
export function nextFire(a, now) {
  if (a.kind !== 'at') return now + a.ms;
  const d = new Date(now);
  d.setHours(a.h, a.m, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  if (a.repeat === 'weekdays') while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.getTime();
}

const pad = n => String(n).padStart(2, '0');
// "14:30", "14:30 daily", "every 30 min", "in 10 s". Shown in the alarm list, the banner and toasts.
export function alarmTitle(a) {
  if (a.kind === 'at') return t(a.repeat === 'once' ? 'alarm.at' : `alarm.at.${a.repeat}`, { time: `${pad(a.h)}:${pad(a.m)}` });
  const min = a.ms / 60000;
  const span = min >= 60 && min % 60 === 0 ? t('span.h', { h: min / 60 }) : min >= 1 ? t('span.m', { m: +min.toFixed(1) }) : t('span.s', { s: a.ms / 1000 });
  return t(a.kind === 'every' ? 'alarm.every' : 'alarm.in', { span });
}

let list = store.get('alarms', []);
let ringing = null;
const changed = () => { store.set('alarms', list); bus.emit('alarm:change', list); };

function fire(a, now) {
  const late = now - a.next;
  const repeats = a.kind === 'every' || (a.kind === 'at' && a.repeat !== 'once');
  if (repeats) a.next = nextFire(a, now);
  else if (a.kind === 'in') list = list.filter(x => x !== a);
  else a.on = false;
  if (late > LATE_MS) bus.emit('alarm:missed', a);
  else { ringing = a; bus.emit('alarm:ring', a); }
}

export const alarms = {
  all: () => list,
  ringing: () => ringing,

  // cmd is a parsed alarmAt / alarmEvery / alarmIn command
  add(cmd, now = Date.now()) {
    const kind = { alarmAt: 'at', alarmEvery: 'every', alarmIn: 'in' }[cmd.type];
    const a = { id: now.toString(36) + Math.random().toString(36).slice(2, 6), kind, label: cmd.label || '', on: true };
    if (kind === 'at') Object.assign(a, { h: cmd.h, m: cmd.m, repeat: cmd.repeat || 'once' });
    else a.ms = cmd.ms;
    a.next = nextFire(a, now);
    list.push(a);
    changed();
    return a;
  },
  remove(id) { list = list.filter(a => a.id !== id); changed(); },
  toggle(id) {
    const a = list.find(x => x.id === id);
    if (!a) return;
    a.on = !a.on;
    if (a.on) a.next = nextFire(a, Date.now());
    changed();
  },
  upcoming() {
    return list.filter(a => a.on).sort((x, y) => x.next - y.next)[0] || null;
  },

  check(now = Date.now()) {
    let hit = false;
    for (const a of [...list]) if (a.on && now >= a.next) { fire(a, now); hit = true; }
    if (hit) changed();
  },

  dismiss() {
    if (!ringing) return;
    ringing = null;
    bus.emit('alarm:stop');
  },
  snooze(min = 5) {
    if (!ringing) return;
    const base = ringing.base || (ringing.label || alarmTitle(ringing)).replace(/ \(snoozed\)$/, '');
    alarms.dismiss();
    const a = alarms.add({ type: 'alarmIn', ms: min * 60000, label: t('alarm.snoozed', { label: base }) });
    a.base = base;                                                   // the label without "(snoozed)", for the next snooze
    changed();
  }
};
