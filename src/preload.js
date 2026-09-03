'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focusflow', {
  onUpdate: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('tracker:update', handler);
    return () => ipcRenderer.removeListener('tracker:update', handler);
  },
  onReminder: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('reminder:fired', handler);
    return () => ipcRenderer.removeListener('reminder:fired', handler);
  },
  getState: () => ipcRenderer.invoke('state:get'),
  getRules: () => ipcRenderer.invoke('rules:get'),
  updateSettings: (partial) => ipcRenderer.invoke('settings:update', partial)
});
