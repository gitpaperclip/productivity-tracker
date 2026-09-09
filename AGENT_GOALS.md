# sydtrack — goals, progress, and roadmap

Updated September 9, 2026. **This is the single source of truth for product direction, implementation progress, and future work.** Read it before building features. Later explicit user instructions take precedence. Update this file instead of creating additional progress, goals, or planning documents.

Consolidates the former roadmap, progress report, Focus profiles plan, and historical agent checkpoints. Superseded proposals are removed: profile management lives on Focus Tags, starter profiles ship, and Windows icon behavior remains unresolved. Release notes and practical guides stay separate.

## The goal

**Create something simple, intuitive, easy to understand, and capable of providing meaningful insights.**

Help people understand where their computer time went, whether it matched their intentions, and what they could change—with minimal effort. Keep all tracking and computation local and private. No accounts or cloud service required.

The intended experience is: choose a focus profile if useful, work, and glance at an understandable result. Users should not need to configure a taxonomy, study a dashboard, or maintain extensive rules before the app is useful.

## Product principles

1. **Simple by default, specific when requested.** A useful General profile works immediately. More specific profiles and editing are optional.
2. **One clear place for each action.** Focus Tags owns profile management; Settings owns general preferences and full backups. Avoid duplicate editors and competing sources of truth.
3. **Explain the evidence.** Show the keyword or rule behind a classification. Distinguish recorded activity from interpretation, missing information, and idle time.
4. **Make correction predictable.** Clearly separate future profile rules from today's activity corrections. Never silently rewrite unrelated activity or fabricate missing history.
5. **Insights should support a decision.** Prefer a few relevant observations over more charts, totals, or scores. Avoid judgmental language and unsupported conclusions.
6. **Trust before breadth.** Tracking accuracy, recoverability, reliable Windows behavior, and low maintenance take priority over new features.
7. **Privacy is structural.** Compute locally; avoid unnecessary capture. No background-tab surveillance, automatic uploads, or server dependency.
8. **Modern means understandable.** Consistent spacing, typography, controls, keyboard access, and clear states matter more than decoration.

## What each part of the app is for

- **Home:** understand today and start the next action quickly.
- **Focus profiles:** express the kind of work the user intends to do.
- **Focus Tags:** inspect and adjust those definitions in one place.
- **Sessions:** establish an intentional period of work and show what happened during it.
- **Analytics:** explain recorded time and make errors correctable.
- **Roundup:** highlight a small number of useful observations.
- **Settings:** manage preferences, data, and recovery without becoming a second feature dashboard.

Avoid expanding these responsibilities until a concrete user need justifies it.

## Focus profiles: the central product opportunity

The user wants highly specific profiles geared toward managing productivity. Progress beyond broad labels such as Coding or Study toward intentions such as a CS assignment, calculus revision, video editing, or writing without research.

Specificity should live in sensible presets and optional customization, not in a complicated daily workflow. Begin with a handful of well-tested profiles rather than dozens of large generated keyword lists. Profile packs should explain their assumptions and be easy to import and adapt.

**Important implementation gap:** more keywords do not equal more understanding. Current global process identities can take precedence over profile keywords; an editor may remain productive even when unrelated to the intended task. Before promising truly task-specific classification, define and test explicit profile overrides, their precedence, and browser behavior. Preserve compatibility and make any changed behavior visible to users.

Window titles cannot establish whether a video or research page is useful. Allow corrections and acknowledge uncertainty. Do not promise semantic understanding that the app does not have.

## Meaningful insights without arbitrary scoring

Prefer contextual observations: “YouTube accounted for 18 minutes during your study session” provides more context than a daily app total. It still does not establish that those minutes were wasted. Only display session-level observations when the stored data supports them.

Do not introduce a universal 1–5 activity rating or a single productivity score by default. Weighted scores risk presenting subjective assumptions as precise measurements. Existing focus share should retain an explicit definition: productive time divided by productive plus unproductive time. It is a category ratio, not a measure of personal worth or work quality.

Potential future insights include session completion, time aligned with an explicitly selected profile, and prominent interruptions. Define profile changes within sessions and old-record behavior before implementing comparisons. Do not infer causality, motivation, or value from app names.

## Priority order

### Now: finish and stabilize the current product

- **Reopen the Electron icon issue.** The user still sees Electron branding after the attempted fix. Executable metadata and bundled-resource checks passed, but visible Windows shell behavior remains unresolved. Reproduce development and portable launches separately; inspect taskbar identity and shortcuts before assuming caching. Do not call it fixed based on metadata alone.
- Complete targeted real-device upgrade, restart, sleep/lock, and browser acceptance using the existing manual guides.
- Audit classification and correction behavior for clear explanations and consistent results.
- Consolidate stale documentation and track actual release publication separately from source pushes.

Current release checkpoint: v1.1.1 portable built locally; source pushed to `gpt6-astra` at `656efa5`. No GitHub release upload was performed in this session. Verify live repository/release state before acting in a later session.

### Next: strengthen the foundation for intentional focus

- Improve interrupted backup/import recovery before considering a storage rewrite. Existing multi-file imports are not fully transactional; activity merges can duplicate time on repeated import.
- Resolve profile-specific classification precedence with focused regressions and compatible defaults.
- Design profile attribution for future session records, including mid-session switches and old unattributed records.
- Validate a small set of intention-specific profiles with real users. Identify where correction is frequent before generating more packs.

### Then: add a small number of useful improvements

- Add concise session or Roundup observations supported by actual data.
- Explore an explicit timed break workflow with clearly defined timer, reminder, and logging behavior.
- Evaluate local media-aware idle signals conservatively. Background music must not keep unrelated foreground activity active; playing versus paused and foreground relevance matter. Defer automatic behavior if the evidence is unreliable.
- Deliver Coral, Midnight, Dusk, and Starlight themes through shared semantic color tokens. Starlight is a light theme with a restrained blurple tint. Maintain contrast and identical component behavior; reliability work comes first.

### Deferred unless evidence changes the priority

- Automatic browser address capture: prototype remains disabled; title-based tracking is the baseline across browser engines.
- Storage architecture replacement: measure performance and failure cases first (#9).
- Advanced scoring/decompression analytics without agreed semantics (#13).
- Media inference based only on window titles (#14).
- Heavy gamification, competitive rankings, or shame-based streaks (#8).
- Cloud sync, accounts, browsing-history dashboards, and employee-monitoring features.

This is a sequence of priorities, not a commitment to complete every item next week. The proposed week plan and completed-work checkpoint are below.

## Feature acceptance filter for future sessions

Before building, answer:

1. What concrete user problem does this solve?
2. What can the user understand or do afterward that they cannot do now?
3. Can an existing control or view solve it with less complexity?
4. What evidence supports the displayed insight, and what remains uncertain?
5. Does it preserve local privacy, historical compatibility, and predictable behavior?
6. How will we test correctness and know when this feature is finished?

If the benefit is unclear or mostly increases dashboard density, defer it. Keep changes small, avoid unnecessary dependencies, and preserve Electron security boundaries. Logic fixes need focused regressions; visual claims require actual inspection. Never equate mocked browser tests with live browser acceptance.

## How to learn whether the product is working

Start with a small group of Windows-using students working on real assignments. Observe whether they can get started unaided, understand classifications, correct errors, and keep using the app voluntarily. Ask: **“What did sydtrack help you notice that you would not otherwise have noticed?”**

Collect feedback voluntarily; do not add telemetry to answer these questions. Free pricing and privacy help, but the intended advantage is understandable, low-effort feedback built around the user's intentions. Avoid unsupported claims that competitors universally paywall features or lack usable interfaces.

Success is a useful app people can trust and leave running—not the longest feature list.

## What we accomplished

### 1. Focus profiles became a complete user workflow

- Added five profile slots, each with its own Productive, Unproductive, and Ignore lists.
- Bundled General, Coding, Writing, Study, and Creative, with downloadable profile packs and a guide for generating additional packs.
- Fresh installs receive the starter profiles. Existing installations preserve their profiles and active selection, filling available slots once; deleted starters do not repeatedly return.
- Added profile switching on Home and Focus Tags. Consolidated editing, creation, renaming, deletion, import, and export on Focus Tags instead of maintaining competing Settings controls.
- Quick Add updates the active profile. Switching protects unsaved edits; renaming preserves tag drafts. Profile switches affect future tracking and preserve recorded history and session deadlines.
- Added compatible initialization, atomic saves, recovery handling, and full-backup support.

**Why it matters:** productivity can reflect the work someone intends to do, rather than one permanent list that treats every day identically.

### 2. Analytics became more useful and correctable

- Apps now ranks today's ten most-used apps, with separate rows for classification and matched keyword. A browser can show distinct YouTube and GitHub activity instead of an unhelpful “mixed” label.
- Row-level corrections update today's category totals and hourly records while leaving unrelated activity alone. Corrections survive restart and expire at midnight.
- Already-recorded ignored time remains recoverable. Older records explicitly say “Keyword not recorded” instead of inventing attribution.
- Replaced the cluttered Month presentation with a 30-day pie, focus share, tracked time, active days, average per active day, and top apps aggregated across the period.
- Fixed stationary-hover tooltips disappearing during refresh and long app names overflowing tooltips (#1).

**Why it matters:** the user can understand and correct the evidence behind the chart, rather than merely trust a label.

### 3. Strengthened the tracking and data foundation

- Retained and hardened process-identity precedence (#11): editors remain productive when project titles contain words such as “youtube,” while browser content still determines browser classification.
- Established a browser-independent foreground-title baseline (#7), including non-Chromium and configurable browser identities. The unreliable address-capture prototype remains disabled by default.
- Fixed ordinary idle accounting so earned time is not repeatedly subtracted (#14 groundwork).
- Improved handling of sleep, lock, pause, delayed probes, stale results, clock discontinuities, and local hour/day boundaries.
- Improved session completion delivery, deadline handling, retention, and failure behavior.
- Added or strengthened atomic JSON writes, validation before backup replacement, malformed-file preservation, recovery notices, and bounded local error logs.
- Moved historical summaries out of frequent live reads and into on-demand, cached loading (#9 groundwork).

**Why it matters:** these changes reduce the chance that future features produce attractive charts from unreliable records. They prepare the existing architecture for growth without replacing it wholesale.

### 4. Made the desktop experience more coherent

- Refined Focus Tags into separate list tiles and a compact management tile; added a separate name editor, title truncation, and transient confirmation messages.
- Applied consistent scrollbars, typography, profile controls, and lowercase branding.
- Fixed live tag-search behavior (#4), independent session/analytics controls, collapsed-sidebar spacing, custom-session alignment, and the Roundup icon (#3).
- Corrected Windows taskbar identity/icon configuration and the “open sydtrack” tray label.

## Release and verification status

- Package and lockfile versions are **1.1.1**.
- Portable build succeeded: `dist/sydtrack.exe`. Its metadata and bundled application version were verified as 1.1.1.
- Release notes: [v1.1.1](docs/release-notes-1.1.1.md), superseding v1.1.0 with the full feature summary.
- Release source changes were pushed to `origin/gpt6-astra`, commit `656efa5`.
- **The executable has not been uploaded as a GitHub release asset.** A branch push is not release publication; `dist/` is Git-ignored.
- Smoke regressions, isolated Electron UI/profile checks, relevant syntax checks, and whitespace checks passed during today's work. UI screenshots were inspected, including the collapsed sidebar and profile-name editor.
- These checks do **not** establish a full real-device upgrade or sleep/wake sign-off. Native browser coverage, ordinary-use soak testing, and Windows shell behavior still benefit from manual acceptance.
- Local runtime profile formatting changes and the seeding marker were left out of the release commit. Check the current working tree before future commits.

## What remains limited

- Passive video viewing can still become idle. Media-aware idle detection is not implemented.
- Title-only tracking cannot reliably identify sites with vague titles. Automatic address extraction is not ready to enable.
- Profile changes do not rewrite history. Today's Analytics corrections do not rewrite previous days or saved session observations.
- Unrecorded ignored time cannot be reconstructed; old activity cannot acquire missing keyword attribution.
- Backup merge is additive for activity, so importing the same backup twice adds its activity twice. Multi-file replacement is not fully transactional on disk failure.
- Starter profiles are editable starting points, not universally correct definitions of work. Global process identities can take precedence over profile keywords.
- Month refreshes when reopened. The portable executable is unsigned.

## Next week: make trust the next major feature

Proposed sequence for September 14–18. This is a prioritized plan, not a promise to fit every feature into five days. If the first two stages reveal defects, fix them before expanding scope.

### Monday — Close the release loop

Publish the approved 1.1.1 artifact and notes when authorized. Run the existing [lifecycle](docs/manual-lifecycle-validation.md) and [profile](docs/manual-focus-profiles-validation.md) guides against a backed-up real installation, including restart, a second launch, profile changes, correction persistence, and sleep/lock. Exercise Firefox or another non-Chromium browser as well as a generic browser identity.

Consolidate stale roadmap notes and audit the README against the actual UI. Resolve contradictory license wording in historical documentation against the repository's authoritative license; do not change licensing as a cleanup shortcut. Review GitHub issues against evidence before closing anything.

**Done when:** publication status is explicit, manual outcomes are recorded, and remaining failures have reproducible steps.

### Tuesday — Make backup recovery trustworthy under interruption

Prioritize backup replacement failure safety over a storage rewrite. Design a staged import: validate and stage all files, preserve the previous state, record progress, and recover deterministically after a crash. Test interrupted writes and restart at each meaningful stage using temporary directories.

Separately decide repeated-import behavior. A content-based import receipt may prevent accidental duplicate merges, but intentional re-imports and partial overlaps need explicit semantics before implementation.

**Done when:** a failed import either retains the old dataset or has a clear, tested recovery path. Do not call this complete merely because each individual file write is atomic.

### Wednesday — Define honest idle and intentional breaks

Treat “no input” and “not working” as different concepts. Scope #14 around one shared accounting decision used by tracking, sessions, and reminders.

Prototype only local, OS-provided playback evidence. Determine whether the signal identifies the foreground activity and distinguishes playing from paused; background music must not automatically keep the entire computer active. If the evidence is insufficient, retain conservative idle behavior.

A small, explicit timed break control may deliver more reliable value sooner than automatic inference. Decide its effect on timers, reminders, and recorded categories before building it.

**Done when:** there is an agreed policy and a narrow demonstrable implementation or a documented reason to defer automatic detection.

### Thursday — Connect intentions to sessions, without a score

Design session-level profile attribution: optionally record the active profile's stable ID and a name snapshot for future session records. Decide how to represent a mid-session profile switch; do not label an entire session with whichever profile happens to be active at completion. Old records must remain readable and explicitly unattributed.

Use that foundation for a modest improvement to Roundup: planned focus time, completed sessions, actual category time, and the largest interruptions. Separate observation from interpretation and avoid claiming causality.

**Done when:** attribution semantics and compatibility are tested before any new comparison chart is added. This is a candidate next substantial feature, not permission to expand every analytics page.

### Friday — Polish and choose the next release boundary

Implement Coral, Midnight, Dusk, and Starlight through shared semantic color tokens if reliability work is stable. Persist one theme setting, preserve readable contrast and keyboard focus, and use the same component geometry in every theme. Starlight should be a genuinely light theme with a restrained blurple tint.

Check startup and steady-state tracking cost, history loading, narrow layouts, long names, and keyboard navigation. Reserve time for bug fixes and a release candidate rather than ending the week with several half-finished systems.

**Done when:** the selected scope is coherent, measured, and ready to test as a whole. Defer themes if data or lifecycle work still needs attention.

## Engineering invariants and handoff

- Preserve user-owned data and intentional working-tree changes. Development uses `data/`; packaged builds use Electron userData. Quit from the tray before switching builds: a running instance can intercept `npm start`.
- Profiles own complete lists. Preserve stable IDs, unique trimmed names, five slots, and the protected `default` ID. New profiles start empty; imports add and activate a profile in a free slot; deleting the active profile selects Default. Rename changes metadata only and preserves drafts.
- Activation must persist before applying rules, discard stale captures, and reset classification/reminder boundaries without rewriting history or changing session deadlines. Test rapid switches and failed persistence.
- Full backups include optional profiles, sessions, and identities. Legacy tags update Default without replacing other profiles. Session IDs deduplicate; imports never start a timer or overwrite the active timer. Activity merges remain additive.
- Preserve malformed originals before recovery. Use atomic replacement, input validation, backwards-compatible defaults, context isolation, and narrow IPC. Avoid unnecessary dependencies.
- Session distractions are transitions into unproductive activity, not every tick. Ignored or zero-time ticks must not create false transitions. Timer reads must not consume completion events; tray refresh must not replay them.
- Browser titles do not establish process identity. Experimental address capture exposed unsubmitted-address capture and unreliable resumption after the focus guard. New live evidence is required before enabling it.
- Keep archive reads bounded and outside live polling. Measure CPU, memory, startup, and probe latency before architectural changes; historical informal memory estimates are not measurements.
- Windows x64 remains the target. Mac/Linux, rebranding, adaptive profiles, reminder-history analytics, onboarding, and extra privacy/data controls remain parked ideas, not commitments. Preserve stable IDs, data paths, and export formats.
- Issue numbers describe scoped work, not permission to close issues. #1/#3/#4/#11 have targeted fixes; #7/#9/#13/#14 remain partly or wholly deferred. #10 external bot configuration requires identifying its owner, not renaming the app.
- Run focused regressions with `npm test`; use relevant syntax and diff checks. Isolated UI checks: `npm run test:ui` and `npm run test:profiles-ui`. Packaging: `npm run pack` or `npm run dist:portable`. Output is unsigned and Git-ignored.
- Verify branch, release state, and executable version before release work. External publication requires user authorization. Repository LICENSE is authoritative; obsolete MIT wording in previous goals is not a licensing decision.

## Supporting documents

- [README](README.md): current user behavior and setup.
- [Release notes](docs/release-notes-1.1.1.md): publishable summary.
- [Lifecycle validation](docs/manual-lifecycle-validation.md): real-device acceptance.
- [Profile validation](docs/manual-focus-profiles-validation.md): workflows and compatibility.
- [Profile generation guide](docs/focus-profile-generation-guide.md): portable pack format.
