import { useCallback, useEffect, useState } from "react";

/**
 * Purely client-side Light / Dark mode.
 * Stored in localStorage only — no database, no query, no run credit.
 */
const MODE_STORAGE_KEY = "app-theme";
const COLOR_STORAGE_KEY = "app-color-theme";
const COLOR_THEME_EVENT = "app-color-theme-change";

export type ThemeMode = "light" | "dark";
export const themeColors = ["ocean", "violet", "emerald", "sky", "rose", "amber", "pink", "slate"] as const;
export type ThemeColor = (typeof themeColors)[number];

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local preferences gracefully remain session-only when storage is blocked.
  }
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return readStorage(MODE_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function getStoredColorTheme(): ThemeColor {
  if (typeof window === "undefined") return "ocean";
  const stored = readStorage(COLOR_STORAGE_KEY);
  return themeColors.find((theme) => theme === stored) ?? "ocean";
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
}

export function applyColorTheme(color: ThemeColor) {
  document.documentElement.dataset.colorTheme = color;
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme);
  const [colorTheme, setColorThemeState] = useState<ThemeColor>(getStoredColorTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyColorTheme(colorTheme);
  }, [colorTheme]);

  // Keep other tabs / components in sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MODE_STORAGE_KEY) setThemeState(getStoredTheme());
      if (e.key === COLOR_STORAGE_KEY) setColorThemeState(getStoredColorTheme());
    };
    const onColorThemeChange = () => setColorThemeState(getStoredColorTheme());
    window.addEventListener("storage", onStorage);
    window.addEventListener(COLOR_THEME_EVENT, onColorThemeChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(COLOR_THEME_EVENT, onColorThemeChange);
    };
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    writeStorage(MODE_STORAGE_KEY, mode);
    applyTheme(mode);
    setThemeState(mode);
  }, []);

  const setColorTheme = useCallback((color: ThemeColor) => {
    writeStorage(COLOR_STORAGE_KEY, color);
    applyColorTheme(color);
    setColorThemeState(color);
    window.dispatchEvent(new Event(COLOR_THEME_EVENT));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(getStoredTheme() === "dark" ? "light" : "dark");
  }, [setTheme]);

  return { theme, setTheme, toggleTheme, isDark: theme === "dark", colorTheme, setColorTheme };
}
