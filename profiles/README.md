# Included Focus profiles

These five downloadable profile packs match the starter profiles bundled in the native app. Fresh installs start on **General**. Existing installations retain their active selection and custom profiles; empty slots are filled once. The repository's development data has **Coding** selected.

| Profile | Productive focus | Intentional tradeoff |
| --- | --- | --- |
| General | Balanced, broad tracking from the original default profile | Keeps the existing comprehensive tags. |
| Coding | Editors, terminals, source control, docs, and AI assistants | Discord, social sites, and video sites are distractions. |
| Writing | Long-form writing, research, and note-taking tools | Editors and terminals are explicitly unproductive for a writing session. |
| Study | Coursework, notes, research, flashcards, and document tools | Video remains unproductive because titles cannot distinguish lectures from entertainment. |
| Creative | Design, editing, and creative tools | Video/social titles remain unproductive; adjust if tutorials are part of work. |

These are assumptions based on the former demo list; review them before relying on them. No browser `site:` tags are included because ordinary Windows tracking uses page titles rather than reliable addresses. General retains its full Ignore list; the other profiles use global app identities and self-exclusion, so they do not inherit General's Ignore list.

Download a file using GitHub's **Download raw file**, then open **Focus Tags → Import profile…**. Import requires an empty slot and a unique name, and activates the imported profile. No import is needed if it is already installed. To edit existing profiles, use Focus Tags directly.

Validate any pack without importing it:

```powershell
node scripts/validate-profile.js profiles/coding.sydtrack-profile
```
