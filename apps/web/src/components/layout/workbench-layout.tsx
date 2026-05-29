import { Outlet, useRouterState } from "@tanstack/react-router";

import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function WorkbenchLayout() {
  const { theme } = useTheme();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isFullBleedRoute =
    pathname === "/" || pathname === "/modules" || pathname.startsWith("/modules/");

  return (
    <div
      data-theme={theme}
      className={cn(
        "studio-shell-bg h-dvh min-h-0 overflow-hidden text-foreground",
        isFullBleedRoute ? "p-0" : "p-(--studio-shell-inset)",
      )}
    >
      <main className="h-full min-h-0 min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
