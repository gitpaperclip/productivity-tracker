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
  isBrowserProcess
} = require('../src/classifier');
const { createStore } = require('../src/store');
const { createDemoBackend } = require('../src/demo-windows');

const rules = loadRules();
const ignore = loadIgnore();
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
      title: 'cursor/focusflow: Pull Request — GitHub',
      owner: { name: 'Google Chrome' },
      url: 'https://github.com/acme/focusflow'
    },
    rules
  ) === 'productive',
  'github is productive'
);
assert(
  classify({ title: 'New Tab', owner: { name: 'Google Chrome' }, url: 'chrome://newtab' }, rules) === 'other',
  'bare chrome stays other (title decides)'
);
assert(
  classify({ title: 'New Tab', owner: { name: 'msedge' } }, rules) === 'other',
  'bare msedge stays other'
);
assert(
  classify({ title: 'Mozilla Firefox', owner: { name: 'firefox' } }, rules) === 'other',
  'bare firefox stays other'
);
assert(
  classify({ title: 'YouTube', owner: { name: 'brave' } }, rules) === 'unproductive',
  'youtube-in-brave unproductive'
);
assert(classify({ title: 'Untitled', owner: { name: 'Notes' } }, rules) === 'other', 'unknown is other');
assert(appLabel({ owner: { name: 'Cursor' }, title: 'x' }) === 'Cursor', 'app label uses process name');

assert(isBrowserProcess({ owner: { name: 'Google Chrome' } }) === true, 'chrome is browser process');
assert(isBrowserProcess({ owner: { name: 'Code' } }) === false, 'Code is not browser');

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
  isIgnored({ owner: { name: 'Code' }, title: 'app.js' }, ignore) === false,
  'Code editor is not ignored'
);
assert(
  isIgnored({ owner: { name: 'electron' }, title: 'FocusFlow' }, ignore) === true,
  'electron + FocusFlow title is ignored (self)'
);
assert(
  isIgnored({ owner: { name: 'Electron' }, title: 'focusflow — Today' }, ignore) === true,
  'Electron + focusflow title case-insensitive ignored'
);
assert(
  isIgnored({ owner: { name: 'electron' }, title: 'Some Other App' }, ignore) === false,
  'electron without FocusFlow title is NOT ignored'
);
assert(
  isIgnored({ owner: { name: 'FocusFlow' }, title: 'Today' }, ignore) === true,
  'focusflow process name is ignored'
);

// Browsers must not be in productive defaults
for (const b of ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'chromium']) {
  assert(!rules.productive.includes(b), b + ' not in productive defaults');
}

// save/load rules roundtrip
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'focusflow-rules-'));
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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'focusflow-'));
const store = createStore(dir);
store.updateSettings({ thresholdSec: 30, reminderCooldownSec: 1, demoMode: true });
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
assert(ignore.includes('focusflow'), 'ignore defaults include focusflow');

console.log(failed ? `\n${failed} failed` : '\nall smoke checks passed');
process.exit(failed ? 1 : 0);
