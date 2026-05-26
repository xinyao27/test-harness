import { create } from "zustand";

export type AppTheme = "dark" | "light";

const themeStorageKey = "HARNESS_STUDIO_THEME";

function readInitialTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";

  const saved = window.localStorage.getItem(themeStorageKey);
  if (saved === "dark" || saved === "light") return saved;

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function syncBrowserTheme(theme: AppTheme) {
  if (typeof document === "undefined") return;

  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
}

const initialTheme = readInitialTheme();
syncBrowserTheme(initialTheme);

type ThemeState = {
  setTheme: (theme: AppTheme) => void;
  theme: AppTheme;
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    window.localStorage.setItem(themeStorageKey, theme);
    syncBrowserTheme(theme);
    set({ theme });
  },
}));

export function useTheme() {
  return {
    setTheme: useThemeStore((state) => state.setTheme),
    theme: useThemeStore((state) => state.theme),
  };
}
