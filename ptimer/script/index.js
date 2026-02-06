/**
 * ETimer (Formerly P-Timer)
 * Modern Pomodoro Timer with Vanta.js, Sidebar Playlist, and Encouragement.
 */

document.addEventListener('DOMContentLoaded', () => {
    const app = new PomodoroApp();
    app.init();
});

class PomodoroApp {
    constructor() {
        // --- 1. Audio Data ---
        this.trackList = [
            { title: "Lofi: Ipanema Daydream", url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Ipanema%20Daydream.mp3", type: "focus" },
            { title: "Ambient: NASA Space", url: "https://archive.org/download/SymphoniesOfThePlanets/1%20NASA%20Voyager%20Space%20Sounds.mp3", type: "focus" },
            { title: "Jazz: Lobby Time", url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Lobby%20Time.mp3", type: "break" },
            { title: "Piano: Gymnopedie No.1", url: "https://ia800501.us.archive.org/3/items/ErikSatieGymnopedieNo1/ErikSatieGymnopedieNo1.mp3", type: "break" },
            { title: "Nature: Forest Rain", url: "https://assets.mixkit.co/sfx/preview/mixkit-light-rain-loop-2393.mp3", type: "focus" }
        ];

        // --- 2. DOM Elements ---
        this.timeDisplay = document.getElementById('timeDisplay');
        this.startPauseBtn = document.getElementById('startPauseBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.modeBtns = document.querySelectorAll('.mode-btn');
        this.taskInput = document.getElementById('taskInput');
        this.encouragementDisplay = document.getElementById('encouragementDisplay');
        this.playlistContainer = document.getElementById('playlistContainer');
        
        // Settings & Modal
        this.settingsBtn = document.getElementById('settingsBtn');
        this.closeSettingsBtn = document.getElementById('closeSettingsBtn');
        this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
        this.settingsModal = document.getElementById('settingsModal');
        this.inputs = {
            pomo: document.getElementById('settingPomo'),
            short: document.getElementById('settingShort'),
            long: document.getElementById('settingLong')
        };
        this.separateMusicToggle = document.getElementById('separateMusicToggle');
        this.focusMusicSelect = document.getElementById('focusMusicSelect');
        this.breakMusicSelect = document.getElementById('breakMusicSelect');
        this.breakMusicWrap = document.getElementById('breakMusicSelectWrap');

        // FAQ & ToS
        this.faqBtn = document.getElementById('faqBtn');
        this.faqModal = document.getElementById('faqModal');
        this.closeFaqBtn = document.getElementById('closeFaqBtn');
        this.tosLink = document.getElementById('tosLink');
        this.tosModal = document.getElementById('tosModal');
        this.closeTosBtn = document.getElementById('closeTosBtn');

        // Visuals & Nav
        this.cdDisk = document.getElementById('cdDisk');
        this.trackNameDisplay = document.getElementById('trackNameDisplay');
        this.prevTrackBtn = document.getElementById('prevTrackBtn');
        this.nextTrackBtn = document.getElementById('nextTrackBtn');

        this.themeToggle = document.getElementById('themeToggle'); // May not exist in new design
        this.bgToggle = document.getElementById('bgToggle'); // May not exist in new design
        this.pipBtn = document.getElementById('pipBtn');
        this.fsBtn = document.getElementById('fsBtn');
        this.vantaContainer = document.getElementById('vanta-bg');
        this.videoContainer = document.getElementById('video-bg'); // May not exist in new design
        
        // Audio Elements
        this.bgMusic = document.getElementById('bgMusic');
        this.soundRain = document.getElementById('soundRain');
        this.soundCafe = document.getElementById('soundCafe');
        this.alarmSound = document.getElementById('alarmSound');
        
        // Mixer
        this.soundToggles = document.querySelectorAll('.sound-toggle');
        this.volumeSliders = document.querySelectorAll('.volume-slider');

        // --- 3. State & Defaults ---
        const savedTime = JSON.parse(localStorage.getItem('ptimer_times')) || { pomodoro: 25, shortBreak: 5, longBreak: 15 };
        
        this.modes = {
            pomodoro: { time: savedTime.pomodoro, color: '#ff6b6b' },
            shortBreak: { time: savedTime.shortBreak, color: '#4ecdc4' },
            longBreak: { time: savedTime.longBreak, color: '#ffe66d' }
        };
        
        this.currentMode = 'pomodoro';
        this.timeLeft = this.modes.pomodoro.time * 60;
        this.isRunning = false;
        this.timerId = null;
        this.vantaEffect = null;
        
        // Audio State
        this.currentTrackIndex = 0;
        this.separateMusic = localStorage.getItem('ptimer_separate_music') === 'true';
        this.selectedFocusTrack = parseInt(localStorage.getItem('ptimer_focus_track')) || 0;
        this.selectedBreakTrack = parseInt(localStorage.getItem('ptimer_break_track')) || 2; 

        // Preferences
        this.bgMode = localStorage.getItem('ptimer_bg') || 'vanta';
        this.theme = localStorage.getItem('ptimer_theme') || 'light';
    }

    init() {
        this.applyTheme();
        
        // Initialize background - Always Vanta/Warm
        this.initVanta();
        
        this.setupEventListeners();
        this.updateDisplay();
        this.renderPlaylist();
        this.initTyped();
        
        // Init Audio Volume
        this.bgMusic.volume = 0.5;
        this.soundRain.volume = 0.5;
        this.soundCafe.volume = 0.5;
        
        // Initial Splash Screen
        this.initSplashScreen();

        // Load initial track state logic
        this.initTrackState();
        this.loadTrack(this.currentTrackIndex, false); // False = don't auto play
        
        // Remove auto-request on init to avoid blocking/spamming. 
        // We will move this to a user gesture action (Unlock).
    }

    // --- New Features ---

    initTyped() {
        if (window.Typed) {
            new Typed('#encouragementDisplay', {
                strings: [
                    "You are doing great!",
                    "One step at a time.",
                    "Stay focused.",
                    "Make it happen.",
                    "Breathe in, breathe out."
                ],
                typeSpeed: 80, 
                backSpeed: 50, 
                backDelay: 5000, 
                loop: true,
                showCursor: false
            });
        } else {
            this.encouragementDisplay.textContent = "What are you working on?";
        }
    }

    // --- Splash / Lock Screen Interaction ---
    initSplashScreen() {
        const splash = document.getElementById('splashScreen');
        if (!splash) return;

        let startY = 0;
        let isDragging = false;
        
        const unlock = () => {
            splash.style.transition = 'transform 0.5s ease-in, opacity 0.5s';
            splash.style.transform = 'translateY(-100%)';
            splash.style.opacity = '0';
            
            setTimeout(() => {
                splash.classList.add('hidden');
                splash.style.display = 'none'; 
            }, 500);

            this.bgMusic.play().catch(()=>{});
            
            const notifAsked = localStorage.getItem('etimer_notif_asked');
            if ("Notification" in window && Notification.permission === "default" && !notifAsked) {
                Notification.requestPermission().then(() => {
                    localStorage.setItem('etimer_notif_asked', 'true');
                });
            }
        };

        const reset = () => {
             splash.style.transition = 'transform 0.3s ease-out, opacity 0.3s';
             splash.style.transform = 'translateY(0)';
             splash.style.opacity = '1';
        };

        const getClientY = (e) => {
            return (e.touches && e.touches.length > 0) ? e.touches[0].clientY : 
                   (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches[0].clientY : e.clientY;
        };

        const onPointerDown = (e) => {
            if (e.type === 'mousedown' && e.button !== 0) return;
            isDragging = true;
            startY = getClientY(e);
            splash.style.transition = 'none';
        };

        const onPointerMove = (e) => {
            if (!isDragging) return;
            if (e.cancelable && e.type === 'touchmove') e.preventDefault();

            const currentY = getClientY(e);
            const diff = startY - currentY;
            
            if (diff > 0) {
                splash.style.transform = `translateY(-${diff}px)`;
                splash.style.opacity = Math.max(0.4, 1 - (diff / window.innerHeight));
            }
        };

        const onPointerUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            
            const endY = getClientY(e);
            const diff = startY - endY;
            
            if (diff > 100 || diff > window.innerHeight * 0.2) { // Made easier to unlock
                unlock();
            } else {
                reset();
            }
        };
        
        const onPointerLeave = () => {
            if (isDragging) {
                isDragging = false;
                reset();
            }
        };

        // Touch
        const opts = {passive: false};
        splash.addEventListener('touchstart', onPointerDown, opts);
        splash.addEventListener('touchmove', onPointerMove, opts);
        splash.addEventListener('touchend', onPointerUp);
        splash.addEventListener('touchcancel', onPointerLeave);

        // Mouse
        splash.addEventListener('mousedown', onPointerDown);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);
        document.addEventListener('mouseleave', onPointerLeave); // Catch leaving window
    }

    renderPlaylist() {
        this.playlistContainer.innerHTML = '';
        this.trackList.forEach((track, index) => {
            const item = document.createElement('div');
            item.className = `track-item ${index === this.currentTrackIndex ? 'active' : ''}`;
            item.innerHTML = `
                <div class="track-icon"><i class="fas ${index === this.currentTrackIndex ? 'fa-volume-up' : 'fa-music'}"></i></div>
                <div class="track-info">${track.title}</div>
            `;
            item.addEventListener('click', () => {
                this.loadTrack(index, true); // True = auto play on click
            });
            this.playlistContainer.appendChild(item);
        });
    }

    updatePlaylistUI() {
        const items = this.playlistContainer.querySelectorAll('.track-item');
        items.forEach((item, index) => {
            if (index === this.currentTrackIndex) {
                item.classList.add('active');
                item.querySelector('.track-icon i').className = 'fas fa-volume-up';
            } else {
                item.classList.remove('active');
                item.querySelector('.track-icon i').className = 'fas fa-music';
            }
        });
    }

    // --- Data & Logic Setup ---

    initTrackState() {
        if (this.separateMusic) {
            this.currentTrackIndex = (this.currentMode === 'pomodoro') ? this.selectedFocusTrack : this.selectedBreakTrack;
        } else {
            this.currentTrackIndex = this.selectedFocusTrack;
        }
    }

    loadTrack(index, autoPlay = false) {
        if(index < 0) index = this.trackList.length - 1;
        if(index >= this.trackList.length) index = 0;
        
        this.currentTrackIndex = index;
        const track = this.trackList[this.currentTrackIndex];
        
        this.bgMusic.src = track.url;
        this.trackNameDisplay.textContent = track.title;
        this.updatePlaylistUI();

        if (autoPlay || this.isRunning || this.cdDisk.classList.contains('playing')) {
            this.bgMusic.play().catch(e => console.log("Auto-play prevented:", e));
            this.cdDisk.classList.add('playing');
        } else {
            this.cdDisk.classList.remove('playing');
        }
    }

    // --- Event Listeners ---

    setupEventListeners() {
        this.startPauseBtn.addEventListener('click', () => this.toggleTimer());
        this.resetBtn.addEventListener('click', () => this.resetTimer());

        // Mode Switching
        this.modeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // e.target might be the icon, so use currentTarget or closest
                const target = e.currentTarget; 
                this.switchMode(target.dataset.mode);
            });
        });

        // Player Controls
        // CD Click
        this.cdDisk.parentElement.addEventListener('click', () => this.toggleMusic());
        // Mini buttons
        this.prevTrackBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.loadTrack(this.currentTrackIndex - 1, true);
        });
        this.nextTrackBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.loadTrack(this.currentTrackIndex + 1, true);
        });

        // Settings
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        this.separateMusicToggle.addEventListener('change', (e) => {
            this.separateMusic = e.target.checked;
            this.toggleBreakSelectState();
        });

        // Tools
        if(this.themeToggle) this.themeToggle.addEventListener('click', () => this.toggleTheme());
        if(this.bgToggle) this.bgToggle.addEventListener('click', () => this.toggleBackgroundMode());
        if(this.pipBtn) this.pipBtn.addEventListener('click', () => this.togglePiP());
        if(this.fsBtn) this.fsBtn.addEventListener('click', () => this.toggleFullScreen());

        // FAQ & ToS
        this.faqBtn.addEventListener('click', () => this.openFaq());
        this.closeFaqBtn.addEventListener('click', () => this.closeFaq());
        this.tosLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.openTos();
        });
        this.closeTosBtn.addEventListener('click', () => this.closeTos());

        // Mixer
        this.soundToggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                const btn = e.target.closest('.sound-toggle');
                const soundType = btn.dataset.sound;
                this.toggleAmbience(soundType, btn);
            });
        });

        this.volumeSliders.forEach(slider => {
            slider.addEventListener('input', (e) => {
                const targetSound = e.target.dataset.target;
                const vol = e.target.value / 100;
                if(targetSound === 'rain') this.soundRain.volume = vol;
                if(targetSound === 'cafe') this.soundCafe.volume = vol;
            });
        });

        window.addEventListener('click', (e) => {
            if (e.target == this.settingsModal) this.closeSettings();
            if (e.target == this.faqModal) this.closeFaq();
            if (e.target == this.tosModal) this.closeTos();
        });
    }

    // --- Core Logic ---

    switchMode(mode) {
        if (this.currentMode === mode) return; // Don't reload if same

        this.currentMode = mode;
        this.pauseTimer();
        
        // Set time
        const timeInMinutes = this.modes[mode].time;
        this.timeLeft = timeInMinutes * 60;
        
        // UI
        this.modeBtns.forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`[data-mode="${mode}"]`);
        if(activeBtn) activeBtn.classList.add('active');
        
        document.documentElement.style.setProperty('--primary-color', this.modes[mode].color);
        
        this.fixTrackForMode();
        this.updateDisplay();
    }

    fixTrackForMode() {
        let targetIndex = this.selectedFocusTrack;
        if (this.separateMusic) {
            targetIndex = (this.currentMode === 'shortBreak' || this.currentMode === 'longBreak') 
                ? this.selectedBreakTrack 
                : this.selectedFocusTrack;
        }
        
        // Only auto switch if not already playing that track
        if (this.currentTrackIndex !== targetIndex) {
            // Retrieve auto-play preference? For now, we just load it ready to play.
            // If timer was running, we might want to auto play.
            this.loadTrack(targetIndex, this.isRunning);
        }
    }

    // --- Background & Visuals ---

    toggleBackgroundMode() {
         // Feature disabled - Single warm theme enforced
         console.log("Bg toggle disabled");
    }
    
    initVanta() {
        if (window.VANTA) {
            if (this.vantaEffect) {
                this.vantaEffect.destroy();
                this.vantaEffect = null;
            }

            try {
                this.vantaEffect = window.VANTA.FOG({
                    el: "#vanta-bg",
                    mouseControls: true, touchControls: true, gyroControls: false,
                    minHeight: 200.00, minWidth: 200.00,
                    highlightColor: 0xffeebb, // Warm sunlight
                    midtoneColor: 0xffca7b,   // Golden hour
                    lowlightColor: 0xff8c69,  // Sunset orange
                    baseColor: 0xffffff,
                    blurFactor: 0.6, zoom: 0.8,
                    speed: 1.2
                });
            } catch (e) { console.error("Vanta init error", e); }
        }
        this.updateBackgroundVisibility();
    }

    updateBackgroundVisibility() {
        if(!this.videoContainer) {
            // Video element removed in redesign, only use Vanta
            if(this.vantaContainer) this.vantaContainer.classList.remove('hidden');
            return;
        }
        
        const video = this.videoContainer.querySelector('video');
        
        if (this.bgMode === 'vanta') {
            this.vantaContainer.classList.remove('hidden');
            this.videoContainer.classList.add('hidden');
            if(video) {
                video.pause();
                video.currentTime = 0;
            }
        } else {
            // Switching to video mode
            this.vantaContainer.classList.add('hidden');
            if(this.vantaEffect) {
                this.vantaEffect.destroy();
                this.vantaEffect = null;
            }
            this.videoContainer.classList.remove('hidden');
            
            if(video) {
                // Force load and play
                video.muted = true;
                video.load();
                
                // Use setTimeout to ensure DOM is ready
                setTimeout(() => {
                    const playPromise = video.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(error => {
                            console.log("Video play error:", error);
                            // Try again with user interaction
                            document.addEventListener('click', () => {
                                video.play().catch(e => console.log("Retry failed:", e));
                            }, { once: true });
                        });
                    }
                }, 200);
            }
        }
    }

    // --- Timer Engine ---

    toggleTimer() { this.isRunning ? this.pauseTimer() : this.startTimer(); }

    startTimer() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.startPauseBtn.textContent = 'Pause';
        this.startPauseBtn.classList.add('paused'); 
        
        if (this.cdDisk.classList.contains('playing') || !this.bgMusic.paused) {
             this.bgMusic.play().catch(() => {});
             this.cdDisk.classList.add('playing');
        } else {
            // Optional: Start music on timer start if user wants?
            // For now, respect manual play/pause.
        }
        
        this.timerId = setInterval(() => this.tick(), 1000);
    }

    pauseTimer() {
        this.isRunning = false;
        this.startPauseBtn.textContent = 'Start';
        this.startPauseBtn.classList.remove('paused');
        clearInterval(this.timerId);
        // We pause music on pause? Debateable. Let's pause it for "Focus" feeling.
        this.bgMusic.pause();
        this.cdDisk.classList.remove('playing');
    }

    resetTimer() {
        this.pauseTimer();
        this.timeLeft = this.modes[this.currentMode].time * 60;
        this.updateDisplay();
    }

    tick() {
        if (this.timeLeft > 0) {
            this.timeLeft--;
            this.updateDisplay();
        } else {
            this.completeTimer();
        }
    }

    completeTimer() {
        this.pauseTimer();
        this.alarmSound.play();
        if(window.confetti) window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        if (Notification.permission === "granted") new Notification("ETimer Finished!", { body: "Time is up!", icon: "../favicon.ico" });
    }

    updateDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.timeDisplay.textContent = timeString;
        document.title = `${timeString} - ${this.currentMode} | ETimer`;
    }

    toggleMusic() {
        if (this.bgMusic.paused) {
            this.bgMusic.play()
                .then(() => this.cdDisk.classList.add('playing'))
                .catch(e => {
                    console.log("Playback prevented:", e);
                    // Silent fail - user has already interacted via splash
                });
        } else {
            this.bgMusic.pause();
            this.cdDisk.classList.remove('playing');
        }
        this.updatePlaylistUI();
    }
    
    toggleAmbience(type, btnElement) {
        const audio = type === 'rain' ? this.soundRain : this.soundCafe;
        if (audio.paused) { 
            audio.play()
                .then(() => btnElement.classList.add('active'))
                .catch(e => console.log('Ambience play prevented:', e));
        }
        else { 
            audio.pause(); 
            btnElement.classList.remove('active'); 
        }
    }

    // --- Settings & Utils ---
    
    openSettings() { 
        this.populateSettings();
        this.settingsModal.classList.add('open'); 
    }
    closeSettings() { this.settingsModal.classList.remove('open'); }

    // FAQ & ToS Modals
    openFaq() { this.faqModal.classList.add('open'); }
    closeFaq() { this.faqModal.classList.remove('open'); }
    openTos() { this.tosModal.classList.add('open'); }
    closeTos() { this.tosModal.classList.remove('open'); }

    populateSettings() {
        this.inputs.pomo.value = this.modes.pomodoro.time;
        this.inputs.short.value = this.modes.shortBreak.time;
        this.inputs.long.value = this.modes.longBreak.time;
        
        this.focusMusicSelect.innerHTML = '';
        this.breakMusicSelect.innerHTML = '';

        this.trackList.forEach((track, index) => {
            const option = new Option(track.title, index);
            this.focusMusicSelect.add(option.cloneNode(true));
            this.breakMusicSelect.add(option);
        });

        this.focusMusicSelect.value = this.selectedFocusTrack;
        this.breakMusicSelect.value = this.selectedBreakTrack;
        this.separateMusicToggle.checked = this.separateMusic;
        this.toggleBreakSelectState();
    }

    toggleBreakSelectState() {
        if(this.separateMusic) this.breakMusicWrap.classList.remove('disabled');
        else this.breakMusicWrap.classList.add('disabled');
    }

    saveSettings() {
        const newTimes = {
            pomodoro: parseInt(this.inputs.pomo.value) || 25,
            shortBreak: parseInt(this.inputs.short.value) || 5,
            longBreak: parseInt(this.inputs.long.value) || 15
        };
        
        localStorage.setItem('ptimer_times', JSON.stringify(newTimes));
        
        this.modes.pomodoro.time = newTimes.pomodoro;
        this.modes.shortBreak.time = newTimes.shortBreak;
        this.modes.longBreak.time = newTimes.longBreak;
        
        // Update DOM buttons
        const pomoBtn = document.querySelector('[data-mode="pomodoro"]');
        if (pomoBtn) pomoBtn.dataset.time = newTimes.pomodoro;
        const shortBtn = document.querySelector('[data-mode="shortBreak"]');
        if (shortBtn) shortBtn.dataset.time = newTimes.shortBreak;
        const longBtn = document.querySelector('[data-mode="longBreak"]');
        if (longBtn) longBtn.dataset.time = newTimes.longBreak;

        this.separateMusic = this.separateMusicToggle.checked;
        this.selectedFocusTrack = parseInt(this.focusMusicSelect.value);
        this.selectedBreakTrack = parseInt(this.breakMusicSelect.value);

        localStorage.setItem('ptimer_separate_music', this.separateMusic);
        localStorage.setItem('ptimer_focus_track', this.selectedFocusTrack);
        localStorage.setItem('ptimer_break_track', this.selectedBreakTrack);

        if (!this.isRunning) this.fixTrackForMode();
        this.resetTimer(); 
        this.closeSettings();
    }

    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('ptimer_theme', this.theme);
        this.applyTheme();
        if (this.bgMode === 'vanta') this.initVanta();
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        if(this.themeToggle) {
            const icon = this.themeToggle.querySelector('i');
            if(icon) icon.className = this.theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }

    toggleFullScreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log(`Error attempting to enable fullscreen: ${err.message}`);
            });
            this.fsBtn.innerHTML = '<i class="fas fa-compress"></i>';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                this.fsBtn.innerHTML = '<i class="fas fa-expand"></i>';
            }
        }
    }
    
    async togglePiP() {
        // Picture in Picture implementation with fallback
        if ('documentPictureInPicture' in window) {
            try {
                const pipWindow = await window.documentPictureInPicture.requestWindow({ 
                    width: 400, 
                    height: 250 
                });
                
                // Style the PiP window
                const style = pipWindow.document.createElement('style');
                style.textContent = `
                    body {
                        margin: 0;
                        padding: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        font-family: 'Nunito', sans-serif;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        color: white;
                    }
                    .pip-timer {
                        font-size: 4rem;
                        font-weight: 800;
                        text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
                        letter-spacing: -2px;
                    }
                    .pip-mode {
                        font-size: 1rem;
                        opacity: 0.8;
                        text-transform: uppercase;
                        letter-spacing: 2px;
                        margin-top: 0.5rem;
                    }
                `;
                pipWindow.document.head.appendChild(style);
                
                const container = pipWindow.document.createElement('div');
                container.innerHTML = `
                    <div class="pip-timer">${this.timeDisplay.textContent}</div>
                    <div class="pip-mode">${this.currentMode}</div>
                `;
                pipWindow.document.body.appendChild(container);
                
                // Sync loop
                const interval = setInterval(() => {
                    if (pipWindow.closed) {
                        clearInterval(interval);
                    } else {
                        const timerEl = pipWindow.document.querySelector('.pip-timer');
                        const modeEl = pipWindow.document.querySelector('.pip-mode');
                        if (timerEl) timerEl.textContent = this.timeDisplay.textContent;
                        if (modeEl) modeEl.textContent = this.currentMode;
                    }
                }, 100);
                
                pipWindow.addEventListener('pagehide', () => clearInterval(interval));
            } catch (error) {
                console.error('PiP failed:', error);
                alert("Picture-in-Picture failed. Please try again or use a different browser.");
            }
        } else {
            // Fallback: open in new window
            const width = 400;
            const height = 250;
            const left = (screen.width - width) / 2;
            const top = (screen.height - height) / 2;
            
            const pipWindow = window.open(
                '', 
                'ETimer PiP', 
                `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,status=no,menubar=no,toolbar=no`
            );
            
            if (pipWindow) {
                pipWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>ETimer - ${this.currentMode}</title>
                        <style>
                            body {
                                margin: 0;
                                padding: 0;
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                font-family: 'Nunito', sans-serif;
                                display: flex;
                                flex-direction: column;
                                justify-content: center;
                                align-items: center;
                                height: 100vh;
                                color: white;
                            }
                            .pip-timer {
                                font-size: 3.5rem;
                                font-weight: 800;
                                text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
                                letter-spacing: -2px;
                            }
                            .pip-mode {
                                font-size: 0.9rem;
                                opacity: 0.8;
                                text-transform: uppercase;
                                letter-spacing: 2px;
                                margin-top: 0.5rem;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="pip-timer" id="pipTimer">${this.timeDisplay.textContent}</div>
                        <div class="pip-mode" id="pipMode">${this.currentMode}</div>
                    </body>
                    </html>
                `);
                pipWindow.document.close();
                
                // Sync loop
                const interval = setInterval(() => {
                    if (pipWindow.closed) {
                        clearInterval(interval);
                    } else {
                        const timerEl = pipWindow.document.getElementById('pipTimer');
                        const modeEl = pipWindow.document.getElementById('pipMode');
                        if (timerEl) timerEl.textContent = this.timeDisplay.textContent;
                        if (modeEl) modeEl.textContent = this.currentMode;
                    }
                }, 100);
            } else {
                alert("Please allow popups to use Picture-in-Picture mode.");
            }
        }
    }
}
