'use strict';

const { contextBridge, ipcRenderer } = require('electron');
let activeProfileId = null;
const rememberProfile = value => { if (value) activeProfileId = value.activeId || value.profileId || activeProfileId; return value; };

contextBridge.exposeInMainWorld('sydtrack', {
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
  getProfiles: () => ipcRenderer.invoke('profiles:get').then(rememberProfile),
  saveProfile: (id, fields) => ipcRenderer.invoke('profiles:save', { id, fields }),
  activateProfile: id => ipcRenderer.invoke('profiles:activate', id).then(rememberProfile),
  deleteProfile: id => ipcRenderer.invoke('profiles:delete', id),
  importNamedProfile: () => ipcRenderer.invoke('profiles:import'),
  correctAppToday: (name, category) => ipcRenderer.invoke('apps:correctToday', { name, category }),
  getHistorySummary: (days) => ipcRenderer.invoke('history:summary', days),
  getRules: () => ipcRenderer.invoke('rules:get').then(rememberProfile),
  setRules: (rules) => ipcRenderer.invoke('rules:set', { ...rules, profileId: activeProfileId }),
  resetRules: () => ipcRenderer.invoke('rules:reset', activeProfileId),
  getIgnore: () => ipcRenderer.invoke('ignore:get').then(rememberProfile),
  setIgnore: (list) => ipcRenderer.invoke('ignore:set', { ignore: list, profileId: activeProfileId }),
  resetIgnore: () => ipcRenderer.invoke('ignore:reset', activeProfileId),
  updateSettings: (partial) => ipcRenderer.invoke('settings:update', partial),
  exportData: (opts) => ipcRenderer.invoke('data:export', opts || {}),
  importData: (opts) => ipcRenderer.invoke('data:import', opts || {}),
  exportProfilePack: (opts) => ipcRenderer.invoke('profile:export', opts || {}),
  importProfilePack: () => ipcRenderer.invoke('profile:import'),
  clearToday: () => ipcRenderer.invoke('data:clearToday'),
  clearAllHistory: () => ipcRenderer.invoke('data:clearAll'),
  startSession: (opts) => ipcRenderer.invoke('session:start', opts || {}),
  stopSession: () => ipcRenderer.invoke('session:stop'),
  getActiveSession: () => ipcRenderer.invoke('session:getActive'),
  getSessionsForDay: (dateKey) => ipcRenderer.invoke('session:getForDay', dateKey),
  deleteSession: (id, dateKey) => ipcRenderer.invoke('session:delete', { id, dateKey })
});
