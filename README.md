# FocusFlow

Desktop productivity tracker for Windows. Watches the foreground window, classifies time as productive, unproductive, or other, and nudges you on long unproductive streaks.

## What you get

- Last focused bar: last real app (never FocusFlow itself)
- Home: mood, pie chart, daily productive goal chip, 7-day mini bars, FocusBoost (~3 min reminder)
- Apps: top apps with P / U / Ign reclassify
- Focus tags: productive / unproductive keywords + ignore list
- Settings: reminder threshold, demo mode, portable .focusflow backup

## Windows: install and start

1. Run npm install
2. Run npm start

Needs Node.js 18+ on Windows (bundled PowerShell / user32 backend).
Optional demo: npm start -- --demo. Smoke: npm test.

## First open

1. Tabs: Home | Apps | Settings.
2. Switch to another app; FocusFlow logs that time.
3. Home shows pie, mood, and Last focused (the app before you opened FocusFlow).
4. Default reminder at 10 minutes. FocusBoost arms a ~3 minute threshold (CSS BOOST punch, then armed glow).

## Classification

Keywords match process name, window title, and URL. Unproductive wins on overlap. Bare browsers stay other. Edit under Settings or use P/U on Apps.

## Ignore list

Ignored processes show in status but are not logged. Defaults cover Explorer, shell hosts, and FocusFlow/Electron self.

## Data location

- Dev: ./data/ (stats.json, settings.json, optional rules.json / ignore.json, history/YYYY-MM-DD.json)
- Packaged: Electron userData (same file names)

Today stays in stats.json. On local date change, the completed day is archived under history/ before a fresh day starts. Each day has byHour (24 hourly buckets).

## Portable backup (.focusflow) -- no cloud sync

Settings > Data > Export writes a local JSON file (format focusflow-backup, schemaVersion 1, days, optional settings/rules/ignore).

Privacy: exports can include app names and window titles - treat the file like a diary. There is no cloud sync; only you choose where to save/open or copy the file between your PCs.

Import merges by default. Clear today / Clear all history are permanent and ask for confirmation.

## FocusBoost

Home toggle sets ~3 min unproductive reminder. CSS-only FOCUS BOOST flash (skipped if prefers-reduced-motion), then data-boost=on armed state. Off restores the previous threshold.

## Performance (8-16 GB PCs)

- Local-only, lightweight Electron UI (CSS pie/mood; no chart libraries, WebGL, or large assets)
- History on disk capped to about 90 days; week chart reads 7 day summaries on demand (not a full-year RAM cache)
- Stats persist on activity (addSeconds); poll ~1.5s; Windows probe stays single-flight
- No per-tick log growth beyond small overwrite files

## Mac / Linux

Tracking backends TBD. UI and store run; live capture may use active-win or demo depending on environment.

## License

MIT
