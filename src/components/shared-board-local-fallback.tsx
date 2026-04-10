"use client";

import { useCallback, useSyncExternalStore } from "react";

import { SharedBoardView } from "@/components/shared-board-view";
import { LOCAL_STORAGE_KEY } from "@/lib/rankboard-storage";
import type { SavedBoard } from "@/lib/types";

function readLocalSharedBoard(slug: string) {
  try {
    const rawState = window.localStorage.getItem(LOCAL_STORAGE_KEY);
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
  const subscribe = useCallback(() => () => {}, []);
  const board = useSyncExternalStore(
    subscribe,
    () => readLocalSharedBoard(slug),
    () => undefined,
  );

  if (board === undefined) {
    return <div className="min-h-screen bg-slate-950 p-8 text-white">Loading shared board...</div>;
  }

  if (!board) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-white">
        Shared board not found in this preview browser.
      </div>
    );
  }

  return <SharedBoardView board={board} />;
}
