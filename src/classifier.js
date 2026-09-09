'use strict';

const fs = require('fs');
const path = require('path');
const { writeJson } = require('./json-file');
const { classifyBrowser, browserNames, isBrowserName } = require('./browser-rules');

const DEFAULT_RULES_PATH = path.join(__dirname, 'rules.json');
const DEFAULT_IGNORE_PATH = path.join(__dirname, 'ignore.json');
const DEFAULT_APP_IDENTITIES_PATH = path.join(__dirname, 'app-identities.json');

/** Shared app identities, independent of browser engine or address-bar layout. */
const BROWSER_PROCESSES = browserNames;

/**
 * Normalize keyword arrays: trimmed, lowercase, unique, non-empty.
 */
function normalizeKeywords(list) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (typeof item !== 'string') continue;
    const s = String(item).trim().toLowerCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function normalizeRules(parsed) {
  return {
    productive: normalizeKeywords(parsed && parsed.productive),
    unproductive: normalizeKeywords(parsed && parsed.unproductive)
  };
}

function normalizeIgnore(parsed) {
  if (Array.isArray(parsed)) return normalizeKeywords(parsed);
  return normalizeKeywords(parsed && parsed.ignore);
}

function normalizeAppIdentities(parsed) {
  return {
    productiveApps: normalizeKeywords(parsed && parsed.productiveApps),
    ignoredApps: normalizeKeywords(parsed && parsed.ignoredApps),
    browserApps: normalizeKeywords(parsed && parsed.browserApps)
  };
}

/**
 * Load and normalize rules from a JSON file path.
 */
function loadRulesFrom(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return normalizeRules(JSON.parse(raw));
}

/**
 * Load rules (defaults to src/rules.json when path omitted).
 */
function loadRules(filePath) {
  return loadRulesFrom(filePath || DEFAULT_RULES_PATH);
}

/**
 * Persist normalized rules to path (creates parent dirs as needed).
 */
function saveRules(filePath, rules) {
  const normalized = normalizeRules(rules || {});
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  return normalized;
}

function loadIgnoreFrom(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return normalizeIgnore(JSON.parse(raw));
}

function loadIgnore(filePath) {
  return loadIgnoreFrom(filePath || DEFAULT_IGNORE_PATH);
}

function loadAppIdentitiesFrom(filePath) {
  return normalizeAppIdentities(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

function loadAppIdentities(filePath) {
  return loadAppIdentitiesFrom(filePath || DEFAULT_APP_IDENTITIES_PATH);
}

function saveAppIdentities(filePath, identities) {
  const normalized = normalizeAppIdentities(identities || {});
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJson(filePath, normalized);
  return normalized;
}

function saveIgnore(filePath, ignoreList) {
  const ignore = normalizeKeywords(ignoreList || []);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ ignore }, null, 2) + '\n', 'utf8');
  return ignore;
}

/**
 * Build lowercase haystack from process name + window title + url + path.
 * Browsers (Chrome/Edge/Firefox) use title/URL keywords when available
 * (e.g. title containing "YouTube" → unproductive), with bare browsers productive.
 */
function haystack(win) {
  if (!win) return '';
  const owner = (win.owner && win.owner.name) || '';
  const title = win.title || '';
  const url = win.url || '';
  const proc = (win.owner && win.owner.path) || '';
  return `${owner} ${title} ${url} ${proc}`.toLowerCase();
}

function processNameParts(win) {
  const owner = ((win && win.owner && win.owner.name) || '').toLowerCase();
  const procPath = ((win && win.owner && win.owner.path) || '').toLowerCase();
  const base = procPath.split(/[/\\]/).pop() || '';
  const baseNoExt = base.replace(/\.exe$/i, '');
  const label = appLabel(win).toLowerCase();
  return { owner, base, baseNoExt, label };
}

function isBrowserProcess(win, identities) {
  const { owner, base } = processNameParts(win);
  return isBrowserName(owner, identities && identities.browserApps) || isBrowserName(base, identities && identities.browserApps);
}

function matchesProcess(win, identities) {
  const { owner, baseNoExt } = processNameParts(win);
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\.exe$/, '');
  const values = [owner, baseNoExt].map(normalize).filter(Boolean);
  return normalizeKeywords(identities).some((identity) => values.includes(normalize(identity)));
}

/** Match process/app fields only, never window titles or URLs. */
function appMatchesIdentity(win, identities) {
  if (!win || !identities) return null;
  const matches = (list) => matchesProcess(win, list);
  if (matches(identities.ignoredApps)) return 'ignored';
  if (matches(identities.productiveApps)) return 'productive';
  return null;
}

/**
 * True if process name / app label matches an ignore keyword (case-insensitive).
 * Also: electron process with SydTrack in the title → ignored (self).
 * Match against owner.name, path basename, and app label — not arbitrary title text
 * (except the SydTrack self-exclusion rule).
 */
function isIgnored(win, ignoreList, identities) {
  if (!win) return false;
  if (appMatchesIdentity(win, identities) === 'ignored') return true;

  const title = (win.title || '').toLowerCase();
  const { owner, base, baseNoExt, label } = processNameParts(win);
  const nameHay = `${owner} ${base} ${baseNoExt} ${label}`;

  // Self: Electron shell running this app
  if (/electron/i.test(nameHay) && /sydtrack/i.test(title)) {
    return true;
  }
  // Self: packaged / named SydTrack process
  if (/\bsydtrack\b/i.test(owner) || /\bsydtrack\b/i.test(baseNoExt) || /\bsydtrack\b/i.test(label)) {
    return true;
  }

  if (!ignoreList || !ignoreList.length) return false;
  for (const keyword of ignoreList) {
    if (!keyword) continue;
    const k = String(keyword).toLowerCase();
    if (owner.includes(k) || base.includes(k) || baseNoExt.includes(k) || label.includes(k)) {
      return true;
    }
  }
  return false;
}

/**
 * Unproductive wins on overlap (e.g. Chrome title "YouTube" or youtube.com URL).
 * Match is case-insensitive substring on process name + window title + url + path.
 * Known browsers without keyword hits → productive; explicit unproductive keywords win above.
 */
function classify(win, rules) {
  rules = rules || { productive: [], unproductive: [] };
  const browser = isBrowserProcess(win, rules.identities);
  if (browser) return classifyBrowser(win, rules);
  // Explicit app tags remain editable; project/title words cannot override an identity.
  if (matchesProcess(win, rules.unproductive)) return 'unproductive';
  if (appMatchesIdentity(win, rules.identities) === 'productive') return 'productive';
  const hay = haystack(win);
  if (!hay.trim()) return 'other';

  for (const keyword of normalizeKeywords(rules.unproductive)) {
    if (!keyword.startsWith('site:') && hay.includes(keyword)) {
      return 'unproductive';
    }
  }
  for (const keyword of normalizeKeywords(rules.productive)) {
    if (!keyword.startsWith('site:') && hay.includes(keyword)) {
      return 'productive';
    }
  }
  return 'other';
}

function appLabel(win) {
  if (!win) return 'Unknown';
  return (win.owner && win.owner.name) || win.title || 'Unknown';
}

/** Case-insensitive: does app name match any ignore keyword? */
function appMatchesIgnore(appName, ignoreList) {
  if (!appName || !ignoreList || !ignoreList.length) return false;
  const name = String(appName).toLowerCase();
  for (const keyword of ignoreList) {
    if (keyword && name.includes(String(keyword).toLowerCase())) return true;
  }
  if (/\bsydtrack\b/i.test(name)) return true;
  return false;
}

module.exports = {
  loadRules,
  loadRulesFrom,
  saveRules,
  loadIgnore,
  loadIgnoreFrom,
  saveIgnore,
  loadAppIdentities,
  loadAppIdentitiesFrom,
  saveAppIdentities,
  normalizeKeywords,
  normalizeRules,
  normalizeIgnore,
  normalizeAppIdentities,
  classify,
  isIgnored,
  appLabel,
  haystack,
  appMatchesIgnore,
  isBrowserProcess,
  appMatchesIdentity,
  BROWSER_PROCESSES,
  DEFAULT_RULES_PATH,
  DEFAULT_IGNORE_PATH,
  DEFAULT_APP_IDENTITIES_PATH
};
