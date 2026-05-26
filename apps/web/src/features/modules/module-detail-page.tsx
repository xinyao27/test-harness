import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LifecycleBadge, PriorityBadge, RunStatusBadge } from "@/features/status/status-badge";
import { getWorkbenchSnapshot } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { localizeText } from "@/lib/localized-text";

export function ModuleDetailPage({ moduleId }: { moduleId: string }) {
  const { data } = useQuery({
    queryKey: ["workbench-snapshot"],
    queryFn: getWorkbenchSnapshot,
  });
  const module = data?.modules.find((item) => item.id === moduleId);
  const promises = data?.promises.filter((promise) => promise.moduleId === moduleId) ?? [];
  const { locale, m } = useI18n();

  if (!module) {
    return <div className="p-4 text-sm">{m.module_detail_missing({}, { locale })}</div>;
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <Card className="min-w-0 lg:sticky lg:top-0 lg:self-start">
        <CardHeader>
          <CardTitle>{localizeText(module.title, locale)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{localizeText(module.summary, locale)}</p>
          <InfoBlock
            title={m.module_detail_why({}, { locale })}
            items={[localizeText(module.purpose, locale)]}
          />
          <InfoBlock title={m.module_detail_covers({}, { locale })} items={module.covers} />
          <InfoBlock
            title={m.module_detail_related({}, { locale })}
            items={module.relatedModuleIds}
          />
        </CardContent>
      </Card>

      <section className="min-w-0 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg">{m.module_detail_promises_title({}, { locale })}</h1>
            <div className="text-xs text-muted-foreground">{promises.length}</div>
          </div>
        </div>
        {promises.map((promise) => (
          <Link key={promise.id} to="/promises/$promiseId" params={{ promiseId: promise.id }}>
            <Card size="sm" className="transition-colors hover:bg-muted">
              <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm">{localizeText(promise.title, locale)}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{promise.id}</div>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <PriorityBadge priority={promise.priority} />
                  <LifecycleBadge lifecycle={promise.lifecycle} />
                  <RunStatusBadge status={promise.runStatus} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 text-xs text-muted-foreground">{title}</div>
      <div className="space-y-1 text-xs text-muted-foreground">
        {items.map((item) => (
          <div key={item} className="truncate border-l pl-2">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
