import { SharedBoardView } from "@/components/shared-board-view";
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

  return <SharedBoardView board={board} />;
}
