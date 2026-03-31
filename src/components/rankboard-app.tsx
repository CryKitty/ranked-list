"use client";

import { useEffect, useRef, useState } from "react";
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
  Edit3,
  ImagePlus,
  LogOut,
  MoreHorizontal,
  Moon,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Sun,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { demoCardsByColumn, demoColumns } from "@/lib/demo-data";
import { parseTrelloBoardExport } from "@/lib/trello-import";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { BoardSnapshot, CardEntry, ColumnDefinition } from "@/lib/types";

type CardDraft = {
  title: string;
  imageUrl: string;
  series: string;
  columnId: string;
};

type AddCardTarget = {
  columnId: string;
  insertIndex: number;
};

type CardEditorDraft = {
  title: string;
  imageUrl: string;
  series: string;
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
};

const initialDraft: CardDraft = {
  title: "",
  imageUrl: "",
  series: "",
  columnId: "new-column",
};

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

async function fetchWikipediaArtworkBySearch(query: string) {
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
          title?: string;
          original?: { source?: string };
          thumbnail?: { source?: string };
        }
      >;
    };
  };

  const normalizedQuery = trimmedQuery.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pages = Object.values(data.query?.pages ?? {});
  const bestPage =
    [...pages].sort((left, right) => {
      const leftTitle = (left.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const rightTitle = (right.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const leftExact = leftTitle.includes(normalizedQuery) ? 1 : 0;
      const rightExact = rightTitle.includes(normalizedQuery) ? 1 : 0;
      return rightExact - leftExact;
    })[0] ?? null;

  return bestPage?.original?.source ?? bestPage?.thumbnail?.source ?? null;
}

async function findGameArtwork(title: string) {
  const query = title.trim();

  if (!query) {
    return null;
  }

  const normalizedQuery = sanitizeSearchTitle(query);
  const subtitleStrippedQuery = query.split(":")[0]?.trim() ?? query;
  const normalizedSubtitleQuery = sanitizeSearchTitle(subtitleStrippedQuery);
  const rawgKey = process.env.NEXT_PUBLIC_RAWG_API_KEY;

  if (rawgKey) {
    try {
      const rawgUrl = new URL("https://api.rawg.io/api/games");
      rawgUrl.searchParams.set("key", rawgKey);
      rawgUrl.searchParams.set("search", normalizedQuery || query);
      rawgUrl.searchParams.set("search_exact", "true");
      rawgUrl.searchParams.set("page_size", "5");

      const rawgResponse = await fetch(rawgUrl.toString());

      if (rawgResponse.ok) {
        const rawgData = (await rawgResponse.json()) as {
          results?: Array<{
            name?: string;
            background_image?: string;
            background_image_additional?: string;
          }>;
        };

        const normalizedRawgQuery = (normalizedQuery || query)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        const rankedResults = [...(rawgData.results ?? [])].sort((left, right) => {
          const leftName = (left.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const rightName = (right.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const leftExact = leftName === normalizedRawgQuery ? 1 : 0;
          const rightExact = rightName === normalizedRawgQuery ? 1 : 0;
          return rightExact - leftExact;
        });

        const rawgImage = rankedResults.find(
          (result) => result.background_image_additional || result.background_image,
        );

        if (rawgImage) {
          return rawgImage.background_image_additional ?? rawgImage.background_image ?? null;
        }
      }
    } catch {
      // Fall back to Wikipedia and generated artwork.
    }
  }

  const titleCandidates = Array.from(
    new Set([
      query,
      normalizedQuery,
      subtitleStrippedQuery,
      normalizedSubtitleQuery,
    ].filter(Boolean)),
  );

  for (const candidate of titleCandidates) {
    const image = await fetchWikipediaArtworkByTitle(candidate);

    if (image) {
      return image;
    }
  }

  const searchCandidates = Array.from(
    new Set([
      `${query} video game`,
      `${normalizedQuery} video game`,
      `${subtitleStrippedQuery} video game`,
      `${normalizedSubtitleQuery} video game`,
      query,
      normalizedQuery,
      subtitleStrippedQuery,
      normalizedSubtitleQuery,
    ]),
  );

  for (const candidate of searchCandidates) {
    const image = await fetchWikipediaArtworkBySearch(candidate);

    if (image) {
      return image;
    }
  }

  return null;
}

function createCardDraft(card: CardEntry): CardEditorDraft {
  return {
    title: card.title,
    imageUrl: card.imageUrl,
    series: card.series,
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
  if (boardColumns.length !== demoColumns.length) {
    return false;
  }

  if (boardColumns[0]?.id !== demoColumns[0]?.id) {
    return false;
  }

  if (boardColumns[0]?.title !== demoColumns[0]?.title) {
    return false;
  }

  return Object.values(boardCardsByColumn).every((cards) => cards.length === 0);
}

function normalizeTitleForComparison(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

export function RankboardApp() {
  const supabase = getSupabaseBrowserClient();
  const authEnabled = Boolean(supabase);
  const [columns, setColumns] = useState<ColumnDefinition[]>(demoColumns);
  const [cardsByColumn, setCardsByColumn] =
    useState<Record<string, CardEntry[]>>(demoCardsByColumn);
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
  const [isAutofillingDraftImage, setIsAutofillingDraftImage] = useState(false);
  const [autofillingCardId, setAutofillingCardId] = useState<string | null>(null);
  const [hasLoadedPersistedState, setHasLoadedPersistedState] = useState(false);
  const [hasLoadedRemoteState, setHasLoadedRemoteState] = useState(false);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(authEnabled);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [history, setHistory] = useState<BoardSnapshot[]>([]);
  const [draftDuplicateAction, setDraftDuplicateAction] =
    useState<PendingDuplicateAction | null>(null);
  const [editingDuplicateAction, setEditingDuplicateAction] =
    useState<PendingDuplicateAction | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const previousSnapshotRef = useRef<BoardSnapshot | null>(null);
  const skipNextHistoryRef = useRef(true);
  const latestColumnsRef = useRef(columns);
  const latestCardsByColumnRef = useRef(cardsByColumn);

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

  function findDuplicateCard(title: string, excludeItemId?: string) {
    const normalizedTitle = normalizeTitleForComparison(title);

    if (!normalizedTitle) {
      return null;
    }

    for (const column of columns) {
      const duplicate = (cardsByColumn[column.id] ?? []).find(
        (card) =>
          !card.mirroredFromEntryId &&
          card.itemId !== excludeItemId &&
          normalizeTitleForComparison(card.title) === normalizedTitle,
      );

      if (duplicate) {
        return {
          column,
          card: duplicate,
        };
      }
    }

    return null;
  }

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(LOCAL_STORAGE_KEY);

      if (!storedValue) {
        setHasLoadedPersistedState(true);
        return;
      }

      const parsedState = JSON.parse(storedValue) as {
        columns?: ColumnDefinition[];
        cardsByColumn?: Record<string, CardEntry[]>;
      };

      if (parsedState.columns) {
        skipNextHistoryRef.current = true;
        setColumns(parsedState.columns);
      }

      if (parsedState.cardsByColumn) {
        skipNextHistoryRef.current = true;
        setCardsByColumn(parsedState.cardsByColumn);
      }
    } catch {
      // Ignore bad local data and fall back to demo content.
    } finally {
      setHasLoadedPersistedState(true);
    }
  }, []);

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      setIsDarkMode(storedTheme === "dark");
    } catch {
      setIsDarkMode(false);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedPersistedState) {
      return;
    }

    window.localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        columns,
        cardsByColumn,
      }),
    );
  }, [cardsByColumn, columns, hasLoadedPersistedState]);

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
    latestColumnsRef.current = columns;
    latestCardsByColumnRef.current = cardsByColumn;
  }, [cardsByColumn, columns]);

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
      setIsAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      setIsAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!hasLoadedPersistedState) {
      return;
    }

    if (!supabase || !currentUser) {
      setHasLoadedRemoteState(!authEnabled);
      return;
    }

    const client = supabase;
    const user = currentUser;
    let cancelled = false;

    async function loadBoardState() {
      const { data, error } = await client
        .from("board_states")
        .select("columns, cards_by_column")
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

      const localColumns = latestColumnsRef.current;
      const localCardsByColumn = latestCardsByColumnRef.current;
      const localBoardHasContent = !isStarterBoard(localColumns, localCardsByColumn);
      const remoteColumns = (data?.columns as ColumnDefinition[] | undefined) ?? null;
      const remoteCardsByColumn =
        (data?.cards_by_column as Record<string, CardEntry[]> | undefined) ?? null;
      const remoteBoardExists = Boolean(remoteColumns && remoteCardsByColumn);
      const remoteBoardIsStarter =
        remoteColumns && remoteCardsByColumn
          ? isStarterBoard(remoteColumns, remoteCardsByColumn)
          : false;

      if (remoteBoardExists && remoteColumns && remoteCardsByColumn) {
        if (remoteBoardIsStarter && localBoardHasContent) {
          await client.from("board_states").upsert({
            owner_id: user.id,
            columns: localColumns,
            cards_by_column: localCardsByColumn,
            updated_at: new Date().toISOString(),
          });
        } else {
          skipNextHistoryRef.current = true;
          setColumns(remoteColumns);
          skipNextHistoryRef.current = true;
          setCardsByColumn(remoteCardsByColumn);
        }
      } else {
        await client.from("board_states").upsert({
          owner_id: user.id,
          columns: localColumns,
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
    if (!supabase || !currentUser || !hasLoadedRemoteState) {
      return;
    }

    const client = supabase;
    const user = currentUser;
    const timeout = window.setTimeout(() => {
      void client.from("board_states").upsert({
        owner_id: user.id,
        columns,
        cards_by_column: cardsByColumn,
        updated_at: new Date().toISOString(),
      });
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [cardsByColumn, columns, currentUser, hasLoadedRemoteState, supabase]);

  useEffect(() => {
    if (!supabase || !currentUser || !hasLoadedRemoteState) {
      return;
    }

    const client = supabase;
    const user = currentUser;
    const interval = window.setInterval(() => {
      void client.from("board_states").upsert({
        owner_id: user.id,
        columns,
        cards_by_column: cardsByColumn,
        updated_at: new Date().toISOString(),
      });
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [cardsByColumn, columns, currentUser, hasLoadedRemoteState, supabase]);

  useEffect(() => {
    if (!isActionsMenuOpen) {
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

  async function handleOAuthLogin(provider: "google" | "apple") {
    if (!supabase) {
      return;
    }

    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });
  }

  async function handleSignOut() {
    await supabase?.auth.signOut();
    setIsActionsMenuOpen(false);
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

  function handleDragEnd(event: DragEndEvent) {
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

    const title = draft.title.trim() || "Untitled Game";
    const series = draft.series.trim();
    const imageUrl = draft.imageUrl.trim();
    const duplicate = findDuplicateCard(title);

    if (duplicate) {
      setDraftDuplicateAction({
        match: duplicate,
        title,
        imageUrl,
        series,
      });
      return;
    }

    finalizeAddCard(title, series, imageUrl);
  }

  function finalizeAddCard(title: string, series: string, imageUrl: string) {
    if (!addCardTarget) {
      return;
    }

    const itemId = slugify(title) || makeId("item");
    const newCard: CardEntry = {
      entryId: makeId("entry"),
      itemId,
      title,
      imageUrl,
      series,
    };

    const column = columns.find((item) => item.id === addCardTarget.columnId);
    const destinationCards = cardsByColumn[addCardTarget.columnId] ?? [];
    const nextDestinationCards = [...destinationCards];

    nextDestinationCards.splice(addCardTarget.insertIndex, 0, newCard);

    let nextState = {
      ...cardsByColumn,
      [addCardTarget.columnId]: nextDestinationCards,
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
    setDraftDuplicateAction(null);
  }

  function closeAddGameModal() {
    setAddCardTarget(null);
    setDraft(initialDraft);
    setIsAutofillingDraftImage(false);
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

    if (!title) {
      setDraft((current) => ({
        ...current,
        imageUrl: "",
      }));
      return;
    }

    setIsAutofillingDraftImage(true);

    try {
      const foundImage = await findGameArtwork(title);
      setDraft((current) => ({
        ...current,
        imageUrl: foundImage ?? "",
      }));
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
    const notes = editingCardDraft.notes.trim();
    const duplicate = findDuplicateCard(title, editingCardItemId);

    if (duplicate) {
      setEditingDuplicateAction({
        match: duplicate,
        title,
        imageUrl,
        series,
      });
      return;
    }

    updateCardsForItem(editingCardItemId, (card) => ({
      ...card,
      title,
      imageUrl,
      series,
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
    setAutofillingCardId(editingCardItemId);

    try {
      const foundImage = await findGameArtwork(title);
      setEditingCardDraft((current) =>
        current
          ? {
              ...current,
              imageUrl: foundImage ?? "",
            }
          : current,
      );
    } finally {
      setAutofillingCardId(null);
    }
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
    const newColumn: ColumnDefinition = {
      id: makeId("column"),
      title: `New Column ${nextIndex}`,
      description: "",
      type: "ranked",
      accent: COLUMN_ACCENTS[columns.length % COLUMN_ACCENTS.length] ?? COLUMN_ACCENTS[0],
    };

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
      }));
      closeAddGameModal();
      return;
    }

    finalizeAddCard(
      draftDuplicateAction.title,
      draftDuplicateAction.series,
      draftDuplicateAction.imageUrl,
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
      }));
      cancelEditingCard();
      return;
    }

    const notes = editingCardDraft.notes.trim();
    updateCardsForItem(editingCardItemId, (card) => ({
      ...card,
      title: editingDuplicateAction.title,
      imageUrl: editingDuplicateAction.imageUrl,
      series: editingDuplicateAction.series,
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
          <div
            className={clsx(
              "relative z-50 hidden rounded-[32px] border p-5 shadow-[0_24px_60px_rgba(19,27,68,0.12)] backdrop-blur sm:block",
              isDarkMode
                ? "border-white/10 bg-white/5"
                : "border-white/70 bg-white/80",
            )}
          >
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
                        "absolute right-0 z-40 mt-2 min-w-[220px] rounded-3xl border p-2 shadow-[0_24px_60px_rgba(19,27,68,0.2)] backdrop-blur",
                        isDarkMode
                          ? "border-white/10 bg-slate-950/95 text-slate-100"
                          : "border-slate-200 bg-white/95 text-slate-700",
                      )}
                    >
                      <button
                        className={clsx(
                          "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                          isDarkMode
                            ? "hover:bg-white/10"
                            : "hover:bg-slate-100",
                        )}
                        onClick={() => {
                          setIsDarkMode((current) => !current);
                          setIsActionsMenuOpen(false);
                        }}
                        type="button"
                      >
                        {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        {isDarkMode ? "Lumos" : "Nox"}
                      </button>
                      <button
                        className={clsx(
                          "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                          isDarkMode
                            ? "hover:bg-white/10"
                            : "hover:bg-slate-100",
                        )}
                        onClick={() => {
                          setIsImportModalOpen(true);
                          setIsActionsMenuOpen(false);
                        }}
                        type="button"
                      >
                        <Upload className="h-4 w-4" />
                        Import from Trello
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

          <div className="sm:hidden">
            <button
              aria-label="Open actions"
              className={clsx(
                "fixed bottom-5 right-5 z-[70] inline-flex h-14 w-14 items-center justify-center rounded-full shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
                isDarkMode
                  ? "bg-slate-950 text-white"
                  : "bg-white text-slate-950",
              )}
              onClick={() => setIsMobileActionsOpen(true)}
              type="button"
            >
              <Settings2 className="h-5 w-5" />
            </button>

            {isMobileActionsOpen ? (
              <div className="fixed inset-0 z-[80] bg-slate-950/40 p-4 backdrop-blur-sm">
                <div
                  className={clsx(
                    "mx-auto mt-16 max-w-md rounded-[28px] border p-4 shadow-[0_24px_60px_rgba(19,27,68,0.24)]",
                    isDarkMode
                      ? "border-white/10 bg-slate-900 text-slate-100"
                      : "border-white/70 bg-white text-slate-950",
                  )}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em] opacity-70">
                      Actions
                    </h2>
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

                  <div className="grid gap-3">
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

                    <div className="grid grid-cols-2 gap-3">
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
                              "absolute right-0 z-40 mt-2 min-w-[220px] rounded-3xl border p-2 shadow-[0_24px_60px_rgba(19,27,68,0.2)] backdrop-blur",
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
                              onClick={() => {
                                setIsDarkMode((current) => !current);
                                setIsActionsMenuOpen(false);
                                setIsMobileActionsOpen(false);
                              }}
                              type="button"
                            >
                              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                              {isDarkMode ? "Lumos" : "Nox"}
                            </button>
                            <button
                              className={clsx(
                                "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                                isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                              )}
                              onClick={() => {
                                setIsImportModalOpen(true);
                                setIsActionsMenuOpen(false);
                                setIsMobileActionsOpen(false);
                              }}
                              type="button"
                            >
                              <Upload className="h-4 w-4" />
                              Import from Trello
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
                                Log Out
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
            className={clsx(
              "relative z-0 overflow-hidden rounded-[32px] border p-4 shadow-[0_24px_60px_rgba(19,27,68,0.12)] backdrop-blur",
              isDarkMode
                ? "border-white/10 bg-white/5"
                : "border-white/70 bg-white/60",
            )}
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragEnd={handleDragEnd}
            >
              <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 sm:snap-none">
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
                      isDarkMode={isDarkMode}
                      cards={visibleCards}
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
                      onToggleMenu={() =>
                        setOpenColumnMenuId((current) =>
                          current === column.id ? null : column.id,
                        )
                      }
                      onToggleSortMenu={() =>
                        setOpenColumnSortMenuId((current) =>
                          current === column.id ? null : column.id,
                        )
                      }
                      onDeleteColumn={deleteColumn}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div
              className={clsx(
                "w-full max-w-2xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
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
                    list="series-suggestions"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div
              className={clsx(
                "w-full max-w-2xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Add Game
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Add a new card in place
                  </h2>
                  <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    This will be inserted into{" "}
                    {columns.find((column) => column.id === addCardTarget.columnId)?.title}.
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
                <label className="grid gap-2">
                  <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Title</span>
                  <input
                    className={clsx(
                      "rounded-2xl border px-4 py-3 outline-none transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                        : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                    )}
                    placeholder='"Tears of the Kingdom", "The Last of Us Part II", etc.'
                    value={draft.title}
                    onChange={(event) =>
                      {
                        setDraftDuplicateAction(null);
                        setDraft((current) => ({ ...current, title: event.target.value }));
                      }
                    }
                  />
                </label>

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
                      onChange={(event) =>
                        {
                          setDraftDuplicateAction(null);
                          setDraft((current) => ({
                            ...current,
                            imageUrl: event.target.value,
                          }));
                        }
                      }
                    />
                  </div>
                </label>

                <button
                  className={clsx(
                    "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40 hover:bg-slate-900"
                      : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-950 hover:bg-white",
                  )}
                  onClick={handleAutofillDraftImage}
                  type="button"
                >
                  <WandSparkles className="h-4 w-4" />
                  {isAutofillingDraftImage ? "Finding artwork..." : "Auto-Find Artwork"}
                </button>

                <label className="grid gap-2">
                  <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Series</span>
                  <input
                    className={clsx(
                      "rounded-2xl border px-4 py-3 outline-none transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                        : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                    )}
                    placeholder='"The Legend of Zelda", "Shin Megami Tensei", etc.'
                    value={draft.series}
                    onChange={(event) =>
                      {
                        setDraftDuplicateAction(null);
                        setDraft((current) => ({ ...current, series: event.target.value }));
                      }
                    }
                  />
                </label>

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
                    Add Game
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
            </div>
          </div>
        ) : null}

        {isImportModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div
              className={clsx(
                "w-full max-w-lg rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
                isDarkMode
                  ? "border-white/10 bg-slate-900 text-slate-100"
                  : "border-white/70 bg-white text-slate-950",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Import Trello
                  </p>
                  <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
                    Upload a Trello JSON file
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
                Export your board from Trello as JSON, then upload it here to replace
                the current board on this device.
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
  cards,
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
  onToggleMenu,
  onToggleSortMenu,
  onDeleteColumn,
  onColumnDragStart,
  onColumnDrop,
  draggingColumnId,
  isDarkMode,
}: {
  column: ColumnDefinition;
  cards: CardEntry[];
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
  onToggleMenu: () => void;
  onToggleSortMenu: () => void;
  onDeleteColumn: (columnId: string) => void;
  onColumnDragStart: React.Dispatch<React.SetStateAction<string | null>>;
  onColumnDrop: (sourceColumnId: string, targetColumnId: string) => void;
  draggingColumnId: string | null;
  isDarkMode: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[720px] w-[320px] shrink-0 snap-start flex-col rounded-[28px] border p-3 shadow-[0_24px_44px_rgba(15,23,42,0.18)] sm:snap-align-none",
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
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "720px",
      }}
    >
      <div className={clsx("rounded-[22px] bg-gradient-to-br p-[1px]", column.accent)}>
        <div
          className={clsx(
            "rounded-[21px] p-4",
            isDarkMode ? "bg-slate-950/96" : "bg-white/95",
            !isEditingColumn && "cursor-grab active:cursor-grabbing",
          )}
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
          <div className="flex items-start justify-between gap-3">
            {isEditingColumn && editingColumnDraft ? (
              <div className="w-full space-y-3">
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
                <h2 className="text-lg font-bold">{column.title}</h2>
                <div className="relative">
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
                        "absolute right-0 top-12 z-20 flex w-44 flex-col rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
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
                        onClick={() => onAddCard(column.id, 0)}
                        type="button"
                      >
                        <Plus className="h-4 w-4" />
                        Add card
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
                              "absolute right-full top-0 mr-2 flex min-w-[120px] flex-col rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
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

      <div className="mt-3 flex flex-1 flex-col gap-3">
        {filtering ? (
          cards.map((card, index) => (
            <CardTile
              key={card.entryId}
              card={card}
              rank={isRankedColumn(column) ? index + 1 : null}
              onDelete={() => onDeleteCard(column.id, card.entryId)}
              onEdit={() => onEditCard(card)}
            />
          ))
        ) : (
          <SortableContext
            items={cards.map((card) => card.entryId)}
            strategy={rectSortingStrategy}
          >
            <>
              <AddCardRow
                columnId={column.id}
                isDarkMode={isDarkMode}
                insertIndex={0}
                onClick={() => onAddCard(column.id, 0)}
              />
              {cards.map((card, index) => (
                <div key={card.entryId} className="flex flex-col gap-3">
                  <SortableCard
                    card={card}
                    rank={isRankedColumn(column) ? index + 1 : null}
                    onDelete={() => onDeleteCard(column.id, card.entryId)}
                    onEdit={() => onEditCard(card)}
                  />
                  <AddCardRow
                    columnId={column.id}
                    isDarkMode={isDarkMode}
                    insertIndex={index + 1}
                    onClick={() => onAddCard(column.id, index + 1)}
                  />
                </div>
              ))}
            </>
          </SortableContext>
        )}

        {cards.length === 0 ? (
          <div
            className={clsx(
              "flex flex-1 items-center justify-center rounded-[26px] border border-dashed p-6 text-center text-sm leading-6",
              isDarkMode
                ? "border-white/15 bg-white/[0.03] text-slate-400"
                : "border-slate-200 bg-slate-50 text-slate-500",
            )}
          >
            Drop a card here or use the column menu to add one.
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
  onClick,
}: {
  columnId: string;
  isDarkMode: boolean;
  insertIndex: number;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: makeInsertDropId(columnId, insertIndex),
  });

  return (
    <button
      ref={setNodeRef}
      className={clsx(
        "group flex h-4 items-center gap-3 opacity-0 transition duration-150 hover:opacity-100 focus:opacity-100 focus:outline-none",
        isDarkMode ? "text-slate-300" : "text-slate-400",
        isOver && "opacity-100",
      )}
      onClick={onClick}
      type="button"
      aria-label="Add game here"
    >
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
          isDarkMode
            ? "border-white/15 bg-slate-950 text-white group-hover:border-white/35 group-hover:bg-slate-900 group-focus:border-white/35 group-focus:bg-slate-900"
            : "border-slate-300 bg-white text-slate-700 group-hover:border-slate-500 group-hover:bg-slate-50 group-focus:border-slate-500 group-focus:bg-slate-50",
          isOver &&
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
    </button>
  );
}

function SortableCard({
  card,
  rank,
  onDelete,
  onEdit,
}: {
  card: CardEntry;
  rank: number | null;
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
        rank={rank}
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
  rank,
  dragProps,
  isDragging = false,
  onDelete,
  onEdit,
}: {
  card: CardEntry;
  rank: number | null;
  dragProps?: React.HTMLAttributes<HTMLElement>;
  isDragging?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  return (
    <article
      {...dragProps}
      className={clsx(
        "group relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-900 shadow-[0_20px_40px_rgba(15,23,42,0.25)] cursor-grab active:cursor-grabbing",
        isDragging && "rotate-1 scale-[1.01]",
      )}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "220px",
      }}
    >
      <div
        className="relative min-h-[220px] bg-cover bg-center"
        style={{ backgroundImage: `url(${card.imageUrl || buildFallbackImage(card.title)})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

        <div className="absolute left-3 top-3 flex items-center gap-2">
          {rank ? (
            <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-950">
              #{rank}
            </div>
          ) : null}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="truncate text-xl font-bold text-white">{card.title}</h3>
          {card.notes ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-200">{card.notes}</p>
          ) : null}
        </div>
      </div>

      <div className="absolute right-3 top-3 z-10 flex items-center gap-2 opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
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
