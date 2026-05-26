import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewStateBadge } from "@/features/status/status-badge";
import { getWorkbenchSnapshot } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { localizeText } from "@/lib/localized-text";

export function ReviewPage() {
  const { data } = useQuery({
    queryKey: ["workbench-snapshot"],
    queryFn: getWorkbenchSnapshot,
  });
  const currentDraft = data?.reviewDrafts[0];
  const { locale, m } = useI18n();

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="order-2 min-h-0 min-w-0 lg:order-1 lg:overflow-y-auto lg:overflow-x-hidden">
        <Card className="lg:h-full">
          <CardHeader>
            <CardTitle>{m.review_title({}, { locale })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.reviewDrafts.map((draft) => (
              <div key={draft.id} className="border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <ReviewStateBadge state={draft.state} />
                  <span className="text-xs text-muted-foreground">{draft.priority}</span>
                </div>
                <div className="line-clamp-2 text-sm">{localizeText(draft.title, locale)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </aside>

      <section className="order-1 min-h-0 min-w-0 space-y-3 lg:order-2 lg:overflow-y-auto lg:overflow-x-hidden">
        <Card>
          <CardHeader>
            <CardTitle>
              {currentDraft
                ? localizeText(currentDraft.title, locale)
                : m.review_current_empty({}, { locale })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <ReviewBlock
                title={m.promise_detail_given({}, { locale })}
                body={m.review_block_given_body({}, { locale })}
              />
              <ReviewBlock
                title={m.promise_detail_when({}, { locale })}
                body={m.review_block_when_body({}, { locale })}
              />
              <ReviewBlock
                title={m.promise_detail_then({}, { locale })}
                body={m.review_block_then_body({}, { locale })}
              />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ReviewBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="border bg-muted p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <p className="mt-2 text-sm">{body}</p>
    </div>
  );
}
