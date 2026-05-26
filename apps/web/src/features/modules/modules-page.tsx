import { RiArrowRightLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkbenchSnapshot } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { localizeText } from "@/lib/localized-text";

export function ModulesPage() {
  const { data } = useQuery({
    queryKey: ["workbench-snapshot"],
    queryFn: getWorkbenchSnapshot,
  });
  const { locale, m } = useI18n();

  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h1 className="text-lg">{m.modules_title({}, { locale })}</h1>
        <div className="text-xs text-muted-foreground">{data?.modules.length ?? 0}</div>
      </div>
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
  );
}
