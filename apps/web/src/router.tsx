import { createRoute, createRootRoute, createRouter, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { WorkbenchLayout } from "@/components/layout/workbench-layout";
import { HarnessStudioPage } from "@/features/studio/harness-studio-page";

const rootRoute = createRootRoute({
  component: WorkbenchLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HarnessStudioPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([indexRoute, settingsRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function SettingsRoute() {
  const navigate = useNavigate();

  useEffect(() => {
    window.sessionStorage.setItem("harness:open-settings", "1");
    void navigate({ to: "/", replace: true });
  }, [navigate]);

  return null;
}
