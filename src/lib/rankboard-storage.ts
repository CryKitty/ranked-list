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
