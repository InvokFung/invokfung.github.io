/* ==============================================
   ChillTimer — UI Manager
   Auto-hide nav, panels, toasts, confetti, PiP
   ============================================== */

class UIManager {
  constructor() {
    // DOM
    this.topNav = document.getElementById('topNav');
    this.statsPanel = document.getElementById('statsPanel');
    this.browsePanel = document.getElementById('browsePanel');
    this.settingsModal = document.getElementById('settingsModal');
    this.toastContainer = document.getElementById('toastContainer');

    // Panel buttons
    this.statsBtn = document.getElementById('statsBtn');
    this.closeStatsBtn = document.getElementById('closeStatsBtn');
    this.fullscreenBtn = document.getElementById('fullscreenBtn');
    this.pipBtn = document.getElementById('pipBtn');

    // State
    this.activePanel = null; // 'stats' | 'browse' | 'settings' | null
    this.idleTimeout = null;
    this.idleDelay = 3000;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.bindEvents();
    this.initSplash();
    this.startIdleWatch();
  }

  // --- Splash / Lock Screen ---

  initSplash() {
    const splash = document.getElementById('splashScreen');
    if (!splash) return;

    let startY = 0;
    let isDragging = false;
    this.splashDismissed = false;

    const dismiss = () => {
      if (this.splashDismissed) return;
      this.splashDismissed = true;

      splash.classList.add('dismissing');
      setTimeout(() => {
        splash.classList.add('hidden');
      }, 500);

      // This user gesture unlocks audio autoplay
      bus.emit('splash:dismissed');

      // Request notification permission
      this.requestNotificationPermission();
    };

    const resetSplash = () => {
      splash.style.transition = 'transform 0.3s ease-out, opacity 0.3s';
      splash.style.transform = '';
      splash.style.opacity = '';
    };

    const getY = (e) => {
      if (e.touches && e.touches.length > 0) return e.touches[0].clientY;
      if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientY;
      return e.clientY;
    };

    // Tap to dismiss
    splash.addEventListener('click', (e) => {
      if (!isDragging) dismiss();
    });

    // Swipe up to dismiss
    const onDown = (e) => {
      if (e.type === 'mousedown' && e.button !== 0) return;
      isDragging = true;
      startY = getY(e);
      splash.style.transition = 'none';
    };

    const onMove = (e) => {
      if (!isDragging) return;
      if (e.cancelable && e.type === 'touchmove') e.preventDefault();

      const diff = startY - getY(e);
      if (diff > 0) {
        splash.style.transform = `translateY(-${diff}px)`;
        splash.style.opacity = Math.max(0.3, 1 - (diff / window.innerHeight));
      }
    };

    const onUp = (e) => {
      if (!isDragging) return;
      isDragging = false;

      const diff = startY - getY(e);
      if (diff > 80 || diff > window.innerHeight * 0.15) {
        dismiss();
      } else {
        resetSplash();
      }
    };

    const onCancel = () => {
      if (isDragging) {
        isDragging = false;
        resetSplash();
      }
    };

    // Touch events
    splash.addEventListener('touchstart', onDown, { passive: false });
    splash.addEventListener('touchmove', onMove, { passive: false });
    splash.addEventListener('touchend', onUp);
    splash.addEventListener('touchcancel', onCancel);

    // Mouse events
    splash.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // --- Auto-hide Navigation ---

  startIdleWatch() {
    this.resetIdle();

    const onActivity = () => this.resetIdle();
    document.addEventListener('mousemove', onActivity);
    document.addEventListener('touchstart', onActivity, { passive: true });
    document.addEventListener('keydown', onActivity);
  }

  resetIdle() {
    // Show nav
    this.topNav.classList.remove('hidden');

    // Reset timer
    clearTimeout(this.idleTimeout);

    // Don't hide if panel/modal open
    if (this.activePanel) return;

    this.idleTimeout = setTimeout(() => {
      this.topNav.classList.add('hidden');
    }, this.idleDelay);
  }

  // --- Panel Management ---

  openPanel(name) {
    // Close any active first
    if (this.activePanel) this.closePanel(this.activePanel);

    this.activePanel = name;

    switch (name) {
      case 'stats':
        this.statsPanel.classList.add('open');
        break;
      case 'browse':
        this.browsePanel.classList.add('open');
        break;
      case 'settings':
        this.settingsModal.classList.add('open');
        break;
    }

    // Keep nav visible while panel open
    clearTimeout(this.idleTimeout);
    this.topNav.classList.remove('hidden');
  }

  closePanel(name) {
    if (!name) name = this.activePanel;
    if (!name) return;

    switch (name) {
      case 'stats':
        this.statsPanel.classList.remove('open');
        break;
      case 'browse':
        this.browsePanel.classList.remove('open');
        break;
      case 'settings':
        this.settingsModal.classList.remove('open');
        break;
    }

    if (this.activePanel === name) {
      this.activePanel = null;
    }

    // Resume idle watch
    this.resetIdle();
  }

  closeActive() {
    if (this.activePanel) {
      this.closePanel(this.activePanel);
    }
  }

  // --- Toasts ---

  showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }

  // --- Confetti ---

  fireConfetti() {
    if (this.reducedMotion) return;
    if (typeof confetti !== 'function') return;

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#f97316', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b']
    });
  }

  // --- Fullscreen ---

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {
        this.showToast('Fullscreen not supported', 'warning');
      });
    }
  }

  // --- Picture in Picture ---

  async togglePiP() {
    // Try Document PiP API (Chrome 116+)
    if ('documentPictureInPicture' in window) {
      try {
        const pipWindow = await documentPictureInPicture.requestWindow({
          width: 300,
          height: 200
        });

        // Get current accent color
        const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#f97316';
        const accentGlow = getComputedStyle(document.body).getPropertyValue('--accent-glow').trim() || 'rgba(249,115,22,0.3)';

        // Style the PiP window with immersive background
        const style = pipWindow.document.createElement('style');
        style.textContent = `
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;700&family=JetBrains+Mono:wght@700&display=swap');
          body {
            margin: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: linear-gradient(135deg, #0a0a0f 0%, #1a1025 50%, #0d1b2a 100%);
            background-size: 300% 300%;
            animation: drift 15s ease infinite;
            color: #f0f0f5;
            font-family: 'JetBrains Mono', monospace;
            gap: 10px;
            overflow: hidden;
            position: relative;
          }
          @keyframes drift {
            0% { background-position: 0% 0%; }
            50% { background-position: 100% 100%; }
            100% { background-position: 0% 0%; }
          }
          body::before {
            content: '';
            position: absolute;
            width: 200px;
            height: 200px;
            border-radius: 50%;
            background: ${accent};
            filter: blur(80px);
            opacity: 0.15;
            top: -60px;
            right: -60px;
          }
          .pip-time {
            font-size: 3rem;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            text-shadow: 0 0 20px ${accentGlow};
            position: relative;
          }
          .pip-mode {
            font-size: 0.75rem;
            opacity: 0.5;
            font-family: Inter, sans-serif;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.1em;
          }
          .pip-track {
            font-size: 0.625rem;
            opacity: 0.4;
            font-family: Inter, sans-serif;
            max-width: 250px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          button {
            padding: 6px 20px;
            border: none;
            border-radius: 999px;
            background: ${accent};
            color: #0a0a0f;
            font-weight: 700;
            font-size: 0.8rem;
            cursor: pointer;
            font-family: Inter, sans-serif;
            box-shadow: 0 2px 12px ${accentGlow};
            transition: transform 0.15s;
          }
          button:hover { transform: scale(1.05); }
          button:active { transform: scale(0.95); }
        `;
        pipWindow.document.head.appendChild(style);

        // Content
        const timeEl = pipWindow.document.createElement('div');
        timeEl.className = 'pip-time';
        timeEl.textContent = document.getElementById('timerDisplay').textContent;

        const modeEl = pipWindow.document.createElement('div');
        modeEl.className = 'pip-mode';
        modeEl.textContent = this.getModeLabel();

        const trackEl = pipWindow.document.createElement('div');
        trackEl.className = 'pip-track';
        trackEl.textContent = document.getElementById('trackTitle').textContent;

        const isRunning = window.timerManager && window.timerManager.state === 'running';
        const btn = pipWindow.document.createElement('button');
        btn.textContent = isRunning ? 'Pause' : 'Start';
        btn.addEventListener('click', () => bus.emit('timer:toggleStart'));

        pipWindow.document.body.append(timeEl, modeEl, trackEl, btn);

        // Update PiP content on tick
        const unsub = bus.on('timer:tick', () => {
          timeEl.textContent = document.getElementById('timerDisplay').textContent;
          modeEl.textContent = this.getModeLabel();
          trackEl.textContent = document.getElementById('trackTitle').textContent;
        });

        const unsubState = bus.on('timer:start', () => { btn.textContent = 'Pause'; });
        const unsubPause = bus.on('timer:pause', () => { btn.textContent = 'Resume'; });
        const unsubReset = bus.on('timer:reset', () => { btn.textContent = 'Start'; });
        const unsubMode = bus.on('timer:modeChange', () => {
          modeEl.textContent = this.getModeLabel();
          timeEl.textContent = document.getElementById('timerDisplay').textContent;
        });

        pipWindow.addEventListener('pagehide', () => {
          unsub();
          unsubState();
          unsubPause();
          unsubReset();
          unsubMode();
        });
      } catch {
        this.showToast('PiP not available', 'warning');
      }
    } else {
      this.showToast('PiP not supported in this browser', 'warning');
    }
  }

  getModeLabel() {
    const mode = document.body.className.match(/mode-(\w+)/);
    if (!mode) return 'Focus';
    const labels = { focus: 'Focus', shortBreak: 'Short Break', longBreak: 'Long Break' };
    return labels[mode[1]] || 'Focus';
  }

  // --- Alarm ---

  playAlarm() {
    try {
      const saved = JSON.parse(localStorage.getItem('ct_settings'));
      if (saved && saved.audio && saved.audio.alarmSound === 'none') return;

      const alarm = document.getElementById('alarmSound');
      const vol = (saved && saved.audio && saved.audio.alarmVolume) || 80;

      // Pick alarm source
      const alarmSounds = {
        chime: 'https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae5be.mp3',
        bell: 'https://cdn.pixabay.com/audio/2022/03/10/audio_d0c0e32fb6.mp3',
        digital: 'https://cdn.pixabay.com/audio/2022/03/24/audio_4110410cc1.mp3'
      };

      const soundKey = (saved && saved.audio && saved.audio.alarmSound) || 'chime';
      if (alarmSounds[soundKey]) {
        alarm.src = alarmSounds[soundKey];
        alarm.volume = vol / 100;
        alarm.play().catch(() => {});
      }
    } catch { /* skip */ }
  }

  // --- Notifications ---

  sendNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '' });
    }
  }

  requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // --- Event Binding ---

  bindEvents() {
    // Panel buttons
    this.statsBtn.addEventListener('click', () => {
      if (this.activePanel === 'stats') {
        this.closePanel('stats');
      } else {
        this.openPanel('stats');
      }
    });

    this.closeStatsBtn.addEventListener('click', () => this.closePanel('stats'));
    this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    this.pipBtn.addEventListener('click', () => this.togglePiP());

    // Click outside modal to close
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) this.closePanel('settings');
    });

    // Bus events
    bus.on('ui:openPanel', (name) => this.openPanel(name));
    bus.on('ui:closePanel', (name) => this.closePanel(name));
    bus.on('ui:closeActive', () => this.closeActive());
    bus.on('ui:toggleFullscreen', () => this.toggleFullscreen());
    bus.on('ui:toast', ({ message, type }) => this.showToast(message, type));

    // Timer events
    bus.on('timer:complete', ({ mode }) => {
      this.fireConfetti();
      this.playAlarm();

      const msg = mode === 'focus' ? 'Focus complete! Time for a break.' : 'Break over! Ready to focus?';
      this.showToast(msg, 'success');
      this.sendNotification('ChillTimer', msg);

      // Glow flash
      const center = document.getElementById('timerCenter');
      center.classList.add('complete-flash');
      setTimeout(() => center.classList.remove('complete-flash'), 1000);
    });

    bus.on('timer:start', () => {
      this.requestNotificationPermission();
    });

    bus.on('stats:goalReached', () => {
      this.fireConfetti();
      this.showToast('Daily goal reached!', 'success');
    });

    bus.on('stats:newBest', () => {
      this.showToast('New personal best!', 'success');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.uiManager = new UIManager();
});
