'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, Notification } = require('electron');

const { loadRules } = require('./classifier');
const { createStore } = require('./store');
const { createTracker } = require('./tracker');

// Headless / CI-friendly Chromium flags
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;
let tracker = null;
let store = null;
let rules = null;

function dataDir() {
  try {
    if (app.isPackaged) return app.getPath('userData');
  } catch (_) {
    /* unpackaged */
  }
  const local = path.join(__dirname, '..', 'data');
  fs.mkdirSync(local, { recursive: true });
  return local;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: 'FocusFlow',
    backgroundColor: '#12110e',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
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

function startServices() {
  rules = loadRules();
  store = createStore(dataDir());

  // Auto-demo on Linux without a real desktop session unless user opted out
  const settings = store.getSettings();
  if (
    !settings.demoMode &&
    process.platform === 'linux' &&
    process.env.FOCUSFLOW_FORCE_REAL !== '1' &&
    (process.env.FOCUSFLOW_AUTO_DEMO === '1' || process.env.XDG_SESSION_TYPE === 'tty')
  ) {
    store.updateSettings({ demoMode: true });
  }

  tracker = createTracker({
    store,
    rules,
    onTick: (payload) => {
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

ipcMain.handle('state:get', async () => {
  return {
    now: null,
    stats: store ? store.snapshot() : null
  };
});

ipcMain.handle('rules:get', async () => {
  return rules;
});

ipcMain.handle('settings:update', async (_e, partial) => {
  if (!store) return {};
  const next = store.updateSettings(partial || {});
  return next;
});
