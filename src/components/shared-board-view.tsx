"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";

import type { BoardFieldDefinition, CardEntry, SavedBoard, ShareTierFilter } from "@/lib/types";

const SHARED_THEME_STORAGE_KEY = "rankr-shared-theme";
const SHARED_BOARD_TEMPLATE_STORAGE_KEY = "rankboard-shared-template-v1";

function normalizeTitleForShare(value: string) {
  return value.trim().toLowerCase();
}

function matchesTierFilter(index: number, tierFilter: ShareTierFilter) {
  if (tierFilter === "all") {
    return true;
  }

  const rank = index + 1;
  if (tierFilter === "top10") {
    return rank <= 10;
  }

  if (tierFilter === "top15") {
    return rank <= 15;
  }

  if (tierFilter === "top20") {
    return rank <= 20;
  }

  if (tierFilter === "top30") {
    return rank <= 30;
  }

  return false;
}

function matchesSearchFilter(card: CardEntry, searchTerm: string) {
  const normalizedSearch = normalizeTitleForShare(searchTerm);
  if (!normalizedSearch) {
    return true;
  }

  return [card.title, card.series].some((value) =>
    normalizeTitleForShare(value).includes(normalizedSearch),
  );
}

function getTierKey(rank: number | null): Exclude<ShareTierFilter, "all"> | null {
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

  if (rank <= 30) {
    return "top30";
  }

  return null;
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

  const normalizedTitle = normalizeTitleForShare(trimmedTitle);
  const normalizedSeries = normalizeTitleForShare(trimmedSeries);

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

function buildSharedBoardCopy(board: SavedBoard) {
  const shareSettings = board.settings?.publicShare;
  const selectedColumnIds =
    shareSettings?.columnIds && shareSettings.columnIds.length > 0
      ? shareSettings.columnIds
      : board.columns.map((column) => column.id);
  const selectedColumns = board.columns.filter((column) => selectedColumnIds.includes(column.id));
  const tierFilter = shareSettings?.tierFilter ?? "all";
  const selectedSeries = shareSettings?.seriesFilter?.trim() ?? "";
  const selectedSearchTerm = shareSettings?.searchTerm?.trim() ?? "";

  const nextCardsByColumn = Object.fromEntries(
    selectedColumns.map((column) => {
      const scopedCards = (board.cardsByColumn[column.id] ?? []).filter((card) => {
        if (selectedSeries && card.series !== selectedSeries) {
          return false;
        }

        return matchesSearchFilter(card, selectedSearchTerm);
      });

      return [
        column.id,
        scopedCards.filter((_, index) => matchesTierFilter(index, tierFilter)),
      ] as const;
    }),
  ) as SavedBoard["cardsByColumn"];

  const nextColumns = selectedColumns.map((column) => ({
    ...column,
    mirrorsEntireBoard: false,
    autoMirrorToColumnId: undefined,
    excludedMirrorItemIds: [],
    excludeFromBoardMirrors: false,
    confirmMirrorClones: false,
  }));

  return {
    ...board,
    columns: nextColumns,
    cardsByColumn: Object.fromEntries(
      Object.entries(nextCardsByColumn).map(([columnId, cards]) => [
        columnId,
        cards.map((card) => ({
          ...card,
          mirroredFromEntryId: undefined,
        })),
      ]),
    ) as SavedBoard["cardsByColumn"],
  } satisfies SavedBoard;
}

export function SharedBoardView({ board }: { board: SavedBoard }) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    const storedTheme = window.localStorage.getItem(SHARED_THEME_STORAGE_KEY);
    if (storedTheme === "light") {
      return false;
    }

    if (storedTheme === "dark") {
      return true;
    }

    return true;
  });

  useEffect(() => {
    window.localStorage.setItem(SHARED_THEME_STORAGE_KEY, isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  function copyBoardTemplate() {
    const sharedBoardCopy = buildSharedBoardCopy(board);

    try {
      window.localStorage.setItem(SHARED_BOARD_TEMPLATE_STORAGE_KEY, JSON.stringify(sharedBoardCopy));
    } catch {
      return;
    }

    window.location.href = "/?copyShared=1";
  }

  const shareSettings = board.settings?.publicShare;
  const selectedColumnIds =
    shareSettings?.columnIds && shareSettings.columnIds.length > 0
      ? shareSettings.columnIds
      : board.columns.map((column) => column.id);
  const selectedColumns = board.columns.filter((column) => selectedColumnIds.includes(column.id));
  const tierFilter = shareSettings?.tierFilter ?? "all";
  const selectedSeries = shareSettings?.seriesFilter?.trim() ?? "";
  const selectedSearchTerm = shareSettings?.searchTerm?.trim() ?? "";
  const seriesFieldDefinition = (board.settings?.fieldDefinitions ?? []).find(
    (field: BoardFieldDefinition) => field.builtInKey === "series",
  );
  const showSeriesOnCards = Boolean(seriesFieldDefinition?.showOnCardFront) && !board.settings?.collapseCards;

  const boardBackgroundClass = isDarkMode
    ? "bg-[radial-gradient(circle_at_top,#1f2937_0%,#111827_35%,#020617_100%)] text-slate-100"
    : "bg-[radial-gradient(circle_at_top,#fff4d6_0%,#ffe3cf_18%,#fff0e2_38%,#fff4ea_62%,#fff6ef_100%)] text-slate-950";

  const headerClass = isDarkMode
    ? "border-white/10 bg-slate-900/85"
    : "border-white/70 bg-white/80";

  const columnShellClass = isDarkMode
    ? "border-slate-800 bg-slate-950 text-white"
    : "border-slate-200 bg-[#fff7f0] text-slate-950";

  return (
    <main className={clsx("min-h-screen px-4 py-8 sm:px-6 lg:px-8", boardBackgroundClass)}>
      <div className="mx-auto flex max-w-[1700px] flex-col gap-6">
        <header className={clsx("rounded-[28px] border p-4 shadow-[0_24px_60px_rgba(19,27,68,0.24)] backdrop-blur", headerClass)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <p className={clsx("shrink-0 text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                Rankr Share:
              </p>
              {tierFilter !== "all" ? (
                <span className={clsx("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", isDarkMode ? "bg-white/10 text-slate-200" : "bg-white text-slate-700")}>
                  {tierFilter.replace("top", "Top ")}
                </span>
              ) : null}
              {selectedSeries ? (
                <span className={clsx("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", isDarkMode ? "bg-white/10 text-slate-200" : "bg-white text-slate-700")}>
                  {selectedSeries}
                </span>
              ) : null}
              {selectedSearchTerm ? (
                <span className={clsx("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", isDarkMode ? "bg-white/10 text-slate-200" : "bg-white text-slate-700")}>
                  Search: {selectedSearchTerm}
                </span>
              ) : null}
              <h1 className={clsx("min-w-0 truncate text-3xl font-black sm:text-4xl", isDarkMode ? "text-white" : "text-slate-950")}>
                {board.title}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                className={clsx(
                  "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition",
                  isDarkMode ? "bg-white/10 text-white hover:bg-white/15" : "bg-white text-slate-950 hover:bg-slate-100",
                )}
                onClick={() => setIsDarkMode((current) => !current)}
                type="button"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {isDarkMode ? "Lumos" : "Nox"}
              </button>
              <button
                className={clsx(
                  "inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition",
                  isDarkMode ? "bg-white/10 text-white hover:bg-white/15" : "bg-white text-slate-950 hover:bg-slate-100",
                )}
                onClick={copyBoardTemplate}
                type="button"
              >
                Copy Board
              </button>
              <Link
                className={clsx(
                  "inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition",
                  isDarkMode ? "bg-white text-slate-950 hover:bg-slate-200" : "bg-slate-950 text-white hover:bg-slate-800",
                )}
                href="/?new=1"
              >
                Join
              </Link>
            </div>
          </div>
        </header>

        <section className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-4">
          {selectedColumns.map((column) => {
            const scopedCards = (board.cardsByColumn[column.id] ?? []).filter((card) => {
              if (selectedSeries && card.series !== selectedSeries) {
                return false;
              }
              return matchesSearchFilter(card, selectedSearchTerm);
            });
            const cards = scopedCards.filter((_, index) => matchesTierFilter(index, tierFilter));

            return (
              <div
                key={column.id}
                className={clsx(
                  "flex h-[min(78vh,920px)] min-h-[720px] w-[320px] shrink-0 snap-start flex-col rounded-[28px] border p-3 shadow-[0_24px_44px_rgba(15,23,42,0.18)]",
                  columnShellClass,
                )}
              >
                <div className={clsx("rounded-[22px] bg-gradient-to-br p-[1px]", column.accent || "from-slate-400 via-slate-500 to-slate-700")}>
                  <div className={clsx("rounded-[21px] p-4 backdrop-blur", isDarkMode ? "bg-slate-950/96" : "bg-white/92")}>
                    <h2 className="truncate text-lg font-bold">{column.title}</h2>
                  </div>
                </div>
                <div className="mt-3 flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
                  {cards.map((card, index) => {
                    const rank = index + 1;
                    const tierKey = column.dontRank || (column.sortMode ?? "manual") !== "manual" ? null : getTierKey(rank);
                    const { displayTitle, displaySeries } = getDisplayCardText(card.title, card.series, showSeriesOnCards);
                    const tierBorderClass =
                      tierKey === "top10"
                        ? "border-amber-300/80"
                        : tierKey === "top15"
                          ? "border-cyan-300/80"
                          : tierKey === "top20"
                            ? "border-fuchsia-300/80"
                            : tierKey === "top30"
                              ? "border-emerald-300/80"
                            : isDarkMode
                              ? "border-white/10"
                              : "border-slate-300";

                    return (
                      <article
                        key={card.entryId}
                        className={clsx("shrink-0 overflow-hidden rounded-[28px] border bg-slate-900", tierBorderClass)}
                      >
                        <div className="relative aspect-video bg-slate-900">
                          {card.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img alt="" className="absolute inset-0 h-full w-full object-cover" src={card.imageUrl} />
                          ) : null}
                          <div className="absolute inset-x-0 bottom-0 h-[64%] bg-gradient-to-t from-slate-950 via-slate-950/32 to-transparent" />
                          {!column.dontRank && (column.sortMode ?? "manual") === "manual" ? (
                            <div
                              className={clsx(
                                "absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-black",
                                tierKey === "top10"
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
                              {rank}
                            </div>
                          ) : null}
                          <div className="absolute inset-x-0 bottom-0 p-4">
                            {displaySeries ? (
                              <p className="mb-1 truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                                {displaySeries}
                              </p>
                            ) : null}
                            <h3 className="truncate text-xl font-bold text-white">{displayTitle}</h3>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {cards.length === 0 ? (
                    <div
                      className={clsx(
                        "flex min-h-32 items-center justify-center rounded-[24px] border border-dashed px-4 text-center text-sm",
                        isDarkMode
                          ? "border-white/10 bg-white/[0.02] text-slate-400"
                          : "border-slate-300 bg-white/70 text-slate-500",
                      )}
                    >
                      Nothing in this shared view.
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
