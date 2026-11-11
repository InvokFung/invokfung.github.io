// The track list: free music, played from archive.org (nothing is stored in this repo).
// The audio runs through the sound module, so the master volume, mute and the sound wave all apply.

import { bus } from './bus.js';
import { t } from './i18n.js';

// Every track has its own full `url`, a `license` (CC BY, CC BY-SA or CC0) and a `page` (the source, for credit).
// They are all on archive.org, which sends the CORS header that Web Audio needs.
export const TRACKS = [
  { title: 'Cafezinho com Leite', by: 'Popoi',
    url: 'https://archive.org/download/popoi-cafezinho-com-leite/Popoi%20-%20Cafezinho%20com%20Leite.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/popoi-cafezinho-com-leite' },
  { title: 'puppy', by: 'Complex Routine',
    url: 'https://archive.org/download/time-for-tea/06%20puppy.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/time-for-tea' },
  { title: 'weekend-beats', by: 'Franck Ridel',
    url: 'https://archive.org/download/weekend-beats/weekend-beats.mp3',
    license: 'CC BY-SA 4.0', page: 'https://archive.org/details/weekend-beats' },
  { title: 'Cat Nap', by: 'Purrple Cat',
    url: 'https://archive.org/download/purrplecat-cat-nap/Cat%20Nap.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/purrplecat-cat-nap' },
  { title: 'woody', by: 'hzn',
    url: 'https://archive.org/download/woodyhzn/woody.mp3',
    license: 'CC0 1.0', page: 'https://archive.org/details/woodyhzn' },
  { title: 'ramen', by: 'Complex Routine',
    url: 'https://archive.org/download/time-for-tea/10%20ramen.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/time-for-tea' },
  { title: 'break', by: 'Complex Routine',
    url: 'https://archive.org/download/time-for-tea/01%20break.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/time-for-tea' },
  { title: 'Silence Inside', by: 'oceanicpiano.com',
    url: 'https://archive.org/download/free-music-for-commercial-use/Silence%20Inside.mp3',
    license: 'CC BY 3.0', page: 'https://archive.org/details/free-music-for-commercial-use' },
  { title: 'Endless', by: 'Thought Pyramid',
    url: 'https://archive.org/download/ThoughtPyramidEndless/01_Endless.mp3',
    license: 'CC BY 2.0', page: 'https://archive.org/details/ThoughtPyramidEndless' },
  { title: 'market', by: 'Complex Routine',
    url: 'https://archive.org/download/time-for-tea/03%20market.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/time-for-tea' },
  { title: 'Relaxing Time', by: 'oceanicpiano.com',
    url: 'https://archive.org/download/free-music-for-commercial-use/Relaxing%20Time.mp3',
    license: 'CC BY 3.0', page: 'https://archive.org/details/free-music-for-commercial-use' },
  { title: 'Morning Cup', by: 'Thought Pyramid',
    url: 'https://archive.org/download/ThoughtPyramidEndless/06_MorningCup.mp3',
    license: 'CC BY 2.0', page: 'https://archive.org/details/ThoughtPyramidEndless' },
  { title: 'cafe', by: 'Complex Routine',
    url: 'https://archive.org/download/time-for-tea/07%20cafe.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/time-for-tea' },
  { title: 'Magical Story', by: 'oceanicpiano.com',
    url: 'https://archive.org/download/free-music-for-commercial-use/Magical%20Story.mp3',
    license: 'CC BY 3.0', page: 'https://archive.org/details/free-music-for-commercial-use' },
  { title: 'Walk in the Park', by: 'Thought Pyramid',
    url: 'https://archive.org/download/ThoughtPyramidEndless/09_WalkinthePark.mp3',
    license: 'CC BY 2.0', page: 'https://archive.org/details/ThoughtPyramidEndless' },
  { title: 'Coffee Jelly', by: 'Purrple Cat',
    url: 'https://archive.org/download/purrplecat-a-good-book/Coffee%20Jelly.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/purrplecat-a-good-book' },
  { title: 'Unlimited Flow', by: 'oceanicpiano.com',
    url: 'https://archive.org/download/free-music-for-commercial-use/Unlimited%20Flow.mp3',
    license: 'CC BY 3.0', page: 'https://archive.org/details/free-music-for-commercial-use' },
  { title: 'Wake Up Start Dreaming', by: 'Thought Pyramid',
    url: 'https://archive.org/download/ThoughtPyramidEndless/07_WakeUpStartDreaming.mp3',
    license: 'CC BY 2.0', page: 'https://archive.org/details/ThoughtPyramidEndless' },
  { title: 'Bookworm', by: 'Purrple Cat',
    url: 'https://archive.org/download/purrplecat-a-good-book/Bookworm.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/purrplecat-a-good-book' },
  { title: '1st Gymnopedie ~ 1888', by: 'Rafi Simcha',
    url: 'https://archive.org/download/ThreeGnossiennesErikSatie/Satie.mp3',
    license: 'CC BY 3.0', page: 'https://archive.org/details/ThreeGnossiennesErikSatie' },
  { title: 'Saturday', by: 'Thought Pyramid',
    url: 'https://archive.org/download/ThoughtPyramidEndless/04_Saturday.mp3',
    license: 'CC BY 2.0', page: 'https://archive.org/details/ThoughtPyramidEndless' },
  { title: 'Bird Watching', by: 'Purrple Cat',
    url: 'https://archive.org/download/purrplecat-cat-nap/Bird%20Watching.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/purrplecat-cat-nap' },
  { title: 'Aria', by: 'Kimiko Ishizaka',
    url: 'https://archive.org/download/OpenGoldbergVariations/Kimiko%20Ishizaka%20-%20J.S.%20Bach-%20-Open-%20Goldberg%20Variations%2C%20BWV%20988%20%28Piano%29%20-%2001%20Aria.mp3',
    license: 'CC0 1.0', page: 'https://archive.org/details/OpenGoldbergVariations' },
  { title: 'Nyan', by: 'Aiden Quartz',
    url: 'https://archive.org/download/mr_phobia_Nyan/Nyan.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/mr_phobia_Nyan' },
  { title: 'Wispy Whiskers', by: 'Purrple Cat',
    url: 'https://archive.org/download/purrplecat-cat-nap/Wispy%20Whiskers.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/purrplecat-cat-nap' },
  { title: 'Remember melody', by: 'Torley',
    url: 'https://archive.org/download/solo-piano-7/Torley-002-Remember-melody.mp3',
    license: 'CC BY-SA 3.0', page: 'https://archive.org/details/solo-piano-7' },
  { title: 'Rain', by: 'Gregoire Lourme',
    url: 'https://archive.org/download/Life-GregoireLourme/03%20-%20Gregoire%20Lourme%20-%20Rain.mp3',
    license: 'CC BY-SA 3.0', page: 'https://archive.org/details/Life-GregoireLourme' },
  { title: 'East Side Manhattan', by: 'Popoi',
    url: 'https://archive.org/download/popoi-east-side-manhattan/Popoi%20-%20East%20Side%20Manhattan.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/popoi-east-side-manhattan' },
  { title: 'Close to you', by: 'Monplaisir',
    url: 'https://archive.org/download/Monplaisir-FiftySecondsOfRain/Monplaisir%20-%20Fifty%20seconds%20of%20rain%20-%2002%20Close%20to%20you.mp3',
    license: 'CC0 1.0', page: 'https://archive.org/details/Monplaisir-FiftySecondsOfRain' },
  { title: 'Memories', by: 'Gregoire Lourme',
    url: 'https://archive.org/download/Life-GregoireLourme/10%20-%20Gregoire%20Lourme%20-%20Memories.mp3',
    license: 'CC BY-SA 3.0', page: 'https://archive.org/details/Life-GregoireLourme' },
  { title: 'Georgetown Cafe', by: 'Popoi',
    url: 'https://archive.org/download/popoi-georgetown-cafe/Popoi%20-%20Georgetown%20Cafe.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/popoi-georgetown-cafe' },
  { title: 'Waves', by: 'Monplaisir',
    url: 'https://archive.org/download/Monplaisir-FiftySecondsOfRain/Monplaisir%20-%20Fifty%20seconds%20of%20rain%20-%2006%20Waves.mp3',
    license: 'CC0 1.0', page: 'https://archive.org/details/Monplaisir-FiftySecondsOfRain' },
  { title: 'Night', by: 'Gregoire Lourme',
    url: 'https://archive.org/download/Life-GregoireLourme/12%20-%20Gregoire%20Lourme%20-%20Night.mp3',
    license: 'CC BY-SA 3.0', page: 'https://archive.org/details/Life-GregoireLourme' },
  { title: 'Castle By The Sea', by: 'Nightingale Lofi',
    url: 'https://archive.org/download/nightingale-lofi-1-castle-by-the-sea/Nightingale%20Lofi%20-%201%20-%20Castle%20By%20The%20Sea.mp3',
    license: 'CC BY-SA 4.0', page: 'https://archive.org/details/nightingale-lofi-1-castle-by-the-sea' },
  { title: 'Skysand', by: 'Monplaisir',
    url: 'https://archive.org/download/Monplaisir-FiftySecondsOfRain/Monplaisir%20-%20Fifty%20seconds%20of%20rain%20-%2004%20Skysand.mp3',
    license: 'CC0 1.0', page: 'https://archive.org/details/Monplaisir-FiftySecondsOfRain' },
  { title: 'Rest', by: 'P C III',
    url: 'https://archive.org/download/WearyWorld/Track%201%20Rest.mp3',
    license: 'CC BY 4.0', page: 'https://archive.org/details/WearyWorld' }
];

let audio = null, sound = null, index = 0, wanted = false, fails = 0;

function player() {
  if (audio) return audio;
  audio = new Audio();
  audio.crossOrigin = 'anonymous';            // needed to send it through Web Audio; archive.org allows it
  audio.preload = 'none';
  audio.addEventListener('ended', () => tracks.next());
  audio.addEventListener('playing', () => { fails = 0; });
  audio.addEventListener('error', () => {
    if (!wanted) return;
    if (++fails >= TRACKS.length) { wanted = false; fails = 0; bus.emit('toast', { text: t('toast.tracksFail'), ms: 6000 }); }
    else tracks.next();
  });
  for (const ev of ['play', 'pause', 'playing']) audio.addEventListener(ev, () => bus.emit('tracks'));
  return audio;
}

export const tracks = {
  use(soundModule, startIndex = 0) { sound = soundModule; index = ((startIndex % TRACKS.length) + TRACKS.length) % TRACKS.length; },
  index: () => index,
  current: () => TRACKS[index],
  playing: () => !!audio && !audio.paused,
  play() {
    wanted = true;
    const a = player();
    if (!a.src) a.src = TRACKS[index].url;
    if (sound) sound.attach(a);
    a.play().catch(() => {});
  },
  pause() { wanted = false; if (audio) audio.pause(); },
  // Pick a track. It plays if music was already playing, or if `start` is true.
  select(i, start = wanted) {
    index = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    player().src = TRACKS[index].url;
    bus.emit('tracks');
    if (start) tracks.play();
  },
  next() { tracks.select(index + 1); },
  prev() { tracks.select(index - 1); }
};
