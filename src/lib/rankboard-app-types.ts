import type {
  BoardLayout,
  CardEntry,
  ColumnDefinition,
  PairwiseQuizProgress,
  SavedBoard,
  ShareTierFilter,
} from "@/lib/types";

export type CardDraft = {
  title: string;
  imageUrl: string;
  imageStoragePath?: string;
  mobileBoardImageUrl: string;
  mobileTierListImageUrl: string;
  series: string;
  releaseYear: string;
  notes: string;
  customFields: Record<string, string>;
  columnId: string;
  newColumnTitle: string;
};

export type AddCardTarget = {
  columnId: string;
  insertIndex: number;
  tierRowId?: string;
  tierInsertIndex?: number;
};

export type CardEditorDraft = {
  title: string;
  imageUrl: string;
  imageStoragePath?: string;
  mobileBoardImageUrl: string;
  mobileTierListImageUrl: string;
  series: string;
  releaseYear: string;
  notes: string;
  customFields: Record<string, string>;
};

export type ColumnEditorDraft = {
  title: string;
};

export type DuplicateMatch = {
  column: ColumnDefinition;
  card: CardEntry;
};

export type PendingDuplicateAction = {
  match: DuplicateMatch;
  title: string;
  imageUrl: string;
  mobileBoardImageUrl?: string;
  mobileTierListImageUrl?: string;
  series: string;
  releaseYear?: string;
  notes?: string;
  customFields?: Record<string, string>;
};

export type RankBadge = {
  label?: string;
  value: number;
};

export type ShareDraft = {
  view: BoardLayout;
  columnIds: string[];
};

export type TierFilter = ShareTierFilter;

export type DuplicateCleanupSuggestion = {
  id: string;
  columnId: string;
  columnTitle: string;
  keepColumnTitle?: string;
  normalizedTitle: string;
  keepCard: CardEntry;
  removeCard: CardEntry;
};

export type TitleTidySuggestion = {
  id: string;
  columnId: string;
  columnTitle: string;
  entryId: string;
  itemId: string;
  originalTitle: string;
  proposedTitle: string;
};

export type SeriesScrapeSuggestion = {
  id: string;
  columnId: string;
  columnTitle: string;
  entryId: string;
  itemId: string;
  title: string;
  imageUrl: string;
  proposedSeries: string;
};

export type PendingMirrorLinkSuggestion = {
  id: string;
  kind: "link" | "create";
  mirrorColumnId: string;
  mirrorEntryId?: string;
  mirrorTitle: string;
  sourceEntryId: string;
  sourceItemId: string;
  sourceCardTitle: string;
  sourceSeries: string;
  sourceImageUrl: string;
  sourceImageStoragePath?: string;
  sourceReleaseYear?: string;
  sourceNotes?: string;
  sourceCustomFieldValues?: Record<string, string>;
  sourceColumnTitle: string;
  enabled: boolean;
  rank: number;
};

export type ArtworkPickerState = {
  target: "draft" | "editing";
  options: string[];
};

export type PendingMirrorDelete = {
  columnId: string;
  entryId: string;
  itemId: string;
  title: string;
  columnTitle: string;
};

export type PendingColumnDelete = {
  id: string;
  title: string;
};

export type PendingSharedColumnInclude = {
  column: ColumnDefinition;
  insertIndex: number;
};

export type TierRowOptionsState = {
  rowId: string;
  anchorRect: DOMRect;
};

export type MoveAllCardsState = {
  sourceColumnId: string;
  sourceColumnTitle: string;
  targetColumnId: string;
  cardCount: number;
};

export type MoveCardState = {
  entryId: string;
  itemId: string;
  title: string;
  sourceColumnId: string;
  targetColumnId: string;
  targetRank: string;
};

export type TierRowAddState = {
  rowId: string;
  rowTitle: string;
  insertIndex: number;
};

export type TierListConversionState = {
  mode: "to-tier-list" | "to-board";
  sourceBoardId: string;
  selectedColumnIds: string[];
};

export type PairwiseQuizState = {
  columnId: string;
  columnTitle: string;
  sortedCards: CardEntry[];
  remainingCards: CardEntry[];
  candidateCard: CardEntry | null;
  low: number;
  high: number;
  compareIndex: number;
  comparisons: number;
  history: Array<{
    sortedCards: CardEntry[];
    remainingCards: CardEntry[];
    candidateCard: CardEntry | null;
    low: number;
    high: number;
    compareIndex: number;
    comparisons: number;
  }>;
};

export type PairwiseQuizReview = {
  columnId: string;
  columnTitle: string;
  rankedCards: CardEntry[];
  comparisons: number;
};

export type PendingPairwiseQuizResume = {
  columnId: string;
  columnTitle: string;
  progress: PairwiseQuizProgress;
};

export type ArtworkSearchMode = "image" | "gif";

export type BoardBackupSnapshot = {
  savedAt: string;
  activeBoardId: string;
  boards: SavedBoard[];
};

export type MobileAddCardTarget = {
  columnId: string;
  insertIndex: number;
};
