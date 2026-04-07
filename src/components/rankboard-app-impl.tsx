"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AutoScrollActivator,
  DndContext,
  DragOverlay,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  defaultAnimateLayoutChanges,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { User } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  BookOpen,
  Check,
  CheckCheck,
  CircleDashed,
  Clapperboard,
  Edit3,
  Filter,
  Gamepad2,
  Heart,
  ListOrdered,
  LoaderCircle,
  MoveVertical,
  LogOut,
  MoreHorizontal,
  Moon,
  Music4,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Share2,
  Sparkles,
  Sun,
  Trash2,
  Tv,
  Upload,
  WandSparkles,
  Wrench,
  X,
  Link2,
} from "lucide-react";
import {
  FieldDefinitionManager,
  MenuSectionButton,
  ToggleSwitch,
} from "@/components/rankboard-fields";
import { AddCardDialog, BoardSetupDialog, EditCardDialog, SeriesInput, ShareBoardDialog } from "@/components/rankboard-dialogs";
import { parseTrelloBoardExport } from "@/lib/trello-import";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { optimizeImageFile } from "@/lib/image-processing";
import {
  compareTitlesForDisplay,
  getDisplayCardText,
  getSeriesFilterDisplayLabel,
  getTierKey,
  matchesTierFilter,
  normalizeTitleForComparison,
} from "@/lib/rankboard-display";
import {
  AddCardTarget,
  ArtworkPickerState,
  ArtworkSearchMode,
  BoardBackupSnapshot,
  CardDraft,
  CardEditorDraft,
  ColumnEditorDraft,
  DuplicateCleanupSuggestion,
  MobileAddCardTarget,
  MoveAllCardsState,
  MoveCardState,
  PairwiseQuizReview,
  PairwiseQuizState,
  PendingColumnDelete,
  PendingDuplicateAction,
  PendingMirrorDelete,
  PendingMirrorLinkSuggestion,
  PendingPairwiseQuizResume,
  RankBadge,
  SeriesScrapeSuggestion,
  ShareDraft,
  TierFilter,
  TierListConversionState,
  TierRowOptionsState,
  TitleTidySuggestion,
} from "@/lib/rankboard-app-types";
import {
  getLastActiveBoardStorageKey,
  getPairwiseQuizProgressStorageKey,
  getUserBoardCacheKey,
  LOCAL_BACKUP_STORAGE_KEY,
  LOCAL_STORAGE_KEY,
  readStoredPreferredBoardId,
  SHARED_BOARD_TEMPLATE_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from "@/lib/rankboard-storage";
import {
  deletePairwiseQuizProgress,
  ensureNormalizedProfile,
  loadPairwiseQuizProgress,
  loadNormalizedBoards,
  savePairwiseQuizProgress as savePairwiseQuizProgressRemote,
  syncNormalizedBoards,
  uploadArtworkToStorage,
} from "@/lib/normalized-board-store";
import { BoardFieldDefinition, BoardLayout, BoardSettings, BoardSnapshot, CardEntry, CardFieldType, ColumnSortMode, ColumnDefinition, DateFieldFormat, PairwiseQuizProgress, SaveState, SavedBoard } from "@/lib/types";

const initialDraft: CardDraft = {
  title: "",
  imageUrl: "",
  imageStoragePath: undefined,
  series: "",
  releaseYear: "",
  notes: "",
  customFields: {},
  columnId: "",
  newColumnTitle: "",
};

const NEW_COLUMN_OPTION = "__new_column__";
const DEFAULT_DATE_FIELD_FORMAT: DateFieldFormat = "mm/dd/yyyy";
const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  cardLabel: "",
  boardIconKey: "",
  boardIconUrl: "",
  boardLayout: "board",
  publicShare: {
    columnIds: [],
    tierFilter: "all",
    seriesFilter: "",
    searchTerm: "",
    expiresAt: null,
  },
  pairwiseQuizProgressByColumn: {},
  showSeriesOnCards: false,
  collapseCards: false,
  showTierHighlights: true,
  includeSeriesField: true,
  includeReleaseYearField: true,
  includeImageField: true,
  includeNotesField: true,
  fieldDefinitions: [],
  restoreShowSeriesOnExpand: false,
};

function createStarterBoardSnapshot(): BoardSnapshot {
  const starterColumnId = makeId("column");
  const starterColumn: ColumnDefinition = {
    id: starterColumnId,
    title: "New Column",
    description: "",
    type: "ranked",
    accent: COLUMN_ACCENTS[0] ?? "from-amber-300 via-orange-400 to-rose-500",
  };

  return {
    columns: [starterColumn],
    cardsByColumn: {
      [starterColumnId]: [],
    },
  };
}

function createTierListBoardSnapshot(): BoardSnapshot {
  const rows = [
    { title: "S", accent: "from-amber-300 via-yellow-400 to-orange-500" },
    { title: "A", accent: "from-rose-300 via-pink-400 to-fuchsia-500" },
    { title: "B", accent: "from-cyan-300 via-sky-400 to-blue-500" },
    { title: "C", accent: "from-emerald-300 via-green-400 to-teal-500" },
    { title: "D", accent: "from-violet-300 via-indigo-400 to-purple-500" },
    { title: "Pool", accent: "from-slate-300 via-slate-400 to-slate-500" },
  ].map((row) => ({
    id: makeId("column"),
    title: row.title,
    description: "",
    type: "ranked" as const,
    accent: row.accent,
    dontRank: true,
    sortMode: "manual" as const,
  }));

  return {
    columns: rows,
    cardsByColumn: Object.fromEntries(rows.map((row) => [row.id, []])),
  };
}

function getTierListUnsortedColumnId(columns: ColumnDefinition[]) {
  return (
    columns.find((column) => ["unsorted", "pool"].includes(column.title.trim().toLowerCase()))?.id ??
    columns[columns.length - 1]?.id ??
    ""
  );
}

function getTierListRankedCards(columns: ColumnDefinition[], cardsByColumn: Record<string, CardEntry[]>) {
  const unsortedColumnId = getTierListUnsortedColumnId(columns);
  const rankedCards: CardEntry[] = [];

  for (const column of columns) {
    if (column.id === unsortedColumnId) {
      continue;
    }
    rankedCards.push(...(cardsByColumn[column.id] ?? []));
  }

  return {
    rankedCards,
    unsortedCards: unsortedColumnId ? (cardsByColumn[unsortedColumnId] ?? []) : [],
    unsortedColumnId,
  };
}

function createEmptyBoard(title = "New Board", _layout: BoardLayout = "board"): SavedBoard {
  void _layout;
  const timestamp = new Date().toISOString();
  const starterSnapshot = createStarterBoardSnapshot();

  return {
    id: makeId("board"),
    title,
    settings: getDefaultBoardSettings(title, "board"),
    columns: starterSnapshot.columns,
    cardsByColumn: starterSnapshot.cardsByColumn,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const COLUMN_ACCENTS = [
  "from-amber-300 via-orange-400 to-rose-500",
  "from-sky-300 via-cyan-400 to-teal-500",
  "from-fuchsia-300 via-pink-400 to-rose-500",
  "from-violet-300 via-indigo-400 to-blue-500",
  "from-lime-300 via-emerald-400 to-teal-500",
  "from-red-300 via-orange-400 to-amber-500",
];

function makeFieldId(prefix = "field") {
  return `${prefix}-${crypto.randomUUID()}`;
}

function singularizeCardLabel(label: string) {
  const trimmed = label.trim();

  if (!trimmed) {
    return "";
  }

  if (/ies$/i.test(trimmed) && trimmed.length > 3) {
    return `${trimmed.slice(0, -3)}y`;
  }

  if (/s$/i.test(trimmed) && !/ss$/i.test(trimmed) && trimmed.length > 1) {
    return trimmed.slice(0, -1);
  }

  return trimmed;
}

function deriveDefaultCardLabel(boardTitle: string) {
  const cleanedTitle = boardTitle.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const vocabularyFallback = getBoardVocabulary(boardTitle).singular;

  if (!cleanedTitle || /^new board$/i.test(cleanedTitle)) {
    return vocabularyFallback;
  }

  const words = cleanedTitle.split(" ");
  const lastWord = words.at(-1) ?? cleanedTitle;
  const normalizedLastWord = lastWord.toLowerCase();
  const pluralKinds = new Set([
    "albums",
    "animes",
    "books",
    "cards",
    "characters",
    "films",
    "games",
    "manga",
    "movies",
    "shows",
    "songs",
    "waifus",
  ]);

  if (words.length === 1 || pluralKinds.has(normalizedLastWord)) {
    return singularizeCardLabel(lastWord);
  }

  return vocabularyFallback;
}

function getDefaultFieldDefinitions(boardTitle: string): BoardFieldDefinition[] {
  const boardKind = getBoardKind(boardTitle);

  return [
    {
      id: "series",
      label: boardKind === "show" ? "Franchise" : "Series",
      type: "short_text",
      visible: true,
      showOnCardFront: false,
      builtInKey: "series",
    },
    {
      id: "release-year",
      label: "Release Year",
      type: "date",
      visible: false,
      showOnCardFront: false,
      showLabelOnCardFront: true,
      dateFormat: "yyyy",
      builtInKey: "releaseYear",
    },
    {
      id: "artwork",
      label: "Artwork",
      type: "short_text",
      visible: true,
      showOnCardFront: true,
      builtInKey: "imageUrl",
    },
    {
      id: "notes",
      label: "Notes",
      type: "long_text",
      visible: false,
      showOnCardFront: false,
      builtInKey: "notes",
    },
  ];
}

function normalizeFieldDefinitions(
  fieldDefinitions: BoardFieldDefinition[] | undefined,
  boardTitle: string,
  legacySettings?: Partial<BoardSettings>,
) {
  const defaults = getDefaultFieldDefinitions(boardTitle);

  if (!fieldDefinitions || fieldDefinitions.length === 0) {
    return defaults.map((field) => ({
      ...field,
      visible:
        field.builtInKey === "series"
          ? legacySettings?.includeSeriesField ?? field.visible
          : field.builtInKey === "releaseYear"
            ? legacySettings?.includeReleaseYearField ?? field.visible
            : field.builtInKey === "imageUrl"
              ? legacySettings?.includeImageField ?? field.visible
              : field.builtInKey === "notes"
                ? legacySettings?.includeNotesField ?? field.visible
                : field.visible,
    }));
  }

  return fieldDefinitions.map((field) => ({
    ...field,
    showOnCardFront:
      field.builtInKey === "imageUrl"
        ? field.showOnCardFront ?? true
        : field.showOnCardFront ?? false,
    showLabelOnCardFront: field.showLabelOnCardFront ?? true,
    options: field.type === "select" ? field.options ?? [] : undefined,
    dateFormat:
      field.type === "date"
        ? field.dateFormat ?? DEFAULT_DATE_FIELD_FORMAT
        : undefined,
  }));
}

function normalizePublicShareSettings(settings?: Partial<BoardSettings>["publicShare"]): NonNullable<BoardSettings["publicShare"]> {
  return {
    columnIds: settings?.columnIds ?? [],
    tierFilter: settings?.tierFilter ?? "all",
    seriesFilter: settings?.seriesFilter ?? "",
    searchTerm: settings?.searchTerm ?? "",
    title: settings?.title ?? "",
    expiresAt: settings?.expiresAt ?? null,
  };
}

function formatDateFieldValue(value: string, format: DateFieldFormat) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  const isoDateMatch = trimmedValue.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);

  if (!isoDateMatch) {
    return trimmedValue;
  }

  const [, year, month, day] = isoDateMatch;

  if (format === "yyyy" || !month || !day) {
    return year;
  }

  if (format === "dd/mm/yyyy") {
    return `${day}/${month}/${year}`;
  }

  return `${month}/${day}/${year}`;
}

function normalizeDateFieldInput(value: string, format: DateFieldFormat) {
  if (format === "yyyy") {
    return value.replace(/[^\d]/g, "").slice(0, 4);
  }

  const digits = value.replace(/[^\d]/g, "").slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function isRankedColumn(column: ColumnDefinition) {
  return column.type === "ranked" && !column.dontRank && (column.sortMode ?? "manual") === "manual";
}

function getColumnSortMode(column: ColumnDefinition): ColumnSortMode {
  return column.sortMode ?? "manual";
}

function getFocusedColumnIdFromLane(lane: HTMLDivElement | null) {
  if (!lane) {
    return null;
  }

  const laneRect = lane.getBoundingClientRect();
  const laneCenter = laneRect.left + laneRect.width / 2;
  const columnElements = Array.from(lane.querySelectorAll<HTMLElement>("[data-column-id]"));

  if (columnElements.length === 0) {
    return null;
  }

  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const element of columnElements) {
    const rect = element.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const distance = Math.abs(center - laneCenter);
    const columnId = element.dataset.columnId;

    if (columnId && distance < bestDistance) {
      bestDistance = distance;
      bestId = columnId;
    }
  }

  return bestId;
}

function isColumnAutoSorted(column: ColumnDefinition) {
  return getColumnSortMode(column) !== "manual";
}

function sortCardsForColumn(cards: CardEntry[], column: ColumnDefinition) {
  const sortMode = getColumnSortMode(column);

  if (sortMode === "title-asc") {
    return [...cards].sort((left, right) => left.title.localeCompare(right.title));
  }

  if (sortMode === "title-desc") {
    return [...cards].sort((left, right) => right.title.localeCompare(left.title));
  }

  return cards;
}

function filterCards(
  cards: CardEntry[],
  searchTerm: string,
  seriesFilter: string,
) {
  return cards.filter((card) => {
    const haystack = `${card.title} ${card.series}`.toLowerCase();
    const matchesSearch =
      searchTerm.length === 0 || haystack.includes(searchTerm.toLowerCase());
    const matchesSeries =
      seriesFilter.length === 0 || card.series === seriesFilter;

    return matchesSearch && matchesSeries;
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildFallbackImage(title: string) {
  const safeTitle = title.trim() || "Untitled Game";
  const palette = [
    ["#fdba74", "#fb7185"],
    ["#67e8f9", "#34d399"],
    ["#a78bfa", "#60a5fa"],
    ["#f9a8d4", "#f97316"],
  ];
  const seed = safeTitle
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);
  const [start, end] = palette[seed % palette.length];
  const initials = safeTitle
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${start}" />
          <stop offset="100%" stop-color="${end}" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bg)" />
      <circle cx="1260" cy="160" r="240" fill="rgba(255,255,255,0.15)" />
      <circle cx="260" cy="760" r="290" fill="rgba(255,255,255,0.12)" />
      <text x="110" y="610" fill="white" font-family="Arial, sans-serif" font-size="220" font-weight="700">${initials || "RG"}</text>
      <text x="110" y="735" fill="rgba(255,255,255,0.92)" font-family="Arial, sans-serif" font-size="64" font-weight="600">${safeTitle.replace(/&/g, "&amp;")}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getSeriesScrapeScopedColumns(
  columns: ColumnDefinition[],
  scopeColumnId?: string,
) {
  if (scopeColumnId) {
    return columns.filter((column) => column.id === scopeColumnId);
  }

  return columns.filter((column) => !column.mirrorsEntireBoard);
}

function MaintenanceCardPreview({
  title,
  imageUrl,
  subtitle,
  isDarkMode,
}: {
  title: string;
  imageUrl?: string;
  subtitle?: string;
  isDarkMode: boolean;
}) {
  return (
    <div
      className={clsx(
        "relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-[24px] border shadow-[0_16px_38px_rgba(15,23,42,0.2)] sm:w-[240px]",
        isDarkMode ? "border-white/10 bg-slate-950" : "border-slate-200 bg-slate-100",
      )}
      style={{
        backgroundImage: `linear-gradient(to top, rgba(2,6,23,0.92), rgba(2,6,23,0.15)), url(${imageUrl || buildFallbackImage(title)})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="absolute inset-x-0 bottom-0 p-4">
        {subtitle ? (
          <p className="line-clamp-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
            {subtitle}
          </p>
        ) : null}
        <p className="mt-1 line-clamp-2 text-lg font-black leading-tight text-white">{title}</p>
      </div>
    </div>
  );
}

function trimBackupSnapshots(snapshots: BoardBackupSnapshot[]) {
  return snapshots
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .slice(0, 10);
}

function buildBackupSnapshot(
  boards: SavedBoard[],
  activeBoardId: string,
  savedAt = new Date().toISOString(),
): BoardBackupSnapshot {
  return {
    savedAt,
    activeBoardId,
    boards: boards.map((board) => normalizeSavedBoard(board)),
  };
}

function mergeBoardsWithActiveSnapshot(
  boards: SavedBoard[],
  activeBoardId: string,
  columns: ColumnDefinition[],
  cardsByColumn: Record<string, CardEntry[]>,
) {
  return boards.map((board) =>
    board.id === activeBoardId
      ? {
          ...board,
          columns,
          cardsByColumn,
          updatedAt: new Date().toISOString(),
        }
      : board,
  );
}

function readBoardsFromBackupRow(data: {
  columns?: unknown;
  cards_by_column?: unknown;
  updated_at?: string | null;
}) {
  const columnsPayload = data.columns as
    | ColumnDefinition[]
    | { version?: number; boards?: SavedBoard[]; activeBoardId?: string; recentSnapshots?: BoardBackupSnapshot[] }
    | undefined;
  const remoteBoardsPayload =
    columnsPayload &&
    !Array.isArray(columnsPayload) &&
    (columnsPayload.version === 2 || columnsPayload.version === 3) &&
    Array.isArray(columnsPayload.boards) &&
    columnsPayload.boards.length > 0
      ? columnsPayload
      : null;

  if (remoteBoardsPayload) {
    const boards = remoteBoardsPayload.boards ?? [];
    return {
      boards: boards.map((board) => normalizeSavedBoard(board)),
      activeBoardId: remoteBoardsPayload.activeBoardId ?? boards[0]?.id ?? null,
      recentSnapshots: Array.isArray(remoteBoardsPayload.recentSnapshots)
        ? trimBackupSnapshots(remoteBoardsPayload.recentSnapshots)
        : [],
      updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
    };
  }

  const legacyColumns = Array.isArray(columnsPayload) ? columnsPayload : null;
  const legacyCards = (data.cards_by_column as Record<string, CardEntry[]> | undefined) ?? null;

  if (legacyColumns && legacyCards) {
    const migratedBoard: SavedBoard = {
      ...createEmptyBoard("Rankr"),
      columns: legacyColumns,
      cardsByColumn: legacyCards,
      updatedAt: typeof data.updated_at === "string" ? data.updated_at : new Date().toISOString(),
    };

    return {
      boards: [migratedBoard],
      activeBoardId: migratedBoard.id,
      recentSnapshots: [],
      updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
    };
  }

  return null;
}

function openGoogleImageSearch(title: string, mode: ArtworkSearchMode = "image") {
  const query = title.trim();

  if (!query || typeof window === "undefined") {
    return;
  }

  if (mode === "gif") {
    const url = new URL(`https://tenor.com/search/${encodeURIComponent(query)}-gifs`);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
    return;
  }

  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", `${query} -site:fandom.com`);
  url.searchParams.set("tbm", "isch");

  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function createCardDraft(card: CardEntry): CardEditorDraft {
  return {
    title: card.title,
    imageUrl: card.imageUrl,
    imageStoragePath: card.imageStoragePath,
    series: card.series,
    releaseYear: card.releaseYear ?? "",
    notes: card.notes ?? "",
    customFields: { ...(card.customFieldValues ?? {}) },
  };
}

function makeInsertDropId(columnId: string, insertIndex: number) {
  return `insert::${columnId}::${insertIndex}`;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Image could not be read."));
    reader.readAsDataURL(blob);
  });
}

function parseDropTargetId(overId: string) {
  if (!overId.startsWith("insert::")) {
    return null;
  }

  const [, columnId, insertIndex] = overId.split("::");
  const parsedIndex = Number(insertIndex);

  if (!columnId || Number.isNaN(parsedIndex)) {
    return null;
  }

  return {
    columnId,
    insertIndex: parsedIndex,
  };
}

function isStarterBoard(
  boardColumns: ColumnDefinition[],
  boardCardsByColumn: Record<string, CardEntry[]>,
) {
  if (boardColumns.length !== 1) {
    return false;
  }

  if (boardColumns[0]?.title !== "New Column") {
    return false;
  }

  if ((boardCardsByColumn[boardColumns[0]?.id ?? ""] ?? []).length !== 0) {
    return false;
  }

  return Object.values(boardCardsByColumn).every((cards) => cards.length === 0);
}

function isEphemeralStarterBoard(board: SavedBoard) {
  return board.title === "Rankr" && isStarterBoard(board.columns, board.cardsByColumn);
}

function normalizeSavedBoard(board: SavedBoard | (Omit<SavedBoard, "settings"> & { settings?: Partial<BoardSettings> })) {
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      dontRank: column.dontRank ?? false,
      sortMode: column.sortMode ?? "manual",
      excludedMirrorItemIds: column.excludedMirrorItemIds ?? [],
      excludeFromBoardMirrors: column.excludeFromBoardMirrors ?? false,
      confirmMirrorClones: column.confirmMirrorClones ?? false,
    })),
    settings: {
      ...getDefaultBoardSettings(board.title),
      ...board.settings,
      boardLayout: "board",
      publicShare: normalizePublicShareSettings(board.settings?.publicShare),
      fieldDefinitions: normalizeFieldDefinitions(board.settings?.fieldDefinitions, board.title, {
        ...board.settings,
        boardLayout: "board",
      }),
    },
    cardsByColumn: Object.fromEntries(
      Object.entries(board.cardsByColumn).map(([columnId, cards]) => [
        columnId,
        cards.map((card) => ({
          ...card,
          customFieldValues: card.customFieldValues ?? {},
        })),
      ]),
    ),
    isPublic: board.isPublic ?? false,
    publicSlug: board.publicSlug ?? null,
    lastPublishedAt: board.lastPublishedAt ?? null,
  } satisfies SavedBoard;
}

function cloneBoardFromTemplate(board: SavedBoard): SavedBoard {
  const clonedAt = new Date().toISOString();
  const nextBoardId = makeId("board");
  const columnIdMap = new Map<string, string>();
  const itemIdMap = new Map<string, string>();
  const entryIdMap = new Map<string, string>();

  for (const column of board.columns) {
    columnIdMap.set(column.id, makeId("column"));
  }

  for (const cards of Object.values(board.cardsByColumn)) {
    for (const card of cards) {
      if (!itemIdMap.has(card.itemId)) {
        itemIdMap.set(card.itemId, makeId("item"));
      }
      if (!entryIdMap.has(card.entryId)) {
        entryIdMap.set(card.entryId, makeId("entry"));
      }
    }
  }

  const nextColumns = board.columns.map((column) => ({
    ...column,
    id: columnIdMap.get(column.id) ?? makeId("column"),
    autoMirrorToColumnId: column.autoMirrorToColumnId ? columnIdMap.get(column.autoMirrorToColumnId) : undefined,
    excludedMirrorItemIds: (column.excludedMirrorItemIds ?? [])
      .map((itemId) => itemIdMap.get(itemId))
      .filter((itemId): itemId is string => Boolean(itemId)),
  }));

  const nextCardsByColumn = Object.fromEntries(
    Object.entries(board.cardsByColumn).map(([columnId, cards]) => [
      columnIdMap.get(columnId) ?? makeId("column"),
      cards.map((card) => ({
        ...card,
        entryId: entryIdMap.get(card.entryId) ?? makeId("entry"),
        itemId: itemIdMap.get(card.itemId) ?? makeId("item"),
        mirroredFromEntryId: card.mirroredFromEntryId
          ? entryIdMap.get(card.mirroredFromEntryId) ?? undefined
          : undefined,
      })),
    ]),
  ) as Record<string, CardEntry[]>;

  return normalizeSavedBoard({
    ...board,
    id: nextBoardId,
    title: `${board.title} Copy`,
    settings: {
      ...board.settings,
      publicShare: {
        columnIds: [],
        tierFilter: "all",
        seriesFilter: "",
        searchTerm: "",
        expiresAt: null,
      },
    },
    columns: nextColumns,
    cardsByColumn: nextCardsByColumn,
    isPublic: false,
    publicSlug: null,
    lastPublishedAt: null,
    createdAt: clonedAt,
    updatedAt: clonedAt,
  });
}

function countCardsInBoard(board: SavedBoard) {
  return Object.values(board.cardsByColumn).reduce(
    (columnTotal, cards) => columnTotal + cards.length,
    0,
  );
}

function getLatestBoardTimestamp(boards: SavedBoard[]) {
  return boards.reduce<string | null>((latest, board) => {
    if (!board.updatedAt) {
      return latest;
    }

    if (!latest || board.updatedAt > latest) {
      return board.updatedAt;
    }

    return latest;
  }, null);
}

function choosePreferredBoards(
  normalizedBoards: SavedBoard[],
  backupBoards: SavedBoard[],
) {
  if (normalizedBoards.length === 0) {
    return backupBoards;
  }

  if (backupBoards.length === 0) {
    return normalizedBoards;
  }

  const normalizedById = new Map(normalizedBoards.map((board) => [board.id, board]));
  const backupById = new Map(backupBoards.map((board) => [board.id, board]));
  const orderedIds = [
    ...backupBoards.map((board) => board.id),
    ...normalizedBoards.map((board) => board.id).filter((id) => !backupById.has(id)),
  ];

  return orderedIds.map((boardId) => {
    const normalizedBoard = normalizedById.get(boardId);
    const backupBoard = backupById.get(boardId);

    if (!normalizedBoard) {
      return backupBoard!;
    }

    if (!backupBoard) {
      return normalizedBoard;
    }

    const normalizedCardCount = countCardsInBoard(normalizedBoard);
    const backupCardCount = countCardsInBoard(backupBoard);
    const normalizedColumnCount = normalizedBoard.columns.length;
    const backupColumnCount = backupBoard.columns.length;

    if (backupCardCount > normalizedCardCount) {
      return backupBoard;
    }

    if (backupCardCount < normalizedCardCount) {
      return normalizedBoard;
    }

    if (backupColumnCount > normalizedColumnCount) {
      return backupBoard;
    }

    if (backupColumnCount < normalizedColumnCount) {
      return normalizedBoard;
    }

    if (backupBoard.updatedAt && (!normalizedBoard.updatedAt || backupBoard.updatedAt > normalizedBoard.updatedAt)) {
      return backupBoard;
    }

    return normalizedBoard;
  });
}

function chooseSessionPreferredBoards(
  remoteBoards: SavedBoard[],
  localBoards: SavedBoard[],
) {
  if (localBoards.length === 0) {
    return remoteBoards;
  }

  if (remoteBoards.length === 0) {
    return localBoards;
  }

  const hasRealRemoteBoards = remoteBoards.some((board) => !isEphemeralStarterBoard(board));
  const sanitizedLocalBoards =
    hasRealRemoteBoards
      ? localBoards.filter((board) => !isEphemeralStarterBoard(board))
      : localBoards;

  if (sanitizedLocalBoards.length === 0) {
    return remoteBoards;
  }

  const remoteById = new Map(remoteBoards.map((board) => [board.id, board]));
  const localById = new Map(sanitizedLocalBoards.map((board) => [board.id, board]));
  const orderedIds = [
    ...sanitizedLocalBoards.map((board) => board.id),
    ...remoteBoards.map((board) => board.id).filter((id) => !localById.has(id)),
  ];

  return orderedIds.map((boardId) => {
    const remoteBoard = remoteById.get(boardId);
    const localBoard = localById.get(boardId);

    if (!remoteBoard) {
      return localBoard!;
    }

    if (!localBoard) {
      return remoteBoard;
    }

    return choosePreferredBoards([remoteBoard], [localBoard])[0] ?? remoteBoard;
  });
}

function getBoardKind(boardTitle: string) {
  const normalizedTitle = boardTitle.toLowerCase();

  if (
    normalizedTitle.includes("waifu") ||
    normalizedTitle.includes("husbando") ||
    normalizedTitle.includes("character")
  ) {
    return "character";
  }

  if (normalizedTitle.includes("movie") || normalizedTitle.includes("film")) {
    return "movie";
  }

  if (normalizedTitle.includes("show") || normalizedTitle.includes("tv")) {
    return "show";
  }

  if (normalizedTitle.includes("anime")) {
    return "anime";
  }

  return "game";
}

type BoardIconKey = "character" | "movie" | "show" | "anime" | "game" | "music" | "book";
const BOARD_ICON_OPTIONS: BoardIconKey[] = ["game", "movie", "show", "anime", "music", "book", "character"];

function getBoardIconCandidates(boardTitle: string): BoardIconKey[] {
  const normalizedTitle = boardTitle.toLowerCase();

  if (normalizedTitle.includes("music") || normalizedTitle.includes("album") || normalizedTitle.includes("song")) {
    return ["music", "movie", "show", "anime", "book", "character", "game"];
  }

  if (normalizedTitle.includes("manga") || normalizedTitle.includes("book") || normalizedTitle.includes("novel")) {
    return ["book", "anime", "movie", "show", "music", "character", "game"];
  }

  if (normalizedTitle.includes("media")) {
    return ["movie", "show", "anime", "music", "book", "character", "game"];
  }

  switch (getBoardKind(boardTitle)) {
    case "character":
      return ["character", "movie", "show", "anime", "music", "book", "game"];
    case "movie":
      return ["movie", "show", "anime", "music", "book", "character", "game"];
    case "show":
      return ["show", "movie", "anime", "music", "book", "character", "game"];
    case "anime":
      return ["anime", "show", "movie", "book", "music", "character", "game"];
    default:
      return ["game", "movie", "show", "anime", "music", "book", "character"];
  }
}

function resolveBoardIconKey(boardTitle: string, usedIcons?: Set<BoardIconKey>) {
  const candidates = getBoardIconCandidates(boardTitle);
  if (!usedIcons || usedIcons.size === 0) {
    return candidates[0] ?? "game";
  }
  return candidates.find((icon) => !usedIcons.has(icon)) ?? candidates[0] ?? "game";
}

function renderBoardKindIcon(iconKey: BoardIconKey, className?: string) {
  switch (iconKey) {
    case "character":
      return <Heart className={className} />;
    case "movie":
      return <Clapperboard className={className} />;
    case "show":
      return <Tv className={className} />;
    case "anime":
      return <Sparkles className={className} />;
    case "music":
      return <Music4 className={className} />;
    case "book":
      return <BookOpen className={className} />;
    default:
      return <Gamepad2 className={className} />;
  }
}

function renderBoardIcon(iconKey: BoardIconKey, iconUrl: string | undefined, className?: string) {
  if (iconUrl?.trim()) {
    return <img alt="" className={clsx("object-contain", className)} src={iconUrl} />;
  }

  return renderBoardKindIcon(iconKey, className);
}


function getCardContentScore(card: CardEntry) {
  let score = 0;

  if (card.imageUrl.trim()) {
    score += 3;
  }

  if (card.series.trim()) {
    score += 2;
  }

  if ((card.notes ?? "").trim()) {
    score += 2;
  }

  if (card.mirroredFromEntryId) {
    score -= 2;
  }

  score += Math.min(card.title.trim().length / 50, 1);

  return score;
}

function getSuggestedTitleCleanup(title: string) {
  const trimmed = title.trim();

  if (!trimmed) {
    return null;
  }

  const cleaned = trimmed
    .replace(/^\s*\d+\s*[\.\)\-:]\s*/, "")
    .replace(/\s+([:!?,])/g, "$1")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned || cleaned === trimmed) {
    return null;
  }

  return cleaned;
}

function stripSequelMarkers(title: string) {
  return title
    .replace(/\s+\((?:19|20)\d{2}\)\s*$/i, "")
    .replace(/\s+(?:part|episode|season|vol(?:ume)?)\s+(?:\d+|[ivxlcdm]+)\b/gi, "")
    .replace(/\s+(?:\d+|[ivxlcdm]+)\b\s*$/i, "")
    .trim();
}

function getSuggestedSeriesFromTitle(title: string, existingSeries: string[] = []) {
  const trimmed = title.trim();

  if (!trimmed) {
    return null;
  }

  const beforeColon = stripSequelMarkers(trimmed.split(":")[0]?.trim() ?? "");
  const subtitleBreak = stripSequelMarkers(trimmed.match(/^(.*?)\s+-\s+/)?.[1] ?? "");
  const strippedWhole = stripSequelMarkers(trimmed);
  const candidates = [beforeColon, subtitleBreak, strippedWhole]
    .map((value) => value.trim())
    .filter((value, index, array) => value.length > 1 && array.indexOf(value) === index);

  const normalizedExistingSeries = existingSeries
    .map((series) => ({
      original: series,
      normalized: normalizeTitleForComparison(stripSequelMarkers(series)),
    }))
    .filter((series) => series.normalized.length > 0)
    .sort((left, right) => right.normalized.length - left.normalized.length);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeTitleForComparison(candidate);
    const firstToken = normalizedCandidate.split(" ")[0] ?? "";
    const matchingSeries = normalizedExistingSeries.find(
      (series) =>
        series.normalized === normalizedCandidate ||
        normalizedCandidate.startsWith(series.normalized) ||
        series.normalized.startsWith(normalizedCandidate) ||
        (firstToken.length > 2 && series.normalized.startsWith(`${firstToken} `)),
    );

    if (matchingSeries) {
      return matchingSeries.original;
    }
  }

  return candidates[0] ?? null;
}

function getBoardVocabulary(boardTitle: string) {
  const normalizedTitle = boardTitle.toLowerCase();

  if (
    normalizedTitle.includes("waifu") ||
    normalizedTitle.includes("husbando") ||
    normalizedTitle.includes("character")
  ) {
    return {
      singular: "Character",
      titleExamples: '"Makima", "2B", "Rin Tohsaka", etc.',
      seriesExamples: '"Chainsaw Man", "NieR", "Fate", etc.',
    };
  }

  if (normalizedTitle.includes("movie") || normalizedTitle.includes("film")) {
    return {
      singular: "Movie",
      titleExamples: '"The Lighthouse", "Blade Runner 2049", etc.',
      seriesExamples: '"Alien", "Scream", "Mad Max", etc.',
    };
  }

  if (normalizedTitle.includes("show") || normalizedTitle.includes("tv")) {
    return {
      singular: "Show",
      titleExamples: '"Severance", "Breaking Bad", etc.',
      seriesExamples: '"Star Trek", "Love Live!", "Monogatari", etc.',
    };
  }

  if (normalizedTitle.includes("anime")) {
    return {
      singular: "Anime",
      titleExamples: '"Frieren", "Mob Psycho 100", etc.',
      seriesExamples: '"Gundam", "Fate", "Monogatari", etc.',
    };
  }

  return {
    singular: "Game",
    titleExamples: '"Tears of the Kingdom", "The Last of Us Part II", etc.',
    seriesExamples: '"The Legend of Zelda", "Shin Megami Tensei", etc.',
  };
}

function getBoardVocabularyWithSettings(boardTitle: string, settings?: Partial<BoardSettings>) {
  const vocabulary = getBoardVocabulary(boardTitle);
  const customLabel = settings?.cardLabel?.trim();

  if (!customLabel) {
    return vocabulary;
  }

  return {
    ...vocabulary,
    singular: customLabel,
  };
}

function getCardLinkedSiblings(cardsByColumn: Record<string, CardEntry[]>, entryId: string | null) {
  if (!entryId) {
    return [];
  }

  const allCards = Object.values(cardsByColumn).flat();
  const currentCard = allCards.find((card) => card.entryId === entryId);

  if (!currentCard) {
    return [];
  }

  return allCards.filter(
    (card) => card.entryId !== currentCard.entryId && card.itemId === currentCard.itemId,
  );
}

function getDefaultBoardSettings(boardTitle: string, _boardLayout: BoardLayout = "board"): BoardSettings {
  void _boardLayout;
  const boardKind = getBoardKind(boardTitle);

  return {
    ...DEFAULT_BOARD_SETTINGS,
    boardLayout: "board",
    cardLabel: deriveDefaultCardLabel(boardTitle),
    collapseCards: false,
    showTierHighlights: true,
    includeSeriesField: boardKind !== "show",
    includeReleaseYearField: true,
    includeImageField: true,
    includeNotesField: true,
    fieldDefinitions: getDefaultFieldDefinitions(boardTitle),
  };
}

function getUserDisplayName(user: User | null) {
  if (!user) {
    return "";
  }

  const metadata = user.user_metadata ?? {};
  return (
    metadata.full_name ||
    metadata.name ||
    metadata.user_name ||
    metadata.email ||
    user.email ||
    "Account"
  );
}

type PersistBoardStateOptions = {
  boards?: SavedBoard[];
  activeBoardId?: string;
  columns?: ColumnDefinition[];
  cardsByColumn?: Record<string, CardEntry[]>;
  debounceMs?: number;
};

function formatLastSavedAt(savedAt: string | null) {
  if (!savedAt) {
    return "Not saved yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(savedAt));
}

function SaveStatusIcon({
  saveState,
  isPersisting,
}: {
  saveState: SaveState;
  isPersisting: boolean;
}) {
  if (isPersisting || saveState === "saving") {
    return <LoaderCircle className="h-4 w-4 animate-spin" />;
  }

  if (saveState === "saved") {
    return <CheckCheck className="h-4 w-4" />;
  }

  if (saveState === "pending") {
    return <CircleDashed className="h-4 w-4" />;
  }

  if (saveState === "error" || saveState === "offline") {
    return <AlertCircle className="h-4 w-4" />;
  }

  return <Check className="h-4 w-4" />;
}

function HoverTooltip({
  label,
  isDarkMode,
  scope,
}: {
  label: string;
  isDarkMode: boolean;
  scope?: string;
}) {
  const scopeClass =
    scope === "boards"
      ? "group-hover/boards:opacity-100 group-focus-within/boards:opacity-100"
      : scope === "rename"
        ? "group-hover/rename:opacity-100 group-focus-within/rename:opacity-100"
        : scope === "column"
          ? "group-hover/column:opacity-100 group-focus-within/column:opacity-100"
          : "group-hover:opacity-100 group-focus-within:opacity-100";

  return (
    <span
      className={clsx(
        "pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-[280] -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold opacity-0 shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition",
        "z-[500]",
        scopeClass,
        isDarkMode ? "bg-slate-800 text-slate-100" : "bg-slate-950 text-white",
      )}
    >
      {label}
    </span>
  );
}

export function RankboardApp() {
  const supabase = getSupabaseBrowserClient();
  const authEnabled = Boolean(supabase);
  const defaultBoard = createEmptyBoard("Rankr");
  const [boards, setBoards] = useState<SavedBoard[]>([defaultBoard]);
  const [activeBoardId, setActiveBoardId] = useState(defaultBoard.id);
  const [columns, setColumns] = useState<ColumnDefinition[]>(defaultBoard.columns);
  const [cardsByColumn, setCardsByColumn] =
    useState<Record<string, CardEntry[]>>(defaultBoard.cardsByColumn);
  const [draft, setDraft] = useState<CardDraft>(initialDraft);
  const [addCardTarget, setAddCardTarget] = useState<AddCardTarget | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCardItemId, setEditingCardItemId] = useState<string | null>(null);
  const [editingCardDraft, setEditingCardDraft] =
    useState<CardEditorDraft | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnDraft, setEditingColumnDraft] =
    useState<ColumnEditorDraft | null>(null);
  const [openColumnMenuId, setOpenColumnMenuId] = useState<string | null>(null);
  const [openColumnSortMenuId, setOpenColumnSortMenuId] = useState<string | null>(null);
  const [openColumnFilterMenuId, setOpenColumnFilterMenuId] = useState<string | null>(null);
  const [openColumnMirrorMenuId, setOpenColumnMirrorMenuId] = useState<string | null>(null);
  const [openColumnMaintenanceMenuId, setOpenColumnMaintenanceMenuId] = useState<string | null>(null);
  const [columnTierFilters, setColumnTierFilters] = useState<Record<string, TierFilter>>({});
  const [hasLoadedPersistedState, setHasLoadedPersistedState] = useState(false);
  const [hasLoadedRemoteState, setHasLoadedRemoteState] = useState(false);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [mobileFocusedColumnId, setMobileFocusedColumnId] = useState<string | null>(null);
  const [isCardDragging, setIsCardDragging] = useState(false);
  const [activeDragEntryId, setActiveDragEntryId] = useState<string | null>(null);
  const [dragPointerKind, setDragPointerKind] = useState<"mouse" | "touch" | null>(null);
  const [isDragGapSuppressed, setIsDragGapSuppressed] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(authEnabled);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [isBoardsMenuOpen, setIsBoardsMenuOpen] = useState(false);
  const [isHeaderSeriesMenuOpen, setIsHeaderSeriesMenuOpen] = useState(false);
  const [isCustomizationMenuOpen, setIsCustomizationMenuOpen] = useState(false);
  const [isMaintenanceMenuOpen, setIsMaintenanceMenuOpen] = useState(false);
  const [isTransferMenuOpen, setIsTransferMenuOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareDraft, setShareDraft] = useState<ShareDraft>({
    columnIds: [],
    tierFilter: "all",
    seriesFilter: "",
    searchTerm: "",
    title: "",
  });
  const [copiedShareUrl, setCopiedShareUrl] = useState<string | null>(null);
  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [newBoardSettings, setNewBoardSettings] = useState<BoardSettings>(
    getDefaultBoardSettings("New Board"),
  );
  const [isBoardIconModalOpen, setIsBoardIconModalOpen] = useState(false);
  const [isEditingBoardTitle, setIsEditingBoardTitle] = useState(false);
  const [boardTitleDraft, setBoardTitleDraft] = useState("");
  const [history, setHistory] = useState<BoardSnapshot[]>([]);
  const [draftDuplicateAction, setDraftDuplicateAction] =
    useState<PendingDuplicateAction | null>(null);
  const [editingDuplicateAction, setEditingDuplicateAction] =
    useState<PendingDuplicateAction | null>(null);
  const [duplicateCleanupSuggestions, setDuplicateCleanupSuggestions] = useState<DuplicateCleanupSuggestion[]>([]);
  const [isDuplicateCleanupModalOpen, setIsDuplicateCleanupModalOpen] = useState(false);
  const [titleTidySuggestions, setTitleTidySuggestions] = useState<TitleTidySuggestion[]>([]);
  const [isTitleTidyModalOpen, setIsTitleTidyModalOpen] = useState(false);
  const [seriesScrapeSuggestions, setSeriesScrapeSuggestions] = useState<SeriesScrapeSuggestion[]>([]);
  const [isSeriesScrapeModalOpen, setIsSeriesScrapeModalOpen] = useState(false);
  const [isSeriesScrapeLoading, setIsSeriesScrapeLoading] = useState(false);
  const [seriesScrapeScopeColumnId, setSeriesScrapeScopeColumnId] = useState<string | undefined>(undefined);
  const [artworkPicker, setArtworkPicker] = useState<ArtworkPickerState | null>(null);
  const [pendingMirrorDelete, setPendingMirrorDelete] = useState<PendingMirrorDelete | null>(null);
  const [pendingMirrorUnlink, setPendingMirrorUnlink] = useState<{
    entryId: string;
    title: string;
    siblingColumnTitle: string | null;
  } | null>(null);
  const [pendingMirrorLinkSuggestions, setPendingMirrorLinkSuggestions] = useState<PendingMirrorLinkSuggestion[] | null>(null);
  const [pendingCardDelete, setPendingCardDelete] = useState<{
    columnId: string;
    entryId: string;
    title: string;
  } | null>(null);
  const [pendingColumnDelete, setPendingColumnDelete] = useState<PendingColumnDelete | null>(null);
  const [tierRowOptionsState, setTierRowOptionsState] = useState<TierRowOptionsState | null>(null);
  const [pairwiseQuizState, setPairwiseQuizState] = useState<PairwiseQuizState | null>(null);
  const [pairwiseQuizReview, setPairwiseQuizReview] = useState<PairwiseQuizReview | null>(null);
  const [pendingPairwiseQuizResume, setPendingPairwiseQuizResume] = useState<PendingPairwiseQuizResume | null>(null);
  const [pairwiseQuizSavedNotice, setPairwiseQuizSavedNotice] = useState<string | null>(null);
  const [isSavingPairwiseQuiz, setIsSavingPairwiseQuiz] = useState(false);
  const [pendingBoardDelete, setPendingBoardDelete] = useState<SavedBoard | null>(null);
  const [moveAllCardsState, setMoveAllCardsState] = useState<MoveAllCardsState | null>(null);
  const [moveCardState, setMoveCardState] = useState<MoveCardState | null>(null);
  const [tierListConversionState, setTierListConversionState] = useState<TierListConversionState | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isPersisting, setIsPersisting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [isUploadingArtwork, setIsUploadingArtwork] = useState(false);
  const [persistRequestId, setPersistRequestId] = useState(0);
  const [isAddFieldSettingsOpen, setIsAddFieldSettingsOpen] = useState(false);
  const [isEditFieldSettingsOpen, setIsEditFieldSettingsOpen] = useState(false);
  const [isBoardFieldSettingsModalOpen, setIsBoardFieldSettingsModalOpen] = useState(false);
  const [revealedMobileAddColumnIndex, setRevealedMobileAddColumnIndex] = useState<number | null>(null);
  const [revealedMobileAddCardTarget, setRevealedMobileAddCardTarget] = useState<MobileAddCardTarget | null>(null);
  const [revealedMobileAddTierRowIndex, setRevealedMobileAddTierRowIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const boardIconUploadInputRef = useRef<HTMLInputElement | null>(null);
  const addArtworkInputRef = useRef<HTMLInputElement | null>(null);
  const editArtworkInputRef = useRef<HTMLInputElement | null>(null);
  const boardLaneRef = useRef<HTMLDivElement | null>(null);
  const dragGapSuppressTimeoutRef = useRef<number | null>(null);
  const dragPointerCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const dragAutoScrollFrameRef = useRef<number | null>(null);
  const columnMenuBoundaryRef = useRef<HTMLDivElement | null>(null);
  const previousSnapshotRef = useRef<BoardSnapshot | null>(null);
  const skipNextHistoryRef = useRef(true);
  const hasHandledNewBoardQueryRef = useRef(false);
  const hasHandledSharedCopyQueryRef = useRef(false);
  const latestColumnsRef = useRef(columns);
  const latestCardsByColumnRef = useRef(cardsByColumn);
  const latestBoardsRef = useRef(boards);
  const latestActiveBoardIdRef = useRef(activeBoardId);
  const pendingPersistOptionsRef = useRef<PersistBoardStateOptions | null>(null);
  const pendingPersistDelayRef = useRef<number>(120);
  const recentBackupSnapshotsRef = useRef<BoardBackupSnapshot[]>([]);
  const isSigningOutRef = useRef(false);
  const hasAutoOpenedBoardSetupRef = useRef(false);

  const filtering = searchTerm.length > 0 || seriesFilter.length > 0;
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 10,
      },
    }),
  );

  const allSeries = Array.from(
    new Set(
      Object.values(cardsByColumn)
        .flat()
        .map((card) => card.series)
        .filter(Boolean),
    ),
  ).sort(compareTitlesForDisplay);
  const activeBoard =
    boards.find((board) => board.id === activeBoardId) ?? normalizeSavedBoard(defaultBoard);
  const activeBoardTitle =
    activeBoard.title ?? "Rankr";
  const activeBoardSettings = activeBoard.settings ?? DEFAULT_BOARD_SETTINGS;
  const activeBoardLayout = "board" as BoardLayout;
  const boardVocabulary = getBoardVocabularyWithSettings(activeBoardTitle, activeBoardSettings);
  const activeBoardKind = getBoardKind(activeBoardTitle);
  const hasBlockingMenuOpen =
    isBoardsMenuOpen ||
    isActionsMenuOpen ||
    isMobileActionsOpen ||
    isCustomizationMenuOpen ||
    isMaintenanceMenuOpen ||
    isTransferMenuOpen ||
    openColumnMenuId !== null ||
    openColumnSortMenuId !== null ||
    openColumnFilterMenuId !== null ||
    openColumnMirrorMenuId !== null ||
    openColumnMaintenanceMenuId !== null;
  const activeBoardFieldDefinitions = normalizeFieldDefinitions(
    activeBoardSettings.fieldDefinitions,
    activeBoardTitle,
    activeBoardSettings,
  );
  const seriesFieldDefinition = activeBoardFieldDefinitions.find((field) => field.builtInKey === "series");
  const releaseYearFieldDefinition = activeBoardFieldDefinitions.find((field) => field.builtInKey === "releaseYear");
  const imageFieldDefinition = activeBoardFieldDefinitions.find((field) => field.builtInKey === "imageUrl");
  const notesFieldDefinition = activeBoardFieldDefinitions.find((field) => field.builtInKey === "notes");
  const shouldShowSeriesField = Boolean(seriesFieldDefinition?.visible) && activeBoardKind !== "show";
  const shouldShowReleaseYearField = Boolean(releaseYearFieldDefinition?.visible);
  const shouldShowImageField = Boolean(imageFieldDefinition?.visible);
  const shouldShowArtworkOnCards =
    Boolean(imageFieldDefinition?.visible) && (imageFieldDefinition?.showOnCardFront ?? true);
  const shouldShowNotesField = Boolean(notesFieldDefinition?.visible);
  const visibleCustomFieldDefinitions = activeBoardFieldDefinitions.filter(
    (field) => field.visible && !field.builtInKey,
  );
  const seriesFieldLabel = seriesFieldDefinition?.label ?? "Series";
  const releaseYearFieldLabel = releaseYearFieldDefinition?.label ?? "Release Year";
  const imageFieldLabel = imageFieldDefinition?.label ?? "Artwork";
  const notesFieldLabel = notesFieldDefinition?.label ?? "Notes";
  const boardIconKeysById = new Map<string, BoardIconKey>();
  const usedBoardIcons = new Set<BoardIconKey>();
  const activeDragColumnId = activeDragEntryId ? findColumnIdForEntry(activeDragEntryId) : null;
  const activeDragCard = activeDragColumnId
    ? (cardsByColumn[activeDragColumnId] ?? []).find((card) => card.entryId === activeDragEntryId) ?? null
    : null;
  const activeDragColumn = activeDragColumnId
    ? columns.find((column) => column.id === activeDragColumnId) ?? null
    : null;
  const activeDragRankBadge =
    activeDragCard && activeDragColumn && isRankedColumn(activeDragColumn)
      ? {
          value: Math.max(
            1,
            (cardsByColumn[activeDragColumnId!] ?? []).findIndex((card) => card.entryId === activeDragCard.entryId) + 1,
          ),
        }
      : null;

  for (const board of boards) {
    const configuredIconKey = board.settings?.boardIconKey as BoardIconKey | undefined;
    const iconKey = configuredIconKey || resolveBoardIconKey(board.title, usedBoardIcons);
    boardIconKeysById.set(board.id, iconKey);
    usedBoardIcons.add(iconKey);
  }

  const resetToSignedOutBoard = useCallback(() => {
    const signedOutBoard = createEmptyBoard("Rankr");

    skipNextHistoryRef.current = true;
    previousSnapshotRef.current = {
      columns: signedOutBoard.columns,
      cardsByColumn: signedOutBoard.cardsByColumn,
    };
    latestBoardsRef.current = [signedOutBoard];
    latestActiveBoardIdRef.current = signedOutBoard.id;
    latestColumnsRef.current = signedOutBoard.columns;
    latestCardsByColumnRef.current = signedOutBoard.cardsByColumn;

    setBoards([signedOutBoard]);
    setActiveBoardId(signedOutBoard.id);
    setColumns(signedOutBoard.columns);
    setCardsByColumn(signedOutBoard.cardsByColumn);
    setHistory([]);
    setSearchTerm("");
    setSeriesFilter("");
    setIsEditingBoardTitle(false);
    setBoardTitleDraft("");
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
    setIsBoardsMenuOpen(false);
    setIsCustomizationMenuOpen(false);
    setIsMaintenanceMenuOpen(false);
    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnFilterMenuId(null);
    setOpenColumnMirrorMenuId(null);
    setOpenColumnMaintenanceMenuId(null);
    setEditingCardId(null);
    setEditingCardItemId(null);
    setEditingCardDraft(null);
    setEditingColumnId(null);
    setEditingColumnDraft(null);
    setAddCardTarget(null);
    setDraft(initialDraft);
    setHasLoadedRemoteState(false);
    setLastSavedAt(null);
    setSaveState("idle");
    setSaveErrorMessage(null);

    try {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // Ignore storage failures during sign out reset.
    }
  }, []);

  const writeLocalBackupSnapshot = useCallback((snapshot: BoardBackupSnapshot) => {
    try {
      const storedValue = window.localStorage.getItem(LOCAL_BACKUP_STORAGE_KEY);
      const existingSnapshots = storedValue ? JSON.parse(storedValue) as BoardBackupSnapshot[] : [];
      const serializedSnapshot = JSON.stringify({
        activeBoardId: snapshot.activeBoardId,
        boards: snapshot.boards,
      });
      const nextSnapshots = trimBackupSnapshots([
        snapshot,
        ...existingSnapshots.filter(
          (existing) =>
            JSON.stringify({
              activeBoardId: existing.activeBoardId,
              boards: existing.boards,
            }) !== serializedSnapshot,
        ),
      ]);
      window.localStorage.setItem(LOCAL_BACKUP_STORAGE_KEY, JSON.stringify(nextSnapshots));
      recentBackupSnapshotsRef.current = nextSnapshots;
    } catch {
      // Ignore backup storage failures and keep the primary save path moving.
    }
  }, []);

  const buildPersistedColumnsPayload = useCallback((nextBoards: SavedBoard[], nextActiveBoardId: string) => {
    const snapshot = buildBackupSnapshot(nextBoards, nextActiveBoardId);
    const serializedSnapshot = JSON.stringify({
      activeBoardId: snapshot.activeBoardId,
      boards: snapshot.boards,
    });
    const nextRecentSnapshots = trimBackupSnapshots([
      snapshot,
      ...recentBackupSnapshotsRef.current.filter(
        (existing) =>
          JSON.stringify({
            activeBoardId: existing.activeBoardId,
            boards: existing.boards,
          }) !== serializedSnapshot,
      ),
    ]);

    recentBackupSnapshotsRef.current = nextRecentSnapshots;

    return {
      payload: {
        version: 3,
        activeBoardId: nextActiveBoardId,
        boards: nextBoards,
        recentSnapshots: nextRecentSnapshots,
      },
      snapshot,
    };
  }, []);

  const buildEffectiveBoardsSnapshot = useCallback((options?: PersistBoardStateOptions) => {
    return mergeBoardsWithActiveSnapshot(
      options?.boards ?? latestBoardsRef.current,
      options?.activeBoardId ?? latestActiveBoardIdRef.current,
      options?.columns ?? latestColumnsRef.current,
      options?.cardsByColumn ?? latestCardsByColumnRef.current,
    );
  }, []);

  const queuePersistBoardState = useCallback((options?: PersistBoardStateOptions) => {
    pendingPersistOptionsRef.current = options ?? null;
    pendingPersistDelayRef.current = options?.debounceMs ?? 120;
    setSaveState("pending");
    setPersistRequestId((current) => current + 1);
  }, []);

  const persistBoardState = useCallback(async (options?: PersistBoardStateOptions) => {
    if (!supabase || !currentUser) {
      return;
    }

    const nextBoards = buildEffectiveBoardsSnapshot(options);
    const nextActiveBoardId = options?.activeBoardId ?? latestActiveBoardIdRef.current;
    const nextCardsByColumn = options?.cardsByColumn ?? latestCardsByColumnRef.current;
    const { payload, snapshot } = buildPersistedColumnsPayload(nextBoards, nextActiveBoardId);

    setIsPersisting(true);
    setSaveState("saving");
    setSaveErrorMessage(null);

    try {
      const { error } = await supabase.from("board_states").upsert({
        owner_id: currentUser.id,
        columns: payload,
        cards_by_column: nextCardsByColumn,
        updated_at: new Date().toISOString(),
      });

      let normalizedError: unknown = null;
      let backupError: unknown = null;
      const backupSaved = !error;

      if (error) {
        backupError = error;
      }

      let normalizedSaved = false;

      try {
        await ensureNormalizedProfile(supabase, currentUser);
        await syncNormalizedBoards(supabase, currentUser, nextBoards);
        normalizedSaved = true;
      } catch (persistError) {
        normalizedError = persistError;
        console.error("Normalized board sync failed.", persistError);
      }

      if (!normalizedSaved && !backupSaved) {
        throw backupError ?? normalizedError ?? new Error("Changes could not be saved.");
      }

      setLastSavedAt(new Date().toISOString());
      setSaveState("saved");
      setSaveErrorMessage(null);
      writeLocalBackupSnapshot(snapshot);
    } catch (error) {
      console.error(error);
      setSaveState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
      setSaveErrorMessage(error instanceof Error ? error.message : "Changes could not be saved.");
    } finally {
      setIsPersisting(false);
    }
  }, [buildEffectiveBoardsSnapshot, buildPersistedColumnsPayload, currentUser, supabase, writeLocalBackupSnapshot]);

  function findDuplicateCard(
    title: string,
    columnId: string,
    excludeItemId?: string,
  ) {
    const normalizedTitle = normalizeTitleForComparison(title);

    if (!normalizedTitle || !columnId) {
      return null;
    }

    const column = columns.find((item) => item.id === columnId);

    if (!column) {
      return null;
    }

    const duplicate = (cardsByColumn[column.id] ?? []).find(
      (card) =>
        card.itemId !== excludeItemId &&
        normalizeTitleForComparison(card.title) === normalizedTitle,
    );

    return duplicate
      ? {
          column,
          card: duplicate,
        }
      : null;
  }

  function updateColumnsAndPersist(
    updater: (current: ColumnDefinition[]) => ColumnDefinition[],
    options?: { nextCardsByColumn?: Record<string, CardEntry[]> },
  ) {
    let nextColumnsSnapshot = latestColumnsRef.current;
    setColumns((current) => {
      const nextColumns = updater(current);
      nextColumnsSnapshot = nextColumns;
      latestColumnsRef.current = nextColumns;
      return nextColumns;
    });

    const persistOptions: PersistBoardStateOptions = {
      columns: nextColumnsSnapshot,
    };

    if (options?.nextCardsByColumn) {
      latestCardsByColumnRef.current = options.nextCardsByColumn;
      persistOptions.cardsByColumn = options.nextCardsByColumn;
    }

    queuePersistBoardState(persistOptions);
  }

  function applyColumnSortMode(column: ColumnDefinition, cards: CardEntry[]) {
    return sortCardsForColumn(cards, column);
  }

  useEffect(() => {
    try {
      const storedBackups = window.localStorage.getItem(LOCAL_BACKUP_STORAGE_KEY);
      recentBackupSnapshotsRef.current = storedBackups ? JSON.parse(storedBackups) as BoardBackupSnapshot[] : [];
    } catch {
      recentBackupSnapshotsRef.current = [];
    }

    if (authEnabled) {
      try {
        const preferredBoardId = readStoredPreferredBoardId();

        if (preferredBoardId) {
          setActiveBoardId(preferredBoardId);
        }
      } catch {
        // Ignore local preference parsing failures for auth-enabled mode.
      }
      setHasLoadedPersistedState(true);
      return;
    }

    try {
      const storedValue = window.localStorage.getItem(LOCAL_STORAGE_KEY);

      if (!storedValue) {
        setHasLoadedPersistedState(true);
        return;
      }

      const parsedState = JSON.parse(storedValue) as
        | {
            version?: number;
            activeBoardId?: string;
            boards?: SavedBoard[];
          }
        | {
            columns?: ColumnDefinition[];
            cardsByColumn?: Record<string, CardEntry[]>;
          };

      if ("boards" in parsedState && Array.isArray(parsedState.boards) && parsedState.boards.length > 0) {
        const nextBoards = parsedState.boards.map((board) => normalizeSavedBoard(board));
        const preferredBoardId = readStoredPreferredBoardId();
        const nextActiveBoardId =
          preferredBoardId && nextBoards.some((board) => board.id === preferredBoardId)
            ? preferredBoardId
            : parsedState.activeBoardId && nextBoards.some((board) => board.id === parsedState.activeBoardId)
              ? parsedState.activeBoardId
            : nextBoards[0].id;
        const nextActiveBoard =
          nextBoards.find((board) => board.id === nextActiveBoardId) ?? nextBoards[0];

        skipNextHistoryRef.current = true;
        setBoards(nextBoards);
        setActiveBoardId(nextActiveBoardId);
        setColumns(nextActiveBoard.columns);
        setCardsByColumn(nextActiveBoard.cardsByColumn);
      } else {
        const legacyColumns = "columns" in parsedState ? parsedState.columns : undefined;
        const legacyCards = "cardsByColumn" in parsedState ? parsedState.cardsByColumn : undefined;
        const starterSnapshot = createStarterBoardSnapshot();
        const migratedBoard: SavedBoard = {
          ...createEmptyBoard("Rankr"),
          columns: legacyColumns ?? starterSnapshot.columns,
          cardsByColumn: legacyCards ?? starterSnapshot.cardsByColumn,
        };

        skipNextHistoryRef.current = true;
        setBoards([migratedBoard]);
        setActiveBoardId(migratedBoard.id);
        setColumns(migratedBoard.columns);
        setCardsByColumn(migratedBoard.cardsByColumn);
      }
    } catch {
      // Ignore bad local data and fall back to demo content.
    } finally {
      setHasLoadedPersistedState(true);
    }
  }, [authEnabled]);

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      setIsDarkMode(storedTheme === "dark");
    } catch {
      setIsDarkMode(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const syncViewport = () => setIsMobileViewport(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      setRevealedMobileAddColumnIndex(null);
      setRevealedMobileAddCardTarget(null);
      setRevealedMobileAddTierRowIndex(null);
    }
  }, [isMobileViewport]);

  useEffect(() => {
    const preference = currentUser?.user_metadata?.theme_preference;

    if (preference === "dark") {
      setIsDarkMode(true);
    } else if (preference === "light") {
      setIsDarkMode(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!hasLoadedPersistedState) {
      return;
    }

    if (authEnabled && currentUser && !hasLoadedRemoteState) {
      return;
    }

    if (authEnabled && !isAuthLoading && !currentUser) {
      try {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch {
        // Ignore local storage cleanup failures.
      }
      return;
    }

    const effectiveBoards = mergeBoardsWithActiveSnapshot(
      boards,
      activeBoardId,
      columns,
      cardsByColumn,
    );

    const serializedState = JSON.stringify({
      version: 2,
      activeBoardId,
      boards: effectiveBoards,
    });

    window.localStorage.setItem(LOCAL_STORAGE_KEY, serializedState);

    if (currentUser) {
      try {
        window.localStorage.setItem(getUserBoardCacheKey(currentUser.id), serializedState);
      } catch {
        // Ignore user-scoped cache failures.
      }
    }

    writeLocalBackupSnapshot(buildBackupSnapshot(effectiveBoards, activeBoardId));
    if (!authEnabled || !currentUser) {
      setLastSavedAt(new Date().toISOString());
      setSaveState("saved");
    }
  }, [activeBoardId, authEnabled, boards, cardsByColumn, columns, currentUser, hasLoadedPersistedState, hasLoadedRemoteState, isAuthLoading, writeLocalBackupSnapshot]);

  useEffect(() => {
    if (!hasLoadedPersistedState) {
      return;
    }

    const nextSnapshot: BoardSnapshot = { columns, cardsByColumn };
    const previousSnapshot = previousSnapshotRef.current;

    if (skipNextHistoryRef.current) {
      skipNextHistoryRef.current = false;
      previousSnapshotRef.current = nextSnapshot;
      return;
    }

    if (previousSnapshot) {
      const previousSerialized = JSON.stringify(previousSnapshot);
      const nextSerialized = JSON.stringify(nextSnapshot);

      if (previousSerialized !== nextSerialized) {
        setHistory((current) => [...current.slice(-19), previousSnapshot]);
      }
    }

    previousSnapshotRef.current = nextSnapshot;
  }, [cardsByColumn, columns, hasLoadedPersistedState]);

  useEffect(() => {
    setBoards((current) =>
      current.map((board) =>
        board.id === activeBoardId
          ? {
              ...board,
              columns,
              cardsByColumn,
              updatedAt: new Date().toISOString(),
            }
          : board,
      ),
    );
  }, [activeBoardId, cardsByColumn, columns]);

  useEffect(() => {
    latestColumnsRef.current = columns;
    latestCardsByColumnRef.current = cardsByColumn;
  }, [cardsByColumn, columns, queuePersistBoardState]);

  useEffect(() => {
    const syncedState = syncBoardMirrorColumns(columns, cardsByColumn);

    if (syncedState !== cardsByColumn) {
      skipNextHistoryRef.current = true;
      latestCardsByColumnRef.current = syncedState;
      setCardsByColumn(syncedState);
      queuePersistBoardState({ cardsByColumn: syncedState });
    }
  }, [cardsByColumn, columns, queuePersistBoardState]);

  useEffect(() => {
    latestBoardsRef.current = boards;
    latestActiveBoardIdRef.current = activeBoardId;
  }, [activeBoardId, boards]);

  useEffect(() => {
    setRevealedMobileAddColumnIndex(null);
    setRevealedMobileAddCardTarget(null);
    setRevealedMobileAddTierRowIndex(null);
  }, [activeBoardId, columns.length]);

  useEffect(() => {
    if (!tierRowOptionsState) {
      return;
    }

    function closeTierRowOptions(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-tier-row-options-root='true']")) {
        return;
      }
      setTierRowOptionsState(null);
    }

    window.addEventListener("pointerdown", closeTierRowOptions);
    return () => window.removeEventListener("pointerdown", closeTierRowOptions);
  }, [tierRowOptionsState]);

  useEffect(() => {
    if (
      !revealedMobileAddColumnIndex &&
      !revealedMobileAddCardTarget &&
      revealedMobileAddTierRowIndex === null
    ) {
      return;
    }

    function clearIfOutside(event: Event) {
      const target = event.target as HTMLElement | null;

      if (target?.closest("[data-mobile-inline-add-root='true']")) {
        return;
      }

      setRevealedMobileAddColumnIndex(null);
      setRevealedMobileAddCardTarget(null);
      setRevealedMobileAddTierRowIndex(null);
    }

    function clearOnScroll() {
      setRevealedMobileAddColumnIndex(null);
      setRevealedMobileAddCardTarget(null);
      setRevealedMobileAddTierRowIndex(null);
    }

    window.addEventListener("pointerdown", clearIfOutside);
    window.addEventListener("touchstart", clearIfOutside);
    window.addEventListener("scroll", clearOnScroll, true);

    return () => {
      window.removeEventListener("pointerdown", clearIfOutside);
      window.removeEventListener("touchstart", clearIfOutside);
      window.removeEventListener("scroll", clearOnScroll, true);
    };
  }, [revealedMobileAddCardTarget, revealedMobileAddColumnIndex, revealedMobileAddTierRowIndex]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        getLastActiveBoardStorageKey(currentUser?.id ?? null),
        activeBoardId,
      );
      if (currentUser) {
        window.localStorage.setItem(getLastActiveBoardStorageKey(), activeBoardId);
      }
    } catch {
      // Ignore local preference persistence failures.
    }
  }, [activeBoardId, currentUser]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    window.localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    if (!supabase) {
      setIsAuthLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setCurrentUser(data.user ?? null);
      setHasLoadedRemoteState(data.user ? false : true);
      setIsAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      isSigningOutRef.current = false;
      setCurrentUser(session?.user ?? null);
      if (event !== "TOKEN_REFRESHED") {
        setHasLoadedRemoteState(session?.user ? false : true);
      }
      setIsAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!authEnabled || isAuthLoading || !hasLoadedPersistedState || currentUser) {
      return;
    }

    resetToSignedOutBoard();
  }, [authEnabled, currentUser, hasLoadedPersistedState, isAuthLoading, resetToSignedOutBoard]);

  useEffect(() => {
    if (typeof window === "undefined" || hasHandledNewBoardQueryRef.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") {
      return;
    }

    hasHandledNewBoardQueryRef.current = true;
    setNewBoardTitle("");
    setNewBoardSettings(getDefaultBoardSettings("New Board"));
    setIsCreateBoardModalOpen(true);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
    params.delete("new");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      hasHandledSharedCopyQueryRef.current ||
      !hasLoadedPersistedState ||
      isAuthLoading ||
      !hasLoadedRemoteState
    ) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("copyShared") !== "1") {
      return;
    }

    hasHandledSharedCopyQueryRef.current = true;

    try {
      const rawTemplate = window.localStorage.getItem(SHARED_BOARD_TEMPLATE_STORAGE_KEY);

      if (rawTemplate) {
        const parsedBoard = normalizeSavedBoard(JSON.parse(rawTemplate) as SavedBoard);
        const nextBoard = cloneBoardFromTemplate(parsedBoard);

        let nextBoardsSnapshot: SavedBoard[] = [];

        skipNextHistoryRef.current = true;
        setBoards((current) => {
          const nonStarterBoards =
            current.length > 1 ? current.filter((board) => !isEphemeralStarterBoard(board)) : current;
          const nextBoards = [...nonStarterBoards, nextBoard];
          latestBoardsRef.current = nextBoards;
          nextBoardsSnapshot = nextBoards;
          return nextBoards;
        });
        latestActiveBoardIdRef.current = nextBoard.id;
        latestColumnsRef.current = nextBoard.columns;
        latestCardsByColumnRef.current = nextBoard.cardsByColumn;
        setActiveBoardId(nextBoard.id);
        setColumns(nextBoard.columns);
        setCardsByColumn(nextBoard.cardsByColumn);
        setHistory([]);
        setIsBoardsMenuOpen(false);
        setIsActionsMenuOpen(false);
        setIsMobileActionsOpen(false);
        try {
          const serializedState = JSON.stringify({
            version: 2,
            activeBoardId: nextBoard.id,
            boards: nextBoardsSnapshot,
          });
          window.localStorage.setItem(LOCAL_STORAGE_KEY, serializedState);
          if (currentUser) {
            window.localStorage.setItem(getUserBoardCacheKey(currentUser.id), serializedState);
          }
        } catch {
          // Ignore local cache failures; the in-memory board has still been created.
        }
        void persistBoardState({
          boards: nextBoardsSnapshot,
          activeBoardId: nextBoard.id,
          cardsByColumn: nextBoard.cardsByColumn,
        });
      }
    } catch {
      // Ignore bad shared-template payloads and continue into the main app.
    } finally {
      window.localStorage.removeItem(SHARED_BOARD_TEMPLATE_STORAGE_KEY);
      params.delete("copyShared");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, [currentUser, hasLoadedPersistedState, hasLoadedRemoteState, isAuthLoading, persistBoardState]);

  useEffect(() => {
    if (!isCardDragging) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      dragPointerCoordsRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
    }

    function handleTouchMove(event: TouchEvent) {
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (!touch) {
        return;
      }
      dragPointerCoordsRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [isCardDragging]);

  useEffect(() => {
    if (!isCardDragging || dragPointerKind !== "mouse") {
      if (dragAutoScrollFrameRef.current) {
        window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
        dragAutoScrollFrameRef.current = null;
      }
      return;
    }

    const edgeThreshold = activeBoardLayout === "tier-list" ? 170 : 140;
    const maxScrollStep = activeBoardLayout === "tier-list" ? 12 : 10;

    const tick = () => {
      const coords = dragPointerCoordsRef.current;

      if (coords) {
        if (activeBoardLayout === "tier-list") {
          let windowDeltaY = 0;

          if (coords.y <= edgeThreshold) {
            windowDeltaY = -Math.max(2, ((edgeThreshold - coords.y) / edgeThreshold) * maxScrollStep);
          } else if (coords.y >= window.innerHeight - edgeThreshold) {
            windowDeltaY = Math.max(
              2,
              ((coords.y - (window.innerHeight - edgeThreshold)) / edgeThreshold) * maxScrollStep,
            );
          }

          if (windowDeltaY !== 0) {
            window.scrollBy(0, windowDeltaY);
          }
        }

        const scrollCandidates = Array.from(
          document.querySelectorAll<HTMLElement>("[data-column-scroll-id]"),
        );
        const scrollContainer =
          scrollCandidates.find((element) => {
            const rect = element.getBoundingClientRect();
            return coords.x >= rect.left && coords.x <= rect.right;
          }) ?? null;

        if (scrollContainer) {
          const rect = scrollContainer.getBoundingClientRect();
          let deltaY = 0;

          if (coords.y <= rect.top + edgeThreshold) {
            deltaY =
              -Math.max(
                2,
                ((rect.top + edgeThreshold - coords.y) / edgeThreshold) * maxScrollStep,
              );
          } else if (coords.y >= rect.bottom - edgeThreshold) {
            deltaY = Math.max(
              2,
              ((coords.y - (rect.bottom - edgeThreshold)) / edgeThreshold) * maxScrollStep,
            );
          }

          if (deltaY !== 0) {
            scrollContainer.scrollTop += deltaY;
            suppressDragGapsTemporarily();
          }
        }
      }

      dragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    dragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (dragAutoScrollFrameRef.current) {
        window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
        dragAutoScrollFrameRef.current = null;
      }
    };
  }, [activeBoardLayout, dragPointerKind, isCardDragging]);

  useEffect(() => {
    if (
      authEnabled ||
      hasAutoOpenedBoardSetupRef.current ||
      isCreateBoardModalOpen ||
      !hasLoadedPersistedState
    ) {
      return;
    }

    if (boards.length === 1 && activeBoardTitle === "Rankr" && isStarterBoard(columns, cardsByColumn)) {
      hasAutoOpenedBoardSetupRef.current = true;
      setNewBoardTitle("");
      setNewBoardSettings(getDefaultBoardSettings("New Board"));
      setIsCreateBoardModalOpen(true);
      setIsActionsMenuOpen(false);
      setIsMobileActionsOpen(false);
    }
  }, [
    activeBoardTitle,
    authEnabled,
    boards.length,
    cardsByColumn,
    columns,
    hasLoadedPersistedState,
    hasLoadedRemoteState,
    isCreateBoardModalOpen,
  ]);

  useEffect(() => {
    if (!hasLoadedPersistedState) {
      return;
    }

    if (!supabase || !currentUser) {
      setHasLoadedRemoteState(true);
      return;
    }

    const client = supabase;
    const user = currentUser;
    let cancelled = false;

    try {
      const cachedValue = window.localStorage.getItem(getUserBoardCacheKey(user.id));

      if (cachedValue) {
        const parsedState = JSON.parse(cachedValue) as {
          activeBoardId?: string;
          boards?: SavedBoard[];
        };

        if (Array.isArray(parsedState.boards) && parsedState.boards.length > 0) {
          const nextBoards = parsedState.boards.map((board) => normalizeSavedBoard(board));
          const preferredBoardId = readStoredPreferredBoardId(user.id);
          const nextActiveBoardId =
            preferredBoardId && nextBoards.some((board) => board.id === preferredBoardId)
              ? preferredBoardId
              : parsedState.activeBoardId && nextBoards.some((board) => board.id === parsedState.activeBoardId)
                ? parsedState.activeBoardId
              : nextBoards[0]?.id;
          const nextActiveBoard =
            nextBoards.find((board) => board.id === nextActiveBoardId) ?? nextBoards[0];

          if (nextActiveBoard) {
            skipNextHistoryRef.current = true;
            setBoards(nextBoards);
            setActiveBoardId(nextActiveBoard.id);
            setColumns(nextActiveBoard.columns);
            setCardsByColumn(nextActiveBoard.cardsByColumn);
          }
        }
      }
    } catch {
      // Ignore user-scoped cache failures and continue to remote load.
    }

    async function loadBoardState() {
      try {
        let normalizedBoards: SavedBoard[] = [];
        let normalizedLoadError: unknown = null;

        try {
          await ensureNormalizedProfile(client, user);
          normalizedBoards = await loadNormalizedBoards(client, user.id);
        } catch (error) {
          normalizedLoadError = error;
          console.error("Normalized board load failed; falling back to board_states backup.", error);
        }

        if (cancelled) {
          return;
        }

        const { data, error } = await client
          .from("board_states")
          .select("*")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        if (error) {
          throw error;
        }

        const backupState = data ? readBoardsFromBackupRow(data) : null;
        const localBoards = latestBoardsRef.current;
        const localActiveBoardId = latestActiveBoardIdRef.current;
        const remotePreferredBoards = backupState?.boards.length
          ? choosePreferredBoards(normalizedBoards, backupState.boards)
          : normalizedBoards;
        const preferredBoards = chooseSessionPreferredBoards(remotePreferredBoards, localBoards);
        const preferredActiveBoardId = readStoredPreferredBoardId(user.id);
        const preferredLatestTimestamp =
          backupState?.boards.length && preferredBoards.some((board) => backupState.boards.some((backupBoard) => backupBoard.id === board.id))
            ? getLatestBoardTimestamp(preferredBoards) ?? backupState?.updatedAt ?? null
            : getLatestBoardTimestamp(preferredBoards);

        if (preferredBoards.length > 0) {
          const localActiveBoardId = latestActiveBoardIdRef.current;
          const remoteActiveBoardId =
            preferredActiveBoardId && preferredBoards.some((board) => board.id === preferredActiveBoardId)
              ? preferredActiveBoardId
              : localActiveBoardId && preferredBoards.some((board) => board.id === localActiveBoardId)
                ? localActiveBoardId
                : preferredBoards[0].id;
          const nextActiveBoard =
            preferredBoards.find((board) => board.id === remoteActiveBoardId) ??
            preferredBoards[0];

          skipNextHistoryRef.current = true;
          setBoards(preferredBoards);
          setActiveBoardId(remoteActiveBoardId);
          setColumns(nextActiveBoard.columns);
          skipNextHistoryRef.current = true;
          setCardsByColumn(nextActiveBoard.cardsByColumn);
          setLastSavedAt(preferredLatestTimestamp);
          setSaveState("saved");
          setHasLoadedRemoteState(true);
          return;
        }

        if (backupState?.boards.length) {
          recentBackupSnapshotsRef.current = backupState.recentSnapshots;
          if (backupState.updatedAt) {
            setLastSavedAt(backupState.updatedAt);
          }

          if (normalizedLoadError) {
            try {
              await syncNormalizedBoards(client, user, backupState.boards);
            } catch (error) {
              console.error("Backup state loaded, but normalized migration retry failed.", error);
            }
          }

          const migratedActiveBoardId =
            backupState.activeBoardId &&
            backupState.boards.some((board) => board.id === backupState.activeBoardId)
              ? backupState.activeBoardId
              : backupState.boards[0].id;
          const nextActiveBoard =
            backupState.boards.find((board) => board.id === migratedActiveBoardId) ??
            backupState.boards[0];

          skipNextHistoryRef.current = true;
          setBoards(backupState.boards);
          setActiveBoardId(migratedActiveBoardId);
          setColumns(nextActiveBoard.columns);
          skipNextHistoryRef.current = true;
          setCardsByColumn(nextActiveBoard.cardsByColumn);
          setSaveState("saved");
        } else {
          const { payload, snapshot } = buildPersistedColumnsPayload(localBoards, localActiveBoardId);
          let normalizedSaved = false;

          try {
            await syncNormalizedBoards(client, user, localBoards);
            normalizedSaved = true;
          } catch (error) {
            console.error("Normalized board bootstrap failed; saving backup snapshot only.", error);
          }

          const { error: backupUpsertError } = await client.from("board_states").upsert({
            owner_id: user.id,
            columns: payload,
            cards_by_column: latestCardsByColumnRef.current,
            updated_at: new Date().toISOString(),
          });

          if (!normalizedSaved && backupUpsertError) {
            throw backupUpsertError;
          }

          writeLocalBackupSnapshot(snapshot);
          setLastSavedAt(new Date().toISOString());
          setSaveState("saved");
        }

        setHasLoadedRemoteState(true);
      } catch (error) {
        console.error(error);
        setSaveState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
        setSaveErrorMessage(error instanceof Error ? error.message : "Boards could not be loaded.");
        setHasLoadedRemoteState(true);
      }
    }

    loadBoardState();

    return () => {
      cancelled = true;
    };
  }, [
    authEnabled,
    buildPersistedColumnsPayload,
    currentUser,
    hasLoadedPersistedState,
    supabase,
    writeLocalBackupSnapshot,
  ]);

  useEffect(() => {
    if (!persistRequestId || !supabase || !currentUser || !hasLoadedRemoteState || isSigningOutRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const nextPersistOptions = pendingPersistOptionsRef.current;
      pendingPersistOptionsRef.current = null;
      void persistBoardState(nextPersistOptions ?? undefined);
    }, pendingPersistDelayRef.current);

    return () => window.clearTimeout(timeout);
  }, [currentUser, hasLoadedRemoteState, persistBoardState, persistRequestId, supabase]);

  useEffect(() => {
    if (!isActionsMenuOpen) {
      setIsCustomizationMenuOpen(false);
      setIsMaintenanceMenuOpen(false);
      setIsTransferMenuOpen(false);
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;

      if (!target?.closest("[data-actions-menu-root='true']")) {
        setIsActionsMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);

    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isActionsMenuOpen]);

  useEffect(() => {
    if (!isBoardsMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;

      if (!target?.closest("[data-board-switcher-root='true']")) {
        setIsBoardsMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);

    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isBoardsMenuOpen]);

  useEffect(() => {
    if (openColumnMenuId) {
      return;
    }

    setOpenColumnSortMenuId(null);
    setOpenColumnFilterMenuId(null);
    setOpenColumnMirrorMenuId(null);
    setOpenColumnMaintenanceMenuId(null);
  }, [openColumnMenuId]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;

      if (!target?.closest("[data-column-menu-root='true']")) {
        setOpenColumnMenuId(null);
        setOpenColumnSortMenuId(null);
        setOpenColumnFilterMenuId(null);
        setOpenColumnMirrorMenuId(null);
        setOpenColumnMaintenanceMenuId(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);

    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!isHeaderSeriesMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;

      if (!target?.closest("[data-series-filter-root='true']")) {
        setIsHeaderSeriesMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isHeaderSeriesMenuOpen]);

  async function handleOAuthLogin(provider: "google" | "apple") {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      console.error(error);
      return;
    }

    if (data?.url) {
      window.location.replace(data.url);
    }
  }

  async function toggleThemePreference() {
    const nextIsDarkMode = !isDarkMode;
    setIsDarkMode(nextIsDarkMode);

    if (supabase && currentUser) {
      await supabase.auth.updateUser({
        data: {
          ...currentUser.user_metadata,
          theme_preference: nextIsDarkMode ? "dark" : "light",
        },
      });
    }
  }

  async function handleSignOut() {
    isSigningOutRef.current = true;
    await persistBoardState();
    await supabase?.auth.signOut();
    setCurrentUser(null);
    resetToSignedOutBoard();
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
  }

  function findColumnIdForEntry(entryId: string) {
    return (
      columns.find((column) =>
        cardsByColumn[column.id]?.some((card) => card.entryId === entryId),
      )?.id ?? null
    );
  }

  function captureDragPointer(event: Event) {
    if (event instanceof MouseEvent) {
      dragPointerCoordsRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
      setDragPointerKind("mouse");
      return;
    }

    if (event instanceof TouchEvent) {
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (touch) {
        dragPointerCoordsRef.current = {
          x: touch.clientX,
          y: touch.clientY,
        };
      }
      setDragPointerKind("touch");
    }
  }

  function suppressDragGapsTemporarily() {
    setIsDragGapSuppressed(true);
    if (dragGapSuppressTimeoutRef.current) {
      window.clearTimeout(dragGapSuppressTimeoutRef.current);
    }
    dragGapSuppressTimeoutRef.current = window.setTimeout(() => {
      setIsDragGapSuppressed(false);
      dragGapSuppressTimeoutRef.current = null;
    }, 1000);
  }

  function removeMirroredCard(
    nextState: Record<string, CardEntry[]>,
    sourceEntryId: string,
    targetColumnId?: string,
  ) {
    if (!targetColumnId) {
      return nextState;
    }

    return {
      ...nextState,
      [targetColumnId]: (nextState[targetColumnId] ?? []).filter(
        (card) => card.mirroredFromEntryId !== sourceEntryId,
      ),
    };
  }

  function addMirroredCard(
    nextState: Record<string, CardEntry[]>,
    sourceCard: CardEntry,
    targetColumnId?: string,
  ) {
    if (!targetColumnId) {
      return nextState;
    }

    const targetCards = nextState[targetColumnId] ?? [];
    const alreadyMirrored = targetCards.some(
      (card) =>
        card.mirroredFromEntryId === sourceCard.entryId ||
        card.itemId === sourceCard.itemId,
    );

    if (alreadyMirrored) {
      return nextState;
    }

    const mirroredCard: CardEntry = {
      ...sourceCard,
      entryId: makeId("mirror"),
      mirroredFromEntryId: sourceCard.entryId,
    };

    return {
      ...nextState,
      [targetColumnId]: [...targetCards, mirroredCard],
    };
  }

  function reconcileMirrorForMove(
    nextState: Record<string, CardEntry[]>,
    movedCard: CardEntry,
    sourceColumnId: string,
    destinationColumnId: string,
  ) {
    const sourceColumn = columns.find((column) => column.id === sourceColumnId);
    const destinationColumn = columns.find(
      (column) => column.id === destinationColumnId,
    );

    let updatedState = nextState;

    if (sourceColumn?.autoMirrorToColumnId) {
      updatedState = removeMirroredCard(
        updatedState,
        movedCard.entryId,
        sourceColumn.autoMirrorToColumnId,
      );
    }

    if (destinationColumn?.autoMirrorToColumnId) {
      updatedState = addMirroredCard(
        updatedState,
        movedCard,
        destinationColumn.autoMirrorToColumnId,
      );
    }

    return updatedState;
  }

  function updateCardsForItem(itemId: string, updater: (card: CardEntry) => CardEntry) {
    let nextStateSnapshot: Record<string, CardEntry[]> | null = null;

    setCardsByColumn((current) => {
      const nextState: Record<string, CardEntry[]> = {};

      for (const [columnId, cards] of Object.entries(current)) {
        const updatedCards = cards.map((card) =>
          card.itemId === itemId ? updater(card) : card,
        );
        const column = latestColumnsRef.current.find((item) => item.id === columnId);
        nextState[columnId] = column ? applyColumnSortMode(column, updatedCards) : updatedCards;
      }

      latestCardsByColumnRef.current = nextState;
      nextStateSnapshot = nextState;
      return nextState;
    });

    if (nextStateSnapshot) {
      queuePersistBoardState({ cardsByColumn: nextStateSnapshot });
    } else {
      queuePersistBoardState();
    }
  }

  function linkMatchingMirrorCards(columnId: string) {
    const mirrorColumn = columns.find((column) => column.id === columnId);

    if (!mirrorColumn?.mirrorsEntireBoard) {
      return;
    }
    const mirrorCards = cardsByColumn[columnId] ?? [];
    const usedSourceEntryIds = new Set<string>();
    const suggestions: PendingMirrorLinkSuggestion[] = mirrorCards.flatMap((card) => {
      if (card.mirroredFromEntryId) {
        return [];
      }

      const normalizedTitle = normalizeTitleForComparison(card.title);

      if (!normalizedTitle) {
        return [];
      }

      for (const column of columns) {
        if (column.id === columnId || column.mirrorsEntireBoard) {
          continue;
        }

        const sourceCard = (cardsByColumn[column.id] ?? []).find(
          (candidate) =>
            !candidate.mirroredFromEntryId &&
            normalizeTitleForComparison(candidate.title) === normalizedTitle,
        );

        if (sourceCard && sourceCard.itemId !== card.itemId) {
          usedSourceEntryIds.add(sourceCard.entryId);
          return [
            {
              id: `${card.entryId}:${sourceCard.entryId}`,
              kind: "link" as const,
              mirrorColumnId: columnId,
              mirrorEntryId: card.entryId,
              mirrorTitle: card.title,
              sourceEntryId: sourceCard.entryId,
              sourceItemId: sourceCard.itemId,
              sourceCardTitle: sourceCard.title,
              sourceSeries: sourceCard.series,
              sourceImageUrl: sourceCard.imageUrl,
              sourceImageStoragePath: sourceCard.imageStoragePath,
              sourceReleaseYear: sourceCard.releaseYear,
              sourceNotes: sourceCard.notes,
              sourceCustomFieldValues: sourceCard.customFieldValues,
              sourceColumnTitle: column.title,
              enabled: true,
              rank: Math.max(1, mirrorCards.findIndex((mirrorCard) => mirrorCard.entryId === card.entryId) + 1),
            },
          ];
        }
      }

      return [];
    });

    const existingNormalizedMirrorTitles = new Set(
      mirrorCards.map((card) => normalizeTitleForComparison(card.title)).filter(Boolean),
    );

    for (const column of columns) {
      if (column.id === columnId || column.mirrorsEntireBoard || column.excludeFromBoardMirrors) {
        continue;
      }

      for (const sourceCard of cardsByColumn[column.id] ?? []) {
        if (sourceCard.mirroredFromEntryId || usedSourceEntryIds.has(sourceCard.entryId)) {
          continue;
        }

        const normalizedTitle = normalizeTitleForComparison(sourceCard.title);

        if (!normalizedTitle || existingNormalizedMirrorTitles.has(normalizedTitle)) {
          continue;
        }

        suggestions.push({
          id: `create:${sourceCard.entryId}`,
          kind: "create",
          mirrorColumnId: columnId,
          mirrorTitle: sourceCard.title,
          sourceEntryId: sourceCard.entryId,
          sourceItemId: sourceCard.itemId,
          sourceCardTitle: sourceCard.title,
          sourceSeries: sourceCard.series,
          sourceImageUrl: sourceCard.imageUrl,
          sourceImageStoragePath: sourceCard.imageStoragePath,
          sourceReleaseYear: sourceCard.releaseYear,
          sourceNotes: sourceCard.notes,
          sourceCustomFieldValues: sourceCard.customFieldValues,
          sourceColumnTitle: column.title,
          enabled: false,
          rank: 1,
        });
      }
    }

    setPendingMirrorLinkSuggestions(suggestions);

    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnMirrorMenuId(null);
  }

  function togglePendingMirrorLinkSuggestion(suggestionId: string) {
    setPendingMirrorLinkSuggestions((current) =>
      current?.map((suggestion) =>
        suggestion.id === suggestionId
          ? {
              ...suggestion,
              enabled: !suggestion.enabled,
            }
          : suggestion,
      ) ?? current,
    );
  }

  function applyPendingMirrorLinkSuggestions() {
    if (!pendingMirrorLinkSuggestions) {
      return;
    }

    const enabledSuggestions = pendingMirrorLinkSuggestions.filter((suggestion) => suggestion.enabled);

    if (enabledSuggestions.length === 0) {
      setPendingMirrorLinkSuggestions(null);
      return;
    }

    let nextCardsSnapshot: Record<string, CardEntry[]> | null = null;
    let nextColumnsSnapshot: ColumnDefinition[] | null = null;

    setColumns((current) => {
      const enabledSourceIdsByMirrorColumn = enabledSuggestions.reduce<Record<string, string[]>>((acc, suggestion) => {
        acc[suggestion.mirrorColumnId] = [...(acc[suggestion.mirrorColumnId] ?? []), suggestion.sourceItemId];
        return acc;
      }, {});
      const nextColumns = current.map((column) => {
        const sourceItemIds = enabledSourceIdsByMirrorColumn[column.id];

        if (!sourceItemIds?.length) {
          return column;
        }

        return {
          ...column,
          excludedMirrorItemIds: (column.excludedMirrorItemIds ?? []).filter(
            (itemId) => !sourceItemIds.includes(itemId),
          ),
        };
      });
      latestColumnsRef.current = nextColumns;
      nextColumnsSnapshot = nextColumns;
      return nextColumns;
    });

    setCardsByColumn((current) => {
      const nextState = { ...current };

      for (const [mirrorColumnId, columnSuggestions] of Object.entries(
        enabledSuggestions.reduce<Record<string, typeof enabledSuggestions>>((acc, suggestion) => {
          acc[suggestion.mirrorColumnId] = [...(acc[suggestion.mirrorColumnId] ?? []), suggestion];
          return acc;
        }, {}),
      )) {
        let mirrorCards = [...(nextState[mirrorColumnId] ?? [])];

        for (const suggestion of columnSuggestions.filter((item) => item.kind === "link")) {
          mirrorCards = mirrorCards.map((mirrorCard) =>
            mirrorCard.entryId === suggestion.mirrorEntryId
              ? {
                  ...mirrorCard,
                  itemId: suggestion.sourceItemId,
                  title: suggestion.sourceCardTitle,
                  imageUrl: suggestion.sourceImageUrl,
                  imageStoragePath: suggestion.sourceImageStoragePath,
                  series: suggestion.sourceSeries,
                  releaseYear: suggestion.sourceReleaseYear,
                  notes: suggestion.sourceNotes,
                  customFieldValues: suggestion.sourceCustomFieldValues,
                  mirroredFromEntryId: suggestion.sourceEntryId,
                }
              : mirrorCard,
          );
        }

        for (const suggestion of columnSuggestions
          .filter((item) => item.kind === "create")
          .sort((a, b) => a.rank - b.rank)) {
          const insertionIndex = Math.max(0, Math.min(mirrorCards.length, suggestion.rank - 1));
          mirrorCards.splice(insertionIndex, 0, {
            entryId: makeId("mirror"),
            itemId: suggestion.sourceItemId,
            title: suggestion.sourceCardTitle,
            imageUrl: suggestion.sourceImageUrl,
            imageStoragePath: suggestion.sourceImageStoragePath,
            series: suggestion.sourceSeries,
            releaseYear: suggestion.sourceReleaseYear,
            notes: suggestion.sourceNotes,
            customFieldValues: suggestion.sourceCustomFieldValues,
            mirroredFromEntryId: suggestion.sourceEntryId,
          });
        }

        nextState[mirrorColumnId] = mirrorCards;
      }

      const syncedNextState = syncBoardMirrorColumns(columns, nextState);
      latestCardsByColumnRef.current = syncedNextState;
      nextCardsSnapshot = syncedNextState;
      return syncedNextState;
    });

    setPendingMirrorLinkSuggestions(null);
    if (nextCardsSnapshot) {
      queuePersistBoardState({
        columns: nextColumnsSnapshot ?? undefined,
        cardsByColumn: nextCardsSnapshot,
        debounceMs: 250,
      });
    }
  }

  function unlinkMirroredCard(entryId: string) {
    const columnId = findColumnIdForEntry(entryId);
    const column = columnId ? columns.find((item) => item.id === columnId) : null;
    const card = columnId ? (cardsByColumn[columnId] ?? []).find((item) => item.entryId === entryId) : null;

    if (!columnId || !column || !card) {
      return;
    }

    const nextItemId = makeId("item");
    let nextCardsSnapshot: Record<string, CardEntry[]> | null = null;
    let nextColumnsSnapshot: ColumnDefinition[] | null = null;

    setCardsByColumn((current) => {
      const nextState = {
        ...current,
        [columnId]: (current[columnId] ?? []).map((currentCard) =>
          currentCard.entryId === entryId
            ? {
                ...currentCard,
                itemId: nextItemId,
                mirroredFromEntryId: undefined,
              }
            : currentCard,
        ),
      };
      latestCardsByColumnRef.current = nextState;
      nextCardsSnapshot = nextState;
      return nextState;
    });

    setColumns((current) => {
      const shouldExcludeOriginal = Boolean(card.mirroredFromEntryId);
      const nextColumns = current.map((currentColumn) =>
        currentColumn.id === columnId && shouldExcludeOriginal
          ? {
              ...currentColumn,
              excludedMirrorItemIds: Array.from(
                new Set([...(currentColumn.excludedMirrorItemIds ?? []), card.itemId]),
              ),
            }
          : currentColumn,
      );
      latestColumnsRef.current = nextColumns;
      nextColumnsSnapshot = nextColumns;
      return nextColumns;
    });

    setEditingCardItemId(nextItemId);
    setEditingCardDraft((current) => (current ? { ...current } : current));
    queuePersistBoardState({
      columns: nextColumnsSnapshot ?? undefined,
      cardsByColumn: nextCardsSnapshot ?? undefined,
    });
  }

  function syncBoardMirrorColumns(
    currentColumns: ColumnDefinition[],
    currentCardsByColumn: Record<string, CardEntry[]>,
  ) {
    let didChange = false;
    const nextState = { ...currentCardsByColumn };
    const boardMirrorColumns = currentColumns.filter((column) => column.mirrorsEntireBoard);

    for (const mirrorColumn of boardMirrorColumns) {
      const existingMirrorCards = currentCardsByColumn[mirrorColumn.id] ?? [];
      const sourceCardsInOrder: CardEntry[] = [];

      for (const column of currentColumns) {
        if (column.id === mirrorColumn.id || column.mirrorsEntireBoard || column.excludeFromBoardMirrors) {
          continue;
        }

        for (const sourceCard of currentCardsByColumn[column.id] ?? []) {
          if (sourceCard.mirroredFromEntryId) {
            continue;
          }

          sourceCardsInOrder.push(sourceCard);
        }
      }

      const sourceById = new Map(sourceCardsInOrder.map((card) => [card.entryId, card]));
      const sourceByNormalizedTitle = new Map(
        sourceCardsInOrder.map((card) => [normalizeTitleForComparison(card.title), card]),
      );
      const excludedMirrorItemIds = new Set(mirrorColumn.excludedMirrorItemIds ?? []);
      const syncedCards: CardEntry[] = [];
      const newMirrorCards: CardEntry[] = [];

      for (const existingMirror of existingMirrorCards) {
        const sourceId = existingMirror.mirroredFromEntryId;
        const linkedSource = sourceId ? sourceById.get(sourceId) : null;
        const matchedSource =
          linkedSource ??
          (sourceId
            ? sourceByNormalizedTitle.get(normalizeTitleForComparison(existingMirror.title))
            : null);

        if (matchedSource) {
          if (excludedMirrorItemIds.has(matchedSource.itemId)) {
            if (!sourceId) {
              syncedCards.push({
                ...existingMirror,
                mirroredFromEntryId: undefined,
              });
            }
            sourceById.delete(matchedSource.entryId);
            sourceByNormalizedTitle.delete(normalizeTitleForComparison(matchedSource.title));
            continue;
          }

          syncedCards.push({
            ...matchedSource,
            entryId: existingMirror.entryId,
            mirroredFromEntryId: matchedSource.entryId,
          });
          sourceById.delete(matchedSource.entryId);
          sourceByNormalizedTitle.delete(normalizeTitleForComparison(matchedSource.title));
          continue;
        }

        if (!sourceId) {
          syncedCards.push(existingMirror);
        }
      }

      for (const sourceCard of sourceCardsInOrder) {
        const normalizedTitle = normalizeTitleForComparison(sourceCard.title);

        if (
          excludedMirrorItemIds.has(sourceCard.itemId) ||
          !sourceById.has(sourceCard.entryId) ||
          existingMirrorCards.some(
            (card) =>
              card.mirroredFromEntryId === sourceCard.entryId ||
              card.itemId === sourceCard.itemId ||
              normalizeTitleForComparison(card.title) === normalizedTitle,
          )
        ) {
          continue;
        }

        newMirrorCards.push({
          ...sourceCard,
          entryId: makeId("mirror"),
          mirroredFromEntryId: sourceCard.entryId,
        });
      }

      const nextMirrorCards = [...newMirrorCards, ...syncedCards];

      const currentSerialized = JSON.stringify(existingMirrorCards);
      const nextSerialized = JSON.stringify(nextMirrorCards);

      if (currentSerialized !== nextSerialized) {
        nextState[mirrorColumn.id] = nextMirrorCards;
        didChange = true;
      }
    }

    return didChange ? nextState : currentCardsByColumn;
  }

  function handleDragEnd(event: DragEndEvent) {
    setIsCardDragging(false);
    setIsDragGapSuppressed(false);
    setDragPointerKind(null);
    dragPointerCoordsRef.current = null;
    setActiveDragEntryId(null);

    if (filtering || !event.over) {
      return;
    }

    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    const parsedDropTarget = parseDropTargetId(overId);
    const sourceColumnId = findColumnIdForEntry(activeId);
    const overColumnId = parsedDropTarget
      ? parsedDropTarget.columnId
      : columns.some((column) => column.id === overId)
        ? overId
        : findColumnIdForEntry(overId);

    if (!sourceColumnId || !overColumnId) {
      return;
    }

    const sourceCards = cardsByColumn[sourceColumnId] ?? [];
    const destinationCards = cardsByColumn[overColumnId] ?? [];
    const sourceColumn = columns.find((column) => column.id === sourceColumnId);
    const destinationColumn = columns.find((column) => column.id === overColumnId);
    const sourceIndex = sourceCards.findIndex((card) => card.entryId === activeId);

    if (sourceIndex < 0) {
      return;
    }

    const getColumnScrollElement = (columnId: string) =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-column-scroll-id]")).find(
        (element) => element.dataset.columnScrollId === columnId,
      ) ?? null;

    const movedCard = sourceCards[sourceIndex];
    let destinationIndex = destinationCards.length;

    if (parsedDropTarget) {
      destinationIndex = parsedDropTarget.insertIndex;
    } else if (columns.some((column) => column.id === overId)) {
      destinationIndex = destinationCards.length;
    } else {
      const overIndex = destinationCards.findIndex((card) => card.entryId === overId);

      if (overIndex >= 0) {
        destinationIndex =
          sourceColumnId === overColumnId && sourceIndex < overIndex ? overIndex + 1 : overIndex;
      }
    }

    if (sourceColumnId === overColumnId) {
      if (sourceColumn && isColumnAutoSorted(sourceColumn)) {
        return;
      }

      const adjustedDestinationIndex =
        sourceIndex < destinationIndex ? destinationIndex - 1 : destinationIndex;

      if (adjustedDestinationIndex === sourceIndex) {
        return;
      }

      const reorderedCards = [...sourceCards];
      const [removedCard] = reorderedCards.splice(sourceIndex, 1);
      reorderedCards.splice(adjustedDestinationIndex, 0, removedCard);
      const sourceScrollTop = getColumnScrollElement(sourceColumnId)?.scrollTop ?? null;

      const nextState = {
        ...latestCardsByColumnRef.current,
        [sourceColumnId]: reorderedCards,
      };
      setCardsByColumn((current) => ({
        ...current,
        [sourceColumnId]: reorderedCards,
      }));
      latestCardsByColumnRef.current = nextState;
      queuePersistBoardState({
        cardsByColumn: nextState,
        debounceMs: 900,
      });
      if (sourceScrollTop !== null) {
        window.requestAnimationFrame(() => {
          const nextElement = getColumnScrollElement(sourceColumnId);
          if (nextElement) {
            nextElement.scrollTop = sourceScrollTop;
          }
        });
      }

      return;
    }

    const nextSourceCards = sourceCards.filter((card) => card.entryId !== activeId);
    const nextDestinationCards = [...destinationCards];
    const destinationScrollTop = getColumnScrollElement(overColumnId)?.scrollTop ?? null;

    nextDestinationCards.splice(destinationIndex, 0, movedCard);
    const normalizedDestinationCards =
      destinationColumn ? applyColumnSortMode(destinationColumn, nextDestinationCards) : nextDestinationCards;

    const nextState = syncBoardMirrorColumns(
      columns,
      reconcileMirrorForMove(
      {
        ...cardsByColumn,
        [sourceColumnId]: nextSourceCards,
        [overColumnId]: normalizedDestinationCards,
      },
      movedCard,
      sourceColumnId,
      overColumnId,
      ),
    );

    latestCardsByColumnRef.current = nextState;
    setCardsByColumn(nextState);
    queuePersistBoardState({ cardsByColumn: nextState, debounceMs: 900 });
    if (destinationScrollTop !== null) {
      window.requestAnimationFrame(() => {
        const nextElement = getColumnScrollElement(overColumnId);
        if (nextElement) {
          nextElement.scrollTop = destinationScrollTop;
        }
      });
    }
  }

  function handleDraftSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!addCardTarget) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? draft.title).trim() || `Untitled ${boardVocabulary.singular}`;
    const series = String(formData.get("series") ?? draft.series).trim();
    const imageUrl = String(formData.get("imageUrl") ?? draft.imageUrl).trim();
    const notes = String(formData.get("notes") ?? draft.notes).trim();
    const releaseYear = String(formData.get("releaseYear") ?? draft.releaseYear).trim();
    const columnId = String(formData.get("columnId") ?? draft.columnId).trim();
    const newColumnTitle = String(formData.get("newColumnTitle") ?? draft.newColumnTitle).trim();
    const selectedColumnId =
      columnId === NEW_COLUMN_OPTION ? "" : columnId || addCardTarget.columnId;
    const duplicate = selectedColumnId
      ? findDuplicateCard(title, selectedColumnId)
      : null;

    if (duplicate) {
      setDraftDuplicateAction({
        match: duplicate,
        title,
        imageUrl,
        series,
        releaseYear,
        notes,
        customFields: { ...draft.customFields },
      });
      return;
    }

    finalizeAddCard(
      title,
      series,
      imageUrl,
      notes,
      releaseYear,
      { ...draft.customFields },
      columnId,
      newColumnTitle,
    );
  }

  function finalizeAddCard(
    title: string,
    series: string,
    imageUrl: string,
    notes: string,
    releaseYear: string,
    customFieldValues: Record<string, string>,
    selectedColumnIdOverride?: string,
    newColumnTitleOverride?: string,
  ) {
    if (!addCardTarget) {
      return;
    }

    let nextColumns = columns;
    const selectedColumnId = selectedColumnIdOverride ?? draft.columnId;
    const newColumnTitle = newColumnTitleOverride ?? draft.newColumnTitle;
    let destinationColumnId = selectedColumnId || addCardTarget.columnId;
    let destinationInsertIndex = addCardTarget.insertIndex;
    let nextCardsByColumn = cardsByColumn;

    if (selectedColumnId === NEW_COLUMN_OPTION) {
      const newColumn = createColumnDefinition(columns.length + 1, newColumnTitle);
      nextColumns = [...columns, newColumn];
      destinationColumnId = newColumn.id;
      destinationInsertIndex = 0;
      nextCardsByColumn = {
        ...cardsByColumn,
        [newColumn.id]: [],
      };
      latestColumnsRef.current = nextColumns;
      setColumns(nextColumns);
    } else if (destinationColumnId !== addCardTarget.columnId) {
      destinationInsertIndex = (nextCardsByColumn[destinationColumnId] ?? []).length;
    }

    const itemId = makeId("item");
    const newCard: CardEntry = {
      entryId: makeId("entry"),
      itemId,
      title,
      imageUrl,
      imageStoragePath: draft.imageStoragePath,
      series,
      releaseYear: releaseYear || undefined,
      notes: notes || undefined,
      customFieldValues: Object.fromEntries(
        Object.entries(customFieldValues).filter(([, value]) => value.trim().length > 0),
      ),
    };

    const column = nextColumns.find((item) => item.id === destinationColumnId);
    const destinationCards = nextCardsByColumn[destinationColumnId] ?? [];
    const nextDestinationCards = [...destinationCards];

    if (column && isColumnAutoSorted(column)) {
      nextDestinationCards.push(newCard);
    } else {
      nextDestinationCards.splice(destinationInsertIndex, 0, newCard);
    }

    let nextState = {
      ...nextCardsByColumn,
      [destinationColumnId]: column ? applyColumnSortMode(column, nextDestinationCards) : nextDestinationCards,
    };

    if (column?.autoMirrorToColumnId) {
      nextState = addMirroredCard(nextState, newCard, column.autoMirrorToColumnId);
    }

    latestCardsByColumnRef.current = nextState;
    setCardsByColumn(nextState);
    setDraft(initialDraft);
    setAddCardTarget(null);
    setDraftDuplicateAction(null);
    void persistBoardState({
      columns: nextColumns,
      cardsByColumn: nextState,
    });
    queuePersistBoardState({
      columns: nextColumns,
      cardsByColumn: nextState,
    });
  }

  function openAddGameModal(columnId: string, insertIndex: number) {
    setMobileFocusedColumnId(columnId);
    setDraft({
      ...initialDraft,
      columnId,
    });
    setAddCardTarget({ columnId, insertIndex });
    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnFilterMenuId(null);
    setOpenColumnMirrorMenuId(null);
    setDraftDuplicateAction(null);
  }

  function closeAddGameModal() {
    setAddCardTarget(null);
    setDraft(initialDraft);
    setDraftDuplicateAction(null);
    setArtworkPicker(null);
    setIsAddFieldSettingsOpen(false);
  }

  function openQuickAddModal() {
    const tierListDefaultColumnId =
      activeBoardLayout === "tier-list" ? getTierListUnsortedColumnId(columns) : "";
    const focusedColumnId =
      tierListDefaultColumnId ||
      getFocusedColumnIdFromLane(boardLaneRef.current) ||
      mobileFocusedColumnId ||
      columns.find((column) => !column.mirrorsEntireBoard)?.id ||
      "";
    const fallbackColumnId = focusedColumnId;
    const selectedColumnId = fallbackColumnId || NEW_COLUMN_OPTION;
    const insertIndex = fallbackColumnId
      ? (cardsByColumn[fallbackColumnId] ?? []).length
      : 0;

    setDraft({
      ...initialDraft,
      columnId: selectedColumnId,
    });
    setAddCardTarget({
      columnId: fallbackColumnId,
      insertIndex,
    });
    setIsMobileActionsOpen(false);
    setIsActionsMenuOpen(false);
    setDraftDuplicateAction(null);
  }

  function handleDeleteCard(columnId: string, entryId: string) {
    const column = columns.find((item) => item.id === columnId);
    const card = cardsByColumn[columnId]?.find((item) => item.entryId === entryId);

    if (!card) {
      return;
    }

    if (column?.mirrorsEntireBoard && card.mirroredFromEntryId) {
      setPendingMirrorDelete({
        columnId,
        entryId,
        itemId: card.itemId,
        title: card.title,
        columnTitle: column.title,
      });
      return;
    }

    if (card.mirroredFromEntryId || column?.mirrorsEntireBoard) {
      let nextStateSnapshot: Record<string, CardEntry[]> | null = null;

      setCardsByColumn((current) => {
        const nextState: Record<string, CardEntry[]> = {};

        for (const [currentColumnId, cards] of Object.entries(current)) {
          nextState[currentColumnId] = cards.filter((item) => item.itemId !== card.itemId);
        }

        latestCardsByColumnRef.current = nextState;
        nextStateSnapshot = nextState;
        return nextState;
      });
      setColumns((current) =>
        current.map((item) => ({
          ...item,
          excludedMirrorItemIds: (item.excludedMirrorItemIds ?? []).filter(
            (excludedItemId) => excludedItemId !== card.itemId,
          ),
        })),
      );
      setEditingCardId((current) => (current === entryId ? null : current));
      queuePersistBoardState(nextStateSnapshot ? { cardsByColumn: nextStateSnapshot } : undefined);
      return;
    }

    let nextState = {
      ...cardsByColumn,
      [columnId]: (cardsByColumn[columnId] ?? []).filter(
        (item) => item.entryId !== entryId,
      ),
    };

    if (column?.autoMirrorToColumnId) {
      nextState = removeMirroredCard(nextState, entryId, column.autoMirrorToColumnId);
    }

    latestCardsByColumnRef.current = nextState;
    setCardsByColumn(nextState);
    setEditingCardId((current) => (current === entryId ? null : current));
    queuePersistBoardState({ cardsByColumn: nextState });
  }

  function requestDeleteCard(columnId: string, entryId: string) {
    const card = (cardsByColumn[columnId] ?? []).find((item) => item.entryId === entryId);

    if (!card) {
      return;
    }

    setPendingCardDelete({
      columnId,
      entryId,
      title: card.title,
    });
  }

  function openMoveCardModal(card: CardEntry) {
    const sourceColumnId = findColumnIdForEntry(card.entryId);

    if (!sourceColumnId) {
      return;
    }

    const sourceCards = cardsByColumn[sourceColumnId] ?? [];
    const sourceIndex = sourceCards.findIndex((item) => item.entryId === card.entryId);
    setMoveCardState({
      entryId: card.entryId,
      itemId: card.itemId,
      title: card.title,
      sourceColumnId,
      targetColumnId: sourceColumnId,
      targetRank: sourceIndex >= 0 ? String(sourceIndex + 1) : "1",
    });
  }

function copyCardToDraft(card: CardEntry) {
    const sourceColumnId = findColumnIdForEntry(card.entryId) ?? columns.find((column) => !column.mirrorsEntireBoard)?.id ?? "";
    setDraft({
      title: card.title,
      imageUrl: card.imageUrl,
      imageStoragePath: card.imageStoragePath,
      series: card.series,
      releaseYear: card.releaseYear ?? "",
      notes: card.notes ?? "",
      customFields: { ...(card.customFieldValues ?? {}) },
      columnId: sourceColumnId || NEW_COLUMN_OPTION,
      newColumnTitle: "",
    });
    setAddCardTarget({
      columnId: sourceColumnId,
      insertIndex: (cardsByColumn[sourceColumnId] ?? []).length,
    });
    cancelEditingCard();
  }

  function confirmMoveCard() {
    if (!moveCardState) {
      return;
    }

    const sourceCards = cardsByColumn[moveCardState.sourceColumnId] ?? [];
    const sourceIndex = sourceCards.findIndex((card) => card.entryId === moveCardState.entryId);

    if (sourceIndex < 0) {
      setMoveCardState(null);
      return;
    }

    const movedCard = sourceCards[sourceIndex];
    const nextSourceCards = sourceCards.filter((card) => card.entryId !== moveCardState.entryId);
    const targetColumn = columns.find((column) => column.id === moveCardState.targetColumnId);
    const targetCardsBase =
      moveCardState.targetColumnId === moveCardState.sourceColumnId
        ? nextSourceCards
        : [...(cardsByColumn[moveCardState.targetColumnId] ?? [])];
    const requestedRank = Number.parseInt(moveCardState.targetRank, 10);
    const insertIndex = Number.isFinite(requestedRank)
      ? Math.max(0, Math.min(targetCardsBase.length, requestedRank - 1))
      : targetCardsBase.length;
    const nextTargetCards = [...targetCardsBase];

    if (targetColumn && isColumnAutoSorted(targetColumn)) {
      nextTargetCards.push(movedCard);
    } else {
      nextTargetCards.splice(insertIndex, 0, movedCard);
    }

    const nextState = syncBoardMirrorColumns(
      columns,
      reconcileMirrorForMove(
      {
        ...cardsByColumn,
        [moveCardState.sourceColumnId]: moveCardState.targetColumnId === moveCardState.sourceColumnId ? [] : nextSourceCards,
        [moveCardState.targetColumnId]: targetColumn ? applyColumnSortMode(targetColumn, nextTargetCards) : nextTargetCards,
      },
      movedCard,
      moveCardState.sourceColumnId,
      moveCardState.targetColumnId,
      ),
    );

    if (moveCardState.targetColumnId === moveCardState.sourceColumnId) {
      nextState[moveCardState.sourceColumnId] = targetColumn
        ? applyColumnSortMode(targetColumn, nextTargetCards)
        : nextTargetCards;
    }

    latestCardsByColumnRef.current = nextState;
    setCardsByColumn(nextState);
    setMoveCardState(null);
    cancelEditingCard();
    queuePersistBoardState({ cardsByColumn: nextState });
  }

  function requestMoveAllCards(columnId: string) {
    const sourceColumn = columns.find((column) => column.id === columnId);

    if (!sourceColumn) {
      return;
    }

    const eligibleTargets = columns.filter((column) => column.id !== columnId);

    if (eligibleTargets.length === 0) {
      return;
    }

    setMoveAllCardsState({
      sourceColumnId: columnId,
      sourceColumnTitle: sourceColumn.title,
      targetColumnId: eligibleTargets[0].id,
      cardCount: (cardsByColumn[columnId] ?? []).length,
    });
    setOpenColumnMenuId(null);
    setOpenColumnMaintenanceMenuId(null);
  }

  function confirmMoveAllCards() {
    if (!moveAllCardsState) {
      return;
    }

    const sourceCards = cardsByColumn[moveAllCardsState.sourceColumnId] ?? [];

    if (sourceCards.length === 0) {
      setMoveAllCardsState(null);
      return;
    }

    const targetColumn = columns.find((column) => column.id === moveAllCardsState.targetColumnId);
    const targetCards = [...(cardsByColumn[moveAllCardsState.targetColumnId] ?? [])];
    const combinedCards = [...targetCards, ...sourceCards];
    const nextTargetCards = targetColumn ? applyColumnSortMode(targetColumn, combinedCards) : combinedCards;
    const nextState = {
      ...latestCardsByColumnRef.current,
      [moveAllCardsState.sourceColumnId]: [],
      [moveAllCardsState.targetColumnId]: nextTargetCards,
    };

    latestCardsByColumnRef.current = nextState;
    setCardsByColumn(nextState);
    setMoveAllCardsState(null);
    queuePersistBoardState({ cardsByColumn: nextState });
  }

  function deleteAllLinkedCopies(itemId: string, entryId: string) {
    let nextStateSnapshot: Record<string, CardEntry[]> | null = null;

    setCardsByColumn((current) => {
      const nextState: Record<string, CardEntry[]> = {};

      for (const [currentColumnId, cards] of Object.entries(current)) {
        nextState[currentColumnId] = cards.filter((item) => item.itemId !== itemId);
      }

      latestCardsByColumnRef.current = nextState;
      nextStateSnapshot = nextState;
      return nextState;
    });
    setColumns((current) =>
      current.map((item) => ({
        ...item,
        excludedMirrorItemIds: (item.excludedMirrorItemIds ?? []).filter(
          (excludedItemId) => excludedItemId !== itemId,
        ),
      })),
    );
    setEditingCardId((current) => (current === entryId ? null : current));
    setPendingMirrorDelete(null);
    queuePersistBoardState(nextStateSnapshot ? { cardsByColumn: nextStateSnapshot } : undefined);
  }

  function deleteOnlyMirrorCopy(columnId: string, entryId: string, itemId: string) {
    setColumns((current) =>
      current.map((item) =>
        item.id === columnId
          ? {
              ...item,
              excludedMirrorItemIds: Array.from(
                new Set([...(item.excludedMirrorItemIds ?? []), itemId]),
              ),
            }
          : item,
      ),
    );
    const nextState = {
      ...latestCardsByColumnRef.current,
      [columnId]: (latestCardsByColumnRef.current[columnId] ?? []).filter((item) => item.entryId !== entryId),
    };
    latestCardsByColumnRef.current = nextState;
    setCardsByColumn(nextState);
    setEditingCardId((current) => (current === entryId ? null : current));
    setPendingMirrorDelete(null);
    queuePersistBoardState({ cardsByColumn: nextState });
  }

  function handleAutofillDraftImage(mode: ArtworkSearchMode = "image") {
    openGoogleImageSearch(draft.title, mode);
  }

  function openArtworkUploadPicker(target: "draft" | "edit") {
    if (target === "draft") {
      addArtworkInputRef.current?.click();
      return;
    }

    editArtworkInputRef.current?.click();
  }

  async function handleArtworkFileSelection(
    target: "draft" | "edit",
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsUploadingArtwork(true);
    setSaveErrorMessage(null);
    let uploadSucceeded = false;

    try {
      const optimized = await optimizeImageFile(file);
      let nextImageUrl = "";
      let nextStoragePath: string | undefined;

      if (supabase && currentUser) {
        const uploaded = await uploadArtworkToStorage(
          supabase,
          currentUser.id,
          optimized.file,
          optimized.filename,
        );
        nextImageUrl = uploaded.publicUrl;
        nextStoragePath = uploaded.path;
      } else {
        nextImageUrl = await blobToDataUrl(optimized.file);
      }

      if (target === "draft") {
        setDraft((current) => ({
          ...current,
          imageUrl: nextImageUrl,
          imageStoragePath: nextStoragePath,
        }));
      } else {
        setEditingCardDraft((current) =>
          current
            ? {
                ...current,
                imageUrl: nextImageUrl,
                imageStoragePath: nextStoragePath,
              }
            : current,
        );
      }

      uploadSucceeded = true;
    } catch (error) {
      console.error(error);
      setSaveState("error");
      setSaveErrorMessage(error instanceof Error ? error.message : "Artwork could not be uploaded.");
    } finally {
      setIsUploadingArtwork(false);
      if (uploadSucceeded) {
        if (target === "draft") {
          setIsAddFieldSettingsOpen(false);
        } else {
          setIsEditFieldSettingsOpen(false);
        }
        setArtworkPicker(null);
      }
    }
  }

  function startEditingCard(card: CardEntry) {
    setEditingCardId(card.entryId);
    setEditingCardItemId(card.itemId);
    setEditingCardDraft(createCardDraft(card));
    setEditingDuplicateAction(null);
  }

  function cancelEditingCard() {
    setEditingCardId(null);
    setEditingCardItemId(null);
    setEditingCardDraft(null);
    setEditingDuplicateAction(null);
    setIsEditFieldSettingsOpen(false);
  }

  function handleEditingCardSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingCardDraft || !editingCardItemId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? editingCardDraft.title).trim() || `Untitled ${boardVocabulary.singular}`;
    const imageUrl = String(formData.get("imageUrl") ?? editingCardDraft.imageUrl).trim();
    const imageStoragePath = editingCardDraft.imageStoragePath;
    const series = String(formData.get("series") ?? editingCardDraft.series).trim();
    const releaseYear = String(formData.get("releaseYear") ?? editingCardDraft.releaseYear).trim();
    const notes = String(formData.get("notes") ?? editingCardDraft.notes).trim();
    const editingColumnId = editingCardId ? findColumnIdForEntry(editingCardId) : null;
    const duplicate = editingColumnId
      ? findDuplicateCard(title, editingColumnId, editingCardItemId)
      : null;

    if (duplicate) {
      setEditingDuplicateAction({
        match: duplicate,
        title,
        imageUrl,
        series,
        releaseYear,
        notes,
        customFields: { ...editingCardDraft.customFields },
      });
      return;
    }

    updateCardsForItem(editingCardItemId, (card) => ({
      ...card,
      title,
      imageUrl,
      imageStoragePath,
      series,
      releaseYear: releaseYear || undefined,
      notes: notes || undefined,
      customFieldValues: Object.fromEntries(
        Object.entries(editingCardDraft.customFields).filter(([, value]) => value.trim().length > 0),
      ),
    }));

    cancelEditingCard();
  }

  function getMirroredSiblingColumnTitle(entryId: string | null) {
    const siblingCard = getCardLinkedSiblings(cardsByColumn, entryId)[0];
    if (!siblingCard) {
      return null;
    }
    const siblingColumnId = findColumnIdForEntry(siblingCard.entryId);
    return columns.find((column) => column.id === siblingColumnId)?.title ?? null;
  }

  function requestUnlinkMirroredCard(entryId: string | null) {
    if (!entryId) {
      return;
    }

    const siblingCard = getCardLinkedSiblings(cardsByColumn, entryId)[0];
    const currentCard = Object.values(cardsByColumn)
      .flat()
      .find((card) => card.entryId === entryId);

    if (siblingCard && currentCard) {
      setPendingMirrorUnlink({
        entryId,
        title: currentCard.title,
        siblingColumnTitle: getMirroredSiblingColumnTitle(entryId),
      });
    }
  }

  function autofillEditingCardImage(mode: ArtworkSearchMode = "image") {
    if (!editingCardDraft) {
      return;
    }

    openGoogleImageSearch(editingCardDraft.title, mode);
  }

  function selectArtworkOption(imageUrl: string) {
    if (!artworkPicker) {
      return;
    }

    if (artworkPicker.target === "draft") {
      setDraft((current) => ({
        ...current,
        imageUrl,
      }));
    } else {
      setEditingCardDraft((current) =>
        current
          ? {
              ...current,
              imageUrl,
            }
          : current,
      );
    }

    setArtworkPicker(null);
  }

  function startEditingColumn(column: ColumnDefinition) {
    setEditingColumnId(column.id);
    setEditingColumnDraft({
      title: column.title,
    });
    setOpenColumnMenuId(null);
  }

  function cancelEditingColumn() {
    setEditingColumnId(null);
    setEditingColumnDraft(null);
  }

  function saveEditingColumn(columnId: string) {
    if (!editingColumnDraft) {
      return;
    }

    setColumns((current) =>
      current.map((column) =>
        column.id === columnId
          ? {
              ...column,
              title: editingColumnDraft.title.trim() || column.title,
            }
          : column,
      ),
    );

    cancelEditingColumn();
    queuePersistBoardState();
  }

  function toggleBoardMirrorColumn(columnId: string) {
    updateColumnsAndPersist((current) =>
      current.map((column) =>
        column.id === columnId
          ? {
              ...column,
              mirrorsEntireBoard: !column.mirrorsEntireBoard,
            }
          : column,
      ),
    );
  }

  function toggleExcludeColumnFromBoardMirrors(columnId: string) {
    updateColumnsAndPersist((current) =>
      current.map((column) =>
        column.id === columnId
          ? {
              ...column,
              excludeFromBoardMirrors: !column.excludeFromBoardMirrors,
            }
          : column,
      ),
    );
  }

  function toggleColumnDontRank(columnId: string) {
    updateColumnsAndPersist((current) =>
      current.map((column) =>
        column.id === columnId
          ? {
              ...column,
              dontRank: !column.dontRank,
              sortMode: column.dontRank ? "manual" : getColumnSortMode(column),
            }
          : column,
      ),
    );
  }

  function toggleColumnSortMode(columnId: string, mode: Extract<ColumnSortMode, "title-asc" | "title-desc">) {
    const column = columns.find((item) => item.id === columnId);

    if (!column) {
      return;
    }

    const nextSortMode: ColumnSortMode = getColumnSortMode(column) === mode ? "manual" : mode;
    const nextColumns = columns.map((item) =>
      item.id === columnId
        ? {
            ...item,
            sortMode: nextSortMode,
            dontRank: nextSortMode === "manual" ? true : true,
          }
        : item,
    );
    const targetColumn = nextColumns.find((item) => item.id === columnId) ?? column;
    const nextCards = {
      ...cardsByColumn,
      [columnId]: applyColumnSortMode(targetColumn, cardsByColumn[columnId] ?? []),
    };

    latestColumnsRef.current = nextColumns;
    latestCardsByColumnRef.current = nextCards;
    setColumns(nextColumns);
    setCardsByColumn(nextCards);
    queuePersistBoardState({
      columns: nextColumns,
      cardsByColumn: nextCards,
    });
  }

  function moveColumnToTarget(sourceColumnId: string, targetColumnId: string) {
    if (sourceColumnId === targetColumnId) {
      return;
    }

    updateColumnsAndPersist((current) => {
      const sourceIndex = current.findIndex((column) => column.id === sourceColumnId);
      const targetIndex = current.findIndex((column) => column.id === targetColumnId);

      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }

      const nextColumns = [...current];
      const [movedColumn] = nextColumns.splice(sourceIndex, 1);
      nextColumns.splice(targetIndex, 0, movedColumn);
      return nextColumns;
    });
  }

  function moveColumnByDirection(columnId: string, direction: "left" | "right") {
    const columnIndex = columns.findIndex((column) => column.id === columnId);

    if (columnIndex < 0) {
      return;
    }

    const targetIndex = direction === "left" ? columnIndex - 1 : columnIndex + 1;
    const targetColumn = columns[targetIndex];

    if (!targetColumn) {
      return;
    }

    moveColumnToTarget(columnId, targetColumn.id);
    setOpenColumnMenuId(null);
  }

  function addColumnAt(insertIndex: number) {
    const nextIndex = columns.length + 1;
    const newColumn = createColumnDefinition(nextIndex);

    setColumns((current) => {
      const nextColumns = [...current];
      nextColumns.splice(Math.max(0, Math.min(insertIndex, nextColumns.length)), 0, newColumn);
      return nextColumns;
    });
    setCardsByColumn((current) => ({
      ...current,
      [newColumn.id]: [],
    }));
    setEditingColumnId(newColumn.id);
    setEditingColumnDraft({
      title: newColumn.title,
    });
    queuePersistBoardState({
      columns: [...columns.slice(0, Math.max(0, Math.min(insertIndex, columns.length))), newColumn, ...columns.slice(Math.max(0, Math.min(insertIndex, columns.length)))],
      cardsByColumn: {
        ...cardsByColumn,
        [newColumn.id]: [],
      },
    });
  }

  function deleteColumn(columnId: string) {
    const column = columns.find((item) => item.id === columnId);

    if (!column) {
      return;
    }
    setPendingColumnDelete({ id: column.id, title: column.title });
  }

  function confirmDeleteColumn() {
    if (!pendingColumnDelete) {
      return;
    }

    const columnId = pendingColumnDelete.id;

    const deletedEntryIds = new Set(
      (cardsByColumn[columnId] ?? []).map((card) => card.entryId),
    );

    setColumns((current) =>
      current
        .filter((item) => item.id !== columnId)
        .map((item) =>
          item.autoMirrorToColumnId === columnId
            ? { ...item, autoMirrorToColumnId: undefined }
            : item,
        ),
    );

    setCardsByColumn((current) => {
      const nextState: Record<string, CardEntry[]> = {};

      for (const [currentColumnId, cards] of Object.entries(current)) {
        if (currentColumnId === columnId) {
          continue;
        }

        nextState[currentColumnId] = cards.filter(
          (card) => !deletedEntryIds.has(card.mirroredFromEntryId ?? ""),
        );
      }

      return nextState;
    });

    if (editingColumnId === columnId) {
      cancelEditingColumn();
    }

    setPendingColumnDelete(null);
    setOpenColumnMenuId(null);
    queuePersistBoardState();
  }

  function resolveDraftDuplicate(choice: "discard" | "update" | "duplicate") {
    if (!draftDuplicateAction) {
      return;
    }

    if (choice === "discard") {
      closeAddGameModal();
      return;
    }

    if (choice === "update") {
      updateCardsForItem(draftDuplicateAction.match.card.itemId, (card) => ({
        ...card,
        title: draftDuplicateAction.title,
        imageUrl: draftDuplicateAction.imageUrl || card.imageUrl,
        series: draftDuplicateAction.series || card.series,
        releaseYear: draft.releaseYear.trim() || card.releaseYear,
        notes: draftDuplicateAction.notes || card.notes,
        customFieldValues: {
          ...(card.customFieldValues ?? {}),
          ...(draftDuplicateAction.customFields ?? {}),
        },
      }));
      closeAddGameModal();
      return;
    }

    finalizeAddCard(
      draftDuplicateAction.title,
      draftDuplicateAction.series,
      draftDuplicateAction.imageUrl,
      draftDuplicateAction.notes ?? "",
      draftDuplicateAction.releaseYear ?? "",
      draftDuplicateAction.customFields ?? {},
    );
  }

  function resolveEditingDuplicate(choice: "discard" | "update" | "duplicate") {
    if (!editingDuplicateAction || !editingCardDraft || !editingCardItemId) {
      return;
    }

    if (choice === "discard") {
      cancelEditingCard();
      return;
    }

    if (choice === "update") {
      updateCardsForItem(editingDuplicateAction.match.card.itemId, (card) => ({
        ...card,
        title: editingDuplicateAction.title,
        imageUrl: editingDuplicateAction.imageUrl || card.imageUrl,
        series: editingDuplicateAction.series || card.series,
        releaseYear: editingDuplicateAction.releaseYear || card.releaseYear,
        notes: editingDuplicateAction.notes || card.notes,
        customFieldValues: {
          ...(card.customFieldValues ?? {}),
          ...(editingDuplicateAction.customFields ?? {}),
        },
      }));
      cancelEditingCard();
      return;
    }

    updateCardsForItem(editingCardItemId, (card) => ({
      ...card,
      title: editingDuplicateAction.title,
      imageUrl: editingDuplicateAction.imageUrl,
      series: editingDuplicateAction.series,
      releaseYear: editingDuplicateAction.releaseYear || undefined,
      notes: editingDuplicateAction.notes || undefined,
      customFieldValues: Object.fromEntries(
        Object.entries(editingDuplicateAction.customFields ?? {}).filter(([, value]) => value.trim().length > 0),
      ),
    }));
    cancelEditingCard();
  }

  function sortColumnCards(
    columnId: string,
    mode: "title-asc" | "title-desc",
  ) {
    toggleColumnSortMode(columnId, mode);
  }

  function setColumnTierFilter(columnId: string, tierFilter: TierFilter) {
    setColumnTierFilters((current) => ({
      ...current,
      [columnId]: tierFilter,
    }));
    setOpenColumnFilterMenuId(null);
    setOpenColumnMenuId(null);
    setOpenColumnMirrorMenuId(null);
  }

  function buildNextPairwiseQuizState(
    columnId: string,
    columnTitle: string,
    sortedCards: CardEntry[],
    remainingCards: CardEntry[],
    comparisons: number,
  ) {
    if (remainingCards.length === 0) {
      return null;
    }

    const [candidateCard, ...nextRemainingCards] = remainingCards;

    return {
      columnId,
      columnTitle,
      sortedCards,
      remainingCards: nextRemainingCards,
      candidateCard,
      low: 0,
      high: sortedCards.length,
      compareIndex: Math.floor(sortedCards.length / 2),
      comparisons,
      history: [],
    } satisfies PairwiseQuizState;
  }

  function clonePairwiseQuizState(progress: PairwiseQuizProgress): PairwiseQuizState {
    return {
      ...progress,
      sortedCards: [...progress.sortedCards],
      remainingCards: [...progress.remainingCards],
      candidateCard: progress.candidateCard ? { ...progress.candidateCard } : null,
      history: progress.history.map((step) => ({
        ...step,
        sortedCards: [...step.sortedCards],
        remainingCards: [...step.remainingCards],
        candidateCard: step.candidateCard ? { ...step.candidateCard } : null,
      })),
    };
  }

  function readStoredPairwiseQuizProgress(columnId: string) {
    try {
      const rawValue = window.localStorage.getItem(
        getPairwiseQuizProgressStorageKey(currentUser?.id ?? null),
      );

      if (!rawValue) {
        return null;
      }

      const parsed = JSON.parse(rawValue) as Record<string, PairwiseQuizProgress>;
      return parsed[`${activeBoardId}:${columnId}`] ?? null;
    } catch {
      return null;
    }
  }

  function writeStoredPairwiseQuizProgress(
    columnId: string,
    nextProgress: PairwiseQuizProgress | null,
  ) {
    try {
      const storageKey = getPairwiseQuizProgressStorageKey(currentUser?.id ?? null);
      const rawValue = window.localStorage.getItem(storageKey);
      const parsed = rawValue ? JSON.parse(rawValue) as Record<string, PairwiseQuizProgress> : {};
      const progressKey = `${activeBoardId}:${columnId}`;

      if (nextProgress) {
        parsed[progressKey] = nextProgress;
      } else {
        delete parsed[progressKey];
      }

      if (Object.keys(parsed).length === 0) {
        window.localStorage.removeItem(storageKey);
        return;
      }

      window.localStorage.setItem(storageKey, JSON.stringify(parsed));
    } catch {
      // Ignore local progress persistence failures.
    }
  }

  async function loadSavedPairwiseQuizProgress(columnId: string) {
    if (supabase && currentUser) {
      try {
        const remoteProgress = await loadPairwiseQuizProgress(
          supabase,
          currentUser.id,
          activeBoardId,
          columnId,
        );

        if (remoteProgress) {
          return remoteProgress;
        }
      } catch (error) {
        console.error("Could not load saved pairwise quiz progress.", error);
      }
    }

    return readStoredPairwiseQuizProgress(columnId);
  }

  async function persistPairwiseQuizProgress(columnId: string, nextProgress: PairwiseQuizProgress | null) {
    writeStoredPairwiseQuizProgress(columnId, nextProgress);

    if (supabase && currentUser) {
      if (nextProgress) {
        await savePairwiseQuizProgressRemote(supabase, currentUser.id, activeBoardId, columnId, nextProgress);
      } else {
        await deletePairwiseQuizProgress(supabase, currentUser.id, activeBoardId, columnId);
      }
    }
  }

  function startPairwiseQuizFromScratch(columnId: string) {
    const column = columns.find((item) => item.id === columnId);
    const cards = cardsByColumn[columnId] ?? [];

    if (!column || cards.length < 2) {
      return;
    }

    const [firstCard, ...restCards] = cards;
    const nextState = buildNextPairwiseQuizState(
      column.id,
      column.title,
      [firstCard],
      restCards,
      0,
    );

    void persistPairwiseQuizProgress(columnId, null);
    setPairwiseQuizReview(null);
    setPairwiseQuizState(nextState);
    setPendingPairwiseQuizResume(null);
    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnFilterMenuId(null);
    setOpenColumnMirrorMenuId(null);
    setOpenColumnMaintenanceMenuId(null);
  }

  async function openPairwiseQuiz(columnId: string) {
    const column = columns.find((item) => item.id === columnId);
    const cards = cardsByColumn[columnId] ?? [];

    if (!column || cards.length < 2) {
      return;
    }

    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnFilterMenuId(null);
    setOpenColumnMirrorMenuId(null);
    setOpenColumnMaintenanceMenuId(null);

    const savedProgress = await loadSavedPairwiseQuizProgress(columnId);

    if (savedProgress) {
      setPendingPairwiseQuizResume({
        columnId,
        columnTitle: column.title,
        progress: savedProgress,
      });
      setPairwiseQuizReview(null);
      setPairwiseQuizState(null);
      return;
    }

    startPairwiseQuizFromScratch(columnId);
  }

  function continueSavedPairwiseQuiz() {
    if (!pendingPairwiseQuizResume) {
      return;
    }

    setPairwiseQuizReview(null);
    setPairwiseQuizState(clonePairwiseQuizState(pendingPairwiseQuizResume.progress));
    setPendingPairwiseQuizResume(null);
  }

  async function savePairwiseQuizForLater() {
    if (!pairwiseQuizState) {
      return;
    }

    const nextProgress = {
      ...pairwiseQuizState,
      sortedCards: [...pairwiseQuizState.sortedCards],
      remainingCards: [...pairwiseQuizState.remainingCards],
      candidateCard: pairwiseQuizState.candidateCard ? { ...pairwiseQuizState.candidateCard } : null,
      history: pairwiseQuizState.history.map((step) => ({
        ...step,
        sortedCards: [...step.sortedCards],
        remainingCards: [...step.remainingCards],
        candidateCard: step.candidateCard ? { ...step.candidateCard } : null,
      })),
    } satisfies PairwiseQuizProgress;

    try {
      setIsSavingPairwiseQuiz(true);
      await persistPairwiseQuizProgress(pairwiseQuizState.columnId, nextProgress);
      setPairwiseQuizSavedNotice("Quiz progress saved.");
      setPairwiseQuizState(null);
      window.setTimeout(() => {
        setPairwiseQuizSavedNotice((current) => (current === "Quiz progress saved." ? null : current));
      }, 2200);
    } catch (error) {
      console.error("Could not save pairwise quiz progress.", error);
      setPairwiseQuizSavedNotice("Quiz progress could not be saved.");
      window.setTimeout(() => {
        setPairwiseQuizSavedNotice((current) => (current === "Quiz progress could not be saved." ? null : current));
      }, 2600);
    } finally {
      setIsSavingPairwiseQuiz(false);
    }
  }

  function resolvePairwiseChoice(choice: "candidate" | "comparison") {
    setPairwiseQuizState((current) => {
      if (!current || !current.candidateCard) {
        return current;
      }

      const comparisonCard = current.sortedCards[current.compareIndex];

      if (!comparisonCard) {
        return current;
      }

      const nextLow = choice === "candidate" ? current.low : current.compareIndex + 1;
      const nextHigh = choice === "candidate" ? current.compareIndex : current.high;
      const nextComparisons = current.comparisons + 1;
      const nextHistory = [
        ...current.history,
        {
          sortedCards: [...current.sortedCards],
          remainingCards: [...current.remainingCards],
          candidateCard: current.candidateCard,
          low: current.low,
          high: current.high,
          compareIndex: current.compareIndex,
          comparisons: current.comparisons,
        },
      ];

      if (nextLow >= nextHigh) {
        const nextSortedCards = [...current.sortedCards];
        nextSortedCards.splice(nextLow, 0, current.candidateCard);
        const nextQuizState = buildNextPairwiseQuizState(
          current.columnId,
          current.columnTitle,
          nextSortedCards,
          current.remainingCards,
          nextComparisons,
        );

        if (!nextQuizState) {
          setPairwiseQuizReview({
            columnId: current.columnId,
            columnTitle: current.columnTitle,
            rankedCards: nextSortedCards,
            comparisons: nextComparisons,
          });
          return null;
        }

        return {
          ...nextQuizState,
          history: nextHistory,
        };
      }

      return {
        ...current,
        low: nextLow,
        high: nextHigh,
        compareIndex: Math.floor((nextLow + nextHigh) / 2),
        comparisons: nextComparisons,
        history: nextHistory,
      };
    });
  }

  function undoPairwiseChoice() {
    setPairwiseQuizState((current) => {
      if (!current || current.history.length === 0) {
        return current;
      }

      const previousStep = current.history[current.history.length - 1];

      if (!previousStep) {
        return current;
      }

      return {
        ...current,
        ...previousStep,
        history: current.history.slice(0, -1),
      };
    });
  }

  function movePairwiseReviewCard(index: number, direction: -1 | 1) {
    setPairwiseQuizReview((current) => {
      if (!current) {
        return current;
      }

      const targetIndex = index + direction;

      if (targetIndex < 0 || targetIndex >= current.rankedCards.length) {
        return current;
      }

      const nextRankedCards = [...current.rankedCards];
      const [movedCard] = nextRankedCards.splice(index, 1);
      nextRankedCards.splice(targetIndex, 0, movedCard);

      return {
        ...current,
        rankedCards: nextRankedCards,
      };
    });
  }

  function savePairwiseQuizReview() {
    if (!pairwiseQuizReview) {
      return;
    }

    const nextCardsByColumn = {
      ...latestCardsByColumnRef.current,
      [pairwiseQuizReview.columnId]: pairwiseQuizReview.rankedCards,
    };

    latestCardsByColumnRef.current = nextCardsByColumn;
    setCardsByColumn(nextCardsByColumn);
    void persistPairwiseQuizProgress(pairwiseQuizReview.columnId, null);
    setPairwiseQuizReview(null);
    setPairwiseQuizState(null);
    queuePersistBoardState({
      boards: latestBoardsRef.current,
      activeBoardId,
      cardsByColumn: nextCardsByColumn,
    });
  }

  function exportActiveBoardAsJson() {
    const trelloLikeExport = {
      name: activeBoardTitle,
      lists: columns.map((column, index) => ({
        id: column.id,
        name: column.title,
        pos: (index + 1) * 65536,
        closed: false,
      })),
      cards: columns.flatMap((column, columnIndex) =>
        (cardsByColumn[column.id] ?? []).map((card, cardIndex) => ({
          id: card.entryId,
          idList: column.id,
          name: card.title,
          desc: card.notes ?? "",
          pos: (cardIndex + 1) * 65536,
          closed: false,
          attachments: card.imageUrl
            ? [
                {
                  id: `${card.entryId}-image`,
                  url: card.imageUrl,
                  mimeType: "image/jpeg",
                  previews: [{ url: card.imageUrl }],
                },
              ]
            : [],
          rankboardMeta: {
            itemId: card.itemId,
            series: card.series,
            releaseYear: card.releaseYear ?? "",
            customFieldValues: card.customFieldValues ?? {},
            mirroredFromEntryId: card.mirroredFromEntryId ?? "",
            columnIndex,
          },
        })),
      ),
      rankboardBoardMeta: {
        fieldDefinitions: activeBoardFieldDefinitions,
      },
    };

    const blob = new Blob([JSON.stringify(trelloLikeExport, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(activeBoardTitle) || "rankboard-board"}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
  }

  function openShareModal() {
    const existingShare = normalizePublicShareSettings(activeBoardSettings.publicShare);
    setShareDraft({
      columnIds:
        existingShare.columnIds.length > 0
          ? existingShare.columnIds.filter((columnId) => columns.some((column) => column.id === columnId))
          : columns.map((column) => column.id),
      tierFilter: existingShare.tierFilter,
      seriesFilter: existingShare.seriesFilter || seriesFilter,
      searchTerm: existingShare.searchTerm || searchTerm,
      title: existingShare.title || activeBoardTitle,
    });
    setCopiedShareUrl(null);
    setIsShareModalOpen(true);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
  }

  async function copyShareUrlToClipboard(shareUrl: string) {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Ignore clipboard failures; the link is still published and visible in the modal.
    }
    setCopiedShareUrl(shareUrl);
  }

  async function shareActiveBoard() {
    const nextSlug = `${slugify(activeBoardTitle) || "board"}-${crypto.randomUUID().slice(0, 8)}`;
    const nextPublishedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const normalizedShareDraft = {
      columnIds: shareDraft.columnIds.filter((columnId) => columns.some((column) => column.id === columnId)),
      tierFilter: shareDraft.tierFilter,
      seriesFilter: shareDraft.seriesFilter,
      searchTerm: shareDraft.searchTerm.trim(),
      title: shareDraft.title.trim() || activeBoardTitle,
      expiresAt,
    };
    const nextBoards = latestBoardsRef.current.map((board) =>
      board.id === activeBoardId
        ? {
            ...board,
            isPublic: true,
            publicSlug: nextSlug,
            lastPublishedAt: nextPublishedAt,
            updatedAt: nextPublishedAt,
            settings: {
              ...board.settings,
              publicShare: normalizedShareDraft,
            },
          }
        : board,
    );
    const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/share/${nextSlug}` : nextSlug;

    latestBoardsRef.current = nextBoards;
    setBoards(nextBoards);
    queuePersistBoardState({ boards: nextBoards, activeBoardId });
    setCopiedShareUrl(null);
    await copyShareUrlToClipboard(shareUrl);
    setSaveState("saved");
  }

  function handleUndo() {
    const previous = history[history.length - 1];

    if (!previous) {
      return;
    }

    skipNextHistoryRef.current = true;
    setColumns(previous.columns);
    skipNextHistoryRef.current = true;
    setCardsByColumn(previous.cardsByColumn);
    setHistory((current) => current.slice(0, -1));
    queuePersistBoardState();
  }

  function switchBoard(boardId: string) {
    const nextBoard = boards.find((board) => board.id === boardId);

    if (!nextBoard) {
      return;
    }

    skipNextHistoryRef.current = true;
    setActiveBoardId(nextBoard.id);
    setColumns(nextBoard.columns);
    setCardsByColumn(nextBoard.cardsByColumn);
    setHistory([]);
    setIsBoardsMenuOpen(false);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
    queuePersistBoardState();
  }

  function updateActiveBoardSettings(nextSettings: Partial<BoardSettings>) {
    let nextBoardsSnapshot = latestBoardsRef.current;

    setBoards((current) => {
      const nextBoards = current.map((board) =>
        board.id === activeBoardId
          ? {
              ...board,
              settings: {
                ...DEFAULT_BOARD_SETTINGS,
                ...board.settings,
                ...nextSettings,
              },
              updatedAt: new Date().toISOString(),
            }
          : board,
      );

      latestBoardsRef.current = nextBoards;
      nextBoardsSnapshot = nextBoards;
      return nextBoards;
    });

    queuePersistBoardState({
      boards: nextBoardsSnapshot,
      activeBoardId,
      cardsByColumn: latestCardsByColumnRef.current,
    });
  }

  function promptForCardLabel() {
    const nextLabel = window.prompt(
      "What should cards on this board be called?",
      activeBoardSettings.cardLabel?.trim() || boardVocabulary.singular,
    );

    if (nextLabel === null) {
      return;
    }

    updateActiveBoardSettings({ cardLabel: nextLabel.trim() });
  }

  function updateBoardIconSettings(patch: Partial<BoardSettings>) {
    updateActiveBoardSettings(patch);
  }

  function handleBoardIconUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      updateBoardIconSettings({
        boardIconUrl: result,
      });
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function updateActiveBoardFieldDefinitions(
    updater: (current: BoardFieldDefinition[]) => BoardFieldDefinition[],
  ) {
    setBoards((current) =>
      current.map((board) =>
        board.id === activeBoardId
          ? {
              ...board,
              settings: {
                ...DEFAULT_BOARD_SETTINGS,
                ...board.settings,
                fieldDefinitions: updater(
                  normalizeFieldDefinitions(board.settings?.fieldDefinitions, board.title, board.settings),
                ),
              },
              updatedAt: new Date().toISOString(),
            }
          : board,
      ),
    );
    queuePersistBoardState();
  }

  function toggleActiveBoardFieldVisibility(fieldId: string) {
    updateActiveBoardFieldDefinitions((current) =>
      current.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              visible: !field.visible,
            }
          : field,
      ),
    );
  }

  function updateActiveBoardField(fieldId: string, patch: Partial<BoardFieldDefinition>) {
    updateActiveBoardFieldDefinitions((current) =>
      current.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              ...patch,
            }
          : field,
      ),
    );
  }

  function removeActiveBoardField(fieldId: string) {
    updateActiveBoardFieldDefinitions((current) => current.filter((field) => field.id !== fieldId));
  }

  function addActiveBoardField(type: CardFieldType) {
    updateActiveBoardFieldDefinitions((current) => [
      ...current,
      {
        id: makeFieldId(),
        label:
          type === "short_text"
            ? "New Field"
            : type === "long_text"
              ? "New Notes"
              : type === "date"
                ? "New Date"
                : "New Dropdown",
        type,
        visible: true,
        showLabelOnCardFront: true,
        options: type === "select" ? ["Option 1", "Option 2"] : undefined,
        dateFormat: type === "date" ? DEFAULT_DATE_FIELD_FORMAT : undefined,
      },
    ]);
  }

  function toggleCollapseCardsSetting() {
    if (activeBoardSettings.collapseCards) {
      updateActiveBoardSettings({
        collapseCards: false,
      });
      return;
    }

    updateActiveBoardSettings({
      collapseCards: true,
    });
  }

  function startEditingBoardTitle() {
    setBoardTitleDraft(activeBoardTitle);
    setIsEditingBoardTitle(true);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
  }

  function cancelEditingBoardTitle() {
    setIsEditingBoardTitle(false);
    setBoardTitleDraft("");
  }

  function saveBoardTitle() {
    const nextTitle = boardTitleDraft.trim();
    let nextBoardsSnapshot = latestBoardsRef.current;

    setBoards((current) => {
      const nextBoards = current.map((board) =>
        board.id === activeBoardId
          ? {
              ...board,
              title: nextTitle || board.title,
              settings: {
                ...board.settings,
                includeSeriesField: getDefaultBoardSettings(nextTitle || board.title).includeSeriesField,
                fieldDefinitions: normalizeFieldDefinitions(
                  board.settings.fieldDefinitions,
                  nextTitle || board.title,
                  board.settings,
                ).map((field) =>
                  field.builtInKey === "series"
                    ? {
                        ...field,
                        label:
                          getDefaultFieldDefinitions(nextTitle || board.title).find(
                            (defaultField) => defaultField.builtInKey === "series",
                          )?.label ?? field.label,
                      }
                    : field,
                ),
              },
              updatedAt: new Date().toISOString(),
            }
          : board,
      );

      latestBoardsRef.current = nextBoards;
      nextBoardsSnapshot = nextBoards;
      return nextBoards;
    });

    cancelEditingBoardTitle();
    void persistBoardState({
      boards: nextBoardsSnapshot,
      activeBoardId,
      cardsByColumn: latestCardsByColumnRef.current,
    });
  }

  const openCreateBoardModal = useCallback(() => {
    const suggestedTitle = "";
    setNewBoardTitle(suggestedTitle);
    setNewBoardSettings(getDefaultBoardSettings("New Board", "board"));
    setIsCreateBoardModalOpen(true);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
  }, []);

  function createBoardFromModal() {
    const title = newBoardTitle.trim() || `Board ${boards.length + 1}`;
    const boardLayout: BoardLayout = "board";
    const nextBoard: SavedBoard = {
      ...createEmptyBoard(title, boardLayout),
      settings: {
        ...getDefaultBoardSettings(title, boardLayout),
        ...newBoardSettings,
        boardLayout,
        fieldDefinitions: normalizeFieldDefinitions(newBoardSettings.fieldDefinitions, title, newBoardSettings),
      },
    };
    const nextBoards = [...boards, nextBoard];

    skipNextHistoryRef.current = true;
    latestBoardsRef.current = nextBoards;
    latestActiveBoardIdRef.current = nextBoard.id;
    latestColumnsRef.current = nextBoard.columns;
    latestCardsByColumnRef.current = nextBoard.cardsByColumn;
    setBoards(nextBoards);
    setActiveBoardId(nextBoard.id);
    setColumns(nextBoard.columns);
    setCardsByColumn(nextBoard.cardsByColumn);
    setHistory([]);
    setNewBoardTitle("");
    setNewBoardSettings(getDefaultBoardSettings("New Board", "board"));
    setIsCreateBoardModalOpen(false);
    setIsBoardsMenuOpen(false);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
    setIsMaintenanceMenuOpen(false);
    queuePersistBoardState({
      boards: nextBoards,
      activeBoardId: nextBoard.id,
      columns: nextBoard.columns,
      cardsByColumn: nextBoard.cardsByColumn,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function openTierListConversionModal() {
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
    setIsMaintenanceMenuOpen(false);

    if (activeBoardLayout === "tier-list") {
      setTierListConversionState({
        mode: "to-board",
        sourceBoardId: activeBoardId,
        selectedColumnIds: [],
      });
      return;
    }

    const selectableColumnIds = columns
      .filter((column) => !column.mirrorsEntireBoard)
      .map((column) => column.id);

    setTierListConversionState({
      mode: "to-tier-list",
      sourceBoardId: activeBoardId,
      selectedColumnIds: selectableColumnIds,
    });
  }

  function createBoardCopyFromConversion(nextBoard: SavedBoard) {
    const nextBoards = [...boards, nextBoard];

    skipNextHistoryRef.current = true;
    previousSnapshotRef.current = {
      columns: nextBoard.columns,
      cardsByColumn: nextBoard.cardsByColumn,
    };
    latestBoardsRef.current = nextBoards;
    latestActiveBoardIdRef.current = nextBoard.id;
    latestColumnsRef.current = nextBoard.columns;
    latestCardsByColumnRef.current = nextBoard.cardsByColumn;
    setBoards(nextBoards);
    setActiveBoardId(nextBoard.id);
    setColumns(nextBoard.columns);
    setCardsByColumn(nextBoard.cardsByColumn);
    setHistory([]);
    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnFilterMenuId(null);
    setOpenColumnMirrorMenuId(null);
    setOpenColumnMaintenanceMenuId(null);
    setTierRowOptionsState(null);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
    setIsMaintenanceMenuOpen(false);
    setTierListConversionState(null);
    queuePersistBoardState({
      boards: nextBoards,
      activeBoardId: nextBoard.id,
      columns: nextBoard.columns,
      cardsByColumn: nextBoard.cardsByColumn,
    });
  }

  function convertActiveBoardToTierList() {
    if (!tierListConversionState || tierListConversionState.mode !== "to-tier-list") {
      return;
    }

    const tierSnapshot = createTierListBoardSnapshot();
    const unsortedColumnId = tierSnapshot.columns[tierSnapshot.columns.length - 1]?.id;

    if (!unsortedColumnId) {
      return;
    }

    const seenItemIds = new Set<string>();
    const flattenedCards: CardEntry[] = [];
    const selectedColumnIds = new Set(tierListConversionState.selectedColumnIds);

    for (const column of columns) {
      if (column.mirrorsEntireBoard || !selectedColumnIds.has(column.id)) {
        continue;
      }

      for (const card of cardsByColumn[column.id] ?? []) {
        if (seenItemIds.has(card.itemId)) {
          continue;
        }
        seenItemIds.add(card.itemId);
        flattenedCards.push({
          ...card,
          mirroredFromEntryId: undefined,
        });
      }
    }

    const nextCardsByColumn = {
      ...tierSnapshot.cardsByColumn,
      [unsortedColumnId]: flattenedCards,
    };

    const nextBoardTitle = `${activeBoardTitle} Tier List`;
    const nextBoard: SavedBoard = {
      ...createEmptyBoard(nextBoardTitle, "tier-list"),
      title: nextBoardTitle,
      settings: {
        ...getDefaultBoardSettings(nextBoardTitle, "tier-list"),
        ...activeBoardSettings,
        boardLayout: "tier-list",
        collapseCards: false,
        showTierHighlights: false,
        publicShare: normalizePublicShareSettings(undefined),
        fieldDefinitions: normalizeFieldDefinitions(activeBoardFieldDefinitions, nextBoardTitle, {
          ...activeBoardSettings,
          boardLayout: "tier-list",
        }),
      },
      columns: tierSnapshot.columns,
      cardsByColumn: nextCardsByColumn,
    };

    createBoardCopyFromConversion(nextBoard);
  }

  function convertActiveBoardToKanbanBoard() {
    if (!tierListConversionState || tierListConversionState.mode !== "to-board") {
      return;
    }

    const { rankedCards, unsortedCards } = getTierListRankedCards(columns, cardsByColumn);
    const rankedColumn = createColumnDefinition(1, "Ranked");
    const backlogColumn = createColumnDefinition(2, "Backlog");
    const nextBoardTitle = `${activeBoardTitle} Board`;
    const nextColumns = [rankedColumn, backlogColumn];
    const nextCardsByColumn = {
      [rankedColumn.id]: rankedCards.map((card) => ({
        ...card,
        mirroredFromEntryId: undefined,
      })),
      [backlogColumn.id]: unsortedCards.map((card) => ({
        ...card,
        mirroredFromEntryId: undefined,
      })),
    };

    const nextBoard: SavedBoard = {
      ...createEmptyBoard(nextBoardTitle, "board"),
      title: nextBoardTitle,
      settings: {
        ...getDefaultBoardSettings(nextBoardTitle, "board"),
        ...activeBoardSettings,
        boardLayout: "board",
        publicShare: normalizePublicShareSettings(undefined),
        fieldDefinitions: normalizeFieldDefinitions(activeBoardFieldDefinitions, nextBoardTitle, {
          ...activeBoardSettings,
          boardLayout: "board",
        }),
      },
      columns: nextColumns,
      cardsByColumn: nextCardsByColumn,
    };

    createBoardCopyFromConversion(nextBoard);
  }

  function requestDeleteBoard(boardId = activeBoardId) {
    const board = boards.find((item) => item.id === boardId);

    if (!board || boards.length <= 1) {
      return;
    }

    setPendingBoardDelete(board);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
    setIsMaintenanceMenuOpen(false);
    setIsBoardsMenuOpen(false);
  }

  function confirmDeleteBoard() {
    if (!pendingBoardDelete) {
      return;
    }

    const remainingBoards = boards.filter((board) => board.id !== pendingBoardDelete.id);
    const nextActiveBoard =
      remainingBoards.find((board) => board.id === activeBoardId) ??
      remainingBoards[0] ??
      null;

    if (!nextActiveBoard) {
      setPendingBoardDelete(null);
      return;
    }

    skipNextHistoryRef.current = true;
    latestBoardsRef.current = remainingBoards;
    latestActiveBoardIdRef.current = nextActiveBoard.id;
    latestColumnsRef.current = nextActiveBoard.columns;
    latestCardsByColumnRef.current = nextActiveBoard.cardsByColumn;
    setBoards(remainingBoards);
    setActiveBoardId(nextActiveBoard.id);
    setColumns(nextActiveBoard.columns);
    setCardsByColumn(nextActiveBoard.cardsByColumn);
    setHistory([]);
    setPendingBoardDelete(null);
    void persistBoardState({
      boards: remainingBoards,
      activeBoardId: nextActiveBoard.id,
      columns: nextActiveBoard.columns,
      cardsByColumn: nextActiveBoard.cardsByColumn,
    });
  }

  function createColumnDefinition(nextIndex: number, title?: string): ColumnDefinition {
    return {
      id: makeId("column"),
      title: title?.trim() || `New Column ${nextIndex}`,
      description: "",
      type: "ranked",
      accent: COLUMN_ACCENTS[(nextIndex - 1) % COLUMN_ACCENTS.length] ?? COLUMN_ACCENTS[0],
    };
  }

  function addTierListRowAt(insertIndex: number) {
    const nextIndex = columns.length + 1;
    const nextRow: ColumnDefinition = {
      ...createColumnDefinition(nextIndex, `New Row ${nextIndex}`),
      dontRank: true,
      sortMode: "manual",
    };

    const nextColumns = [...columns];
    nextColumns.splice(insertIndex, 0, nextRow);
    const nextCardsByColumn = {
      ...cardsByColumn,
      [nextRow.id]: [],
    };

    latestColumnsRef.current = nextColumns;
    latestCardsByColumnRef.current = nextCardsByColumn;
    setColumns(nextColumns);
    setCardsByColumn(nextCardsByColumn);
    setTierRowOptionsState(null);
    queuePersistBoardState({
      columns: nextColumns,
      cardsByColumn: nextCardsByColumn,
    });
  }

  function openTierRowOptions(columnId: string, anchorRect: DOMRect) {
    setTierRowOptionsState({ rowId: columnId, anchorRect });
  }

  function requestDeleteTierRow(columnId: string) {
    const column = columns.find((item) => item.id === columnId);
    if (!column) {
      return;
    }

    setPendingColumnDelete({ id: column.id, title: column.title });
    setTierRowOptionsState(null);
  }

  function openDuplicateCleanupModal(scopeColumnId?: string) {
    const suggestions: DuplicateCleanupSuggestion[] = [];
    const scopedColumns = scopeColumnId ? columns.filter((column) => column.id === scopeColumnId) : columns;
    const grouped = new Map<string, Array<{ columnId: string; columnTitle: string; card: CardEntry }>>();

    for (const column of scopedColumns) {
      for (const card of cardsByColumn[column.id] ?? []) {
        if (card.mirroredFromEntryId) {
          continue;
        }

        const normalizedTitle = normalizeTitleForComparison(card.title);

        if (!normalizedTitle) {
          continue;
        }

        const current = grouped.get(normalizedTitle) ?? [];
        current.push({
          columnId: column.id,
          columnTitle: column.title,
          card,
        });
        grouped.set(normalizedTitle, current);
      }
    }

    for (const [normalizedTitle, matchingCards] of grouped.entries()) {
      if (matchingCards.length < 2) {
        continue;
      }

      const sorted = [...matchingCards].sort((left, right) => getCardContentScore(right.card) - getCardContentScore(left.card));
      const keepEntry = sorted[0];

      for (const removeEntry of sorted.slice(1)) {
        suggestions.push({
          id: `${removeEntry.columnId}-${removeEntry.card.entryId}`,
          columnId: removeEntry.columnId,
          columnTitle: removeEntry.columnTitle,
          keepColumnTitle: keepEntry.columnTitle,
          normalizedTitle,
          keepCard: keepEntry.card,
          removeCard: removeEntry.card,
        });
      }
    }

    setDuplicateCleanupSuggestions(suggestions);
    setIsDuplicateCleanupModalOpen(true);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnFilterMenuId(null);
    setOpenColumnMirrorMenuId(null);
    setOpenColumnMaintenanceMenuId(null);
  }

  function removeDuplicateCleanupSuggestion(suggestionId: string) {
    setDuplicateCleanupSuggestions((current) => current.filter((suggestion) => suggestion.id !== suggestionId));
  }

  function applyDuplicateCleanupSuggestions() {
    const removalsByColumn = new Map<string, Set<string>>();

    for (const suggestion of duplicateCleanupSuggestions) {
      const current = removalsByColumn.get(suggestion.columnId) ?? new Set<string>();
      current.add(suggestion.removeCard.entryId);
      removalsByColumn.set(suggestion.columnId, current);
    }

    setCardsByColumn((current) => {
      const nextState: Record<string, CardEntry[]> = {};

      for (const [columnId, cards] of Object.entries(current)) {
        const removals = removalsByColumn.get(columnId);
        nextState[columnId] = removals
          ? cards.filter((card) => !removals.has(card.entryId))
          : cards;
      }

      return nextState;
    });

    setIsDuplicateCleanupModalOpen(false);
    setDuplicateCleanupSuggestions([]);
    queuePersistBoardState();
  }

  function openTitleTidyModal(scopeColumnId?: string) {
    const suggestions: TitleTidySuggestion[] = [];
    const scopedColumns = getSeriesScrapeScopedColumns(columns, scopeColumnId);

    for (const column of scopedColumns) {
      for (const card of cardsByColumn[column.id] ?? []) {
        const proposedTitle = getSuggestedTitleCleanup(card.title);

        if (!proposedTitle) {
          continue;
        }

        suggestions.push({
          id: `${column.id}-${card.entryId}`,
          columnId: column.id,
          columnTitle: column.title,
          entryId: card.entryId,
          itemId: card.itemId,
          originalTitle: card.title,
          proposedTitle,
        });
      }
    }

    setTitleTidySuggestions(suggestions);
    setIsTitleTidyModalOpen(true);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnFilterMenuId(null);
    setOpenColumnMirrorMenuId(null);
    setOpenColumnMaintenanceMenuId(null);
  }

  function updateTitleTidySuggestion(suggestionId: string, proposedTitle: string) {
    setTitleTidySuggestions((current) =>
      current.map((suggestion) =>
        suggestion.id === suggestionId
          ? {
              ...suggestion,
              proposedTitle,
            }
          : suggestion,
      ),
    );
  }

  function removeTitleTidySuggestion(suggestionId: string) {
    setTitleTidySuggestions((current) => current.filter((suggestion) => suggestion.id !== suggestionId));
  }

  function applyTitleTidySuggestions() {
    const titleUpdates = new Map(
      titleTidySuggestions
        .map((suggestion) => [suggestion.itemId, suggestion.proposedTitle.trim()] as const)
        .filter(([, title]) => title.length > 0),
    );

    setCardsByColumn((current) => {
      const nextState: Record<string, CardEntry[]> = {};

      for (const [columnId, cards] of Object.entries(current)) {
        nextState[columnId] = cards.map((card) => {
          const updatedTitle = titleUpdates.get(card.itemId);
          return updatedTitle ? { ...card, title: updatedTitle } : card;
        });
      }

      return nextState;
    });

    setIsTitleTidyModalOpen(false);
    setTitleTidySuggestions([]);
    queuePersistBoardState();
  }

  async function buildSeriesScrapeSuggestions(scopeColumnId?: string) {
    const existingSeries = Array.from(
      new Set(
        Object.values(cardsByColumn)
          .flat()
          .map((card) => card.series.trim())
        .filter(Boolean),
      ),
    );
    const scopedColumns = scopeColumnId
      ? columns.filter((column) => column.id === scopeColumnId)
      : columns;
    const cardsToInspect = scopedColumns.flatMap((column) =>
      (cardsByColumn[column.id] ?? [])
        .filter((card) => scopeColumnId || !card.mirroredFromEntryId)
        .map((card) => ({
          columnId: column.id,
          columnTitle: column.title,
          card,
        })),
    );

    const suggestions = await Promise.all(
      cardsToInspect.map(async ({ columnId, columnTitle, card }) => {
        const currentSeries = card.series.trim();
        if (currentSeries.length > 0) {
          return null;
        }

        const suggestedSeries =
          getSuggestedSeriesFromTitle(card.title, existingSeries) ||
          "";

        const shouldSuggestSeries =
          Boolean(suggestedSeries) && suggestedSeries.trim() !== currentSeries;

        if (!shouldSuggestSeries) {
          return null;
        }

        return {
          id: `${columnId}-${card.entryId}`,
          columnId,
          columnTitle,
          entryId: card.entryId,
          itemId: card.itemId,
          title: card.title,
          imageUrl: card.imageUrl,
          proposedSeries: shouldSuggestSeries ? suggestedSeries : currentSeries,
        } satisfies SeriesScrapeSuggestion;
      }),
    );

    return suggestions.filter((suggestion): suggestion is SeriesScrapeSuggestion => Boolean(suggestion));
  }

  function buildSeriesScrapeFallbackSuggestions(scopeColumnId?: string) {
    const existingSeries = Array.from(
      new Set(
        Object.values(cardsByColumn)
          .flat()
          .map((card) => card.series.trim())
          .filter(Boolean),
      ),
    );
    const scopedColumns = getSeriesScrapeScopedColumns(columns, scopeColumnId);

    return scopedColumns.flatMap((column) =>
      (cardsByColumn[column.id] ?? []).flatMap((card) => {
        if (!scopeColumnId && card.mirroredFromEntryId) {
          return [];
        }

        const currentSeries = card.series.trim();
        if (currentSeries.length > 0) {
          return null;
        }

        const heuristicSeries = getSuggestedSeriesFromTitle(card.title, existingSeries) ?? "";

        return [{
          id: `${column.id}-${card.entryId}`,
          columnId: column.id,
          columnTitle: column.title,
          entryId: card.entryId,
          itemId: card.itemId,
          title: card.title,
          imageUrl: card.imageUrl,
          proposedSeries: heuristicSeries || currentSeries,
        }];
      }).filter((suggestion): suggestion is SeriesScrapeSuggestion => Boolean(suggestion)),
    );
  }

  function openSeriesScrapeModal(scopeColumnId?: string) {
    setSeriesScrapeScopeColumnId(scopeColumnId);
    setSeriesScrapeSuggestions([]);
    setIsSeriesScrapeModalOpen(true);
    setIsSeriesScrapeLoading(true);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnFilterMenuId(null);
    setOpenColumnMirrorMenuId(null);
    setOpenColumnMaintenanceMenuId(null);

    void buildSeriesScrapeSuggestions(scopeColumnId)
      .then((suggestions) => {
        setSeriesScrapeSuggestions(suggestions);
      })
      .finally(() => {
        setIsSeriesScrapeLoading(false);
      });
  }

  function updateSeriesScrapeSuggestion(suggestionId: string, proposedSeries: string) {
    setSeriesScrapeSuggestions((current) =>
      current.map((suggestion) =>
        suggestion.id === suggestionId
          ? {
              ...suggestion,
              proposedSeries,
            }
          : suggestion,
      ),
    );
  }

  function removeSeriesScrapeSuggestion(suggestionId: string) {
    setSeriesScrapeSuggestions((current) => current.filter((suggestion) => suggestion.id !== suggestionId));
  }

  function applySeriesScrapeSuggestions() {
    const suggestionUpdates = new Map(
      seriesScrapeSuggestions.map((suggestion) => [
        suggestion.itemId,
        {
          series: suggestion.proposedSeries.trim(),
        },
      ]),
    );

    let nextStateSnapshot: Record<string, CardEntry[]> | null = null;

    setCardsByColumn((current) => {
      const nextState: Record<string, CardEntry[]> = {};

      for (const [columnId, cards] of Object.entries(current)) {
        nextState[columnId] = cards.map((card) => {
          const updatedValues = suggestionUpdates.get(card.itemId);

          if (!updatedValues) {
            return card;
          }

          return {
            ...card,
            series: updatedValues.series || card.series,
          };
        });
      }

      latestCardsByColumnRef.current = nextState;
      nextStateSnapshot = nextState;
      return nextState;
    });

    setIsSeriesScrapeModalOpen(false);
    setSeriesScrapeSuggestions([]);
    setSeriesScrapeScopeColumnId(undefined);

    if (nextStateSnapshot) {
      void persistBoardState({ cardsByColumn: nextStateSnapshot });
      queuePersistBoardState({ cardsByColumn: nextStateSnapshot });
    } else {
      queuePersistBoardState();
    }
  }

  async function handleImportTrelloBoard(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const fileText = await file.text();
      const importedBoard = parseTrelloBoardExport(fileText);
      const nextBoards = latestBoardsRef.current.map((board) =>
        board.id === activeBoardId
          ? {
              ...board,
              columns: importedBoard.columns,
              cardsByColumn: importedBoard.cardsByColumn,
              updatedAt: new Date().toISOString(),
            }
          : board,
      );
      const nextActiveBoard =
        nextBoards.find((board) => board.id === activeBoardId) ?? nextBoards[0];

      latestBoardsRef.current = nextBoards;
      latestColumnsRef.current = importedBoard.columns;
      latestCardsByColumnRef.current = importedBoard.cardsByColumn;
      setColumns(importedBoard.columns);
      setCardsByColumn(importedBoard.cardsByColumn);
      setBoards(nextBoards);
      if (nextActiveBoard) {
        latestActiveBoardIdRef.current = nextActiveBoard.id;
        setActiveBoardId(nextActiveBoard.id);
      }
      setSearchTerm("");
      setSeriesFilter("");
      setOpenColumnMenuId(null);
      cancelEditingCard();
      cancelEditingColumn();
      setIsImportModalOpen(false);
      void persistBoardState({
        boards: nextBoards,
        activeBoardId: nextActiveBoard?.id ?? activeBoardId,
        columns: importedBoard.columns,
        cardsByColumn: importedBoard.cardsByColumn,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The Trello export could not be imported.";
      window.alert(message);
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div
      className={clsx(
        "min-h-screen pt-[env(safe-area-inset-top)] transition-colors",
        isDarkMode
          ? "bg-[radial-gradient(circle_at_top,#1f2937_0%,#111827_35%,#020617_100%)] text-slate-100"
          : "bg-[radial-gradient(circle_at_top,#fff4d6_0%,#ffe3cf_18%,#fff0e2_38%,#fff4ea_62%,#fff6ef_100%)] text-slate-950",
      )}
    >
      <main className="mx-auto flex min-h-screen w-full max-w-[1700px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <datalist id="series-suggestions">
          {allSeries.map((series) => (
            <option key={series} value={series} />
          ))}
        </datalist>

        <section className="grid w-full min-w-0 gap-4">
          <div className="hidden">
            <div className="flex flex-col items-center gap-4">
              <div className="grid w-full max-w-5xl grid-cols-2 gap-3 sm:grid-cols-[1fr_260px_auto_auto] sm:gap-4">
                <input
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950/60 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                  )}
                  placeholder="Search title or series"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />

                <SeriesFilterButton
                  allSeries={allSeries}
                  className="min-w-0"
                  currentSeriesFilter={seriesFilter}
                  isDarkMode={isDarkMode}
                  isOpen={isHeaderSeriesMenuOpen}
                  onSelect={(series) => {
                    setSeriesFilter(series);
                    setIsHeaderSeriesMenuOpen(false);
                  }}
                  onToggle={() => setIsHeaderSeriesMenuOpen((current) => !current)}
                />
                <button
                  className={clsx(
                    "inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition sm:px-4",
                    isDarkMode
                      ? "border-white/10 bg-slate-950/60 text-slate-100 hover:border-white/40 disabled:border-white/10 disabled:text-slate-500"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950 disabled:border-slate-200 disabled:text-slate-400",
                  )}
                  disabled={history.length === 0}
                  onClick={handleUndo}
                  type="button"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Undo</span>
                </button>
                <div className="relative" data-actions-menu-root="true">
                  <button
                    aria-label="Settings"
                    className={clsx(
                      "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border px-4 transition sm:w-auto",
                      isDarkMode
                        ? "border-white/10 bg-slate-950/60 text-slate-100 hover:border-white/40"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                    )}
                    onClick={() => {
                      setIsBoardsMenuOpen(false);
                      setIsActionsMenuOpen((current) => !current);
                    }}
                    type="button"
                  >
                    <Settings2 className="h-4 w-4" />
                    <span>Settings</span>
                  </button>
                  {isActionsMenuOpen ? (
                    <div
                      className={clsx(
                        "absolute right-0 z-[260] mt-2 min-w-[220px] rounded-3xl border p-2 shadow-[0_24px_60px_rgba(19,27,68,0.2)] backdrop-blur",
                        isDarkMode
                          ? "border-white/10 bg-slate-950/95 text-slate-100"
                          : "border-slate-200 bg-white/95 text-slate-700",
                      )}
                    >
                      <button
                        className={clsx(
                          "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                          isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                        )}
                        onClick={openShareModal}
                        type="button"
                      >
                        <Share2 className="h-4 w-4" />
                        Share
                      </button>
                          <div className="rounded-2xl">
                            <MenuSectionButton
                              icon={<Sparkles className="h-4 w-4" />}
                              label="Customization"
                              isDarkMode={isDarkMode}
                              isOpen={isCustomizationMenuOpen}
                              onClick={() => {
                                setIsCustomizationMenuOpen((current) => !current);
                                setIsMaintenanceMenuOpen(false);
                                setIsTransferMenuOpen(false);
                              }}
                            />
                        {isCustomizationMenuOpen ? (
                          <div className={clsx("mt-1 space-y-1 rounded-2xl px-2 pb-2", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                            <button
                              className={clsx(
                                "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
                              )}
                              onClick={toggleCollapseCardsSetting}
                              type="button"
                            >
                              <span>Collapse Cards</span>
                              <span className="text-xs opacity-70">{activeBoardSettings.collapseCards ? "On" : "Off"}</span>
                            </button>
                            <button
                              className={clsx(
                                "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
                              )}
                              onClick={() => updateActiveBoardSettings({ showTierHighlights: !activeBoardSettings.showTierHighlights })}
                              type="button"
                            >
                              <span>Tier Highlights</span>
                              <span className="text-xs opacity-70">{activeBoardSettings.showTierHighlights ? "On" : "Off"}</span>
                            </button>
                            <button
                              className={clsx(
                                "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
                              )}
                              onClick={promptForCardLabel}
                              type="button"
                            >
                              <span>Card Label</span>
                              <span className="text-xs opacity-70">{activeBoardSettings.cardLabel?.trim() || boardVocabulary.singular}</span>
                            </button>
                            <button
                              className={clsx(
                                "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
                              )}
                              onClick={() => setIsBoardIconModalOpen(true)}
                              type="button"
                            >
                              <span>Board Icon</span>
                              {renderBoardIcon(boardIconKeysById.get(activeBoardId) ?? "game", activeBoard.settings?.boardIconUrl, "h-4 w-4")}
                            </button>
                            <button
                              className={clsx(
                                "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
                              )}
                              onClick={() => {
                                setIsBoardFieldSettingsModalOpen(true);
                                setIsActionsMenuOpen(false);
                                setIsMobileActionsOpen(false);
                              }}
                              type="button"
                            >
                              <span>Fields</span>
                              <Settings2 className="h-4 w-4 opacity-70" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-2xl">
                        <MenuSectionButton
                          icon={<Wrench className="h-4 w-4" />}
                          label="Maintenance"
                          isDarkMode={isDarkMode}
                          isOpen={isMaintenanceMenuOpen}
                          onClick={() => {
                            setIsMaintenanceMenuOpen((current) => !current);
                            setIsBoardsMenuOpen(false);
                            setIsCustomizationMenuOpen(false);
                            setIsTransferMenuOpen(false);
                          }}
                        />
                        {isMaintenanceMenuOpen ? (
                          <div className={clsx("mt-1 space-y-1 rounded-2xl px-2 pb-2", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                            <button className={clsx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => openDuplicateCleanupModal()} type="button">
                              <Trash2 className="h-4 w-4" />
                              Delete Duplicates
                            </button>
                            <button className={clsx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => openTitleTidyModal()} type="button">
                              <Sparkles className="h-4 w-4" />
                              Tidy Titles
                            </button>
                                <button className={clsx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => { void openSeriesScrapeModal(); }} type="button">
                                  <WandSparkles className="h-4 w-4" />
                                  Series Scraper
                                </button>
                                <button
                                  className={clsx(
                                    "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                    isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
                                    boards.length <= 1 && "cursor-not-allowed opacity-50",
                              )}
                              disabled={boards.length <= 1}
                              onClick={() => requestDeleteBoard()}
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete Board
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-2xl">
                        <MenuSectionButton
                          icon={<Upload className="h-4 w-4" />}
                          label="Import/Export"
                          isDarkMode={isDarkMode}
                          isOpen={isTransferMenuOpen}
                          onClick={() => {
                            setIsTransferMenuOpen((current) => !current);
                            setIsBoardsMenuOpen(false);
                            setIsCustomizationMenuOpen(false);
                            setIsMaintenanceMenuOpen(false);
                          }}
                        />
                        {isTransferMenuOpen ? (
                          <div className={clsx("mt-1 space-y-1 rounded-2xl px-2 pb-2", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                            <button
                              className={clsx("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}
                              onClick={() => {
                                setIsImportModalOpen(true);
                                setIsActionsMenuOpen(false);
                              }}
                              type="button"
                            >
                              <Upload className="h-4 w-4" />
                              Import
                            </button>
                                <button
                                  className={clsx("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}
                                  onClick={exportActiveBoardAsJson}
                                  type="button"
                                >
                                  <Save className="h-4 w-4" />
                                  Export
                                </button>
                              </div>
                            ) : null}
                      </div>
                      <button
                        className={clsx(
                          "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                          isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                        )}
                        onClick={() => {
                          void toggleThemePreference();
                          setIsActionsMenuOpen(false);
                        }}
                        type="button"
                      >
                        {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        {isDarkMode ? "Lumos" : "Nox"}
                      </button>
                      {currentUser ? (
                        <button
                          className={clsx(
                            "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                            isDarkMode
                              ? "hover:bg-white/10"
                              : "hover:bg-slate-100",
                          )}
                          onClick={handleSignOut}
                          type="button"
                        >
                          <LogOut className="h-4 w-4" />
                          Log Out
                        </button>
                      ) : authEnabled ? (
                        <button
                          className={clsx(
                            "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                            isDarkMode
                              ? "hover:bg-white/10"
                              : "hover:bg-slate-100",
                          )}
                          disabled={isAuthLoading}
                          onClick={() => {
                            void handleOAuthLogin("google");
                            setIsActionsMenuOpen(false);
                          }}
                          type="button"
                        >
                          <LogOut className="h-4 w-4" />
                          Log In
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div>
            <button
              aria-label="Open actions"
              className={clsx(
                "fixed bottom-7 right-4 z-[70] inline-flex h-14 w-14 items-center justify-center rounded-full shadow-[0_18px_40px_rgba(15,23,42,0.24)] lg:hidden",
                isDarkMode
                  ? "bg-slate-950 text-white"
                  : "bg-white text-slate-950",
              )}
              onClick={() => {
                setIsBoardsMenuOpen(false);
                setIsMobileActionsOpen(true);
              }}
              type="button"
            >
              <Plus className="h-6 w-6" />
            </button>

            {isMobileActionsOpen ? (
              <div
                className="fixed inset-0 z-[80] bg-slate-950/40 p-4 backdrop-blur-sm lg:hidden"
                onClick={() => setIsMobileActionsOpen(false)}
              >
                <div
                  className={clsx(
                    "mx-auto mt-[14vh] max-w-3xl rounded-[28px] border p-4 shadow-[0_24px_60px_rgba(19,27,68,0.24)] sm:mt-[10vh] sm:p-5",
                    isDarkMode
                      ? "border-white/10 bg-slate-900 text-slate-100"
                      : "border-white/70 bg-white text-slate-950",
                  )}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] opacity-70">
                        Actions
                      </h2>
                      <p className={clsx("mt-1 text-xs", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                        {isUploadingArtwork
                          ? "Uploading artwork..."
                          : saveState === "error" || saveState === "offline"
                            ? saveErrorMessage ?? "Changes could not be saved."
                            : isPersisting
                              ? "Saving..."
                              : `Last saved ${formatLastSavedAt(lastSavedAt)}`}
                      </p>
                    </div>
                    <button
                      className={clsx(
                        "rounded-full p-2 transition",
                        isDarkMode
                          ? "bg-white/10 text-slate-200 hover:bg-white/15"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                      )}
                      onClick={() => setIsMobileActionsOpen(false)}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_260px]">
                      <input
                      className={clsx(
                        "rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950/60 text-white placeholder:text-slate-500 focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                      )}
                      placeholder="Search title or series"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />

                    <SeriesFilterButton
                      allSeries={allSeries}
                      currentSeriesFilter={seriesFilter}
                      isDarkMode={isDarkMode}
                      isOpen={isHeaderSeriesMenuOpen}
                      onSelect={(series) => {
                        setSeriesFilter(series);
                        setIsHeaderSeriesMenuOpen(false);
                      }}
                      onToggle={() => setIsHeaderSeriesMenuOpen((current) => !current)}
                    />

                    <button
                      className={clsx(
                        "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition sm:col-span-2",
                        isDarkMode
                          ? "border-white/10 bg-slate-950/60 text-slate-100 hover:border-white/40"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                      )}
                      onClick={openQuickAddModal}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                      {`Add ${boardVocabulary.singular}`}
                    </button>

                    <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                      <button
                        className={clsx(
                          "col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition",
                          isDarkMode
                            ? "border-white/10 bg-slate-950/60 text-slate-100 hover:border-white/40 disabled:border-white/10 disabled:text-slate-500"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-950 disabled:border-slate-200 disabled:text-slate-400",
                        )}
                        disabled={history.length === 0}
                        onClick={handleUndo}
                        type="button"
                      >
                        <RotateCcw className="h-4 w-4" />
                        <span>Undo</span>
                      </button>

                      <button
                        className={clsx(
                          "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border transition",
                          isDarkMode
                            ? "border-white/10 bg-slate-950/60 text-slate-100 hover:border-white/40"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                        )}
                        onClick={openShareModal}
                        type="button"
                      >
                        <Share2 className="h-4 w-4" />
                        <span>Share</span>
                      </button>

                      <div className="relative" data-actions-menu-root="true">
                        <button
                          aria-label="Settings"
                          className={clsx(
                            "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border transition",
                            isDarkMode
                              ? "border-white/10 bg-slate-950/60 text-slate-100 hover:border-white/40"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                          )}
                          onClick={() => {
                            setIsBoardsMenuOpen(false);
                            setIsActionsMenuOpen((current) => !current);
                          }}
                          type="button"
                        >
                          <Settings2 className="h-4 w-4" />
                          <span>Settings</span>
                        </button>
                        {isActionsMenuOpen ? (
                          <div
                            className={clsx(
                              "absolute right-0 z-40 mt-2 min-w-[260px] rounded-3xl border p-2 shadow-[0_24px_60px_rgba(19,27,68,0.2)] backdrop-blur",
                              isDarkMode
                                ? "border-white/10 bg-slate-950/95 text-slate-100"
                                : "border-slate-200 bg-white/95 text-slate-700",
                            )}
                          >
                            <div className="rounded-2xl">
                              <MenuSectionButton
                                icon={<Upload className="h-4 w-4" />}
                                label="Import/Export"
                                isDarkMode={isDarkMode}
                                isOpen={isTransferMenuOpen}
                                onClick={() => {
                                  setIsTransferMenuOpen((current) => !current);
                                  setIsBoardsMenuOpen(false);
                                  setIsCustomizationMenuOpen(false);
                                  setIsMaintenanceMenuOpen(false);
                                }}
                              />
                              {isTransferMenuOpen ? (
                                <div className={clsx("mt-1 space-y-1 rounded-2xl px-2 pb-2", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                                  <button
                                    className={clsx("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}
                                    onClick={() => {
                                      setIsImportModalOpen(true);
                                      setIsActionsMenuOpen(false);
                                      setIsMobileActionsOpen(false);
                                    }}
                                    type="button"
                                  >
                                    <Upload className="h-4 w-4" />
                                    Import
                                  </button>
                                  <button
                                    className={clsx("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}
                                    onClick={exportActiveBoardAsJson}
                                    type="button"
                                  >
                                    <Save className="h-4 w-4" />
                                    Export
                                  </button>
                                </div>
                              ) : null}
                            </div>
                            <button
                              className={clsx("flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100")}
                              onClick={() => {
                                void toggleThemePreference();
                                setIsActionsMenuOpen(false);
                                setIsMobileActionsOpen(false);
                              }}
                              type="button"
                            >
                              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                              {isDarkMode ? "Lumos" : "Nox"}
                            </button>
                            {currentUser ? (
                              <button
                                className={clsx(
                                  "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                                  isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                                )}
                                onClick={handleSignOut}
                                type="button"
                              >
                                <LogOut className="h-4 w-4" />
                                {getUserDisplayName(currentUser)}
                              </button>
                            ) : authEnabled ? (
                              <button
                                className={clsx(
                                  "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                                  isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                                )}
                                disabled={isAuthLoading}
                                onClick={() => {
                                  void handleOAuthLogin("google");
                                  setIsActionsMenuOpen(false);
                                  setIsMobileActionsOpen(false);
                                }}
                                type="button"
                              >
                                <LogOut className="h-4 w-4" />
                                Log In
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="col-span-2 grid grid-cols-2 gap-3 sm:col-span-2">
                        <div className="space-y-2">
                          <button
                            className={clsx(
                              "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition",
                              isDarkMode
                                ? "border-white/10 bg-slate-950/60 text-slate-100 hover:border-white/40"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                            )}
                            onClick={() => {
                              setIsMaintenanceMenuOpen((current) => !current);
                              setIsBoardsMenuOpen(false);
                              setIsCustomizationMenuOpen(false);
                              setIsTransferMenuOpen(false);
                              setIsActionsMenuOpen(false);
                            }}
                            type="button"
                          >
                            <span className="inline-flex items-center justify-center gap-2 text-center">
                              <Wrench className="h-4 w-4" />
                              Maintenance
                            </span>
                          </button>
                          {isMaintenanceMenuOpen ? (
                            <div className={clsx("space-y-1 rounded-2xl px-2 pb-2 pt-1", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                              <button className={clsx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => openDuplicateCleanupModal()} type="button">
                                <Trash2 className="h-4 w-4" />
                                Delete Duplicates
                              </button>
                              <button className={clsx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => openTitleTidyModal()} type="button">
                                <Sparkles className="h-4 w-4" />
                                Tidy Titles
                              </button>
                              <button className={clsx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => { void openSeriesScrapeModal(); }} type="button">
                                <WandSparkles className="h-4 w-4" />
                                Series Scraper
                              </button>
                              <button
                                className={clsx(
                                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                  isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
                                  boards.length <= 1 && "cursor-not-allowed opacity-50",
                                )}
                                disabled={boards.length <= 1}
                                onClick={() => requestDeleteBoard()}
                                type="button"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete Board
                              </button>
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <button
                            className={clsx(
                              "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition",
                              isDarkMode
                                ? "border-white/10 bg-slate-950/60 text-slate-100 hover:border-white/40"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                            )}
                            onClick={() => {
                              setIsCustomizationMenuOpen((current) => !current);
                              setIsMaintenanceMenuOpen(false);
                              setIsTransferMenuOpen(false);
                              setIsActionsMenuOpen(false);
                            }}
                            type="button"
                          >
                            <span className="inline-flex items-center justify-center gap-2 text-center">
                              <Sparkles className="h-4 w-4" />
                              Customization
                            </span>
                          </button>
                          {isCustomizationMenuOpen ? (
                            <div className={clsx("space-y-1 rounded-2xl px-2 pb-2 pt-1", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                              <div className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}>
                                <span>Collapse Cards</span>
                                <ToggleSwitch
                                  ariaLabel="Toggle Collapse Cards"
                                  enabled={activeBoardSettings.collapseCards}
                                  isDarkMode={isDarkMode}
                                  onClick={toggleCollapseCardsSetting}
                                />
                              </div>
                              <div className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}>
                                <span>Tier Highlights</span>
                                <ToggleSwitch
                                  ariaLabel="Toggle Tier Highlights"
                                  enabled={activeBoardSettings.showTierHighlights}
                                  isDarkMode={isDarkMode}
                                  onClick={() => updateActiveBoardSettings({ showTierHighlights: !activeBoardSettings.showTierHighlights })}
                                />
                              </div>
                              <button
                                className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}
                                onClick={promptForCardLabel}
                                type="button"
                              >
                                <span>Card Label</span>
                                <span className="text-xs opacity-70">{activeBoardSettings.cardLabel?.trim() || boardVocabulary.singular}</span>
                              </button>
                              <button
                                className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}
                                onClick={() => setIsBoardIconModalOpen(true)}
                                type="button"
                              >
                                <span>Board Icon</span>
                                {renderBoardIcon(boardIconKeysById.get(activeBoardId) ?? "game", activeBoard.settings?.boardIconUrl, "h-4 w-4")}
                              </button>
                              <button
                                className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}
                                onClick={() => {
                                  setIsBoardFieldSettingsModalOpen(true);
                                  setIsActionsMenuOpen(false);
                                  setIsMobileActionsOpen(false);
                                }}
                                type="button"
                              >
                                <span>Fields</span>
                                <Settings2 className="h-4 w-4 opacity-70" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>

                    </div>

                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <section
            ref={columnMenuBoundaryRef}
            className={clsx(
              "relative z-0 w-full min-w-0 overflow-visible rounded-[32px] border p-4 shadow-[0_24px_60px_rgba(19,27,68,0.12)] backdrop-blur",
              isDarkMode
                ? "border-white/10 bg-white/5"
                : "border-white/70 bg-white/60",
            )}
          >
            <div className="mb-4 min-w-0">
              {isEditingBoardTitle ? (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    autoFocus
                    className={clsx(
                      "min-w-[260px] flex-1 rounded-2xl border px-4 py-3 text-2xl font-black outline-none transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950/70 text-white focus:border-white/40"
                        : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                    )}
                    value={boardTitleDraft}
                    onChange={(event) => setBoardTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveBoardTitle();
                      }

                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelEditingBoardTitle();
                      }
                    }}
                  />
                  <button
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                      isDarkMode
                        ? "bg-white text-slate-950 hover:bg-slate-200"
                        : "bg-slate-950 text-white hover:bg-slate-800",
                    )}
                    onClick={saveBoardTitle}
                    type="button"
                  >
                    <Save className="h-4 w-4" />
                    Save
                  </button>
                  <button
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                    )}
                    onClick={cancelEditingBoardTitle}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="group flex min-w-0 items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="group/boards relative shrink-0" data-board-switcher-root="true">
                      <button
                        aria-label="Switch board"
                        className={clsx(
                          "inline-flex h-11 w-11 items-center justify-center rounded-2xl transition",
                          isDarkMode
                            ? "bg-white/10 text-white hover:bg-white/15"
                            : "bg-white text-slate-950 hover:bg-slate-100",
                        )}
                        onClick={() => {
                          setIsBoardsMenuOpen((current) => !current);
                          setIsActionsMenuOpen(false);
                          setIsMobileActionsOpen(false);
                        }}
                        type="button"
                      >
                        {renderBoardIcon(
                          boardIconKeysById.get(activeBoardId) ?? "game",
                          activeBoard.settings?.boardIconUrl,
                          "h-5 w-5",
                        )}
                      </button>
                      <HoverTooltip isDarkMode={isDarkMode} label="Boards" scope="boards" />
                      {isBoardsMenuOpen ? (
                        <div
                          className={clsx(
                            "absolute left-0 top-full z-[270] mt-2 min-w-[220px] rounded-3xl border p-2 shadow-[0_24px_60px_rgba(19,27,68,0.2)] backdrop-blur",
                            isDarkMode
                              ? "border-white/10 bg-slate-950/95 text-slate-100"
                              : "border-slate-200 bg-white/95 text-slate-700",
                          )}
                        >
                          <div className={clsx("space-y-1 rounded-2xl", isDarkMode ? "bg-white/0" : "bg-transparent")}>
                            {boards.map((board) => (
                              <button
                                key={board.id}
                                className={clsx(
                                  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition",
                                  isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-50",
                                  board.id === activeBoardId && (isDarkMode ? "text-white" : "text-slate-950"),
                                )}
                                onClick={() => switchBoard(board.id)}
                                type="button"
                              >
                                <span className="inline-flex min-w-0 items-center gap-2">
                                  {renderBoardIcon(
                                    boardIconKeysById.get(board.id) ?? "game",
                                    board.settings?.boardIconUrl,
                                    "h-4 w-4 shrink-0",
                                  )}
                                  <span className="truncate">{board.title}</span>
                                </span>
                                {board.id === activeBoardId ? <span className="text-xs opacity-70">Active</span> : null}
                              </button>
                            ))}
                            <button
                              className={clsx(
                                "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-50",
                              )}
                              onClick={() => {
                                openCreateBoardModal();
                                setIsBoardsMenuOpen(false);
                              }}
                              type="button"
                            >
                              <Plus className="h-4 w-4" />
                              New Board
                            </button>
                            {boards.length > 1 ? (
                              <button
                                className={clsx(
                                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                  isDarkMode ? "text-rose-200 hover:bg-white/10" : "text-rose-700 hover:bg-slate-50",
                                )}
                                onClick={() => requestDeleteBoard()}
                                type="button"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete Board
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <h1 className={clsx("min-w-0 truncate text-2xl font-black sm:text-3xl", isDarkMode ? "text-white" : "text-slate-950")}>
                      {activeBoardTitle}
                    </h1>
                    <div
                      className={clsx(
                        "inline-flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold",
                        isDarkMode ? "bg-white/10 text-slate-200" : "bg-white text-slate-700",
                      )}
                      title={
                        saveState === "error" || saveState === "offline"
                          ? saveErrorMessage ?? "Changes could not be saved."
                          : `Last saved ${formatLastSavedAt(lastSavedAt)}`
                      }
                    >
                      <SaveStatusIcon isPersisting={isPersisting} saveState={saveState} />
                      <span className="hidden min-[1100px]:inline">
                        {saveState === "error" || saveState === "offline"
                          ? "Needs attention"
                          : saveState === "saved"
                            ? "Saved"
                            : saveState === "saving"
                              ? "Saving"
                              : "Pending"}
                      </span>
                    </div>
                    <div className="group/rename relative shrink-0">
                      <button
                        className={clsx(
                          "shrink-0 rounded-full p-2 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
                          isDarkMode
                            ? "bg-white/10 text-slate-200 hover:bg-white/15"
                            : "bg-white text-slate-700 hover:bg-slate-100",
                        )}
                        onClick={startEditingBoardTitle}
                        type="button"
                        aria-label={`Rename ${activeBoardTitle}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <HoverTooltip isDarkMode={isDarkMode} label="Rename" scope="rename" />
                    </div>
                  </div>
                  <div className="hidden shrink-0 items-center gap-2 xl:flex">
                    <input
                      name="title"
                      className={clsx(
                        "w-[240px] rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950/60 text-white placeholder:text-slate-500 focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                      )}
                      placeholder="Search title or series"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                    <SeriesFilterButton
                      allSeries={allSeries}
                      className="w-[190px]"
                      currentSeriesFilter={seriesFilter}
                      isDarkMode={isDarkMode}
                      isOpen={isHeaderSeriesMenuOpen}
                      onSelect={(series) => {
                        setSeriesFilter(series);
                        setIsHeaderSeriesMenuOpen(false);
                      }}
                      onToggle={() => setIsHeaderSeriesMenuOpen((current) => !current)}
                    />
                    <button
                      className={clsx(
                        "inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950/60 text-slate-100 hover:border-white/40 disabled:border-white/10 disabled:text-slate-500"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-950 disabled:border-slate-200 disabled:text-slate-400",
                      )}
                      disabled={history.length === 0}
                      onClick={handleUndo}
                      type="button"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>Undo</span>
                    </button>
                    <div className="relative" data-actions-menu-root="true">
                      <button
                        aria-label="Settings"
                        className={clsx(
                          "inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl border px-4 transition",
                          isDarkMode
                            ? "border-white/10 bg-slate-950/60 text-slate-100 hover:border-white/40"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                        )}
                        onClick={() => {
                          setIsBoardsMenuOpen(false);
                          setIsActionsMenuOpen((current) => !current);
                        }}
                        type="button"
                      >
                        <Settings2 className="h-4 w-4" />
                        <span>Settings</span>
                      </button>
                      {isActionsMenuOpen ? (
                        <div
                          className={clsx(
                            "absolute right-0 z-[260] mt-2 min-w-[220px] rounded-3xl border p-2 shadow-[0_24px_60px_rgba(19,27,68,0.2)] backdrop-blur",
                            isDarkMode
                              ? "border-white/10 bg-slate-950/95 text-slate-100"
                              : "border-slate-200 bg-white/95 text-slate-700",
                          )}
                        >
                          <button
                            className={clsx(
                              "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                              isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                            )}
                            onClick={openShareModal}
                            type="button"
                          >
                            <Share2 className="h-4 w-4" />
                            Share
                          </button>
                          <div className="rounded-2xl">
                            <MenuSectionButton
                              icon={<Sparkles className="h-4 w-4" />}
                              label="Customization"
                              isDarkMode={isDarkMode}
                              isOpen={isCustomizationMenuOpen}
                              onClick={() => {
                                setIsCustomizationMenuOpen((current) => !current);
                                setIsMaintenanceMenuOpen(false);
                                setIsTransferMenuOpen(false);
                              }}
                            />
                            {isCustomizationMenuOpen ? (
                              <div className={clsx("mt-1 space-y-1 rounded-2xl px-2 pb-2", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                                <div className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}>
                                  <span>Collapse Cards</span>
                                  <ToggleSwitch
                                    ariaLabel="Toggle Collapse Cards"
                                    enabled={activeBoardSettings.collapseCards}
                                    isDarkMode={isDarkMode}
                                    onClick={toggleCollapseCardsSetting}
                                  />
                                </div>
                                <div className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}>
                                  <span>Tier Highlights</span>
                                  <ToggleSwitch
                                    ariaLabel="Toggle Tier Highlights"
                                    enabled={activeBoardSettings.showTierHighlights}
                                    isDarkMode={isDarkMode}
                                    onClick={() => updateActiveBoardSettings({ showTierHighlights: !activeBoardSettings.showTierHighlights })}
                                  />
                                </div>
                                <button
                                  className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}
                                  onClick={promptForCardLabel}
                                  type="button"
                                >
                                  <span>Card Label</span>
                                  <span className="text-xs opacity-70">{activeBoardSettings.cardLabel?.trim() || boardVocabulary.singular}</span>
                                </button>
                                <button
                                  className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}
                                  onClick={() => setIsBoardIconModalOpen(true)}
                                  type="button"
                                >
                                  <span>Board Icon</span>
                                  {renderBoardIcon(boardIconKeysById.get(activeBoardId) ?? "game", activeBoard.settings?.boardIconUrl, "h-4 w-4")}
                                </button>
                                <button
                                  className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}
                                  onClick={() => {
                                    setIsBoardFieldSettingsModalOpen(true);
                                    setIsActionsMenuOpen(false);
                                    setIsMobileActionsOpen(false);
                                  }}
                                  type="button"
                                >
                                  <span>Fields</span>
                                  <Settings2 className="h-4 w-4 opacity-70" />
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <div className="rounded-2xl">
                            <MenuSectionButton
                              icon={<Wrench className="h-4 w-4" />}
                              label="Maintenance"
                              isDarkMode={isDarkMode}
                              isOpen={isMaintenanceMenuOpen}
                              onClick={() => {
                                setIsMaintenanceMenuOpen((current) => !current);
                                setIsBoardsMenuOpen(false);
                                setIsCustomizationMenuOpen(false);
                                setIsTransferMenuOpen(false);
                              }}
                            />
                            {isMaintenanceMenuOpen ? (
                              <div className={clsx("mt-1 space-y-1 rounded-2xl px-2 pb-2", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                                <button className={clsx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => openDuplicateCleanupModal()} type="button">
                                  <Trash2 className="h-4 w-4" />
                                  Delete Duplicates
                                </button>
                                <button className={clsx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => openTitleTidyModal()} type="button">
                                  <Sparkles className="h-4 w-4" />
                                  Tidy Titles
                                </button>
                                <button className={clsx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => { void openSeriesScrapeModal(); }} type="button">
                                  <WandSparkles className="h-4 w-4" />
                                  Series Scraper
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <div className="rounded-2xl">
                            <MenuSectionButton
                              icon={<Upload className="h-4 w-4" />}
                              label="Import/Export"
                              isDarkMode={isDarkMode}
                              isOpen={isTransferMenuOpen}
                              onClick={() => {
                                setIsTransferMenuOpen((current) => !current);
                                setIsBoardsMenuOpen(false);
                                setIsCustomizationMenuOpen(false);
                                setIsMaintenanceMenuOpen(false);
                              }}
                            />
                            {isTransferMenuOpen ? (
                              <div className={clsx("mt-1 space-y-1 rounded-2xl px-2 pb-2", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                                <button
                                  className={clsx(
                                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                    isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
                                  )}
                                  onClick={() => {
                                    setIsImportModalOpen(true);
                                    setIsActionsMenuOpen(false);
                                  }}
                                  type="button"
                                >
                                  <Upload className="h-4 w-4" />
                                  Import
                                </button>
                                <button
                                  className={clsx(
                                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                    isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
                                  )}
                                  onClick={exportActiveBoardAsJson}
                                  type="button"
                                >
                                  <Save className="h-4 w-4" />
                                  Export
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <button
                            className={clsx(
                              "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                              isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                            )}
                            onClick={() => {
                              void toggleThemePreference();
                              setIsActionsMenuOpen(false);
                            }}
                            type="button"
                          >
                            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                            {isDarkMode ? "Lumos" : "Nox"}
                          </button>
                          {currentUser ? (
                            <button
                              className={clsx(
                                "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                                isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                              )}
                              onClick={handleSignOut}
                              type="button"
                            >
                              <LogOut className="h-4 w-4" />
                              {currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email || "Log Out"}
                            </button>
                          ) : authEnabled ? (
                            <button
                              className={clsx(
                                "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                                isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                              )}
                              disabled={isAuthLoading}
                              onClick={() => {
                                void handleOAuthLogin("google");
                                setIsActionsMenuOpen(false);
                              }}
                              type="button"
                            >
                              <LogOut className="h-4 w-4" />
                              Log In
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="hidden lg:block xl:hidden" data-actions-menu-root="true">
                    <button
                      aria-label="Open actions"
                      className={clsx(
                        "inline-flex h-11 w-11 items-center justify-center rounded-full shadow-[0_18px_40px_rgba(15,23,42,0.18)]",
                        isDarkMode ? "bg-slate-950 text-white" : "bg-white text-slate-950",
                      )}
                      onClick={() => {
                        setIsBoardsMenuOpen(false);
                        setIsMobileActionsOpen(true);
                      }}
                      type="button"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            <DndContext
              autoScroll={{
                enabled: dragPointerKind !== "mouse",
                activator: AutoScrollActivator.Pointer,
                acceleration: 10,
                interval: 4,
                threshold: { x: 0.16, y: 0.28 },
              }}
              sensors={sensors}
              collisionDetection={(args) => {
                const pointerHits = pointerWithin(args);
                if (pointerHits.length > 0) {
                  if (isDragGapSuppressed) {
                    return pointerHits.filter(
                      (hit) => !String(hit.id).startsWith("insert::"),
                    );
                  }
                  const insertHits = pointerHits.filter((hit) =>
                    String(hit.id).startsWith("insert::"),
                  );
                  return insertHits.length > 0 ? insertHits : pointerHits;
                }

                return closestCorners(args);
              }}
              onDragStart={({ active, activatorEvent }) => {
                setIsCardDragging(true);
                setIsDragGapSuppressed(false);
                captureDragPointer(activatorEvent);
                setActiveDragEntryId(String(active.id));
              }}
              onDragCancel={() => {
                setIsCardDragging(false);
                setIsDragGapSuppressed(false);
                setDragPointerKind(null);
                dragPointerCoordsRef.current = null;
                setActiveDragEntryId(null);
              }}
              onDragEnd={handleDragEnd}
            >
              {activeBoardLayout === "tier-list" ? (
                <div ref={boardLaneRef} className="relative z-10 flex w-full min-w-0 flex-col gap-1 pb-3">
                  {columns.map((column) => {
                    const visibleCards = filterCards(
                      cardsByColumn[column.id] ?? [],
                      searchTerm,
                      seriesFilter,
                    );
                    const unsortedColumnId = getTierListUnsortedColumnId(columns);

                    return (
                      <Fragment key={column.id}>
                        <TierListRow
                          addLabel={boardVocabulary.singular}
                          cards={visibleCards}
                          collapseCards={activeBoardSettings.collapseCards}
                          column={column}
                          frontFieldDefinitions={activeBoardFieldDefinitions}
                          isDarkMode={isDarkMode}
                          isMobileViewport={isMobileViewport}
                          isEditingColumn={editingColumnId === column.id}
                          editingColumnDraft={editingColumnDraft}
                          isUnsortedRow={column.id === unsortedColumnId}
                          onColumnDraftChange={setEditingColumnDraft}
                          onCancelColumnEdit={cancelEditingColumn}
                          onSaveColumnEdit={() => saveEditingColumn(column.id)}
                          onOpenRowOptions={(anchorRect) => openTierRowOptions(column.id, anchorRect)}
                          onAddCard={openAddGameModal}
                          onDragScrollActivity={suppressDragGapsTemporarily}
                          onEditCard={startEditingCard}
                          isAnyCardDragging={isCardDragging}
                          isDragGapSuppressed={isDragGapSuppressed}
                          showArtworkOnCards={shouldShowArtworkOnCards}
                          showSeriesOnCards={Boolean(seriesFieldDefinition?.showOnCardFront)}
                        />
                        {column.id !== unsortedColumnId ? (
                          <TierListAddRowDivider
                            isDarkMode={isDarkMode}
                            isMobileViewport={isMobileViewport}
                            mobileArmed={revealedMobileAddTierRowIndex === columns.findIndex((item) => item.id === column.id) + 1}
                            onArm={() =>
                              setRevealedMobileAddTierRowIndex(
                                columns.findIndex((item) => item.id === column.id) + 1,
                              )
                            }
                            onClick={() => addTierListRowAt(columns.findIndex((item) => item.id === column.id) + 1)}
                          />
                        ) : null}
                      </Fragment>
                    );
                  })}
                </div>
              ) : (
                <div ref={boardLaneRef} className="relative z-10 flex w-full min-w-0 max-w-full items-start snap-x snap-mandatory gap-2 overflow-x-auto overflow-y-visible pb-3 sm:snap-none">
                  {columns.map((column, columnIndex) => {
                    const visibleCards = filterCards(
                      cardsByColumn[column.id] ?? [],
                      searchTerm,
                      seriesFilter,
                    );

                    return (
                      <div key={column.id} className="contents">
                        <BoardColumn
                          column={column}
                          fullCards={cardsByColumn[column.id] ?? []}
                          addLabel={boardVocabulary.singular}
                          collapseCards={activeBoardSettings.collapseCards}
                          showSeriesOnCards={Boolean(seriesFieldDefinition?.showOnCardFront)}
                          showArtworkOnCards={shouldShowArtworkOnCards}
                          showTierHighlights={activeBoardSettings.showTierHighlights}
                          isDarkMode={isDarkMode}
                          isMobileViewport={isMobileViewport}
                          frontFieldDefinitions={activeBoardFieldDefinitions}
                          disableAddAffordances={isCardDragging || Boolean(column.mirrorsEntireBoard) || hasBlockingMenuOpen}
                          isCardDragging={isCardDragging}
                          isDragGapSuppressed={isDragGapSuppressed}
                          cards={visibleCards}
                          activeTierFilter={columnTierFilters[column.id] ?? "all"}
                          currentSeriesFilter={seriesFilter}
                          filtering={filtering}
                          isEditingColumn={editingColumnId === column.id}
                          editingColumnDraft={editingColumnDraft}
                          onColumnDraftChange={setEditingColumnDraft}
                          onEditColumn={() => startEditingColumn(column)}
                          onCancelColumnEdit={cancelEditingColumn}
                          onSaveColumnEdit={() => saveEditingColumn(column.id)}
                          onEditCard={startEditingCard}
                          onAddCard={openAddGameModal}
                          onOpenPairwiseQuiz={() => {
                            void openPairwiseQuiz(column.id);
                          }}
                          onSortCards={sortColumnCards}
                          isMenuOpen={openColumnMenuId === column.id}
                          isSortMenuOpen={openColumnSortMenuId === column.id}
                          isFilterMenuOpen={openColumnFilterMenuId === column.id}
                          isMirrorMenuOpen={openColumnMirrorMenuId === column.id}
                          isMaintenanceMenuOpen={openColumnMaintenanceMenuId === column.id}
                          onToggleMenu={() =>
                            setOpenColumnMenuId((current) => {
                              const nextId = current === column.id ? null : column.id;
                              if (nextId !== column.id) {
                                setOpenColumnSortMenuId(null);
                                setOpenColumnFilterMenuId(null);
                                setOpenColumnMirrorMenuId(null);
                              }
                              return nextId;
                            })
                          }
                          onToggleSortMenu={() =>
                            setOpenColumnSortMenuId((current) => {
                              const nextId = current === column.id ? null : column.id;
                              if (nextId === column.id) {
                                setOpenColumnFilterMenuId(null);
                                setOpenColumnMirrorMenuId(null);
                              }
                              return nextId;
                            })
                          }
                          onToggleFilterMenu={() =>
                            setOpenColumnFilterMenuId((current) => {
                              const nextId = current === column.id ? null : column.id;
                              if (nextId === column.id) {
                                setOpenColumnSortMenuId(null);
                                setOpenColumnMirrorMenuId(null);
                              }
                              return nextId;
                            })
                          }
                          onToggleMirrorMenu={() =>
                            setOpenColumnMirrorMenuId((current) => {
                              const nextId = current === column.id ? null : column.id;
                              if (nextId === column.id) {
                                setOpenColumnSortMenuId(null);
                                setOpenColumnFilterMenuId(null);
                                setOpenColumnMaintenanceMenuId(null);
                              }
                              return nextId;
                            })
                          }
                          onToggleMaintenanceMenu={() =>
                            setOpenColumnMaintenanceMenuId((current) => {
                              const nextId = current === column.id ? null : column.id;
                              if (nextId === column.id) {
                                setOpenColumnSortMenuId(null);
                                setOpenColumnFilterMenuId(null);
                                setOpenColumnMirrorMenuId(null);
                              }
                              return nextId;
                            })
                          }
                          onOpenDuplicateCleanup={() => openDuplicateCleanupModal(column.id)}
                          onOpenMoveAll={() => requestMoveAllCards(column.id)}
                          onOpenTitleTidy={() => openTitleTidyModal(column.id)}
                          onOpenSeriesScrape={() => {
                            void openSeriesScrapeModal(column.id);
                          }}
                          onDeleteColumn={deleteColumn}
                          onToggleBoardMirrorColumn={toggleBoardMirrorColumn}
                          onToggleDontRank={toggleColumnDontRank}
                          onToggleExcludeFromBoardMirrors={toggleExcludeColumnFromBoardMirrors}
                          onLinkMirrorMatches={linkMatchingMirrorCards}
                          onSetTierFilter={setColumnTierFilter}
                          onSetSeriesFilter={(nextSeries) => {
                            setSeriesFilter(nextSeries);
                            setOpenColumnMenuId(null);
                          }}
                          onDragScrollActivity={suppressDragGapsTemporarily}
                          onColumnDragStart={setDraggingColumnId}
                          onColumnDrop={moveColumnToTarget}
                          onMoveColumnLeft={(columnId) => moveColumnByDirection(columnId, "left")}
                          onMoveColumnRight={(columnId) => moveColumnByDirection(columnId, "right")}
                          draggingColumnId={draggingColumnId}
                          revealedMobileAddCardTarget={revealedMobileAddCardTarget}
                          onRevealMobileAddCardTarget={setRevealedMobileAddCardTarget}
                        />
                        <AddColumnButton
                          inline
                          isDarkMode={isDarkMode}
                          isMobileViewport={isMobileViewport}
                          mobileArmed={revealedMobileAddColumnIndex === columnIndex + 1}
                          onArm={() => setRevealedMobileAddColumnIndex(columnIndex + 1)}
                          onClick={() => {
                            setRevealedMobileAddColumnIndex(null);
                            addColumnAt(columnIndex + 1);
                          }}
                        />
                      </div>
                    );
                  })}
                  {columns.length === 0 ? (
                    <div className="flex min-h-[220px] w-full items-center justify-center">
                      <AddColumnButton
                        isDarkMode={isDarkMode}
                        isMobileViewport={isMobileViewport}
                        onClick={() => addColumnAt(0)}
                      />
                    </div>
                  ) : null}
                </div>
              )}
              {typeof document !== "undefined"
                ? createPortal(
                    <DragOverlay dropAnimation={null}>
                      {activeDragCard ? (
                        <div
                          className={clsx(
                            "pointer-events-none rotate-[1deg] opacity-70 shadow-[0_20px_38px_rgba(15,23,42,0.22)]",
                            activeBoardLayout === "tier-list"
                              ? isMobileViewport
                                ? "w-[72px]"
                                : "w-[156px]"
                              : "w-[224px]",
                          )}
                        >
                          <CardTile
                            card={activeDragCard}
                            collapseCards={activeBoardSettings.collapseCards}
                            showSeries={Boolean(seriesFieldDefinition?.showOnCardFront)}
                            showArtwork={shouldShowArtworkOnCards}
                            showTierHighlights={activeBoardSettings.showTierHighlights}
                            frontFieldDefinitions={activeBoardFieldDefinitions}
                            rankBadge={activeDragRankBadge}
                            forceSquare={activeBoardLayout === "tier-list" && activeDragColumn?.title.trim().toLowerCase() !== "unsorted"}
                            compactImageOnly={activeBoardLayout === "tier-list" && isMobileViewport}
                          />
                        </div>
                      ) : null}
                    </DragOverlay>,
                    document.body,
                  )
                : null}
            </DndContext>
          </section>
        </section>

        <EditCardDialog
          activeBoardFieldDefinitions={activeBoardFieldDefinitions}
          currentCardIsMirrored={getCardLinkedSiblings(cardsByColumn, editingCardId).length > 0}
          defaultDateFieldFormat={DEFAULT_DATE_FIELD_FORMAT}
          editArtworkInputRef={editArtworkInputRef}
          editingCardDraft={editingCardDraft}
          editingCardId={editingCardId}
          editingDuplicateAction={editingDuplicateAction}
          imageFieldLabel={imageFieldLabel}
          isDarkMode={isDarkMode}
          isEditFieldSettingsOpen={isEditFieldSettingsOpen}
          isOpen={Boolean(editingCardId && editingCardDraft)}
          isUploadingArtwork={isUploadingArtwork}
          mirroredSiblingColumnTitle={getMirroredSiblingColumnTitle(editingCardId)}
          notesFieldLabel={notesFieldLabel}
          onArtworkFileSelection={(event) => {
            void handleArtworkFileSelection("edit", event);
          }}
          onClose={cancelEditingCard}
          onOpenSibling={() => requestUnlinkMirroredCard(editingCardId)}
          onCopy={() => {
            const currentCard = editingCardId
              ? Object.values(cardsByColumn)
                  .flat()
                  .find((card) => card.entryId === editingCardId)
              : null;
            if (currentCard) {
              copyCardToDraft(currentCard);
            }
          }}
          onCustomFieldChange={(fieldId, value) =>
            setEditingCardDraft((current) =>
              current
                ? {
                    ...current,
                    customFields: {
                      ...current.customFields,
                      [fieldId]: value,
                    },
                  }
                : current,
            )
          }
          onDelete={() => {
            if (editingCardId) {
              const columnId = findColumnIdForEntry(editingCardId);
              if (columnId) {
                requestDeleteCard(columnId, editingCardId);
              }
            }
          }}
          onImageUrlChange={(value) => {
            setEditingDuplicateAction(null);
            setEditingCardDraft((current) =>
              current ? { ...current, imageUrl: value, imageStoragePath: undefined } : current,
            );
          }}
          onMove={() => {
            const currentCard = editingCardId
              ? Object.values(cardsByColumn)
                  .flat()
                  .find((card) => card.entryId === editingCardId)
              : null;
            if (currentCard) {
              openMoveCardModal(currentCard);
            }
          }}
          onNotesChange={(value) =>
            setEditingCardDraft((current) =>
              current ? { ...current, notes: value } : current,
            )
          }
          onOpenGifSearch={() => autofillEditingCardImage("gif")}
          onOpenImageSearch={() => autofillEditingCardImage("image")}
          onOpenUploadPicker={() => openArtworkUploadPicker("edit")}
          onReleaseYearChange={(value) =>
            setEditingCardDraft((current) =>
              current
                ? {
                    ...current,
                    releaseYear: value.replace(/[^\d]/g, "").slice(0, 4),
                  }
                : current,
            )
          }
          onResolveDuplicate={resolveEditingDuplicate}
          onSeriesChange={(value) => {
            setEditingDuplicateAction(null);
            setEditingCardDraft((current) =>
              current ? { ...current, series: value } : current,
            );
          }}
          onSubmit={handleEditingCardSubmit}
          onTitleChange={(value) => {
            setEditingDuplicateAction(null);
            setEditingCardDraft((current) =>
              current ? { ...current, title: value } : current,
            );
          }}
          onToggleFieldSettings={() => setIsEditFieldSettingsOpen((current) => !current)}
          onToggleFieldVisibility={toggleActiveBoardFieldVisibility}
          releaseYearFieldLabel={releaseYearFieldLabel}
          seriesFieldLabel={seriesFieldLabel}
          shouldShowImageField={shouldShowImageField}
          shouldShowNotesField={shouldShowNotesField}
          shouldShowReleaseYearField={shouldShowReleaseYearField}
          shouldShowSeriesField={shouldShowSeriesField}
          visibleCustomFieldDefinitions={visibleCustomFieldDefinitions}
          normalizeDateFieldInput={normalizeDateFieldInput}
        />

        <AddCardDialog
          activeBoardFieldDefinitions={activeBoardFieldDefinitions}
          addArtworkInputRef={addArtworkInputRef}
          addCardTargetColumnId={addCardTarget?.columnId ?? columns[0]?.id ?? ""}
          allSeries={allSeries}
          boardSingular={boardVocabulary.singular}
          columns={columns}
          defaultDateFieldFormat={DEFAULT_DATE_FIELD_FORMAT}
          draft={draft}
          draftDuplicateAction={draftDuplicateAction}
          imageFieldLabel={imageFieldLabel}
          isAddFieldSettingsOpen={isAddFieldSettingsOpen}
          isDarkMode={isDarkMode}
          isOpen={Boolean(addCardTarget)}
          isUploadingArtwork={isUploadingArtwork}
          newColumnOption={NEW_COLUMN_OPTION}
          notesFieldLabel={notesFieldLabel}
          onArtworkFileSelection={(event) => {
            void handleArtworkFileSelection("draft", event);
          }}
          onClose={closeAddGameModal}
          onColumnIdChange={(value) =>
            setDraft((current) => ({
              ...current,
              columnId: value,
            }))
          }
          onCustomFieldChange={(fieldId, value) =>
            setDraft((current) => ({
              ...current,
              customFields: {
                ...current.customFields,
                [fieldId]: value,
              },
            }))
          }
          onImageUrlChange={(value) => {
            setDraftDuplicateAction(null);
            setDraft((current) => ({
              ...current,
              imageUrl: value,
              imageStoragePath: undefined,
            }));
          }}
          onNewColumnTitleChange={(value) =>
            setDraft((current) => ({
              ...current,
              newColumnTitle: value,
            }))
          }
          onNotesChange={(value) =>
            setDraft((current) => ({
              ...current,
              notes: value,
            }))
          }
          onOpenGifSearch={() => handleAutofillDraftImage("gif")}
          onOpenImageSearch={() => handleAutofillDraftImage("image")}
          onOpenUploadPicker={() => openArtworkUploadPicker("draft")}
          onReleaseYearChange={(value) =>
            setDraft((current) => ({
              ...current,
              releaseYear: value.replace(/[^\d]/g, "").slice(0, 4),
            }))
          }
          onResolveDuplicate={resolveDraftDuplicate}
          onSeriesChange={(value) => {
            setDraftDuplicateAction(null);
            setDraft((current) => ({ ...current, series: value }));
          }}
          onSubmit={handleDraftSubmit}
          onTitleChange={(value) => {
            setDraftDuplicateAction(null);
            setDraft((current) => ({ ...current, title: value }));
          }}
          onToggleFieldSettings={() => setIsAddFieldSettingsOpen((current) => !current)}
          onToggleFieldVisibility={toggleActiveBoardFieldVisibility}
          releaseYearFieldLabel={releaseYearFieldLabel}
          seriesFieldLabel={seriesFieldLabel}
          seriesPlaceholder={boardVocabulary.seriesExamples}
          shouldShowImageField={shouldShowImageField}
          shouldShowNotesField={shouldShowNotesField}
          shouldShowReleaseYearField={shouldShowReleaseYearField}
          shouldShowSeriesField={shouldShowSeriesField}
          titlePlaceholder={boardVocabulary.titleExamples}
          visibleCustomFieldDefinitions={visibleCustomFieldDefinitions}
          normalizeDateFieldInput={normalizeDateFieldInput}
        />

        {artworkPicker ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setArtworkPicker(null)}
          >
            <div
              className={clsx(
                "flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Artwork
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Choose artwork
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    Pick the best match from the images found for this title.
                  </p>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => setArtworkPicker(null)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 grid max-h-[58vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
                {artworkPicker.options.map((imageUrl) => (
                  <button
                    key={imageUrl}
                    className={clsx(
                      "overflow-hidden rounded-[24px] border text-left transition hover:-translate-y-0.5",
                      isDarkMode ? "border-white/10 bg-slate-950/60" : "border-slate-200 bg-slate-50",
                    )}
                    onClick={() => selectArtworkOption(imageUrl)}
                    type="button"
                  >
                    <div
                      className="aspect-video max-h-[180px] bg-cover bg-center"
                      style={{ backgroundImage: `url(${imageUrl})` }}
                    />
                    <div className="px-4 py-3 text-sm font-semibold">
                      Use this image
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {isBoardFieldSettingsModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setIsBoardFieldSettingsModalOpen(false)}
          >
            <div
              className={clsx(
                "w-full max-w-3xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Customization
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Fields
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    Add, rename, hide, or remove the fields this board uses.
                  </p>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => setIsBoardFieldSettingsModalOpen(false)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-6">
                <FieldDefinitionManager
                  isDarkMode={isDarkMode}
                  fieldDefinitions={activeBoardFieldDefinitions}
                  onToggleVisibility={toggleActiveBoardFieldVisibility}
                  onUpdateField={updateActiveBoardField}
                  onRemoveField={removeActiveBoardField}
                  onAddField={addActiveBoardField}
                  defaultDateFieldFormat={DEFAULT_DATE_FIELD_FORMAT}
                />
              </div>
            </div>
          </div>
        ) : null}

        <ShareBoardDialog
          allSeries={allSeries}
          boardTitle={activeBoardTitle}
          sharedTitle={shareDraft.title}
          columns={columns}
          copiedShareUrl={copiedShareUrl}
          isDarkMode={isDarkMode}
          isOpen={isShareModalOpen}
          searchTerm={shareDraft.searchTerm}
          selectedColumnIds={shareDraft.columnIds}
          selectedSeriesFilter={shareDraft.seriesFilter}
          selectedTierFilter={shareDraft.tierFilter}
          onClose={() => setIsShareModalOpen(false)}
          onCopyAgain={() => {
            if (copiedShareUrl) {
              void copyShareUrlToClipboard(copiedShareUrl);
            }
          }}
          onSearchChange={(value) => setShareDraft((current) => ({ ...current, searchTerm: value }))}
          onSharedTitleChange={(value) => setShareDraft((current) => ({ ...current, title: value }))}
          onSeriesChange={(series) => setShareDraft((current) => ({ ...current, seriesFilter: series }))}
          onSubmit={() => {
            void shareActiveBoard();
          }}
          onTierChange={(tier) => setShareDraft((current) => ({ ...current, tierFilter: tier }))}
          onToggleColumn={(columnId) =>
            setShareDraft((current) => ({
              ...current,
              columnIds: current.columnIds.includes(columnId)
                ? current.columnIds.filter((value) => value !== columnId)
                : [...current.columnIds, columnId],
            }))
          }
        />

        {isImportModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setIsImportModalOpen(false)}
          >
            <div
              className={clsx(
                "w-full max-w-[760px] rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)] sm:min-w-[680px]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Import
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Upload a JSON file
                  </h2>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => setIsImportModalOpen(false)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className={clsx("mt-4 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                Upload a JSON export from another list app to replace the current board
                on this device. Trello JSON is supported right now.
              </p>

              <input
                ref={fileInputRef}
                className="hidden"
                accept=".json,application/json"
                onChange={handleImportTrelloBoard}
                type="file"
              />

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Upload className="h-4 w-4" />
                  Choose JSON File
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => setIsImportModalOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {pendingMirrorUnlink ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setPendingMirrorUnlink(null)}
          >
            <div
              className={clsx(
                "w-full max-w-2xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Linked Card
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Sever clone link?
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    <strong>{pendingMirrorUnlink.title}</strong>
                    {pendingMirrorUnlink.siblingColumnTitle ? ` is linked to a card in ${pendingMirrorUnlink.siblingColumnTitle}.` : " is linked to another card."}
                    {" "}Severing the link will let each card be edited independently.
                  </p>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => setPendingMirrorUnlink(null)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  onClick={() => {
                    unlinkMirroredCard(pendingMirrorUnlink.entryId);
                    setPendingMirrorUnlink(null);
                  }}
                  type="button"
                >
                  <Link2 className="h-4 w-4" />
                  Sever Link
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => setPendingMirrorUnlink(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {pendingMirrorLinkSuggestions ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setPendingMirrorLinkSuggestions(null)}
          >
            <div
              className={clsx(
                "w-full max-w-3xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Mirror
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Link duplicates
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    Review the matching cards below and link them to their duplicates.
                  </p>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => setPendingMirrorLinkSuggestions(null)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
                {pendingMirrorLinkSuggestions.length === 0 ? (
                  <div
                    className={clsx(
                      "rounded-3xl border px-4 py-6 text-sm",
                      isDarkMode ? "border-white/10 bg-slate-950/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600",
                    )}
                  >
                    No same-title cards were found to link right now.
                  </div>
                ) : (
                  pendingMirrorLinkSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className={clsx(
                        "relative rounded-3xl border p-4 transition",
                        suggestion.enabled
                          ? isDarkMode
                            ? "border-white/15 bg-slate-950/50 hover:bg-slate-950/70"
                            : "border-slate-200 bg-slate-50/70 hover:bg-slate-100"
                          : isDarkMode
                            ? "border-white/10 bg-slate-950/20 opacity-70 hover:bg-slate-950/40"
                            : "border-slate-200 bg-slate-50/40 opacity-70 hover:bg-slate-100",
                      )}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <MaintenanceCardPreview
                          imageUrl={suggestion.sourceImageUrl}
                          isDarkMode={isDarkMode}
                          title={suggestion.sourceCardTitle}
                        />
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{suggestion.mirrorTitle}</p>
                              <p className={clsx("mt-1 text-sm", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                                {suggestion.kind === "link"
                                  ? `Link existing mirror card to ${suggestion.sourceColumnTitle}`
                                  : `Create a new clone from ${suggestion.sourceColumnTitle}`}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 self-center">
                              {suggestion.kind === "link" && suggestion.mirrorEntryId ? (
                                <div className="relative">
                                  <button
                                    className={clsx(
                                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                                      isDarkMode ? "text-rose-300 hover:bg-rose-400/10" : "text-rose-500 hover:bg-rose-100",
                                    )}
                                    onClick={() =>
                                      setPendingMirrorDelete({
                                        columnId: suggestion.mirrorColumnId,
                                        entryId: suggestion.mirrorEntryId!,
                                        itemId: suggestion.sourceItemId,
                                        title: suggestion.mirrorTitle,
                                        columnTitle: suggestion.sourceColumnTitle,
                                      })
                                    }
                                    type="button"
                                    aria-label={`Delete ${suggestion.mirrorTitle}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </button>
                                  {pendingMirrorDelete?.entryId === suggestion.mirrorEntryId ? (
                                    <div
                                      className={clsx(
                                        "absolute right-0 top-11 z-20 w-56 rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
                                        isDarkMode ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white",
                                      )}
                                    >
                                      <button
                                        className={clsx(
                                          "flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                          isDarkMode ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100",
                                        )}
                                        onClick={() =>
                                          deleteOnlyMirrorCopy(
                                            pendingMirrorDelete.columnId,
                                            pendingMirrorDelete.entryId,
                                            pendingMirrorDelete.itemId,
                                          )
                                        }
                                        type="button"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        Delete This Copy
                                      </button>
                                      <button
                                        className={clsx(
                                          "flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                          isDarkMode ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100",
                                        )}
                                        onClick={() =>
                                          deleteAllLinkedCopies(
                                            pendingMirrorDelete.itemId,
                                            pendingMirrorDelete.entryId,
                                          )
                                        }
                                        type="button"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        Delete Both Copies
                                      </button>
                                      <button
                                        className={clsx(
                                          "flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                          isDarkMode ? "text-rose-300 hover:bg-rose-400/10" : "text-rose-500 hover:bg-rose-100",
                                        )}
                                        onClick={() => setPendingMirrorDelete(null)}
                                        type="button"
                                      >
                                        <X className="h-4 w-4" />
                                        Cancel
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                              <span className={clsx("text-xs font-semibold uppercase tracking-[0.18em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                                Link
                              </span>
                              <ToggleSwitch
                                ariaLabel={`Toggle linking ${suggestion.mirrorTitle}`}
                                enabled={suggestion.enabled}
                                isDarkMode={isDarkMode}
                                onClick={() => togglePendingMirrorLinkSuggestion(suggestion.id)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  disabled={pendingMirrorLinkSuggestions.length === 0}
                  onClick={applyPendingMirrorLinkSuggestions}
                  type="button"
                >
                  <Link2 className="h-4 w-4" />
                  Confirm Links
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => setPendingMirrorLinkSuggestions(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {pendingCardDelete ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setPendingCardDelete(null)}
          >
            <div
              className={clsx(
                "w-full max-w-2xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Delete Card
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Delete this card?
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    <strong>{pendingCardDelete.title}</strong> will be removed from this column.
                  </p>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => setPendingCardDelete(null)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  onClick={() => {
                    handleDeleteCard(pendingCardDelete.columnId, pendingCardDelete.entryId);
                    setPendingMirrorLinkSuggestions((current) =>
                      current?.filter((suggestion) => suggestion.mirrorEntryId !== pendingCardDelete.entryId) ?? current,
                    );
                    setPendingCardDelete(null);
                  }}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Card
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => setPendingCardDelete(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {pairwiseQuizSavedNotice ? (
          <div className="fixed right-4 top-4 z-[320]">
            <div
              className={clsx(
                "rounded-2xl px-4 py-3 text-sm font-semibold shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
                pairwiseQuizSavedNotice.includes("could not")
                  ? isDarkMode
                    ? "bg-rose-500/90 text-white"
                    : "bg-rose-500 text-white"
                  : isDarkMode
                    ? "bg-emerald-500/90 text-white"
                    : "bg-emerald-500 text-white",
              )}
            >
              {pairwiseQuizSavedNotice}
            </div>
          </div>
        ) : null}

        {pendingPairwiseQuizResume ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setPendingPairwiseQuizResume(null)}
          >
            <div
              className={clsx(
                "flex w-full max-w-xl flex-col rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Pairwise Quiz
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Continue where you left off?
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    {`You have saved quiz progress for ${pendingPairwiseQuizResume.columnTitle}.`}
                  </p>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => setPendingPairwiseQuizResume(null)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  onClick={continueSavedPairwiseQuiz}
                  type="button"
                >
                  Continue Quiz
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => startPairwiseQuizFromScratch(pendingPairwiseQuizResume.columnId)}
                  type="button"
                >
                  Start From Scratch
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => setPendingPairwiseQuizResume(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {pairwiseQuizState && pairwiseQuizState.candidateCard ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setPairwiseQuizState(null)}
          >
            <div
              className={clsx(
                "flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border p-4 shadow-[0_30px_80px_rgba(19,27,68,0.24)] sm:p-6",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className={clsx("text-2xl font-black sm:text-3xl", isDarkMode ? "text-white" : "text-slate-950")}>
                    Which ranks higher?
                  </h2>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => setPairwiseQuizState(null)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 grid flex-1 gap-3 overflow-y-auto pr-1 md:mt-6 md:grid-cols-2 md:gap-4">
                {[pairwiseQuizState.candidateCard, pairwiseQuizState.sortedCards[pairwiseQuizState.compareIndex]].map((card, index) =>
                  card ? (
                    <button
                      key={`${card.entryId}-${index}`}
                      className={clsx(
                        "overflow-hidden rounded-[24px] border text-left shadow-[0_20px_40px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5",
                        isDarkMode
                          ? "border-white/10 bg-slate-950/70"
                          : "border-slate-200 bg-slate-50",
                      )}
                      onClick={() => resolvePairwiseChoice(index === 0 ? "candidate" : "comparison")}
                      type="button"
                    >
                      <div
                        className="aspect-[16/8.5] w-full bg-cover bg-center sm:aspect-video"
                        style={{ backgroundImage: `url(${card.imageUrl || buildFallbackImage(card.title)})` }}
                      />
                      <div className="p-4 sm:p-5">
                        <h3 className={clsx("text-xl font-black leading-tight sm:text-2xl", isDarkMode ? "text-white" : "text-slate-950")}>
                          {card.title}
                        </h3>
                        {card.series ? (
                          <p className={clsx("mt-2 text-sm", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                            {card.series}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  ) : null,
                )}
              </div>

              <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm sm:mt-6 sm:pt-6">
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className={clsx("text-xs font-semibold uppercase tracking-[0.16em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                      Progress
                    </span>
                    <span className={clsx("text-sm font-semibold", isDarkMode ? "text-slate-200" : "text-slate-700")}>
                      {`${pairwiseQuizState.sortedCards.length} / ${
                        pairwiseQuizState.sortedCards.length +
                        pairwiseQuizState.remainingCards.length +
                        (pairwiseQuizState.candidateCard ? 1 : 0)
                      } placed`}
                    </span>
                  </div>
                  <div className={clsx("mt-2 h-2 overflow-hidden rounded-full", isDarkMode ? "bg-white/10" : "bg-slate-200")}>
                    <div
                      className={clsx("h-full rounded-full transition-all", isDarkMode ? "bg-white" : "bg-slate-950")}
                      style={{
                        width: `${
                          ((pairwiseQuizState.sortedCards.length /
                            Math.max(
                              pairwiseQuizState.sortedCards.length +
                                pairwiseQuizState.remainingCards.length +
                                (pairwiseQuizState.candidateCard ? 1 : 0),
                              1,
                            )) *
                            100)
                        }%`,
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    className={clsx(
                      "rounded-2xl border px-4 py-3 font-semibold transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40 disabled:border-white/10 disabled:text-slate-500"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-950 disabled:border-slate-200 disabled:text-slate-400",
                    )}
                    disabled={pairwiseQuizState.history.length === 0}
                    onClick={undoPairwiseChoice}
                    type="button"
                  >
                    Back
                  </button>
                  <button
                    className={clsx(
                      "rounded-2xl border px-4 py-3 font-semibold transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                    )}
                    disabled={isSavingPairwiseQuiz}
                    onClick={() => {
                      void savePairwiseQuizForLater();
                    }}
                    type="button"
                  >
                    {isSavingPairwiseQuiz ? "Saving..." : "Save & Continue Later"}
                  </button>
                  <button
                    className={clsx(
                      "rounded-2xl border px-4 py-3 font-semibold transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                    )}
                    onClick={() => setPairwiseQuizState(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {pairwiseQuizReview ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setPairwiseQuizReview(null)}
          >
            <div
              className={clsx(
                "flex max-h-[88vh] w-full max-w-4xl flex-col rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Pairwise Quiz
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Review results
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    The quiz finished in {pairwiseQuizReview.comparisons} comparisons. Tweak the order if you want, then save or cancel.
                  </p>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => setPairwiseQuizReview(null)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 flex-1 space-y-3 overflow-y-auto pr-1">
                {pairwiseQuizReview.rankedCards.map((card, index) => (
                  <div
                    key={card.entryId}
                    className={clsx(
                      "flex items-center gap-3 rounded-3xl border p-4",
                      isDarkMode ? "border-white/10 bg-slate-950/50" : "border-slate-200 bg-slate-50/70",
                    )}
                  >
                    <div className={clsx("w-10 text-center text-lg font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                      #{index + 1}
                    </div>
                    <div
                      className="h-16 w-28 shrink-0 rounded-2xl bg-cover bg-center"
                      style={{ backgroundImage: `url(${card.imageUrl || buildFallbackImage(card.title)})` }}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className={clsx("truncate text-lg font-bold", isDarkMode ? "text-white" : "text-slate-950")}>
                        {card.title}
                      </h3>
                      {card.series ? (
                        <p className={clsx("truncate text-sm", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                          {card.series}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        className={clsx(
                          "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                          isDarkMode ? "bg-white/10 text-white hover:bg-white/15" : "bg-white text-slate-700 hover:bg-slate-100",
                        )}
                        disabled={index === 0}
                        onClick={() => movePairwiseReviewCard(index, -1)}
                        type="button"
                      >
                        Move Up
                      </button>
                      <button
                        className={clsx(
                          "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                          isDarkMode ? "bg-white/10 text-white hover:bg-white/15" : "bg-white text-slate-700 hover:bg-slate-100",
                        )}
                        disabled={index === pairwiseQuizReview.rankedCards.length - 1}
                        onClick={() => movePairwiseReviewCard(index, 1)}
                        type="button"
                      >
                        Move Down
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  onClick={savePairwiseQuizReview}
                  type="button"
                >
                  <Save className="h-4 w-4" />
                  Save Ranking
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => setPairwiseQuizReview(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <BoardSetupDialog
          isDarkMode={isDarkMode}
          isOpen={isCreateBoardModalOpen}
          newBoardTitle={newBoardTitle}
          boardLayout="board"
          fieldDefinitions={normalizeFieldDefinitions(newBoardSettings.fieldDefinitions, newBoardTitle || "New Board", newBoardSettings)}
          defaultDateFieldFormat={DEFAULT_DATE_FIELD_FORMAT}
          showLoginHint={authEnabled && !currentUser}
          isLoginDisabled={isAuthLoading}
          onClose={() => {
            setIsCreateBoardModalOpen(false);
            setNewBoardTitle("");
            setNewBoardSettings(getDefaultBoardSettings("New Board", "board"));
          }}
          onLogin={() => {
            void handleOAuthLogin("google");
          }}
          onTitleChange={(nextTitle) => {
            const nextDefaults = getDefaultBoardSettings(nextTitle || "New Board", newBoardSettings.boardLayout ?? "board");
            const previousDefaultLabel = deriveDefaultCardLabel(newBoardTitle || "New Board");
            setNewBoardTitle(nextTitle);
            setNewBoardSettings((current) => ({
              ...current,
              cardLabel:
                !current.cardLabel?.trim() || current.cardLabel === previousDefaultLabel
                  ? nextDefaults.cardLabel
                  : current.cardLabel,
              fieldDefinitions: normalizeFieldDefinitions(
                current.fieldDefinitions,
                nextTitle || "New Board",
                nextDefaults,
              ).map((field) =>
                field.builtInKey === "series"
                  ? {
                      ...field,
                      label:
                        getDefaultFieldDefinitions(nextTitle || "New Board").find(
                          (defaultField) => defaultField.builtInKey === "series",
                        )?.label ?? field.label,
                    }
                  : field,
              ),
            }));
          }}
          onBoardLayoutChange={() => {}}
          onToggleVisibility={(fieldId) =>
            setNewBoardSettings((current) => ({
              ...current,
              fieldDefinitions: normalizeFieldDefinitions(current.fieldDefinitions, newBoardTitle || "New Board", current).map((field) =>
                field.id === fieldId ? { ...field, visible: !field.visible } : field,
              ),
            }))
          }
          onUpdateField={(fieldId, patch) =>
            setNewBoardSettings((current) => ({
              ...current,
              fieldDefinitions: normalizeFieldDefinitions(current.fieldDefinitions, newBoardTitle || "New Board", current).map((field) =>
                field.id === fieldId ? { ...field, ...patch } : field,
              ),
            }))
          }
          onRemoveField={(fieldId) =>
            setNewBoardSettings((current) => ({
              ...current,
              fieldDefinitions: normalizeFieldDefinitions(current.fieldDefinitions, newBoardTitle || "New Board", current).filter(
                (field) => field.id !== fieldId,
              ),
            }))
          }
          onAddField={(type) =>
            setNewBoardSettings((current) => ({
              ...current,
              fieldDefinitions: [
                ...normalizeFieldDefinitions(current.fieldDefinitions, newBoardTitle || "New Board", current),
                {
                  id: makeFieldId(),
                  label:
                    type === "short_text"
                      ? "New Field"
                      : type === "long_text"
                        ? "New Notes"
                        : type === "date"
                          ? "New Date"
                          : "New Dropdown",
                  type,
                  visible: true,
                  showLabelOnCardFront: true,
                  options: type === "select" ? ["Option 1", "Option 2"] : undefined,
                  dateFormat: type === "date" ? DEFAULT_DATE_FIELD_FORMAT : undefined,
                },
              ],
            }))
          }
          onCreateBoard={createBoardFromModal}
        />

        {isBoardIconModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setIsBoardIconModalOpen(false)}
          >
            <div
              className={clsx(
                "w-full max-w-3xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Customization
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Board icon
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    Pick one of the built-in icons or upload a custom image for this board.
                  </p>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => setIsBoardIconModalOpen(false)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {BOARD_ICON_OPTIONS.map((iconKey) => {
                  const enabled = (activeBoard.settings?.boardIconKey || boardIconKeysById.get(activeBoardId) || "game") === iconKey && !activeBoard.settings?.boardIconUrl;
                  return (
                    <button
                      key={iconKey}
                      className={clsx(
                        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                        enabled
                          ? isDarkMode
                            ? "border-white/40 bg-white/10"
                            : "border-slate-950 bg-slate-100"
                          : isDarkMode
                            ? "border-white/10 hover:border-white/30 hover:bg-white/5"
                            : "border-slate-200 hover:border-slate-950 hover:bg-slate-50",
                      )}
                      onClick={() => updateBoardIconSettings({ boardIconKey: iconKey, boardIconUrl: "" })}
                      type="button"
                    >
                      {renderBoardKindIcon(iconKey, "h-5 w-5")}
                      <span className="capitalize">{iconKey}</span>
                    </button>
                  );
                })}
              </div>

              <input
                ref={boardIconUploadInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleBoardIconUpload}
                type="file"
              />

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  onClick={() => boardIconUploadInputRef.current?.click()}
                  type="button"
                >
                  <Upload className="h-4 w-4" />
                  Upload Custom Icon
                </button>
                {(activeBoard.settings?.boardIconUrl || activeBoard.settings?.boardIconKey) ? (
                  <button
                    className={clsx(
                      "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                    )}
                    onClick={() => updateBoardIconSettings({ boardIconKey: "", boardIconUrl: "" })}
                    type="button"
                  >
                    Reset to Auto
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {isDuplicateCleanupModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => {
              setIsDuplicateCleanupModalOpen(false);
              setDuplicateCleanupSuggestions([]);
            }}
          >
            <div
              className={clsx(
                "w-full max-w-3xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Cleanup
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Clean up duplicates
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    These are same-title cards found in the current scope. The suggested removal is the entry with less content.
                  </p>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => {
                    setIsDuplicateCleanupModalOpen(false);
                    setDuplicateCleanupSuggestions([]);
                  }}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 max-h-[50vh] space-y-3 overflow-y-auto pr-1">
                {duplicateCleanupSuggestions.length === 0 ? (
                  <div
                    className={clsx(
                      "rounded-3xl border px-4 py-6 text-sm",
                      isDarkMode ? "border-white/10 bg-slate-950/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600",
                    )}
                  >
                    No duplicate titles were found within the current board.
                  </div>
                ) : (
                  duplicateCleanupSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className={clsx(
                        "rounded-3xl border p-4",
                        isDarkMode ? "border-white/10 bg-slate-950/50" : "border-slate-200 bg-slate-50/70",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{suggestion.columnTitle}</p>
                          <p className={clsx("mt-1 text-sm", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                            Keep <strong>{suggestion.keepCard.title}</strong>
                            {suggestion.keepColumnTitle ? ` in ${suggestion.keepColumnTitle}` : ""}, remove <strong>{suggestion.removeCard.title}</strong> in {suggestion.columnTitle}.
                          </p>
                        </div>
                        <button
                          className={clsx(
                            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                            isDarkMode ? "bg-white/10 text-white hover:bg-white/15" : "bg-white text-slate-700 hover:bg-slate-100",
                          )}
                          onClick={() => removeDuplicateCleanupSuggestion(suggestion.id)}
                          type="button"
                        >
                          Keep both
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className={clsx("rounded-2xl border p-3 text-sm", isDarkMode ? "border-emerald-400/20 bg-emerald-400/10" : "border-emerald-200 bg-emerald-50")}>
                          <p className="font-semibold">Keep</p>
                          <p className="mt-2">{suggestion.keepCard.title}</p>
                          <p className="mt-2 opacity-70">{`Series: ${suggestion.keepCard.series || "None"}`}</p>
                          <p className="opacity-70">{`Image: ${suggestion.keepCard.imageUrl ? "Yes" : "No"}`}</p>
                          <p className="opacity-70">{`Notes: ${suggestion.keepCard.notes ? "Yes" : "No"}`}</p>
                        </div>
                        <div className={clsx("rounded-2xl border p-3 text-sm", isDarkMode ? "border-rose-400/20 bg-rose-400/10" : "border-rose-200 bg-rose-50")}>
                          <p className="font-semibold">Remove</p>
                          <p className="mt-2">{suggestion.removeCard.title}</p>
                          <p className="mt-2 opacity-70">{`Series: ${suggestion.removeCard.series || "None"}`}</p>
                          <p className="opacity-70">{`Image: ${suggestion.removeCard.imageUrl ? "Yes" : "No"}`}</p>
                          <p className="opacity-70">{`Notes: ${suggestion.removeCard.notes ? "Yes" : "No"}`}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  onClick={applyDuplicateCleanupSuggestions}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  Apply Cleanup
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => {
                    setIsDuplicateCleanupModalOpen(false);
                    setDuplicateCleanupSuggestions([]);
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isTitleTidyModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => {
              setIsTitleTidyModalOpen(false);
              setTitleTidySuggestions([]);
            }}
          >
            <div
              className={clsx(
                "w-full max-w-4xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Cleanup
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Tidy titles
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    Review the proposed title cleanup list, edit anything you want, and then apply the approved changes.
                  </p>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => {
                    setIsTitleTidyModalOpen(false);
                    setTitleTidySuggestions([]);
                  }}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
                {titleTidySuggestions.length === 0 ? (
                  <div
                    className={clsx(
                      "rounded-3xl border px-4 py-6 text-sm",
                      isDarkMode ? "border-white/10 bg-slate-950/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600",
                    )}
                  >
                    No title cleanup suggestions were found for the current board.
                  </div>
                ) : (
                  titleTidySuggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className={clsx(
                        "rounded-3xl border p-4",
                        isDarkMode ? "border-white/10 bg-slate-950/50" : "border-slate-200 bg-slate-50/70",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{suggestion.columnTitle}</p>
                          <p className={clsx("mt-1 text-sm", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                            {suggestion.originalTitle}
                          </p>
                        </div>
                        <button
                          className={clsx(
                            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                            isDarkMode ? "bg-white/10 text-white hover:bg-white/15" : "bg-white text-slate-700 hover:bg-slate-100",
                          )}
                          onClick={() => removeTitleTidySuggestion(suggestion.id)}
                          type="button"
                        >
                          Skip
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                        <div
                          className={clsx(
                            "rounded-2xl border px-4 py-3 text-sm",
                            isDarkMode ? "border-white/10 bg-slate-900/70" : "border-slate-200 bg-white",
                          )}
                        >
                          {suggestion.originalTitle}
                        </div>
                        <div className="text-center text-sm font-semibold opacity-60">to</div>
                        <input
                          className={clsx(
                            "rounded-2xl border px-4 py-3 text-sm outline-none transition",
                            isDarkMode
                              ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                              : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                          )}
                          value={suggestion.proposedTitle}
                          onChange={(event) => updateTitleTidySuggestion(suggestion.id, event.target.value)}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  onClick={applyTitleTidySuggestions}
                  type="button"
                >
                  <Sparkles className="h-4 w-4" />
                  Apply Changes
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => {
                    setIsTitleTidyModalOpen(false);
                    setTitleTidySuggestions([]);
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isSeriesScrapeModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => {
              setIsSeriesScrapeModalOpen(false);
              setSeriesScrapeSuggestions([]);
              setSeriesScrapeScopeColumnId(undefined);
            }}
          >
            <div
              className={clsx(
                "w-full max-w-4xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Maintenance
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Series Scraper
                  </h2>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => {
                    setIsSeriesScrapeModalOpen(false);
                    setSeriesScrapeSuggestions([]);
                    setIsSeriesScrapeLoading(false);
                    setSeriesScrapeScopeColumnId(undefined);
                  }}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
                {isSeriesScrapeLoading ? (
                  <div
                    className={clsx(
                      "rounded-3xl border px-4 py-6 text-sm",
                      isDarkMode ? "border-white/10 bg-slate-950/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600",
                    )}
                  >
                    Looking up likely series...
                  </div>
                ) : seriesScrapeSuggestions.length === 0 ? (
                  <div
                    className={clsx(
                      "rounded-3xl border px-4 py-6 text-sm",
                      isDarkMode ? "border-white/10 bg-slate-950/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600",
                    )}
                  >
                    <p>No confident series suggestions were found for this view.</p>
                    <button
                      className={clsx(
                        "mt-4 inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                        isDarkMode
                          ? "bg-white text-slate-950 hover:bg-slate-200"
                          : "bg-slate-950 text-white hover:bg-slate-800",
                      )}
                      onClick={() => {
                        setSeriesScrapeSuggestions(buildSeriesScrapeFallbackSuggestions(seriesScrapeScopeColumnId));
                      }}
                      type="button"
                    >
                      <Edit3 className="h-4 w-4" />
                      Review Cards Manually
                    </button>
                  </div>
                ) : (
                  seriesScrapeSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className={clsx(
                        "rounded-3xl border p-4",
                        isDarkMode ? "border-white/10 bg-slate-950/50" : "border-slate-200 bg-slate-50/70",
                      )}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row">
                        <MaintenanceCardPreview
                          imageUrl={suggestion.imageUrl}
                          isDarkMode={isDarkMode}
                          title={suggestion.title}
                        />
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{suggestion.columnTitle}</p>
                            </div>
                            <button
                              className={clsx(
                                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                                isDarkMode ? "bg-white/10 text-white hover:bg-white/15" : "bg-white text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={() => removeSeriesScrapeSuggestion(suggestion.id)}
                              type="button"
                            >
                              Skip
                            </button>
                          </div>
                          <SeriesInput
                            allSeries={allSeries}
                            isDarkMode={isDarkMode}
                            label="Series"
                            name={`series-scrape-${suggestion.id}`}
                            onChange={(value) => updateSeriesScrapeSuggestion(suggestion.id, value)}
                            placeholder={boardVocabulary.seriesExamples}
                            value={suggestion.proposedSeries}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  onClick={applySeriesScrapeSuggestions}
                  type="button"
                >
                  <WandSparkles className="h-4 w-4" />
                  Apply Changes
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => {
                    setIsSeriesScrapeModalOpen(false);
                    setSeriesScrapeSuggestions([]);
                    setIsSeriesScrapeLoading(false);
                    setSeriesScrapeScopeColumnId(undefined);
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tierRowOptionsState && typeof document !== "undefined"
          ? createPortal(
              <div
                className={clsx(
                  "fixed z-[320] flex min-w-[180px] flex-col rounded-2xl border p-2 shadow-[0_24px_60px_rgba(19,27,68,0.24)]",
                  isDarkMode ? "border-white/10 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-700",
                )}
                data-tier-row-options-root="true"
                style={{
                  top: tierRowOptionsState.anchorRect.bottom + 8,
                  left: Math.max(16, tierRowOptionsState.anchorRect.left - 72),
                }}
              >
                <button
                  className={clsx(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                    isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                  )}
                  onClick={() => {
                    const row = columns.find((column) => column.id === tierRowOptionsState.rowId);
                    if (row) {
                      startEditingColumn(row);
                    }
                    setTierRowOptionsState(null);
                  }}
                  type="button"
                >
                  <Edit3 className="h-4 w-4" />
                  Rename Row
                </button>
                <button
                  className={clsx(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                    isDarkMode ? "text-rose-300 hover:bg-white/10" : "text-rose-600 hover:bg-slate-100",
                  )}
                  onClick={() => requestDeleteTierRow(tierRowOptionsState.rowId)}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Row
                </button>
              </div>,
              document.body,
            )
          : null}

        {pendingBoardDelete ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setPendingBoardDelete(null)}
          >
            <div
              className={clsx(
                "w-full max-w-xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Maintenance
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Delete board?
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    <strong>{pendingBoardDelete.title}</strong> and all of its columns, cards, and field values will be removed.
                    This won&apos;t affect your other boards.
                  </p>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => setPendingBoardDelete(null)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-rose-500 text-white hover:bg-rose-400"
                      : "bg-rose-600 text-white hover:bg-rose-500",
                  )}
                  onClick={confirmDeleteBoard}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Board
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => setPendingBoardDelete(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {pendingColumnDelete ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setPendingColumnDelete(null)}
          >
            <div
              className={clsx(
                "w-full max-w-xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                {activeBoardLayout === "tier-list" ? "Tier Row" : "Column Settings"}
              </p>
              <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                {activeBoardLayout === "tier-list" ? "Delete row?" : "Delete column?"}
              </h2>
              <p className={clsx("mt-3 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                <strong>{pendingColumnDelete.title}</strong> and all cards inside {activeBoardLayout === "tier-list" ? "this row" : "it"} will be removed.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-rose-500 text-white hover:bg-rose-400"
                      : "bg-rose-600 text-white hover:bg-rose-500",
                  )}
                  onClick={confirmDeleteColumn}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  {activeBoardLayout === "tier-list" ? "Delete Row" : "Delete Column"}
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => setPendingColumnDelete(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {moveAllCardsState ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setMoveAllCardsState(null)}
          >
            <div
              className={clsx(
                "w-full max-w-xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                Column Maintenance
              </p>
              <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                Move all cards
              </h2>
              <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                Move all {moveAllCardsState.cardCount} cards from <strong>{moveAllCardsState.sourceColumnTitle}</strong> into another column.
              </p>
              <div className="mt-6 grid gap-2">
                <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Target column</span>
                <select
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                  )}
                  value={moveAllCardsState.targetColumnId}
                  onChange={(event) =>
                    setMoveAllCardsState((current) =>
                      current ? { ...current, targetColumnId: event.target.value } : current,
                    )
                  }
                >
                  {columns
                    .filter((column) => column.id !== moveAllCardsState.sourceColumnId)
                    .map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.title}
                      </option>
                    ))}
                </select>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  onClick={confirmMoveAllCards}
                  type="button"
                >
                  <MoveVertical className="h-4 w-4" />
                  Move All
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => setMoveAllCardsState(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tierListConversionState ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setTierListConversionState(null)}
          >
            <div
              className={clsx(
                "flex max-h-[min(92vh,860px)] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b px-6 pt-6 pb-4">
                <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                  Board Maintenance
                </p>
                <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                  {tierListConversionState.mode === "to-tier-list" ? "Convert to Tier List" : "Convert to Kanban Board"}
                </h2>
                <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                  {tierListConversionState.mode === "to-tier-list"
                    ? "This creates a new tier-list copy of the current board and leaves your existing board untouched."
                    : "This creates a new kanban-board copy of the current tier list and leaves your existing tier list untouched."}
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                {tierListConversionState.mode === "to-tier-list" ? (
                  <div>
                    <p className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>
                      Copy cards from these columns
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {columns.filter((column) => !column.mirrorsEntireBoard).map((column) => {
                        const enabled = tierListConversionState.selectedColumnIds.includes(column.id);
                        return (
                          <button
                            key={column.id}
                            className={clsx(
                              "flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                              enabled
                                ? isDarkMode
                                  ? "border-white/30 bg-white/10 text-white"
                                  : "border-amber-300 bg-amber-50 text-slate-950"
                                : isDarkMode
                                  ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/30"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400",
                            )}
                            onClick={() =>
                              setTierListConversionState((current) =>
                                current && current.mode === "to-tier-list"
                                  ? {
                                      ...current,
                                      selectedColumnIds: current.selectedColumnIds.includes(column.id)
                                        ? current.selectedColumnIds.filter((id) => id !== column.id)
                                        : [...current.selectedColumnIds, column.id],
                                    }
                                  : current,
                              )
                            }
                            type="button"
                          >
                            <span>{column.title}</span>
                            <ToggleSwitch
                              ariaLabel={`Toggle ${column.title}`}
                              enabled={enabled}
                              isDarkMode={isDarkMode}
                              onClick={() =>
                                setTierListConversionState((current) =>
                                  current && current.mode === "to-tier-list"
                                    ? {
                                        ...current,
                                        selectedColumnIds: current.selectedColumnIds.includes(column.id)
                                          ? current.selectedColumnIds.filter((id) => id !== column.id)
                                          : [...current.selectedColumnIds, column.id],
                                      }
                                    : current,
                                )
                              }
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border-t px-6 py-4">
                <div className="flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  disabled={
                    tierListConversionState.mode === "to-tier-list" &&
                    tierListConversionState.selectedColumnIds.length === 0
                  }
                  onClick={() => {
                    if (tierListConversionState.mode === "to-tier-list") {
                      convertActiveBoardToTierList();
                    } else {
                      convertActiveBoardToKanbanBoard();
                    }
                  }}
                  type="button"
                >
                  <ListOrdered className="h-4 w-4" />
                  {tierListConversionState.mode === "to-tier-list" ? "Create Tier List Copy" : "Create Kanban Copy"}
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => setTierListConversionState(null)}
                  type="button"
                >
                  Cancel
                </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {moveCardState ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setMoveCardState(null)}
          >
            <div
              className={clsx(
                "w-full max-w-xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                Card Actions
              </p>
              <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                Move {moveCardState.title}
              </h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Column</span>
                  <select
                    className={clsx(
                      "rounded-2xl border px-4 py-3 outline-none transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-white focus:border-white/40"
                        : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                    )}
                    value={moveCardState.targetColumnId}
                    onChange={(event) =>
                      setMoveCardState((current) =>
                        current ? { ...current, targetColumnId: event.target.value } : current,
                      )
                    }
                  >
                    {columns.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Rank</span>
                  <input
                    className={clsx(
                      "rounded-2xl border px-4 py-3 outline-none transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                        : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                    )}
                    inputMode="numeric"
                    value={moveCardState.targetRank}
                    onChange={(event) =>
                      setMoveCardState((current) =>
                        current ? { ...current, targetRank: event.target.value.replace(/[^\d]/g, "") } : current,
                      )
                    }
                  />
                </label>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  onClick={confirmMoveCard}
                  type="button"
                >
                  <MoveVertical className="h-4 w-4" />
                  Move Card
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => setMoveCardState(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function AddColumnButton({
  isDarkMode,
  inline = false,
  isMobileViewport = false,
  mobileArmed = false,
  onArm,
  onClick,
}: {
  isDarkMode: boolean;
  inline?: boolean;
  isMobileViewport?: boolean;
  mobileArmed?: boolean;
  onArm?: () => void;
  onClick: () => void;
}) {
  const handleClick = () => {
    if (inline && isMobileViewport && !mobileArmed) {
      onArm?.();
      return;
    }

    onClick();
  };

  return (
    <button
      data-mobile-inline-add-root="true"
      className={clsx(
        inline
          ? "group relative z-[20] flex min-h-[720px] w-4 shrink-0 snap-start items-center justify-center overflow-visible transition sm:snap-align-none"
          : "group relative z-[20] flex min-h-[720px] w-[92px] shrink-0 snap-start items-center justify-center rounded-[28px] border border-dashed transition sm:snap-align-none",
        isDarkMode
          ? inline
            ? "text-white"
            : "border-white/15 bg-white/5 text-white hover:border-white/35 hover:bg-white/10"
          : inline
            ? "text-slate-700"
            : "border-slate-300/70 bg-white/50 text-slate-700 hover:border-slate-950 hover:bg-white",
      )}
      onClick={handleClick}
      type="button"
      aria-label={inline && isMobileViewport && !mobileArmed ? "Reveal add column button" : "Add column"}
    >
      <HoverTooltip
        isDarkMode={isDarkMode}
        label={inline && isMobileViewport && !mobileArmed ? "Show Add Column" : "Add Column"}
      />
      {inline ? (
        <span
          className={clsx(
            "flex h-full items-center gap-1 transition",
            isMobileViewport
              ? mobileArmed
                ? "opacity-100"
                : "opacity-100"
              : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100",
          )}
        >
          <span
            className={clsx(
              "h-full w-px",
              isDarkMode ? "bg-white/12 group-hover:bg-white/30" : "bg-slate-300/35 group-hover:bg-slate-500/55",
            )}
          />
          <span
            className={clsx(
              "flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_12px_28px_rgba(15,23,42,0.22)] ring-4 transition",
              isMobileViewport && !mobileArmed && "scale-75 opacity-0",
              isDarkMode
                ? "border-white/20 bg-slate-900 text-white ring-slate-950/80 group-hover:border-white/40 group-hover:bg-slate-800"
                : "border-white bg-white text-slate-950 ring-white/70 group-hover:border-slate-300",
            )}
          >
            <Plus className="h-5 w-5" />
          </span>
          <span
            className={clsx(
              "h-full w-px",
              isDarkMode ? "bg-white/12 group-hover:bg-white/30" : "bg-slate-300/35 group-hover:bg-slate-500/55",
            )}
          />
        </span>
      ) : (
        <span
          className={clsx(
            "flex h-12 w-12 items-center justify-center rounded-full shadow-lg",
            isDarkMode ? "bg-slate-950 text-white" : "bg-white text-slate-950",
          )}
        >
          <Plus className="h-6 w-6" />
        </span>
      )}
    </button>
  );
}

function SeriesFilterButton({
  allSeries,
  currentSeriesFilter,
  isDarkMode,
  isOpen,
  onSelect,
  onToggle,
  className,
}: {
  allSeries: string[];
  currentSeriesFilter: string;
  isDarkMode: boolean;
  isOpen: boolean;
  onSelect: (series: string) => void;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <div className={clsx("relative", className)} data-series-filter-root="true">
      <button
        className={clsx(
          "flex w-full items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left outline-none transition",
          isDarkMode
            ? "border-white/10 bg-slate-950/60 text-white hover:border-white/40"
            : "border-slate-200 bg-white text-slate-950 hover:border-slate-950",
        )}
        onClick={onToggle}
        type="button"
      >
        <span className="truncate">
          {currentSeriesFilter ? getSeriesFilterDisplayLabel(currentSeriesFilter) : "All series"}
        </span>
        <span className="flex items-center gap-2">
          {currentSeriesFilter ? (
            <span
              className={clsx(
                "rounded-full p-1 transition",
                isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
              )}
              onClick={(event) => {
                event.stopPropagation();
                onSelect("");
              }}
              aria-label="Clear filter"
              role="button"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <span className="text-xs opacity-70">{isOpen ? "▾" : "▸"}</span>
        </span>
      </button>
      {isOpen ? (
        <div
          className={clsx(
            "absolute left-0 right-0 top-full z-[260] mt-2 flex max-h-[min(50vh,320px)] flex-col overflow-y-auto rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
            isDarkMode ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white",
          )}
        >
          <button
            className={clsx(
              "rounded-xl px-3 py-2 text-left text-sm transition",
              currentSeriesFilter.length === 0
                ? isDarkMode
                  ? "bg-white/10 text-white"
                  : "bg-slate-100 text-slate-900"
                : isDarkMode
                  ? "text-white hover:bg-white/10"
                  : "text-slate-700 hover:bg-slate-100",
            )}
            onClick={() => onSelect("")}
            type="button"
          >
            All series
          </button>
          {allSeries.map((series) => (
            <button
              key={series}
              className={clsx(
                "rounded-xl px-3 py-2 text-left text-sm transition",
                currentSeriesFilter === series
                  ? isDarkMode
                    ? "bg-white/10 text-white"
                    : "bg-slate-100 text-slate-900"
                  : isDarkMode
                    ? "text-white hover:bg-white/10"
                    : "text-slate-700 hover:bg-slate-100",
              )}
              onClick={() => onSelect(series)}
              type="button"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="truncate">{getSeriesFilterDisplayLabel(series)}</span>
                {currentSeriesFilter === series ? (
                  <span
                    className={clsx(
                      "rounded-full p-1 transition",
                      isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect("");
                    }}
                    aria-label={`Clear ${series} filter`}
                    role="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BoardColumn({
  column,
  fullCards,
  addLabel,
  collapseCards,
  showSeriesOnCards,
  showArtworkOnCards,
  showTierHighlights,
  isDarkMode,
  isMobileViewport,
  frontFieldDefinitions,
  disableAddAffordances,
  isCardDragging,
  isDragGapSuppressed,
  cards,
  activeTierFilter,
  currentSeriesFilter,
  filtering,
  isEditingColumn,
  editingColumnDraft,
  onColumnDraftChange,
  onEditColumn,
  onCancelColumnEdit,
  onSaveColumnEdit,
  onEditCard,
  onAddCard,
  onOpenPairwiseQuiz,
  onSortCards,
  isMenuOpen,
  isSortMenuOpen,
  isFilterMenuOpen,
  isMirrorMenuOpen,
  isMaintenanceMenuOpen,
  onToggleMenu,
  onToggleSortMenu,
  onToggleFilterMenu,
  onToggleMirrorMenu,
  onToggleMaintenanceMenu,
  onOpenDuplicateCleanup,
  onOpenMoveAll,
  onOpenTitleTidy,
  onOpenSeriesScrape,
  onDeleteColumn,
  onToggleBoardMirrorColumn,
  onToggleDontRank,
  onToggleExcludeFromBoardMirrors,
  onLinkMirrorMatches,
  onSetTierFilter,
  onSetSeriesFilter,
  onDragScrollActivity,
  onColumnDragStart,
  onColumnDrop,
  onMoveColumnLeft,
  onMoveColumnRight,
  draggingColumnId,
  revealedMobileAddCardTarget,
  onRevealMobileAddCardTarget,
}: {
  column: ColumnDefinition;
  fullCards: CardEntry[];
  addLabel: string;
  collapseCards: boolean;
  showSeriesOnCards: boolean;
  showArtworkOnCards: boolean;
  showTierHighlights: boolean;
  isDarkMode: boolean;
  isMobileViewport: boolean;
  frontFieldDefinitions: BoardFieldDefinition[];
  disableAddAffordances: boolean;
  isCardDragging: boolean;
  isDragGapSuppressed: boolean;
  cards: CardEntry[];
  activeTierFilter: TierFilter;
  currentSeriesFilter: string;
  filtering: boolean;
  isEditingColumn: boolean;
  editingColumnDraft: ColumnEditorDraft | null;
  onColumnDraftChange: React.Dispatch<
    React.SetStateAction<ColumnEditorDraft | null>
  >;
  onEditColumn: () => void;
  onCancelColumnEdit: () => void;
  onSaveColumnEdit: () => void;
  onEditCard: (card: CardEntry) => void;
  onAddCard: (columnId: string, insertIndex: number) => void;
  onOpenPairwiseQuiz: () => void;
  onSortCards: (
    columnId: string,
    mode: "title-asc" | "title-desc",
  ) => void;
  isMenuOpen: boolean;
  isSortMenuOpen: boolean;
  isFilterMenuOpen: boolean;
  isMirrorMenuOpen: boolean;
  isMaintenanceMenuOpen: boolean;
  onToggleMenu: () => void;
  onToggleSortMenu: () => void;
  onToggleFilterMenu: () => void;
  onToggleMirrorMenu: () => void;
  onToggleMaintenanceMenu: () => void;
  onOpenDuplicateCleanup: () => void;
  onOpenMoveAll: () => void;
  onOpenTitleTidy: () => void;
  onOpenSeriesScrape: () => void;
  onDeleteColumn: (columnId: string) => void;
  onToggleBoardMirrorColumn: (columnId: string) => void;
  onToggleDontRank: (columnId: string) => void;
  onToggleExcludeFromBoardMirrors: (columnId: string) => void;
  onLinkMirrorMatches: (columnId: string) => void;
  onSetTierFilter: (columnId: string, tierFilter: TierFilter) => void;
  onSetSeriesFilter: (series: string) => void;
  onDragScrollActivity: () => void;
  onColumnDragStart: React.Dispatch<React.SetStateAction<string | null>>;
  onColumnDrop: (sourceColumnId: string, targetColumnId: string) => void;
  onMoveColumnLeft: (columnId: string) => void;
  onMoveColumnRight: (columnId: string) => void;
  draggingColumnId: string | null;
  revealedMobileAddCardTarget: MobileAddCardTarget | null;
  onRevealMobileAddCardTarget: React.Dispatch<React.SetStateAction<MobileAddCardTarget | null>>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });
  const [showMirrorEnableConfirm, setShowMirrorEnableConfirm] = useState(false);
  const isTierFiltering = activeTierFilter !== "all";
  const columnSeries = Array.from(new Set(fullCards.map((card) => card.series.trim()).filter(Boolean))).sort(compareTitlesForDisplay);
  const tierFilteredCards = cards.filter((card) => {
    const originalRank = isRankedColumn(column)
      ? fullCards.findIndex((columnCard) => columnCard.entryId === card.entryId) + 1
      : null;
    return matchesTierFilter(originalRank, activeTierFilter);
  });

  return (
    <div
      data-column-id={column.id}
      ref={setNodeRef}
      className={clsx(
        "relative z-10 flex h-[min(78vh,920px)] min-h-[720px] w-[320px] shrink-0 snap-start flex-col rounded-[28px] border p-3 shadow-[0_24px_44px_rgba(15,23,42,0.18)] sm:snap-align-none",
        isDarkMode ? "bg-slate-950 text-white" : "bg-[#fff7f0] text-slate-950",
        draggingColumnId === column.id && "opacity-60",
        isDarkMode
          ? isOver
            ? "border-white/80"
            : "border-slate-800"
          : isOver
            ? "border-slate-950"
            : "border-slate-200",
      )}
    >
      <div
        className="sticky top-0 z-30 w-full"
        draggable={!isEditingColumn}
        onDragStart={() => onColumnDragStart(column.id)}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={() => {
          if (draggingColumnId) {
            onColumnDrop(draggingColumnId, column.id);
            onColumnDragStart(null);
          }
        }}
        onDragEnd={() => onColumnDragStart(null)}
      >
        <div className={clsx("rounded-[22px] bg-gradient-to-br p-[1px]", column.accent)}>
          <div
            className={clsx(
              "rounded-[21px] p-4 backdrop-blur",
              isDarkMode ? "bg-slate-950/96" : "bg-white/95",
              !isEditingColumn && "cursor-grab active:cursor-grabbing",
            )}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_40px] items-start gap-3">
            {isEditingColumn && editingColumnDraft ? (
              <div className="col-span-2 w-full space-y-3">
                <input
                  className={clsx(
                    "w-full rounded-2xl border px-3 py-2 text-sm outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-white/8 text-white focus:border-white/50"
                      : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                  )}
                  value={editingColumnDraft.title}
                  onChange={(event) =>
                    onColumnDraftChange((current) =>
                      current
                        ? { ...current, title: event.target.value }
                        : current,
                    )
                  }
                />
                <div className="flex gap-2">
                  <button
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                      isDarkMode ? "bg-white text-slate-950" : "bg-slate-950 text-white",
                    )}
                    onClick={onSaveColumnEdit}
                    type="button"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </button>
                  <button
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                      isDarkMode ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700",
                    )}
                    onClick={onCancelColumnEdit}
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="w-full truncate whitespace-nowrap pr-2 text-left text-lg font-bold">{column.title}</h2>
                <div className="group relative" data-column-menu-root="true">
                  <button
                    className={clsx(
                      "rounded-full p-2 transition",
                      isDarkMode
                        ? "bg-white/10 text-slate-200 hover:bg-white/20"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                    )}
                    onClick={onToggleMenu}
                    type="button"
                    aria-label={`Open actions for ${column.title}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  <HoverTooltip isDarkMode={isDarkMode} label="Column Settings" />
                  {isMenuOpen ? (
                    <div
                      className={clsx(
                        "absolute right-0 top-12 z-[120] flex w-56 flex-col rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
                        isDarkMode
                          ? "border-white/10 bg-slate-900"
                          : "border-slate-200 bg-white",
                      )}
                    >
                      <button
                        className={clsx(
                          "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                          isDarkMode
                            ? "text-white hover:bg-white/10"
                            : "text-slate-700 hover:bg-slate-100",
                        )}
                        disabled={column.mirrorsEntireBoard}
                        onClick={() => onAddCard(column.id, 0)}
                        type="button"
                      >
                        <Plus className="h-4 w-4" />
                        {`Add ${addLabel}`}
                      </button>
                      <button
                        className={clsx(
                          "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                          isDarkMode
                            ? "text-white hover:bg-white/10"
                            : "text-slate-700 hover:bg-slate-100",
                        )}
                        onClick={onEditColumn}
                        type="button"
                      >
                        <Edit3 className="h-4 w-4" />
                        Rename
                      </button>
                      {isRankedColumn(column) ? (
                        <button
                          className={clsx(
                            "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                            isDarkMode
                              ? "text-white hover:bg-white/10"
                              : "text-slate-700 hover:bg-slate-100",
                          )}
                          disabled={fullCards.length < 2}
                          onClick={onOpenPairwiseQuiz}
                          type="button"
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                          Rank by Quiz
                        </button>
                      ) : null}
                      <div className="relative">
                        <button
                          className={clsx(
                            "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition",
                            isDarkMode
                              ? "text-white hover:bg-white/10"
                              : "text-slate-700 hover:bg-slate-100",
                          )}
                          onClick={onToggleSortMenu}
                          type="button"
                        >
                          <span className="inline-flex items-center gap-2">
                            <ArrowUpDown className="h-4 w-4" />
                            Sort
                          </span>
                          <span className="text-xs opacity-70">{isSortMenuOpen ? "▾" : "▸"}</span>
                        </button>
                        {isSortMenuOpen ? (
                          <div
                            className={clsx(
                              "mt-1 flex max-h-[50vh] flex-col overflow-y-auto rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
                              isDarkMode
                                ? "border-white/10 bg-slate-900"
                                : "border-slate-200 bg-white",
                            )}
                          >
                            <div
                              className={clsx(
                                "flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100",
                              )}
                            >
                              <span className="inline-flex items-center gap-2">
                                <ListOrdered className="h-4 w-4" />
                                Ranked
                              </span>
                              <ToggleSwitch
                                ariaLabel={`Toggle ranked view for ${column.title}`}
                                enabled={isRankedColumn(column)}
                                isDarkMode={isDarkMode}
                                onClick={() => onToggleDontRank(column.id)}
                              />
                            </div>
                            <div
                              className={clsx(
                                "flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                            >
                              <span>A-Z</span>
                              <ToggleSwitch
                                ariaLabel={`Toggle A-Z sort for ${column.title}`}
                                enabled={getColumnSortMode(column) === "title-asc"}
                                isDarkMode={isDarkMode}
                                onClick={() => onSortCards(column.id, "title-asc")}
                              />
                            </div>
                            <div
                              className={clsx(
                                "flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                            >
                              <span>Z-A</span>
                              <ToggleSwitch
                                ariaLabel={`Toggle Z-A sort for ${column.title}`}
                                enabled={getColumnSortMode(column) === "title-desc"}
                                isDarkMode={isDarkMode}
                                onClick={() => onSortCards(column.id, "title-desc")}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                      {isRankedColumn(column) ? (
                        <div className="relative">
                          <button
                            className={clsx(
                              "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition",
                              isDarkMode
                                ? "text-white hover:bg-white/10"
                                : "text-slate-700 hover:bg-slate-100",
                            )}
                            onClick={onToggleFilterMenu}
                            type="button"
                          >
                            <span className="inline-flex items-center gap-2">
                              <Filter className="h-4 w-4" />
                              Filter
                            </span>
                            <span className="text-xs opacity-70">
                              {activeTierFilter === "all" ? "All" : activeTierFilter.replace("top", "Top ")}
                            </span>
                          </button>
                          {isFilterMenuOpen ? (
                            <div
                              className={clsx(
                                "mt-1 flex max-h-[min(50vh,320px)] flex-col overflow-y-auto rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
                                isDarkMode
                                  ? "border-white/10 bg-slate-900"
                                  : "border-slate-200 bg-white",
                              )}
                            >
                              {(["all", "top10", "top15", "top20", "top30"] as TierFilter[]).map((tierOption) => (
                                <button
                                  key={tierOption}
                                  className={clsx(
                                    "rounded-xl px-3 py-2 text-left text-sm transition",
                                    isDarkMode
                                      ? "text-white hover:bg-white/10"
                                      : "text-slate-700 hover:bg-slate-100",
                                  )}
                                  onClick={() => onSetTierFilter(column.id, tierOption)}
                                  type="button"
                                >
                                  {tierOption === "all" ? "All" : tierOption.replace("top", "Top ")}
                                </button>
                              ))}
                              {columnSeries.length > 0 ? (
                                <>
                                  <div className={clsx("my-1 h-px", isDarkMode ? "bg-white/10" : "bg-slate-200")} />
                                  <button
                                    className={clsx(
                                      "rounded-xl px-3 py-2 text-left text-sm transition",
                                      currentSeriesFilter.length === 0
                                        ? isDarkMode
                                          ? "bg-white/10 text-white"
                                          : "bg-slate-100 text-slate-900"
                                        : isDarkMode
                                          ? "text-white hover:bg-white/10"
                                          : "text-slate-700 hover:bg-slate-100",
                                    )}
                                    onClick={() => onSetSeriesFilter("")}
                                    type="button"
                                  >
                                    All series
                                  </button>
                                  {columnSeries.map((series) => (
                                    <button
                                      key={series}
                                      className={clsx(
                                        "rounded-xl px-3 py-2 text-left text-sm transition",
                                        currentSeriesFilter === series
                                          ? isDarkMode
                                            ? "bg-white/10 text-white"
                                            : "bg-slate-100 text-slate-900"
                                          : isDarkMode
                                            ? "text-white hover:bg-white/10"
                                            : "text-slate-700 hover:bg-slate-100",
                                      )}
                                      onClick={() => onSetSeriesFilter(series)}
                                      type="button"
                                    >
                                      <span className="flex items-center justify-between gap-3">
                                      <span className="truncate">{getSeriesFilterDisplayLabel(series)}</span>
                                        {currentSeriesFilter === series ? (
                                          <span
                                            className={clsx(
                                              "rounded-full p-1 transition",
                                              isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                                            )}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              onSetSeriesFilter("");
                                            }}
                                            aria-label={`Clear ${series} filter`}
                                            role="button"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </span>
                                        ) : null}
                                      </span>
                                    </button>
                                  ))}
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="relative">
                        <button
                          className={clsx(
                            "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition",
                            isDarkMode
                              ? "text-white hover:bg-white/10"
                              : "text-slate-700 hover:bg-slate-100",
                          )}
                          onClick={onToggleMirrorMenu}
                          type="button"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Link2 className="h-4 w-4" />
                            Mirror
                          </span>
                          <span className="text-xs opacity-70">{isMirrorMenuOpen ? "▾" : "▸"}</span>
                        </button>
                        {isMirrorMenuOpen ? (
                          <div
                            className={clsx(
                              "mt-1 flex flex-col rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
                              isDarkMode
                                ? "border-white/10 bg-slate-900"
                                : "border-slate-200 bg-white",
                            )}
                          >
                            <div
                              className={clsx(
                                "relative flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100",
                              )}
                            >
                              <span className="inline-flex items-center gap-2">
                                <Link2 className="h-4 w-4" />
                                Mirror
                              </span>
                              <ToggleSwitch
                                ariaLabel={`Toggle mirror for ${column.title}`}
                                enabled={Boolean(column.mirrorsEntireBoard)}
                                isDarkMode={isDarkMode}
                                onClick={() => {
                                  if (column.mirrorsEntireBoard) {
                                    onToggleBoardMirrorColumn(column.id);
                                    setShowMirrorEnableConfirm(false);
                                    return;
                                  }
                                  setShowMirrorEnableConfirm((current) => !current);
                                }}
                              />
                              {showMirrorEnableConfirm ? (
                                <div
                                  className={clsx(
                                    "absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border p-3 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
                                    isDarkMode ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white",
                                  )}
                                >
                                  <p className={clsx("text-xs leading-5", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                                    Enabling Mirror will create a copy of all cards from the other columns directly within this mirror column.
                                  </p>
                                  <div className="mt-3 flex gap-2">
                                    <button
                                      className={clsx(
                                        "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition",
                                        isDarkMode ? "bg-white text-slate-950 hover:bg-slate-200" : "bg-slate-950 text-white hover:bg-slate-800",
                                      )}
                                    onClick={() => {
                                      onToggleBoardMirrorColumn(column.id);
                                      setShowMirrorEnableConfirm(false);
                                    }}
                                    type="button"
                                  >
                                      Proceed
                                    </button>
                                    <button
                                      className={clsx(
                                        "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                                        isDarkMode
                                          ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                                      )}
                                      onClick={() => setShowMirrorEnableConfirm(false)}
                                      type="button"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            {!column.mirrorsEntireBoard ? (
                              <div
                                className={clsx(
                                  "flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition",
                                  isDarkMode
                                    ? "text-white hover:bg-white/10"
                                    : "text-slate-700 hover:bg-slate-100",
                                )}
                              >
                                <span>Allow Cloning</span>
                                <ToggleSwitch
                                  ariaLabel={`Toggle cloning for ${column.title}`}
                                  enabled={!column.excludeFromBoardMirrors}
                                  isDarkMode={isDarkMode}
                                  onClick={() => onToggleExcludeFromBoardMirrors(column.id)}
                                />
                              </div>
                            ) : null}
                            <button
                              className={clsx(
                                "rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={() => onLinkMirrorMatches(column.id)}
                              type="button"
                            >
                              Link Duplicates
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="relative">
                        <button
                          className={clsx(
                            "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition",
                            isDarkMode
                              ? "text-white hover:bg-white/10"
                              : "text-slate-700 hover:bg-slate-100",
                          )}
                          onClick={onToggleMaintenanceMenu}
                          type="button"
                        >
                          <span className="inline-flex items-center gap-2">
                            <WandSparkles className="h-4 w-4" />
                            Maintenance
                          </span>
                          <span className="text-xs opacity-70">{isMaintenanceMenuOpen ? "▾" : "▸"}</span>
                        </button>
                        {isMaintenanceMenuOpen ? (
                          <div
                            className={clsx(
                              "mt-1 flex flex-col rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
                              isDarkMode
                                ? "border-white/10 bg-slate-900"
                                : "border-slate-200 bg-white",
                            )}
                          >
                            <button
                              className={clsx(
                                "flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={() => onMoveColumnLeft(column.id)}
                              type="button"
                            >
                              <ArrowLeft className="h-4 w-4" />
                              Move Left
                            </button>
                            <button
                              className={clsx(
                                "flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={() => onMoveColumnRight(column.id)}
                              type="button"
                            >
                              <ArrowRight className="h-4 w-4" />
                              Move Right
                            </button>
                            <button
                              className={clsx(
                                "flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={onOpenMoveAll}
                              type="button"
                            >
                              <MoveVertical className="h-4 w-4" />
                              Move All
                            </button>
                            <button
                              className={clsx(
                                "flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={onOpenDuplicateCleanup}
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete Duplicates
                            </button>
                            <button
                              className={clsx(
                                "flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={onOpenTitleTidy}
                              type="button"
                            >
                              <Sparkles className="h-4 w-4" />
                              Tidy Titles
                            </button>
                            <button
                              className={clsx(
                                "flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={onOpenSeriesScrape}
                              type="button"
                            >
                              <WandSparkles className="h-4 w-4" />
                              Series Scraper
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <button
                        className={clsx(
                          "mt-1 flex items-center gap-2 rounded-xl border-t px-3 py-2 pt-3 text-sm transition hover:bg-rose-400/10",
                          isDarkMode
                            ? "border-white/10 text-rose-300"
                            : "border-slate-200 text-rose-500",
                        )}
                        onClick={() => onDeleteColumn(column.id)}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete column
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="mt-3 flex flex-1 flex-col gap-3 overflow-y-auto pr-1"
        data-column-scroll-id={column.id}
        onScroll={() => {
          if (isCardDragging) {
            onDragScrollActivity();
          }
        }}
      >
        {filtering || isTierFiltering ? (
          tierFilteredCards.map((card, index) => (
            <CardTile
              key={card.entryId}
              card={card}
              collapseCards={collapseCards}
              showSeries={showSeriesOnCards}
              showArtwork={showArtworkOnCards}
              showTierHighlights={showTierHighlights}
              frontFieldDefinitions={frontFieldDefinitions}
              rankBadge={
                      isRankedColumn(column)
                        ? {
                      value:
                        fullCards.findIndex((columnCard) => columnCard.entryId === card.entryId) + 1,
                    }
                  : null
              }
              secondaryRankBadge={
                filtering && isRankedColumn(column)
                  ? {
                      label: "Filter",
                      value: index + 1,
                    }
                  : null
              }
              clickToEdit
              onEdit={() => onEditCard(card)}
            />
          ))
        ) : (
          <SortableContext
            items={tierFilteredCards.map((card) => card.entryId)}
            strategy={verticalListSortingStrategy}
          >
            <>
              <AddCardRow
                columnId={column.id}
                isDarkMode={isDarkMode}
                isDragMode={isCardDragging}
                isGapSuppressed={isDragGapSuppressed}
                insertIndex={0}
                alwaysVisible={tierFilteredCards.length === 0}
                hideAction={
                  !isCardDragging &&
                  (tierFilteredCards.length === 0 ||
                    isMenuOpen ||
                    isSortMenuOpen ||
                    isFilterMenuOpen ||
                    isMirrorMenuOpen ||
                    isMaintenanceMenuOpen)
                }
                isMobileViewport={isMobileViewport}
                mobileArmed={revealedMobileAddCardTarget?.columnId === column.id && revealedMobileAddCardTarget.insertIndex === 0}
                interactive={!disableAddAffordances}
                onArm={() => onRevealMobileAddCardTarget({ columnId: column.id, insertIndex: 0 })}
                onClick={() => onAddCard(column.id, 0)}
              />
              {tierFilteredCards.map((card, index) => (
                <div key={card.entryId} className="flex flex-col gap-3">
                  <SortableCard
                    card={card}
                    collapseCards={collapseCards}
                    showSeries={showSeriesOnCards}
                    showArtwork={showArtworkOnCards}
                    showTierHighlights={showTierHighlights}
                    frontFieldDefinitions={frontFieldDefinitions}
                    isAnyCardDragging={isCardDragging}
                    rankBadge={
                      isRankedColumn(column)
                        ? {
                            value: index + 1,
                          }
                        : null
                    }
                    onEdit={() => onEditCard(card)}
                  />
                  <AddCardRow
                    columnId={column.id}
                    isDarkMode={isDarkMode}
                    isDragMode={isCardDragging}
                    isGapSuppressed={isDragGapSuppressed}
                    insertIndex={index + 1}
                    alwaysVisible={index === tierFilteredCards.length - 1}
                    hideAction={
                      !isCardDragging &&
                      (isMenuOpen ||
                        isSortMenuOpen ||
                        isFilterMenuOpen ||
                        isMirrorMenuOpen ||
                        isMaintenanceMenuOpen)
                    }
                    isMobileViewport={isMobileViewport}
                    mobileArmed={
                      revealedMobileAddCardTarget?.columnId === column.id &&
                      revealedMobileAddCardTarget.insertIndex === index + 1
                    }
                    interactive={!disableAddAffordances}
                    onArm={() => onRevealMobileAddCardTarget({ columnId: column.id, insertIndex: index + 1 })}
                    onClick={() => onAddCard(column.id, index + 1)}
                  />
                </div>
              ))}
            </>
          </SortableContext>
        )}

        {tierFilteredCards.length === 0 ? (
          <button
            className={clsx(
              "group flex flex-1 items-center justify-center rounded-[26px] border border-dashed p-6 text-center text-sm leading-6 transition",
              isDarkMode
                ? "border-white/15 bg-white/[0.03] text-slate-400 hover:border-white/30 hover:bg-white/[0.05]"
                : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white",
            )}
            disabled={disableAddAffordances}
            onClick={() => onAddCard(column.id, 0)}
            type="button"
            aria-label={`Add ${addLabel}`}
          >
            <span
              className={clsx(
                "flex h-12 w-12 items-center justify-center rounded-full border transition",
                disableAddAffordances
                  ? "border-transparent bg-transparent text-transparent"
                  : isDarkMode
                    ? "border-white/15 bg-slate-950 text-white group-hover:border-white/35 group-hover:bg-slate-900"
                    : "border-slate-300 bg-white text-slate-700 group-hover:border-slate-500 group-hover:bg-slate-50",
              )}
            >
              <Plus className="h-6 w-6" />
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TierListRow({
  column,
  cards,
  addLabel,
  collapseCards,
  showSeriesOnCards,
  showArtworkOnCards,
  isDarkMode,
  isMobileViewport,
  frontFieldDefinitions,
  isEditingColumn,
  editingColumnDraft,
  isUnsortedRow,
  onColumnDraftChange,
  onCancelColumnEdit,
  onSaveColumnEdit,
  onOpenRowOptions,
  onEditCard,
  onAddCard,
  onDragScrollActivity,
  isAnyCardDragging,
  isDragGapSuppressed,
}: {
  column: ColumnDefinition;
  cards: CardEntry[];
  addLabel: string;
  collapseCards: boolean;
  showSeriesOnCards: boolean;
  showArtworkOnCards: boolean;
  isDarkMode: boolean;
  isMobileViewport: boolean;
  frontFieldDefinitions: BoardFieldDefinition[];
  isEditingColumn: boolean;
  editingColumnDraft: ColumnEditorDraft | null;
  isUnsortedRow: boolean;
  onColumnDraftChange: React.Dispatch<React.SetStateAction<ColumnEditorDraft | null>>;
  onCancelColumnEdit: () => void;
  onSaveColumnEdit: () => void;
  onOpenRowOptions: (anchorRect: DOMRect) => void;
  onEditCard: (card: CardEntry) => void;
  onAddCard: (columnId: string, insertIndex: number) => void;
  onDragScrollActivity: () => void;
  isAnyCardDragging: boolean;
  isDragGapSuppressed: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });
  const trimmedColumnTitle = column.title.trim();
  const useVerticalLabel = trimmedColumnTitle.length > 1 && !/\s/.test(trimmedColumnTitle);

  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)] items-stretch">
      <div className={clsx("rounded-l-[28px] rounded-r-none bg-gradient-to-b p-[1px]", column.accent)}>
        <div
          tabIndex={0}
          className={clsx(
            "group/rowrail relative flex h-full min-h-[152px] items-center justify-center rounded-l-[27px] rounded-r-none px-1.5 py-3 text-center outline-none sm:min-h-[176px] sm:px-2 sm:py-4",
            isDarkMode ? "bg-slate-950/96 text-white" : "bg-white/92 text-slate-950",
          )}
        >
          <div className="flex h-full w-full items-center justify-center">
            {isEditingColumn && editingColumnDraft ? (
              <div className="flex w-full flex-col items-center gap-2">
                <input
                  className={clsx(
                    "w-full rounded-2xl border px-3 py-2 text-center text-sm outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                  )}
                  value={editingColumnDraft.title}
                  onChange={(event) =>
                    onColumnDraftChange((current) =>
                      current ? { ...current, title: event.target.value } : current,
                    )
                  }
                />
                <div className="flex gap-2">
                  <button
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                      isDarkMode ? "bg-white text-slate-950" : "bg-slate-950 text-white",
                    )}
                    onClick={onSaveColumnEdit}
                    type="button"
                  >
                    Save
                  </button>
                  <button
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                      isDarkMode ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700",
                    )}
                    onClick={onCancelColumnEdit}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <span
                className={clsx(
                  "font-black tracking-tight",
                  useVerticalLabel ? "text-lg sm:text-xl" : trimmedColumnTitle.length === 1 ? "text-[1.7rem] leading-none sm:text-2xl" : "text-sm leading-tight sm:text-base",
                )}
                style={
                  useVerticalLabel
                    ? { writingMode: "vertical-rl", transform: "rotate(180deg)" }
                    : undefined
                }
              >
                {column.title}
              </span>
            )}
          </div>
          {!isEditingColumn ? (
            <div className="absolute left-1/2 top-2 -translate-x-1/2">
              <div className="group relative">
                <button
                  aria-label={`Row options for ${column.title}`}
                  className={clsx(
                    "inline-flex h-7 w-7 items-center justify-center rounded-full border transition pointer-events-none opacity-0 group-hover/rowrail:pointer-events-auto group-hover/rowrail:opacity-100 group-focus-within/rowrail:pointer-events-auto group-focus-within/rowrail:opacity-100",
                    isDarkMode
                      ? "border-white/15 bg-white/10 text-white hover:border-white/35 hover:bg-white/15"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-50",
                  )}
                  onClick={(event) => onOpenRowOptions(event.currentTarget.getBoundingClientRect())}
                  type="button"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                <HoverTooltip isDarkMode={isDarkMode} label="Row Options" />
              </div>
            </div>
          ) : null}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
            <div className="group relative">
              <button
                aria-label={`Add ${addLabel} to ${column.title}`}
                className={clsx(
                  "inline-flex h-7 w-7 items-center justify-center rounded-full border transition pointer-events-none opacity-0 group-hover/rowrail:pointer-events-auto group-hover/rowrail:opacity-100 group-focus-within/rowrail:pointer-events-auto group-focus-within/rowrail:opacity-100",
                  isDarkMode
                    ? "border-white/15 bg-white/10 text-white hover:border-white/35 hover:bg-white/15"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-50",
                )}
                onClick={() => onAddCard(column.id, cards.length)}
                type="button"
              >
                <Plus className="h-5 w-5" />
              </button>
              <HoverTooltip isDarkMode={isDarkMode} label={`Add ${addLabel}`} />
            </div>
          </div>
        </div>
      </div>

      <div
        ref={setNodeRef}
        data-column-id={column.id}
        className={clsx(
          "min-w-0 rounded-r-[28px] rounded-l-none border p-3 shadow-[0_24px_44px_rgba(15,23,42,0.12)]",
          isDarkMode ? "border-slate-800 bg-slate-950/95 text-white" : "border-slate-200 bg-[#fff7f0] text-slate-950",
          isOver && (isDarkMode ? "border-white/80" : "border-slate-950"),
        )}
      >
        <SortableContext
          items={cards.map((card) => card.entryId)}
          strategy={isUnsortedRow ? horizontalListSortingStrategy : rectSortingStrategy}
        >
          <div
            className={clsx(
              "min-h-[152px] content-start justify-start pb-1 sm:min-h-[176px]",
              isUnsortedRow
                ? "flex items-center gap-0 overflow-x-auto"
                : isMobileViewport
                  ? "flex flex-wrap items-center gap-x-0 gap-y-1 overflow-visible"
                  : "flex flex-wrap items-start gap-x-0 gap-y-1 overflow-visible sm:gap-y-2",
            )}
            data-column-scroll-id={column.id}
            onScroll={onDragScrollActivity}
          >
            {cards.length === 0 ? (
              <button
                className={clsx(
                  "flex min-h-[176px] w-full items-center justify-center rounded-[26px] border border-dashed p-6 text-center text-sm leading-6 transition",
                  isDarkMode
                    ? "border-white/15 bg-white/[0.03] text-slate-400 hover:border-white/30 hover:bg-white/[0.05]"
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white",
                )}
                onClick={() => onAddCard(column.id, 0)}
                type="button"
              >
                <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold">
                  <Plus className="h-4 w-4" />
                  {`Add ${addLabel}`}
                </span>
              </button>
            ) : (
              <>
                {cards.map((card, index) => (
                  <Fragment key={card.entryId}>
                    <TierListInsertSlot
                      columnId={column.id}
                      insertIndex={index}
                      isDarkMode={isDarkMode}
                      isDragging={isAnyCardDragging}
                      isGapSuppressed={isAnyCardDragging && isDragGapSuppressed}
                      isSquare
                      isMobileViewport={isMobileViewport}
                    />
                    <SortableCard
                      card={card}
                      collapseCards={collapseCards}
                      showSeries={showSeriesOnCards}
                      showArtwork={showArtworkOnCards}
                      showTierHighlights={false}
                      frontFieldDefinitions={frontFieldDefinitions}
                      forceSquare
                      isAnyCardDragging={isAnyCardDragging}
                      rankBadge={null}
                      onEdit={() => onEditCard(card)}
                      compactImageOnly={isMobileViewport}
                      containerClassName="basis-[82px] w-[82px] shrink-0 self-start sm:basis-[176px] sm:w-[176px]"
                      collapseSizeWhenDragging
                    />
                  </Fragment>
                ))}
                <TierListInsertSlot
                  columnId={column.id}
                  insertIndex={cards.length}
                  isDarkMode={isDarkMode}
                  isDragging={isAnyCardDragging}
                  isGapSuppressed={isAnyCardDragging && isDragGapSuppressed}
                  isSquare
                  isMobileViewport={isMobileViewport}
                />
              </>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

function TierListAddRowDivider({
  isDarkMode,
  isMobileViewport,
  mobileArmed = false,
  onArm,
  onClick,
}: {
  isDarkMode: boolean;
  isMobileViewport: boolean;
  mobileArmed?: boolean;
  onArm?: () => void;
  onClick: () => void;
}) {
  const handleClick = () => {
    if (isMobileViewport && !mobileArmed) {
      onArm?.();
      return;
    }

    onClick();
  };

  return (
    <div className="-my-1 grid grid-cols-[44px_minmax(0,1fr)] items-center">
      <div
        className="group flex items-center justify-center"
        data-mobile-inline-add-root="true"
        tabIndex={0}
        onClick={() => {
          if (isMobileViewport && !mobileArmed) {
            onArm?.();
          }
        }}
      >
        <div className="group relative">
          <button
            aria-label="Add row"
            className={clsx(
              "inline-flex h-9 w-9 items-center justify-center rounded-full border transition",
              isDarkMode
                ? "border-white/15 bg-slate-950/90 text-white hover:border-white/35 hover:bg-slate-900"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-50",
              isMobileViewport
                ? mobileArmed
                  ? "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none"
                : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
            )}
            onClick={handleClick}
            type="button"
          >
            <Plus className="h-5 w-5" />
          </button>
          {!isMobileViewport || mobileArmed ? (
            <HoverTooltip isDarkMode={isDarkMode} label={isMobileViewport ? "Add Row" : "Add Row"} />
          ) : null}
        </div>
      </div>
      <div />
    </div>
  );
}

function TierListInsertSlot({
  columnId,
  insertIndex,
  isDarkMode,
  isDragging,
  isGapSuppressed,
  isSquare,
  isMobileViewport,
}: {
  columnId: string;
  insertIndex: number;
  isDarkMode: boolean;
  isDragging: boolean;
  isGapSuppressed: boolean;
  isSquare: boolean;
  isMobileViewport: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: makeInsertDropId(columnId, insertIndex),
  });

  const expanded = isDragging && !isGapSuppressed && isOver;
  const activeWidthClass = isSquare
    ? isMobileViewport
      ? "w-[82px]"
      : "w-[176px]"
    : "w-[184px]";
  const hiddenHitWidthClass = isSquare
    ? isMobileViewport
      ? "w-[28px]"
      : "w-[176px]"
    : "w-[184px]";
  const heightClass = isSquare
    ? isMobileViewport
      ? "h-[116px]"
      : "h-[176px]"
    : "h-[84px] sm:h-[124px]";

  return (
    <div
      className={clsx(
        "relative shrink-0 overflow-visible transition-[width] duration-200 ease-out",
        isDragging && !isGapSuppressed && expanded ? activeWidthClass : "w-0",
        heightClass,
      )}
    >
      <div
        ref={setNodeRef}
        className={clsx(
          "absolute left-1/2 top-0 -translate-x-1/2 rounded-[22px] border transition-[width,background-color,border-color] duration-200 ease-out",
          heightClass,
          expanded ? "w-full" : hiddenHitWidthClass,
          expanded
            ? isDarkMode
              ? "border-white/45 bg-white/8"
              : "border-slate-500/45 bg-slate-100/80"
            : "border-transparent bg-transparent",
        )}
      />
    </div>
  );
}

function AddCardRow({
  columnId,
  isDarkMode,
  isDragMode = false,
  isGapSuppressed = false,
  insertIndex,
  alwaysVisible = false,
  hideAction = false,
  isMobileViewport = false,
  mobileArmed = false,
  interactive = true,
  onArm,
  onClick,
}: {
  columnId: string;
  isDarkMode: boolean;
  isDragMode?: boolean;
  isGapSuppressed?: boolean;
  insertIndex: number;
  alwaysVisible?: boolean;
  hideAction?: boolean;
  isMobileViewport?: boolean;
  mobileArmed?: boolean;
  interactive?: boolean;
  onArm?: () => void;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: makeInsertDropId(columnId, insertIndex),
  });
  const restingHeightClass = alwaysVisible ? "h-8" : "h-4";
  const dragHitAreaClass = isDragMode
    ? isOver
      ? "inset-y-0"
      : insertIndex === 0
        ? "-top-8 -bottom-14"
        : "-inset-y-14"
    : "inset-y-0";

  const handleClick = () => {
    if (isMobileViewport && !isDragMode && !mobileArmed) {
      onArm?.();
      return;
    }

    onClick();
  };

  const rowContent = isDragMode || hideAction || (isMobileViewport && !mobileArmed) ? null : (
    <span
      className={clsx(
        "flex h-8 w-8 items-center justify-center rounded-full border transition",
        interactive
          ? isDarkMode
            ? "border-white/15 bg-slate-950 text-white group-hover:border-white/35 group-hover:bg-slate-900 group-focus:border-white/35 group-focus:bg-slate-900"
            : "border-slate-300 bg-white text-slate-700 group-hover:border-slate-500 group-hover:bg-slate-50 group-focus:border-slate-500 group-focus:bg-slate-50"
          : "border-transparent bg-transparent text-transparent",
      )}
    >
      <Plus className="h-5 w-5" />
    </span>
  );

  if (!interactive) {
    return (
      <div
        data-mobile-inline-add-root="true"
        className={clsx(
          "group relative z-[15] flex w-full items-center justify-center gap-3 overflow-visible transition-[height,opacity] duration-200 ease-out",
          isDarkMode ? "text-slate-300" : "text-slate-400",
          isDragMode
            ? isGapSuppressed
              ? clsx(restingHeightClass, "opacity-0")
              : isOver
                ? "h-[172px] opacity-100"
                : clsx(restingHeightClass, "opacity-100")
            : alwaysVisible
              ? "h-8 opacity-100"
              : "h-4",
        )}
        aria-hidden="true"
      >
        <div ref={setNodeRef} className={clsx("pointer-events-none absolute inset-x-0", dragHitAreaClass)} />
        {rowContent}
      </div>
    );
  }

  return (
    <button
      data-mobile-inline-add-root="true"
      className={clsx(
        "group relative z-[15] flex w-full items-center justify-center gap-3 overflow-visible transition-[height,opacity] duration-200 ease-out hover:opacity-100 focus:opacity-100 focus:outline-none",
        isDarkMode ? "text-slate-300" : "text-slate-400",
        isDragMode
          ? isGapSuppressed
            ? clsx("pointer-events-none", restingHeightClass, "opacity-0")
            : isOver
              ? "h-[172px] opacity-100"
              : clsx(restingHeightClass, "opacity-100")
          : alwaysVisible
            ? "h-8 opacity-100"
            : isMobileViewport
              ? "h-4 opacity-100"
              : "h-4 opacity-0",
        isOver && "opacity-100",
      )}
      onClick={handleClick}
      type="button"
      aria-label="Add game here"
    >
      <div ref={setNodeRef} className={clsx("pointer-events-none absolute inset-x-0", dragHitAreaClass)} />
      <HoverTooltip
        isDarkMode={isDarkMode}
        label={isMobileViewport && !isDragMode && !mobileArmed ? "Show Add Card" : "Add Card"}
      />
      {rowContent}
    </button>
  );
}

function SortableCard({
  card,
  collapseCards,
  showSeries,
  showArtwork,
  showTierHighlights,
  frontFieldDefinitions,
  rankBadge,
  secondaryRankBadge,
  onEdit,
  isAnyCardDragging = false,
  forceSquare = false,
  compactImageOnly = false,
  containerClassName,
  collapseSizeWhenDragging = false,
  preserveSpaceWhenDragging = true,
}: {
  card: CardEntry;
  collapseCards: boolean;
  showSeries: boolean;
  showArtwork: boolean;
  showTierHighlights: boolean;
  frontFieldDefinitions: BoardFieldDefinition[];
  rankBadge: RankBadge | null;
  secondaryRankBadge?: RankBadge | null;
  onEdit: () => void;
  isAnyCardDragging?: boolean;
  forceSquare?: boolean;
  compactImageOnly?: boolean;
  containerClassName?: string;
  collapseSizeWhenDragging?: boolean;
  preserveSpaceWhenDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.entryId,
      animateLayoutChanges: (args) => {
        if (args.isDragging) {
          return false;
        }

        return defaultAnimateLayoutChanges(args);
      },
    });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "relative",
        containerClassName,
        isDragging &&
          (collapseSizeWhenDragging
            ? "z-20 h-0 w-0 overflow-hidden opacity-0 pointer-events-none"
            : preserveSpaceWhenDragging
              ? "z-20 opacity-0 pointer-events-none"
              : "z-20 h-0 overflow-hidden opacity-0 pointer-events-none"),
      )}
      style={{
        transform:
          isAnyCardDragging && !isDragging ? undefined : CSS.Transform.toString(transform),
        transition:
          isAnyCardDragging && !isDragging
            ? "none"
            : isDragging
              ? undefined
              : (transition ?? "transform 140ms cubic-bezier(0.22, 1, 0.36, 1)"),
        willChange: "transform",
      }}
    >
      <CardTile
        card={card}
        collapseCards={collapseCards}
        showSeries={showSeries}
        showArtwork={showArtwork}
        showTierHighlights={showTierHighlights}
        frontFieldDefinitions={frontFieldDefinitions}
        rankBadge={rankBadge}
        secondaryRankBadge={secondaryRankBadge}
        isDragging={isDragging}
        forceSquare={forceSquare}
        compactImageOnly={compactImageOnly}
        dragProps={{ ...attributes, ...listeners }}
        onEdit={onEdit}
      />
    </div>
  );
}

function CardTile({
  card,
  collapseCards,
  showSeries,
  showArtwork,
  showTierHighlights,
  frontFieldDefinitions,
  rankBadge,
  secondaryRankBadge,
  dragProps,
  isDragging = false,
  onEdit,
  clickToEdit = false,
  forceSquare = false,
  compactImageOnly = false,
}: {
  card: CardEntry;
  collapseCards: boolean;
  showSeries: boolean;
  showArtwork: boolean;
  showTierHighlights: boolean;
  frontFieldDefinitions: BoardFieldDefinition[];
  rankBadge: RankBadge | null;
  secondaryRankBadge?: RankBadge | null;
  dragProps?: React.HTMLAttributes<HTMLElement>;
  isDragging?: boolean;
  onEdit?: () => void;
  clickToEdit?: boolean;
  forceSquare?: boolean;
  compactImageOnly?: boolean;
}) {
  const tierKey = showTierHighlights ? getTierKey(rankBadge?.value ?? null) : null;
  const { displayTitle, displaySeries } = getDisplayCardText(card.title, card.series, showSeries);
  const hasArtwork = showArtwork && Boolean(card.imageUrl?.trim());
  const imageSource = hasArtwork ? card.imageUrl.trim() : "";
  const frontChips = frontFieldDefinitions
    .filter((field) => field.showOnCardFront && field.visible && !field.builtInKey)
    .map((field) => ({
      id: field.id,
      label: field.label,
      showLabel: field.showLabelOnCardFront ?? true,
      value:
        field.type === "date"
          ? formatDateFieldValue(
              card.customFieldValues?.[field.id] ?? "",
              field.dateFormat ?? DEFAULT_DATE_FIELD_FORMAT,
            )
          : card.customFieldValues?.[field.id]?.trim() ?? "",
    }))
    .filter((field) => field.value.length > 0);
  const [showCollapsedActions, setShowCollapsedActions] = useState(false);
  const [loadedImageSource, setLoadedImageSource] = useState("");
  const cardRef = useRef<HTMLElement | null>(null);
  const tierBorderClass =
    tierKey === "top10"
      ? "border-amber-300/80"
      : tierKey === "top15"
        ? "border-cyan-300/80"
        : tierKey === "top20"
          ? "border-fuchsia-300/80"
          : tierKey === "top30"
            ? "border-emerald-300/80"
          : "border-white/10";
  const collapsedTierSurfaceClass =
    tierKey === "top10"
      ? "bg-amber-300 text-amber-950"
      : tierKey === "top15"
        ? "bg-cyan-300 text-cyan-950"
        : tierKey === "top20"
          ? "bg-fuchsia-300 text-fuchsia-950"
          : tierKey === "top30"
            ? "bg-emerald-300 text-emerald-950"
          : "bg-slate-50 text-slate-950";
  const collapsedRankClass =
    "bg-white text-slate-950";
  const collapsedTitleClass = "text-slate-950";
  const collapsedSeriesClass = "text-slate-950";

  useEffect(() => {
    if (!collapseCards || !showCollapsedActions) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!cardRef.current?.contains(event.target as Node)) {
        setShowCollapsedActions(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [collapseCards, showCollapsedActions]);

  return (
    <article
      ref={cardRef}
      data-card-entry-id={card.entryId}
      {...dragProps}
      className={clsx(
        "group relative shrink-0 border cursor-grab active:cursor-grabbing",
        clickToEdit && !collapseCards && "cursor-pointer",
        collapseCards && collapsedTierSurfaceClass,
        !collapseCards && "bg-slate-900",
        collapseCards ? "border-slate-950" : tierBorderClass,
        isDragging && "shadow-[0_26px_50px_rgba(15,23,42,0.28)]",
        compactImageOnly ? "rounded-[14px]" : "rounded-[28px]",
      )}
      onClick={() => {
        if (collapseCards) {
          setShowCollapsedActions(true);
        } else if (clickToEdit && onEdit) {
          onEdit();
        }
      }}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: collapseCards ? "82px" : "180px",
        touchAction: "pan-y",
      }}
    >
        <div
          className={clsx(
            "relative overflow-hidden bg-center",
            collapseCards ? collapsedTierSurfaceClass : "bg-slate-900",
            collapseCards ? "min-h-[82px]" : compactImageOnly ? "aspect-[2/3]" : forceSquare ? "aspect-square" : "aspect-video",
            compactImageOnly ? "rounded-[14px]" : "rounded-[28px]",
          )}
        style={
          collapseCards
            ? undefined
            : !hasArtwork
            ? {
                backgroundColor: "#0f172a",
                backgroundImage:
                  "radial-gradient(circle at 18% 22%, rgba(255,255,255,0.08), transparent 34%), radial-gradient(circle at 78% 18%, rgba(255,255,255,0.05), transparent 28%), linear-gradient(135deg, rgba(148,163,184,0.12), rgba(15,23,42,0.02) 42%, rgba(148,163,184,0.09))",
              }
            : { backgroundColor: "#0f172a" }
        }
      >
        {!collapseCards && hasArtwork ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className={clsx(
                "absolute inset-0 h-full w-full object-cover transition duration-300",
                loadedImageSource === imageSource ? "scale-100 blur-0 opacity-100" : "scale-105 blur-md opacity-60",
              )}
              onLoad={() => setLoadedImageSource(imageSource)}
              src={imageSource}
            />
            <div
              className={clsx(
                "absolute inset-0 bg-slate-900/40 transition duration-300",
                loadedImageSource === imageSource ? "opacity-0" : "opacity-100",
              )}
            />
          </>
        ) : null}
        {!collapseCards && !compactImageOnly ? (
          <div className="absolute inset-x-0 bottom-0 h-[64%] bg-gradient-to-t from-slate-950 via-slate-950/38 to-transparent" />
        ) : null}

        {!collapseCards && !compactImageOnly ? (
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
          {rankBadge ? (
            <div
              className={clsx(
                "rounded-full px-3 py-1 text-xs font-black",
                collapseCards
                  ? collapsedRankClass
                  : tierKey === "top10"
                  ? "bg-amber-300 text-amber-950"
                  : tierKey === "top15"
                    ? "bg-cyan-300 text-cyan-950"
                    : tierKey === "top20"
                      ? "bg-fuchsia-300 text-fuchsia-950"
                      : tierKey === "top30"
                        ? "bg-emerald-300 text-emerald-950"
                      : "bg-white text-slate-950",
              )}
            >
              {rankBadge.label ? `${rankBadge.label} ${rankBadge.value}` : `${rankBadge.value}`}
            </div>
          ) : null}
          {secondaryRankBadge ? (
            <div className="rounded-full bg-slate-950/75 px-3 py-1 text-xs font-black text-white backdrop-blur">
              {`${secondaryRankBadge.label} ${secondaryRankBadge.value}`}
            </div>
          ) : null}
        </div>
        ) : null}

        {collapseCards ? (
          <div className="absolute inset-x-0 bottom-0 top-0 p-4">
            <div className="relative flex min-h-full items-center justify-center">
              {rankBadge ? (
                <div className="absolute left-0 top-1/2 -translate-y-1/2">
                  <div className={clsx("shrink-0 rounded-full px-3 py-1 text-xs font-black", collapsedRankClass)}>
                    {rankBadge.label ? `${rankBadge.label} ${rankBadge.value}` : `${rankBadge.value}`}
                  </div>
                </div>
              ) : null}
              <div className="mx-auto flex max-w-[calc(100%-4.75rem)] flex-col items-center justify-center px-1 text-center">
                {displaySeries ? (
              <p className={clsx("mb-1 line-clamp-1 text-[10px] font-semibold uppercase tracking-[0.18em]", collapsedSeriesClass)}>
                {displaySeries}
              </p>
                ) : null}
                <h3
                  className={clsx(
                    "line-clamp-2 text-sm font-bold leading-tight",
                    collapsedTitleClass,
                  )}
                >
                  {displayTitle}
                </h3>
              </div>
              {rankBadge ? <div className="pointer-events-none invisible absolute right-0 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs font-black">00</div> : null}
            </div>
          </div>
        ) : compactImageOnly ? null : hasArtwork ? (
          <div className="absolute left-0 right-0 bottom-0 p-3 sm:p-4">
            {displaySeries ? (
              <p className="mb-1 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                {displaySeries}
              </p>
            ) : null}
            <h3 className={clsx("truncate font-bold text-white", forceSquare ? "mt-0.5 text-base sm:text-lg" : "text-xl")}>
              {displayTitle}
            </h3>
            {card.notes ? (
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-200">{card.notes}</p>
            ) : null}
          </div>
        ) : (
          <div className="absolute inset-0 p-4">
            <div className="flex min-h-full flex-col">
              <div className="flex-1" />
              <div className="flex flex-1 items-center justify-center text-center">
                <h3 className="line-clamp-3 text-2xl font-bold text-white">{displayTitle}</h3>
              </div>
              <div className="mt-auto flex items-end justify-between gap-3">
                <div className="min-w-0">
                  {displaySeries ? (
                    <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-white">
                      {displaySeries}
                    </p>
                  ) : null}
                </div>
                {card.notes ? <p className="line-clamp-2 max-w-[45%] text-right text-sm leading-5 text-slate-300">{card.notes}</p> : null}
              </div>
            </div>
          </div>
        )}

        {!collapseCards && !compactImageOnly && (frontChips.length > 0 || card.mirroredFromEntryId) ? (
          <div className="absolute right-3 top-3 z-10 flex max-w-[58%] flex-row-reverse items-center gap-2 overflow-hidden">
            {card.mirroredFromEntryId ? (
              <div
                className="shrink-0 rounded-full bg-slate-950/75 p-2 text-white backdrop-blur"
                aria-label="Mirrored card"
                title="Mirrored card"
              >
                <Link2 className="h-4 w-4" />
              </div>
            ) : null}
            {frontChips.map((field) => (
              <span
                key={field.id}
                className="max-w-[9rem] shrink truncate rounded-full bg-slate-950/78 px-2.5 py-1 text-[11px] font-semibold text-slate-200 backdrop-blur"
                title={field.showLabel ? `${field.label}: ${field.value}` : field.value}
              >
                {field.showLabel ? `${field.label}: ${field.value}` : field.value}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className={clsx(
        collapseCards
          ? "absolute inset-x-0 top-1/2 z-[80] flex -translate-y-1/2 items-center justify-center gap-3 opacity-0 transition duration-150"
          : "absolute right-3 z-[80] flex flex-col items-end gap-2 opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
        collapseCards
          ? showCollapsedActions && "opacity-100"
          : frontChips.length > 0 || card.mirroredFromEntryId
            ? "top-14"
            : "top-3",
      )}>
        {onEdit ? (
          <div className="group relative">
            <button
              className="rounded-full bg-slate-950/85 p-2 text-white backdrop-blur transition hover:bg-slate-950"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
              aria-label={`Edit ${card.title}`}
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <HoverTooltip isDarkMode={true} label="Edit" />
          </div>
        ) : null}
      </div>
    </article>
  );
}
