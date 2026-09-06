# FocusFlow

Desktop productivity tracker for Windows. Watches the foreground window, classifies time as productive, unproductive, or other, and nudges you on long unproductive streaks.

**Working title:** FocusFlow is not final — other apps already use that name. Renaming should lean into “last focused window” / focus-aware tracking. Keep package ids / `.focusflow` backup format stable until a rename ships; treat UI strings as soft.

## What you get

- Last focused bar: last real app (never FocusFlow itself)
- Home: mood, pie, daily productive goal (own card), FocusBoost (~3 min reminder)
- Analytics: Day · Week · Month
- Analytics: Day · Week · Month · Apps (top apps P / U / Ign)
- Focus Tags: productive / unproductive keywords + ignore list
- Settings: reminder threshold, demo mode, daily goal hours, portable .focusflow backup
- Fully local — no cloud sync, no account

## Windows: install and start

1. Run npm install
2. Run npm start

Needs Node.js 18+ on Windows (bundled PowerShell / user32 backend).
Optional demo: npm start -- --demo. Smoke: npm test.

## First open

1. Tabs: Home | Analytics | Focus Tags | Settings. (Apps lives under Analytics.)
2. Switch to another app; FocusFlow logs that time.
3. Home shows pie, mood, and Last focused (the app before you opened FocusFlow).
4. Default reminder at 10 minutes. FocusBoost arms a ~3 minute threshold (CSS BOOST punch, then armed glow).

## Classification

Keywords match process name, window title, and URL. Unproductive wins on overlap. Bare browsers stay other. Edit under Focus Tags or use P/U/I on Analytics → Apps / Last focused.

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


## Roadmap / ideas (survive memory wipes)

North star: private · honest · alive. Local Windows companion with a daily loop (goal → Boost nudges → Roundup), not another guilt dashboard.

### Near-term feel
- ~~Side nav smooth expand/collapse animation~~ **done** (CSS width/opacity; respects reduced-motion; mobile rail unchanged)
- ~~Stronger FocusBoost "hit the UI" press feedback~~ **done** (button punch + edge kick on arm; soft settle on disarm)
- Roundup tab (after Analytics): fun daily wrap — did you hit the goal? focus vibe?
- Classification smarts: browser yellow "browser" tag, sharper title keywords

### Product loop
- Home daily goal chip (shipped; polish as needed)
- Gentle health insights (short coach notes, no lectures)
- Privacy mode (strip/hash window titles)
- **Pause / disable tracking** — not built yet (only demo mode + ignore list). Need a clear Pause that stops logging without quitting the app; show Pausing in status / tray
- Tray presence + FocusBoost in tray
- `.exe` packaging + first-run onboarding (primary browser → seed Focus Tags)
- Disk usage display with privacy/Data

### Tray stage (shelved until tray)
- Tray menu: pick **Focus mode** quickly (Coding, Resume writing, Homework, …)
- **Downtime mode**: don’t treat (or don’t log) unproductive apps — evenings / breaks without guilt or noise; still optional light presence
- Tray: Pause tracking, arm/disarm FocusBoost, open Roundup / Home
- Tray icon state reflects mode (active / downtime / paused)

### Shelved polish
- Themes: Sand, Coral, Night, Starlight
- Nav caret polish

### Longer-term: Focus modes (context-aware productivity)
Named modes that swap what "productive" means for the task you're in — e.g. Resume writing, Coding, Homework, Deep reading.
- Each mode has its own productive / unproductive / ignore keyword sets (or overlays on the global Focus Tags)
- Example: in Resume writing, VS Code / Cursor may count as unproductive (wrong rabbit hole); Word / Docs / LinkedIn profile editors count as productive
- Example: in Coding, Stack Overflow / docs are productive; Netflix still isn't
- UI: quick mode picker on Home (and later tray); mode name shown on Last focused / Roundup
- Adaptive angle (later): suggest mode from recent apps, or warn when current apps fight the active mode
- **Downtime** mode: pause unproductive scoring / reminders (and optionally skip logging U apps) without full app quit — pairs with tray
- Keep fully local; modes live in settings/rules files, exportable in `.focusflow`

### Explicit non-goals (for now)
- Cloud sync / accounts
- Heavy gamification / shame streaks

## License

MIT
