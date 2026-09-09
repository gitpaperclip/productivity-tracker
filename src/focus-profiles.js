'use strict';

const path = require('path');
const { randomUUID } = require('crypto');
const { writeJson, readRecoverableJson } = require('./json-file');
const { validateSiteTags } = require('./browser-rules');

function validateProfiles(value) {
  const fail = () => { throw new Error('Invalid Focus profiles: expected Default and up to five uniquely named profiles.'); };
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.profiles) || value.profiles.length < 1 || value.profiles.length > 5) fail();
  const ids = new Set(), names = new Set();
  const profiles = value.profiles.map(profile => {
    if (!profile || typeof profile.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(profile.id) || ids.has(profile.id)) fail();
    if (typeof profile.name !== 'string' || !profile.name.trim() || profile.name.trim().length > 40) throw new Error('Profile names must contain 1–40 characters.');
    if (names.has(profile.name.trim().toLowerCase())) throw new Error('A profile with this name already exists. Choose a different name.');
    ids.add(profile.id); names.add(profile.name.trim().toLowerCase());
    const out = { id: profile.id, name: profile.name.trim() };
    for (const field of ['productive', 'unproductive', 'ignore']) {
      if (!Array.isArray(profile[field]) || profile[field].length > 1000 || profile[field].some(tag => typeof tag !== 'string' || tag.length > 200)) fail();
      out[field] = [...new Set(profile[field].map(tag => tag.trim().toLowerCase()).filter(Boolean))];
    }
    validateSiteTags(out);
    if (out.ignore.some(tag => tag.startsWith('site:'))) throw new Error('Ignore tags apply to entire apps, not site: domains.');
    return out;
  });
  if (!ids.has('default') || !ids.has(value.activeId)) fail();
  return { schemaVersion: 1, activeId: value.activeId, profiles };
}

function createFocusProfiles({ dataDir, rules, ignore, onChange = () => {}, onRecovery, defaults }) {
  const filePath = path.join(dataDir, 'focus-profiles.json');
  const valid = value => { try { validateProfiles(value); return true; } catch (_) { return false; } };
  let state = readRecoverableJson(filePath, valid, onRecovery);
  if (!state) {
    state = validateProfiles({ schemaVersion: 1, activeId: 'default', profiles: [
      { id: 'default', name: 'Default', productive: rules.productive || [], unproductive: rules.unproductive || [], ignore: ignore || [] }
    ] });
    const fs = require('fs');
    if (defaults && !fs.existsSync(path.join(dataDir, 'rules.json')) && !fs.existsSync(path.join(dataDir, 'ignore.json'))) {
      const bundled = validateProfiles(defaults);
      state.profiles[0] = bundled.profiles.find(profile => profile.id === 'default');
    }
    writeJson(filePath, state); // Leave the legacy files untouched for recovery/downgrades.
  } else state = validateProfiles(state);
  // Install bundled profiles once. Deleted slots stay empty on later launches.
  const fs = require('fs');
  const seedMarker = path.join(dataDir, 'focus-profiles-seeded-v1.json');
  if (defaults && !fs.existsSync(seedMarker)) {
    const bundled = validateProfiles(defaults);
    const next = structuredClone(state);
    for (const profile of bundled.profiles) {
      if (next.profiles.length >= 5) break;
      if (next.profiles.some(existing => existing.id === profile.id || existing.name.toLowerCase() === profile.name.toLowerCase())) continue;
      next.profiles.push(profile);
    }
    state = validateProfiles(next);
    writeJson(filePath, state);
    writeJson(seedMarker, { version: 1 });
  }
  const snapshot = () => structuredClone(state);
  const active = () => structuredClone(state.profiles.find(profile => profile.id === state.activeId));
  function commit(next) {
    const normalized = validateProfiles(next);
    writeJson(filePath, normalized);
    state = normalized;
    onChange(active());
    return snapshot();
  }
  return {
    filePath, snapshot, active,
    save: (id, fields) => {
      const next = snapshot();
      if (id == null) {
        next.profiles.push({ ...fields, id: randomUUID() });
      } else {
        const index = next.profiles.findIndex(profile => profile.id === id);
        if (index < 0) throw new Error('Focus profile not found.');
        next.profiles[index] = { ...next.profiles[index], ...fields, id };
      }
      return commit(next);
    },
    activate: id => {
      if (id === state.activeId) return snapshot();
      return commit({ ...snapshot(), activeId: id });
    },
    remove: id => {
      if (id === 'default') throw new Error('Default cannot be deleted.');
      if (!state.profiles.some(profile => profile.id === id)) throw new Error('Focus profile not found.');
      return commit({ ...snapshot(), activeId: state.activeId === id ? 'default' : state.activeId,
        profiles: state.profiles.filter(profile => profile.id !== id) });
    },
    restore: commit
  };
}

module.exports = { createFocusProfiles, validateProfiles };
