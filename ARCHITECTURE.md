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
- Durable quiz progress:
  - `pairwise_quiz_progress`
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
- Pairwise quiz progress is now stored per `owner_id + board_client_id + column_client_id` in `pairwise_quiz_progress`, with local storage retained only as a fallback/recovery layer.
- `column_entries` are now rewritten per board sync pass instead of incrementally upserted by stale IDs, which reduces the prior `409` conflict path.
- In auth mode, user-scoped local cache writes should wait until remote hydration completes, so the default starter board does not overwrite a real multi-board session during refresh.

## Recovery Preference

- When both normalized rows and `board_states` exist, the app prefers the richer/newer source.
- If normalized rows are suspiciously incomplete, the app hydrates from `board_states` and then attempts to repair normalized rows from that backup.
- Recovery is evaluated per board, not just per account-wide snapshot, so one empty or partially saved board is less likely to override the rest.
- Remote hydration is also compared against the current in-memory session snapshot so a non-empty local board is less likely to be replaced by a thinner remote payload during an active editing session.
- Active-board preference now also falls back across both user-scoped and generic last-board storage keys to reduce “refresh opened the wrong board” regressions.
- During authenticated remote merge, a temporary signed-out `Rankr` starter board should be discarded once real saved boards are available so mobile auth handoff does not keep a stray blank board.
- Shared-board reads now fetch the published board row plus its columns/items/entries directly, rather than loading all boards for the owner and then selecting one.
- Shared boards can now override their display/browser title through `board.settings.publicShare.title` without renaming the source board.

## Column Modes

- Columns now carry explicit metadata for:
  - `dontRank`
  - `sortMode`
  - `confirmMirrorClones`
- Ranked presentation is no longer derived only from `column.type`; a ranked column must also be in manual sort mode and not marked `dontRank`.
- A-Z / Z-A are persistent modes rather than one-shot actions, and sorted columns auto-place cards by title.
- Column filter UI can drive both tier filters and the shared board-level series filter from inside the column menu.

## Board Layouts

- Boards now support two layouts:
  - `board`: the default kanban/ranked column layout
  - `tier-list`: horizontal card rows intended for tier lists
- `boardLayout` lives in board settings and is initialized in the board-creation modal.
- Tier List boards currently seed these rows:
  - `S`
  - `A`
  - `B`
  - `C`
  - `D`
  - `Pool`
- Board maintenance always exposes a layout-conversion action:
  - `Convert to Tier List` for kanban boards
  - `Convert to Kanban Board` for tier lists
- Both conversion directions are copy-based. The current board stays untouched and the converted layout is created as a new board, then made active.
- Copy-based board conversion now pushes the new board through synchronized board/active-board/column/card refs at once, so layout switches do not rely on async state timing during the handoff.
- That handoff now also resets the previous snapshot ref and any open tier-row anchor state before switching boards, which reduces stale tier-list UI state during conversion/copy flows.
- Converting to Tier List opens a confirmation modal that lets the user choose which non-mirror source columns to include before moving those cards into the backlog row.
- That conversion modal now uses the same constrained, scrollable dialog pattern as Share so very large column lists remain usable on smaller viewports.
- Converting back to kanban creates a `Ranked` column from the tier rows in display order and a `Backlog` column from the tier list's final intake row.
- Tier List quick-add defaults to the backlog row.
- Tier List ranked rows wrap cards instead of horizontal-scrolling, and those ranked-row cards use a square face for denser tier layouts.
- On mobile, Tier List cards intentionally shrink further than desktop to keep wrapped rows practical on narrow screens.
- On mobile, Tier List cards now use a portrait/image-first presentation with their text hidden to preserve row density.
- Tier List row labels can be renamed inline; multi-character single-word labels render sideways in the narrow label rail to avoid overlap, while single-character labels stay upright and slightly larger.
- Tier List row rails now hide their small action buttons until hover/focus to keep the label rail visually cleaner, and those controls stack vertically inside the narrower rail.
- Tier List rows now expose `+ Add Row` affordances between rows, using hover/focus on desktop and tap-to-reveal on mobile, and row-specific options are handled through a small in-UI menu anchored from the row rail.
- Tier List rows now use wider horizontal insert-gap droppables between cards so drag placement remains visible even after rows wrap, especially on desktop where the target previously felt too narrow.

## Media

- Manual artwork URLs are still supported.
- Uploads are optimized client-side where possible, then sent to the `board-artwork` Supabase Storage bucket.
- Card media uses blurred loading transitions to reduce harsh pop-in.
- On mobile, artwork helper buttons are intentionally stacked below the URL field so the URL input remains usable.
- Artwork upload handlers should only update the active add/edit draft and cleanup picker UI; they should not implicitly close the surrounding card modal.

## Key UI Conventions

- Desktop board header contains:
  - board switcher icon
  - board title + rename control
  - desktop save-status indicator
  - search / filter / undo / settings controls
- Cards expose action affordances for edit, move, copy, and settings-driven delete.
- Hover/tap action design now favors icon-only primary actions plus nested settings menus instead of exposing every destructive/movement action at once.
- Icon-only controls should prefer anchored tooltip labels instead of width-expanding labels, so their hit targets stay fixed.
- Scoped header/action-bar tooltips should use explicit named group variants so Tailwind emits the hover/focus classes reliably.
- Between-column add affordances use a slim divider-plus pattern instead of a full-width placeholder column.
- Those between-column add affordances should render above nearby cards/columns, and on mobile they now require a first tap to reveal the plus before a second tap creates the column.
- The same tap-to-reveal pattern now applies to between-card add affordances on mobile, and any revealed inline add control should collapse again if the user scrolls or taps elsewhere.
- Mobile keeps more explicit inline affordances where hover is unavailable.
- The mobile action sheet now exposes `Customization` and `Maintenance` directly, while account/theme/import-export actions stay under `Settings`.
- On mobile, `Share` and `Settings` should sit side-by-side in the action sheet, with board-level customization/maintenance rows below them.
- Mobile action-sheet expansion panels should span the full sheet width rather than anchoring under a later grid slot.
- On mobile, the `Maintenance` row should sit to the left of `Customization`, both rows should fill the row evenly, and their detail panels should open directly beneath their own buttons.
- Opening board-layout conversion from the mobile Maintenance sheet should also close the action sheet immediately so the conversion modal is the only visible surface.
- Header/action series filters now use the same in-app menu model as column filters, rather than native `<select>` controls, and the share modal now uses that same treatment too. The share-modal series menu opens upward to avoid modal clipping.
- Those filter menus also display series labels without leading sortable prefixes like `The` and `A`, while still keeping the stored full series value intact.
- Active series filters can now be cleared inline from the filter control itself rather than only by manually selecting `All series`.
- The shared header/action series filter menus should close when clicking elsewhere, matching the rest of the app’s in-UI menu behavior.
- On filtered/search views, cards should still be editable even though ranking interactions are suppressed.
- Board-level destructive actions live under Maintenance and use in-app confirmation modals instead of browser confirms.
- The mobile action-sheet Maintenance panel should expose the same board-layout conversion action as the desktop maintenance menu.
- The board switcher also exposes create/delete affordances for board-level management.
- Mobile column reordering now has menu-based left/right actions in addition to desktop drag behavior.
- Mobile quick-add should prefer the column currently centered in the horizontal lane.
- Boards can override the noun used for cards with `settings.cardLabel`, and `Add ...` UI should prefer that over title heuristics.
- Collapsed cards still use their own compact visual treatment, but they should now reuse the same series/title text derivation as full cards rather than dropping the series line entirely.
- Tier logic now includes `Top 30` in both the main board and shared board rendering paths, with its own emerald accent treatment.

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
- Mirror review now labels the `Link` toggle explicitly and uses a compact rank display/input rather than a wider generic status field.
- Automatic board-mirror sync now prepends newly discovered clones so fresh mirror additions surface at the top of the mirror column.
- Mirror review delete actions should use the mirror-specific choice modal so linked cards can be deleted together or only as a mirror copy.
- Inside the mirror review workflow, those delete choices should appear as a local anchored popover on the row itself rather than a separate full-screen modal layered behind the review screen.
- Mirror review rows should use their full vertical space, with preview media and action controls visually centered rather than top-stacked.
- Explicit mirror relink/create actions should also clear any prior mirror exclusion for that source item so the follow-up sync pass does not immediately suppress the newly approved clone again.
- Card deletion from the edit dialog now goes through an in-app confirmation modal instead of deleting immediately.
- Board customization now includes icon selection. Boards can use either a built-in icon key or an uploaded custom icon image stored directly in board settings.
- Duplicate cleanup at board scope now groups same-title, non-mirrored cards across the active board instead of only within individual columns.
- Series scraping intentionally skips cards that already have a series value so it behaves like a fill-in tool rather than a rewrite tool.
- Board-wide Series Scraper runs now also skip mirror columns by default; the only way to scrape a mirror column is to launch the tool directly from that column's maintenance menu.
- Board-wide Series Scraper runs also ignore already-mirrored card entries, which keeps duplicate clone rows out of the review list even if a mirrored card slips into the visible board state.

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
- Share publication is now driven through a configuration modal instead of a bare button.
- The chosen share configuration is stored in `board.settings.publicShare`:
  - `columnIds`
  - `tierFilter`
  - `seriesFilter`
  - `searchTerm`
  - `title`
  - `expiresAt`
- Shared links remain read-only, but they no longer have to expose the entire board. The share page now filters the board down to the chosen columns and any requested tier/series/search view.
- Tier filtering in the shared page is applied after the selected series/search scope has narrowed the column, so `Top 15` means the top 15 cards of the published filtered view rather than the top 15 of the raw underlying column.
- Shared links should self-expire after 24 hours. The server loader rejects expired links using both `last_published_at` and the explicit `settings.publicShare.expiresAt` guard.
- Re-publishing a share now issues a fresh slug instead of silently reusing the old one, which makes `Refresh Link` visibly produce a new link and restart the expiry window.
- The share page must keep cards `shrink-0` inside the shared column scrollers so large boards do not collapse into unreadable strips.
- The share modal itself should behave like a constrained sheet: scrollable body inside the viewport, persistent action row, and tighter desktop filter widths so the controls stay inside the dialog.
- The shared board renderer should mirror the main-board display rules closely:
  - same tier badge/border coloring
  - same series/title reduction logic
  - same horizontal snap scrolling across columns
- Since refreshed shares now generate a new slug, old share links effectively self-terminate as soon as the replacement link is published.
- The shared header is now intentionally compact: `Rankr Share:` label, active filter chips, board title, and a `Join` CTA on the same line when space allows.
- The `Join` CTA links to `/?new=1`, and the main app consumes that query by opening the new-board modal once and then clearing the query string.
- The new-board modal should encourage signed-out users to log in if they want board creation to persist across devices.
- The board-setup modal now supports both `Kanban Board` and `Tier List` creation up front, and on mobile its body scrolls within the viewport while the action buttons remain visible.
- New board creation now mirrors the hardened conversion handoff by updating the board list, active board, active columns/cards, and latest refs in one synchronized step before the first save queue runs.
- New-board defaults now derive the initial card label from the board title when the title looks like a collection name, so first-run copy can match the board theme without the user opening customization first.
- New-board defaults now enable only `Series` and `Artwork`; `Release Year` and `Notes` are available but start disabled.

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
- Card drag collision detection now prefers direct pointer hits before falling back to corner proximity, which should make cross-column drops more reliable in the horizontal board lane.
- Drag persistence now uses a short debounce queue for drop events so rapid reorder bursts collapse into the latest intended rank instead of racing several immediate saves.
- Card dragging now uses a visual drag overlay so the dragged card remains attached to the pointer while the source slot stays stable in the column layout.
- While a card is being dragged, the surrounding cards now stay visually calmer and the between-card insertion lanes become the primary drop indicator instead of aggressively reflowing the whole column on hover.
- The drag auto-scroll zone is intentionally wider near the top and bottom edges of a column so long columns start moving sooner during a held drag.
- The in-column insertion target now expands into a visible `Drop Here` slot while hovered during drag, instead of relying on a thin separator line alone.
- That drag target has since been revised again into a larger expanding gap between cards, so insertion feels more like opening space in the list than aiming at a hidden target behind the dragged card.
- The dragged card's original slot now collapses while the overlay is in your hand, which helps the list behave as though the item was truly lifted out before being reinserted elsewhere.
- Desktop now supplements dnd-kit's behavior with a custom mouse-driven vertical auto-scroll loop for column interiors, while mobile still relies on the built-in touch-oriented auto-scroll.
- The active drop target during drag is now just an animated gap; separator lines are hidden during drag so the spacing itself does the work.
- The drag overlay is intentionally smaller, more translucent, and pointer-transparent so it keeps more of the destination column visible without interfering with hit testing.
- Desktop auto-scroll now resolves the hovered column from `elementsFromPoint`, which is more reliable when drag overlays and floating UI layers are present.
- Insert-row droppable zones now extend well beyond the visible gap, overlapping into the surrounding card area so the user can hover within roughly the upper/lower half of adjacent cards and still trigger the correct insertion gap.
- After a drop is committed, the app now explicitly scrolls the moved card back into the visible area of its column so the user keeps visual focus on the card they just placed.
- Mirror creation paths now guard against duplicate clones by checking both `mirroredFromEntryId` and `itemId`, which helps when a source card moves between columns after it already has a mirror copy.
- Cross-column moves now also run the board-wide mirror synchronizer immediately, so source-card column changes update linked mirror content without disturbing the existing mirror order.
- Column maintenance now includes a bulk `Move All` action that transfers every card into a chosen target column without invoking mirror-clone side effects.
- Ranked/manual ordering and A-Z / Z-A sorting are now treated as explicitly incompatible states. Turning Ranked on resets the column back to manual ordering, and turning sort modes on keeps Ranked off.
- Column mirror controls now use toggle-style affordances rather than one-shot text buttons. Turning `Mirror` on requires a small confirmation step because it immediately creates a full mirrored view of the other columns.
- Column sort and mirror menus should remain open while the user flips toggle-style options so the updated state is visible without reopening the submenu after each click.
- The next cleanups should target extracting:
  - column lane / column menu sections
  - maintenance/import/export modals
  - board header / settings shell
- Persistence and media helpers should continue living in lib files instead of expanding the implementation file further.
- The between-card add affordance now renders as a centered plus button without horizontal divider lines, which avoids stale divider visuals after drag/drop.
- Empty columns now treat the large dotted placeholder as the add-card button, while the top insert row hides its own plus icon until a drag operation needs that insertion target.
- The built-in `Artwork URL` field now uses `showOnCardFront` as the actual source of truth for whether card artwork renders on the face of the card.
- The add-card dialog now uses an in-app series suggestion menu rather than only a datalist, so existing series stay discoverable on mobile and desktop while preserving freeform entry.
- The between-column add-column affordance is still gap-neutral (`w-3`) but the floating plus treatment is intentionally larger and more contrasty so it reads as clickable without widening the lane.
- The same in-app series suggestion control is now reused inside the Series Scraper review modal so maintenance edits match add/edit card behavior.
- Series Scraper only proposes series edits now; it no longer surfaces a release-year field in the review UI.
- Cards whose artwork is hidden or missing should render in the fallback face layout instead of using generated fallback images: centered title, bottom-left series, subtle decorative background.
- Collapsed cards now present rank and title on the same line, and tier-highlighted collapsed cards use the tier color as the primary surface rather than only as an accent.
- Collapsed card theming must remain mode-aware: Lumos uses light neutral surfaces for non-tier cards and keeps enough contrast for centered multi-line titles, while tier-highlighted collapsed cards keep readable dark text on the colored surface.
- Collapsed cards now intentionally use the same fill color family as their rank badge across the whole tile, rather than layering extra fallback dark surfaces underneath.
- Collapsed-card inner shells must not set their own hardcoded dark background, or they will override the intended white/tier surface classes entirely.
- Non-tier collapsed cards now intentionally use an off-white surface in Lumos for separation, and collapsed titles are back to a tighter single-line layout to preserve more of long names at a glance.
- Lumos now keeps its board-wide background in the same warm family from top to bottom, and column shells use a slightly warmer off-white than the cards so white collapsed cards remain legible against the lane.
- Collapsed cards now always draw a dark border regardless of tier, so the compact form stays legible even when the fill color is white or very light.
- The public `/share/[slug]` route now renders through a tiny server page plus a client `SharedBoardView` component so the shared page can keep server-loaded data while still offering viewer-only UI state like the Nox/Lumos toggle.
- Post-drop card placement no longer performs any automatic column scroll correction; the board now leaves the lane where the user dropped it instead of trying to re-center the moved card afterward.
- Icon-only controls are gradually standardizing on hover/focus tooltips instead of width-expanding labels. The board switcher and add-card / add-column affordances now use the same tooltip language as the edit-dialog action buttons.
- Pairwise quiz progress is now stored in `pairwise_quiz_progress` per owner/board/column when possible, with local browser storage used only as a fallback so save-and-resume can survive across devices.
- Card-front artwork gradients remain slightly shortened from the original design, but were later increased again after the first reduction proved too shallow in practice.
- Shared boards now expose a `Copy Board` action that serializes the shared snapshot into local storage and hands it off to the main app, where a fresh board copy is created with regenerated board/column/card IDs.
- Shared-board copying now serializes only the published share view (selected columns plus applied tier/series/search filters), so a copied board never reveals cards or columns that were not part of the shared link.
- Shared-board copies also strip live mirror behavior and `mirroredFromEntryId` links, turning the published result into a static editable snapshot so mirror-column order stays exactly as shared.
- Column action menus intentionally sit above the inline add affordances in stacking order, so hovered `+` controls never cover an active submenu.
