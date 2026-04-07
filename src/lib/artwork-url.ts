const supabaseHostname = (() => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!supabaseUrl) {
    return null;
  }

  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return null;
  }
})();

export function getArtworkDisplayUrl(input: string) {
  const value = input.trim();

  if (!value) {
    return "";
  }

  if (
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("/") ||
    value.startsWith("/api/artwork?")
  ) {
    return value;
  }

  try {
    const parsed = new URL(value);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return value;
    }

    if (parsed.hostname === "trello.com" || parsed.hostname.endsWith(".trello.com")) {
      return value;
    }

    if (supabaseHostname && parsed.hostname === supabaseHostname) {
      return value;
    }

    return `/api/artwork?url=${encodeURIComponent(value)}`;
  } catch {
    return value;
  }
}
