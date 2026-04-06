import clsx from "clsx";

import { loadPublicBoardBySlug } from "@/lib/normalized-board-store";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { BoardFieldDefinition, CardEntry, ShareTierFilter } from "@/lib/types";

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

  return rank <= 20;
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

export default async function SharedBoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return <div className="min-h-screen bg-slate-950 p-8 text-white">Supabase is not configured.</div>;
  }

  const board = await loadPublicBoardBySlug(supabase, slug);

  if (!board) {
    return <div className="min-h-screen bg-slate-950 p-8 text-white">Shared board not found.</div>;
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937_0%,#111827_35%,#020617_100%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1700px] flex-col gap-6">
        <header className="rounded-[28px] border border-white/10 bg-slate-900/85 p-5 shadow-[0_24px_60px_rgba(19,27,68,0.24)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Rankr Share</p>
            <div className="flex flex-wrap gap-2">
            {tierFilter !== "all" ? (
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                {tierFilter.replace("top", "Top ")}
              </span>
            ) : null}
            {selectedSeries ? (
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                {selectedSeries}
              </span>
            ) : null}
            {selectedSearchTerm ? (
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                Search: {selectedSearchTerm}
              </span>
            ) : null}
            </div>
          </div>
          <h1 className="mt-2 text-4xl font-black text-white">{board.title}</h1>
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
                className="flex h-[min(78vh,920px)] min-h-[720px] w-[320px] shrink-0 snap-start flex-col rounded-[28px] border border-slate-800 bg-slate-950 p-3 text-white shadow-[0_24px_44px_rgba(15,23,42,0.18)]"
              >
                <div className={clsx("rounded-[22px] bg-gradient-to-br p-[1px]", column.accent || "from-slate-400 via-slate-500 to-slate-700")}>
                  <div className="rounded-[21px] bg-slate-950/96 p-4 backdrop-blur">
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
                            : "border-white/10";

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
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
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
                    <div className="flex min-h-32 items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-4 text-center text-sm text-slate-400">
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
