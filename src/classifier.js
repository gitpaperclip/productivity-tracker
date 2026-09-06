'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_RULES_PATH = path.join(__dirname, 'rules.json');
const DEFAULT_IGNORE_PATH = path.join(__dirname, 'ignore.json');

/**
 * Normalize keyword arrays: trimmed, lowercase, unique, non-empty.
 */
function normalizeKeywords(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
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

function saveIgnore(filePath, ignoreList) {
  const ignore = normalizeKeywords(ignoreList || []);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ ignore }, null, 2) + '\n', 'utf8');
  return ignore;
}

/**
 * Build lowercase haystack from process name + window title + url + path.
 * Browsers (Chrome/Edge/Firefox) are classified via title/URL keywords
 * (e.g. title containing "YouTube" → unproductive), not by browser name.
 */
function haystack(win) {
  if (!win) return '';
  const owner = (win.owner && win.owner.name) || '';
  const title = win.title || '';
  const url = win.url || '';
  const proc = (win.owner && win.owner.path) || '';
  return `${owner} ${title} ${url} ${proc}`.toLowerCase();
}

/**
 * True if process name matches an ignore keyword (system shell / chrome UI noise).
 * Match against owner.name and basename of owner.path only — not window title.
 */
function isIgnored(win, ignoreList) {
  if (!win || !ignoreList || !ignoreList.length) return false;
  const owner = ((win.owner && win.owner.name) || '').toLowerCase();
  const procPath = ((win.owner && win.owner.path) || '').toLowerCase();
  const base = procPath.split(/[/\\]/).pop() || '';
  const nameHay = `${owner} ${base}`;
  for (const keyword of ignoreList) {
    if (keyword && nameHay.includes(keyword)) return true;
  }
  return false;
}

/**
 * Unproductive wins on overlap (e.g. Chrome title "YouTube" or youtube.com URL).
 * Match is case-insensitive substring on process name + window title + url + path.
 * Do not put bare browser names in productive — page title/URL drives classification.
 */
function classify(win, rules) {
  const hay = haystack(win);
  if (!hay.trim()) return 'other';

  for (const keyword of rules.unproductive) {
    if (keyword && hay.includes(keyword)) {
      return 'unproductive';
    }
  }
  for (const keyword of rules.productive) {
    if (keyword && hay.includes(keyword)) {
      return 'productive';
    }
  }
  return 'other';
}

function appLabel(win) {
  if (!win) return 'Unknown';
  return (win.owner && win.owner.name) || win.title || 'Unknown';
}

module.exports = {
  loadRules,
  loadRulesFrom,
  saveRules,
  loadIgnore,
  loadIgnoreFrom,
  saveIgnore,
  normalizeKeywords,
  normalizeRules,
  normalizeIgnore,
  classify,
  isIgnored,
  appLabel,
  haystack,
  DEFAULT_RULES_PATH,
  DEFAULT_IGNORE_PATH
};
