/* ==============================================
   ChillTimer — Timer State Machine
   ============================================== */

class TimerManager {
  constructor() {
    // DOM
    this.display = document.getElementById('timerDisplay');
    this.startPauseBtn = document.getElementById('startPauseBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.skipBtn = document.getElementById('skipBtn');
    this.modeBtns = document.querySelectorAll('.mode-btn');
    this.sessionDots = document.getElementById('sessionDots');
    this.progressRing = document.getElementById('progressRing');

    // State
    this.state = 'idle'; // idle | running | paused
    this.currentMode = 'focus';
    this.timerId = null;
    this.sessionsCompleted = 0;

    // Load settings
    this.loadSettings();

    // Calculated
    this.timeLeft = this.durations[this.currentMode] * 60;
    this.totalTime = this.timeLeft;

    // Ring circumference: 2 * PI * r (r=108)
    this.circumference = 2 * Math.PI * 108;
    if (this.progressRing) {
      this.progressRing.style.strokeDasharray = this.circumference;
      this.progressRing.style.strokeDashoffset = this.circumference;
    }

    this.bindEvents();
    this.updateDisplay();
    this.updateDots();
    this.setBodyMode();
  }

  loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('ct_settings'));
      if (saved && saved.timer) {
        this.durations = {
          focus: saved.timer.focus || 25,
          shortBreak: saved.timer.short || 5,
          longBreak: saved.timer.long || 15
        };
        this.sessionsPerLong = saved.timer.sessionsPerLong || 4;
        this.autoStartBreak = saved.timer.autoStartBreak || false;
        this.autoStartFocus = saved.timer.autoStartFocus || false;
      } else {
        this.setDefaults();
      }
    } catch {
      this.setDefaults();
    }
  }

  setDefaults() {
    this.durations = { focus: 25, shortBreak: 5, longBreak: 15 };
    this.sessionsPerLong = 4;
    this.autoStartBreak = false;
    this.autoStartFocus = false;
  }

  bindEvents() {
    // Buttons
    this.startPauseBtn.addEventListener('click', () => this.toggleStart());
    this.resetBtn.addEventListener('click', () => this.reset());
    this.skipBtn.addEventListener('click', () => this.skip());

    // Mode tabs
    this.modeBtns.forEach(btn => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });

    // Bus events (commands from keyboard/UI)
    bus.on('timer:toggleStart', () => this.toggleStart());
    bus.on('timer:requestReset', () => this.reset());
    bus.on('timer:requestSkip', () => this.skip());
    bus.on('timer:setMode', (mode) => this.setMode(mode));
    bus.on('settings:change', () => {
      this.loadSettings();
      if (this.state === 'idle') {
        this.timeLeft = this.durations[this.currentMode] * 60;
        this.totalTime = this.timeLeft;
        this.updateDisplay();
        this.updateDots();
      }
    });
  }

  toggleStart() {
    if (this.state === 'running') {
      this.pause();
    } else {
      this.start();
    }
  }

  start() {
    if (this.state === 'running') return;

    this.state = 'running';
    this.display.classList.add('running');
    this.startPauseBtn.textContent = 'Pause';

    bus.emit('timer:start', { mode: this.currentMode });

    this.timerId = setInterval(() => this.tick(), 1000);
  }

  pause() {
    if (this.state !== 'running') return;

    this.state = 'paused';
    this.display.classList.remove('running');
    this.startPauseBtn.textContent = 'Resume';
    clearInterval(this.timerId);
    this.timerId = null;

    bus.emit('timer:pause', { mode: this.currentMode });
  }

  reset() {
    clearInterval(this.timerId);
    this.timerId = null;
    this.state = 'idle';
    this.display.classList.remove('running');

    this.timeLeft = this.durations[this.currentMode] * 60;
    this.totalTime = this.timeLeft;

    this.updateDisplay();
    this.updateProgress(0);
    this.updateButtonLabel();
    this.updateTitle('ChillTimer');

    bus.emit('timer:reset', { mode: this.currentMode });
  }

  skip() {
    clearInterval(this.timerId);
    this.timerId = null;
    this.state = 'idle';
    this.display.classList.remove('running');

    this.advanceMode();
  }

  tick() {
    this.timeLeft--;

    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.complete();
      return;
    }

    this.updateDisplay();

    // Progress
    const elapsed = this.totalTime - this.timeLeft;
    const pct = elapsed / this.totalTime;
    this.updateProgress(pct);

    // Title
    const mins = String(Math.floor(this.timeLeft / 60)).padStart(2, '0');
    const secs = String(this.timeLeft % 60).padStart(2, '0');
    const modeLabel = this.currentMode === 'focus' ? 'Focus'
      : this.currentMode === 'shortBreak' ? 'Break'
      : 'Long Break';
    this.updateTitle(`${mins}:${secs} - ${modeLabel} | ChillTimer`);

    bus.emit('timer:tick', { timeLeft: this.timeLeft, mode: this.currentMode });
  }

  complete() {
    clearInterval(this.timerId);
    this.timerId = null;
    this.state = 'idle';
    this.display.classList.remove('running');

    this.updateDisplay();
    this.updateProgress(1);

    // Track session
    if (this.currentMode === 'focus') {
      this.sessionsCompleted++;
      this.updateDots();
    }

    bus.emit('timer:complete', {
      mode: this.currentMode,
      duration: this.durations[this.currentMode]
    });

    // Auto advance after short delay
    const shouldAutoStart = this.currentMode === 'focus'
      ? this.autoStartBreak
      : this.autoStartFocus;

    setTimeout(() => {
      this.advanceMode();
      if (shouldAutoStart) {
        this.start();
      }
    }, 2000);
  }

  advanceMode() {
    if (this.currentMode === 'focus') {
      // Check if long break needed
      if (this.sessionsCompleted > 0 && this.sessionsCompleted % this.sessionsPerLong === 0) {
        this.setMode('longBreak');
      } else {
        this.setMode('shortBreak');
      }
    } else {
      this.setMode('focus');
    }
  }

  setMode(mode) {
    if (!this.durations[mode]) return;

    // Stop current timer
    clearInterval(this.timerId);
    this.timerId = null;
    this.state = 'idle';
    this.display.classList.remove('running');

    this.currentMode = mode;
    this.timeLeft = this.durations[mode] * 60;
    this.totalTime = this.timeLeft;

    // Update UI
    this.modeBtns.forEach(btn => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive);
    });

    this.setBodyMode();
    this.updateDisplay();
    this.updateProgress(0);
    this.updateButtonLabel();
    this.updateTitle('ChillTimer');

    bus.emit('timer:modeChange', { mode });
  }

  setBodyMode() {
    document.body.classList.remove('mode-focus', 'mode-shortBreak', 'mode-longBreak');
    document.body.classList.add(`mode-${this.currentMode}`);
  }

  updateDisplay() {
    const mins = String(Math.floor(this.timeLeft / 60)).padStart(2, '0');
    const secs = String(this.timeLeft % 60).padStart(2, '0');
    this.display.textContent = `${mins}:${secs}`;
  }

  updateProgress(pct) {
    if (!this.progressRing) return;
    const offset = this.circumference - (pct * this.circumference);
    this.progressRing.style.strokeDashoffset = offset;
  }

  updateDots() {
    if (!this.sessionDots) return;
    const total = this.sessionsPerLong;
    const completed = this.sessionsCompleted % total;

    // Rebuild dots
    this.sessionDots.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span');
      dot.className = 'dot' + (i < completed ? ' filled' : '');
      dot.setAttribute('aria-hidden', 'true');
      this.sessionDots.appendChild(dot);
    }
  }

  updateButtonLabel() {
    const labels = {
      focus: 'Start Focus',
      shortBreak: 'Start Break',
      longBreak: 'Start Break'
    };
    this.startPauseBtn.textContent = labels[this.currentMode];
  }

  updateTitle(title) {
    document.title = title;
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  window.timerManager = new TimerManager();
});
