'use strict';

// Shared by normal settings edits and backup imports.
function updateAppSettings(store, sessionManager, partial, onChanged) {
  const changes = partial || {};
  const next = store.updateSettings(changes);
  if (sessionManager && Object.prototype.hasOwnProperty.call(changes, 'sessionHistoryEnabled')) {
    sessionManager.applyHistorySetting(next.sessionHistoryEnabled !== false);
  }
  if (onChanged) onChanged();
  return next;
}

module.exports = { updateAppSettings };
