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
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { User } from "@supabase/supabase-js";
import {
  ArrowUpDown,
  Clapperboard,
  Edit3,
  Gamepad2,
  Heart,
  ImagePlus,
  LayoutGrid,
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
import { BoardSettings, BoardSnapshot, CardEntry, ColumnDefinition, SavedBoard } from "@/lib/types";

type CardDraft = {
  title: string;
  imageUrl: string;
  series: string;
  releaseYear: string;
  notes: string;
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

const initialDraft: CardDraft = {
  title: "",
  imageUrl: "",
  series: "",
  releaseYear: "",
  notes: "",
  columnId: "",
  newColumnTitle: "",
};

const NEW_COLUMN_OPTION = "__new_column__";
const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  showSeriesOnCards: false,
  collapseCards: false,
  showTierHighlights: true,
  includeSeriesField: true,
  includeImageField: true,
  includeNotesField: true,
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
const THEME_STORAGE_KEY = "rankboard-theme-v1";
const COLUMN_ACCENTS = [
  "from-amber-300 via-orange-400 to-rose-500",
  "from-sky-300 via-cyan-400 to-teal-500",
  "from-fuchsia-300 via-pink-400 to-rose-500",
  "from-violet-300 via-indigo-400 to-blue-500",
  "from-lime-300 via-emerald-400 to-teal-500",
  "from-red-300 via-orange-400 to-amber-500",
];

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
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

async function fetchWikipediaArtworkByTitle(title: string) {
  const trimmedTitle = title.trim();

  if (!trimmedTitle) {
    return null;
  }

  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("titles", trimmedTitle);
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "original");
  url.searchParams.set("pithumbsize", "1600");

  const response = await fetch(url.toString());

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          missing?: boolean;
          original?: { source?: string };
          thumbnail?: { source?: string };
        }
      >;
    };
  };

  const page = Object.values(data.query?.pages ?? {}).find((item) => !item.missing);

  return page?.original?.source ?? page?.thumbnail?.source ?? null;
}

async function fetchWikipediaArtworkCandidatesBySearch(query: string) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", trimmedQuery);
  url.searchParams.set("gsrlimit", "8");
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "original");
  url.searchParams.set("pithumbsize", "1600");

  const response = await fetch(url.toString());

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          title?: string;
          original?: { source?: string };
          thumbnail?: { source?: string };
        }
      >;
    };
  };

  const normalizedQuery = trimmedQuery.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pages = Object.values(data.query?.pages ?? {});

  return [...pages]
    .sort((left, right) => {
      const leftTitle = (left.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const rightTitle = (right.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const leftExact = leftTitle.includes(normalizedQuery) ? 1 : 0;
      const rightExact = rightTitle.includes(normalizedQuery) ? 1 : 0;
      return rightExact - leftExact;
    })
    .map((page) => page.original?.source ?? page.thumbnail?.source ?? null)
    .filter((value): value is string => Boolean(value));
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

async function findArtworkOptions(title: string, series = "") {
  const query = title.trim();
  const queryWithSeries = [series.trim(), query].filter(Boolean).join(" ");

  if (!query) {
    return [];
  }

  const normalizedQuery = sanitizeSearchTitle(queryWithSeries || query);
  const subtitleStrippedQuery = query.split(":")[0]?.trim() ?? query;
  const normalizedSubtitleQuery = sanitizeSearchTitle([series.trim(), subtitleStrippedQuery].filter(Boolean).join(" "));
  const rawgKey = process.env.NEXT_PUBLIC_RAWG_API_KEY;
  const candidates: string[] = [];

  function pushCandidate(url: string | null | undefined) {
    if (!url || candidates.includes(url)) {
      return;
    }
    candidates.push(url);
  }

  if (rawgKey) {
    try {
      const rawgUrl = new URL("https://api.rawg.io/api/games");
      rawgUrl.searchParams.set("key", rawgKey);
      rawgUrl.searchParams.set("search", normalizedQuery || queryWithSeries || query);
      rawgUrl.searchParams.set("page_size", "8");

      const rawgResponse = await fetch(rawgUrl.toString());

      if (rawgResponse.ok) {
        const rawgData = (await rawgResponse.json()) as {
          results?: Array<{
            name?: string;
            background_image?: string;
            background_image_additional?: string;
          }>;
        };

        const normalizedRawgQuery = (normalizedQuery || queryWithSeries || query)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        const rankedResults = [...(rawgData.results ?? [])].sort((left, right) => {
          const leftName = (left.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const rightName = (right.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const leftExact = leftName === normalizedRawgQuery ? 1 : 0;
          const rightExact = rightName === normalizedRawgQuery ? 1 : 0;
          return rightExact - leftExact;
        });

        for (const result of rankedResults) {
          pushCandidate(result.background_image_additional);
          pushCandidate(result.background_image);
          if (candidates.length >= 4) {
            return candidates.slice(0, 4);
          }
        }
      }
    } catch {
      // Fall back to Wikipedia results.
    }
  }

  const titleCandidates = Array.from(
    new Set([
      queryWithSeries,
      query,
      normalizedQuery,
      [series.trim(), subtitleStrippedQuery].filter(Boolean).join(" "),
      subtitleStrippedQuery,
      normalizedSubtitleQuery,
    ].filter(Boolean)),
  );

  for (const candidate of titleCandidates) {
    pushCandidate(await fetchWikipediaArtworkByTitle(candidate));
    if (candidates.length >= 4) {
      return candidates.slice(0, 4);
    }
  }

  const searchCandidates = Array.from(
    new Set([
      `${queryWithSeries} video game`,
      `${series} ${query} wallpaper`,
      `${query} video game`,
      `${normalizedQuery} video game`,
      `${series} ${subtitleStrippedQuery} video game`,
      `${subtitleStrippedQuery} video game`,
      `${normalizedSubtitleQuery} video game`,
      queryWithSeries,
      query,
      normalizedQuery,
      subtitleStrippedQuery,
      normalizedSubtitleQuery,
    ]),
  );

  for (const candidate of searchCandidates) {
    const images = await fetchWikipediaArtworkCandidatesBySearch(candidate);
    for (const image of images) {
      pushCandidate(image);
      if (candidates.length >= 4) {
        return candidates.slice(0, 4);
      }
    }
  }

  return candidates.slice(0, 4);
}

function createCardDraft(card: CardEntry): CardEditorDraft {
  return {
    title: card.title,
    imageUrl: card.imageUrl,
    series: card.series,
    releaseYear: card.releaseYear ?? "",
    notes: card.notes ?? "",
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
    settings: {
      ...getDefaultBoardSettings(board.title),
      ...board.settings,
    },
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
    includeImageField: true,
    includeNotesField: true,
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
  const defaultBoard = createEmptyBoard("Rankboard");
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
  const [isAutofillingDraftImage, setIsAutofillingDraftImage] = useState(false);
  const [autofillingCardId, setAutofillingCardId] = useState<string | null>(null);
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
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isPersisting, setIsPersisting] = useState(false);
  const [isAddFieldSettingsOpen, setIsAddFieldSettingsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const columnMenuBoundaryRef = useRef<HTMLDivElement | null>(null);
  const previousSnapshotRef = useRef<BoardSnapshot | null>(null);
  const skipNextHistoryRef = useRef(true);
  const latestColumnsRef = useRef(columns);
  const latestCardsByColumnRef = useRef(cardsByColumn);
  const latestBoardsRef = useRef(boards);
  const latestActiveBoardIdRef = useRef(activeBoardId);
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
    activeBoard.title ?? "Rankboard";
  const activeBoardSettings = activeBoard.settings ?? DEFAULT_BOARD_SETTINGS;
  const boardVocabulary = getBoardVocabulary(activeBoardTitle);
  const activeBoardKind = getBoardKind(activeBoardTitle);
  const shouldShowSeriesField =
    activeBoardSettings.includeSeriesField && activeBoardKind !== "show";
  const shouldShowImageField = activeBoardSettings.includeImageField;
  const shouldShowNotesField = activeBoardSettings.includeNotesField;

  const resetToSignedOutBoard = useCallback(() => {
    const signedOutBoard = createEmptyBoard("Rankboard");

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

  const persistBoardState = useCallback(async (options?: {
    boards?: SavedBoard[];
    activeBoardId?: string;
    cardsByColumn?: Record<string, CardEntry[]>;
  }) => {
    if (!supabase || !currentUser) {
      return;
    }

    const nextBoards = options?.boards ?? latestBoardsRef.current;
    const nextActiveBoardId = options?.activeBoardId ?? latestActiveBoardIdRef.current;
    const nextCardsByColumn = options?.cardsByColumn ?? latestCardsByColumnRef.current;

    setIsPersisting(true);

    try {
      const { error } = await supabase.from("board_states").upsert({
        owner_id: currentUser.id,
        columns: {
          version: 2,
          activeBoardId: nextActiveBoardId,
          boards: nextBoards,
        },
        cards_by_column: nextCardsByColumn,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error(error);
        return;
      }

      setLastSavedAt(new Date().toISOString());
    } finally {
      setIsPersisting(false);
    }
  }, [currentUser, supabase]);

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
    if (authEnabled) {
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
          ...createEmptyBoard("Rankboard"),
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

    window.localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        activeBoardId,
        boards,
      }),
    );
    if (!authEnabled || !currentUser) {
      setLastSavedAt(new Date().toISOString());
    }
  }, [activeBoardId, authEnabled, boards, currentUser, hasLoadedPersistedState, isAuthLoading]);

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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      isSigningOutRef.current = false;
      setCurrentUser(session?.user ?? null);
      setHasLoadedRemoteState(session?.user ? false : true);
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

    if (boards.length === 1 && activeBoardTitle === "Rankboard" && isStarterBoard(columns, cardsByColumn)) {
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
          | { version?: number; boards?: SavedBoard[]; activeBoardId?: string }
          | undefined) ?? null;
      const remoteBoardsPayload =
        columnsPayload &&
        !Array.isArray(columnsPayload) &&
        columnsPayload.version === 2 &&
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
        const remoteBoards = remoteBoardsPayload.boards ?? [];
        if (remoteBoards.length === 0) {
          setHasLoadedRemoteState(true);
          return;
        }
        const normalizedRemoteBoards = remoteBoards.map((board) => normalizeSavedBoard(board));
        const remoteActiveBoardId =
          remoteBoardsPayload.activeBoardId &&
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
          await client.from("board_states").upsert({
            owner_id: user.id,
            columns: {
              version: 2,
              activeBoardId: localActiveBoardId,
              boards: localBoards,
            },
            cards_by_column: localCardsByColumn,
            updated_at: new Date().toISOString(),
          });
        } else {
          const migratedBoard: SavedBoard = {
            ...createEmptyBoard("Rankboard"),
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
        await client.from("board_states").upsert({
          owner_id: user.id,
          columns: {
            version: 2,
            activeBoardId: localActiveBoardId,
            boards: localBoards,
          },
          cards_by_column: localCardsByColumn,
          updated_at: new Date().toISOString(),
        });
      }

      setHasLoadedRemoteState(true);
    }

    loadBoardState();

    return () => {
      cancelled = true;
    };
  }, [
    authEnabled,
    currentUser,
    hasLoadedPersistedState,
    supabase,
  ]);

  useEffect(() => {
    if (!supabase || !currentUser || !hasLoadedRemoteState || isSigningOutRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistBoardState({
        boards,
        activeBoardId,
        cardsByColumn,
      });
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [activeBoardId, boards, cardsByColumn, currentUser, hasLoadedRemoteState, persistBoardState, supabase]);

  useEffect(() => {
    if (!supabase || !currentUser || !hasLoadedRemoteState || isSigningOutRef.current) {
      return;
    }

    const interval = window.setInterval(() => {
      void persistBoardState({
        boards,
        activeBoardId,
        cardsByColumn,
      });
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [activeBoardId, boards, cardsByColumn, currentUser, hasLoadedRemoteState, persistBoardState, supabase]);

  useEffect(() => {
    if (!isActionsMenuOpen) {
      setIsBoardsMenuOpen(false);
      setIsCustomizationMenuOpen(false);
      setIsMaintenanceMenuOpen(false);
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!actionsMenuRef.current?.contains(event.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);

    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isActionsMenuOpen]);

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
    setCardsByColumn((current) => {
      const nextState: Record<string, CardEntry[]> = {};

      for (const [columnId, cards] of Object.entries(current)) {
        nextState[columnId] = cards.map((card) =>
          card.itemId === itemId ? updater(card) : card,
        );
      }

      return nextState;
    });
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
        if (column.id === mirrorColumn.id || column.mirrorsEntireBoard) {
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
      const syncedCards: CardEntry[] = [];

      for (const existingMirror of existingMirrorCards) {
        const sourceId = existingMirror.mirroredFromEntryId;
        const linkedSource = sourceId ? sourceById.get(sourceId) : null;
        const matchedSource =
          linkedSource ??
          sourceByNormalizedTitle.get(normalizeTitleForComparison(existingMirror.title));

        if (matchedSource) {
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

    setCardsByColumn(nextState);
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
    const selectedColumnId =
      draft.columnId === NEW_COLUMN_OPTION ? "" : draft.columnId || addCardTarget.columnId;
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
      });
      return;
    }

    finalizeAddCard(title, series, imageUrl, notes, releaseYear);
  }

  function finalizeAddCard(title: string, series: string, imageUrl: string, notes: string, releaseYear: string) {
    if (!addCardTarget) {
      return;
    }

    let nextColumns = columns;
    let destinationColumnId = draft.columnId || addCardTarget.columnId;
    let destinationInsertIndex = addCardTarget.insertIndex;
    let nextCardsByColumn = cardsByColumn;

    if (draft.columnId === NEW_COLUMN_OPTION) {
      const newColumn = createColumnDefinition(columns.length + 1, draft.newColumnTitle);
      nextColumns = [...columns, newColumn];
      destinationColumnId = newColumn.id;
      destinationInsertIndex = 0;
      nextCardsByColumn = {
        ...cardsByColumn,
        [newColumn.id]: [],
      };
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

    setCardsByColumn(nextState);
    setDraft(initialDraft);
    setAddCardTarget(null);
    setDraftDuplicateAction(null);
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
    setIsAutofillingDraftImage(false);
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

    let nextState = {
      ...cardsByColumn,
      [columnId]: (cardsByColumn[columnId] ?? []).filter(
        (item) => item.entryId !== entryId,
      ),
    };

    if (column?.autoMirrorToColumnId) {
      nextState = removeMirroredCard(nextState, entryId, column.autoMirrorToColumnId);
    }

    setCardsByColumn(nextState);
    setEditingCardId((current) => (current === entryId ? null : current));
  }

  async function handleAutofillDraftImage() {
    const title = draft.title.trim();
    const series = draft.series.trim();

    if (!title) {
      return;
    }

    setIsAutofillingDraftImage(true);

    try {
      const foundImages = await findArtworkOptions(title, series);
      if (foundImages.length === 1) {
        setDraft((current) => ({
          ...current,
          imageUrl: foundImages[0] ?? "",
        }));
      } else if (foundImages.length > 1) {
        setArtworkPicker({
          target: "draft",
          options: foundImages,
        });
      }
    } finally {
      setIsAutofillingDraftImage(false);
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
  }

  function saveEditingCard() {
    if (!editingCardDraft || !editingCardItemId) {
      return;
    }

    const title = editingCardDraft.title.trim() || "Untitled Game";
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
      itemId: slugify(title) || card.itemId,
    }));

    cancelEditingCard();
  }

  async function autofillEditingCardImage() {
    if (!editingCardDraft || !editingCardItemId) {
      return;
    }

    const title = editingCardDraft.title.trim() || "Untitled Game";
    const series = editingCardDraft.series.trim();
    setAutofillingCardId(editingCardItemId);

    try {
      const foundImages = await findArtworkOptions(title, series);
      if (foundImages.length === 1) {
        setEditingCardDraft((current) =>
          current
            ? {
                ...current,
                imageUrl: foundImages[0] ?? "",
              }
            : current,
        );
      } else if (foundImages.length > 1) {
        setArtworkPicker({
          target: "editing",
          options: foundImages,
        });
      }
    } finally {
      setAutofillingCardId(null);
    }
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
      }));
      closeAddGameModal();
      return;
    }

    finalizeAddCard(
      draftDuplicateAction.title,
      draftDuplicateAction.series,
      draftDuplicateAction.imageUrl,
      draft.notes.trim(),
      draft.releaseYear.trim(),
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
        releaseYear: editingCardDraft.releaseYear.trim() || card.releaseYear,
        notes: editingDuplicateAction.notes || card.notes,
      }));
      cancelEditingCard();
      return;
    }

    const releaseYear = editingCardDraft.releaseYear.trim();
    const notes = editingCardDraft.notes.trim();
    updateCardsForItem(editingCardItemId, (card) => ({
      ...card,
      title: editingDuplicateAction.title,
      imageUrl: editingDuplicateAction.imageUrl,
      series: editingDuplicateAction.series,
      releaseYear: releaseYear || undefined,
      notes: notes || undefined,
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
    const scopedColumns = scopeColumnId
      ? columns.filter((column) => column.id === scopeColumnId)
      : columns;

    return scopedColumns.flatMap((column) =>
      (cardsByColumn[column.id] ?? []).map((card) => ({
        id: `${column.id}-${card.entryId}`,
        columnId: column.id,
        columnTitle: column.title,
        entryId: card.entryId,
        itemId: card.itemId,
        title: card.title,
        proposedSeries: card.series.trim(),
        proposedReleaseYear: card.releaseYear?.trim() ?? "",
      })),
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
                <div className="relative" ref={actionsMenuRef}>
                  <button
                    aria-label="Settings"
                    className={clsx(
                      "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border px-4 transition sm:w-auto",
                      isDarkMode
                        ? "border-white/10 bg-slate-950/60 text-slate-100 hover:border-white/40"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                    )}
                    onClick={() => setIsActionsMenuOpen((current) => !current)}
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
                          icon={<LayoutGrid className="h-4 w-4" />}
                          label="Boards"
                          isDarkMode={isDarkMode}
                          isOpen={isBoardsMenuOpen}
                          onClick={() => {
                            setIsBoardsMenuOpen((current) => !current);
                            setIsCustomizationMenuOpen(false);
                            setIsMaintenanceMenuOpen(false);
                          }}
                        />
                        {isBoardsMenuOpen ? (
                          <div
                            className={clsx(
                              "mt-1 space-y-1 rounded-2xl px-2 pb-2",
                              isDarkMode ? "bg-white/5" : "bg-slate-50",
                            )}
                          >
                            {boards.map((board) => (
                              <button
                                key={board.id}
                                className={clsx(
                                  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition",
                                  isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
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
                                isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
                              )}
                              onClick={() => {
                                openCreateBoardModal();
                              }}
                              type="button"
                            >
                              <Plus className="h-4 w-4" />
                              New Board
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-2xl">
                        <MenuSectionButton
                          icon={<Sparkles className="h-4 w-4" />}
                          label="Customization"
                          isDarkMode={isDarkMode}
                          isOpen={isCustomizationMenuOpen}
                          onClick={() => {
                            setIsCustomizationMenuOpen((current) => !current);
                            setIsBoardsMenuOpen(false);
                            setIsMaintenanceMenuOpen(false);
                          }}
                        />
                        {isCustomizationMenuOpen ? (
                          <div className={clsx("mt-1 space-y-1 rounded-2xl px-2 pb-2", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                            <button
                              className={clsx(
                                "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
                              )}
                              onClick={() => updateActiveBoardSettings({ showSeriesOnCards: !activeBoardSettings.showSeriesOnCards })}
                              type="button"
                            >
                              <span>Show Series</span>
                              <span className="text-xs opacity-70">{activeBoardSettings.showSeriesOnCards ? "On" : "Off"}</span>
                            </button>
                            <button
                              className={clsx(
                                "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                                isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
                              )}
                              onClick={() => updateActiveBoardSettings({ collapseCards: !activeBoardSettings.collapseCards })}
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
                      <button
                        className={clsx(
                          "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                          isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
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
                "fixed bottom-5 right-5 z-[70] inline-flex h-14 w-14 items-center justify-center rounded-full shadow-[0_18px_40px_rgba(15,23,42,0.24)] lg:hidden",
                isDarkMode
                  ? "bg-slate-950 text-white"
                  : "bg-white text-slate-950",
              )}
              onClick={() => setIsMobileActionsOpen(true)}
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

                      <div className="relative" ref={actionsMenuRef}>
                        <button
                          aria-label="Settings"
                          className={clsx(
                            "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border transition",
                            isDarkMode
                              ? "border-white/10 bg-slate-950/60 text-slate-100 hover:border-white/40"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                          )}
                          onClick={() => setIsActionsMenuOpen((current) => !current)}
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
                                icon={<LayoutGrid className="h-4 w-4" />}
                                label="Boards"
                                isDarkMode={isDarkMode}
                                isOpen={isBoardsMenuOpen}
                                onClick={() => {
                                  setIsBoardsMenuOpen((current) => !current);
                                  setIsCustomizationMenuOpen(false);
                                  setIsMaintenanceMenuOpen(false);
                                }}
                              />
                              {isBoardsMenuOpen ? (
                                <div className={clsx("mt-1 space-y-1 rounded-2xl px-2 pb-2", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                                  {boards.map((board) => (
                                    <button
                                      key={board.id}
                                      className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}
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
                                    className={clsx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")}
                                    onClick={() => {
                                      openCreateBoardModal();
                                    }}
                                    type="button"
                                  >
                                    <Plus className="h-4 w-4" />
                                    New Board
                                  </button>
                                </div>
                              ) : null}
                            </div>
                            <div className="rounded-2xl">
                              <MenuSectionButton
                                icon={<Sparkles className="h-4 w-4" />}
                                label="Customization"
                                isDarkMode={isDarkMode}
                                isOpen={isCustomizationMenuOpen}
                                onClick={() => {
                                  setIsCustomizationMenuOpen((current) => !current);
                                  setIsBoardsMenuOpen(false);
                                  setIsMaintenanceMenuOpen(false);
                                }}
                              />
                              {isCustomizationMenuOpen ? (
                                <div className={clsx("mt-1 space-y-1 rounded-2xl px-2 pb-2", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                                  <button className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => updateActiveBoardSettings({ showSeriesOnCards: !activeBoardSettings.showSeriesOnCards })} type="button">
                                    <span>Show Series</span>
                                    <span className="text-xs opacity-70">{activeBoardSettings.showSeriesOnCards ? "On" : "Off"}</span>
                                  </button>
                                  <button className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => updateActiveBoardSettings({ includeSeriesField: !activeBoardSettings.includeSeriesField })} type="button">
                                    <span>Series Field</span>
                                    <span className="text-xs opacity-70">{activeBoardSettings.includeSeriesField ? "On" : "Off"}</span>
                                  </button>
                                  <button className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => updateActiveBoardSettings({ includeImageField: !activeBoardSettings.includeImageField })} type="button">
                                    <span>Artwork Field</span>
                                    <span className="text-xs opacity-70">{activeBoardSettings.includeImageField ? "On" : "Off"}</span>
                                  </button>
                                  <button className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => updateActiveBoardSettings({ includeNotesField: !activeBoardSettings.includeNotesField })} type="button">
                                    <span>Notes Field</span>
                                    <span className="text-xs opacity-70">{activeBoardSettings.includeNotesField ? "On" : "Off"}</span>
                                  </button>
                                  <button className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => updateActiveBoardSettings({ collapseCards: !activeBoardSettings.collapseCards })} type="button">
                                    <span>Collapse Cards</span>
                                    <span className="text-xs opacity-70">{activeBoardSettings.collapseCards ? "On" : "Off"}</span>
                                  </button>
                                  <button className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => updateActiveBoardSettings({ showTierHighlights: !activeBoardSettings.showTierHighlights })} type="button">
                                    <span>Tier Highlights</span>
                                    <span className="text-xs opacity-70">{activeBoardSettings.showTierHighlights ? "On" : "Off"}</span>
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
                            <button
                              className={clsx("flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100")}
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
                    <span
                      className={clsx(
                        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                        isDarkMode ? "bg-white/10 text-white" : "bg-white text-slate-950",
                      )}
                    >
                      <BoardKindIcon boardTitle={activeBoardTitle} className="h-5 w-5" />
                    </span>
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
                    <div className="relative" ref={actionsMenuRef}>
                      <button
                        aria-label="Settings"
                        className={clsx(
                          "inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl border px-4 transition",
                          isDarkMode
                            ? "border-white/10 bg-slate-950/60 text-slate-100 hover:border-white/40"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                        )}
                        onClick={() => setIsActionsMenuOpen((current) => !current)}
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
                              icon={<LayoutGrid className="h-4 w-4" />}
                              label="Boards"
                              isDarkMode={isDarkMode}
                              isOpen={isBoardsMenuOpen}
                              onClick={() => {
                                setIsBoardsMenuOpen((current) => !current);
                                setIsCustomizationMenuOpen(false);
                                setIsMaintenanceMenuOpen(false);
                              }}
                            />
                            {isBoardsMenuOpen ? (
                              <div className={clsx("mt-1 space-y-1 rounded-2xl px-2 pb-2", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                                {boards.map((board) => (
                                  <button
                                    key={board.id}
                                    className={clsx(
                                      "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition",
                                      isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
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
                                    isDarkMode ? "hover:bg-white/10" : "hover:bg-white",
                                  )}
                                  onClick={() => {
                                    openCreateBoardModal();
                                  }}
                                  type="button"
                                >
                                  <Plus className="h-4 w-4" />
                                  New Board
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <div className="rounded-2xl">
                            <MenuSectionButton
                              icon={<Sparkles className="h-4 w-4" />}
                              label="Customization"
                              isDarkMode={isDarkMode}
                              isOpen={isCustomizationMenuOpen}
                              onClick={() => {
                                setIsCustomizationMenuOpen((current) => !current);
                                setIsBoardsMenuOpen(false);
                                setIsMaintenanceMenuOpen(false);
                              }}
                            />
                            {isCustomizationMenuOpen ? (
                              <div className={clsx("mt-1 space-y-1 rounded-2xl px-2 pb-2", isDarkMode ? "bg-white/5" : "bg-slate-50")}>
                                <button className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => updateActiveBoardSettings({ showSeriesOnCards: !activeBoardSettings.showSeriesOnCards })} type="button">
                                  <span>Show Series</span>
                                  <span className="text-xs opacity-70">{activeBoardSettings.showSeriesOnCards ? "On" : "Off"}</span>
                                </button>
                                <button className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => updateActiveBoardSettings({ collapseCards: !activeBoardSettings.collapseCards })} type="button">
                                  <span>Collapse Cards</span>
                                  <span className="text-xs opacity-70">{activeBoardSettings.collapseCards ? "On" : "Off"}</span>
                                </button>
                                <button className={clsx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-white")} onClick={() => updateActiveBoardSettings({ showTierHighlights: !activeBoardSettings.showTierHighlights })} type="button">
                                  <span>Tier Highlights</span>
                                  <span className="text-xs opacity-70">{activeBoardSettings.showTierHighlights ? "On" : "Off"}</span>
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
                          <button
                            className={clsx(
                              "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                              isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
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
                  <div className="hidden lg:block xl:hidden" ref={actionsMenuRef}>
                    <button
                      aria-label="Open actions"
                      className={clsx(
                        "inline-flex h-11 w-11 items-center justify-center rounded-full shadow-[0_18px_40px_rgba(15,23,42,0.18)]",
                        isDarkMode ? "bg-slate-950 text-white" : "bg-white text-slate-950",
                      )}
                      onClick={() => setIsMobileActionsOpen(true)}
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
                      showSeriesOnCards={activeBoardSettings.showSeriesOnCards}
                      showTierHighlights={activeBoardSettings.showTierHighlights}
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

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Title</span>
                  <input
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
                    <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Series</span>
                    <input
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

                <label className="grid gap-2">
                  <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Release Year</span>
                  <input
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
              </div>

              <label className="mt-4 grid gap-2">
                <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>
                  Background image or GIF URL
                </span>
                <input
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
                  "mt-4 inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                  isDarkMode
                    ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40 hover:bg-slate-900"
                    : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-950 hover:bg-white",
                )}
                onClick={autofillEditingCardImage}
                type="button"
              >
                <WandSparkles className="h-4 w-4" />
                {autofillingCardId === editingCardItemId
                  ? "Finding artwork..."
                  : "Auto-Find Artwork"}
              </button>

              <label className="mt-4 grid gap-2">
                <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Notes</span>
                <textarea
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

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : "bg-slate-950 text-white hover:bg-slate-800",
                  )}
                  onClick={saveEditingCard}
                  type="button"
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
              </div>
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
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    {`Add ${boardVocabulary.singular}`}
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    {`Add ${boardVocabulary.singular}`}
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    Choose where this {boardVocabulary.singular.toLowerCase()} should go.
                  </p>
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
                      <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Series</span>
                      <input
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

                <label className="grid gap-2">
                  <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Release Year</span>
                  <input
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
                </div>

                {shouldShowImageField ? (
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <label className="grid gap-2">
                      <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>
                        Background image or GIF URL
                      </span>
                      <div className="relative">
                        <ImagePlus
                          className={clsx(
                            "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2",
                            isDarkMode ? "text-slate-500" : "text-slate-400",
                          )}
                        />
                        <input
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
                      onClick={handleAutofillDraftImage}
                      type="button"
                    >
                      <WandSparkles className="h-4 w-4" />
                      {isAutofillingDraftImage ? "Finding..." : "Find Art"}
                    </button>
                  </div>
                ) : null}

                {shouldShowNotesField ? (
                  <label className="grid gap-2">
                    <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Notes</span>
                    <textarea
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>
                      Column
                    </span>
                    <select
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
                  ) : (
                    <div
                      className={clsx(
                        "flex items-end rounded-2xl border px-4 py-3 text-sm",
                        isDarkMode
                          ? "border-white/10 bg-slate-950/50 text-slate-300"
                          : "border-slate-200 bg-slate-50 text-slate-600",
                      )}
                    >
                      {`This will be added to ${columns.find((column) => column.id === (draft.columnId || addCardTarget.columnId))?.title ?? "the selected column"}.`}
                    </div>
                  )}
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
                </div>
              </form>

              <div className="absolute bottom-5 right-5">
                <button
                  className={clsx(
                    "inline-flex h-11 w-11 items-center justify-center rounded-full border transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                  )}
                  onClick={() => setIsAddFieldSettingsOpen((current) => !current)}
                  type="button"
                  aria-label="Customize add fields"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
                {isAddFieldSettingsOpen ? (
                  <div
                    className={clsx(
                      "absolute bottom-14 right-0 z-10 min-w-[220px] rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
                      isDarkMode
                        ? "border-white/10 bg-slate-900"
                        : "border-slate-200 bg-white",
                    )}
                  >
                    <button
                      className={clsx(
                        "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                        isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                      )}
                      onClick={() => updateActiveBoardSettings({ includeSeriesField: !activeBoardSettings.includeSeriesField })}
                      type="button"
                    >
                      <span>Series field</span>
                      <span className="text-xs opacity-70">{activeBoardSettings.includeSeriesField ? "On" : "Off"}</span>
                    </button>
                    <button
                      className={clsx(
                        "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                        isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                      )}
                      onClick={() => updateActiveBoardSettings({ includeImageField: !activeBoardSettings.includeImageField })}
                      type="button"
                    >
                      <span>Artwork field</span>
                      <span className="text-xs opacity-70">{activeBoardSettings.includeImageField ? "On" : "Off"}</span>
                    </button>
                    <button
                      className={clsx(
                        "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                        isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                      )}
                      onClick={() => updateActiveBoardSettings({ includeNotesField: !activeBoardSettings.includeNotesField })}
                      type="button"
                    >
                      <span>Notes field</span>
                      <span className="text-xs opacity-70">{activeBoardSettings.includeNotesField ? "On" : "Off"}</span>
                    </button>
                  </div>
                ) : null}
              </div>
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
                "w-full max-w-5xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
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

              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                      className="aspect-video bg-cover bg-center"
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
                      includeSeriesField: nextDefaults.includeSeriesField,
                    }));
                  }}
                />
              </label>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <button
                  className={clsx(
                    "flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-800 hover:border-slate-950",
                  )}
                  onClick={() =>
                    setNewBoardSettings((current) => ({
                      ...current,
                      includeSeriesField: !current.includeSeriesField,
                    }))
                  }
                  type="button"
                >
                  <span>Series field</span>
                  <span className="text-xs opacity-70">{newBoardSettings.includeSeriesField ? "On" : "Off"}</span>
                </button>
                <button
                  className={clsx(
                    "flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-800 hover:border-slate-950",
                  )}
                  onClick={() =>
                    setNewBoardSettings((current) => ({
                      ...current,
                      includeImageField: !current.includeImageField,
                    }))
                  }
                  type="button"
                >
                  <span>Artwork field</span>
                  <span className="text-xs opacity-70">{newBoardSettings.includeImageField ? "On" : "Off"}</span>
                </button>
                <button
                  className={clsx(
                    "flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40"
                      : "border-slate-200 bg-white text-slate-800 hover:border-slate-950",
                  )}
                  onClick={() =>
                    setNewBoardSettings((current) => ({
                      ...current,
                      includeNotesField: !current.includeNotesField,
                    }))
                  }
                  type="button"
                >
                  <span>Notes field</span>
                  <span className="text-xs opacity-70">{newBoardSettings.includeNotesField ? "On" : "Off"}</span>
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
  rankBadge,
  secondaryRankBadge,
  onDelete,
  onEdit,
}: {
  card: CardEntry;
  collapseCards: boolean;
  showSeries: boolean;
  showTierHighlights: boolean;
  rankBadge: RankBadge | null;
  secondaryRankBadge?: RankBadge | null;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.entryId,
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <CardTile
        card={card}
        collapseCards={collapseCards}
        showSeries={showSeries}
        showTierHighlights={showTierHighlights}
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
  rankBadge: RankBadge | null;
  secondaryRankBadge?: RankBadge | null;
  dragProps?: React.HTMLAttributes<HTMLElement>;
  isDragging?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const tierKey = showTierHighlights ? getTierKey(rankBadge?.value ?? null) : null;
  const tierBorderClass =
    tierKey === "top10"
      ? "border-amber-300/80 shadow-[0_20px_40px_rgba(251,191,36,0.22)]"
      : tierKey === "top15"
        ? "border-cyan-300/80 shadow-[0_20px_40px_rgba(34,211,238,0.2)]"
        : tierKey === "top20"
          ? "border-fuchsia-300/80 shadow-[0_20px_40px_rgba(232,121,249,0.18)]"
          : "border-white/10 shadow-[0_20px_40px_rgba(15,23,42,0.25)]";

  return (
    <article
      {...dragProps}
      className={clsx(
        "group relative overflow-hidden rounded-[28px] border bg-slate-900 cursor-grab active:cursor-grabbing",
        tierBorderClass,
        isDragging && "rotate-1 scale-[1.01]",
      )}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: collapseCards ? "82px" : "180px",
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

        <div className={clsx("absolute left-0 right-0 p-4", collapseCards ? "bottom-1" : "bottom-0")}>
          {!collapseCards && showSeries && card.series ? (
            <p className="mb-1 truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
              {card.series}
            </p>
          ) : null}
          <h3 className="truncate text-xl font-bold text-white">{card.title}</h3>
          {!collapseCards && card.notes ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-200">{card.notes}</p>
          ) : null}
        </div>
      </div>

      {card.mirroredFromEntryId ? (
        <div
          className="absolute right-3 top-3 z-10 rounded-full bg-slate-950/75 p-2 text-white backdrop-blur"
          aria-label="Mirrored card"
          title="Mirrored card"
        >
          <Link2 className="h-4 w-4" />
        </div>
      ) : null}

      <div className={clsx(
        "absolute right-3 z-10 flex items-center gap-2 opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
        card.mirroredFromEntryId ? "top-14" : "top-3",
      )}>
        {onEdit ? (
          <button
            className="rounded-full bg-slate-950/75 p-2 text-white backdrop-blur transition hover:bg-slate-950"
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
            className="rounded-full bg-slate-950/75 p-2 text-white backdrop-blur transition hover:bg-slate-950"
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
