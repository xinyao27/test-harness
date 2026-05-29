// oxlint-disable unicorn/no-thenable

import { RiArrowLeftSLine, RiCloseLine, RiRobot2Line, RiTerminalBoxLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { HarnessPromise, HarnessSnapshot, PromisePriority } from "@/data/harness-snapshot";
import { SettingsDialog } from "@/features/settings/settings-page";
import { LifecycleBadge, RunStatusBadge } from "@/features/status/status-badge";
import { useAgentCardsStore } from "@/features/studio/agent-cards-store";
import {
  PromiseContext,
  StudioSearchDialog,
  WorkbenchHeader,
  buildStudioSearchResults,
  type StudioWriteState,
} from "@/features/studio/harness-studio-page";
import { agentToolLabel } from "@/features/studio/pty-card-node";
import { PtyTerminal } from "@/features/studio/pty-terminal";
import {
  fallbackWorkbenchProjects,
  getWorkbenchProjects,
  getWorkbenchSnapshot,
  openWorkbenchFile,
  saveWorkbenchPromiseReview,
  type WorkbenchReviewAction,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { localizeText } from "@/lib/localized-text";
import { cn } from "@/lib/utils";

const PROJECT_ID = "current:test-harness";

type ToolView = "terminal" | "agents";

const promisePriorityRank: Record<PromisePriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
};

function sortModulePromises(
  promises: HarnessPromise[],
  locale: ReturnType<typeof useI18n>["locale"],
) {
  return [...promises].sort((left, right) => {
    const priorityDifference =
      promisePriorityRank[left.priority] - promisePriorityRank[right.priority];
    if (priorityDifference !== 0) return priorityDifference;

    return localizeText(left.title, locale).localeCompare(localizeText(right.title, locale));
  });
}

function WorkspaceEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="grid h-full min-h-0 place-items-center p-(--studio-panel-padding)">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          {description ? <EmptyDescription>{description}</EmptyDescription> : null}
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function PromiseList({
  onSelectPromise,
  promises,
  selectedPromiseId,
}: {
  onSelectPromise: (promiseId: string) => void;
  promises: HarnessPromise[];
  selectedPromiseId: string | null;
}) {
  const { locale, m } = useI18n();

  return (
    <section
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-sidebar"
      aria-label={m.promises_title({}, { locale })}
    >
      <ScrollArea className="min-h-0 flex-1">
        <div>
          {promises.length > 0 ? (
            promises.map((promise) => {
              const isSelected = promise.id === selectedPromiseId;

              return (
                <button
                  key={promise.id}
                  type="button"
                  className="flex w-full flex-col bg-transparent px-(--studio-panel-padding) py-[calc(var(--studio-panel-padding)*0.65)] text-left text-foreground transition-colors duration-(--studio-motion-duration) hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                  data-selected={isSelected}
                  onClick={() => onSelectPromise(promise.id)}
                >
                  <div className="flex items-start justify-between gap-(--studio-panel-gap-sm)">
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-xs font-normal leading-snug">
                        {localizeText(promise.title, locale)}
                      </div>
                    </div>
                    <CompactPriorityBadge priority={promise.priority} />
                  </div>
                  <div className="mt-(--studio-panel-gap-xs) flex flex-wrap gap-(--studio-panel-gap-xs)">
                    <LifecycleBadge lifecycle={promise.lifecycle} size="xs" />
                    <RunStatusBadge size="xs" status={promise.runStatus} />
                  </div>
                </button>
              );
            })
          ) : (
            <div className="p-(--studio-panel-padding) text-sm text-muted-foreground">
              {m.module_detail_promises_empty({}, { locale })}
            </div>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}

function CompactPriorityBadge({ priority }: { priority: PromisePriority }) {
  return (
    <Badge size="xs" variant={priority === "P0" ? "default" : "secondary"}>
      {priority}
    </Badge>
  );
}

function ToolsRegion({
  isOpen,
  modulePromiseIds,
  onOpenChange,
  promises,
  selectedPromiseId,
  toolView,
}: {
  isOpen: boolean;
  modulePromiseIds: Set<string>;
  onOpenChange: (open: boolean) => void;
  promises: HarnessPromise[];
  selectedPromiseId: string | null;
  toolView: ToolView;
}) {
  const { locale, m } = useI18n();
  const terminalLabel = m.studio_workspace_tool_terminal({}, { locale });
  const activeLabel =
    toolView === "agents" ? m.studio_workspace_tool_agents({}, { locale }) : terminalLabel;
  const ActiveIcon = toolView === "agents" ? RiRobot2Line : RiTerminalBoxLine;
  const shouldShowHeader = toolView !== "agents";

  if (!isOpen) {
    return (
      <aside
        className="flex h-full min-h-0 w-full min-w-0 flex-col items-center gap-(--studio-panel-gap-sm) overflow-hidden bg-background p-(--studio-panel-gap-sm)"
        aria-label={m.studio_workspace_tools({}, { locale })}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={m.sidebar_open({}, { locale })}
                className="rounded-(--studio-control-radius) shadow-none"
                onClick={() => onOpenChange(true)}
              />
            }
          >
            <RiArrowLeftSLine />
          </TooltipTrigger>
          <TooltipContent side="left">{m.sidebar_open({}, { locale })}</TooltipContent>
        </Tooltip>
        <div className="flex min-h-0 flex-1 flex-col gap-(--studio-panel-gap-xs)">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={terminalLabel}
                  className="rounded-(--studio-control-radius) shadow-none"
                  onClick={() => onOpenChange(true)}
                />
              }
            >
              <RiTerminalBoxLine />
            </TooltipTrigger>
            <TooltipContent side="left">{terminalLabel}</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background"
      aria-label={m.studio_workspace_tools({}, { locale })}
    >
      {shouldShowHeader ? (
        <header className="flex min-h-(--studio-panel-header-height) items-center justify-between gap-(--studio-panel-gap-sm) px-(--studio-panel-padding)">
          <div className="flex min-w-0 items-center gap-(--studio-panel-gap-sm)">
            <ActiveIcon className="size-4 shrink-0 text-muted-foreground" />
            <h2 className="truncate text-sm font-medium">{activeLabel}</h2>
          </div>
          <div className="flex items-center gap-(--studio-panel-gap-xs)">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={m.sidebar_close({}, { locale })}
                    className="rounded-(--studio-control-radius) shadow-none"
                    onClick={() => onOpenChange(false)}
                  />
                }
              >
                <RiCloseLine />
              </TooltipTrigger>
              <TooltipContent side="bottom">{m.sidebar_close({}, { locale })}</TooltipContent>
            </Tooltip>
          </div>
        </header>
      ) : null}
      <div className="min-h-0 flex-1">
        {toolView === "terminal" ? <TerminalToolView /> : null}
        {toolView === "agents" ? (
          <AgentsToolView
            modulePromiseIds={modulePromiseIds}
            promises={promises}
            selectedPromiseId={selectedPromiseId}
          />
        ) : null}
      </div>
    </aside>
  );
}

function TerminalToolView() {
  return (
    <div className="h-full min-h-0 bg-card">
      <PtyTerminal kind="terminal" />
    </div>
  );
}

function AgentsToolView({
  modulePromiseIds,
  promises,
  selectedPromiseId,
}: {
  modulePromiseIds: Set<string>;
  promises: HarnessPromise[];
  selectedPromiseId: string | null;
}) {
  const { locale, m } = useI18n();
  const agentCards = useAgentCardsStore((store) => store.cards);
  const promisesById = useMemo(
    () => new Map(promises.map((promise) => [promise.id, promise])),
    [promises],
  );
  const moduleAgents = useMemo(
    () =>
      agentCards
        .filter(
          (card) =>
            card.kind === "agent" && card.promiseId != null && modulePromiseIds.has(card.promiseId),
        )
        .sort((left, right) => left.createdAt - right.createdAt),
    [agentCards, modulePromiseIds],
  );
  const selectedAgents = useMemo(
    () => moduleAgents.filter((card) => card.promiseId === selectedPromiseId),
    [moduleAgents, selectedPromiseId],
  );
  const [openAgentIds, setOpenAgentIds] = useState<string[]>([]);

  useEffect(() => {
    setOpenAgentIds((current) => {
      const visibleIds = new Set(selectedAgents.map((card) => card.id));
      const currentVisible = current.filter((id) => visibleIds.has(id));
      const latestId = selectedAgents.at(-1)?.id;
      const resolved = latestId && !currentVisible.includes(latestId) ? [latestId] : currentVisible;
      return resolved.length === current.length &&
        resolved.every((id, index) => id === current[index])
        ? current
        : resolved;
    });
  }, [selectedAgents]);

  return (
    <div className="h-full min-h-0 bg-card">
      {selectedAgents.length === 0 ? (
        <WorkspaceEmpty
          title={m.studio_workspace_agents_empty({}, { locale })}
          description={m.studio_workspace_agents_empty_description({}, { locale })}
        />
      ) : null}
      <Accordion
        className="h-full min-h-0 overflow-y-auto"
        keepMounted
        value={openAgentIds}
        onValueChange={setOpenAgentIds}
      >
        {moduleAgents.map((agent) => (
          <AccordionItem
            key={agent.id}
            value={agent.id}
            className={cn(
              "flex min-h-0 flex-col border-b border-border",
              agent.promiseId !== selectedPromiseId && "hidden",
            )}
          >
            <div className="px-(--studio-panel-padding)">
              <AccordionTrigger className="min-w-0 flex-1 items-center py-(--studio-panel-gap-sm) font-normal hover:no-underline **:data-[slot=accordion-trigger-icon]:mt-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-normal">
                    {agentToolLabel(agent.tool ?? "claude", locale, m)}
                  </div>
                  <div className="truncate font-mono text-xs font-normal text-muted-foreground">
                    {agent.promiseId
                      ? localizeText(
                          promisesById.get(agent.promiseId)?.title ?? agent.promiseId,
                          locale,
                        )
                      : m.studio_workspace_unlinked_agent({}, { locale })}
                  </div>
                </div>
              </AccordionTrigger>
            </div>
            <AccordionContent className="h-[calc(100dvh-9rem)] min-h-[18rem] pb-0">
              <PtyTerminal
                key={agent.id}
                kind="agent"
                tool={agent.tool}
                initialPrompt={agent.initialPrompt}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

export function ModuleDetailPage({ moduleId }: { moduleId: string }) {
  const { locale, m } = useI18n();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [writeState, setWriteState] = useState<StudioWriteState>({
    result: null,
    status: "idle",
  });
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [toolView, setToolView] = useState<ToolView>("terminal");
  const { data } = useQuery({
    queryKey: ["workbench-snapshot", PROJECT_ID],
    queryFn: getWorkbenchSnapshot,
  });
  const { data: knownProjects = fallbackWorkbenchProjects } = useQuery({
    queryKey: ["workbench-projects"],
    queryFn: getWorkbenchProjects,
  });

  // Real daemon data drives the page. In dev with no daemon paired the snapshot is
  // empty, so fall back to a fixture purely so the layout is workable offline; this
  // branch is compiled out of production builds.
  const snapshot: HarnessSnapshot | null =
    data && data.promises.length > 0 ? data : import.meta.env.DEV ? DEV_FIXTURE : (data ?? null);

  const module = snapshot?.modules.find((mod) => mod.id === moduleId) ?? null;
  const modulePromises = useMemo(
    () =>
      snapshot && module
        ? sortModulePromises(
            snapshot.promises.filter((promise) => promise.moduleId === module.id),
            locale,
          )
        : [],
    [snapshot, module, locale],
  );
  const modulePromiseIds = useMemo(
    () => new Set(modulePromises.map((promise) => promise.id)),
    [modulePromises],
  );

  useEffect(() => {
    setSelectedId((current) =>
      current && modulePromises.some((promise) => promise.id === current)
        ? current
        : (modulePromises[0]?.id ?? null),
    );
  }, [modulePromises]);

  const selectedPromise = modulePromises.find((promise) => promise.id === selectedId) ?? null;
  const projectName = snapshot ? localizeText(snapshot.project.name, locale) : "test-harness";
  const searchResults = useMemo(
    () => (snapshot ? buildStudioSearchResults(snapshot, locale, m) : []),
    [snapshot, locale, m],
  );
  const onReviewPromise = useCallback(
    async (promiseId: string, action: WorkbenchReviewAction, note: string): Promise<boolean> => {
      setWriteState({ result: null, status: "saving" });
      const result = await saveWorkbenchPromiseReview({
        action,
        note: note.trim() || undefined,
        projectId: PROJECT_ID,
        promiseId,
        reviewer: "reviewer",
      });
      if (!result) {
        setWriteState({ result: null, status: "failed" });
        return false;
      }
      setWriteState({ result, status: result.saved ? "success" : "rejected" });
      return result.saved;
    },
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="m-(--studio-control-inset) [&_.studio-top-bar]:pointer-events-auto">
        <WorkbenchHeader
          knownProjects={knownProjects}
          selectedProjectId={PROJECT_ID}
          onProjectChange={() => void navigate({ to: "/" })}
          module={module}
          promise={selectedPromise}
          projectName={projectName}
          onProjectClick={() => void navigate({ to: "/" })}
          onModuleClick={() => setSelectedId(null)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </header>
      <StudioSearchDialog
        isOpen={searchOpen}
        onOpenChange={setSearchOpen}
        results={searchResults}
        onSelectResult={(result) => {
          setSearchOpen(false);
          void navigate({ to: "/modules/$moduleId", params: { moduleId: result.moduleId } });
        }}
      />
      <SettingsDialog isOpen={settingsOpen} onOpenChange={setSettingsOpen} />
      <div
        className="m-0 min-h-0 flex-1 overflow-hidden rounded-t-(--studio-radius) rounded-b-none border border-border"
        data-tools-collapsed={!isToolsOpen}
      >
        {snapshot && module ? (
          <ResizablePanelGroup
            key={isToolsOpen ? "tools-open" : "tools-collapsed"}
            orientation="horizontal"
            className="min-h-0 min-w-[52rem] overflow-hidden"
          >
            <ResizablePanel
              className="min-h-0 min-w-0"
              defaultSize="24%"
              minSize="16%"
              maxSize="40%"
            >
              <PromiseList
                onSelectPromise={setSelectedId}
                promises={modulePromises}
                selectedPromiseId={selectedId}
              />
            </ResizablePanel>
            <ResizableHandle className="!w-px !bg-border after:!w-2 hover:!bg-accent [&[data-resize-handle-active]]:!bg-accent" />
            <ResizablePanel
              className="min-h-0 min-w-0"
              defaultSize={isToolsOpen ? "46%" : "72%"}
              minSize="30%"
            >
              <main className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background">
                {selectedPromise ? (
                  <ReactFlowProvider>
                    <PromiseContext
                      canOpenFiles={snapshot.source === "daemon"}
                      canWrite={snapshot.source === "daemon"}
                      isSaving={writeState.status === "saving"}
                      onAgentHandoff={() => {
                        setToolView("agents");
                        setIsToolsOpen(true);
                      }}
                      onOpenFile={(file) => void openWorkbenchFile(PROJECT_ID, file)}
                      onReviewPromise={onReviewPromise}
                      promise={selectedPromise}
                      resultsGeneratedAt={snapshot.resultsGeneratedAt}
                      writeState={writeState}
                    />
                  </ReactFlowProvider>
                ) : (
                  <WorkspaceEmpty
                    title={m.studio_context_empty_title({}, { locale })}
                    description={m.studio_context_empty_body({}, { locale })}
                  />
                )}
              </main>
            </ResizablePanel>
            {isToolsOpen ? (
              <ResizableHandle className="!w-px !bg-border after:!w-2 hover:!bg-accent [&[data-resize-handle-active]]:!bg-accent" />
            ) : null}
            <ResizablePanel
              className="min-h-0 min-w-0"
              defaultSize={isToolsOpen ? "30%" : "4%"}
              minSize={isToolsOpen ? "18%" : "4%"}
              maxSize={isToolsOpen ? "46%" : "4%"}
            >
              <ToolsRegion
                isOpen={isToolsOpen}
                modulePromiseIds={modulePromiseIds}
                onOpenChange={setIsToolsOpen}
                promises={modulePromises}
                selectedPromiseId={selectedId}
                toolView={toolView}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background">
            <WorkspaceEmpty title={m.module_detail_missing({}, { locale })} />
          </div>
        )}
      </div>
    </div>
  );
}

// Dev-only fixture (see usage above) — not bundled in production.
const DEV_FIXTURE: HarnessSnapshot = {
  source: "static",
  project: {
    name: "test-harness",
    description: "Promise-driven test harness",
    promiseCount: 3,
    moduleCount: 1,
    warningCount: 0,
    errorCount: 0,
  },
  modules: [
    {
      id: "studio.graph-layout",
      title: "studio · graph-layout",
      summary: "画布布局与平移",
      purpose: "保证聚焦 / 平移时画布稳定、可读。",
      priority: "P0",
      promiseIds: [
        "layout_settles_before_pan",
        "focused_module_uses_elk",
        "pan_reads_derived_positions",
      ],
      covers: ["apps/web/src/features/studio/use-elk-layout.ts"],
      relatedModuleIds: [],
      package: "web",
    },
  ],
  promises: [
    {
      id: "layout_settles_before_pan",
      moduleId: "studio.graph-layout",
      feature: "Graph layout",
      title: "ELK 布局稳定前，画布不抢先平移",
      purpose: "聚焦某个 module 时，必须等 ELK 布局算完再平移，否则画面会跳。",
      priority: "P0",
      boundary: "unit",
      lifecycle: "accepted",
      runStatus: "failing",
      given: ["聚焦一个 module"],
      when: ["ELK 对它布局"],
      then: ["布局稳定前，页面不平移"],
      observes: ["apps/web/src/features/studio/use-elk-layout.ts"],
      evidence: [
        {
          file: "apps/web/src/features/studio/use-elk-layout.test.ts",
          testName: "waits for ELK before pan",
          status: "failing",
          failureMessage: "expected no pan before layout settled",
        },
      ],
      failureMeaning: "每次聚焦画布都跳，地图没法读。",
      review: { state: "approved", events: [] },
    },
    {
      id: "focused_module_uses_elk",
      moduleId: "studio.graph-layout",
      feature: "Graph layout",
      title: "聚焦 module 时用 ELK 重新布局子节点",
      purpose: "聚焦模式下子节点应由 ELK 布局，而非沿用 package 总览布局。",
      priority: "P1",
      boundary: "unit",
      lifecycle: "proposed",
      runStatus: "unknown",
      given: ["聚焦某个 module"],
      when: ["进入聚焦模式"],
      then: ["子节点用 ELK 布局，而非沿用总览布局"],
      observes: ["apps/web/src/features/studio/use-elk-layout.ts"],
      evidence: [],
      failureMeaning: "聚焦后子节点排布混乱。",
      review: { state: "pending", events: [] },
    },
    {
      id: "pan_reads_derived_positions",
      moduleId: "studio.graph-layout",
      feature: "Graph layout",
      title: "平移从 derivedNodes 读取节点位置",
      purpose: "平移动画应读 derivedNodes，避开 React Flow 滞后的 store。",
      priority: "P1",
      boundary: "unit",
      lifecycle: "accepted",
      runStatus: "passing",
      given: ["平移动画进行中"],
      when: ["读取节点位置"],
      then: ["从 derivedNodes 读取，而非滞后的 store"],
      observes: ["apps/web/src/features/studio/use-elk-layout.ts"],
      evidence: [
        {
          file: "apps/web/src/features/studio/pan-derived.test.ts",
          testName: "reads derivedNodes during pan",
          status: "passing",
        },
      ],
      failureMeaning: "平移用到过期坐标，画面错位。",
      review: { state: "approved", events: [] },
    },
  ],
  reviewDrafts: [],
  resultsGeneratedAt: "unix-ms:1748500000000",
};
