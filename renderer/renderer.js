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

function fmtFriendly(s) {
  s = Math.max(0, Math.floor(+s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h >= 1) {
    const hp = h === 1 ? '1 hour' : h + ' hours';
    if (m <= 0) return hp;
    const mp = m === 1 ? '1 minute' : m + ' minutes';
    return hp + ' ' + mp;
  }
  if (m >= 1) {
    if (sec <= 0) return m === 1 ? '1 min' : m + ' min';
    const sp = sec === 1 ? '1 second' : sec + ' seconds';
    return (m === 1 ? '1 min' : m + ' min') + ' ' + sp;
  }
  if (sec <= 0) return '0 min';
  return sec === 1 ? '1 second' : sec + ' seconds';
}

/** Compact goal display: 1h 12m, 2h, 45m */
function fmtGoalShort(s) {
  s = Math.max(0, Math.floor(+s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 1) {
    if (m <= 0) return h + 'h';
    return h + 'h ' + m + 'm';
  }
  return m + 'm';
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

function setAppTrunc(el, text) {
  if (!el) return;
  const t = text == null ? '' : String(text);
  el.textContent = t;
  if (t && t !== '—' && t !== 'Waiting for an app…') {
    el.setAttribute('data-full', t);
    el.classList.add('app-trunc');
  } else {
    el.setAttribute('data-full', '');
  }
}

function hideNameTip() {
  const tip = $('name-tip');
  if (tip) tip.classList.add('hidden');
}

function showNameTip(ev) {
  const el = ev.target && ev.target.closest && ev.target.closest('.app-trunc');
  const tip = $('name-tip');
  if (!el || !tip) {
    hideNameTip();
    return;
  }
  const full = (el.getAttribute('data-full') || el.getAttribute('title') || el.textContent || '').trim();
  if (!full || full === '—' || full === 'Waiting for an app…') {
    hideNameTip();
    return;
  }
  // Only show when truncated (or always for long strings)
  const truncated = el.scrollWidth > el.clientWidth + 1 || full.length > 18;
  if (!truncated) {
    hideNameTip();
    return;
  }
  tip.innerHTML =
    '<div class="nt-label">Full name</div><div class="nt-full">' + esc(full) + '</div>';
  tip.classList.remove('hidden');
  const pad = 12;
  const tw = tip.offsetWidth || 200;
  const th = tip.offsetHeight || 60;
  let left = ev.clientX + 14;
  let top = ev.clientY + 14;
  if (left + tw > window.innerWidth - pad) left = ev.clientX - tw - 12;
  if (top + th > window.innerHeight - pad) top = ev.clientY - th - 10;
  tip.style.left = Math.max(pad, left) + 'px';
  tip.style.top = Math.max(pad, top) + 'px';
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
  const ign = $('lf-ignore');
  if (prod) prod.classList.toggle('selected', category === 'productive');
  if (unprod) unprod.classList.toggle('selected', category === 'unproductive');
  if (ign) ign.classList.toggle('selected', category === 'ignored');
}

function processNameForIgnore(entry) {
  if (!entry || !entry.app) return null;
  return (
    String(entry.app)
      .replace(/\.exe$/i, '')
      .trim() || null
  );
}

/** Threshold before FocusBoost was armed (seconds). */
let thresholdBeforeBoost = null;
const FOCUSBOOST_DEFAULT_SEC = 3 * 60;

function focusBoostSecFromSettings(settings) {
  const n = Number(settings && settings.focusBoostSec);
  if (Number.isFinite(n) && n >= 5) return Math.round(n);
  return FOCUSBOOST_DEFAULT_SEC;
}
const reduceMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Session-only Analytics segment (day | week | month | apps). */
let analyticsSegment = 'day';

const ANALYTICS_SUBTITLES = {
  day: 'Today’s hours',
  week: 'Last 7 days',
  month: 'This month',
  apps: 'Re-tag your top apps here.'
};

function setAnalyticsSegment(segment) {
  if (segment !== 'day' && segment !== 'week' && segment !== 'month' && segment !== 'apps') {
    segment = 'day';
  }
  analyticsSegment = segment;
  document.querySelectorAll('.segment-btn').forEach((b) => {
    const on = b.getAttribute('data-segment') === segment;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.analytics-panel').forEach((panel) => {
    const id = panel.getAttribute('data-panel') || panel.id.replace(/^panel-/, '');
    panel.classList.toggle('hidden', id !== segment);
  });
  const sub = $('analytics-subtitle');
  if (sub) sub.textContent = ANALYTICS_SUBTITLES[segment] || ANALYTICS_SUBTITLES.day;
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.getAttribute('data-tab');
    $('view-home').classList.toggle('hidden', tab !== 'home');
    const analyticsView = $('view-analytics');
    if (analyticsView) analyticsView.classList.toggle('hidden', tab !== 'analytics');
    const roundupView = $('view-roundup');
    if (roundupView) roundupView.classList.toggle('hidden', tab !== 'roundup');
    const tagsView = $('view-tags');
    if (tagsView) tagsView.classList.toggle('hidden', tab !== 'tags' && tab !== 'focus-tags');
    $('view-settings').classList.toggle('hidden', tab !== 'settings');
    if (tab === 'analytics') setAnalyticsSegment(analyticsSegment);
    if (tab === 'tags' || tab === 'focus-tags') loadRulesAndIgnore();
  });
});

document.querySelectorAll('.segment-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    setAnalyticsSegment(btn.getAttribute('data-segment') || 'day');
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

let bannerHideTimer = null;
function hideBanner() {
  const b = $('banner');
  if (b) b.classList.add('hidden');
  if (bannerHideTimer) {
    clearTimeout(bannerHideTimer);
    bannerHideTimer = null;
  }
}
function showBanner(text) {
  const b = $('banner');
  if (!b) return;
  if ($('banner-text')) $('banner-text').textContent = text || 'Time to refocus.';
  b.classList.remove('hidden');
  if (bannerHideTimer) clearTimeout(bannerHideTimer);
  bannerHideTimer = setTimeout(hideBanner, 15000);
}
$('banner-dismiss').addEventListener('click', hideBanner);

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
    setAppTrunc(appEl, 'Waiting for an app…');
    if (titleEl) setAppTrunc(titleEl, '');
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
  setAppTrunc(appEl, use.app);
  if (titleEl) setAppTrunc(titleEl, use.title || '');
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

/** Latest Home pie slice geometry + apps for hover tip. */
let pieHoverState = { total: 0, ends: [0, 0, 0], appsByCat: { productive: [], unproductive: [], other: [] } };

function appsForCategory(stats, category) {
  const apps = (stats && stats.topApps) || [];
  return apps
    .filter((a) => {
      const cat =
        a.category === 'productive' || a.category === 'unproductive' ? a.category : 'other';
      return cat === category;
    })
    .slice(0, 3);
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

  pieHoverState = {
    total,
    ends: [
      total ? (prod / total) * 360 : 0,
      total ? ((prod + unp) / total) * 360 : 0,
      360
    ],
    appsByCat: {
      productive: appsForCategory(stats, 'productive'),
      unproductive: appsForCategory(stats, 'unproductive'),
      other: appsForCategory(stats, 'other')
    }
  };
  pie.classList.toggle('has-data', total > 0);

  if (total <= 0) {
    pie.style.background =
      'conic-gradient(rgba(148,163,184,0.25) 0deg 360deg)';
    hidePieTip();
    return;
  }
  const pDeg = (prod / total) * 360;
  const uDeg = (unp / total) * 360;
  const oDeg = (oth / total) * 360;
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

function hidePieTip() {
  const tip = $('pie-tip');
  if (tip) tip.classList.add('hidden');
}

function categoryFromPieAngle(deg) {
  const ends = pieHoverState.ends || [0, 0, 360];
  if (deg < ends[0]) return 'productive';
  if (deg < ends[1]) return 'unproductive';
  return 'other';
}

function showPieTip(ev) {
  const pie = $('pie-chart');
  const tip = $('pie-tip');
  const wrap = pie && pie.closest('.pie-wrap');
  if (!pie || !tip || !wrap || pieHoverState.total <= 0) {
    hidePieTip();
    return;
  }
  const rect = pie.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = ev.clientX - cx;
  const dy = ev.clientY - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const inner = Math.min(rect.width, rect.height) * 0.22;
  const outer = Math.min(rect.width, rect.height) / 2;
  if (dist < inner || dist > outer) {
    hidePieTip();
    return;
  }
  // CSS conic-gradient 0deg is 12 o'clock, clockwise
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  const cat = categoryFromPieAngle(deg);
  const apps = pieHoverState.appsByCat[cat] || [];
  const title =
    cat === 'productive' ? 'Productive' : cat === 'unproductive' ? 'Unproductive' : 'Other';
  let body;
  if (!apps.length) {
    body = '<div class="pt-empty">No apps in this slice yet</div>';
  } else {
    body =
      '<ul>' +
      apps
        .map(
          (a) =>
            '<li><span class="pt-name app-trunc" data-full="' +
            esc(a.name) +
            '">' +
            esc(a.name) +
            '</span><span class="pt-secs">' +
            fmt(a.seconds) +
            '</span></li>'
        )
        .join('') +
      '</ul>';
  }
  tip.innerHTML = '<div class="pt-cat ' + cat + '">' + title + ' · top apps</div>' + body;
  tip.classList.remove('hidden');
  const wrapRect = wrap.getBoundingClientRect();
  let left = ev.clientX - wrapRect.left + 14;
  let top = ev.clientY - wrapRect.top + 14;
  tip.style.left = '0px';
  tip.style.top = '0px';
  const tw = tip.offsetWidth || 160;
  const th = tip.offsetHeight || 80;
  if (left + tw > wrapRect.width - 4) left = ev.clientX - wrapRect.left - tw - 12;
  if (top + th > wrapRect.height - 4) top = ev.clientY - wrapRect.top - th - 8;
  tip.style.left = Math.max(4, left) + 'px';
  tip.style.top = Math.max(4, top) + 'px';
}


function renderHomeWeekBars(stats) {
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

function formatWeekDateLabel(iso) {
  const raw = String(iso || '');
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw.slice(5) || raw || '—';
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(dt.getTime())) return raw.slice(5);
  try {
    return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch (_) {
    return raw.slice(5);
  }
}

function weekTickLabel(iso) {
  const raw = String(iso || '');
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw.slice(5) || '';
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(dt.getTime())) return raw.slice(5);
  try {
    return dt.toLocaleDateString(undefined, { weekday: 'short' });
  } catch (_) {
    return raw.slice(5);
  }
}

function renderWeek(stats) {
  renderHomeWeekBars(stats);
  const chart = $('week-chart');
  if (!chart) return;
  const week = Array.isArray(stats && stats.week) ? stats.week : [];

  if (analyticsSegment === 'week') {
    const sub = $('analytics-subtitle');
    if (sub) sub.textContent = ANALYTICS_SUBTITLES.week;
  }

  const setMetrics = (bestVal, bestSub, totalVal, totalSub, shareVal, shareSub) => {
    const bv = $('week-best-value');
    const bs = $('week-best-sub');
    const tv = $('week-total');
    const ts = $('week-total-sub');
    const sv = $('week-focus-share');
    const ss = $('week-focus-sub');
    if (bv) bv.textContent = bestVal;
    if (bs) bs.textContent = bestSub;
    if (tv) tv.textContent = totalVal;
    if (ts) ts.textContent = totalSub;
    if (sv) sv.textContent = shareVal;
    if (ss) ss.textContent = shareSub;
  };

  if (!week.length) {
    chart.innerHTML = '<div class="week-empty muted">No week data yet</div>';
    setMetrics('—', 'No productive time yet', '0 min', 'All categories · last 7 days', '—', 'Of productive + unproductive');
    return;
  }

  let max = 0;
  let total = 0;
  let prodSum = 0;
  let unpSum = 0;
  let bestIdx = -1;
  let bestProd = -1;
  const days = week.map((d) => {
    const c = (d && d.byCategory) || {};
    const apps = Array.isArray(d && d.topApps) ? d.topApps : [];
    return {
      date: (d && d.date) || '',
      productive: Math.max(0, Number(c.productive) || 0),
      unproductive: Math.max(0, Number(c.unproductive) || 0),
      other: Math.max(0, Number(c.other) || 0),
      topApps: apps
        .map((a) => ({
          name: a.name,
          seconds: Math.max(0, Number(a.seconds) || 0),
          category: a.category || 'other'
        }))
        .filter((a) => a.seconds > 0)
        .slice(0, 3)
    };
  });

  for (let i = 0; i < days.length; i++) {
    const h = days[i];
    const sum = h.productive + h.unproductive + h.other;
    total += sum;
    prodSum += h.productive;
    unpSum += h.unproductive;
    if (sum > max) max = sum;
    if (h.productive > bestProd) {
      bestProd = h.productive;
      bestIdx = i;
    }
  }
  if (max < 1) max = 1;

  weekHoverDays = days.map((h) => ({
    date: h.date,
    label: formatWeekDateLabel(h.date),
    productive: h.productive,
    unproductive: h.unproductive,
    other: h.other,
    topApps: Array.isArray(h.topApps) ? h.topApps.slice(0, 3) : []
  }));
  hideChartTip('week-tip');
  chart.innerHTML = days
    .map((h, i) => {
      const sum = h.productive + h.unproductive + h.other;
      const empty = sum <= 0;
      const trackPct = empty ? 0 : Math.max(6, Math.round((sum / max) * 100));
      const pPct = sum ? (h.productive / sum) * 100 : 0;
      const uPct = sum ? (h.unproductive / sum) * 100 : 0;
      const oPct = sum ? (h.other / sum) * 100 : 0;
      const tick = weekTickLabel(h.date);
      const stack = empty
        ? '<div class="day-stack empty-slot" aria-hidden="true"></div>'
        : '<div class="day-stack">' +
          '<div class="day-seg prod" style="height:' +
          pPct +
          '%"></div>' +
          '<div class="day-seg unprod" style="height:' +
          uPct +
          '%"></div>' +
          '<div class="day-seg other" style="height:' +
          oPct +
          '%"></div>' +
          '</div>';
      return (
        '<div class="day-col' +
        (empty ? ' empty' : '') +
        '" data-day="' +
        i +
        '" style="--bar-h:' +
        trackPct +
        '%">' +
        stack +
        '<span class="day-tick">' +
        esc(tick) +
        '</span></div>'
      );
    })
    .join('');

  if (total <= 0) {
    setMetrics('—', 'No productive time yet', '0 min', 'All categories · last 7 days', '—', 'Of productive + unproductive');
    return;
  }

  const bestVal = bestProd > 0 ? fmtFriendly(bestProd) : '—';
  const bestSub =
    bestProd > 0 && bestIdx >= 0
      ? formatWeekDateLabel(days[bestIdx].date)
      : 'No productive time yet';
  const focusDenom = prodSum + unpSum;
  let focusShare = '—';
  let focusSub = 'Of productive + unproductive';
  if (focusDenom > 0) {
    focusShare = Math.round((prodSum / focusDenom) * 100) + '%';
    focusSub = fmtFriendly(prodSum) + ' productive · ' + fmtFriendly(unpSum) + ' unproductive';
  }
  setMetrics(
    bestVal,
    bestSub,
    fmtFriendly(total),
    'All categories · last 7 days',
    focusShare,
    focusSub
  );
}

function applySettingsInputs(settings) {
  if (applying) return;
  applying = true;
  const sec = Number(settings.thresholdSec) || 600;
  if ($('threshold-min')) $('threshold-min').value = Math.round((sec / 60) * 10) / 10;
  const fbSec = focusBoostSecFromSettings(settings);
  if ($('focusboost-min') && document.activeElement !== $('focusboost-min')) {
    $('focusboost-min').value = Math.round((fbSec / 60) * 10) / 10;
  }
  if ($('reminder-message') && document.activeElement !== $('reminder-message')) {
    $('reminder-message').value = settings.reminderMessage || "You've been on {app} for a while... maybe it's time to get back?";
  }
  if ($('focusboost-message') && document.activeElement !== $('focusboost-message')) {
    $('focusboost-message').value =
      settings.focusBoostReminderMessage || "Hey! focusboost is enabled. Maybe it's time to refocus?";
  }
  let goalSec = Number(settings.dailyGoalSec);
  if (!Number.isFinite(goalSec) || goalSec <= 0) goalSec = 7200;
  const hoursVal = Math.round((goalSec / 3600) * 100) / 100;
  if ($('daily-goal-hours') && document.activeElement !== $('daily-goal-hours')) {
    $('daily-goal-hours').value = hoursVal;
  }
  syncFocusBoostUi(settings);
  applying = false;
}

function syncFocusBoostUi(settings) {
  const btn = $('focusboost-btn');
  const shell = document.body;
  if (!btn) return;
  const boostSec = focusBoostSecFromSettings(settings);
  const armed =
    !!settings.focusBoost ||
    (Number(settings.thresholdSec) === boostSec && settings._boostArmed);
  const on = !!settings.focusBoost;
  btn.setAttribute('data-boost', on ? 'on' : 'off');
  btn.classList.toggle('armed', on);
  shell.setAttribute('data-boost', on ? 'on' : 'off');
  const label = $('focusboost-label');
  if (label && !label.querySelector('.fb-focus')) {
    label.innerHTML = '<span class="fb-focus">focus</span><span class="fb-boost">boost</span>';
  }
  const waitLabel = boostSec < 60 ? boostSec + 's' : Math.round((boostSec / 60) * 10) / 10 + ' min';
  btn.title = on
    ? 'focusboost on · ~' + waitLabel + ' reminder'
    : 'focusboost · ~' + waitLabel + ' reminder';
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

function playBoostKick() {
  if (reduceMotion) return;
  let kick = $('boost-kick');
  if (!kick) {
    kick = document.createElement('div');
    kick.id = 'boost-kick';
    kick.className = 'boost-kick';
    kick.setAttribute('aria-hidden', 'true');
    document.body.appendChild(kick);
  }
  kick.classList.remove('play');
  void kick.offsetWidth;
  kick.classList.add('play');
  window.setTimeout(() => kick.classList.remove('play'), 520);
}

/** Physical button feedback: hard hit on arm, soft settle on disarm. */
function playFocusBoostFeel(arming) {
  if (reduceMotion) return;
  const btn = $('focusboost-btn');
  if (btn) {
    btn.classList.remove('fb-hit', 'fb-settle');
    void btn.offsetWidth;
    btn.classList.add(arming ? 'fb-hit' : 'fb-settle');
    window.setTimeout(
      () => btn.classList.remove('fb-hit', 'fb-settle'),
      arming ? 480 : 320
    );
  }
  if (arming) {
    playBoostFlash();
    playBoostKick();
  }
}


function hourLabel(h) {
  const end = (h + 1) % 24;
  const pad = (n) => String(n).padStart(2, '0');
  return pad(h) + ':00–' + pad(end) + ':00';
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

function normalizeByHour(raw) {
  const zeros = () => ({ productive: 0, unproductive: 0, other: 0, topApps: [] });
  if (!Array.isArray(raw) || raw.length !== 24) {
    return Array.from({ length: 24 }, zeros);
  }
  return raw.map((h) => {
    const o = h && typeof h === 'object' ? h : {};
    return {
      productive: Math.max(0, Number(o.productive) || 0),
      unproductive: Math.max(0, Number(o.unproductive) || 0),
      other: Math.max(0, Number(o.other) || 0),
      topApps: topAppsFromByApp(o.byApp, 3)
    };
  });
}

let dayHoverHours = [];
let weekHoverDays = [];

function hideChartTip(id) {
  const tip = $(id);
  if (tip) tip.classList.add('hidden');
}

function placeChartTip(tip, wrap, clientX, clientY) {
  if (!tip || !wrap) return;
  tip.classList.remove('hidden');
  const wrapRect = wrap.getBoundingClientRect();
  let left = clientX - wrapRect.left + 14;
  let top = clientY - wrapRect.top + 14;
  tip.style.left = '0px';
  tip.style.top = '0px';
  const tw = tip.offsetWidth || 180;
  const th = tip.offsetHeight || 90;
  if (left + tw > wrapRect.width - 4) left = clientX - wrapRect.left - tw - 12;
  if (top + th > wrapRect.height - 4) top = clientY - wrapRect.top - th - 8;
  tip.style.left = Math.max(4, left) + 'px';
  tip.style.top = Math.max(4, top) + 'px';
}

function tipAppsHtml(apps) {
  if (!apps || !apps.length) {
    return '<div class="pt-empty">No apps logged in this slice yet</div>';
  }
  return (
    '<ul>' +
    apps
      .map(
        (a) =>
          '<li><span class="pt-name app-trunc" data-full="' +
            esc(a.name) +
            '">' +
            esc(a.name) +
            '</span><span class="pt-secs">' +
          fmt(a.seconds) +
          '</span></li>'
      )
      .join('') +
    '</ul>'
  );
}

function showDayChartTip(ev) {
  const chart = $('day-chart');
  const tip = $('day-tip');
  const wrap = chart && chart.closest('.chart-tip-wrap');
  const col = ev.target.closest && ev.target.closest('.day-col');
  if (!chart || !tip || !wrap || !col || col.classList.contains('empty')) {
    hideChartTip('day-tip');
    return;
  }
  const idx = Number(col.getAttribute('data-hour'));
  const h = dayHoverHours[idx];
  if (!h) {
    hideChartTip('day-tip');
    return;
  }
  const sum = h.productive + h.unproductive + h.other;
  const head =
    hourLabel(idx) +
    ' · ' +
    fmtFriendly(sum) +
    ' tracked';
  const meta =
    '<div class="pt-empty" style="margin-bottom:6px">P ' +
    fmt(h.productive) +
    ' · U ' +
    fmt(h.unproductive) +
    ' · O ' +
    fmt(h.other) +
    '</div>';
  tip.innerHTML =
    '<div class="pt-cat">Hour · top apps</div>' + meta + tipAppsHtml(h.topApps);
  placeChartTip(tip, wrap, ev.clientX, ev.clientY);
}

function showWeekChartTip(ev) {
  const chart = $('week-chart');
  const tip = $('week-tip');
  const wrap = chart && chart.closest('.chart-tip-wrap');
  const col = ev.target.closest && ev.target.closest('.day-col');
  if (!chart || !tip || !wrap || !col || col.classList.contains('empty')) {
    hideChartTip('week-tip');
    return;
  }
  const idx = Number(col.getAttribute('data-day'));
  const d = weekHoverDays[idx];
  if (!d) {
    hideChartTip('week-tip');
    return;
  }
  const sum = d.productive + d.unproductive + d.other;
  const head = (d.label || d.date || 'Day') + ' · ' + fmtFriendly(sum) + ' tracked';
  const meta =
    '<div class="pt-empty" style="margin-bottom:6px">P ' +
    fmt(d.productive) +
    ' · U ' +
    fmt(d.unproductive) +
    ' · O ' +
    fmt(d.other) +
    '</div>';
  tip.innerHTML =
    '<div class="pt-cat">' +
    esc(head) +
    '</div>' +
    meta +
    tipAppsHtml(d.topApps);
  placeChartTip(tip, wrap, ev.clientX, ev.clientY);
}

function renderDay(stats) {
  const chart = $('day-chart');
  if (!chart) return;
  const hours = normalizeByHour(stats && stats.byHour);
  let max = 0;
  let total = 0;
  let peakHour = -1;
  let peakProd = -1;
  for (let i = 0; i < 24; i++) {
    const h = hours[i];
    const sum = h.productive + h.unproductive + h.other;
    total += sum;
    if (sum > max) max = sum;
    if (h.productive > peakProd) {
      peakProd = h.productive;
      peakHour = i;
    }
  }
  if (max < 1) max = 1;

  if (analyticsSegment === 'day') {
    const sub = $('analytics-subtitle');
    if (sub) {
      sub.textContent =
        stats && stats.date ? 'Today’s hours · ' + stats.date : ANALYTICS_SUBTITLES.day;
    }
  }

  dayHoverHours = hours;
  hideChartTip('day-tip');
  chart.innerHTML = hours
    .map((h, i) => {
      const sum = h.productive + h.unproductive + h.other;
      const empty = sum <= 0;
      const trackPct = empty ? 0 : Math.max(6, Math.round((sum / max) * 100));
      const pPct = sum ? (h.productive / sum) * 100 : 0;
      const uPct = sum ? (h.unproductive / sum) * 100 : 0;
      const oPct = sum ? (h.other / sum) * 100 : 0;
      const tick = i % 3 === 0 ? String(i) : '';
      const stack = empty
        ? '<div class="day-stack empty-slot" aria-hidden="true"></div>'
        : '<div class="day-stack">' +
          '<div class="day-seg prod" style="height:' +
          pPct +
          '%"></div>' +
          '<div class="day-seg unprod" style="height:' +
          uPct +
          '%"></div>' +
          '<div class="day-seg other" style="height:' +
          oPct +
          '%"></div>' +
          '</div>';
      return (
        '<div class="day-col' +
        (empty ? ' empty' : '') +
        '" data-hour="' +
        i +
        '" style="--bar-h:' +
        trackPct +
        '%">' +
        stack +
        '<span class="day-tick">' +
        tick +
        '</span></div>'
      );
    })
    .join('');

  const peakVal = $('day-peak-value');
  const peakSub = $('day-peak-sub');
  if (peakVal) {
    peakVal.textContent = peakProd > 0 ? fmtFriendly(peakProd) : '—';
  }
  if (peakSub) {
    peakSub.textContent = peakProd > 0 ? hourLabel(peakHour) : 'No productive time yet';
  }
  const totalEl = $('day-total');
  if (totalEl) totalEl.textContent = fmtFriendly(total);
  const totalSub = $('day-total-sub');
  if (totalSub) totalSub.textContent = 'All categories today';

  let focusShare = '—';
  let focusSub = 'Of productive + unproductive';
  let prodSum = 0;
  let unpSum = 0;
  for (let i = 0; i < 24; i++) {
    prodSum += hours[i].productive;
    unpSum += hours[i].unproductive;
  }
  const focusDenom = prodSum + unpSum;
  if (focusDenom > 0) {
    const pct = Math.round((prodSum / focusDenom) * 100);
    focusShare = pct + '%';
    focusSub = fmtFriendly(prodSum) + ' productive · ' + fmtFriendly(unpSum) + ' unproductive';
  }
  const shareEl = $('day-focus-share');
  if (shareEl) shareEl.textContent = focusShare;
  const shareSub = $('day-focus-sub');
  if (shareSub) shareSub.textContent = focusSub;
}


function formatRoundupDate(dateKey) {
  if (!dateKey) return 'Today';
  const parts = String(dateKey).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return 'Today';
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  try {
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  } catch (_) {
    return dateKey;
  }
}

function roundupHeadlines(moodId, hit, thin) {
  if (thin) {
    return {
      headline: 'Quiet start',
      sub: 'Not enough tracked time yet for a full wrap. Keep working — Roundup fills in as the day goes.'
    };
  }
  if (hit) {
    const map = {
      thriving: ['Goal crushed', 'You killed it today! 🥳'],
      focused: ['Goal hit', 'Solid focus day — you met the productive target.'],
      meh: ['Goal hit, mixed vibe', 'You made the productive goal even if the mix wasn’t perfect.'],
      distracted: ['Goal hit, rough edges', 'You still cleared the target despite some drift.'],
      doomscroll: ['Goal hit somehow', 'Productive target cleared — maybe tighten Focus Tags next.']
    };
    const row = map[moodId] || map.meh;
    return { headline: row[0], sub: row[1] };
  }
  const map = {
    thriving: ['Almost there', "Let's finish strong! 💪"],
    focused: ['Close call', 'Good focus day. Nudge the goal or keep stacking productive time.'],
    meh: ['Mixed day', 'Some focus, some drift. Tags and FocusBoost can tighten tomorrow.'],
    distracted: ['Drift day', 'Unproductive time led. Tag distractions and arm FocusBoost.'],
    doomscroll: ['Doomscroll o’clock', 'Heavy unproductive stretch. Reset with Focus Tags + Boost.']
  };
  const row = map[moodId] || map.meh;
  return { headline: row[0], sub: row[1] };
}

function renderRoundup(stats) {
  if (!$('view-roundup')) return;
  const cats = (stats && stats.byCategory) || {};
  const prod = Math.max(0, Number(cats.productive) || 0);
  const unp = Math.max(0, Number(cats.unproductive) || 0);
  const oth = Math.max(0, Number(cats.other) || 0);
  const total = prod + unp + oth;
  const thin = total < 60;
  const mood = (stats && stats.mood) || { id: 'meh', emoji: '😐', label: 'Meh' };
  const settings = (stats && stats.settings) || {};
  let goalSec = Number(settings.dailyGoalSec);
  if (!Number.isFinite(goalSec) || goalSec <= 0) goalSec = 7200;
  const pct = Math.min(100, Math.round((prod / goalSec) * 100));
  const hit = prod >= goalSec;
  const left = Math.max(0, goalSec - prod);

  const dateEl = $('roundup-date');
  if (dateEl) dateEl.textContent = formatRoundupDate(stats && stats.date);

  const hero = $('roundup-hero');
  if (hero) hero.setAttribute('data-mood', mood.id || 'meh');
  if ($('roundup-emoji')) $('roundup-emoji').textContent = mood.emoji || '😐';
  const copy = roundupHeadlines(mood.id || 'meh', hit, thin);
  if ($('roundup-headline')) $('roundup-headline').textContent = copy.headline;
  if ($('roundup-sub')) $('roundup-sub').textContent = copy.sub;

  const goalCard = $('roundup-goal-card');
  if (goalCard) goalCard.setAttribute('data-hit', thin ? 'na' : hit ? 'yes' : 'no');
  if ($('roundup-goal-status')) {
    $('roundup-goal-status').textContent = thin ? 'Warming up' : hit ? 'Hit' : 'In progress';
  }
  if ($('roundup-goal-value')) {
    $('roundup-goal-value').textContent = fmtGoalShort(prod) + ' / ' + fmtGoalShort(goalSec);
  }
  if ($('roundup-goal-pct')) $('roundup-goal-pct').textContent = pct + '%';
  const fill = $('roundup-goal-fill');
  const bar = $('roundup-goal-bar');
  if (fill) fill.style.width = pct + '%';
  if (bar) bar.setAttribute('aria-valuenow', String(pct));
  if ($('roundup-goal-note')) {
    $('roundup-goal-note').textContent = thin
      ? 'Change the target in Settings.'
      : hit
        ? 'Nice — productive goal cleared. Tweak it anytime in Settings.'
        : fmtGoalShort(left) + ' productive left · change target in Settings.';
  }

  const apps = (stats && stats.topApps) || [];
  const topP = apps.find((a) => a.category === 'productive');
  const topU = apps.find((a) => a.category === 'unproductive');
  setAppTrunc($('ru-top-focus'), topP ? topP.name : '—');
  if ($('ru-top-focus-sub')) {
    $('ru-top-focus-sub').textContent = topP
      ? fmtFriendly(topP.seconds) + ' productive'
      : 'No productive apps yet';
  }
  setAppTrunc($('ru-distract'), topU ? topU.name : '—');
  if ($('ru-distract-sub')) {
    $('ru-distract-sub').textContent = topU
      ? fmtFriendly(topU.seconds) + ' unproductive'
      : 'No unproductive apps yet';
  }
  const hours = normalizeByHour(stats && stats.byHour);
  let peakHour = -1;
  let peakProd = -1;
  for (let i = 0; i < 24; i++) {
    if (hours[i].productive > peakProd) {
      peakProd = hours[i].productive;
      peakHour = i;
    }
  }
  if ($('ru-peak')) {
    $('ru-peak').textContent = peakProd > 0 ? hourLabel(peakHour) : '—';
  }
  if ($('ru-peak-sub')) {
    $('ru-peak-sub').textContent =
      peakProd > 0 ? fmtFriendly(peakProd) + ' productive' : 'Most productive hour';
  }

  const denom = prod + unp;
  if ($('ru-share')) {
    $('ru-share').textContent = denom > 0 ? Math.round((prod / denom) * 100) + '%' : '—';
  }
  if ($('ru-share-sub')) {
    $('ru-share-sub').textContent =
      denom > 0
        ? fmtFriendly(prod) + ' productive · ' + fmtFriendly(unp) + ' unproductive'
        : 'Of productive + unproductive';
  }

  const story = $('roundup-story');
  if (story) {
    if (thin) {
      story.textContent =
        'Start using apps and Roundup will write a short wrap for today.';
      story.classList.add('muted');
    } else {
      const lines = [];
      if (topP) {
        lines.push(
          'Most of your deep work was in <span class="story-app story-app-prod app-trunc" data-full="' +
            esc(topP.name) +
            '">' +
            esc(topP.name) +
            '</span>.'
        );
      }
      if (topU) {
        lines.push(
          '<span class="story-app story-app-unprod app-trunc" data-full="' +
            esc(topU.name) +
            '">' +
            esc(topU.name) +
            '</span> led distractions.'
        );
      }
      if (hit) {
        lines.push(
          'Daily productivity goal: <span class="story-goal story-goal-hit">cleared</span>.'
        );
      } else {
        const leftRatio = goalSec > 0 ? left / goalSec : 1;
        let goalTone = 'far';
        if (leftRatio <= 0.25) goalTone = 'near';
        else if (leftRatio <= 0.55) goalTone = 'mid';
        lines.push(
          'Daily productivity goal: <span class="story-goal story-goal-' +
            goalTone +
            '">' +
            esc(fmtGoalShort(left)) +
            '</span> to go.'
        );
      }
      if (!lines.length) {
        story.textContent = 'Keep going — Roundup will fill in as Focus Tags learn your day.';
        story.classList.add('muted');
      } else {
        story.innerHTML = lines.map((l) => '<p class="story-line">' + l + '</p>').join('');
        story.classList.remove('muted');
      }
    }
  }
}

function renderStats(stats) {
  if (!stats) return;
  renderMood(stats);
  renderPie(stats);
  renderWeek(stats);
  renderDay(stats);
  renderRoundup(stats);
  $('streak').textContent = fmt(stats.unproductiveStreak || 0);
  if (stats.settings) {
    $('thresh-label').textContent = fmt(stats.settings.thresholdSec || 600);
    applySettingsInputs(stats.settings);
    if (stats.dataDir && $('data-path')) $('data-path').textContent = stats.dataDir;
  }
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
        '<span class="app-name app-trunc" data-full="' +
        name +
        '" title="' +
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
        '<button type="button" class="btn-mini ignore" data-action="ignore" title="Ignore">ign</button>' +
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

if ($('threshold-min')) {
  $('threshold-min').addEventListener('change', () => {
    const min = Number($('threshold-min').value);
    if (!Number.isFinite(min) || min <= 0) return;
    pushSettings({ thresholdSec: Math.round(min * 60), focusBoost: false });
  });
}
if ($('focusboost-min')) {
  $('focusboost-min').addEventListener('change', async () => {
    const min = Number($('focusboost-min').value);
    if (!Number.isFinite(min) || min <= 0) return;
    const rounded = Math.max(5, Math.round(min * 60));
    const state = api && (await api.getState().catch(() => null));
    const settings = (state && state.stats && state.stats.settings) || {};
    const partial = { focusBoostSec: rounded };
    // If boost is armed, also retarget the live threshold
    if (settings.focusBoost) partial.thresholdSec = rounded;
    const next = await pushSettings(partial);
    syncFocusBoostUi(next || Object.assign({}, settings, partial));
  });
}
if ($('reminder-message')) {
  const saveReminderMsg = () => {
    const text = String($('reminder-message').value || '').trim() || "You've been on {app} for a while... maybe it's time to get back?";
    pushSettings({ reminderMessage: text });
  };
  $('reminder-message').addEventListener('change', saveReminderMsg);
  $('reminder-message').addEventListener('blur', saveReminderMsg);
}
if ($('focusboost-message')) {
  const saveBoostMsg = () => {
    const text =
      String($('focusboost-message').value || '').trim() || "Hey! focusboost is enabled. Maybe it's time to refocus?";
    pushSettings({ focusBoostReminderMessage: text });
  };
  $('focusboost-message').addEventListener('change', saveBoostMsg);
  $('focusboost-message').addEventListener('blur', saveBoostMsg);
}

function clampGoalHours(h) {
  if (!Number.isFinite(h) || h <= 0) return null;
  return Math.min(16, Math.max(0.25, Math.round(h * 100) / 100));
}

async function persistDailyGoalHours(hours) {
  const h = clampGoalHours(hours);
  if (h == null) return;
  const sec = Math.round(h * 3600);
  return pushSettings({ dailyGoalSec: sec });
}


if ($('daily-goal-hours')) {
  $('daily-goal-hours').addEventListener('change', () => {
    persistDailyGoalHours(Number($('daily-goal-hours').value));
  });
}

async function toggleFocusBoost() {
  if (!api) return;
  const state = await api.getState();
  const settings = (state && state.stats && state.stats.settings) || {};
  const on = !!settings.focusBoost;
  const boostSec = focusBoostSecFromSettings(settings);
  if (!on) {
    thresholdBeforeBoost =
      Number(settings.thresholdSec) && Number(settings.thresholdSec) !== boostSec
        ? Number(settings.thresholdSec)
        : thresholdBeforeBoost || 600;
    const next = await pushSettings({
      focusBoost: true,
      thresholdSec: boostSec,
      focusBoostRestoreSec: thresholdBeforeBoost,
      focusBoostSec: boostSec
    });
    syncFocusBoostUi(
      next || {
        focusBoost: true,
        thresholdSec: boostSec,
        focusBoostSec: boostSec
      }
    );
    playFocusBoostFeel(true);
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
        thresholdSec: restore,
        focusBoostSec: boostSec
      }
    );
    playFocusBoostFeel(false);
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
  if (rules.path && $('rules-unprod-path')) $('rules-unprod-path').textContent = rules.path;
  if ($('rules-custom-label')) {
    $('rules-custom-label').textContent = rules.isCustom ? '(custom)' : '(defaults)';
  }
  if ($('rules-unprod-custom-label')) {
    $('rules-unprod-custom-label').textContent = rules.isCustom ? '(custom)' : '(defaults)';
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

async function saveRulesFromEditors(statusId) {
  if (!api || !api.setRules) return;
  const status = $(statusId);
  if (status) status.textContent = 'Saving…';
  try {
    const next = await api.setRules({
      productive: linesToList(($('rules-prod-edit') && $('rules-prod-edit').value) || ''),
      unproductive: linesToList(($('rules-unprod-edit') && $('rules-unprod-edit').value) || '')
    });
    fillRulesEditors(next);
    if (status) status.textContent = 'Saved — live now';
    const other = statusId === 'rules-status' ? $('rules-unprod-status') : $('rules-status');
    if (other) other.textContent = 'Saved — live now';
  } catch (err) {
    if (status) status.textContent = 'Save failed';
  }
}

async function resetRulesFromEditors(statusId) {
  if (!api || !api.resetRules) return;
  const status = $(statusId);
  if (status) status.textContent = 'Resetting…';
  try {
    const next = await api.resetRules();
    fillRulesEditors(next);
    if (status) status.textContent = 'Defaults restored';
    const other = statusId === 'rules-status' ? $('rules-unprod-status') : $('rules-status');
    if (other) other.textContent = 'Defaults restored';
  } catch (err) {
    if (status) status.textContent = 'Reset failed';
  }
}

if ($('rules-save')) {
  $('rules-save').addEventListener('click', () => saveRulesFromEditors('rules-status'));
}

if ($('rules-reset')) {
  $('rules-reset').addEventListener('click', () => resetRulesFromEditors('rules-status'));
}

if ($('rules-unprod-save')) {
  $('rules-unprod-save').addEventListener('click', () => saveRulesFromEditors('rules-unprod-status'));
}

if ($('rules-unprod-reset')) {
  $('rules-unprod-reset').addEventListener('click', () => resetRulesFromEditors('rules-unprod-status'));
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
    showBanner(payload.body || 'Time to refocus.');
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
if ($('lf-ignore')) {
  $('lf-ignore').addEventListener('click', () => ignoreLastFocused());
}

async function ignoreLastFocused() {
  if (!api || !lastFocusedCache) return;
  const name = processNameForIgnore(lastFocusedCache);
  if (!name) return;
  const next = cachedIgnore.slice();
  const key = name.toLowerCase();
  if (!next.map((x) => String(x).toLowerCase()).includes(key)) next.push(name);
  try {
    const payload = await api.setIgnore(next);
    cachedIgnore = (payload && payload.ignore) || next;
    fillIgnoreEditor({
      ignore: cachedIgnore,
      path: payload && payload.path,
      isCustom: true
    });
    lastFocusedCache.category = 'ignored';
    const oKey = lfOverrideKey(lastFocusedCache);
    if (oKey) lfSessionClass[oKey] = 'ignored';
    const catEl = $('lf-cat');
    if (catEl) {
      catEl.textContent = 'ignored';
      catEl.className = 'chip ignored';
    }
    applyLfButtonOutlines('ignored');
    const hint = $('lf-keyword-hint');
    if (hint) {
      hint.textContent = 'Ignoring: ' + name;
      hint.classList.remove('hidden');
    }
  } catch (err) {
    console.warn('ignore last-focused failed', err);
  }
}

const pieEl = $('pie-chart');
if (pieEl) {
  pieEl.addEventListener('mousemove', showPieTip);
  pieEl.addEventListener('mouseleave', hidePieTip);
}

const dayChartEl = $('day-chart');
if (dayChartEl) {
  dayChartEl.addEventListener('mousemove', showDayChartTip);
  dayChartEl.addEventListener('mouseleave', () => hideChartTip('day-tip'));
}
const weekChartEl = $('week-chart');
if (weekChartEl) {
  weekChartEl.addEventListener('mousemove', showWeekChartTip);
  weekChartEl.addEventListener('mouseleave', () => hideChartTip('week-tip'));
}

document.addEventListener('mousemove', (ev) => {
  if (ev.target && ev.target.closest && ev.target.closest('.app-trunc')) showNameTip(ev);
  else hideNameTip();
});
