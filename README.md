# Test Harness

A promise-driven Test Harness with a language-agnostic YAML protocol.

The seed Harness stores reviewed behavior commitments as canonical `.promise.yaml` files, lets adapters bind executable tests to promise ids, collects adapter results into `.harness/results.yaml`, and renders a human-readable promise status report.

The current repository provides a TypeScript reference implementation and a Vitest adapter. The stable layer is the `apiVersion: 1` protocol under `protocol/v1/`.

## Current Loop

```text
promises/**/*.promise.yaml
  -> adapter tests
  -> harness test
  -> .harness/results.yaml
  -> readable verification report
```

## Commands

- Run the full seed loop:

```bash
vp exec harness test --lang zh-CN
```

- Verify promises from existing results:

```bash
vp exec harness verify --lang zh-CN
```

- Check promise files and bindings:

```bash
vp exec harness check
```

- Run repository checks:

```bash
vp check
vp run -r test
vp run -r build
```
