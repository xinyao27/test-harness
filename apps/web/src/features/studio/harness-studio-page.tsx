import {
  RiArrowRightSLine,
  RiCheckLine,
  RiCloseLine,
  RiFolderAddLine,
  RiFolderLine,
  RiSearchLine,
  RiSettings3Line,
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
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  HarnessModule,
  HarnessPromise,
  HarnessSnapshot,
  ModulePriority,
  SnapshotSource,
} from "@/data/harness-snapshot";
import { SettingsPanel } from "@/features/settings/settings-page";
import {
  LifecycleBadge,
  PriorityBadge,
  ReviewStateBadge,
  RunStatusBadge,
} from "@/features/status/status-badge";
import {
  fallbackWorkbenchProjects,
  getWorkbenchProjects,
  getWorkbenchSnapshotForProject,
  runWorkbenchTests,
  type WorkbenchRunResult,
  type WorkbenchProject,
} from "@/lib/api";
import { useI18n, type AppLocale } from "@/lib/i18n";
import { localizeText, localizeTexts } from "@/lib/localized-text";
import { cn } from "@/lib/utils";

type StudioNodeKind = "module" | "promise";

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

const currentStudioProjectId = "current:test-harness";
const noStudioProjectId = "none";
const studioProjectsStorageKey = "harness-studio.projects";
const selectedStudioProjectStorageKey = "harness-studio.selected-project";
const projectMenuItemClass =
  "studio-project-menu-item flex h-7 w-full items-center gap-2 px-1.5 text-left text-xs text-popover-foreground outline-none";

const studioGraphLayout = {
  activeModuleX: 0,
  activeModuleY: 150,
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
  relatedModuleX: 0,
  relatedModuleYStart: 282,
  relatedModuleYStep: 132,
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

const architectureOverviewRelationPairs = [
  ["protocol", "promise-schema"],
  ["protocol", "results-schema"],
  ["protocol", "module-registry"],
  ["promise-schema", "promise-registry"],
  ["module-registry", "validation"],
  ["results-schema", "adapter-runtime"],
  ["cli", "adapter-runtime"],
  ["adapter-runtime", "rust-adapter"],
  ["adapter-runtime", "vitest-adapter"],
  ["cli", "report"],
  ["cli", "web-dashboard"],
  ["todo-backend-api-contract", "todo-backend-client"],
  ["todo-backend-api-contract", "todo-backend-typescript-hono"],
  ["todo-backend-api-contract", "todo-backend-rust-axum"],
  ["todo-backend-client", "todo-backend-showcase"],
  ["todo-backend-typescript-hono", "todo-backend-showcase"],
  ["todo-backend-rust-axum", "todo-backend-showcase"],
] as const;

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
  const { locale, m } = useI18n();
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedPromiseId, setSelectedPromiseId] = useState<string | null>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(settingsOpenByDefault);
  const [hasReadQueryState, setHasReadQueryState] = useState(false);
  const [runState, setRunState] = useState<StudioRunState>({ result: null, status: "idle" });
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

  return (
    <div className="studio-canvas-frame relative h-full min-h-0 overflow-hidden">
      <section className="studio-flow-surface relative h-full min-h-0 overflow-hidden">
        <ReactFlow
          className="studio-flow-layer"
          key={selectedPromise?.id ?? selectedModule?.id ?? "project"}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: studioGraphLayout.fitViewPadding }}
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
              <div className="studio-top-controls">
                <ProjectSwitcher
                  knownProjects={knownProjects}
                  onProjectChange={changeProject}
                  selectedProjectId={selectedProjectId}
                />
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={m.studio_search_trigger({}, { locale })}
                        className="studio-floating-control"
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

              <div className="studio-top-stats">
                {data?.source ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Badge
                          size="xs"
                          variant={data.source === "daemon" ? "secondary" : "destructive"}
                        />
                      }
                    >
                      {snapshotSourceLabel(data.source, m, locale)}
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {data.source === "static"
                        ? m.studio_snapshot_fallback_body({}, { locale })
                        : snapshotSourceLabel(data.source, m, locale)}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                <Badge variant="secondary">
                  {m.metric_total_modules({}, { locale })}: {data?.project.moduleCount ?? 0}
                </Badge>
                <Badge variant="secondary">
                  {m.metric_total_promises({}, { locale })}: {data?.project.promiseCount ?? 0}
                </Badge>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size="icon"
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

          <Controls showInteractive={false} />
          {isPanelCollapsed ? (
            <Panel position="top-right" className="studio-panel-expand-panel">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon"
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
              canRunTests={data?.source === "daemon"}
              isRunningTests={runState.status === "running"}
              module={selectedModule}
              onCollapse={() => setIsPanelCollapsed(true)}
              onRunTests={runTests}
              promise={selectedPromise}
              runState={runState}
              snapshot={data ?? null}
            />
          )}
        </ReactFlow>
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

function ContextPanel({
  canRunTests,
  isRunningTests,
  module,
  onCollapse,
  onRunTests,
  promise,
  runState,
  snapshot,
}: {
  canRunTests: boolean;
  isRunningTests: boolean;
  module: HarnessModule | null;
  onCollapse: () => void;
  onRunTests: () => void;
  promise: HarnessPromise | null;
  runState: StudioRunState;
  snapshot: HarnessSnapshot | null;
}) {
  const { locale, m } = useI18n();

  return (
    <Panel position="top-right" className="studio-context-panel min-w-0">
      <div className="flex h-full min-h-0 flex-col">
        <div className="studio-context-header flex shrink-0 items-center justify-between">
          <div className="flex min-w-0 items-center gap-(--studio-panel-gap-sm)">
            <RiSidebarUnfoldLine className="size-4 shrink-0 text-muted-foreground" />
            <div className="truncate text-sm font-medium">
              {m.studio_context_panel({}, { locale })}
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={m.action_collapse_panel({}, { locale })}
                  onClick={onCollapse}
                />
              }
            >
              <RiSidebarFoldLine />
            </TooltipTrigger>
            <TooltipContent side="left">{m.action_collapse_panel({}, { locale })}</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="studio-context-body">
            {snapshot?.source === "static" ? <SnapshotSourceNotice /> : null}
            {promise && module ? (
              <PromiseContext promise={promise} module={module} />
            ) : module && snapshot ? (
              <ModuleContext module={module} snapshot={snapshot} />
            ) : snapshot ? (
              <StudioContext snapshot={snapshot} />
            ) : null}
            <RunSummary runState={runState} />
          </div>
        </ScrollArea>

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

function SnapshotSourceNotice() {
  const { locale, m } = useI18n();

  return (
    <section className="studio-context-card mb-(--studio-panel-gap) border border-destructive bg-destructive/10 p-(--studio-panel-padding) text-destructive">
      <h2 className="text-sm font-medium">{m.studio_snapshot_fallback_title({}, { locale })}</h2>
      <p className="mt-(--studio-panel-gap-xs) text-xs">
        {m.studio_snapshot_fallback_body({}, { locale })}
      </p>
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

function ModuleContext({ module, snapshot }: { module: HarnessModule; snapshot: HarnessSnapshot }) {
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

function PromiseContext({ module, promise }: { module: HarnessModule; promise: HarnessPromise }) {
  const { locale, m } = useI18n();

  return (
    <div className="space-y-(--studio-panel-gap)">
      <section>
        <div className="flex flex-wrap gap-(--studio-panel-gap-sm)">
          <PriorityBadge priority={promise.priority} />
          <LifecycleBadge lifecycle={promise.lifecycle} />
          <RunStatusBadge status={promise.runStatus} />
        </div>
        <h2 className="mt-(--studio-panel-gap) text-base font-medium">
          {localizeText(promise.title, locale)}
        </h2>
        <p className="mt-(--studio-panel-gap-xs) break-all text-xs text-muted-foreground">
          {promise.id}
        </p>
      </section>

      <InfoSection title={m.graph_kind_module({}, { locale })}>
        <p>{localizeText(module.title, locale)}</p>
      </InfoSection>

      <InfoSection title={m.promise_detail_purpose({}, { locale })}>
        <p>{localizeText(promise.purpose, locale)}</p>
      </InfoSection>

      <div className="grid gap-(--studio-panel-gap)">
        <InfoSection title={m.promise_detail_given({}, { locale })}>
          <TextList items={localizeTexts(promise.given, locale)} />
        </InfoSection>
        <InfoSection title={m.promise_detail_when({}, { locale })}>
          <TextList items={localizeTexts(promise.when, locale)} />
        </InfoSection>
        <InfoSection title={m.promise_detail_then({}, { locale })}>
          <TextList items={localizeTexts(promise.then, locale)} />
        </InfoSection>
      </div>

      <InfoSection title={m.promise_detail_failure_meaning({}, { locale })}>
        <p>{localizeText(promise.failureMeaning, locale)}</p>
      </InfoSection>

      <InfoSection title={m.graph_kind_evidence({}, { locale })}>
        <CodeList items={promise.observes} />
      </InfoSection>

      <InfoSection title={m.promise_detail_review_status({}, { locale })}>
        <div className="flex flex-wrap gap-(--studio-panel-gap-sm)">
          <ReviewStateBadge state={promise.review.state} />
          {promise.review.approvedBy ? (
            <Badge variant="outline">{promise.review.approvedBy}</Badge>
          ) : null}
        </div>
      </InfoSection>
    </div>
  );
}

function StudioGraphNode({ data }: NodeProps<StudioNode>) {
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
  const relatedModules = activeModule
    ? snapshot.modules.filter((module) => relatedModuleIds.has(module.id))
    : [];
  const moduleLayerGroups = groupModulesByArchitectureLayer(snapshot.modules);
  const orderedModules = activeModule ? [activeModule, ...relatedModules] : snapshot.modules;

  const moduleNodes = orderedModules.map((module) => {
    const isSelected = module.id === selectedModuleId;
    const isRelated = relatedModuleIds.has(module.id);
    const dimmed = Boolean(activeModule && !isSelected && !isRelated);
    const position = activeModule
      ? getFocusedModulePosition(module, activeModule, relatedModules)
      : getArchitectureLayerPosition(module, moduleLayerGroups);

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
    position: {
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

  const relatedEdges = activeModule
    ? relatedModules.map((module) => ({
        id: `related:${activeModule.id}:${module.id}`,
        source: `module:${activeModule.id}`,
        sourceHandle: studioNodeHandles.sourceBottom,
        target: `module:${module.id}`,
        targetHandle: studioNodeHandles.targetTop,
        type: "default",
        label: messages.graph_edge_related({}, { locale }),
        labelBgPadding: studioGraphLayout.edgeLabelPadding,
        labelBgStyle: { fill: edgeColors.labelMutedBackground },
        labelStyle: { fill: edgeColors.labelMutedText, fontSize: studioGraphLayout.edgeLabelSize },
        style: {
          stroke: edgeColors.relatedStroke,
          strokeOpacity: studioGraphLayout.edgeRelatedStrokeOpacity,
          strokeWidth: studioGraphLayout.edgeRelatedStrokeWidth,
        },
        interactionWidth: 16,
      }))
    : buildArchitectureRelationEdges(snapshot, edgeColors.relatedStroke);

  return {
    edges: [...ownershipEdges, ...relatedEdges],
    nodes: [...moduleNodes, ...promiseNodes],
  };
}

const modulePriorityOrder: Record<ModulePriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  none: 3,
};

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

function moduleNeedsReviewAttention(module: HarnessModule, promises: HarnessPromise[]) {
  return promises.some(
    (promise) => promise.moduleId === module.id && promiseNeedsReviewAttention(promise),
  );
}

function promiseNeedsReviewAttention(promise: HarnessPromise) {
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

function getFocusedModulePosition(
  module: HarnessModule,
  activeModule: HarnessModule,
  relatedModules: HarnessModule[],
) {
  if (module.id === activeModule.id) {
    return {
      x: studioGraphLayout.activeModuleX,
      y: studioGraphLayout.activeModuleY,
    };
  }

  const relatedIndex = relatedModules.findIndex((item) => item.id === module.id);
  return {
    x: studioGraphLayout.relatedModuleX,
    y:
      studioGraphLayout.relatedModuleYStart +
      Math.max(relatedIndex, 0) * studioGraphLayout.relatedModuleYStep,
  };
}

function buildArchitectureRelationEdges(snapshot: HarnessSnapshot, stroke: string): Edge[] {
  const moduleById = new Map(snapshot.modules.map((module) => [module.id, module]));
  const moduleLayerGroups = groupModulesByArchitectureLayer(snapshot.modules);
  const overviewEdges: Edge[] = [];

  for (const [sourceId, targetId] of architectureOverviewRelationPairs) {
    const source = moduleById.get(sourceId);
    const target = moduleById.get(targetId);
    if (!source || !target || !hasModuleRelation(source, target)) continue;
    overviewEdges.push(
      createArchitectureRelationEdge(source, target, stroke, "overview", moduleLayerGroups),
    );
  }

  if (overviewEdges.length > 0) return overviewEdges;

  const seenRelationIds = new Set<string>();
  const edges: Edge[] = [];

  for (const module of snapshot.modules) {
    for (const relatedModuleId of module.relatedModuleIds) {
      const relatedModule = moduleById.get(relatedModuleId);
      if (!relatedModule) continue;

      const relationId = [module.id, relatedModule.id].sort().join(":");
      if (seenRelationIds.has(relationId)) continue;
      seenRelationIds.add(relationId);

      const [source, target] = orderRelationEndpoints(module, relatedModule);
      edges.push(
        createArchitectureRelationEdge(source, target, stroke, "related", moduleLayerGroups),
      );
    }
  }

  return edges;
}

function hasModuleRelation(left: HarnessModule, right: HarnessModule) {
  return left.relatedModuleIds.includes(right.id) || right.relatedModuleIds.includes(left.id);
}

function createArchitectureRelationEdge(
  source: HarnessModule,
  target: HarnessModule,
  stroke: string,
  edgeKind: string,
  moduleLayerGroups: Map<number, HarnessModule[]>,
): Edge {
  const isOverview = edgeKind === "overview";
  const handles = getArchitectureRelationHandles(source, target, moduleLayerGroups);

  return {
    id: `architecture:${edgeKind}:${source.id}:${target.id}`,
    source: `module:${source.id}`,
    sourceHandle: handles.sourceHandle,
    target: `module:${target.id}`,
    targetHandle: handles.targetHandle,
    type: "default",
    style: {
      stroke,
      strokeOpacity: isOverview
        ? studioGraphLayout.edgeOverviewStrokeOpacity
        : studioGraphLayout.edgeRelatedStrokeOpacity,
      strokeWidth: isOverview
        ? studioGraphLayout.edgeOverviewStrokeWidth
        : studioGraphLayout.edgeRelatedStrokeWidth,
    },
    interactionWidth: 16,
  };
}

function getArchitectureRelationHandles(
  source: HarnessModule,
  target: HarnessModule,
  moduleLayerGroups: Map<number, HarnessModule[]>,
) {
  const sourcePosition = getArchitectureLayerPosition(source, moduleLayerGroups);
  const targetPosition = getArchitectureLayerPosition(target, moduleLayerGroups);

  if (sourcePosition.x === targetPosition.x) {
    return sourcePosition.y <= targetPosition.y
      ? {
          sourceHandle: studioNodeHandles.sourceBottom,
          targetHandle: studioNodeHandles.targetTop,
        }
      : {
          sourceHandle: studioNodeHandles.sourceTop,
          targetHandle: studioNodeHandles.targetBottom,
        };
  }

  return {
    sourceHandle: studioNodeHandles.sourceRight,
    targetHandle: studioNodeHandles.targetLeft,
  };
}

function orderRelationEndpoints(left: HarnessModule, right: HarnessModule) {
  const leftLayer = getArchitectureLayer(left);
  const rightLayer = getArchitectureLayer(right);

  if (leftLayer !== rightLayer) return leftLayer < rightLayer ? [left, right] : [right, left];
  return left.id < right.id ? [left, right] : [right, left];
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

function StatusRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="studio-context-card flex items-center justify-between gap-(--studio-panel-gap) border bg-card p-(--studio-panel-gap-sm)">
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 font-medium">{value === 0 ? "OK" : value}</span>
    </div>
  );
}
