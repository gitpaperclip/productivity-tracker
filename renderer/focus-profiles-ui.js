'use strict';

(() => {
  let state = null;
  let selected = 'default';
  let baseline = '';
  let busy = false;
  let menuRequest = 0;
  const fields = () => ({ name: $('profile-name').value.trim(),
    productive: linesToList($('profile-productive').value),
    unproductive: linesToList($('profile-unproductive').value), ignore: linesToList($('profile-ignore').value) });
  const editorDirty = () => baseline && JSON.stringify(fields()) !== baseline;
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
  function status(message) { $('profiles-status').textContent = message; $('home-profile-status').textContent = message.startsWith('Profile active.') ? '' : message; }
  function closeMenu() {
    menuRequest++;
    $('focus-profile-menu').classList.add('hidden');
    $('focus-profile-btn').setAttribute('aria-expanded', 'false');
  }
  function drawMenu() {
    if (!state) return;
    const active = state.profiles.find(profile => profile.id === state.activeId);
    $('focus-profile-label').textContent = active.name;
    $('focus-profile-btn').title = 'Focus profile: ' + active.name;
    $('focus-profile-btn').setAttribute('aria-label', 'Focus profile: ' + active.name);
    $('focus-profile-menu').replaceChildren();
    for (let index = 0; index < 5; index++) {
      const profile = state.profiles[index];
      const button = document.createElement('button'); button.type = 'button'; button.className = 'profile-choice';
      button.textContent = profile ? profile.name : '＋ Set up slot ' + (index + 1);
      button.title = button.textContent;
      button.setAttribute('aria-pressed', String(!!profile && profile.id === state.activeId));
      button.addEventListener('click', () => {
        if (!profile) {
          if (!mayDiscard()) return;
          selected = 'new:' + index; closeMenu(); drawEditor();
          document.querySelector('.nav-btn[data-tab="settings"]').click();
          $('profile-settings').scrollIntoView({ block: 'start' }); $('profile-name').focus();
        } else useProfile(profile.id);
      });
      $('focus-profile-menu').append(button);
    }
  }
  function drawEditor() {
    if (!state) return;
    const selector = $('profile-editor-select'); selector.replaceChildren();
    for (let index = 0; index < 5; index++) {
      const profile = state.profiles[index];
      const option = document.createElement('option'); option.value = profile ? profile.id : 'new:' + index;
      option.textContent = profile ? profile.name + (profile.id === state.activeId ? ' (active)' : '') : 'Empty slot ' + (index + 1);
      selector.append(option);
    }
    if (![...selector.options].some(option => option.value === selected)) selected = state.activeId;
    selector.value = selected;
    const profile = state.profiles.find(item => item.id === selected);
    $('profile-name').value = profile ? profile.name : '';
    for (const field of ['productive', 'unproductive', 'ignore']) $('profile-' + field).value = profile ? profile[field].join('\n') : '';
    baseline = JSON.stringify(fields());
    $('profile-delete-named').disabled = !profile || selected === 'default';
    $('profile-use-named').disabled = !profile || selected === state.activeId;
    $('profile-export-named').disabled = !profile;
    $('profile-import-named').disabled = state.profiles.length === 5;
  }
  async function reload(draw = true, discardDraft = false) {
    if (!api || !api.getProfiles) return;
    state = await api.getProfiles(); drawMenu(); if (draw && (discardDraft || !editorDirty())) drawEditor();
  }
  async function run(action, message) {
    if (busy) return;
    busy = true; closeMenu();
    let succeeded = false;
    document.querySelectorAll('#profile-settings button, #profile-settings input, #profile-settings textarea, #profile-settings select').forEach(el => { el.disabled = true; });
    try {
      const result = await action();
      if (result) state = result;
      await reload(false);
      await loadRulesAndIgnore();
      status(message);
      succeeded = true;
    } catch (err) { status((err.message || 'Could not update Focus profiles.').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); }
    finally {
      busy = false;
      document.querySelectorAll('#profile-settings button, #profile-settings input, #profile-settings textarea, #profile-settings select').forEach(el => { el.disabled = false; });
      drawMenu();
      if (succeeded) drawEditor();
      else {
        $('profile-delete-named').disabled = selected === 'default' || selected.startsWith('new:');
        $('profile-use-named').disabled = selected === state.activeId || selected.startsWith('new:');
        $('profile-export-named').disabled = selected.startsWith('new:');
        $('profile-import-named').disabled = state.profiles.length === 5;
      }
    }
  }
  async function useProfile(id) {
    if (!mayDiscard()) return;
    selected = id;
    await run(() => api.activateProfile(id), 'Profile active. Previous totals are unchanged.');
    $('focus-profile-btn').focus();
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
    if (!mayDiscard()) { event.target.value = selected; return; }
    selected = event.target.value; drawEditor();
  });
  $('profile-save-named').addEventListener('click', () => {
    if (!mayDiscard(false)) return;
    const next = fields();
    run(async () => {
      const result = await api.saveProfile(selected.startsWith('new:') ? null : selected, next);
      selected = result.profiles.find(profile => profile.name.toLowerCase() === next.name.toLowerCase()).id;
      return result;
    }, 'Profile saved.');
  });
  $('profile-use-named').addEventListener('click', () => useProfile(selected));
  $('profile-delete-named').addEventListener('click', () => {
    if (!mayDiscard() || !confirm('Delete this Focus profile? Its tracked history will remain.')) return;
    run(() => api.deleteProfile(selected), 'Profile deleted.');
  });
  $('profile-import-named').addEventListener('click', () => {
    if (!mayDiscard()) return;
    run(async () => {
      const result = await api.importNamedProfile();
      if (result) selected = result.profiles[result.profiles.length - 1].id;
      return result;
    }, 'Profile file dialog finished.');
  });
  $('profile-export-named').addEventListener('click', async () => {
    if (!mayDiscard()) return;
    try { const result = await api.exportProfilePack({ id: selected }); status(result.ok ? 'Profile exported.' : result.canceled ? 'Export canceled.' : 'Export failed.'); }
    catch (err) { status(err.message); }
  });
  document.querySelector('.nav-btn[data-tab="settings"]').addEventListener('click', () => { if (!busy && !editorDirty()) reload().catch(err => status(err.message)); });
  window.sydtrackProfilesUI = { reload, mayDiscard };
  reload().catch(err => status(err.message));
})();
