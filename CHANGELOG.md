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
- Reduced the between-column add affordance to a slimmer hover-style divider with a smaller `+` button.
- Renamed the mirror exclusion action to `Don't Clone`.
- Widened the new-board setup modal so field controls fit more naturally.
- Improved board icon assignment so broad board types like `Media` avoid reusing icons already taken by other boards when possible.
- Added a desktop save-status indicator in the board title row.
- Fixed persistence fallback so boards still save through `board_states` if normalized table writes fail.
- Added a migration-safe `boards.updated_at` schema column to match normalized save payloads.
- Reduced the between-column gap and slimmed the inline `+` affordance further.
- Changed remote hydration to prefer the richer/newer backup snapshot when normalized rows look incomplete.
- Hardened series-scrape apply so it persists the exact updated card snapshot immediately.
- Made remote hydration compare boards individually so one incomplete board can’t wipe another healthy one.
- Fixed empty boards so they still show an add-column entry point.
- Let the main board shell overflow visibly again so the settings dropdown doesn’t get clipped.
- Added board deletion under Maintenance with an in-app confirmation modal.
