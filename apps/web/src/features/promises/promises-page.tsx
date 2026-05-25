import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LifecycleBadge, PriorityBadge, RunStatusBadge } from "@/features/status/status-badge";
import { getWorkbenchSnapshot } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { localizeText } from "@/lib/localized-text";

export function PromisesPage() {
  const { data } = useQuery({
    queryKey: ["workbench-snapshot"],
    queryFn: getWorkbenchSnapshot,
  });
  const { locale, m } = useI18n();

  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg">{m.promises_title({}, { locale })}</h1>
          <div className="text-xs text-muted-foreground">{data?.promises.length ?? 0}</div>
        </div>
        <Input
          className="w-full sm:w-72"
          placeholder={m.promises_filter_placeholder({}, { locale })}
        />
      </div>
      <div className="space-y-3">
        {data?.promises.map((promise) => (
          <Link key={promise.id} to="/promises/$promiseId" params={{ promiseId: promise.id }}>
            <Card size="sm" className="transition-colors hover:bg-muted/40">
              <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm">{localizeText(promise.title, locale)}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {promise.feature}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <PriorityBadge priority={promise.priority} />
                  <LifecycleBadge lifecycle={promise.lifecycle} />
                  <RunStatusBadge status={promise.runStatus} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
