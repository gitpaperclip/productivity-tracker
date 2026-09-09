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

const snapWeek = store3b.snapshot();
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
  // Exercise real renderer handlers without Electron or writes to user app-data.
  const vm = require('vm');
  const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'renderer.js'), 'utf8');
  const modeButton = { active: true, getAttribute: () => null,
    classList: { toggle(_name, value) { modeButton.active = value; } }, setAttribute() {}, addEventListener(_name, fn) { this.click = fn; } };
  const weekButton = { active: false, getAttribute: () => 'week',
    classList: { toggle(_name, value) { weekButton.active = value; } }, setAttribute() {}, addEventListener(_name, fn) { this.click = fn; } };
  const segmentContext = vm.createContext({ $: () => null, hideChartTip() {}, analyticsSegment: 'day', ANALYTICS_SUBTITLES: {},
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
  let clock = 10000;
  let idleSec = 6;
  const { createTracker } = require('../src/tracker');
  const raceStore = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-pause-race-')));
  raceStore.updateSettings({ demoMode: false, thresholdSec: 1, idleTimeoutSec: 0 });
  let resolveProbe;
  let raceClock = 10000;
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
  let clock = 10000, url = 'https://learn.youtube.com';
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

regressionChecks().then(browserProbeChecks).then(() => {
  console.log(failed ? `\n${failed} failed` : '\nall smoke checks passed');
  process.exitCode = failed ? 1 : 0;
}).catch((err) => { console.error(err); process.exitCode = 1; });
