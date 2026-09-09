'use strict';

(() => {
  let state = null;
  let nameMode = null;
  let busy = false;
  let menuRequest = 0;
  const editorDirty = () => nameMode !== null;
  const canonical = values => JSON.stringify((values || []).map(value => value.trim().toLowerCase()).filter(Boolean).sort());
  const tagsDirty = () => {
    const current = currentTagLists();
    return canonical(current.productive) !== canonical(cachedRules.productive) ||
      canonical(current.unproductive) !== canonical(cachedRules.unproductive) || canonical(current.ignore) !== canonical(cachedIgnore);
  };
  function mayDiscard(includeEditor = true) {
    if (busy || tagsQuickSaving) return false;
    if ((includeEditor && editorDirty()) || tagsDirty()) return confirm('Discard unsaved profile or Focus Tags edits? Cancel to save them first.');
    return true;
  }
  let statusTimer = null;
  function status(message) {
    clearTimeout(statusTimer);
    $('profiles-status').textContent = message;
    $('home-profile-status').textContent = message.startsWith('Profile active.') ? '' : message;
    statusTimer = setTimeout(() => {
      $('profiles-status').textContent = '';
      $('home-profile-status').textContent = '';
      statusTimer = null;
    }, 5000);
  }
  function closeMenu() {
    menuRequest++;
    $('focus-profile-menu').classList.add('hidden');
    $('focus-profile-btn').setAttribute('aria-expanded', 'false');
  }
  const displayName = profile => profile.id === 'default' && profile.name === 'Default' ? 'default' : profile.name;
  function drawMenu() {
    if (!state) return;
    const active = state.profiles.find(profile => profile.id === state.activeId);
    $('focus-profile-label').textContent = displayName(active);
    $('tags-profile-label').textContent = displayName(active);
    $('focus-profile-btn').title = 'Focus profile: ' + displayName(active);
    $('focus-profile-btn').setAttribute('aria-label', 'Focus profile: ' + displayName(active));
    $('focus-profile-menu').replaceChildren();
    for (let index = 0; index < 5; index++) {
      const profile = state.profiles[index];
      const button = document.createElement('button'); button.type = 'button'; button.className = 'profile-choice';
      button.textContent = profile ? displayName(profile) : '＋ Set up slot ' + (index + 1);
      button.title = button.textContent;
      button.setAttribute('aria-pressed', String(!!profile && profile.id === state.activeId));
      button.addEventListener('click', () => {
        if (!profile) {
          if (!mayDiscard()) return;
          closeMenu();
          document.querySelector('.nav-btn[data-tab="tags"]').click();
          openName('new');
          $('profile-settings').scrollIntoView({ block: 'start' }); $('profile-name').focus();
        } else useProfile(profile.id);
      });
      $('focus-profile-menu').append(button);
    }
  }
  function drawEditor() {
    if (!state) return;
    const selector = $('profile-editor-select'); selector.replaceChildren();
    for (const profile of state.profiles) {
      const option = document.createElement('option'); option.value = profile.id;
      option.textContent = displayName(profile); selector.append(option);
    }
    selector.value = state.activeId;
    $('profile-delete-named').disabled = state.activeId === 'default';
    $('profile-new-named').disabled = state.profiles.length === 5;
    $('profile-import-named').disabled = state.profiles.length === 5;
  }
  function openName(mode) {
    nameMode = mode;
    $('profile-name-form').classList.remove('hidden');
    $('profile-name').value = mode === 'new' ? '' : displayName(state.profiles.find(p => p.id === state.activeId));
    $('profile-save-named').textContent = mode === 'new' ? 'Create profile' : 'Save name';
    $('profile-name').focus();
  }
  function closeName() { nameMode = null; $('profile-name-form').classList.add('hidden'); }
  async function reload(draw = true, discardDraft = false) {
    if (!api || !api.getProfiles) return;
    state = await api.getProfiles(); drawMenu(); if (draw) drawEditor(); if (discardDraft) closeName();
  }
  async function run(action, message) {
    if (busy) return;
    busy = true; closeMenu();
    let succeeded = false;
    document.querySelectorAll('#view-tags button, #view-tags input, #view-tags textarea, #view-tags select').forEach(el => { el.disabled = true; });
    try {
      const result = await action();
      if (!result) { status('Canceled.'); return; }
      state = result;
      await reload(false);
      await loadRulesAndIgnore();
      status(message);
      succeeded = true;
    } catch (err) { status((err.message || 'Could not update Focus profiles.').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); }
    finally {
      busy = false;
      document.querySelectorAll('#view-tags button, #view-tags input, #view-tags textarea, #view-tags select').forEach(el => { el.disabled = false; });
      drawMenu();
      if (succeeded) closeName();
      drawEditor();

    }
  }
  async function useProfile(id) {
    if (!mayDiscard()) return;

    await run(() => api.activateProfile(id), 'Profile active. Previous totals are unchanged.');
    if (!$('view-tags').classList.contains('hidden')) $('profile-editor-select').focus();
    else $('focus-profile-btn').focus();
  }
  $('focus-profile-btn').addEventListener('click', async () => {
    if (busy) return;
    if (!$('focus-profile-menu').classList.contains('hidden')) { closeMenu(); return; }
    const request = ++menuRequest;
    try {
      await reload(false);
      if (request !== menuRequest) return;
      $('focus-profile-menu').classList.remove('hidden');
      $('focus-profile-btn').setAttribute('aria-expanded', 'true');
      const active = $('focus-profile-menu').querySelector('[aria-pressed="true"]'); if (active) active.focus();
    } catch (err) { status(err.message); }
  });
  document.addEventListener('click', event => { if (!event.target.closest('.home-focus-actions')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('focus-profile-menu').classList.contains('hidden')) { closeMenu(); $('focus-profile-btn').focus(); } });
  $('profile-editor-select').addEventListener('change', event => {
    const id = event.target.value;
    event.target.value = state.activeId;
    useProfile(id);
  });
  $('profile-new-named').addEventListener('click', () => { if (mayDiscard()) openName('new'); });
  $('profile-rename-named').addEventListener('click', () => { if (!busy && !tagsQuickSaving) openName('rename'); });
  $('profile-cancel-name').addEventListener('click', closeName);
  $('profile-save-named').addEventListener('click', () => {
    if (busy || tagsQuickSaving || !nameMode) return;
    const name = $('profile-name').value.trim();
    const mode = nameMode;
    if (mode === 'new' && tagsDirty() && !confirm('Discard unsaved Focus Tags edits?')) return;
    // Rename only changes metadata. Preserve the single tag editor's draft.
    const draft = mode === 'rename' ? currentTagLists() : null;
    run(async () => {
      const result = await api.saveProfile(mode === 'new' ? null : state.activeId,
        mode === 'new' ? { name, productive: [], unproductive: [], ignore: [] } : { name });
      if (mode === 'new') return api.activateProfile(result.profiles.find(p => p.name.toLowerCase() === name.toLowerCase()).id);
      return result;
    }, mode === 'new' ? 'Profile created and active.' : 'Profile renamed.').then(() => {
      if (draft) {
        $('rules-prod-edit').value = draft.productive.join('\n');
        $('rules-unprod-edit').value = draft.unproductive.join('\n');
        $('ignore-edit').value = draft.ignore.join('\n');
      }
    });
  });
  $('profile-delete-named').addEventListener('click', () => {
    if (!mayDiscard() || !confirm('Delete this Focus profile? Its tracked history will remain.')) return;
    run(() => api.deleteProfile(state.activeId), 'Profile deleted.');
  });
  $('profile-import-named').addEventListener('click', () => {
    if (!mayDiscard()) return;
    run(async () => {
      const result = await api.importNamedProfile();
      if (!result) return null;
      return api.activateProfile(result.profiles[result.profiles.length - 1].id);
    }, 'Profile import finished.');
  });
  $('profile-export-named').addEventListener('click', async () => {
    if (busy || tagsQuickSaving) return;
    if (tagsDirty()) { status('Save your Focus Tags before exporting this profile.'); return; }
    try { const result = await api.exportProfilePack({ id: state.activeId }); status(result.ok ? 'Profile exported.' : result.canceled ? 'Export canceled.' : 'Export failed.'); }
    catch (err) { status(err.message); }
  });
  document.querySelector('.nav-btn[data-tab="tags"]').addEventListener('click', () => { if (!busy && !editorDirty()) reload().catch(err => status(err.message)); });
  window.sydtrackProfilesUI = { reload, mayDiscard };
  reload().catch(err => status(err.message));
})();
