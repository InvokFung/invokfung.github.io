/* ==============================================
   ChillTimer — Settings Manager
   ============================================== */

class SettingsManager {
  constructor() {
    // Modal DOM
    this.modal = document.getElementById('settingsModal');
    this.openBtn = document.getElementById('settingsBtn');
    this.closeBtn = document.getElementById('closeSettingsBtn');

    // Timer inputs
    this.setFocus = document.getElementById('setFocus');
    this.setShort = document.getElementById('setShort');
    this.setLong = document.getElementById('setLong');
    this.setSessions = document.getElementById('setSessions');
    this.setGoal = document.getElementById('setGoal');
    this.setAutoBreak = document.getElementById('setAutoBreak');
    this.setAutoFocus = document.getElementById('setAutoFocus');

    // Scene
    this.setAutoScene = document.getElementById('setAutoScene');
    this.sceneGrid = document.getElementById('sceneGrid');

    // Audio
    this.setAutoPlay = document.getElementById('setAutoPlay');
    this.setAlarm = document.getElementById('setAlarm');
    this.setAlarmVol = document.getElementById('setAlarmVol');

    // Data
    this.exportBtn = document.getElementById('exportBtn');
    this.clearBtn = document.getElementById('clearBtn');

    // Load + populate
    this.settings = this.load();
    this.populateForm();
    this.renderScenes();
    this.bindEvents();
  }

  // --- Defaults ---

  defaults() {
    return {
      timer: {
        focus: 25,
        short: 5,
        long: 15,
        sessionsPerLong: 4,
        dailyGoal: 120,
        autoStartBreak: false,
        autoStartFocus: false
      },
      scenes: {
        autoSwitch: true,
        focus: 'rain',
        short: 'fireplace',
        long: 'city'
      },
      audio: {
        musicVolume: 70,
        ambientVolume: 50,
        autoPlay: true,
        alarmSound: 'chime',
        alarmVolume: 80
      }
    };
  }

  // --- Persistence ---

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem('ct_settings'));
      if (saved) return this.merge(this.defaults(), saved);
    } catch { /* fallthrough */ }
    return this.defaults();
  }

  merge(defaults, saved) {
    const result = {};
    for (const key of Object.keys(defaults)) {
      if (typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) {
        result[key] = { ...defaults[key], ...(saved[key] || {}) };
      } else {
        result[key] = saved[key] !== undefined ? saved[key] : defaults[key];
      }
    }
    return result;
  }

  save() {
    localStorage.setItem('ct_settings', JSON.stringify(this.settings));
    bus.emit('settings:change', this.settings);
  }

  // --- Form Population ---

  populateForm() {
    this.setFocus.value = this.settings.timer.focus;
    this.setShort.value = this.settings.timer.short;
    this.setLong.value = this.settings.timer.long;
    this.setSessions.value = this.settings.timer.sessionsPerLong;
    this.setGoal.value = this.settings.timer.dailyGoal;
    this.setAutoBreak.checked = this.settings.timer.autoStartBreak;
    this.setAutoFocus.checked = this.settings.timer.autoStartFocus;

    this.setAutoScene.checked = this.settings.scenes.autoSwitch;
    this.setAutoPlay.checked = this.settings.audio.autoPlay;
    this.setAlarm.value = this.settings.audio.alarmSound;
    this.setAlarmVol.value = this.settings.audio.alarmVolume;
  }

  // --- Scene Grid ---

  renderScenes() {
    if (!window.videoManager) {
      // Retry after video manager init
      setTimeout(() => this.renderScenes(), 500);
      return;
    }

    const scenes = window.videoManager.getScenes();
    this.sceneGrid.innerHTML = '';

    scenes.forEach(scene => {
      const thumb = document.createElement('div');
      thumb.className = 'scene-thumb' + (scene.id === window.videoManager.getCurrentSceneId() ? ' active' : '');
      thumb.innerHTML = `<span class="scene-label">${scene.name}</span>`;
      thumb.addEventListener('click', () => {
        window.videoManager.switchScene(scene.id);
        this.updateSceneActive(scene.id);
      });
      this.sceneGrid.appendChild(thumb);
    });
  }

  updateSceneActive(activeId) {
    this.sceneGrid.querySelectorAll('.scene-thumb').forEach((el, i) => {
      const scenes = window.videoManager.getScenes();
      el.classList.toggle('active', scenes[i] && scenes[i].id === activeId);
    });
  }

  // --- Event Binding ---

  bindEvents() {
    // Open/close
    this.openBtn.addEventListener('click', () => bus.emit('ui:openPanel', 'settings'));
    this.closeBtn.addEventListener('click', () => bus.emit('ui:closePanel', 'settings'));

    // Auto-save on any change
    const autoSave = () => {
      this.settings.timer.focus = this.clamp(parseInt(this.setFocus.value) || 25, 1, 90);
      this.settings.timer.short = this.clamp(parseInt(this.setShort.value) || 5, 1, 30);
      this.settings.timer.long = this.clamp(parseInt(this.setLong.value) || 15, 1, 60);
      this.settings.timer.sessionsPerLong = this.clamp(parseInt(this.setSessions.value) || 4, 2, 10);
      this.settings.timer.dailyGoal = this.clamp(parseInt(this.setGoal.value) || 120, 10, 480);
      this.settings.timer.autoStartBreak = this.setAutoBreak.checked;
      this.settings.timer.autoStartFocus = this.setAutoFocus.checked;

      this.settings.scenes.autoSwitch = this.setAutoScene.checked;
      this.settings.audio.autoPlay = this.setAutoPlay.checked;
      this.settings.audio.alarmSound = this.setAlarm.value;
      this.settings.audio.alarmVolume = parseInt(this.setAlarmVol.value);

      this.save();
    };

    // Attach to all inputs
    [this.setFocus, this.setShort, this.setLong, this.setSessions, this.setGoal].forEach(input => {
      input.addEventListener('change', autoSave);
    });
    [this.setAutoBreak, this.setAutoFocus, this.setAutoScene, this.setAutoPlay].forEach(toggle => {
      toggle.addEventListener('change', autoSave);
    });
    this.setAlarm.addEventListener('change', autoSave);
    this.setAlarmVol.addEventListener('input', autoSave);

    // Data buttons
    this.exportBtn.addEventListener('click', () => this.exportData());
    this.clearBtn.addEventListener('click', () => this.clearData());

    // Scene button in nav
    const sceneBtn = document.getElementById('sceneBtn');
    if (sceneBtn) {
      sceneBtn.addEventListener('click', () => {
        // Cycle to next scene
        if (window.videoManager) {
          const scenes = window.videoManager.getScenes();
          const currentIdx = scenes.findIndex(s => s.id === window.videoManager.getCurrentSceneId());
          const nextIdx = (currentIdx + 1) % scenes.length;
          window.videoManager.switchScene(scenes[nextIdx].id);
          this.updateSceneActive(scenes[nextIdx].id);
          bus.emit('ui:toast', { message: `Scene: ${scenes[nextIdx].name}`, type: 'info' });
        }
      });
    }
  }

  clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  // --- Export / Clear ---

  exportData() {
    const data = {
      settings: this.settings,
      stats: JSON.parse(localStorage.getItem('ct_stats') || '{}')
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chilltimer-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    bus.emit('ui:toast', { message: 'Data exported', type: 'success' });
  }

  clearData() {
    const confirmed = prompt('Type DELETE to confirm clearing all data:');
    if (confirmed !== 'DELETE') return;

    localStorage.removeItem('ct_settings');
    localStorage.removeItem('ct_stats');
    location.reload();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.settingsManager = new SettingsManager();
});
