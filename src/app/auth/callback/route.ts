import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";
  const redirectResponse = NextResponse.redirect(new URL(next, requestUrl.origin));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!code || !url || !publishableKey) {
    return redirectResponse;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        const cookieHeader = request.headers.get("cookie") ?? "";

        return cookieHeader
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((cookie) => {
            const separatorIndex = cookie.indexOf("=");
            const name = separatorIndex >= 0 ? cookie.slice(0, separatorIndex) : cookie;
            const value = separatorIndex >= 0 ? cookie.slice(separatorIndex + 1) : "";

            return { name, value };
          });
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          redirectResponse.cookies.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });

  await supabase.auth.exchangeCodeForSession(code);

  return redirectResponse;
}
