# Harness Studio Playground Experience

> Status: active design direction
> Goal: define Harness Studio as a playground-first workbench for promise-driven architecture review and future vibe coding.

## 1. Direction

Harness Studio is not a dashboard. It is a focused playground for understanding and controlling a project through its Harness model.

The intended workflow is layered:

```text
tests/modules + tests/promises
  -> promise-bound unit / integration / browser tests
  -> business logic that satisfies those promises
```

The UI should make that hierarchy visible without asking the user to open raw YAML first. Modules are the project architecture. Promises are behavior contracts inside those architecture boundaries. Evidence and implementation links are supporting detail.

Harness Studio should eventually become the place where a user can manage the Harness model, ask a local agent to make controlled changes, run validation, and decide whether a feature is ready to ship.

## 2. North Star: No-Editor Project Control

The long-term goal is that day-to-day product work does not require opening a code editor first.

The user should be able to open Harness Studio and answer:

- What is this project made of?
- Which architecture modules exist?
- What does each module promise?
- Which promises have accepted meaning?
- Which promises have current evidence?
- What changed, and does the change preserve the approved promise?

In that world, TestHarness is not a test sidebar. It is the project's architecture index and release confidence layer.

A Module is not a loose label, folder mirror, filter, or UI category. It is the reviewable architecture boundary a human should use to understand what the project is made of. The full Module layer should answer: "What are the major parts of this system, and what does each part promise?"

This rule applies beyond the UI. Skills that generate modules, schemas that describe modules, validators that reject vague modules, and future daemon actions should all treat modules as architecture boundaries first.

## 3. Product Principle

Use one playground as the product surface.

Remove the sidebar as a product concept. Remove the landing dashboard. Remove top-level management pages for modules, promises, runs, generation, review queues, and status pages. The root route should open directly into the React Flow playground.

The outer app shell should be almost invisible:

- no sidebar
- no landing page
- no decorative chrome
- no fake buttons
- no top-level tabs
- no gradients, shadows, blur, or translucent panels

The user should feel they are always inside the playground.

## 4. Playground Layout

The main viewport is a single React Flow canvas inside a bordered playground frame.

The frame should be close to the app edge, with only a small outer gap. The visual language is flat and square:

- square corners
- one clear border around the playground
- token-based colors from the app theme
- no gradient backgrounds
- no decorative shadows
- no semi-transparent panels

React Flow's own layout primitives should be used for canvas overlays:

- top controls live in a React Flow `Panel`
- the right context inspector lives in a React Flow `Panel`
- zoom and fit controls use React Flow controls where appropriate

The top controls must not be squeezed by the context inspector. The header area remains reserved, and the context inspector starts below it.

## 5. Top Controls

The top control panel is the only persistent navigation chrome.

Left side:

- project switcher
- breadcrumb
- search

Right side:

- total module count badge
- total promise count badge
- snapshot source and freshness indicator
- settings button

All buttons and icon buttons should use shared shadcn/ui components and consistent sizes. Avoid one-off sizing for individual buttons.

### Project Switcher

The project switcher lets the user move between local Harness projects.

When the daemon is connected, the switcher must read from the authenticated local daemon project registry. It should not be a visual-only frontend list, and it should not require account login or a hosted server.

It should provide:

- search over recently opened projects
- recent project list
- current project check mark
- add new project action
- directory selection for adding a project

Switching projects must eventually change the actual daemon-backed project snapshot. A visual-only switcher is not acceptable as the final behavior.

### Breadcrumb

The breadcrumb sits next to the project switcher and represents focus inside the same playground.

Examples:

```text
todo-backend
todo-backend > TodoMVC Client
todo-backend > Todo-Backend API Contract > Creates todos
```

Clicking a breadcrumb segment should move focus back up without leaving the playground.

### Search

Search is the fastest way to jump to a known module or promise.

It should be available from the top canvas controls and a keyboard shortcut. Search should match module titles, promise titles, promise ids, feature names, priorities, lifecycle states, and covered file paths. Results should distinguish modules from promises and show enough context to choose confidently.

Selecting a module result focuses that module. Selecting a promise result focuses its owning module, selects the promise node, opens the context inspector, and updates the URL. This is especially important for newly drafted promises, because a reviewer should be able to find the related UI before implementation code exists.

### Settings

Settings are opened from the top-right settings button.

Settings should use a shadcn/ui Dialog, not a separate settings page. Settings contains product-level preferences such as:

- language
- light / dark mode
- daemon status and local pairing details
- revoke local daemon token

Language switching should not occupy prime top-right space as a standalone control.

There should be no login surface for local daemon usage.

### Snapshot Source

Harness Studio must make the current data source visible.

Daemon-backed data is the live project view. Static fallback data is only a degraded read-only view and may be stale. If Studio renders fallback data, the UI must clearly state that newly added modules or promises can be missing and provide an obvious reconnect or pairing path.

Module and promise counts should inherit the same source state. A count from fallback data must not look like canonical project truth.

## 6. Graph Model

The graph reveals Harness complexity progressively:

1. **Project level**: show Module nodes, because Modules equal the architecture map.
2. **Module focus**: selecting a Module expands or focuses its Promise nodes.
3. **Promise focus**: selecting a Promise opens the context inspector.
4. **Evidence level**: tests, run evidence, and implementation links appear inside the inspector first.

Navigation changes focus inside the same graph rather than switching to separate management pages.

## 7. Module Nodes

Module nodes must be readable as architecture boundaries.

Each Module node should show:

- module title
- priority badge
- review attention indicator when owned promises need human review
- promise count
- coverage count
- evidence or run status when available

Each Module node should avoid:

- a redundant "Module" tag
- vague labels such as "Relevance unknown"
- long descriptions
- full YAML metadata

Priority is important and should shape both layout and display:

- P0 modules appear in the first row or first visual group.
- P1 modules appear in the next row or next visual group.
- Lower priorities continue downward.
- Priority badges should be compact and visually clear.

The node layout should make the project architecture legible at a glance.

### Module Review Attention

Modules should show a compact attention dot when they own promises that need human review.

The first version should define "needs attention" from promise lifecycle and review state, not from per-user unread state. A module needs attention when it owns proposed promises, changed promises, pending review promises, or future protocol states that explicitly require review.

This dot is not decorative. It answers: "Which architecture boundary should I inspect next?" Selecting the module should surface the review-required promises before already-reviewed promises.

The visual can look like a small red dot, but implementation should use semantic theme tokens rather than hard-coded palette classes.

## 8. Promise Nodes

Promise nodes appear when the user focuses a module or when a promise is directly selected by URL.

Promise nodes should show:

- short title
- priority badge
- lifecycle
- current evidence or run status

They should remain behavior-first. They should not look like task cards, test files, or implementation file nodes.

## 9. Context Inspector

The context inspector is a right-side React Flow `Panel`, not a normal app sidebar.

It should:

- sit inside the playground frame
- start below the top control panel
- be collapsible
- preserve graph selection when collapsed
- use shared shadcn/ui building blocks where appropriate
- avoid shadows, transparency, and rounded card styling

When a Module is selected, the inspector shows architecture context:

- module title
- purpose
- priority
- owned promises
- coverage paths
- evidence summary

When a Promise is selected, the inspector shows behavior context:

- promise title and id
- purpose
- priority, boundary, lifecycle, review state
- Given / When / Then
- failure meaning
- observed files
- bound test evidence and current result status
- linked implementation files when available

The inspector should start with meaning and status, then reveal metadata. It should never become a raw YAML dump.

## 10. Style System

Harness Studio should use a flat, practical design language.

Use theme tokens from `apps/web/src/index.css` for:

- colors
- borders
- backgrounds
- spacing
- shadows, when shadows are intentionally allowed
- radii

Avoid hard-coded Tailwind palette classes such as `border-zinc-950` in application surfaces. Those classes make theme switching harder and hide design intent.

Current design defaults:

- square corners
- no large radius cards
- no gradients
- no decorative shadows
- no blur panels
- no semi-transparent panels
- low visual ornamentation
- high layout clarity

shadcn/ui components are preferred for standard controls such as Button, Badge, Dialog, Dropdown Menu, Breadcrumb, Tooltip, and similar UI primitives. Local variants may extend these components, but they should preserve theme-token behavior.

## 11. URL Model

Use query-state URLs first because they describe focus inside one playground:

```text
/                         -> project module overview
/?module=<module-id>       -> same playground focused on one module
/?promise=<promise-id>     -> same playground with promise selected
```

Semantic routes can be added later if sharing, browser history, or deep linking require them. The important rule is that navigation changes focus inside the playground instead of switching to separate management pages.

## 12. Future Daemon Direction

The daemon is the bridge from read-only visualization to local control and vibe coding. Its detailed runtime boundary is defined in [Harness Daemon Runtime Control Plane](./harness-daemon-runtime-control-plane.md).

The important product rule is that the daemon is a local control plane, not a new source of truth and not a server-mediated identity system. Harness files and explicit run evidence remain canonical; the daemon indexes, watches, runs, and streams derived state back into Harness Studio after local pairing. The no-login connection model is defined in [Local Daemon Studio Connection](./local-daemon-studio-connection.md).

Later, the playground can expose actions such as:

- propose a new architecture Module as an explicit architecture review event
- draft or split Promises
- bind tests to a Promise
- run `harness check` or `harness test`
- ask a local agent to implement code until a Promise passes
- ask a local agent to modify tests or implementation while preserving accepted promise meaning
- summarize evidence drift
- open a human approval flow for promise changes

Agent actions should never make the UI feel like a free-form chat app pasted beside a graph. The graph remains the source of orientation, and the Harness remains the release gate.

## 13. Implementation Stages

### Stage 1: Playground Shell

- remove sidebar and landing dashboard
- render one bordered React Flow playground
- move persistent controls into React Flow panels
- use project switcher, breadcrumb, count badges, and settings dialog
- remove fake or non-functional buttons
- enforce flat token-based styling

### Stage 2: Graph Interaction

- render Module nodes grouped by priority
- expand or focus Promise nodes on Module selection
- open the right context inspector below the top panel
- keep URL query state in sync
- support inspector collapse and restore

### Stage 3: Daemon-Backed Data

- pair Studio with the local daemon without account login
- replace static frontend snapshots with daemon project snapshots
- switch real projects through the project switcher
- watch Harness files and refresh the graph
- stream project and snapshot events

### Stage 4: Runs And Evidence

- run Harness commands from the playground
- collect result evidence
- show latest run and promise status
- link tests and implementation files from the inspector

### Stage 5: Controlled Vibe Coding

- introduce local agent sessions through daemon providers
- show permission requests and diffs as reviewable actions
- let agents draft promises, bind tests, and implement approved behavior
- preserve the graph as the orientation surface

## 14. Product Decisions

Resolved:

1. The product surface is called **Harness Studio**.
2. The first screen is a playground, not a dashboard.
3. There is no sidebar.
4. Settings open in a shadcn/ui Dialog.
5. Project switching belongs in the top-left playground controls.
6. Search belongs in the top canvas controls because promise review needs direct navigation.
7. Breadcrumbs show current focus beside the project switcher.
8. Module and promise counts are compact badges on the top-right.
9. The context inspector is collapsible and lives inside the React Flow playground.
10. The visual language is flat, square, and token-based.
11. Local daemon usage does not require account login or a hosted relay.

Default until proven otherwise:

1. Evidence and implementation files stay inside the inspector first. Promote them into graph nodes only when they help orientation, comparison, or impact analysis.
2. Use query-state URLs first.
3. Show release confidence through a default profile: all accepted P0/P1 promises must pass and all accepted promises must have current evidence. Make the profile configurable later, once real projects reveal the right knobs.
