"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, RefObject } from "react";
import clsx from "clsx";
import {
  Check,
  ChevronDown,
  Clapperboard,
  ClipboardPaste,
  Clock3,
  Copy,
  ImagePlus,
  LogIn,
  MoveVertical,
  Plus,
  Save,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  FieldDefinitionManager,
  FieldSettingsPanel,
  HoverLabelIconButton,
} from "@/components/rankboard-fields";
import { getSeriesFilterDisplayLabel } from "@/lib/rankboard-display";
import type { BoardFieldDefinition, BoardLayout, ColumnDefinition, ShareTierFilter } from "@/lib/types";

type ArtworkFieldKind = "landscape" | "portrait";

type CardEditorDraftLike = {
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

function ArtworkFieldInput({
  isDarkMode,
  label,
  name,
  value,
  placeholder,
  menuPlacement = "down",
  isUploadingArtwork,
  onChange,
  onPaste,
  onOpenImageSearch,
  onOpenGifSearch,
  onOpenUploadPicker,
}: {
  isDarkMode: boolean;
  label: string;
  name: string;
  value: string;
  placeholder?: string;
  menuPlacement?: "down" | "up";
  isUploadingArtwork: boolean;
  onChange: (value: string) => void;
  onPaste: () => void;
  onOpenImageSearch: () => void;
  onOpenGifSearch: () => void;
  onOpenUploadPicker: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isMenuOpen]);

  return (
    <div ref={rootRef} className="grid gap-2">
      <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{label}</span>
      <div className="relative">
        <input
          name={name}
          className={clsx(
            "w-full rounded-2xl border px-4 py-3 pr-24 outline-none transition",
            isDarkMode
              ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
              : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
          )}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            const pastedValue = event.clipboardData.getData("text").trim();
            if (!pastedValue) {
              return;
            }

            event.preventDefault();
            onChange(pastedValue);
          }}
        />
        <button
          className={clsx(
            "absolute right-[3.45rem] top-1/2 inline-flex h-9 w-10 -translate-y-1/2 items-center justify-center rounded-2xl border transition",
            isDarkMode
              ? "border-white/10 bg-slate-900 text-slate-200 hover:border-white/35 hover:bg-slate-800"
              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400 hover:bg-white",
          )}
          onClick={onPaste}
          type="button"
          aria-label={`Paste ${label}`}
        >
          <ClipboardPaste className="h-4.5 w-4.5" />
        </button>
        <button
          className={clsx(
            "absolute right-2 top-1/2 inline-flex h-9 w-10 -translate-y-1/2 items-center justify-center rounded-2xl border transition",
            isDarkMode
              ? "border-white/10 bg-slate-900 text-slate-200 hover:border-white/35 hover:bg-slate-800"
              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400 hover:bg-white",
          )}
          onClick={() => setIsMenuOpen((current) => !current)}
          type="button"
          aria-label={`Artwork options for ${label}`}
        >
          <ImagePlus className="h-4.5 w-4.5" />
        </button>
        {isMenuOpen ? (
          <div
            className={clsx(
              "absolute right-0 z-20 grid min-w-[9.5rem] gap-1 rounded-[20px] border p-2 shadow-[0_20px_40px_rgba(15,23,42,0.18)]",
              menuPlacement === "up" ? "bottom-[calc(100%+0.55rem)]" : "top-[calc(100%+0.55rem)]",
              isDarkMode ? "border-white/10 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900",
            )}
          >
            <button className={clsx("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100")} onClick={() => { setIsMenuOpen(false); onOpenImageSearch(); }} type="button">
              <ImagePlus className="h-4 w-4" />
              Image
            </button>
            <button className={clsx("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100")} onClick={() => { setIsMenuOpen(false); onOpenGifSearch(); }} type="button">
              <Clapperboard className="h-4 w-4" />
              GIF
            </button>
            <button className={clsx("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-60", isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100")} disabled={isUploadingArtwork} onClick={() => { setIsMenuOpen(false); onOpenUploadPicker(); }} type="button">
              <Upload className="h-4 w-4" />
              Upload
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ShareColumnOption = Pick<ColumnDefinition, "id" | "title" | "accent">;

export function SeriesInput({
  isDarkMode,
  label,
  name,
  placeholder,
  value,
  allSeries,
  onChange,
}: {
  isDarkMode: boolean;
  label: string;
  name: string;
  placeholder: string;
  value: string;
  allSeries: string[];
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const filteredSeries = useMemo(() => {
    const normalizedValue = value.trim().toLowerCase();
    const matches = normalizedValue
      ? allSeries.filter((series) => series.toLowerCase().includes(normalizedValue))
      : allSeries;
    return matches.slice(0, 8);
  }, [allSeries, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return (
    <label className="grid gap-2">
      <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{label}</span>
      <div className="relative" ref={rootRef}>
        <input
          name={name}
          className={clsx(
            "w-full rounded-2xl border px-4 py-3 pr-11 outline-none transition",
            isDarkMode
              ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
              : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
          )}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        <button
          className={clsx(
            "absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition",
            isDarkMode ? "text-slate-300 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100",
          )}
          onClick={() => setIsOpen((current) => !current)}
          type="button"
          aria-label={`Toggle ${label} suggestions`}
        >
          <ChevronDown className={clsx("h-4 w-4 transition", isOpen && "rotate-180")} />
        </button>
        {isOpen && filteredSeries.length > 0 ? (
          <div
            className={clsx(
              "absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 max-h-56 overflow-y-auto rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
              isDarkMode ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white",
            )}
          >
            {filteredSeries.map((series) => (
              <button
                key={series}
                className={clsx(
                  "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition",
                  isDarkMode ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100",
                )}
                onClick={() => {
                  onChange(series);
                  setIsOpen(false);
                }}
                type="button"
              >
                <span className="truncate">{series}</span>
                {series === value ? <Check className="ml-3 h-4 w-4 shrink-0" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}

function SeriesFilterInput({
  isDarkMode,
  value,
  allSeries,
  onChange,
  menuPlacement = "down",
}: {
  isDarkMode: boolean;
  value: string;
  allSeries: string[];
  onChange: (value: string) => void;
  menuPlacement?: "up" | "down";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return (
    <label className="grid min-w-0 gap-2">
      <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Series</span>
      <div className="relative" ref={rootRef}>
        <button
          className={clsx(
            "flex w-full items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left outline-none transition",
            isDarkMode
              ? "border-white/10 bg-slate-950 text-white hover:border-white/40"
              : "border-slate-200 bg-white text-slate-950 hover:border-slate-950",
          )}
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span className="truncate">{value ? getSeriesFilterDisplayLabel(value) : "All series"}</span>
          <span className="flex items-center gap-2">
            {value ? (
              <span
                className={clsx(
                  "rounded-full p-1 transition",
                  isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange("");
                  setIsOpen(false);
                }}
                aria-label="Clear filter"
                role="button"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            ) : null}
            <ChevronDown className={clsx("h-4 w-4 transition", isOpen && "rotate-180")} />
          </span>
        </button>
        {isOpen ? (
          <div
            className={clsx(
              "absolute left-0 right-0 z-20 max-h-56 overflow-y-auto rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
              menuPlacement === "up" ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.5rem)]",
              isDarkMode ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white",
            )}
          >
            <button
              className={clsx(
                "w-full rounded-xl px-3 py-2 text-left text-sm transition",
                value.length === 0
                  ? isDarkMode
                    ? "bg-white/10 text-white"
                    : "bg-slate-100 text-slate-900"
                  : isDarkMode
                    ? "text-white hover:bg-white/10"
                    : "text-slate-700 hover:bg-slate-100",
              )}
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
              type="button"
            >
              All series
            </button>
            {allSeries.map((series) => (
              <button
                key={series}
                className={clsx(
                  "w-full rounded-xl px-3 py-2 text-left text-sm transition",
                  value === series
                    ? isDarkMode
                      ? "bg-white/10 text-white"
                      : "bg-slate-100 text-slate-900"
                    : isDarkMode
                      ? "text-white hover:bg-white/10"
                      : "text-slate-700 hover:bg-slate-100",
                )}
                onClick={() => {
                  onChange(series);
                  setIsOpen(false);
                }}
                type="button"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate">{getSeriesFilterDisplayLabel(series)}</span>
                  {value === series ? <Check className="h-4 w-4 shrink-0" /> : null}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}

export function EditCardDialog({
  isOpen,
  isDarkMode,
  boardSingular,
  editingCardId,
  editingCardDraft,
  currentCardIsMirrored,
  shouldShowSeriesField,
  shouldShowReleaseYearField,
  shouldShowImageField,
  shouldShowNotesField,
  seriesFieldLabel,
  releaseYearFieldLabel,
  notesFieldLabel,
  visibleCustomFieldDefinitions,
  isUploadingArtwork,
  isEditFieldSettingsOpen,
  activeBoardFieldDefinitions,
  editingDuplicateAction,
  mirroredSiblingColumnTitle,
  onClose,
  onOpenSibling,
  onSubmit,
  onTitleChange,
  onSeriesChange,
  onReleaseYearChange,
  onImageUrlChange,
  onMobileTierListImageUrlChange,
  onOpenImageSearch,
  onOpenGifSearch,
  onOpenUploadPicker,
  onPasteArtwork,
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
  boardSingular: string;
  editingCardId: string | null;
  editingCardDraft: CardEditorDraftLike | null;
  currentCardIsMirrored: boolean;
  shouldShowSeriesField: boolean;
  shouldShowReleaseYearField: boolean;
  shouldShowImageField: boolean;
  shouldShowNotesField: boolean;
  seriesFieldLabel: string;
  releaseYearFieldLabel: string;
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
  mirroredSiblingColumnTitle?: string | null;
  onClose: () => void;
  onOpenSibling?: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTitleChange: (value: string) => void;
  onSeriesChange: (value: string) => void;
  onReleaseYearChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onMobileTierListImageUrlChange: (value: string) => void;
  onOpenImageSearch: (field: ArtworkFieldKind) => void;
  onOpenGifSearch: (field: ArtworkFieldKind) => void;
  onOpenUploadPicker: (field: ArtworkFieldKind) => void;
  onPasteArtwork: (field: ArtworkFieldKind) => void;
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
          "relative flex max-h-[min(92vh,860px)] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
          isDarkMode ? "border-white/10 bg-slate-900 text-slate-100" : "border-white/70 bg-white text-slate-950",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 className={clsx("text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
              {`Edit ${boardSingular}`}
            </h2>
            {currentCardIsMirrored ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className={clsx("text-sm leading-6", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                  Cloned from:
                </p>
                {mirroredSiblingColumnTitle ? (
                  <button
                    className={clsx(
                      "rounded-full px-2.5 py-1 text-xs font-semibold transition",
                      isDarkMode ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-700",
                    )}
                    onClick={onOpenSibling}
                    title={`Sibling card lives in ${mirroredSiblingColumnTitle}`}
                    type="button"
                  >
                    {mirroredSiblingColumnTitle}
                  </button>
                ) : null}
              </div>
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

        <form className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-6" onSubmit={onSubmit}>
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
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ArtworkFieldInput
                isDarkMode={isDarkMode}
                isUploadingArtwork={isUploadingArtwork}
                label="Landscape Artwork"
                name="imageUrl"
                onChange={onImageUrlChange}
                onOpenGifSearch={() => onOpenGifSearch("landscape")}
                onOpenImageSearch={() => onOpenImageSearch("landscape")}
                onOpenUploadPicker={() => onOpenUploadPicker("landscape")}
                onPaste={() => onPasteArtwork("landscape")}
                value={editingCardDraft.imageUrl}
              />
              <ArtworkFieldInput
                isDarkMode={isDarkMode}
                isUploadingArtwork={isUploadingArtwork}
                label="Portrait Artwork"
                menuPlacement="up"
                name="mobileTierListImageUrl"
                onChange={onMobileTierListImageUrlChange}
                onOpenGifSearch={() => onOpenGifSearch("portrait")}
                onOpenImageSearch={() => onOpenImageSearch("portrait")}
                onOpenUploadPicker={() => onOpenUploadPicker("portrait")}
                onPaste={() => onPasteArtwork("portrait")}
                value={editingCardDraft.mobileTierListImageUrl}
              />
              <input ref={editArtworkInputRef} accept="image/*,.gif" className="hidden" onChange={onArtworkFileSelection} type="file" />
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
  notesFieldLabel,
  allSeries,
  visibleCustomFieldDefinitions,
  isUploadingArtwork,
  isAddFieldSettingsOpen,
  activeBoardFieldDefinitions,
  draftDuplicateAction,
  columns,
  columnLabel,
  newColumnOption,
  allowCreateNewColumn = true,
  defaultDateFieldFormat,
  addArtworkInputRef,
  onArtworkFileSelection,
  onClose,
  onSubmit,
  onTitleChange,
  onSeriesChange,
  onReleaseYearChange,
  onImageUrlChange,
  onMobileTierListImageUrlChange,
  onOpenImageSearch,
  onOpenGifSearch,
  onOpenUploadPicker,
  onPasteArtwork,
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
  notesFieldLabel: string;
  allSeries: string[];
  visibleCustomFieldDefinitions: BoardFieldDefinition[];
  isUploadingArtwork: boolean;
  isAddFieldSettingsOpen: boolean;
  activeBoardFieldDefinitions: BoardFieldDefinition[];
  draftDuplicateAction: DuplicateActionLike;
  columns: ColumnOption[];
  columnLabel?: string;
  newColumnOption: string;
  allowCreateNewColumn?: boolean;
  defaultDateFieldFormat: NonNullable<BoardFieldDefinition["dateFormat"]>;
  addArtworkInputRef: RefObject<HTMLInputElement | null>;
  onArtworkFileSelection: (event: ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTitleChange: (value: string) => void;
  onSeriesChange: (value: string) => void;
  onReleaseYearChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onMobileTierListImageUrlChange: (value: string) => void;
  onOpenImageSearch: (field: ArtworkFieldKind) => void;
  onOpenGifSearch: (field: ArtworkFieldKind) => void;
  onOpenUploadPicker: (field: ArtworkFieldKind) => void;
  onPasteArtwork: (field: ArtworkFieldKind) => void;
  onNotesChange: (value: string) => void;
  onCustomFieldChange: (fieldId: string, value: string, type: BoardFieldDefinition["type"], dateFormat?: BoardFieldDefinition["dateFormat"]) => void;
  onColumnIdChange: (value: string) => void;
  onNewColumnTitleChange: (value: string) => void;
  onResolveDuplicate: (action: "discard" | "update" | "duplicate") => void;
  onToggleFieldSettings: () => void;
  onToggleFieldVisibility: (fieldId: string) => void;
  normalizeDateFieldInput: (value: string, format: NonNullable<BoardFieldDefinition["dateFormat"]>) => string;
}) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={clsx(
          "flex max-h-[min(92vh,860px)] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
          isDarkMode ? "border-white/10 bg-slate-900 text-slate-100" : "border-white/70 bg-white text-slate-950",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
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

        <form className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-6" onSubmit={onSubmit}>
          <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Title</span>
              <input
                ref={titleInputRef}
                name="title"
                className={clsx(
                  "rounded-2xl border px-4 py-3 outline-none transition",
                  isDarkMode
                    ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                    : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                )}
                autoFocus
                placeholder={titlePlaceholder}
                value={draft.title}
                onChange={(event) => onTitleChange(event.target.value)}
              />
            </label>

            {shouldShowSeriesField ? (
              <SeriesInput
                allSeries={allSeries}
                isDarkMode={isDarkMode}
                label={seriesFieldLabel}
                name="series"
                onChange={onSeriesChange}
                placeholder={seriesPlaceholder}
                value={draft.series}
              />
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
            <div className="grid gap-3 sm:grid-cols-2">
              <ArtworkFieldInput
                isDarkMode={isDarkMode}
                isUploadingArtwork={isUploadingArtwork}
                label="Landscape Artwork"
                name="imageUrl"
                onChange={onImageUrlChange}
                onOpenGifSearch={() => onOpenGifSearch("landscape")}
                onOpenImageSearch={() => onOpenImageSearch("landscape")}
                onOpenUploadPicker={() => onOpenUploadPicker("landscape")}
                onPaste={() => onPasteArtwork("landscape")}
                value={draft.imageUrl}
              />
              <ArtworkFieldInput
                isDarkMode={isDarkMode}
                isUploadingArtwork={isUploadingArtwork}
                label="Portrait Artwork"
                menuPlacement="up"
                name="mobileTierListImageUrl"
                onChange={onMobileTierListImageUrlChange}
                onOpenGifSearch={() => onOpenGifSearch("portrait")}
                onOpenImageSearch={() => onOpenImageSearch("portrait")}
                onOpenUploadPicker={() => onOpenUploadPicker("portrait")}
                onPaste={() => onPasteArtwork("portrait")}
                value={draft.mobileTierListImageUrl}
              />
              <input ref={addArtworkInputRef} accept="image/*,.gif" className="hidden" onChange={onArtworkFileSelection} type="file" />
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
              <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>{columnLabel ?? "Column"}</span>
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
                {allowCreateNewColumn ? <option value={newColumnOption}>Create new column</option> : null}
              </select>
            </label>

            {allowCreateNewColumn && draft.columnId === newColumnOption ? (
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
              <HoverLabelIconButton icon={<Settings2 className="h-4 w-4" />} isDarkMode={isDarkMode} label="Fields" onClick={onToggleFieldSettings} />
              {isAddFieldSettingsOpen ? (
                <div className="absolute bottom-14 right-0 z-10">
                  <FieldSettingsPanel isDarkMode={isDarkMode} fieldDefinitions={activeBoardFieldDefinitions} onToggleField={onToggleFieldVisibility} />
                </div>
              ) : null}
            </div>
          </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ShareBoardDialog({
  isOpen,
  isDarkMode,
  boardTitle,
  sharedTitle,
  columns,
  shareView,
  allSeries,
  selectedColumnIds,
  selectedTierFilter,
  selectedSeriesFilter,
  searchTerm,
  copiedShareUrl,
  onClose,
  onShareViewChange,
  onToggleColumn,
  onTierChange,
  onSeriesChange,
  onSearchChange,
  onSharedTitleChange,
  onSubmit,
  onCopyAgain,
}: {
  isOpen: boolean;
  isDarkMode: boolean;
  boardTitle: string;
  sharedTitle: string;
  columns: ShareColumnOption[];
  shareView: BoardLayout;
  allSeries: string[];
  selectedColumnIds: string[];
  selectedTierFilter: ShareTierFilter;
  selectedSeriesFilter: string;
  searchTerm: string;
  copiedShareUrl: string | null;
  onClose: () => void;
  onShareViewChange: (view: BoardLayout) => void;
  onToggleColumn: (columnId: string) => void;
  onTierChange: (tier: ShareTierFilter) => void;
  onSeriesChange: (series: string) => void;
  onSearchChange: (value: string) => void;
  onSharedTitleChange: (value: string) => void;
  onSubmit: () => void;
  onCopyAgain: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  const tierOptions: Array<{ id: ShareTierFilter; label: string }> = [
    { id: "all", label: "All cards" },
    { id: "top10", label: "Top 10" },
    { id: "top15", label: "Top 15" },
    { id: "top20", label: "Top 20" },
    { id: "top30", label: "Top 30" },
  ];
  const shareOptionLabel = shareView === "tier-list" ? "Rows" : "Columns";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={clsx(
          "relative flex max-h-[min(92vh,860px)] w-full max-w-3xl flex-col overflow-visible rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
          isDarkMode ? "border-white/10 bg-slate-900 text-slate-100" : "border-white/70 bg-white text-slate-950",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className={clsx("text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
              Share {boardTitle}
            </h2>
            <p className={clsx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
              Choose what the read-only share link should include. Each link refresh lasts for 24 hours.
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

        <div className="mt-6 flex-1 overflow-y-auto overflow-x-visible pr-1">
          <div className="grid gap-5">
            <section className="grid gap-3">
              <div className="flex items-center gap-2">
                <Share2 className={clsx("h-4 w-4", isDarkMode ? "text-slate-300" : "text-slate-600")} />
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em]">View</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["board", "Kanban"],
                  ["tier-list", "Tier List"],
                ] as const).map(([view, label]) => {
                  const enabled = shareView === view;
                  return (
                    <button
                      key={view}
                      className={clsx(
                        "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                        enabled
                          ? isDarkMode
                            ? "border-white/35 bg-white text-slate-950"
                            : "border-slate-950 bg-slate-950 text-white"
                          : isDarkMode
                            ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/30"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-400",
                      )}
                      onClick={() => onShareViewChange(view)}
                      type="button"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="grid gap-3">
              <div className="flex items-center gap-2">
                <Share2 className={clsx("h-4 w-4", isDarkMode ? "text-slate-300" : "text-slate-600")} />
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em]">{shareOptionLabel}</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {columns.map((column) => {
                  const enabled = selectedColumnIds.includes(column.id);
                  return (
                    <button
                      key={column.id}
                      className={clsx(
                        "flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                        enabled
                          ? isDarkMode
                            ? "border-white/25 bg-white/10 text-white"
                            : "border-slate-950 bg-slate-50 text-slate-950"
                          : isDarkMode
                            ? "border-white/10 bg-slate-950 text-slate-300 hover:border-white/25"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-400",
                      )}
                      onClick={() => onToggleColumn(column.id)}
                      type="button"
                    >
                      <span className="truncate font-semibold">{column.title}</span>
                      <span
                        className={clsx(
                          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                          enabled
                            ? isDarkMode
                              ? "bg-white text-slate-950"
                              : "bg-slate-950 text-white"
                            : isDarkMode
                              ? "bg-white/10 text-slate-400"
                              : "bg-slate-100 text-slate-400",
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-3">
              <div className="flex items-center gap-2">
                <Clock3 className={clsx("h-4 w-4", isDarkMode ? "text-slate-300" : "text-slate-600")} />
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em]">Filters</h3>
              </div>
              <label className="grid min-w-0 gap-2">
                <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Shared title</span>
                <input
                  className={clsx(
                    "rounded-2xl border px-4 py-3 outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                  )}
                  placeholder={boardTitle}
                  value={sharedTitle}
                  onChange={(event) => onSharedTitleChange(event.target.value)}
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid min-w-0 gap-2">
                  <span className={clsx("text-sm font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>Search</span>
                  <input
                    className={clsx(
                      "rounded-2xl border px-4 py-3 outline-none transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-950 text-white placeholder:text-slate-500 focus:border-white/40"
                        : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                    )}
                    placeholder="Optional title or series filter"
                    value={searchTerm}
                    onChange={(event) => onSearchChange(event.target.value)}
                  />
                </label>
                <SeriesFilterInput
                  allSeries={allSeries}
                  isDarkMode={isDarkMode}
                  menuPlacement="up"
                  onChange={onSeriesChange}
                  value={selectedSeriesFilter}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {tierOptions.map((tier) => {
                  const enabled = selectedTierFilter === tier.id;
                  return (
                    <button
                      key={tier.id}
                      className={clsx(
                        "rounded-full border px-3 py-2 text-sm font-semibold transition",
                        enabled
                          ? isDarkMode
                            ? "border-white/35 bg-white text-slate-950"
                            : "border-slate-950 bg-slate-950 text-white"
                          : isDarkMode
                            ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/30"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-400",
                      )}
                      onClick={() => onTierChange(tier.id)}
                      type="button"
                    >
                      {tier.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          {copiedShareUrl ? (
            <div className={clsx("mb-4 rounded-2xl border px-4 py-3", isDarkMode ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "border-emerald-300 bg-emerald-50 text-emerald-900")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Share link copied to clipboard</p>
                  <p className="mt-1 break-all text-xs opacity-80">{copiedShareUrl}</p>
                </div>
                <button
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
                    isDarkMode ? "border-white/15 bg-slate-950/40 text-white hover:border-white/35" : "border-slate-300 bg-white text-slate-700 hover:border-slate-500",
                  )}
                  onClick={onCopyAgain}
                  type="button"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy Again
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              className={clsx(
                "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                isDarkMode ? "bg-white text-slate-950 hover:bg-slate-200" : "bg-slate-950 text-white hover:bg-slate-800",
              )}
              disabled={selectedColumnIds.length === 0}
              onClick={onSubmit}
              type="button"
            >
              <Share2 className="h-4 w-4" />
              {copiedShareUrl ? "Refresh Link" : "Create Link"}
            </button>
            <button
              className={clsx(
                "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                isDarkMode ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40" : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
              )}
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WelcomeDialog({
  isOpen,
  isDarkMode,
  isLoginDisabled,
  onLogin,
  onGetStarted,
}: {
  isOpen: boolean;
  isDarkMode: boolean;
  isLoginDisabled?: boolean;
  onLogin: () => void;
  onGetStarted: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  const steps = [
    {
      title: "Start a board",
      description: "Create a fresh board for games, shows, songs, characters, or anything else you want to rank.",
    },
    {
      title: "Add and organize cards",
      description: "Drop items into columns, reorder them, and customize the board as your list takes shape.",
    },
    {
      title: "Save and share",
      description: "Log in to save your board to your account and share your favorite rankings with friends.",
    },
  ];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div
        className={clsx(
          "max-h-[min(92vh,860px)] w-full max-w-2xl overflow-y-auto rounded-[32px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)] sm:p-8",
          isDarkMode ? "border-white/10 bg-slate-900 text-slate-100" : "border-white/70 bg-white text-slate-950",
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={clsx(
              "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
              isDarkMode ? "bg-white/10 text-white" : "bg-slate-950 text-white",
            )}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className={clsx("text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
              Welcome to Sorta
            </h2>
            <p className={clsx("mt-3 text-sm leading-6 sm:text-base", isDarkMode ? "text-slate-300" : "text-slate-600")}>
              Build ranking boards in minutes, then log in when you want to save them and share them with friends.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className={clsx(
                "flex items-start gap-4 rounded-2xl border px-4 py-4",
                isDarkMode ? "border-white/10 bg-slate-950/70" : "border-slate-200 bg-slate-50",
              )}
            >
              <div
                className={clsx(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black",
                  isDarkMode ? "bg-white text-slate-950" : "bg-slate-950 text-white",
                )}
              >
                {index + 1}
              </div>
              <div>
                <h3 className={clsx("text-sm font-semibold sm:text-base", isDarkMode ? "text-white" : "text-slate-950")}>
                  {step.title}
                </h3>
                <p className={clsx("mt-1 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className={clsx(
              "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
              isDarkMode ? "bg-white text-slate-950 hover:bg-slate-200" : "bg-slate-950 text-white hover:bg-slate-800",
            )}
            onClick={onGetStarted}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Get Started
          </button>
          <button
            className={clsx(
              "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
              isDarkMode
                ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40 disabled:opacity-60"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-950 disabled:opacity-60",
            )}
            disabled={isLoginDisabled}
            onClick={onLogin}
            type="button"
          >
            <LogIn className="h-4 w-4" />
            Log In to Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function BoardSetupDialog({
  isOpen,
  isDarkMode,
  newBoardTitle,
  boardLayout,
  fieldDefinitions,
  showLoginHint,
  isLoginDisabled,
  onClose,
  onLogin,
  onTitleChange,
  onBoardLayoutChange,
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
  boardLayout: BoardLayout;
  fieldDefinitions: BoardFieldDefinition[];
  showLoginHint?: boolean;
  isLoginDisabled?: boolean;
  onClose: () => void;
  onLogin?: () => void;
  onTitleChange: (value: string) => void;
  onBoardLayoutChange: (value: BoardLayout) => void;
  onToggleVisibility: (fieldId: string) => void;
  onUpdateField: (fieldId: string, patch: Partial<BoardFieldDefinition>) => void;
  onRemoveField: (fieldId: string) => void;
  onAddField: (type: "short_text" | "long_text" | "date" | "select") => void;
  onCreateBoard: () => void;
  defaultDateFieldFormat: BoardFieldDefinition["dateFormat"];
}) {
  void boardLayout;
  void onBoardLayoutChange;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        className={clsx(
          "flex max-h-[min(92vh,860px)] w-full max-w-[760px] flex-col overflow-hidden rounded-[32px] border shadow-[0_30px_80px_rgba(19,27,68,0.24)] sm:min-w-[680px]",
          isDarkMode ? "border-white/10 bg-slate-900 text-slate-100" : "border-white/70 bg-white text-slate-950",
        )}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onCreateBoard();
        }}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 className={clsx("text-3xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
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

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
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

          {showLoginHint ? (
            <div
              className={clsx(
                "mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm",
                isDarkMode ? "border-white/10 bg-white/5 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700",
              )}
            >
              <p className="leading-6">
                Log in to save this board to your account and sync it across devices.
              </p>
              <button
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition",
                  isDarkMode ? "bg-white text-slate-950 hover:bg-slate-200 disabled:bg-white/60" : "bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-400",
                )}
                disabled={isLoginDisabled}
                onClick={onLogin}
                type="button"
              >
                Log In
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3 border-t px-6 py-4">
          <button className={clsx("inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition", isDarkMode ? "bg-white text-slate-950 hover:bg-slate-200" : "bg-slate-950 text-white hover:bg-slate-800")} type="submit">
            <Plus className="h-4 w-4" />
            Create Board
          </button>
          <button className={clsx("rounded-2xl border px-4 py-3 text-sm font-semibold transition", isDarkMode ? "border-white/10 bg-slate-950 text-slate-200 hover:border-white/40" : "border-slate-200 bg-white text-slate-700 hover:border-slate-950")} onClick={onClose} type="button">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
