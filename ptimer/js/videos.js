/* ==============================================
   ChillTimer — Video Background Manager
   ============================================== */

class VideoManager {
  constructor() {
    this.video1 = document.getElementById('videoBg1');
    this.video2 = document.getElementById('videoBg2');
    this.fallback = document.getElementById('bgFallback');
    this.activeVideo = this.video1;
    this.inactiveVideo = this.video2;
    this.currentSceneId = null;

    // Check reduced motion
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Preset scenes — Mixkit (CORS: Access-Control-Allow-Origin: *)
    this.scenes = [
      {
        id: 'rain',
        name: 'Rain on Window',
        url: 'https://assets.mixkit.co/videos/2846/2846-720.mp4',
        modeDefault: 'focus'
      },
      {
        id: 'fireplace',
        name: 'Fireplace',
        url: 'https://assets.mixkit.co/videos/1242/1242-720.mp4',
        modeDefault: 'shortBreak'
      },
      {
        id: 'city',
        name: 'Night City',
        url: 'https://assets.mixkit.co/videos/41161/41161-720.mp4',
        modeDefault: 'longBreak'
      },
      {
        id: 'forest',
        name: 'Sunlit Forest',
        url: 'https://assets.mixkit.co/videos/50847/50847-720.mp4',
        modeDefault: null
      },
      {
        id: 'waterfall',
        name: 'Waterfall',
        url: 'https://assets.mixkit.co/videos/2213/2213-720.mp4',
        modeDefault: null
      },
      {
        id: 'nightcity2',
        name: 'City Aerial Night',
        url: 'https://assets.mixkit.co/videos/42343/42343-720.mp4',
        modeDefault: null
      }
    ];

    // Mode-to-scene mapping (overridden by settings)
    this.modeScenes = {
      focus: 'rain',
      shortBreak: 'fireplace',
      longBreak: 'city'
    };

    this.autoSwitch = true;

    this.init();
  }

  init() {
    if (this.reducedMotion) {
      this.video1.style.display = 'none';
      this.video2.style.display = 'none';
      this.fallback.style.display = 'block';
      return;
    }

    this.fallback.style.display = 'none';

    // Load settings
    this.loadSettings();

    // Load initial scene
    this.switchScene(this.modeScenes.focus);

    // Listen for mode changes
    bus.on('timer:modeChange', ({ mode }) => {
      if (this.autoSwitch && this.modeScenes[mode]) {
        this.switchScene(this.modeScenes[mode]);
      }
    });

    bus.on('settings:change', () => this.loadSettings());
  }

  loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('ct_settings'));
      if (saved && saved.scenes) {
        this.autoSwitch = saved.scenes.autoSwitch !== false;
        if (saved.scenes.focus) this.modeScenes.focus = saved.scenes.focus;
        if (saved.scenes.short) this.modeScenes.shortBreak = saved.scenes.short;
        if (saved.scenes.long) this.modeScenes.longBreak = saved.scenes.long;
      }
    } catch { /* use defaults */ }
  }

  getScene(id) {
    return this.scenes.find(s => s.id === id);
  }

  switchScene(sceneId) {
    if (sceneId === this.currentSceneId) return;

    const scene = this.getScene(sceneId);
    if (!scene) return;

    this.currentSceneId = sceneId;

    // Load into inactive video
    this.inactiveVideo.src = scene.url;
    this.inactiveVideo.load();

    this.inactiveVideo.oncanplay = () => {
      this.inactiveVideo.play().catch(() => {});

      // Crossfade
      this.inactiveVideo.classList.remove('hidden');
      this.activeVideo.classList.add('hidden');

      // Swap references
      const temp = this.activeVideo;
      this.activeVideo = this.inactiveVideo;
      this.inactiveVideo = temp;

      // Clean up old after transition
      setTimeout(() => {
        this.inactiveVideo.pause();
        this.inactiveVideo.removeAttribute('src');
        this.inactiveVideo.load();
      }, 600);
    };

    // Fallback if video takes too long
    this.inactiveVideo.onerror = () => {
      this.fallback.style.display = 'block';
    };
  }

  getCurrentSceneId() {
    return this.currentSceneId;
  }

  getScenes() {
    return this.scenes;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.videoManager = new VideoManager();
});
