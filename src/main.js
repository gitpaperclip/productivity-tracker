'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, Notification } = require('electron');

const {
  loadRulesFrom,
  saveRules,
  loadIgnoreFrom,
  saveIgnore,
  DEFAULT_RULES_PATH,
  DEFAULT_IGNORE_PATH
} = require('./classifier');
const { createStore } = require('./store');
const { createTracker } = require('./tracker');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;
let tracker = null;
let store = null;
/** Mutable holders so tracker picks up hot-reloaded rules/ignore. */
const rulesHolder = { rules: null };
const ignoreHolder = { ignore: [] };
let rulesFilePath = null;
let rulesIsCustom = false;
let ignoreFilePath = null;
let ignoreIsCustom = false;
/** Last tracker tick — so state:get can return `now`. */
let lastPayload = { now: null, stats: null };
let servicesStarted = false;

function dataDir() {
  try {
    if (app.isPackaged) return app.getPath('userData');
  } catch (_) {}
  const local = path.join(__dirname, '..', 'data');
  fs.mkdirSync(local, { recursive: true });
  return local;
}

function userRulesPath() {
  return path.join(dataDir(), 'rules.json');
}

function userIgnorePath() {
  return path.join(dataDir(), 'ignore.json');
}

function loadAppRules() {
  const custom = userRulesPath();
  if (fs.existsSync(custom)) {
    rulesHolder.rules = loadRulesFrom(custom);
    rulesFilePath = custom;
    rulesIsCustom = true;
  } else {
    rulesHolder.rules = loadRulesFrom(DEFAULT_RULES_PATH);
    rulesFilePath = DEFAULT_RULES_PATH;
    rulesIsCustom = false;
  }
  return rulesPayload();
}

function loadAppIgnore() {
  const custom = userIgnorePath();
  if (fs.existsSync(custom)) {
    ignoreHolder.ignore = loadIgnoreFrom(custom);
    ignoreFilePath = custom;
    ignoreIsCustom = true;
  } else {
    ignoreHolder.ignore = loadIgnoreFrom(DEFAULT_IGNORE_PATH);
    ignoreFilePath = DEFAULT_IGNORE_PATH;
    ignoreIsCustom = false;
  }
  return ignorePayload();
}

function rulesPayload() {
  return {
    productive: (rulesHolder.rules && rulesHolder.rules.productive) || [],
    unproductive: (rulesHolder.rules && rulesHolder.rules.unproductive) || [],
    path: rulesFilePath,
    isCustom: rulesIsCustom
  };
}

function ignorePayload() {
  return {
    ignore: ignoreHolder.ignore || [],
    path: ignoreFilePath,
    isCustom: ignoreIsCustom
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 800,
    minHeight: 600,
    title: 'FocusFlow',
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Start tracker after window is visible
    ensureTrackerStarted();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function fireReminder(payload) {
  const minutes = Math.max(1, Math.round((payload.streak || 0) / 60));
  const body =
    payload.threshold && payload.threshold < 60
      ? `Unproductive for ${Math.round(payload.streak)}s on ${payload.app}. Time to refocus.`
      : `You've been unproductive for about ${minutes} min on ${payload.app}. Time to refocus.`;

  if (Notification.isSupported()) {
    const n = new Notification({
      title: 'FocusFlow — refocus',
      body,
      silent: false
    });
    n.show();
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('reminder:fired', { ...payload, body });
  }
}

/** Idempotent: load rules/ignore/store once. Tracker starts separately after show. */
function startServices() {
  if (servicesStarted) return;
  servicesStarted = true;
  loadAppRules();
  loadAppIgnore();
  store = createStore(dataDir());

  // Force real tracking on Windows/macOS unless user opted into demo
  if ((process.platform === 'win32' || process.platform === 'darwin') && process.env.FOCUSFLOW_DEMO == null) {
    const s = store.getSettings();
    if (s.demoMode) {
      store.updateSettings({ demoMode: false });
    }
  }
}

function ensureTrackerStarted() {
  if (tracker) {
    tracker.start(); // idempotent inside tracker
    return;
  }
  if (!store) startServices();
  tracker = createTracker({
    store,
    rulesHolder,
    ignoreHolder,
    onTick: (payload) => {
      lastPayload = payload;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tracker:update', payload);
      }
    },
    onReminder: fireReminder
  });
  tracker.start();
}

app.whenReady().then(() => {
  startServices();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (tracker) tracker.stop();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('state:get', async () => ({
  now: lastPayload.now || null,
  stats: store ? store.snapshot(ignoreHolder.ignore || []) : lastPayload.stats,
  platform: process.platform
}));

ipcMain.handle('rules:get', async () => rulesPayload());

ipcMain.handle('rules:set', async (_e, next) => {
  const dest = userRulesPath();
  rulesHolder.rules = saveRules(dest, next || {});
  rulesFilePath = dest;
  rulesIsCustom = true;
  return rulesPayload();
});

ipcMain.handle('rules:reset', async () => {
  const dest = userRulesPath();
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch (err) {
    console.warn('[main] could not remove custom rules', err.message);
  }
  rulesHolder.rules = loadRulesFrom(DEFAULT_RULES_PATH);
  rulesFilePath = DEFAULT_RULES_PATH;
  rulesIsCustom = false;
  return rulesPayload();
});

ipcMain.handle('ignore:get', async () => ignorePayload());

ipcMain.handle('ignore:set', async (_e, next) => {
  const dest = userIgnorePath();
  const list = Array.isArray(next) ? next : (next && next.ignore) || [];
  ignoreHolder.ignore = saveIgnore(dest, list);
  ignoreFilePath = dest;
  ignoreIsCustom = true;
  return ignorePayload();
});

ipcMain.handle('ignore:reset', async () => {
  const dest = userIgnorePath();
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch (err) {
    console.warn('[main] could not remove custom ignore', err.message);
  }
  ignoreHolder.ignore = loadIgnoreFrom(DEFAULT_IGNORE_PATH);
  ignoreFilePath = DEFAULT_IGNORE_PATH;
  ignoreIsCustom = false;
  return ignorePayload();
});

ipcMain.handle('settings:update', async (_e, partial) => {
  if (!store) return {};
  return store.updateSettings(partial || {});
});
