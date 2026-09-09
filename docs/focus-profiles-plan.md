# Focus profiles: implementation handoff

Status: implemented locally. The user's revised UI request supersedes the original proposal below: five choices beneath FocusBoost, management in Settings, and empty new slots. Read README.md for current behavior, `docs/manual-focus-profiles-validation.md` for acceptance checks, and `docs/focus-profile-generation-guide.md` for the model handoff. No preset files or themes were added.

## Original design decisions (implementation notes)

- Start with one Default profile copied from the user's current productive/unproductive/ignore lists. Preserve the originals during migration. Each profile owns complete lists; avoid hidden overlays that make classification hard to explain.
- Keep process identities global. Explicit unproductive process tags already override productive app identities; browser content still decides browser classification. A Writing profile can therefore mark Code unproductive without weakening process identity handling globally.
- Switching affects future tracking only. Never reclassify old activity simply because the user switches profiles. The existing rule-edit reclassification path must be separated from profile activation before shipping.
- Switching during a session keeps the session deadline and recorded totals, discards a pending foreground sample, and resets reminder/category-transition state. Record the profile ID with new session/interval data only if the UI will actually use it; avoid a speculative schema expansion.
- Unsaved Focus Tags edits require an explicit Save or Discard decision before switching. A removed active profile switches to Default. Default cannot be deleted. Unique trimmed names, stable generated IDs, maximum five profiles.
- Current `.sydtrack-profile` files import into the selected profile after confirmation. A full backup gains a validated optional profile collection and active ID only when the feature exists. Existing backups migrate their tag lists into Default; do not start a timer or silently overwrite unrelated profiles.

## Testable steps

1. Pure profile store: strict validation, stable IDs, cap/name rules, atomic writes, restart persistence, and recoverable migration from current lists. Test malformed files and failed writes before wiring UI.
2. Activation service: one operation updates rule/ignore references, invalidates pending capture, resets streaks, and persists active selection. Test failed persistence leaves the old profile active. Historical totals must remain byte-for-byte unchanged.
3. Focus Tags management: create by copying the active profile, rename, delete, and Save/Discard handling. No additional setup wizard.
4. Home switcher: keyboard-accessible, clear active name, no interruption to running session deadlines. Test rapid switching and switch-during-probe races.
5. Backup/profile-pack compatibility and isolated Electron UI checks, then a small manual Windows acceptance pass. Add tray switching only after Home behavior is stable.

## Foundations now available

- Lightweight live snapshots and bounded, cached historical summaries; these do not require a storage rewrite for profiles.
- Session and identity backup extensions with whole-payload validation; active timers remain protected during import.
- Atomic JSON writes, malformed-file preservation, lifecycle invalidation, and bounded local error logs.

## Decisions adopted for this implementation

Default cannot be deleted; new slots start empty rather than copying or generating presets. All tag editing and switching is future-only; no historical reclassification control was added. Profile management is in Settings and Focus Tags edits the active profile. Themes (Coral, Midnight, Dusk, Starlight) remain shelved. No decisions about gamification, media recognition, or productivity scores were needed.
