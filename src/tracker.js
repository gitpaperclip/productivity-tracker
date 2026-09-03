'use strict';

const { createDemoBackend } = require('./demo-windows');
const { classify, appLabel } = require('./classifier');

function createRealBackend() {
  let impl = null;
  let failed = false;

  async function load() {
    if (impl || failed) return impl;
    try {
      const mod = await import('active-win');
      impl = mod.default || mod;
      return impl;
    } catch (err) {
      console.warn('[tracker] active-win unavailable:', err.message);
      failed = true;
      return null;
    }
  }

  async function getActiveWindow() {
    const fn = await load();
    if (!fn) return null;
    try {
      const win = await fn({ accessibilityPermission: false, screenRecordingPermission: false });
      return win || null;
    } catch (err) {
      console.warn('[tracker] getActiveWindow failed:', err.message);
      return null;
    }
  }

  return { getActiveWindow };
}

function createTracker({ store, rules, onTick, onReminder }) {
  const real = createRealBackend();
  const demo = createDemoBackend();
  let timer = null;
  let lastTick = Date.now();
  let current = {
    window: null,
    app: null,
    title: 'Waiting…',
    category: 'other',
    since: Date.now(),
    source: 'idle'
  };

  async function sampleWindow() {
    const settings = store.getSettings();
    if (settings.demoMode) {
      return { win: demo.getActiveWindow(), source: 'demo' };
    }
    const win = await real.getActiveWindow();
    if (win) return { win, source: 'real' };
    return { win: demo.getActiveWindow(), source: 'fallback-demo' };
  }

  async function poll() {
    const now = Date.now();
    const elapsed = Math.min(5, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;

    if (current.app) {
      store.addSeconds(current.app, current.category, elapsed);
      if (store.shouldRemind() && current.category === 'unproductive') {
        store.markReminder();
        if (onReminder) {
          onReminder({
            streak: store.snapshot().unproductiveStreak,
            threshold: store.getSettings().thresholdSec,
            app: current.app,
            title: current.title
          });
        }
      }
    }

    const { win, source } = await sampleWindow();
    const category = classify(win, rules);
    const app = appLabel(win);
    const title = (win && win.title) || '';
    const same = current.app === app && current.title === title && current.category === category;

    if (!same) {
      current = { window: win, app, title, category, since: now, source };
    } else {
      current.window = win;
      current.source = source;
    }

    if (onTick) {
      onTick({
        now: {
          app,
          title,
          category,
          source,
          url: (win && win.url) || '',
          elapsedSec: Math.round((now - current.since) / 1000)
        },
        stats: store.snapshot()
      });
    }
  }

  function start() {
    if (timer) return;
    lastTick = Date.now();
    poll();
    const ms = store.getSettings().pollMs || 1500;
    timer = setInterval(poll, ms);
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { start, stop, poll };
}

module.exports = { createTracker, createRealBackend };
