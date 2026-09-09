# sydtrack

Desktop productivity tracker for Windows. Watches the foreground window, classifies time as productive, unproductive, or other, and nudges you on long unproductive streaks.

# Known issues
Duplicate-instance startup is guarded in the current working tree; verify second launch with the packaged app before release.
Browser tracking isn't perfect and definitely the target here, we need better browser integration
Some issues with the pie chart updating properly
Timers don't update second by second , impl needs to be optimized

## Browser tracking checkpoint — #7, 2026-09-09

Current release decision (supersedes the address-capture default described below):
- Default Windows tracking uses only the foreground app/title. The unreliable address-bar prototype is disabled unless a developer explicitly constructs the backend with `experimentalAddressCapture: true`. There is no user-facing experimental toggle. A regression verifies one subprocess call and no address query in the default path.
- Browser recognition is shared by the classifier and renderer, covers non-Chromium names as well as generic `Browser.exe` / names ending in a separate Browser word, and accepts custom `browserApps` in app identities. Old identity files default to an empty additional list. User document titles do not establish process identity. Custom browser identities take precedence over productive app identities, so browser content still determines category.
- Custom browser category history is preserved during rule updates. Tests cover Firefox, LibreWolf, Waterfox, generic Browser names, custom identities, productive/unproductive title changes, and process-name false positives. Isolated Electron checks verify the corresponding UI behavior. `npm test`, JavaScript syntax checks, `git diff --check`, `npm run test:ui`, and `npm run pack` pass.
- This is the recommended simple release scope: foreground title classification with explicit rules and local storage. `site:` rules remain portable but do not apply to title-only Windows samples. Full #7 URL extraction is deferred, not completed. No real Firefox/alternative-browser UI session or full packaged live-tracking soak was performed. Do not describe automated identity fixtures as those manual checks.
- Future order: validate this baseline in ordinary use; introduce named local Focus profiles; only revisit address/media integration with reproducible evidence and no browser-engine dependency. No cloud service, telemetry, new dependency, or migration was introduced.

Live-test follow-up:
- Native Chrome captured `example.com` successfully; successful end-to-end probes took about 2.8–3.0 seconds with the existing two-process backend.
- Reproduced an unsubmitted-address bug: with Example Domain still loaded, typing `example.org` without navigating caused the old probe to report `example.org`. `HasKeyboardFocus` alone did not protect the capture.
- Added a conservative Win32 foreground/content-focus guard for Chromium before and after address extraction. Live sampling confirmed the unsubmitted address was excluded afterward. Normal capture resumption after returning to page content has **not** been confirmed; observed probes continued to use fallback. The next diagnostic command was declined, so native testing stopped. This is a safety fix with a known availability limitation, not completion of #7. No process consolidation/performance change was applied.
- Added native-helper regression checks via `npm test` for root-window focus, unknown focus, changed foreground, and content-child focus. Next work must validate or replace the conservative guard and address latency before calling browser tracking release-ready. No issue was closed.

- Added `site:example.com` rules within the existing Productive/Unproductive arrays. Exact domains and subdomains match; longer matching domains win, with Unproductive breaking ties. Website rules override title keywords. Missing addresses preserve keyword fallback. No schema change, new settings page, named profiles, per-site analytics, or dependency was added.
- `src/browser-rules.js` shares browser classification between main and renderer. Home quick-tagging uses the captured hostname; existing backups and profile packs retain website tags. Historical browser category totals remain untouched.
- Added a separate, hidden Windows UI Automation address probe with a three-second timeout. It skips Document subtrees, requires a recognized address Edit control inside a toolbar, avoids focused address fields, and verifies the foreground handle/title before accepting results. Only a hostname enters the tracker; no paths or queries from this probe. The script is included in packaged resources.
- Fixed a native idle bug discovered during validation: Windows PowerShell 5.1 lacks `Environment.TickCount64`. The probe now uses unsigned Win32 ticks, with rollover tests against the actual compiled helper.
- Verified: smoke tests (including tracker website switches, settings/backup/profile roundtrips), isolated Electron website quick-tagging/classification and existing UI regressions, PowerShell parsing/native helper compilation, JavaScript syntax, `git diff --check`, and a real foreground capture returning a non-browser window. `npm run pack` passed; packaged probe scripts and shared browser-rule module match source. The automated browser surface available here is only the in-app browser, so live native browser URL capture is **not verified**. Do not close #7 or call this release-validated yet.
- Next acceptance step: on Windows, test Chrome/Edge/Firefox with an unhelpful page title, switch productive/unproductive websites, edit the address bar, switch apps mid-probe, and confirm fallback on inaccessible controls. Measure normal capture latency before release; the extra PowerShell process adds overhead. Localized address-bar names beyond the recognized controls need explicit verification. Repeat the live checks in the packaged app; resource inclusion is already verified.
- Keep future work small: improve proven capture gaps first; defer browser extensions, browsing history, database rewrites, media detection, and broader analytics.
- Changed files: `src/browser-rules.js` (new), `src/classifier.js`, `src/main.js`, `src/tracker.js`, `src/windows-backend.js`; `scripts/get-browser-address.ps1` (new), `scripts/get-foreground.ps1`, `scripts/check-windows-probe.ps1` (new), `scripts/smoke.js`, `scripts/check-ui.js`; `renderer/index.html`, `renderer/renderer.js`; `package.json`, `README.md`, `AGENT_GOALS.md`. Ready for a checkpoint commit, with live-browser acceptance still pending. No user history migration or external GitHub mutation was performed.

## UI follow-up — 2026-09-09, gpt6-astra

**#3 layout completed locally:** centered the collapsed logo and sidebar toggle with the navigation/footer controls; scoped collapse styling to desktop widths so it cannot shrink horizontal navigation or expose its toggle on narrow windows; aligned Custom minutes with the session Start button. The isolated Electron layout checks failed before the CSS fix and passed afterward at 800, 1040, and 1600 window widths, both expanded and collapsed. Existing tooltip/tag/independent-control tests and `npm test` pass. Changes in this pass: `renderer/styles.css`, `scripts/check-ui.js`, `README.md`, and this file; previous browser work is preserved. No data migration or GitHub mutation.

Core follow-up (supersedes the pending items in the earlier checkpoint):
- Session completion is queued until the next tracker tick; timer/tray reads cannot consume it, and tray settings refreshes cannot replay an old completion. The event queue is in memory; completed history continues to use the existing disk format.
- Tracking rechecks settings after foreground probes. Pause suppresses pending activity/reminders; resume does not backfill a probe that started paused; stop invalidates pending results.
- `src/settings-service.js` provides a shared settings path for UI edits and backup imports, including session retention and tray refresh. Backup's optional `onSettings` hook preserves existing standalone callers.
- Session retention writes the retained log before deleting other days and propagates failures. No new data schema or dependency is required.
- **#3 interaction fix:** Session mode and Analytics segment buttons now have independent selectors/listeners. The separate sidebar/custom-timer layout work remains pending; do not close #3 solely for this patch.
- Verified with smoke regressions (expiry reads, event delivery, tray replay, delayed probes, retention write failures, import behavior, independent controls) and isolated Electron UI checks. Existing tooltip and tag checks still pass. Demo launcher isolation, settings validation, malformed-session recovery, and broader #7/#9/#13/#14 infrastructure remain future work.

- **Analytics hover follow-up:** Day/Week redraws no longer dismiss stationary tooltips. They resolve the replacement bar under the remembered pointer and refresh its current values. Leaving the chart, switching views, or losing the hovered bar clears hover state. Smoke regressions and isolated Electron checks (three redraws over 2.25 seconds for each chart, then mouse leave) pass. Packaged Windows validation is deferred at the user's request.

- **#1 completed locally:** bounded grid columns keep long app names ellipsized and durations inside pie, hourly, and weekly chart tooltips. The isolated Electron test reproduced overflow before the fix and passed afterward at 800, 1040, and 1600 pixel window widths.
- **#4 completed locally:** search reads current editor drafts (including removals), refreshes immediately on editor input and rule/ignore loads, and announces status accessibly. Quick-add prevents overlapping saves, resolves duplicate list membership, restores controls on failure, and preserves the latest query during slow saves.
- Verification: `npm test` includes renderer regression cases; `npm run test:ui` loads the real renderer in a hidden Electron window with no preload or tracking service and temporary userData. It measures all three tooltip layouts and dispatches tag editor input events. A captured tooltip screenshot was inspected. No tracking data migration or real-data app launch is needed for these UI changes.
- Next UI work is **#3**; the older checkpoint below records the prior state before this follow-up.

## Checkpoint — 2026-09-09 (paused at user request)

All 10 open GitHub issues and their comments were reviewed read-only. Existing uncommitted #11 work was retained and extended. No commits, pushes, issue mutations, or PRs were made.

Implemented in working tree:
- **#11:** exact normalized process identities, explicit unproductive app-tag override, no title-as-identity fallback, malformed identity-file fallback that preserves the file.
- **#7 groundwork:** browser classification uses content rather than install paths; productive browser identities cannot bypass content rules. Stored browser categories remain separate. Browser URL extraction/community browser lists remain pending.
- **#14 ordinary-idle defect:** remove repeated subtraction of earned history; pause at the timeout, resume on input; no session distraction edges on zero-time ticks. Media-aware behavior is not implemented.
- **#9 bounded retention:** prune old activity/session days even when fewer than 90 files exist; prune activity after import. Storage architecture is unchanged.
- **Core correctness:** expired sessions end at their deadline; completed session is written before deleting the active copy; backup validation precedes destructive replacement; legacy browser category splits and hourly app totals survive merge; atomic JSON replacement for stats/settings/sessions/backups; invalid stats JSON is not silently overwritten.
- **Release plumbing:** single-instance guard; package the PowerShell probe outside ASAR; repair the Windows backend test command.

Verification: npm test passes with regression cases for classification, idle/session accounting, sparse retention, malformed backup replacement, legacy/hourly merge, and failed atomic writes. JavaScript syntax and git diff whitespace checks pass. Issue screenshots were inspected; the running app was NOT visually validated and packaging was NOT built. The working tree is a reviewable checkpoint, not a release sign-off.

Recommended next work, in priority order:
1. Finish integration review of current changes: Windows packaged capture and fallback idle reporting, second-instance behavior, backup/settings error paths, session persistence failures, pause during an in-flight foreground probe. Add user-visible startup error handling for malformed stored JSON. `--demo` is currently not wired by the launcher; fix it with isolated demo data before visual QA. Do not launch demo against user history.
2. **#4 (medium impact, small scope):** search status merges stale saved tags with textarea drafts; removing a draft tag still finds the cached entry. Refresh status after loads/saves/editor input, use current drafts, and serialize quick-add mutations. Not implemented at this checkpoint.
3. **#1 (medium impact, small scope):** screenshots show long app names pushing time text outside pie and hourly tooltips. Inspect flex sizing/overflow with long names at minimum window size. Not implemented.
4. **#3 (low/medium impact, small scope):** center collapsed rail controls; verify custom-session input/play alignment. Desktop collapse rules occur after narrow-window overrides and need responsive testing. Session mode buttons also match generic Analytics `.segment-btn` listeners; scope those listeners. Not implemented.
5. **#7 (high product value, medium/high risk):** bounded Windows UI Automation address-bar extraction, exact normalized domains, editable browser rule list, and graceful fallback. Decide domain-versus-title rule precedence and profile portability before extending schema; never identify an arbitrary Edit control as the address bar.
6. **#9 (medium impact, large scope):** retain current per-day storage until performance is measured. Decide whether a single three-month file is actually required; implement lazy month reads and loading/error UI against fixtures. Current snapshots still read a week's history each poll. Clarify retention inclusion of today. No cloud test agent was created.
7. **#14 (medium impact, large/high-risk scope):** require real playing/paused media evidence; separate music/video preferences; one shared decision for tracking, sessions, and reminders. Titles alone are insufficient.
8. **#13 (medium impact, ambiguous/large):** define focus-score formula, treatment of Other, goal migration, and decompression eligibility/daily quota before implementation. Keep the existing productive-hours goal meanwhile.
9. **#8 (low priority, large scope):** choose opt-in gamification and independent mascot UX; defer sharing/privacy design and artwork.
10. **#10 (low impact, external ownership):** no Grok workflow or `.github` directory exists locally. Identify the external bot configuration owner; do not rename stable app IDs, data paths, or backup formats.

Compatibility notes: no schema-version bump; legacy day files remain readable and browser keys normalize by category on load. Activity merge remains additive; the new optional session section deduplicates IDs and identities travel with exports. No user app-data was intentionally edited; tests use temporary directories. A failed multi-file import is not transactional. Malformed settings/session recovery is implemented; see Roadmap history.

**Name update will be shipped in v0.9.1**

## What you get

- Last focused bar: last real app (never sydtrack itself)
- Home: mood, pie, FocusBoost (~3 min reminder), Last focused P/U/I
- Analytics: Day · Week · Month · Apps (top apps P / U / Ign)
- Roundup: daily wrap + goal payoff (headline, goal bar, highlights, story)
- Sessions: Pomodoro (25m) / Deep work (90m) / Custom — big countdown on the Sessions tab; compact Start/Stop on Home; per-day session log (top 3 apps + distraction count)
- Focus Tags: productive / unproductive keywords + ignore list
- Settings: default + FocusBoost reminder timing, FocusBoost schedule + Pause, daily productivity goal (for Roundup), session history toggle, portable `.sydtrack` backup, Focus profile pack (`.sydtrack-profile`) export/import for current tags
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

Artifact names look like `sydtrack-1.0.0-win-x64.exe` (installer / portable). Builds are **unsigned**, so Windows SmartScreen may warn on first open — that is expected until a code-signing cert is added. Packaged data lives in Electron `userData` (not `./data/`); see **Data location**.

## First open

1. Tabs: Home | Analytics | Roundup | Sessions | Focus Tags | Settings. (Apps lives under Analytics. Sessions sits between Roundup and Focus Tags.)
2. Switch to another app; sydtrack logs that time.
3. Home shows pie, mood, and Last focused (the app before you opened sydtrack).
4. Default reminder at 10 minutes. FocusBoost arms a ~3 minute threshold (CSS BOOST punch, then armed glow).

## Classification

Keywords match process name, window title, and URL. Unproductive wins on overlap. For browsers, tags match **window title / URL keywords**, not the browser app name — a bare browser is `productive` by default, while an unproductive keyword such as YouTube overrides it. Edit under Focus Tags or use P/U/I on Analytics → Apps / Last focused.

## Ignore list

Ignored processes show in status but are not logged. Defaults cover Explorer, shell hosts, and sydtrack/Electron self.

## Data location

- Dev: ./data/ (stats.json, settings.json, optional rules.json / ignore.json, history/YYYY-MM-DD.json, sessions/YYYY-MM-DD.json, active-session.json)
- Packaged: Electron userData (same file names)

Today stays in stats.json. On local date change, the completed day is archived under history/ before a fresh day starts. Each day has byHour (24 hourly buckets).

Focus sessions persist completed entries under `sessions/YYYY-MM-DD.json` (same 90-day-style prune as day history). An in-progress session is mirrored to `active-session.json` so a restart can resume or finalize it. When **Keep session history** is off, disk is pruned to the single most recent session.

## Portable backup (.sydtrack) -- no cloud sync

Settings > Data > Export writes a local JSON file (format sydtrack-backup, schemaVersion 1, days, optional settings/rules/ignore).

Privacy: exports can include app names and window titles - treat the file like a diary. There is no cloud sync; only you choose where to save/open or copy the file between your PCs.

Import merges by default. Clear today / Clear all history are permanent and ask for confirmation.


## Focus profile pack (.sydtrack-profile)

Portable **tag lists only** — productive, unproductive, and ignore keywords. Separate from the `.sydtrack` history backup (`format: sydtrack-backup`).

**Format choice:** single JSON file with extension `.sydtrack-profile` (not zip). Node builtins give zlib/gzip but not a zip archive writer without extra dependencies; JSON stays simple and human-readable for v1.

| Field | Notes |
|-------|--------|
| `format` | `sydtrack-profile` |
| `schemaVersion` | `1` |
| `exportedAt` | ISO timestamp |
| `appVersion` | from package.json |
| `name` | optional string |
| `productive` / `unproductive` / `ignore` | string arrays |

**Available now:** Settings → Data → **Export profile pack** / **Import profile pack** writes or replaces the active rules + ignore lists (classifier picks them up immediately). Import does **not** touch day history or app settings.

**Named profiles now implemented:** five Home choices below FocusBoost; create/edit/delete/import/export in Settings. Existing Focus Tags edits the active profile. Read `docs/focus-profile-generation-guide.md` for the file-generation contract.

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

**Distraction definition:** while a session is active, each time classification moves **into unproductive** counts as +1 distraction (edge-triggered: other or productive → unproductive). Transitions that stay unproductive do not re-count. Ignore-list apps and sydtrack itself never count (they also do not update the previous category used for the edge). Same hint appears under the timer on the Sessions tab.

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

- **Named Focus profiles — implemented locally**: validate with `npm run test:profiles-ui` and `docs/manual-focus-profiles-validation.md`; review real user-generated profile files when supplied. No preset files bundled.
- **Crash / error local log — implemented**: bounded logs under the Data location, including main warnings/errors and renderer errors/exits. Manual crash acceptance and startup failures before logger installation remain to verify.
- **Tray + Downtime** (next after first `.exe` packaging pass): tray presence + FocusBoost in tray; tray menu (Pause, Boost, open Roundup/Home, pick Focus profile); **Downtime mode** (do not treat / do not log unproductive apps for evenings/breaks); tray icon state (active / downtime / paused)
- **Nudges / FocusBoost analytics**: Analytics solo segment pill (right of toolbar) for reminder history — each toast logged (app, streak, time); counts; average time-to-refocus when measurable
- **First-run onboarding** (**deferred — not this week**): wait until **named Focus profiles + keyword packs** exist; then Quick start / Custom that picks a primary browser, seeds Focus Tags / a starter profile, FocusBoost schedule, and (later) Roundup toast time. **First `.exe` can ship without it** — persist an `onboardingCompleted` (or equivalent) flag so a later update can still show first-run to people who never finished it. Until profiles ship, onboarding would just be a thin Settings wizard and is not worth it.
- **Disk usage display** with privacy/Data
- **Gentle health insights** (short coach notes, no lectures)
- **Privacy mode** (strip/hash window titles)
- **Themes — shelved until after profiles**: Coral, Midnight, Dusk, and Starlight (predominantly white with a subtle blurple tint).
- **Focus share goal** (later): Settings target % focused vs unfocused; Roundup hit/miss alongside productive-hours goal
- **Electron memory mitigations** (see Performance & memory) — fine for 8 GB+ as-is; revisit only if measured bloat
- **Away notes** (parked — do not implement yet):
  - Notification toggle above sidebar power + status
  - Settings: iOS-style switches instead of checkboxes
  - Onboarding: Quick start + Custom configuration (same deferred gate as To-dos — after Focus profiles)
  - **Rebrand to "what the focus"** — **shelved / lowest priority — ship last**. Rename would touch many custom surfaces (package ids, `.sydtrack` / `.sydtrack-profile` formats, appId, paths, UI strings, etc.). Keep sydtrack + package / `.sydtrack` ids stable until a dedicated rename ship; do not start rename work now.


## Roadmap / ideas (survive memory wipes)

North star: private · honest · alive. Local Windows companion with a daily loop (goal → Boost nudges → Roundup), not another guilt dashboard.

### Roadmap history (done / shipped)
- **History performance (#9 scoped)**: production snapshots no longer read archived days; Analytics requests 7/30-day summaries with bounded 90-day reads, caching, loading/error handling, and late-response protection. A synthetic 90-day regression proves zero archive reads for repeated live snapshots. Existing files retained; no consolidated database or full #9 architecture rewrite.
- **Backup completeness**: optional schema-1 sessions and identities included by the UI. Sessions deduplicate by ID and completed/later records supersede older checkpoints; live timers stay untouched. Legacy backups remain compatible. Multi-file rollback on disk failure remains future work.
- **Local diagnostics**: errors/warnings and renderer exits captured in two rotating local log files under Data/logs; no upload or inclusion in backups. Native/manual crash acceptance remains outstanding.
- **Focus profiles implemented (#7 foundation)**: atomic profile collection with Default migration, five slots, Home button below FocusBoost, Settings editing/import/export, draft protection, future-only tagging, capture invalidation, session-boundary reset, and backup compatibility. `docs/focus-profile-generation-guide.md` is the handoff for another model; no demo profile files were generated. Default is protected; deletion of the active profile selects Default. Automatic/tray switching remains deferred.
- **Lifecycle hardening (#14 groundwork)**: main-process power events suspend capture during sleep/lock; overlapping states and initial lock are handled independently of manual pause. In-flight probes are invalidated and stale reminder streaks reset with disk errors contained. Timer continuity distinguishes slow probes from unobserved gaps; intervals split across local hours/days, merging late samples into existing archives. Smoke simulations cover wake while locked, manual pause, session deadline/completion, startup streaks, stalled/slow probes, fractional boundary accounting, and disk failures. Physical sleep/wake/lock validation remains a release check; follow `docs/manual-lifecycle-validation.md`. This does not implement media-aware idle detection or alter the session schema.
- **Recovery foundation (#9)**: malformed settings/session files are preserved beside the original path with `.recovery-…` names before reset; settings reset persists tracking paused. Session timing is checked before restoring. Native notices identify preserved files; startup read failures show an error. This does not implement the broader storage upgrade. Restoration tooling and session-inclusive backups remain separate work.
- ~~Side nav smooth expand/collapse animation~~ **done** (CSS width/opacity; respects reduced-motion; mobile rail unchanged)
- ~~Stronger FocusBoost "hit the UI" press feedback~~ **done** (button punch + edge kick on arm; soft settle on disarm)
- ~~Roundup tab (after Analytics)~~ **done (v1)**: headline, goal bar, highlights, story
- ~~**Focus Tags quick add + search**~~ **done**: Focus Tags card — type keyword, live which-list status, Productive / Unproductive / Ignore (moves across lists; Enter → Productive)
- ~~Classification smarts: browser yellow "browser" tag, sharper title keywords~~ **done**: bare browser + `other` shows yellow **browser** chip (Last focused + Apps); Focus Tags copy clarifies title/URL keywords for browsers
- ~~**Pause / disable tracking**~~ **done (v1)**: Home Pause/Resume + Settings toggle; status pill Paused; freezes Last focused; no logging/reminders while paused
- ~~**Focus sessions**~~ **done (v1)**: Pomodoro / Deep / Custom; big Sessions-tab timer; Home compact controls; per-day log (top apps + distractions); history toggle; tray-ready active-session payload
- ~~.exe packaging~~ **scaffolded**
- Daily productivity goal shipped control; Focus share goal still in To-dos

### Focus profiles (current scope and later extensions)
Formerly "Focus modes" — named **Focus profiles** that swap what "productive" means for the task you're in (e.g. Writing, Coding, Homework, Deep reading).
- **Cap: up to 5 profiles** (user-workshopped defaults later; add/remove within the cap)
- Each profile owns complete productive / unproductive / ignore lists; no overlays.
- Example: Writing profile — VS Code / Cursor may count as unproductive; Word / Docs / LinkedIn editors count as productive
- Example: Coding profile — Stack Overflow / docs productive; Netflix still isn't
- **Management lives in Settings**, per the user's updated request. Focus Tags edits the active profile.
- **Home hotswitch**: quick switcher for the active Focus profile (later also tray)
- **Multi-profile UI implemented**: five-slot Home chooser beneath FocusBoost; empty slots open Settings.
- **Export / import** uses the existing JSON `.sydtrack-profile` format, not ZIP. Full `.sydtrack` backups also include the named collection.
- Adaptive angle (later): suggest profile from recent apps, or warn when current apps fight the active profile
- **Downtime** profile/mode: pause unproductive scoring / reminders (and optionally skip logging U apps) without full app quit — pairs with tray
- Keep fully local

### Explicit non-goals (for now)
- Cloud sync / accounts
- Heavy gamification / shame streaks

## License

MIT

### Focus Tags consolidation
Profile management now lives at the top of Focus Tags, with one active-profile selector and one set of tag editors. Home retains five choices; empty choices open creation on Focus Tags. New/imported profiles activate immediately; rename changes only the name and preserves tag drafts. Settings retains full backups, not duplicate profile controls. No data migration.

- Analytics Apps now supports explicit today-only corrections, separate from future-only Focus Tags. Top ten distinct apps; retained ignored seconds remain recoverable; daily/hourly totals recalculate. Previous days and session logs stay unchanged. Overrides expire at midnight.

- Month analytics redesigned as a 30-day pie and summary tiles. Monthly top apps aggregate complete per-day app summaries, not truncated daily rankings.

- Apps detail now separates the top ten apps by original category and matched keyword. New capture records attribution; legacy rows say Keyword not recorded. Today-only corrections target the individual activity row, not the entire browser. Regression coverage includes precedence, cross-keyword isolation, ignore restoration, restart, and backup merging.
