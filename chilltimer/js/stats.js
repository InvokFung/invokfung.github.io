// Focus history: rounds and minutes per day, streak, week.

import { bus, store } from './bus.js';

const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

const data = store.get('stats', { days: {} });

export const stats = {
  record(minutes) {
    const d = (data.days[key(new Date())] ||= { rounds: 0, minutes: 0 });
    d.rounds += 1;
    d.minutes += minutes;
    const keep = Object.keys(data.days).sort().slice(-180);          // about half a year
    data.days = Object.fromEntries(keep.map(k => [k, data.days[k]]));
    store.set('stats', data);
    bus.emit('stats');
  },
  today: () => data.days[key(new Date())] || { rounds: 0, minutes: 0 },
  // Days in a row with at least one round. Today may still be empty without breaking it.
  streak() {
    let n = 0;
    for (let i = data.days[key(new Date())] ? 0 : 1; data.days[key(daysAgo(i))]; i++) n++;
    return n;
  },
  week() {                                                         // day: 0 = Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const d = daysAgo(6 - i);
      return { day: d.getDay(), minutes: (data.days[key(d)] || {}).minutes || 0, today: i === 6 };
    });
  },
  total() {
    const all = Object.values(data.days);
    return { rounds: all.reduce((a, d) => a + d.rounds, 0), minutes: all.reduce((a, d) => a + d.minutes, 0) };
  },
  best: () => Math.max(0, ...Object.values(data.days).map(d => d.minutes)),
  clear() { data.days = {}; store.set('stats', data); bus.emit('stats'); }
};
