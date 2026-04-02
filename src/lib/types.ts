export type ColumnType = "ranked" | "wishlist";

export type CardFieldType = "short_text" | "long_text" | "date" | "select";
export type DateFieldFormat = "mm/dd/yyyy" | "dd/mm/yyyy" | "yyyy";

export type BuiltInFieldKey = "series" | "releaseYear" | "imageUrl" | "notes";

export type BoardFieldDefinition = {
  id: string;
  label: string;
  type: CardFieldType;
  visible: boolean;
  showOnCardFront?: boolean;
  showLabelOnCardFront?: boolean;
  builtInKey?: BuiltInFieldKey;
  options?: string[];
  dateFormat?: DateFieldFormat;
};

export type CardEntry = {
  entryId: string;
  itemId: string;
  title: string;
  imageUrl: string;
  series: string;
  releaseYear?: string;
  notes?: string;
  customFieldValues?: Record<string, string>;
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
  fieldDefinitions: BoardFieldDefinition[];
  restoreShowSeriesOnExpand?: boolean;
};

export type SavedBoard = BoardSnapshot & {
  id: string;
  title: string;
  settings: BoardSettings;
  createdAt: string;
  updatedAt: string;
};
