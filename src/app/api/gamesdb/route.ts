import { NextRequest, NextResponse } from "next/server";
import { normalizeTitleForComparison } from "@/lib/rankboard-display";

type ArtworkFieldKind = "landscape" | "portrait";

type GamesDbGame = {
  id?: number;
  game_title?: string;
};

type GamesDbBoxart = {
  side?: string | null;
  filename?: string | null;
  resolution?: string | null;
};

type GamesDbResponse = {
  data?: {
    games?: GamesDbGame[];
  };
  include?: {
    boxart?: {
      base_url?: {
        large?: string;
        medium?: string;
        original?: string;
      };
      data?: Record<string, GamesDbBoxart[]>;
    };
  };
};

function parseResolution(value?: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return { width, height, ratio: width / height };
}

function getGameTitleScore(targetTitle: string, candidateTitle: string) {
  const normalizedTarget = normalizeTitleForComparison(targetTitle);
  const normalizedCandidate = normalizeTitleForComparison(candidateTitle);

  if (!normalizedTarget || !normalizedCandidate) {
    return Number.NEGATIVE_INFINITY;
  }

  if (normalizedTarget === normalizedCandidate) {
    return 100;
  }

  if (normalizedCandidate.startsWith(normalizedTarget)) {
    return 70;
  }

  if (normalizedTarget.startsWith(normalizedCandidate)) {
    return 60;
  }

  if (normalizedCandidate.includes(normalizedTarget)) {
    return 45;
  }

  const targetWords = new Set(normalizedTarget.split(" ").filter(Boolean));
  const candidateWords = normalizedCandidate.split(" ").filter(Boolean);
  const overlapCount = candidateWords.filter((word) => targetWords.has(word)).length;

  return overlapCount > 0 ? overlapCount * 8 : Number.NEGATIVE_INFINITY;
}

function getBoxartScore(boxart: GamesDbBoxart, artworkField: ArtworkFieldKind) {
  const resolution = parseResolution(boxart.resolution);
  const ratio = resolution?.ratio ?? null;
  const side = boxart.side?.toLowerCase() ?? "";

  if (artworkField === "portrait") {
    let score = side === "front" ? 18 : side === "back" ? 8 : 0;

    if (ratio !== null) {
      if (ratio < 0.88) {
        score += 30;
      } else if (ratio <= 1.12) {
        score += 12;
      } else {
        score -= 20;
      }
    } else {
      score += side === "front" ? 8 : 0;
    }

    return score;
  }

  let score = side === "front" ? 6 : side === "back" ? 4 : 0;

  if (ratio !== null) {
    if (ratio > 1.12) {
      score += 30;
    } else if (ratio >= 0.88) {
      score += 10;
    } else {
      score -= 25;
    }
  } else {
    score -= 5;
  }

  return score;
}

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get("title")?.trim() ?? "";
  const artworkFieldParam = request.nextUrl.searchParams.get("artworkField");
  const artworkField: ArtworkFieldKind =
    artworkFieldParam === "portrait" ? "portrait" : "landscape";
  const apiKey = process.env.THEGAMESDB_API_KEY?.trim();

  if (!title) {
    return NextResponse.json({ error: "Missing title parameter." }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ imageUrl: null }, { status: 200 });
  }

  const apiUrl = new URL("https://api.thegamesdb.net/v1/Games/ByGameName");
  apiUrl.searchParams.set("apikey", apiKey);
  apiUrl.searchParams.set("name", title);
  apiUrl.searchParams.set("include", "boxart");

  let upstream: Response;

  try {
    upstream = await fetch(apiUrl, {
      next: {
        revalidate: 60 * 60 * 24,
      },
    });
  } catch {
    return NextResponse.json({ imageUrl: null }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ imageUrl: null }, { status: upstream.status });
  }

  const payload = (await upstream.json()) as GamesDbResponse;
  const games = payload.data?.games ?? [];
  const boxartData = payload.include?.boxart?.data ?? {};
  const baseUrl =
    payload.include?.boxart?.base_url?.large ??
    payload.include?.boxart?.base_url?.medium ??
    payload.include?.boxart?.base_url?.original ??
    "";

  if (!baseUrl) {
    return NextResponse.json({ imageUrl: null }, { status: 200 });
  }

  let bestMatch: { imageUrl: string; score: number } | null = null;

  for (const game of games) {
    const gameId = game.id;
    const gameTitle = game.game_title?.trim() ?? "";
    if (!gameId || !gameTitle) {
      continue;
    }

    const titleScore = getGameTitleScore(title, gameTitle);
    if (!Number.isFinite(titleScore)) {
      continue;
    }

    const candidates = boxartData[String(gameId)] ?? [];
    for (const boxart of candidates) {
      const filename = boxart.filename?.trim();
      if (!filename) {
        continue;
      }

      const score = titleScore + getBoxartScore(boxart, artworkField);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          imageUrl: new URL(filename, baseUrl).toString(),
          score,
        };
      }
    }
  }

  const minimumScore = artworkField === "portrait" ? 85 : 95;

  return NextResponse.json(
    { imageUrl: bestMatch && bestMatch.score >= minimumScore ? bestMatch.imageUrl : null },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
