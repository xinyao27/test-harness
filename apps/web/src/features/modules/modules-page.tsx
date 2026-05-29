import { RiArrowRightLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsDialog } from "@/features/settings/settings-page";
import {
  StudioSearchDialog,
  WorkbenchHeader,
  buildStudioSearchResults,
} from "@/features/studio/harness-studio-page";
import { fallbackWorkbenchProjects, getWorkbenchProjects, getWorkbenchSnapshot } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { localizeText } from "@/lib/localized-text";

const PROJECT_ID = "current:test-harness";

export function ModulesPage() {
  const { locale, m } = useI18n();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["workbench-snapshot", PROJECT_ID],
    queryFn: getWorkbenchSnapshot,
  });
  const { data: knownProjects = fallbackWorkbenchProjects } = useQuery({
    queryKey: ["workbench-projects"],
    queryFn: getWorkbenchProjects,
  });
  const projectName = data ? localizeText(data.project.name, locale) : "test-harness";
  const searchResults = useMemo(
    () => (data ? buildStudioSearchResults(data, locale, m) : []),
    [data, locale, m],
  );
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="m-(--studio-control-inset) [&_.studio-top-bar]:pointer-events-auto">
        <WorkbenchHeader
          knownProjects={knownProjects}
          selectedProjectId={PROJECT_ID}
          onProjectChange={() => void navigate({ to: "/" })}
          module={null}
          promise={null}
          projectName={projectName}
          onProjectClick={() => void navigate({ to: "/" })}
          onModuleClick={() => {}}
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
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-(--studio-panel-padding)">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data?.modules.map((module) => {
            const promiseCount = data.promises.filter(
              (promise) => promise.moduleId === module.id,
            ).length;
            return (
              <Link key={module.id} to="/modules/$moduleId" params={{ moduleId: module.id }}>
                <Card className="h-full transition-colors hover:bg-muted">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      {localizeText(module.title, locale)}
                      <RiArrowRightLine className="size-4 text-muted-foreground" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {localizeText(module.summary, locale)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {m.modules_promise_count({ count: promiseCount }, { locale })}
                      </Badge>
                      <Badge variant="secondary">
                        {m.modules_cover_count({ count: module.covers.length }, { locale })}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
