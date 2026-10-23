// Shared bits for every lab page: the notes drawer toggle (N or the button) and a frame meter.
const btn = document.querySelector('[data-notes]');
const notes = document.getElementById('notes');
if (btn && notes) {
  const set = (open) => { notes.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => set(notes.hidden));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') set(false);
    if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) set(notes.hidden);
  });
}

// Rolling average of frame time, for the readouts that show what an effect costs.
export function frameMeter(span = 30) {
  const times = [];
  let last = performance.now();
  return {
    tick(now = performance.now()) {
      times.push(now - last); last = now;
      if (times.length > span) times.shift();
    },
    get fps() { const a = times.reduce((s, t) => s + t, 0) / (times.length || 1); return a ? Math.round(1000 / a) : 0; }
  };
}

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
