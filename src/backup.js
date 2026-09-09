'use strict';

const fs = require('fs');
const path = require('path');
const { migrateDay, todayKey, emptyDay } = require('./store');
const { writeJson, validDateKey } = require('./json-file');

function appVersion() {
  try {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    return pkg.version || '1.0.0';
  } catch (_) {
    return '1.0.0';
  }
}

/**
 * Build a portable .sydtrack backup object from a store + optional rules/ignore.
 */
function buildExport(store, opts) {
  const options = opts || {};
  const includeSettings = !!options.includeSettings;
  const includeRules = !!options.includeRules;
  const includeIgnore = !!options.includeIgnore;

  const payload = {
    format: 'sydtrack-backup',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: appVersion(),
    days: store.allDaysMap()
  };

  if (includeSettings) {
    payload.settings = store.getSettings();
  }
  if (includeRules && options.rules) {
    payload.rules = {
      productive: (options.rules.productive || []).slice(),
      unproductive: (options.rules.unproductive || []).slice()
    };
  }
  if (includeIgnore && options.ignore) {
    payload.ignore = Array.isArray(options.ignore)
      ? options.ignore.slice()
      : (options.ignore.ignore || []).slice();
  }

  return payload;
}

/**
 * Import a .sydtrack backup into store.
 * mode: 'merge' | 'replace'
 * Returns { ok, daysImported, appliedSettings, appliedRules, appliedIgnore, error? }
 */
function importBackup(store, obj, opts) {
  const options = opts || {};
  const mode = options.mode === 'replace' ? 'replace' : 'merge';
  const result = {
    ok: false,
    daysImported: 0,
    appliedSettings: false,
    appliedRules: false,
    appliedIgnore: false
  };

  if (!obj || obj.format !== 'sydtrack-backup') {
    result.error = 'Invalid backup: missing format sydtrack-backup';
    return result;
  }
  if (Number(obj.schemaVersion) !== 1) {
    result.error = `Unsupported schemaVersion: ${obj.schemaVersion}`;
    return result;
  }

  // Validate the entire payload before replace can clear any user data.
  try { validateBackup(obj); } catch (err) {
    result.error = err.message;
    return result;
  }
  const days = obj.days;
  const today = todayKey();

  if (mode === 'replace') {
    store.clearAllHistory();
  }

  for (const [key, raw] of Object.entries(days)) {
    const day = migrateDay(Object.assign({}, raw, { date: key }));
    if (key === today) {
      if (mode === 'replace') {
        store.replaceToday(day);
      } else {
        // merge: prefer summing categories/apps into today
        mergeIntoToday(store, day);
      }
    } else if (mode === 'replace') {
      store.writeHistoryDay(day);
    } else {
      const existing = store.loadHistoryDay(key);
      if (existing) {
        store.writeHistoryDay(mergeDays(existing, day));
      } else {
        store.writeHistoryDay(day);
      }
    }
    result.daysImported += 1;
  }

  if (obj.settings && typeof obj.settings === 'object' && options.applySettings !== false) {
    store.updateSettings(obj.settings);
    result.appliedSettings = true;
  }

  if (obj.rules && options.onRules) {
    options.onRules(obj.rules);
    result.appliedRules = true;
  }
  if (obj.ignore && options.onIgnore) {
    const list = Array.isArray(obj.ignore) ? obj.ignore : obj.ignore.ignore || [];
    options.onIgnore(list);
    result.appliedIgnore = true;
  }

  result.ok = true;
  store.pruneOldHistory();
  return result;
}

function validateBackup(obj) {
  const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const fail = (message) => { throw new Error('Invalid backup: ' + message); };
  const number = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const appMap = (map) => {
    if (map == null) return;
    if (!record(map)) fail('app totals must be an object');
    for (const info of Object.values(map)) {
      if (!record(info) || !number(info.seconds) || !['productive', 'unproductive', 'other', 'ignored'].includes(info.category)) fail('invalid app total');
    }
  };
  const totals = (map) => {
    if (map == null) return;
    if (!record(map)) fail('category totals must be an object');
    for (const cat of ['productive', 'unproductive', 'other']) {
      if (map[cat] != null && !number(map[cat])) fail('invalid category total');
    }
  };
  const tags = (list) => {
    if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) fail('tags must be string arrays');
  };
  if (!record(obj.days)) fail('days must be an object');
  for (const [key, day] of Object.entries(obj.days)) {
    if (!validDateKey(key) || !record(day)) fail('invalid day');
    appMap(day.byApp); totals(day.byCategory);
    if (day.byHour != null) {
      if (!Array.isArray(day.byHour) || day.byHour.length !== 24) fail('expected 24 hourly buckets');
      for (const hour of day.byHour) {
        if (!record(hour)) fail('invalid hour');
        totals(hour); appMap(hour.byApp);
      }
    }
  }
  if (obj.settings != null && !record(obj.settings)) fail('invalid settings');
  if (obj.rules != null) {
    if (!record(obj.rules)) fail('invalid rules');
    tags(obj.rules.productive); tags(obj.rules.unproductive);
  }
  if (obj.ignore != null) tags(Array.isArray(obj.ignore) ? obj.ignore : obj.ignore.ignore);
  // Reject prototype setters even in optional settings before Object.assign.
  const inspect = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('unsafe object key');
      inspect(child);
    }
  };
  inspect(obj);
}

function mergeDays(a, b) {
  const out = migrateDay(a);
  const other = migrateDay(b);
  for (const cat of ['productive', 'unproductive', 'other']) {
    out.byCategory[cat] = (out.byCategory[cat] || 0) + (other.byCategory[cat] || 0);
  }
  for (let h = 0; h < 24; h++) {
    for (const cat of ['productive', 'unproductive', 'other']) {
      out.byHour[h][cat] =
        (out.byHour[h][cat] || 0) + ((other.byHour[h] && other.byHour[h][cat]) || 0);
    }
    mergeAppMap(out.byHour[h].byApp, other.byHour[h].byApp);
  }
  mergeAppMap(out.byApp, other.byApp);
  out.unproductiveStreak = Math.max(out.unproductiveStreak || 0, other.unproductiveStreak || 0);
  out.lastReminderAt = Math.max(out.lastReminderAt || 0, other.lastReminderAt || 0);
  return out;
}

function mergeAppMap(target, source) {
  for (const [key, info] of Object.entries(source || {})) {
    if (!target[key]) target[key] = { ...info };
    else target[key].seconds += info.seconds;
  }
}

function mergeIntoToday(store, day) {
  const current = store.getState();
  const merged = mergeDays(current, day);
  merged.date = todayKey();
  store.replaceToday(merged);
}

function clearToday(store) {
  return store.clearToday();
}

function clearAllHistory(store) {
  return store.clearAllHistory();
}

function writeBackupFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJson(filePath, payload);
}

function readBackupFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

module.exports = {
  buildExport,
  importBackup,
  clearToday,
  clearAllHistory,
  writeBackupFile,
  readBackupFile,
  appVersion,
  mergeDays
};
