import { SupabaseClient, User } from "@supabase/supabase-js";

import type {
  BoardSettings,
  CardEntry,
  ColumnDefinition,
  NormalizedBoardRow,
  NormalizedColumnRow,
  NormalizedEntryRow,
  NormalizedItemRow,
  PairwiseQuizProgress,
  PairwiseQuizProgressRow,
  SavedBoard,
} from "./types";

export const ARTWORK_BUCKET = "board-artwork";

type SupabaseLike = Pick<SupabaseClient, "from" | "storage">;

function columnMetadata(column: ColumnDefinition) {
  return {
    autoMirrorToColumnId: column.autoMirrorToColumnId ?? null,
    mirrorsEntireBoard: Boolean(column.mirrorsEntireBoard),
    excludedMirrorItemIds: column.excludedMirrorItemIds ?? [],
    excludeFromBoardMirrors: Boolean(column.excludeFromBoardMirrors),
    dontRank: Boolean(column.dontRank),
    sortMode: column.sortMode ?? "manual",
    confirmMirrorClones: Boolean(column.confirmMirrorClones),
  };
}

function extractColumnFromRow(row: NormalizedColumnRow): ColumnDefinition {
  const metadata = row.metadata ?? {};
  return {
    id: row.client_id,
    title: row.title,
    description: row.description ?? "",
    type: row.column_type,
    accent: row.accent ?? "",
    autoMirrorToColumnId:
      typeof metadata.autoMirrorToColumnId === "string" ? metadata.autoMirrorToColumnId : undefined,
    mirrorsEntireBoard: Boolean(metadata.mirrorsEntireBoard),
    excludedMirrorItemIds: Array.isArray(metadata.excludedMirrorItemIds)
      ? metadata.excludedMirrorItemIds.filter((value): value is string => typeof value === "string")
      : [],
    excludeFromBoardMirrors: Boolean(metadata.excludeFromBoardMirrors),
    dontRank: Boolean(metadata.dontRank),
    sortMode:
      metadata.sortMode === "title-asc" || metadata.sortMode === "title-desc"
        ? metadata.sortMode
        : "manual",
    confirmMirrorClones: Boolean(metadata.confirmMirrorClones),
  };
}

function extractCardFromRows(item: NormalizedItemRow, entry: NormalizedEntryRow): CardEntry {
  return {
    entryId: entry.client_id,
    itemId: item.client_id,
    title: item.title,
    imageUrl: item.image_url ?? "",
    imageStoragePath: item.image_storage_path ?? undefined,
    series: item.series ?? "",
    releaseYear: item.release_year ?? undefined,
    notes: item.notes ?? undefined,
    customFieldValues: item.custom_field_values ?? {},
    mirroredFromEntryId: entry.mirrored_from_client_id ?? undefined,
  };
}

export async function ensureNormalizedProfile(
  supabase: SupabaseLike,
  user: User,
) {
  const username = (user.user_metadata?.user_name as string | undefined)
    || (user.email?.split("@")[0] ?? null);
  await supabase.from("profiles").upsert(
    {
      id: user.id,
      username,
    },
    { onConflict: "id" },
  );
}

export async function loadNormalizedBoards(
  supabase: SupabaseLike,
  userId: string,
): Promise<SavedBoard[]> {
  const { data: boardRows, error: boardsError } = await supabase
    .from("boards")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });

  if (boardsError) {
    throw boardsError;
  }

  const normalizedBoardRows = (boardRows ?? []) as NormalizedBoardRow[];

  if (normalizedBoardRows.length === 0) {
    return [];
  }

  const boardIds = normalizedBoardRows.map((board) => board.id);
  const { data: columnRows, error: columnsError } = await supabase
    .from("columns")
    .select("*")
    .in("board_id", boardIds)
    .order("position", { ascending: true });

  if (columnsError) {
    throw columnsError;
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("items")
    .select("*")
    .in("board_id", boardIds)
    .order("created_at", { ascending: true });

  if (itemsError) {
    throw itemsError;
  }

  const normalizedColumnRows = (columnRows ?? []) as NormalizedColumnRow[];
  const normalizedItemRows = (itemRows ?? []) as NormalizedItemRow[];
  const columnIds = normalizedColumnRows.map((column) => column.id);

  const { data: entryRows, error: entriesError } = columnIds.length
    ? await supabase
        .from("column_entries")
        .select("*")
        .in("column_id", columnIds)
        .order("position", { ascending: true })
    : { data: [], error: null };

  if (entriesError) {
    throw entriesError;
  }

  const normalizedEntryRows = (entryRows ?? []) as NormalizedEntryRow[];
  const columnsByBoardId = new Map<string, NormalizedColumnRow[]>();
  const itemsByBoardId = new Map<string, NormalizedItemRow[]>();
  const entriesByColumnId = new Map<string, NormalizedEntryRow[]>();

  for (const row of normalizedColumnRows) {
    const current = columnsByBoardId.get(row.board_id) ?? [];
    current.push(row);
    columnsByBoardId.set(row.board_id, current);
  }

  for (const row of normalizedItemRows) {
    const current = itemsByBoardId.get(row.board_id) ?? [];
    current.push(row);
    itemsByBoardId.set(row.board_id, current);
  }

  for (const row of normalizedEntryRows) {
    const current = entriesByColumnId.get(row.column_id) ?? [];
    current.push(row);
    entriesByColumnId.set(row.column_id, current);
  }

  return normalizedBoardRows.map((boardRow) => {
    const boardColumns = (columnsByBoardId.get(boardRow.id) ?? []).sort((a, b) => a.position - b.position);
    const boardItems = itemsByBoardId.get(boardRow.id) ?? [];
    const itemsByDbId = new Map(boardItems.map((item) => [item.id, item]));
    const columns = boardColumns.map(extractColumnFromRow);
    const cardsByColumn = Object.fromEntries(
      boardColumns.map((columnRow) => [
        columnRow.client_id,
        (entriesByColumnId.get(columnRow.id) ?? [])
          .sort((a, b) => a.position - b.position)
          .map((entry) => {
            const item = itemsByDbId.get(entry.item_id);
            if (!item) {
              return null;
            }
            return extractCardFromRows(item, entry);
          })
          .filter(Boolean) as CardEntry[],
      ]),
    );

    return {
      id: boardRow.client_id,
      title: boardRow.title,
      settings: (boardRow.settings as BoardSettings | null) ?? {
        showSeriesOnCards: false,
        collapseCards: false,
        showTierHighlights: true,
        includeSeriesField: true,
        includeReleaseYearField: true,
        includeImageField: true,
        includeNotesField: true,
        fieldDefinitions: [],
      },
      columns,
      cardsByColumn,
      isPublic: Boolean(boardRow.is_public),
      publicSlug: boardRow.public_slug ?? null,
      lastPublishedAt: boardRow.last_published_at ?? null,
      createdAt: boardRow.created_at,
      updatedAt: boardRow.updated_at,
    };
  });
}

export async function syncNormalizedBoards(
  supabase: SupabaseLike,
  user: User,
  boards: SavedBoard[],
) {
  await ensureNormalizedProfile(supabase, user);

  const { data: existingBoardRows, error: existingBoardsError } = await supabase
    .from("boards")
    .select("id, client_id")
    .eq("owner_id", user.id);

  if (existingBoardsError) {
    throw existingBoardsError;
  }

  const existingBoards = (existingBoardRows ?? []) as Pick<NormalizedBoardRow, "id" | "client_id">[];
  const existingBoardIdByClientId = new Map(existingBoards.map((row) => [row.client_id, row.id]));

  const boardPayload = boards.map((board, index) => ({
    owner_id: user.id,
    client_id: board.id,
    slug: `${user.id}-${board.id}`.slice(0, 120),
    title: board.title,
    description: null,
    settings: board.settings,
    field_definitions: board.settings.fieldDefinitions ?? [],
    is_public: Boolean(board.isPublic),
    public_slug: board.publicSlug ?? null,
    last_published_at: board.lastPublishedAt ?? null,
    created_at: board.createdAt,
    updated_at: board.updatedAt,
    position: index,
  }));

  const { data: upsertedBoards, error: boardsUpsertError } = await supabase
    .from("boards")
    .upsert(boardPayload, { onConflict: "client_id" })
    .select("id, client_id");

  if (boardsUpsertError) {
    throw boardsUpsertError;
  }

  const boardRows = (upsertedBoards ?? []) as Pick<NormalizedBoardRow, "id" | "client_id">[];
  const boardIdByClientId = new Map(boardRows.map((row) => [row.client_id, row.id]));
  const removedBoardIds = existingBoards
    .filter((row) => !boards.some((board) => board.id === row.client_id))
    .map((row) => row.id);

  if (removedBoardIds.length > 0) {
    await supabase.from("boards").delete().in("id", removedBoardIds);
  }

  for (const board of boards) {
    const boardDbId = boardIdByClientId.get(board.id) ?? existingBoardIdByClientId.get(board.id);

    if (!boardDbId) {
      continue;
    }

    const { data: existingColumns, error: existingColumnsError } = await supabase
      .from("columns")
      .select("id, client_id")
      .eq("board_id", boardDbId);

    if (existingColumnsError) {
      throw existingColumnsError;
    }

    const existingColumnsRows = (existingColumns ?? []) as Pick<NormalizedColumnRow, "id" | "client_id">[];
    const columnPayload = board.columns.map((column, index) => ({
      board_id: boardDbId,
      client_id: column.id,
      slug: `${board.id}-${column.id}`.slice(0, 120),
      title: column.title,
      description: column.description,
      column_type: column.type,
      position: index,
      accent: column.accent,
      metadata: columnMetadata(column),
    }));

    const { data: upsertedColumns, error: columnsUpsertError } = await supabase
      .from("columns")
      .upsert(columnPayload, { onConflict: "board_id,client_id" })
      .select("id, client_id");

    if (columnsUpsertError) {
      throw columnsUpsertError;
    }

    const columnRows = (upsertedColumns ?? []) as Pick<NormalizedColumnRow, "id" | "client_id">[];
    const columnDbIdByClientId = new Map(columnRows.map((row) => [row.client_id, row.id]));
    const removedColumnIds = existingColumnsRows
      .filter((row) => !board.columns.some((column) => column.id === row.client_id))
      .map((row) => row.id);

    if (removedColumnIds.length > 0) {
      await supabase.from("columns").delete().in("id", removedColumnIds);
    }

    const uniqueItems = new Map<string, CardEntry>();
    Object.values(board.cardsByColumn).flat().forEach((card) => {
      if (!uniqueItems.has(card.itemId)) {
        uniqueItems.set(card.itemId, card);
      }
    });

    const { data: existingItems, error: existingItemsError } = await supabase
      .from("items")
      .select("id, client_id")
      .eq("board_id", boardDbId);

    if (existingItemsError) {
      throw existingItemsError;
    }

    const existingItemRows = (existingItems ?? []) as Pick<NormalizedItemRow, "id" | "client_id">[];
    const itemPayload = Array.from(uniqueItems.values()).map((card) => ({
      board_id: boardDbId,
      client_id: card.itemId,
      title: card.title,
      series: card.series || null,
      image_url: card.imageUrl || null,
      image_storage_path: card.imageStoragePath || null,
      release_year: card.releaseYear || null,
      notes: card.notes || null,
      custom_field_values: card.customFieldValues ?? {},
      metadata: {},
    }));

    const { data: upsertedItems, error: itemsUpsertError } = await supabase
      .from("items")
      .upsert(itemPayload, { onConflict: "board_id,client_id" })
      .select("id, client_id");

    if (itemsUpsertError) {
      throw itemsUpsertError;
    }

    const itemRows = (upsertedItems ?? []) as Pick<NormalizedItemRow, "id" | "client_id">[];
    const itemDbIdByClientId = new Map(itemRows.map((row) => [row.client_id, row.id]));
    const removedItemIds = existingItemRows
      .filter((row) => !uniqueItems.has(row.client_id))
      .map((row) => row.id);

    if (removedItemIds.length > 0) {
      await supabase.from("items").delete().in("id", removedItemIds);
    }

    const columnDbIds = Array.from(columnDbIdByClientId.values());
    const { data: existingEntries, error: existingEntriesError } = columnDbIds.length
      ? await supabase
          .from("column_entries")
          .select("id, client_id")
          .in("column_id", columnDbIds)
      : { data: [], error: null };

    if (existingEntriesError) {
      throw existingEntriesError;
    }

    const existingEntryRows = (existingEntries ?? []) as Pick<NormalizedEntryRow, "id" | "client_id">[];
    const entryPayload = board.columns.flatMap((column) => {
      const columnDbId = columnDbIdByClientId.get(column.id);
      if (!columnDbId) {
        return [];
      }
      return (board.cardsByColumn[column.id] ?? []).map((card, index) => ({
        column_id: columnDbId,
        item_id: itemDbIdByClientId.get(card.itemId),
        client_id: card.entryId,
        position: index,
        mirrored_from_client_id: card.mirroredFromEntryId ?? null,
        metadata: {},
      })).filter((entry) => Boolean(entry.item_id));
    });

    if (columnDbIds.length > 0) {
      const { error: deleteEntriesError } = await supabase
        .from("column_entries")
        .delete()
        .in("column_id", columnDbIds);

      if (deleteEntriesError) {
        throw deleteEntriesError;
      }
    }

    if (entryPayload.length > 0) {
      const { error: insertEntriesError } = await supabase
        .from("column_entries")
        .insert(entryPayload);

      if (insertEntriesError) {
        throw insertEntriesError;
      }
    }

    const currentEntryIds = new Set(entryPayload.map((entry) => entry.client_id));
    const removedEntryIds = existingEntryRows
      .filter((row) => !currentEntryIds.has(row.client_id))
      .map((row) => row.id);

    if (removedEntryIds.length > 0) {
      await supabase.from("column_entries").delete().in("id", removedEntryIds);
    }
  }
}

export async function loadPairwiseQuizProgress(
  supabase: SupabaseLike,
  userId: string,
  boardClientId: string,
  columnClientId: string,
): Promise<PairwiseQuizProgress | null> {
  const { data, error } = await supabase
    .from("pairwise_quiz_progress")
    .select("*")
    .eq("owner_id", userId)
    .eq("board_client_id", boardClientId)
    .eq("column_client_id", columnClientId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as PairwiseQuizProgressRow | null;
  return row?.progress ?? null;
}

export async function savePairwiseQuizProgress(
  supabase: SupabaseLike,
  userId: string,
  boardClientId: string,
  columnClientId: string,
  progress: PairwiseQuizProgress,
) {
  const { error } = await supabase.from("pairwise_quiz_progress").upsert(
    {
      owner_id: userId,
      board_client_id: boardClientId,
      column_client_id: columnClientId,
      progress,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,board_client_id,column_client_id" },
  );

  if (error) {
    throw error;
  }
}

export async function deletePairwiseQuizProgress(
  supabase: SupabaseLike,
  userId: string,
  boardClientId: string,
  columnClientId: string,
) {
  const { error } = await supabase
    .from("pairwise_quiz_progress")
    .delete()
    .eq("owner_id", userId)
    .eq("board_client_id", boardClientId)
    .eq("column_client_id", columnClientId);

  if (error) {
    throw error;
  }
}

export async function loadPublicBoardBySlug(
  supabase: SupabaseLike,
  publicSlug: string,
): Promise<SavedBoard | null> {
  const { data: boardRow, error: boardError } = await supabase
    .from("boards")
    .select("*")
    .eq("public_slug", publicSlug)
    .eq("is_public", true)
    .maybeSingle();

  if (boardError) {
    throw boardError;
  }

  if (!boardRow) {
    return null;
  }

  const publishedAt = (boardRow as NormalizedBoardRow).last_published_at;
  if (publishedAt) {
    const expiresAt = new Date(new Date(publishedAt).getTime() + 24 * 60 * 60 * 1000);
    if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return null;
    }
  }

  const boards = await loadNormalizedBoards(supabase, (boardRow as NormalizedBoardRow).owner_id);
  const board = boards.find((candidate) => candidate.id === (boardRow as NormalizedBoardRow).client_id) ?? null;

  if (!board) {
    return null;
  }

  const explicitExpiry = board.settings?.publicShare?.expiresAt;
  if (explicitExpiry) {
    const expiresAt = new Date(explicitExpiry);
    if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return null;
    }
  }

  return board;
}

export async function uploadArtworkToStorage(
  supabase: SupabaseLike,
  userId: string,
  file: File | Blob,
  filename: string,
) {
  const extension = filename.includes(".") ? filename.split(".").pop() : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(ARTWORK_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(ARTWORK_BUCKET).getPublicUrl(path);
  return {
    path,
    publicUrl: data.publicUrl,
  };
}
