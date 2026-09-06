'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_RULES_PATH = path.join(__dirname, 'rules.json');

function loadRules(filePath) {
  const p = filePath || DEFAULT_RULES_PATH;
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    productive: (parsed.productive || []).map((s) => String(s).toLowerCase()),
    unproductive: (parsed.unproductive || []).map((s) => String(s).toLowerCase())
  };
}

function haystack(win) {
  if (!win) return '';
  const owner = (win.owner && win.owner.name) || '';
  const title = win.title || '';
  const url = win.url || '';
  const proc = (win.owner && win.owner.path) || '';
  return `${owner} ${title} ${url} ${proc}`.toLowerCase();
}

/**
 * Unproductive wins on overlap (e.g. "YouTube in Chrome").
 * Match is case-insensitive substring on process name + window title + url.
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

module.exports = { loadRules, classify, appLabel, haystack, DEFAULT_RULES_PATH };
