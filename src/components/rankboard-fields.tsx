"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import clsx from "clsx";
import { Settings2, Trash2 } from "lucide-react";

import type {
  BoardFieldDefinition,
  CardFieldType,
  DateFieldFormat,
} from "@/lib/types";

export function MenuSectionButton({
  icon,
  label,
  isOpen,
  isDarkMode,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  isOpen: boolean;
  isDarkMode: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx(
        "flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
        isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="text-xs opacity-70">{isOpen ? "▾" : "▸"}</span>
    </button>
  );
}

export function ToggleSwitch({
  enabled,
  isDarkMode,
  onClick,
  ariaLabel,
}: {
  enabled: boolean;
  isDarkMode: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={clsx(
        "relative inline-flex h-6 w-11 items-center rounded-full transition",
        enabled ? "bg-emerald-500" : isDarkMode ? "bg-white/15" : "bg-slate-300",
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={clsx(
          "inline-block h-5 w-5 transform rounded-full bg-white transition",
          enabled ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function HoverLabelIconButton({
  icon,
  label,
  isDarkMode,
  onClick,
  type = "button",
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  isDarkMode: boolean;
  onClick: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      className={clsx(
        "group inline-flex h-[50px] items-center gap-2 overflow-hidden rounded-full border px-3 transition",
        isDarkMode
          ? "border-white/10 bg-slate-950 text-slate-100 hover:border-white/40 disabled:opacity-60"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-950 disabled:opacity-60",
      )}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      <span className="shrink-0">{icon}</span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-150 group-hover:max-w-[120px] group-hover:opacity-100 group-focus-visible:max-w-[120px] group-focus-visible:opacity-100">
        {label}
      </span>
    </button>
  );
}

export function FieldSettingsPanel({
  isDarkMode,
  fieldDefinitions,
  onToggleField,
}: {
  isDarkMode: boolean;
  fieldDefinitions: BoardFieldDefinition[];
  onToggleField: (fieldId: string) => void;
}) {
  return (
    <div
      className={clsx(
        "min-w-[220px] rounded-2xl border p-2 shadow-[0_18px_40px_rgba(15,23,42,0.24)]",
        isDarkMode ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white",
      )}
    >
      {fieldDefinitions.map((field) => (
        <button
          key={field.id}
          className={clsx(
            "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
            isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100",
          )}
          onClick={() => onToggleField(field.id)}
          type="button"
        >
          <span>{field.label}</span>
          <span className="text-xs opacity-70">{field.visible ? "On" : "Off"}</span>
        </button>
      ))}
    </div>
  );
}

export function FieldDefinitionManager({
  isDarkMode,
  fieldDefinitions,
  onToggleVisibility,
  onUpdateField,
  onRemoveField,
  onAddField,
  defaultDateFieldFormat,
}: {
  isDarkMode: boolean;
  fieldDefinitions: BoardFieldDefinition[];
  onToggleVisibility: (fieldId: string) => void;
  onUpdateField: (fieldId: string, patch: Partial<BoardFieldDefinition>) => void;
  onRemoveField: (fieldId: string) => void;
  onAddField: (type: CardFieldType) => void;
  defaultDateFieldFormat: DateFieldFormat;
}) {
  const mandatoryFieldIds = new Set(["series", "artwork"]);
  const [openFieldSettingsId, setOpenFieldSettingsId] = useState<string | null>(null);
  const [pendingFieldRemoval, setPendingFieldRemoval] = useState<BoardFieldDefinition | null>(null);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        {[
          ...fieldDefinitions.filter((field) => field.builtInKey === "series" || field.builtInKey === "imageUrl"),
          ...fieldDefinitions.filter((field) => field.builtInKey !== "series" && field.builtInKey !== "imageUrl"),
        ].map((field) => (
          <div
            key={field.id}
            className={clsx(
              "rounded-2xl border p-4",
              isDarkMode ? "border-white/10 bg-slate-950/60" : "border-slate-200 bg-slate-50",
            )}
          >
            <div
              className={clsx(
                "grid gap-2 sm:items-center",
                field.builtInKey === "series" || field.builtInKey === "imageUrl"
                  ? "sm:grid-cols-[220px_minmax(0,1fr)]"
                  : "sm:grid-cols-[220px_136px_minmax(0,1fr)]",
              )}
            >
              <input
                className={clsx(
                  "min-w-0 whitespace-nowrap rounded-xl border px-3 py-2 text-sm outline-none transition",
                  isDarkMode
                    ? "border-white/10 bg-slate-900 text-white placeholder:text-slate-500 focus:border-white/40"
                    : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                )}
                value={field.label}
                onChange={(event) => onUpdateField(field.id, { label: event.target.value })}
                placeholder="Field label"
              />
              {field.builtInKey === "series" || field.builtInKey === "imageUrl" ? null : (
                <select
                  className={clsx(
                    "w-[136px] rounded-xl border px-3 py-2 text-sm outline-none transition",
                    isDarkMode
                      ? "border-white/10 bg-slate-900 text-white focus:border-white/40"
                      : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                  )}
                  value={field.type}
                  onChange={(event) => onUpdateField(field.id, { type: event.target.value as CardFieldType })}
                >
                  <option value="short_text">Short Text</option>
                  <option value="long_text">Long Text</option>
                  <option value="date">Date</option>
                  <option value="select">Dropdown</option>
                </select>
              )}
              <div className="flex min-w-0 items-center justify-end gap-3 justify-self-end">
                {!mandatoryFieldIds.has(field.id) ? (
                  <button
                    className={clsx(
                      "inline-flex items-center justify-center self-stretch rounded-xl border px-3 py-2 text-sm font-semibold transition",
                      isDarkMode
                        ? "border-white/10 bg-slate-900 text-slate-200 hover:border-white/40"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                    )}
                    onClick={() => setOpenFieldSettingsId((current) => (current === field.id ? null : field.id))}
                    type="button"
                    aria-label={`Open settings for ${field.label}`}
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-1 py-2 text-sm font-semibold transition"
                  onClick={() => onToggleVisibility(field.id)}
                  type="button"
                >
                  <span>{field.visible ? "Enabled" : "Disabled"}</span>
                  <ToggleSwitch
                    ariaLabel={`Toggle ${field.label}`}
                    enabled={field.visible}
                    isDarkMode={isDarkMode}
                    onClick={() => onToggleVisibility(field.id)}
                  />
                </button>
                {field.visible && mandatoryFieldIds.has(field.id) ? (
                  <button
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-1 py-2 text-sm font-semibold transition"
                    onClick={() =>
                      onUpdateField(field.id, {
                        showOnCardFront: !field.showOnCardFront,
                      })
                    }
                    type="button"
                  >
                    <span>Front</span>
                    <ToggleSwitch
                      ariaLabel={`Toggle ${field.label} front`}
                      enabled={Boolean(field.showOnCardFront)}
                      isDarkMode={isDarkMode}
                      onClick={() =>
                        onUpdateField(field.id, {
                          showOnCardFront: !field.showOnCardFront,
                        })
                      }
                    />
                  </button>
                ) : null}
                {mandatoryFieldIds.has(field.id) ? null : (
                  <button
                    className={clsx(
                      "inline-flex items-center justify-center rounded-xl border p-2 transition",
                      isDarkMode
                        ? "border-rose-400/30 text-rose-200 hover:border-rose-300"
                        : "border-rose-200 text-rose-700 hover:border-rose-500",
                    )}
                    onClick={() => setPendingFieldRemoval(field)}
                    type="button"
                    aria-label={`Remove ${field.label}`}
                    title={`Remove ${field.label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            {!mandatoryFieldIds.has(field.id) && openFieldSettingsId === field.id ? (
              <div
                className={clsx(
                  "mt-3 grid gap-3 rounded-2xl border p-3 sm:grid-cols-[200px_auto_auto]",
                  isDarkMode ? "border-white/10 bg-slate-900/80" : "border-slate-200 bg-white",
                )}
              >
                <button
                  className="inline-flex items-center justify-self-start gap-3 rounded-xl px-1 py-2 text-sm font-semibold transition sm:self-end"
                  onClick={() =>
                    onUpdateField(field.id, {
                      showOnCardFront: !field.showOnCardFront,
                    })
                  }
                  type="button"
                >
                  <span>Front</span>
                  <ToggleSwitch
                    ariaLabel={`Toggle ${field.label} front`}
                    enabled={Boolean(field.showOnCardFront)}
                    isDarkMode={isDarkMode}
                    onClick={() =>
                      onUpdateField(field.id, {
                        showOnCardFront: !field.showOnCardFront,
                      })
                    }
                  />
                </button>
                <button
                  className="inline-flex items-center justify-self-start gap-3 rounded-xl px-1 py-2 text-sm font-semibold transition sm:self-end"
                  onClick={() =>
                    onUpdateField(field.id, {
                      showLabelOnCardFront: !(field.showLabelOnCardFront ?? true),
                    })
                  }
                  type="button"
                >
                  <span>Label</span>
                  <ToggleSwitch
                    ariaLabel={`Toggle ${field.label} chip label`}
                    enabled={field.showLabelOnCardFront ?? true}
                    isDarkMode={isDarkMode}
                    onClick={() =>
                      onUpdateField(field.id, {
                        showLabelOnCardFront: !(field.showLabelOnCardFront ?? true),
                      })
                    }
                  />
                </button>
                {field.type === "date" ? (
                  <label className="grid gap-2 sm:col-span-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
                      Date format
                    </span>
                    <select
                      className={clsx(
                        "w-[180px] rounded-xl border px-3 py-2 text-sm outline-none transition",
                        isDarkMode
                          ? "border-white/10 bg-slate-950 text-white focus:border-white/40"
                          : "border-slate-200 bg-white text-slate-950 focus:border-slate-950",
                      )}
                      value={field.dateFormat ?? defaultDateFieldFormat}
                      onChange={(event) =>
                        onUpdateField(field.id, { dateFormat: event.target.value as DateFieldFormat })
                      }
                    >
                      <option value="mm/dd/yyyy">mm/dd/yyyy</option>
                      <option value="dd/mm/yyyy">dd/mm/yyyy</option>
                      <option value="yyyy">yyyy</option>
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
            {field.type === "select" ? (
              <input
                className={clsx(
                  "mt-3 w-full rounded-xl border px-3 py-2 text-sm outline-none transition",
                  isDarkMode
                    ? "border-white/10 bg-slate-900 text-white placeholder:text-slate-500 focus:border-white/40"
                    : "border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-950",
                )}
                value={(field.options ?? []).join(", ")}
                onChange={(event) =>
                  onUpdateField(field.id, {
                    options: event.target.value
                      .split(",")
                      .map((option) => option.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Dropdown options, comma separated"
              />
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold transition", isDarkMode ? "border-white/10 hover:border-white/40" : "border-slate-200 hover:border-slate-950")} onClick={() => onAddField("short_text")} type="button">Add Short Text</button>
        <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold transition", isDarkMode ? "border-white/10 hover:border-white/40" : "border-slate-200 hover:border-slate-950")} onClick={() => onAddField("long_text")} type="button">Add Long Text</button>
        <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold transition", isDarkMode ? "border-white/10 hover:border-white/40" : "border-slate-200 hover:border-slate-950")} onClick={() => onAddField("date")} type="button">Add Date</button>
        <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold transition", isDarkMode ? "border-white/10 hover:border-white/40" : "border-slate-200 hover:border-slate-950")} onClick={() => onAddField("select")} type="button">Add Dropdown</button>
      </div>

      {pendingFieldRemoval ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setPendingFieldRemoval(null)}>
          <div
            className={clsx(
              "w-full max-w-md rounded-[28px] border p-6 shadow-[0_30px_80px_rgba(19,27,68,0.24)]",
              isDarkMode ? "border-white/10 bg-slate-900 text-slate-100" : "border-white/70 bg-white text-slate-950",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <p className={clsx("text-sm font-semibold uppercase tracking-[0.22em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
              Delete Field
            </p>
            <h3 className={clsx("mt-3 text-2xl font-black", isDarkMode ? "text-white" : "text-slate-950")}>
              Remove {pendingFieldRemoval.label}?
            </h3>
            <p className={clsx("mt-3 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
              This will also delete the saved values from every card that uses this field.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                className={clsx(
                  "rounded-2xl px-4 py-3 text-sm font-semibold transition",
                  isDarkMode ? "bg-white/10 text-white hover:bg-white/15" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                )}
                onClick={() => setPendingFieldRemoval(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={clsx(
                  "rounded-2xl px-4 py-3 text-sm font-semibold transition",
                  isDarkMode ? "bg-rose-500 text-white hover:bg-rose-400" : "bg-rose-600 text-white hover:bg-rose-500",
                )}
                onClick={() => {
                  setOpenFieldSettingsId((current) => (current === pendingFieldRemoval.id ? null : current));
                  onRemoveField(pendingFieldRemoval.id);
                  setPendingFieldRemoval(null);
                }}
                type="button"
              >
                Delete Field
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
