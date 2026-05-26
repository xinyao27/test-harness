import { RiArrowRightLine, RiCheckboxCircleLine, RiErrorWarningLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReviewStateLabel } from "@/features/status/status-labels";
import { getWorkbenchSnapshot } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { localizeText } from "@/lib/localized-text";

export function OverviewPage() {
  const { data } = useQuery({
    queryKey: ["workbench-snapshot"],
    queryFn: getWorkbenchSnapshot,
  });
  const { locale, m } = useI18n();
  const statusCards = [
    {
      label: m.metric_pending_promises({}, { locale }),
      value: "3",
      tone: "text-status-warning-foreground",
    },
    { label: m.metric_needs_changes({}, { locale }), value: "1", tone: "text-destructive" },
    {
      label: m.metric_evidence_failed({}, { locale }),
      value: "0",
      tone: "text-status-success-foreground",
    },
    {
      label: m.metric_evidence_unknown({}, { locale }),
      value: "42",
      tone: "text-muted-foreground",
    },
  ];
  const primaryDraft = data?.reviewDrafts[0];

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto overflow-x-hidden p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_260px]">
      <section className="min-w-0 space-y-4">
        <Card>
          <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">
                {m.overview_attention_title({}, { locale })}
              </div>
              <div className="mt-3 flex items-end gap-3">
                <span className={`text-5xl leading-none ${statusCards[0].tone}`}>
                  {statusCards[0].value}
                </span>
                <span className="pb-1 text-sm text-muted-foreground">{statusCards[0].label}</span>
              </div>
              {primaryDraft ? (
                <div className="mt-4 truncate text-sm">
                  {localizeText(primaryDraft.title, locale)}
                </div>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-1">
              <Button render={<Link to="/review" />}>
                {m.action_start_review({}, { locale })}
                <RiArrowRightLine />
              </Button>
              <Button variant="outline" render={<Link to="/generate" />}>
                {m.action_generate_promise({}, { locale })}
              </Button>
              <Button variant="outline" render={<Link to="/map" />}>
                {m.action_view_project_map({}, { locale })}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statusCards.map((card) => (
            <div key={card.label} className="border bg-background p-3">
              <div className={`text-2xl leading-none ${card.tone}`}>{card.value}</div>
              <div className="mt-2 truncate text-xs text-muted-foreground">{card.label}</div>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{m.overview_recent_changes_title({}, { locale })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.reviewDrafts.map((draft) => (
              <div
                key={draft.id}
                className="flex flex-col gap-2 border p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm">{localizeText(draft.title, locale)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{draft.priority}</div>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {getReviewStateLabel(draft.state, locale, m)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <aside className="min-w-0 space-y-4 xl:sticky xl:top-0 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle>{m.overview_project_status_title({}, { locale })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Metric
              label={m.metric_total_promises({}, { locale })}
              value={data?.project.promiseCount ?? 0}
            />
            <Metric
              label={m.metric_total_modules({}, { locale })}
              value={data?.project.moduleCount ?? 0}
            />
            <Metric
              label={m.metric_errors({}, { locale })}
              value={data?.project.errorCount ?? 0}
              icon={<RiErrorWarningLine />}
            />
            <Metric
              label={m.metric_warnings({}, { locale })}
              value={data?.project.warningCount ?? 0}
              icon={<RiCheckboxCircleLine />}
            />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-b-0 last:pb-0">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
