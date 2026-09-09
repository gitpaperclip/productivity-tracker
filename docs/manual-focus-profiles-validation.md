# Manual Focus profile checks

Quit SydTrack from its tray and run `npm start`. Do not run demo mode for classification checks. Tests below use your actual data, so export a full backup first if you want a recovery copy. Do not reimport backups repeatedly into normal activity history: activity merges are additive.

1. Home should show a Profile button immediately below FocusBoost. On first upgrade it shows Default, migrated from your existing tags. Open it: there should be five choices, with unconfigured slots offering setup in Settings.
2. Set up one empty slot. Name it, enter a small set of your own keywords, and save. Saving alone must not activate it. Select it from Home; its name should appear on the button. Quit from the tray and restart: selection and tags should remain.
3. Compare a known app under two profiles with different tags. Observe category changes only on new samples. Earlier Analytics totals must stay intact. Adding the app to Ignore should stop future recording without hiding the time already earned.
4. Start a short focus session, then switch profiles. The deadline should stay unchanged; the act of switching should not itself add a distraction or display an old catch-up reminder.
5. Edit a profile without saving, then try switching. Cancel the discard prompt: your edits and the active selection should remain. Save the edits and switch again. Try a duplicate name: the error should preserve your draft.
6. Export one profile, validate it with `node scripts/validate-profile.js`, and inspect its name/lists. For import, use a separately named file and an empty slot through Add from file. It must not activate automatically. Do not use the legacy Replace-tags action if you intend to add a profile.
7. Create enough real profiles to fill five slots if desired. No sixth profile should be accepted. Default cannot be deleted; deleting the active non-Default profile should return to Default without removing activity history.
8. Check the chooser using Tab, Enter, and Escape, and at a narrow window width. The menu should remain clickable and Escape should return focus to the trigger.

Automated tests cover atomic write failure, malformed profile recovery, backup validation, pending-probe switching, and file roundtrips in temporary directories. Do not corrupt your own files to repeat those tests. Full backup restoration and generated profiles are best reviewed in isolated test data before importing into daily use.
