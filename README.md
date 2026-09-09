<div align="center">
  <img src="./renderer/assets/logo-mark.png" width="200" alt="Logo">
  <br><br>
<video src="https://github.com/user-attachments/assets/ff96b86b-1c90-4d81-b8c4-27b4ca297569" width="100%" autoplay loop muted playsinline style="pointer-events: none;"></video>

SydTrack is a local-first Windows productivity tracker that watches your active window, classifies time as productive, unproductive, or other, and helps you understand where your day went.


## Features

- **Local active-window tracking:** records foreground applications on Windows.
- **Browser-independent title tracking:** recognized browsers, apps named Browser, and configured browser identities are productive when no title keyword matches. No browser extension is needed.
- **Keyword overrides:** unproductive keywords such as YouTube take priority over the browser default.
- **Portable website rules:** existing `site:example.com` tags are retained, but require a captured address. Normal Windows tracking currently uses title keywords; automatic address capture remains experimental and disabled.
- **Separate app categories:** the same app can appear in both productive and unproductive analytics with separate time totals.
- **Home:** mood, time pie, last-focused app, FocusBoost, and quick productive/unproductive/ignore actions.
- **Analytics:** day, week, month, hourly, and app views.
- **Roundup:** daily goal progress, top focus, biggest distraction, peak hour, focus share, and a daily story.
- **Focus sessions:** Pomodoro, deep work, or custom timers with session history and distraction counts.
- **Focus Tags:** editable productive, unproductive, and ignore keywords.
- **Live tag search:** reflects current editor drafts immediately, including unsaved additions and removals; quick-add moves a tag between lists.
- **FocusBoost:** shorter reminders for unproductive streaks, with optional schedules.
- **Portable data:** local `.sydtrack` backups and `.sydtrack-profile` focus-tag packs.
- **Tray operation:** keeps tracking quietly while the main window is hidden.
- **Consistent layout:** collapsed sidebar controls share a center line; narrow windows retain horizontal navigation, and custom-session minutes align with the Start button.

## Privacy

SydTrack is fully local. It does not require an account and does not upload activity to a server. Local data can include application names, window titles, and URLs captured from active browser windows, so treat exported backup files as private records.


### Usage

Requirements:

- Windows 10 or Windows 11, x64
- Node.js 18 or newer
- PowerShell available for the Windows foreground-window backend

From the project directory:

```powershell
npm install
npm start
```

Optional demo mode:

```powershell
npm run start:demo
```

Run the smoke tests:

```powershell
npm test
```

Optional isolated Electron UI checks (no tracking or access to your activity data):

```powershell
npm run test:ui
```


## Classification

Classification checks process names, window titles, URLs, and configured keywords.

1. Ignored process identities are excluded from tracking.
2. For non-browser apps, an explicit unproductive process-name tag wins; otherwise productive process identities take precedence over window titles and URLs.
3. For browsers with a captured address, `site:` tags take precedence over keywords. The most specific matching domain wins; the same domain in both lists is unproductive. For example, productive `site:learn.youtube.com` overrides unproductive `site:youtube.com` on that subdomain only. Rules match domain boundaries, never a domain mentioned in a page title or URL path.
4. Unproductive keyword matches take priority over ordinary productive keywords.
5. Productive keyword matches are applied next.
6. Recognized browsers with no matching keyword default to productive.
7. Unknown applications without a match are other.

Add website tags to the existing Productive or Unproductive lists (one per line). Use a domain without a path or wildcard, such as `site:youtube.com`. Ignore still applies to whole applications. Website tags travel with existing backups and profile packs; no data migration is needed. Older app versions preserve these strings but do not interpret them as website rules.

Normal Windows tracking reads the foreground application and window title. For browsers, add title keywords such as `youtube` or `github` in Focus Tags. It makes no address-bar query and does not read typed but unsubmitted addresses. This works independently of browser engine, provided the browser exposes a meaningful foreground title. Pages with vague or missing titles cannot be classified reliably from their website; they use the existing productive browser default unless a keyword matches.

Recognition includes Chrome, Firefox and other named browsers, an executable named `Browser.exe`, and application names ending in a separate `Browser` word. Add an unfamiliar executable name to `browserApps` in your app-data `app-identities.json`, then restart. Existing identity files without this optional array continue to work. Main tracking and the UI share the same recognition rules. A document title mentioning "browser" does not turn its native application into a browser.

The address-bar prototype remains disabled in production: live Chrome testing exposed unsubmitted-address capture and an unreliable focus guard. It can only be enabled explicitly by a developer through the backend factory for testing. Existing `site:` rules and profile packs remain readable, but these rules do not match ordinary title-only Windows samples. Do not rely on them instead of title keywords yet. No stored history is rewritten when this capture behavior changes.

`app-identities.json` contains the configurable process/app identities. On first run SydTrack copies it to its app-data folder, where it can be customized without editing the installed app (restart after editing). Identities match exact process names or executable basenames, with or without `.exe`. Browser identities never override content classification. Invalid JSON falls back to bundled identities while preserving the custom file.

Browser activity is stored by category, so switching from a productive GitHub tab to an unproductive YouTube tab does not reclassify the earlier time.

Idle tracking pauses at the configured timeout and retains time earned before that timeout. Paused or idle ticks do not add session distractions. Sessions that expire while the app is closed finish at their original deadline.

System sleep and screen lock suspend capture independently of your idle timeout. Waking while still locked keeps capture suspended, and waking never changes a manual tracking pause. Interrupted probes are discarded; sleep, lock, and tracker startup clear old reminder streaks. Focus sessions keep their wall-clock deadlines, but away time is not added to their app totals.

Slow foreground probes retain elapsed time while regular timer callbacks continue. A gap in those callbacks (over five seconds at the default polling rate), a backward clock change, or a sleep/lock event invalidates uncertain time. Activity intervals split across local hour/day boundaries, including fractional seconds and samples arriving after the day was archived. A failed reminder-streak write is logged without escaping the sleep/lock handler; the in-memory streak still resets. Lifecycle behavior has automated simulation coverage; physical Windows sleep/lock acceptance testing remains outstanding. See the [manual validation guide](docs/manual-lifecycle-validation.md).

Pause takes effect even while a foreground-window check is pending. Reading the session timer from the tray or UI does not consume its completion event, and tray settings changes do not replay completed events.

## Data

During development, SydTrack stores local data under `data/`. Packaged builds use Electron's user data directory. Data includes daily statistics, hourly buckets, history, settings, and focus sessions.

Settings can export:

- `.sydtrack` backups containing activity, session history/checkpoints, settings, rules, ignore lists, and app identities.
- `.sydtrack-profile` files containing portable focus tags only.

Activity backup merge is additive: importing the same backup again adds its activity time again. Session IDs are deduplicated; completed records supersede stopped checkpoints, and later records of the same status supersede earlier ones. An active session is exported as a stopped checkpoint without stopping the source timer; importing never starts a timer or replaces the target's active session. Older schema-1 backups remain accepted; absent session/identity fields leave those local data intact. Older app versions ignore these additional fields. Validation covers all imported sections before any replacement, but multi-file imports are not transactional on disk failure. Daily statistics, settings, app identities, and session writes replace complete JSON files to reduce truncation risk. Malformed stored statistics are preserved and reported rather than silently reset.

Live snapshots contain today's data only. Week and Last 30 Days summaries load on demand in Analytics, with loading/error text. Archived summaries are cached until history changes or the local date rolls over. Existing per-day storage remains unchanged, with reads bounded to 90 days; manually edited archive files require an app restart to refresh the cache.

Warnings, errors, fatal main-process errors, renderer console errors, and renderer exits are recorded locally in `logs/errors.log` under the Data location shown in Settings. Rotation retains one previous file, approximately 256 KB per file. Errors may contain private paths or text; review logs before sharing. They are never uploaded or included in backups. Logging failures are contained. Startup failures before logging is installed may still require the terminal output.

Imported settings apply the same behavior as Settings controls. In particular, importing **Keep session history: off** retains only the latest local session. That retained entry is saved successfully before older session files are removed.

Malformed settings and session files are set aside as adjacent `.recovery-…` files, preserving their exact original contents. A recovery notice shows the saved location. Settings recovery restores defaults and pauses tracking until you review Settings and resume. Damaged sessions are not reconstructed automatically. File-access or preservation failures stop the operation instead of resetting data; startup failures display an error. Recovery files remain local and are not automatically pruned or included in exports.

## Project Status

SydTrack is an actively developed Windows desktop application. Default browser tracking uses foreground titles; automatic website detection is deferred pending reliable browser-independent validation. It remains focused on simple productivity totals and reminders, without a browsing-history dashboard or background-tab monitoring.

License: GPL v3
