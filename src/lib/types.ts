export type ColumnType = "ranked" | "wishlist";

export type CardEntry = {
  entryId: string;
  itemId: string;
  title: string;
  imageUrl: string;
  series: string;
  notes?: string;
  mirroredFromEntryId?: string;
};

export type ColumnDefinition = {
  id: string;
  title: string;
  description: string;
  type: ColumnType;
  accent: string;
  autoMirrorToColumnId?: string;
};

export type BoardSnapshot = {
  columns: ColumnDefinition[];
  cardsByColumn: Record<string, CardEntry[]>;
};

export type BoardSettings = {
  showSeriesOnCards: boolean;
};

export type SavedBoard = BoardSnapshot & {
  id: string;
  title: string;
  settings: BoardSettings;
  createdAt: string;
  updatedAt: string;
};
