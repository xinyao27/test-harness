# Local Daemon Studio Connection

> Status: proposed design direction
> Goal: connect Harness Studio to a local daemon without account login, a hosted relay, or centralized daemon auth.

## 1. Decision

Use a decentralized local capability model.

Harness Studio may be deployed on the web or packaged locally, but the daemon stays local. The daemon is the local authority for project access, run execution, file watching, and future agent sessions. A hosted service is not required for local daemon use.

The default shape is:

```text
Harness Studio
  -> browser request to loopback
    -> local Harness Daemon
      -> local projects, runners, files, and agents
```

There is no required login. There is no daemon connection to a central server. There is no server relay between Studio and the daemon.

## 2. Pairing Model

The daemon should generate pairing credentials.

Recommended flow:

1. The daemon starts on loopback and exposes a health endpoint plus a pairing endpoint.
2. Studio discovers the daemon and detects that no valid local session exists.
3. The user starts pairing from Studio settings or project controls.
4. The daemon generates a short-lived one-time code.
5. The user confirms the code in the local pairing flow.
6. The daemon returns an opaque local session token.
7. Studio stores that token locally and sends it on future daemon requests.

The daemon stores only a token hash and operational metadata:

- client label
- allowed origins
- allowed project roots
- issued time
- expiry time
- revocation state

This keeps Studio simple. Studio does not mint authority for the daemon; it only proves that the user completed the daemon-owned pairing flow.

## 3. Local API Security

The daemon is local infrastructure, not public infrastructure.

Default security rules:

- Bind to loopback by default.
- Reject non-local network access unless the user explicitly enables it.
- Allow only exact configured Studio origins through CORS.
- Never use wildcard browser origins.
- Support browser private-network preflight behavior for deployed Studio origins.
- Require a valid local session token for every non-pairing endpoint.
- Authenticate streaming connections before sending project, run, or agent events.
- Avoid putting long-lived tokens in query strings.
- Do not rely on cookies for daemon auth.

The daemon may expose a small unauthenticated surface for health and pairing state, but that surface must not reveal project structure, absolute file paths, run logs, agent data, or user secrets.

## 4. Project Scope

The daemon owns the local project registry.

Project entries are local preference and permission state, not canonical Harness meaning. A project can be read only when its root is approved by the daemon.

Adding a project should require explicit local user intent, such as selecting a directory from Studio or approving a daemon-side request. Once approved, the daemon can index:

- `tests/modules/`
- `tests/promises/`
- `tests/harness.yaml`
- explicit run evidence files

The daemon must not let a Studio request escape the approved project root.

## 5. Studio UX

Harness Studio should present daemon connection as local capability, not account identity.

Studio should show:

- disconnected
- pairing required
- pairing in progress
- connected
- invalid or expired session
- daemon unavailable

Settings should use shadcn/ui controls for:

- connection status
- pairing
- reconnect
- revoke local token
- clear local daemon state

Project switching should use the authenticated daemon project registry when connected. If the daemon is unavailable, Studio may fall back to static read-only snapshots, but the UI must make that data source visible.

Studio should not show account login as a requirement for local daemon features.

## 6. Event And Command Channel

Snapshots can start as ordinary authenticated HTTP requests.

Runtime changes should use a versioned stream. SSE is enough for one-way daemon-to-Studio events. NDJSON over HTTP or WebSocket can be introduced when bidirectional runtime control needs a single long-lived channel.

The first authenticated event families should be:

- `project.indexed`
- `snapshot.updated`
- `file.changed`
- `run.started`
- `run.output`
- `run.finished`

Agent event families can be added after project snapshots, project switching, and runner actions are stable.

## 7. Non-Goals

This design does not include:

- account login
- team permissions
- cloud sync
- remote mobile control
- hosted daemon relay
- central task queue
- public daemon listener by default

Those may become separate product lines later. They should not complicate the local-first Studio plus daemon path.

## 8. Implementation Sequence

1. Write and review the daemon connection promises.
2. Add daemon health, pairing state, and token issuance.
3. Gate snapshot and project registry APIs behind the local token.
4. Make Studio settings show real daemon connection state.
5. Replace visual-only project switching with daemon-backed project registry data.
6. Add authenticated event streaming.
7. Add runner APIs.
8. Add agent provider sessions and permission events.
