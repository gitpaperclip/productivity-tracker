'use strict';

function fmt(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function $(id) { return document.getElementById(id); }

const api = window.focusflow;
let lastSettings = null;
let applying = false;

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.getAttribute('data-tab');
    $('view-dash').classList.toggle('hidden', tab !== 'dash');
    $('view-settings').classList.toggle('hidden', tab !== 'settings');
  });
});

$('banner-dismiss').addEventListener('click', () => {
  $('banner').classList.add('hidden');
});

function renderNow(now) {
  if (!now) return;
  $('now-app').textContent = now.app || 'Unknown';
  $('now-title').textContent = now.title || '';
  const cat = now.category || 'other';
  const catEl = $('now-cat');
  catEl.textContent = cat;
  catEl.className = 'cat ' + cat;
  $('now-elapsed').textContent = fmt(now.elapsedSec) + ' on this window';
  const pill = $('source-pill');
  pill.textContent = now.source || 'demo';
  pill.className = 'pill ' + (now.source || 'demo');
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
  $('prod-bar').style.width = (100 * prod / total) + '%';
  $('unprod-bar').style.width = (100 * unp / total) + '%';
  $('other-bar').style.width = (100 * oth / total) + '%';
  $('streak').textContent = fmt(stats.unproductiveStreak || 0);
  if (stats.settings) {
    $('thresh-label').textContent = fmt(stats.settings.thresholdSec || 600);
    applySettingsInputs(stats.settings);
    if (stats.dataDir) $('data-path').textContent = stats.dataDir;
  }

  const list = $('app-list');
  const apps = stats.topApps || [];
  if (!apps.length) {
    list.innerHTML = '<li class="empty">No time logged yet — keep the window open.</li>';
    return;
  }
  list.innerHTML = apps.map((a) => {
    return `<li>
      <span>${escapeHtml(a.name)}</span>
      <span class="cat ${a.category}">${a.category}</span>
      <span class="secs">${fmt(a.seconds)}</span>
    </li>`;
  }).join('');
}

function applySettingsInputs(settings) {
  if (applying) return;
  lastSettings = settings;
  applying = true;
  $('demo-toggle').checked = !!settings.demoMode;
  const sec = Number(settings.thresholdSec) || 600;
  $('threshold-sec').value = sec;
  $('threshold-min').value = Math.round((sec / 60) * 10) / 10;
  applying = false;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function pushSettings(partial) {
  if (!api) return;
  applying = true;
  const next = await api.updateSettings(partial);
  applySettingsInputs(next);
  applying = false;
}

$('demo-toggle').addEventListener('change', () => {
  pushSettings({ demoMode: $('demo-toggle').checked });
});

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

function renderRules(rules) {
  if (!rules) return;
  $('rules-prod').innerHTML = (rules.productive || []).map((k) => `<li>${escapeHtml(k)}</li>`).join('');
  $('rules-unprod').innerHTML = (rules.unproductive || []).map((k) => `<li>${escapeHtml(k)}</li>`).join('');
}

if (api) {
  api.onUpdate((payload) => {
    renderNow(payload.now);
    renderStats(payload.stats);
  });
  api.onReminder((payload) => {
    $('banner-text').textContent = payload.body || 'You have been unproductive too long. Time to refocus.';
    $('banner').classList.remove('hidden');
  });
  api.getState().then((s) => {
    if (s && s.stats) renderStats(s.stats);
  }).catch(() => {});
  api.getRules().then(renderRules).catch(() => {});
} else {
  $('now-title').textContent = 'Preload bridge missing — open via Electron, not a raw browser.';
}
