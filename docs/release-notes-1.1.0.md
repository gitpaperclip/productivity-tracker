# sydtrack v1.1.0

Focus profiles, clearer analytics, and a more consistent desktop experience. Everything stays local to your device.

## Focus profiles

- Keep up to five profiles with separate Productive, Unproductive, and Ignore lists.
- Switch quickly from Home or the full-width focusprofile control on Focus Tags.
- Create, rename, delete, import, and export profiles from Focus Tags. Quick Add updates the active profile.
- Existing tags become the default profile. Switching protects unsaved edits, and renaming preserves tag drafts.

## Clearer analytics

- Month now shows a 30-day pie with focus share in the center, plus total time, active days, daily average, and top apps.
- Apps ranks the ten most-used apps, with separate rows for activity categories and matched keywords—such as YouTube and Reddit within the same browser.
- P/U/ign controls highlight each row’s state. Corrections update that row’s recorded totals and hourly breakdown for today, without reclassifying unrelated browser activity.
- Recorded time marked ignored remains recoverable. Corrections survive restart and expire at midnight; previous days and saved profiles stay unchanged.

## Tracking and reliability

- Productive app identities protect editors from misleading project or window titles.
- Browser title rules work across supported browser identities without extensions; automatic address capture remains disabled by default.
- Tracking handles sleep, lock, pauses, delayed probes, and local hour/day boundaries more carefully.
- History summaries load on demand. Backups include profiles, sessions, and app identities; malformed local files are preserved for recovery.
- Bounded local error logs help diagnose failures without uploading anything.

## Interface polish

- Lowercase sydtrack window title and a bold, non-italic sidebar wordmark.
- Consistent scrollbars, separate Focus Tags tiles, and compact profile management controls.
- Profile action messages dismiss automatically. Analytics tooltips remain visible during stationary hover.

## Updating and known limits

- Windows 10/11 x64 portable build; no Node.js installation is needed to run it.
- Export a local backup before upgrading. Existing data and profiles remain readable; do not delete your app-data directory.
- Older activity cannot show a keyword that was never recorded. Those rows display “Keyword not recorded.” Row corrections to such records cannot identify future matching content.
- Time skipped during Ignore cannot be recreated. Session logs retain their original observations.
- Month refreshes when the tab is reopened. Media-aware idle detection is not included: watching a video without input can still count as idle.
- The build is unsigned; Windows may display a SmartScreen warning.

## Verification

Smoke tests, Electron UI/profile tests, syntax checks, and diff checks passed during preparation. A local Windows packaging build passed. Physical sleep/lock and a real-user upgrade check remain manual acceptance steps; see the validation guides in docs.
