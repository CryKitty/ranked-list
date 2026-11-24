import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

import { DriveAuthError } from "@/lib/drive-auth";
import { driveImageExtensions, isDriveBoard } from "@/lib/drive-format";
import type { SavedBoard } from "@/lib/types";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const ROOT_FOLDERS = `'root' in parents and name = 'Sorta' and mimeType = '${FOLDER_MIME}'`;
const SNAPSHOT_NAME = /^board-(.+)-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.json\.gz$/i;
const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
export const MAX_DRIVE_IMAGE_BYTES = 16 * 1024 * 1024;

type DriveFile = { id: string; name: string; createdTime: string; mimeType: string };

async function driveFetch(token: string, url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", "Bearer " + token);
  const response = await fetch(url, { ...init, headers, cache: "no-store" });

  if (response.status === 401) throw new DriveAuthError("Google authorization expired.");
  if (!response.ok) throw new Error(`Drive request failed (${response.status}).`);
  return response;
}

async function listFiles(token: string, query: string) {
  const files: DriveFile[] = [];
  const params = new URLSearchParams({
    q: `trashed = false and ${query}`,
    fields: "nextPageToken,files(id,name,createdTime,mimeType)",
    pageSize: "1000",
    spaces: "drive",
  });
  do {
    const response = await driveFetch(token, DRIVE_API + "?" + params);
    const page = await response.json() as { files?: DriveFile[]; nextPageToken?: string };
    files.push(...(page.files ?? []));
    if (!page.nextPageToken) break;
    params.set("pageToken", page.nextPageToken);
  } while (true);
  return files;
}

function newestFirst(a: DriveFile, b: DriveFile) {
  return Date.parse(b.createdTime) - Date.parse(a.createdTime) || b.id.localeCompare(a.id);
}

const pendingFolders = new Map<string, Promise<string>>();

export async function getSortaFolder(token: string, create: true): Promise<string>;
export async function getSortaFolder(token: string, create?: false): Promise<string | null>;
export async function getSortaFolder(token: string, create = false) {
  if (!create) return (await listFiles(token, ROOT_FOLDERS)).sort(newestFirst).at(-1)?.id ?? null;

  const pending = pendingFolders.get(token);
  if (pending) return pending;

  const lookup = (async () => {
    const existing = await getSortaFolder(token);
    if (existing) return existing;
    const response = await driveFetch(token, DRIVE_API + "?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sorta", mimeType: FOLDER_MIME, parents: ["root"] }),
    });
    const created = await response.json() as { id: string };
    return await getSortaFolder(token) ?? created.id;
  })();
  pendingFolders.set(token, lookup);
  try {
    return await lookup;
  } finally {
    pendingFolders.delete(token);
  }
}

function folderQuery(folder: string) {
  return `'${folder.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}' in parents`;
}

async function download(token: string, file: DriveFile) {
  return driveFetch(token, DRIVE_API + "/" + encodeURIComponent(file.id) + "?alt=media");
}

async function upload(token: string, folder: string, name: string, mimeType: string, bytes: Uint8Array<ArrayBuffer>) {
  const boundary = randomUUID();
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify({ name, mimeType, parents: [folder] }),
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    bytes,
    `\r\n--${boundary}--\r\n`,
  ]);
  await driveFetch(token, UPLOAD_API, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
}

async function listSnapshots(token: string, folder: string) {
  const files = await listFiles(token, folderQuery(folder) + " and name contains 'board-'");
  return files.sort(newestFirst).flatMap((file) => {
    const match = SNAPSHOT_NAME.exec(file.name);
    return match ? [{ file, boardId: match[1] }] : [];
  });
}

async function readSnapshot(token: string, file: DriveFile, boardId: string) {
  const response = await download(token, file);
  const bytes = Buffer.from(await response.arrayBuffer());
  const board: unknown = JSON.parse(gunzipSync(bytes, { maxOutputLength: MAX_SNAPSHOT_BYTES }).toString("utf8"));
  if (!isDriveBoard(board) || board.id !== boardId) throw new Error("Invalid Drive board snapshot.");
  return board;
}

export async function readNewestDriveBoards(token: string, folder: string) {
  const seen = new Set<string>();
  const boards: SavedBoard[] = [];
  for (const { file, boardId } of await listSnapshots(token, folder)) {
    if (seen.has(boardId)) continue;
    seen.add(boardId);
    boards.push(await readSnapshot(token, file, boardId));
  }
  return boards;
}

export async function readDriveBoardHistory(token: string, folder: string, boardId: string) {
  const files = (await listSnapshots(token, folder)).filter((snapshot) => snapshot.boardId === boardId).slice(0, 101);
  const rows = [];
  for (const { file } of files) {
    rows.push({ id: file.id, created_at: file.createdTime, snapshot: await readSnapshot(token, file, boardId) });
  }
  return rows;
}

export async function writeDriveBoard(token: string, folder: string, board: SavedBoard) {
  const snapshot: SavedBoard = {
    id: board.id,
    title: board.title,
    columns: board.columns,
    cardsByColumn: board.cardsByColumn,
    settings: board.settings,
    isPublic: board.isPublic ?? false,
    publicSlug: board.publicSlug ?? null,
    lastPublishedAt: board.lastPublishedAt ?? null,
    defaultSelectedAt: board.defaultSelectedAt ?? null,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
  const json = JSON.stringify(snapshot);
  if (Buffer.byteLength(json) > MAX_SNAPSHOT_BYTES) throw new Error("Board snapshot is too large.");
  await upload(token, folder, `board-${board.id}-${randomUUID()}.json.gz`, "application/gzip", gzipSync(json));
}

export async function findDriveImage(token: string, folder: string, hash: string) {
  const files = await listFiles(token, folderQuery(folder) + ` and name contains 'image-${hash}.'`);
  const filename = new RegExp(`^image-${hash}\\.[a-zA-Z0-9]+$`);
  return files.find((file) => filename.test(file.name) && file.mimeType !== FOLDER_MIME);
}

export async function writeDriveImage(token: string, folder: string, mimeType: string, bytes: ArrayBuffer) {
  const hash = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  if (!await findDriveImage(token, folder, hash)) {
    await upload(token, folder, `image-${hash}.${driveImageExtensions[mimeType]}`, mimeType, new Uint8Array(bytes));
  }
  return hash;
}

export async function readDriveImage(token: string, file: DriveFile, hash: string) {
  const response = await download(token, file);
  const bytes = await response.arrayBuffer();
  if (createHash("sha256").update(new Uint8Array(bytes)).digest("hex") !== hash) {
    throw new Error("Drive image hash does not match its filename.");
  }
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const mimeType = Object.keys(driveImageExtensions).find((type) => driveImageExtensions[type] === extension)
    ?? (extension === "jpeg" ? "image/jpeg" : "application/octet-stream");
  return { bytes, mimeType };
}
