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
  setRules: (rules) => ipcRenderer.invoke('rules:set', rules),
  resetRules: () => ipcRenderer.invoke('rules:reset'),
  getIgnore: () => ipcRenderer.invoke('ignore:get'),
  setIgnore: (list) => ipcRenderer.invoke('ignore:set', list),
  resetIgnore: () => ipcRenderer.invoke('ignore:reset'),
  updateSettings: (partial) => ipcRenderer.invoke('settings:update', partial),
  exportData: (opts) => ipcRenderer.invoke('data:export', opts || {}),
  importData: (opts) => ipcRenderer.invoke('data:import', opts || {}),
  clearToday: () => ipcRenderer.invoke('data:clearToday'),
  clearAllHistory: () => ipcRenderer.invoke('data:clearAll')
});
