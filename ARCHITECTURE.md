# Rankr Architecture

## App Shape

- Main UI entrypoint: [`/Users/avarycooney/Documents/Playground/src/components/rankboard-app.tsx`](/Users/avarycooney/Documents/Playground/src/components/rankboard-app.tsx)
- Main UI implementation: [`/Users/avarycooney/Documents/Playground/src/components/rankboard-app-impl.tsx`](/Users/avarycooney/Documents/Playground/src/components/rankboard-app-impl.tsx)
- Safety backup from before the split: [`/Users/avarycooney/Documents/Playground/src/components/rankboard-app.backup-2026-04-04.tsx`](/Users/avarycooney/Documents/Playground/src/components/rankboard-app.backup-2026-04-04.tsx)
- Extracted field/settings UI: [`/Users/avarycooney/Documents/Playground/src/components/rankboard-fields.tsx`](/Users/avarycooney/Documents/Playground/src/components/rankboard-fields.tsx)
- Extracted dialogs: [`/Users/avarycooney/Documents/Playground/src/components/rankboard-dialogs.tsx`](/Users/avarycooney/Documents/Playground/src/components/rankboard-dialogs.tsx)
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
- Active board preference:
  - local storage key scoped to the signed-in user when available
  - refreshed and remote-hydrated sessions should restore the user to the same board instead of falling back to the first board

## Load Flow

1. Local browser cache restores the most recent board selection quickly.
2. If signed in, the app loads normalized board rows from Supabase.
3. If normalized rows are missing but `board_states` exists, the app migrates that snapshot into normalized rows.
4. After remote hydration, UI state uses the normalized data and `board_states` remains backup-only.
5. Active-board restoration now checks both the user-scoped last-board key and the generic fallback key before defaulting to the first board.

## Save Flow

- Saves are intended to happen from committed mutations rather than broad rerender loops.
- During an active session, the in-browser board state is treated as authoritative.
- The app writes `board_states` backup snapshots first, then tries to repair/update normalized rows.
- If normalized writes fail, the backup snapshot is still considered a successful save for recovery purposes.
- Local storage keeps a fast cache plus recent backup snapshots.
- `column_entries` are now rewritten per board sync pass instead of incrementally upserted by stale IDs, which reduces the prior `409` conflict path.
- In auth mode, user-scoped local cache writes should wait until remote hydration completes, so the default starter board does not overwrite a real multi-board session during refresh.

## Recovery Preference

- When both normalized rows and `board_states` exist, the app prefers the richer/newer source.
- If normalized rows are suspiciously incomplete, the app hydrates from `board_states` and then attempts to repair normalized rows from that backup.
- Recovery is evaluated per board, not just per account-wide snapshot, so one empty or partially saved board is less likely to override the rest.
- Remote hydration is also compared against the current in-memory session snapshot so a non-empty local board is less likely to be replaced by a thinner remote payload during an active editing session.
- Active-board preference now also falls back across both user-scoped and generic last-board storage keys to reduce “refresh opened the wrong board” regressions.

## Column Modes

- Columns now carry explicit metadata for:
  - `dontRank`
  - `sortMode`
  - `confirmMirrorClones`
- Ranked presentation is no longer derived only from `column.type`; a ranked column must also be in manual sort mode and not marked `dontRank`.
- A-Z / Z-A are persistent modes rather than one-shot actions, and sorted columns auto-place cards by title.
- Column filter UI can drive both tier filters and the shared board-level series filter from inside the column menu.

## Media

- Manual artwork URLs are still supported.
- Uploads are optimized client-side where possible, then sent to the `board-artwork` Supabase Storage bucket.
- Card media uses blurred loading transitions to reduce harsh pop-in.
- On mobile, artwork helper buttons are intentionally stacked below the URL field so the URL input remains usable.

## Key UI Conventions

- Desktop board header contains:
  - board switcher icon
  - board title + rename control
  - desktop save-status indicator
  - search / filter / share / undo / settings controls
- Cards expose action affordances for edit, move, copy, and settings-driven delete.
- Hover/tap action design now favors icon-only primary actions plus nested settings menus instead of exposing every destructive/movement action at once.
- Hover-label icon buttons should render with centered icons in their collapsed state and only widen when the label is revealed.
- Between-column add affordances use a slim divider-plus pattern instead of a full-width placeholder column.
- Mobile keeps more explicit inline affordances where hover is unavailable.
- The mobile action sheet now exposes `Customization` and `Maintenance` directly, while account/theme/import-export actions stay under `Settings`.
- Mobile action-sheet expansion panels should span the full sheet width rather than anchoring under a later grid slot.
- Header/action series filters now use the same in-app menu model as column filters, rather than native `<select>` controls.
- On filtered/search views, cards should still be editable even though ranking interactions are suppressed.
- Board-level destructive actions live under Maintenance and use in-app confirmation modals instead of browser confirms.
- The board switcher also exposes create/delete affordances for board-level management.
- Mobile column reordering now has menu-based left/right actions in addition to desktop drag behavior.
- Mobile quick-add should prefer the column currently centered in the horizontal lane.
- Boards can override the noun used for cards with `settings.cardLabel`, and `Add ...` UI should prefer that over title heuristics.

## Mirror Linking

- Mirror columns should only maintain explicit links, not infer new ones from title matches during normal sync.
- The manual `Link Duplicates` action remains the opt-in path for same-title relinking.
- Mirrored cards can be unlinked in the edit dialog, which gives the clone its own `itemId` and excludes the original source item from automatic mirror recreation in that column.
- The `Clone of:` chip in the edit dialog is now a sever-link entrypoint rather than a sibling-navigation shortcut.
- The dedicated unlink icon was removed from the edit dialog to avoid redundant destructive affordances on mobile.
- Card identity should never be derived from title text. Same-name cards must keep separate `itemId`s unless they were explicitly linked.
- `Link Duplicates` in mirror columns is now a preview-and-confirm workflow; it should preserve card order and only attach links the user approves.
- Mirror review now covers both relinking existing same-title cards and creating missing clones, with optional rank entry for new clones.
- Mirror review now enforces unique rank values across enabled new-clone entries and can delete a redundant mirror-side candidate directly from the review screen.
- Mirror review now uses the same card-left/details-right presentation as the Series Scraper so maintenance review UIs stay consistent.
- Confirmed mirror clone creation is now immediately re-synced and persisted from the reviewed snapshot, which reduces the chance of newly approved clones being swallowed by later mirror sync passes.
- Card deletion from the edit dialog now goes through an in-app confirmation modal instead of deleting immediately.
- Board customization now includes icon selection. Boards can use either a built-in icon key or an uploaded custom icon image stored directly in board settings.
- Duplicate cleanup at board scope now groups same-title, non-mirrored cards across the active board instead of only within individual columns.
- Series scraping intentionally skips cards that already have a series value so it behaves like a fill-in tool rather than a rewrite tool.
- Board-wide Series Scraper runs now also skip mirror columns by default; the only way to scrape a mirror column is to launch the tool directly from that column's maintenance menu.

## Component Split Status

- [`/Users/avarycooney/Documents/Playground/src/components/rankboard-fields.tsx`](/Users/avarycooney/Documents/Playground/src/components/rankboard-fields.tsx) owns reusable field-management UI:
  - field definition manager
  - field settings panel
  - hover-label icon button
  - shared toggle/menu button primitives
- [`/Users/avarycooney/Documents/Playground/src/components/rankboard-dialogs.tsx`](/Users/avarycooney/Documents/Playground/src/components/rankboard-dialogs.tsx) now owns the form-heavy modal flows:
  - board setup
  - add card
  - edit card
- [`/Users/avarycooney/Documents/Playground/src/components/rankboard-app-impl.tsx`](/Users/avarycooney/Documents/Playground/src/components/rankboard-app-impl.tsx) still contains most application state, board lane rendering, settings, maintenance flows, and synchronization logic.

## Toggle Language

- Switch-style toggles are the preferred design language for binary settings.
- Column-level ranking and persistent sort modes now use the same visual toggle model as field/front-display controls.

## Public Sharing v1

- Boards can now be marked public and assigned a read-only share slug.
- Public links render through [`/Users/avarycooney/Documents/Playground/src/app/share/[slug]/page.tsx`](/Users/avarycooney/Documents/Playground/src/app/share/[slug]/page.tsx).
- v1 is full-board only and read-only; viewers do not get edit affordances.

## Series Scraping

- Series scraping currently uses local heuristics only.
- External Wikipedia lookup is disabled to avoid rate limits, console noise, and UI stalls.

## Layout Guardrails

- The board shell and title row are width-constrained with `min-w-0` / `max-w-full`.
- Only the column lane should grow horizontally and scroll; header controls should stay anchored to the board shell.

## Important Notes

- The public board component entrypoint is intentionally tiny now; the large implementation lives in `rankboard-app-impl.tsx`.
- This is still an incremental reorganization, not a full decomposition. The implementation file remains large, but the highest-duplication form UIs now live in dedicated component files and the stable wrapper keeps import churn low.
- Same-column drag/drop logic now treats drops onto lower cards as an insertion after the hovered card, which fixes the prior “moving down doesn’t stick” behavior.
- The next cleanups should target extracting:
  - column lane / column menu sections
  - maintenance/import/export modals
  - board header / settings shell
- Persistence and media helpers should continue living in lib files instead of expanding the implementation file further.
