"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  defaultAnimateLayoutChanges,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { User } from "@supabase/supabase-js";
import {
  ArrowLeftRight,
  ArrowUpDown,
  Clapperboard,
  Edit3,
  Gamepad2,
  Heart,
  ImagePlus,
  LogOut,
  MoreHorizontal,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  Tv,
  Upload,
  WandSparkles,
  X,
  Link2,
} from "lucide-react";
import { parseTrelloBoardExport } from "@/lib/trello-import";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  BoardFieldDefinition,
  BoardSettings,
  BoardSnapshot,
  CardEntry,
  CardFieldType,
  ColumnDefinition,
  DateFieldFormat,
  SavedBoard,
} from "@/lib/types";

type CardDraft = {
  title: string;
  imageUrl: string;
  series: string;
  releaseYear: string;
  notes: string;
  customFields: Record<string, string>;
  columnId: string;
  newColumnTitle: string;
};

type AddCardTarget = {
  columnId: string;
  insertIndex: number;
};

type CardEditorDraft = {
  title: string;
  imageUrl: string;
  series: string;
  releaseYear: string;
  notes: string;
  customFields: Record<string, string>;
};

type ColumnEditorDraft = {
  title: string;
};

type DuplicateMatch = {
  column: ColumnDefinition;
  card: CardEntry;
};

type PendingDuplicateAction = {
  match: DuplicateMatch;
  title: string;
  imageUrl: string;
  series: string;
  releaseYear?: string;
  notes?: string;
  customFields?: Record<string, string>;
};

type RankBadge = {
  label?: string;
  value: number;
};

type TierFilter = "all" | "top10" | "top15" | "top20";

type DuplicateCleanupSuggestion = {
  id: string;
  columnId: string;
  columnTitle: string;
  normalizedTitle: string;
  keepCard: CardEntry;
  removeCard: CardEntry;
};

type TitleTidySuggestion = {
  id: string;
  columnId: string;
  columnTitle: string;
  entryId: string;
  itemId: string;
  originalTitle: string;
  proposedTitle: string;
};

type SeriesScrapeSuggestion = {
  id: string;
  columnId: string;
  columnTitle: string;
  entryId: string;
  itemId: string;
  title: string;
  proposedSeries: string;
  proposedReleaseYear: string;
};

type ArtworkPickerState = {
  target: "draft" | "editing";
  options: string[];
};

type PendingMirrorDelete = {
  columnId: string;
  entryId: string;
  itemId: string;
  title: string;
  columnTitle: string;
};

type PairwiseQuizState = {
  columnId: string;
  columnTitle: string;
  sortedCards: CardEntry[];
  remainingCards: CardEntry[];
  candidateCard: CardEntry | null;
  low: number;
  high: number;
  compareIndex: number;
  comparisons: number;
  history: Array<{
    sortedCards: CardEntry[];
    remainingCards: CardEntry[];
    candidateCard: CardEntry | null;
    low: number;
    high: number;
    compareIndex: number;
    comparisons: number;
  }>;
};

type PairwiseQuizReview = {
  columnId: string;
  columnTitle: string;
  rankedCards: CardEntry[];
  comparisons: number;
};

type ArtworkSearchMode = "image" | "gif";

type BoardBackupSnapshot = {
  savedAt: string;
  activeBoardId: string;
  boards: SavedBoard[];
};

const initialDraft: CardDraft = {
  title: "",
  imageUrl: "",
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

function createEmptyBoard(title = "New Board"): SavedBoard {
  const timestamp = new Date().toISOString();
  const starterSnapshot = createStarterBoardSnapshot();

  return {
    id: makeId("board"),
    title,
    settings: getDefaultBoardSettings(title),
    columns: starterSnapshot.columns,
    cardsByColumn: starterSnapshot.cardsByColumn,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const LOCAL_STORAGE_KEY = "rankboard-state-v1";
const LOCAL_BACKUP_STORAGE_KEY = "rankboard-backups-v1";
const THEME_STORAGE_KEY = "rankboard-theme-v1";
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

function getDefaultFieldDefinitions(boardTitle: string): BoardFieldDefinition[] {
  const boardKind = getBoardKind(boardTitle);

  return [
    {
      id: "series",
      label: boardKind === "show" ? "Franchise" : "Series",
      type: "short_text",
      visible: boardKind !== "show",
      showOnCardFront: false,
      builtInKey: "series",
    },
    {
      id: "release-year",
      label: "Release Year",
      type: "date",
      visible: true,
      showOnCardFront: false,
      showLabelOnCardFront: true,
      dateFormat: "yyyy",
      builtInKey: "releaseYear",
    },
    {
      id: "artwork",
      label: "Artwork URL",
      type: "short_text",
      visible: true,
      showOnCardFront: false,
      builtInKey: "imageUrl",
    },
    {
      id: "notes",
      label: "Notes",
      type: "long_text",
      visible: true,
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
    showOnCardFront: field.showOnCardFront ?? false,
    showLabelOnCardFront: field.showLabelOnCardFront ?? true,
    options: field.type === "select" ? field.options ?? [] : undefined,
    dateFormat:
      field.type === "date"
        ? field.dateFormat ?? DEFAULT_DATE_FIELD_FORMAT
        : undefined,
  }));
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

function getUserBoardCacheKey(userId: string) {
  return `rankboard-user-${userId}-v1`;
}

function isRankedColumn(column: ColumnDefinition) {
  return column.type === "ranked";
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

function getTierKey(rank: number | null): Exclude<TierFilter, "all"> | null {
  if (!rank) {
    return null;
  }

  if (rank <= 10) {
    return "top10";
  }

  if (rank <= 15) {
    return "top15";
  }

  if (rank <= 20) {
    return "top20";
  }

  return null;
}

function matchesTierFilter(rank: number | null, tierFilter: TierFilter) {
  if (tierFilter === "all") {
    return true;
  }

  return getTierKey(rank) === tierFilter;
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

function sanitizeSearchTitle(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

async function fetchWikipediaMetadataBySearch(query: string) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return null;
  }

  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", trimmedQuery);
  url.searchParams.set("gsrlimit", "5");
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("exintro", "1");
  url.searchParams.set("explaintext", "1");

  const response = await fetch(url.toString());

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          title?: string;
          extract?: string;
        }
      >;
    };
  };

  return Object.values(data.query?.pages ?? {})
    .map((page) => ({
      title: page.title ?? "",
      extract: page.extract ?? "",
    }))
    .filter((page) => page.title || page.extract);
}

function stripWikipediaQualifier(title: string) {
  return title.replace(/\s+\([^)]*\)\s*$/g, "").trim();
}

function getMeaningfulTitleTokens(title: string) {
  return normalizeTitleForComparison(stripWikipediaQualifier(title))
    .split(" ")
    .filter(
      (token) =>
        token.length > 1 &&
        !new Set([
          "the",
          "a",
          "an",
          "of",
          "and",
          "for",
          "to",
          "in",
          "on",
          "at",
          "video",
          "game",
        ]).has(token),
    );
}

function scoreWikipediaMetadata(metadata: { title: string; extract: string }, searchTitle: string) {
  const normalizedSearch = sanitizeSearchTitle(searchTitle);
  const normalizedPageTitle = sanitizeSearchTitle(stripWikipediaQualifier(metadata.title));
  const searchTokens = getMeaningfulTitleTokens(searchTitle);
  const pageTitleTokens = new Set(getMeaningfulTitleTokens(metadata.title));
  const normalizedExtract = normalizeTitleForComparison(metadata.extract);
  const fullTokenMatches = searchTokens.filter(
    (token) =>
      pageTitleTokens.has(token) ||
      normalizedExtract.includes(token),
  ).length;

  let score = 0;

  if (normalizedPageTitle === normalizedSearch) {
    score += 120;
  } else if (normalizedPageTitle.includes(normalizedSearch)) {
    score += 90;
  } else if (normalizedSearch.includes(normalizedPageTitle)) {
    score += 50;
  }

  score += fullTokenMatches * 18;

  if (searchTokens.length > 0 && fullTokenMatches === searchTokens.length) {
    score += 45;
  } else if (searchTokens.length > 0 && fullTokenMatches <= Math.floor(searchTokens.length / 2)) {
    score -= 30;
  }

  const suspiciousPattern =
    /\b(award|awards|character|franchise|series|novel|manga|comic|disambiguation)\b/i;
  if (suspiciousPattern.test(metadata.title) || suspiciousPattern.test(metadata.extract)) {
    score -= 35;
  }

  if (/\(video game\)/i.test(metadata.title) && searchTokens.length > 1 && !normalizedPageTitle.includes(normalizedSearch)) {
    score -= 15;
  }

  return score;
}

async function fetchBestWikipediaMetadata(
  title: string,
  existingSeries: string[] = [],
) {
  const queries = Array.from(
    new Set([
      `${title} video game`,
      title,
      `${title} game`,
      ...existingSeries.slice(0, 8).map((series) => `${series} ${title} video game`),
    ]),
  );

  let bestMatch: { title: string; extract: string } | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const query of queries) {
    const candidates = await fetchWikipediaMetadataBySearch(query);

    for (const candidate of candidates ?? []) {
      const score = scoreWikipediaMetadata(candidate, title);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }
  }

  return bestScore >= 45 ? bestMatch : null;
}

function openGoogleImageSearch(title: string, mode: ArtworkSearchMode = "image") {
  const query = title.trim();

  if (!query || typeof window === "undefined") {
    return;
  }

  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("tbm", "isch");

  if (mode === "gif") {
    url.searchParams.set("tbs", "itp:animated");
  }

  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function createCardDraft(card: CardEntry): CardEditorDraft {
  return {
    title: card.title,
    imageUrl: card.imageUrl,
    series: card.series,
    releaseYear: card.releaseYear ?? "",
    notes: card.notes ?? "",
    customFields: { ...(card.customFieldValues ?? {}) },
  };
}

function makeInsertDropId(columnId: string, insertIndex: number) {
  return `insert::${columnId}::${insertIndex}`;
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

function normalizeSavedBoard(board: SavedBoard | (Omit<SavedBoard, "settings"> & { settings?: Partial<BoardSettings> })) {
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      excludedMirrorItemIds: column.excludedMirrorItemIds ?? [],
      excludeFromBoardMirrors: column.excludeFromBoardMirrors ?? false,
    })),
    settings: {
      ...getDefaultBoardSettings(board.title),
      ...board.settings,
      fieldDefinitions: normalizeFieldDefinitions(board.settings?.fieldDefinitions, board.title, board.settings),
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
  } satisfies SavedBoard;
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

function BoardKindIcon({
  boardTitle,
  className,
}: {
  boardTitle: string;
  className?: string;
}) {
  switch (getBoardKind(boardTitle)) {
    case "character":
      return <Heart className={className} />;
    case "movie":
      return <Clapperboard className={className} />;
    case "show":
      return <Tv className={className} />;
    case "anime":
      return <Sparkles className={className} />;
    default:
      return <Gamepad2 className={className} />;
  }
}

function MenuSectionButton({
  icon,
  label,
  isOpen,
  isDarkMode,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  isOpen: boolean;
  isDarkMode: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx(
        "flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
        isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="text-xs opacity-70">{isOpen ? "▾" : "▸"}</span>
    </button>
  );
}

function FieldSettingsPanel({
  isDarkMode,
  fieldDefinitions,
  onToggleField,
}: {
  isDarkMode: boolean;
  fieldDefinitions: BoardFieldDefinition[];
  onToggleField: (fieldId: string) => void;
}) {
  return (
    <div
      className={clsx(
        "min-w-[220px] rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
        isDarkMode ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white",
      )}
    >
      {fieldDefinitions.map((field) => (
        <button
          key={field.id}
          className={clsx(
            "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
            isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
          )}
          onClick={() => onToggleField(field.id)}
          type="button"
        >
          <span>{field.label}</span>
          <span className="text-xs opacity-70">{field.visible ? "On" : "Off"}</span>
        </button>
      ))}
    </div>
  );
}

function FieldDefinitionManager({
  isDarkMode,
  fieldDefinitions,
  onToggleVisibility,
  onUpdateField,
  onRemoveField,
  onAddField,
}: {
  isDarkMode: boolean;
  fieldDefinitions: BoardFieldDefinition[];
  onToggleVisibility: (fieldId: string) => void;
  onUpdateField: (fieldId: string, patch: Partial<BoardFieldDefinition>) => void;
  onRemoveField: (fieldId: string) => void;
  onAddField: (type: CardFieldType) => void;
}) {
  const mandatoryFieldIds = new Set(["series", "artwork"]);
  const [openFieldSettingsId, setOpenFieldSettingsId] = useState<string | null>(null);
  const [pendingFieldRemoval, setPendingFieldRemoval] = useState<BoardFieldDefinition | null>(null);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        {[
          ...fieldDefinitions.filter((field) => field.builtInKey === "series" || field.builtInKey === "imageUrl"),
          ...fieldDefinitions.filter((field) => field.builtInKey !== "series" && field.builtInKey !== "imageUrl"),
        ].map((field) => (
          <div
            key={field.id}
            className={clsx(
              "rounded-2xl border p-4",
              isDarkMode ? "border-white/10 bg-slate-950/60" : "border-slate-200 bg-slate-50",
            )}
          >
            <div
              className={clsx(
                "grid gap-2 sm:items-center",
                field.builtInKey === "series" || field.builtInKey === "imageUrl"
                  ? "sm:grid-cols-[220px_minmax(0,1fr)]"
                  : "sm:grid-cols-[220px_136px_minmax(0,1fr)]",
              )}
            >
              <input
                className={clsx(
                  "min-w-0 whitespace-nowrap rounded-xl border px-3 py-2 text-sm outline-none transition",
                  isDarkMode
                    ? "border-white/10 bg-slate-900 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                )}
                value={field.label}
                onChange={(event) => onUpdateField(field.id, { label: event.target.value })}
                placeholder="Field label"
              />
              {field.builtInKey === "series" || field.builtInKey === "imageUrl" ? null : (
                <select
                  className={clsx(
                    "w-[136px] rounded-xl border px-3 py-2 text-sm outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-900 text-white focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                  )}
                  value={field.type}
                  onChange={(event) => onUpdateField(field.id, { type: event.target.value as CardFieldType })}
                >
                  <option value="short_text">Short Text</option>
                  <option value="long_text">Long Text</option>
                  <option value="date">Date</option>
                  <option value="select">Dropdown</option>
                </select>
              )}
              <div className="flex min-w-0 items-center justify-end gap-3 justify-self-end">
                {!mandatoryFieldIds.has(field.id) ? (
                  <button
                    className={clsx(
                      "inline-flex items-center justify-center self-stretch rounded-xl border px-3 py-2 text-sm font-semibold transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-900 text-slate-200 hover:border-white/40"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                    )}
                    onClick={() =>
                      setOpenFieldSettingsId((current) => (current === field.id ? null : field.id))
                    }
                    type="button"
                    aria-label={`Open settings for ${field.label}`}
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-1 py-2 text-sm font-semibold transition",
                  )}
                  onClick={() => onToggleVisibility(field.id)}
                  type="button"
                >
                  <span>{field.visible ? "Enabled" : "Disabled"}</span>
                  <span
                    className={clsx(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition",
                      field.visible ? "bg-emerald-500" : isDarkMode ? "bg-white/15" : "bg-slate-300",
                    )}
                  >
                    <span
                      className={clsx(
                        "inline-block h-5 w-5 transform rounded-full bg-white transition",
                        field.visible ? "translate-x-5" : "translate-x-0.5",
                      )}
                    />
                  </span>
                </button>
                {field.visible && mandatoryFieldIds.has(field.id) ? (
                  <button
                    className={clsx(
                      "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-1 py-2 text-sm font-semibold transition",
                    )}
                    onClick={() =>
                      onUpdateField(field.id, {
                        showOnCardFront: !field.showOnCardFront,
                      })
                    }
                    type="button"
                  >
                    <span>Front</span>
                    <span
                      className={clsx(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition",
                        field.showOnCardFront ? "bg-emerald-500" : isDarkMode ? "bg-white/15" : "bg-slate-300",
                      )}
                    >
                      <span
                        className={clsx(
                          "inline-block h-5 w-5 transform rounded-full bg-white transition",
                          field.showOnCardFront ? "translate-x-5" : "translate-x-0.5",
                        )}
                      />
                    </span>
                  </button>
                ) : null}
                {mandatoryFieldIds.has(field.id) ? null : (
                  <button
                    className={clsx(
                      "inline-flex items-center justify-center rounded-xl border p-2 transition",
                      isDarkMode
                        ? "border-rose-400/30 text-rose-200 hover:border-rose-300"
                        : "border-rose-200 text-rose-700 hover:border-rose-500",
                    )}
                    onClick={() => setPendingFieldRemoval(field)}
                    type="button"
                    aria-label={`Remove ${field.label}`}
                    title={`Remove ${field.label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            {!mandatoryFieldIds.has(field.id) && openFieldSettingsId === field.id ? (
              <div
                className={clsx(
                  "mt-3 grid gap-3 rounded-2xl border p-3 sm:grid-cols-[200px_auto_auto]",
                  isDarkMode ? "border-white/10 bg-slate-900/80" : "border-slate-200 bg-white",
                )}
              >
                <button
                  className={clsx(
                    "inline-flex items-center justify-self-start gap-3 rounded-xl px-1 py-2 text-sm font-semibold transition sm:self-end",
                  )}
                  onClick={() =>
                    onUpdateField(field.id, {
                      showOnCardFront: !field.showOnCardFront,
                    })
                  }
                  type="button"
                >
                  <span>Front</span>
                  <span
                    className={clsx(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition",
                      field.showOnCardFront
                        ? "bg-emerald-500"
                        : isDarkMode
                          ? "bg-white/15"
                          : "bg-slate-300",
                    )}
                  >
                    <span
                      className={clsx(
                        "inline-block h-5 w-5 transform rounded-full bg-white transition",
                        field.showOnCardFront ? "translate-x-5" : "translate-x-0.5",
                      )}
                    />
                  </span>
                </button>
                <button
                  className={clsx(
                    "inline-flex items-center justify-self-start gap-3 rounded-xl px-1 py-2 text-sm font-semibold transition sm:self-end",
                  )}
                  onClick={() =>
                    onUpdateField(field.id, {
                      showLabelOnCardFront: !(field.showLabelOnCardFront ?? true),
                    })
                  }
                  type="button"
                >
                  <span>Label</span>
                  <span
                    className={clsx(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition",
                      field.showLabelOnCardFront ?? true
                        ? "bg-emerald-500"
                        : isDarkMode
                          ? "bg-white/15"
                          : "bg-slate-300",
                    )}
                  >
                    <span
                      className={clsx(
                        "inline-block h-5 w-5 transform rounded-full bg-white transition",
                        field.showLabelOnCardFront ?? true ? "translate-x-5" : "translate-x-0.5",
                      )}
                    />
                  </span>
                </button>
                {field.type === "date" ? (
                  <label className="grid gap-2 sm:col-span-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
                      Date format
                    </span>
                    <select
                      className={clsx(
                        "w-[180px] rounded-xl border px-3 py-2 text-sm outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-white focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                      )}
                      value={field.dateFormat ?? DEFAULT_DATE_FIELD_FORMAT}
                      onChange={(event) =>
                        onUpdateField(field.id, { dateFormat: event.target.value as DateFieldFormat })
                      }
                    >
                      <option value="mm/dd/yyyy">mm/dd/yyyy</option>
                      <option value="dd/mm/yyyy">dd/mm/yyyy</option>
                      <option value="yyyy">yyyy</option>
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
            {field.type === "select" ? (
              <input
                className={clsx(
                  "mt-3 w-full rounded-xl border px-3 py-2 text-sm outline-none transition",
                  isDarkMode
                    ? "border-white/10 bg-slate-900 text-white placeholder:text-slate-500 focus:border-white/40"
                    : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                )}
                value={(field.options ?? []).join(", ")}
                onChange={(event) =>
                  onUpdateField(field.id, {
                    options: event.target.value
                      .split(",")
                      .map((option) => option.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Dropdown options, comma separated"
              />
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold transition", isDarkMode ? "border-white/10 hover:border-white/40" : "border-slate-200 hover:border-slate-950")} onClick={() => onAddField("short_text")} type="button">
          Add Short Text
        </button>
        <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold transition", isDarkMode ? "border-white/10 hover:border-white/40" : "border-slate-200 hover:border-slate-950")} onClick={() => onAddField("long_text")} type="button">
          Add Long Text
        </button>
        <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold transition", isDarkMode ? "border-white/10 hover:border-white/40" : "border-slate-200 hover:border-slate-950")} onClick={() => onAddField("date")} type="button">
          Add Date
        </button>
        <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold transition", isDarkMode ? "border-white/10 hover:border-white/40" : "border-slate-200 hover:border-slate-950")} onClick={() => onAddField("select")} type="button">
          Add Dropdown
        </button>
      </div>
      {pendingFieldRemoval ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => setPendingFieldRemoval(null)}
        >
          <div
            className={clsx(
              "w-full max-w-md rounded-[28px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
              isDarkMode
                ? "border-white/10 bg-slate-900 text-slate-100"
                : "border-white/70 bg-white text-slate-950",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <p className={clsx("text-sm font-semibold uppercase tracking-[0.22em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
              Delete Field
            </p>
            <h3 className={clsx("mt-3 text-2xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
              Remove {pendingFieldRemoval.label}?
            </h3>
            <p className={clsx("mt-3 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
              This will also delete the saved values from every card that uses this field.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                className={clsx(
                  "rounded-2xl px-4 py-3 text-sm font-semibold transition",
                  isDarkMode
                    ? "bg-white/10 text-white hover:bg-white/15"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                )}
                onClick={() => setPendingFieldRemoval(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={clsx(
                  "rounded-2xl px-4 py-3 text-sm font-semibold transition",
                  isDarkMode
                    ? "bg-rose-500 text-white hover:bg-rose-400"
                    : "bg-rose-600 text-white hover:bg-rose-500",
                )}
                onClick={() => {
                  setOpenFieldSettingsId((current) =>
                    current === pendingFieldRemoval.id ? null : current,
                  );
                  onRemoveField(pendingFieldRemoval.id);
                  setPendingFieldRemoval(null);
                }}
                type="button"
              >
                Delete Field
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeTitleForComparison(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
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

function getSuggestedReleaseYearFromTitle(title: string) {
  const match = title.match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? "";
}

function getSuggestedReleaseYearFromWikipediaExtract(extract: string) {
  const match = extract.match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? "";
}

function getSuggestedReleaseYearFromWikipediaMetadata(
  metadata: { title: string; extract: string } | null,
  searchTitle: string,
) {
  if (!metadata) {
    return "";
  }

  const score = scoreWikipediaMetadata(metadata, searchTitle);

  if (score < 70) {
    return "";
  }

  return getSuggestedReleaseYearFromWikipediaExtract(metadata.extract);
}

function getSuggestedSeriesFromWikipediaExtract(
  extract: string,
  existingSeries: string[] = [],
) {
  const normalizedExtract = normalizeTitleForComparison(extract);

  if (!normalizedExtract) {
    return null;
  }

  const matchingSeries = existingSeries
    .map((series) => ({
      original: series,
      normalized: normalizeTitleForComparison(series),
    }))
    .filter((series) => series.normalized.length > 0)
    .sort((left, right) => right.normalized.length - left.normalized.length)
    .find((series) => normalizedExtract.includes(series.normalized));

  return matchingSeries?.original ?? null;
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDisplayCardText(title: string, series: string, showSeries: boolean) {
  const trimmedTitle = title.trim();
  const trimmedSeries = series.trim();

  if (!showSeries || !trimmedSeries) {
    return {
      displayTitle: trimmedTitle,
      displaySeries: "",
    };
  }

  const normalizedTitle = normalizeTitleForComparison(trimmedTitle);
  const normalizedSeries = normalizeTitleForComparison(trimmedSeries);

  if (normalizedTitle === normalizedSeries) {
    return {
      displayTitle: trimmedTitle,
      displaySeries: "",
    };
  }

  const prefixPattern = new RegExp(`^${escapeRegExp(trimmedSeries)}(?:\\s*[:\\-–—]\\s*|\\s+)`, "i");
  const strippedTitle = trimmedTitle.replace(prefixPattern, "").trim();

  if (strippedTitle && strippedTitle.length < trimmedTitle.length) {
    return {
      displayTitle: strippedTitle,
      displaySeries: trimmedSeries,
    };
  }

  return {
    displayTitle: trimmedTitle,
    displaySeries: trimmedSeries,
  };
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

function getDefaultBoardSettings(boardTitle: string): BoardSettings {
  const boardKind = getBoardKind(boardTitle);

  return {
    ...DEFAULT_BOARD_SETTINGS,
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
  const [isCardDragging, setIsCardDragging] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(authEnabled);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [isBoardsMenuOpen, setIsBoardsMenuOpen] = useState(false);
  const [isCustomizationMenuOpen, setIsCustomizationMenuOpen] = useState(false);
  const [isMaintenanceMenuOpen, setIsMaintenanceMenuOpen] = useState(false);
  const [isTransferMenuOpen, setIsTransferMenuOpen] = useState(false);
  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [newBoardSettings, setNewBoardSettings] = useState<BoardSettings>(
    getDefaultBoardSettings("New Board"),
  );
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
  const [pairwiseQuizState, setPairwiseQuizState] = useState<PairwiseQuizState | null>(null);
  const [pairwiseQuizReview, setPairwiseQuizReview] = useState<PairwiseQuizReview | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistRequestId, setPersistRequestId] = useState(0);
  const [isAddFieldSettingsOpen, setIsAddFieldSettingsOpen] = useState(false);
  const [isEditFieldSettingsOpen, setIsEditFieldSettingsOpen] = useState(false);
  const [isBoardFieldSettingsModalOpen, setIsBoardFieldSettingsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const columnMenuBoundaryRef = useRef<HTMLDivElement | null>(null);
  const previousSnapshotRef = useRef<BoardSnapshot | null>(null);
  const skipNextHistoryRef = useRef(true);
  const latestColumnsRef = useRef(columns);
  const latestCardsByColumnRef = useRef(cardsByColumn);
  const latestBoardsRef = useRef(boards);
  const latestActiveBoardIdRef = useRef(activeBoardId);
  const pendingPersistOptionsRef = useRef<PersistBoardStateOptions | null>(null);
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
  ).sort((a, b) => a.localeCompare(b));
  const activeBoard =
    boards.find((board) => board.id === activeBoardId) ?? normalizeSavedBoard(defaultBoard);
  const activeBoardTitle =
    activeBoard.title ?? "Rankr";
  const activeBoardSettings = activeBoard.settings ?? DEFAULT_BOARD_SETTINGS;
  const boardVocabulary = getBoardVocabulary(activeBoardTitle);
  const activeBoardKind = getBoardKind(activeBoardTitle);
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
  const shouldShowNotesField = Boolean(notesFieldDefinition?.visible);
  const visibleCustomFieldDefinitions = activeBoardFieldDefinitions.filter(
    (field) => field.visible && !field.builtInKey,
  );
  const seriesFieldLabel = seriesFieldDefinition?.label ?? "Series";
  const releaseYearFieldLabel = releaseYearFieldDefinition?.label ?? "Release Year";
  const imageFieldLabel = imageFieldDefinition?.label ?? "Artwork URL";
  const notesFieldLabel = notesFieldDefinition?.label ?? "Notes";

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

    try {
      const { error } = await supabase.from("board_states").upsert({
        owner_id: currentUser.id,
        columns: payload,
        cards_by_column: nextCardsByColumn,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error(error);
        return;
      }

      setLastSavedAt(new Date().toISOString());
      writeLocalBackupSnapshot(snapshot);
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

  useEffect(() => {
    try {
      const storedBackups = window.localStorage.getItem(LOCAL_BACKUP_STORAGE_KEY);
      recentBackupSnapshotsRef.current = storedBackups ? JSON.parse(storedBackups) as BoardBackupSnapshot[] : [];
    } catch {
      recentBackupSnapshotsRef.current = [];
    }

    if (authEnabled) {
      try {
        const storedValue = window.localStorage.getItem(LOCAL_STORAGE_KEY);

        if (storedValue) {
          const parsedState = JSON.parse(storedValue) as {
            activeBoardId?: string;
          };

          if (parsedState.activeBoardId) {
            setActiveBoardId(parsedState.activeBoardId);
          }
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
        const nextActiveBoardId =
          parsedState.activeBoardId && nextBoards.some((board) => board.id === parsedState.activeBoardId)
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
    }
  }, [activeBoardId, authEnabled, boards, cardsByColumn, columns, currentUser, hasLoadedPersistedState, isAuthLoading, writeLocalBackupSnapshot]);

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
  }, [cardsByColumn, columns]);

  useEffect(() => {
    const syncedState = syncBoardMirrorColumns(columns, cardsByColumn);

    if (syncedState !== cardsByColumn) {
      skipNextHistoryRef.current = true;
      setCardsByColumn(syncedState);
    }
  }, [cardsByColumn, columns]);

  useEffect(() => {
    latestBoardsRef.current = boards;
    latestActiveBoardIdRef.current = activeBoardId;
  }, [activeBoardId, boards]);

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
          const nextActiveBoardId =
            parsedState.activeBoardId && nextBoards.some((board) => board.id === parsedState.activeBoardId)
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
      const { data, error } = await client
        .from("board_states")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (error) {
        console.error(error);
        setHasLoadedRemoteState(true);
        return;
      }

      if (typeof data?.updated_at === "string") {
        setLastSavedAt(data.updated_at);
      }

      const localColumns = latestColumnsRef.current;
      const localCardsByColumn = latestCardsByColumnRef.current;
      const localBoards = latestBoardsRef.current;
      const localActiveBoardId = latestActiveBoardIdRef.current;
      const localBoardHasContent = !isStarterBoard(localColumns, localCardsByColumn);
      const columnsPayload =
        (data?.columns as
          | ColumnDefinition[]
          | { version?: number; boards?: SavedBoard[]; activeBoardId?: string; recentSnapshots?: BoardBackupSnapshot[] }
          | undefined) ?? null;
      const remoteBoardsPayload =
        columnsPayload &&
        !Array.isArray(columnsPayload) &&
        (columnsPayload.version === 2 || columnsPayload.version === 3) &&
        Array.isArray(columnsPayload.boards) &&
        columnsPayload.boards.length > 0
          ? columnsPayload
          : null;
      const remoteColumns = Array.isArray(columnsPayload) ? columnsPayload : null;
      const remoteCardsByColumn =
        (data?.cards_by_column as Record<string, CardEntry[]> | undefined) ?? null;
      const remoteBoardExists = Boolean(remoteColumns && remoteCardsByColumn);
      const remoteBoardIsStarter =
        remoteColumns && remoteCardsByColumn
          ? isStarterBoard(remoteColumns, remoteCardsByColumn)
          : false;

      if (remoteBoardsPayload) {
        recentBackupSnapshotsRef.current = Array.isArray(remoteBoardsPayload.recentSnapshots)
          ? trimBackupSnapshots(remoteBoardsPayload.recentSnapshots)
          : recentBackupSnapshotsRef.current;
        const remoteBoards = remoteBoardsPayload.boards ?? [];
        if (remoteBoards.length === 0) {
          setHasLoadedRemoteState(true);
          return;
        }
        const normalizedRemoteBoards = remoteBoards.map((board) => normalizeSavedBoard(board));
        const remoteActiveBoardId =
          localActiveBoardId &&
          normalizedRemoteBoards.some((board) => board.id === localActiveBoardId)
            ? localActiveBoardId
            : remoteBoardsPayload.activeBoardId &&
                normalizedRemoteBoards.some((board) => board.id === remoteBoardsPayload.activeBoardId)
              ? remoteBoardsPayload.activeBoardId
              : normalizedRemoteBoards[0].id;
        const nextActiveBoard =
          normalizedRemoteBoards.find((board) => board.id === remoteActiveBoardId) ??
          normalizedRemoteBoards[0];
        skipNextHistoryRef.current = true;
        setBoards(normalizedRemoteBoards);
        setActiveBoardId(remoteActiveBoardId);
        setColumns(nextActiveBoard.columns);
        skipNextHistoryRef.current = true;
        setCardsByColumn(nextActiveBoard.cardsByColumn);
      } else if (remoteBoardExists && remoteColumns && remoteCardsByColumn) {
        if (remoteBoardIsStarter && localBoardHasContent) {
          const { payload, snapshot } = buildPersistedColumnsPayload(localBoards, localActiveBoardId);
          await client.from("board_states").upsert({
            owner_id: user.id,
            columns: payload,
            cards_by_column: localCardsByColumn,
            updated_at: new Date().toISOString(),
          });
          writeLocalBackupSnapshot(snapshot);
        } else {
          const migratedBoard: SavedBoard = {
            ...createEmptyBoard("Rankr"),
            columns: remoteColumns,
            cardsByColumn: remoteCardsByColumn,
          };
          skipNextHistoryRef.current = true;
          setBoards([migratedBoard]);
          setActiveBoardId(migratedBoard.id);
          setColumns(migratedBoard.columns);
          skipNextHistoryRef.current = true;
          setCardsByColumn(migratedBoard.cardsByColumn);
        }
      } else {
        const { payload, snapshot } = buildPersistedColumnsPayload(localBoards, localActiveBoardId);
        await client.from("board_states").upsert({
          owner_id: user.id,
          columns: payload,
          cards_by_column: localCardsByColumn,
          updated_at: new Date().toISOString(),
        });
        writeLocalBackupSnapshot(snapshot);
      }

      setHasLoadedRemoteState(true);
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
    }, 120);

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
      (card) => card.mirroredFromEntryId === sourceCard.entryId,
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
        nextState[columnId] = cards.map((card) =>
          card.itemId === itemId ? updater(card) : card,
        );
      }

      latestCardsByColumnRef.current = nextState;
      nextStateSnapshot = nextState;
      return nextState;
    });

    if (nextStateSnapshot) {
      void persistBoardState({ cardsByColumn: nextStateSnapshot });
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

    setCardsByColumn((current) => {
      const mirrorCards = current[columnId] ?? [];
      const normalizedSources = new Map<string, CardEntry>();

      for (const column of columns) {
        if (column.id === columnId || column.mirrorsEntireBoard) {
          continue;
        }

        for (const card of current[column.id] ?? []) {
          if (card.mirroredFromEntryId) {
            continue;
          }

          const normalizedTitle = normalizeTitleForComparison(card.title);

          if (normalizedTitle && !normalizedSources.has(normalizedTitle)) {
            normalizedSources.set(normalizedTitle, card);
          }
        }
      }

      const nextMirrorCards = mirrorCards.map((card) => {
        if (card.mirroredFromEntryId) {
          return card;
        }

        const sourceCard = normalizedSources.get(normalizeTitleForComparison(card.title));

        if (!sourceCard) {
          return card;
        }

        return {
          ...sourceCard,
          entryId: card.entryId,
          mirroredFromEntryId: sourceCard.entryId,
        };
      });

      return {
        ...current,
        [columnId]: nextMirrorCards,
      };
    });

    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnMirrorMenuId(null);
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

      for (const existingMirror of existingMirrorCards) {
        const sourceId = existingMirror.mirroredFromEntryId;
        const linkedSource = sourceId ? sourceById.get(sourceId) : null;
        const matchedSource =
          linkedSource ??
          sourceByNormalizedTitle.get(normalizeTitleForComparison(existingMirror.title));

        if (matchedSource) {
          if (excludedMirrorItemIds.has(matchedSource.itemId)) {
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
            (card) => normalizeTitleForComparison(card.title) === normalizedTitle,
          )
        ) {
          continue;
        }

        syncedCards.push({
          ...sourceCard,
          entryId: makeId("mirror"),
          mirroredFromEntryId: sourceCard.entryId,
        });
      }

      const currentSerialized = JSON.stringify(existingMirrorCards);
      const nextSerialized = JSON.stringify(syncedCards);

      if (currentSerialized !== nextSerialized) {
        nextState[mirrorColumn.id] = syncedCards;
        didChange = true;
      }
    }

    return didChange ? nextState : currentCardsByColumn;
  }

  function handleDragEnd(event: DragEndEvent) {
    setIsCardDragging(false);

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
    const sourceIndex = sourceCards.findIndex((card) => card.entryId === activeId);

    if (sourceIndex < 0) {
      return;
    }

    const movedCard = sourceCards[sourceIndex];
    let destinationIndex = destinationCards.length;

    if (parsedDropTarget) {
      destinationIndex = parsedDropTarget.insertIndex;
    } else if (columns.some((column) => column.id === overId)) {
      destinationIndex = destinationCards.length;
    } else {
      const overIndex = destinationCards.findIndex((card) => card.entryId === overId);

      if (overIndex >= 0) {
        destinationIndex = overIndex;
      }
    }

    if (sourceColumnId === overColumnId) {
      const adjustedDestinationIndex =
        sourceIndex < destinationIndex ? destinationIndex - 1 : destinationIndex;

      if (adjustedDestinationIndex === sourceIndex) {
        return;
      }

      const reorderedCards = [...sourceCards];
      const [removedCard] = reorderedCards.splice(sourceIndex, 1);
      reorderedCards.splice(adjustedDestinationIndex, 0, removedCard);

      setCardsByColumn((current) => ({
        ...current,
        [sourceColumnId]: reorderedCards,
      }));
      latestCardsByColumnRef.current = {
        ...latestCardsByColumnRef.current,
        [sourceColumnId]: reorderedCards,
      };
      queuePersistBoardState({
        cardsByColumn: {
          ...latestCardsByColumnRef.current,
          [sourceColumnId]: reorderedCards,
        },
      });

      return;
    }

    const nextSourceCards = sourceCards.filter((card) => card.entryId !== activeId);
    const nextDestinationCards = [...destinationCards];

    nextDestinationCards.splice(destinationIndex, 0, movedCard);

    const nextState = reconcileMirrorForMove(
      {
        ...cardsByColumn,
        [sourceColumnId]: nextSourceCards,
        [overColumnId]: nextDestinationCards,
      },
      movedCard,
      sourceColumnId,
      overColumnId,
    );

    latestCardsByColumnRef.current = nextState;
    setCardsByColumn(nextState);
    queuePersistBoardState({ cardsByColumn: nextState });
  }

  function handleDraftSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!addCardTarget) {
      return;
    }

    const title = draft.title.trim() || `Untitled ${boardVocabulary.singular}`;
    const series = draft.series.trim();
    const imageUrl = draft.imageUrl.trim();
    const notes = draft.notes.trim();
    const releaseYear = draft.releaseYear.trim();
    const columnId = draft.columnId.trim();
    const newColumnTitle = draft.newColumnTitle.trim();
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

    const itemId = slugify(title) || makeId("item");
    const newCard: CardEntry = {
      entryId: makeId("entry"),
      itemId,
      title,
      imageUrl,
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

    nextDestinationCards.splice(destinationInsertIndex, 0, newCard);

    let nextState = {
      ...nextCardsByColumn,
      [destinationColumnId]: nextDestinationCards,
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
    const fallbackColumnId = columns.find((column) => !column.mirrorsEntireBoard)?.id ?? "";
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

    const title = editingCardDraft.title.trim() || `Untitled ${boardVocabulary.singular}`;
    const imageUrl = editingCardDraft.imageUrl.trim();
    const series = editingCardDraft.series.trim();
    const releaseYear = editingCardDraft.releaseYear.trim();
    const notes = editingCardDraft.notes.trim();
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
      series,
      releaseYear: releaseYear || undefined,
      notes: notes || undefined,
      customFieldValues: Object.fromEntries(
        Object.entries(editingCardDraft.customFields).filter(([, value]) => value.trim().length > 0),
      ),
      itemId: slugify(title) || card.itemId,
    }));

    cancelEditingCard();
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
    setColumns((current) =>
      current.map((column) =>
        column.id === columnId
          ? {
              ...column,
              mirrorsEntireBoard: !column.mirrorsEntireBoard,
            }
          : column,
      ),
    );

    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnFilterMenuId(null);
    setOpenColumnMirrorMenuId(null);
    queuePersistBoardState();
  }

  function toggleExcludeColumnFromBoardMirrors(columnId: string) {
    setColumns((current) =>
      current.map((column) =>
        column.id === columnId
          ? {
              ...column,
              excludeFromBoardMirrors: !column.excludeFromBoardMirrors,
            }
          : column,
      ),
    );

    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnFilterMenuId(null);
    setOpenColumnMirrorMenuId(null);
    queuePersistBoardState();
  }

  function moveColumnToTarget(sourceColumnId: string, targetColumnId: string) {
    if (sourceColumnId === targetColumnId) {
      return;
    }

    setColumns((current) => {
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
    queuePersistBoardState();
  }

  function addColumn() {
    const nextIndex = columns.length + 1;
    const newColumn = createColumnDefinition(nextIndex);

    setColumns((current) => [...current, newColumn]);
    setCardsByColumn((current) => ({
      ...current,
      [newColumn.id]: [],
    }));
    setEditingColumnId(newColumn.id);
    setEditingColumnDraft({
      title: newColumn.title,
    });
    queuePersistBoardState();
  }

  function deleteColumn(columnId: string) {
    const column = columns.find((item) => item.id === columnId);

    if (!column) {
      return;
    }

    const confirmed = window.confirm(`Delete the "${column.title}" column and its cards?`);

    if (!confirmed) {
      return;
    }

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
      itemId: slugify(editingDuplicateAction.title) || card.itemId,
    }));
    cancelEditingCard();
  }

  function sortColumnCards(
    columnId: string,
    mode: "title-asc" | "title-desc",
  ) {
    setCardsByColumn((current) => {
      const cards = current[columnId] ?? [];
      const nextCards = [...cards];

      if (mode === "title-asc") {
        nextCards.sort((a, b) => a.title.localeCompare(b.title));
      } else {
        nextCards.sort((a, b) => b.title.localeCompare(a.title));
      }

      return {
        ...current,
        [columnId]: nextCards,
      };
    });

    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnFilterMenuId(null);
    setOpenColumnMirrorMenuId(null);
    queuePersistBoardState();
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

  function openPairwiseQuiz(columnId: string) {
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

    setPairwiseQuizReview(null);
    setPairwiseQuizState(nextState);
    setOpenColumnMenuId(null);
    setOpenColumnSortMenuId(null);
    setOpenColumnFilterMenuId(null);
    setOpenColumnMirrorMenuId(null);
    setOpenColumnMaintenanceMenuId(null);
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

    setCardsByColumn((current) => ({
      ...current,
      [pairwiseQuizReview.columnId]: pairwiseQuizReview.rankedCards,
    }));
    setPairwiseQuizReview(null);
    setPairwiseQuizState(null);
    queuePersistBoardState();
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
    setBoards((current) =>
      current.map((board) =>
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
      ),
    );
    queuePersistBoardState();
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
    setNewBoardSettings(getDefaultBoardSettings("New Board"));
    setIsCreateBoardModalOpen(true);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
  }, []);

  function createBoardFromModal() {
    const title = newBoardTitle.trim() || `Board ${boards.length + 1}`;
    const nextBoard: SavedBoard = {
      ...createEmptyBoard(title),
      settings: {
        ...getDefaultBoardSettings(title),
        ...newBoardSettings,
        fieldDefinitions: normalizeFieldDefinitions(newBoardSettings.fieldDefinitions, title, newBoardSettings),
      },
    };

    skipNextHistoryRef.current = true;
    setBoards((current) => [...current, nextBoard]);
    setActiveBoardId(nextBoard.id);
    setColumns(nextBoard.columns);
    setCardsByColumn(nextBoard.cardsByColumn);
    setHistory([]);
    setNewBoardTitle("");
    setNewBoardSettings(getDefaultBoardSettings("New Board"));
    setIsCreateBoardModalOpen(false);
    setIsBoardsMenuOpen(false);
    setIsActionsMenuOpen(false);
    setIsMobileActionsOpen(false);
    queuePersistBoardState();
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

  function openDuplicateCleanupModal(scopeColumnId?: string) {
    const suggestions: DuplicateCleanupSuggestion[] = [];
    const scopedColumns = scopeColumnId
      ? columns.filter((column) => column.id === scopeColumnId)
      : columns;

    for (const column of scopedColumns) {
      const grouped = new Map<string, CardEntry[]>();

      for (const card of cardsByColumn[column.id] ?? []) {
        const normalizedTitle = normalizeTitleForComparison(card.title);

        if (!normalizedTitle) {
          continue;
        }

        const current = grouped.get(normalizedTitle) ?? [];
        current.push(card);
        grouped.set(normalizedTitle, current);
      }

      for (const [normalizedTitle, matchingCards] of grouped.entries()) {
        if (matchingCards.length < 2) {
          continue;
        }

        const sorted = [...matchingCards].sort((left, right) => getCardContentScore(right) - getCardContentScore(left));
        const keepCard = sorted[0];

        for (const removeCard of sorted.slice(1)) {
          suggestions.push({
            id: `${column.id}-${removeCard.entryId}`,
            columnId: column.id,
            columnTitle: column.title,
            normalizedTitle,
            keepCard,
            removeCard,
          });
        }
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
    const scopedColumns = scopeColumnId
      ? columns.filter((column) => column.id === scopeColumnId)
      : columns;

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
      (cardsByColumn[column.id] ?? []).map((card) => ({
        columnId: column.id,
        columnTitle: column.title,
        card,
      })),
    );

    const suggestions = await Promise.all(
      cardsToInspect.map(async ({ columnId, columnTitle, card }) => {
        const wikipediaMetadata = await fetchBestWikipediaMetadata(card.title, existingSeries);
        const wikipediaExtractSeries = getSuggestedSeriesFromWikipediaExtract(
          wikipediaMetadata?.extract ?? "",
          existingSeries,
        );
        const wikipediaSeries = wikipediaMetadata?.title
          ? getSuggestedSeriesFromTitle(wikipediaMetadata.title, existingSeries)
          : null;
        const currentSeries = card.series.trim();
        const currentReleaseYear = card.releaseYear?.trim() ?? "";
        const suggestedSeries =
          wikipediaExtractSeries ||
          wikipediaSeries ||
          getSuggestedSeriesFromTitle(card.title, existingSeries) ||
          "";
        const suggestedReleaseYear =
          getSuggestedReleaseYearFromWikipediaMetadata(wikipediaMetadata, card.title) ||
          getSuggestedReleaseYearFromTitle(card.title);

        const shouldSuggestSeries =
          Boolean(suggestedSeries) && suggestedSeries.trim() !== currentSeries;
        const shouldSuggestReleaseYear =
          Boolean(suggestedReleaseYear) && suggestedReleaseYear.trim() !== currentReleaseYear;

        if (!shouldSuggestSeries && !shouldSuggestReleaseYear) {
          return null;
        }

        return {
          id: `${columnId}-${card.entryId}`,
          columnId,
          columnTitle,
          entryId: card.entryId,
          itemId: card.itemId,
          title: card.title,
          proposedSeries: shouldSuggestSeries ? suggestedSeries : currentSeries,
          proposedReleaseYear: shouldSuggestReleaseYear ? suggestedReleaseYear : currentReleaseYear,
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
    const scopedColumns = scopeColumnId
      ? columns.filter((column) => column.id === scopeColumnId)
      : columns;

    return scopedColumns.flatMap((column) =>
      (cardsByColumn[column.id] ?? []).map((card) => {
        const currentSeries = card.series.trim();
        const currentReleaseYear = card.releaseYear?.trim() ?? "";
        const heuristicSeries = getSuggestedSeriesFromTitle(card.title, existingSeries) ?? "";
        const heuristicReleaseYear = getSuggestedReleaseYearFromTitle(card.title);

        return {
          id: `${column.id}-${card.entryId}`,
          columnId: column.id,
          columnTitle: column.title,
          entryId: card.entryId,
          itemId: card.itemId,
          title: card.title,
          proposedSeries: heuristicSeries || currentSeries,
          proposedReleaseYear: heuristicReleaseYear || currentReleaseYear,
        };
      }),
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

  function updateSeriesScrapeReleaseYear(suggestionId: string, proposedReleaseYear: string) {
    setSeriesScrapeSuggestions((current) =>
      current.map((suggestion) =>
        suggestion.id === suggestionId
          ? {
              ...suggestion,
              proposedReleaseYear,
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
          releaseYear: suggestion.proposedReleaseYear.trim(),
        },
      ]),
    );

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
            releaseYear: updatedValues.releaseYear || card.releaseYear,
          };
        });
      }

      return nextState;
    });

    setIsSeriesScrapeModalOpen(false);
    setSeriesScrapeSuggestions([]);
    setSeriesScrapeScopeColumnId(undefined);
    queuePersistBoardState();
  }

  async function handleImportTrelloBoard(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const confirmed = window.confirm(
      "Importing a Trello board will replace the current board in this browser. Continue?",
    );

    if (!confirmed) {
      event.target.value = "";
      return;
    }

    try {
      const fileText = await file.text();
      const importedBoard = parseTrelloBoardExport(fileText);
      setColumns(importedBoard.columns);
      setCardsByColumn(importedBoard.cardsByColumn);
      setSearchTerm("");
      setSeriesFilter("");
      setOpenColumnMenuId(null);
      cancelEditingCard();
      cancelEditingColumn();
      setIsImportModalOpen(false);
      queuePersistBoardState();
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
        "min-h-screen transition-colors",
        isDarkMode
          ? "bg-[radial-gradient(circle_at_top,#1f2937_0%,#111827_35%,#020617_100%)] text-slate-100"
          : "bg-[radial-gradient(circle_at_top,#fff4d6_0%,#ffd9c7_20%,#ffefe6_42%,#f5f7ff_68%,#eff7ff_100%)] text-slate-950",
      )}
    >
      <main className="mx-auto flex min-h-screen w-full max-w-[1700px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <datalist id="series-suggestions">
          {allSeries.map((series) => (
            <option key={series} value={series} />
          ))}
        </datalist>

        <section className="grid gap-4">
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

                <select
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950/60 text-white focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                  )}
                  value={seriesFilter}
                  onChange={(event) => setSeriesFilter(event.target.value)}
                >
                  <option value="">All series</option>
                  {allSeries.map((series) => (
                    <option key={series} value={series}>
                      {series}
                    </option>
                  ))}
                </select>
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
                          icon={<Trash2 className="h-4 w-4" />}
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
                              Scrape Series
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
                        {isPersisting ? "Saving..." : `Last saved ${formatLastSavedAt(lastSavedAt)}`}
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

                    <select
                      className={clsx(
                        "rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950/60 text-white focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                      )}
                      value={seriesFilter}
                      onChange={(event) => setSeriesFilter(event.target.value)}
                    >
                      <option value="">All series</option>
                      {allSeries.map((series) => (
                        <option key={series} value={series}>
                          {series}
                        </option>
                      ))}
                    </select>

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

                    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[auto_auto_1fr]">
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
                                  <button className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={toggleCollapseCardsSetting} type="button">
                                    <span>Collapse Cards</span>
                                    <span className="text-xs opacity-70">{activeBoardSettings.collapseCards ? "On" : "Off"}</span>
                                  </button>
                                  <button className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => updateActiveBoardSettings({ showTierHighlights: !activeBoardSettings.showTierHighlights })} type="button">
                                    <span>Tier Highlights</span>
                                    <span className="text-xs opacity-70">{activeBoardSettings.showTierHighlights ? "On" : "Off"}</span>
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
                                icon={<Trash2 className="h-4 w-4" />}
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
                                    Scrape Series
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
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <section
            ref={columnMenuBoundaryRef}
            className={clsx(
              "relative z-0 overflow-x-hidden overflow-y-visible rounded-[32px] border p-4 shadow-[0_24px_60px_rgba(19,27,68,0.12)] backdrop-blur",
              isDarkMode
                ? "border-white/10 bg-white/5"
                : "border-white/70 bg-white/60",
            )}
          >
            <div className="mb-4">
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
                <div className="group flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative shrink-0" data-board-switcher-root="true">
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
                        <BoardKindIcon boardTitle={activeBoardTitle} className="h-5 w-5" />
                      </button>
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
                                  <BoardKindIcon boardTitle={board.title} className="h-4 w-4 shrink-0" />
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
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <h1 className={clsx("min-w-0 truncate text-2xl font-black sm:text-3xl", isDarkMode ? "text-white" : "text-slate-950")}>
                      {activeBoardTitle}
                    </h1>
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
                  </div>
                  <div className="hidden items-center gap-2 xl:flex">
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
                    <select
                      className={clsx(
                        "w-[190px] rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950/60 text-white focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                      )}
                      value={seriesFilter}
                      onChange={(event) => setSeriesFilter(event.target.value)}
                    >
                      <option value="">All series</option>
                      {allSeries.map((series) => (
                        <option key={series} value={series}>
                          {series}
                        </option>
                      ))}
                    </select>
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
                                <button className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={toggleCollapseCardsSetting} type="button">
                                  <span>Collapse Cards</span>
                                  <span className="text-xs opacity-70">{activeBoardSettings.collapseCards ? "On" : "Off"}</span>
                                </button>
                                <button className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => updateActiveBoardSettings({ showTierHighlights: !activeBoardSettings.showTierHighlights })} type="button">
                                  <span>Tier Highlights</span>
                                  <span className="text-xs opacity-70">{activeBoardSettings.showTierHighlights ? "On" : "Off"}</span>
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
                              icon={<Trash2 className="h-4 w-4" />}
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
                                  Scrape Series
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
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={() => setIsCardDragging(true)}
              onDragCancel={() => setIsCardDragging(false)}
              onDragEnd={handleDragEnd}
            >
              <div className="relative z-10 flex items-start snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-visible pb-3 sm:snap-none">
                {columns.map((column) => {
                  const visibleCards = filterCards(
                    cardsByColumn[column.id] ?? [],
                    searchTerm,
                    seriesFilter,
                  );

                  return (
                    <BoardColumn
                      key={column.id}
                      column={column}
                      fullCards={cardsByColumn[column.id] ?? []}
                      addLabel={boardVocabulary.singular}
                      collapseCards={activeBoardSettings.collapseCards}
                      showSeriesOnCards={Boolean(seriesFieldDefinition?.showOnCardFront) && !activeBoardSettings.collapseCards}
                      showTierHighlights={activeBoardSettings.showTierHighlights}
                      frontFieldDefinitions={activeBoardFieldDefinitions}
                      disableAddAffordances={isCardDragging || Boolean(column.mirrorsEntireBoard)}
                      isDarkMode={isDarkMode}
                      cards={visibleCards}
                      activeTierFilter={columnTierFilters[column.id] ?? "all"}
                      filtering={filtering}
                      isEditingColumn={editingColumnId === column.id}
                      editingColumnDraft={editingColumnDraft}
                      onColumnDraftChange={setEditingColumnDraft}
                      onEditColumn={() => startEditingColumn(column)}
                      onCancelColumnEdit={cancelEditingColumn}
                      onSaveColumnEdit={() => saveEditingColumn(column.id)}
                      onDeleteCard={handleDeleteCard}
                      onEditCard={startEditingCard}
                      onAddCard={openAddGameModal}
                      onOpenPairwiseQuiz={() => openPairwiseQuiz(column.id)}
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
                      onOpenTitleTidy={() => openTitleTidyModal(column.id)}
                      onOpenSeriesScrape={() => {
                        void openSeriesScrapeModal(column.id);
                      }}
                      onDeleteColumn={deleteColumn}
                      onToggleBoardMirrorColumn={toggleBoardMirrorColumn}
                      onToggleExcludeFromBoardMirrors={toggleExcludeColumnFromBoardMirrors}
                      onLinkMirrorMatches={linkMatchingMirrorCards}
                      onSetTierFilter={setColumnTierFilter}
                      onColumnDragStart={setDraggingColumnId}
                      onColumnDrop={moveColumnToTarget}
                      draggingColumnId={draggingColumnId}
                    />
                  );
                })}
                <AddColumnButton isDarkMode={isDarkMode} onClick={addColumn} />
              </div>
            </DndContext>
          </section>
        </section>

        {editingCardId && editingCardDraft ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={cancelEditingCard}
          >
            <div
              className={clsx(
                "relative w-full max-w-2xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p
                    className={clsx(
                      "text-sm font-semibold uppercase tracking-[0.24em]",
                      isDarkMode ? "text-slate-400" : "text-slate-500",
                    )}
                  >
                    Edit Game
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Update card details
                  </h2>
                  {Object.values(cardsByColumn)
                    .flat()
                    .find((card) => card.entryId === editingCardId)?.mirroredFromEntryId ? (
                    <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                      This entry is a mirrored copy linked to another column.
                    </p>
                  ) : null}
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={cancelEditingCard}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form className="mt-6" onSubmit={handleEditingCardSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Title</span>
                  <input
                    name="title"
                    className={clsx(
                      "rounded-2xl border px-4 py-3 outline-none transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                        : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                    )}
                    value={editingCardDraft.title}
                    onChange={(event) =>
                      {
                        setEditingDuplicateAction(null);
                        setEditingCardDraft((current) =>
                          current ? { ...current, title: event.target.value } : current,
                        );
                      }
                    }
                  />
                </label>

                {shouldShowSeriesField ? (
                  <label className="grid gap-2">
                    <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{seriesFieldLabel}</span>
                    <input
                      name="series"
                      list="series-suggestions"
                      className={clsx(
                        "rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                      )}
                      value={editingCardDraft.series}
                      onChange={(event) =>
                        {
                          setEditingDuplicateAction(null);
                          setEditingCardDraft((current) =>
                            current ? { ...current, series: event.target.value } : current,
                          );
                        }
                      }
                    />
                  </label>
                ) : null}

                {shouldShowReleaseYearField ? (
                  <label className="grid gap-2">
                    <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{releaseYearFieldLabel}</span>
                    <input
                      name="releaseYear"
                      inputMode="numeric"
                      className={clsx(
                        "rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                      )}
                      placeholder="2025"
                      value={editingCardDraft.releaseYear}
                      onChange={(event) =>
                        setEditingCardDraft((current) =>
                          current
                            ? {
                                ...current,
                                releaseYear: event.target.value.replace(/[^\d]/g, "").slice(0, 4),
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                ) : null}
              </div>

              {shouldShowImageField ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <label className="grid gap-2">
                    <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>
                      {imageFieldLabel}
                    </span>
                    <input
                      name="imageUrl"
                      className={clsx(
                        "rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                      )}
                      value={editingCardDraft.imageUrl}
                      onChange={(event) =>
                        {
                          setEditingDuplicateAction(null);
                          setEditingCardDraft((current) =>
                            current ? { ...current, imageUrl: event.target.value } : current,
                          );
                        }
                      }
                    />
                  </label>

                  <button
                    className={clsx(
                      "inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition sm:h-[50px]",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40 hover:bg-slate-900"
                        : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-950 hover:bg-white",
                    )}
                    onClick={() => autofillEditingCardImage("image")}
                    type="button"
                    title="Search Google Images in a new tab"
                  >
                    <ImagePlus className="h-4 w-4" />
                    Image
                  </button>
                  <button
                    className={clsx(
                      "inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition sm:h-[50px]",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40 hover:bg-slate-900"
                        : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-950 hover:bg-white",
                    )}
                    onClick={() => autofillEditingCardImage("gif")}
                    type="button"
                    title="Search Google Images for animated GIFs in a new tab"
                  >
                    <Clapperboard className="h-4 w-4" />
                    GIF
                  </button>
                </div>
              ) : null}

              {shouldShowNotesField ? (
                <label className="mt-4 grid gap-2">
                  <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{notesFieldLabel}</span>
                  <textarea
                    name="notes"
                    className={clsx(
                      "min-h-32 rounded-2xl border px-4 py-3 outline-none transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                        : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                    )}
                    value={editingCardDraft.notes}
                    onChange={(event) =>
                      setEditingCardDraft((current) =>
                        current ? { ...current, notes: event.target.value } : current,
                      )
                    }
                  />
                </label>
              ) : null}

              {visibleCustomFieldDefinitions.map((field) => (
                <label key={field.id} className="mt-4 grid gap-2">
                  <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{field.label}</span>
                  {field.type === "long_text" ? (
                    <textarea
                      className={clsx(
                        "min-h-28 rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                      )}
                      value={editingCardDraft.customFields[field.id] ?? ""}
                      onChange={(event) =>
                        setEditingCardDraft((current) =>
                          current
                            ? {
                                ...current,
                                customFields: {
                                  ...current.customFields,
                                  [field.id]: event.target.value,
                                },
                              }
                            : current,
                        )
                      }
                    />
                  ) : field.type === "select" ? (
                    <select
                      className={clsx(
                        "rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-white focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                      )}
                      value={editingCardDraft.customFields[field.id] ?? ""}
                      onChange={(event) =>
                        setEditingCardDraft((current) =>
                          current
                            ? {
                                ...current,
                                customFields: {
                                  ...current.customFields,
                                  [field.id]: event.target.value,
                                },
                              }
                            : current,
                        )
                      }
                    >
                      <option value="">Select one</option>
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={clsx(
                        "rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                      )}
                      inputMode={field.type === "date" ? "numeric" : undefined}
                      placeholder={field.type === "date" ? (field.dateFormat ?? DEFAULT_DATE_FIELD_FORMAT) : undefined}
                      type="text"
                      value={editingCardDraft.customFields[field.id] ?? ""}
                      onChange={(event) =>
                        setEditingCardDraft((current) =>
                          current
                            ? {
                                ...current,
                                customFields: {
                                  ...current.customFields,
                                  [field.id]:
                                    field.type === "date"
                                      ? normalizeDateFieldInput(
                                          event.target.value,
                                          field.dateFormat ?? DEFAULT_DATE_FIELD_FORMAT,
                                        )
                                      : event.target.value,
                                },
                              }
                            : current,
                        )
                      }
                    />
                  )}
                </label>
              ))}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  type="submit"
                >
                  <Save className="h-4 w-4" />
                  Save Changes
                </button>
                {editingDuplicateAction ? (
                  <div
                    className={clsx(
                      "flex min-w-full flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm",
                      isDarkMode
                        ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                        : "border-amber-300 bg-amber-50 text-amber-900",
                    )}
                    >
                      <span className="mr-2">
                        &quot;{editingDuplicateAction.match.card.title}&quot; already exists in
                        &nbsp;&quot;{editingDuplicateAction.match.column.title}&quot;.
                      </span>
                    <button
                      className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-950"
                      onClick={() => resolveEditingDuplicate("discard")}
                      type="button"
                    >
                      Discard
                    </button>
                    <button
                      className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-950"
                      onClick={() => resolveEditingDuplicate("update")}
                      type="button"
                    >
                      Update Original
                    </button>
                    <button
                      className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-950"
                      onClick={() => resolveEditingDuplicate("duplicate")}
                      type="button"
                    >
                      Allow Duplicate
                    </button>
                  </div>
                ) : null}
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={cancelEditingCard}
                  type="button"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
                <div className="relative">
                  <button
                    className={clsx(
                      "inline-flex h-[50px] w-[50px] items-center justify-center rounded-full border transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                    )}
                    onClick={() => setIsEditFieldSettingsOpen((current) => !current)}
                    type="button"
                    aria-label="Customize card fields"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                  {isEditFieldSettingsOpen ? (
                    <div className="absolute bottom-14 right-0 z-10">
                      <FieldSettingsPanel
                        isDarkMode={isDarkMode}
                        fieldDefinitions={activeBoardFieldDefinitions}
                        onToggleField={toggleActiveBoardFieldVisibility}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              </form>
            </div>
          </div>
        ) : null}

        {addCardTarget ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={closeAddGameModal}
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
                  <h2 className={clsx("text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    {`Add ${boardVocabulary.singular}`}
                  </h2>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={closeAddGameModal}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form className="mt-6 grid gap-4" onSubmit={handleDraftSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Title</span>
                    <input
                      name="title"
                      className={clsx(
                        "rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                      )}
                      placeholder={boardVocabulary.titleExamples}
                      value={draft.title}
                      onChange={(event) => {
                        setDraftDuplicateAction(null);
                        setDraft((current) => ({ ...current, title: event.target.value }));
                      }}
                      />
                    </label>

                  {shouldShowSeriesField ? (
                    <label className="grid gap-2">
                      <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{seriesFieldLabel}</span>
                      <input
                        name="series"
                        list="series-suggestions"
                        className={clsx(
                          "rounded-2xl border px-4 py-3 outline-none transition",
                          isDarkMode
                            ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                            : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                        )}
                        placeholder={boardVocabulary.seriesExamples}
                        value={draft.series}
                        onChange={(event) => {
                          setDraftDuplicateAction(null);
                          setDraft((current) => ({ ...current, series: event.target.value }));
                        }}
                      />
                  </label>
                ) : null}

                {shouldShowReleaseYearField ? (
                  <label className="grid gap-2">
                    <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{releaseYearFieldLabel}</span>
                    <input
                      name="releaseYear"
                      inputMode="numeric"
                      className={clsx(
                        "rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                      )}
                      placeholder="2025"
                      value={draft.releaseYear}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          releaseYear: event.target.value.replace(/[^\d]/g, "").slice(0, 4),
                        }))
                      }
                    />
                  </label>
                ) : null}
                </div>

                {shouldShowImageField ? (
                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
                    <label className="grid gap-2">
                      <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>
                        {imageFieldLabel}
                      </span>
                      <div className="relative">
                        <ImagePlus
                          className={clsx(
                            "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2",
                            isDarkMode ? "text-slate-500" : "text-slate-400",
                          )}
                        />
                        <input
                          name="imageUrl"
                          className={clsx(
                            "w-full rounded-2xl border py-3 pl-11 pr-4 outline-none transition",
                            isDarkMode
                              ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                              : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                          )}
                          placeholder="Enter the URL of the image or GIF, or upload one from your device."
                          value={draft.imageUrl}
                          onChange={(event) => {
                            setDraftDuplicateAction(null);
                            setDraft((current) => ({
                              ...current,
                              imageUrl: event.target.value,
                            }));
                          }}
                        />
                      </div>
                    </label>

                    <button
                      className={clsx(
                        "inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition sm:h-[50px]",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40 hover:bg-slate-900"
                          : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-950 hover:bg-white",
                      )}
                      onClick={() => handleAutofillDraftImage("image")}
                      type="button"
                      title="Search Google Images in a new tab"
                    >
                      <ImagePlus className="h-4 w-4" />
                      Image
                    </button>
                    <button
                      className={clsx(
                        "inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition sm:h-[50px]",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40 hover:bg-slate-900"
                          : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-950 hover:bg-white",
                      )}
                      onClick={() => handleAutofillDraftImage("gif")}
                      type="button"
                      title="Search Google Images for animated GIFs in a new tab"
                    >
                      <Clapperboard className="h-4 w-4" />
                      GIF
                    </button>
                  </div>
                ) : null}

                {shouldShowNotesField ? (
                  <label className="grid gap-2">
                    <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{notesFieldLabel}</span>
                    <textarea
                      name="notes"
                      className={clsx(
                        "min-h-28 rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                      )}
                      value={draft.notes}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </label>
                ) : null}

                {visibleCustomFieldDefinitions.map((field) => (
                  <label key={field.id} className="grid gap-2">
                    <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{field.label}</span>
                    {field.type === "long_text" ? (
                      <textarea
                        className={clsx(
                          "min-h-28 rounded-2xl border px-4 py-3 outline-none transition",
                          isDarkMode
                            ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                            : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                        )}
                        value={draft.customFields[field.id] ?? ""}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            customFields: {
                              ...current.customFields,
                              [field.id]: event.target.value,
                            },
                          }))
                        }
                      />
                    ) : field.type === "select" ? (
                      <select
                        className={clsx(
                          "rounded-2xl border px-4 py-3 outline-none transition",
                          isDarkMode
                            ? "border-white/10 bg-slate-950 text-white focus:border-white/40"
                            : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                        )}
                        value={draft.customFields[field.id] ?? ""}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            customFields: {
                              ...current.customFields,
                              [field.id]: event.target.value,
                            },
                          }))
                        }
                      >
                        <option value="">Select one</option>
                        {(field.options ?? []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={clsx(
                          "rounded-2xl border px-4 py-3 outline-none transition",
                          isDarkMode
                            ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                            : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                        )}
                        inputMode={field.type === "date" ? "numeric" : undefined}
                        placeholder={field.type === "date" ? (field.dateFormat ?? DEFAULT_DATE_FIELD_FORMAT) : undefined}
                        type="text"
                        value={draft.customFields[field.id] ?? ""}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            customFields: {
                              ...current.customFields,
                              [field.id]:
                                field.type === "date"
                                  ? normalizeDateFieldInput(
                                      event.target.value,
                                      field.dateFormat ?? DEFAULT_DATE_FIELD_FORMAT,
                                    )
                                  : event.target.value,
                            },
                          }))
                        }
                      />
                    )}
                  </label>
                ))}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>
                      Column
                    </span>
                    <select
                      name="columnId"
                      className={clsx(
                        "rounded-2xl border px-4 py-3 outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-white focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                      )}
                      value={draft.columnId || addCardTarget.columnId}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          columnId: event.target.value,
                        }))
                      }
                    >
                      {columns.filter((column) => !column.mirrorsEntireBoard).map((column) => (
                        <option key={column.id} value={column.id}>
                          {column.title}
                        </option>
                      ))}
                      <option value={NEW_COLUMN_OPTION}>Create new column</option>
                    </select>
                  </label>

                  {draft.columnId === NEW_COLUMN_OPTION ? (
                    <label className="grid gap-2">
                      <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>
                        New column title
                      </span>
                      <input
                        name="newColumnTitle"
                        className={clsx(
                          "rounded-2xl border px-4 py-3 outline-none transition",
                          isDarkMode
                            ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                            : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                        )}
                        placeholder="Favorites, 2026, Horror..."
                        value={draft.newColumnTitle}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            newColumnTitle: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    className={clsx(
                      "rounded-2xl px-4 py-3 text-sm font-semibold transition",
                      isDarkMode
                        ? "bg-white text-slate-950 hover:bg-slate-200"
                        : "bg-slate-950 text-white hover:bg-slate-800",
                    )}
                    type="submit"
                  >
                    {`Add ${boardVocabulary.singular}`}
                  </button>
                  {draftDuplicateAction ? (
                    <div
                      className={clsx(
                        "flex min-w-full flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm",
                        isDarkMode
                          ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                          : "border-amber-300 bg-amber-50 text-amber-900",
                      )}
                    >
                      <span className="mr-2">
                        &quot;{draftDuplicateAction.match.card.title}&quot; already exists in
                        &nbsp;&quot;{draftDuplicateAction.match.column.title}&quot;.
                      </span>
                      <button
                        className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-950"
                        onClick={() => resolveDraftDuplicate("discard")}
                        type="button"
                      >
                        Discard
                      </button>
                      <button
                        className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-950"
                        onClick={() => resolveDraftDuplicate("update")}
                        type="button"
                      >
                        Update Original
                      </button>
                      <button
                        className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-950"
                        onClick={() => resolveDraftDuplicate("duplicate")}
                        type="button"
                      >
                        Allow Duplicate
                      </button>
                    </div>
                  ) : null}
                  <button
                    className={clsx(
                      "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                    )}
                    onClick={closeAddGameModal}
                    type="button"
                  >
                    Cancel
                  </button>
                  <div className="relative">
                    <button
                      className={clsx(
                        "inline-flex h-[50px] w-[50px] items-center justify-center rounded-full border transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                      )}
                      onClick={() => setIsAddFieldSettingsOpen((current) => !current)}
                      type="button"
                      aria-label="Customize card fields"
                    >
                      <Settings2 className="h-4 w-4" />
                    </button>
                    {isAddFieldSettingsOpen ? (
                      <div className="absolute bottom-14 right-0 z-10">
                        <FieldSettingsPanel
                          isDarkMode={isDarkMode}
                          fieldDefinitions={activeBoardFieldDefinitions}
                          onToggleField={toggleActiveBoardFieldVisibility}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </form>
            </div>
          </div>
        ) : null}

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
                />
              </div>
            </div>
          </div>
        ) : null}

        {isImportModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setIsImportModalOpen(false)}
          >
            <div
              className={clsx(
                "w-full max-w-lg rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
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

        {pendingMirrorDelete ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => setPendingMirrorDelete(null)}
          >
            <div
              className={clsx(
                "w-full max-w-lg rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
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
                    Delete linked copy?
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    <strong>{pendingMirrorDelete.title}</strong> is linked to another card. Choose whether to remove both copies or just the clone in <strong>{pendingMirrorDelete.columnTitle}</strong>.
                  </p>
                </div>
                <button
                  className={clsx(
                    "rounded-full p-2 transition",
                    isDarkMode
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => setPendingMirrorDelete(null)}
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
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
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
                  Delete This Copy
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => setPendingMirrorDelete(null)}
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

        {isCreateBoardModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => {
              setIsCreateBoardModalOpen(false);
              setNewBoardTitle("");
              setNewBoardSettings(getDefaultBoardSettings("New Board"));
            }}
          >
            <div
              className={clsx(
                "w-full max-w-lg rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Board Setup
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    What are you ranking?
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    Give the board a title and choose which fields should appear when adding new cards.
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
                    setIsCreateBoardModalOpen(false);
                    setNewBoardTitle("");
                    setNewBoardSettings(getDefaultBoardSettings("New Board"));
                  }}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <label className="mt-6 grid gap-2">
                <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>
                  Board title
                </span>
                <input
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                  )}
                  placeholder="Favorites, Waifus, Horror Games..."
                  value={newBoardTitle}
                  onChange={(event) => {
                    const nextTitle = event.target.value;
                    const nextDefaults = getDefaultBoardSettings(nextTitle || "New Board");
                    setNewBoardTitle(nextTitle);
                    setNewBoardSettings((current) => ({
                      ...current,
                      fieldDefinitions: normalizeFieldDefinitions(
                        current.fieldDefinitions,
                        nextTitle || "New Board",
                        nextDefaults,
                      ).map((field) =>
                        field.builtInKey === "series"
                          ? {
                              ...field,
                              label: getDefaultFieldDefinitions(nextTitle || "New Board").find(
                                (defaultField) => defaultField.builtInKey === "series",
                              )?.label ?? field.label,
                            }
                          : field,
                      ),
                    }));
                  }}
                />
              </label>

              <div className="mt-6">
                <FieldDefinitionManager
                  isDarkMode={isDarkMode}
                  fieldDefinitions={normalizeFieldDefinitions(newBoardSettings.fieldDefinitions, newBoardTitle || "New Board", newBoardSettings)}
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
                />
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  onClick={createBoardFromModal}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  Create Board
                </button>
                <button
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => {
                    setIsCreateBoardModalOpen(false);
                    setNewBoardTitle("");
                    setNewBoardSettings(getDefaultBoardSettings("New Board"));
                  }}
                  type="button"
                >
                  Cancel
                </button>
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
                    These are duplicate titles found within the same column. The suggested removal is the entry with less content.
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
                            Keep <strong>{suggestion.keepCard.title}</strong>, remove <strong>{suggestion.removeCard.title}</strong>.
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
                    Scrape series
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    Review proposed series and release year values for cards that look incomplete or mismatched.
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
                    Looking up likely series and release years...
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
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{suggestion.columnTitle}</p>
                          <p className={clsx("mt-1 text-sm", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                            {suggestion.title}
                          </p>
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
                      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                        <div
                          className={clsx(
                            "rounded-2xl border px-4 py-3 text-sm",
                            isDarkMode ? "border-white/10 bg-slate-900/70" : "border-slate-200 bg-white",
                          )}
                        >
                          {suggestion.title}
                        </div>
                        <div className="text-center text-sm font-semibold opacity-60">series</div>
                        <input
                          className={clsx(
                            "rounded-2xl border px-4 py-3 text-sm outline-none transition",
                            isDarkMode
                              ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                              : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                          )}
                          value={suggestion.proposedSeries}
                          onChange={(event) => updateSeriesScrapeSuggestion(suggestion.id, event.target.value)}
                        />
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_180px] sm:items-center">
                        <div
                          className={clsx(
                            "rounded-2xl border px-4 py-3 text-sm",
                            isDarkMode ? "border-white/10 bg-slate-900/70" : "border-slate-200 bg-white",
                          )}
                        >
                          {suggestion.title}
                        </div>
                        <div className="text-center text-sm font-semibold opacity-60">year</div>
                        <input
                          inputMode="numeric"
                          className={clsx(
                            "rounded-2xl border px-4 py-3 text-sm outline-none transition",
                            isDarkMode
                              ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                              : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                          )}
                          value={suggestion.proposedReleaseYear}
                          onChange={(event) => updateSeriesScrapeReleaseYear(suggestion.id, event.target.value.replace(/[^\d]/g, "").slice(0, 4))}
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
      </main>
    </div>
  );
}

function AddColumnButton({
  isDarkMode,
  onClick,
}: {
  isDarkMode: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx(
        "flex min-h-[720px] w-[92px] shrink-0 snap-start items-center justify-center rounded-[28px] border border-dashed transition sm:snap-align-none",
        isDarkMode
          ? "border-white/15 bg-white/5 text-white hover:border-white/35 hover:bg-white/10"
          : "border-slate-300/70 bg-white/50 text-slate-700 hover:border-slate-950 hover:bg-white",
      )}
      onClick={onClick}
      type="button"
      aria-label="Add column"
    >
      <span
        className={clsx(
          "flex h-12 w-12 items-center justify-center rounded-full shadow-lg",
          isDarkMode ? "bg-slate-950 text-white" : "bg-white text-slate-950",
        )}
      >
        <Plus className="h-6 w-6" />
      </span>
    </button>
  );
}

function BoardColumn({
  column,
  fullCards,
  addLabel,
  collapseCards,
  showSeriesOnCards,
  showTierHighlights,
  frontFieldDefinitions,
  disableAddAffordances,
  cards,
  activeTierFilter,
  filtering,
  isEditingColumn,
  editingColumnDraft,
  onColumnDraftChange,
  onEditColumn,
  onCancelColumnEdit,
  onSaveColumnEdit,
  onDeleteCard,
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
  onOpenTitleTidy,
  onOpenSeriesScrape,
  onDeleteColumn,
  onToggleBoardMirrorColumn,
  onToggleExcludeFromBoardMirrors,
  onLinkMirrorMatches,
  onSetTierFilter,
  onColumnDragStart,
  onColumnDrop,
  draggingColumnId,
  isDarkMode,
}: {
  column: ColumnDefinition;
  fullCards: CardEntry[];
  addLabel: string;
  collapseCards: boolean;
  showSeriesOnCards: boolean;
  showTierHighlights: boolean;
  frontFieldDefinitions: BoardFieldDefinition[];
  disableAddAffordances: boolean;
  cards: CardEntry[];
  activeTierFilter: TierFilter;
  filtering: boolean;
  isEditingColumn: boolean;
  editingColumnDraft: ColumnEditorDraft | null;
  onColumnDraftChange: React.Dispatch<
    React.SetStateAction<ColumnEditorDraft | null>
  >;
  onEditColumn: () => void;
  onCancelColumnEdit: () => void;
  onSaveColumnEdit: () => void;
  onDeleteCard: (columnId: string, entryId: string) => void;
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
  onOpenTitleTidy: () => void;
  onOpenSeriesScrape: () => void;
  onDeleteColumn: (columnId: string) => void;
  onToggleBoardMirrorColumn: (columnId: string) => void;
  onToggleExcludeFromBoardMirrors: (columnId: string) => void;
  onLinkMirrorMatches: (columnId: string) => void;
  onSetTierFilter: (columnId: string, tierFilter: TierFilter) => void;
  onColumnDragStart: React.Dispatch<React.SetStateAction<string | null>>;
  onColumnDrop: (sourceColumnId: string, targetColumnId: string) => void;
  draggingColumnId: string | null;
  isDarkMode: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });
  const isTierFiltering = activeTierFilter !== "all";
  const tierFilteredCards = cards.filter((card) => {
    const originalRank = isRankedColumn(column)
      ? fullCards.findIndex((columnCard) => columnCard.entryId === card.entryId) + 1
      : null;
    return matchesTierFilter(originalRank, activeTierFilter);
  });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "relative z-10 flex h-[min(78vh,920px)] min-h-[720px] w-[320px] shrink-0 snap-start flex-col rounded-[28px] border p-3 shadow-[0_24px_44px_rgba(15,23,42,0.18)] sm:snap-align-none",
        isDarkMode ? "bg-slate-950 text-white" : "bg-white text-slate-950",
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
                <div className="relative" data-column-menu-root="true">
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
                  {isMenuOpen ? (
                    <div
                      className={clsx(
                        "absolute right-0 top-12 z-50 flex w-56 flex-col rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
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
                              "mt-1 flex flex-col rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
                              isDarkMode
                                ? "border-white/10 bg-slate-900"
                                : "border-slate-200 bg-white",
                            )}
                          >
                            <button
                              className={clsx(
                                "rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={() => onSortCards(column.id, "title-asc")}
                              type="button"
                            >
                              A-Z
                            </button>
                            <button
                              className={clsx(
                                "rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={() => onSortCards(column.id, "title-desc")}
                              type="button"
                            >
                              Z-A
                            </button>
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
                              <Sparkles className="h-4 w-4" />
                              Filter
                            </span>
                            <span className="text-xs opacity-70">
                              {activeTierFilter === "all" ? "All" : activeTierFilter.replace("top", "Top ")}
                            </span>
                          </button>
                          {isFilterMenuOpen ? (
                            <div
                              className={clsx(
                                "mt-1 flex flex-col rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
                                isDarkMode
                                  ? "border-white/10 bg-slate-900"
                                  : "border-slate-200 bg-white",
                              )}
                            >
                              {(["all", "top10", "top15", "top20"] as TierFilter[]).map((tierOption) => (
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
                            <button
                              className={clsx(
                                "rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={() => onToggleBoardMirrorColumn(column.id)}
                              type="button"
                            >
                              {column.mirrorsEntireBoard ? "Turn Off" : "Turn On"}
                            </button>
                            {!column.mirrorsEntireBoard ? (
                              <button
                                className={clsx(
                                  "rounded-xl px-3 py-2 text-left text-sm transition",
                                  isDarkMode
                                    ? "text-white hover:bg-white/10"
                                    : "text-slate-700 hover:bg-slate-100",
                                )}
                                onClick={() => onToggleExcludeFromBoardMirrors(column.id)}
                                type="button"
                              >
                                {column.excludeFromBoardMirrors ? "Include Source Cards" : "Exclude Source Cards"}
                              </button>
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
                                "rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={onOpenDuplicateCleanup}
                              type="button"
                            >
                              Delete Duplicates
                            </button>
                            <button
                              className={clsx(
                                "rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={onOpenTitleTidy}
                              type="button"
                            >
                              Tidy Titles
                            </button>
                            <button
                              className={clsx(
                                "rounded-xl px-3 py-2 text-left text-sm transition",
                                isDarkMode
                                  ? "text-white hover:bg-white/10"
                                  : "text-slate-700 hover:bg-slate-100",
                              )}
                              onClick={onOpenSeriesScrape}
                              type="button"
                            >
                              Scrape Series
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

      <div className="mt-3 flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {filtering || isTierFiltering ? (
          tierFilteredCards.map((card, index) => (
            <CardTile
              key={card.entryId}
              card={card}
              collapseCards={collapseCards}
              showSeries={showSeriesOnCards}
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
              onDelete={() => onDeleteCard(column.id, card.entryId)}
              onEdit={() => onEditCard(card)}
            />
          ))
        ) : (
          <SortableContext
            items={tierFilteredCards.map((card) => card.entryId)}
            strategy={rectSortingStrategy}
          >
            <>
              <AddCardRow
                columnId={column.id}
                isDarkMode={isDarkMode}
                insertIndex={0}
                alwaysVisible={tierFilteredCards.length === 0}
                interactive={!disableAddAffordances}
                onClick={() => onAddCard(column.id, 0)}
              />
              {tierFilteredCards.map((card, index) => (
                <div key={card.entryId} className="flex flex-col gap-3">
                  <SortableCard
                    card={card}
                    collapseCards={collapseCards}
                    showSeries={showSeriesOnCards}
                    showTierHighlights={showTierHighlights}
                    frontFieldDefinitions={frontFieldDefinitions}
                    rankBadge={
                      isRankedColumn(column)
                        ? {
                            value: index + 1,
                          }
                        : null
                    }
                    onDelete={() => onDeleteCard(column.id, card.entryId)}
                    onEdit={() => onEditCard(card)}
                  />
                  <AddCardRow
                    columnId={column.id}
                    isDarkMode={isDarkMode}
                    insertIndex={index + 1}
                    alwaysVisible={index === tierFilteredCards.length - 1}
                    interactive={!disableAddAffordances}
                    onClick={() => onAddCard(column.id, index + 1)}
                  />
                </div>
              ))}
            </>
          </SortableContext>
        )}

        {tierFilteredCards.length === 0 ? (
          <div
            className={clsx(
              "flex flex-1 items-center justify-center rounded-[26px] border border-dashed p-6 text-center text-sm leading-6",
              isDarkMode
                ? "border-white/15 bg-white/[0.03] text-slate-400"
                : "border-slate-200 bg-slate-50 text-slate-500",
            )}
          >
            {column.mirrorsEntireBoard
              ? "This column mirrors cards from the rest of the board."
              : "Drop a card here or use the column menu to add one."}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AddCardRow({
  columnId,
  isDarkMode,
  insertIndex,
  alwaysVisible = false,
  interactive = true,
  onClick,
}: {
  columnId: string;
  isDarkMode: boolean;
  insertIndex: number;
  alwaysVisible?: boolean;
  interactive?: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: makeInsertDropId(columnId, insertIndex),
  });

  const rowContent = (
    <>
      <span
        className={clsx(
          "h-px flex-1 transition",
          isDarkMode
            ? "bg-white/10 group-hover:bg-white/25 group-focus:bg-white/25"
            : "bg-slate-200 group-hover:bg-slate-300 group-focus:bg-slate-300",
          isOver && (isDarkMode ? "bg-white/35" : "bg-slate-400"),
        )}
      />
      <span
        className={clsx(
          "flex h-7 w-7 items-center justify-center rounded-full border transition",
          interactive
            ? isDarkMode
              ? "border-white/15 bg-slate-950 text-white group-hover:border-white/35 group-hover:bg-slate-900 group-focus:border-white/35 group-focus:bg-slate-900"
              : "border-slate-300 bg-white text-slate-700 group-hover:border-slate-500 group-hover:bg-slate-50 group-focus:border-slate-500 group-focus:bg-slate-50"
            : "border-transparent bg-transparent text-transparent",
          isOver && interactive &&
            (isDarkMode
              ? "border-white/40 bg-slate-900"
              : "border-slate-500 bg-slate-50"),
        )}
      >
        <Plus className="h-4 w-4" />
      </span>
      <span
        className={clsx(
          "h-px flex-1 transition",
          isDarkMode
            ? "bg-white/10 group-hover:bg-white/25 group-focus:bg-white/25"
            : "bg-slate-200 group-hover:bg-slate-300 group-focus:bg-slate-300",
          isOver && (isDarkMode ? "bg-white/35" : "bg-slate-400"),
        )}
      />
    </>
  );

  if (!interactive) {
    return (
      <div
        ref={setNodeRef}
        className={clsx(
          "group flex h-4 items-center gap-3 opacity-0",
          isDarkMode ? "text-slate-300" : "text-slate-400",
          alwaysVisible && "h-8 opacity-100",
        )}
        aria-hidden="true"
      >
        {rowContent}
      </div>
    );
  }

  return (
    <button
      ref={setNodeRef}
      className={clsx(
        "group flex h-4 items-center gap-3 opacity-0 transition duration-150 hover:opacity-100 focus:opacity-100 focus:outline-none",
        isDarkMode ? "text-slate-300" : "text-slate-400",
        alwaysVisible && "h-8 opacity-100",
        isOver && "opacity-100",
      )}
      onClick={onClick}
      type="button"
      aria-label="Add game here"
    >
      {rowContent}
    </button>
  );
}

function SortableCard({
  card,
  collapseCards,
  showSeries,
  showTierHighlights,
  frontFieldDefinitions,
  rankBadge,
  secondaryRankBadge,
  onDelete,
  onEdit,
}: {
  card: CardEntry;
  collapseCards: boolean;
  showSeries: boolean;
  showTierHighlights: boolean;
  frontFieldDefinitions: BoardFieldDefinition[];
  rankBadge: RankBadge | null;
  secondaryRankBadge?: RankBadge | null;
  onDelete: () => void;
  onEdit: () => void;
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
      className={clsx("relative", isDragging && "z-20")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : (transition ?? "transform 180ms ease"),
        willChange: "transform",
      }}
    >
      <CardTile
        card={card}
        collapseCards={collapseCards}
        showSeries={showSeries}
        showTierHighlights={showTierHighlights}
        frontFieldDefinitions={frontFieldDefinitions}
        rankBadge={rankBadge}
        secondaryRankBadge={secondaryRankBadge}
        isDragging={isDragging}
        dragProps={{ ...attributes, ...listeners }}
        onDelete={onDelete}
        onEdit={onEdit}
      />
    </div>
  );
}

function CardTile({
  card,
  collapseCards,
  showSeries,
  showTierHighlights,
  frontFieldDefinitions,
  rankBadge,
  secondaryRankBadge,
  dragProps,
  isDragging = false,
  onDelete,
  onEdit,
}: {
  card: CardEntry;
  collapseCards: boolean;
  showSeries: boolean;
  showTierHighlights: boolean;
  frontFieldDefinitions: BoardFieldDefinition[];
  rankBadge: RankBadge | null;
  secondaryRankBadge?: RankBadge | null;
  dragProps?: React.HTMLAttributes<HTMLElement>;
  isDragging?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const tierKey = showTierHighlights ? getTierKey(rankBadge?.value ?? null) : null;
  const { displayTitle, displaySeries } = getDisplayCardText(card.title, card.series, showSeries);
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
  const cardRef = useRef<HTMLElement | null>(null);
  const tierBorderClass =
    tierKey === "top10"
      ? "border-amber-300/80"
      : tierKey === "top15"
        ? "border-cyan-300/80"
        : tierKey === "top20"
          ? "border-fuchsia-300/80"
          : "border-white/10";

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
      {...dragProps}
      className={clsx(
        "group relative shrink-0 overflow-hidden rounded-[28px] border bg-slate-900 cursor-grab active:cursor-grabbing",
        tierBorderClass,
        isDragging && "shadow-[0_26px_50px_rgba(15,23,42,0.28)]",
      )}
      onClick={() => {
        if (collapseCards) {
          setShowCollapsedActions(true);
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
          "relative bg-cover bg-center",
          collapseCards ? "min-h-[82px]" : "aspect-video",
        )}
        style={{
          backgroundImage: collapseCards ? undefined : `url(${card.imageUrl || buildFallbackImage(card.title)})`,
          backgroundColor: collapseCards ? "#0f172a" : undefined,
        }}
      >
        {!collapseCards ? (
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        ) : null}

        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
          {rankBadge ? (
            <div
              className={clsx(
                "rounded-full px-3 py-1 text-xs font-black",
                tierKey === "top10"
                  ? "bg-amber-300 text-amber-950"
                  : tierKey === "top15"
                    ? "bg-cyan-300 text-cyan-950"
                    : tierKey === "top20"
                      ? "bg-fuchsia-300 text-fuchsia-950"
                      : "bg-white text-slate-950",
              )}
            >
              {rankBadge.label ? `${rankBadge.label} #${rankBadge.value}` : `#${rankBadge.value}`}
            </div>
          ) : null}
          {secondaryRankBadge ? (
            <div className="rounded-full bg-slate-950/75 px-3 py-1 text-xs font-black text-white backdrop-blur">
              {`${secondaryRankBadge.label} #${secondaryRankBadge.value}`}
            </div>
          ) : null}
        </div>

        <div className={clsx("absolute left-0 right-0 p-4", collapseCards ? "bottom-1 pt-11" : "bottom-0")}>
          {!collapseCards && displaySeries ? (
            <p className="mb-1 truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
              {displaySeries}
            </p>
          ) : null}
          <h3 className={clsx("truncate font-bold text-white", collapseCards ? "text-center text-lg" : "text-xl")}>
            {displayTitle}
          </h3>
          {!collapseCards && card.notes ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-200">{card.notes}</p>
          ) : null}
        </div>

        {!collapseCards && (frontChips.length > 0 || card.mirroredFromEntryId) ? (
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
          ? "absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center gap-3 opacity-0 transition duration-150"
          : "absolute right-3 z-10 flex flex-col items-end gap-2 opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
        collapseCards
          ? showCollapsedActions && "opacity-100"
          : frontChips.length > 0 || card.mirroredFromEntryId
            ? "top-14"
            : "top-3",
      )}>
        {onEdit ? (
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
        ) : null}

        {onDelete ? (
          <button
            className="rounded-full bg-slate-950/85 p-2 text-white backdrop-blur transition hover:bg-slate-950"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
            aria-label={`Delete ${card.title}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </article>
  );
}
