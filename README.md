# FocusFlow

Desktop productivity tracker for Windows. Watches the foreground window, classifies time as productive, unproductive, or other, and nudges you on long unproductive streaks.

**Working title:** FocusFlow is not final — other apps already use that name. Renaming should lean into “last focused window” / focus-aware tracking. Keep package ids / `.focusflow` backup format stable until a rename ships; treat UI strings as soft.

## What you get

- Last focused bar: last real app (never FocusFlow itself)
- Home: mood, pie, FocusBoost (~3 min reminder), Last focused P/U/I
- Analytics: Day · Week · Month · Apps (top apps P / U / Ign)
- Roundup: daily wrap + goal payoff (headline, goal bar, highlights, story)
- Focus Tags: productive / unproductive keywords + ignore list
- Settings: default + FocusBoost reminder timing, FocusBoost schedule + Pause, daily productivity goal (for Roundup), portable `.focusflow` backup
- Fully local — no cloud sync, no account

## Windows: install and start

1. Run npm install
2. Run npm start

Needs Node.js 18+ on Windows (bundled PowerShell / user32 backend).
**Supported:** normal Windows 10 and Windows 11 (x64) — Home / Pro / Education / consumer installs. **Not a target:** locked-down enterprise images (AppLocker/WDAC, heavily constrained PowerShell, Windows 10 S mode, Smart App Control blocking unsigned apps). Those may open the UI but break tracking or installs; we are not optimizing for them.
Optional demo: npm start -- --demo. Smoke: npm test.

## Build a Windows `.exe` (packaging)

Daily use stays the same: `npm start` (dev). Packaging is optional and does not change that workflow.

On a Windows machine with Node 18+:

1. `npm install` (pulls `electron-builder`)
2. `npm run dist` — NSIS installer + portable `.exe` under `dist/`
3. `npm run pack` — unpacked `dist/win-unpacked` for a quick smoke run (no installer)
4. `npm run dist:portable` — portable only

Artifact names look like `FocusFlow-1.0.0-win-x64.exe` (installer / portable). Builds are **unsigned**, so Windows SmartScreen may warn on first open — that is expected until a code-signing cert is added. Packaged data lives in Electron `userData` (not `./data/`); see **Data location**.

## First open

1. Tabs: Home | Analytics | Roundup | Focus Tags | Settings. (Apps lives under Analytics.)
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

**Schedule (v1):** Settings → Auto FocusBoost with start/end (local time). Tracking stays 24/7; only Boost arms/disarms on the window. Manual Home toggle still works mid-window (schedule re-applies on the next enter/leave). Overnight windows supported.

## Performance & memory (Electron)

**Is it fine for normal / power PCs?** Yes. A small Electron app like this typically sits in the ~100–300 MB RAM range (Chromium + Node). On 8–16 GB machines that is a rounding error next to Chrome/Discord/games; on “power” PCs it is a non-issue. We are not loading chart libraries, WebGL, or big media.

**Already light**
- Local-only UI: CSS pie/mood; no chart libraries, WebGL, or large assets
- History on disk capped to about 90 days; week chart reads 7 day summaries on demand (not a full-year RAM cache)
- Stats persist on activity (`addSeconds`); poll ~1.5s; Windows probe stays single-flight
- No per-tick log growth beyond small overwrite files

**Shelved Electron memory work** (do later if Task Manager ever looks fat — not blocking v1)
- Throttle / pause renderer work when the window is minimized or hidden
- Prefer a single BrowserWindow; avoid extra hidden windows
- Optional “tray-only” mode after packaging (no full UI until opened)
- `backgroundThrottling`, lower timer rates when unfocused
- Optional `--disable-gpu` / software rendering escape hatch for weird GPU driver RAM spikes
- Audit live listeners + DOM churn on Analytics redraws
- Measure with Task Manager / `process.getProcessMemoryInfo()` before micro-optimizing

## Mac / Linux

Tracking backends TBD. UI and store run; live capture may use active-win or demo depending on environment.


## Roadmap / ideas (survive memory wipes)

North star: private · honest · alive. Local Windows companion with a daily loop (goal → Boost nudges → Roundup), not another guilt dashboard.

### Near-term feel
- **Nudges / FocusBoost analytics** (wanted): Analytics view for reminder history — each toast logged (app, streak, time); counts; average time-to-refocus after a nudge when measurable. UI: its own solo segment pill (same style as Apps), pinned on the **right** of the Analytics toolbar (Day·Week·Month left cluster · Apps · FocusBoost/Nudges on the right). Not a separate sidebar tab unless it grows.
- ~~Side nav smooth expand/collapse animation~~ **done** (CSS width/opacity; respects reduced-motion; mobile rail unchanged)
- ~~Stronger FocusBoost "hit the UI" press feedback~~ **done** (button punch + edge kick on arm; soft settle on disarm)
- ~~Roundup tab (after Analytics)~~ **done (v1)**: headline, goal bar, highlights, story
- Classification smarts: browser yellow "browser" tag, sharper title keywords
- **Focus Tags quick add + search** (wanted): on Focus Tags, search/add a keyword with P / U / Ign; show if that tag already exists (and which list). Ship before Focus profiles.

### Product loop
- Daily productivity goal: Settings-only (feeds Roundup; off Home)
- Gentle health insights (short coach notes, no lectures)
- Privacy mode (strip/hash window titles)
- ~~**Pause / disable tracking**~~ **done (v1)**: Home Pause/Resume + Settings toggle; status pill “Paused”; freezes Last focused; no logging/reminders while paused
- Tray presence + FocusBoost in tray
- ~~`.exe` packaging~~ **scaffolded** (`npm run dist` / `pack` via electron-builder; unsigned SmartScreen note in README) + first-run onboarding **TBD** (primary browser → seed Focus Tags)
  - Intro copy: classification gets better as you tag more apps (P/U/I + Focus Tags) — update tags as you go; no need to rewrite past time
  - **FocusBoost schedule** (onboarding): pick daily Boost hours during first-run; same control lives in Settings (onboarding seeds it). Tracking stays 24/7 — schedule only arms/disarms FocusBoost.
  - **Roundup notification time** (post-launch): during onboarding, pick a daily time (e.g. 5pm) for a Roundup toast; notification includes a button/action that opens the Roundup tab. Same control lives in Settings (onboarding just seeds it).
- Disk usage display with privacy/Data

### Tray stage (shelved until tray)
- Tray menu: pick **Focus profile** quickly (Coding, Resume writing, Homework, …)
- **Downtime mode**: don’t treat (or don’t log) unproductive apps — evenings / breaks without guilt or noise; still optional light presence
- Tray: Pause tracking, arm/disarm FocusBoost, open Roundup / Home
- Tray icon state reflects mode (active / downtime / paused)

### Shelved polish
- Themes: Sand, Coral, Night, Starlight
- Nav caret polish
- Electron memory mitigations (see Performance & memory) — fine for 8 GB+ / power PCs as-is; revisit only if measured bloat
- Roundup daily notification (post-launch): onboarding + Settings time picker; Windows toast with action → Roundup tab
- **Focus share goal** (later): Settings target % focused vs unfocused; Roundup shows hit/miss alongside productive-hours goal (Analytics already has Focus share)

### Longer-term: Focus profiles (context-aware productivity)
Formerly "Focus modes" — named **Focus profiles** that swap what "productive" means for the task you're in (e.g. Writing, Coding, Homework, Deep reading).
- **Cap: up to 5 profiles** (user-workshopped defaults later; add/remove within the cap)
- Each profile owns its productive / unproductive / ignore Focus Tags (or overlays on a base set)
- Example: Writing profile — VS Code / Cursor may count as unproductive; Word / Docs / LinkedIn editors count as productive
- Example: Coding profile — Stack Overflow / docs productive; Netflix still isn't
- **Lives on the Focus Tags page**: manage profiles there (create/edit/remove, see which tags belong to the active profile)
- **Home hotswitch**: quick switcher for the active Focus profile (later also tray)
- **Export / import** Focus profiles (portable; fits `.focusflow` or a small profile pack) — after switch + Tags UI work
- Adaptive angle (later): suggest profile from recent apps, or warn when current apps fight the active profile
- **Downtime** profile/mode: pause unproductive scoring / reminders (and optionally skip logging U apps) without full app quit — pairs with tray
- Keep fully local

### Explicit non-goals (for now)
- Cloud sync / accounts
- Heavy gamification / shame streaks

## License

MIT
