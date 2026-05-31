import { useEffect, useMemo, useState } from "react";

import type {
  HarnessExample,
  HarnessFeature,
  HarnessModule,
  HarnessPackage,
  HarnessRule,
  HarnessSnapshot,
  ReviewState,
  RunStatus,
} from "@/data/harness-snapshot";
import {
  getDaemonConnectionStatus,
  getWorkbenchProjects,
  getWorkbenchSnapshotForProject,
  openWorkbenchFile,
  reviewWorkbenchRule,
  runWorkbenchTests,
  type DaemonConnectionState,
  type RuleReviewAction,
  type WorkbenchProject,
  type WorkbenchRunResult,
} from "@/lib/api";
import { useI18n, type AppLocale } from "@/lib/i18n";
import { localizeText } from "@/lib/localized-text";
import { cn } from "@/lib/utils";

const defaultProjectId = "current:test-harness";

export function HarnessStudioPage() {
  const { locale, setLocale } = useI18n();
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [projects, setProjects] = useState<WorkbenchProject[]>([]);
  const [snapshot, setSnapshot] = useState<HarnessSnapshot | null>(null);
  const [connection, setConnection] = useState<DaemonConnectionState>("disconnected");
  const [selectedFeatureTag, setSelectedFeatureTag] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<WorkbenchRunResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProjects() {
      const [projectItems, status] = await Promise.all([
        getWorkbenchProjects(),
        getDaemonConnectionStatus(),
      ]);
      if (cancelled) return;
      setProjects(projectItems);
      setConnection(status.state);
    }
    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSnapshot() {
      setIsLoading(true);
      const nextSnapshot = await getWorkbenchSnapshotForProject(projectId);
      if (cancelled) return;
      setSnapshot(nextSnapshot);
      setSelectedFeatureTag((current) => {
        if (current && nextSnapshot.features.some((feature) => feature.tag === current)) {
          return current;
        }
        return preferredFeatures(nextSnapshot.features, locale)[0]?.tag ?? null;
      });
      setIsLoading(false);
    }
    void loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, [locale, projectId]);

  const visibleFeatures = useMemo(
    () => preferredFeatures(snapshot?.features ?? [], locale),
    [locale, snapshot],
  );
  const selectedFeature =
    visibleFeatures.find((feature) => feature.tag === selectedFeatureTag) ?? visibleFeatures[0];
  const packageById = useMemo(() => indexPackages(snapshot?.packages ?? []), [snapshot]);
  const moduleById = useMemo(() => indexModules(snapshot?.modules ?? []), [snapshot]);

  async function refreshSnapshot() {
    const nextSnapshot = await getWorkbenchSnapshotForProject(projectId);
    setSnapshot(nextSnapshot);
    setSelectedFeatureTag((current) => {
      if (current && nextSnapshot.features.some((feature) => feature.tag === current)) {
        return current;
      }
      return preferredFeatures(nextSnapshot.features, locale)[0]?.tag ?? null;
    });
  }

  async function handleRunTests() {
    setIsRunning(true);
    const result = await runWorkbenchTests(projectId);
    setRunResult(result);
    await refreshSnapshot();
    setIsRunning(false);
  }

  async function handleOpenFile(file: string) {
    await openWorkbenchFile(projectId, file);
  }

  async function handleReviewRule(
    feature: string,
    rule: string,
    action: RuleReviewAction,
    note?: string,
  ) {
    const result = await reviewWorkbenchRule({ action, feature, note, projectId, rule });
    if (result) {
      await refreshSnapshot();
    }
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Harness Studio
          </div>
          <h1 className="truncate text-xl font-semibold">
            {snapshot ? localizeText(snapshot.project.name, locale) : "Harness project"}
          </h1>
        </div>
        <select
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <div className="flex h-9 overflow-hidden rounded-md border border-border text-sm">
          <button
            className={cn("px-3", locale === "zh-CN" && "bg-accent text-accent-foreground")}
            type="button"
            onClick={() => setLocale("zh-CN")}
          >
            中文
          </button>
          <button
            className={cn(
              "border-l border-border px-3",
              locale === "en" && "bg-accent text-accent-foreground",
            )}
            type="button"
            onClick={() => setLocale("en")}
          >
            EN
          </button>
        </div>
        <button
          className="h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent"
          type="button"
          disabled={isRunning || connection !== "connected"}
          onClick={handleRunTests}
        >
          {isRunning ? label(locale, "Running", "运行中") : label(locale, "Run tests", "运行测试")}
        </button>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)_22rem] overflow-hidden">
        <aside className="min-h-0 overflow-auto border-r border-border p-4">
          <ConnectionBanner state={connection} locale={locale} />
          {snapshot ? <ProjectSummary snapshot={snapshot} locale={locale} /> : null}
          <section className="mt-5">
            <SectionTitle title={label(locale, "Packages", "Packages")} />
            <div className="space-y-2">
              {(snapshot?.packages ?? []).map((item) => (
                <PackageCard key={item.id} item={item} locale={locale} />
              ))}
            </div>
          </section>
        </aside>

        <section className="min-h-0 overflow-auto p-5">
          {isLoading ? (
            <EmptyState text={label(locale, "Loading behavior model...", "正在加载行为模型...")} />
          ) : visibleFeatures.length === 0 ? (
            <EmptyState
              text={label(
                locale,
                "No Cucumber features are available for this locale.",
                "当前语言还没有可展示的 Cucumber features。",
              )}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
              <FeatureList
                features={visibleFeatures}
                locale={locale}
                selectedFeatureTag={selectedFeature?.tag ?? null}
                onSelect={setSelectedFeatureTag}
              />
              {selectedFeature ? (
                <FeatureDetail
                  feature={selectedFeature}
                  locale={locale}
                  module={moduleById.get(selectedFeature.module)}
                  onReviewRule={handleReviewRule}
                  packageItem={packageById.get(selectedFeature.package)}
                  onOpenFile={handleOpenFile}
                />
              ) : null}
            </div>
          )}
        </section>

        <aside className="min-h-0 overflow-auto border-l border-border p-4">
          <SectionTitle title={label(locale, "Review queue", "Review 队列")} />
          {snapshot?.reviewDrafts.length ? (
            <div className="space-y-2">
              {snapshot.reviewDrafts.map((draft) => (
                <div key={draft.id} className="rounded-md border border-border p-3">
                  <div className="text-xs text-muted-foreground">{draft.state}</div>
                  <div className="mt-1 break-words text-sm font-medium">
                    {localizeText(draft.title, locale)}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {localizeText(draft.reason, locale)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              text={label(locale, "No Rules need review.", "没有需要 review 的 Rules。")}
            />
          )}
          <RunResultPanel result={runResult} locale={locale} />
        </aside>
      </main>
    </div>
  );
}

function ProjectSummary({ snapshot, locale }: { snapshot: HarnessSnapshot; locale: AppLocale }) {
  const stats = [
    ["Packages", snapshot.project.packageCount],
    ["Modules", snapshot.project.moduleCount],
    ["Features", snapshot.project.featureCount],
    ["Rules", snapshot.project.ruleCount],
    ["Examples", snapshot.project.exampleCount],
  ];
  return (
    <section>
      <p className="text-sm text-muted-foreground">
        {localizeText(snapshot.project.description, locale)}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {stats.map(([name, value]) => (
          <div key={name} className="rounded-md border border-border p-2">
            <div className="text-lg font-semibold">{value}</div>
            <div className="text-xs text-muted-foreground">{name}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2 text-xs">
        <span className={cn("rounded-full px-2 py-1", issueTone(snapshot.project.errorCount))}>
          {snapshot.project.errorCount} errors
        </span>
        <span className={cn("rounded-full px-2 py-1", issueTone(snapshot.project.warningCount))}>
          {snapshot.project.warningCount} warnings
        </span>
      </div>
      {snapshot.resultsGeneratedAt ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {label(locale, "Results", "结果")} {formatDate(snapshot.resultsGeneratedAt)}
        </p>
      ) : null}
    </section>
  );
}

function PackageCard({ item, locale }: { item: HarnessPackage; locale: AppLocale }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-sm font-medium">{localizeText(item.title, locale)}</div>
      <div className="mt-1 text-xs text-muted-foreground">{item.id}</div>
      <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
        {localizeText(item.purpose, locale)}
      </p>
      <div className="mt-2 text-xs text-muted-foreground">{item.moduleIds.length} modules</div>
    </div>
  );
}

function FeatureList({
  features,
  locale,
  onSelect,
  selectedFeatureTag,
}: {
  features: HarnessFeature[];
  locale: AppLocale;
  onSelect: (tag: string) => void;
  selectedFeatureTag: string | null;
}) {
  return (
    <div className="space-y-2">
      <SectionTitle title={label(locale, "Features", "Features")} />
      {features.map((feature) => (
        <button
          key={`${feature.tag}:${feature.locale}`}
          className={cn(
            "w-full rounded-md border border-border p-3 text-left hover:bg-accent",
            feature.tag === selectedFeatureTag && "border-ring bg-accent",
          )}
          type="button"
          onClick={() => onSelect(feature.tag)}
        >
          <div className="text-sm font-medium">{feature.name}</div>
          <div className="mt-1 break-words text-xs text-muted-foreground">{feature.tag}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            {feature.rules.length} rules / {countExamples(feature)} examples
          </div>
        </button>
      ))}
    </div>
  );
}

function FeatureDetail({
  feature,
  locale,
  module,
  onOpenFile,
  onReviewRule,
  packageItem,
}: {
  feature: HarnessFeature;
  locale: AppLocale;
  module?: HarnessModule;
  onOpenFile: (file: string) => void;
  onReviewRule: (
    feature: string,
    rule: string,
    action: RuleReviewAction,
    note?: string,
  ) => Promise<void>;
  packageItem?: HarnessPackage;
}) {
  return (
    <article className="min-w-0 rounded-md border border-border">
      <header className="border-b border-border p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">{feature.tag}</div>
            <h2 className="mt-1 text-xl font-semibold">{feature.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{packageItem ? localizeText(packageItem.title, locale) : feature.package}</span>
              <span>/</span>
              <span>{module ? localizeText(module.title, locale) : feature.module}</span>
              <span>/</span>
              <span>{feature.locale}</span>
            </div>
          </div>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            type="button"
            onClick={() => onOpenFile(feature.path)}
          >
            {label(locale, "Open file", "打开文件")}
          </button>
        </div>
        <div className="mt-3 break-words text-xs text-muted-foreground">
          {feature.path}:{feature.line}
        </div>
      </header>
      <div className="divide-y divide-border">
        {feature.rules.map((rule) => (
          <RulePanel
            key={`${feature.tag}:${rule.tag}`}
            featureTag={feature.tag}
            locale={locale}
            onReviewRule={onReviewRule}
            rule={rule}
          />
        ))}
      </div>
    </article>
  );
}

function RulePanel({
  featureTag,
  locale,
  onReviewRule,
  rule,
}: {
  featureTag: string;
  locale: AppLocale;
  onReviewRule: (
    feature: string,
    rule: string,
    action: RuleReviewAction,
    note?: string,
  ) => Promise<void>;
  rule: HarnessRule;
}) {
  async function review(action: RuleReviewAction) {
    const needsNote = action !== "approve";
    const note = needsNote
      ? (globalThis.prompt?.(label(locale, "Review note", "Review 备注")) ?? undefined)
      : undefined;
    if (needsNote && note === undefined) {
      return;
    }
    await onReviewRule(featureTag, rule.tag, action, note);
  }

  return (
    <section className="p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="break-words text-xs text-muted-foreground">{rule.tag}</div>
          <h3 className="mt-1 text-base font-semibold">{rule.name}</h3>
        </div>
        <span className={cn("rounded-full px-2 py-1 text-xs", lifecycleTone(rule.lifecycle))}>
          {rule.lifecycle}
        </span>
        <span className={cn("rounded-full px-2 py-1 text-xs", reviewTone(rule.reviewState))}>
          {reviewLabel(rule.reviewState, locale)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <ReviewButton label={label(locale, "Approve", "批准")} onClick={() => review("approve")} />
        <ReviewButton
          label={label(locale, "Request changes", "请求修改")}
          onClick={() => review("requestChanges")}
        />
        <ReviewButton label={label(locale, "Reject", "拒绝")} onClick={() => review("reject")} />
        <ReviewButton
          label={label(locale, "Deprecate", "废弃")}
          onClick={() => review("deprecate")}
        />
        <ReviewButton
          label={label(locale, "Supersede", "替换")}
          onClick={() => review("supersede")}
        />
      </div>
      <div className="mt-3 space-y-2">
        {rule.examples.map((example) => (
          <ExampleRow key={`${rule.tag}:${example.tag}`} example={example} />
        ))}
      </div>
      {rule.reviewEvents.length ? (
        <div className="mt-3 space-y-1 border-t border-border pt-3">
          {rule.reviewEvents.map((event) => (
            <div key={event.id} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{event.action}</span>
              {" / "}
              {event.by}
              {" / "}
              {formatDate(event.at)}
              <div className="mt-1">{localizeText(event.summary, locale)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ReviewButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="h-8 rounded-md border border-border px-2 text-xs hover:bg-accent"
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ExampleRow({ example }: { example: HarnessExample }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{example.name}</div>
          <div className="mt-1 break-words text-xs text-muted-foreground">{example.tag}</div>
        </div>
        <span className={cn("rounded-full px-2 py-1 text-xs", statusTone(example.runStatus))}>
          {example.runStatus}
        </span>
      </div>
      {example.evidence.length ? (
        <div className="mt-3 space-y-1">
          {example.evidence.map((evidence) => (
            <div
              key={`${evidence.file}:${evidence.locale}`}
              className="text-xs text-muted-foreground"
            >
              {evidence.status} / {evidence.locale} / {evidence.file}
              {evidence.failureMessage ? (
                <div className="mt-1 text-destructive">{evidence.failureMessage}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConnectionBanner({ locale, state }: { locale: AppLocale; state: DaemonConnectionState }) {
  const text =
    state === "connected"
      ? label(locale, "Daemon connected", "Daemon 已连接")
      : state === "pairing-required"
        ? label(
            locale,
            "Pair with the daemon to load live project data.",
            "配对 daemon 后才能加载实时项目数据。",
          )
        : state === "invalid-session"
          ? label(locale, "Daemon session is invalid.", "Daemon session 已失效。")
          : label(locale, "Daemon is not reachable.", "Daemon 当前不可达。");
  return (
    <div className={cn("mb-4 rounded-md px-3 py-2 text-sm", connectionTone(state))}>{text}</div>
  );
}

function RunResultPanel({
  locale,
  result,
}: {
  locale: AppLocale;
  result: WorkbenchRunResult | null;
}) {
  if (!result) return null;
  return (
    <section className="mt-5">
      <SectionTitle title={label(locale, "Last run", "最近运行")} />
      <div className="rounded-md border border-border p-3">
        <div className="text-sm font-medium">Exit {result.exitCode}</div>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
          {result.stdout || result.stderr || label(locale, "No output.", "没有输出。")}
        </pre>
      </div>
    </section>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </h2>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function preferredFeatures(features: HarnessFeature[], locale: AppLocale) {
  const localized = features.filter((feature) => feature.locale === locale);
  return localized.length ? localized : features;
}

function indexPackages(packages: HarnessPackage[]) {
  return new Map(packages.map((item) => [item.id, item]));
}

function indexModules(modules: HarnessModule[]) {
  return new Map(modules.map((item) => [item.id, item]));
}

function countExamples(feature: HarnessFeature) {
  return feature.rules.reduce((total, rule) => total + rule.examples.length, 0);
}

function label(locale: AppLocale, en: string, zhCn: string) {
  return locale === "zh-CN" ? zhCn : en;
}

function reviewLabel(state: ReviewState, locale: AppLocale) {
  const labels: Record<ReviewState, [string, string]> = {
    approved: ["Approved", "已通过"],
    changes_requested: ["Changes requested", "需要修改"],
    pending: ["Pending", "待 review"],
    rejected: ["Rejected", "已拒绝"],
  };
  const [en, zhCn] = labels[state];
  return label(locale, en, zhCn);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function issueTone(count: number) {
  return count > 0 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success-foreground";
}

function connectionTone(state: DaemonConnectionState) {
  return state === "connected"
    ? "bg-success/10 text-success-foreground"
    : "bg-warning/10 text-warning-foreground";
}

function lifecycleTone(lifecycle: HarnessRule["lifecycle"]) {
  if (lifecycle === "accepted") return "bg-success/10 text-success-foreground";
  if (lifecycle === "proposed" || lifecycle === "draft")
    return "bg-warning/10 text-warning-foreground";
  return "bg-muted text-muted-foreground";
}

function reviewTone(state: ReviewState) {
  if (state === "approved") return "bg-success/10 text-success-foreground";
  if (state === "changes_requested" || state === "pending")
    return "bg-warning/10 text-warning-foreground";
  return "bg-destructive/10 text-destructive";
}

function statusTone(status: RunStatus) {
  if (status === "passing") return "bg-success/10 text-success-foreground";
  if (status === "failing") return "bg-destructive/10 text-destructive";
  if (status === "skipped") return "bg-warning/10 text-warning-foreground";
  return "bg-muted text-muted-foreground";
}
