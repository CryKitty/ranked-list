import type { SupabaseClient } from "@supabase/supabase-js";

import type { CardEntry, SavedBoard } from "@/lib/types";

export const BOARD_CHANGE_HISTORY_LIMIT = 30;
const BOARD_CHANGE_HISTORY_SCAN_LIMIT = 100;

export type BoardChangeSummary = {
  id: string;
  label: string;
  detail?: string;
  kind: "added" | "removed" | "edited" | "moved" | "board";
};

export type BoardChangeRecord = {
  id: string;
  createdAt: string;
  before: SavedBoard;
  after: SavedBoard;
  summaries: BoardChangeSummary[];
};

type SnapshotRow = {
  id: string;
  snapshot: SavedBoard;
  created_at: string;
};

type CardLocation = {
  card: CardEntry;
  columnId: string;
  index: number;
};

type SupabaseLike = Pick<SupabaseClient, "from">;

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function flattenCards(board: SavedBoard) {
  const cards = new Map<string, CardLocation>();

  for (const column of board.columns) {
    (board.cardsByColumn[column.id] ?? []).forEach((card, index) => {
      cards.set(card.entryId, { card, columnId: column.id, index });
    });
  }

  return cards;
}

function columnTitle(board: SavedBoard, columnId: string) {
  return board.columns.find((column) => column.id === columnId)?.title ?? "Unknown column";
}

function changedSettingKeys(before: SavedBoard, after: SavedBoard) {
  const keys = new Set([...Object.keys(before.settings ?? {}), ...Object.keys(after.settings ?? {})]);
  return [...keys].filter(
    (key) =>
      !sameValue(
        before.settings?.[key as keyof typeof before.settings],
        after.settings?.[key as keyof typeof after.settings],
      ),
  );
}

export function describeBoardChange(before: SavedBoard, after: SavedBoard): BoardChangeSummary[] {
  const summaries: BoardChangeSummary[] = [];
  const beforeCards = flattenCards(before);
  const afterCards = flattenCards(after);
  const added = [...afterCards.entries()].filter(([entryId]) => !beforeCards.has(entryId));
  const removed = [...beforeCards.entries()].filter(([entryId]) => !afterCards.has(entryId));
  const edited = [...afterCards.entries()].filter(([entryId, location]) => {
    const previous = beforeCards.get(entryId);
    return previous && !sameValue(previous.card, location.card);
  });
  const moved = [...afterCards.entries()].filter(([entryId, location]) => {
    const previous = beforeCards.get(entryId);
    return previous && (previous.columnId !== location.columnId || previous.index !== location.index);
  });

  if (added.length === 1) {
    const [, location] = added[0];
    summaries.push({
      id: `added-${location.card.entryId}`,
      kind: "added",
      label: `Added card: ${location.card.title}`,
      detail: columnTitle(after, location.columnId),
    });
  } else if (added.length > 1) {
    summaries.push({ id: "added-cards", kind: "added", label: `Added ${added.length} cards` });
  }

  if (removed.length === 1) {
    const [, location] = removed[0];
    summaries.push({
      id: `removed-${location.card.entryId}`,
      kind: "removed",
      label: `Removed card: ${location.card.title}`,
      detail: columnTitle(before, location.columnId),
    });
  } else if (removed.length > 1) {
    summaries.push({ id: "removed-cards", kind: "removed", label: `Removed ${removed.length} cards` });
  }

  for (const [entryId, location] of edited.slice(0, 3)) {
    const previous = beforeCards.get(entryId)!;
    const titleChanged = previous.card.title !== location.card.title;
    summaries.push({
      id: `edited-${entryId}`,
      kind: "edited",
      label: titleChanged
        ? `Edited title: ${previous.card.title} → ${location.card.title}`
        : `Edited card: ${location.card.title}`,
    });
  }
  if (edited.length > 3) {
    summaries.push({
      id: "edited-more",
      kind: "edited",
      label: `Edited ${edited.length - 3} more ${pluralize(edited.length - 3, "card")}`,
    });
  }

  if (moved.length > 0 && added.length === 0 && removed.length === 0) {
    const movedAcrossColumns = moved.filter(([entryId, location]) => beforeCards.get(entryId)?.columnId !== location.columnId);
    summaries.push({
      id: "moved-cards",
      kind: "moved",
      label:
        movedAcrossColumns.length === 1
          ? `Moved card: ${movedAcrossColumns[0][1].card.title}`
          : movedAcrossColumns.length > 1
            ? `Moved ${movedAcrossColumns.length} cards between columns`
            : `Reordered ${moved.length} ${pluralize(moved.length, "card")}`,
    });
  }

  const beforeColumns = new Map(before.columns.map((column) => [column.id, column]));
  const afterColumns = new Map(after.columns.map((column) => [column.id, column]));
  const addedColumns = after.columns.filter((column) => !beforeColumns.has(column.id));
  const removedColumns = before.columns.filter((column) => !afterColumns.has(column.id));
  const renamedColumns = after.columns.filter((column) => {
    const previous = beforeColumns.get(column.id);
    return previous && previous.title !== column.title;
  });
  const editedColumns = after.columns.filter((column) => {
    const previous = beforeColumns.get(column.id);
    if (!previous) {
      return false;
    }
    const { title: previousTitle, ...previousRest } = previous;
    const { title: nextTitle, ...nextRest } = column;
    void previousTitle;
    void nextTitle;
    return !sameValue(previousRest, nextRest);
  });

  if (addedColumns.length) {
    summaries.push({
      id: "added-columns",
      kind: "board",
      label: addedColumns.length === 1 ? `Added column: ${addedColumns[0].title}` : `Added ${addedColumns.length} columns`,
    });
  }
  if (removedColumns.length) {
    summaries.push({
      id: "removed-columns",
      kind: "board",
      label: removedColumns.length === 1 ? `Removed column: ${removedColumns[0].title}` : `Removed ${removedColumns.length} columns`,
    });
  }
  for (const column of renamedColumns) {
    summaries.push({
      id: `renamed-column-${column.id}`,
      kind: "board",
      label: `Renamed column: ${beforeColumns.get(column.id)?.title} → ${column.title}`,
    });
  }
  for (const column of editedColumns) {
    summaries.push({
      id: `edited-column-${column.id}`,
      kind: "board",
      label: `Updated column: ${column.title}`,
    });
  }
  if (
    addedColumns.length === 0 &&
    removedColumns.length === 0 &&
    !sameValue(before.columns.map((column) => column.id), after.columns.map((column) => column.id))
  ) {
    summaries.push({ id: "reordered-columns", kind: "moved", label: "Reordered columns" });
  }
  if (before.title !== after.title) {
    summaries.push({ id: "renamed-board", kind: "board", label: `Renamed board: ${before.title} → ${after.title}` });
  }
  const settingKeys = changedSettingKeys(before, after);
  if (settingKeys.some((key) => ["boardIconKey", "boardIconUrl"].includes(key))) {
    summaries.push({ id: "board-icon", kind: "board", label: "Changed board icon" });
  }
  if (settingKeys.includes("cardLabel")) {
    summaries.push({ id: "card-label", kind: "board", label: "Changed card label" });
  }
  if (
    settingKeys.some((key) =>
      [
        "boardLayout",
        "tierListCardAspectRatio",
        "tierListRowOverflow",
        "tierListExcludedColumnIds",
        "tierListAutoSeedExcludedColumnIds",
        "tierListView",
      ].includes(key),
    )
  ) {
    summaries.push({ id: "board-layout", kind: "board", label: "Updated board layout" });
  }
  if (
    settingKeys.some((key) =>
      [
        "showSeriesOnCards",
        "collapseCards",
        "showTierHighlights",
        "includeSeriesField",
        "includeReleaseYearField",
        "includeImageField",
        "includeNotesField",
        "fieldDefinitions",
        "restoreShowSeriesOnExpand",
        "restoreCollapseCardsOnBoard",
        "restoreTierHighlightsOnBoard",
      ].includes(key),
    )
  ) {
    summaries.push({ id: "card-display", kind: "board", label: "Updated card display settings" });
  }
  if (settingKeys.includes("publicShare") || before.isPublic !== after.isPublic || before.publicSlug !== after.publicSlug) {
    summaries.push({ id: "sharing", kind: "board", label: "Updated sharing settings" });
  }
  if (settingKeys.includes("pairwiseQuizProgressByColumn")) {
    summaries.push({ id: "ranking-quiz", kind: "board", label: "Updated ranking quiz progress" });
  }

  return summaries;
}

export async function loadBoardChangeHistory(
  supabase: SupabaseLike,
  userId: string,
  boardClientId: string,
  limit = BOARD_CHANGE_HISTORY_LIMIT,
): Promise<BoardChangeRecord[]> {
  const { data, error } = await supabase
    .from("board_snapshots")
    .select("id, snapshot, created_at")
    .eq("owner_id", userId)
    .eq("board_client_id", boardClientId)
    .order("created_at", { ascending: false })
    .limit(Math.max(limit + 1, BOARD_CHANGE_HISTORY_SCAN_LIMIT + 1));

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as SnapshotRow[];
  return rows
    .slice(0, -1)
    .flatMap((row, index) => {
      const before = rows[index + 1].snapshot;
      const summaries = describeBoardChange(before, row.snapshot);
      return summaries.length > 0
        ? [
            {
              id: row.id,
              createdAt: row.created_at,
              before,
              after: row.snapshot,
              summaries,
            },
          ]
        : [];
    })
    .slice(0, limit);
}

function insertAt<T>(items: T[], index: number, item: T) {
  items.splice(Math.max(0, Math.min(index, items.length)), 0, item);
}

export function undoBoardChange(
  current: SavedBoard,
  change: BoardChangeRecord,
): { board: SavedBoard; conflicts: number } {
  const next = JSON.parse(JSON.stringify(current)) as SavedBoard;
  const beforeCards = flattenCards(change.before);
  const afterCards = flattenCards(change.after);
  let conflicts = 0;

  if (next.title === change.after.title) {
    next.title = change.before.title;
  } else if (change.before.title !== change.after.title) {
    conflicts += 1;
  }
  if (sameValue(next.settings, change.after.settings)) {
    next.settings = change.before.settings;
  } else if (!sameValue(change.before.settings, change.after.settings)) {
    conflicts += 1;
  }

  const beforeColumns = new Map(change.before.columns.map((column) => [column.id, column]));
  const afterColumns = new Map(change.after.columns.map((column) => [column.id, column]));
  const nextColumns = new Map(next.columns.map((column) => [column.id, column]));

  for (const column of change.after.columns) {
    if (!beforeColumns.has(column.id)) {
      const currentColumn = nextColumns.get(column.id);
      if (currentColumn && sameValue(currentColumn, column)) {
        next.columns = next.columns.filter((candidate) => candidate.id !== column.id);
        delete next.cardsByColumn[column.id];
      } else if (currentColumn) {
        conflicts += 1;
      }
    }
  }
  for (const [index, column] of change.before.columns.entries()) {
    const afterColumn = afterColumns.get(column.id);
    const currentIndex = next.columns.findIndex((candidate) => candidate.id === column.id);
    if (!afterColumn && currentIndex === -1) {
      insertAt(next.columns, index, column);
      next.cardsByColumn[column.id] ??= [];
    } else if (afterColumn && !sameValue(column, afterColumn) && currentIndex >= 0) {
      if (sameValue(next.columns[currentIndex], afterColumn)) {
        next.columns[currentIndex] = column;
      } else {
        conflicts += 1;
      }
    }
  }

  const removeEntry = (entryId: string) => {
    for (const column of next.columns) {
      const cards = next.cardsByColumn[column.id] ?? [];
      const index = cards.findIndex((card) => card.entryId === entryId);
      if (index >= 0) {
        return { card: cards.splice(index, 1)[0], columnId: column.id, index };
      }
    }
    return null;
  };

  for (const [entryId, afterLocation] of afterCards) {
    if (!beforeCards.has(entryId)) {
      const currentLocation = flattenCards(next).get(entryId);
      if (currentLocation && sameValue(currentLocation.card, afterLocation.card)) {
        removeEntry(entryId);
      } else if (currentLocation) {
        conflicts += 1;
      }
    }
  }

  for (const [entryId, beforeLocation] of beforeCards) {
    const afterLocation = afterCards.get(entryId);
    const currentLocation = flattenCards(next).get(entryId);
    if (!afterLocation) {
      if (!currentLocation) {
        const target = next.cardsByColumn[beforeLocation.columnId] ?? [];
        next.cardsByColumn[beforeLocation.columnId] = target;
        insertAt(target, beforeLocation.index, beforeLocation.card);
      }
      continue;
    }
    if (!currentLocation) {
      conflicts += 1;
      continue;
    }
    if (!sameValue(beforeLocation.card, afterLocation.card)) {
      if (sameValue(currentLocation.card, afterLocation.card)) {
        currentLocation.card = beforeLocation.card;
        const cards = next.cardsByColumn[currentLocation.columnId];
        cards[currentLocation.index] = beforeLocation.card;
      } else {
        conflicts += 1;
      }
    }
    if (
      beforeLocation.columnId !== afterLocation.columnId ||
      beforeLocation.index !== afterLocation.index
    ) {
      const latestLocation = flattenCards(next).get(entryId);
      if (
        latestLocation &&
        latestLocation.columnId === afterLocation.columnId &&
        latestLocation.index === afterLocation.index
      ) {
        const removed = removeEntry(entryId);
        if (removed) {
          const target = next.cardsByColumn[beforeLocation.columnId] ?? [];
          next.cardsByColumn[beforeLocation.columnId] = target;
          insertAt(target, beforeLocation.index, removed.card);
        }
      } else if (latestLocation) {
        conflicts += 1;
      }
    }
  }

  next.updatedAt = new Date().toISOString();
  return { board: next, conflicts };
}
