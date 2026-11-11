// Floating mini window that stays on top of other apps.
// Uses Document Picture-in-Picture (Chrome and Edge). Elsewhere `supported` is false.

import { bus } from './bus.js';
import { timer, clockText } from './timer.js';
import { t, lang } from './i18n.js';
import { alarms } from './alarms.js';
import { stage } from './scenes/engine.js';

const MIN = 60000;
const pad = n => String(n).padStart(2, '0');
let win = null, bgTimer = 0;

const CSS = `
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{font-family:var(--ui,'Instrument Sans',system-ui,sans-serif);color:var(--ink);background:var(--shade);overflow:hidden;user-select:none}
#bg{position:fixed;inset:0;width:100%;height:100%}
.veil{position:fixed;inset:0;background:linear-gradient(to right,color-mix(in srgb,var(--shade) 30%,transparent),color-mix(in srgb,var(--shade) 72%,transparent) 55%)}
.wrap{position:fixed;inset:0;display:grid;padding:10px 14px}
.side{display:grid;grid-template-rows:auto 1fr auto auto;min-width:0}
.top{display:flex;justify-content:space-between;gap:8px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:color-mix(in srgb,var(--ink) 72%,transparent);white-space:nowrap}
#alarm{letter-spacing:.06em;color:var(--accent)}
#digits{align-self:center;justify-self:center;display:flex;font-family:var(--digits);font-weight:var(--dw,300);font-size:min(25vw,46vh);line-height:.9;text-shadow:0 2px 18px var(--shade)}
#digits span{display:inline-block;width:var(--cw,.6em);text-align:center}
#digits i{font-style:normal;width:.3em;text-align:center;transform:translateY(-.07em)}
body.paused #digits{opacity:.55}
.bar{height:3px;border-radius:9px;margin:4px 0 8px;overflow:hidden;background:color-mix(in srgb,var(--ink) 18%,transparent)}
.bar i{display:block;height:100%;width:0;background:var(--accent)}
.btns{display:flex;gap:5px;justify-content:center}
button{all:unset;cursor:pointer;padding:6px 10px;border-radius:99px;font-size:11px;letter-spacing:.04em;white-space:nowrap;background:color-mix(in srgb,var(--shade) 62%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 16%,transparent)}
button:hover{background:color-mix(in srgb,var(--ink) 18%,transparent)}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button.main{flex:1;text-align:center;font-weight:600;color:var(--shade);background:var(--accent);box-shadow:none}
`;

function syncLook() {
  const info = stage.info();
  if (!win || !info) return;
  const st = win.document.documentElement.style, v = info.vibe;
  for (const k of ['accent', 'accent2', 'ink', 'shade', 'digits']) st.setProperty('--' + k, v[k]);
  st.setProperty('--dw', v.id === 'lofi' ? 400 : 300);
  st.setProperty('--cw', v.id === 'lofi' ? '.46em' : '.6em');
  st.setProperty('--ui', getComputedStyle(document.documentElement).getPropertyValue('--ui'));   // same fonts as the page, CJK ones too
}

function render() {
  if (!win) return;
  const d = win.document, s = timer.state, up = alarms.upcoming();
  const text = clockText(s.remainingMs), el = d.getElementById('digits');
  if (el.dataset.t !== text) {
    el.dataset.t = text;
    el.innerHTML = [...text].map(c => (c === ':' ? '<i>:</i>' : `<span>${c}</span>`)).join('');
  }
  d.getElementById('mode').textContent = t(`mode.${s.mode}`);
  d.getElementById('fill').style.width = (timer.progress() * 100).toFixed(1) + '%';
  d.getElementById('toggle').textContent = t(s.status === 'running' ? 'toggle.pause' : s.status === 'paused' ? 'toggle.resume' : 'mini.start');
  d.body.classList.toggle('paused', s.status === 'paused');
  const at = up ? new Date(up.next) : null;
  d.getElementById('alarm').textContent = at ? `⏰ ${pad(at.getHours())}:${pad(at.getMinutes())}` : '';
}

// Copy the live scene into the small window twice a second.
function paintBg() {
  const src = stage.canvas();
  if (!win || !src) return;
  const c = win.document.getElementById('bg'), g = c.getContext('2d');
  const W = (c.width = win.innerWidth), H = (c.height = win.innerHeight);
  const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
  if (!sw) return;
  const k = Math.max(W / sw, H / sh), w = sw * k, h = sh * k;
  g.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
}

for (const ev of ['timer', 'timer:tick', 'alarm:change']) bus.on(ev, render);
bus.on('scene:change', syncLook);

export const mini = {
  supported: 'documentPictureInPicture' in window,
  isOpen: () => !!win,
  async toggle() {
    if (win) { win.close(); return false; }
    win = await documentPictureInPicture.requestWindow({ width: 380, height: 190 });
    const d = win.document;
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      if (/fonts\.googleapis/.test(link.href)) d.head.append(Object.assign(d.createElement('link'), { rel: 'stylesheet', href: link.href }));
    }
    d.head.append(Object.assign(d.createElement('style'), { textContent: CSS }));
    d.title = 'ChillTimer';
    d.documentElement.lang = lang;
    d.body.innerHTML = `<canvas id="bg"></canvas><div class="veil"></div>
      <div class="wrap">
        <div class="side">
          <div class="top"><span id="mode"></span><span id="alarm"></span></div>
          <div id="digits"></div>
          <div class="bar"><i id="fill"></i></div>
          <div class="btns"><button data-a="minus" aria-label="${t('mini.minus')}">−1</button><button class="main" id="toggle" data-a="toggle"></button><button data-a="plus" aria-label="${t('mini.plus')}">+1</button><button data-a="skip">${t('mini.skip')}</button></div>
        </div>
      </div>`;
    d.body.addEventListener('click', e => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'toggle') timer.toggle();
      else if (a === 'skip') timer.skip();
      else if (a) timer.adjust(a === 'plus' ? MIN : -MIN);
    });
    d.addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); timer.toggle(); } });
    win.addEventListener('pagehide', () => {
      clearInterval(bgTimer);
      win = null;
      bus.emit('mini', false);
    });
    syncLook(); render(); paintBg();
    bgTimer = setInterval(paintBg, 500);
    bus.emit('mini', true);
    return true;
  }
};
