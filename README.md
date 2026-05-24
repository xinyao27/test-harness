# Test Harness

A promise-driven Test Harness built on Vite+ and Vitest.

The seed Harness stores reviewed behavior commitments as canonical `.promise.yaml` files, binds Vitest tests to promise ids with `scenarioTest(...)`, collects test results into `.harness/results.yaml`, and renders a human-readable promise status report.

## Current Loop

```text
promises/**/*.promise.yaml
  -> scenarioTest(...)
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
