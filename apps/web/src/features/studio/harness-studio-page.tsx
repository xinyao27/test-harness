// oxlint-disable unicorn/no-thenable

import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCheckLine,
  RiCloseLine,
  RiExternalLinkLine,
  RiFolderAddLine,
  RiFolderLine,
  RiLightbulbLine,
  RiInboxLine,
  RiPencilLine,
  RiSearchLine,
  RiSettings3Line,
  RiShieldCheckLine,
  RiStackLine,
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
} from "@remixicon/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import "@xyflow/react/dist/style.css";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  HarnessModule,
  HarnessPromise,
  HarnessSnapshot,
  PromiseBoundary,
  PromiseEvidence,
  PromiseLifecycle,
  PromisePriority,
  ModulePriority,
  RunStatus,
  SnapshotSource,
} from "@/data/harness-snapshot";
import { SettingsPanel } from "@/features/settings/settings-page";
import {
  fallbackWorkbenchProjects,
  getDaemonConnectionStatus,
  getWorkbenchProjects,
  getWorkbenchSnapshotForProject,
  openWorkbenchFile,
  runWorkbenchTests,
  saveWorkbenchModule,
  saveWorkbenchPromise,
  saveWorkbenchPromiseReview,
  type WorkbenchRunResult,
  type WorkbenchModuleRecord,
  type WorkbenchProject,
  type WorkbenchPromiseRecord,
  type WorkbenchReviewAction,
  type WorkbenchWriteResult,
} from "@/lib/api";
import { useI18n, type AppLocale } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/localized-text";
import { localizeText, localizeTexts } from "@/lib/localized-text";
import { cn } from "@/lib/utils";

type StudioNodeKind = "module" | "promise" | "priorityLayer" | "packageRegion";

type StudioNodeData = {
  caption: string;
  dimmed: boolean;
  kind: StudioNodeKind;
  meta: string;
  needsAttention: boolean;
  priority: ModulePriority;
  selected: boolean;
  title: string;
};

type StudioNode = Node<StudioNodeData>;
type MessageModule = ReturnType<typeof useI18n>["m"];

type StudioSearchResult = {
  id: string;
  kind: StudioNodeKind;
  moduleId: string;
  priority: ModulePriority;
  searchText: string;
  subtitle: string;
  title: string;
  promiseId?: string;
  trailing?: string;
};

type StudioRunState = {
  result: WorkbenchRunResult | null;
  status: "idle" | "running" | "success" | "failed";
};

type StudioWriteState = {
  result: WorkbenchWriteResult | null;
  status: "idle" | "saving" | "success" | "rejected" | "failed";
};

type ModuleEditorDraft = {
  covers: string;
  id: string;
  promiseIds: string;
  purposeEn: string;
  purposeZh: string;
  summaryEn: string;
  summaryZh: string;
  titleEn: string;
  titleZh: string;
};

type PromiseEditorDraft = {
  boundary: PromiseBoundary;
  failureMeaningEn: string;
  failureMeaningZh: string;
  feature: string;
  given: string;
  id: string;
  lifecycle: PromiseLifecycle;
  observes: string;
  priority: PromisePriority;
  purposeEn: string;
  purposeZh: string;
  review: HarnessPromise["review"];
  thenSteps: string;
  titleEn: string;
  titleZh: string;
  when: string;
};

const currentStudioProjectId = "current:test-harness";
const noStudioProjectId = "none";
const studioProjectsStorageKey = "harness-studio.projects";
const studioReviewerStorageKey = "harness-studio.reviewer";
const selectedStudioProjectStorageKey = "harness-studio.selected-project";
const projectMenuItemClass =
  "studio-project-menu-item flex h-7 w-full items-center gap-2 px-1.5 text-left text-xs text-popover-foreground outline-none";
const promisePriorityOptions: PromisePriority[] = ["P0", "P1", "P2"];
const promiseBoundaryOptions: PromiseBoundary[] = [
  "unit",
  "integration",
  "browser",
  "e2e",
  "adapter",
];
const promiseLifecycleOptions: PromiseLifecycle[] = [
  "proposed",
  "accepted",
  "implemented",
  "changed_requires_review",
  "deprecated",
];

const studioGraphLayout = {
  activeModuleX: 0,
  architectureLayerXStep: 320,
  architectureLayerYStart: 150,
  architectureLayerYStep: 150,
  edgeLabelPadding: [6, 3] as [number, number],
  edgeLabelSize: 11,
  edgeLabelWeight: 500,
  edgePrimaryStrokeWidth: 1.5,
  edgeOverviewStrokeOpacity: 0.42,
  edgeOverviewStrokeWidth: 1,
  edgeRelatedStrokeOpacity: 0.66,
  edgeRelatedStrokeWidth: 1.15,
  fitViewPadding: 0.14,
  focusZoom: 1,
  layerGap: 84,
  layerNodeX: -38,
  layerNodeYOffset: -54,
  maxZoom: 1.4,
  minZoom: 0.25,
  promiseX: 420,
  promiseYStart: 190,
  promiseYStep: 132,
} as const;

const studioNodeHandles = {
  sourceBottom: "source-bottom",
  sourceRight: "source-right",
  sourceTop: "source-top",
  targetBottom: "target-bottom",
  targetLeft: "target-left",
  targetTop: "target-top",
} as const;

const architectureLayerByModuleId: Record<string, number> = {
  protocol: 0,
  "promise-schema": 0,
  "results-schema": 0,
  "promise-registry": 1,
  "module-registry": 1,
  validation: 1,
  cli: 2,
  "adapter-runtime": 2,
  "rust-adapter": 2,
  "vitest-adapter": 2,
  report: 3,
  "web-dashboard": 3,
  "todo-backend-api-contract": 0,
  "todo-backend-typescript-hono": 1,
  "todo-backend-rust-axum": 1,
  "todo-backend-client": 2,
  "todo-backend-showcase": 3,
};

function ProjectSwitcher({
  knownProjects,
  onProjectChange,
  selectedProjectId,
}: {
  knownProjects: WorkbenchProject[];
  onProjectChange: (projectId: string) => void;
  selectedProjectId: string;
}) {
  const { locale, m } = useI18n();
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [projectPath, setProjectPath] = useState("");
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<WorkbenchProject[]>(() =>
    mergeStudioProjects([...knownProjects, ...readStoredStudioProjects()]),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(studioProjectsStorageKey, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    setProjects((current) => mergeStudioProjects([...knownProjects, ...current]));
  }, [knownProjects]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(selectedStudioProjectStorageKey, selectedProjectId);
  }, [selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId],
  );
  const selectedProjectName =
    selectedProjectId === noStudioProjectId
      ? m.studio_project_none({}, { locale })
      : (selectedProject?.name ?? "test-harness");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleProjects = useMemo(
    () =>
      normalizedQuery
        ? projects.filter((project) =>
            `${project.name} ${project.path}`.toLocaleLowerCase().includes(normalizedQuery),
          )
        : projects,
    [normalizedQuery, projects],
  );

  const selectProject = useCallback(
    (project: WorkbenchProject) => {
      setProjects((current) =>
        moveStudioProjectToFront(upsertStudioProject(current, project), project.id),
      );
      onProjectChange(project.id);
      setIsOpen(false);
    },
    [onProjectChange],
  );

  const selectNoProject = useCallback(() => {
    onProjectChange(noStudioProjectId);
    setIsOpen(false);
  }, [onProjectChange]);

  const openAddProject = useCallback(() => {
    setIsOpen(false);
    setIsAddProjectOpen(true);
  }, []);

  const addProject = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const path = projectPath.trim();
      if (!path) return;

      selectProject(createDirectoryStudioProject(path));
      setProjectPath("");
      setIsAddProjectOpen(false);
    },
    [projectPath, selectProject],
  );

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={m.studio_project_switcher({}, { locale })}
              className="studio-floating-control studio-project-trigger justify-start"
            />
          }
        >
          <RiFolderLine />
          <span className="truncate">{selectedProjectName}</span>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={4}
          className="studio-project-menu w-(--studio-project-menu-width) gap-2 border-border bg-popover p-2"
        >
          <div className="relative">
            <RiSearchLine className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={m.studio_project_search_placeholder({}, { locale })}
              className="studio-project-search h-8 pl-7 text-xs"
              placeholder={m.studio_project_search_placeholder({}, { locale })}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>

          <div
            className="space-y-0.5 border-b border-border pb-2"
            aria-label={m.studio_project_recent({}, { locale })}
          >
            {visibleProjects.length > 0 ? (
              visibleProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={projectMenuItemClass}
                  data-selected={project.id === selectedProjectId}
                  onClick={() => selectProject(project)}
                >
                  <RiFolderLine className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {project.id === selectedProjectId ? (
                    <RiCheckLine className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                </button>
              ))
            ) : (
              <div className="px-1.5 py-2 text-xs text-muted-foreground">
                {m.studio_project_no_results({}, { locale })}
              </div>
            )}
          </div>

          <div className="space-y-0.5">
            <button type="button" className={projectMenuItemClass} onClick={openAddProject}>
              <RiFolderAddLine className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {m.studio_project_add({}, { locale })}
              </span>
              <RiArrowRightSLine className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
            <button
              type="button"
              className={projectMenuItemClass}
              data-selected={selectedProjectId === noStudioProjectId}
              onClick={selectNoProject}
            >
              <RiCloseLine className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {m.studio_project_none({}, { locale })}
              </span>
              {selectedProjectId === noStudioProjectId ? (
                <RiCheckLine className="size-3.5 shrink-0 text-muted-foreground" />
              ) : null}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={isAddProjectOpen} onOpenChange={setIsAddProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.studio_project_add_title({}, { locale })}</DialogTitle>
            <DialogDescription>
              {m.studio_project_add_description({}, { locale })}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={addProject}>
            <div className="space-y-2">
              <Label htmlFor="studio-project-path">
                {m.studio_project_path_label({}, { locale })}
              </Label>
              <Input
                id="studio-project-path"
                value={projectPath}
                placeholder={m.studio_project_path_placeholder({}, { locale })}
                onChange={(event) => setProjectPath(event.currentTarget.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddProjectOpen(false)}>
                {m.action_cancel({}, { locale })}
              </Button>
              <Button type="submit" disabled={!projectPath.trim()}>
                {m.studio_project_add_submit({}, { locale })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function readStoredStudioProjects() {
  if (typeof window === "undefined") return fallbackWorkbenchProjects;

  const storedProjects = window.localStorage.getItem(studioProjectsStorageKey);
  if (!storedProjects) return fallbackWorkbenchProjects;

  try {
    const parsedProjects: unknown = JSON.parse(storedProjects);
    if (!Array.isArray(parsedProjects)) return fallbackWorkbenchProjects;
    return mergeStudioProjects(parsedProjects.filter(isStudioProject));
  } catch {
    return fallbackWorkbenchProjects;
  }
}

function readStoredSelectedProjectId(projects: WorkbenchProject[]) {
  if (typeof window === "undefined") return currentStudioProjectId;

  const storedProjectId = window.localStorage.getItem(selectedStudioProjectStorageKey);
  if (storedProjectId === noStudioProjectId) return noStudioProjectId;
  if (storedProjectId && projects.some((project) => project.id === storedProjectId)) {
    return storedProjectId;
  }

  return currentStudioProjectId;
}

function readStoredReviewerName() {
  if (typeof window === "undefined") return "local-reviewer";

  const storedReviewer = window.localStorage.getItem(studioReviewerStorageKey)?.trim();
  return storedReviewer || "local-reviewer";
}

function isStudioProject(value: unknown): value is WorkbenchProject {
  if (!value || typeof value !== "object") return false;

  const project = value as Record<string, unknown>;
  return (
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    typeof project.path === "string" &&
    (project.source === "current" || project.source === "directory" || project.source === "example")
  );
}

function createDirectoryStudioProject(directoryPath: string): WorkbenchProject {
  const path = directoryPath.trim().replaceAll(/\/+$/g, "") || "Selected project";
  const name = path.split("/").filter(Boolean).at(-1) ?? path;

  return {
    id: `directory:${path}`,
    name,
    path,
    source: "directory",
  };
}

function mergeStudioProjects(projects: WorkbenchProject[]) {
  const projectsById = new Map<string, WorkbenchProject>();
  for (const project of [...fallbackWorkbenchProjects, ...projects]) {
    projectsById.set(project.id, project);
  }
  return [...projectsById.values()];
}

function upsertStudioProject(projects: WorkbenchProject[], project: WorkbenchProject) {
  const mergedProjects = projects.filter((item) => item.id !== project.id);
  return [project, ...mergedProjects];
}

function moveStudioProjectToFront(projects: WorkbenchProject[], projectId: string) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return projects;
  return [project, ...projects.filter((item) => item.id !== projectId)];
}

function getStudioProjectName(projectId: string, knownProjects: WorkbenchProject[]) {
  const storedProject = mergeStudioProjects([...knownProjects, ...readStoredStudioProjects()]).find(
    (project) => project.id === projectId,
  );
  if (storedProject) return storedProject.name;
  if (projectId === noStudioProjectId) return "";
  return projectId.replace(/^directory:/, "").replaceAll("-", " ") || "test-harness";
}

function StudioBreadcrumbs({
  module,
  onModuleClick,
  onProjectClick,
  projectName,
  promise,
}: {
  module: HarnessModule | null;
  onModuleClick: () => void;
  onProjectClick: () => void;
  projectName: string;
  promise: HarnessPromise | null;
}) {
  const { locale } = useI18n();

  return (
    <Breadcrumb className="studio-breadcrumb min-w-0">
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        <BreadcrumbItem className="min-w-0">
          {module || promise ? (
            <BreadcrumbLink
              render={
                <button
                  type="button"
                  className="max-w-(--studio-breadcrumb-item-max-width) truncate"
                  onClick={onProjectClick}
                />
              }
            >
              {projectName}
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className="max-w-(--studio-breadcrumb-item-max-width) truncate">
              {projectName}
            </BreadcrumbPage>
          )}
        </BreadcrumbItem>

        {module ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              {promise ? (
                <BreadcrumbLink
                  render={
                    <button
                      type="button"
                      className="max-w-(--studio-breadcrumb-item-max-width) truncate"
                      onClick={onModuleClick}
                    />
                  }
                >
                  {localizeText(module.title, locale)}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="max-w-(--studio-breadcrumb-item-max-width) truncate">
                  {localizeText(module.title, locale)}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </>
        ) : null}

        {promise ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="max-w-(--studio-breadcrumb-item-max-width) truncate">
                {localizeText(promise.title, locale)}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function HarnessStudioPage({
  settingsOpenByDefault = false,
}: {
  settingsOpenByDefault?: boolean;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(() =>
    readStoredSelectedProjectId(readStoredStudioProjects()),
  );
  const queryClient = useQueryClient();
  const { data: knownProjects = fallbackWorkbenchProjects } = useQuery({
    queryKey: ["workbench-projects"],
    queryFn: getWorkbenchProjects,
  });
  const { data } = useQuery({
    queryKey: ["workbench-snapshot", selectedProjectId],
    queryFn: () => getWorkbenchSnapshotForProject(selectedProjectId),
  });
  const { data: daemonStatus } = useQuery({
    queryKey: ["daemon-connection-status"],
    queryFn: getDaemonConnectionStatus,
    refetchInterval: 8000,
  });
  const { locale, m } = useI18n();
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedPromiseId, setSelectedPromiseId] = useState<string | null>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(settingsOpenByDefault);
  const [hasReadQueryState, setHasReadQueryState] = useState(false);
  const [editingModule, setEditingModule] = useState<HarnessModule | null>(null);
  const [editingPromiseContext, setEditingPromiseContext] = useState<{
    module: HarnessModule;
    promise: HarnessPromise | null;
  } | null>(null);
  const [runState, setRunState] = useState<StudioRunState>({ result: null, status: "idle" });
  const [writeState, setWriteState] = useState<StudioWriteState>({ result: null, status: "idle" });
  const nodeTypes = useMemo(() => ({ studio: StudioGraphNode }), []);

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen((current) => !current);
      }
    };

    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

  useEffect(() => {
    if (!data || hasReadQueryState || typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    const promiseId = search.get("promise");
    const moduleId = search.get("module");
    const promise = promiseId ? data.promises.find((item) => item.id === promiseId) : undefined;
    const module = moduleId ? data.modules.find((item) => item.id === moduleId) : undefined;

    if (promise) {
      setSelectedModuleId(promise.moduleId);
      setSelectedPromiseId(promise.id);
      setIsPanelCollapsed(false);
    } else if (module) {
      setSelectedModuleId(module.id);
      setSelectedPromiseId(null);
      setIsPanelCollapsed(false);
    }

    setHasReadQueryState(true);
  }, [data, hasReadQueryState]);

  useEffect(() => {
    if (!hasReadQueryState || typeof window === "undefined") return;
    if (settingsOpenByDefault && isSettingsOpen) return;

    const search = new URLSearchParams();
    if (selectedPromiseId) {
      search.set("promise", selectedPromiseId);
    } else if (selectedModuleId) {
      search.set("module", selectedModuleId);
    }

    const searchText = search.toString();
    const nextUrl = searchText ? `/?${searchText}` : "/";
    window.history.replaceState(null, "", nextUrl);
  }, [
    hasReadQueryState,
    isSettingsOpen,
    selectedModuleId,
    selectedPromiseId,
    settingsOpenByDefault,
  ]);

  const selectedPromise =
    data?.promises.find((promise) => promise.id === selectedPromiseId) ?? null;
  const selectedModule =
    (selectedPromise
      ? data?.modules.find((module) => module.id === selectedPromise.moduleId)
      : data?.modules.find((module) => module.id === selectedModuleId)) ?? null;
  const selectedProjectName =
    selectedProjectId === noStudioProjectId
      ? m.studio_project_none({}, { locale })
      : getStudioProjectName(selectedProjectId, knownProjects);

  const { edges, nodes } = useMemo(
    () =>
      data
        ? buildStudioGraph(data, selectedModule?.id ?? null, selectedPromise?.id ?? null, locale, m)
        : { edges: [], nodes: [] },
    [data, locale, m, selectedModule?.id, selectedPromise?.id],
  );
  const searchResults = useMemo(
    () => (data ? buildStudioSearchResults(data, locale, m) : []),
    [data, locale, m],
  );

  const flowRef = useRef<ReactFlowInstance<StudioNode, Edge> | null>(null);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const lastCenteredRef = useRef<string | null>(null);
  const hasFitInitialRef = useRef(false);

  // Switching projects starts with a fresh initial fit.
  useEffect(() => {
    hasFitInitialRef.current = false;
  }, [selectedProjectId]);

  // Fit the overview once, then smoothly pan the selected node into the visible area (the region
  // left of the context panel) — instead of remounting/refitting the whole canvas, which jumps.
  useEffect(() => {
    const instance = flowRef.current;
    const surface = surfaceRef.current;
    if (!instance || !surface || nodes.length === 0) return;

    if (!hasFitInitialRef.current) {
      hasFitInitialRef.current = true;
      lastCenteredRef.current = null;
      void instance.fitView({ padding: studioGraphLayout.fitViewPadding });
      return;
    }

    const targetId = selectedPromiseId
      ? `promise:${selectedPromiseId}`
      : selectedModuleId
        ? `module:${selectedModuleId}`
        : null;
    if (targetId === lastCenteredRef.current) return;

    if (!targetId) {
      lastCenteredRef.current = null;
      void instance.fitView({ padding: studioGraphLayout.fitViewPadding, duration: 420 });
      return;
    }

    const node = nodes.find((item) => item.id === targetId);
    if (!node) return;
    lastCenteredRef.current = targetId;

    const rect = surface.getBoundingClientRect();
    const panel = surface.querySelector<HTMLElement>(".studio-context-panel");
    const panelWidth = panel ? panel.getBoundingClientRect().width : 0;
    // Bump to a readable zoom when coming from the zoomed-out overview, but never zoom out if the
    // user is already closer.
    const zoom = Math.min(
      Math.max(instance.getViewport().zoom, studioGraphLayout.focusZoom),
      studioGraphLayout.maxZoom,
    );
    // Half a studio node (--studio-node-width is 16.5rem ≈ 264px) to reach its center.
    const nodeCenterX = node.position.x + 132;
    const nodeCenterY = node.position.y + 52;
    void instance.setViewport(
      {
        x: (rect.width - panelWidth) / 2 - nodeCenterX * zoom,
        y: rect.height / 2 - nodeCenterY * zoom,
        zoom,
      },
      { duration: 420 },
    );
  }, [nodes, selectedPromiseId, selectedModuleId]);
  const reviewInbox = useMemo(
    () => (data ? buildReviewInbox(data.promises, locale) : []),
    [data, locale],
  );

  const selectModule = useCallback((moduleId: string) => {
    setSelectedModuleId(moduleId);
    setSelectedPromiseId(null);
    setIsPanelCollapsed(false);
  }, []);

  const selectProjectRoot = useCallback(() => {
    setSelectedModuleId(null);
    setSelectedPromiseId(null);
    setIsPanelCollapsed(true);
  }, []);

  const selectPromise = useCallback(
    (promiseId: string) => {
      const promise = data?.promises.find((item) => item.id === promiseId);
      if (!promise) return;
      setSelectedModuleId(promise.moduleId);
      setSelectedPromiseId(promise.id);
      setIsPanelCollapsed(false);
    },
    [data],
  );

  const selectInboxPromise = useCallback(
    (promiseId: string) => {
      selectPromise(promiseId);
    },
    [selectPromise],
  );

  // Ordered list to step through while reviewing: the review inbox if the selected promise is in
  // it, otherwise the selected promise's module.
  const promiseNavList = useMemo(() => {
    if (!selectedPromiseId || !data) return [];
    if (reviewInbox.some((promise) => promise.id === selectedPromiseId)) return reviewInbox;
    const moduleId = data.promises.find((promise) => promise.id === selectedPromiseId)?.moduleId;
    if (!moduleId) return [];
    return sortPromisesForReview(
      data.promises.filter((promise) => promise.moduleId === moduleId),
      locale,
    );
  }, [selectedPromiseId, data, reviewInbox, locale]);
  const promiseNavIndex = promiseNavList.findIndex((promise) => promise.id === selectedPromiseId);
  const navigatePromise = useCallback(
    (direction: -1 | 1) => {
      const index = promiseNavList.findIndex((promise) => promise.id === selectedPromiseId);
      if (index < 0) return;
      const next = promiseNavList[index + direction];
      if (next) selectPromise(next.id);
    },
    [promiseNavList, selectedPromiseId, selectPromise],
  );
  useEffect(() => {
    if (!selectedPromiseId) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      navigatePromise(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedPromiseId, navigatePromise]);

  const selectSearchResult = useCallback(
    (result: StudioSearchResult) => {
      if (result.kind === "promise" && result.promiseId) {
        selectPromise(result.promiseId);
      } else {
        selectModule(result.moduleId);
      }
      setIsSearchOpen(false);
    },
    [selectModule, selectPromise],
  );

  const changeProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedModuleId(null);
    setSelectedPromiseId(null);
    setIsPanelCollapsed(true);
    setRunState({ result: null, status: "idle" });
    setWriteState({ result: null, status: "idle" });
  }, []);

  const runTests = useCallback(async () => {
    setRunState((current) => ({ ...current, status: "running" }));
    const result = await runWorkbenchTests(selectedProjectId);
    if (!result) {
      setRunState({ result: null, status: "failed" });
      return;
    }

    setRunState({
      result,
      status: result.exitCode === 0 ? "success" : "failed",
    });
    await queryClient.invalidateQueries({ queryKey: ["workbench-snapshot", selectedProjectId] });
  }, [queryClient, selectedProjectId]);

  const openFile = useCallback(
    (file: string) => {
      void openWorkbenchFile(selectedProjectId, file).then((opened) => {
        if (!opened) console.warn(`Harness Studio could not open "${file}".`);
      });
    },
    [selectedProjectId],
  );

  const saveModule = useCallback(
    async (module: WorkbenchModuleRecord) => {
      setWriteState((current) => ({ ...current, status: "saving" }));
      const result = await saveWorkbenchModule(selectedProjectId, module);
      if (!result) {
        setWriteState({ result: null, status: "failed" });
        return false;
      }

      const status = result.saved ? "success" : "rejected";
      setWriteState({ result, status });
      if (result.saved) {
        await queryClient.invalidateQueries({
          queryKey: ["workbench-snapshot", selectedProjectId],
        });
      }
      return result.saved;
    },
    [queryClient, selectedProjectId],
  );

  const savePromise = useCallback(
    async (moduleId: string, promise: WorkbenchPromiseRecord) => {
      setWriteState((current) => ({ ...current, status: "saving" }));
      const result = await saveWorkbenchPromise(selectedProjectId, moduleId, promise);
      if (!result) {
        setWriteState({ result: null, status: "failed" });
        return false;
      }

      const status = result.saved ? "success" : "rejected";
      setWriteState({ result, status });
      if (result.saved) {
        await queryClient.invalidateQueries({
          queryKey: ["workbench-snapshot", selectedProjectId],
        });
      }
      return result.saved;
    },
    [queryClient, selectedProjectId],
  );

  const savePromiseReview = useCallback(
    async (promiseId: string, action: WorkbenchReviewAction, note: string) => {
      setWriteState((current) => ({ ...current, status: "saving" }));
      const result = await saveWorkbenchPromiseReview({
        action,
        note: note.trim() || undefined,
        projectId: selectedProjectId,
        promiseId,
        reviewer: readStoredReviewerName(),
      });
      if (!result) {
        setWriteState({ result: null, status: "failed" });
        return false;
      }

      const status = result.saved ? "success" : "rejected";
      setWriteState({ result, status });
      if (result.saved) {
        await queryClient.invalidateQueries({
          queryKey: ["workbench-snapshot", selectedProjectId],
        });
      }
      return result.saved;
    },
    [queryClient, selectedProjectId],
  );

  return (
    <div className="studio-canvas-frame relative h-full min-h-0 overflow-hidden">
      <section
        ref={surfaceRef}
        className="studio-flow-surface relative h-full min-h-0 overflow-hidden"
      >
        <ReactFlow
          className="studio-flow-layer"
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          minZoom={studioGraphLayout.minZoom}
          maxZoom={studioGraphLayout.maxZoom}
          nodesDraggable={false}
          onNodeClick={(_, node) => {
            const [kind, id] = node.id.split(":");
            if (kind === "module") selectModule(id);
            if (kind === "promise") selectPromise(id);
          }}
          onPaneClick={() => {
            setSelectedModuleId(null);
            setSelectedPromiseId(null);
            setIsPanelCollapsed(true);
          }}
        >
          <Panel position="top-left" className="studio-flow-header-panel">
            <div className="studio-top-bar">
              <div className="studio-top-left">
                <ProjectSwitcher
                  knownProjects={knownProjects}
                  onProjectChange={changeProject}
                  selectedProjectId={selectedProjectId}
                />
                <StudioBreadcrumbs
                  module={selectedModule}
                  onModuleClick={() => {
                    if (selectedModule) selectModule(selectedModule.id);
                  }}
                  onProjectClick={selectProjectRoot}
                  projectName={selectedProjectName}
                  promise={selectedPromise}
                />
              </div>

              <div className="studio-top-search">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={m.studio_search_trigger({}, { locale })}
                        className="studio-floating-control studio-search-trigger"
                        onClick={() => setIsSearchOpen(true)}
                      />
                    }
                  >
                    <RiSearchLine />
                    <span className="hidden sm:inline">
                      {m.studio_search_trigger({}, { locale })}
                    </span>
                    <KbdGroup className="hidden opacity-70 sm:inline-flex">
                      <Kbd>⌘</Kbd>
                      <Kbd>K</Kbd>
                    </KbdGroup>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {m.studio_search_title({}, { locale })}
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="studio-top-stats">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size="sm"
                        variant={isInboxOpen ? "default" : "outline"}
                        aria-label={m.nav_inbox({}, { locale })}
                        className="studio-floating-control studio-metrics-control"
                        onClick={() => setIsInboxOpen((current) => !current)}
                      />
                    }
                  >
                    <span className="studio-metric">
                      <RiStackLine className="studio-metric-icon" />
                      {data?.project.moduleCount ?? 0}
                    </span>
                    <span className="studio-metric">
                      <RiShieldCheckLine className="studio-metric-icon" />
                      {data?.project.promiseCount ?? 0}
                    </span>
                    <span className="studio-metric">
                      {reviewInbox.length > 0 ? <span className="studio-metric-dot" /> : null}
                      <RiInboxLine className="studio-metric-icon" />
                      {reviewInbox.length}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {m.metric_total_modules({}, { locale })} ·{" "}
                    {m.metric_total_promises(
                      {},
                      {
                        locale,
                      },
                    )}{" "}
                    · {m.nav_inbox({}, { locale })}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        aria-label={m.nav_settings({}, { locale })}
                        className="studio-floating-control"
                        onClick={() => setIsSettingsOpen(true)}
                      />
                    }
                  >
                    <RiSettings3Line />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{m.nav_settings({}, { locale })}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </Panel>

          {data?.source && data.source !== "daemon" ? (
            <Panel position="bottom-right" className="studio-source-toast">
              <span className="studio-source-toast-dot" />
              {snapshotSourceLabel(data.source, m, locale)}
            </Panel>
          ) : null}

          {isInboxOpen && data ? (
            <ReviewInboxPanel
              promises={reviewInbox}
              selectedPromiseId={selectedPromise?.id ?? null}
              snapshot={data}
              onClose={() => setIsInboxOpen(false)}
              onSelectPromise={selectInboxPromise}
            />
          ) : null}

          <Controls showInteractive={false} />
          {isPanelCollapsed ? (
            <Panel position="top-right" className="studio-panel-expand-panel">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      aria-label={m.action_expand_panel({}, { locale })}
                      className="studio-floating-control"
                      onClick={() => setIsPanelCollapsed(false)}
                    />
                  }
                >
                  <RiSidebarUnfoldLine />
                </TooltipTrigger>
                <TooltipContent side="left">{m.action_expand_panel({}, { locale })}</TooltipContent>
              </Tooltip>
            </Panel>
          ) : (
            <ContextPanel
              canOpenFiles={data?.source === "daemon"}
              canRunTests={data?.source === "daemon"}
              canWrite={data?.source === "daemon"}
              isRunningTests={runState.status === "running"}
              isSaving={writeState.status === "saving"}
              module={selectedModule}
              onCollapse={() => setIsPanelCollapsed(true)}
              onCreatePromise={(module) => setEditingPromiseContext({ module, promise: null })}
              onEditModule={setEditingModule}
              onNavigatePromise={navigatePromise}
              onOpenFile={openFile}
              onReviewPromise={savePromiseReview}
              onRunTests={runTests}
              promise={selectedPromise}
              promiseIndex={promiseNavIndex}
              promiseTotal={promiseNavList.length}
              runState={runState}
              snapshot={data ?? null}
              writeState={writeState}
            />
          )}
        </ReactFlow>

        {data?.source && data.source !== "daemon" ? (
          <div className="studio-connect-overlay">
            <div className="studio-connect-card">
              <h2 className="studio-connect-title">{m.studio_connect_title({}, { locale })}</h2>
              <p className="studio-connect-body">
                {daemonStatus?.state === "disconnected"
                  ? m.studio_connect_body_disconnected({}, { locale })
                  : m.studio_connect_body_pairing({}, { locale })}
              </p>
              <Button type="button" size="sm" onClick={() => setIsSettingsOpen(true)}>
                {m.studio_connect_action({}, { locale })}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{m.settings_title({}, { locale })}</DialogTitle>
            <DialogDescription>{m.settings_description({}, { locale })}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-(--studio-settings-scroll-height)">
            <SettingsPanel />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <StudioSearchDialog
        isOpen={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        onSelectResult={selectSearchResult}
        results={searchResults}
      />

      <ModuleEditorDialog
        isOpen={Boolean(editingModule)}
        module={editingModule}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingModule(null);
        }}
        onSave={saveModule}
      />

      <PromiseEditorDialog
        context={editingPromiseContext}
        isOpen={Boolean(editingPromiseContext)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingPromiseContext(null);
        }}
        onSave={savePromise}
      />
    </div>
  );
}

function snapshotSourceLabel(source: SnapshotSource, m: MessageModule, locale: AppLocale) {
  if (source === "daemon") return m.studio_source_daemon({}, { locale });
  if (source === "static") return m.studio_source_static({}, { locale });
  return m.studio_source_empty({}, { locale });
}

function StudioSearchDialog({
  isOpen,
  onOpenChange,
  onSelectResult,
  results,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSelectResult: (result: StudioSearchResult) => void;
  results: StudioSearchResult[];
}) {
  const { locale, m } = useI18n();
  const moduleResults = results.filter((result) => result.kind === "module");
  const promiseResults = results.filter((result) => result.kind === "promise");

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title={m.studio_search_title({}, { locale })}
      description={m.studio_search_description({}, { locale })}
    >
      <Command>
        <CommandInput placeholder={m.search_placeholder({}, { locale })} />
        <CommandList>
          <CommandEmpty>{m.studio_search_empty({}, { locale })}</CommandEmpty>
          <CommandGroup heading={m.studio_search_modules({}, { locale })}>
            {moduleResults.map((result) => (
              <StudioSearchItem key={result.id} result={result} onSelectResult={onSelectResult} />
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading={m.studio_search_promises({}, { locale })}>
            {promiseResults.map((result) => (
              <StudioSearchItem key={result.id} result={result} onSelectResult={onSelectResult} />
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function StudioSearchItem({
  onSelectResult,
  result,
}: {
  onSelectResult: (result: StudioSearchResult) => void;
  result: StudioSearchResult;
}) {
  return (
    <CommandItem value={result.searchText} onSelect={() => onSelectResult(result)}>
      <div className="min-w-0 flex-1">
        <div className="truncate">{result.title}</div>
        <div className="mt-0.5 truncate text-muted-foreground">{result.subtitle}</div>
      </div>
      <CommandShortcut>{result.trailing ?? result.priority}</CommandShortcut>
    </CommandItem>
  );
}

function ModuleEditorDialog({
  isOpen,
  module,
  onOpenChange,
  onSave,
}: {
  isOpen: boolean;
  module: HarnessModule | null;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (module: WorkbenchModuleRecord) => Promise<boolean>;
}) {
  const { locale, m } = useI18n();
  const [draft, setDraft] = useState<ModuleEditorDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!module || !isOpen) return;
    setDraft(moduleToEditorDraft(module));
  }, [isOpen, module]);

  const updateDraft = useCallback((key: keyof ModuleEditorDraft, value: string) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const submitModule = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!draft) return;

      setIsSaving(true);
      try {
        const saved = await onSave(moduleDraftToRecord(draft));
        if (saved) onOpenChange(false);
      } finally {
        setIsSaving(false);
      }
    },
    [draft, onOpenChange, onSave],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.studio_authoring_edit_module({}, { locale })}</DialogTitle>
          <DialogDescription>
            {m.studio_authoring_dialog_description({}, { locale })}
          </DialogDescription>
        </DialogHeader>
        {draft ? (
          <form className="space-y-(--studio-panel-gap)" onSubmit={submitModule}>
            <div className="grid gap-(--studio-panel-gap-sm) sm:grid-cols-2">
              <TextField
                label={m.studio_authoring_id({}, { locale })}
                value={draft.id}
                disabled
                onChange={(value) => updateDraft("id", value)}
              />
              <TextField
                label={m.studio_authoring_title_en({}, { locale })}
                value={draft.titleEn}
                onChange={(value) => updateDraft("titleEn", value)}
              />
              <TextField
                label={m.studio_authoring_title_zh({}, { locale })}
                value={draft.titleZh}
                onChange={(value) => updateDraft("titleZh", value)}
              />
              <TextField
                label={m.studio_authoring_summary_en({}, { locale })}
                value={draft.summaryEn}
                onChange={(value) => updateDraft("summaryEn", value)}
              />
              <TextField
                label={m.studio_authoring_summary_zh({}, { locale })}
                value={draft.summaryZh}
                onChange={(value) => updateDraft("summaryZh", value)}
              />
            </div>
            <TextAreaField
              label={m.studio_authoring_purpose_en({}, { locale })}
              value={draft.purposeEn}
              onChange={(value) => updateDraft("purposeEn", value)}
            />
            <TextAreaField
              label={m.studio_authoring_purpose_zh({}, { locale })}
              value={draft.purposeZh}
              onChange={(value) => updateDraft("purposeZh", value)}
            />
            <TextAreaField
              label={m.studio_authoring_promise_ids({}, { locale })}
              value={draft.promiseIds}
              onChange={(value) => updateDraft("promiseIds", value)}
            />
            <TextAreaField
              label={m.studio_authoring_covers({}, { locale })}
              value={draft.covers}
              onChange={(value) => updateDraft("covers", value)}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {m.action_cancel({}, { locale })}
              </Button>
              <Button type="submit" disabled={isSaving || !draft.titleEn.trim()}>
                {isSaving
                  ? m.studio_authoring_saving({}, { locale })
                  : m.studio_authoring_save({}, { locale })}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PromiseEditorDialog({
  context,
  isOpen,
  onOpenChange,
  onSave,
}: {
  context: { module: HarnessModule; promise: HarnessPromise | null } | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (moduleId: string, promise: WorkbenchPromiseRecord) => Promise<boolean>;
}) {
  const { locale, m } = useI18n();
  const [draft, setDraft] = useState<PromiseEditorDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!context || !isOpen) return;
    setDraft(promiseToEditorDraft(context.module, context.promise));
  }, [context, isOpen]);

  const updateDraft = useCallback((key: keyof PromiseEditorDraft, value: string) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const submitPromise = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!context || !draft) return;

      setIsSaving(true);
      try {
        const saved = await onSave(context.module.id, promiseDraftToRecord(draft));
        if (saved) onOpenChange(false);
      } finally {
        setIsSaving(false);
      }
    },
    [context, draft, onOpenChange, onSave],
  );

  const title = context?.promise
    ? m.studio_authoring_edit_promise({}, { locale })
    : m.studio_authoring_new_promise({}, { locale });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {m.studio_authoring_dialog_description({}, { locale })}
          </DialogDescription>
        </DialogHeader>
        {draft ? (
          <form className="space-y-(--studio-panel-gap)" onSubmit={submitPromise}>
            <div className="grid gap-(--studio-panel-gap-sm) sm:grid-cols-2">
              <TextField
                label={m.studio_authoring_id({}, { locale })}
                value={draft.id}
                disabled={Boolean(context?.promise)}
                onChange={(value) => updateDraft("id", value)}
              />
              <TextField
                label={m.studio_authoring_feature({}, { locale })}
                value={draft.feature}
                onChange={(value) => updateDraft("feature", value)}
              />
              <TextField
                label={m.studio_authoring_title_en({}, { locale })}
                value={draft.titleEn}
                onChange={(value) => updateDraft("titleEn", value)}
              />
              <TextField
                label={m.studio_authoring_title_zh({}, { locale })}
                value={draft.titleZh}
                onChange={(value) => updateDraft("titleZh", value)}
              />
              <SelectField
                label={m.studio_authoring_priority({}, { locale })}
                value={draft.priority}
                options={promisePriorityOptions}
                onChange={(value) => updateDraft("priority", value)}
              />
              <SelectField
                label={m.studio_authoring_boundary({}, { locale })}
                value={draft.boundary}
                options={promiseBoundaryOptions}
                onChange={(value) => updateDraft("boundary", value)}
              />
              <SelectField
                label={m.studio_authoring_lifecycle({}, { locale })}
                value={draft.lifecycle}
                options={promiseLifecycleOptions}
                onChange={(value) => updateDraft("lifecycle", value)}
              />
            </div>
            <TextAreaField
              label={m.studio_authoring_purpose_en({}, { locale })}
              value={draft.purposeEn}
              onChange={(value) => updateDraft("purposeEn", value)}
            />
            <TextAreaField
              label={m.studio_authoring_purpose_zh({}, { locale })}
              value={draft.purposeZh}
              onChange={(value) => updateDraft("purposeZh", value)}
            />
            <div className="grid gap-(--studio-panel-gap-sm) sm:grid-cols-3">
              <TextAreaField
                label={m.promise_detail_given({}, { locale })}
                value={draft.given}
                onChange={(value) => updateDraft("given", value)}
              />
              <TextAreaField
                label={m.promise_detail_when({}, { locale })}
                value={draft.when}
                onChange={(value) => updateDraft("when", value)}
              />
              <TextAreaField
                label={m.promise_detail_then({}, { locale })}
                value={draft.thenSteps}
                onChange={(value) => updateDraft("thenSteps", value)}
              />
            </div>
            <TextAreaField
              label={m.studio_authoring_observes({}, { locale })}
              value={draft.observes}
              onChange={(value) => updateDraft("observes", value)}
            />
            <TextAreaField
              label={m.studio_authoring_failure_en({}, { locale })}
              value={draft.failureMeaningEn}
              onChange={(value) => updateDraft("failureMeaningEn", value)}
            />
            <TextAreaField
              label={m.studio_authoring_failure_zh({}, { locale })}
              value={draft.failureMeaningZh}
              onChange={(value) => updateDraft("failureMeaningZh", value)}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {m.action_cancel({}, { locale })}
              </Button>
              <Button
                type="submit"
                disabled={
                  isSaving ||
                  !draft.id.trim() ||
                  !draft.titleEn.trim() ||
                  !draft.purposeEn.trim() ||
                  !draft.given.trim() ||
                  !draft.when.trim() ||
                  !draft.thenSteps.trim() ||
                  !draft.observes.trim()
                }
              >
                {isSaving
                  ? m.studio_authoring_saving({}, { locale })
                  : m.studio_authoring_save({}, { locale })}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = useStableFieldId();

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}

function TextAreaField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = useStableFieldId();

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: T[];
  value: T;
}) {
  const id = useStableFieldId();

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        className="w-full"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as T)}
      >
        {options.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {option}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function useStableFieldId() {
  return `field-${useId().replaceAll(":", "")}`;
}

function moduleToEditorDraft(module: HarnessModule): ModuleEditorDraft {
  return {
    covers: module.covers.join("\n"),
    id: module.id,
    promiseIds: module.promiseIds.join("\n"),
    purposeEn: localizedDraftValue(module.purpose, "en"),
    purposeZh: localizedDraftValue(module.purpose, "zh-CN"),
    summaryEn: localizedDraftValue(module.summary, "en"),
    summaryZh: localizedDraftValue(module.summary, "zh-CN"),
    titleEn: localizedDraftValue(module.title, "en"),
    titleZh: localizedDraftValue(module.title, "zh-CN"),
  };
}

function moduleDraftToRecord(draft: ModuleEditorDraft): WorkbenchModuleRecord {
  return {
    apiVersion: 1,
    covers: splitLines(draft.covers),
    id: draft.id.trim(),
    promises: splitLines(draft.promiseIds),
    purpose: localizedDraftText(draft.purposeEn, draft.purposeZh),
    summary: localizedDraftText(draft.summaryEn, draft.summaryZh),
    title: localizedDraftText(draft.titleEn, draft.titleZh),
  };
}

function promiseToEditorDraft(
  module: HarnessModule,
  promise: HarnessPromise | null,
): PromiseEditorDraft {
  if (!promise) {
    return {
      boundary: "browser",
      failureMeaningEn: "",
      failureMeaningZh: "",
      feature: localizeText(module.title, "en"),
      given: "",
      id: `harness.${module.id}.new_promise`,
      lifecycle: "proposed",
      observes: module.covers.join("\n"),
      priority: module.priority === "none" ? "P1" : module.priority,
      purposeEn: "",
      purposeZh: "",
      review: { state: "pending", events: [] },
      thenSteps: "",
      titleEn: "",
      titleZh: "",
      when: "",
    };
  }

  return {
    boundary: promise.boundary,
    failureMeaningEn: localizedDraftValue(promise.failureMeaning, "en"),
    failureMeaningZh: localizedDraftValue(promise.failureMeaning, "zh-CN"),
    feature: promise.feature,
    given: localizedDraftLines(promise.given),
    id: promise.id,
    lifecycle: promise.lifecycle,
    observes: promise.observes.join("\n"),
    priority: promise.priority,
    purposeEn: localizedDraftValue(promise.purpose, "en"),
    purposeZh: localizedDraftValue(promise.purpose, "zh-CN"),
    review: promise.review,
    thenSteps: localizedDraftLines(promise.then),
    titleEn: localizedDraftValue(promise.title, "en"),
    titleZh: localizedDraftValue(promise.title, "zh-CN"),
    when: localizedDraftLines(promise.when),
  };
}

function promiseDraftToRecord(draft: PromiseEditorDraft): WorkbenchPromiseRecord {
  return {
    boundary: draft.boundary,
    failureMeaning: localizedDraftText(draft.failureMeaningEn, draft.failureMeaningZh),
    feature: draft.feature.trim(),
    given: splitLines(draft.given),
    id: draft.id.trim(),
    lifecycle: draft.lifecycle,
    observes: splitLines(draft.observes),
    priority: draft.priority,
    purpose: localizedDraftText(draft.purposeEn, draft.purposeZh),
    review: draft.review,
    ["then"]: splitLines(draft.thenSteps),
    title: localizedDraftText(draft.titleEn, draft.titleZh),
    when: splitLines(draft.when),
  };
}

function localizedDraftValue(value: LocalizedText, language: "en" | "zh-CN") {
  if (typeof value === "string") return value;
  return value[language] ?? value.en ?? value["zh-CN"] ?? "";
}

function localizedDraftText(en: string, zhCn: string): LocalizedText {
  const fallback = en.trim() || zhCn.trim();
  return {
    en: en.trim() || fallback,
    "zh-CN": zhCn.trim() || fallback,
  };
}

function localizedDraftLines(values: LocalizedText[]) {
  return values.map((value) => localizedDraftValue(value, "en")).join("\n");
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ReviewInboxPanel({
  onClose,
  onSelectPromise,
  promises,
  selectedPromiseId,
  snapshot,
}: {
  onClose: () => void;
  onSelectPromise: (promiseId: string) => void;
  promises: HarnessPromise[];
  selectedPromiseId: string | null;
  snapshot: HarnessSnapshot;
}) {
  const { locale, m } = useI18n();
  const [filter, setFilter] = useState<"changed" | "pending">("pending");
  const modulesById = useMemo(
    () => new Map(snapshot.modules.map((module) => [module.id, module])),
    [snapshot.modules],
  );
  // `promises` is the review inbox (everything needing attention); partition it so the two tab
  // counts always sum to the inbox badge and changes-requested items remain visible.
  const isChanged = (promise: HarnessPromise) =>
    promise.lifecycle === "changed_requires_review" || promise.review.state === "changes_requested";
  const changedPromises = promises.filter(isChanged);
  const pendingPromises = promises.filter((promise) => !isChanged(promise));
  const filteredPromises = filter === "changed" ? changedPromises : pendingPromises;
  const canScroll = filteredPromises.length > 5;

  return (
    <Panel position="top-left" className="studio-review-inbox-panel">
      <div className="studio-review-inbox">
        <div className="flex items-center justify-between gap-(--studio-panel-gap-sm)">
          <h2 className="text-base font-medium">{m.review_title({}, { locale })}</h2>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={m.sidebar_close({}, { locale })}
            className="studio-panel-icon-control"
            onClick={onClose}
          >
            <RiCloseLine />
          </Button>
        </div>

        <div className="mt-(--studio-panel-gap) flex gap-(--studio-panel-gap-sm)">
          <Button
            type="button"
            size="sm"
            variant={filter === "pending" ? "default" : "outline"}
            onClick={() => setFilter("pending")}
          >
            {m.filter_pending_review({}, { locale })} {pendingPromises.length}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filter === "changed" ? "default" : "outline"}
            onClick={() => setFilter("changed")}
          >
            {m.studio_review_filter_changed({}, { locale })} {changedPromises.length}
          </Button>
        </div>

        <div className="studio-review-inbox-list mt-(--studio-panel-gap) overflow-hidden border border-border">
          <ScrollArea className="studio-review-inbox-scroll" data-scrollable={canScroll}>
            <div className="divide-y divide-border">
              {filteredPromises.length > 0 ? (
                filteredPromises.map((promise) => {
                  const module = modulesById.get(promise.moduleId);
                  const isSelected = promise.id === selectedPromiseId;
                  return (
                    <button
                      key={promise.id}
                      type="button"
                      className="studio-review-inbox-item w-full text-left"
                      data-selected={isSelected}
                      onClick={() => onSelectPromise(promise.id)}
                    >
                      <div className="flex items-start gap-(--studio-panel-gap-sm)">
                        <PriorityTag priority={promise.priority} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-(--studio-panel-gap-sm)">
                            <div className="line-clamp-2 text-sm font-medium">
                              {localizeText(promise.title, locale)}
                            </div>
                          </div>
                          <div className="mt-(--studio-panel-gap-xs) truncate text-xs text-muted-foreground">
                            {module ? localizeText(module.title, locale) : promise.moduleId}
                          </div>
                          <div className="mt-(--studio-panel-gap-xs) text-xs text-muted-foreground">
                            {reviewInboxReason(promise, m, locale)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-(--studio-panel-padding) text-sm text-muted-foreground">
                  {m.studio_review_inbox_empty({}, { locale })}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </Panel>
  );
}

function ContextPanel({
  canOpenFiles,
  canRunTests,
  canWrite,
  isRunningTests,
  isSaving,
  module,
  onCollapse,
  onCreatePromise,
  onEditModule,
  onNavigatePromise,
  onOpenFile,
  onReviewPromise,
  onRunTests,
  promise,
  promiseIndex,
  promiseTotal,
  runState,
  snapshot,
  writeState,
}: {
  canOpenFiles: boolean;
  canRunTests: boolean;
  canWrite: boolean;
  isRunningTests: boolean;
  isSaving: boolean;
  module: HarnessModule | null;
  onCollapse: () => void;
  onCreatePromise: (module: HarnessModule) => void;
  onEditModule: (module: HarnessModule) => void;
  onNavigatePromise: (direction: -1 | 1) => void;
  onOpenFile: (file: string) => void;
  onReviewPromise: (
    promiseId: string,
    action: WorkbenchReviewAction,
    note: string,
  ) => Promise<boolean>;
  onRunTests: () => void;
  promise: HarnessPromise | null;
  promiseIndex: number;
  promiseTotal: number;
  runState: StudioRunState;
  snapshot: HarnessSnapshot | null;
  writeState: StudioWriteState;
}) {
  const { locale, m } = useI18n();

  return (
    <Panel position="top-right" className="studio-context-panel min-w-0">
      <div className="flex h-full min-h-0 flex-col">
        <div className="studio-context-header flex shrink-0 items-center justify-between">
          <div className="flex min-w-0 items-center gap-(--studio-panel-gap-sm)">
            <RiSidebarUnfoldLine className="size-4 shrink-0 text-muted-foreground" />
            <div className="truncate text-sm font-medium">
              {promise
                ? m.studio_review_panel_title({}, { locale })
                : m.studio_context_panel({}, { locale })}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-(--studio-panel-gap-xs)">
            {promise && promiseTotal > 1 ? (
              <div className="flex items-center gap-(--studio-panel-gap-xs)">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={m.studio_review_prev({}, { locale })}
                  className="studio-panel-icon-control"
                  disabled={promiseIndex <= 0}
                  onClick={() => onNavigatePromise(-1)}
                >
                  <RiArrowLeftSLine />
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {promiseIndex + 1} / {promiseTotal}
                </span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={m.studio_review_next({}, { locale })}
                  className="studio-panel-icon-control"
                  disabled={promiseIndex >= promiseTotal - 1}
                  onClick={() => onNavigatePromise(1)}
                >
                  <RiArrowRightSLine />
                </Button>
              </div>
            ) : null}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={m.action_collapse_panel({}, { locale })}
                    className="studio-panel-icon-control"
                    onClick={onCollapse}
                  />
                }
              >
                {promise ? <RiCloseLine /> : <RiSidebarFoldLine />}
              </TooltipTrigger>
              <TooltipContent side="left">{m.action_collapse_panel({}, { locale })}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {promise && module && snapshot ? (
          <PromiseContext
            canOpenFiles={canOpenFiles}
            canWrite={canWrite}
            isSaving={isSaving}
            promise={promise}
            module={module}
            onOpenFile={onOpenFile}
            onReviewPromise={onReviewPromise}
            resultsGeneratedAt={snapshot.resultsGeneratedAt}
            snapshot={snapshot}
            writeState={writeState}
          />
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="studio-context-body">
              {module && snapshot ? (
                <ModuleContext
                  canWrite={canWrite}
                  isSaving={isSaving}
                  module={module}
                  onCreatePromise={onCreatePromise}
                  onEditModule={onEditModule}
                  snapshot={snapshot}
                />
              ) : snapshot ? (
                <StudioContext snapshot={snapshot} />
              ) : null}
              <WriteSummary writeState={writeState} />
              <RunSummary runState={runState} />
            </div>
          </ScrollArea>
        )}

        {!promise ? (
          <div className="border-t border-border p-(--studio-panel-padding)">
            <Button
              type="button"
              className="w-full"
              disabled={!canRunTests || isRunningTests}
              onClick={onRunTests}
            >
              {isRunningTests
                ? m.studio_run_running({}, { locale })
                : m.action_run_tests({}, { locale })}
            </Button>
            {!canRunTests ? (
              <p className="mt-(--studio-panel-gap-sm) text-xs text-muted-foreground">
                {m.studio_run_requires_daemon({}, { locale })}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function RunSummary({ runState }: { runState: StudioRunState }) {
  const { locale, m } = useI18n();
  if (runState.status === "idle" || runState.status === "running") return null;

  const title =
    runState.status === "success"
      ? m.studio_run_succeeded({}, { locale })
      : m.studio_run_failed({}, { locale });
  const output = [runState.result?.stdout, runState.result?.stderr]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");

  return (
    <section className="studio-context-card mt-(--studio-panel-gap) border border-border bg-card p-(--studio-panel-padding)">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-(--studio-panel-gap-xs) text-xs text-muted-foreground">
        {m.studio_run_exit_code({}, { locale })}: {runState.result?.exitCode ?? 1}
      </p>
      <pre className="mt-(--studio-panel-gap-sm) max-h-40 overflow-auto whitespace-pre-wrap border border-border bg-background p-(--studio-panel-gap-sm) font-mono text-xs">
        {output || m.studio_run_no_output({}, { locale })}
      </pre>
    </section>
  );
}

function WriteSummary({ writeState }: { writeState: StudioWriteState }) {
  const { locale, m } = useI18n();
  if (writeState.status === "idle" || writeState.status === "saving") return null;

  const title =
    writeState.status === "success"
      ? m.studio_authoring_save_succeeded({}, { locale })
      : writeState.status === "rejected"
        ? m.studio_authoring_save_rejected({}, { locale })
        : m.studio_authoring_save_failed({}, { locale });
  const output = [writeState.result?.stdout, writeState.result?.stderr]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");

  return (
    <section className="studio-context-card mt-(--studio-panel-gap) border border-border bg-card p-(--studio-panel-padding)">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-(--studio-panel-gap-xs) text-xs text-muted-foreground">
        {m.studio_run_exit_code({}, { locale })}: {writeState.result?.exitCode ?? 1}
      </p>
      <pre className="mt-(--studio-panel-gap-sm) max-h-40 overflow-auto whitespace-pre-wrap border border-border bg-background p-(--studio-panel-gap-sm) font-mono text-xs">
        {output || m.studio_run_no_output({}, { locale })}
      </pre>
    </section>
  );
}

function StudioContext({ snapshot }: { snapshot: HarnessSnapshot }) {
  const { locale, m } = useI18n();

  return (
    <div className="space-y-(--studio-panel-gap)">
      <section className="studio-context-card border bg-muted p-(--studio-panel-padding)">
        <h2 className="text-sm font-medium">{m.studio_context_empty_title({}, { locale })}</h2>
        <p className="mt-(--studio-panel-gap-sm) text-xs text-muted-foreground">
          {m.studio_context_empty_body({}, { locale })}
        </p>
      </section>
      <section>
        <h2 className="mb-(--studio-panel-gap-sm) text-xs text-muted-foreground">
          {m.studio_release_profile({}, { locale })}
        </h2>
        <div className="space-y-(--studio-panel-gap-sm) text-xs">
          <StatusRow
            label={m.studio_release_p0p1({}, { locale })}
            value={snapshot.project.errorCount}
          />
          <StatusRow
            label={m.studio_release_evidence({}, { locale })}
            value={snapshot.project.warningCount}
          />
        </div>
      </section>
    </div>
  );
}

function ModuleContext({
  canWrite,
  isSaving,
  module,
  onCreatePromise,
  onEditModule,
  snapshot,
}: {
  canWrite: boolean;
  isSaving: boolean;
  module: HarnessModule;
  onCreatePromise: (module: HarnessModule) => void;
  onEditModule: (module: HarnessModule) => void;
  snapshot: HarnessSnapshot;
}) {
  const { locale, m } = useI18n();
  const promises = snapshot.promises.filter((promise) => promise.moduleId === module.id);

  return (
    <div className="space-y-(--studio-panel-gap)">
      <section>
        <Badge variant="outline">{m.studio_architecture_boundary({}, { locale })}</Badge>
        <h2 className="mt-(--studio-panel-gap) text-base font-medium">
          {localizeText(module.title, locale)}
        </h2>
        <p className="mt-(--studio-panel-gap-sm) text-sm text-muted-foreground">
          {localizeText(module.summary, locale)}
        </p>
        <div className="mt-(--studio-panel-gap) flex flex-wrap gap-(--studio-panel-gap-sm)">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canWrite || isSaving}
            onClick={() => onEditModule(module)}
          >
            <RiPencilLine />
            {m.studio_authoring_edit_module({}, { locale })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canWrite || isSaving}
            onClick={() => onCreatePromise(module)}
          >
            {m.studio_authoring_new_promise({}, { locale })}
          </Button>
        </div>
        {!canWrite ? (
          <p className="mt-(--studio-panel-gap-sm) text-xs text-muted-foreground">
            {m.studio_authoring_requires_daemon({}, { locale })}
          </p>
        ) : null}
      </section>

      <InfoSection title={m.module_detail_why({}, { locale })}>
        <p>{localizeText(module.purpose, locale)}</p>
      </InfoSection>

      <InfoSection title={m.studio_owned_promises({}, { locale })}>
        <div className="space-y-(--studio-panel-gap-sm)">
          {promises.map((promise) => (
            <div key={promise.id} className="border-l border-border pl-(--studio-panel-gap-sm)">
              <div className="text-xs">{localizeText(promise.title, locale)}</div>
              <div className="mt-(--studio-panel-gap-xs) text-xs text-muted-foreground">
                {promise.priority}
              </div>
            </div>
          ))}
        </div>
      </InfoSection>

      <InfoSection title={m.module_detail_covers({}, { locale })}>
        <CodeList items={module.covers} />
      </InfoSection>
    </div>
  );
}

function PromiseContext({
  canOpenFiles,
  canWrite,
  isSaving,
  module,
  onOpenFile,
  onReviewPromise,
  promise,
  resultsGeneratedAt,
  snapshot,
  writeState,
}: {
  canOpenFiles: boolean;
  canWrite: boolean;
  isSaving: boolean;
  module: HarnessModule;
  onOpenFile: (file: string) => void;
  onReviewPromise: (
    promiseId: string,
    action: WorkbenchReviewAction,
    note: string,
  ) => Promise<boolean>;
  promise: HarnessPromise;
  resultsGeneratedAt?: string;
  snapshot: HarnessSnapshot;
  writeState: StudioWriteState;
}) {
  const { locale, m } = useI18n();
  const [reviewNote, setReviewNote] = useState("");
  const moduleNeighborhood = sortPromisesForReview(
    snapshot.promises.filter((item) => item.moduleId === module.id && item.id !== promise.id),
    locale,
  ).slice(0, 4);

  const submitReview = useCallback(
    async (action: WorkbenchReviewAction) => {
      const saved = await onReviewPromise(promise.id, action, reviewNote);
      if (saved) setReviewNote("");
    },
    [onReviewPromise, promise.id, reviewNote],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="studio-context-body space-y-(--studio-panel-gap)">
          <section className="studio-review-module-summary">
            <div className="flex items-start justify-between gap-(--studio-panel-gap)">
              <div className="min-w-0">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {m.graph_kind_module({}, { locale })}
                </h3>
                <p className="mt-(--studio-panel-gap-xs) truncate text-sm font-medium">
                  {localizeText(module.title, locale)}
                </p>
              </div>
              <PriorityTag priority={promise.priority} />
            </div>
          </section>

          <InfoSection title={m.promise_detail_purpose({}, { locale })}>
            <p>{localizeText(promise.purpose, locale)}</p>
          </InfoSection>

          <InfoSection title={m.studio_review_scenario({}, { locale })}>
            <div className="studio-review-scenario-table">
              <ScenarioBlock title={m.promise_detail_given({}, { locale })} items={promise.given} />
              <ScenarioBlock title={m.promise_detail_when({}, { locale })} items={promise.when} />
              <ScenarioBlock title={m.promise_detail_then({}, { locale })} items={promise.then} />
            </div>
          </InfoSection>

          <EvidenceSection
            canOpenFiles={canOpenFiles}
            evidence={promise.evidence}
            onOpenFile={onOpenFile}
            resultsGeneratedAt={resultsGeneratedAt}
            runStatus={promise.runStatus}
          />

          <InfoSection title={m.studio_review_observed_files({}, { locale })}>
            <FileList
              canOpenFiles={canOpenFiles}
              files={promise.observes}
              onOpenFile={onOpenFile}
            />
          </InfoSection>

          <ChangedFieldsPlaceholder />

          <InfoSection title={m.studio_review_neighborhood({}, { locale })}>
            {moduleNeighborhood.length > 0 ? (
              <div className="flex flex-wrap gap-(--studio-panel-gap-sm)">
                {moduleNeighborhood.map((item) => (
                  <Badge
                    key={item.id}
                    variant="outline"
                    className="studio-review-neighbor-pill max-w-full truncate"
                  >
                    <span className="truncate">{localizeText(item.title, locale)}</span>
                    <span className="text-muted-foreground">{item.priority}</span>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">
                {m.studio_review_no_neighbors({}, { locale })}
              </p>
            )}
          </InfoSection>

          <InfoSection title={m.studio_review_hints({}, { locale })}>
            <div className="space-y-(--studio-panel-gap-xs) text-muted-foreground">
              <p className="flex items-center gap-(--studio-panel-gap-sm)">
                <RiLightbulbLine className="size-4 shrink-0" />
                {m.studio_review_hint_clear({}, { locale })}
              </p>
              <p className="flex items-center gap-(--studio-panel-gap-sm)">
                <RiLightbulbLine className="size-4 shrink-0" />
                {m.studio_review_hint_observable({}, { locale })}
              </p>
            </div>
          </InfoSection>

          <WriteSummary writeState={writeState} />
        </div>
      </ScrollArea>

      <section className="studio-review-actions space-y-(--studio-panel-gap-sm)">
        <div className="grid grid-cols-3 gap-(--studio-panel-gap-sm)">
          <Button
            type="button"
            disabled={!canWrite || isSaving}
            onClick={() => submitReview("approved")}
          >
            {m.action_approve({}, { locale })}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canWrite || isSaving}
            onClick={() => submitReview("changes_requested")}
          >
            {m.action_request_changes({}, { locale })}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canWrite || isSaving}
            onClick={() => submitReview("rejected")}
          >
            {m.action_decline({}, { locale })}
          </Button>
        </div>
        <Label htmlFor="studio-review-note">{m.review_notes({}, { locale })}</Label>
        <Textarea
          id="studio-review-note"
          value={reviewNote}
          placeholder={m.review_notes_placeholder({}, { locale })}
          onChange={(event) => setReviewNote(event.currentTarget.value)}
        />
      </section>
    </div>
  );
}

function ScenarioBlock({ items, title }: { items: LocalizedText[]; title: string }) {
  const { locale } = useI18n();

  return (
    <div className="border-b border-border p-(--studio-panel-gap-sm) last:border-b-0">
      <div className="text-xs font-medium">{title}</div>
      <TextList items={localizeTexts(items, locale)} />
    </div>
  );
}

function ChangedFieldsPlaceholder() {
  const { locale, m } = useI18n();

  return (
    <InfoSection title={m.studio_review_changed_fields({}, { locale })}>
      <div className="studio-review-diff-table overflow-hidden border border-border">
        <div className="grid grid-cols-3 border-b border-border text-xs font-medium">
          <div className="p-(--studio-panel-gap-sm)">
            {m.studio_review_diff_field({}, { locale })}
          </div>
          <div className="border-l border-border p-(--studio-panel-gap-sm)">
            {m.studio_review_diff_old({}, { locale })}
          </div>
          <div className="border-l border-border p-(--studio-panel-gap-sm)">
            {m.studio_review_diff_new({}, { locale })}
          </div>
        </div>
        <div className="p-(--studio-panel-gap-sm) text-xs text-muted-foreground">
          {m.studio_review_no_baseline({}, { locale })}
        </div>
      </div>
    </InfoSection>
  );
}

function StudioGraphNode({ data }: NodeProps<StudioNode>) {
  if (data.kind === "priorityLayer") {
    return (
      <div className="studio-priority-layer-node">
        <PriorityTag priority={data.priority} />
        <div className="studio-priority-layer-line" />
      </div>
    );
  }

  if (data.kind === "packageRegion") {
    return (
      <div className="studio-package-region">
        <div className="studio-package-region-label">{data.title}</div>
      </div>
    );
  }

  const tone =
    data.kind === "module"
      ? "border-border bg-card text-card-foreground"
      : "border-status-success-border bg-status-success text-status-success-foreground";

  return (
    <div
      className={cn(
        "studio-node-card relative border",
        tone,
        data.selected && "border-foreground",
        data.dimmed && "border-border text-muted-foreground",
      )}
    >
      {data.needsAttention ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 z-10 size-2 rounded-full bg-destructive"
        />
      ) : null}
      <Handle
        id={studioNodeHandles.targetTop}
        type="target"
        position={Position.Top}
        className="opacity-0"
      />
      <Handle
        id={studioNodeHandles.sourceTop}
        type="source"
        position={Position.Top}
        className="opacity-0"
      />
      <Handle
        id={studioNodeHandles.targetLeft}
        type="target"
        position={Position.Left}
        className="opacity-0"
      />
      <div className="flex items-start justify-between gap-(--studio-panel-gap-sm)">
        <div className="min-w-0">
          <div className="line-clamp-2 text-sm font-medium">{data.title}</div>
          <div className="mt-(--studio-panel-gap-xs) text-xs text-muted-foreground">
            {data.caption}
          </div>
        </div>
        <PriorityTag priority={data.priority} />
      </div>
      <div className="mt-(--studio-panel-gap) flex items-center justify-between gap-(--studio-panel-gap-sm) text-xs text-muted-foreground">
        <span className="truncate">{data.meta}</span>
      </div>
      <Handle
        id={studioNodeHandles.sourceRight}
        type="source"
        position={Position.Right}
        className="opacity-0"
      />
      <Handle
        id={studioNodeHandles.targetBottom}
        type="target"
        position={Position.Bottom}
        className="opacity-0"
      />
      <Handle
        id={studioNodeHandles.sourceBottom}
        type="source"
        position={Position.Bottom}
        className="opacity-0"
      />
    </div>
  );
}

function PriorityTag({ priority }: { priority: ModulePriority }) {
  const { locale, m } = useI18n();

  if (priority === "none") {
    return (
      <Badge size="xs" variant="outline" className="border-border text-muted-foreground">
        {m.module_priority_none({}, { locale })}
      </Badge>
    );
  }

  return (
    <Badge
      size="xs"
      variant={priority === "P0" ? "default" : "secondary"}
      className={cn(priority === "P0" && "bg-primary text-primary-foreground")}
    >
      {priority}
    </Badge>
  );
}

function buildStudioGraph(
  snapshot: HarnessSnapshot,
  selectedModuleId: string | null,
  selectedPromiseId: string | null,
  locale: AppLocale,
  messages: MessageModule,
): { edges: Edge[]; nodes: StudioNode[] } {
  const edgeColors = {
    labelBackground: "var(--studio-flow-surface)",
    labelMutedBackground: "var(--studio-flow-surface)",
    labelMutedText: "var(--muted-foreground)",
    labelText: "var(--foreground)",
    relatedStroke: "var(--studio-edge-muted-stroke)",
    stroke: "var(--studio-edge-stroke)",
  };
  const activeModule = selectedModuleId
    ? snapshot.modules.find((module) => module.id === selectedModuleId)
    : null;
  const activePromises = activeModule
    ? sortPromisesForReview(
        snapshot.promises.filter((promise) => promise.moduleId === activeModule.id),
        locale,
      )
    : [];
  const relatedModuleIds = new Set(activeModule?.relatedModuleIds ?? []);
  const orderedModules = activeModule ? [activeModule] : snapshot.modules;
  const overviewLayout = activeModule ? null : buildOverviewPackageLayout(snapshot.modules, locale);
  const focusedModuleLayout = activeModule
    ? buildOverviewPriorityLayout(orderedModules, locale)
    : null;
  const activeModulePosition =
    activeModule && focusedModuleLayout ? focusedModuleLayout.positions.get(activeModule.id) : null;
  const focusedPromiseLayout = activeModule
    ? buildPromisePriorityLayout(activePromises, {
        includeLayerNodes: false,
        startY: activeModulePosition?.y ?? studioGraphLayout.promiseYStart,
        x:
          (activeModulePosition?.x ?? studioGraphLayout.activeModuleX) +
          studioGraphLayout.architectureLayerXStep,
      })
    : null;

  const moduleNodes = orderedModules.map((module) => {
    const isSelected = module.id === selectedModuleId;
    const isRelated = relatedModuleIds.has(module.id);
    const dimmed = Boolean(activeModule && !isSelected && !isRelated);
    const position = activeModule
      ? (focusedModuleLayout?.positions.get(module.id) ??
        getArchitectureLayerPosition(module, groupModulesByArchitectureLayer(orderedModules)))
      : (overviewLayout?.positions.get(module.id) ??
        getArchitectureLayerPosition(module, groupModulesByArchitectureLayer(snapshot.modules)));

    return {
      id: `module:${module.id}`,
      type: "studio",
      position,
      data: {
        caption: messages.modules_promise_count({ count: module.promiseIds.length }, { locale }),
        dimmed,
        kind: "module" as const,
        meta: messages.modules_cover_count({ count: module.covers.length }, { locale }),
        needsAttention: moduleNeedsReviewAttention(module, snapshot.promises),
        priority: module.priority,
        selected: isSelected,
        title: localizeText(module.title, locale),
      },
    } satisfies StudioNode;
  });

  const promiseNodes = activePromises.map((promise, index) => ({
    id: `promise:${promise.id}`,
    type: "studio",
    position: focusedPromiseLayout?.positions.get(promise.id) ?? {
      x: studioGraphLayout.promiseX,
      y: index * studioGraphLayout.promiseYStep + studioGraphLayout.promiseYStart,
    },
    data: {
      caption: promise.boundary,
      dimmed: false,
      kind: "promise" as const,
      meta: promise.lifecycle,
      needsAttention: promiseNeedsReviewAttention(promise),
      priority: promise.priority,
      selected: promise.id === selectedPromiseId,
      title: localizeText(promise.title, locale),
    },
  }));

  const ownershipEdges = activePromises.map((promise) => ({
    id: `owns:${promise.moduleId}:${promise.id}`,
    source: `module:${promise.moduleId}`,
    sourceHandle: studioNodeHandles.sourceRight,
    target: `promise:${promise.id}`,
    targetHandle: studioNodeHandles.targetLeft,
    type: "default",
    label: messages.graph_edge_owns({}, { locale }),
    markerEnd: { type: MarkerType.ArrowClosed },
    labelBgPadding: studioGraphLayout.edgeLabelPadding,
    labelBgStyle: { fill: edgeColors.labelBackground },
    labelStyle: {
      fill: edgeColors.labelText,
      fontSize: studioGraphLayout.edgeLabelSize,
      fontWeight: studioGraphLayout.edgeLabelWeight,
    },
    style: { stroke: edgeColors.stroke, strokeWidth: studioGraphLayout.edgePrimaryStrokeWidth },
    interactionWidth: 16,
  }));

  const relatedEdges: Edge[] = [];
  const priorityLayerNodes = activeModule
    ? (focusedModuleLayout?.layerNodes ?? [])
    : (overviewLayout?.layerNodes ?? []);

  return {
    edges: [...ownershipEdges, ...relatedEdges],
    nodes: [...priorityLayerNodes, ...moduleNodes, ...promiseNodes],
  };
}

const modulePriorityOrder: Record<ModulePriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  none: 3,
};
const modulePriorityValues: ModulePriority[] = ["P0", "P1", "P2", "none"];

function buildStudioSearchResults(
  snapshot: HarnessSnapshot,
  locale: AppLocale,
  messages: MessageModule,
): StudioSearchResult[] {
  const modulesById = new Map(snapshot.modules.map((module) => [module.id, module]));
  const moduleResults = snapshot.modules.map((module) => {
    const title = localizeText(module.title, locale);
    const summary = localizeText(module.summary, locale);
    const searchText = [
      module.id,
      title,
      summary,
      localizeText(module.purpose, locale),
      module.priority,
      ...module.covers,
      ...module.promiseIds,
    ].join(" ");

    return {
      id: `module:${module.id}`,
      kind: "module" as const,
      moduleId: module.id,
      priority: module.priority,
      searchText,
      subtitle: `${module.id} · ${messages.modules_promise_count(
        { count: module.promiseIds.length },
        { locale },
      )}`,
      title,
      trailing: module.priority,
    };
  });

  const promiseResults = snapshot.promises.map((promise) => {
    const module = modulesById.get(promise.moduleId);
    const title = localizeText(promise.title, locale);
    const moduleTitle = module ? localizeText(module.title, locale) : promise.moduleId;
    const searchText = [
      promise.id,
      promise.feature,
      title,
      localizeText(promise.purpose, locale),
      localizeText(promise.failureMeaning, locale),
      moduleTitle,
      promise.moduleId,
      promise.priority,
      promise.lifecycle,
      promise.boundary,
      ...promise.observes,
      ...localizeTexts(promise.given, locale),
      ...localizeTexts(promise.when, locale),
      ...localizeTexts(promise.then, locale),
    ].join(" ");

    return {
      id: `promise:${promise.id}`,
      kind: "promise" as const,
      moduleId: promise.moduleId,
      priority: promise.priority,
      promiseId: promise.id,
      searchText,
      subtitle: `${moduleTitle} · ${promise.id}`,
      title,
      trailing: promise.lifecycle,
    };
  });

  return [...moduleResults, ...promiseResults];
}

function sortPromisesForReview(promises: HarnessPromise[], locale: AppLocale) {
  return [...promises].sort((left, right) => {
    const leftAttention = promiseNeedsReviewAttention(left) ? 0 : 1;
    const rightAttention = promiseNeedsReviewAttention(right) ? 0 : 1;
    if (leftAttention !== rightAttention) return leftAttention - rightAttention;

    const priorityDifference =
      modulePriorityOrder[left.priority] - modulePriorityOrder[right.priority];
    if (priorityDifference !== 0) return priorityDifference;

    return localizeText(left.title, locale).localeCompare(localizeText(right.title, locale));
  });
}

function buildOverviewPriorityLayout(modules: HarnessModule[], locale: AppLocale) {
  const positions = new Map<string, { x: number; y: number }>();
  const layerNodes: StudioNode[] = [];
  let cursorY = studioGraphLayout.architectureLayerYStart;

  for (const priority of modulePriorityValues) {
    const priorityModules = modules
      .filter((module) => module.priority === priority)
      .sort((left, right) => {
        const layerDifference = getArchitectureLayer(left) - getArchitectureLayer(right);
        if (layerDifference !== 0) return layerDifference;
        return localizeText(left.title, locale).localeCompare(localizeText(right.title, locale));
      });
    if (priorityModules.length === 0) continue;

    layerNodes.push(
      createPriorityLayerNode(priority, cursorY + studioGraphLayout.layerNodeYOffset),
    );

    const layerCounts = new Map<number, number>();
    for (const module of priorityModules) {
      const layer = getArchitectureLayer(module);
      const layerIndex = layerCounts.get(layer) ?? 0;
      layerCounts.set(layer, layerIndex + 1);
      positions.set(module.id, {
        x: layer * studioGraphLayout.architectureLayerXStep,
        y: cursorY + layerIndex * studioGraphLayout.architectureLayerYStep,
      });
    }

    const maxLayerRows = Math.max(...layerCounts.values(), 1);
    cursorY += maxLayerRows * studioGraphLayout.architectureLayerYStep + studioGraphLayout.layerGap;
  }

  return { layerNodes, positions };
}

// Group the project overview by package (a monorepo workspace member). Each package with >= 2
// distinct packages present renders as a labeled region enclosing its module cards. A single-package
// or no-package project lays modules out flat with no regions.
function buildOverviewPackageLayout(modules: HarnessModule[], locale: AppLocale) {
  const positions = new Map<string, { x: number; y: number }>();
  const layerNodes: StudioNode[] = [];

  const groups = new Map<string, HarnessModule[]>();
  for (const module of modules) {
    const key = module.package ?? "";
    const list = groups.get(key) ?? [];
    list.push(module);
    groups.set(key, list);
  }

  const definedPackages = [...groups.keys()].filter((key) => key !== "");
  const showRegions = definedPackages.length >= 2;
  const packageKeys = [...groups.keys()].sort((left, right) => {
    if (left === right) return 0;
    if (left === "") return 1;
    if (right === "") return -1;
    return left.localeCompare(right);
  });

  const columns = 3;
  const columnStep = studioGraphLayout.architectureLayerXStep;
  const rowStep = studioGraphLayout.architectureLayerYStep;
  const nodeWidth = 264;
  const nodeHeight = 124;
  const regionPadX = 24;
  const regionHeaderHeight = 48;
  const regionPadBottom = 24;
  const regionGapY = 40;
  let cursorY = studioGraphLayout.architectureLayerYStart;

  for (const key of packageKeys) {
    const groupModules = [...(groups.get(key) ?? [])].sort((left, right) => {
      const priorityDifference =
        modulePriorityOrder[left.priority] - modulePriorityOrder[right.priority];
      if (priorityDifference !== 0) return priorityDifference;
      return localizeText(left.title, locale).localeCompare(localizeText(right.title, locale));
    });
    if (groupModules.length === 0) continue;

    const headerOffset = showRegions && key !== "" ? regionHeaderHeight : 0;
    const contentTop = cursorY + headerOffset;
    for (const [index, module] of groupModules.entries()) {
      positions.set(module.id, {
        x: regionPadX + (index % columns) * columnStep,
        y: contentTop + Math.floor(index / columns) * rowStep,
      });
    }

    const rows = Math.ceil(groupModules.length / columns);
    const usedColumns = Math.min(columns, groupModules.length);
    const regionHeight = headerOffset + (rows - 1) * rowStep + nodeHeight + regionPadBottom;

    if (showRegions && key !== "") {
      layerNodes.push({
        id: `package:${key}`,
        type: "studio",
        position: { x: 0, y: cursorY },
        selectable: false,
        draggable: false,
        style: {
          width: regionPadX * 2 + (usedColumns - 1) * columnStep + nodeWidth,
          height: regionHeight,
        },
        data: {
          caption: "",
          dimmed: false,
          kind: "packageRegion",
          meta: "",
          needsAttention: false,
          priority: "none",
          selected: false,
          title: key.split("/").pop() ?? key,
        },
      });
    }

    cursorY += regionHeight + regionGapY;
  }

  return { layerNodes, positions };
}

function buildPromisePriorityLayout(
  promises: HarnessPromise[],
  options: { includeLayerNodes?: boolean; startY?: number; x?: number } = {},
) {
  const positions = new Map<string, { x: number; y: number }>();
  const layerNodes: StudioNode[] = [];
  const includeLayerNodes = options.includeLayerNodes ?? true;
  const x = options.x ?? studioGraphLayout.promiseX;
  let cursorY = options.startY ?? studioGraphLayout.promiseYStart;

  for (const priority of modulePriorityValues) {
    const priorityPromises = promises.filter((promise) => promise.priority === priority);
    if (priorityPromises.length === 0) continue;

    if (includeLayerNodes) {
      layerNodes.push(
        createPriorityLayerNode(priority, cursorY + studioGraphLayout.layerNodeYOffset),
      );
    }
    for (const [index, promise] of priorityPromises.entries()) {
      positions.set(promise.id, {
        x,
        y: cursorY + index * studioGraphLayout.promiseYStep,
      });
    }

    cursorY +=
      priorityPromises.length * studioGraphLayout.promiseYStep + studioGraphLayout.layerGap;
  }

  return { layerNodes, positions };
}

function createPriorityLayerNode(priority: ModulePriority, y: number): StudioNode {
  return {
    id: `priority-layer:${priority}:${Math.round(y)}`,
    type: "studio",
    position: {
      x: studioGraphLayout.layerNodeX,
      y,
    },
    selectable: false,
    draggable: false,
    data: {
      caption: "",
      dimmed: false,
      kind: "priorityLayer",
      meta: "",
      needsAttention: false,
      priority,
      selected: false,
      title: priority,
    },
  };
}

function buildReviewInbox(promises: HarnessPromise[], locale: AppLocale) {
  return sortPromisesForReview(
    promises.filter((promise) => promiseNeedsInboxAttention(promise)),
    locale,
  );
}

function reviewInboxReason(promise: HarnessPromise, messages: MessageModule, locale: AppLocale) {
  if (promise.lifecycle === "changed_requires_review") {
    return messages.lifecycle_changed_requires_review({}, { locale });
  }
  if (promise.lifecycle === "proposed") {
    return messages.lifecycle_proposed({}, { locale });
  }
  if (promise.review.state === "pending") {
    return messages.review_state_pending({}, { locale });
  }
  return messages.promise_detail_review_status({}, { locale });
}

function moduleNeedsReviewAttention(module: HarnessModule, promises: HarnessPromise[]) {
  return promises.some(
    (promise) => promise.moduleId === module.id && promiseNeedsInboxAttention(promise),
  );
}

function promiseNeedsReviewAttention(promise: HarnessPromise) {
  return promiseNeedsInboxAttention(promise);
}

function promiseNeedsInboxAttention(promise: HarnessPromise) {
  return (
    promise.lifecycle === "proposed" ||
    promise.lifecycle === "changed_requires_review" ||
    promise.review.state === "pending" ||
    promise.review.state === "changes_requested"
  );
}

function groupModulesByArchitectureLayer(modules: HarnessModule[]) {
  return modules.reduce<Map<number, HarnessModule[]>>((groups, module) => {
    const layer = getArchitectureLayer(module);
    const layerModules = groups.get(layer) ?? [];
    layerModules.push(module);
    groups.set(layer, layerModules);
    return groups;
  }, new Map());
}

function getArchitectureLayer(module: HarnessModule) {
  return architectureLayerByModuleId[module.id] ?? modulePriorityOrder[module.priority];
}

function getArchitectureLayerPosition(module: HarnessModule, groups: Map<number, HarnessModule[]>) {
  const layer = getArchitectureLayer(module);
  const layerModules = groups.get(layer) ?? [];
  const layerIndex = layerModules.findIndex((item) => item.id === module.id);
  const maxLayerSize = Math.max(...[...groups.values()].map((items) => items.length), 1);
  const layerOffset =
    ((maxLayerSize - layerModules.length) * studioGraphLayout.architectureLayerYStep) / 2;

  return {
    x: layer * studioGraphLayout.architectureLayerXStep,
    y:
      studioGraphLayout.architectureLayerYStart +
      layerOffset +
      Math.max(layerIndex, 0) * studioGraphLayout.architectureLayerYStep,
  };
}

function InfoSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-(--studio-panel-gap-sm) text-xs text-muted-foreground">{title}</h3>
      <div className="text-sm leading-(--studio-content-line-height)">{children}</div>
    </section>
  );
}

function TextList({ items }: { items: string[] }) {
  return (
    <div className="space-y-(--studio-panel-gap-sm)">
      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </div>
  );
}

function CodeList({ items }: { items: string[] }) {
  return (
    <div className="space-y-(--studio-panel-gap-xs)">
      {items.map((item) => (
        <div
          key={item}
          className="truncate border-l border-border pl-(--studio-panel-gap-sm) font-mono text-xs text-muted-foreground"
        >
          {item}
        </div>
      ))}
    </div>
  );
}

function EvidenceSection({
  canOpenFiles,
  evidence,
  onOpenFile,
  resultsGeneratedAt,
  runStatus,
}: {
  canOpenFiles: boolean;
  evidence: PromiseEvidence[];
  onOpenFile: (file: string) => void;
  resultsGeneratedAt?: string;
  runStatus: RunStatus;
}) {
  const { locale, m } = useI18n();

  return (
    <InfoSection title={m.studio_evidence_title({}, { locale })}>
      <div className="space-y-(--studio-panel-gap-sm)">
        <div className="flex flex-wrap items-center justify-between gap-(--studio-panel-gap-sm)">
          <RunStatusBadge status={runStatus} />
          <span className="text-xs text-muted-foreground">
            {resultsGeneratedAt
              ? `${m.studio_evidence_last_run({}, { locale })}: ${formatRunTimestamp(resultsGeneratedAt, locale)}`
              : m.studio_evidence_never_run({}, { locale })}
          </span>
        </div>

        {evidence.length > 0 ? (
          <div className="divide-y divide-border border border-border">
            {evidence.map((item) => (
              <EvidenceRow
                key={`${item.file}::${item.testName}`}
                canOpenFiles={canOpenFiles}
                evidence={item}
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
        ) : (
          <p className="border border-dashed border-border p-(--studio-panel-gap-sm) text-xs text-muted-foreground">
            {m.studio_evidence_empty({}, { locale })}
          </p>
        )}
      </div>
    </InfoSection>
  );
}

function EvidenceRow({
  canOpenFiles,
  evidence,
  onOpenFile,
}: {
  canOpenFiles: boolean;
  evidence: PromiseEvidence;
  onOpenFile: (file: string) => void;
}) {
  const { locale, m } = useI18n();

  let statusLabel: string;
  switch (evidence.status) {
    case "passing":
      statusLabel = m.runs_passing({}, { locale });
      break;
    case "failing":
      statusLabel = m.runs_failing({}, { locale });
      break;
    default:
      statusLabel = m.runs_skipped({}, { locale });
      break;
  }

  return (
    <div className="space-y-(--studio-panel-gap-xs) p-(--studio-panel-gap-sm)">
      <div className="flex items-start gap-(--studio-panel-gap-sm)">
        <span
          aria-hidden="true"
          className={cn("mt-1 size-2 shrink-0 rounded-full", evidenceDotTone(evidence.status))}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{evidence.testName}</div>
          <FileLink canOpenFiles={canOpenFiles} file={evidence.file} onOpenFile={onOpenFile} />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{statusLabel}</span>
      </div>
      {evidence.failureMessage ? (
        <p className="ml-(--studio-panel-gap) overflow-x-auto border-l-2 border-destructive bg-destructive/5 p-(--studio-panel-gap-sm) font-mono text-xs whitespace-pre-wrap text-destructive">
          {evidence.failureMessage}
        </p>
      ) : null}
    </div>
  );
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  const { locale, m } = useI18n();

  let label: string;
  switch (status) {
    case "passing":
      label = m.run_status_passing({}, { locale });
      break;
    case "failing":
      label = m.run_status_failing({}, { locale });
      break;
    case "skipped":
      label = m.run_status_skipped({}, { locale });
      break;
    case "missing_evidence":
      label = m.run_status_missing_evidence({}, { locale });
      break;
    default:
      label = m.run_status_unknown({}, { locale });
      break;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center border px-(--studio-panel-gap-sm) py-px text-xs font-medium",
        runStatusTone(status),
      )}
    >
      {label}
    </span>
  );
}

function FileList({
  canOpenFiles,
  files,
  onOpenFile,
}: {
  canOpenFiles: boolean;
  files: string[];
  onOpenFile: (file: string) => void;
}) {
  return (
    <div className="space-y-(--studio-panel-gap-xs)">
      {files.map((file) => (
        <FileLink key={file} canOpenFiles={canOpenFiles} file={file} onOpenFile={onOpenFile} />
      ))}
    </div>
  );
}

function FileLink({
  canOpenFiles,
  file,
  onOpenFile,
}: {
  canOpenFiles: boolean;
  file: string;
  onOpenFile: (file: string) => void;
}) {
  const { locale, m } = useI18n();

  if (!canOpenFiles) {
    return (
      <div className="truncate border-l border-border pl-(--studio-panel-gap-sm) font-mono text-xs text-muted-foreground">
        {file}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenFile(file)}
      title={m.studio_open_in_editor({}, { locale })}
      className="group flex w-full items-center gap-(--studio-panel-gap-xs) border-l border-border pl-(--studio-panel-gap-sm) text-left font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <span className="truncate">{file}</span>
      <RiExternalLinkLine className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function runStatusTone(status: RunStatus): string {
  switch (status) {
    case "passing":
      return "border-status-success-border bg-status-success text-status-success-foreground";
    case "failing":
    case "missing_evidence":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "skipped":
      return "border-status-warning-border bg-status-warning text-status-warning-foreground";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function evidenceDotTone(status: PromiseEvidence["status"]): string {
  switch (status) {
    case "passing":
      return "bg-success";
    case "failing":
      return "bg-destructive";
    default:
      return "bg-warning";
  }
}

function formatRunTimestamp(value: string, locale: AppLocale): string {
  // Harness adapters stamp results as "unix-ms:<millis>"; fall back to native Date parsing
  // (e.g. RFC3339) and finally to the raw string so an unknown format still renders.
  const millisPrefix = "unix-ms:";
  const date = value.startsWith(millisPrefix)
    ? new Date(Number(value.slice(millisPrefix.length)))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function StatusRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="studio-context-card flex items-center justify-between gap-(--studio-panel-gap) border bg-card p-(--studio-panel-gap-sm)">
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 font-medium">{value === 0 ? "OK" : value}</span>
    </div>
  );
}
