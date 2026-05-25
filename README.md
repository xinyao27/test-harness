# Test Harness

A promise-driven Test Harness with a language-agnostic YAML protocol.

The seed Harness stores reviewed behavior commitments as canonical `.promises.yaml` files, lets adapters bind executable tests to promise ids, collects adapter results into `.harness/results.yaml`, and renders a human-readable promise status report.

The current repository provides a Rust core/CLI implementation and a thin TypeScript Vitest adapter. The stable layer is the `apiVersion: 1` protocol under `protocol/v1/`.

## Current Loop

```text
tests/harness.yaml
tests/modules/**/*.module.yaml
tests/promises/**/*.promises.yaml
  -> adapter tests
  -> harness test
  -> .harness/results.yaml
  -> readable verification report
```

## Commands

- Run the full seed loop:

```bash
cargo run -q -p harness-cli -- test --lang zh-CN
```

- Verify promises from existing results:

```bash
cargo run -q -p harness-cli -- verify --lang zh-CN
```

- Check promise files and bindings:

```bash
cargo run -q -p harness-cli -- check
```

- Run repository checks:

```bash
vp check
vp run -r test
vp run -r build
```
