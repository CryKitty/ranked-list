import type { Metadata } from "next";

import { SharedBoardView } from "@/components/shared-board-view";
import { SharedBoardLocalFallback } from "@/components/shared-board-local-fallback";
import { loadPublicBoardBySlug } from "@/lib/normalized-board-store";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return {
      title: "Sorta Share",
    };
  }

  const board = await loadPublicBoardBySlug(supabase, slug);
  const title = board?.title || "Sorta Share";

  return {
    title,
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
    return <SharedBoardLocalFallback slug={slug} />;
  }

  const board = await loadPublicBoardBySlug(supabase, slug);

  if (!board) {
    return <div className="min-h-screen bg-slate-950 p-8 text-white">Shared board not found.</div>;
  }

  return <SharedBoardView board={board} />;
}
