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
  imageStoragePath?: string;
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

export type SaveState = "idle" | "saving" | "saved" | "error" | "offline";

export type NormalizedBoardRow = {
  id: string;
  client_id: string;
  owner_id: string;
  slug: string;
  title: string;
  description: string | null;
  settings: BoardSettings | null;
  created_at: string;
  updated_at: string;
};

export type NormalizedColumnRow = {
  id: string;
  board_id: string;
  client_id: string;
  slug: string;
  title: string;
  description: string | null;
  column_type: ColumnType;
  position: number;
  accent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type NormalizedItemRow = {
  id: string;
  board_id: string;
  client_id: string;
  title: string;
  series: string | null;
  image_url: string | null;
  image_storage_path: string | null;
  release_year: string | null;
  notes: string | null;
  custom_field_values: Record<string, string> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type NormalizedEntryRow = {
  id: string;
  column_id: string;
  item_id: string;
  client_id: string;
  position: number;
  mirrored_from_client_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};
