'use strict';

if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = require('child_process').spawn(require('electron'), [__filename], { env, stdio: 'inherit' });
  child.on('error', err => { console.error(err); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code == null ? 1 : code; });
  return;
}
// Real preload + profile persistence, isolated from the live app and foreground tracking.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const { createFocusProfiles } = require('../src/focus-profiles');
const { createStore } = require('../src/store');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-profile-ui-'));
app.setPath('userData', root); app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const store = createStore(root);
  const profiles = createFocusProfiles({ dataDir: root, rules: { productive: [], unproductive: [] }, ignore: [] });
  const handlers = {
    'state:get': () => ({ stats: store.snapshot(), now: null, session: null }),
    'profiles:get': () => profiles.snapshot(),
    'profiles:save': (_e, { id, fields }) => profiles.save(id, fields),
    'profiles:activate': (_e, id) => profiles.activate(id),
    'rules:set': (_e, fields) => { profiles.save(profiles.snapshot().activeId, { productive: fields.productive, unproductive: fields.unproductive }); return { ...profiles.active(), profileId: profiles.snapshot().activeId }; },
    'ignore:set': (_e, fields) => { profiles.save(profiles.snapshot().activeId, { ignore: fields.ignore }); return { ignore: profiles.active().ignore, profileId: profiles.snapshot().activeId }; },
    'profiles:delete': (_e, id) => profiles.remove(id),
    'rules:get': () => ({ ...profiles.active(), profileId: profiles.snapshot().activeId }),
    'ignore:get': () => ({ ignore: profiles.active().ignore, profileId: profiles.snapshot().activeId }),
    'session:getActive': () => null, 'session:getForDay': () => ({ sessions: [], days: [] }),
    'settings:update': (_e, partial) => store.updateSettings(partial)
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
  const win = new BrowserWindow({ show: false, width: 1040, height: 900,
    webPreferences: { preload: path.join(__dirname, '../src/preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  await win.webContents.executeJavaScript(`(async () => {
    await window.sydtrackProfilesUI.reload();
    await loadRulesAndIgnore();
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const wait = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error('UI wait timed out'); };
    document.getElementById('focus-profile-btn').click();
    await wait(() => !document.getElementById('focus-profile-menu').classList.contains('hidden'));
    check(document.querySelectorAll('.profile-choice').length === 5, 'Expected five Home options');
    document.querySelectorAll('.profile-choice')[1].click();
    await window.sydtrackProfilesUI.reload();
    check(document.getElementById('profile-name').value === '', 'Empty slot should not contain generated tags');
    document.getElementById('profile-name').value = 'Coding';
    document.getElementById('profile-save-named').click();
    await wait(() => document.getElementById('focus-profile-label').textContent === 'Coding');
    check(!document.getElementById('view-tags').classList.contains('hidden'), 'New slot opens Focus Tags');
    check(!document.querySelector('#view-settings #profile-settings'), 'No duplicate Settings editor');
    document.getElementById('tags-quick-input').value = 'code';
    await tagsQuickAdd('productive');
    check((await window.sydtrack.getProfiles()).profiles.find(p => p.name === 'Coding').productive.includes('code'), 'Quick Add saves active profile');
    document.getElementById('rules-prod-edit').value = 'unsaved';
    window.confirm = () => false;
    const selector = document.getElementById('profile-editor-select');
    selector.value = 'default'; selector.dispatchEvent(new Event('change'));
    check(document.getElementById('rules-prod-edit').value === 'unsaved' && selector.value !== 'default', 'Canceled switch preserves draft and selection');
    document.getElementById('profile-rename-named').click();
    document.getElementById('profile-name').value = 'Default';
    document.getElementById('profile-save-named').click();
    await wait(() => document.getElementById('profiles-status').textContent.includes('already exists'));
    check(document.getElementById('rules-prod-edit').value === 'unsaved', 'Failed rename preserves tags');
    document.getElementById('profile-name').value = 'Development';
    document.getElementById('profile-save-named').click();
    await wait(() => document.getElementById('focus-profile-label').textContent === 'Development');
    check(document.getElementById('rules-prod-edit').value === 'unsaved', 'Rename preserves unsaved tags');
    check((await window.sydtrack.getProfiles()).profiles.find(p => p.name === 'Development').productive.includes('code'), 'Rename does not save tag draft');
    window.confirm = () => true;
    selector.value = 'default'; selector.dispatchEvent(new Event('change'));
    await wait(() => document.getElementById('focus-profile-label').textContent === 'default');
    check(document.getElementById('rules-prod-edit').value === '', 'Switch loads selected profile tags');
    document.querySelector('.nav-btn[data-tab="home"]').click();
    document.getElementById('focus-profile-btn').click();
    await wait(() => !document.getElementById('focus-profile-menu').classList.contains('hidden'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    check(document.getElementById('focus-profile-btn').getAttribute('aria-expanded') === 'false', 'Escape must close the chooser');
  })()`);
  for (const width of [800, 1040, 1600]) {
    win.setSize(width, 800);
    const layout = await win.webContents.executeJavaScript(`(async () => {
      document.getElementById('focus-profile-btn').click();
      await window.sydtrackProfilesUI.reload(false);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const boost = document.getElementById('focusboost-btn').getBoundingClientRect();
      const trigger = document.getElementById('focus-profile-btn').getBoundingClientRect();
      const menu = document.getElementById('focus-profile-menu').getBoundingClientRect();
      const last = document.querySelector('.profile-choice:last-child').getBoundingClientRect();
      const hit = document.elementFromPoint(last.x + last.width / 2, last.y + last.height / 2);
      return { below: trigger.top >= boost.bottom, menuInside: menu.right <= innerWidth && menu.left >= 0,
        clickable: !!hit && !!hit.closest('.profile-choice') };
    })()`);
    console.log('Profile chooser layout', width, layout);
    if (!layout.below || !layout.menuInside || !layout.clickable) throw new Error('Profile chooser layout failed');
    if (width === 1040) fs.writeFileSync(path.join(os.tmpdir(), 'sydtrack-profiles-home.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  }
  await win.webContents.executeJavaScript(`(async () => { document.querySelector('.nav-btn[data-tab="tags"]').click(); await window.sydtrackProfilesUI.reload(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()`);
  await new Promise(resolve => setTimeout(resolve, 300));
  fs.writeFileSync(path.join(os.tmpdir(), 'sydtrack-profiles-settings.png'), (await win.webContents.capturePage()).toPNG());
  console.log('Profile UI checks passed: create, activate, failed save, draft cancellation, five slots, keyboard dismissal.');
  await win.webContents.executeJavaScript(`document.getElementById('profile-rename-named').click(); document.getElementById('profile-name-form').scrollIntoView({ block: 'end' });`);
  await new Promise(resolve => setTimeout(resolve, 300));
  fs.writeFileSync(path.join(os.tmpdir(), 'sydtrack-profile-name-editor.png'), (await win.webContents.capturePage()).toPNG());
  app.exit(0);
}).catch(err => { console.error(err); app.exit(1); });
setTimeout(() => { console.error('Profile UI checks timed out'); app.exit(1); }, 45000).unref();
