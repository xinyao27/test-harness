import { create } from "zustand";

import {
  appThemes,
  borderRadiusPresets,
  defaultBorderRadiusPreset,
  defaultThemeId,
  defaultThemeMode,
  getBorderRadiusPreset,
  getBorderRadiusValues,
  getThemeDefinition,
  getThemeVariables,
  type AppThemeMode,
  type BorderRadiusPreset,
} from "@/lib/themes";

export type AppTheme = AppThemeMode;

const legacyThemeStorageKey = "HARNESS_STUDIO_THEME";
const themeIdStorageKey = "HARNESS_STUDIO_COLOR_THEME";
const themeModeStorageKey = "HARNESS_STUDIO_COLOR_MODE";
const borderRadiusStorageKey = "HARNESS_STUDIO_RADIUS";

function readStoredThemeId(): string {
  if (typeof window === "undefined") return defaultThemeId;

  const savedThemeId = window.localStorage.getItem(themeIdStorageKey);
  if (savedThemeId) return getThemeDefinition(savedThemeId).id;

  return defaultThemeId;
}

function readStoredMode(): AppThemeMode {
  if (typeof window === "undefined") return defaultThemeMode;

  const savedMode = window.localStorage.getItem(themeModeStorageKey);
  if (savedMode === "dark" || savedMode === "light") return savedMode;

  const legacyMode = window.localStorage.getItem(legacyThemeStorageKey);
  if (legacyMode === "dark" || legacyMode === "light") return legacyMode;

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : defaultThemeMode;
}

function readStoredRadius(): BorderRadiusPreset {
  if (typeof window === "undefined") return defaultBorderRadiusPreset;

  return getBorderRadiusPreset(window.localStorage.getItem(borderRadiusStorageKey));
}

function applyCssVariables(values: Record<string, string>) {
  if (typeof document === "undefined") return;

  for (const [name, value] of Object.entries(values)) {
    document.documentElement.style.setProperty(name, value);
  }
}

function syncBrowserAppearance({
  mode,
  radiusPreset,
  themeId,
}: {
  mode: AppThemeMode;
  radiusPreset: BorderRadiusPreset;
  themeId: string;
}) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.classList.toggle("light", mode === "light");
  root.dataset.theme = mode;
  root.dataset.colorTheme = themeId;
  root.dataset.radius = radiusPreset;
  root.style.colorScheme = mode;

  applyCssVariables(getThemeVariables(themeId, mode));
  applyCssVariables(getBorderRadiusValues(radiusPreset));
}

const initialThemeId = readStoredThemeId();
const initialMode = readStoredMode();
const initialRadiusPreset = readStoredRadius();
syncBrowserAppearance({
  themeId: initialThemeId,
  mode: initialMode,
  radiusPreset: initialRadiusPreset,
});

type ThemeState = {
  borderRadiusPreset: BorderRadiusPreset;
  mode: AppThemeMode;
  radiusPresets: typeof borderRadiusPresets;
  setBorderRadiusPreset: (preset: BorderRadiusPreset) => void;
  setMode: (mode: AppThemeMode) => void;
  setTheme: (theme: AppThemeMode) => void;
  setThemeId: (themeId: string) => void;
  theme: AppThemeMode;
  themeId: string;
  themes: typeof appThemes;
};

function persistAndSync(next: {
  mode: AppThemeMode;
  radiusPreset: BorderRadiusPreset;
  themeId: string;
}) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(themeIdStorageKey, next.themeId);
    window.localStorage.setItem(themeModeStorageKey, next.mode);
    window.localStorage.setItem(borderRadiusStorageKey, next.radiusPreset);
  }

  syncBrowserAppearance(next);
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeId: initialThemeId,
  mode: initialMode,
  theme: initialMode,
  borderRadiusPreset: initialRadiusPreset,
  themes: appThemes,
  radiusPresets: borderRadiusPresets,
  setThemeId: (themeId) => {
    const nextThemeId = getThemeDefinition(themeId).id;
    const next = {
      themeId: nextThemeId,
      mode: get().mode,
      radiusPreset: get().borderRadiusPreset,
    };
    persistAndSync(next);
    set({ themeId: nextThemeId });
  },
  setMode: (mode) => {
    const next = {
      themeId: get().themeId,
      mode,
      radiusPreset: get().borderRadiusPreset,
    };
    persistAndSync(next);
    set({ mode, theme: mode });
  },
  setTheme: (theme) => {
    const next = {
      themeId: get().themeId,
      mode: theme,
      radiusPreset: get().borderRadiusPreset,
    };
    persistAndSync(next);
    set({ mode: theme, theme });
  },
  setBorderRadiusPreset: (radiusPreset) => {
    const next = {
      themeId: get().themeId,
      mode: get().mode,
      radiusPreset,
    };
    persistAndSync(next);
    set({ borderRadiusPreset: radiusPreset });
  },
}));

export function useTheme() {
  return {
    borderRadiusPreset: useThemeStore((state) => state.borderRadiusPreset),
    mode: useThemeStore((state) => state.mode),
    radiusPresets: useThemeStore((state) => state.radiusPresets),
    setBorderRadiusPreset: useThemeStore((state) => state.setBorderRadiusPreset),
    setMode: useThemeStore((state) => state.setMode),
    setTheme: useThemeStore((state) => state.setTheme),
    setThemeId: useThemeStore((state) => state.setThemeId),
    theme: useThemeStore((state) => state.theme),
    themeId: useThemeStore((state) => state.themeId),
    themes: useThemeStore((state) => state.themes),
  };
}
