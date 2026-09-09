# Give this guide to a model generating SydTrack Focus profiles

You are generating small, declarative Focus profile files for SydTrack, a private, local Windows productivity tracker. Produce useful, conservative keyword lists for the user's stated activities. Do not invent app features or output executable code.

## Ask the user first

Ask what each profile is for, which applications they actually use, examples of browser window titles they see, which activities count as productive/unproductive for that task, and which whole apps should not be recorded. Ask for the existing profile names so names stay unique. Do not request browsing-history exports or other private data unnecessarily.

There are five total slots. Default already exists and contains the user's existing tags; normally generate at most four additional files. Do not overwrite Default unless explicitly requested. No demo profiles are preinstalled.

## Output format

Return one UTF-8 JSON file per profile with the extension `.sydtrack-profile`. No ZIP, executable, JavaScript, YAML, Markdown wrapper, account, external URL download, or dependency is required. Each file should contain this structure, filled with the requested name and actual tag strings:

```json
{
  "format": "sydtrack-profile",
  "schemaVersion": 1,
  "name": "User-chosen name",
  "productive": [],
  "unproductive": [],
  "ignore": []
}
```

The empty arrays above illustrate the schema, not a recommended preset. Do not add `id`, `activeId`, `profiles`, `productiveApps`, settings, timers, or scores. SydTrack generates local IDs. `exportedAt` and `appVersion` are optional metadata; omit them rather than inventing values.

- Name: 1–40 trimmed characters, unique among installed profiles, ignoring case.
- Each tag list: an array of strings, at most 1,000 entries; each entry at most 200 characters. Prefer a short curated list, not hundreds of speculative matches.
- Trim tags, use lowercase, remove empty strings and duplicates. Avoid the same tag appearing in multiple lists.
- Every profile owns complete tag lists. There is no inheritance from Default or another profile. Global app identities still apply as described below.

## What classification actually does

1. **Ignore wins.** Ignore tags match whole application/process names by substring. They do not target one browser tab. Never put `youtube`, a URL, or a `site:` tag in Ignore expecting to exclude just a website. Ignoring `chrome` excludes every Chrome tab. SydTrack and globally ignored system processes remain excluded independently of the profile.
2. **Native app identities remain global.** Known productive tools such as VS Code/Cursor stay productive despite distracting words in a project title. An explicit Unproductive process-name match overrides their productive identity. Process matching here is exact against executable/app names, with optional `.exe` differences, not a wildcard.
3. **Browser content is title-based in normal Windows tracking.** Recognized browsers default to Productive when no content keyword matches. Unproductive title keywords override that default. A useful site name visible in the foreground page title can be a keyword; a website is not reliably recognized when its title lacks that keyword.
4. **Ordinary keywords use case-insensitive substring matches.** Unproductive matches precede Productive matches. Regex, glob syntax, negative rules, semantic topic recognition, and numeric priority weights are not supported. Very broad words can create false positives. An app-name keyword may also match a browser title; there is no separate `process:` namespace.
5. **`site:example.com` is a supported portable syntax, but normal Windows address capture is currently disabled.** Do not rely on site tags alone or present them as working website detection. Prefer meaningful title keywords. Only include site tags if the user explicitly wants future-compatible rules; explain this limitation. Site tags belong only in Productive/Unproductive and use domains without paths, wildcards, queries, or protocols.
6. **Unknown native apps without matching tags count as Other.** A profile cannot change the global browser fallback or remove the global process identity lists.

## Be honest about intent and passive use

- A title cannot prove that a video is educational, that the user is concentrating, or that media is playing. Do not claim otherwise.
- Profiles do not change idle tracking. Video/music playback does not automatically keep tracking active; the existing idle timeout still applies.
- Profiles do not rewrite historical totals, start sessions, change reminders' configured thresholds, or upload data. Switching resets the current reminder/classification boundary and preserves session deadlines.
- Avoid making every possible app productive or classifying every unknown activity as bad. Explain uncertain matches separately from the JSON.

## Deliverables

For each requested profile, provide its `.sydtrack-profile` file plus a short explanation outside the file: why each group of tags was chosen, likely false positives, and a few window-title/application examples with expected categories. Clearly label uncertain assumptions. Do not fabricate the user's application names.

The recipient can validate without importing:

```powershell
node scripts/validate-profile.js "C:\path\to\their-profile.sydtrack-profile"
```

This reads the file and checks the same profile constraints used by the app. It does not change settings or activity history. Passing validation proves format compatibility, not that the keywords match the user's real titles well.

## How the user will install it

Settings → Focus profiles → **Add from file…** creates a profile in an empty slot without activating it. A duplicate name or a full five-slot collection is rejected. Choose it from the Home button below FocusBoost or select it in Settings and click **Use profile**. Settings → Data → the older **Import profile pack…** replaces the active profile's tags after confirmation; use Add from file for additional profiles.

The user may return generated files to the coding model for review before importing. Review actual tags against this guide and the current classifier; do not install them automatically merely because they parse successfully.
