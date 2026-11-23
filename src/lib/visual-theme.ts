export const VISUAL_THEME_STORAGE_KEY = "sorta:visual-theme";
export const VISUAL_THEME_CHANGE_EVENT = "sorta:visual-theme-change";

export type VisualTheme = "classic" | "polished";

export function parseVisualTheme(value: string | null | undefined): VisualTheme {
  return value === "polished" ? "polished" : "classic";
}

// Run before the page paints so a returning visitor sees their saved theme immediately.
export const visualThemeInitScript = `try {
  const theme = localStorage.getItem(${JSON.stringify(VISUAL_THEME_STORAGE_KEY)});
  document.documentElement.dataset.theme = theme === "polished" ? "polished" : "classic";
} catch {};`;
