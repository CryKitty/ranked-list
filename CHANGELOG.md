# Changelog

## 2026-04-03

- Moved live persistence toward normalized Supabase tables and kept `board_states` as backup/migration compatibility storage.
- Added automatic migration support from snapshot backups into normalized board rows.
- Added inline `+` affordances between columns for easier column insertion.
- Removed misleading empty-column copy so blank columns stay visually clean.
- Switched GIF search handoff to Tenor and excluded `fandom.com` from Google image searches.
- Added artwork upload support with client-side image optimization and Supabase Storage upload.
- Added blurred image loading transitions on cards.
- Tightened drag sorting toward a vertical list model and immediate post-drop persistence.
