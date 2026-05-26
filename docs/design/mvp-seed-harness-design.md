# MVP Seed Harness Design

> Status: MVP design, updated to reflect the Rust core/CLI and adapter-event runtime architecture.
> Goal: Build the smallest self-bootstrapping version of the Test Harness, so the Harness can start validating its own promises.

## 1. Purpose

The full Test Harness is still only a design. The first implementation should not try to build the complete Harness Studio or daemon-backed local control plane.

The MVP should be a **seed Harness**: a minimal, file-based, protocol-first system that can describe, run, and report promises about this Harness project itself.

The stable layer is language-agnostic YAML. The current Rust crates provide the core/CLI reference implementation, and the TypeScript Vitest package is a thin adapter, not the definition of the Harness itself.

The seed Harness exists to create the first self-bootstrapping loop:

```text
write promises for the Harness itself
  -> attach scenario bindings to adapter tests
  -> run the configured adapter
  -> collect results by promise id
  -> check readability and evidence rules
  -> produce a readable promise report
  -> use that report to guide the next Harness iteration
```

## 2. MVP Scope

Build only what is needed for self-bootstrapping.

In scope:

1. **Promise files**
   Store this Harness project's own promises in versioned files. These files are the canonical source for reviewed promise meaning.

2. **Adapter binding helper**
   Provide bindings that connect executable adapter tests to canonical promise ids. The seed implementation currently provides a Vitest helper.

3. **Basic quality checker**
   Check that canonical promise metadata and scenario bindings are present, readable, and complete enough.

4. **Basic evidence mapper**
   Track which adapter results claim to prove which promise. Full assertion fingerprints and Evidence Drift v1 remain future work.

5. **Result collector**
   Run or read adapter results and normalize them by promise id into `.harness/results.yaml`.

6. **Seed report**
   Output a human-readable report grouped by architecture module and promise.

Out of scope for the seed:

- full Harness Studio playground UX
- daemon-backed project switching, file watching, or local agent control
- complex browser UX
- advanced adapters beyond the current Vitest adapter
- full drift AI classification
- advanced risk maps
- organization-level permissions
- external project onboarding

Full deterministic evidence drift through assertion fingerprints and AI-based drift classification are out of scope for the current seed.

## 3. Data Model

The seed can start with files.

Canonical source decision:

```text
apiVersion: 1 grouped .promises.yaml files
  -> canonical reviewed promise meaning

adapter-side bindings such as scenarioTest(promiseId, ...)
  -> test-side binding to a canonical promise
```

If `scenario(...)` tries to redefine title, priority, boundary, Given / When / Then, or observes, the seed should treat that as invalid metadata or potential drift. The reviewed promise file wins.

Seed review mechanism:

```text
Human review is PR-based.

Changing .promises.yaml files requires normal code review.
The review metadata records the PR or commit that approved the promise.
```

Bootstrap circularity rule:

```text
The first wave of self-promises is manually reviewed by a human.
Before M2 stabilizes, the quality checker may warn instead of hard-failing.
After M2 is accepted, required metadata failures become blocking.
```

Current structure:

```text
crates/
  harness-protocol/
  harness-core/
  harness-cli/
  harness-adapter-runtime/
  harness-adapter-rust/

packages/
  adapter-vitest/

tests/
  harness.yaml
  modules/
    protocol.module.yaml
    promise-registry.module.yaml
    validation.module.yaml
    vitest-adapter.module.yaml
  promises/
    protocol/
      protocol.promises.yaml
    adapters/
      vitest/
        vitest.promises.yaml
    promise-registry/
      promise-registry.promises.yaml
    validation/
      validation.promises.yaml

protocol/
  v1/
    promise.schema.yaml
    promises-file.schema.yaml
    adapter-event.schema.yaml
    results.schema.yaml
    report.schema.yaml
    cli.yaml
```

Promise file shape:

The canonical file is YAML and declares `apiVersion: 1`. The protocol shape is documented under `protocol/v1/`. The Rust protocol crate implements matching runtime validation and types. Natural-language fields use `LocalizedText`: a plain string is allowed and treated as default English, or the field can expand into a language map such as `en` / `zh-CN`.

```yaml
apiVersion: 1
promises:
  - id: harness.promise_registry.load_canonical_yaml_promises
    feature: Seed Harness / Promise Registry
    title:
      en: Accepted promises are loaded from canonical YAML files
      zh-CN: 已接受的承诺会从 canonical YAML 文件中加载
    purpose:
      en: Protect the seed Harness's reviewed behavior promises.
      zh-CN: 保护 seed Harness 能读取自己已批准的行为承诺。
    priority: P0
    boundary: unit
    lifecycle: accepted
    given:
      - en: A promise file exists under the tests/promises root
        zh-CN: tests/promises/ 目录下存在一个 promise 文件
    when:
      - en: The seed Harness loads promise records
        zh-CN: seed Harness 加载 promise records
    then:
      - en: The promise is decoded into a PromiseRecord
        zh-CN: 该 promise 会被解码成 PromiseRecord
    observes:
      - tests/promises/**/*.promises.yaml
    failureMeaning:
      en: The Harness cannot trust its own reviewed behavior promises.
      zh-CN: Harness 无法信任自己已经 review 过的行为承诺。
    review:
      approvedBy: xinyao
      approvedAt: "2026-05-24"
```

Run status is not persisted in the promise file. It is computed by the collector:

```ts
type PromiseRunStatus =
  | "unknown"
  | "passing"
  | "failing"
  | "skipped"
  | "missing_evidence"
  | "evidence_drifted";
```

Adapter-side binding shape:

```ts
scenarioTest(
  "harness.promise_registry.load_canonical_yaml_promises",
  "loads canonical YAML promises",
  () => {
    // executable evidence
  },
);
```

Future assertion fingerprint shape:

```ts
const AssertionFingerprintSchema = Schema.Struct({
  scenarioId: Schema.String,
  testFile: Schema.String,
  testName: Schema.String,
  assertions: Schema.Array(
    Schema.Struct({
      target: Schema.optionalKey(Schema.String),
      matcher: Schema.String,
      literal: Schema.optionalKey(Schema.String),
      evidenceTag: Schema.optionalKey(Schema.String),
    }),
  ),
});

type AssertionFingerprint = Schema.Schema.Type<typeof AssertionFingerprintSchema>;
```

## 4. Self-Promises For The MVP

The MVP should start by validating itself with a small set of promises.

### Promise Registry

```text
Promise:
Accepted promises are persisted with stable ids, lifecycle status, and review metadata.

Evidence:
- a promise file can be loaded
- required fields are preserved
- lifecycle and review fields are readable
```

### Scenario Helper

```text
Promise:
Adapter tests can bind to a canonical promise with a stable promise id.

Evidence:
- scenario binding is registered during a test file load
- duplicate ids are detected
- missing required fields are reported
- test-local redefinition of canonical promise fields is rejected
```

### Quality Checker

```text
Promise:
The seed Harness rejects unreadable canonical metadata or incomplete scenario bindings.

Evidence:
- missing id fails
- missing purpose fails
- missing Given / When / Then or observes fails
- vague titles such as "works" fail
```

### Result Collector

```text
Promise:
Adapter results are normalized by promise id.

Evidence:
- passing tests produce passing promise results
- failing tests produce failing promise results
- unmapped tests are reported
```

### Evidence Mapper

```text
Promise:
A promise can be mapped to one or more tests, evidence items, and assertion fingerprints.

Evidence:
- one promise can have multiple test records
- one test can reference multiple evidence items
- missing evidence is reported
- assertion fingerprints are captured and diffed across runs
```

### Review Mechanism

```text
Promise:
Seed promise approval is traceable through PR-based review metadata.

Evidence:
- accepted promises include approvedBy or approvedIn
- unreviewed accepted promises are reported
- promise id renames require deprecating the old id or superseding it explicitly
```

## 5. Seed Harness Commands

The first CLI can stay tiny.

Suggested commands:

```text
harness check
  Validate promise files, scenario bindings, review metadata, and quality rules.

harness test
  Run the configured adapter/runtime command and collect results by promise id.

harness report
  Render the current promise report, reading .harness/results.yaml when present.
```

The first version also keeps a verification alias:

```text
harness verify
  Render the same report path as harness report.
```

## 6. Seed Report

The seed report should be readable without opening test files.

Example:

```text
Seed Harness Report

Feature: Seed Harness / Promise Registry

P0  Accepted promises are persisted with lifecycle state
    Status: passing
    Lifecycle: accepted
    Evidence:
    - promise file loaded
    - required fields preserved
    - review metadata readable

Feature: Seed Harness / Quality Checker

P0  Unreadable canonical metadata or scenario bindings are rejected
    Status: failing
    Lifecycle: accepted
    Failure meaning:
    The Harness may accept tests that humans cannot manage.
```

## 7. Bootstrap Milestones

1. **M0: File convention**
   Add promise files, make them canonical, choose PR-based review metadata, and decide where reports are written.

2. **M1: Scenario helper**
   Implement adapter bindings such as `scenarioTest(promiseId, ...)` and store binding metadata during adapter execution. The seed adapter is Vitest.

3. **M2: Quality checker**
   Validate required metadata and basic readability rules. Before this milestone is accepted, checker failures may be warnings; after acceptance, required metadata failures are blocking.

4. **M3: Result collector**
   Normalize adapter events/results by promise id.

5. **M4: Evidence mapper**
   Track promise-to-test and promise-to-evidence mappings, and capture assertion fingerprints.

6. **M5: Seed report**
   Generate readable JSON and Markdown reports, including lifecycle, run status, and evidence deltas.

7. **M6: Self-hosted iteration**
   Use the seed report to drive one concrete next Harness feature end to end, from promise review to adapter result to report.

## 8. Success Criteria

The MVP succeeds when:

1. The Harness has its own promise files.
2. Adapter tests can declare scenario bindings.
3. The seed checker can reject incomplete or unreadable metadata.
4. Adapter results can be grouped by promise id.
5. Assertion fingerprints and evidence deltas have a clear future protocol path.
6. A human can read the seed report and understand each Harness promise's lifecycle, run status, and evidence status.
7. The next Harness feature can be planned as promises and validated by the seed Harness.
8. One complete self-hosted feature has been demonstrated end to end.
