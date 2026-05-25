# Harness Studio Canvas Experience

> Status: discussion draft
> Goal: define Harness Studio as a canvas-first workbench for promise-driven vibe coding.

## 1. Direction

Harness Studio should not feel like a generic admin dashboard. It should feel like a focused TestHarness workbench where a human and an agent can grow a project from reviewed behavior commitments into tests and implementation.

The intended workflow is layered:

```text
tests/modules + tests/promises
  -> promise-bound unit / integration / browser tests
  -> business logic that satisfies those promises
```

This means the primary UI should help users understand and manage the behavior model first. Tests and implementation code appear as evidence and linked detail under that model, not as separate top-level products.

The future direction is a vibe coding environment backed by a daemon that can connect Harness Studio to Codex, cloud workers, or other agent runtimes. That daemon can later draft promises, bind tests, run the harness, and modify business code. For now, Harness Studio should prepare the interaction model without trying to implement agent control yet.

## 2. North Star: No-Editor Project Control

The long-term goal is that day-to-day product work does not require opening a code editor first. The user should be able to open Harness Studio, manage the behavior model, ask the agent to perform controlled changes, and judge the project through accepted promises and passing evidence.

In that world, TestHarness is not a side panel for tests. It is the project's architecture index and release confidence layer:

- Modules are the project architecture's first visible layer.
- Promises describe the behavior contract each module must keep.
- Tests are executable evidence for those promises.
- Business logic is linked implementation that satisfies the evidence.
- A passing Harness run means every accepted behavior commitment that matters for release has current evidence.

A Module is not a loose label, filter, folder mirror, or UI category. It is the reviewable architecture boundary a human should use to understand what the project is made of. Looking at the Module layer should answer: "What are the major parts of this system, and what does each part promise?"

This is a project-wide modeling rule, not a canvas-only presentation rule. Skills that generate modules, schemas that describe modules, validators that reject vague modules, and future daemon actions should all treat modules as architecture boundaries first.

This does not mean "any green test suite proves the product is correct." It means the system should make the release contract explicit: accepted promises are complete enough, each accepted promise has meaningful evidence, and the latest Harness run is passing. When those conditions hold, Harness Studio can become the place where a human decides the feature is ready to ship.

## 3. Problem With The Current Direction

The current dashboard direction exposes too many concepts too early: overview, modules, promises, graph, review queues, generation, runs, and status views all compete as top-level navigation. This makes the product feel bigger than the user's first task.

For a new user, the first useful question is much simpler:

> What modules does this project promise to support, and what promises belong to each module?

Everything else should unfold from that question.

## 4. Product Principle

Use a single canvas as the primary surface.

Remove the sidebar as a product concept. Remove the landing dashboard. The user should enter directly into a large XYFlow canvas that represents the project behavior model.

The canvas should reveal complexity progressively:

1. **Project level**: show only Module nodes, because Modules equal the architecture map.
2. **Module level**: selecting a Module expands or focuses its Promise nodes.
3. **Promise level**: selecting a Promise opens a collapsible right-side context panel with the promise content.
4. **Evidence level**: tests, result evidence, and business logic links appear under the selected promise, not as global navigation.

This keeps the experience calm: one surface, one mental model, increasingly rich detail as the user asks for it.

## 5. MVP Experience

### Entry

The root route should render the canvas directly. There is no separate homepage and no "Dashboard" screen.

The first viewport contains:

- an XYFlow canvas filling the available space
- Module nodes arranged clearly
- minimal canvas controls such as zoom, fit view, and search if needed
- no sidebar
- no top-level tabs for Overview, Modules, Promises, Runs, Generate, or Review

### Module Nodes

Each Module node should communicate only the essentials:

- module title
- number of promises
- aggregate run status, if known
- small signal for review or evidence issues, if any

The node should not expose long descriptions or full metadata. That belongs in detail panels after selection.

The full set of Module nodes must be readable as the project's architecture map. If a Module does not correspond to a meaningful architectural part, it should not be a Module. If an important architectural part is missing from the Module layer, Harness Studio is hiding the shape of the project.

### Module Selection

Clicking a Module should make that module the active focus.

The active state can:

- expand Promise nodes around the Module
- dim unrelated modules
- draw ownership edges from the Module to its promises
- update the URL so the selected module can be shared or restored

The user should feel they are zooming into one area, not navigating away.

### Promise Nodes

Promise nodes should be readable and compact:

- short title
- priority
- lifecycle
- current run status

Promise nodes should remain behavior-first. They should not look like test files, code files, or task cards.

### Right Context Panel

Selecting a Promise opens a right-side context panel attached to the canvas. The panel must be collapsible. Collapsing it should preserve selection, keep a small reopen affordance, and let the canvas reclaim space without losing the user's place.

In the MVP, this panel acts as a Promise Inspector and should show:

- promise title and id
- purpose
- priority, boundary, lifecycle, review state
- Given / When / Then
- failure meaning
- observed files
- bound test evidence and current result status
- linked implementation files when available

The panel should be scannable. It should start with meaning and status, then reveal metadata. It should not become a YAML dump.

Later, the same right-side surface can gain prompt and agent controls for controlled vibe coding. It should still remain contextual to the selected Module or Promise instead of becoming a global chat sidebar.

### Evidence And Code Links

Evidence should be one layer deeper than promises.

From the context panel, the user can inspect:

- tests that bind to the promise id
- latest adapter results
- observed source files
- implementation files related to the promise

These can eventually become graph nodes, but they should not appear by default on first entry.

## 6. Information Architecture

The UI should be organized as canvas state, not as pages in a sidebar.

Suggested URL model:

```text
/                         -> canvas with module overview
/?module=<module-id>       -> same canvas focused on one module
/?promise=<promise-id>     -> same canvas with promise selected and panel open
```

Alternative route-based URLs are acceptable if they still render the same canvas:

```text
/modules/<module-id>
/promises/<promise-id>
```

The important rule is that navigation changes focus inside the canvas instead of switching to separate management pages.

## 7. What To Remove From The First Experience

Remove these as top-level destinations:

- Dashboard / Overview
- Modules list page
- Promises list page
- Project map as a separate page
- Review queue
- Generate promise
- Runs
- Status pages

Some of these ideas can return as contextual overlays or panel sections later. They should not be visible as first-level navigation.

## 8. Future Daemon Direction

The daemon is the bridge from read-only visualization to vibe coding.

Later, the canvas can expose actions such as:

- propose a new architecture Module as an explicit architecture review event
- draft or split Promises
- bind tests to a Promise
- run `harness check` or `harness test`
- ask Codex to implement code until a Promise passes
- ask Codex to modify tests or implementation while preserving the accepted promise meaning
- summarize evidence drift
- open a human approval flow for promise changes

The daemon must preserve the Harness model:

1. Module changes are treated as explicit architecture review events.
2. Promise meaning is drafted inside the owning architecture module before implementation work begins.
3. Human review approves or edits the promise.
4. Tests bind to the approved promise id.
5. Implementation work follows the promise and test evidence.
6. Harness Studio shows the resulting status and links.

Agent actions should never make the UI feel like a free-form chat app pasted beside a graph. The graph remains the source of orientation, and the Harness remains the release gate.

## 9. Implementation Stages

### Stage 1: Canvas-Only Read Model

- replace the current landing/dashboard/sidebar experience with Harness Studio's canvas
- render Module nodes first
- expand Promise nodes on Module selection
- open a collapsible right context panel on Promise selection
- keep all data read-only

### Stage 2: Evidence Drilldown

- show bound test evidence in the context panel
- show run status and latest result details
- link observed source files and implementation files
- add lightweight filtering/search without reintroducing a sidebar

### Stage 3: Controlled Vibe Coding

- introduce a daemon API
- allow promise drafting and test binding through explicit actions
- run Harness commands from the UI
- connect Codex/cloud workers to implement approved promises

## 10. Product Decisions And Defaults

Resolved:

1. The product surface is called **Harness Studio**.
2. The right-side context panel is collapsible.

Default until proven otherwise:

1. Evidence and implementation files stay inside the context panel first. Promote them into graph nodes only when they help orientation, comparison, or impact analysis.
2. Use query-state URLs first (`/?module=...`, `/?promise=...`) because they express focus inside one canvas. Semantic routes can be added later if sharing, browser history, or deep linking need them.
3. Show release confidence through a default profile: all accepted P0/P1 promises must pass and all accepted promises must have current evidence. Make the profile configurable later, once real projects reveal the right knobs.
