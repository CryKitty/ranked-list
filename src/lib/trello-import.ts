import { CardEntry, ColumnDefinition } from "@/lib/types";

type TrelloList = {
  id: string;
  name: string;
  pos: number;
  closed?: boolean;
};

type TrelloAttachmentPreview = {
  url?: string;
};

type TrelloAttachment = {
  id?: string;
  url?: string;
  mimeType?: string;
  previews?: TrelloAttachmentPreview[];
};

type TrelloCard = {
  id: string;
  idList: string;
  name: string;
  desc?: string;
  pos: number;
  closed?: boolean;
  attachments?: TrelloAttachment[];
};

type TrelloBoardExport = {
  lists?: TrelloList[];
  cards?: TrelloCard[];
};

export type ImportedBoard = {
  columns: ColumnDefinition[];
  cardsByColumn: Record<string, CardEntry[]>;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function makeAccent(index: number) {
  const accents = [
    "from-amber-300 via-orange-400 to-rose-500",
    "from-sky-300 via-cyan-400 to-teal-500",
    "from-fuchsia-300 via-pink-400 to-rose-500",
    "from-violet-300 via-indigo-400 to-blue-500",
    "from-lime-300 via-emerald-400 to-teal-500",
    "from-red-300 via-orange-400 to-amber-500",
  ];

  return accents[index % accents.length];
}

function inferColumnType(title: string): "ranked" | "wishlist" {
  const normalized = title.toLowerCase();

  if (
    normalized.includes("want to play") ||
    normalized.includes("wishlist") ||
    normalized.includes("backlog") ||
    normalized.includes("to play")
  ) {
    return "wishlist";
  }

  return "ranked";
}

function pickAttachmentUrl(attachments: TrelloAttachment[] = []) {
  const imageAttachment = attachments.find((attachment) =>
    attachment.mimeType?.startsWith("image/"),
  );

  if (!imageAttachment) {
    return "";
  }

  return (
    imageAttachment.url ??
    imageAttachment.previews?.[imageAttachment.previews.length - 1]?.url ??
    ""
  );
}

export function parseTrelloBoardExport(rawText: string): ImportedBoard {
  const parsed = JSON.parse(rawText) as TrelloBoardExport;
  const lists = (parsed.lists ?? [])
    .filter((list) => !list.closed)
    .sort((left, right) => left.pos - right.pos);
  const cards = (parsed.cards ?? []).filter((card) => !card.closed);

  if (lists.length === 0) {
    throw new Error("No Trello lists were found in this export.");
  }

  const favoritesColumn = lists.find((list) =>
    list.name.toLowerCase().includes("favorite"),
  );

  const columns: ColumnDefinition[] = lists.map((list, index) => {
    const title = list.name.trim() || `Column ${index + 1}`;
    const isYearColumn = /^(19|20)\d{2}$/.test(title);

    return {
      id: slugify(title) || list.id,
      title,
      description: "",
      type: inferColumnType(title),
      accent: makeAccent(index),
      autoMirrorToColumnId:
        isYearColumn && favoritesColumn ? slugify(favoritesColumn.name) || favoritesColumn.id : undefined,
    };
  });

  const columnIdsByListId = new Map(
    lists.map((list) => [list.id, slugify(list.name.trim()) || list.id]),
  );

  const cardsByColumn: Record<string, CardEntry[]> = Object.fromEntries(
    columns.map((column) => [column.id, []]),
  );

  for (const list of lists) {
    const columnId = columnIdsByListId.get(list.id);

    if (!columnId) {
      continue;
    }

    const listCards = cards
      .filter((card) => card.idList === list.id)
      .sort((left, right) => left.pos - right.pos);

    const mappedCards = listCards.map((card) => ({
      entryId: `entry-${card.id}`,
      itemId: slugify(card.name.trim()) || card.id,
      title: card.name.trim() || "Untitled Game",
      imageUrl: pickAttachmentUrl(card.attachments),
      series: "",
      notes: card.desc?.trim() || undefined,
    }));

    cardsByColumn[columnId] = mappedCards;
  }

  for (const column of columns) {
    if (!column.autoMirrorToColumnId) {
      continue;
    }

    for (const card of cardsByColumn[column.id] ?? []) {
      const targetCards = cardsByColumn[column.autoMirrorToColumnId] ?? [];
      const alreadyExists = targetCards.some(
        (targetCard) => targetCard.mirroredFromEntryId === card.entryId,
      );

      if (alreadyExists) {
        continue;
      }

      targetCards.push({
        ...card,
        entryId: `mirror-${card.entryId}`,
        mirroredFromEntryId: card.entryId,
      });

      cardsByColumn[column.autoMirrorToColumnId] = targetCards;
    }
  }

  return {
    columns,
    cardsByColumn,
  };
}
