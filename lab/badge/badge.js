// Badge: an ID card on a lanyard. Grab it, throw it, let it swing; tap it to flip to contact().
// The strap and the card are one verlet chain (the card is its last, stiff link), so the card
// swings and spins off the strap on its own. The card face is a holographic foil whose shine
// follows the tilt. Lineage: React Bits' Lanyard (a 3D badge on a rope) and Simon Goellner's
// pokemon-cards-css holo foil.

export function mountBadge(stage, card, strapCanvas, { strapText = 'ALAN FUNG · INVOKFUNG.GITHUB.IO · ' } = {}) {
  const ctx = strapCanvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, cardW = 0, cardH = 0;
  const N = 14;                         // strap points
  let pts = [], seg = 0, cardLen = 0;
  const G = 2200;                       // gravity, px/s²

  function build() {
    W = stage.clientWidth; H = stage.clientHeight;
    strapCanvas.width = W * dpr; strapCanvas.height = H * dpr;
    strapCanvas.style.width = W + 'px'; strapCanvas.style.height = H + 'px';
    cardW = card.offsetWidth; cardH = card.offsetHeight;
    const strap = Math.max(120, H * 0.5 - cardH * 0.5);
    seg = strap / N;
    cardLen = cardH - 22;               // the hole sits 22px below the card's top edge
    const ax = W / 2;
    pts = [];
    for (let i = 0; i <= N; i++) pts.push(pt(ax + i * 6, -10 + i * seg * 0.96, i === 0 ? 0 : 1));
    // the card: its hole, then its bottom edge, heavier, so it hangs straight
    const hole = pts[N];
    pts.push(pt(hole.x + 40, hole.y + cardLen, 3));
  }
  function pt(x, y, m) { return { x, y, px: x, py: y, m }; }

  let drag = null;
  function step(dt) {
    const sub = 3;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (const p of pts) {
        if (!p.m) continue;
        const vx = (p.x - p.px) * 0.993, vy = (p.y - p.py) * 0.993;
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy + G * h * h;
      }
      for (let it = 0; it < 10; it++) {
        pts[0].x = W / 2; pts[0].y = -10;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const L = i === pts.length - 2 ? cardLen : seg;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
          // a strap only pulls; the card is rigid both ways
          if (i < pts.length - 2 && d < L) continue;
          const diff = (d - L) / d;
          const wa = a.m ? 1 / a.m : 0, wb = b.m ? 1 / b.m : 0, sum = wa + wb || 1;
          a.x += dx * diff * wa / sum; a.y += dy * diff * wa / sum;
          b.x -= dx * diff * wb / sum; b.y -= dy * diff * wb / sum;
        }
        if (drag) {
          // hold the card by the point you grabbed it at
          const hole = pts[N], foot = pts[N + 1];
          const ang = Math.atan2(foot.y - hole.y, foot.x - hole.x);
          const gx = hole.x + Math.cos(ang) * drag.along, gy = hole.y + Math.sin(ang) * drag.along;
          const ex = drag.x - gx, ey = drag.y - gy;
          hole.x += ex; hole.y += ey; foot.x += ex; foot.y += ey;
        }
      }
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // the strap: a woven band with the name printed along it
    const width = Math.max(18, Math.min(26, W * 0.02));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1b1d22'; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= N; i++) {
      const a = pts[i - 1], b = pts[i];
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    ctx.lineTo(pts[N].x, pts[N].y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,181,71,0.85)'; ctx.lineWidth = 1;
    for (const off of [-width / 2 + 3, width / 2 - 3]) {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
        const nx = -(b.y - a.y), ny = b.x - a.x, l = Math.hypot(nx, ny) || 1;
        const x = pts[i].x + nx / l * off, y = pts[i].y + ny / l * off;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // printed text, one character at a time along the strap
    ctx.fillStyle = '#ffb547';
    ctx.font = `600 ${Math.round(width * 0.46)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const step = width * 0.42;
    let along = 0, k = 0;
    for (let i = 1; i <= N; i++) {
      const a = pts[i - 1], b = pts[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      while (along < L) {
        const x = a.x + (b.x - a.x) * along / L, y = a.y + (b.y - a.y) * along / L;
        if (y > 4) {
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang - Math.PI / 2 + Math.PI);
          ctx.fillText(strapText[k % strapText.length], 0, 0); ctx.restore();
        }
        k++; along += step;
      }
      along -= L;
    }
    // the metal clip at the hole
    const hole = pts[N], foot = pts[N + 1];
    const ang = Math.atan2(foot.y - hole.y, foot.x - hole.x) - Math.PI / 2;
    ctx.save(); ctx.translate(hole.x, hole.y); ctx.rotate(ang);
    const g = ctx.createLinearGradient(-14, 0, 14, 0);
    g.addColorStop(0, '#6d7078'); g.addColorStop(0.5, '#e6e7ea'); g.addColorStop(1, '#5d6068');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(-13, -26, 26, 30, 5); ctx.fill();
    ctx.fillStyle = '#0a0b0d'; ctx.beginPath(); ctx.roundRect(-7, -20, 14, 9, 3); ctx.fill();
    ctx.restore();
  }

  // the card follows the chain's last link; its tilt comes from the pointer and from the swing
  const tilt = { x: 0, y: 0, tx: 0, ty: 0, mx: 50, my: 30 };
  let flipped = false, flip = 0;
  function place(dt) {
    const hole = pts[N], foot = pts[N + 1];
    const ang = Math.atan2(foot.y - hole.y, foot.x - hole.x) - Math.PI / 2;
    // the hole sits 11px above the middle of the hole-to-foot link, measured along the card
    const l = Math.hypot(foot.x - hole.x, foot.y - hole.y) || 1;
    const cx = (hole.x + foot.x) / 2 - (foot.x - hole.x) / l * 11, cy = (hole.y + foot.y) / 2 - (foot.y - hole.y) / l * 11;
    const vx = (foot.x - foot.px) / Math.max(dt, 1e-3) / 3;
    tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 8);
    tilt.y += (tilt.ty + Math.max(-18, Math.min(18, vx * 0.02)) - tilt.y) * Math.min(1, dt * 8);
    flip += ((flipped ? 180 : 0) - flip) * Math.min(1, dt * 7);
    card.style.transform = `translate(${cx - cardW / 2}px, ${cy - cardH / 2}px) rotate(${ang}rad) rotateY(${tilt.y + flip}deg) rotateX(${tilt.x}deg)`;
    const hyp = Math.min(1, Math.hypot(tilt.x, tilt.y) / 20);
    card.style.setProperty('--mx', tilt.mx + '%');
    card.style.setProperty('--my', tilt.my + '%');
    card.style.setProperty('--px', (50 + tilt.y * 2.2) + '%');
    card.style.setProperty('--py', (50 - tilt.x * 2.2) + '%');
    card.style.setProperty('--hyp', hyp.toFixed(3));
  }

  // input: drag the card anywhere; a tap without a drag flips it
  function local(e) {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  card.addEventListener('pointerdown', (e) => {
    const p = local(e);
    const hole = pts[N], foot = pts[N + 1];
    const ux = foot.x - hole.x, uy = foot.y - hole.y, l = Math.hypot(ux, uy);
    const along = Math.max(0, Math.min(cardLen, ((p.x - hole.x) * ux + (p.y - hole.y) * uy) / l));
    drag = { x: p.x, y: p.y, along, sx: p.x, sy: p.y, moved: 0, t: performance.now() };
    card.setPointerCapture(e.pointerId);
    card.classList.add('held');
  });
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    // tilt toward the pointer while hovering
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    tilt.ty = (fx - 0.5) * 26 * (flipped ? -1 : 1); tilt.tx = -(fy - 0.5) * 22;
    tilt.mx = Math.round(fx * 100); tilt.my = Math.round(fy * 100);
    if (!drag) return;
    const p = local(e);
    drag.moved = Math.max(drag.moved, Math.hypot(p.x - drag.sx, p.y - drag.sy));
    drag.x = p.x; drag.y = p.y;
  });
  const up = () => {
    if (!drag) return;
    if (drag.moved < 6 && performance.now() - drag.t < 350) flipped = !flipped;
    drag = null;
    card.classList.remove('held');
  };
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
  card.addEventListener('pointerleave', () => { if (!drag) { tilt.tx = 0; tilt.ty = 0; } });
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipped = !flipped; } });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    step(dt);
    draw();
    place(dt);
    card.setAttribute('aria-pressed', String(flipped));
    requestAnimationFrame(frame);
  }
  build();
  // arrive with a swing
  pts[N + 1].px -= 5; pts[N].px -= 2;
  addEventListener('resize', build);
  requestAnimationFrame(frame);
  return { flip() { flipped = !flipped; } };
}
