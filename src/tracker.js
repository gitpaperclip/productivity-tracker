'use strict';

const { createDemoBackend } = require('./demo-windows');
const { classify, appLabel, isIgnored } = require('./classifier');

function createActiveWinBackend() {
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
      return { window: win || null, error: null };
    } catch (err) {
      lastError = err.message || String(err);
      console.warn('[tracker] active-win getActiveWindow failed:', lastError);
      return { window: null, error: lastError };
    }
  }

  return { getActiveWindow };
}

/**
 * win32: PowerShell/user32 windows-backend is PRIMARY.
 * active-win only on non-Windows, or if windows-backend fails to load / errors at runtime.
 * Never silently switch to demo when demoMode is false.
 */
function createRealBackend() {
  if (process.platform === 'win32') {
    let windows = null;
    let activeWin = null;
    let useActiveWin = false;

    try {
      windows = require('./windows-backend').createWindowsBackend();
    } catch (err) {
      console.warn(
        '[tracker] windows-backend load failed, falling back to active-win:',
        err.message || err
      );
      return createActiveWinBackend();
    }

    async function getActiveWindow() {
      if (!useActiveWin) {
        const result = await windows.getActiveWindow();
        if (result.window || !result.error) {
          return result;
        }
        console.warn('[tracker] windows-backend error, falling back to active-win:', result.error);
        useActiveWin = true;
      }
      if (!activeWin) activeWin = createActiveWinBackend();
      return activeWin.getActiveWindow();
    }

    return { getActiveWindow };
  }

  return createActiveWinBackend();
}

/**
 * rulesHolder = { rules }; ignoreHolder = { ignore }
 * Mutable so IPC can hot-reload without restarting tracker.
 * Also accepts legacy `rules` / `ignore` plain values for smoke/tests.
 */
function createTracker({ store, rulesHolder, rules, ignoreHolder, ignore, onTick, onReminder }) {
  const rHolder = rulesHolder || { rules: rules };
  const iHolder = ignoreHolder || { ignore: ignore || [] };
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
  /** Last non-ignored, non-FocusFlow window — survives while user looks at FocusFlow. */
  let lastFocused = null;

  async function poll() {
    const now = Date.now();
    const elapsed = Math.min(5, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;

    const settings = store.getSettings();
    let win = null;
    let source = 'idle';
    let trackingError = null;

    if (settings.demoMode) {
      win = demo.getActiveWindow();
      source = 'demo';
      trackingError = null;
    } else {
      // Real mode only — do not silently fall back to demo
      const result = await real.getActiveWindow();
      win = result.window;
      trackingError = result.error || null;
      source = win ? 'real' : 'idle';
    }

    const ignored = win ? isIgnored(win, iHolder.ignore || []) : false;
    // Show in Now viewing; do not log time or affect streaks when ignored
    const category = !win ? 'other' : ignored ? 'ignored' : classify(win, rHolder.rules);
    const app = win
      ? appLabel(win)
      : trackingError
        ? 'Tracking unavailable'
        : 'No active window';
    const title =
      (win && win.title) ||
      (trackingError
        ? trackingError
        : settings.demoMode
          ? ''
          : 'Switch apps to start tracking');

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

    // NEVER count ignored toward totals or streaks
    if (win && !ignored) {
      store.addSeconds(app, category, elapsed);
    }

    // Remember last real focused app (not ignored / not self) for Home "Last focused"
    if (win && !ignored) {
      lastFocused = {
        app,
        title,
        category,
        source,
        at: now
      };
    }

    if (win && !ignored && store.shouldRemind() && category === 'unproductive') {
      store.markReminder();
      if (onReminder) {
        onReminder({
          streak: store.snapshot(iHolder.ignore || []).unproductiveStreak,
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
          ignored,
          url: (win && win.url) || '',
          elapsedSec: Math.round((now - current.since) / 1000),
          trackingError
        },
        lastFocused,
        stats: store.snapshot(iHolder.ignore || [])
      });
    }
  }

  function start() {
    if (timer) return; // idempotent
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

  function getLastFocused() {
    return lastFocused;
  }

  return { start, stop, poll, getLastFocused };
}

module.exports = { createTracker, createRealBackend };
