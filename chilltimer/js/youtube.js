// A YouTube link as the background, as the music, or both.
// The player is YouTube's own frame. The page can show, hide and mute it, but a browser does not
// let a page read sound from another site's frame, so the sound wave cannot react to it.

import { bus } from './bus.js';

// Reads a video id and/or a playlist id from any common YouTube link.
export function parseYouTube(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  const list = /[?&]list=([\w-]{10,})/.exec(s)?.[1] || null;
  const id = /(?:youtu\.be\/|\/(?:embed|shorts|live)\/|[?&]v=)([\w-]{11})/.exec(s)?.[1] || (/^[\w-]{11}$/.test(s) ? s : null);
  return id || list ? { id, list } : null;
}

let layer = null, player = null, apiReady = null, link = '', title = '';
let visible = false, audible = true, volume = 0.6, playing = false, hideTimer = 0;

function api() {
  return (apiReady ||= new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { apiReady = null; reject(new Error('YouTube did not load')); };
    document.head.append(s);
  }));
}

function applySound() {
  if (!player || !player.setVolume) return;
  player.setVolume(Math.round(volume * 100));
  if (audible) player.unMute(); else player.mute();
}
function drop() {
  clearTimeout(hideTimer);
  try { if (player) player.destroy(); } catch { /* already gone */ }
  player = null;
  playing = false;
  if (layer) layer.innerHTML = '';
}

export const youtube = {
  mount(el) { layer = el; },
  link: () => link,
  title: () => title,
  playing: () => playing,

  // Start a link. Starts muted (browsers always allow that), then turns the sound on once it plays.
  async play(url) {
    const p = parseYouTube(url);
    if (!p || !layer) return false;
    link = url;
    title = '';
    layer.classList.remove('on');
    try { await api(); } catch { link = ''; bus.emit('yt:fail', 'load'); return false; }
    if (link !== url) return true;                              // another link came in while loading
    drop();
    const host = document.createElement('div');
    layer.append(host);
    player = new window.YT.Player(host, {
      width: '100%', height: '100%', videoId: p.id || undefined,
      playerVars: {
        autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, playsinline: 1,
        ...(p.list ? { listType: 'playlist', list: p.list } : { loop: 1, playlist: p.id })
      },
      events: {
        onReady: e => { e.target.mute(); e.target.playVideo(); },
        onStateChange: e => {
          if (e.data === 1) {
            playing = true;
            title = (e.target.getVideoData && e.target.getVideoData().title) || '';
            applySound();
            layer.classList.toggle('on', visible);
            bus.emit('yt:playing', title);
          } else if (e.data === 0 && !p.list) e.target.playVideo();   // a single video starts again
        },
        onError: e => {
          // a reason code; the text is the dictionary key `toast.yt.<code>`
          const why = e.data === 2 ? 'link' : e.data === 100 ? 'removed' : e.data === 101 || e.data === 150 ? 'owner' : 'other';
          youtube.stop();
          bus.emit('yt:fail', why);
        }
      }
    });
    return true;
  },
  setVisible(on) { visible = on; if (layer) layer.classList.toggle('on', on && playing); },
  setAudible(on) { audible = on; applySound(); },
  setVolume(v) { volume = v; applySound(); },
  // Fade out, then remove the player.
  stop() {
    if (!link && !player) return;
    link = '';
    title = '';
    if (layer) layer.classList.remove('on');
    if (player && player.mute) player.mute();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(drop, visible ? 3000 : 0);
  }
};
