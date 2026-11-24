import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

const SESSION_AGE = 30 * 24 * 60 * 60;
export const SESSION_COOKIE = "sorta_drive_session";
export const STATE_COOKIE = "sorta_drive_state";

export function driveConfig(origin: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const cookieSecret = process.env.DRIVE_COOKIE_SECRET;
  const origins = process.env.DRIVE_ALLOWED_ORIGINS?.split(",").map((value) => value.trim());
  const url = new URL(origin);
  const secure = url.protocol === "https:";
  const loopback = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

  if (!clientId || !clientSecret || !cookieSecret || !origins?.includes(origin) || (!secure && !loopback)) {
    return null;
  }
  return {
    clientId,
    clientSecret,
    key: createHash("sha256").update(cookieSecret).digest(),
    origin,
    secure,
    redirectUri: origin + "/api/drive/callback",
  };
}

type Config = NonNullable<ReturnType<typeof driveConfig>>;

function seal(config: Config, purpose: string, payload: object) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config.key, iv);
  cipher.setAAD(Buffer.from(purpose + config.origin));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function unseal<T>(config: Config, purpose: string, value?: string): T | null {
  if (!value) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", config.key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(purpose + config.origin));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
  } catch {
    return null;
  }
}

function setCookie(response: NextResponse, config: Config, name: string, value: string, maxAge: number) {
  response.cookies.set(name, value, {
    httpOnly: true,
    secure: config.secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return response;
}

export function clearDriveSession(response: NextResponse, config: Config) {
  return setCookie(response, config, SESSION_COOKIE, "", 0);
}

export function beginDriveLogin(config: Config) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const endpoint = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  endpoint.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/drive",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return setCookie(NextResponse.redirect(endpoint), config, STATE_COOKIE,
    seal(config, STATE_COOKIE, { state, verifier, expiresAt: Date.now() + 600_000 }), 600);
}

type Tokens = { access_token: string; expires_in: number; refresh_token?: string };
type Access = { token: string; expiresAt: number };
type Session = Access & { refreshToken: string; email: string | null; sessionExpiresAt: number };

export class DriveAuthError extends Error {}

async function exchange(config: Config, parameters: Record<string, string>): Promise<Tokens> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      ...parameters,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    cache: "no-store",
  });
  if (response.status === 400 || response.status === 401) throw new DriveAuthError("Google authorization expired.");
  if (!response.ok) throw new Error("Google authorization is unavailable.");
  return response.json();
}

function tokenAccess(tokens: Tokens): Access {
  return { token: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
}

export async function finishDriveLogin(config: Config, query: URLSearchParams, cookie?: string) {
  const pending = unseal<{ state: string; verifier: string; expiresAt: number }>(config, STATE_COOKIE, cookie);
  const code = query.get("code");
  let session: Session | undefined;
  if (code && pending && pending.expiresAt > Date.now() && pending.state === query.get("state")) {
    try {
      const tokens = await exchange(config, {
        code,
        code_verifier: pending.verifier,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      });
      if (tokens.refresh_token) {
        const profile = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: "Bearer " + tokens.access_token },
          cache: "no-store",
        });
        const identity = profile.ok ? await profile.json() as { email?: string; email_verified?: boolean } : null;
        session = {
          ...tokenAccess(tokens),
          refreshToken: tokens.refresh_token,
          email: identity?.email_verified ? identity.email ?? null : null,
          sessionExpiresAt: Date.now() + SESSION_AGE * 1000,
        };
      }
    } catch {
      // Redirect to the local app with a generic failure. Never expose OAuth credentials.
    }
  }
  const response = NextResponse.redirect(new URL(session ? "/" : "/?drive=sign-in-failed", config.origin));
  setCookie(response, config, STATE_COOKIE, "", 0);
  return session
    ? setCookie(response, config, SESSION_COOKIE, seal(config, SESSION_COOKIE, session), SESSION_AGE)
    : response;
}

export function readDriveSession(config: Config, value?: string) {
  const session = unseal<Session>(config, SESSION_COOKIE, value);
  return session && session.sessionExpiresAt > Date.now() ? session : null;
}

// Keep refreshed access tokens and concurrent refresh requests in memory. API responses
// never rewrite the session cookie, so a late response cannot undo sign-out.
const refreshes = new Map<string, Promise<Access>>();

export async function driveAccessToken(config: Config, session: Session) {
  if (session.expiresAt > Date.now() + 60_000) return session.token;

  const key = createHash("sha256").update(config.clientId).update(session.refreshToken).digest("hex");
  const existing = refreshes.get(key);
  if (existing) {
    const access = await existing;
    if (access.expiresAt > Date.now() + 60_000) return access.token;
    if (refreshes.get(key) === existing) refreshes.delete(key);
    return driveAccessToken(config, session);
  }

  const refresh = exchange(config, {
    refresh_token: session.refreshToken,
    grant_type: "refresh_token",
  }).then(tokenAccess);
  if (refreshes.size >= 128) refreshes.delete(refreshes.keys().next().value!);
  refreshes.set(key, refresh);
  try {
    return (await refresh).token;
  } catch (error) {
    if (refreshes.get(key) === refresh) refreshes.delete(key);
    throw error;
  }
}
