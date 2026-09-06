# FocusFlow

Desktop productivity tracker for Windows. Watches the foreground window, classifies time as productive, unproductive, or other, and nudges you on long unproductive streaks.

**Working title:** FocusFlow is not final — other apps already use that name. Renaming should lean into “last focused window” / focus-aware tracking. Keep package ids / `.focusflow` backup format stable until a rename ships; treat UI strings as soft.

## What you get

- Last focused bar: last real app (never FocusFlow itself)
- Home: mood, pie, FocusBoost (~3 min reminder), Last focused P/U/I
- Analytics: Day · Week · Month · Apps (top apps P / U / Ign)
- Roundup: daily wrap + goal payoff (headline, goal bar, highlights, story)
- Sessions: Pomodoro (25m) / Deep work (90m) / Custom — big countdown on the Sessions tab; compact Start/Stop on Home; per-day session log (top 3 apps + distraction count)
- Focus Tags: productive / unproductive keywords + ignore list
- Settings: default + FocusBoost reminder timing, FocusBoost schedule + Pause, daily productivity goal (for Roundup), session history toggle, portable `.focusflow` backup, Focus profile pack (`.focusflow-profile`) export/import for current tags
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

1. Tabs: Home | Analytics | Roundup | Sessions | Focus Tags | Settings. (Apps lives under Analytics. Sessions sits between Roundup and Focus Tags.)
2. Switch to another app; FocusFlow logs that time.
3. Home shows pie, mood, and Last focused (the app before you opened FocusFlow).
4. Default reminder at 10 minutes. FocusBoost arms a ~3 minute threshold (CSS BOOST punch, then armed glow).

## Classification

Keywords match process name, window title, and URL. Unproductive wins on overlap. For browsers, tags match **window title / URL keywords**, not the browser app name — a bare browser stays `other` in data and shows a yellow **browser** chip in the UI (Last focused + Apps list) until a keyword hits. Edit under Focus Tags or use P/U/I on Analytics → Apps / Last focused.

## Ignore list

Ignored processes show in status but are not logged. Defaults cover Explorer, shell hosts, and FocusFlow/Electron self.

## Data location

- Dev: ./data/ (stats.json, settings.json, optional rules.json / ignore.json, history/YYYY-MM-DD.json, sessions/YYYY-MM-DD.json, active-session.json)
- Packaged: Electron userData (same file names)

Today stays in stats.json. On local date change, the completed day is archived under history/ before a fresh day starts. Each day has byHour (24 hourly buckets).

Focus sessions persist completed entries under `sessions/YYYY-MM-DD.json` (same 90-day-style prune as day history). An in-progress session is mirrored to `active-session.json` so a restart can resume or finalize it. When **Keep session history** is off, disk is pruned to the single most recent session.

## Portable backup (.focusflow) -- no cloud sync

Settings > Data > Export writes a local JSON file (format focusflow-backup, schemaVersion 1, days, optional settings/rules/ignore).

Privacy: exports can include app names and window titles - treat the file like a diary. There is no cloud sync; only you choose where to save/open or copy the file between your PCs.

Import merges by default. Clear today / Clear all history are permanent and ask for confirmation.


## Focus profile pack (.focusflow-profile)

Portable **tag lists only** — productive, unproductive, and ignore keywords. Separate from the `.focusflow` history backup (`format: focusflow-backup`).

**Format choice:** single JSON file with extension `.focusflow-profile` (not zip). Node builtins give zlib/gzip but not a zip archive writer without extra dependencies; JSON stays simple and human-readable for v1.

| Field | Notes |
|-------|--------|
| `format` | `focusflow-profile` |
| `schemaVersion` | `1` |
| `exportedAt` | ISO timestamp |
| `appVersion` | from package.json |
| `name` | optional string |
| `productive` / `unproductive` / `ignore` | string arrays |

**Available now:** Settings → Data → **Export profile pack** / **Import profile pack** writes or replaces the active rules + ignore lists (classifier picks them up immediately). Import does **not** touch day history or app settings.

**Later (not built yet):** up to ~5 named Focus profiles and a Home hotswitch — see **To-dos**; this pack format is the infrastructure for that.

## FocusBoost

Home toggle sets ~3 min unproductive reminder. Button punch + edge kick on arm (skipped if prefers-reduced-motion), then data-boost=on armed state. Off restores the previous threshold. No full-screen FOCUS BOOST overlay.

**Schedule (v1):** Settings → Auto FocusBoost with start/end (local time). Tracking stays 24/7; only Boost arms/disarms on the window. Manual Home toggle still works mid-window (schedule re-applies on the next enter/leave). Overnight windows supported.

## Focus sessions (Pomodoro / Deep work / Custom)

Shipped on the **Sessions** tab (nav between Roundup and Focus Tags) with a large countdown timer, plus compact Start/Stop on Home.

| Mode | Planned length |
|------|----------------|
| Pomodoro | 25 minutes |
| Deep work | 90 minutes |
| Custom | User-set minutes (default 45; stored as `sessionCustomMin`) |

**Session log** (below the timer): entries per day with mode, planned duration, start/end (or elapsed), status (`completed` / `stopped early` / `running`), **top 3 apps** by time during the session, and **distraction count**.

**Distraction definition:** while a session is active, each time classification moves **into unproductive** counts as +1 distraction (edge-triggered: other or productive → unproductive). Transitions that stay unproductive do not re-count. Ignore-list apps and FocusFlow itself never count (they also do not update the previous category used for the edge). Same hint appears under the timer on the Sessions tab.

**Keep session history** (Settings): on (default) keeps per-day session files (pruned like day history, ~90 days). Off keeps/shows only the most recent session (disk pruned to one entry on save).

**Tray-ready (not built yet):** `getActiveSession` / tracker `session` payload include `remainingMs`, `remainingSec`, `modeLabel`, `status`, and a `tray` object so a future tray menu/tooltip can surface the running timer without rewriting the engine.

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


## To-dos (next)

Actionable pending work (parked or not started). Shipped notes live under **Roadmap history** below.

- **Named Focus profiles + Home hotswitch** (<=5 profiles; switch active P/U/Ign lists; `.focusflow-profile` pack format already exists — build multi-profile UI + Home switcher, not just export/import of the current lists)
- **Crash / error local log**: on uncaught main/renderer errors or crash, write a local log under userData (or `./data` in dev) so debug is not screenshot-only. Fully local — no upload.
- **Tray + Downtime** (shelved until tray): tray presence + FocusBoost in tray; tray menu (Pause, Boost, open Roundup/Home, pick Focus profile); **Downtime mode** (do not treat / do not log unproductive apps for evenings/breaks); tray icon state (active / downtime / paused)
- **Nudges / FocusBoost analytics**: Analytics solo segment pill (right of toolbar) for reminder history — each toast logged (app, streak, time); counts; average time-to-refocus when measurable
- **First-run onboarding** (TBD): primary browser -> seed Focus Tags; intro copy that tags improve classification over time; seed FocusBoost schedule + (post-launch) Roundup notification time
- **Disk usage display** with privacy/Data
- **Gentle health insights** (short coach notes, no lectures)
- **Privacy mode** (strip/hash window titles)
- **Themes**: Sand, Coral, Night, Starlight; nav caret polish
- **Focus share goal** (later): Settings target % focused vs unfocused; Roundup hit/miss alongside productive-hours goal
- **Electron memory mitigations** (see Performance & memory) — fine for 8 GB+ as-is; revisit only if measured bloat
- **Away notes** (parked — do not implement yet):
  - Notification toggle above sidebar power + status
  - Settings: iOS-style switches instead of checkboxes
  - Onboarding: Quick start + Custom configuration
  - **Rebrand to "what the focus"** — **shelved / lowest priority — ship last**. Rename would touch many custom surfaces (package ids, `.focusflow` / `.focusflow-profile` formats, appId, paths, UI strings, etc.). Keep FocusFlow + package / `.focusflow` ids stable until a dedicated rename ship; do not start rename work now.


## Roadmap / ideas (survive memory wipes)

North star: private · honest · alive. Local Windows companion with a daily loop (goal → Boost nudges → Roundup), not another guilt dashboard.

### Roadmap history (done / shipped)
- ~~Side nav smooth expand/collapse animation~~ **done** (CSS width/opacity; respects reduced-motion; mobile rail unchanged)
- ~~Stronger FocusBoost "hit the UI" press feedback~~ **done** (button punch + edge kick on arm; soft settle on disarm)
- ~~Roundup tab (after Analytics)~~ **done (v1)**: headline, goal bar, highlights, story
- ~~**Focus Tags quick add + search**~~ **done**: Focus Tags card — type keyword, live which-list status, Productive / Unproductive / Ignore (moves across lists; Enter → Productive)
- ~~Classification smarts: browser yellow "browser" tag, sharper title keywords~~ **done**: bare browser + `other` shows yellow **browser** chip (Last focused + Apps); Focus Tags copy clarifies title/URL keywords for browsers
- ~~**Pause / disable tracking**~~ **done (v1)**: Home Pause/Resume + Settings toggle; status pill Paused; freezes Last focused; no logging/reminders while paused
- ~~**Focus sessions**~~ **done (v1)**: Pomodoro / Deep / Custom; big Sessions-tab timer; Home compact controls; per-day log (top apps + distractions); history toggle; tray-ready active-session payload
- ~~.exe packaging~~ **scaffolded**
- Daily productivity goal shipped control; Focus share goal still in To-dos

### Longer-term: Focus profiles (context-aware productivity)
Formerly "Focus modes" — named **Focus profiles** that swap what "productive" means for the task you're in (e.g. Writing, Coding, Homework, Deep reading).
- **Cap: up to 5 profiles** (user-workshopped defaults later; add/remove within the cap)
- Each profile owns its productive / unproductive / ignore Focus Tags (or overlays on a base set)
- Example: Writing profile — VS Code / Cursor may count as unproductive; Word / Docs / LinkedIn editors count as productive
- Example: Coding profile — Stack Overflow / docs productive; Netflix still isn't
- **Lives on the Focus Tags page**: manage profiles there (create/edit/remove, see which tags belong to the active profile)
- **Home hotswitch**: quick switcher for the active Focus profile (later also tray)
- **Multi-profile UI is a To-do** (see above) — pack export/import for the *current* lists already ships; named profiles + Home switch are not built yet
- **Export / import** Focus profiles as **zip packs** the app loads into productive / unproductive / ignore tag lists (explicit lists in the pack — not magic auto-sort of arbitrary files). After switch + Tags UI work.
- Adaptive angle (later): suggest profile from recent apps, or warn when current apps fight the active profile
- **Downtime** profile/mode: pause unproductive scoring / reminders (and optionally skip logging U apps) without full app quit — pairs with tray
- Keep fully local

### Explicit non-goals (for now)
- Cloud sync / accounts
- Heavy gamification / shame streaks

## License

MIT
