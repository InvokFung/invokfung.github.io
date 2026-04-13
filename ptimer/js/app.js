/* ==============================================
   ChillTimer — App Entry Point & Event Bus
   ============================================== */

class EventBus {
  constructor() {
    this._listeners = {};
  }

  on(event, fn) {
    (this._listeners[event] ||= []).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const list = this._listeners[event];
    if (list) this._listeners[event] = list.filter(f => f !== fn);
  }

  emit(event, data) {
    const list = this._listeners[event];
    if (list) list.forEach(fn => fn(data));
  }
}

// Global event bus
window.bus = new EventBus();

// Slider fill color helper (Webkit doesn't support range-progress)
function updateSliderFill(slider) {
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const val = parseFloat(slider.value) || 0;
  const pct = ((val - min) / (max - min)) * 100;
  const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim();
  slider.style.background = `linear-gradient(to right, ${accent} 0%, ${accent} ${pct}%, rgba(255,255,255,0.12) ${pct}%, rgba(255,255,255,0.12) 100%)`;
}

function initAllSliders() {
  document.querySelectorAll('input[type="range"]').forEach(slider => {
    updateSliderFill(slider);
    slider.addEventListener('input', () => updateSliderFill(slider));
  });
}

// Re-color sliders when mode changes (accent color changes)
function refreshSliderFills() {
  // Small delay for CSS variables to update
  requestAnimationFrame(() => {
    document.querySelectorAll('input[type="range"]').forEach(updateSliderFill);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Init slider fills
  initAllSliders();

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Skip when typing in inputs
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        bus.emit('timer:toggleStart');
        break;
      case 'KeyR':
        bus.emit('timer:requestReset');
        break;
      case 'KeyS':
        bus.emit('timer:requestSkip');
        break;
      case 'KeyM':
        bus.emit('player:toggleMute');
        break;
      case 'KeyF':
        bus.emit('ui:toggleFullscreen');
        break;
      case 'Digit1':
        bus.emit('timer:setMode', 'focus');
        break;
      case 'Digit2':
        bus.emit('timer:setMode', 'shortBreak');
        break;
      case 'Digit3':
        bus.emit('timer:setMode', 'longBreak');
        break;
      case 'Escape':
        bus.emit('ui:closeActive');
        break;
    }
  });

  // Refresh slider fills on mode change
  bus.on('timer:modeChange', () => refreshSliderFills());
});
