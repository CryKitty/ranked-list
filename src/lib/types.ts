export type ColumnType = "ranked" | "wishlist";

export type CardEntry = {
  entryId: string;
  itemId: string;
  title: string;
  imageUrl: string;
  series: string;
  releaseYear?: string;
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
  mirrorsEntireBoard?: boolean;
  excludedMirrorItemIds?: string[];
  excludeFromBoardMirrors?: boolean;
};

export type BoardSnapshot = {
  columns: ColumnDefinition[];
  cardsByColumn: Record<string, CardEntry[]>;
};

export type BoardSettings = {
  showSeriesOnCards: boolean;
  collapseCards: boolean;
  showTierHighlights: boolean;
  includeSeriesField: boolean;
  includeReleaseYearField: boolean;
  includeImageField: boolean;
  includeNotesField: boolean;
  restoreShowSeriesOnExpand?: boolean;
};

export type SavedBoard = BoardSnapshot & {
  id: string;
  title: string;
  settings: BoardSettings;
  createdAt: string;
  updatedAt: string;
};
