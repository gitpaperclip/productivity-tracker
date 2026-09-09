'use strict';

const path = require('path');
const { Tray, Menu, nativeImage } = require('electron');

const LOGO_PATH = path.join(__dirname, '..', 'renderer', 'assets', 'logo-wordmark.png');

function focusBoostSecFromSettings(settings) {
  const n = Number(settings && settings.focusBoostSec);
  if (Number.isFinite(n) && n >= 5) return Math.round(n);
  return 180;
}

function formatRemaining(sec) {
  const s = Math.max(0, Math.ceil(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}

/**
 * Minimal SydTrack tray (v1).
 * @param {object} deps
 * @param {() => import('electron').BrowserWindow|null} deps.getMainWindow
 * @param {() => object|null} deps.getStore
 * @param {() => object|null} deps.getSessionManager
 * @param {() => object|null} [deps.getLastPayload]
 * @param {(payload: object) => void} [deps.sendTrackerUpdate]
 * @param {() => void} deps.onQuit
 */
function createAppTray(deps) {
  const getMainWindow = deps.getMainWindow;
  const getStore = deps.getStore;
  const getSessionManager = deps.getSessionManager;
  const getLastPayload = deps.getLastPayload || (() => null);
  const sendTrackerUpdate = deps.sendTrackerUpdate || (() => {});
  const onQuit = deps.onQuit;

  let image = nativeImage.createFromPath(LOGO_PATH);
  if (!image.isEmpty()) {
    image = image.resize({ width: 24, height: 24 });
  }
  const tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('SydTrack');

  function settings() {
    const store = getStore();
    return (store && store.getSettings && store.getSettings()) || {};
  }

  function activeSession() {
    const sm = getSessionManager();
    if (sm && typeof sm.getActiveSession === 'function') {
      return sm.getActiveSession();
    }
    const last = getLastPayload();
    return (last && last.session) || null;
  }

  function showWindow() {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  function pushSettings(partial) {
    const store = getStore();
    if (!store || typeof store.updateSettings !== 'function') return null;
    return store.updateSettings(partial || {});
  }

  function pushFreshSnapshot() {
    const store = getStore();
    const last = getLastPayload() || {};
    const snapshot = {
      now: last.now || null,
      lastFocused: last.lastFocused || null,
      stats: store && store.snapshot ? store.snapshot() : last.stats || null,
      session: activeSession(),
      settings: settings()
    };
    // Prefer full last payload shape when present
    const payload = Object.assign({}, last, {
      stats: snapshot.stats || last.stats,
      session: snapshot.session,
      // Completion is a one-time event, not part of a settings refresh.
      sessionCompleted: null,
      settings: snapshot.settings
    });
    // Ensure renderer sees updated settings via stats.settings when possible
    if (payload.stats && typeof payload.stats === 'object') {
      payload.stats = Object.assign({}, payload.stats, { settings: snapshot.settings });
    }
    sendTrackerUpdate(payload);
  }

  function togglePause() {
    const s = settings();
    pushSettings({ trackingPaused: !s.trackingPaused });
    refresh();
    pushFreshSnapshot();
  }

  function toggleFocusBoost() {
    const s = settings();
    const on = !!s.focusBoost;
    const boostSec = focusBoostSecFromSettings(s);
    if (!on) {
      const restore =
        Number(s.thresholdSec) && Number(s.thresholdSec) !== boostSec
          ? Number(s.thresholdSec)
          : Number(s.focusBoostRestoreSec) || 600;
      pushSettings({
        focusBoost: true,
        thresholdSec: boostSec,
        focusBoostRestoreSec: restore,
        focusBoostSec: boostSec
      });
    } else {
      const restore = Number(s.focusBoostRestoreSec) || 600;
      pushSettings({
        focusBoost: false,
        thresholdSec: restore
      });
    }
    refresh();
    pushFreshSnapshot();
  }

  function toggleAlerts() {
    const s = settings();
    const enabled = s.notificationsEnabled !== false;
    pushSettings({ notificationsEnabled: !enabled });
    refresh();
    pushFreshSnapshot();
  }

  function buildTooltip() {
    const s = settings();
    const parts = [];
    parts.push(s.trackingPaused ? 'Paused' : 'Live');
    parts.push(s.focusBoost ? 'focusboost' : 'boost off');
    parts.push(s.notificationsEnabled === false ? 'DND' : 'ALERTS ON');
    const session = activeSession();
    if (session && (session.status === 'running' || session.active)) {
      const rem =
        session.remainingSec != null
          ? session.remainingSec
          : session.tray && session.tray.remainingSec;
      const label = session.modeLabel || (session.tray && session.tray.modeLabel) || 'Session';
      if (rem != null) {
        parts.push(label + ' ' + formatRemaining(rem));
      } else {
        parts.push(label);
      }
    }
    return 'SydTrack — ' + parts.join(' · ');
  }

  function buildMenu() {
    const s = settings();
    const alertsOn = s.notificationsEnabled !== false;
    return Menu.buildFromTemplate([
      {
        label: 'open sydtrack',
        click: () => showWindow()
      },
      { type: 'separator' },
      {
        label: 'Pause tracking',
        type: 'checkbox',
        checked: !!s.trackingPaused,
        click: () => togglePause()
      },
      {
        label: 'focusboost',
        type: 'checkbox',
        checked: !!s.focusBoost,
        click: () => toggleFocusBoost()
      },
      {
        label: alertsOn ? 'ALERTS ON' : 'DND',
        type: 'checkbox',
        checked: alertsOn,
        click: () => toggleAlerts()
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          if (typeof onQuit === 'function') onQuit();
        }
      }
    ]);
  }

  function refresh() {
    try {
      tray.setToolTip(buildTooltip());
      tray.setContextMenu(buildMenu());
    } catch (err) {
      console.warn('[tray] refresh failed', err && err.message);
    }
  }

  tray.on('double-click', () => showWindow());
  // Windows: single click often opens context menu; double-click opens app.
  if (process.platform === 'darwin') {
    tray.on('click', () => showWindow());
  }

  refresh();

  return {
    tray,
    refresh,
    destroy() {
      try {
        tray.destroy();
      } catch (_) {
        /* ignore */
      }
    }
  };
}

module.exports = { createAppTray };
