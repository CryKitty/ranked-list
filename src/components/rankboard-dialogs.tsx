"use client";

import type { ChangeEvent, FormEvent, RefObject } from "react";
import clsx from "clsx";
import {
  Clapperboard,
  Copy,
  ImagePlus,
  MoveVertical,
  Plus,
  Save,
  Settings2,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  FieldDefinitionManager,
  FieldSettingsPanel,
  HoverLabelIconButton,
} from "@/components/rankboard-fields";
import type { BoardFieldDefinition } from "@/lib/types";

type CardEditorDraftLike = {
  title: string;
  imageUrl: string;
  imageStoragePath?: string;
  series: string;
  releaseYear: string;
  notes: string;
  customFields: Record<string, string>;
};

type AddCardDraftLike = CardEditorDraftLike & {
  columnId: string;
  newColumnTitle: string;
};

type DuplicateActionLike = {
  match: {
    card: { title: string };
    column: { title: string };
  };
} | null;

type ColumnOption = {
  id: string;
  title: string;
  mirrorsEntireBoard?: boolean;
};

export function EditCardDialog({
  isOpen,
  isDarkMode,
  editingCardId,
  editingCardDraft,
  currentCardIsMirrored,
  shouldShowSeriesField,
  shouldShowReleaseYearField,
  shouldShowImageField,
  shouldShowNotesField,
  seriesFieldLabel,
  releaseYearFieldLabel,
  imageFieldLabel,
  notesFieldLabel,
  visibleCustomFieldDefinitions,
  isUploadingArtwork,
  isEditFieldSettingsOpen,
  activeBoardFieldDefinitions,
  editingDuplicateAction,
  onClose,
  onSubmit,
  onTitleChange,
  onSeriesChange,
  onReleaseYearChange,
  onImageUrlChange,
  onOpenImageSearch,
  onOpenGifSearch,
  onOpenUploadPicker,
  editArtworkInputRef,
  onArtworkFileSelection,
  onNotesChange,
  onCustomFieldChange,
  onResolveDuplicate,
  onMove,
  onCopy,
  onDelete,
  onToggleFieldSettings,
  onToggleFieldVisibility,
  normalizeDateFieldInput,
  defaultDateFieldFormat,
}: {
  isOpen: boolean;
  isDarkMode: boolean;
  editingCardId: string | null;
  editingCardDraft: CardEditorDraftLike | null;
  currentCardIsMirrored: boolean;
  shouldShowSeriesField: boolean;
  shouldShowReleaseYearField: boolean;
  shouldShowImageField: boolean;
  shouldShowNotesField: boolean;
  seriesFieldLabel: string;
  releaseYearFieldLabel: string;
  imageFieldLabel: string;
  notesFieldLabel: string;
  visibleCustomFieldDefinitions: BoardFieldDefinition[];
  isUploadingArtwork: boolean;
  isEditFieldSettingsOpen: boolean;
  activeBoardFieldDefinitions: BoardFieldDefinition[];
  editingDuplicateAction: {
    match: {
      card: { title: string };
      column: { title: string };
    };
  } | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTitleChange: (value: string) => void;
  onSeriesChange: (value: string) => void;
  onReleaseYearChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onOpenImageSearch: () => void;
  onOpenGifSearch: () => void;
  onOpenUploadPicker: () => void;
  editArtworkInputRef: RefObject<HTMLInputElement | null>;
  onArtworkFileSelection: (event: ChangeEvent<HTMLInputElement>) => void;
  onNotesChange: (value: string) => void;
  onCustomFieldChange: (fieldId: string, value: string, type: BoardFieldDefinition["type"], dateFormat?: BoardFieldDefinition["dateFormat"]) => void;
  onResolveDuplicate: (action: "discard" | "update" | "duplicate") => void;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onToggleFieldSettings: () => void;
  onToggleFieldVisibility: (fieldId: string) => void;
  normalizeDateFieldInput: (value: string, format: NonNullable<BoardFieldDefinition["dateFormat"]>) => string;
  defaultDateFieldFormat: NonNullable<BoardFieldDefinition["dateFormat"]>;
}) {
  if (!isOpen || !editingCardDraft || !editingCardId) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={clsx(
          "relative w-full max-w-2xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
          isDarkMode ? "border-white/10 bg-slate-900 text-slate-100" : "border-white/70 bg-white text-slate-950",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
              Edit Game
            </p>
            <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
              Update card details
            </h2>
            {currentCardIsMirrored ? (
              <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                This entry is a mirrored copy linked to another column.
              </p>
            ) : null}
          </div>
          <button
            className={clsx(
              "rounded-full p-2 transition",
              isDarkMode ? "bg-white/10 text-slate-200 hover:bg-white/15" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="mt-6" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Title</span>
              <input
                name="title"
                className={clsx(
                  "rounded-2xl border px-4 py-3 outline-none transition",
                  isDarkMode
                    ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                    : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                )}
                value={editingCardDraft.title}
                onChange={(event) => onTitleChange(event.target.value)}
              />
            </label>

            {shouldShowSeriesField ? (
              <label className="grid gap-2">
                <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{seriesFieldLabel}</span>
                <input
                  name="series"
                  list="series-suggestions"
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                  )}
                  value={editingCardDraft.series}
                  onChange={(event) => onSeriesChange(event.target.value)}
                />
              </label>
            ) : null}

            {shouldShowReleaseYearField ? (
              <label className="grid gap-2">
                <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{releaseYearFieldLabel}</span>
                <input
                  name="releaseYear"
                  inputMode="numeric"
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                  )}
                  placeholder="2025"
                  value={editingCardDraft.releaseYear}
                  onChange={(event) => onReleaseYearChange(event.target.value)}
                />
              </label>
            ) : null}
          </div>

          {shouldShowImageField ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
              <label className="grid gap-2">
                <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{imageFieldLabel}</span>
                <input
                  name="imageUrl"
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                  )}
                  value={editingCardDraft.imageUrl}
                  onChange={(event) => onImageUrlChange(event.target.value)}
                />
              </label>
              <input ref={editArtworkInputRef} accept="image/*,.gif" className="hidden" onChange={onArtworkFileSelection} type="file" />
              <button className={clsx("inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition sm:h-[50px]", isDarkMode ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40 hover:bg-slate-900" : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-950 hover:bg-white")} onClick={onOpenImageSearch} type="button" title="Search Google Images in a new tab">
                <ImagePlus className="h-4 w-4" />
                Image
              </button>
              <button className={clsx("inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition sm:h-[50px]", isDarkMode ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40 hover:bg-slate-900" : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-950 hover:bg-white")} onClick={onOpenGifSearch} type="button" title="Search Tenor in a new tab">
                <Clapperboard className="h-4 w-4" />
                GIF
              </button>
              <button className={clsx("inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition sm:h-[50px]", isDarkMode ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40 hover:bg-slate-900 disabled:opacity-60" : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-950 hover:bg-white disabled:opacity-60")} disabled={isUploadingArtwork} onClick={onOpenUploadPicker} type="button" title="Upload artwork from your device">
                <Upload className="h-4 w-4" />
                Upload
              </button>
            </div>
          ) : null}

          {shouldShowNotesField ? (
            <label className="mt-4 grid gap-2">
              <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{notesFieldLabel}</span>
              <textarea
                name="notes"
                className={clsx(
                  "min-h-32 rounded-2xl border px-4 py-3 outline-none transition",
                  isDarkMode
                    ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                    : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                )}
                value={editingCardDraft.notes}
                onChange={(event) => onNotesChange(event.target.value)}
              />
            </label>
          ) : null}

          {visibleCustomFieldDefinitions.map((field) => (
            <label key={field.id} className="mt-4 grid gap-2">
              <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{field.label}</span>
              {field.type === "long_text" ? (
                <textarea
                  className={clsx(
                    "min-h-28 rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                  )}
                  value={editingCardDraft.customFields[field.id] ?? ""}
                  onChange={(event) => onCustomFieldChange(field.id, event.target.value, field.type)}
                />
              ) : field.type === "select" ? (
                <select
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                  )}
                  value={editingCardDraft.customFields[field.id] ?? ""}
                  onChange={(event) => onCustomFieldChange(field.id, event.target.value, field.type)}
                >
                  <option value="">Select one</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                  )}
                  inputMode={field.type === "date" ? "numeric" : undefined}
                  placeholder={field.type === "date" ? field.dateFormat ?? defaultDateFieldFormat : undefined}
                  type="text"
                  value={editingCardDraft.customFields[field.id] ?? ""}
                  onChange={(event) =>
                    onCustomFieldChange(
                      field.id,
                      field.type === "date"
                        ? normalizeDateFieldInput(event.target.value, field.dateFormat ?? defaultDateFieldFormat)
                        : event.target.value,
                      field.type,
                      field.dateFormat,
                    )
                  }
                />
              )}
            </label>
          ))}

          <div className="mt-6 flex flex-wrap gap-3">
            <button className={clsx("inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition", isDarkMode ? "bg-white text-slate-950 hover:bg-slate-200" : "bg-slate-950 text-white hover:bg-slate-800")} type="submit">
              <Save className="h-4 w-4" />
              Save Changes
            </button>
            {editingDuplicateAction ? (
              <div className={clsx("flex min-w-full flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm", isDarkMode ? "border-amber-400/30 bg-amber-400/10 text-amber-100" : "border-amber-300 bg-amber-50 text-amber-900")}>
                <span className="mr-2">
                  &quot;{editingDuplicateAction.match.card.title}&quot; already exists in &nbsp;&quot;{editingDuplicateAction.match.column.title}&quot;.
                </span>
                <button className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-950" onClick={() => onResolveDuplicate("discard")} type="button">Discard</button>
                <button className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-950" onClick={() => onResolveDuplicate("update")} type="button">Update Original</button>
                <button className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-950" onClick={() => onResolveDuplicate("duplicate")} type="button">Allow Duplicate</button>
              </div>
            ) : null}
            <button className={clsx("inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition", isDarkMode ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40" : "border-slate-200 bg-white text-slate-700 hover:border-slate-950")} onClick={onClose} type="button">
              <X className="h-4 w-4" />
              Cancel
            </button>
            <div className="relative flex flex-wrap gap-3">
              <HoverLabelIconButton icon={<MoveVertical className="h-4 w-4" />} isDarkMode={isDarkMode} label="Move" onClick={onMove} />
              <HoverLabelIconButton icon={<Copy className="h-4 w-4" />} isDarkMode={isDarkMode} label="Copy" onClick={onCopy} />
              <HoverLabelIconButton icon={<Trash2 className="h-4 w-4" />} isDarkMode={isDarkMode} label="Delete" onClick={onDelete} />
              <HoverLabelIconButton icon={<Settings2 className="h-4 w-4" />} isDarkMode={isDarkMode} label="Fields" onClick={onToggleFieldSettings} />
              {isEditFieldSettingsOpen ? (
                <div className="absolute bottom-14 right-0 z-10">
                  <FieldSettingsPanel isDarkMode={isDarkMode} fieldDefinitions={activeBoardFieldDefinitions} onToggleField={onToggleFieldVisibility} />
                </div>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AddCardDialog({
  isOpen,
  isDarkMode,
  boardSingular,
  titlePlaceholder,
  seriesPlaceholder,
  draft,
  addCardTargetColumnId,
  shouldShowSeriesField,
  shouldShowReleaseYearField,
  shouldShowImageField,
  shouldShowNotesField,
  seriesFieldLabel,
  releaseYearFieldLabel,
  imageFieldLabel,
  notesFieldLabel,
  visibleCustomFieldDefinitions,
  isUploadingArtwork,
  isAddFieldSettingsOpen,
  activeBoardFieldDefinitions,
  draftDuplicateAction,
  columns,
  newColumnOption,
  defaultDateFieldFormat,
  addArtworkInputRef,
  onArtworkFileSelection,
  onClose,
  onSubmit,
  onTitleChange,
  onSeriesChange,
  onReleaseYearChange,
  onImageUrlChange,
  onOpenImageSearch,
  onOpenGifSearch,
  onOpenUploadPicker,
  onNotesChange,
  onCustomFieldChange,
  onColumnIdChange,
  onNewColumnTitleChange,
  onResolveDuplicate,
  onToggleFieldSettings,
  onToggleFieldVisibility,
  normalizeDateFieldInput,
}: {
  isOpen: boolean;
  isDarkMode: boolean;
  boardSingular: string;
  titlePlaceholder: string;
  seriesPlaceholder: string;
  draft: AddCardDraftLike;
  addCardTargetColumnId: string;
  shouldShowSeriesField: boolean;
  shouldShowReleaseYearField: boolean;
  shouldShowImageField: boolean;
  shouldShowNotesField: boolean;
  seriesFieldLabel: string;
  releaseYearFieldLabel: string;
  imageFieldLabel: string;
  notesFieldLabel: string;
  visibleCustomFieldDefinitions: BoardFieldDefinition[];
  isUploadingArtwork: boolean;
  isAddFieldSettingsOpen: boolean;
  activeBoardFieldDefinitions: BoardFieldDefinition[];
  draftDuplicateAction: DuplicateActionLike;
  columns: ColumnOption[];
  newColumnOption: string;
  defaultDateFieldFormat: NonNullable<BoardFieldDefinition["dateFormat"]>;
  addArtworkInputRef: RefObject<HTMLInputElement | null>;
  onArtworkFileSelection: (event: ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTitleChange: (value: string) => void;
  onSeriesChange: (value: string) => void;
  onReleaseYearChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onOpenImageSearch: () => void;
  onOpenGifSearch: () => void;
  onOpenUploadPicker: () => void;
  onNotesChange: (value: string) => void;
  onCustomFieldChange: (fieldId: string, value: string, type: BoardFieldDefinition["type"], dateFormat?: BoardFieldDefinition["dateFormat"]) => void;
  onColumnIdChange: (value: string) => void;
  onNewColumnTitleChange: (value: string) => void;
  onResolveDuplicate: (action: "discard" | "update" | "duplicate") => void;
  onToggleFieldSettings: () => void;
  onToggleFieldVisibility: (fieldId: string) => void;
  normalizeDateFieldInput: (value: string, format: NonNullable<BoardFieldDefinition["dateFormat"]>) => string;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={clsx(
          "w-full max-w-2xl rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
          isDarkMode ? "border-white/10 bg-slate-900 text-slate-100" : "border-white/70 bg-white text-slate-950",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className={clsx("text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>{`Add ${boardSingular}`}</h2>
          </div>
          <button
            className={clsx(
              "rounded-full p-2 transition",
              isDarkMode ? "bg-white/10 text-slate-200 hover:bg-white/15" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Title</span>
              <input
                name="title"
                className={clsx(
                  "rounded-2xl border px-4 py-3 outline-none transition",
                  isDarkMode
                    ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                    : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                )}
                placeholder={titlePlaceholder}
                value={draft.title}
                onChange={(event) => onTitleChange(event.target.value)}
              />
            </label>

            {shouldShowSeriesField ? (
              <label className="grid gap-2">
                <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{seriesFieldLabel}</span>
                <input
                  name="series"
                  list="series-suggestions"
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                  )}
                  placeholder={seriesPlaceholder}
                  value={draft.series}
                  onChange={(event) => onSeriesChange(event.target.value)}
                />
              </label>
            ) : null}

            {shouldShowReleaseYearField ? (
              <label className="grid gap-2">
                <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{releaseYearFieldLabel}</span>
                <input
                  name="releaseYear"
                  inputMode="numeric"
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                  )}
                  placeholder="2025"
                  value={draft.releaseYear}
                  onChange={(event) => onReleaseYearChange(event.target.value)}
                />
              </label>
            ) : null}
          </div>

          {shouldShowImageField ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
              <label className="grid gap-2">
                <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{imageFieldLabel}</span>
                <div className="relative">
                  <ImagePlus
                    className={clsx(
                      "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2",
                      isDarkMode ? "text-slate-500" : "text-slate-400",
                    )}
                  />
                  <input
                    name="imageUrl"
                    className={clsx(
                      "w-full rounded-2xl border py-3 pl-11 pr-4 outline-none transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                        : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                    )}
                    placeholder="Enter the URL of the image or GIF, or upload one from your device."
                    value={draft.imageUrl}
                    onChange={(event) => onImageUrlChange(event.target.value)}
                  />
                </div>
              </label>
              <input ref={addArtworkInputRef} accept="image/*,.gif" className="hidden" onChange={onArtworkFileSelection} type="file" />
              <button
                className={clsx(
                  "inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition sm:h-[50px]",
                  isDarkMode
                    ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40 hover:bg-slate-900"
                    : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-950 hover:bg-white",
                )}
                onClick={onOpenImageSearch}
                type="button"
                title="Search Google Images in a new tab"
              >
                <ImagePlus className="h-4 w-4" />
                Image
              </button>
              <button
                className={clsx(
                  "inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition sm:h-[50px]",
                  isDarkMode
                    ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40 hover:bg-slate-900"
                    : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-950 hover:bg-white",
                )}
                onClick={onOpenGifSearch}
                type="button"
                title="Search Tenor in a new tab"
              >
                <Clapperboard className="h-4 w-4" />
                GIF
              </button>
              <button
                className={clsx(
                  "inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition sm:h-[50px]",
                  isDarkMode
                    ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40 hover:bg-slate-900 disabled:opacity-60"
                    : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-950 hover:bg-white disabled:opacity-60",
                )}
                disabled={isUploadingArtwork}
                onClick={onOpenUploadPicker}
                type="button"
                title="Upload artwork from your device"
              >
                <Upload className="h-4 w-4" />
                Upload
              </button>
            </div>
          ) : null}

          {shouldShowNotesField ? (
            <label className="grid gap-2">
              <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{notesFieldLabel}</span>
              <textarea
                name="notes"
                className={clsx(
                  "min-h-28 rounded-2xl border px-4 py-3 outline-none transition",
                  isDarkMode
                    ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                    : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                )}
                value={draft.notes}
                onChange={(event) => onNotesChange(event.target.value)}
              />
            </label>
          ) : null}

          {visibleCustomFieldDefinitions.map((field) => (
            <label key={field.id} className="grid gap-2">
              <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{field.label}</span>
              {field.type === "long_text" ? (
                <textarea
                  className={clsx(
                    "min-h-28 rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                  )}
                  value={draft.customFields[field.id] ?? ""}
                  onChange={(event) => onCustomFieldChange(field.id, event.target.value, field.type)}
                />
              ) : field.type === "select" ? (
                <select
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                  )}
                  value={draft.customFields[field.id] ?? ""}
                  onChange={(event) => onCustomFieldChange(field.id, event.target.value, field.type)}
                >
                  <option value="">Select one</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                  )}
                  inputMode={field.type === "date" ? "numeric" : undefined}
                  placeholder={field.type === "date" ? field.dateFormat ?? defaultDateFieldFormat : undefined}
                  type="text"
                  value={draft.customFields[field.id] ?? ""}
                  onChange={(event) =>
                    onCustomFieldChange(
                      field.id,
                      field.type === "date"
                        ? normalizeDateFieldInput(event.target.value, field.dateFormat ?? defaultDateFieldFormat)
                        : event.target.value,
                      field.type,
                      field.dateFormat,
                    )
                  }
                />
              )}
            </label>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Column</span>
              <select
                name="columnId"
                className={clsx(
                  "rounded-2xl border px-4 py-3 outline-none transition",
                  isDarkMode
                    ? "border-white/10 bg-slate-950 text-white focus:border-white/40"
                    : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                )}
                value={draft.columnId || addCardTargetColumnId}
                onChange={(event) => onColumnIdChange(event.target.value)}
              >
                {columns.filter((column) => !column.mirrorsEntireBoard).map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.title}
                  </option>
                ))}
                <option value={newColumnOption}>Create new column</option>
              </select>
            </label>

            {draft.columnId === newColumnOption ? (
              <label className="grid gap-2">
                <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>New column title</span>
                <input
                  name="newColumnTitle"
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                  )}
                  placeholder="Favorites, 2026, Horror..."
                  value={draft.newColumnTitle}
                  onChange={(event) => onNewColumnTitleChange(event.target.value)}
                />
              </label>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className={clsx(
                "rounded-2xl px-4 py-3 text-sm font-semibold transition",
                isDarkMode ? "bg-white text-slate-950 hover:bg-slate-200" : "bg-slate-950 text-white hover:bg-slate-800",
              )}
              type="submit"
            >
              {`Add ${boardSingular}`}
            </button>
            {draftDuplicateAction ? (
              <div
                className={clsx(
                  "flex min-w-full flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm",
                  isDarkMode
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                    : "border-amber-300 bg-amber-50 text-amber-900",
                )}
              >
                <span className="mr-2">
                  &quot;{draftDuplicateAction.match.card.title}&quot; already exists in &nbsp;&quot;{draftDuplicateAction.match.column.title}&quot;.
                </span>
                <button className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-950" onClick={() => onResolveDuplicate("discard")} type="button">Discard</button>
                <button className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-950" onClick={() => onResolveDuplicate("update")} type="button">Update Original</button>
                <button className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-950" onClick={() => onResolveDuplicate("duplicate")} type="button">Allow Duplicate</button>
              </div>
            ) : null}
            <button
              className={clsx(
                "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                isDarkMode ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40" : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
              )}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <div className="relative">
              <button
                className={clsx(
                  "inline-flex h-[50px] w-[50px] items-center justify-center rounded-full border transition",
                  isDarkMode ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40" : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                )}
                onClick={onToggleFieldSettings}
                type="button"
                aria-label="Customize card fields"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              {isAddFieldSettingsOpen ? (
                <div className="absolute bottom-14 right-0 z-10">
                  <FieldSettingsPanel isDarkMode={isDarkMode} fieldDefinitions={activeBoardFieldDefinitions} onToggleField={onToggleFieldVisibility} />
                </div>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BoardSetupDialog({
  isOpen,
  isDarkMode,
  newBoardTitle,
  fieldDefinitions,
  onClose,
  onTitleChange,
  onToggleVisibility,
  onUpdateField,
  onRemoveField,
  onAddField,
  onCreateBoard,
  defaultDateFieldFormat,
}: {
  isOpen: boolean;
  isDarkMode: boolean;
  newBoardTitle: string;
  fieldDefinitions: BoardFieldDefinition[];
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onToggleVisibility: (fieldId: string) => void;
  onUpdateField: (fieldId: string, patch: Partial<BoardFieldDefinition>) => void;
  onRemoveField: (fieldId: string) => void;
  onAddField: (type: "short_text" | "long_text" | "date" | "select") => void;
  onCreateBoard: () => void;
  defaultDateFieldFormat: BoardFieldDefinition["dateFormat"];
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={clsx(
          "w-full max-w-[760px] rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)] sm:min-w-[680px]",
          isDarkMode ? "border-white/10 bg-slate-900 text-slate-100" : "border-white/70 bg-white text-slate-950",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={clsx("text-sm font-semibold uppercase tracking-[0.24em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
              Board Setup
            </p>
            <h2 className={clsx("mt-2 text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
              What are you ranking?
            </h2>
            <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
              Give the board a title and choose which fields should appear when adding new cards.
            </p>
          </div>
          <button
            className={clsx(
              "rounded-full p-2 transition",
              isDarkMode ? "bg-white/10 text-slate-200 hover:bg-white/15" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-6 grid gap-2">
          <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Board title</span>
          <input
            className={clsx(
              "rounded-2xl border px-4 py-3 outline-none transition",
              isDarkMode
                ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
            )}
            placeholder="Favorites, Waifus, Horror Games..."
            value={newBoardTitle}
            onChange={(event) => onTitleChange(event.target.value)}
          />
        </label>

        <div className="mt-6">
          <FieldDefinitionManager
            defaultDateFieldFormat={(defaultDateFieldFormat ?? "mm/dd/yyyy") as "mm/dd/yyyy" | "dd/mm/yyyy" | "yyyy"}
            fieldDefinitions={fieldDefinitions}
            isDarkMode={isDarkMode}
            onAddField={onAddField}
            onRemoveField={onRemoveField}
            onToggleVisibility={onToggleVisibility}
            onUpdateField={onUpdateField}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button className={clsx("inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition", isDarkMode ? "bg-white text-slate-950 hover:bg-slate-200" : "bg-slate-950 text-white hover:bg-slate-800")} onClick={onCreateBoard} type="button">
            <Plus className="h-4 w-4" />
            Create Board
          </button>
          <button className={clsx("rounded-2xl border px-4 py-3 text-sm font-semibold transition", isDarkMode ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40" : "border-slate-200 bg-white text-slate-700 hover:border-slate-950")} onClick={onClose} type="button">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
