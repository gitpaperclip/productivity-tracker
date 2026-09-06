
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, Notification } = require('electron');

const { loadRules } = require('./classifier');
const { createStore } = require('./store');
const { createTracker } = require('./tracker');

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
  } catch (_) {}
  const local = path.join(__dirname, '..', 'data');
  fs.mkdirSync(local, { recursive: true });
  return local;
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
  mainWindow.once('ready-to-show', () => mainWindow.show());
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

  // Force real tracking on Windows/macOS unless user opted into demo
  if ((process.platform === 'win32' || process.platform === 'darwin') && process.env.FOCUSFLOW_DEMO == null) {
    const s = store.getSettings();
    if (s.demoMode) {
      store.updateSettings({ demoMode: false });
    }
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

ipcMain.handle('state:get', async () => ({
  now: null,
  stats: store ? store.snapshot() : null,
  platform: process.platform
}));

ipcMain.handle('rules:get', async () => rules);

ipcMain.handle('settings:update', async (_e, partial) => {
  if (!store) return {};
  return store.updateSettings(partial || {});
});
