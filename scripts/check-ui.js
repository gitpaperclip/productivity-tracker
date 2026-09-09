'use strict';

if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = require('child_process').spawn(require('electron'), [__filename], { env, stdio: 'inherit' });
  child.on('error', (err) => { console.error(err); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code == null ? 1 : code; });
  return;
}

// Isolated renderer verification: no preload, tracking service, or user data access.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'sydtrack-ui-')));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1040, height: 760,
    webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  const results = [];
  for (const width of [800, 1040, 1600]) {
    win.setSize(width, 760);
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    results.push(await win.webContents.executeJavaScript(`(() => {
      const results = [];
      for (const id of ['pie-tip', 'day-tip', 'week-tip']) {
        const tip = document.getElementById(id);
        tip.closest('.view').classList.remove('hidden');
        const panel = tip.closest('.analytics-panel');
        if (panel) panel.classList.remove('hidden');
        tip.classList.remove('hidden');
        tip.style.left = '0px'; tip.style.top = '0px';
        tip.innerHTML = '<div class="pt-cat">Productive · top apps</div><ul><li><span class="pt-name app-trunc">Intel Connectivity Performance Suite with a very long application name</span><span class="pt-secs">123:59:59</span></li></ul>';
        const box = tip.getBoundingClientRect();
        const time = tip.querySelector('.pt-secs').getBoundingClientRect();
        results.push({ id, width: innerWidth, overflow: tip.scrollWidth > tip.clientWidth + 1, timeInside: time.right <= box.right - 10 });
      }
      return results;
    })()`));
  }
  console.log(JSON.stringify(results.flat()));
  const tagChecks = await win.webContents.executeJavaScript(`(() => {
    const input = document.getElementById('tags-quick-input');
    input.value = 'youtube';
    fillRulesEditors({ productive: [], unproductive: ['youtube'] });
    const loaded = document.getElementById('tags-quick-status').textContent.includes('Unproductive');
    document.getElementById('rules-unprod-edit').value = '';
    document.getElementById('rules-unprod-edit').dispatchEvent(new Event('input'));
    const removed = document.getElementById('tags-quick-status').textContent.includes('not in any list');
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('hidden', view.id !== 'view-home'));
    const siteKey = keywordForQuickClassify({ app: 'chrome', title: 'Unhelpful title', url: 'https://example.com' }) === 'site:example.com';
    const siteCategory = defaultCategoryFromRules({ app: 'chrome', url: 'https://learn.youtube.com', title: 'youtube' }, { productive: ['site:learn.youtube.com'], unproductive: ['youtube'] }, []) === 'productive';
    if (!siteKey || !siteCategory) throw new Error('Website quick tagging or classification failed');
    return { loaded, removed, siteKey, siteCategory };
  })()`);
  console.log('Tag input checks:', JSON.stringify(tagChecks));
  const segmentChecks = await win.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-segment="week"]').click();
    document.querySelector('[data-session-mode="custom"]').click();
    const analyticsPreserved = document.querySelector('[data-segment="week"]').classList.contains('active');
    document.querySelector('[data-segment="apps"]').click();
    const sessionPreserved = document.querySelector('[data-session-mode="custom"]').classList.contains('active');
    return { analyticsPreserved, sessionPreserved };
  })()`);
  console.log('Independent segment checks:', JSON.stringify(segmentChecks));
  const hoverChecks = await win.webContents.executeJavaScript(`(async () => {
    const results = [];
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('hidden', view.id !== 'view-analytics'));
    document.querySelector('.main').scrollTop = 0;
    for (const mode of ['day', 'week']) {
      setAnalyticsSegment(mode);
      const stats = { date: '2026-09-09', byHour: Array.from({length: 24}, () => ({productive: 0, unproductive: 0, other: 0, byApp: {}})), week: [] };
      const update = (i) => {
        stats.byHour[12] = { productive: 60 + i, unproductive: 0, other: 0, byApp: { ['Refresh ' + i]: {seconds: 60 + i, category: 'productive'} } };
        stats.week = [{date: '2026-09-09', byCategory: {productive: 60 + i}, topApps: [{name: 'Refresh ' + i, seconds: 60 + i, category: 'productive'}]}];
        (mode === 'day' ? renderDay : renderWeek)(stats);
      };
      update(0);
      const chart = document.getElementById(mode + '-chart');
      chart.scrollIntoView({block: 'center'});
      const col = chart.querySelector('.day-col:not(.empty)');
      const rect = col.getBoundingClientRect();
      col.dispatchEvent(new MouseEvent('mousemove', {bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2}));
      const tip = document.getElementById(mode + '-tip');
      let stayedVisible = !tip.classList.contains('hidden');
      for (let i = 1; i <= 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 750));
        update(i);
        stayedVisible = stayedVisible && !tip.classList.contains('hidden') && tip.textContent.includes('Refresh ' + i);
      }
      chart.dispatchEvent(new MouseEvent('mouseleave'));
      update(4);
      const leftHidden = tip.classList.contains('hidden');
      results.push({mode, stayedVisible, leftHidden});
    }
    return results;
  })()`);
  console.log('Stationary hover checks:', JSON.stringify(hoverChecks));
  await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const screenshot = await win.webContents.capturePage();
  fs.writeFileSync(path.join(os.tmpdir(), 'sydtrack-ui-home.png'), screenshot.toPNG());
  fs.writeFileSync(path.join(os.tmpdir(), 'sydtrack-ui-results.json'), JSON.stringify(results.flat(), null, 2));
  const failed = results.flat().some((r) => r.overflow || !r.timeInside) || !tagChecks.loaded || !tagChecks.removed || hoverChecks.some(r => !r.stayedVisible || !r.leftHidden) || !segmentChecks.analyticsPreserved || !segmentChecks.sessionPreserved;
  app.exit(failed ? 1 : 0);
}).catch((error) => { console.error(error); app.exit(1); });

setTimeout(() => { console.error('UI checks timed out'); app.exit(1); }, 20000).unref();
