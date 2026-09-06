'use strict';

function fmt(s) {
  s = Math.max(0, Math.floor(+s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  return h
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0')
    : m + ':' + String(x).padStart(2, '0');
}

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const api = window.focusflow;
let applying = false;
/** Cached rules/ignore for one-click reclassify. */
let cachedRules = { productive: [], unproductive: [] };
let cachedIgnore = [];
/** Last focused window for Home quick-classify (P/U). */
let lastFocusedCache = null;
/** Session overrides so Last focused chip/buttons don't snap back before tracker reclassifies. */
const lfSessionClass = Object.create(null);

function lfOverrideKey(entry) {
  if (!entry || !entry.app) return '';
  const kw = keywordForQuickClassify(entry);
  return (kw || entry.app).toLowerCase();
}

function applyLfButtonOutlines(category) {
  const prod = $('lf-prod');
  const unprod = $('lf-unprod');
  if (prod) prod.classList.toggle('selected', category === 'productive');
  if (unprod) unprod.classList.toggle('selected', category === 'unproductive');
}

/** Threshold before FocusBoost was armed (seconds). */
let thresholdBeforeBoost = null;
const FOCUSBOOST_SEC = 3 * 60;
const reduceMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.getAttribute('data-tab');
    $('view-home').classList.toggle('hidden', tab !== 'home');
    $('view-apps').classList.toggle('hidden', tab !== 'apps');
    $('view-settings').classList.toggle('hidden', tab !== 'settings');
    if (tab === 'settings') loadRulesAndIgnore();
  });
});

const navToggle = $('nav-toggle');
if (navToggle) {
  navToggle.addEventListener('click', () => {
    document.body.classList.toggle('nav-collapsed');
    const collapsed = document.body.classList.contains('nav-collapsed');
    navToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    navToggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  });
}

$('banner-dismiss').addEventListener('click', () => $('banner').classList.add('hidden'));

function updateSourcePill(now) {
  if (!now) return;
  const pill = $('source-pill');
  const source = now.source || 'idle';
  const labels = {
    real: 'Live tracking',
    demo: 'Demo mode',
    idle: 'Waiting',
    'fallback-demo': 'Fallback'
  };
  pill.textContent = labels[source] || source;
  pill.className = 'status-pill ' + source;
  const hint = $('track-hint');
  if (!hint) return;
  if (now.ignored) {
    hint.textContent = 'System / shell / FocusFlow — shown in status but not logged.';
    hint.classList.remove('hidden');
  } else if (now.trackingError && source !== 'demo') {
    hint.textContent = 'Live window unavailable. ' + now.trackingError;
    hint.classList.remove('hidden');
  } else if (source === 'real') {
    hint.textContent = 'Live foreground tracking is on.';
    hint.classList.remove('hidden');
  } else if (source === 'demo') {
    hint.textContent = 'Demo simulator is on.';
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
}

function isBrowserApp(app) {
  const a = String(app || '').toLowerCase();
  return /chrome|msedge|\bedge\b|firefox|brave|opera|chromium/.test(a);
}

const KNOWN_SITE_KEYWORDS = [
  'github',
  'gitlab',
  'bitbucket',
  'stackoverflow',
  'stack overflow',
  'youtube',
  'reddit',
  'twitter',
  'facebook',
  'instagram',
  'tiktok',
  'netflix',
  'twitch',
  'discord',
  'notion',
  'obsidian',
  'figma',
  'linkedin',
  'gmail',
  'chatgpt',
  'openai',
  'slack',
  'zoom',
  'wikipedia',
  'medium',
  'hacker news',
  'x.com',
  'docs.google',
  'docs.microsoft',
  'learn.microsoft'
];

function stripBrowserSuffix(title) {
  return String(title || '')
    .replace(
      /\s*[-–—|]\s*(Google Chrome|Microsoft Edge|Mozilla Firefox|Brave|Opera|Chromium)\s*$/i,
      ''
    )
    .replace(/\s*[-–—]\s*(Chrome|Edge|Firefox|Brave|Opera)\s*$/i, '')
    .trim();
}

/** Extract a title keyword for browser quick-classify — never the process name. */
function extractBrowserKeyword(title) {
  const cleaned = stripBrowserSuffix(title);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();

  for (const site of KNOWN_SITE_KEYWORDS) {
    if (lower.includes(site)) {
      if (site === 'stack overflow') return 'stackoverflow';
      if (site === 'hacker news') return 'hacker news';
      return site;
    }
  }

  const domainMatch = cleaned.match(
    /\b(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|dev|co|app|ai|edu|gov)(?:\.[a-z]{2})?)\b/i
  );
  if (domainMatch) {
    const host = domainMatch[1].toLowerCase().replace(/^www\./, '');
    const parts = host.split('.');
    if (parts.length >= 2) {
      // github.com → github; docs.microsoft.com → microsoft (penultimate)
      return parts[parts.length - 2];
    }
    return host;
  }

  const segments = cleaned
    .split(/\s*[-–—|]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length) {
    const last = segments[segments.length - 1];
    const token = last
      .toLowerCase()
      .replace(/[^a-z0-9.\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (token) {
      const words = token.split(' ').filter(Boolean);
      if (words.length === 1) return words[0];
      if (words.length === 2) return token;
      return words[words.length - 1];
    }
  }
  return null;
}

function keywordForQuickClassify(entry) {
  if (!entry || !entry.app) return null;
  if (isBrowserApp(entry.app)) {
    return extractBrowserKeyword(entry.title || '');
  }
  return String(entry.app)
    .replace(/\.exe$/i, '')
    .trim() || null;
}

function updateLfKeywordHint(entry) {
  const hint = $('lf-keyword-hint');
  if (!hint) return;
  const kw = keywordForQuickClassify(entry);
  if (!kw) {
    hint.textContent = '';
    hint.classList.add('hidden');
    return;
  }
  hint.textContent = 'Adds keyword: ' + kw;
  hint.classList.remove('hidden');
}

function renderLastFocused(lf, now) {
  const appEl = $('lf-app');
  const titleEl = $('lf-title');
  const catEl = $('lf-cat');
  if (!appEl) return;

  // Prefer lastFocused (survives while FocusFlow is foreground); never show self as last focused
  const selfish =
    now &&
    (now.ignored ||
      /focusflow/i.test(now.app || '') ||
      (/electron/i.test(now.app || '') && /focusflow/i.test(now.title || '')));

  const use = lf || (!selfish && now && now.app ? now : null);
  if (!use || !use.app) {
    lastFocusedCache = null;
    appEl.textContent = 'Waiting for an app…';
    if (titleEl) titleEl.textContent = '';
    if (catEl) {
      catEl.textContent = '—';
      catEl.className = 'chip other';
    }
    updateLfKeywordHint(null);
    applyLfButtonOutlines(null);
    return;
  }
  lastFocusedCache = {
    app: use.app,
    title: use.title || '',
    category: use.category || 'other'
  };
  const oKey = lfOverrideKey(lastFocusedCache);
  if (oKey && lfSessionClass[oKey]) {
    lastFocusedCache.category = lfSessionClass[oKey];
  }
  appEl.textContent = use.app;
  if (titleEl) titleEl.textContent = use.title || '';
  if (catEl) {
    const cat = lastFocusedCache.category || 'other';
    catEl.textContent = cat;
    catEl.className = 'chip ' + cat;
  }
  applyLfButtonOutlines(lastFocusedCache.category);
  updateLfKeywordHint(lastFocusedCache);
}

function renderMood(stats) {
  const block = $('mood-block');
  if (!block) return;
  const mood = (stats && stats.mood) || { id: 'meh', emoji: '😐', label: 'Meh' };
  block.setAttribute('data-mood', mood.id || 'meh');
  const em = $('mood-emoji');
  const lab = $('mood-label');
  if (em) em.textContent = mood.emoji || '😐';
  if (lab) lab.textContent = mood.label || 'Meh';
}

function renderPie(stats) {
  const pie = $('pie-chart');
  if (!pie) return;
  const cats = (stats && stats.byCategory) || {};
  const prod = cats.productive || 0;
  const unp = cats.unproductive || 0;
  const oth = cats.other || 0;
  const total = prod + unp + oth;
  $('prod-val').textContent = fmt(prod);
  $('unprod-val').textContent = fmt(unp);
  $('other-val').textContent = fmt(oth);
  if ($('pie-total')) $('pie-total').textContent = fmt(total);

  if (total <= 0) {
    pie.style.background =
      'conic-gradient(rgba(148,163,184,0.25) 0deg 360deg)';
    return;
  }
  const pDeg = (prod / total) * 360;
  const uDeg = (unp / total) * 360;
  const oDeg = (oth / total) * 360;
  // other is muted; productive vs unproductive dominate the pie
  const g =
    'conic-gradient(' +
    '#34d399 0deg ' +
    pDeg +
    'deg,' +
    '#fb7185 ' +
    pDeg +
    'deg ' +
    (pDeg + uDeg) +
    'deg,' +
    'rgba(148,163,184,0.45) ' +
    (pDeg + uDeg) +
    'deg ' +
    (pDeg + uDeg + oDeg) +
    'deg)';
  pie.style.background = g;
}

function renderWeek(stats) {
  const wrap = $('week-bars');
  if (!wrap) return;
  const week = (stats && stats.week) || [];
  if (!week.length) {
    wrap.hidden = true;
    return;
  }
  let max = 1;
  for (const d of week) {
    const c = d.byCategory || {};
    max = Math.max(max, (c.productive || 0) + (c.unproductive || 0) + (c.other || 0));
  }
  wrap.hidden = false;
  wrap.innerHTML = week
    .map((d) => {
      const c = d.byCategory || {};
      const p = c.productive || 0;
      const u = c.unproductive || 0;
      const o = c.other || 0;
      const sum = p + u + o;
      const h = Math.max(4, Math.round((sum / max) * 48));
      const pH = sum ? Math.round((p / sum) * h) : 0;
      const uH = sum ? Math.round((u / sum) * h) : 0;
      const oH = Math.max(0, h - pH - uH);
      const label = (d.date || '').slice(5); // MM-DD
      return (
        '<div class="week-col" title="' +
        esc(d.date) +
        '">' +
        '<div class="week-stack" style="height:' +
        h +
        'px">' +
        '<div class="week-seg prod" style="height:' +
        pH +
        'px"></div>' +
        '<div class="week-seg unprod" style="height:' +
        uH +
        'px"></div>' +
        '<div class="week-seg other" style="height:' +
        oH +
        'px"></div>' +
        '</div>' +
        '<span class="week-label">' +
        esc(label) +
        '</span></div>'
      );
    })
    .join('');
}

function applySettingsInputs(settings) {
  if (applying) return;
  applying = true;
  if ($('demo-toggle')) $('demo-toggle').checked = !!settings.demoMode;
  const sec = Number(settings.thresholdSec) || 600;
  if ($('threshold-sec')) $('threshold-sec').value = sec;
  if ($('threshold-min')) $('threshold-min').value = Math.round((sec / 60) * 10) / 10;
  syncFocusBoostUi(settings);
  applying = false;
}

function syncFocusBoostUi(settings) {
  const btn = $('focusboost-btn');
  const shell = document.body;
  if (!btn) return;
  const armed =
    !!settings.focusBoost ||
    (Number(settings.thresholdSec) === FOCUSBOOST_SEC && settings._boostArmed);
  const on = !!settings.focusBoost;
  btn.setAttribute('data-boost', on ? 'on' : 'off');
  btn.classList.toggle('armed', on);
  shell.setAttribute('data-boost', on ? 'on' : 'off');
  const label = $('focusboost-label');
  if (label) label.textContent = on ? 'FocusBoost ON ⚡' : 'FocusBoost';
  if ($('thresh-label')) $('thresh-label').textContent = fmt(settings.thresholdSec || 600);
}

function playBoostFlash() {
  if (reduceMotion) return;
  let overlay = $('boost-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'boost-overlay';
    overlay.className = 'boost-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="boost-flash"><span class="boost-scan"></span><span class="boost-text">FOCUS BOOST</span><span class="boost-hex"></span></div>';
    document.body.appendChild(overlay);
  }
  overlay.classList.remove('play');
  // reflow
  void overlay.offsetWidth;
  overlay.classList.add('play');
  window.setTimeout(() => overlay.classList.remove('play'), 900);
}

function renderStats(stats) {
  if (!stats) return;
  renderMood(stats);
  renderPie(stats);
  renderWeek(stats);
  $('streak').textContent = fmt(stats.unproductiveStreak || 0);
  if (stats.settings) {
    $('thresh-label').textContent = fmt(stats.settings.thresholdSec || 600);
    applySettingsInputs(stats.settings);
    if (stats.dataDir && $('data-path')) $('data-path').textContent = stats.dataDir;
  }
  if (stats.date) $('date-label').textContent = 'Session date ' + stats.date;
  renderAppList(stats);
}

function renderAppList(stats) {
  const list = $('app-list');
  if (!list) return;
  const apps = (stats && stats.topApps) || [];
  if (!apps.length) {
    list.innerHTML = '<li class="empty">No time logged yet</li>';
    return;
  }
  list.innerHTML = apps
    .map((a) => {
      const name = esc(a.name);
      const raw = encodeURIComponent(a.name);
      return (
        '<li class="app-row">' +
        '<span class="app-name" title="' +
        name +
        '">' +
        name +
        '</span>' +
        '<span class="chip ' +
        a.category +
        '">' +
        a.category +
        '</span>' +
        '<span class="secs">' +
        fmt(a.seconds) +
        '</span>' +
        '<span class="reclass" data-app="' +
        raw +
        '">' +
        '<button type="button" class="btn-mini prod" data-action="productive" title="Mark productive">P</button>' +
        '<button type="button" class="btn-mini unprod" data-action="unproductive" title="Mark unproductive">U</button>' +
        '<button type="button" class="btn-mini ignore" data-action="ignore" title="Ignore">Ign</button>' +
        '</span>' +
        '</li>'
      );
    })
    .join('');
}

$('app-list').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn || !api) return;
  const wrap = btn.closest('.reclass');
  if (!wrap) return;
  const appName = decodeURIComponent(wrap.getAttribute('data-app') || '');
  if (!appName) return;
  const action = btn.getAttribute('data-action');
  btn.disabled = true;
  try {
    if (action === 'ignore') {
      const next = cachedIgnore.slice();
      const key = appName.trim().toLowerCase();
      if (!next.map((x) => x.toLowerCase()).includes(key)) next.push(appName.trim());
      const payload = await api.setIgnore(next);
      cachedIgnore = (payload && payload.ignore) || next;
      fillIgnoreEditor({ ignore: cachedIgnore, path: payload && payload.path, isCustom: true });
    } else if (action === 'productive' || action === 'unproductive') {
      const prod = (cachedRules.productive || []).slice();
      const unprod = (cachedRules.unproductive || []).slice();
      const key = appName.trim().toLowerCase();
      const strip = (arr) => arr.filter((k) => k.toLowerCase() !== key);
      let nextProd = strip(prod);
      let nextUnprod = strip(unprod);
      if (action === 'productive') nextProd.push(appName.trim());
      else nextUnprod.push(appName.trim());
      const next = await api.setRules({ productive: nextProd, unproductive: nextUnprod });
      cachedRules = {
        productive: (next && next.productive) || nextProd,
        unproductive: (next && next.unproductive) || nextUnprod
      };
      fillRulesEditors(next);
    }
  } catch (err) {
    console.warn('reclassify failed', err);
  } finally {
    btn.disabled = false;
  }
});

async function pushSettings(partial) {
  if (!api) return;
  applying = true;
  const next = await api.updateSettings(partial);
  applySettingsInputs(next);
  applying = false;
  return next;
}

if ($('demo-toggle')) {
  $('demo-toggle').addEventListener('change', () =>
    pushSettings({ demoMode: $('demo-toggle').checked })
  );
}
if ($('threshold-min')) {
  $('threshold-min').addEventListener('change', () => {
    const min = Number($('threshold-min').value);
    if (!Number.isFinite(min) || min <= 0) return;
    pushSettings({ thresholdSec: Math.round(min * 60), focusBoost: false });
  });
}
if ($('threshold-sec')) {
  $('threshold-sec').addEventListener('change', () => {
    const sec = Number($('threshold-sec').value);
    if (!Number.isFinite(sec) || sec <= 0) return;
    pushSettings({ thresholdSec: Math.round(sec), focusBoost: false });
  });
}

async function toggleFocusBoost() {
  if (!api) return;
  const state = await api.getState();
  const settings = (state && state.stats && state.stats.settings) || {};
  const on = !!settings.focusBoost;
  if (!on) {
    thresholdBeforeBoost =
      Number(settings.thresholdSec) && Number(settings.thresholdSec) !== FOCUSBOOST_SEC
        ? Number(settings.thresholdSec)
        : thresholdBeforeBoost || 600;
    const next = await pushSettings({
      focusBoost: true,
      thresholdSec: FOCUSBOOST_SEC,
      focusBoostRestoreSec: thresholdBeforeBoost
    });
    syncFocusBoostUi(
      next || {
        focusBoost: true,
        thresholdSec: FOCUSBOOST_SEC
      }
    );
    playBoostFlash();
  } else {
    const restore =
      Number(settings.focusBoostRestoreSec) || thresholdBeforeBoost || 600;
    const next = await pushSettings({
      focusBoost: false,
      thresholdSec: restore
    });
    syncFocusBoostUi(
      next || {
        focusBoost: false,
        thresholdSec: restore
      }
    );
  }
}

function linesToList(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fillRulesEditors(rules) {
  if (!rules) return;
  cachedRules = {
    productive: rules.productive || [],
    unproductive: rules.unproductive || []
  };
  if ($('rules-prod-edit')) $('rules-prod-edit').value = (rules.productive || []).join('\n');
  if ($('rules-unprod-edit')) $('rules-unprod-edit').value = (rules.unproductive || []).join('\n');
  if (rules.path && $('rules-path')) $('rules-path').textContent = rules.path;
  if ($('rules-custom-label')) {
    $('rules-custom-label').textContent = rules.isCustom ? '(custom)' : '(defaults)';
  }
}

function fillIgnoreEditor(payload) {
  const items = (payload && payload.ignore) || [];
  cachedIgnore = items.slice();
  const ta = $('ignore-edit');
  if (ta) ta.value = items.join('\n');
  if (payload && payload.path && $('ignore-path')) $('ignore-path').textContent = payload.path;
  const label = $('ignore-custom-label');
  if (label) label.textContent = payload && payload.isCustom ? '(custom)' : '(defaults)';
}

async function loadRulesAndIgnore() {
  if (!api) return;
  try {
    const rules = await api.getRules();
    fillRulesEditors(rules);
  } catch (err) {
    if ($('rules-status')) $('rules-status').textContent = 'Failed to load rules';
  }
  try {
    if (api.getIgnore) {
      const ign = await api.getIgnore();
      fillIgnoreEditor(ign);
    }
  } catch (_) {}
}

if ($('rules-save')) {
  $('rules-save').addEventListener('click', async () => {
    if (!api || !api.setRules) return;
    $('rules-status').textContent = 'Saving…';
    try {
      const next = await api.setRules({
        productive: linesToList($('rules-prod-edit').value),
        unproductive: linesToList($('rules-unprod-edit').value)
      });
      fillRulesEditors(next);
      $('rules-status').textContent = 'Saved — live now';
    } catch (err) {
      $('rules-status').textContent = 'Save failed';
    }
  });
}

if ($('rules-reset')) {
  $('rules-reset').addEventListener('click', async () => {
    if (!api || !api.resetRules) return;
    $('rules-status').textContent = 'Resetting…';
    try {
      const next = await api.resetRules();
      fillRulesEditors(next);
      $('rules-status').textContent = 'Defaults restored';
    } catch (err) {
      $('rules-status').textContent = 'Reset failed';
    }
  });
}

if ($('ignore-save')) {
  $('ignore-save').addEventListener('click', async () => {
    if (!api || !api.setIgnore) return;
    $('ignore-status').textContent = 'Saving…';
    try {
      const next = await api.setIgnore(linesToList($('ignore-edit').value));
      fillIgnoreEditor(next);
      $('ignore-status').textContent = 'Saved — live now';
    } catch (err) {
      $('ignore-status').textContent = 'Save failed';
    }
  });
}

if ($('ignore-reset')) {
  $('ignore-reset').addEventListener('click', async () => {
    if (!api || !api.resetIgnore) return;
    $('ignore-status').textContent = 'Resetting…';
    try {
      const next = await api.resetIgnore();
      fillIgnoreEditor(next);
      $('ignore-status').textContent = 'Defaults restored';
    } catch (err) {
      $('ignore-status').textContent = 'Reset failed';
    }
  });
}

if ($('data-export')) {
  $('data-export').addEventListener('click', async () => {
    if (!api || !api.exportData) return;
    $('data-status').textContent = 'Exporting…';
    try {
      const res = await api.exportData({
        includeSettings: true,
        includeRules: true,
        includeIgnore: true
      });
      if (res && res.canceled) $('data-status').textContent = 'Export canceled';
      else if (res && res.ok) $('data-status').textContent = 'Exported';
      else $('data-status').textContent = (res && res.error) || 'Export failed';
    } catch (err) {
      $('data-status').textContent = 'Export failed';
    }
  });
}

if ($('data-import')) {
  $('data-import').addEventListener('click', async () => {
    if (!api || !api.importData) return;
    $('data-status').textContent = 'Importing…';
    try {
      const res = await api.importData({ mode: 'merge' });
      if (res && res.canceled) $('data-status').textContent = 'Import canceled';
      else if (res && res.ok) {
        $('data-status').textContent = 'Imported ' + (res.daysImported || 0) + ' day(s)';
        const state = await api.getState();
        if (state) renderStats(state.stats);
        await loadRulesAndIgnore();
      } else $('data-status').textContent = (res && res.error) || 'Import failed';
    } catch (err) {
      $('data-status').textContent = 'Import failed';
    }
  });
}

if ($('data-clear-today')) {
  $('data-clear-today').addEventListener('click', async () => {
    if (!api || !api.clearToday) return;
    if (!confirm("Clear TODAY's tracked time?\n\nPermanently deletes today's stats on this device. No cloud backup. Cannot be undone.")) return;
    const res = await api.clearToday();
    if (res && res.ok) {
      $('data-status').textContent = 'Today cleared';
      renderStats(res.stats);
    }
  });
}

if ($('data-clear-all')) {
  $('data-clear-all').addEventListener('click', async () => {
    if (!api || !api.clearAllHistory) return;
    if (!confirm("CLEAR ALL HISTORY?\n\nDeletes today and every archived day on this device. No cloud backup. Cannot be undone.")) return;
    const res = await api.clearAllHistory();
    if (res && res.ok) {
      $('data-status').textContent = 'All history cleared';
      renderStats(res.stats);
    }
  });
}

async function boot() {
  if (!api) return;
  try {
    const state = await api.getState();
    if (state) {
      if (state.platform) $('platform-label').textContent = state.platform;
      updateSourcePill(state.now);
      renderLastFocused(state.lastFocused, state.now);
      renderStats(state.stats);
    }
  } catch (_) {}
  await loadRulesAndIgnore();
  api.onUpdate((payload) => {
    updateSourcePill(payload.now);
    renderLastFocused(payload.lastFocused, payload.now);
    renderStats(payload.stats);
  });
  api.onReminder((payload) => {
    $('banner').classList.remove('hidden');
    $('banner-text').textContent = payload.body || 'Time to refocus.';
  });
}

boot();

const focusBoostBtn = $('focusboost-btn');
if (focusBoostBtn) {
  focusBoostBtn.addEventListener('click', toggleFocusBoost);
}

async function quickClassifyLastFocused(category) {
  if (!api || !lastFocusedCache) return;
  const kw = keywordForQuickClassify(lastFocusedCache);
  if (!kw) return;
  const prod = (cachedRules.productive || []).slice();
  const unprod = (cachedRules.unproductive || []).slice();
  const key = kw.toLowerCase();
  const strip = (arr) => arr.filter((k) => String(k).toLowerCase() !== key);
  let nextProd = strip(prod);
  let nextUnprod = strip(unprod);
  if (category === 'productive') nextProd.push(kw);
  else nextUnprod.push(kw);
  try {
    const next = await api.setRules({ productive: nextProd, unproductive: nextUnprod });
    cachedRules = {
      productive: (next && next.productive) || nextProd,
      unproductive: (next && next.unproductive) || nextUnprod
    };
    fillRulesEditors(
      next || {
        productive: nextProd,
        unproductive: nextUnprod,
        isCustom: true
      }
    );
    lastFocusedCache.category = category;
    const oKey = lfOverrideKey(lastFocusedCache);
    if (oKey) lfSessionClass[oKey] = category;
    const catEl = $('lf-cat');
    if (catEl) {
      catEl.textContent = category;
      catEl.className = 'chip ' + category;
    }
    applyLfButtonOutlines(category);
  } catch (err) {
    console.warn('quick-classify failed', err);
  }
}

if ($('lf-prod')) {
  $('lf-prod').addEventListener('click', () => quickClassifyLastFocused('productive'));
}
if ($('lf-unprod')) {
  $('lf-unprod').addEventListener('click', () => quickClassifyLastFocused('unproductive'));
}
