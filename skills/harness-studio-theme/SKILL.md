---
name: harness-studio-theme
description: Use when changing Harness Studio web UI styling, design tokens, color themes, radius presets, or theme-related settings in apps/web. Apply the Better Hub-inspired shadcn theme system, keep component styles semantic, and avoid business-logic changes when the request is style-only.
---

# Harness Studio Theme

Use this skill whenever work touches `apps/web` styling, theme tokens, color mode, theme switching, radius switching, or visual refactors.

## Source of Truth

- Theme definitions live in `apps/web/src/lib/themes.ts`.
- Theme application and persistence live in `apps/web/src/lib/theme.ts`.
- Global CSS variables, Tailwind token mapping, fonts, shadows, scrollbars, and derived app tokens live in `apps/web/src/index.css`.
- User-facing theme controls live in `apps/web/src/features/settings/settings-page.tsx`.
- Shared primitives live under `apps/web/src/components/ui/`.

The design system is inspired by Better Hub and shadcn, but this app should keep only tokens that Harness Studio actually uses. Do not import Better Hub product-specific tokens unless a local UI consumes them.

## Token Rules

Prefer semantic Tailwind classes and CSS variables:

- Surfaces: `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-accent`
- Text: `text-foreground`, `text-card-foreground`, `text-muted-foreground`, `text-primary`, `text-destructive`
- Borders and focus: `border-border`, `border-input`, `ring-ring`
- App surfaces: `bg-studio-shell`, `bg-studio-panel`, `bg-studio-flow-surface`
- Status: `bg-status-success`, `text-status-success-foreground`, `bg-status-warning`, `bg-status-destructive`, etc.
- Reusable intent colors: `bg-success`, `text-success`, `bg-warning`, `text-warning`, `text-destructive`

Avoid these in business components:

- Raw color literals such as `#fff`, `rgb(...)`, `rgba(...)`, `oklch(...)`, or arbitrary `bg-[#...]`.
- Inline opacity modifiers such as `bg-foreground/5`, `bg-muted/60`, `border-white/10`, or `text-neutral-500`.
- One-off `dark:` colors when a semantic token can express the state.
- Better Hub tokens that do not belong to this app, such as `--code-*`, `--inline-code-*`, `--diff-*`, `--contrib-*`, `--link`, or `--info`.
- Custom shadows, custom radii, or hard-coded pixel radii in feature code. Use `rounded-*`, `shadow-*`, and the radius presets.
- Arbitrary font sizes or spacing such as `text-[11px]`, `gap-[7px]`, or `rounded-[10px]`. Use standard Tailwind steps unless a local CSS variable already owns the layout.

If a new visual need is repeated across multiple features, add a semantic token or a UI primitive style instead of duplicating raw classes.

## Design Thinking

- Read the canonical primitive before styling a feature. For cards, dialogs, popovers, menus, badges, inputs, and buttons, start with `apps/web/src/components/ui/` and only add feature classes for feature-specific layout.
- Let hierarchy come from size, spacing, surface, and placement before adding weight or color. Operational screens should scan quietly.
- Treat radius as a system. Cards, popovers, controls, graph nodes, and small status chips should use their existing tier; do not invent one-off corner sizes.
- Use the adjacency-contrast principle for borders: a border reads differently depending on the two surfaces around it. Prefer the solid `border-border` token for dividers and enclosed content instead of alpha-modulated borders.
- Avoid double borders. If a component, panel handle, or shared primitive already draws the separator, do not add another `border-t`, `border-b`, or `border-r` next to it.
- Keep app-specific dimensions close to the app that owns them. Shared theme tokens should be semantic color, radius, shadow, and repeated surface language, not one-screen layout constants.
- Reuse generic surfaces for local states when possible. Add a new global token only when the state repeats or carries durable product meaning.

## Style-Only Refactor Workflow

1. Confirm the request is style-only. Do not change data flow, behavior, routing, stores, promise metadata, or API calls unless explicitly requested.
2. Audit feature code for non-semantic styling:

```bash
rg -n '#[0-9a-fA-F]{3,8}|rgba\(|rgb\(|oklch\(|bg-\[|text-\[|border-\[|dark:|(bg|text|border|ring|outline|fill|stroke)-[A-Za-z0-9_-]+/[0-9]{1,3}' apps/web/src/features apps/web/src/components/layout
rg -n -e '--(code|inline-code|diff|contrib|link|info)' apps/web/src
```

3. Replace hard-coded visuals with semantic tokens, shared UI components, or existing tokenized utility classes.
4. Keep layout intent intact. Style refactors may adjust spacing, surface treatment, border, shadow, and typography, but should not reorder workflows or remove controls.
5. Check all supported theme dimensions: light/dark mode, color theme, and radius preset.

## Visual Direction

- Dense operational UI, not a marketing page.
- Quiet surfaces, clear hierarchy, restrained borders, and small shadows.
- Cards and panels should feel like shadcn New York: compact, tokenized, and scannable.
- Use skeletons instead of loading spinners where loading states are redesigned.
- Keep typography practical: Geist Sans for UI, Geist Mono for code-like ids.

## Code Conventions

- Prefer `cn()` over template strings for conditional classes.
- Keep feature styles narrow: layout, spacing, and local state only. Put repeated visual treatment in UI primitives or semantic tokens.
- Route new user-facing copy through the existing i18n messages.
- Add new packages through the workspace catalog and reference them with `catalog:`.
- After changing token names, search the entire `apps/web/src` tree for stale variables and classes.

## Verification

For style/theme work, run:

```bash
pnpm --filter @test-harness/web check
pnpm --filter @test-harness/web build
```

When the app is running, also verify in the browser:

- Theme switching updates `data-color-theme`.
- Dark/light switching updates `data-theme` and `class="dark"` correctly.
- Radius switching updates `data-radius` and visible corner radii.
- Feature screens still render without console errors.
