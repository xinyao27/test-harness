/**
 * xterm.js color palettes for the Pty card terminals.
 *
 * Two complete VS Code-style ANSI palettes (one dark, one light) so a
 * busy `claude` / `codex` / `cursor-agent` session renders with the
 * correct semantic colors instead of falling back to xterm's defaults
 * (which are designed for an all-black terminal and look muddy on our
 * card background).
 *
 * `background` is intentionally transparent — the card's own
 * `.studio-pty-card` background bleeds through, so the terminal blends
 * with the card chrome and the canvas behind it instead of stamping a
 * hard black rectangle.
 */

import type { ITheme } from "@xterm/xterm";

/** VS Code's "Dark+" terminal palette. Same set the assistant-style
 *  desktop apps (Cursor, collab-public) ship with. */
export const terminalDarkTheme: ITheme = {
  background: "rgba(8, 8, 8, 0)",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
  cursorAccent: "#1e1e1e",
  selectionBackground: "#264f78",
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#ffffff",
};

/** VS Code's "Light+" terminal palette — One Light / Atom-derived
 *  saturation so colors stay legible on a near-white background. */
export const terminalLightTheme: ITheme = {
  background: "rgba(248, 248, 248, 0)",
  foreground: "#383a42",
  cursor: "#383a42",
  cursorAccent: "#ffffff",
  selectionBackground: "#add6ff",
  black: "#383a42",
  red: "#e45649",
  green: "#50a14f",
  yellow: "#c18401",
  blue: "#4078f2",
  magenta: "#a626a4",
  cyan: "#0184bc",
  white: "#fafafa",
  brightBlack: "#4f525e",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#e5c07b",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#ffffff",
};

/**
 * Resolve the right palette for the current studio theme. The studio's
 * `useTheme` mode is "light" | "dark" | "system"; we resolve "system"
 * here via `prefers-color-scheme` so callers never have to think about
 * it. Defaults to dark when the media query isn't available (SSR /
 * test envs).
 */
export function pickTerminalTheme(mode: "light" | "dark" | "system"): ITheme {
  if (mode === "light") return terminalLightTheme;
  if (mode === "dark") return terminalDarkTheme;
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? terminalDarkTheme : terminalLightTheme;
}
