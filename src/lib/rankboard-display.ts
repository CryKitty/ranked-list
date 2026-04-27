import type { CardEntry, ShareTierFilter } from "@/lib/types";

export function normalizeTitleForComparison(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

export function stripSortablePrefix(value: string) {
  return value.trim().replace(/^(the|a)\s+/i, "");
}

export function getSeriesFilterDisplayLabel(value: string) {
  const stripped = stripSortablePrefix(value);
  return stripped || value.trim();
}

export function compareTitlesForDisplay(left: string, right: string) {
  const strippedComparison = stripSortablePrefix(left).localeCompare(stripSortablePrefix(right));

  if (strippedComparison !== 0) {
    return strippedComparison;
  }

  return left.localeCompare(right);
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isStandaloneSequelMarker(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  return /^(?:(?:part|episode|season|vol(?:ume)?)\s+)?(?:\d+|[ivxlcdm]+)$/i.test(trimmed);
}

function getSequelMarkerWithSubtitle(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(
    /^(?:(part|episode|season|vol(?:ume)?)\s+)?(\d+|[ivxlcdm]+)\s+(.+)$/i,
  );

  if (!match) {
    return null;
  }

  const [, label, marker, subtitle] = match;
  const normalizedMarker = [label, marker].filter(Boolean).join(" ").trim();
  const trimmedSubtitle = subtitle?.trim() ?? "";

  if (!normalizedMarker || !trimmedSubtitle) {
    return null;
  }

  return {
    marker: normalizedMarker,
    subtitle: trimmedSubtitle,
  };
}

function isSingleLetterSuffix(value: string) {
  return /^[a-z]$/i.test(value.trim());
}

export function getDisplayCardText(title: string, series: string, showSeries: boolean) {
  const trimmedTitle = title.trim();
  const trimmedSeries = series.trim();

  const colonParts = trimmedTitle.split(":");
  if (showSeries && colonParts.length > 1) {
    const beforeColon = colonParts[0]?.trim() ?? "";
    const afterColon = colonParts.slice(1).join(":").trim();
    const normalizedBeforeColon = normalizeTitleForComparison(beforeColon);
    const normalizedSeries = normalizeTitleForComparison(trimmedSeries);

    if (
      afterColon &&
      normalizedBeforeColon &&
      (!normalizedSeries ||
        normalizedBeforeColon === normalizedSeries ||
        normalizedBeforeColon.startsWith(`${normalizedSeries} `))
    ) {
      return {
        displayTitle: afterColon,
        displaySeries: beforeColon,
      };
    }
  }

  if (!showSeries || !trimmedSeries) {
    return {
      displayTitle: trimmedTitle,
      displaySeries: "",
    };
  }

  const normalizedTitle = normalizeTitleForComparison(trimmedTitle);
  const normalizedSeries = normalizeTitleForComparison(trimmedSeries);

  if (normalizedTitle === normalizedSeries) {
    return {
      displayTitle: trimmedTitle,
      displaySeries: "",
    };
  }

  const punctuationPrefixPattern = new RegExp(`^${escapeRegExp(trimmedSeries)}\\s*[:\\-–—]\\s*`, "i");
  const punctuationStrippedTitle = trimmedTitle.replace(punctuationPrefixPattern, "").trim();

  if (punctuationStrippedTitle && punctuationStrippedTitle.length < trimmedTitle.length) {
    return {
      displayTitle: punctuationStrippedTitle,
      displaySeries: trimmedSeries,
    };
  }

  const whitespacePrefixPattern = new RegExp(`^${escapeRegExp(trimmedSeries)}\\s+`, "i");
  const strippedTitle = trimmedTitle.replace(whitespacePrefixPattern, "").trim();

  if (isStandaloneSequelMarker(strippedTitle)) {
    return {
      displayTitle: trimmedTitle,
      displaySeries: "",
    };
  }

  if (isSingleLetterSuffix(strippedTitle)) {
    return {
      displayTitle: trimmedTitle,
      displaySeries: "",
    };
  }

  const sequelMarkerWithSubtitle = getSequelMarkerWithSubtitle(strippedTitle);
  if (sequelMarkerWithSubtitle) {
    return {
      displayTitle: sequelMarkerWithSubtitle.subtitle,
      displaySeries: `${trimmedSeries} ${sequelMarkerWithSubtitle.marker}`.trim(),
    };
  }

  if (strippedTitle && strippedTitle.length < trimmedTitle.length) {
    return {
      displayTitle: strippedTitle,
      displaySeries: trimmedSeries,
    };
  }

  return {
    displayTitle: trimmedTitle,
    displaySeries: trimmedSeries,
  };
}

export function getTierKey(rank: number | null): Exclude<ShareTierFilter, "all"> | null {
  if (!rank) {
    return null;
  }

  if (rank <= 10) {
    return "top10";
  }

  if (rank <= 15) {
    return "top15";
  }

  if (rank <= 20) {
    return "top20";
  }

  if (rank <= 30) {
    return "top30";
  }

  return null;
}

export function matchesTierFilter(rank: number | null, tierFilter: ShareTierFilter) {
  if (tierFilter === "all" || !rank) {
    return true;
  }

  if (tierFilter === "top10") {
    return rank <= 10;
  }

  if (tierFilter === "top15") {
    return rank <= 15;
  }

  if (tierFilter === "top20") {
    return rank <= 20;
  }

  if (tierFilter === "top30") {
    return rank <= 30;
  }

  return false;
}

export function matchesTierFilterByIndex(index: number, tierFilter: ShareTierFilter) {
  return matchesTierFilter(index + 1, tierFilter);
}

export function matchesCardSearch(card: Pick<CardEntry, "title" | "series">, searchTerm: string) {
  const normalizedSearch = normalizeTitleForComparison(searchTerm);

  if (!normalizedSearch) {
    return true;
  }

  return [card.title, card.series].some((value) =>
    normalizeTitleForComparison(value).includes(normalizedSearch),
  );
}
