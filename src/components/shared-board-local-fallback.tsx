"use client";

import { useSyncExternalStore } from "react";

import { SharedBoardView } from "@/components/shared-board-view";
import { LOCAL_STORAGE_KEY } from "@/lib/rankboard-storage";
import type { SavedBoard } from "@/lib/types";

function subscribe() {
  return () => {};
}

function readLocalSnapshot() {
  try {
    return window.localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

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
  // React compares snapshots by identity. Parse only after reading the stable string.
  const rawState = useSyncExternalStore(subscribe, readLocalSnapshot, () => undefined);

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
