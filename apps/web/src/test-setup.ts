// Test setup for vitest + jsdom + @testing-library/react.
// Loaded once per test file via vite.config.ts's `test.setupFiles`.

import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia; ThemeProvider reads it on mount.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom doesn't ship ResizeObserver either; tests that need a real one
// install their own. This default keeps modules that *touch* it on mount
// (without observing anything) from crashing.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
