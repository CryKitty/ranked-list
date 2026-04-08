"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";

import { getArtworkDisplayUrl } from "@/lib/artwork-url";
import {
  getDisplayCardText,
  getTierKey,
  matchesCardSearch,
  matchesTierFilterByIndex,
} from "@/lib/rankboard-display";
import {
  SHARED_BOARD_TEMPLATE_STORAGE_KEY,
  SHARED_THEME_STORAGE_KEY,
} from "@/lib/rankboard-storage";
import type { BoardFieldDefinition, SavedBoard } from "@/lib/types";

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

        return matchesCardSearch(card, selectedSearchTerm);
      });

      return [
        column.id,
        scopedCards.filter((_, index) => matchesTierFilterByIndex(index, tierFilter)),
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
    title: shareSettings?.title?.trim() || board.title,
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
  const [isMobileViewport, setIsMobileViewport] = useState(false);
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
    if (typeof window === "undefined") {
      return;
    }

    const root = document.documentElement;
    const visualViewport = window.visualViewport;

    const syncAppHeight = () => {
      const nextHeight = visualViewport?.height ?? window.innerHeight;
      root.style.setProperty("--app-height", `${Math.round(nextHeight)}px`);
    };

    syncAppHeight();

    if (!isMobileViewport) {
      return () => {
        root.style.setProperty("--app-height", "100dvh");
      };
    }

    visualViewport?.addEventListener("resize", syncAppHeight);
    visualViewport?.addEventListener("scroll", syncAppHeight);
    window.addEventListener("resize", syncAppHeight);
    window.addEventListener("orientationchange", syncAppHeight);

    return () => {
      visualViewport?.removeEventListener("resize", syncAppHeight);
      visualViewport?.removeEventListener("scroll", syncAppHeight);
      window.removeEventListener("resize", syncAppHeight);
      window.removeEventListener("orientationchange", syncAppHeight);
      root.style.setProperty("--app-height", "100dvh");
    };
  }, [isMobileViewport]);

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
  const sharedTitle = shareSettings?.title?.trim() || board.title;
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
  const mobileBoardLaneInset = "clamp(0.25rem, 4vw, 1rem)";
  const scopedColumns = useMemo(
    () =>
      selectedColumns.map((column) => {
        const scopedCards = (board.cardsByColumn[column.id] ?? []).filter((card) => {
          if (selectedSeries && card.series !== selectedSeries) {
            return false;
          }
          return matchesCardSearch(card, selectedSearchTerm);
        });

        return {
          column,
          cards: scopedCards.filter((_, index) => matchesTierFilterByIndex(index, tierFilter)),
        };
      }),
    [board.cardsByColumn, selectedColumns, selectedSearchTerm, selectedSeries, tierFilter],
  );

  return (
    <div
      className={clsx(
        "h-[var(--app-height)] overflow-hidden pt-[env(safe-area-inset-top)] transition-colors sm:h-auto sm:min-h-[var(--app-height)] sm:overflow-visible",
        boardBackgroundClass,
      )}
    >
      <main className="mx-auto flex h-[var(--app-height)] min-h-0 w-full max-w-[1700px] flex-col gap-3 overflow-hidden px-4 pb-[calc(env(safe-area-inset-bottom)+0.1rem)] pt-3 sm:min-h-[var(--app-height)] sm:gap-6 sm:overflow-visible sm:px-6 sm:pb-[calc(env(safe-area-inset-bottom)+0.25rem)] sm:pt-6 lg:px-8">
        <header className={clsx("rounded-[28px] border p-3 shadow-[0_24px_60px_rgba(19,27,68,0.24)] backdrop-blur sm:p-4", headerClass)}>
          <div className="flex flex-col items-center justify-center gap-3 text-center sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:text-left">
            <div className="flex min-w-0 items-center justify-center gap-3">
              <h1 className={clsx("min-w-0 truncate text-3xl font-black sm:text-4xl", isDarkMode ? "text-white" : "text-slate-950")}>
                {sharedTitle}
              </h1>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
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

        <section
          className={clsx(
            "scrollbar-hidden relative z-10 flex w-full min-w-0 max-w-full flex-1 items-start overflow-x-auto overflow-y-hidden pb-[calc(env(safe-area-inset-bottom)+0.1rem)]",
            isMobileViewport
              ? "snap-x snap-mandatory gap-4 px-0"
              : "snap-x snap-mandatory gap-2 px-6 sm:px-0 sm:snap-none",
          )}
          style={
            isMobileViewport
              ? {
                  paddingInline: mobileBoardLaneInset,
                  scrollPaddingInline: mobileBoardLaneInset,
                  touchAction: "pan-x",
                  overscrollBehaviorX: "contain",
                  overscrollBehaviorY: "none",
                  overscrollBehavior: "contain",
                  WebkitOverflowScrolling: "touch",
                }
              : undefined
          }
        >
          {scopedColumns.map(({ column, cards }) => {
            return (
              <div
                key={column.id}
                className={clsx(
                  "flex shrink-0 snap-start flex-col rounded-[28px] border p-2.5 shadow-[0_24px_44px_rgba(15,23,42,0.18)] sm:h-[min(78vh,920px)] sm:min-h-[720px] sm:p-3",
                  isMobileViewport
                    ? "h-[min(calc(var(--app-height)-8.85rem),892px)] min-h-[min(calc(var(--app-height)-8.85rem),832px)] w-[min(88vw,348px)] snap-center"
                    : "h-[min(82dvh,980px)] min-h-[min(82dvh,940px)] w-[320px]",
                  columnShellClass,
                )}
              >
                <div className={clsx("rounded-[22px] bg-gradient-to-br p-[1px]", column.accent || "from-slate-400 via-slate-500 to-slate-700")}>
                  <div className={clsx("rounded-[21px] p-4 backdrop-blur", isDarkMode ? "bg-slate-950/96" : "bg-white/92")}>
                    <h2 className="truncate text-lg font-bold">{column.title}</h2>
                  </div>
                </div>
                <div
                  className="scrollbar-hidden mt-2 flex flex-1 flex-col gap-1.5 overflow-y-auto pr-1 sm:mt-3 sm:gap-3"
                  style={{
                    overscrollBehaviorY: "contain",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
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
                            <img alt="" className="absolute inset-0 h-full w-full object-cover" src={getArtworkDisplayUrl(card.imageUrl)} />
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
                              <p className="mb-1 truncate text-xs font-semibold uppercase tracking-[0.18em] text-white">
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
      </main>
    </div>
  );
}
