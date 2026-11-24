"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { driveImageFields } from "@/lib/drive-format";
import type { SavedBoard } from "@/lib/types";

class DriveRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function driveRequest<T>(action: string, options?: RequestInit): Promise<T> {
  const response = await fetch("/api/drive/" + action, { cache: "no-store", ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new DriveRequestError(body?.error ?? "Google Drive sync could not complete. Try again.", response.status);
  }
  return response.json();
}

const UPLOADED_ARTWORK_KEY = "sorta-uploaded-artwork-v1";

function readUploadedArtwork(): Set<string> {
  try {
    const hashes: unknown = JSON.parse(window.localStorage.getItem(UPLOADED_ARTWORK_KEY) ?? "[]");
    if (Array.isArray(hashes)) {
      return new Set(hashes.filter((hash): hash is string => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)));
    }
  } catch {
    // Sync can proceed with an in-memory cache if browser storage is unavailable.
  }
  return new Set();
}

function clearUploadedArtwork() {
  try {
    window.localStorage.removeItem(UPLOADED_ARTWORK_KEY);
  } catch {
    // Browser storage may be unavailable.
  }
}

export function signInWithGoogle() {
  // A new sign-in can target a different Drive account.
  clearUploadedArtwork();
  window.location.assign("/api/drive/login");
}

type DriveSession = { enabled: boolean; signedIn: boolean };

export function useDriveSync(
  boards: SavedBoard[],
  localReady: boolean,
  importBoards: (boards: SavedBoard[]) => void,
  isDisposableStarter: (board: SavedBoard) => boolean,
) {
  const [session, setSession] = useState<DriveSession>({ enabled: false, signedIn: false });
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const versions = useRef(new Map<string, number>());
  const uploadedArtwork = useRef(new Set<string>());
  const pending = useRef<Promise<boolean> | null>(null);
  const latestBoards = useRef(boards);
  const connection = useRef<AbortController | null>(null);

  useEffect(() => {
    latestBoards.current = boards;
  }, [boards]);

  const reportError = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : "Google Drive sync could not complete. Try again.");
    if (cause instanceof DriveRequestError && cause.status === 401) {
      connection.current?.abort();
      setSession({ enabled: true, signedIn: false });
      setReady(false);
      uploadedArtwork.current.clear();
      clearUploadedArtwork();
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    uploadedArtwork.current = readUploadedArtwork();
    const url = new URL(window.location.href);
    if (url.searchParams.get("drive") === "sign-in-failed") {
      setError("Google sign-in could not complete. Try connecting again.");
      url.searchParams.delete("drive");
      window.history.replaceState(window.history.state, "", url);
    }
    void driveRequest<DriveSession>("session", { signal: controller.signal }).then(
      (next) => { if (!controller.signal.aborted) setSession(next); },
      () => { /* Local boards remain available if the session check fails. */ },
    );
    return () => controller.abort();
  }, []);

  const pull = useCallback(async (signal: AbortSignal) => {
    const remote = await driveRequest<SavedBoard[]>("boards", { signal });
    if (signal.aborted) return;
    versions.current = new Map(remote.map((board) => [board.id, Date.parse(board.updatedAt)]));
    importBoards(remote);
    setReady(true);
    setLastSyncAt(new Date().toISOString());
  }, [importBoards]);

  useEffect(() => {
    if (!localReady || !session.signedIn) return;
    const controller = new AbortController();
    connection.current = controller;
    setReady(false);
    setError(null);
    setSyncing(true);
    void pull(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) reportError(cause);
    }).finally(() => {
      if (!controller.signal.aborted) setSyncing(false);
    });
    return () => controller.abort();
  }, [localReady, session.signedIn, pull, reportError]);

  const prepareSnapshot = useCallback(async (
    board: SavedBoard,
    { signal, uploadArtwork = true }: { signal?: AbortSignal; uploadArtwork?: boolean } = {},
  ) => {
    const uploadsByHash = new Map<string, Promise<unknown>>();
    async function resolveArtwork(url: string) {
      // Both URL schemes resolve entirely in the browser.
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error("A local board image could not be read.");
      const bytes = await response.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (uploadArtwork && !uploadedArtwork.current.has(hash)) {
        let upload = uploadsByHash.get(hash);
        if (!upload) {
          upload = driveRequest("image", {
            method: "POST",
            headers: { "Content-Type": response.headers.get("content-type") ?? "" },
            body: bytes,
            signal,
          }).then(() => {
            if (signal?.aborted) return;
            uploadedArtwork.current.add(hash);
            try {
              const hashes = readUploadedArtwork();
              hashes.add(hash);
              window.localStorage.setItem(UPLOADED_ARTWORK_KEY, JSON.stringify([...hashes]));
            } catch {
              // Keep the in-memory hash if browser storage is unavailable or full.
            }
          });
          uploadsByHash.set(hash, upload);
        }
        await upload;
      }
      return "sorta-image:" + hash;
    }

    const cardsByColumn: SavedBoard["cardsByColumn"] = Object.create(null);
    const artworkTargets = new Map<string, Array<{
      card: SavedBoard["cardsByColumn"][string][number];
      field: typeof driveImageFields[number];
    }>>();
    for (const [columnId, cards] of Object.entries(board.cardsByColumn)) {
      cardsByColumn[columnId] = cards.map((card) => {
        const next = { ...card };
        for (const field of driveImageFields) {
          const url = card[field]?.trim();
          if (!url || !/^(data:|blob:)/i.test(url)) continue;
          const targets = artworkTargets.get(url) ?? [];
          targets.push({ card: next, field });
          artworkTargets.set(url, targets);
        }
        return next;
      });
    }

    const artwork = [...artworkTargets];
    for (let offset = 0; offset < artwork.length; offset += 4) {
      const results = await Promise.allSettled(artwork.slice(offset, offset + 4).map(async ([url, targets]) => {
        const reference = await resolveArtwork(url);
        for (const { card, field } of targets) card[field] = reference;
      }));
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
    }
    return { ...board, cardsByColumn };
  }, []);

  const sync = useCallback(async () => {
    const signal = connection.current?.signal;
    if (!session.signedIn || !signal || signal.aborted) return false;
    if (pending.current) await pending.current;
    if (signal.aborted) return false;
    // Multiple callers may have been waiting on the previous batch.
    if (pending.current) return pending.current;

    const write = (async () => {
      setSyncing(true);
      setError(null);
      try {
        if (!ready) {
          await pull(signal);
          return !signal.aborted;
        }
        for (const board of latestBoards.current) {
          const version = Date.parse(board.updatedAt);
          const remoteVersion = versions.current.get(board.id);
          if (remoteVersion === undefined && isDisposableStarter(board)) continue;
          if ((remoteVersion ?? -Infinity) >= version) continue;
          const snapshot = await prepareSnapshot(board, { signal });
          await driveRequest("boards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(snapshot),
            signal,
          });
          versions.current.set(board.id, version);
          setLastSyncAt(new Date().toISOString());
        }
        return true;
      } catch (cause) {
        if (!signal.aborted) reportError(cause);
        return false;
      } finally {
        setSyncing(false);
      }
    })();
    pending.current = write;
    try {
      return await write;
    } finally {
      if (pending.current === write) pending.current = null;
    }
  }, [isDisposableStarter, prepareSnapshot, pull, ready, reportError, session.signedIn]);

  useEffect(() => {
    if (!ready || !session.signedIn ||
        !boards.some((board) => {
          const remoteVersion = versions.current.get(board.id);
          return (remoteVersion !== undefined || !isDisposableStarter(board))
            && (remoteVersion ?? -Infinity) < Date.parse(board.updatedAt);
        })) return;
    const timer = window.setTimeout(() => { void sync(); }, 1000);
    return () => window.clearTimeout(timer);
  }, [boards, isDisposableStarter, ready, session.signedIn, sync]);

  useEffect(() => {
    if (!session.signedIn) return;
    const retry = () => { void sync(); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [session.signedIn, sync]);

  async function signOut() {
    try {
      await driveRequest("logout", { method: "POST" });
      connection.current?.abort();
      setSession({ enabled: true, signedIn: false });
      setReady(false);
      setError(null);
      uploadedArtwork.current.clear();
      clearUploadedArtwork();
    } catch (cause) {
      reportError(cause);
    }
  }

  return { ...session, error, lastSyncAt, syncing, sync, signOut, prepareSnapshot };
}
