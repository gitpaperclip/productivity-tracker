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

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.getAttribute('data-tab');
    $('view-dash').classList.toggle('hidden', tab !== 'dash');
    $('view-settings').classList.toggle('hidden', tab !== 'settings');
    if (tab === 'settings') loadRulesAndIgnore();
  });
});

$('banner-dismiss').addEventListener('click', () => $('banner').classList.add('hidden'));

function renderNow(now) {
  if (!now) return;
  $('now-app').textContent = now.app || 'Unknown';
  $('now-title').textContent = now.title || '';
  const cat = now.category || 'other';
  const el = $('now-cat');
  el.textContent = cat;
  el.className = 'chip ' + cat;
  $('now-elapsed').textContent = fmt(now.elapsedSec);
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
  if (now.ignored) {
    hint.textContent = 'System / shell window — shown but not logged.';
    hint.classList.remove('hidden');
  } else if (now.trackingError && source !== 'demo') {
    hint.textContent = 'Live window unavailable. ' + now.trackingError;
    hint.classList.remove('hidden');
  } else if (source === 'real') {
    hint.textContent = 'Live Windows foreground tracking is on.';
    hint.classList.remove('hidden');
  } else if (source === 'demo') {
    hint.textContent = 'Demo simulator is on.';
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
}

function applySettingsInputs(settings) {
  if (applying) return;
  applying = true;
  $('demo-toggle').checked = !!settings.demoMode;
  const sec = Number(settings.thresholdSec) || 600;
  $('threshold-sec').value = sec;
  $('threshold-min').value = Math.round((sec / 60) * 10) / 10;
  applying = false;
}

function renderStats(stats) {
  if (!stats) return;
  const cats = stats.byCategory || {};
  const prod = cats.productive || 0;
  const unp = cats.unproductive || 0;
  const oth = cats.other || 0;
  const total = Math.max(1, prod + unp + oth);
  $('prod-val').textContent = fmt(prod);
  $('unprod-val').textContent = fmt(unp);
  $('other-val').textContent = fmt(oth);
  $('prod-bar').style.width = (100 * prod) / total + '%';
  $('unprod-bar').style.width = (100 * unp) / total + '%';
  $('other-bar').style.width = (100 * oth) / total + '%';
  $('streak').textContent = fmt(stats.unproductiveStreak || 0);
  if (stats.settings) {
    $('thresh-label').textContent = fmt(stats.settings.thresholdSec || 600);
    applySettingsInputs(stats.settings);
    if (stats.dataDir) $('data-path').textContent = stats.dataDir;
  }
  if (stats.date) $('date-label').textContent = 'Session date ' + stats.date;
  const list = $('app-list');
  const apps = stats.topApps || [];
  if (!apps.length) {
    list.innerHTML = '<li class="empty">No time logged yet</li>';
    return;
  }
  list.innerHTML = apps
    .map(
      (a) =>
        '<li><span>' +
        esc(a.name) +
        '</span><span class="chip ' +
        a.category +
        '">' +
        a.category +
        '</span><span class="secs">' +
        fmt(a.seconds) +
        '</span></li>'
    )
    .join('');
}

async function pushSettings(partial) {
  if (!api) return;
  applying = true;
  const next = await api.updateSettings(partial);
  applySettingsInputs(next);
  applying = false;
}

$('demo-toggle').addEventListener('change', () =>
  pushSettings({ demoMode: $('demo-toggle').checked })
);
$('threshold-min').addEventListener('change', () => {
  const min = Number($('threshold-min').value);
  if (!Number.isFinite(min) || min <= 0) return;
  pushSettings({ thresholdSec: Math.round(min * 60) });
});
$('threshold-sec').addEventListener('change', () => {
  const sec = Number($('threshold-sec').value);
  if (!Number.isFinite(sec) || sec <= 0) return;
  pushSettings({ thresholdSec: Math.round(sec) });
});

function linesToList(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fillRulesEditors(rules) {
  if (!rules) return;
  $('rules-prod-edit').value = (rules.productive || []).join('\n');
  $('rules-unprod-edit').value = (rules.unproductive || []).join('\n');
  if (rules.path) $('rules-path').textContent = rules.path;
  $('rules-custom-label').textContent = rules.isCustom ? '(custom)' : '(defaults)';
}

function fillIgnoreList(payload) {
  const list = $('ignore-list');
  const items = (payload && payload.ignore) || [];
  if (!items.length) {
    list.innerHTML = '<li class="empty">None</li>';
  } else {
    list.innerHTML = items.map((k) => '<li>' + esc(k) + '</li>').join('');
  }
  if (payload && payload.path) $('ignore-path').textContent = payload.path;
}

async function loadRulesAndIgnore() {
  if (!api) return;
  try {
    const rules = await api.getRules();
    fillRulesEditors(rules);
  } catch (err) {
    $('rules-status').textContent = 'Failed to load rules';
  }
  try {
    if (api.getIgnore) {
      const ign = await api.getIgnore();
      fillIgnoreList(ign);
    }
  } catch (_) {}
}

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

async function boot() {
  if (!api) return;
  try {
    const state = await api.getState();
    if (state) {
      if (state.platform) $('platform-label').textContent = state.platform;
      renderStats(state.stats);
    }
  } catch (_) {}
  await loadRulesAndIgnore();
  api.onUpdate((payload) => {
    renderNow(payload.now);
    renderStats(payload.stats);
  });
  api.onReminder((payload) => {
    $('banner').classList.remove('hidden');
    $('banner-text').textContent = payload.body || 'Time to refocus.';
  });
}

boot();
