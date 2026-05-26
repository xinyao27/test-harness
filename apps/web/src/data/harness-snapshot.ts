// oxlint-disable unicorn/no-thenable

import type { LocalizedText } from "@/lib/localized-text";

export type PromiseLifecycle =
  | "proposed"
  | "accepted"
  | "implemented"
  | "changed_requires_review"
  | "deprecated";

export type PromisePriority = "P0" | "P1" | "P2";
export type ModulePriority = PromisePriority | "none";
export type PromiseBoundary = "unit" | "integration" | "browser" | "e2e" | "adapter";
export type RunStatus = "unknown" | "passing" | "failing" | "skipped" | "missing_evidence";
export type ReviewState = "pending" | "approved" | "rejected" | "changes_requested";

export interface HarnessModule {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  purpose: LocalizedText;
  priority: ModulePriority;
  promiseIds: string[];
  covers: string[];
  relatedModuleIds: string[];
}

export interface HarnessPromise {
  id: string;
  moduleId: string;
  feature: string;
  title: LocalizedText;
  purpose: LocalizedText;
  priority: PromisePriority;
  boundary: PromiseBoundary;
  lifecycle: PromiseLifecycle;
  runStatus: RunStatus;
  given: LocalizedText[];
  when: LocalizedText[];
  then: LocalizedText[];
  observes: string[];
  failureMeaning: LocalizedText;
  review: {
    state: ReviewState;
    approvedBy?: string;
    approvedAt?: string;
  };
}

export interface ReviewDraft {
  id: string;
  title: LocalizedText;
  moduleIds: string[];
  priority: PromisePriority;
  state: ReviewState;
  reason: LocalizedText;
}

export type SnapshotSource = "daemon" | "static" | "empty";

export interface HarnessSnapshot {
  source?: SnapshotSource;
  project: {
    name: LocalizedText;
    description: LocalizedText;
    promiseCount: number;
    moduleCount: number;
    warningCount: number;
    errorCount: number;
  };
  modules: HarnessModule[];
  promises: HarnessPromise[];
  reviewDrafts: ReviewDraft[];
}

const promisePriorities = ["P0", "P1", "P2"] as const;
const modulePriorities = ["P0", "P1", "P2", "none"] as const;
const promiseBoundaries = ["unit", "integration", "browser", "e2e", "adapter"] as const;
const promiseLifecycles = [
  "proposed",
  "accepted",
  "implemented",
  "changed_requires_review",
  "deprecated",
] as const;
const runStatuses = ["unknown", "passing", "failing", "skipped", "missing_evidence"] as const;
const reviewStates = ["pending", "approved", "rejected", "changes_requested"] as const;
const snapshotSources = ["daemon", "static", "empty"] as const;

export function isHarnessSnapshot(value: unknown): value is HarnessSnapshot {
  if (!isRecord(value)) return false;
  if (value.source !== undefined && !isOneOf(value.source, snapshotSources)) return false;

  return (
    isProject(value.project) &&
    isArrayOf(value.modules, isHarnessModule) &&
    isArrayOf(value.promises, isHarnessPromise) &&
    isArrayOf(value.reviewDrafts, isReviewDraft)
  );
}

function isProject(value: unknown): value is HarnessSnapshot["project"] {
  return (
    isRecord(value) &&
    isLocalizedText(value.name) &&
    isLocalizedText(value.description) &&
    typeof value.promiseCount === "number" &&
    typeof value.moduleCount === "number" &&
    typeof value.warningCount === "number" &&
    typeof value.errorCount === "number"
  );
}

function isHarnessModule(value: unknown): value is HarnessModule {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isLocalizedText(value.title) &&
    isLocalizedText(value.summary) &&
    isLocalizedText(value.purpose) &&
    isOneOf(value.priority, modulePriorities) &&
    isArrayOf(value.promiseIds, isString) &&
    isArrayOf(value.covers, isString) &&
    isArrayOf(value.relatedModuleIds, isString)
  );
}

function isHarnessPromise(value: unknown): value is HarnessPromise {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.moduleId === "string" &&
    typeof value.feature === "string" &&
    isLocalizedText(value.title) &&
    isLocalizedText(value.purpose) &&
    isOneOf(value.priority, promisePriorities) &&
    isOneOf(value.boundary, promiseBoundaries) &&
    isOneOf(value.lifecycle, promiseLifecycles) &&
    isOneOf(value.runStatus, runStatuses) &&
    isArrayOf(value.given, isLocalizedText) &&
    isArrayOf(value.when, isLocalizedText) &&
    isArrayOf(value.then, isLocalizedText) &&
    isArrayOf(value.observes, isString) &&
    isLocalizedText(value.failureMeaning) &&
    isReview(value.review)
  );
}

function isReviewDraft(value: unknown): value is ReviewDraft {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isLocalizedText(value.title) &&
    isArrayOf(value.moduleIds, isString) &&
    isOneOf(value.priority, promisePriorities) &&
    isOneOf(value.state, reviewStates) &&
    isLocalizedText(value.reason)
  );
}

function isReview(value: unknown): value is HarnessPromise["review"] {
  return (
    isRecord(value) &&
    isOneOf(value.state, reviewStates) &&
    optionalString(value.approvedBy) &&
    optionalString(value.approvedAt)
  );
}

function isLocalizedText(value: unknown): value is LocalizedText {
  if (typeof value === "string") return true;
  if (!isRecord(value)) return false;

  const entries = Object.values(value);
  return (
    entries.some((entry) => typeof entry === "string") &&
    entries.every((entry) => entry === undefined || typeof entry === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  options: T,
): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

export const harnessSnapshot: HarnessSnapshot = {
  project: {
    name: {
      "zh-CN": "Harness Studio",
      en: "Harness Studio",
    },
    description: {
      "zh-CN": "用 architecture module、promise 和 evidence 关系帮助人类 Review 系统行为。",
      en: "Use architecture module, promise, and evidence relationships to help humans review system behavior.",
    },
    promiseCount: 46,
    moduleCount: 12,
    warningCount: 0,
    errorCount: 0,
  },
  modules: [
    {
      id: "protocol",
      title: {
        "zh-CN": "Protocol module",
        en: "Protocol module",
      },
      summary: {
        "zh-CN": "定义 Harness 的 language-agnostic YAML contract。",
        en: "Defines the language-agnostic YAML contracts for the Harness.",
      },
      purpose: {
        "zh-CN": "让 Rust、TypeScript 和未来实现都对同一组 behavior promises 负责。",
        en: "Keeps Rust, TypeScript, and future implementations accountable to the same behavior promises.",
      },
      priority: "P0",
      promiseIds: [
        "harness.protocol.cli_contract_is_versioned_and_enforced",
        "harness.protocol.cli_golden_outputs_lock_human_surface",
        "harness.protocol.adapter_events_are_versioned_stream_records",
        "harness.protocol.conformance_fixtures_lock_reference_behavior",
        "harness.protocol.module_schema_is_portable",
        "harness.protocol.promise_files_are_versioned",
        "harness.protocol.results_are_versioned_adapter_outputs",
        "harness.protocol.runner_config_is_versioned",
        "harness.protocol.schemas_define_language_agnostic_contract",
      ],
      covers: ["protocol/v1/**", "protocol/fixtures/**"],
      relatedModuleIds: ["promise-schema", "results-schema", "cli"],
    },
    {
      id: "promise-registry",
      title: {
        "zh-CN": "Promise registry",
        en: "Promise registry",
      },
      summary: {
        "zh-CN": "加载并索引 canonical promise files。",
        en: "Loads and indexes canonical promise files.",
      },
      purpose: {
        "zh-CN": "让 Report、Validation、Test binding 都有稳定的 Promise 输入。",
        en: "Gives reports, validation, and test bindings stable promise inputs.",
      },
      priority: "P0",
      promiseIds: [
        "harness.promise_registry.load_canonical_yaml_promises",
        "harness.promise_registry.surfaces_per_record_decode_errors",
      ],
      covers: ["crates/harness-core/src/promise_registry.rs"],
      relatedModuleIds: ["promise-schema", "validation", "report"],
    },
    {
      id: "promise-schema",
      title: {
        "zh-CN": "Promise schema",
        en: "Promise schema",
      },
      summary: {
        "zh-CN": "定义 promise records 的必填字段和分组文件形状。",
        en: "Defines required promise record fields and grouped promise file shape.",
      },
      purpose: {
        "zh-CN": "让 promise 文件在加载阶段就暴露缺失或畸形字段。",
        en: "Makes missing or malformed promise fields visible at load time.",
      },
      priority: "P0",
      promiseIds: [
        "harness.promise.schema_defines_required_fields",
        "harness.promise.schema_supports_example_variants",
        "harness.promise.canonical_file_is_grouped",
      ],
      covers: ["crates/harness-protocol/src/lib.rs", "protocol/v1/promise.schema.yaml"],
      relatedModuleIds: ["protocol", "promise-registry", "validation"],
    },
    {
      id: "module-registry",
      title: {
        "zh-CN": "Module registry",
        en: "Module registry",
      },
      summary: {
        "zh-CN": "加载并索引 canonical module files。",
        en: "Loads and indexes canonical module files.",
      },
      purpose: {
        "zh-CN": "让每个源文件都能归属到可 Review 的 Module。",
        en: "Lets every source file belong to a reviewable module.",
      },
      priority: "P0",
      promiseIds: ["harness.module_registry.load_canonical_yaml_modules"],
      covers: ["crates/harness-core/src/module_registry.rs"],
      relatedModuleIds: ["validation", "protocol"],
    },
    {
      id: "results-schema",
      title: {
        "zh-CN": "Results schema",
        en: "Results schema",
      },
      summary: {
        "zh-CN": "定义 adapter result files 的协议形状。",
        en: "Defines the protocol shape for adapter result files.",
      },
      purpose: {
        "zh-CN": "让不同 adapter 输出可比较、可报告的结果文件。",
        en: "Keeps adapter outputs comparable and reportable.",
      },
      priority: "P0",
      promiseIds: ["harness.results.schema_defines_required_fields"],
      covers: ["crates/harness-core/src/results.rs", "protocol/v1/results.schema.yaml"],
      relatedModuleIds: ["protocol", "adapter-runtime", "report"],
    },
    {
      id: "cli",
      title: {
        "zh-CN": "CLI module",
        en: "Command line module",
      },
      summary: {
        "zh-CN": "人类运行 Harness 的主要入口。",
        en: "The main entry point for humans running the Harness.",
      },
      purpose: {
        "zh-CN": "把检查、测试、报告和配置读取串成 seed loop。",
        en: "Connects checks, tests, reports, and config loading into the seed loop.",
      },
      priority: "P0",
      promiseIds: [
        "harness.cli.check_validates_promises",
        "harness.cli.rejects_invalid_arguments_with_usage_hint",
        "harness.cli.report_renders_promise_status",
        "harness.cli.report_summary_lists_promises_compactly",
        "harness.cli.test_reads_runner_config",
        "harness.cli.test_orchestrates_adapter_and_verify",
      ],
      covers: ["crates/harness-cli/src/**", "crates/harness-core/src/programs.rs"],
      relatedModuleIds: ["report", "adapter-runtime", "promise-registry"],
    },
    {
      id: "adapter-runtime",
      title: {
        "zh-CN": "Adapter runtime",
        en: "Adapter runtime",
      },
      summary: {
        "zh-CN": "收集 adapter event shards 并生成 canonical results。",
        en: "Collects adapter event shards and produces canonical results.",
      },
      purpose: {
        "zh-CN": "避免每个 adapter 重复实现 result merge semantics。",
        en: "Prevents every adapter from reimplementing result merge semantics.",
      },
      priority: "P0",
      promiseIds: [
        "harness.adapter_runtime.collects_event_shards_into_results",
        "harness.adapter_runtime.exposes_runner_for_non_cargo_users",
        "harness.adapter_runtime.preserves_framework_independent_evidence",
        "harness.adapter_runtime.uses_isolated_run_event_directories",
      ],
      covers: ["crates/harness-adapter-runtime/src/**"],
      relatedModuleIds: ["results-schema", "rust-adapter", "vitest-adapter"],
    },
    {
      id: "rust-adapter",
      title: {
        "zh-CN": "Rust adapter",
        en: "Rust adapter",
      },
      summary: {
        "zh-CN": "把 Cargo tests 作为 promise-bound evidence 接入 Harness。",
        en: "Connects Cargo tests to the Harness as promise-bound evidence.",
      },
      purpose: {
        "zh-CN": "让 Rust core 和 CLI 可以用 Rust 测试自举。",
        en: "Lets the Rust core and CLI self-bootstrap with Rust tests.",
      },
      priority: "P0",
      promiseIds: [
        "harness.adapters.rust.result_collector.maps_results_to_promises",
        "harness.adapters.rust.result_collector.writes_results_to_explicit_harness_root",
        "harness.adapters.rust.runner_merges_shards_after_cargo_test",
        "harness.adapters.rust.scenario_helper.binds_tests_to_canonical_promises",
      ],
      covers: ["crates/harness-adapter-rust/src/**"],
      relatedModuleIds: ["adapter-runtime", "cli"],
    },
    {
      id: "vitest-adapter",
      title: {
        "zh-CN": "Vitest adapter",
        en: "Vitest adapter",
      },
      summary: {
        "zh-CN": "把 Vitest 测试结果转换成共享 runtime 可合并的 adapter events。",
        en: "Turns Vitest outcomes into adapter events the shared runtime can merge.",
      },
      purpose: {
        "zh-CN": "让 TypeScript 测试框架可以成为 protocol-shaped evidence source。",
        en: "Lets a TypeScript test framework become a protocol-shaped evidence source.",
      },
      priority: "P0",
      promiseIds: [
        "harness.adapters.vitest.result_collector.maps_results_to_promises",
        "harness.adapters.vitest.result_collector.writes_results_to_explicit_harness_root",
        "harness.adapters.vitest.scenario_helper.binds_tests_to_canonical_promises",
      ],
      covers: ["packages/adapter-vitest/src/**"],
      relatedModuleIds: ["adapter-runtime", "web-dashboard"],
    },
    {
      id: "report",
      title: {
        "zh-CN": "Report module",
        en: "Report module",
      },
      summary: {
        "zh-CN": "把 Promise 和 run result 渲染成人类可读 Report。",
        en: "Renders promises and run results into human-readable reports.",
      },
      purpose: {
        "zh-CN": "让 reviewer 不读源码也能看懂 Promise status。",
        en: "Lets reviewers understand promise status without reading implementation code.",
      },
      priority: "P0",
      promiseIds: [
        "harness.report.computes_promise_run_status_from_results",
        "harness.report.falls_back_through_language_chain",
        "harness.report.renders_in_requested_language",
      ],
      covers: ["crates/harness-core/src/report.rs"],
      relatedModuleIds: ["cli", "promise-registry"],
    },
    {
      id: "validation",
      title: {
        "zh-CN": "Validation",
        en: "Validation",
      },
      summary: {
        "zh-CN": "校验 modules、promises 和 collected results 是否足够可读和可证明。",
        en: "Checks modules, promises, and collected results for readability and evidence coverage.",
      },
      purpose: {
        "zh-CN": "保护 architecture-first、promise-first authoring 不被模糊 metadata 稀释。",
        en: "Protects architecture-first, promise-first authoring from vague metadata.",
      },
      priority: "P0",
      promiseIds: [
        "harness.validation.checks_examples_table_shape",
        "harness.validation.flags_promises_without_test_results",
        "harness.validation.flags_uncovered_source_files",
        "harness.validation.flags_unknown_scenario_bindings",
        "harness.validation.rejects_unreadable_modules",
        "harness.validation.rejects_unreadable_promises",
        "harness.validation.warns_when_default_language_missing",
      ],
      covers: [
        "crates/harness-core/src/module_registry.rs",
        "crates/harness-core/src/validation.rs",
      ],
      relatedModuleIds: ["module-registry", "promise-registry", "report"],
    },
    {
      id: "web-dashboard",
      title: {
        "zh-CN": "Harness Studio",
        en: "Harness Studio",
      },
      summary: {
        "zh-CN": "从一个 canvas 浏览 architecture modules、promises、evidence 和 run status。",
        en: "Explores architecture modules, promises, evidence, and run status from one canvas.",
      },
      purpose: {
        "zh-CN":
          "让人类从 architecture-first 的 Studio 进入 Promise Review，而不是先打开 YAML 或源码。",
        en: "Lets humans enter promise review through an architecture-first Studio instead of raw YAML or source files.",
      },
      priority: "P0",
      promiseIds: [
        "harness.web_dashboard.renders_canvas_first_harness_studio",
        "harness.web_dashboard.i18n_switches_chrome_and_snapshot_text",
        "harness.web_dashboard.switches_recent_project_contexts",
      ],
      covers: ["apps/web/**", "packages/i18n/**"],
      relatedModuleIds: ["promise-registry", "module-registry", "cli"],
    },
  ],
  promises: [
    {
      id: "harness.protocol.schemas_define_language_agnostic_contract",
      moduleId: "protocol",
      feature: "Harness Protocol / Schemas",
      title: {
        "zh-CN": "协议 schema 定义语言无关契约",
        en: "Protocol schemas define language-agnostic contracts",
      },
      purpose: {
        "zh-CN": "让不同实现围绕同一份协议判断行为是否正确。",
        en: "Allows different implementations to judge behavior against the same protocol.",
      },
      priority: "P0",
      boundary: "unit",
      lifecycle: "accepted",
      runStatus: "unknown",
      given: [
        {
          "zh-CN": "项目包含 protocol/v1 下的 YAML schema",
          en: "The project contains YAML schemas under protocol/v1.",
        },
      ],
      when: [
        {
          "zh-CN": "实现加载或验证 Harness-owned artifact",
          en: "An implementation loads or validates a Harness-owned artifact.",
        },
      ],
      then: [
        {
          "zh-CN": "artifact 必须通过对应版本的协议 schema",
          en: "The artifact must pass the matching versioned protocol schema.",
        },
      ],
      observes: ["protocol/v1/**/*.schema.yaml", "crates/harness-protocol/src/lib.rs"],
      failureMeaning: {
        "zh-CN": "实现之间会对 Harness artifact 的形状产生分歧。",
        en: "Implementations would disagree about the shape of Harness artifacts.",
      },
      review: { state: "approved", approvedBy: "xinyao", approvedAt: "2026-05-24" },
    },
    {
      id: "harness.promise_registry.load_canonical_yaml_promises",
      moduleId: "promise-registry",
      feature: "Seed Harness / Promise Registry",
      title: {
        "zh-CN": "Accepted Promise 会从 canonical YAML 文件加载",
        en: "Accepted promises load from canonical YAML files",
      },
      purpose: {
        "zh-CN": "保护 seed Harness 的 reviewed behavior promises。",
        en: "Protects the seed Harness's reviewed behavior promises.",
      },
      priority: "P0",
      boundary: "unit",
      lifecycle: "accepted",
      runStatus: "unknown",
      given: [
        {
          "zh-CN": "项目根目录存在 tests/promises/**/*.promises.yaml",
          en: "The project root contains tests/promises/**/*.promises.yaml.",
        },
      ],
      when: [
        {
          "zh-CN": "seed Harness 执行 check 或 report",
          en: "The seed Harness runs check or report.",
        },
      ],
      then: [
        {
          "zh-CN": "所有 promise records 被加载并通过协议解码",
          en: "All promise records are loaded and decoded through the protocol.",
        },
      ],
      observes: [
        "tests/promises/**/*.promises.yaml",
        "crates/harness-core/src/promise_registry.rs",
      ],
      failureMeaning: {
        "zh-CN": "Harness 无法信任自己的 Promise source。",
        en: "The Harness could not trust its own promise source.",
      },
      review: { state: "approved", approvedBy: "xinyao", approvedAt: "2026-05-24" },
    },
    {
      id: "harness.module_registry.load_canonical_yaml_modules",
      moduleId: "module-registry",
      feature: "Seed Harness / Module Registry",
      title: {
        "zh-CN": "Canonical modules 会从 YAML 文件加载",
        en: "Canonical modules load from YAML files",
      },
      purpose: {
        "zh-CN": "让 coverage validation 和 module-aware tooling 有稳定输入。",
        en: "Gives coverage validation and module-aware tooling stable inputs.",
      },
      priority: "P0",
      boundary: "unit",
      lifecycle: "accepted",
      runStatus: "unknown",
      given: [
        {
          "zh-CN": "项目根目录存在 tests/modules/*.module.yaml",
          en: "The project root contains tests/modules/*.module.yaml.",
        },
      ],
      when: [
        {
          "zh-CN": "Harness 加载 Module record",
          en: "The Harness loads module records.",
        },
      ],
      then: [
        {
          "zh-CN": "每个 Module 暴露 id、title、summary、purpose、promises 和 covers",
          en: "Each module exposes id, title, summary, purpose, promises, and covers.",
        },
      ],
      observes: ["tests/modules/*.module.yaml", "crates/harness-core/src/module_registry.rs"],
      failureMeaning: {
        "zh-CN": "Module 会退化成无法被工具理解的惰性 YAML。",
        en: "Modules would degrade into passive YAML that tooling cannot understand.",
      },
      review: { state: "approved", approvedBy: "xinyao", approvedAt: "2026-05-25" },
    },
    {
      id: "harness.cli.test_orchestrates_adapter_and_verify",
      moduleId: "cli",
      feature: "Seed Harness / CLI",
      title: {
        "zh-CN": "Test command 会运行 adapter 并渲染 Promise status",
        en: "The test command runs adapters and renders promise status",
      },
      purpose: {
        "zh-CN": "让 Promise 不只停留在 YAML 中，而是能被真实 run result 证明。",
        en: "Ensures promises are proven by real run results instead of staying in YAML.",
      },
      priority: "P0",
      boundary: "integration",
      lifecycle: "accepted",
      runStatus: "unknown",
      given: [
        {
          "zh-CN": "项目配置了测试运行器",
          en: "The project has a configured test runner.",
        },
      ],
      when: [
        {
          "zh-CN": "用户运行 harness test",
          en: "The user runs harness test.",
        },
      ],
      then: [
        {
          "zh-CN": "适配器被执行，结果被收集，报告被渲染",
          en: "The adapter runs, results are collected, and the report is rendered.",
        },
      ],
      observes: ["tests/harness.yaml", "crates/harness-cli/src/main.rs"],
      failureMeaning: {
        "zh-CN": "人无法确认 test command 是否真的把 Promise 和 Evidence 连起来。",
        en: "Humans could not confirm whether the test command connects promises to evidence.",
      },
      review: { state: "approved", approvedBy: "xinyao", approvedAt: "2026-05-24" },
    },
    {
      id: "harness.adapter_runtime.collects_event_shards_into_results",
      moduleId: "adapter-runtime",
      feature: "Adapter Runtime / Result Collection",
      title: {
        "zh-CN": "Adapter event shards 会变成 canonical Harness results",
        en: "Adapter event shards become canonical Harness results",
      },
      purpose: {
        "zh-CN": "让所有适配器共享一套结果合并语义。",
        en: "Lets all adapters share one set of result merge semantics.",
      },
      priority: "P0",
      boundary: "integration",
      lifecycle: "accepted",
      runStatus: "unknown",
      given: [
        {
          "zh-CN": "一次运行产生多个 adapter event shard",
          en: "A run produces multiple adapter event shards.",
        },
      ],
      when: [
        {
          "zh-CN": "adapter runtime 合并事件",
          en: "The adapter runtime merges events.",
        },
      ],
      then: [
        {
          "zh-CN": "输出 apiVersion: 1 的 results.yaml",
          en: "It outputs results.yaml with apiVersion: 1.",
        },
      ],
      observes: ["crates/harness-adapter-runtime/src/lib.rs", "protocol/v1/results.schema.yaml"],
      failureMeaning: {
        "zh-CN": "不同适配器会产生不可比较的结果文件。",
        en: "Different adapters would produce incomparable result files.",
      },
      review: { state: "approved", approvedBy: "xinyao", approvedAt: "2026-05-25" },
    },
    {
      id: "harness.visualization.graph_exports_reviewable_relationships",
      moduleId: "protocol",
      feature: "Harness Visualization / Graph",
      title: {
        "zh-CN": "Visualization Graph 会导出可 Review 的关系",
        en: "Visualization graphs export reviewable relationships",
      },
      purpose: {
        "zh-CN": "让人可以看见 Module、Promise、Evidence 和 covered files 之间的关系。",
        en: "Lets humans see relationships among modules, promises, evidence, and covered files.",
      },
      priority: "P0",
      boundary: "integration",
      lifecycle: "proposed",
      runStatus: "missing_evidence",
      given: [
        {
          "zh-CN": "项目存在 canonical modules、promises 和 results",
          en: "The project has canonical modules, promises, and results.",
        },
      ],
      when: [
        {
          "zh-CN": "用户生成 Visualization Graph",
          en: "The user generates a visualization graph.",
        },
      ],
      then: [
        {
          "zh-CN":
            "Graph 包含 Module 拥有的 Promise、Promise 观察到的 Evidence、Module 覆盖文件等关系",
          en: "The graph includes module-owned promises, promise-observed evidence, and covered file relationships.",
        },
      ],
      observes: [
        "protocol/v1/visualization-graph.schema.yaml",
        ".harness/visualization.graph.yaml",
      ],
      failureMeaning: {
        "zh-CN": "可视化无法成为人类 review 的可信入口。",
        en: "Visualization could not become a trusted entry point for human review.",
      },
      review: { state: "pending" },
    },
    {
      id: "harness.web_dashboard.renders_canvas_first_harness_studio",
      moduleId: "web-dashboard",
      feature: "Harness Studio / Canvas",
      title: {
        "zh-CN": "Harness Studio 会以 canvas-first 架构图打开",
        en: "Harness Studio opens as a canvas-first architecture map",
      },
      purpose: {
        "zh-CN": "让 Module 成为第一层可见架构，Promise 详情保持上下文关联。",
        en: "Makes modules the first visible architecture layer and keeps promise detail contextual.",
      },
      priority: "P0",
      boundary: "browser",
      lifecycle: "proposed",
      runStatus: "missing_evidence",
      given: [
        {
          "zh-CN": "用户打开 Harness Studio 的根路由",
          en: "The user opens the Harness Studio root route.",
        },
      ],
      when: [
        {
          "zh-CN": "用户在 canvas 上选择 modules 和 promises",
          en: "The user selects modules and promises on the canvas.",
        },
      ],
      then: [
        {
          "zh-CN": "第一屏展示 module nodes，选中 module 后展开它拥有的 promises",
          en: "The first screen shows module nodes, and selecting a module unfolds its owned promises.",
        },
        {
          "zh-CN": "选中 promise 后打开可折叠右侧 context panel",
          en: "Selecting a promise opens a collapsible right context panel.",
        },
      ],
      observes: [
        "apps/web/src/router.tsx",
        "apps/web/src/components/layout/workbench-layout.tsx",
        "apps/web/src/features/studio/**",
      ],
      failureMeaning: {
        "zh-CN": "Web 界面会退回普通 dashboard，而不是 architecture-first promise review。",
        en: "The web surface would fall back to an ordinary dashboard instead of architecture-first promise review.",
      },
      review: { state: "pending" },
    },
    {
      id: "harness.web_dashboard.i18n_switches_chrome_and_snapshot_text",
      moduleId: "web-dashboard",
      feature: "Harness Studio / I18N",
      title: {
        "zh-CN": "Harness Studio 可以在中文和英文之间切换 UI 框架文案与可读 snapshot 文本",
        en: "Harness Studio can switch UI chrome and readable snapshot text between Chinese and English",
      },
      purpose: {
        "zh-CN": "保护第一版可视化 workflow 不退化成仅中文界面。",
        en: "Protects the first visual workflow from becoming Chinese-only.",
      },
      priority: "P1",
      boundary: "browser",
      lifecycle: "accepted",
      runStatus: "unknown",
      given: [
        {
          "zh-CN": "用户打开 Harness Studio",
          en: "The user opens Harness Studio.",
        },
      ],
      when: [
        {
          "zh-CN": "用户选择一个受支持语言",
          en: "The user selects a supported locale.",
        },
      ],
      then: [
        {
          "zh-CN":
            "Navigation、page heading、action、status label 和 graph label 会使用所选语言渲染",
          en: "Navigation, page headings, actions, status labels, and graph labels render in the selected locale.",
        },
      ],
      observes: ["packages/i18n/**", "apps/web/src/lib/i18n.ts", "apps/web/src/features/**"],
      failureMeaning: {
        "zh-CN":
          "非中文 reviewer 会被迫查看原始 YAML 或源码，削弱 Harness Studio 作为 review 入口的价值。",
        en: "Non-Chinese reviewers would have to inspect raw YAML or source code, weakening Harness Studio as a review surface.",
      },
      review: { state: "approved", approvedBy: "xinyao", approvedAt: "2026-05-25" },
    },
    {
      id: "harness.web_dashboard.switches_recent_project_contexts",
      moduleId: "web-dashboard",
      feature: "Harness Studio / Project Switcher",
      title: {
        "zh-CN": "Harness Studio 可以在最近打开的 project context 之间切换",
        en: "Harness Studio can switch between recently opened project contexts",
      },
      purpose: {
        "zh-CN": "让 Studio 可以调试当前仓库和 example 仓库，同时不离开 canvas-first workflow。",
        en: "Keeps the Studio useful for debugging the current repository and example repositories without leaving the canvas-first workflow.",
      },
      priority: "P1",
      boundary: "browser",
      lifecycle: "proposed",
      runStatus: "missing_evidence",
      given: [
        {
          "zh-CN": "用户从当前仓库打开 Harness Studio",
          en: "The user opens Harness Studio from the current repository.",
        },
      ],
      when: [
        {
          "zh-CN": "用户从左上角 project switcher 选择另一个 project",
          en: "The user selects another project from the top-left project switcher.",
        },
      ],
      then: [
        {
          "zh-CN": "Canvas 会切换到该 project 的 modules、promises 和 evidence status",
          en: "The canvas switches to that project's modules, promises, and evidence status.",
        },
      ],
      observes: [
        "apps/web/src/features/studio/**",
        "apps/web/src/data/todo-backend-snapshot.ts",
        "apps/web/src/lib/api.ts",
      ],
      failureMeaning: {
        "zh-CN": "Project switcher 会变成只换 label 的假入口，无法用于调试 examples。",
        en: "The project switcher would become a label-only control and could not debug examples.",
      },
      review: { state: "pending" },
    },
  ],
  reviewDrafts: [
    {
      id: "draft.visualization.graph",
      title: {
        "zh-CN": "Visualization Graph 会导出可 Review 的关系",
        en: "Visualization graphs export reviewable relationships",
      },
      moduleIds: ["protocol", "module-registry", "promise-registry"],
      priority: "P0",
      state: "pending",
      reason: {
        "zh-CN":
          "新增 Harness Studio graph 能力前，需要先定义 graph artifact 的 behavior promise。",
        en: "Before adding Harness Studio graph capabilities, the graph artifact needs an explicit behavior promise.",
      },
    },
    {
      id: "draft.review.workflow",
      title: {
        "zh-CN": "Review Action 会被保存为可追溯记录",
        en: "Review actions are saved as traceable records",
      },
      moduleIds: ["promise-registry", "cli"],
      priority: "P0",
      state: "pending",
      reason: {
        "zh-CN": "approve / reject 不能只是 UI 状态，必须落到 canonical review metadata。",
        en: "Approve and reject cannot be UI-only states; they must land in canonical review metadata.",
      },
    },
    {
      id: "draft.daemon.local-permission",
      title: {
        "zh-CN": "Daemon 负责所有本机权限动作",
        en: "The daemon owns all local permission actions",
      },
      moduleIds: ["cli", "adapter-runtime"],
      priority: "P1",
      state: "changes_requested",
      reason: {
        "zh-CN": "需要把 Harness Studio 与文件系统写入边界拆清楚。",
        en: "The boundary between Harness Studio and filesystem writes needs to be clearer.",
      },
    },
  ],
};

export function getPromiseById(promiseId: string) {
  return harnessSnapshot.promises.find((promise) => promise.id === promiseId);
}

export function getModuleById(moduleId: string) {
  return harnessSnapshot.modules.find((module) => module.id === moduleId);
}
