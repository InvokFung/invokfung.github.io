/* ==============================================
   ChillTimer — YouTube Player + Ambient Mixer
   ============================================== */

class PlayerManager {
  constructor() {
    // DOM — Music
    this.playBtn = document.getElementById('musicPlayBtn');
    this.prevBtn = document.getElementById('musicPrevBtn');
    this.nextBtn = document.getElementById('musicNextBtn');
    this.trackTitle = document.getElementById('trackTitle');
    this.volumeSlider = document.getElementById('musicVolume');
    this.browseBtn = document.getElementById('browseBtn');
    this.closeBrowseBtn = document.getElementById('closeBrowseBtn');
    this.browsePanel = document.getElementById('browsePanel');
    this.playlistGrid = document.getElementById('playlistGrid');
    this.ytUrlInput = document.getElementById('ytUrlInput');
    this.ytLoadBtn = document.getElementById('ytLoadBtn');

    // DOM — Ambient
    this.ambientChannels = document.querySelectorAll('.ambient-channel');
    this.sounds = {
      rain: document.getElementById('soundRain'),
      fire: document.getElementById('soundFire'),
      forest: document.getElementById('soundForest'),
      ocean: document.getElementById('soundOcean')
    };

    // Ambient sources (royalty-free)
    this.ambientSources = {
      rain: 'https://cdn.pixabay.com/audio/2022/10/30/audio_84a1c67e42.mp3',
      fire: 'https://cdn.pixabay.com/audio/2022/08/04/audio_2a66a1e2db.mp3',
      forest: 'https://cdn.pixabay.com/audio/2022/01/20/audio_dbb00be2ea.mp3',
      ocean: 'https://cdn.pixabay.com/audio/2024/11/04/audio_4956b4ead1.mp3'
    };

    // --- MP3 fallback tracks (works offline / file:// protocol) ---
    this.mp3Audio = document.getElementById('mp3Player');
    if (!this.mp3Audio) {
      this.mp3Audio = document.createElement('audio');
      this.mp3Audio.id = 'mp3Player';
      this.mp3Audio.loop = false;
      document.body.appendChild(this.mp3Audio);
    }
    this.mp3Tracks = [
      { title: 'Heading Home — Ajmw', url: 'https://archive.org/download/chill-lofi-music-relax-study/Ajmw%20-%20Heading%20Home.mp3' },
      { title: 'Far Off — Casiio', url: 'https://archive.org/download/chill-lofi-music-relax-study/Casiio%20-%20Far%20Off.mp3' },
      { title: 'Night Emotions — DLJ', url: 'https://archive.org/download/chill-lofi-music-relax-study/DLJ%20-%20Night%20Emotions.mp3' },
      { title: 'Dozing — Chris Mazuera', url: 'https://archive.org/download/chill-lofi-music-relax-study/Chris%20Mazuera%20-%20Dozing.mp3' },
      { title: 'Feel Free To Imagine — Eugenio Izzi', url: 'https://archive.org/download/chill-lofi-music-relax-study/Eugenio%20Izzi%20-%20Feel%20Free%20To%20Imagine.mp3' },
      { title: 'Jiro Dreams — Dontcry x Glimlip', url: 'https://archive.org/download/chill-lofi-music-relax-study/Dontcry%20x%20Glimlip%20-%20Jiro%20Dreams.mp3' }
    ];
    this.mp3Index = 0;
    this.usingMP3 = true; // Default to MP3, switch to YT when loaded

    // YouTube state
    this.ytPlayer = null;
    this.ytReady = false;
    this.ytAPILoaded = false;
    this.isPlaying = false;
    this.isMuted = false;
    this.currentPlaylistIndex = -1;

    // Curated YouTube playlists
    this.playlists = [
      { name: 'Lofi Hip Hop', desc: 'Chill beats to focus', playlistId: 'PLOzDu-MXXLliO9fBNZOQTBDddoA3FzZUo' },
      { name: 'Jazz & Bossa Nova', desc: 'Smooth cafe vibes', playlistId: 'PLgzTt0k8mXzEpH7-dOCHqRZOsakqXmzmG' },
      { name: 'Classical Piano', desc: 'Timeless focus music', playlistId: 'PLLJhiB5FBGqzJYrenKCuql_j8FE7WVlB_' },
      { name: 'Chill Synthwave', desc: 'Retro electronic', playlistId: 'PLvlw_ICcAI4eJMNRqjzlsBMPIqJJ5ILgE' },
      { name: 'Ambient & Drone', desc: 'Deep atmospheric sounds', playlistId: 'PLvlw_ICcAI4dXYIMDdA4vLzJrfGxUfEFO' },
      { name: 'Nature Sounds', desc: 'Birds, water, wind', playlistId: 'PL6NdkXsPL07KN01gH2vucrHCEkkz6YSEU' }
    ];

    // MP3 native audio events — keep icon always in sync
    this.mp3Audio.addEventListener('ended', () => this.mp3Next());
    this.mp3Audio.addEventListener('play', () => {
      if (this.usingMP3) {
        this.isPlaying = true;
        this.updatePlayIcon();
      }
    });
    this.mp3Audio.addEventListener('pause', () => {
      if (this.usingMP3) {
        this.isPlaying = false;
        this.updatePlayIcon();
      }
    });

    this.bindEvents();
    this.renderPlaylists();
    this.loadVolumeSettings();
    this.loadMP3Track(0, false);
  }

  // --- YouTube IFrame API ---

  loadYTAPI() {
    if (this.ytAPILoaded) return;
    this.ytAPILoaded = true;

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      this.initYTPlayer();
    };
  }

  initYTPlayer() {
    this.ytPlayer = new YT.Player('ytPlayer', {
      height: '1',
      width: '1',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0
      },
      events: {
        onReady: () => {
          this.ytReady = true;
          this.ytPlayer.setVolume(parseInt(this.volumeSlider.value));
          if (this._pendingPlaylist) {
            this.loadPlaylist(this._pendingPlaylist);
            this._pendingPlaylist = null;
          }
          if (this._pendingVideoId) {
            this.loadVideo(this._pendingVideoId);
            this._pendingVideoId = null;
          }
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.updatePlayIcon();
            this.updateTrackTitle();
          } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
            this.isPlaying = false;
            this.updatePlayIcon();
          }
        }
      }
    });
  }

  loadPlaylist(playlistId) {
    if (!this.ytReady) {
      this._pendingPlaylist = playlistId;
      this.loadYTAPI();
      return;
    }
    this.ytPlayer.loadPlaylist({ listType: 'playlist', list: playlistId, index: 0, startSeconds: 0 });
    this.ytPlayer.setShuffle(true);
  }

  loadVideo(videoId) {
    if (!this.ytReady) {
      this._pendingVideoId = videoId;
      this.loadYTAPI();
      return;
    }
    this.ytPlayer.loadVideoById(videoId);
  }

  play() {
    if (!this.ytReady) return;
    this.ytPlayer.playVideo();
  }

  pause() {
    if (!this.ytReady) return;
    this.ytPlayer.pauseVideo();
  }

  // --- MP3 Fallback Player ---

  loadMP3Track(index, autoPlay = false) {
    if (index < 0) index = this.mp3Tracks.length - 1;
    if (index >= this.mp3Tracks.length) index = 0;
    this.mp3Index = index;

    const track = this.mp3Tracks[this.mp3Index];
    this.mp3Audio.src = track.url;
    this.trackTitle.textContent = track.title;
    this.mp3Audio.volume = (parseInt(this.volumeSlider.value) || 70) / 100;

    if (autoPlay) {
      this.mp3Audio.play().catch(() => {});
      this.isPlaying = true;
      this.updatePlayIcon();
    }
  }

  mp3Play() {
    this.mp3Audio.play().catch(() => {});
    this.isPlaying = true;
    this.trackTitle.textContent = this.mp3Tracks[this.mp3Index].title;
    this.updatePlayIcon();
  }

  mp3Pause() {
    this.mp3Audio.pause();
    this.isPlaying = false;
    this.updatePlayIcon();
  }

  mp3Next() {
    this.loadMP3Track(this.mp3Index + 1, true);
  }

  mp3Prev() {
    this.loadMP3Track(this.mp3Index - 1, true);
  }

  // --- Unified Play/Pause ---

  togglePlay() {
    if (this.usingMP3) {
      if (this.isPlaying) {
        this.mp3Pause();
      } else {
        this.mp3Play();
      }
      return;
    }

    // YouTube mode
    if (!this.ytReady && !this.ytAPILoaded) {
      this.loadPlaylist(this.playlists[0].playlistId);
      this.currentPlaylistIndex = 0;
      this.updatePlaylistActive();
      return;
    }

    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  nextTrack() {
    if (!this.ytReady) return;
    this.ytPlayer.nextVideo();
  }

  prevTrack() {
    if (!this.ytReady) return;
    this.ytPlayer.previousVideo();
  }

  setVolume(val) {
    if (!this.ytReady) return;
    this.ytPlayer.setVolume(val);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;

    // Mute MP3
    this.mp3Audio.muted = this.isMuted;

    // Mute YouTube
    if (this.ytReady) {
      if (this.isMuted) this.ytPlayer.mute();
      else this.ytPlayer.unMute();
    }

    // Mute ambient
    Object.values(this.sounds).forEach(s => s.muted = this.isMuted);
  }

  updateTrackTitle() {
    if (!this.ytReady) return;
    try {
      const data = this.ytPlayer.getVideoData();
      if (data && data.title) {
        this.trackTitle.textContent = data.title;
        bus.emit('player:trackChange', { title: data.title });
      }
    } catch { /* ignore */ }
  }

  updatePlayIcon() {
    const svg = this.isPlaying
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
    this.playBtn.innerHTML = svg;
    this.playBtn.setAttribute('aria-label', this.isPlaying ? 'Pause music' : 'Play music');
  }

  // --- Parse YouTube URL ---

  parseYTUrl(url) {
    // Playlist
    const plMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (plMatch) return { type: 'playlist', id: plMatch[1] };

    // Video
    const vMatch = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/v\/)([a-zA-Z0-9_-]{11})/);
    if (vMatch) return { type: 'video', id: vMatch[1] };

    return null;
  }

  // --- Ambient Mixer ---

  toggleAmbient(sound) {
    const audio = this.sounds[sound];
    if (!audio) return;

    const toggle = document.querySelector(`.ambient-channel[data-sound="${sound}"] .sound-toggle`);

    if (audio.paused) {
      if (!audio.src) audio.src = this.ambientSources[sound];
      audio.play().catch(() => {});
      toggle.classList.add('active');
      toggle.setAttribute('aria-pressed', 'true');
    } else {
      audio.pause();
      toggle.classList.remove('active');
      toggle.setAttribute('aria-pressed', 'false');
    }
  }

  setAmbientVolume(sound, val) {
    const audio = this.sounds[sound];
    if (audio) audio.volume = val / 100;
  }

  // --- Playlists UI ---

  renderPlaylists() {
    this.playlistGrid.innerHTML = '';
    this.playlists.forEach((pl, i) => {
      const card = document.createElement('div');
      card.className = 'playlist-card' + (i === this.currentPlaylistIndex ? ' active' : '');
      card.innerHTML = `<div class="playlist-name">${pl.name}</div><div class="playlist-desc">${pl.desc}</div>`;
      card.addEventListener('click', () => {
        // Switch to YouTube mode
        this.mp3Audio.pause();
        this.usingMP3 = false;
        this.currentPlaylistIndex = i;
        this.trackTitle.textContent = `Loading ${pl.name}...`;
        this.isPlaying = false;
        this.updatePlayIcon();
        this.loadPlaylist(pl.playlistId);
        this.updatePlaylistActive();
        bus.emit('ui:closePanel', 'browse');
      });
      this.playlistGrid.appendChild(card);
    });
  }

  updatePlaylistActive() {
    const cards = this.playlistGrid.querySelectorAll('.playlist-card');
    cards.forEach((card, i) => {
      card.classList.toggle('active', i === this.currentPlaylistIndex);
    });
  }

  // --- Settings ---

  loadVolumeSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('ct_settings'));
      if (saved && saved.audio) {
        this.volumeSlider.value = saved.audio.musicVolume || 70;
        // Set ambient volume
        const ambVol = saved.audio.ambientVolume || 50;
        document.querySelectorAll('.slider-ambient').forEach(s => s.value = ambVol);
      }
    } catch { /* defaults fine */ }
  }

  // --- Event Binding ---

  bindEvents() {
    // Player controls
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.prevBtn.addEventListener('click', () => {
      if (this.usingMP3) this.mp3Prev(); else this.prevTrack();
    });
    this.nextBtn.addEventListener('click', () => {
      if (this.usingMP3) this.mp3Next(); else this.nextTrack();
    });

    // Volume
    this.volumeSlider.addEventListener('input', (e) => {
      const vol = parseInt(e.target.value);
      if (this.usingMP3) {
        this.mp3Audio.volume = vol / 100;
      } else {
        this.setVolume(vol);
      }
    });

    // Browse panel
    this.browseBtn.addEventListener('click', () => bus.emit('ui:openPanel', 'browse'));
    this.closeBrowseBtn.addEventListener('click', () => bus.emit('ui:closePanel', 'browse'));

    // Custom URL
    this.ytLoadBtn.addEventListener('click', () => this.loadCustomUrl());
    this.ytUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.loadCustomUrl();
    });

    // Ambient
    this.ambientChannels.forEach(ch => {
      const sound = ch.dataset.sound;
      const toggle = ch.querySelector('.sound-toggle');
      const slider = ch.querySelector('.slider-ambient');

      toggle.addEventListener('click', () => this.toggleAmbient(sound));
      if (slider) {
        slider.addEventListener('input', (e) => this.setAmbientVolume(sound, parseInt(e.target.value)));
      }
    });

    // Bus
    bus.on('player:toggleMute', () => this.toggleMute());

    // Splash dismiss = user gesture, preload YouTube API for audio context
    bus.on('splash:dismissed', () => {
      this.loadYTAPI();
    });

    bus.on('timer:start', () => {
      try {
        const saved = JSON.parse(localStorage.getItem('ct_settings'));
        const autoPlay = !saved || !saved.audio || saved.audio.autoPlay !== false;
        if (autoPlay && !this.isPlaying) {
          if (this.usingMP3) {
            this.mp3Play();
          } else if (!this.ytReady && !this.ytAPILoaded) {
            this.loadPlaylist(this.playlists[0].playlistId);
            this.currentPlaylistIndex = 0;
            this.updatePlaylistActive();
          } else {
            this.play();
          }
        }
      } catch { /* skip auto-play */ }
    });
  }

  loadCustomUrl() {
    const url = this.ytUrlInput.value.trim();
    if (!url) return;

    const parsed = this.parseYTUrl(url);
    if (!parsed) {
      bus.emit('ui:toast', { message: 'Invalid YouTube URL', type: 'warning' });
      return;
    }

    // Switch to YouTube mode
    this.mp3Audio.pause();
    this.usingMP3 = false;
    this.trackTitle.textContent = 'Loading...';

    if (parsed.type === 'playlist') {
      this.loadPlaylist(parsed.id);
      this.currentPlaylistIndex = -1;
      this.updatePlaylistActive();
    } else {
      this.loadVideo(parsed.id);
    }

    this.ytUrlInput.value = '';
    bus.emit('ui:closePanel', 'browse');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.playerManager = new PlayerManager();
});
