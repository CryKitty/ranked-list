import { cookies, headers } from "next/headers";

import { driveAccessToken, driveConfig, readDriveSession, SESSION_COOKIE } from "@/lib/drive-auth";
import { getSortaFolder, readNewestDriveBoards } from "@/lib/drive-store";

export async function loadLegacyDriveShare(slug: string) {
  const owner = process.env.SHARE_LEGACY_OWNER_EMAIL?.trim().toLowerCase();
  if (!owner) return null;

  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const value = cookieStore.get(SESSION_COOKIE)?.value;
  const host = requestHeaders.get("host");
  if (!value || !host) return null;

  // Session cookies are authenticated against the configured origin. Try both
  // schemes because local previews may use HTTP behind a reverse proxy.
  for (const scheme of ["https:", "http:"]) {
    const origin = URL.parse(scheme + "//" + host)?.origin;
    const config = origin && driveConfig(origin);
    if (!config) continue;
    const session = readDriveSession(config, value);
    if (!session || session.email?.toLowerCase() !== owner) continue;
    try {
      const token = await driveAccessToken(config, session);
      const folder = await getSortaFolder(token);
      if (!folder) return null;
      const boards = await readNewestDriveBoards(token, folder);
      return boards.find((board) => board.isPublic === true && board.publicSlug === slug) ?? null;
    } catch {
      return null;
    }
  }
  return null;
}
