'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  classify,
  loadRules,
  loadRulesFrom,
  saveRules,
  loadIgnore,
  saveIgnore,
  isIgnored,
  appLabel,
  isBrowserProcess,
  loadAppIdentities,
  appMatchesIdentity
} = require('../src/classifier');
const {
  createStore,
  todayKey,
  moodFromCategories,
  emptyByHour
} = require('../src/store');
const { createDemoBackend } = require('../src/demo-windows');
const {
  buildExport,
  importBackup,
  writeBackupFile,
  readBackupFile
} = require('../src/backup');

const rules = loadRules();
const ignore = loadIgnore();
const identities = loadAppIdentities();
const browserRules = require('../src/browser-rules');
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok  ', msg);
  }
}

assert(
  classify({ title: 'main.js — Visual Studio Code', owner: { name: 'Code' } }, rules) === 'productive',
  'vscode is productive'
);
assert(
  classify(
    { title: 'lofi hip hop — YouTube', owner: { name: 'Google Chrome' }, url: 'https://www.youtube.com/watch' },
    rules
  ) === 'unproductive',
  'youtube-in-chrome still unproductive'
);
assert(
  classify({ title: 'Home / X', owner: { name: 'Google Chrome' }, url: 'https://x.com/home' }, rules) ===
    'unproductive',
  'x.com is unproductive'
);
assert(
  classify(
    {
      title: 'cursor/sydtrack: Pull Request — GitHub',
      owner: { name: 'Google Chrome' },
      url: 'https://github.com/acme/sydtrack'
    },
    rules
  ) === 'productive',
  'github is productive'
);
assert(
  classify({ title: 'New Tab', owner: { name: 'Google Chrome' }, url: 'chrome://newtab' }, rules) === 'productive',
  'bare chrome is productive by default'
);
assert(
  classify({ title: 'New Tab', owner: { name: 'msedge' } }, rules) === 'productive',
  'bare msedge is productive by default'
);
assert(
  classify({ title: 'Mozilla Firefox', owner: { name: 'firefox' } }, rules) === 'productive',
  'bare firefox is productive by default'
);
assert(
  classify({ title: 'YouTube', owner: { name: 'brave' } }, rules) === 'unproductive',
  'youtube-in-brave unproductive'
);
assert(classify({ title: 'Untitled', owner: { name: 'Notes' } }, rules) === 'other', 'unknown is other');
assert(appLabel({ owner: { name: 'Cursor' }, title: 'x' }) === 'Cursor', 'app label uses process name');

assert(isBrowserProcess({ owner: { name: 'Google Chrome' } }) === true, 'chrome is browser process');
assert(isBrowserProcess({ owner: { name: 'Code' } }) === false, 'Code is not browser');
assert(
  classify(
    { title: 'youtube-clone — Visual Studio Code', owner: { name: 'Code', path: 'C:\\Program Files\\Microsoft VS Code\\Code.exe' } },
    { ...rules, identities }
  ) === 'productive',
  'productive app identity overrides an unproductive project title'
);
assert(appMatchesIdentity({ owner: { name: 'Code' } }, identities) === 'productive', 'app identity matches process name');
assert(isIgnored({ title: 'Search', owner: { name: 'SearchHost' } }, [], identities) === true, 'ignored app identity takes precedence');

assert(isIgnored({ owner: { name: 'Explorer' } }, ignore) === true, 'explorer is ignored');
assert(
  isIgnored({ owner: { name: 'EXPLORER.EXE', path: 'C:\\Windows\\explorer.exe' } }, ignore) === true,
  'explorer.exe case-insensitive ignored'
);
assert(
  isIgnored({ owner: { name: 'ApplicationFrameHost' } }, ignore) === true,
  'ApplicationFrameHost is ignored'
);
assert(
  isIgnored({ owner: { name: 'ShellExperienceHost' } }, ignore) === true,
  'ShellExperienceHost is ignored'
);
assert(
  isIgnored({ owner: { name: 'SearchHost.exe' }, path: 'C:\\Windows\\System32\\SearchHost.exe' }, ignore) === true,
  'SearchHost.exe is ignored'
);
assert(
  isIgnored({ owner: { name: 'SnippingTool.exe' } }, ignore) === true,
  'SnippingTool.exe is ignored'
);
assert(isIgnored({ owner: { name: 'ScreenClippingHost.exe' } }, ignore) === true, 'ScreenClippingHost is ignored');
assert(isIgnored({ owner: { name: 'RuntimeBroker.exe' } }, ignore) === true, 'RuntimeBroker is ignored');
assert(
  isIgnored({ owner: { name: 'Code' }, title: 'app.js' }, ignore) === false,
  'Code editor is not ignored'
);
assert(
  isIgnored({ owner: { name: 'electron' }, title: 'SydTrack' }, ignore) === true,
  'electron + SydTrack title is ignored (self)'
);
assert(
  isIgnored({ owner: { name: 'Electron' }, title: 'sydtrack — Today' }, ignore) === true,
  'Electron + sydtrack title case-insensitive ignored'
);
assert(
  isIgnored({ owner: { name: 'electron' }, title: 'Some Other App' }, ignore) === false,
  'electron without SydTrack title is NOT ignored'
);
assert(
  isIgnored({ owner: { name: 'SydTrack' }, title: 'Today' }, ignore) === true,
  'sydtrack process name is ignored'
);

// Browsers must not be in productive defaults
for (const b of ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'chromium']) {
  assert(!rules.productive.includes(b), b + ' not in productive defaults');
}

// save/load rules roundtrip
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-rules-'));
const rulesPath = path.join(tmp, 'rules.json');
const saved = saveRules(rulesPath, {
  productive: ['GitHub', 'github', '  Cursor  '],
  unproductive: ['YouTube', '']
});
assert(saved.productive.join(',') === 'github,cursor', 'saveRules normalizes unique lowercase');
assert(saved.unproductive.join(',') === 'youtube', 'saveRules drops empties');
const reloaded = loadRulesFrom(rulesPath);
assert(reloaded.productive.includes('github') && reloaded.unproductive.includes('youtube'), 'rules roundtrip');

const ignorePath = path.join(tmp, 'ignore.json');
const savedIgn = saveIgnore(ignorePath, ['Explorer', 'explorer', '  dwm  ']);
assert(savedIgn.join(',') === 'explorer,dwm', 'saveIgnore normalizes');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-'));
const store = createStore(dir);
assert(store.getSettings().dailyGoalSec === 7200, 'default dailyGoalSec === 7200');
store.updateSettings({ dailyGoalSec: 3600 });
assert(store.getSettings().dailyGoalSec === 3600, 'updateSettings persists dailyGoalSec');
const settingsOnDisk = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
assert(settingsOnDisk.dailyGoalSec === 3600, 'dailyGoalSec written to settings.json');
store.updateSettings({ thresholdSec: 30, reminderCooldownSec: 1, demoMode: true, dailyGoalSec: 7200 });
store.addSeconds('Google Chrome', 'unproductive', 20);
assert(store.snapshot().unproductiveStreak === 20, 'streak grows on unproductive');
assert(store.shouldRemind() === false, 'no remind before threshold');
store.addSeconds('Google Chrome', 'unproductive', 15);
assert(store.shouldRemind() === true, 'remind after threshold');
store.markReminder();
assert(store.shouldRemind() === false, 'cooldown suppresses spam');
store.addSeconds('Code', 'productive', 2);
assert(store.snapshot().unproductiveStreak === 0, 'productive switch resets streak');
assert(store.snapshot().byCategory.productive >= 2, 'productive seconds stored');
assert(store.snapshot().byCategory.unproductive >= 35, 'unproductive seconds stored');
store.removeSeconds('Google Chrome', 'unproductive', 5);
assert(store.snapshot().byCategory.unproductive >= 30, 'idle correction removes stored time');

store.addSeconds('Visual Studio Code', 'unproductive', 12);
store.reclassifyStoredApps(rules);
assert(
  !store.snapshot().topApps.some((a) => a.name === 'Visual Studio Code' && a.category === 'unproductive'),
  'tag changes reclassify stored app history'
);
assert(
  store.snapshot().topApps.some((a) => a.name === 'Visual Studio Code' && a.category === 'productive'),
  'reclassified history appears under productive'
);

// Browser tabs share an app name, but category totals must retain each tab's history.
store.addSeconds('Google Chrome', 'productive', 10);
const mixedBrowser = store.snapshot();
assert(mixedBrowser.byCategory.unproductive >= 30, 'browser unproductive history is retained');
assert(mixedBrowser.byCategory.productive >= 12, 'browser productive history is retained');
assert(
  mixedBrowser.topApps.some((a) => a.name === 'Google Chrome' && a.category === 'productive'),
  'browser appears in productive apps'
);
assert(
  mixedBrowser.topApps.some((a) => a.name === 'Google Chrome' && a.category === 'unproductive'),
  'browser appears in unproductive apps'
);
store.addSeconds('GitHub Desktop', 'productive', 2);
store.addSeconds('GitHub Desktop', 'productive', 3);
const groupedApps = store.snapshot().topApps.filter(
  (a) => a.name === 'GitHub Desktop' && a.category === 'productive'
);
assert(groupedApps.length === 1 && groupedApps[0].seconds >= 5, 'same app/category entries are grouped');

// ignored category must not be stored / must not grow streak
store.addSeconds('Explorer', 'ignored', 50);
assert(store.snapshot().byCategory.ignored == null, 'ignored category not in byCategory');
assert(!store.snapshot().topApps.some((a) => a.name === 'Explorer'), 'ignored not in topApps via addSeconds');

// snapshot filters historical ignored names when ignore list passed
store.addSeconds('ShellExperienceHost', 'other', 99);
const filtered = store.snapshot(['shellexperiencehost', 'explorer']);
assert(
  !filtered.topApps.some((a) => /shell|explorer/i.test(a.name)),
  'snapshot filters ignored process names from topApps'
);

const demo = createDemoBackend();
const w1 = demo.getActiveWindow();
assert(!!w1.title && !!w1.owner.name, 'demo window has title and owner');
assert(classify(w1, rules) === 'productive', 'demo sequence starts productive (vscode)');

assert(rules.productive.includes('devenv') || rules.productive.includes('visual studio'), 'vs/devenv in defaults');
assert(rules.unproductive.includes('youtube'), 'youtube still in unproductive defaults');
assert(ignore.includes('explorer'), 'ignore defaults include explorer');
assert(ignore.includes('shellexperiencehost'), 'ignore defaults include shellexperiencehost');
assert(ignore.includes('sydtrack'), 'ignore defaults include sydtrack');

// ——— byHour increments ———
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-hour-'));
const store2 = createStore(dir2);
const hour = new Date().getHours();
store2.addSeconds('Code', 'productive', 10);
store2.addSeconds('YouTube', 'unproductive', 5);
store2.addSeconds('Notes', 'other', 3);
const snap2 = store2.snapshot();
assert(Array.isArray(snap2.byHour) && snap2.byHour.length === 24, 'byHour has 24 entries');
assert(snap2.byHour[hour].productive === 10, 'byHour productive increments current hour');
assert(snap2.byHour[hour].unproductive === 5, 'byHour unproductive increments current hour');
assert(snap2.byHour[hour].other === 3, 'byHour other increments current hour');
store2.addSeconds('Explorer', 'ignored', 100);
assert(snap2.byHour[hour].productive === 10, 'ignore excluded from byHour (pre-check)');
const snapIgn = store2.snapshot();
assert(snapIgn.byHour[hour].productive === 10, 'ignored seconds excluded from byHour');
assert(
  snapIgn.byCategory.productive + snapIgn.byCategory.unproductive + snapIgn.byCategory.other === 18,
  'ignore excluded from category totals'
);

// ——— archive on roll (simulate date change) ———
const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-roll-'));
const store3 = createStore(dir3);
store3.addSeconds('Code', 'productive', 42);
const yesterday = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
})();
// Force state date to yesterday then trigger roll via addSeconds
const st = store3.getState();
st.date = yesterday;
store3.replaceToday(st);
// Manually set date without going through replaceToday's migrate — write raw
fs.writeFileSync(
  path.join(dir3, 'stats.json'),
  JSON.stringify(
    Object.assign({}, store3.getState(), {
      date: yesterday,
      byCategory: { productive: 42, unproductive: 0, other: 0 }
    }),
    null,
    2
  )
);
const store3b = createStore(dir3);
// createStore should archive yesterday and start fresh today
const histFile = path.join(dir3, 'history', yesterday + '.json');
assert(fs.existsSync(histFile), 'archive on roll writes history/YYYY-MM-DD.json');
const archived = JSON.parse(fs.readFileSync(histFile, 'utf8'));
assert(archived.byCategory.productive === 42, 'archived day keeps productive seconds');
assert(store3b.getState().date === todayKey(), 'after roll today is emptyDay date');
assert(store3b.getState().byCategory.productive === 0, 'today starts empty after roll');

const snapWeek = store3b.snapshot(null, { includeWeek: true });
assert(Array.isArray(snapWeek.week) && snapWeek.week.length === 7, 'snapshot week has 7 days');
const yEntry = snapWeek.week.find((d) => d.date === yesterday);
assert(yEntry && yEntry.byCategory.productive === 42, 'week includes archived yesterday');

// ——— export schema roundtrip ———
const dir4 = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-bak-'));
const store4 = createStore(dir4);
store4.addSeconds('Code', 'productive', 7);
store4.updateSettings({ thresholdSec: 120, focusBoost: true });
const payload = buildExport(store4, {
  includeSettings: true,
  includeRules: true,
  includeIgnore: true,
  rules: { productive: ['code'], unproductive: ['youtube'] },
  ignore: ['explorer']
});
assert(payload.format === 'sydtrack-backup', 'export format sydtrack-backup');
assert(payload.schemaVersion === 1, 'export schemaVersion 1');
assert(typeof payload.exportedAt === 'string' && payload.exportedAt.includes('T'), 'export exportedAt ISO');
assert(typeof payload.appVersion === 'string', 'export appVersion present');
assert(payload.days[todayKey()], 'export days includes today');
assert(payload.settings && payload.settings.thresholdSec === 120, 'export includes settings');
store4.updateSettings({ dailyGoalSec: 5400 });
const payloadGoal = buildExport(store4, { includeSettings: true });
assert(payloadGoal.settings && payloadGoal.settings.dailyGoalSec === 5400, 'export round-trips dailyGoalSec');
assert(payload.rules && payload.rules.productive.includes('code'), 'export includes rules');
assert(Array.isArray(payload.ignore) && payload.ignore.includes('explorer'), 'export includes ignore');

const bakPath = path.join(dir4, 'test.sydtrack');
writeBackupFile(bakPath, payload);
const round = readBackupFile(bakPath);
assert(round.format === 'sydtrack-backup', 'backup file roundtrip format');

const dir5 = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-imp-'));
const store5 = createStore(dir5);
const imp = importBackup(store5, round, { mode: 'replace' });
assert(imp.ok, 'importBackup ok');
assert(imp.daysImported >= 1, 'importBackup imported days');
assert(store5.snapshot().byCategory.productive >= 7, 'import restore productive seconds');

// ——— mood id mapping ———
assert(moodFromCategories({ productive: 0, unproductive: 0 }).id === 'meh', 'mood both 0 → meh');
assert(moodFromCategories({ productive: 90, unproductive: 10 }).id === 'thriving', 'mood >=0.8 thriving');
assert(moodFromCategories({ productive: 70, unproductive: 30 }).id === 'focused', 'mood >=0.6 focused');
assert(moodFromCategories({ productive: 50, unproductive: 50 }).id === 'meh', 'mood >=0.4 meh');
assert(moodFromCategories({ productive: 30, unproductive: 70 }).id === 'distracted', 'mood >=0.2 distracted');
assert(moodFromCategories({ productive: 10, unproductive: 90 }).id === 'doomscroll', 'mood <0.2 doomscroll');
const moodSnap = store2.snapshot();
assert(moodSnap.mood && typeof moodSnap.mood.id === 'string', 'snapshot includes mood helper');
assert(
  ['thriving', 'focused', 'meh', 'distracted', 'doomscroll'].includes(moodSnap.mood.id),
  'mood id is stable enum'
);

// migrate missing byHour
const migrated = require('../src/store').migrateDay({
  date: todayKey(),
  byApp: {},
  byCategory: { productive: 1, unproductive: 0, other: 0 }
});
assert(Array.isArray(migrated.byHour) && migrated.byHour.length === 24, 'migrate missing byHour → zeros');
assert(migrated.byHour.every((h) => h.productive === 0 && h.unproductive === 0 && h.other === 0), 'byHour zeros');

// clearToday / clearAll
store4.clearToday();
assert(store4.snapshot().byCategory.productive === 0, 'clearToday resets today');


// ——— history retention cap ———
const { MAX_HISTORY_DAYS } = require("../src/store");
assert(MAX_HISTORY_DAYS === 90, "MAX_HISTORY_DAYS is 90");
const dirPrune = fs.mkdtempSync(path.join(os.tmpdir(), "sydtrack-prune-"));
const storePrune = createStore(dirPrune);
const histDir = path.join(dirPrune, "history");
fs.mkdirSync(histDir, { recursive: true });
for (let i = 0; i < 95; i++) {
  const d = new Date();
  d.setDate(d.getDate() - i - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const key = y + "-" + m + "-" + day;
  fs.writeFileSync(path.join(histDir, key + ".json"), JSON.stringify({
    date: key,
    byApp: {},
    byCategory: { productive: 1, unproductive: 0, other: 0 },
    byHour: Array.from({ length: 24 }, () => ({ productive: 0, unproductive: 0, other: 0 })),
    unproductiveStreak: 0,
    lastReminderAt: 0
  }));
}
storePrune.pruneOldHistory();
const left = fs.readdirSync(histDir).filter((f) => f.endsWith(".json"));
assert(left.length <= MAX_HISTORY_DAYS, "prune keeps at most 90 history files (" + left.length + ")");

async function regressionChecks() {
  const { readRecoverableJson } = require('../src/json-file');
  const { createSessionManager: recoveryManager } = require('../src/sessions');
  const recoveryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-recovery-'));
  try {
    const notices = [];
    const onRecovery = (report) => notices.push(report);
    const settingsPath = path.join(recoveryDir, 'settings.json');
    fs.writeFileSync(settingsPath, '{"trackingPaused":');
    const recoveredStore = createStore(recoveryDir, { onRecovery });
    assert(recoveredStore.getSettings().trackingPaused === true, 'recovered settings pause tracking');
    assert(fs.readFileSync(notices[0].recoveryPath, 'utf8') === '{"trackingPaused":', 'settings recovery preserves original bytes');
    assert(createStore(recoveryDir).getSettings().trackingPaused === true, 'recovery pause survives restart');
    fs.writeFileSync(settingsPath, JSON.stringify({ dailyGoalSec: 1234, futureSetting: 'retain' }));
    const legacy = createStore(recoveryDir, { onRecovery }).getSettings();
    assert(legacy.dailyGoalSec === 1234 && legacy.futureSetting === 'retain' && legacy.idleTimeoutSec === 300, 'partial settings retain values and gain compatible defaults');
    fs.writeFileSync(settingsPath, '[]');
    createStore(recoveryDir, { onRecovery });
    assert(notices.length === 2, 'wrong settings container is recovered');
    fs.writeFileSync(path.join(recoveryDir, 'active-session.json'), '{broken');
    const sessions = recoveryManager({ dataDir: recoveryDir, onRecovery });
    assert(sessions.getActiveSession() === null && notices.length === 3, 'broken active session is recovered without inventing a session');
    const dayPath = path.join(recoveryDir, 'sessions', `${todayKey()}.json`);
    fs.writeFileSync(dayPath, '{broken history');
    assert(sessions.getSessionsForDay(todayKey()).length === 0 && notices.length === 4, 'broken session history is reported');
    assert(fs.readFileSync(notices[3].recoveryPath, 'utf8') === '{broken history', 'session recovery preserves original bytes');
    sessions.getSessionsForDay(todayKey());
    assert(notices.length === 4, 'recovered session file is not repeatedly reported');
    fs.writeFileSync(dayPath, '{}');
    sessions.getSessionsForDay(todayKey());
    assert(notices.length === 5, 'wrong session history container is recovered');
    fs.writeFileSync(dayPath, '{keep me');
    const originalCopy = fs.copyFileSync;
    let preservationFailed = false;
    try {
      fs.copyFileSync = () => { throw new Error('simulated preservation failure'); };
      sessions.getSessionsForDay(todayKey());
    } catch (_) { preservationFailed = true; }
    finally { fs.copyFileSync = originalCopy; }
    assert(preservationFailed && fs.readFileSync(dayPath, 'utf8') === '{keep me', 'failed preservation blocks recovery and leaves original intact');
    const originalRead = fs.readFileSync;
    let accessFailed = false;
    try {
      fs.readFileSync = () => { const err = new Error('access denied'); err.code = 'EACCES'; throw err; };
      readRecoverableJson(dayPath, Array.isArray, onRecovery);
    } catch (_) { accessFailed = true; }
    finally { fs.readFileSync = originalRead; }
    assert(accessFailed && notices.length === 5, 'IO errors propagate without resetting data');
    fs.writeFileSync(dayPath, '[null]');
    sessions.getSessionsForDay(todayKey());
    assert(notices.length === 6, 'invalid session entries are preserved instead of reaching the UI');
    fs.writeFileSync(path.join(recoveryDir, 'active-session.json'), '{"status":"running"}');
    assert(recoveryManager({ dataDir: recoveryDir, onRecovery }).getActiveSession() === null && notices.length === 7, 'missing active session timing is preserved instead of inventing a completion');
  } finally {
    fs.rmSync(recoveryDir, { recursive: true, force: true });
  }
  // Exercise real renderer handlers without Electron or writes to user app-data.
  const vm = require('vm');
  const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'renderer.js'), 'utf8');
  const modeButton = { active: true, getAttribute: () => null,
    classList: { toggle(_name, value) { modeButton.active = value; } }, setAttribute() {}, addEventListener(_name, fn) { this.click = fn; } };
  const weekButton = { active: false, getAttribute: () => 'week',
    classList: { toggle(_name, value) { weekButton.active = value; } }, setAttribute() {}, addEventListener(_name, fn) { this.click = fn; } };
  const segmentContext = vm.createContext({ $: () => null, hideChartTip() {}, historyRequest: 0, loadAnalyticsHistory() {}, analyticsSegment: 'day', ANALYTICS_SUBTITLES: {},
    document: { querySelectorAll(selector) {
      if (selector === '.segment-btn[data-segment]') return [weekButton];
      if (selector === '.segment-btn') return [weekButton, modeButton];
      return [];
    } } });
  vm.runInContext(rendererSource.slice(rendererSource.indexOf('function setAnalyticsSegment('), rendererSource.indexOf("document.querySelectorAll('.nav-btn').forEach")), segmentContext);
  segmentContext.setAnalyticsSegment('week');
  assert(weekButton.active && modeButton.active, '#3 changing Analytics preserves the selected Session mode');
  const segmentBindings = rendererSource.indexOf("document.querySelectorAll('.segment-btn", rendererSource.indexOf("document.querySelectorAll('.nav-btn').forEach"));
  vm.runInContext(rendererSource.slice(segmentBindings, rendererSource.indexOf('const navToggle =')), segmentContext);
  assert(typeof weekButton.click === 'function' && !modeButton.click, '#3 Analytics handlers do not attach to Session controls');
  const pointerState = { 'day-tip': { clientX: 20, clientY: 30 } };
  let resolvedTarget = { id: 'replacement-bar' };
  let tooltipHidden = false;
  let refreshedTarget;
  const hoverContext = vm.createContext({ chartHoverPointers: pointerState,
    $: () => ({ classList: { add() { tooltipHidden = true; } } }),
    document: { elementFromPoint: () => resolvedTarget } });
  vm.runInContext(rendererSource.slice(rendererSource.indexOf('function hideChartTip('), rendererSource.indexOf('function placeChartTip(')), hoverContext);
  hoverContext.refreshChartTip('day-tip', (event) => { refreshedTarget = event.target; });
  assert(refreshedTarget === resolvedTarget && !tooltipHidden, 'chart refresh resolves the replacement bar without dismissing stationary hover');
  hoverContext.hideChartTip('day-tip');
  refreshedTarget = null;
  hoverContext.refreshChartTip('day-tip', (event) => { refreshedTarget = event.target; });
  assert(tooltipHidden && refreshedTarget === null, 'leaving a chart prevents tooltip resurrection on the next tick');
  pointerState['day-tip'] = { clientX: 20, clientY: 30 };
  resolvedTarget = null;
  hoverContext.refreshChartTip('day-tip', () => {});
  assert(!pointerState['day-tip'], 'hover is cleared when no element remains under the pointer');
  const elements = {};
  const ids = ['rules-prod-edit', 'rules-unprod-edit', 'ignore-edit', 'tags-quick-input', 'tags-quick-status', 'tags-quick-prod', 'tags-quick-unprod', 'tags-quick-ignore'];
  for (const id of ids) elements[id] = { value: '', textContent: '', disabled: false, listeners: {}, addEventListener(event, handler) { this.listeners[event] = handler; } };
  let releaseSave;
  let saveCount = 0;
  const tagContext = vm.createContext({
    $: (id) => elements[id] || null,
    document: { querySelectorAll: () => ids.filter((id) => !['tags-quick-input', 'tags-quick-status'].includes(id)).map((id) => elements[id]) },
    cachedRules: { productive: [], unproductive: [] }, cachedIgnore: [], tagsQuickSaving: false,
    console: { warn() {} },
    api: { setRules(next) { saveCount++; return new Promise((resolve) => { releaseSave = () => resolve(next); }); }, async setIgnore(ignore) { return { ignore }; } }
  });
  vm.runInContext(rendererSource.slice(rendererSource.indexOf('function linesToList('), rendererSource.indexOf('async function loadRulesAndIgnore(')), tagContext);
  vm.runInContext(rendererSource.slice(rendererSource.indexOf('function currentTagLists('), rendererSource.indexOf("if ($('data-export'))")), tagContext);
  elements['tags-quick-input'].value = 'YOUTUBE';
  tagContext.fillRulesEditors({ productive: [], unproductive: ['youtube'] });
  assert(elements['tags-quick-status'].textContent.includes('Unproductive'), '#4 loaded rules immediately refresh an existing search');
  elements['rules-unprod-edit'].value = '';
  elements['rules-unprod-edit'].listeners.input();
  assert(elements['tags-quick-status'].textContent.includes('not in any list'), '#4 deleting a draft tag immediately removes stale cached matches');
  elements['ignore-edit'].value = 'YouTube';
  elements['ignore-edit'].listeners.input();
  assert(elements['tags-quick-status'].textContent.includes('Ignore'), '#4 editing ignore tags refreshes search synchronously');
  tagContext.fillIgnoreEditor({ ignore: [] });
  const saving = tagContext.tagsQuickAdd('productive');
  await tagContext.tagsQuickAdd('unproductive');
  assert(saveCount === 1 && elements['tags-quick-prod'].disabled, '#4 repeated quick-add cannot race a pending save');
  elements['tags-quick-input'].value = 'new query';
  elements['tags-quick-input'].listeners.input();
  releaseSave(); await saving;
  assert(elements['tags-quick-status'].textContent.includes('new query') && !elements['tags-quick-prod'].disabled, '#4 slow saves preserve the newer search and restore controls');
  elements['tags-quick-input'].value = 'youtube';
  tagContext.fillRulesEditors({ productive: ['youtube'], unproductive: ['youtube'] });
  const moving = tagContext.tagsQuickAdd('productive');
  releaseSave(); await moving;
  assert(elements['rules-unprod-edit'].value === '' && elements['rules-prod-edit'].value === 'youtube', '#4 quick-add resolves duplicate membership across lists');
  tagContext.api.setRules = async () => { throw new Error('simulated save failure'); };
  elements['tags-quick-input'].value = 'another';
  await tagContext.tagsQuickAdd('productive');
  assert(elements['tags-quick-status'].textContent === 'Save failed.' && !elements['tags-quick-prod'].disabled, '#4 failed saves report the error and unlock controls');
  const { mergeDays } = require('../src/backup');
  const { emptyDay } = require('../src/store');
  const original = emptyDay(todayKey());
  original.byApp.Chrome = { seconds: 10, category: 'productive' };
  original.byCategory.productive = 10;
  original.byHour[0].productive = 10;
  original.byHour[0].byApp.Chrome = { seconds: 10, category: 'productive' };
  const incoming = emptyDay(todayKey());
  incoming.byApp.Chrome = { seconds: 20, category: 'unproductive' };
  incoming.byCategory.unproductive = 20;
  incoming.byHour[0].unproductive = 20;
  incoming.byHour[0].byApp.Chrome = { seconds: 20, category: 'unproductive' };
  const beforeMerge = JSON.stringify(original);
  const merged = mergeDays(original, incoming);
  assert(merged.byApp['Chrome::productive'].seconds === 10 && merged.byApp['Chrome::unproductive'].seconds === 20, 'backup merge preserves legacy browser category splits');
  assert(merged.byHour[0].byApp['Chrome::unproductive'].seconds === 20, 'backup merge retains imported hourly app totals');
  assert(JSON.stringify(original) === beforeMerge, 'backup merge does not mutate its source');
  const backupStore = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-backup-regression-')));
  backupStore.addSeconds('Code', 'productive', 15);
  for (const days of [null, [], { '2026-02-31': {} }, { [todayKey()]: { byCategory: { productive: -1 } } }]) {
    const rejected = importBackup(backupStore, { format: 'sydtrack-backup', schemaVersion: 1, days }, { mode: 'replace' });
    assert(!rejected.ok && backupStore.snapshot().byCategory.productive === 15, 'invalid replacement backup leaves existing history intact');
  }
  const { writeJson } = require('../src/json-file');
  const atomicPath = path.join(backupStore.dataDir, 'atomic-test.json');
  writeJson(atomicPath, { saved: true });
  const rename = fs.renameSync;
  let rejectedWrite = false;
  try {
    fs.renameSync = () => { throw new Error('simulated disk failure'); };
    writeJson(atomicPath, { saved: false });
  } catch (_) { rejectedWrite = true; } finally { fs.renameSync = rename; }
  assert(rejectedWrite && JSON.parse(fs.readFileSync(atomicPath, 'utf8')).saved, 'failed atomic replacement preserves the previous file');
  assert(!fs.existsSync(`${atomicPath}.${process.pid}.tmp`), 'failed atomic replacement cleans up its temporary file');
  const identityRules = { ...rules, identities };
  for (const name of ['Code.exe', 'CURSOR.EXE', 'devenv']) {
    assert(classify({ owner: { name }, title: 'youtube-clone' }, identityRules) === 'productive', '#11 normalized process identities protect project titles: ' + name);
  }
  assert(appMatchesIdentity({ title: 'code' }, identities) === null, '#11 missing owner never treats a title as process identity');
  assert(classify({ owner: { name: 'Code' }, title: 'youtube' }, { ...identityRules, unproductive: ['code'] }) === 'unproductive', '#11 explicit app tag can override productive identity');
  assert(classify({ owner: { name: 'chrome' }, title: 'YouTube' }, { ...identityRules, identities: { productiveApps: ['chrome'] } }) === 'unproductive', '#7 browser content wins even with productive browser identity');
  assert(classify({ owner: { name: 'chrome', path: 'C:/youtube/chrome.exe' }, title: 'New Tab' }, identityRules) === 'productive', '#7 browser install directory does not classify content');
  assert(!isBrowserProcess({ owner: { name: 'knowledge-editor' } }), '#7 unrelated edge substring is not a browser');
  const { createSessionManager } = require('../src/sessions');
  const completionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-completion-'));
  const completionManager = createSessionManager({ dataDir: completionDir });
  const realNow = Date.now;
  let sessionNow = realNow();
  try {
    Date.now = () => sessionNow;
    const first = completionManager.startSession({ mode: 'custom', customMin: 1 });
    sessionNow += 60001;
    assert(completionManager.getActiveSession() === null, 'reading an expired session finalizes it');
    completionManager.getActiveSession(); // Mimic repeated tray and renderer reads.
    const next = completionManager.startSession({ mode: 'custom', customMin: 1 });
    const completionTick = completionManager.onTrackerTick({ app: 'Code', category: 'productive', elapsedSec: 0 });
    assert(completionTick.completed.id === first.id && completionTick.active.id === next.id, 'completion survives timer reads and starting another session');
    assert(completionManager.onTrackerTick({ elapsedSec: 0 }).completed === null, 'completion is delivered only once');
    sessionNow += 60001;
    assert(completionManager.onTrackerTick({ elapsedSec: 0 }).completed.id === next.id, 'tracker expiry also delivers completion');
  } finally { Date.now = realNow; }
  const settingsStore = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-settings-import-')));
  const settingsSessions = createSessionManager({ dataDir: settingsStore.dataDir, getSettings: () => settingsStore.getSettings() });
  settingsSessions.startSession({}); settingsSessions.stopSession();
  settingsSessions.startSession({}); settingsSessions.stopSession();
  const sessionLogPath = path.join(settingsSessions.sessionsDir, todayKey() + '.json');
  const sessionLogBefore = fs.readFileSync(sessionLogPath, 'utf8');
  const previousRename = fs.renameSync;
  const previousError = console.error;
  let retentionFailed = false;
  try {
    console.error = () => {};
    fs.renameSync = () => { throw new Error('simulated retention write failure'); };
    settingsSessions.applyHistorySetting(false);
  } catch (_) { retentionFailed = true; }
  finally { fs.renameSync = previousRename; console.error = previousError; }
  assert(retentionFailed && fs.readFileSync(sessionLogPath, 'utf8') === sessionLogBefore, 'failed session retention write preserves the original log');
  const { updateAppSettings } = require('../src/settings-service');
  const settingsBackup = { format: 'sydtrack-backup', schemaVersion: 1, days: {}, settings: { sessionHistoryEnabled: false } };
  importBackup(settingsStore, settingsBackup, { applySettings: false, onSettings: () => { throw new Error('must not apply'); } });
  assert(JSON.parse(fs.readFileSync(sessionLogPath, 'utf8')).length === 2, 'skipping imported settings preserves session history');
  let refreshed = false;
  importBackup(settingsStore, settingsBackup, { onSettings: (partial) => updateAppSettings(settingsStore, settingsSessions, partial, () => { refreshed = true; }) });
  assert(refreshed && JSON.parse(fs.readFileSync(sessionLogPath, 'utf8')).length === 1, 'backup settings apply session retention and notify the UI');
  let trayMenu;
  let trayPayload;
  const trayContext = vm.createContext({ module: { exports: {} }, __dirname: path.join(__dirname, '..', 'src'), console,
    require: (name) => name === 'electron' ? {
      Tray: class { setToolTip() {} setContextMenu(menu) { trayMenu = menu; } on() {} },
      Menu: { buildFromTemplate: (menu) => menu },
      nativeImage: { createFromPath: () => ({ isEmpty: () => true }), createEmpty: () => ({}) }
    } : require(name), process: { platform: 'win32' } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'tray.js'), 'utf8'), trayContext);
  trayContext.module.exports.createAppTray({ getMainWindow: () => null, getStore: () => settingsStore,
    getSessionManager: () => null, getLastPayload: () => ({ sessionCompleted: { id: 'already-delivered' } }),
    sendTrackerUpdate: (payload) => { trayPayload = payload; } });
  trayMenu.find(item => item.label === 'Pause tracking').click();
  assert(trayPayload.sessionCompleted === null, 'tray settings refresh does not replay a session completion event');
  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-session-regression-'));
  const manager = createSessionManager({ dataDir: sessionDir });
  manager.startSession({ mode: 'custom', customMin: 1 });
  manager.onTrackerTick({ app: 'Code', category: 'productive', elapsedSec: 1 });
  manager.onTrackerTick({ app: 'Chrome', category: 'unproductive', elapsedSec: 0 });
  assert(manager.getActiveSession().distractionCount === 0, 'paused/idle session ticks do not count distractions');
  const persisted = JSON.parse(fs.readFileSync(manager.activePath, 'utf8'));
  persisted.startedAt = Date.now() - 3600000;
  persisted.endsAt = persisted.startedAt + 60000;
  fs.writeFileSync(manager.activePath, JSON.stringify(persisted));
  const restored = createSessionManager({ dataDir: sessionDir });
  assert(restored.getMostRecentSession().elapsedSec === 60, 'expired session restored after an hour records planned duration');
  assert(restored.getMostRecentSession().endedAt === persisted.endsAt, 'expired session records its actual deadline');
  const idleStore = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-idle-regression-')));
  idleStore.updateSettings({ demoMode: false, idleTimeoutSec: 5 });
  idleStore.addSeconds('Code', 'productive', 120);
  let clock = new Date().setHours(12, 0, 0, 0);
  let idleSec = 6;
  const { createTracker } = require('../src/tracker');
  const raceStore = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-pause-race-')));
  raceStore.updateSettings({ demoMode: false, thresholdSec: 1, idleTimeoutSec: 0 });
  let resolveProbe;
  let raceClock = new Date().setHours(12, 0, 0, 0);
  let reminders = 0;
  let ticks = 0;
  let sessionElapsed;
  const raceTracker = createTracker({ store: raceStore, rules: identityRules, now: () => raceClock,
    backend: { getActiveWindow: () => new Promise(resolve => { resolveProbe = resolve; }) },
    sessionManager: { onTrackerTick(tick) { sessionElapsed = tick.elapsedSec; return {}; } },
    onReminder: () => { reminders++; }, onTick: () => { ticks++; } });
  raceClock += 2000;
  const pausedPoll = raceTracker.poll();
  raceStore.updateSettings({ trackingPaused: true });
  resolveProbe({ window: { owner: { name: 'chrome' }, title: 'YouTube' } });
  await pausedPoll;
  assert(raceStore.snapshot().byCategory.unproductive === 0 && reminders === 0 && sessionElapsed === 0 && raceTracker.getLastFocused() === null, 'pausing during a probe suppresses time, reminders, session activity, and focus changes');
  raceClock += 2000;
  const resumedPoll = raceTracker.poll();
  raceStore.updateSettings({ trackingPaused: false });
  resolveProbe({ window: { owner: { name: 'Code' } } });
  await resumedPoll;
  assert(raceStore.snapshot().byCategory.productive === 0, 'resuming during a paused probe does not backfill paused time');
  raceClock += 2000;
  const stoppedPoll = raceTracker.poll();
  raceTracker.stop();
  const ticksBeforeStop = ticks;
  resolveProbe({ window: { owner: { name: 'Code' } } });
  await stoppedPoll;
  assert(ticks === ticksBeforeStop && raceStore.snapshot().byCategory.productive === 0, 'stopping invalidates an in-flight probe');
  const idleTracker = createTracker({ store: idleStore, rules: identityRules, now: () => clock,
    backend: { getActiveWindow: async () => ({ window: { owner: { name: 'Code' } }, idleSec }) } });
  for (let i = 0; i < 20; i++) { clock += 1000; idleSec += 1; await idleTracker.poll(); }
  assert(idleStore.snapshot().byCategory.productive === 120, '#14 ordinary idle never erases previously earned time');
  idleSec = 0; clock += 1000; await idleTracker.poll();
  assert(idleStore.snapshot().byCategory.productive === 121, '#14 input resumes tracking without counting the idle interval');
  idleStore.addSeconds('Chrome', 'unproductive', 15);
  idleStore.addSeconds('Unknown', 'other', 1);
  assert(idleStore.snapshot().unproductiveStreak === 0, 'other activity breaks an unproductive streak');
  const sparse = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-sparse-')));
  sparse.writeHistoryDay({ date: '2001-01-01', byApp: {}, byCategory: {} });
  sparse.pruneOldHistory();
  assert(sparse.listHistoryDates().length === 0, '#9 sparse history older than 90 days is pruned');
}

const siteRules = { productive: ['site:learn.youtube.com'], unproductive: ['site:youtube.com', 'distraction'] };
const browserWindow = (url, title = 'Neutral title') => ({ owner: { name: 'chrome' }, title, url });
assert(classify(browserWindow('https://youtube.com/watch?v=1'), siteRules) === 'unproductive', '#7 site rule matches an address without title keywords');
assert(classify(browserWindow('https://www.youtube.com'), siteRules) === 'unproductive', '#7 site rule includes subdomains');
assert(classify(browserWindow('https://learn.youtube.com', 'distraction'), siteRules) === 'productive', '#7 specific site overrides parent and title rules');
for (const url of ['https://notyoutube.com', 'https://youtube.com.evil.test', 'https://example.com/youtube.com', '', 'about:blank', 'file:///youtube.com']) {
  assert(classify(browserWindow(url), siteRules) === 'productive', '#7 domain boundary/fallback: ' + url);
}
assert(classify(browserWindow('', 'distraction'), siteRules) === 'unproductive', '#7 unavailable URL preserves title fallback');
assert(classify({ owner: { name: 'Unknown' }, title: 'site:youtube.com', url: 'https://youtube.com' }, siteRules) === 'other', '#7 site tags never classify native apps');
assert(browserRules.classifySite('https://EXAMPLE.COM.', { productive: ['site:example.com'], unproductive: ['site:example.com'] }) === 'unproductive', '#7 domain normalization and equal-specificity precedence');
assert(!browserRules.siteDomain('site:example.com/path') && !browserRules.siteDomain('site:*.com'), '#7 invalid website rules are not substring rules');
const { buildProfilePack, parseProfilePack } = require('../src/profile-pack');
assert(parseProfilePack(JSON.stringify(buildProfilePack(siteRules))).productive[0] === 'site:learn.youtube.com', '#7 website tags survive existing profile packs');

async function browserProbeChecks() {
  const { createWindowsBackend } = require('../src/windows-backend');
  let captureCalls = 0;
  const titleBackend = createWindowsBackend({ run(exe, args, options, callback) {
    captureCalls++;
    callback(null, JSON.stringify({ window: { owner: { name: 'Browser' }, title: 'YouTube lecture', id: '123' }, idleSec: 12 }));
  } });
  const titleCapture = await titleBackend.getActiveWindow();
  assert(captureCalls === 1 && titleCapture.window.url === '' && titleCapture.idleSec === 12, '#7 default capture uses one foreground probe and never reads unsubmitted addresses');
  const customRules = { ...rules, identities: { productiveApps: ['researchtool'], browserApps: ['researchtool'] } };
  for (const app of ['Browser.exe', 'Research Browser', 'Firefox', 'LibreWolf', 'Waterfox', 'Chrome', 'researchtool']) {
    const win = { owner: { name: app }, title: 'YouTube lecture' };
    assert(isBrowserProcess(win, customRules.identities) && classify(win, customRules) === 'unproductive', '#7 title classification independent of browser engine: ' + app);
    assert(classify({ ...win, title: 'GitHub documentation' }, customRules) === 'productive', '#7 productive title classification: ' + app);
  }
  assert(!isBrowserProcess({ owner: { name: 'Code' }, title: 'Browser — YouTube project' }), '#7 document titles do not turn native editors into browsers');
  assert(!browserRules.isBrowserName('chrome-helper.exe') && !browserRules.isBrowserName('browser_broker.exe'), '#7 browser helper processes are not matched by loose substrings');
  const { createTracker } = require('../src/tracker');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-sites-'));
  const siteStore = createStore(dir);
  siteStore.updateSettings({ demoMode: false, idleTimeoutSec: 0 });
  let clock = new Date().setHours(12, 0, 0, 0), url = 'https://learn.youtube.com';
  const tracker = createTracker({ store: siteStore, rules: siteRules, now: () => clock,
    backend: { getActiveWindow: async () => ({ window: browserWindow(url), idleSec: 0 }) } });
  clock += 1000; await tracker.poll();
  url = 'https://youtube.com'; clock += 1000; await tracker.poll();
  assert(siteStore.snapshot().byCategory.productive === 1 && siteStore.snapshot().byCategory.unproductive === 1, '#7 switching websites preserves separate category time');
  assert(tracker.getLastFocused().url === url, '#7 current website reaches Home quick tagging');
  const customStore = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-custom-browser-')));
  customStore.addSeconds('researchtool', 'productive', 7);
  customStore.addSeconds('researchtool', 'unproductive', 3);
  customStore.reclassifyStoredApps(customRules);
  assert(customStore.snapshot().byCategory.productive === 7 && customStore.snapshot().byCategory.unproductive === 3, '#7 configured browsers preserve mixed historical categories');
  const rulesPath = path.join(dir, 'rules.json');
  saveRules(rulesPath, siteRules);
  assert(loadRulesFrom(rulesPath).productive[0] === 'site:learn.youtube.com', '#7 website tags survive settings roundtrip');
  const backup = buildExport(siteStore, { includeRules: true, rules: siteRules });
  let importedRules;
  importBackup(createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-site-import-'))), backup, { onRules: (value) => { importedRules = value; } });
  assert(importedRules.productive[0] === 'site:learn.youtube.com', '#7 website tags survive backup import');
  let invalidRejected = false;
  try { browserRules.validateSiteTags({ productive: ['site:example.com/path'] }); } catch (_) { invalidRejected = true; }
  assert(invalidRejected, '#7 invalid website edits are rejected before saving');
  const { readBrowserAddress } = require('../src/windows-backend');
  const win = { ...browserWindow(''), id: '123' };
  const probe = (result, err) => (exe, args, options, callback) => {
    assert(options.timeout === 3000 && options.windowsHide, '#7 browser probe is bounded and hidden');
    callback(err, JSON.stringify(result));
  };
  assert(await readBrowserAddress(win, probe({ id: '123', title: win.title, url: 'https://example.com/private?q=secret' })) === 'https://example.com', '#7 address capture retains only hostname');
  assert(await readBrowserAddress(win, probe({ id: '123', title: 'Different tab', url: 'https://youtube.com' })) === '', '#7 tab changes discard mismatched address results');
  assert(await readBrowserAddress(win, probe({}, new Error('timeout'))) === '', '#7 probe failure falls back without disabling the backend');
  assert(await readBrowserAddress({ ...win, owner: { name: 'Code' } }, () => { throw new Error('unexpected probe'); }) === '', '#7 native apps never run address capture');
  if (process.platform === 'win32') {
    require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'check-windows-probe.ps1')], { windowsHide: true, timeout: 15000 });
    assert(true, '#7 Windows probe compiles, idle ticks handle rollover, and browser chrome/unknown focus rejects address capture');
  }
}

async function lifecycleChecks() {
  const { EventEmitter } = require('events');
  const { createTracker } = require('../src/tracker');
  const { createSessionManager } = require('../src/sessions');
  const { bindTrackingLifecycle } = require('../src/tracking-lifecycle');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-lifecycle-'));
  const RealDate = Date;
  let time = new RealDate(2026, 8, 9, 12, 0, 0).getTime();
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { return time; }
  };
  let tracker;
  let unbind;
  try {
    const store = createStore(root);
    store.updateSettings({ demoMode: false, idleTimeoutSec: 0, thresholdSec: 3 });
    const sessions = createSessionManager({ dataDir: root });
    const power = new EventEmitter();
    let idleState = 'active';
    power.getSystemIdleState = () => idleState;
    let probes = 0;
    let notifications = 0;
    let completed = 0;
    let pending = false;
    let resolveProbe;
    const sample = { window: { owner: { name: 'chrome' }, title: 'YouTube' } };
    tracker = createTracker({ store, rules, sessionManager: sessions,
      backend: { getActiveWindow() {
        probes++;
        return pending ? new Promise(resolve => { resolveProbe = resolve; }) : Promise.resolve(sample);
      } }, onReminder: () => notifications++,
      onTick: (tick) => { if (tick.sessionCompleted) completed++; }
    });
    unbind = bindTrackingLifecycle(power, tracker);
    const tick = async (ms = 1000) => { time += ms; await tracker.poll(); };
    const running = sessions.startSession({ mode: 'custom', customMin: 1 });
    await tick();
    assert(store.snapshot().byCategory.unproductive === 1, 'lifecycle baseline records foreground activity');
    pending = true;
    time += 1000;
    const interrupted = tracker.poll();
    power.emit('lock-screen');
    power.emit('suspend');
    resolveProbe(sample);
    await interrupted;
    const before = probes;
    await tick(120000);
    assert(probes === before && store.snapshot().byCategory.unproductive === 1, 'lock/sleep suppress probes and discard in-flight activity');
    idleState = 'locked';
    power.emit('resume');
    await tick();
    assert(probes === before, 'resume while locked does not restart capture');
    idleState = 'active';
    power.emit('unlock-screen');
    pending = false;
    await tracker.poll();
    assert(store.snapshot().byCategory.unproductive === 1 && notifications === 0, 'unlock excludes away time and clears stale reminder streak');
    const entry = sessions.getMostRecentSession();
    assert(entry.endedAt === running.endsAt && entry.elapsedSec === 60 && entry.topApps[0].seconds === 1, 'session crossing sleep keeps its deadline without adding away activity');
    await tick();
    assert(completed === 1, 'session completion is delivered once after waking');
    store.updateSettings({ trackingPaused: true });
    power.emit('suspend');
    time += 30000;
    power.emit('resume');
    await tick();
    assert(store.getSettings().trackingPaused && store.snapshot().byCategory.unproductive === 2, 'wake preserves manual tracking pause');
    store.updateSettings({ trackingPaused: false });
    power.emit('suspend');
    power.emit('unlock-screen');
    const beforeSleep = probes;
    await tick();
    assert(probes === beforeSleep, 'unlock cannot clear an outstanding sleep state');
    power.emit('resume');
    await tick();
    const earned = store.snapshot().byCategory.unproductive;
    const nudges = notifications;
    await tick(3600000);
    assert(store.snapshot().byCategory.unproductive === earned && notifications === nudges, 'unreported long gaps add no time or stale reminders');
    await tick(-10000);
    assert(store.snapshot().byCategory.unproductive === earned, 'backward clock jumps add no time');
    pending = true;
    time += 1000;
    const stalled = tracker.poll();
    time += 60000;
    resolveProbe(sample);
    await stalled;
    assert(store.snapshot().byCategory.unproductive === earned, 'probe spanning an unreported sleep is discarded');
    pending = false;
    time = new RealDate(2026, 8, 9, 23, 59, 58).getTime();
    await tracker.poll();
    await tick();
    const yesterdayTotal = store.snapshot().byCategory.unproductive;
    await tick(2000);
    const nextDay = store.snapshot();
    const yesterday = JSON.parse(fs.readFileSync(path.join(root, 'history', '2026-09-09.json'), 'utf8'));
    assert(nextDay.date === '2026-09-10' && nextDay.byCategory.unproductive === 1 && yesterday.byCategory.unproductive === yesterdayTotal + 1, 'midnight splits the complete interval between both days');
    await tick();
    assert(store.snapshot().byHour[0].unproductive === 2, 'post-midnight activity belongs to the new day and hour');
    // Slow requests still have timer heartbeats: latency alone must not lose activity.
    const beforeSlow = store.snapshot().byCategory.unproductive;
    for (let i = 0; i < 2; i++) {
      pending = true;
      time += 1000;
      const slow = tracker.poll();
      for (let second = 0; second < 8; second++) { time += 1000; await tracker.poll(); }
      resolveProbe(sample);
      await slow;
    }
    pending = false;
    await tick();
    assert(store.snapshot().byCategory.unproductive === beforeSlow + 19, 'repeated eight-second probes retain all continuously observed time');
    const hourEnd = new RealDate(2026, 8, 10, 1, 0, 1).getTime();
    const previousHour = store.snapshot().byHour[0].productive;
    store.addInterval('Code', 'productive', hourEnd - 2000, hourEnd);
    assert(store.snapshot().byHour[0].productive === previousHour + 1 && store.snapshot().byHour[1].productive === 1, 'hour boundary splits seconds without dropping or duplicating time');
    const midnight = new RealDate(2026, 8, 10, 0, 0, 0).getTime();
    const priorArchive = JSON.parse(fs.readFileSync(path.join(root, 'history', '2026-09-09.json'), 'utf8'));
    store.addInterval('Code', 'productive', midnight - 500, midnight + 500);
    const updatedArchive = JSON.parse(fs.readFileSync(path.join(root, 'history', '2026-09-09.json'), 'utf8'));
    assert(updatedArchive.byCategory.productive === priorArchive.byCategory.productive + 0.5 && updatedArchive.byCategory.unproductive === priorArchive.byCategory.unproductive, 'late sample merges into an already archived day without overwriting history');
    assert(store.snapshot().byHour[0].productive === previousHour + 1.5, 'fractional boundary seconds are conserved');
    store.addSeconds('Chrome', 'unproductive', 10);
    const statsBeforeFailure = fs.readFileSync(store.filePath, 'utf8');
    const originalRename = fs.renameSync;
    let eventThrew = false;
    try {
      fs.renameSync = () => { throw new Error('simulated disk failure'); };
      power.emit('lock-screen');
    } catch (_) { eventThrew = true; }
    finally { fs.renameSync = originalRename; }
    const failureProbes = probes;
    await tick();
    assert(!eventThrew && probes === failureProbes && fs.readFileSync(store.filePath, 'utf8') === statsBeforeFailure, 'streak write failure cannot escape a lock event, resume capture, or truncate history');
    power.emit('unlock-screen');
    await tick();
    assert(store.snapshot().unproductiveStreak === 1, 'tracking recovers after disk access returns without restoring the stale streak');
    unbind();
    assert(power.listenerCount('suspend') === 0 && power.listenerCount('unlock-screen') === 0, 'lifecycle listeners can be removed cleanly');
    idleState = 'locked';
    unbind = bindTrackingLifecycle(power, tracker);
    const lockedProbes = probes;
    await tick();
    assert(probes === lockedProbes, 'starting while locked suppresses tracking');
    idleState = 'active';
    power.emit('unlock-screen');
    store.addSeconds('Chrome', 'unproductive', 100);
    tracker.start();
    await tracker.poll();
    tracker.stop();
    assert(store.snapshot().unproductiveStreak === 0, 'tracker start clears the previous run reminder streak');
  } finally {
    if (unbind) unbind();
    if (tracker) tracker.stop();
    global.Date = RealDate;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function infrastructureChecks() {
  const { createSessionManager } = require('../src/sessions');
  const { createErrorLog } = require('../src/error-log');
  const { emptyDay } = require('../src/store');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-infrastructure-'));
  try {
    const store = createStore(path.join(root, 'source'));
    for (let i = 1; i <= 90; i++) {
      const date = new Date(); date.setDate(date.getDate() - i);
      const day = emptyDay(todayKey(date.getTime())); day.byCategory.productive = i;
      store.writeHistoryDay(day);
    }
    let historyReads = 0;
    const originalRead = fs.readFileSync;
    try {
      fs.readFileSync = (file, ...args) => { if (String(file).includes(`${path.sep}history${path.sep}`)) historyReads++; return originalRead(file, ...args); };
      for (let i = 0; i < 20; i++) store.snapshot();
      assert(historyReads === 0, '#9 live snapshots read no archived files with 90 days present');
      const week = store.historySummary(7);
      assert(historyReads === 6 && week.length === 7, '#9 week request reads only its six archived days');
      week[0].byCategory.productive = 99999;
      store.historySummary(7);
      assert(historyReads === 6 && store.historySummary(7)[0].byCategory.productive !== 99999, '#9 summaries are cached and callers cannot mutate the cache');
      assert(store.historySummary(900).length === 90 && historyReads === 89, '#9 history requests are bounded to 90 days');
    } finally { fs.readFileSync = originalRead; }
    const previous = new Date(); previous.setDate(previous.getDate() - 1);
    const changed = emptyDay(todayKey(previous.getTime())); changed.byCategory.productive = 987;
    store.writeHistoryDay(changed);
    assert(store.historySummary(7)[5].byCategory.productive === 987, '#9 history writes invalidate cached summaries');
    const sessions = createSessionManager({ dataDir: store.dataDir });
    sessions.startSession({ mode: 'custom', customMin: 1 }); sessions.stopSession();
    sessions.startSession({ mode: 'custom', customMin: 1 });
    const payload = buildExport(store, { sessionManager: sessions, identities, includeSettings: true });
    assert(payload.sessions[todayKey()].length === 2 && sessions.getActiveSession(), 'backup captures running session as a stopped checkpoint without stopping it');
    const dest = createStore(path.join(root, 'destination'));
    const targetSessions = createSessionManager({ dataDir: dest.dataDir, getSettings: () => dest.getSettings() });
    const local = targetSessions.startSession({ mode: 'custom', customMin: 1 });
    let restoredIdentities;
    const result = importBackup(dest, payload, { sessionManager: targetSessions, onIdentities: value => { restoredIdentities = value; } });
    if (!result.ok) console.error('Backup regression error:', result.error);
    assert(result.ok && result.sessionsImported === 2 && restoredIdentities.productiveApps.length, 'backup imports session history and custom identities');
    assert(targetSessions.getActiveSession().id === local.id, 'import never replaces or starts the local active timer');
    importBackup(dest, payload, { sessionManager: targetSessions });
    assert(targetSessions.getSessionsForDay(todayKey()).length === 2, 'repeated imports deduplicate sessions by ID');
    const completedBackup = structuredClone(payload);
    completedBackup.sessions[todayKey()][1].status = 'completed';
    importBackup(dest, completedBackup, { sessionManager: targetSessions });
    assert(targetSessions.getSessionsForDay(todayKey()).some(entry => entry.id === completedBackup.sessions[todayKey()][1].id && entry.status === 'completed'), 'completed backup supersedes an earlier stopped checkpoint');
    importBackup(dest, payload, { sessionManager: targetSessions });
    assert(targetSessions.getSessionsForDay(todayKey()).some(entry => entry.id === completedBackup.sessions[todayKey()][1].id && entry.status === 'completed'), 'older checkpoint cannot downgrade a completed session');
    const before = JSON.stringify(dest.getState());
    const invalid = structuredClone(payload); invalid.sessions[todayKey()][0].endedAt = -1;
    assert(!importBackup(dest, invalid, { mode: 'replace', sessionManager: targetSessions }).ok && JSON.stringify(dest.getState()) === before, 'invalid sessions reject the entire backup before replace');
    const badIdentity = structuredClone(payload); badIdentity.identities.browserApps = [42];
    assert(!importBackup(dest, badIdentity, { mode: 'replace' }).ok, 'invalid identity lists reject backup import');
    importBackup(dest, { format: 'sydtrack-backup', schemaVersion: 1, days: {} }, { mode: 'replace', sessionManager: targetSessions });
    assert(targetSessions.getSessionsForDay(todayKey()).length === 2, 'legacy backups without sessions leave session history intact');
    dest.updateSettings({ sessionHistoryEnabled: false });
    importBackup(dest, payload, { applySettings: false, sessionManager: targetSessions });
    assert(targetSessions.getSessionsForDay(todayKey()).length === 1, 'session import respects disabled session history');
    store.clearAllHistory();
    assert(store.historySummary(7).every(day => day.byCategory.productive === 0), '#9 clearing history invalidates summaries');
    const log = createErrorLog(root, { maxBytes: 1024 });
    const writes = Array.from({ length: 30 }, () => log.write('test', 'x'.repeat(100)));
    assert(writes.every(Boolean), 'local log writes succeed');
    assert(fs.readdirSync(log.directory).length === 2 && fs.statSync(log.filePath).size <= 1024, 'local error logs rotate into two bounded files');
    const append = fs.appendFileSync;
    try {
      fs.appendFileSync = () => { throw new Error('disk full'); };
      assert(log.write('failure', 'test') === false, 'logging failure is contained without recursion');
    } finally { fs.appendFileSync = append; }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

async function historyLoadingChecks() {
  const vm = require('vm');
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer/renderer.js'), 'utf8');
  const targets = { 'week-chart': {}, 'month-history': {} };
  const requests = [];
  let rendered = 0;
  const context = vm.createContext({ historyRequest: 0, historicalWeek: null, analyticsSegment: 'week',
    $: id => targets[id], renderWeek: () => rendered++, esc: value => String(value).replaceAll('<', '&lt;'), fmtFriendly: String,
    api: { getHistorySummary: days => new Promise((resolve, reject) => requests.push({ days, resolve, reject })) } });
  vm.runInContext(source.slice(source.indexOf('async function loadAnalyticsHistory'), source.indexOf('const ANALYTICS_SUBTITLES')), context);
  const first = context.loadAnalyticsHistory();
  assert(targets['week-chart'].textContent === 'Loading history…' && requests[0].days === 7, '#9 week loading is visible and requests only seven days');
  context.analyticsSegment = 'month';
  const second = context.loadAnalyticsHistory();
  requests[0].resolve([]); await first;
  assert(rendered === 0, '#9 late week responses cannot overwrite a newer segment');
  requests[1].resolve([{ date: '<test>', byCategory: { productive: 1, unproductive: 2, other: 3 } }]); await second;
  assert(requests[1].days === 30 && targets['month-history'].innerHTML.includes('33%'), '#9 month requests 30 days and calculates focus share excluding Other');
  const markup = context.monthMarkup([{ byCategory: { productive: 10, unproductive: 10, other: 80 }, apps: [
    { name: '<editor>', seconds: 10, category: 'productive' }, { name: '<editor>', seconds: 5, category: 'unproductive' },
    { name: 'ignored-app', seconds: 999, category: 'ignored' }] }]);
  assert(markup.includes('50%') && markup.includes('&lt;editor>') && markup.includes('15') && !markup.includes('ignored-app'), 'Month merges app categories, escapes labels, and excludes ignored apps');
  assert(context.monthMarkup([]).includes('—'), 'Empty month shows no fabricated focus percentage');
  const error = context.loadAnalyticsHistory(); requests[2].reject(new Error('test')); await error;
  assert(targets['month-history'].textContent.includes('retry'), '#9 history failures show a retry instruction');
}

async function focusProfileChecks() {
  const { createFocusProfiles } = require('../src/focus-profiles');
  const { createTracker } = require('../src/tracker');
  const { createSessionManager } = require('../src/sessions');
  const { parseProfilePack, buildProfilePack } = require('../src/profile-pack');
  const vm = require('vm');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-profiles-'));
  try {
    const store = createStore(root); store.updateSettings({ demoMode: false, idleTimeoutSec: 0 });
    const sessions = createSessionManager({ dataDir: root });
    const rulesHolder = { rules: { ...rules, identities } }, ignoreHolder = { ignore: [] };
    let time = new Date().setHours(12, 0, 0, 0);
    let pending = false, resolveProbe;
    const sample = { window: { owner: { name: 'Code' }, title: 'youtube-clone' } };
    const tracker = createTracker({ store, sessionManager: sessions, rulesHolder, ignoreHolder, now: () => time,
      backend: { getActiveWindow: () => pending ? new Promise(resolve => { resolveProbe = resolve; }) : Promise.resolve(sample) } });
    const context = vm.createContext({ appliedProfile: '', tracker, sessionManager: sessions, rulesHolder, ignoreHolder,
      rulesFilePath: '', ignoreFilePath: '', rulesIsCustom: false, ignoreIsCustom: false,
      attachAppIdentities: value => ({ ...value, identities }), focusProfiles: null });
    const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
    vm.runInContext(main.slice(main.indexOf('function applyFocusProfile('), main.indexOf('function ensureTrackerStarted(')), context);
    fs.writeFileSync(path.join(root, 'rules.json'), JSON.stringify(rules));
    const originalRules = fs.readFileSync(path.join(root, 'rules.json'), 'utf8');
    const manager = createFocusProfiles({ dataDir: root, rules, ignore: [], onChange: context.applyFocusProfile });
    context.focusProfiles = manager; context.applyFocusProfile(manager.active());
    assert(manager.snapshot().profiles.length === 1 && manager.active().id === 'default' && fs.readFileSync(path.join(root, 'rules.json'), 'utf8') === originalRules, 'profiles migrate only Default and preserve legacy tags');
    const running = sessions.startSession({ mode: 'custom', customMin: 5 });
    time += 1000; await tracker.poll();
    const firstTotal = store.snapshot().byCategory.productive;
    const saved = manager.save(null, { name: 'Writing', productive: ['word'], unproductive: ['code'], ignore: ['music'] });
    const writing = saved.profiles[1];
    manager.save(writing.id, { name: 'Writing renamed' });
    const renamed = manager.snapshot().profiles.find(p => p.id === writing.id);
    assert(renamed.productive.includes('word') && renamed.unproductive.includes('code') && renamed.ignore.includes('music') && manager.snapshot().activeId === 'default', 'profile rename preserves saved lists and active selection');
    manager.save(writing.id, { name: writing.name });
    pending = true; time += 1000; const inFlight = tracker.poll();
    manager.activate(writing.id); resolveProbe(sample); await inFlight;
    assert(store.snapshot().byCategory.productive === firstTotal && store.snapshot().byCategory.unproductive === 0, 'switch invalidates a pending probe without rewriting earned totals');
    pending = false; time += 1000; await tracker.poll();
    assert(store.snapshot().byCategory.productive === firstTotal && store.snapshot().byCategory.unproductive === 1, 'profile process tag changes only future classification');
    assert(sessions.getActiveSession().endsAt === running.endsAt && sessions.getActiveSession().distractionCount === 0, 'profile switch preserves session deadline without inventing a distraction');
    manager.save(writing.id, { ignore: ['code'] });
    time += 1000; await tracker.poll();
    assert(store.snapshot().byCategory.productive === firstTotal && store.snapshot().byCategory.unproductive === 1, 'new Ignore tags stop future tracking without hiding earlier totals');
    const restored = createFocusProfiles({ dataDir: root, rules: { productive: [], unproductive: [] }, ignore: [] });
    assert(restored.active().id === writing.id && restored.active().ignore.includes('code'), 'profile selection and edits survive restart');
    const diskBefore = fs.readFileSync(manager.filePath, 'utf8');
    const rename = fs.renameSync;
    let failedWrite = false;
    try { fs.renameSync = () => { throw new Error('simulated profile write failure'); }; manager.activate('default'); }
    catch (_) { failedWrite = true; } finally { fs.renameSync = rename; }
    assert(failedWrite && manager.active().id === writing.id && ignoreHolder.ignore.includes('code') && fs.readFileSync(manager.filePath, 'utf8') === diskBefore, 'failed profile write preserves disk, active selection, and live classification');
    const reject = fn => { try { fn(); return false; } catch (_) { return true; } };
    vm.runInContext(main.slice(main.indexOf('function assertActiveProfile('), main.indexOf("ipcMain.handle('profiles:get'")), context);
    assert(reject(() => context.assertActiveProfile('default')), 'stale tag saves are rejected after a profile switch');
    assert(reject(() => manager.remove('default')) && reject(() => manager.activate('missing')), 'Default deletion and invalid activation are rejected');
    assert(reject(() => manager.save(null, { ...writing, name: ' writing ' })), 'profile names are unique ignoring case and whitespace');
    assert(reject(() => manager.save(null, { ...writing, name: 'Bad', productive: ['site:bad/path'] })), 'malformed site tags cannot enter a profile');
    for (const name of ['One', 'Two', 'Three']) manager.save(null, { name, productive: [], unproductive: [], ignore: [] });
    assert(manager.snapshot().profiles.length === 5 && reject(() => manager.save(null, { ...writing, name: 'Six' })), 'five profile slots are enforced');
    const pack = parseProfilePack(buildProfilePack(manager.active()));
    assert(pack.name === 'Writing' && pack.ignore.includes('code'), 'named profile files roundtrip through the existing portable format');
    const packPath = path.join(root, 'validation.sydtrack-profile');
    fs.writeFileSync(packPath, JSON.stringify(pack));
    const validation = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'validate-profile.js'), packPath], { encoding: 'utf8' });
    assert(validation.status === 0 && validation.stdout.includes('Valid profile: Writing'), 'read-only profile CLI accepts a generated portable file');
    const payload = buildExport(store, { focusProfiles: manager });
    const destination = createStore(path.join(root, 'destination'));
    const destinationProfiles = createFocusProfiles({ dataDir: destination.dataDir, rules, ignore: [] });
    assert(importBackup(destination, payload, { focusProfiles: destinationProfiles }).ok && destinationProfiles.snapshot().profiles.length === 5 && destinationProfiles.active().id === writing.id, 'full backups restore profiles and active selection');
    const invalid = structuredClone(payload); invalid.profiles.activeId = 'missing';
    const destinationBefore = JSON.stringify(destination.getState());
    assert(!importBackup(destination, invalid, { mode: 'replace', focusProfiles: destinationProfiles }).ok && JSON.stringify(destination.getState()) === destinationBefore, 'invalid profile backups are rejected before replacing history');
    manager.remove(writing.id);
    assert(manager.active().id === 'default' && classify(sample.window, rulesHolder.rules) === 'productive', 'deleting active profile returns to Default');
    fs.writeFileSync(manager.filePath, '{broken');
    let preserved;
    const recovered = createFocusProfiles({ dataDir: root, rules, ignore: [], onRecovery: report => { preserved = report.recoveryPath; } });
    assert(recovered.active().id === 'default' && fs.readFileSync(preserved, 'utf8') === '{broken', 'damaged profiles are preserved before Default recovery');
    tracker.stop();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

async function appCorrectionChecks() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-corrections-'));
  const store = createStore(root);
  store.addSeconds('Chrome', 'productive', 20);
  store.addSeconds('Chrome', 'unproductive', 10);
  for (let i = 0; i < 12; i++) store.addSeconds('App' + i, 'other', 1);
  assert(store.snapshot().analyticsApps.length === 10 && store.snapshot().analyticsApps[0].seconds === 30, 'Apps ranks ten distinct apps without discarding other records');
  const corrected = store.correctAppToday('Chrome', 'unproductive');
  assert(corrected.byCategory.productive === 0 && corrected.byCategory.unproductive === 30 && corrected.byHour[new Date().getHours()].unproductive === 30, 'Today correction updates totals and hourly telemetry');
  store.correctAppToday('Chrome', 'ignored');
  assert(store.snapshot().byCategory.unproductive === 0 && store.snapshot().analyticsApps[0].seconds === 30 && !store.snapshot().topApps.some(a => a.name === 'Chrome'), 'Ignored time stays discoverable but is excluded from productivity totals');
  const restarted = createStore(root);
  assert(restarted.getAppCorrection('chrome') === 'ignored' && restarted.snapshot().analyticsApps[0].seconds === 30, 'Ignored correction survives restart without losing recoverable time');
  restarted.correctAppToday('Chrome', 'productive');
  assert(restarted.snapshot().byCategory.productive === 30, 'Unignoring restores previously recorded time');
  const before = fs.readFileSync(restarted.filePath, 'utf8');
  const rename = fs.renameSync; fs.renameSync = () => { throw new Error('disk failure'); };
  try { restarted.correctAppToday('Chrome', 'ignored'); } catch (_) {} finally { fs.renameSync = rename; }
  assert(restarted.snapshot().byCategory.productive === 30 && fs.readFileSync(restarted.filePath, 'utf8') === before, 'Failed correction preserves disk and memory');
  const { createTracker } = require('../src/tracker');
  restarted.updateSettings({ idleTimeoutSec: 0 });
  let time = Date.now();
  const tracker = createTracker({ store: restarted, rules: { productive: [], unproductive: ['youtube'] }, ignore: ['chrome'], now: () => time,
    backend: { getActiveWindow: async () => ({ window: { owner: { name: 'Chrome' }, title: 'YouTube' } }) } });
  time += 1000; await tracker.poll();
  assert(restarted.snapshot().byCategory.productive > 30, 'Explicit today correction overrides ignore and browser keywords for today');
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const raw = restarted.getState(); raw.date = todayKey(yesterday);
  restarted.replaceToday(raw);
  restarted.snapshot();
  assert(!restarted.getAppCorrection('Chrome'), 'Corrections expire on the next local day');
}

async function activityReasonChecks() {
  const { createFocusProfiles } = require('../src/focus-profiles');
  const defaults = require('../src/default-focus-profiles.json');
  const seedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-bundled-profiles-'));
  const seedOptions = { dataDir: seedRoot, rules: { productive: ['custom'], unproductive: [] }, ignore: [] };
  let seeded = createFocusProfiles(seedOptions);
  seeded.save('default', { name: 'My rules' });
  seeded = createFocusProfiles({ ...seedOptions, defaults });
  assert(seeded.snapshot().profiles.length === 5 && seeded.active().name === 'My rules' && seeded.active().productive.includes('custom'), 'Bundled profiles fill empty slots while preserving existing default and selection');
  seeded.remove('coding');
  seeded = createFocusProfiles({ ...seedOptions, defaults });
  assert(seeded.snapshot().profiles.length === 4, 'Deleted bundled profiles are not recreated on restart');
  const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-fresh-profiles-'));
  const fresh = createFocusProfiles({ ...seedOptions, dataDir: freshRoot, defaults });
  assert(fresh.snapshot().profiles.length === 5 && fresh.active().name === 'General', 'Fresh install gets all five bundled profiles with General active');
  const { classifyWithReason } = require('../src/classifier');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-reasons-'));
  const store = createStore(root);
  const rules = { productive: ['github'], unproductive: ['youtube', 'reddit'], identities: { productiveApps: ['code'] } };
  const match = title => classifyWithReason({ owner: { name: 'Chrome' }, title }, rules);
  assert(match('YouTube').reason === 'youtube' && match('Reddit').reason === 'reddit', 'Browser matching records distinct actual keywords');
  assert(classifyWithReason({ owner: { name: 'Code' }, title: 'youtube project' }, rules).reason === 'App identity', 'Process precedence has an honest reason');
  assert(classifyWithReason({ owner: { name: 'Chrome' }, url: 'https://docs.example.com', title: 'youtube' }, { productive: ['site:docs.example.com'], unproductive: ['youtube'] }).reason === 'site:docs.example.com', 'Domain precedence records the winning domain rule');
  store.addSeconds('Chrome', 'productive', 5);
  store.addSeconds('Chrome', 'unproductive', 20, match('YouTube'));
  store.addSeconds('Chrome', 'unproductive', 10, match('Reddit'));
  store.addSeconds('Chrome', 'productive', 30, match('GitHub'));
  let rows = store.snapshot().activityRows;
  assert(rows.length === 4 && rows.some(row => row.reason === 'Keyword not recorded'), 'Legacy and attributed activity remain separate without invented keywords');
  const youtube = rows.find(row => row.reason === 'youtube');
  store.correctActivityToday(youtube.id, 'productive');
  rows = store.snapshot().activityRows;
  assert(rows.find(row => row.reason === 'reddit').category === 'unproductive' && rows.find(row => row.reason === 'youtube').category === 'productive' && store.snapshot().byCategory.productive === 55, 'Correcting YouTube leaves Reddit and other browser usage unchanged');
  store.correctActivityToday(youtube.id, 'ignored');
  assert(store.snapshot().byCategory.productive === 35 && store.snapshot().activityRows.find(row => row.id === youtube.id).seconds === 20, 'Row Ignore retains recoverable time and updates only that row');
  const restarted = createStore(root);
  assert(restarted.getActivityCorrection('Chrome', match('YouTube')) === 'ignored' && !restarted.getActivityCorrection('Chrome', match('Reddit')), 'Row corrections and attribution survive restart without broadening to the process');
  restarted.correctActivityToday(youtube.id, 'productive');
  const { mergeDays } = require('../src/backup');
  const merged = mergeDays(restarted.getState(), restarted.getState());
  assert(Object.values(merged.byApp).reduce((n, app) => n + app.seconds, 0) === 130 && Object.keys(merged.byApp).some(key => key.includes('youtube')), 'Backup merge preserves attributed activity and exact seconds');
  const { createTracker } = require('../src/tracker');
  restarted.updateSettings({ idleTimeoutSec: 0 });
  let time = Date.now(), title = 'YouTube';
  const tracker = createTracker({ store: restarted, rules, ignore: [], now: () => time,
    backend: { getActiveWindow: async () => ({ window: { owner: { name: 'Chrome' }, title } }) } });
  time += 1000; await tracker.poll(); title = 'Reddit'; time += 1000; await tracker.poll();
  rows = restarted.snapshot().activityRows;
  assert(rows.find(row => row.reason === 'youtube').seconds > 20 && rows.find(row => row.reason === 'reddit').category === 'unproductive', 'Live row override does not make all browser tabs productive');
}

regressionChecks().then(lifecycleChecks).then(infrastructureChecks).then(historyLoadingChecks).then(focusProfileChecks).then(appCorrectionChecks).then(activityReasonChecks).then(browserProbeChecks).then(() => {
  console.log(failed ? `\n${failed} failed` : '\nall smoke checks passed');
  process.exitCode = failed ? 1 : 0;
}).catch((err) => { console.error(err); process.exitCode = 1; });
