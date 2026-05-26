export type AppThemeMode = "dark" | "light";

export type ThemeColors = Record<`--${string}`, string>;

export type ThemeVariant = {
  accentPreview: string;
  bgPreview: string;
  colors: ThemeColors;
};

export type ThemeDefinition = {
  description: string;
  dark: ThemeVariant;
  id: string;
  light: ThemeVariant;
  name: string;
};

export type BorderRadiusPreset = "default" | "small" | "medium" | "large";

export type BorderRadiusValues = {
  "--radius": string;
  "--radius-lg": string;
  "--radius-md": string;
  "--radius-sm": string;
};

export const borderRadiusPresets: Array<{
  description: string;
  id: BorderRadiusPreset;
  label: string;
  values: BorderRadiusValues;
}> = [
  {
    id: "default",
    label: "Default",
    description: "Sharp",
    values: {
      "--radius": "0.25rem",
      "--radius-sm": "0.05rem",
      "--radius-md": "0.125rem",
      "--radius-lg": "0.25rem",
    },
  },
  {
    id: "small",
    label: "Small",
    description: "Subtle",
    values: {
      "--radius": "0.375rem",
      "--radius-sm": "0.125rem",
      "--radius-md": "0.25rem",
      "--radius-lg": "0.375rem",
    },
  },
  {
    id: "medium",
    label: "Medium",
    description: "Balanced",
    values: {
      "--radius": "0.75rem",
      "--radius-sm": "0.25rem",
      "--radius-md": "0.5rem",
      "--radius-lg": "0.75rem",
    },
  },
  {
    id: "large",
    label: "Large",
    description: "Soft",
    values: {
      "--radius": "1.25rem",
      "--radius-sm": "0.375rem",
      "--radius-md": "0.75rem",
      "--radius-lg": "1.25rem",
    },
  },
];

export const defaultThemeId = "better-auth";
export const defaultThemeMode: AppThemeMode = "dark";
export const defaultBorderRadiusPreset: BorderRadiusPreset = "default";

export const appThemes: ThemeDefinition[] = [
  {
    id: "better-auth",
    name: "Better Auth",
    description: "Better Hub midnight",
    dark: {
      accentPreview: "#71717a",
      bgPreview: "#030304",
      colors: {
        "--background": "#030304",
        "--foreground": "#fafafa",
        "--card": "#111113",
        "--card-foreground": "#fafafa",
        "--primary": "#e4e4e7",
        "--primary-foreground": "#09090b",
        "--secondary": "#1a1a1e",
        "--secondary-foreground": "#fafafa",
        "--muted": "#1a1a1e",
        "--muted-foreground": "#a1a1aa",
        "--accent": "#1a1a1e",
        "--accent-foreground": "#fafafa",
        "--border": "#27272a",
        "--input": "#27272a",
        "--ring": "#3f3f46",
        "--destructive": "oklch(0.704 0.191 22.216)",
        "--success": "oklch(0.627 0.194 149.214)",
        "--warning": "oklch(0.769 0.188 70.08)",
        "--scrollbar-thumb": "#3f3f46",
        "--scrollbar-thumb-hover": "#52525b",
      },
    },
    light: {
      accentPreview: "#71717a",
      bgPreview: "#ffffff",
      colors: {
        "--background": "#ffffff",
        "--foreground": "#18181b",
        "--card": "#f9f9f9",
        "--card-foreground": "#18181b",
        "--primary": "#18181b",
        "--primary-foreground": "#ffffff",
        "--secondary": "#f4f4f5",
        "--secondary-foreground": "#18181b",
        "--muted": "#f4f4f5",
        "--muted-foreground": "#71717a",
        "--accent": "#f0f0f1",
        "--accent-foreground": "#18181b",
        "--border": "#e4e4e7",
        "--input": "#e4e4e7",
        "--ring": "#a1a1aa",
        "--destructive": "#dc2626",
        "--success": "#16a34a",
        "--warning": "#ca8a04",
        "--scrollbar-thumb": "#d4d4d8",
        "--scrollbar-thumb-hover": "#a1a1aa",
      },
    },
  },
  {
    id: "github",
    name: "GitHub",
    description: "GitHub code review palette",
    dark: {
      accentPreview: "#4493f8",
      bgPreview: "#0d1117",
      colors: {
        "--background": "#0d1117",
        "--foreground": "#f0f6fc",
        "--card": "#151b23",
        "--card-foreground": "#f0f6fc",
        "--primary": "#1f6feb",
        "--primary-foreground": "#ffffff",
        "--secondary": "#151b23",
        "--secondary-foreground": "#f0f6fc",
        "--muted": "#151b23",
        "--muted-foreground": "#9198a1",
        "--accent": "#656c7633",
        "--accent-foreground": "#f0f6fc",
        "--border": "#3d444d",
        "--input": "#212830",
        "--ring": "#1f6feb",
        "--destructive": "#f85149",
        "--success": "#3fb950",
        "--warning": "#d29922",
        "--scrollbar-thumb": "#3d444d",
        "--scrollbar-thumb-hover": "#656c76",
      },
    },
    light: {
      accentPreview: "#0969da",
      bgPreview: "#ffffff",
      colors: {
        "--background": "#ffffff",
        "--foreground": "#1f2328",
        "--card": "#ffffff",
        "--card-foreground": "#1f2328",
        "--primary": "#0969da",
        "--primary-foreground": "#ffffff",
        "--secondary": "#f6f8fa",
        "--secondary-foreground": "#1f2328",
        "--muted": "#f6f8fa",
        "--muted-foreground": "#59636e",
        "--accent": "#818b981f",
        "--accent-foreground": "#1f2328",
        "--border": "#d1d9e0",
        "--input": "#d1d9e0",
        "--ring": "#0969da",
        "--destructive": "#cf222e",
        "--success": "#1a7f37",
        "--warning": "#9a6700",
        "--scrollbar-thumb": "#d1d9e0",
        "--scrollbar-thumb-hover": "#afb8c1",
      },
    },
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Black, white, and restraint",
    dark: {
      accentPreview: "#ffffff",
      bgPreview: "#000000",
      colors: {
        "--background": "#000000",
        "--foreground": "#ededed",
        "--card": "#111111",
        "--card-foreground": "#ededed",
        "--primary": "#ffffff",
        "--primary-foreground": "#000000",
        "--secondary": "#1a1a1a",
        "--secondary-foreground": "#ededed",
        "--muted": "#1a1a1a",
        "--muted-foreground": "#a1a1a1",
        "--accent": "#1a1a1a",
        "--accent-foreground": "#ededed",
        "--border": "#333333",
        "--input": "#333333",
        "--ring": "#ffffff",
        "--destructive": "oklch(0.704 0.191 22.216)",
        "--success": "oklch(0.627 0.194 149.214)",
        "--warning": "oklch(0.769 0.188 70.08)",
        "--scrollbar-thumb": "#333333",
        "--scrollbar-thumb-hover": "#444444",
      },
    },
    light: {
      accentPreview: "#000000",
      bgPreview: "#fafafa",
      colors: {
        "--background": "#fafafa",
        "--foreground": "#171717",
        "--card": "#ffffff",
        "--card-foreground": "#171717",
        "--primary": "#000000",
        "--primary-foreground": "#ffffff",
        "--secondary": "#f5f5f5",
        "--secondary-foreground": "#171717",
        "--muted": "#f5f5f5",
        "--muted-foreground": "#737373",
        "--accent": "#f5f5f5",
        "--accent-foreground": "#171717",
        "--border": "#e5e5e5",
        "--input": "#e5e5e5",
        "--ring": "#000000",
        "--destructive": "#dc2626",
        "--success": "#16a34a",
        "--warning": "#ca8a04",
        "--scrollbar-thumb": "#d4d4d4",
        "--scrollbar-thumb-hover": "#a3a3a3",
      },
    },
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Green product console",
    dark: {
      accentPreview: "#3ecf8e",
      bgPreview: "#121212",
      colors: {
        "--background": "#121212",
        "--foreground": "#ededed",
        "--card": "#1a1a1a",
        "--card-foreground": "#ededed",
        "--primary": "#3ecf8e",
        "--primary-foreground": "#121212",
        "--secondary": "#1e1e1e",
        "--secondary-foreground": "#ededed",
        "--muted": "#1e1e1e",
        "--muted-foreground": "#7e7e7e",
        "--accent": "#1e1e1e",
        "--accent-foreground": "#3ecf8e",
        "--border": "#2a2a2a",
        "--input": "#2a2a2a",
        "--ring": "#3ecf8e",
        "--destructive": "#F06A50",
        "--success": "#3ecf8e",
        "--warning": "#f1a10d",
        "--scrollbar-thumb": "#2a2a2a",
        "--scrollbar-thumb-hover": "#383838",
      },
    },
    light: {
      accentPreview: "#15593b",
      bgPreview: "#fafafa",
      colors: {
        "--background": "#fafafa",
        "--foreground": "#171717",
        "--card": "#ffffff",
        "--card-foreground": "#171717",
        "--primary": "#15593b",
        "--primary-foreground": "#ffffff",
        "--secondary": "#f0f0f0",
        "--secondary-foreground": "#171717",
        "--muted": "#f0f0f0",
        "--muted-foreground": "#525252",
        "--accent": "#e8f5ef",
        "--accent-foreground": "#15593b",
        "--border": "#e0e0e0",
        "--input": "#e0e0e0",
        "--ring": "#15593b",
        "--destructive": "#dc2626",
        "--success": "#15593b",
        "--warning": "#ca8a04",
        "--scrollbar-thumb": "#d0d0d0",
        "--scrollbar-thumb-hover": "#a0a0a0",
      },
    },
  },
  {
    id: "rose-pine",
    name: "Rose Pine",
    description: "Soft editorial code",
    dark: {
      accentPreview: "#c4a7e7",
      bgPreview: "#191724",
      colors: {
        "--background": "#191724",
        "--foreground": "#e0def4",
        "--card": "#1f1d2e",
        "--card-foreground": "#e0def4",
        "--primary": "#c4a7e7",
        "--primary-foreground": "#191724",
        "--secondary": "#1f1d2e",
        "--secondary-foreground": "#e0def4",
        "--muted": "#26233a",
        "--muted-foreground": "#908caa",
        "--accent": "#26233a",
        "--accent-foreground": "#c4a7e7",
        "--border": "#403d52",
        "--input": "#26233a",
        "--ring": "#c4a7e7",
        "--destructive": "#eb6f92",
        "--success": "#9ccfd8",
        "--warning": "#f6c177",
        "--scrollbar-thumb": "#403d52",
        "--scrollbar-thumb-hover": "#524f67",
      },
    },
    light: {
      accentPreview: "#907aa9",
      bgPreview: "#faf4ed",
      colors: {
        "--background": "#faf4ed",
        "--foreground": "#575279",
        "--card": "#fffaf3",
        "--card-foreground": "#575279",
        "--primary": "#907aa9",
        "--primary-foreground": "#faf4ed",
        "--secondary": "#fffaf3",
        "--secondary-foreground": "#575279",
        "--muted": "#f2e9e1",
        "--muted-foreground": "#797593",
        "--accent": "#f2e9e1",
        "--accent-foreground": "#907aa9",
        "--border": "#dfdad9",
        "--input": "#f2e9e1",
        "--ring": "#907aa9",
        "--destructive": "#b4637a",
        "--success": "#56949f",
        "--warning": "#ea9d34",
        "--scrollbar-thumb": "#dfdad9",
        "--scrollbar-thumb-hover": "#cecacd",
      },
    },
  },
];

const themeById = new Map(appThemes.map((theme) => [theme.id, theme]));

export function getThemeDefinition(themeId: string): ThemeDefinition {
  return themeById.get(themeId) ?? themeById.get(defaultThemeId) ?? appThemes[0]!;
}

export function getBorderRadiusPreset(preset: string | null): BorderRadiusPreset {
  return borderRadiusPresets.some((option) => option.id === preset)
    ? (preset as BorderRadiusPreset)
    : defaultBorderRadiusPreset;
}

export function getBorderRadiusValues(preset: BorderRadiusPreset): BorderRadiusValues {
  return (
    borderRadiusPresets.find((option) => option.id === preset)?.values ??
    borderRadiusPresets[0]!.values
  );
}

export function getThemeVariables(themeId: string, mode: AppThemeMode): ThemeColors {
  const theme = getThemeDefinition(themeId);
  const colors = theme[mode].colors;
  const statusSuccessSurface = `color-mix(in oklab, ${colors["--success"]} ${mode === "dark" ? "18%" : "12%"}, transparent)`;
  const statusWarningSurface = `color-mix(in oklab, ${colors["--warning"]} ${mode === "dark" ? "18%" : "12%"}, transparent)`;

  return {
    ...colors,
    "--popover": colors["--card"] ?? colors["--background"]!,
    "--popover-foreground": colors["--card-foreground"] ?? colors["--foreground"]!,
    "--overlay": colors["--background"]!,
    "--chart-1": colors["--primary"]!,
    "--chart-2": colors["--success"]!,
    "--chart-3": colors["--warning"]!,
    "--chart-4": colors["--destructive"]!,
    "--chart-5": colors["--muted-foreground"]!,
    "--sidebar": colors["--card"] ?? colors["--background"]!,
    "--sidebar-foreground": colors["--foreground"]!,
    "--sidebar-primary": colors["--primary"]!,
    "--sidebar-primary-foreground": colors["--primary-foreground"]!,
    "--sidebar-accent": colors["--accent"] ?? colors["--muted"]!,
    "--sidebar-accent-foreground": colors["--accent-foreground"] ?? colors["--foreground"]!,
    "--sidebar-border": colors["--border"]!,
    "--sidebar-ring": colors["--ring"]!,
    "--status-success": statusSuccessSurface,
    "--status-success-foreground": colors["--success"]!,
    "--status-success-border": colors["--success"]!,
    "--status-warning": statusWarningSurface,
    "--status-warning-foreground": colors["--warning"]!,
    "--status-warning-border": colors["--warning"]!,
    "--studio-shell": colors["--background"]!,
    "--studio-flow-surface": colors["--background"]!,
    "--studio-control": colors["--card"] ?? colors["--background"]!,
    "--studio-control-hover": colors["--accent"] ?? colors["--muted"]!,
    "--studio-control-foreground": colors["--foreground"]!,
    "--studio-attribution-foreground": colors["--muted-foreground"]!,
    "--studio-edge-stroke": colors["--muted-foreground"]!,
    "--studio-edge-muted-stroke": colors["--muted-foreground"]!,
  };
}
