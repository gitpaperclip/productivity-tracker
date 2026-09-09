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

regressionChecks().then(() => {
  console.log(failed ? `\n${failed} failed` : '\nall smoke checks passed');
  process.exitCode = failed ? 1 : 0;
}).catch((err) => { console.error(err); process.exitCode = 1; });
