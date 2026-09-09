'use strict';

const fs = require('fs');
const path = require('path');
const { writeJson, validDateKey, readRecoverableJson } = require('./json-file');

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MAX_HISTORY_DAYS = 90;

function emptyHour() {
  return { productive: 0, unproductive: 0, other: 0, byApp: Object.create(null) };
}

function emptyByHour() {
  return Array.from({ length: 24 }, () => emptyHour());
}

function appCategoryKey(app, category) {
  if (category === 'productive' || category === 'unproductive') {
    return String(app) + '::' + category;
  }
  return String(app);
}

function appEntryName(key) {
  const text = String(key);
  const marker = text.lastIndexOf('::');
  if (marker < 0) return text;
  const suffix = text.slice(marker + 2);
  return suffix === 'productive' || suffix === 'unproductive'
    ? text.slice(0, marker)
    : text;
}

function mergeAppEntries(entries) {
  const merged = new Map();
  for (const entry of entries || []) {
    const category =
      entry.category === 'productive' || entry.category === 'unproductive'
        ? entry.category
        : 'other';
    const key = entry.name + '\u0000' + category;
    const current = merged.get(key);
    if (current) {
      current.seconds += entry.seconds;
    } else {
      merged.set(key, { name: entry.name, seconds: entry.seconds, category });
    }
  }
  return Array.from(merged.values());
}

function categoryForStoredApp(name, current, rules) {
  const text = String(name || '').toLowerCase();
  const { isBrowserProcess, classify } = require('./classifier');
  const win = { owner: { name } };
  // Original browser titles/URLs are unavailable in history. Preserve their categories.
  if (isBrowserProcess(win, rules && rules.identities)) return current;
  const classified = classify(win, rules);
  if (classified !== 'other') return classified;
  const unproductive = (rules && rules.unproductive) || [];
  const productive = (rules && rules.productive) || [];
  if (unproductive.some((keyword) => text.includes(String(keyword).toLowerCase()))) {
    return 'unproductive';
  }
  if (productive.some((keyword) => text.includes(String(keyword).toLowerCase()))) {
    return 'productive';
  }
  return current === 'productive' || current === 'unproductive' ? current : 'other';
}

function emptyDay(date) {
  return {
    date: date || todayKey(),
    byApp: Object.create(null),
    byCategory: { productive: 0, unproductive: 0, other: 0 },
    byHour: emptyByHour(),
    unproductiveStreak: 0,
    lastReminderAt: 0
  };
}

/** Migrate older day objects that lack byHour. */
function migrateDay(raw) {
  if (!raw || typeof raw !== 'object') return emptyDay();
  const day = {
    date: raw.date || todayKey(),
    byApp: cloneAppMap(raw.byApp),
    byCategory: Object.assign(
      { productive: 0, unproductive: 0, other: 0 },
      raw.byCategory || {}
    ),
    byHour: Array.isArray(raw.byHour) && raw.byHour.length === 24
      ? raw.byHour.map((h) => {
          const base = emptyHour();
          const src = h && typeof h === 'object' ? h : {};
          const byApp =
            cloneAppMap(src.byApp);
          return Object.assign(base, src, { byApp });
        })
      : emptyByHour(),
    unproductiveStreak: Number(raw.unproductiveStreak) || 0,
    lastReminderAt: Number(raw.lastReminderAt) || 0
  };
  return day;
}

function cloneAppMap(map) {
  const out = Object.create(null);
  for (const [key, info] of Object.entries(map || {})) {
    if (!info || typeof info !== 'object') continue;
    const category = ['productive', 'unproductive', 'ignored'].includes(info.category) ? info.category : 'other';
    const name = appCategoryKey(appEntryName(key), category);
    const seconds = Number(info.seconds);
    if (!Number.isFinite(seconds) || seconds < 0) continue;
    if (!out[name]) out[name] = { seconds: 0, category };
    out[name].seconds += seconds;
  }
  return out;
}

/**
 * Mood from productive / (productive + unproductive).
 * Both zero → meh. Stable ids for animal skins via data-mood.
 * thriving >=0.8, focused >=0.6, meh >=0.4, distracted >=0.2, doomscroll <0.2
 */
function moodFromCategories(byCategory) {
  const prod = Number((byCategory && byCategory.productive) || 0);
  const unp = Number((byCategory && byCategory.unproductive) || 0);
  const denom = prod + unp;
  let id = 'meh';
  let ratio = null;
  if (denom > 0) {
    ratio = prod / denom;
    if (ratio >= 0.8) id = 'thriving';
    else if (ratio >= 0.6) id = 'focused';
    else if (ratio >= 0.4) id = 'meh';
    else if (ratio >= 0.2) id = 'distracted';
    else id = 'doomscroll';
  }
  const meta = {
    thriving: { emoji: '😄', label: 'Thriving' },
    focused: { emoji: '🙂', label: 'Focused' },
    meh: { emoji: '😐', label: 'Meh' },
    distracted: { emoji: '😕', label: 'Distracted' },
    doomscroll: { emoji: '😵', label: 'Doomscroll' }
  };
  const m = meta[id] || meta.meh;
  return { id, emoji: m.emoji, label: m.label, ratio };
}

function createStore(dataDir, { onRecovery = () => {} } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const historyDir = path.join(dataDir, 'history');
  fs.mkdirSync(historyDir, { recursive: true });
  const filePath = path.join(dataDir, 'stats.json');
  const settingsPath = path.join(dataDir, 'settings.json');

  let state = migrateDay(loadJson(filePath) || emptyDay());
  if (state.date !== todayKey()) {
    archiveDay(state);
    state = emptyDay();
    persistStats();
  }


  let settingsRecovered = false;
  const savedSettings = readRecoverableJson(settingsPath,
    (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
    (report) => { settingsRecovered = true; onRecovery(report); });
  let settings = Object.assign(
    {
      thresholdSec: defaultThresholdSec(),
      demoMode: false,
      trackingPaused: false,
      reminderCooldownSec: 90,
      idleTimeoutSec: 300,
      pollMs: 750,
      focusBoost: false,
      focusBoostRestoreSec: null,
      focusBoostSec: 180,
      focusBoostScheduleEnabled: false,
      focusBoostScheduleStart: '09:00',
      focusBoostScheduleEnd: '17:00',
      reminderMessage: "You've been on {app} for a while... maybe it's time to get back?",
      focusBoostReminderMessage: "Hey! focusboost is enabled. Maybe it's time to refocus?",
      dailyGoalSec: 7200,
      sessionHistoryEnabled: true,
      sessionCustomMin: 45,
      notificationsEnabled: true
    },
    savedSettings || {}
  );
  if (settingsRecovered) {
    settings.trackingPaused = true;
    persistSettings();
  }

  if (process.env.SYDTRACK_THRESHOLD_SEC) {
    settings.thresholdSec = Number(process.env.SYDTRACK_THRESHOLD_SEC);
  }
  if (process.env.SYDTRACK_DEMO === '1' || process.env.SYDTRACK_DEMO === 'true') {
    settings.demoMode = true;
  } else if (process.env.SYDTRACK_DEMO === '0' || process.env.SYDTRACK_DEMO === 'false') {
    settings.demoMode = false;
  }

  // Headless Linux only — never auto-demo on Windows/macOS
  if (
    process.platform === 'linux' &&
    !process.env.DISPLAY &&
    process.env.SYDTRACK_FORCE_REAL !== '1' &&
    process.env.SYDTRACK_DEMO == null
  ) {
    settings.demoMode = true;
  }

  function archiveDay(day) {
    if (!day || !validDateKey(day.date)) throw new Error('Invalid history date');
    try {
      fs.mkdirSync(historyDir, { recursive: true });
      const dest = path.join(historyDir, `${day.date}.json`);
      writeJson(dest, day);
    } catch (err) {
      console.error('[store] archive day failed', err.message);
      throw err;
    }
  }

  function persistStats() {
    try {
      writeJson(filePath, state);
    } catch (err) {
      console.error('[store] persist stats failed', err.message);
      throw err;
    }
  }

  function persistSettings() {
    try {
      writeJson(settingsPath, settings);
    } catch (err) {
      console.error('[store] persist settings failed', err.message);
      throw err;
    }
  }

  function rollIfNeeded() {
    const t = todayKey();
    if (state.date !== t) {
      archiveDay(state);
      pruneOldHistory();
      state = emptyDay(t);
      persistStats();
    }
  }

  function addSeconds(app, category, seconds) {
    rollIfNeeded();
    const sec = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
    if (sec === 0) return state;
    // Never persist ignored category into totals
    if (category === 'ignored') return state;

    const cat =
      category === 'productive' || category === 'unproductive' ? category : 'other';
    const entryKey = appCategoryKey(app, cat);
    if (!state.byApp[entryKey]) {
      state.byApp[entryKey] = { seconds: 0, category: cat };
    }
    state.byApp[entryKey].seconds += sec;
    state.byApp[entryKey].category = cat;
    if (!state.byCategory[cat]) state.byCategory[cat] = 0;
    state.byCategory[cat] += sec;

    // Hourly buckets (local hour)
    if (!Array.isArray(state.byHour) || state.byHour.length !== 24) {
      state.byHour = emptyByHour();
    }
    const hour = new Date().getHours();
    if (!state.byHour[hour]) state.byHour[hour] = emptyHour();
    state.byHour[hour][cat] = (state.byHour[hour][cat] || 0) + sec;
    if (!state.byHour[hour].byApp || typeof state.byHour[hour].byApp !== 'object') {
      state.byHour[hour].byApp = {};
    }
    if (!state.byHour[hour].byApp[entryKey]) {
      state.byHour[hour].byApp[entryKey] = { seconds: 0, category: cat };
    }
    state.byHour[hour].byApp[entryKey].seconds += sec;
    state.byHour[hour].byApp[entryKey].category = cat;

    if (category === 'unproductive') {
      state.unproductiveStreak += sec;
    } else {
      state.unproductiveStreak = 0;
    }

    persistStats();
    return state;
  }

  function removeSeconds(app, category, seconds) {
    rollIfNeeded();
    let remaining = Math.max(0, Number(seconds) || 0);
    if (!remaining || category === 'ignored') return state;
    const cat = category === 'productive' || category === 'unproductive' ? category : 'other';
    const key = appCategoryKey(app, cat);
    const entry = state.byApp && state.byApp[key];
    const removed = Math.min(remaining, Number(entry && entry.seconds) || 0);
    if (!removed) return state;
    entry.seconds -= removed;
    state.byCategory[cat] = Math.max(0, (Number(state.byCategory[cat]) || 0) - removed);
    remaining = removed;
    for (let hourIndex = new Date().getHours(); hourIndex >= 0 && remaining > 0; hourIndex -= 1) {
      const hour = state.byHour && state.byHour[hourIndex];
      const hourEntry = hour && hour.byApp && hour.byApp[key];
      const take = Math.min(remaining, Number(hourEntry && hourEntry.seconds) || 0);
      if (!take) continue;
      hourEntry.seconds -= take;
      hour[cat] = Math.max(0, (Number(hour[cat]) || 0) - take);
      remaining -= take;
    }
    if (category === 'unproductive') state.unproductiveStreak = 0;
    persistStats();
    return state;
  }

  function reclassifyStoredApps(rules) {
    rollIfNeeded();
    const nextByApp = {};
    const categoryDelta = { productive: 0, unproductive: 0, other: 0 };
    for (const [key, info] of Object.entries(state.byApp || {})) {
      const name = appEntryName(key);
      const current = info && info.category ? info.category : 'other';
      const next = categoryForStoredApp(name, current, rules);
      const seconds = Math.max(0, Number(info && info.seconds) || 0);
      const nextKey = appCategoryKey(name, next);
      if (!nextByApp[nextKey]) nextByApp[nextKey] = { seconds: 0, category: next };
      nextByApp[nextKey].seconds += seconds;
      categoryDelta[current === 'productive' || current === 'unproductive' ? current : 'other'] -= seconds;
      categoryDelta[next] += seconds;
    }
    state.byApp = nextByApp;
    for (const category of ['productive', 'unproductive', 'other']) {
      state.byCategory[category] = Math.max(
        0,
        (Number(state.byCategory[category]) || 0) + categoryDelta[category]
      );
    for (const hour of state.byHour || []) {
      if (!hour || !hour.byApp) continue;
      const nextByHourApp = {};
      const hourDelta = { productive: 0, unproductive: 0, other: 0 };
      for (const [key, info] of Object.entries(hour.byApp)) {
        const name = appEntryName(key);
        const current = info && info.category ? info.category : 'other';
        const next = categoryForStoredApp(name, current, rules);
        const seconds = Math.max(0, Number(info && info.seconds) || 0);
        const nextKey = appCategoryKey(name, next);
        if (!nextByHourApp[nextKey]) nextByHourApp[nextKey] = { seconds: 0, category: next };
        nextByHourApp[nextKey].seconds += seconds;
        const oldCat = current === 'productive' || current === 'unproductive' ? current : 'other';
        hourDelta[oldCat] -= seconds;
        hourDelta[next] += seconds;
      }
      hour.byApp = nextByHourApp;
      for (const category of ['productive', 'unproductive', 'other']) {
        hour[category] = Math.max(0, (Number(hour[category]) || 0) + hourDelta[category]);
      }
    }
    }
    persistStats();
    return state;
  }

  function markReminder() {
    state.lastReminderAt = Date.now();
    persistStats();
  }

  function resetStreak() {
    if (!state.unproductiveStreak) return;
    state.unproductiveStreak = 0;
    persistStats();
  }

  function shouldRemind() {
    const threshold = Number(settings.thresholdSec) || 600;
    const cooldown = (Number(settings.reminderCooldownSec) || 90) * 1000;
    if (state.unproductiveStreak < threshold) return false;
    if (state.lastReminderAt && Date.now() - state.lastReminderAt < cooldown) return false;
    return true;
  }

  function loadHistoryDay(dateKey) {
    if (!validDateKey(dateKey)) return null;
    const p = path.join(historyDir, `${dateKey}.json`);
    const raw = loadJson(p);
    return raw ? migrateDay(raw) : null;
  }


  function pruneOldHistory() {
    try {
      const dates = listHistoryDates();
      const cutoff = new Date();
      cutoff.setHours(0, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() - MAX_HISTORY_DAYS);
      const cy = cutoff.getFullYear();
      const cm = String(cutoff.getMonth() + 1).padStart(2, '0');
      const cd = String(cutoff.getDate()).padStart(2, '0');
      const cutoffKey = `${cy}-${cm}-${cd}`;
      for (const key of dates) {
        if (key < cutoffKey) {
          try {
            fs.unlinkSync(path.join(historyDir, `${key}.json`));
          } catch (_) {}
        }
      }
    } catch (err) {
      console.error('[store] prune history failed', err.message);
    }
  }

  function listHistoryDates() {
    try {
      if (!fs.existsSync(historyDir)) return [];
      return fs
        .readdirSync(historyDir)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map((f) => f.replace(/\.json$/, ''))
        .sort();
    } catch (_) {
      return [];
    }
  }

  /** Last 7 calendar days including today, oldest → newest. */
  function weekSummary() {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      let dayObj = null;
      if (key === state.date) {
        dayObj = state;
      } else {
        dayObj = loadHistoryDay(key);
      }
      let topApps = [];
      if (dayObj && dayObj.byApp && typeof dayObj.byApp === 'object') {
        topApps = mergeAppEntries(Object.entries(dayObj.byApp).map(([name, info]) => ({
            name: appEntryName(name),
            seconds: (info && info.seconds) || 0,
            category: (info && info.category) || 'other'
          })))
          .filter((e) => e.category !== 'ignored' && e.seconds > 0)
          .sort((a, b) => b.seconds - a.seconds)
          .slice(0, 3);
      }
      days.push({
        date: key,
        byCategory: dayObj
          ? Object.assign(
              { productive: 0, unproductive: 0, other: 0 },
              dayObj.byCategory || {}
            )
          : { productive: 0, unproductive: 0, other: 0 },
        topApps
      });
    }
    return days;
  }

  /**
  * @param {string[]|null} ignoreList optional — filter ignored process names out of topApps
  *   and subtract their stored totals. Other category totals remain authoritative so a browser
  *   tab switch cannot reclassify history.
   */
  function snapshot(ignoreList) {
    rollIfNeeded();
    const { appMatchesIgnore } = require('./classifier');
    const ignore = ignoreList || [];

    const entries = mergeAppEntries(Object.entries(state.byApp).map(([name, info]) => ({
      name: appEntryName(name),
      seconds: info.seconds,
      category: info.category
    })));

    const ignoredEntries = ignore.length
      ? entries.filter((e) => appMatchesIgnore(e.name, ignore))
      : [];
    const visible = entries.filter(
      (e) => e.category !== 'ignored' && !ignoredEntries.includes(e)
    );

    const byCategory = Object.assign(
      { productive: 0, unproductive: 0, other: 0 },
      state.byCategory || {}
    );
    for (const e of ignoredEntries) {
      const cat = e.category === 'productive' || e.category === 'unproductive' ? e.category : 'other';
      byCategory[cat] = Math.max(0, (byCategory[cat] || 0) - e.seconds);
    }

    const topApps = visible.sort((a, b) => b.seconds - a.seconds).slice(0, 40);
    const mood = moodFromCategories(byCategory);

    return {
      date: state.date,
      byCategory,
      topApps,
      byHour: (state.byHour || emptyByHour()).map((h) => {
        const src = h || {};
        const byApp =
          src.byApp && typeof src.byApp === 'object' ? { ...src.byApp } : {};
        return Object.assign(emptyHour(), src, { byApp });
      }),
      week: weekSummary(),
      unproductiveStreak: state.unproductiveStreak,
      lastReminderAt: state.lastReminderAt,
      mood,
      settings: { ...settings },
      dataDir,
      filePath
    };
  }

  function updateSettings(partial) {
    Object.assign(settings, partial);
    if (process.env.SYDTRACK_THRESHOLD_SEC && partial.thresholdSec == null) {
      settings.thresholdSec = Number(process.env.SYDTRACK_THRESHOLD_SEC);
    }
    persistSettings();
    return { ...settings };
  }

  function getSettings() {
    return { ...settings };
  }

  function getState() {
    return state;
  }

  function replaceToday(dayObj) {
    state = migrateDay(dayObj);
    if (!state.date) state.date = todayKey();
    persistStats();
    return state;
  }

  function clearToday() {
    state = emptyDay(todayKey());
    persistStats();
    return state;
  }

  function clearAllHistory() {
    try {
      if (fs.existsSync(historyDir)) {
        for (const f of fs.readdirSync(historyDir)) {
          if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) {
            fs.unlinkSync(path.join(historyDir, f));
          }
        }
      }
    } catch (err) {
      console.error('[store] clear history failed', err.message);
    }
    state = emptyDay(todayKey());
    persistStats();
    return state;
  }

  /** All archived days + today, keyed by date. */
  function allDaysMap() {
    const map = {};
    for (const key of listHistoryDates()) {
      const d = loadHistoryDay(key);
      if (d) map[key] = d;
    }
    map[state.date] = state;
    return map;
  }

  function writeHistoryDay(dayObj) {
    const day = migrateDay(dayObj);
    if (!day.date) return;
    archiveDay(day);
  }

  function getHistoryDir() {
    return historyDir;
  }

  pruneOldHistory();

  return {
    addSeconds,
    removeSeconds,
    reclassifyStoredApps,
    markReminder,
    resetStreak,
    shouldRemind,
    snapshot,
    updateSettings,
    getSettings,
    getState,
    replaceToday,
    clearToday,
    clearAllHistory,
    allDaysMap,
    writeHistoryDay,
    loadHistoryDay,
    listHistoryDates,
    pruneOldHistory,
    archiveDay,
    getHistoryDir,
    filePath,
    settingsPath,
    dataDir
  };
}

function defaultThresholdSec() {
  if (process.env.SYDTRACK_THRESHOLD_SEC) {
    return Number(process.env.SYDTRACK_THRESHOLD_SEC);
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
    throw err;
  }
  return null;
}

module.exports = {
  createStore,
  todayKey,
  emptyDay,
  emptyByHour,
  emptyHour,
  migrateDay,
  moodFromCategories,
  MAX_HISTORY_DAYS
};
