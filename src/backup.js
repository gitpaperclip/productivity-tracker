'use strict';

const fs = require('fs');
const path = require('path');
const { migrateDay, todayKey, emptyDay } = require('./store');

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

  const days = obj.days && typeof obj.days === 'object' ? obj.days : {};
  const today = todayKey();

  if (mode === 'replace') {
    store.clearAllHistory();
  }

  for (const [key, raw] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
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
  return result;
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
  }
  for (const [name, info] of Object.entries(other.byApp || {})) {
    if (!out.byApp[name]) {
      out.byApp[name] = { seconds: info.seconds, category: info.category };
    } else {
      out.byApp[name].seconds += info.seconds || 0;
      out.byApp[name].category = info.category || out.byApp[name].category;
    }
  }
  out.unproductiveStreak = Math.max(out.unproductiveStreak || 0, other.unproductiveStreak || 0);
  out.lastReminderAt = Math.max(out.lastReminderAt || 0, other.lastReminderAt || 0);
  return out;
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
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
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
