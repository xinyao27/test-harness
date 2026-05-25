// oxlint-disable unicorn/no-thenable

import type { LocalizedText } from "@/lib/localized-text";

export type PromiseLifecycle =
  | "proposed"
  | "accepted"
  | "implemented"
  | "changed_requires_review"
  | "deprecated";

export type PromisePriority = "P0" | "P1" | "P2";
export type PromiseBoundary = "unit" | "integration" | "browser" | "e2e" | "adapter";
export type RunStatus = "unknown" | "passing" | "failing" | "skipped" | "missing_evidence";
export type ReviewState = "pending" | "approved" | "rejected" | "changes_requested";

export interface HarnessModule {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  purpose: LocalizedText;
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

export interface HarnessSnapshot {
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

export const harnessSnapshot: HarnessSnapshot = {
  project: {
    name: {
      "zh-CN": "Promise Harness Workbench",
      en: "Test Promise Workbench",
    },
    description: {
      "zh-CN": "用 Module、Promise 和 Evidence 关系帮助人类 Review 系统行为。",
      en: "Use module, promise, and evidence relationships to help humans review system behavior.",
    },
    promiseCount: 43,
    moduleCount: 12,
    warningCount: 0,
    errorCount: 0,
  },
  modules: [
    {
      id: "protocol",
      title: {
        "zh-CN": "Protocol Module",
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
      covers: ["protocol/v1/**", "protocol/fixtures/**"],
      relatedModuleIds: ["promise-schema", "results-schema", "cli"],
    },
    {
      id: "promise-registry",
      title: {
        "zh-CN": "Promise Registry",
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
      covers: ["crates/harness-core/src/promise_registry.rs"],
      relatedModuleIds: ["promise-schema", "validation", "report"],
    },
    {
      id: "module-registry",
      title: {
        "zh-CN": "Module Registry",
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
      covers: ["crates/harness-core/src/module_registry.rs"],
      relatedModuleIds: ["validation", "protocol"],
    },
    {
      id: "cli",
      title: {
        "zh-CN": "CLI Module",
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
      covers: ["crates/harness-cli/src/**", "crates/harness-core/src/programs.rs"],
      relatedModuleIds: ["report", "adapter-runtime", "promise-registry"],
    },
    {
      id: "adapter-runtime",
      title: {
        "zh-CN": "Adapter Runtime",
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
      covers: ["crates/harness-adapter-runtime/src/**"],
      relatedModuleIds: ["results-schema", "rust-adapter", "vitest-adapter"],
    },
    {
      id: "report",
      title: {
        "zh-CN": "Report Module",
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
      covers: ["crates/harness-core/src/report.rs"],
      relatedModuleIds: ["cli", "promise-registry"],
    },
    {
      id: "web-dashboard",
      title: {
        "zh-CN": "Web Dashboard",
        en: "Web Dashboard",
      },
      summary: {
        "zh-CN": "用可视化方式浏览 Module、Promise、Review Queue、Draft 和 Run Status。",
        en: "Visualizes modules, promises, review queues, generated drafts, and run status.",
      },
      purpose: {
        "zh-CN": "让人类从可读界面进入 Promise Review，而不是先打开 YAML 或源码。",
        en: "Lets humans enter promise review through a readable interface instead of raw YAML or source files.",
      },
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
          "zh-CN": "项目根目录存在 promises/**/*.promises.yaml",
          en: "The project root contains promises/**/*.promises.yaml.",
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
      observes: ["promises/**/*.promises.yaml", "crates/harness-core/src/promise_registry.rs"],
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
          "zh-CN": "项目根目录存在 modules/*.module.yaml",
          en: "The project root contains modules/*.module.yaml.",
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
      observes: ["modules/*.module.yaml", "crates/harness-core/src/module_registry.rs"],
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
      observes: ["harness.yaml", "crates/harness-cli/src/main.rs"],
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
      id: "harness.web_dashboard.i18n_switches_chrome_and_snapshot_text",
      moduleId: "web-dashboard",
      feature: "Web Dashboard / I18N",
      title: {
        "zh-CN": "Dashboard 可以在中文和英文之间切换 UI 框架文案与可读 snapshot 文本",
        en: "The dashboard can switch UI chrome and readable snapshot text between Chinese and English",
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
          "zh-CN": "用户打开 Web Dashboard",
          en: "The user opens the Web Dashboard.",
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
          "非中文 reviewer 会被迫查看原始 YAML 或源码，削弱 dashboard 作为 review 入口的价值。",
        en: "Non-Chinese reviewers would have to inspect raw YAML or source code, weakening the dashboard as a review surface.",
      },
      review: { state: "approved", approvedBy: "xinyao", approvedAt: "2026-05-25" },
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
        "zh-CN": "新增 Web Dashboard 前，需要先定义 graph artifact 的 behavior promise。",
        en: "Before adding the Web Dashboard, the graph artifact needs an explicit behavior promise.",
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
        "zh-CN": "需要把 Web Dashboard 与文件系统写入边界拆清楚。",
        en: "The boundary between the Web Dashboard and filesystem writes needs to be clearer.",
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
