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

function isHostnameInSet(hostname: string, domains: string[]) {
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function isTrelloHostedArtworkUrl(input: string) {
  const value = input.trim();

  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return isHostnameInSet(parsed.hostname, ["trello.com", "trellocdn.com", "atlassian.com"]);
  } catch {
    return false;
  }
}

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

    if (supabaseHostname && parsed.hostname === supabaseHostname) {
      return value;
    }

    return `/api/artwork?url=${encodeURIComponent(value)}`;
  } catch {
    return value;
  }
}

export function getArtworkProxyUrl(input: string) {
  const value = input.trim();

  if (!value) {
    return "";
  }

  if (value.startsWith("/api/artwork?")) {
    return value;
  }

  return `/api/artwork?url=${encodeURIComponent(value)}`;
}
