# Windows lifecycle validation

Allow about 10–15 minutes, plus an optional natural hour/midnight check. These are manual acceptance checks, not checks already performed by the agent.

## Prepare

1. Quit SydTrack from its tray menu so another instance is not running. Run `npm start` from the repository and keep the terminal open for errors. Use real tracking, not demo mode.
2. Note your current pause, idle-timeout, reminder, notification, and FocusBoost settings so you can restore them afterward. Export a backup if desired; exports include focus sessions, with running timers represented as stopped checkpoints.
3. Use an app that SydTrack actually records, such as Notepad. Check its app/category in Home and its time in Analytics. Avoid Explorer and SydTrack itself, which are ignored. Note totals or take screenshots before and after each test. Small differences of a polling interval and UI rounding are normal; a jump matching the whole locked/asleep period is not.
4. Keep typing or moving the mouse during the awake control periods so ordinary idle detection does not confuse the result. Test records are real local activity; do not clear existing history to run this checklist.

## 1. Lock and unlock (about two minutes)

- Keep the chosen app foreground for 20–30 seconds and confirm its total grows.
- Press **Win+L**, wait 60 seconds, then unlock.
- Return to the same app for 20–30 seconds and compare its total.
- Pass: activity resumes, the locked minute is not added, previous totals remain, and no error dialog/crash occurs. Repeat once with the idle timeout longer than the lock period to distinguish lock handling from idle handling.

## 2. Sleep, wake, then unlock (about three minutes)

- Start a **one-minute Custom session**. Work in the chosen app for roughly 10 seconds.
- Use **Start → Power → Sleep**. Wait at least 90 seconds, then wake the PC.
- If Windows presents a lock screen, remain there for another 20–30 seconds before unlocking. If it signs in automatically, record that wake-while-locked was not tested.
- Pass: there is one completed session, its timer duration is one minute, and its app totals exclude sleep/lock time. Activity totals do not jump by the away duration. The session remains completed after another minute; no duplicate completion appears.

## 3. Manual pause survives wake (about one minute)

- Pause tracking in Home and note the chosen app's total.
- Sleep/wake the PC, unlock, and use that app for 20 seconds.
- Pass: SydTrack still says Paused and the app total is unchanged. Resume manually; activity then grows again.

## 4. Reminder streak restarts after an interruption

- Temporarily choose a short supported reminder threshold and enable notifications. Disable scheduled FocusBoost for this check so the threshold stays predictable. Note the threshold as T.
- Use an app/window classified Unproductive for about half of T, then lock or sleep for 20 seconds.
- After unlocking, return to that window. Pass: no immediate catch-up reminder; the old half-streak is not carried over. A new reminder should require roughly a fresh T of tracked unproductive activity. Windows notification suppression/cooldown can delay or hide a toast, so a missing toast alone does not prove success.

## 5. Restart with an active session

- Start a one-minute Custom session and work briefly, then **Quit from the tray**. Closing the window alone leaves tracking running.
- Wait until more than one minute has elapsed since the session started. Run `npm start` again.
- Pass: exactly one completed session is present at its original planned duration; time while the app was closed is absent from its app totals. Existing daily activity remains intact. Restart again and confirm no duplicate session.

## 6. Natural hour/day boundary (optional longer check)

- Near the end of an hour, use the same recorded app continuously for about 30 seconds on each side. Check Analytics hourly bars: both hours should receive activity, and their combined increase should approximate the minute you worked.
- Repeat around midnight when convenient. Pass: yesterday's history remains available, today's totals begin separately, and neither day gains the whole interval or loses its existing history.
- Do not change the system clock to force this test on your normal data. Exact fractional splitting, delayed samples, and clock jumps are covered by automated fixtures.

## Finish and report

Restore your original settings. Record the Windows version, whether the test used `npm start` or a packaged build, the failed step, times/durations, expected versus observed totals, and any terminal error. Screenshots of Home/Analytics/Sessions are useful, but redact private app titles before sharing. The same checklist can be repeated on a packaged build; this guide does not claim that validation has happened.

Do not simulate disk failures by changing permissions or damaging user files. `npm test` injects those failures in temporary test directories, and also tests slow probes without putting the PC under artificial load.
