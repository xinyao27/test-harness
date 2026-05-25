import {
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiEditLine,
  RiFileCodeLine,
} from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LifecycleBadge, PriorityBadge, RunStatusBadge } from "@/features/status/status-badge";
import { getWorkbenchSnapshot } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { localizeText, localizeTexts } from "@/lib/localized-text";

export function PromiseDetailPage({ promiseId }: { promiseId: string }) {
  const { data } = useQuery({
    queryKey: ["workbench-snapshot"],
    queryFn: getWorkbenchSnapshot,
  });
  const promise = data?.promises.find((item) => item.id === promiseId);
  const module = promise ? data?.modules.find((item) => item.id === promise.moduleId) : undefined;
  const { locale, m } = useI18n();

  if (!promise) {
    return <div className="p-4 text-sm">{m.promise_detail_missing({}, { locale })}</div>;
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto overflow-x-hidden p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 space-y-3">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-2">
              <PriorityBadge priority={promise.priority} />
              <LifecycleBadge lifecycle={promise.lifecycle} />
              <RunStatusBadge status={promise.runStatus} />
            </div>
            <CardTitle className="text-base">{localizeText(promise.title, locale)}</CardTitle>
            <div className="truncate text-xs text-muted-foreground">{promise.id}</div>
          </CardHeader>
          <CardContent className="space-y-4">
            <TextSection
              title={m.promise_detail_purpose({}, { locale })}
              items={[localizeText(promise.purpose, locale)]}
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <TextSection
                title={m.promise_detail_given({}, { locale })}
                items={localizeTexts(promise.given, locale)}
              />
              <TextSection
                title={m.promise_detail_when({}, { locale })}
                items={localizeTexts(promise.when, locale)}
              />
              <TextSection
                title={m.promise_detail_then({}, { locale })}
                items={localizeTexts(promise.then, locale)}
              />
            </div>
            <TextSection
              title={m.promise_detail_failure_meaning({}, { locale })}
              items={[localizeText(promise.failureMeaning, locale)]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.promise_detail_relationship_title({}, { locale })}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 items-center gap-2 text-center text-xs sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
              <NodeBox
                title={
                  module ? localizeText(module.title, locale) : m.graph_kind_module({}, { locale })
                }
                subtitle={m.graph_edge_owns({}, { locale })}
              />
              <span className="rotate-90 sm:rotate-0">→</span>
              <NodeBox
                title={m.promise_detail_current_promise({}, { locale })}
                subtitle={promise.priority}
              />
              <span className="rotate-90 sm:rotate-0">→</span>
              <NodeBox
                title={promise.observes[0] ?? m.graph_kind_evidence({}, { locale })}
                subtitle={m.graph_edge_observes({}, { locale })}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <aside className="min-w-0 space-y-3 xl:sticky xl:top-0 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle>{m.promise_detail_actions_title({}, { locale })}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button>
              <RiCheckboxCircleLine />
              {m.action_approve({}, { locale })}
            </Button>
            <Button variant="destructive">
              <RiCloseCircleLine />
              {m.action_reject({}, { locale })}
            </Button>
            <Button variant="outline">
              <RiEditLine />
              {m.action_request_changes({}, { locale })}
            </Button>
            <Button variant="outline">
              <RiFileCodeLine />
              {m.action_view_yaml({}, { locale })}
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function TextSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="min-w-0 border bg-muted/20 p-3">
      <h2 className="mb-2 text-xs text-muted-foreground">{title}</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <p key={item} className="text-sm">
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}

function NodeBox({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="min-w-0 border bg-muted/30 p-3">
      <div className="break-words">{title}</div>
      <div className="mt-1 text-muted-foreground">{subtitle}</div>
    </div>
  );
}
