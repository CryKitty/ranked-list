import clsx from "clsx";

import { loadPublicBoardBySlug } from "@/lib/normalized-board-store";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937_0%,#111827_35%,#020617_100%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1700px] flex-col gap-6">
        <header className="rounded-[28px] border border-white/10 bg-slate-900/85 p-6 shadow-[0_24px_60px_rgba(19,27,68,0.24)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Rankr Share</p>
          <h1 className="mt-2 text-4xl font-black text-white">{board.title}</h1>
          <p className="mt-2 text-sm text-slate-300">Read-only shared board</p>
        </header>

        <section className="flex gap-2 overflow-x-auto pb-4">
          {board.columns.map((column) => {
            const cards = board.cardsByColumn[column.id] ?? [];
            return (
              <div
                key={column.id}
                className="flex h-[min(78vh,920px)] min-h-[720px] w-[320px] shrink-0 flex-col rounded-[28px] border border-slate-800 bg-slate-950 p-3 text-white shadow-[0_24px_44px_rgba(15,23,42,0.18)]"
              >
                <div className={clsx("rounded-[22px] bg-gradient-to-br p-[1px]", column.accent || "from-slate-400 via-slate-500 to-slate-700")}>
                  <div className="rounded-[21px] bg-slate-950/96 p-4 backdrop-blur">
                    <h2 className="truncate text-lg font-bold">{column.title}</h2>
                  </div>
                </div>
                <div className="mt-3 flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
                  {cards.map((card, index) => (
                    <article
                      key={card.entryId}
                      className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-900"
                    >
                      <div className="relative aspect-video bg-slate-900">
                        {card.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt="" className="absolute inset-0 h-full w-full object-cover" src={card.imageUrl} />
                        ) : null}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                        {!column.dontRank && (column.sortMode ?? "manual") === "manual" ? (
                          <div className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-black text-slate-950">
                            {index + 1}
                          </div>
                        ) : null}
                        <div className="absolute inset-x-0 bottom-0 p-4">
                          {card.series ? (
                            <p className="mb-1 truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                              {card.series}
                            </p>
                          ) : null}
                          <h3 className="truncate text-xl font-bold text-white">{card.title}</h3>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
