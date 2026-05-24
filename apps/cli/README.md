# @test-harness/cli

CLI for the seed Harness.

## Commands

- `harness check`: validates canonical promise files and known bindings.
- `harness report`: renders a promise report from existing results.
- `harness verify`: alias for report in the seed loop.
- `harness test`: runs the configured adapter command, collects `.harness/results.yaml`, then renders the verification report.

All reporting commands support:

```bash
harness test --lang zh-CN
```
