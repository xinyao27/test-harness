# Harness Daemon Runtime Control Plane

> Goal: define the local daemon as Harness Studio's runtime control plane without making it a new source of truth.

## 1. Positioning

Harness Daemon is the local runtime control plane for Harness Studio.

It connects the Studio UI to local projects, Harness protocol files, test commands, run evidence, file watching, and eventually local coding agents. Its job is to make local project state observable and controllable from Harness Studio.

For the local-first Studio path, the daemon does not require account login and does not maintain an outbound connection to a hosted server. Studio talks directly to the daemon over a local loopback boundary after a daemon-owned pairing flow. The detailed connection model is defined in [Local Daemon Studio Connection](./local-daemon-studio-connection.md).

The daemon is not the canonical store for Harness meaning. Project files remain the source of truth:

- `tests/modules/`
- `tests/promises/`
- `tests/harness.yaml`
- versioned protocol artifacts
- run evidence files produced by adapters and runners

The daemon may index, cache, validate, diff, and stream this state, but it must be able to rebuild its meaningful view from protocol files and run evidence.

## 2. Core Principle

The daemon must not become an implicit state center.

If module metadata, promise meaning, run status, watched file state, and agent writes live primarily in daemon memory or a private database, the system can drift away from its protocol-first model. That would make Harness Studio easier to demo but harder to trust.

The safe rule is:

1. Persisted Harness meaning belongs in protocol files.
2. Persisted execution history belongs in explicit run evidence.
3. Daemon state is derived, operational, or recoverable.
4. Any daemon cache must be disposable.
5. Any agent or UI write must produce a reviewable file change or run artifact.

### Local HTTP Boundary

The first daemon transport is local HTTP. That does not make it public infrastructure.

The daemon should default to a loopback address, accept only expected local Host headers, and allow browser requests only from configured Harness Studio origins. Snapshot responses should not expose absolute local filesystem paths by default. When Studio falls back to static snapshots because the daemon is unavailable or the response contract is invalid, the UI should make that data source visible.

The daemon should own pairing and local session issuance. Studio should receive an opaque local token after the user completes a daemon-generated one-time pairing flow. Non-pairing APIs must require that token, streaming APIs must authenticate before emitting events, and token records must be revocable. This preserves the no-login model without making arbitrary webpages trusted daemon clients.

## 3. Responsibilities

### Project Registry

The daemon tracks known local projects:

- current project
- recently opened projects
- project display names
- project root paths
- whether a path looks like a Harness project

This is local user preference state, not Harness project meaning.

### Harness Indexer

The daemon reads Harness-owned project files and builds a structured project snapshot:

- modules
- promises
- ownership links
- coverage paths
- promise lifecycle and review metadata
- evidence references when available
- graph-friendly node and edge projections

The indexer should prefer the same protocol validation path used by `harness-core`.

### Graph Snapshot API

Harness Studio needs one stable read model that can replace frontend static snapshots.

The graph snapshot should be a projection, not a separate authoring model. It can include UI-friendly fields such as labels, badges, grouping, and relationships, but those fields must be derived from modules, promises, and evidence.

### File Watcher

The daemon watches Harness-owned project paths and emits project refresh events when files change.

The watcher should not mutate project files. It should debounce changes, re-index the project, compute a new snapshot, and stream a refresh event to Studio.

### Runner API

The daemon can run Harness checks and configured test commands.

Runner execution has side effects, so it must be isolated behind explicit APIs, process tracking, cancellation, logs, and result collection. Runner output should be converted into explicit run evidence and normalized events.

### Result Store

The daemon may store run history and latest run summaries, but the store must not replace canonical promise files.

Useful stored data includes:

- run id
- command
- start and finish time
- status
- adapter result file paths
- promise status summary
- failure evidence summary

SQLite is acceptable for operational history if every record points back to explicit files or command output. A file-backed store is acceptable for the first implementation if it keeps the recovery model simple.

### Event Stream

The daemon streams normalized local runtime events to Harness Studio.

Example event families:

- `project.changed`
- `project.indexed`
- `snapshot.updated`
- `file.changed`
- `run.started`
- `run.output`
- `run.finished`
- `agent.session.started`
- `agent.turn.started`
- `agent.permission.requested`

The event schema should be versioned early, because Harness Studio and future Agent Bridge code will both depend on it.

### Agent Bridge

The daemon eventually owns local coding agent sessions through a provider abstraction.

ACP should be one provider, not the daemon's only internal protocol:

- `AcpProvider`
- `CodexProvider`
- `ClaudeProvider`
- `OpenCodeProvider`

Studio should consume daemon-level agent events and permission requests instead of knowing provider-specific protocols.

### Permission And Safety

The daemon owns local side-effect boundaries:

- file writes
- command execution
- process spawning
- agent tool approvals
- diff presentation
- project root restrictions

Agent writes must not bypass the Harness review model. A write that changes module or promise meaning should produce an explicit reviewable change.

## 4. Non-Goals

The daemon should not:

- hide canonical module or promise meaning inside a database
- replace `harness-core`
- require account login or a hosted relay for local Studio usage
- couple core orchestration to Claude, Codex, ACP, or OpenCode directly
- store heavy UI state such as selected nodes or panel expansion
- allow unrestricted command execution or file writes by default
- make Harness Studio feel like a generic chat UI beside a graph

## 5. Implementation Phases

### Phase 1a: Read-Only Project Groundwork

Build the stable read path first:

- project registry
- project root validation
- Harness file discovery
- module and promise loading
- protocol validation
- graph snapshot API

This phase should replace frontend static snapshots with real project data.

### Phase 1b: Watch And Stream

Add incremental runtime awareness:

- file watcher
- debounce and re-index
- snapshot diff or snapshot replacement events
- SSE or NDJSON event stream
- Studio refresh integration

This phase should make Harness Studio reflect file changes without reloads.

### Phase 1c: Runner

Add explicit side-effect execution:

- runner API
- command configuration
- process lifecycle tracking
- cancellation
- logs
- result collection
- latest run summary

Runner behavior should be independently testable because it is the first phase that executes user commands.

### Phase 2: Agent Bridge

Add local coding agents after the event schema, permission model, and project snapshot model are stable:

- `AgentProvider` trait
- provider lifecycle
- session and turn events
- permission request events
- provider-specific adapters
- reviewable write integration

Agent Bridge is intentionally later because it combines process execution, file writes, permission prompts, and long-lived sessions.

## 6. Rust Module Shape

Start with clear module boundaries. Split into crates when the traits stabilize.

Suggested shape:

- `harness-core`: protocol models, schema validation, pure transformations
- `harness-store`: project file loading, result store traits, file-backed or SQLite implementations
- `harness-runner`: runner traits, process execution, result collection
- `harness-agent`: `AgentProvider` trait and provider implementations
- `harness-daemon`: runtime orchestration, state machine, event bus
- `harness-api`: Axum routes, SSE or NDJSON streaming, request and response types

If a multi-crate split slows early development, the first Rust implementation can use one crate with these as internal modules:

- `api`
- `events`
- `projects`
- `indexer`
- `watch`
- `runner`
- `results`
- `agents`
- `safety`

The important boundary is dependency direction:

```text
api -> daemon orchestration -> store / runner / agent
store / runner / agent -> core
core -> no daemon, no api, no process IO
```

## 7. Final Architecture

```text
Harness Studio
  -> local loopback Harness API
    -> Pairing And Session Guard
      -> Daemon Orchestrator
        -> Project Registry
        -> Harness Indexer
        -> File Watcher
        -> Runner
        -> Result Store
        -> Agent Bridge
        -> Event Bus
          -> SSE / NDJSON stream
```

All visible behavior in Studio should be explainable through one of these sources:

- canonical Harness files
- explicit run evidence
- local runtime events
- user preferences such as recent projects

That keeps the daemon powerful enough to support vibe coding while preserving the Harness promise model.
