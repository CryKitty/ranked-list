import { NextRequest, NextResponse } from "next/server";

const CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=2592000";

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url")?.trim();

  if (!target) {
    return NextResponse.json({ error: "Missing url parameter." }, { status: 400 });
  }

  let parsed: URL;

  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid artwork url." }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Unsupported artwork protocol." }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(parsed, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "Rankr Artwork Proxy",
      },
      next: {
        revalidate: 60 * 60 * 24 * 30,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to fetch artwork." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Artwork fetch failed." }, { status: upstream.status || 502 });
  }

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
  });

  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    response.headers.set("Content-Type", contentType);
  }

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    response.headers.set("Content-Length", contentLength);
  }

  response.headers.set("Cache-Control", CACHE_CONTROL);
  response.headers.set("Content-Security-Policy", "default-src 'none'; img-src 'self' data: blob:;");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  return response;
}
