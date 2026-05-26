import { createRoute, createRootRoute, createRouter } from "@tanstack/react-router";

import { WorkbenchLayout } from "@/components/layout/workbench-layout";
import { GeneratePage } from "@/features/generate/generate-page";
import { MapPage } from "@/features/graph/map-page";
import { ModuleDetailPage } from "@/features/modules/module-detail-page";
import { ModulesPage } from "@/features/modules/modules-page";
import { PromiseDetailPage } from "@/features/promises/promise-detail-page";
import { PromisesPage } from "@/features/promises/promises-page";
import { ReviewPage } from "@/features/review/review-page";
import { RunsPage } from "@/features/runs/runs-page";
import { HarnessStudioPage } from "@/features/studio/harness-studio-page";

const rootRoute = createRootRoute({
  component: WorkbenchLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HarnessStudioPage,
});

const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "map",
  component: MapPage,
});

const modulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "modules",
  component: ModulesPage,
});

const moduleDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "modules/$moduleId",
  component: ModuleDetailRoute,
});

const promisesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "promises",
  component: PromisesPage,
});

const promiseDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "promises/$promiseId",
  component: PromiseDetailRoute,
});

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "review",
  component: ReviewPage,
});

const generateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "generate",
  component: GeneratePage,
});

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "runs",
  component: RunsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  mapRoute,
  modulesRoute,
  moduleDetailRoute,
  promisesRoute,
  promiseDetailRoute,
  reviewRoute,
  generateRoute,
  runsRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function ModuleDetailRoute() {
  const { moduleId } = moduleDetailRoute.useParams();
  return <ModuleDetailPage moduleId={moduleId} />;
}

function PromiseDetailRoute() {
  const { promiseId } = promiseDetailRoute.useParams();
  return <PromiseDetailPage promiseId={promiseId} />;
}

function SettingsRoute() {
  return <HarnessStudioPage settingsOpenByDefault />;
}
