# Todo-Backend Examples

This example uses the classic TodoMVC React UI as a real client for Todo-Backend-compatible APIs.

The client is vendored as source and rebuilt as a small Vite app. It intentionally does not keep the original TodoMVC webpack, ESLint, generated `dist/`, or lockfile setup.

## Client

```bash
pnpm example:todo-client
```

The client runs at:

```text
http://127.0.0.1:3100/
```

The client reads todos from `VITE_TODO_BACKEND_URL`, defaulting to:

```text
http://127.0.0.1:3101/todos
```

Start a Todo-Backend-compatible server at that URL, then open the Vite URL printed by the command.

## Spec Coverage

This example treats the official Todo-Backend JavaScript spec as the phase-one coverage baseline:

```text
https://github.com/TodoBackend/todo-backend-js-spec/blob/master/js/specs.js
```

The traceability map lives in:

```text
examples/todo-backend/spec-map.yaml
```

Run the coverage check with:

```bash
pnpm example:todo-spec-map:check
```

The check confirms that every official spec case is listed, every case maps to at least one Harness promise, and every mapped promise id exists in the example promise files.

## Harness Feature Coverage

The Todo-Backend showcase is also used to exercise the full TestHarness feature set. The feature map lives in:

```text
examples/todo-backend/harness-feature-map.yaml
```

Run both coverage checks with:

```bash
pnpm example:todo:check
```

This validates that every canonical Harness module and every promise owned by those modules has an explicit application path in the Todo-Backend showcase.

## Attribution

The UI is based on the React example from TasteJS TodoMVC:

```text
https://github.com/tastejs/todomvc/tree/master/examples/react
```

The source has been refactored into a Vite app and changed from local reducer state to a Todo-Backend HTTP API client.
