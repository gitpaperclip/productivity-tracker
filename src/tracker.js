'use strict';

const { createDemoBackend } = require('./demo-windows');
const { classify, appLabel, isIgnored, isBrowserProcess } = require('./classifier');

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
function createTracker({ store, rulesHolder, rules, ignoreHolder, ignore, sessionManager, onTick, onReminder, backend, now: clock = Date.now }) {
  const rHolder = rulesHolder || { rules: rules };
  const iHolder = ignoreHolder || { ignore: ignore || [] };
  const real = backend || createRealBackend();
  const demo = createDemoBackend();
  let timer = null;
  let pollInFlight = false;
  let generation = 0;
  let systemInactive = false;
  let lastTick = clock();
  let lastHeartbeat = lastTick;
  let current = {
    window: null,
    app: '—',
    title: 'Waiting…',
    category: 'other',
    since: Date.now(),
    source: 'idle'
  };
  /** Last non-ignored, non-SydTrack window — survives while user looks at SydTrack. */
  let lastFocused = null;

  function resetStreakSafely() {
    try { if (store.resetStreak) store.resetStreak(); }
    catch (err) { console.error('[tracker] could not persist streak reset:', err.message); }
  }

  function checkContinuity() {
    const at = clock();
    const gap = at - lastHeartbeat;
    const tolerance = Math.max(5000, (Number(store.getSettings().pollMs) || 1500) * 3);
    lastHeartbeat = at;
    if (gap < 0 || gap > tolerance) {
      generation += 1;
      lastTick = at;
      current.since = at;
      resetStreakSafely();
    }
  }

  async function pollOnce() {
    if (systemInactive) return;
    const pollGeneration = generation;
    const now = clock();
    const intervalStart = lastTick;
    let elapsed = Math.max(0, (now - intervalStart) / 1000);
    lastTick = now;

    let settings = store.getSettings();
    const startedPaused = !!settings.trackingPaused;
    const startedDemo = !!settings.demoMode;
    let win = null;
    let source = 'idle';
    let trackingError = null;
    let idleSec = 0;

    if (settings.demoMode) {
      win = demo.getActiveWindow();
      source = 'demo';
      trackingError = null;
    } else {
      // Real mode only — do not silently fall back to demo
      const result = await real.getActiveWindow();
      win = result.window;
      idleSec = Math.max(0, Number(result.idleSec) || 0);
      trackingError = result.error || null;
      source = win ? 'real' : 'idle';
    }

    checkContinuity();
    if (pollGeneration !== generation || systemInactive) return;
    settings = store.getSettings();
    if (!!settings.demoMode !== startedDemo) return;
    if (startedPaused) elapsed = 0;
    const correction = win && store.getAppCorrection ? store.getAppCorrection(appLabel(win)) : null;
    const selfIgnored = win && isIgnored(win, [], {});
    const ignored = selfIgnored || (correction ? correction === 'ignored' : win ? isIgnored(win, iHolder.ignore || [], rHolder.rules && rHolder.rules.identities) : false);
    const idleTimeoutSec = Math.max(0, Number(settings.idleTimeoutSec) || 0);
    const idle = !settings.demoMode && idleTimeoutSec > 0 && idleSec >= idleTimeoutSec;
    // Pause at the timeout. Never subtract accumulated idle time from earned history.
    // Show in Now viewing; do not log time or affect streaks when ignored
    const category = !win ? 'other' : ignored ? 'ignored' : correction || classify(win, rHolder.rules);
    const app = win
      ? appLabel(win)
      : trackingError
        ? 'Tracking unavailable'
        : 'No active window';
    const title =
      (win && win.title) ||
      (trackingError
        ? trackingError
        : settings.trackingPaused
          ? 'Tracking paused'
          : settings.demoMode
            ? ''
            : 'Switch apps to start tracking');
    const browser = !!(win && isBrowserProcess(win, rHolder.rules && rHolder.rules.identities));

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

    const paused = !!settings.trackingPaused;
    if (paused) {
      source = 'paused';
      current.source = 'paused';
    } else if (idle) {
      source = 'idle';
      current.source = 'idle';
    }

    // NEVER count ignored toward totals or streaks; never log while paused
    if (win && !ignored && !paused && !idle) {
      if (store.addInterval && elapsed > 0) store.addInterval(app, category, intervalStart, now);
      else store.addSeconds(app, category, elapsed);
    } else if (store.resetStreak) {
      store.resetStreak();
    }

    // Focus session: accumulate byApp + distraction edges while active
    let sessionInfo = null;
    if (sessionManager && typeof sessionManager.onTrackerTick === 'function') {
      sessionInfo = sessionManager.onTrackerTick({
        app,
        category,
        elapsedSec: win && !ignored && !paused && !idle ? elapsed : 0
      });
    }

    // Remember last real focused app (not ignored / not self) for Home "Last focused"
    // Freeze lastFocused while paused so the Home bar stays put
    if (win && !ignored && !paused && !idle) {
      lastFocused = {
        app,
        title,
        url: win.url || '',
        category,
        browser,
        source,
        at: now
      };
    }

    if (
      win &&
      !ignored &&
      !paused &&
      !idle &&
      settings.notificationsEnabled !== false &&
      store.shouldRemind() &&
      category === 'unproductive'
    ) {
      store.markReminder();
      if (onReminder) {
        onReminder({
          streak: store.snapshot([], { includeWeek: false }).unproductiveStreak,
          threshold: settings.thresholdSec,
          app,
          title
        });
      }
    }

    if (onTick) {
      const activeSession =
        (sessionInfo && sessionInfo.active) ||
        (sessionManager && sessionManager.getActiveSession && sessionManager.getActiveSession()) ||
        null;
      onTick({
        now: {
          app,
          title,
          category,
          browser,
          source,
          ignored,
          idle,
          idleSec,
          url: (win && win.url) || '',
          elapsedSec: Math.round((now - current.since) / 1000),
          trackingError
        },
        lastFocused,
        stats: store.snapshot([], { includeWeek: false }),
        session: activeSession,
        sessionCompleted: (sessionInfo && sessionInfo.completed) || null
      });
    }
  }

  async function poll() {
    // Keep observing timer continuity even while a slow backend request is pending.
    checkContinuity();
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      await pollOnce();
    } finally {
      pollInFlight = false;
    }
  }

  function start() {
    if (timer) return; // idempotent
    resetStreakSafely();
    lastTick = clock();
    lastHeartbeat = lastTick;
    const run = () => poll().catch((err) => console.error('[tracker] poll failed:', err.message));
    run();
    const ms = store.getSettings().pollMs || 1500;
    timer = setInterval(run, ms);
    if (timer.unref) timer.unref();
  }

  function stop() {
    generation += 1;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function getLastFocused() {
    return lastFocused;
  }

  function setSystemInactive(inactive) {
    if (systemInactive === !!inactive) return;
    systemInactive = !!inactive;
    generation += 1;
    lastTick = clock();
    lastHeartbeat = lastTick;
    current.since = lastTick;
    resetStreakSafely();
  }

  function invalidateClassification() {
    generation++;
    lastTick = clock();
    lastHeartbeat = lastTick;
    current.since = lastTick;
    lastFocused = null;
    resetStreakSafely();
  }

  return { start, stop, poll, getLastFocused, setSystemInactive, invalidateClassification };
}

module.exports = { createTracker, createRealBackend };
