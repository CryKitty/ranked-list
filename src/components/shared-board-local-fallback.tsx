"use client";

import { useEffect, useState } from "react";

import { SharedBoardView } from "@/components/shared-board-view";
import { readLocalBoardState } from "@/lib/rankboard-storage";
import type { SavedBoard } from "@/lib/types";

function readLocalSharedBoard(rawState: string | null, slug: string) {
  try {
    const parsedState = rawState ? JSON.parse(rawState) : null;
    const localBoards = Array.isArray(parsedState?.boards)
      ? parsedState.boards as SavedBoard[]
      : [];

    return localBoards.find((item) => item.isPublic && item.publicSlug === slug) ?? null;
  } catch {
    return null;
  }
}

export function SharedBoardLocalFallback({ slug }: { slug: string }) {
  const [rawState, setRawState] = useState<string | null>();
  useEffect(() => {
    let cancelled = false;
    void readLocalBoardState().then(
      (snapshot) => { if (!cancelled) setRawState(snapshot); },
      () => { if (!cancelled) setRawState(null); },
    );
    return () => { cancelled = true; };
  }, []);

  if (rawState === undefined) {
    return <div className="min-h-screen bg-slate-950 p-8 text-white">Loading shared board...</div>;
  }

  const board = readLocalSharedBoard(rawState, slug);
  if (!board) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-white">
        Shared board not found in this preview browser.
      </div>
    );
  }

  return <SharedBoardView board={board} />;
}
