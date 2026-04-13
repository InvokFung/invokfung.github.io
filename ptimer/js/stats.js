/* ==============================================
   ChillTimer — Stats & Streaks
   ============================================== */

class StatsManager {
  constructor() {
    // DOM
    this.statSessions = document.getElementById('statSessions');
    this.statMinutes = document.getElementById('statMinutes');
    this.streakCount = document.getElementById('streakCount');
    this.statBest = document.getElementById('statBest');
    this.goalProgress = document.getElementById('goalProgress');
    this.dailyProgressBar = document.getElementById('dailyProgressBar');
    this.weeklyChart = document.getElementById('weeklyChart');
    this.weeklyLabels = document.getElementById('weeklyLabels');
    this.totalSessionsEl = document.getElementById('totalSessions');
    this.totalHoursEl = document.getElementById('totalHours');

    // Load data
    this.data = this.load();

    // Check day rollover
    this.checkDayRollover();

    // Render initial
    this.render();

    // Events
    bus.on('timer:complete', ({ mode, duration }) => {
      if (mode === 'focus') {
        this.recordSession(duration);
      }
    });
  }

  // --- Persistence ---

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem('ct_stats'));
      if (saved) return saved;
    } catch { /* fallthrough */ }

    return this.defaultData();
  }

  defaultData() {
    return {
      today: { sessions: 0, minutes: 0, date: this.todayStr() },
      streak: { count: 0, lastDate: '' },
      history: [],
      bestDay: { date: '', minutes: 0 },
      totalSessions: 0,
      totalMinutes: 0
    };
  }

  save() {
    localStorage.setItem('ct_stats', JSON.stringify(this.data));
  }

  todayStr() {
    return new Date().toISOString().split('T')[0];
  }

  yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  // --- Day Rollover ---

  checkDayRollover() {
    const today = this.todayStr();
    if (this.data.today.date !== today) {
      // Save yesterday to history if had data
      if (this.data.today.sessions > 0) {
        this.data.history.unshift({
          date: this.data.today.date,
          sessions: this.data.today.sessions,
          minutes: this.data.today.minutes
        });
        // Trim to 90 days
        if (this.data.history.length > 90) {
          this.data.history = this.data.history.slice(0, 90);
        }
      }

      // Update streak
      if (this.data.today.sessions > 0) {
        // Had sessions yesterday
        if (this.data.streak.lastDate === this.data.today.date ||
            this.data.streak.lastDate === this.yesterdayStr()) {
          // streak continues
        } else if (this.data.today.date === this.yesterdayStr()) {
          // The stored "today" was actually yesterday
          this.data.streak.count++;
          this.data.streak.lastDate = this.data.today.date;
        }
      }

      // Check streak break
      if (this.data.streak.lastDate &&
          this.data.streak.lastDate !== today &&
          this.data.streak.lastDate !== this.yesterdayStr()) {
        this.data.streak.count = 0;
      }

      // Reset today
      this.data.today = { sessions: 0, minutes: 0, date: today };
      this.save();
    }
  }

  // --- Record Session ---

  recordSession(durationMinutes) {
    const today = this.todayStr();

    // Update today
    this.data.today.sessions++;
    this.data.today.minutes += durationMinutes;
    this.data.today.date = today;

    // Update totals
    this.data.totalSessions++;
    this.data.totalMinutes += durationMinutes;

    // Update streak
    if (this.data.streak.lastDate !== today) {
      if (this.data.streak.lastDate === this.yesterdayStr() || this.data.streak.count === 0) {
        this.data.streak.count++;
      } else if (this.data.streak.lastDate !== today) {
        this.data.streak.count = 1;
      }
      this.data.streak.lastDate = today;
    }

    // Check best day
    if (this.data.today.minutes > this.data.bestDay.minutes) {
      const isNew = this.data.bestDay.minutes > 0;
      this.data.bestDay = { date: today, minutes: this.data.today.minutes };
      if (isNew) bus.emit('stats:newBest');
    }

    // Check daily goal
    const goal = this.getDailyGoal();
    if (this.data.today.minutes >= goal && (this.data.today.minutes - durationMinutes) < goal) {
      bus.emit('stats:goalReached');
    }

    this.save();
    this.render();
  }

  getDailyGoal() {
    try {
      const saved = JSON.parse(localStorage.getItem('ct_settings'));
      return (saved && saved.timer && saved.timer.dailyGoal) || 120;
    } catch { return 120; }
  }

  // --- Weekly Data ---

  getWeekData() {
    const days = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en', { weekday: 'short' }).slice(0, 2);

      let minutes = 0;
      if (dateStr === this.data.today.date) {
        minutes = this.data.today.minutes;
      } else {
        const hist = this.data.history.find(h => h.date === dateStr);
        if (hist) minutes = hist.minutes;
      }

      days.push({ date: dateStr, dayName, minutes, isToday: i === 0 });
    }

    return days;
  }

  // --- Render ---

  render() {
    // Today stats
    this.statSessions.textContent = this.data.today.sessions;
    this.statMinutes.textContent = this.data.today.minutes;
    this.streakCount.textContent = this.data.streak.count;
    this.statBest.textContent = this.data.bestDay.minutes;

    // Streak fire animation
    const statsPanel = document.getElementById('statsPanel');
    if (this.data.streak.count >= 3) {
      statsPanel.classList.add('streak-fire');
    } else {
      statsPanel.classList.remove('streak-fire');
    }

    // Daily goal
    const goal = this.getDailyGoal();
    const pct = Math.min((this.data.today.minutes / goal) * 100, 100);
    this.goalProgress.textContent = `${this.data.today.minutes} / ${goal} min`;
    this.dailyProgressBar.style.width = pct + '%';

    // Totals
    this.totalSessionsEl.textContent = this.data.totalSessions;
    this.totalHoursEl.textContent = Math.round(this.data.totalMinutes / 60);

    // Weekly chart
    this.renderWeekly();
  }

  renderWeekly() {
    const week = this.getWeekData();
    const maxMin = Math.max(...week.map(d => d.minutes), 1);

    this.weeklyChart.innerHTML = '';
    this.weeklyLabels.innerHTML = '';

    week.forEach(day => {
      const bar = document.createElement('div');
      bar.className = 'weekly-bar' + (day.isToday ? ' today' : '');
      bar.style.height = Math.max((day.minutes / maxMin) * 100, 5) + '%';
      bar.title = `${day.date}: ${day.minutes} min`;
      this.weeklyChart.appendChild(bar);

      const label = document.createElement('span');
      label.textContent = day.dayName;
      this.weeklyLabels.appendChild(label);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.statsManager = new StatsManager();
});
