import type { Metadata } from "next";
import { cache } from "react";

import { SharedBoardView } from "@/components/shared-board-view";
import { SharedBoardLocalFallback } from "@/components/shared-board-local-fallback";
import { loadLegacyDriveShare } from "@/lib/drive-share";
import { loadPublicBoardBySlug } from "@/lib/normalized-board-store";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Preserve public reads for existing Supabase links. Drive snapshots carry no
// owner field, so the configured verified owner can resolve legacy Drive links.
const loadSharedBoard = cache(async (slug: string) => {
  const supabase = await getSupabaseServerClient();
  const publicBoard = supabase ? await loadPublicBoardBySlug(supabase, slug) : null;
  return {
    board: publicBoard ?? await loadLegacyDriveShare(slug),
    useLocalFallback: !supabase,
  };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { board } = await loadSharedBoard(slug);
  return { title: board?.title || "Sorta Share" };
}

export default async function SharedBoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { board, useLocalFallback } = await loadSharedBoard(slug);
  if (board) return <SharedBoardView board={board} />;
  if (useLocalFallback) return <SharedBoardLocalFallback slug={slug} />;

  return <div className="min-h-screen bg-slate-950 p-8 text-white">Shared board not found.</div>;
}
