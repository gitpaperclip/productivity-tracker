'use strict';

const fs = require('fs');
const path = require('path');
const { todayKey, MAX_HISTORY_DAYS } = require('./store');

const MODE_DEFS = {
  pomodoro: { id: 'pomodoro', label: 'Pomodoro', plannedMin: 25 },
  deep: { id: 'deep', label: 'Deep work', plannedMin: 90 },
  custom: { id: 'custom', label: 'Custom', plannedMin: null }
};

function modeLabel(mode) {
  return (MODE_DEFS[mode] && MODE_DEFS[mode].label) || 'Session';
}

function plannedSecFor(mode, customMin) {
  if (mode === 'pomodoro') return 25 * 60;
  if (mode === 'deep') return 90 * 60;
  const m = Number(customMin);
  const mins = Number.isFinite(m) && m > 0 ? Math.min(24 * 60, Math.max(1, Math.round(m))) : 45;
  return mins * 60;
}

function newId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadJson(p) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error('[sessions] read failed', p, err.message);
  }
  return null;
}

function topAppsFromByApp(byApp, limit) {
  const lim = limit || 3;
  if (!byApp || typeof byApp !== 'object') return [];
  return Object.entries(byApp)
    .map(([name, info]) => ({
      name,
      seconds: Math.max(0, Number(info && info.seconds) || 0),
      category: (info && info.category) || 'other'
    }))
    .filter((e) => e.seconds > 0 && e.category !== 'ignored')
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, lim);
}

function publicActive(session) {
  if (!session) return null;
  const now = Date.now();
  const endsAt = Number(session.endsAt) || 0;
  const startedAt = Number(session.startedAt) || now;
  const plannedSec = Number(session.plannedSec) || 0;
  const remainingMs = Math.max(0, endsAt - now);
  const elapsedSec = Math.max(
    0,
    Math.min(plannedSec || Infinity, Math.floor((now - startedAt) / 1000))
  );
  const status = session.status || 'running';
  return {
    id: session.id,
    mode: session.mode,
    modeLabel: session.modeLabel || modeLabel(session.mode),
    plannedSec,
    startedAt,
    endsAt,
    status,
    distractionCount: Number(session.distractionCount) || 0,
    elapsedSec,
    remainingMs,
    remainingSec: Math.ceil(remainingMs / 1000),
    /** Tray-ready snapshot — same fields without rewriting the engine later. */
    tray: {
      modeLabel: session.modeLabel || modeLabel(session.mode),
      remainingMs,
      remainingSec: Math.ceil(remainingMs / 1000),
      status,
      plannedSec
    },
    topApps: topAppsFromByApp(session.byApp, 3)
  };
}

/**
 * Focus session engine (Pomodoro / Deep work / Custom).
 * Active state is in memory + optional persist (active-session.json).
 * Completed sessions: data/sessions/YYYY-MM-DD.json (array).
 *
 * Distraction: edge-triggered when classification moves into unproductive
 * while a session is active (other/productive → unproductive = +1).
 * Ignored / SydTrack self windows do not count and do not update lastCategory.
 */
function createSessionManager({ dataDir, getSettings }) {
  const sessionsDir = path.join(dataDir, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const activePath = path.join(dataDir, 'active-session.json');

  let active = null;

  function persistActive() {
    try {
      if (!active) {
        if (fs.existsSync(activePath)) fs.unlinkSync(activePath);
        return;
      }
      fs.writeFileSync(activePath, JSON.stringify(active, null, 2));
    } catch (err) {
      console.error('[sessions] persist active failed', err.message);
    }
  }

  function dayPath(dateKey) {
    return path.join(sessionsDir, `${dateKey}.json`);
  }

  function readDay(dateKey) {
    const raw = loadJson(dayPath(dateKey));
    return Array.isArray(raw) ? raw : [];
  }

  function writeDay(dateKey, list) {
    try {
      fs.mkdirSync(sessionsDir, { recursive: true });
      fs.writeFileSync(dayPath(dateKey), JSON.stringify(list, null, 2));
    } catch (err) {
      console.error('[sessions] write day failed', err.message);
    }
  }

  function listSessionDates() {
    try {
      if (!fs.existsSync(sessionsDir)) return [];
      return fs
        .readdirSync(sessionsDir)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map((f) => f.replace(/\.json$/, ''))
        .sort();
    } catch (_) {
      return [];
    }
  }

  function historyEnabled() {
    const s = (getSettings && getSettings()) || {};
    return s.sessionHistoryEnabled !== false;
  }

  function pruneOldSessionDays() {
    try {
      const dates = listSessionDates();
      if (dates.length <= MAX_HISTORY_DAYS) return;
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
            fs.unlinkSync(dayPath(key));
          } catch (_) {}
        }
      }
    } catch (err) {
      console.error('[sessions] prune failed', err.message);
    }
  }

  /** Keep only the single most recent completed session on disk. */
  function pruneToMostRecent(keepEntry) {
    try {
      for (const key of listSessionDates()) {
        try {
          fs.unlinkSync(dayPath(key));
        } catch (_) {}
      }
      if (keepEntry && keepEntry.date) {
        writeDay(keepEntry.date, [keepEntry]);
      }
    } catch (err) {
      console.error('[sessions] pruneToMostRecent failed', err.message);
    }
  }

  function toLogEntry(session, status, endedAt) {
    const end = endedAt || Date.now();
    const startedAt = Number(session.startedAt) || end;
    const elapsedSec = Math.max(
      0,
      Math.floor((end - startedAt) / 1000)
    );
    const date =
      (session.dateKey && String(session.dateKey)) ||
      (() => {
        const d = new Date(startedAt);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      })();
    return {
      id: session.id,
      date,
      mode: session.mode,
      modeLabel: session.modeLabel || modeLabel(session.mode),
      plannedSec: Number(session.plannedSec) || 0,
      startedAt,
      endedAt: end,
      elapsedSec,
      status,
      distractionCount: Number(session.distractionCount) || 0,
      topApps: topAppsFromByApp(session.byApp, 3)
    };
  }

  function appendCompleted(entry) {
    if (!historyEnabled()) {
      pruneToMostRecent(entry);
      return;
    }
    const list = readDay(entry.date);
    const idx = list.findIndex((e) => e && e.id === entry.id);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    writeDay(entry.date, list);
    pruneOldSessionDays();
  }

  function finishActive(status) {
    if (!active) return null;
    const entry = toLogEntry(active, status, Date.now());
    active = null;
    persistActive();
    appendCompleted(entry);
    return entry;
  }

  /** Auto-complete when countdown hits zero. */
  function checkExpiry() {
    if (!active || active.status !== 'running') return null;
    if (Date.now() >= Number(active.endsAt)) {
      return finishActive('completed');
    }
    return null;
  }

  function restoreActiveFromDisk() {
    const raw = loadJson(activePath);
    if (!raw || typeof raw !== 'object' || raw.status !== 'running') {
      active = null;
      return;
    }
    active = {
      id: raw.id || newId(),
      mode: raw.mode || 'pomodoro',
      modeLabel: raw.modeLabel || modeLabel(raw.mode || 'pomodoro'),
      plannedSec: Number(raw.plannedSec) || 25 * 60,
      startedAt: Number(raw.startedAt) || Date.now(),
      endsAt: Number(raw.endsAt) || Date.now(),
      status: 'running',
      byApp: raw.byApp && typeof raw.byApp === 'object' ? raw.byApp : {},
      distractionCount: Number(raw.distractionCount) || 0,
      lastCategory: raw.lastCategory || null,
      dateKey: raw.dateKey || todayKey()
    };
    // If timer already expired while app was closed, complete it.
    if (Date.now() >= active.endsAt) {
      finishActive('completed');
    }
  }

  restoreActiveFromDisk();

  function startSession(opts) {
    const options = opts || {};
    const mode = MODE_DEFS[options.mode] ? options.mode : 'pomodoro';
    const settings = (getSettings && getSettings()) || {};
    const customMin =
      options.customMin != null ? options.customMin : settings.sessionCustomMin;
    // Stop any running session first (counts as stopped early)
    if (active && active.status === 'running') {
      finishActive('stopped');
    }
    const plannedSec = plannedSecFor(mode, customMin);
    const now = Date.now();
    active = {
      id: newId(),
      mode,
      modeLabel: modeLabel(mode),
      plannedSec,
      startedAt: now,
      endsAt: now + plannedSec * 1000,
      status: 'running',
      byApp: {},
      distractionCount: 0,
      lastCategory: null,
      dateKey: todayKey()
    };
    // Persist custom minutes when starting a custom session
    if (mode === 'custom' && getSettings) {
      const mins = Math.round(plannedSec / 60);
      try {
        // Caller (main) may also update settings; store custom on session only here
        active._customMin = mins;
      } catch (_) {}
    }
    persistActive();
    return publicActive(active);
  }

  function stopSession() {
    checkExpiry();
    if (!active) return { ok: false, entry: null, active: null };
    const entry = finishActive('stopped');
    return { ok: true, entry, active: null };
  }

  /**
   * Called from tracker poll while a session is active.
   * @param {{ app: string, category: string, elapsedSec: number }} tick
   */
  function onTrackerTick(tick) {
    const completed = checkExpiry();
    if (!active || active.status !== 'running') {
      return { completed, active: publicActive(active) };
    }
    const category = tick && tick.category;
    const app = tick && tick.app;
    const elapsed = Math.max(0, Number(tick && tick.elapsedSec) || 0);

    // Ignored / SydTrack self: do not count time or distractions; freeze lastCategory
    if (!category || category === 'ignored' || !app) {
      persistActive();
      return { completed, active: publicActive(active) };
    }

    // Edge-triggered distraction: other/productive → unproductive
    if (
      active.lastCategory != null &&
      active.lastCategory !== 'unproductive' &&
      category === 'unproductive'
    ) {
      active.distractionCount = (Number(active.distractionCount) || 0) + 1;
    }
    active.lastCategory = category;

    if (elapsed > 0) {
      if (!active.byApp[app]) {
        active.byApp[app] = { seconds: 0, category };
      }
      active.byApp[app].seconds += elapsed;
      active.byApp[app].category = category;
    }

    // Periodic persist (cheap overwrite)
    persistActive();

    const maybeDone = checkExpiry();
    return {
      completed: completed || maybeDone,
      active: publicActive(active)
    };
  }

  function getActiveSession() {
    checkExpiry();
    return publicActive(active);
  }

  function getSessionsForDay(dateKey) {
    const key = dateKey || todayKey();
    if (!historyEnabled()) {
      // Only most recent session overall — show it if it falls on this day
      const recent = getMostRecentSession();
      if (recent && recent.date === key) return [recent];
      return [];
    }
    return readDay(key);
  }

  function getMostRecentSession() {
    const dates = listSessionDates().slice().reverse();
    for (const key of dates) {
      const list = readDay(key);
      if (list.length) {
        return list[list.length - 1];
      }
    }
    return null;
  }

  /** Recent day keys that have sessions (newest first), capped. */
  function getRecentSessionDays(limit) {
    const lim = limit || 14;
    if (!historyEnabled()) {
      const recent = getMostRecentSession();
      return recent && recent.date ? [recent.date] : [];
    }
    return listSessionDates().slice().reverse().slice(0, lim);
  }

  /** When history is turned off, prune disk to a single most-recent entry. */
  function applyHistorySetting(enabled) {
    if (enabled) {
      pruneOldSessionDays();
      return;
    }
    const recent = getMostRecentSession();
    pruneToMostRecent(recent);
  }

  /**
   * Delete a completed/stopped session from the day log.
   * Refuses to delete the currently running active session.
   */
  function deleteSession(id, dateKey) {
    const sid = id != null ? String(id) : '';
    if (!sid) return { ok: false, reason: 'missing-id' };
    if (active && active.id === sid && active.status === 'running') {
      return { ok: false, reason: 'active' };
    }
    const key =
      (dateKey && String(dateKey)) ||
      (() => {
        // Search recent days if date not provided
        for (const d of listSessionDates().slice().reverse()) {
          const list = readDay(d);
          if (list.some((e) => e && e.id === sid)) return d;
        }
        return null;
      })();
    if (!key) return { ok: false, reason: 'not-found' };
    const list = readDay(key);
    const next = list.filter((e) => !(e && e.id === sid));
    if (next.length === list.length) return { ok: false, reason: 'not-found' };
    if (next.length) writeDay(key, next);
    else {
      try {
        if (fs.existsSync(dayPath(key))) fs.unlinkSync(dayPath(key));
      } catch (err) {
        console.error('[sessions] delete day file failed', err.message);
      }
    }
    return { ok: true, date: key, id: sid };
  }

  return {
    startSession,
    stopSession,
    onTrackerTick,
    getActiveSession,
    getSessionsForDay,
    getMostRecentSession,
    getRecentSessionDays,
    applyHistorySetting,
    deleteSession,
    checkExpiry,
    MODE_DEFS,
    sessionsDir,
    activePath
  };
}

module.exports = {
  createSessionManager,
  MODE_DEFS,
  modeLabel,
  plannedSecFor,
  publicActive,
  topAppsFromByApp
};
