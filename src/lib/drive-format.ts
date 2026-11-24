import type { SavedBoard } from "@/lib/types";

export const driveImageFields = ["imageUrl", "mobileBoardImageUrl", "mobileTierListImageUrl"] as const;
export const driveImageReference = /^sorta-image:([a-f0-9]{64})$/;
export const driveBoardId = /^[a-zA-Z0-9_-]+$/;

export const driveImageExtensions: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/tiff": "tiff",
  "image/apng": "apng",
  "image/svg+xml": "svg",
};

export function isDriveBoard(value: unknown): value is SavedBoard {
  if (!value || typeof value !== "object") return false;
  const board = value as Partial<SavedBoard>;
  return typeof board.id === "string" && driveBoardId.test(board.id)
    && typeof board.title === "string"
    && typeof board.createdAt === "string" && Number.isFinite(Date.parse(board.createdAt))
    && typeof board.updatedAt === "string" && Number.isFinite(Date.parse(board.updatedAt))
    && Array.isArray(board.columns) && board.columns.every((column) => column && typeof column.id === "string")
    && !!board.settings && typeof board.settings === "object" && !Array.isArray(board.settings)
    && !!board.cardsByColumn && typeof board.cardsByColumn === "object" && !Array.isArray(board.cardsByColumn)
    && Object.values(board.cardsByColumn).every((cards) => Array.isArray(cards) && cards.every((card) =>
      card && typeof card.entryId === "string" && typeof card.itemId === "string"
      && driveImageFields.every((field) => card[field] === undefined || typeof card[field] === "string"),
    ));
}

export function preserveLocalDriveArtwork(local: SavedBoard, snapshot: SavedBoard, result: SavedBoard) {
  const originalByEntry = new Map(Object.values(local.cardsByColumn).flat().map((card) => [card.entryId, card]));
  const syncedByEntry = new Map(Object.values(snapshot.cardsByColumn).flat().map((card) => [card.entryId, card]));
  for (const card of Object.values(result.cardsByColumn).flat()) {
    const original = originalByEntry.get(card.entryId);
    const synced = syncedByEntry.get(card.entryId);
    if (!original || !synced) continue;
    for (const field of driveImageFields) {
      if (card[field] === synced[field] && original[field] !== undefined) card[field] = original[field];
    }
  }
}
