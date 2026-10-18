// Pressure: lines of type set in a variable font whose width and weight follow the cursor.
// Letters near the pointer swell wide and heavy; the rest pull in thin. With no pointer, a slow
// wave runs through them instead. Lineage: React Bits' TextPressure and VariableProximity.

export function mountPressure(root, { lines, axes = { wdth: [25, 151], wght: [140, 1000], opsz: [8, 144] } }) {
  const rows = lines.map((l) => {
    const row = document.createElement('div');
    row.className = 'p-row ' + (l.className || '');
    row.setAttribute('aria-label', l.text);
    const chars = [...l.text].map((c) => {
      const s = document.createElement('span');
      s.textContent = c;
      s.setAttribute('aria-hidden', 'true');
      if (c === ' ') s.className = 'sp';
      row.append(s);
      return { el: s, c, x: 0, y: 0, k: 0 };
    });
    root.append(row);
    return { row, chars, l };
  });

  const ptr = { x: 0, y: 0, tx: 0, ty: 0, on: false, w: 0 };
  addEventListener('pointermove', (e) => { ptr.tx = e.clientX; ptr.ty = e.clientY; if (!ptr.on) { ptr.x = ptr.tx; ptr.y = ptr.ty; } ptr.on = true; });
  document.addEventListener('pointerleave', () => { ptr.on = false; });
  addEventListener('blur', () => { ptr.on = false; });

  // Size each row so that it fills the width when every letter sits at the middle of the width axis.
  function fit() {
    for (const r of rows) {
      r.row.style.fontSize = '100px';
      r.row.style.width = 'max-content';
      for (const ch of r.chars) ch.el.style.fontVariationSettings = `'wdth' ${(axes.wdth[0] + axes.wdth[1]) / 2}, 'wght' 500, 'opsz' 100`;
      const w = r.row.getBoundingClientRect().width;
      r.row.style.width = '';
      const inner = root.clientWidth - parseFloat(getComputedStyle(root).paddingLeft) - parseFloat(getComputedStyle(root).paddingRight);
      r.size = Math.min(r.l.max || 9999, (inner / w) * 100 * (r.l.fill || 1));
      r.row.style.fontSize = r.size + 'px';
    }
    measure();
  }
  // where each letter's centre sits; and when swollen letters add up to more than the row, squeeze
  // the row back to the edges instead of letting it run off the screen
  function measure() {
    const inner = root.clientWidth - parseFloat(getComputedStyle(root).paddingLeft) - parseFloat(getComputedStyle(root).paddingRight);
    for (const r of rows) {
      let sum = 0;
      for (const ch of r.chars) sum += ch.el.offsetWidth;
      r.row.style.transform = sum > inner ? `scaleX(${(inner / sum).toFixed(4)})` : '';
      for (const ch of r.chars) {
        const b = ch.el.getBoundingClientRect();
        ch.x = b.left + b.width / 2; ch.y = b.top + b.height / 2;
      }
    }
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t0 = performance.now(), last = t0, n = 0;
  function frame(now) {
    if (n++ % 3 === 0) measure(); // letters drift as their neighbours change width
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    ptr.x += (ptr.tx - ptr.x) * Math.min(1, dt * 12);
    ptr.y += (ptr.ty - ptr.y) * Math.min(1, dt * 12);
    ptr.w += ((ptr.on ? 1 : 0) - ptr.w) * Math.min(1, dt * 4);
    const reach = Math.max(innerWidth, innerHeight) * 0.28;
    for (const r of rows) for (const ch of r.chars) {
      if (ch.c === ' ') continue;
      // pointer pressure, falling off with distance; vertical distance counts for less
      const d = Math.hypot(ch.x - ptr.x, (ch.y - ptr.y) * 0.6);
      const near = Math.max(0, 1 - d / reach);
      const push = near * near * (3 - 2 * near);
      // the idle wave
      const wave = reduced ? 0.35 : 0.5 + 0.5 * Math.sin(t * 1.4 - ch.x / innerWidth * 7 + (r.l.phase || 0));
      const k = push * ptr.w + wave * 0.55 * (1 - ptr.w);
      ch.k += (k - ch.k) * Math.min(1, dt * 10);
      const q = ch.k;
      const wdth = axes.wdth[0] + (axes.wdth[1] - axes.wdth[0]) * q;
      const wght = axes.wght[0] + (axes.wght[1] - axes.wght[0]) * q;
      const opsz = axes.opsz[0] + (axes.opsz[1] - axes.opsz[0]) * q;
      ch.el.style.fontVariationSettings = `'wdth' ${wdth.toFixed(1)}, 'wght' ${wght.toFixed(0)}, 'opsz' ${opsz.toFixed(0)}`;
      ch.el.style.color = q > 0.62 ? 'var(--hot)' : '';
    }
    requestAnimationFrame(frame);
  }

  fit();
  addEventListener('resize', fit);
  requestAnimationFrame(frame);
  return { fit };
}
