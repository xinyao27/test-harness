import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PriorityBadge, RunStatusBadge } from "@/features/status/status-badge";
import { getWorkbenchSnapshot } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { localizeText } from "@/lib/localized-text";

export function RunsPage() {
  const { data } = useQuery({
    queryKey: ["workbench-snapshot"],
    queryFn: getWorkbenchSnapshot,
  });
  const unknownPromises = data?.promises.filter((promise) => promise.runStatus !== "passing") ?? [];
  const { locale, m } = useI18n();

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <Card className="min-w-0 lg:sticky lg:top-0 lg:self-start">
        <CardHeader>
          <CardTitle>{m.runs_title({}, { locale })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Metric label={m.runs_passing({}, { locale })} value="0" />
          <Metric label={m.runs_failing({}, { locale })} value="0" />
          <Metric label={m.runs_skipped({}, { locale })} value="0" />
          <Metric label={m.runs_unknown({}, { locale })} value="42" />
        </CardContent>
      </Card>

      <section className="min-w-0 space-y-3">
        {unknownPromises.map((promise) => (
          <Card key={promise.id} size="sm">
            <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="truncate text-sm">{localizeText(promise.title, locale)}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{promise.feature}</div>
              </div>
              <div className="flex gap-2 sm:justify-end">
                <PriorityBadge priority={promise.priority} />
                <RunStatusBadge status={promise.runStatus} />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg">{value}</span>
    </div>
  );
}
