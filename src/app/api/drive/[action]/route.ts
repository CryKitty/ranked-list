import { NextRequest, NextResponse } from "next/server";

import { buildBoardChangeHistory } from "@/lib/board-change-history";
import {
  beginDriveLogin, clearDriveSession, driveAccessToken, driveConfig, DriveAuthError,
  finishDriveLogin, readDriveSession, SESSION_COOKIE, STATE_COOKIE,
} from "@/lib/drive-auth";
import { driveBoardId, driveImageExtensions, isDriveBoard } from "@/lib/drive-format";
import {
  findDriveImage, getSortaFolder, MAX_DRIVE_IMAGE_BYTES, readDriveBoardHistory,
  readDriveImage, readNewestDriveBoards, writeDriveBoard, writeDriveImage,
} from "@/lib/drive-store";

type Context = RouteContext<"/api/drive/[action]">;
const noStore = { "Cache-Control": "no-store" };

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: noStore });
}

function error(message: string, status: number) {
  return json({ error: message }, status);
}

function failedRequest(cause: unknown) {
  if (cause instanceof DriveAuthError) return error("Sign in with Google to reconnect Drive.", 401);
  console.error("Sorta Drive sync:", cause instanceof Error ? cause.message : "Unexpected error");
  return error("Google Drive sync could not complete. Try again.", 502);
}

export async function GET(request: NextRequest, { params }: Context) {
  const { action } = await params;
  const { origin, searchParams } = request.nextUrl;
  const config = driveConfig(origin);
  const session = config && await readDriveSession(config, request.cookies.get(SESSION_COOKIE)?.value);

  if (action === "session") return json({ enabled: !!config, signedIn: !!session });
  if (!config) return error("Google Drive sync is unavailable.", 404);
  if (action === "login") return beginDriveLogin(config);
  if (action === "callback") return finishDriveLogin(config, searchParams, request.cookies.get(STATE_COOKIE)?.value);
  if (!session) return error("Sign in with Google to connect Drive.", 401);

  try {
    const token = await driveAccessToken(config, session);
    if (action === "boards") return json(await readNewestDriveBoards(token, await getSortaFolder(token, true)));

    if (action === "history") {
      const id = searchParams.get("boardId") ?? "";
      if (!driveBoardId.test(id)) return error("Invalid board ID.", 400);
      const folder = await getSortaFolder(token);
      const snapshots = folder ? await readDriveBoardHistory(token, folder, id) : [];
      return json(buildBoardChangeHistory(snapshots));
    }

    if (action === "image") {
      const hash = searchParams.get("hash") ?? "";
      if (!/^[a-f0-9]{64}$/.test(hash)) return error("Invalid image hash.", 400);
      const folder = await getSortaFolder(token);
      const file = folder && await findDriveImage(token, folder, hash);
      if (!file) return error("Drive image was not found.", 404);
      const etag = `"${hash}"`;
      const headers = {
        // Image bytes are immutable for a given SHA-256 hash.
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        "Cross-Origin-Resource-Policy": "same-origin",
      };
      if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
      const { bytes, mimeType } = await readDriveImage(token, file, hash);
      return new Response(bytes, { headers: { ...headers, "Content-Type": mimeType } });
    }

    return error("Drive action was not found.", 404);
  } catch (cause) {
    return failedRequest(cause);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  const { action } = await params;
  const config = driveConfig(request.nextUrl.origin);
  if (!config || request.headers.get("origin") !== config.origin) return error("Drive origin is not allowed.", 403);

  if (action === "logout") return clearDriveSession(json({ signedIn: false }), config);
  const session = await readDriveSession(config, request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return error("Sign in with Google to connect Drive.", 401);

  try {
    if (action === "boards") {
      const board: unknown = await request.json().catch(() => null);
      if (!isDriveBoard(board)) return error("Invalid board snapshot.", 400);
      const token = await driveAccessToken(config, session);
      await writeDriveBoard(token, await getSortaFolder(token, true), board);
      return json({ saved: true });
    }

    if (action === "image") {
      const mimeType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
      if (!Object.hasOwn(driveImageExtensions, mimeType)) return error("Unsupported Drive image format.", 415);
      if (Number(request.headers.get("content-length")) > MAX_DRIVE_IMAGE_BYTES) return error("Image is too large.", 413);
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_DRIVE_IMAGE_BYTES) return error("Invalid image size.", 413);
      const token = await driveAccessToken(config, session);
      return json({ hash: await writeDriveImage(token, await getSortaFolder(token, true), mimeType, bytes) });
    }

    return error("Drive action was not found.", 404);
  } catch (cause) {
    return failedRequest(cause);
  }
}
