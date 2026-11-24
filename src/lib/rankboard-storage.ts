export const LOCAL_STORAGE_KEY = "rankboard-state-v1";
export const LOCAL_BACKUP_STORAGE_KEY = "rankboard-backups-v1";
export const PAIRWISE_QUIZ_PROGRESS_STORAGE_KEY = "rankboard-pairwise-progress-v1";
export const SHARED_BOARD_TEMPLATE_STORAGE_KEY = "rankboard-shared-template-v1";
export const SHARED_THEME_STORAGE_KEY = "rankr-shared-theme";
export const THEME_STORAGE_KEY = "rankboard-theme-v1";
export const LAST_ACTIVE_BOARD_KEY = "rankboard-last-active-board-v1";

export function getUserBoardCacheKey(userId: string) {
  return `rankboard-user-${userId}-v2`;
}

export function getLastActiveBoardStorageKey(userId?: string | null) {
  return userId ? `${LAST_ACTIVE_BOARD_KEY}-${userId}` : LAST_ACTIVE_BOARD_KEY;
}

export function getPairwiseQuizProgressStorageKey(userId?: string | null) {
  return userId
    ? `${PAIRWISE_QUIZ_PROGRESS_STORAGE_KEY}-${userId}`
    : PAIRWISE_QUIZ_PROGRESS_STORAGE_KEY;
}

export function readStoredPreferredBoardId(userId?: string | null) {
  try {
    if (userId) {
      return (
        window.localStorage.getItem(getLastActiveBoardStorageKey(userId)) ??
        window.localStorage.getItem(getLastActiveBoardStorageKey())
      );
    }

    return window.localStorage.getItem(getLastActiveBoardStorageKey());
  } catch {
    return null;
  }
}

const BOARD_DATABASE = "sorta-local-boards";
const BOARD_STORE = "snapshots";

function openBoardDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(BOARD_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(BOARD_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let pendingBoardWrite: Promise<void> = Promise.resolve();

export async function readLocalBoardState(): Promise<string | null> {
  await pendingBoardWrite;
  try {
    const cached = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached !== null) return cached;
  } catch {
    // The browser may allow IndexedDB even when localStorage is unavailable.
  }

  const db = await openBoardDatabase();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const request = db.transaction(BOARD_STORE).objectStore(BOARD_STORE).get(LOCAL_STORAGE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export function writeLocalBoardState(serialized: string) {
  const write = pendingBoardWrite.then(async () => {
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
      return;
    } catch {
      // Inline artwork can exceed the localStorage quota. Save the entire board
      // and its image bytes together before clearing the older copy.
    }

    const db = await openBoardDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(BOARD_STORE, "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.objectStore(BOARD_STORE).put(serialized, LOCAL_STORAGE_KEY);
      });
    } finally {
      db.close();
    }
    try {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // localStorage may be disabled.
    }
  });
  pendingBoardWrite = write.catch(() => {});
  return write;
}
