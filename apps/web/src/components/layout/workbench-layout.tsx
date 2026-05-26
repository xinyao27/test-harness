import { Outlet } from "@tanstack/react-router";

import { useTheme } from "@/lib/theme";

export function WorkbenchLayout() {
  const { theme } = useTheme();

  return (
    <div
      data-theme={theme}
      className="studio-shell-bg h-dvh min-h-0 overflow-hidden p-(--studio-shell-inset) text-foreground"
    >
      <main className="h-full min-h-0 min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
