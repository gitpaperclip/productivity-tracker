'use strict';

const fs = require('fs');
const path = require('path');

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyDay(date) {
  return {
    date: date || todayKey(),
    byApp: {},
    byCategory: { productive: 0, unproductive: 0, other: 0 },
    unproductiveStreak: 0,
    lastReminderAt: 0
  };
}

function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, 'stats.json');
  const settingsPath = path.join(dataDir, 'settings.json');

  let state = loadJson(filePath) || emptyDay();
  if (state.date !== todayKey()) {
    state = emptyDay();
  }

  let settings = Object.assign(
    {
      thresholdSec: defaultThresholdSec(),
      demoMode: false,
      reminderCooldownSec: 90,
      pollMs: 1500
    },
    loadJson(settingsPath) || {}
  );

  if (process.env.FOCUSFLOW_THRESHOLD_SEC) {
    settings.thresholdSec = Number(process.env.FOCUSFLOW_THRESHOLD_SEC);
  }
  if (process.env.FOCUSFLOW_DEMO === '1' || process.env.FOCUSFLOW_DEMO === 'true') {
    settings.demoMode = true;
  } else if (process.env.FOCUSFLOW_DEMO === '0' || process.env.FOCUSFLOW_DEMO === 'false') {
    settings.demoMode = false;
  }

  // Headless Linux only â€” never auto-demo on Windows/macOS
  if (
    process.platform === 'linux' &&
    !process.env.DISPLAY &&
    process.env.FOCUSFLOW_FORCE_REAL !== '1' &&
    process.env.FOCUSFLOW_DEMO == null
  ) {
    settings.demoMode = true;
  }

  function persistStats() {
    try {
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
    } catch (err) {
      console.error('[store] persist stats failed', err.message);
    }
  }

  function persistSettings() {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch (err) {
      console.error('[store] persist settings failed', err.message);
    }
  }

  function rollIfNeeded() {
    const t = todayKey();
    if (state.date !== t) {
      state = emptyDay(t);
      persistStats();
    }
  }

  function addSeconds(app, category, seconds) {
    rollIfNeeded();
    const sec = Math.max(0, Number(seconds) || 0);
    if (sec === 0) return state;

    if (!state.byApp[app]) {
      state.byApp[app] = { seconds: 0, category };
    }
    state.byApp[app].seconds += sec;
    state.byApp[app].category = category;

    if (!state.byCategory[category]) state.byCategory[category] = 0;
    state.byCategory[category] += sec;

    if (category === 'unproductive') {
      state.unproductiveStreak += sec;
    } else if (category === 'productive') {
      state.unproductiveStreak = 0;
    }

    persistStats();
    return state;
  }

  function markReminder() {
    state.lastReminderAt = Date.now();
    persistStats();
  }

  function shouldRemind() {
    const threshold = Number(settings.thresholdSec) || 600;
    const cooldown = (Number(settings.reminderCooldownSec) || 90) * 1000;
    if (state.unproductiveStreak < threshold) return false;
    if (state.lastReminderAt && Date.now() - state.lastReminderAt < cooldown) return false;
    return true;
  }

  function snapshot() {
    rollIfNeeded();
    const topApps = Object.entries(state.byApp)
      .map(([name, info]) => ({ name, seconds: info.seconds, category: info.category }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 8);
    return {
      date: state.date,
      byCategory: { ...state.byCategory },
      topApps,
      unproductiveStreak: state.unproductiveStreak,
      lastReminderAt: state.lastReminderAt,
      settings: { ...settings },
      dataDir,
      filePath
    };
  }

  function updateSettings(partial) {
    Object.assign(settings, partial);
    if (process.env.FOCUSFLOW_THRESHOLD_SEC && partial.thresholdSec == null) {
      settings.thresholdSec = Number(process.env.FOCUSFLOW_THRESHOLD_SEC);
    }
    persistSettings();
    return { ...settings };
  }

  function getSettings() {
    return { ...settings };
  }

  return {
    addSeconds,
    markReminder,
    shouldRemind,
    snapshot,
    updateSettings,
    getSettings,
    filePath,
    settingsPath
  };
}

function defaultThresholdSec() {
  if (process.env.FOCUSFLOW_THRESHOLD_SEC) {
    return Number(process.env.FOCUSFLOW_THRESHOLD_SEC);
  }
  return 10 * 60;
}

function loadJson(p) {
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (err) {
    console.error('[store] read failed', p, err.message);
  }
  return null;
}

module.exports = { createStore, todayKey, emptyDay };
