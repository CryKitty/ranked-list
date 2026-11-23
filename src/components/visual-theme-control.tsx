"use client";

import { useSyncExternalStore } from "react";
import {
  parseVisualTheme,
  VISUAL_THEME_CHANGE_EVENT,
  VISUAL_THEME_STORAGE_KEY,
  type VisualTheme,
} from "@/lib/visual-theme";

function getTheme() {
  return parseVisualTheme(document.documentElement.dataset.theme);
}

function subscribe(onChange: () => void) {
  window.addEventListener(VISUAL_THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(VISUAL_THEME_CHANGE_EVENT, onChange);
}

function selectTheme(theme: VisualTheme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(VISUAL_THEME_STORAGE_KEY, theme);
  } catch {
    // The live setting still works if browser storage is unavailable.
  }
  window.dispatchEvent(new Event(VISUAL_THEME_CHANGE_EVENT));
}

export function VisualThemeControl() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "classic");

  return (
    <fieldset className="sorta-theme-control">
      <legend>Appearance</legend>
      <div className="sorta-theme-options">
        <button type="button" aria-pressed={theme === "classic"} onClick={() => selectTheme("classic")}>
          Classic
        </button>
        <button type="button" aria-pressed={theme === "polished"} onClick={() => selectTheme("polished")}>
          Polished
        </button>
      </div>
    </fieldset>
  );
}
