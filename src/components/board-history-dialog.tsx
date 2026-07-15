"use client";

import clsx from "clsx";
import { AlertTriangle, Clock3, LoaderCircle, RotateCcw, X } from "lucide-react";

import type { BoardChangeRecord } from "@/lib/board-change-history";

function formatChangeTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function BoardHistoryDialog({
  entries,
  error,
  isDarkMode,
  isLoading,
  isOpen,
  onClose,
  onRestore,
  onUndo,
}: {
  entries: BoardChangeRecord[];
  error: string | null;
  isDarkMode: boolean;
  isLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  onRestore: (change: BoardChangeRecord) => void;
  onUndo: (change: BoardChangeRecord) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[420] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={clsx(
          "flex max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border shadow-[0_30px_80px_rgba(15,23,42,0.35)]",
          isDarkMode ? "border-white/10 bg-slate-900 text-slate-100" : "border-white/70 bg-white text-slate-950",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-500/20 p-6">
          <div className="flex items-center gap-2">
            <Clock3 className="h-5 w-5" />
            <h2 className="text-2xl font-black">Board history</h2>
          </div>
          <button className={clsx("rounded-full p-2", isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100")} onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold">
              <LoaderCircle className="h-5 w-5 animate-spin" /> Loading history…
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-600">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : entries.length === 0 ? (
            <div className={clsx("py-16 text-center text-sm", isDarkMode ? "text-slate-400" : "text-slate-500")}>
              No saved changes are available yet. New edits will appear here after they sync.
            </div>
          ) : (
            <div className="grid gap-3">
              {entries.map((entry, index) => (
                <article
                  key={entry.id}
                  className={clsx(
                    "rounded-3xl border p-4",
                    isDarkMode ? "border-white/10 bg-slate-950/55" : "border-slate-200 bg-slate-50/80",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className={clsx("text-xs font-bold uppercase tracking-[0.14em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                        {index === 0 ? "Latest change" : formatChangeTime(entry.createdAt)}
                      </div>
                      <ul className="mt-2 grid gap-1.5">
                        {entry.summaries.map((summary) => (
                          <li key={summary.id} className="text-sm font-semibold">
                            {summary.label}
                            {summary.detail ? <span className={clsx("font-normal", isDarkMode ? "text-slate-400" : "text-slate-500")}> · {summary.detail}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <time className={clsx("text-xs", isDarkMode ? "text-slate-400" : "text-slate-500")} dateTime={entry.createdAt}>
                      {formatChangeTime(entry.createdAt)}
                    </time>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className={clsx(
                        "inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition",
                        isDarkMode ? "bg-white text-slate-950 hover:bg-slate-200" : "bg-slate-950 text-white hover:bg-slate-800",
                      )}
                      onClick={() => onUndo(entry)}
                      type="button"
                    >
                      <RotateCcw className="h-4 w-4" /> Undo this change
                    </button>
                    <button
                      className={clsx(
                        "rounded-2xl border px-3 py-2 text-sm font-semibold transition",
                        isDarkMode ? "border-white/10 hover:border-white/40" : "border-slate-300 hover:border-slate-950",
                      )}
                      onClick={() => onRestore(entry)}
                      type="button"
                    >
                      Restore board to before
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
