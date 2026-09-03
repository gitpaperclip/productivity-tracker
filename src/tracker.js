'use strict';

const { createDemoBackend } = require('./demo-windows');
const { classify, appLabel } = require('./classifier');

function createRealBackend() {
  let impl = null;
  let failed = false;
  let lastError = null;

  async function load() {
    if (impl || failed) return impl;
    try {
      const mod = await import('active-win');
      impl = mod.default || mod;
      return impl;
    } catch (err) {
      lastError = err.message || String(err);
      console.warn('[tracker] active-win unavailable:', lastError);
      failed = true;
      return null;
    }
  }

  async function getActiveWindow() {
    const fn = await load();
    if (!fn) return { window: null, error: lastError || 'active-win not loaded' };
    try {
      const win = await fn({
        accessibilityPermission: false,
        screenRecordingPermission: false
      });
      if (!win) return { window: null, error: null };
      return { window: win, error: null };
    } catch (err) {
      lastError = err.message || String(err);
      console.warn('[tracker] getActiveWindow failed:', lastError);
      return { window: null, error: lastError };
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
    app: '—',
    title: 'Waiting…',
    category: 'other',
    since: Date.now(),
    source: 'idle'
  };

  async function poll() {
    const now = Date.now();
    const elapsed = Math.min(5, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;

    const settings = store.getSettings();
    let win = null;
    let source = 'demo';
    let trackingError = null;

    if (settings.demoMode) {
      win = demo.getActiveWindow();
      source = 'demo';
    } else {
      const result = await real.getActiveWindow();
      win = result.window;
      trackingError = result.error;
      if (win) {
        source = 'real';
      } else {
        source = 'idle';
      }
    }

    const category = win ? classify(win, rules) : 'other';
    const app = win ? appLabel(win) : (trackingError ? 'Tracking unavailable' : 'No active window');
    const title = (win && win.title) || (trackingError
      ? trackingError
      : (settings.demoMode ? '' : 'Switch apps to start tracking'));

    const same =
      current.app === app &&
      current.title === title &&
      current.category === category;

    if (!same) {
      current = { window: win, app, title, category, since: now, source };
    } else {
      current.window = win;
      current.source = source;
    }

    if (win) {
      store.addSeconds(app, category, elapsed);
    }

    if (win && store.shouldRemind() && category === 'unproductive') {
      store.markReminder();
      if (onReminder) {
        onReminder({
          streak: store.snapshot().unproductiveStreak,
          threshold: settings.thresholdSec,
          app,
          title
        });
      }
    }

    if (onTick) {
      onTick({
        now: {
          app,
          title,
          category,
          source,
          url: (win && win.url) || '',
          elapsedSec: Math.round((now - current.since) / 1000),
          trackingError
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
