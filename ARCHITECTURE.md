# Rankr Architecture

## App Shape

- Main UI: [`/Users/avarycooney/Documents/Playground/src/components/rankboard-app.tsx`](/Users/avarycooney/Documents/Playground/src/components/rankboard-app.tsx)
- Types: [`/Users/avarycooney/Documents/Playground/src/lib/types.ts`](/Users/avarycooney/Documents/Playground/src/lib/types.ts)
- Trello import: [`/Users/avarycooney/Documents/Playground/src/lib/trello-import.ts`](/Users/avarycooney/Documents/Playground/src/lib/trello-import.ts)
- Supabase browser/server clients:
  - [`/Users/avarycooney/Documents/Playground/src/lib/supabase/client.ts`](/Users/avarycooney/Documents/Playground/src/lib/supabase/client.ts)
  - [`/Users/avarycooney/Documents/Playground/src/lib/supabase/server.ts`](/Users/avarycooney/Documents/Playground/src/lib/supabase/server.ts)
- Normalized board persistence: [`/Users/avarycooney/Documents/Playground/src/lib/normalized-board-store.ts`](/Users/avarycooney/Documents/Playground/src/lib/normalized-board-store.ts)
- Image optimization: [`/Users/avarycooney/Documents/Playground/src/lib/image-processing.ts`](/Users/avarycooney/Documents/Playground/src/lib/image-processing.ts)
- Schema: [`/Users/avarycooney/Documents/Playground/supabase/schema.sql`](/Users/avarycooney/Documents/Playground/supabase/schema.sql)

## Persistence Model

- Source of truth:
  - `profiles`
  - `boards`
  - `columns`
  - `items`
  - `column_entries`
- Backup and migration compatibility:
  - `board_states`

## Load Flow

1. Local browser cache restores the most recent board selection quickly.
2. If signed in, the app loads normalized board rows from Supabase.
3. If normalized rows are missing but `board_states` exists, the app migrates that snapshot into normalized rows.
4. After remote hydration, UI state uses the normalized data and `board_states` remains backup-only.

## Save Flow

- Saves are intended to happen from committed mutations rather than broad rerender loops.
- The app persists normalized board rows, then updates `board_states` with a backup snapshot.
- Local storage keeps a fast cache plus recent backup snapshots.

## Media

- Manual artwork URLs are still supported.
- Uploads are optimized client-side where possible, then sent to the `board-artwork` Supabase Storage bucket.
- Card media uses blurred loading transitions to reduce harsh pop-in.

## Key UI Conventions

- Desktop board header contains:
  - board switcher icon
  - board title + rename control
  - desktop save-status indicator
  - search / filter / undo / settings controls
- Between-column add affordances use a slim divider-plus pattern instead of a full-width placeholder column.
- Mobile keeps more explicit inline affordances where hover is unavailable.

## Important Notes

- The app still has a large main UI component, so persistence and media helpers live in lib files to keep the core logic from getting even more tangled.
- Future work should continue moving mutation-specific persistence out of the component and into smaller repository-style helpers.
